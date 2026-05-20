from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import date
from typing import List

from database import get_db
from models.models import SmartQuestion, UserAnswer, Brand, User, DailySession
from models.schemas import SmartQuestionResponse, AnswerRequest, AnswerBatchRequest
from middleware.auth import get_current_user
from services import gemini

router = APIRouter(prefix="/questions", tags=["questions"])


@router.get("/today", response_model=List[SmartQuestionResponse])
def get_todays_questions(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get today's 3 smart questions.
    If none exist yet, generate them on-the-fly.
    """
    today = date.today()

    questions = db.query(SmartQuestion).filter(
        SmartQuestion.user_id == user.id,
        SmartQuestion.date_for == today,
    ).all()

    if not questions:
        # Generate on-the-fly if scheduler hasn't run yet
        questions = _generate_questions_now(user.id, db)

    return questions


@router.post("/answer")
def submit_answers(
    req: AnswerBatchRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Submit answers to smart questions (batch)."""
    saved = []
    for ans in req.answers:
        question = db.query(SmartQuestion).filter(
            SmartQuestion.id == ans.question_id,
            SmartQuestion.user_id == user.id,
        ).first()

        if not question:
            continue

        answer = UserAnswer(
            question_id=ans.question_id,
            user_id=user.id,
            answer_text=ans.answer_text,
        )
        db.add(answer)

        question.is_answered = True
        saved.append(ans.question_id)

    db.commit()

    # Also update DailySession for today
    today = date.today()
    brand = db.query(Brand).filter(Brand.user_id == user.id).first()
    if brand:
        session = db.query(DailySession).filter(
            DailySession.user_id == user.id,
            DailySession.session_date == today
        ).first()

        if not session:
            session = DailySession(user_id=user.id, brand_id=brand.id, session_date=today)
            db.add(session)

        # Map answers to session slots
        for i, ans in enumerate(req.answers[:3]):
            q = db.query(SmartQuestion).filter(SmartQuestion.id == ans.question_id).first()
            if q:
                setattr(session, f"question_{i+1}", q.question_text)
                setattr(session, f"answer_{i+1}", ans.answer_text)

        db.commit()

    return {
        "message": f"Saved {len(saved)} answers",
        "answered_ids": saved,
    }


# ─── On-the-fly Question Generation ───────────────────────
def _generate_questions_now(user_id: str, db: Session) -> List[SmartQuestion]:
    """Generate questions immediately if scheduler hasn't run."""
    brand = db.query(Brand).filter(Brand.user_id == user_id).first()
    if not brand or brand.scan_status != "completed":
        return []

    brand_profile = {
        "business_name": brand.business_name,
        "business_type": brand.business_type,
        "industry": brand.industry,
        "target_audience": brand.target_audience,
        "products_services": brand.products_services or [],
        "brand_tone": brand.brand_tone,
        "content_themes": brand.content_themes or [],
    }

    # Get previous answers
    prev_answers = db.query(UserAnswer).filter(
        UserAnswer.user_id == user_id
    ).order_by(UserAnswer.created_at.desc()).limit(10).all()

    prev_data = []
    for ans in prev_answers:
        q = db.query(SmartQuestion).filter(SmartQuestion.id == ans.question_id).first()
        if q:
            prev_data.append({"question": q.question_text, "answer": ans.answer_text})

    try:
        questions_data = gemini.generate_smart_questions(brand_profile, prev_data)
    except Exception:
        return []

    today = date.today()
    questions = []
    for q_data in questions_data:
        if isinstance(q_data, dict):
            question = SmartQuestion(
                user_id=user_id,
                brand_id=brand.id,
                question_text=q_data.get("question_text", ""),
                question_context=q_data.get("question_context", ""),
                question_type=q_data.get("question_type", "general"),
                options=q_data.get("options"),
                date_for=today,
            )
            db.add(question)
            questions.append(question)

    db.commit()
    return questions
