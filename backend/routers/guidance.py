from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import date
from typing import List

from database import get_db
from models.models import Brand, ContentGuidance, User
from models.schemas import GuidanceResponse
from middleware.auth import get_current_user
from services import gemini

router = APIRouter(prefix="/guidance", tags=["guidance"])


@router.get("/tips", response_model=List[GuidanceResponse])
def get_guidance_tips(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get all content guidance (posting schedule, content mix, tips).
    Generates on-the-fly if none exist.
    """
    guidance = db.query(ContentGuidance).filter(
        ContentGuidance.user_id == user.id,
    ).order_by(ContentGuidance.created_at.desc()).limit(10).all()

    if not guidance:
        # Generate on-the-fly
        guidance = _generate_guidance_now(user.id, db)

    return guidance


@router.get("/weekly", response_model=List[GuidanceResponse])
def get_weekly_guidance(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get this week's content guidance."""
    today = date.today()
    # Get Monday of current week
    monday = today

    guidance = db.query(ContentGuidance).filter(
        ContentGuidance.user_id == user.id,
        ContentGuidance.week_of >= monday,
    ).order_by(ContentGuidance.created_at.desc()).all()

    if not guidance:
        guidance = _generate_guidance_now(user.id, db)

    return guidance


@router.post("/tips/{tip_id}/read")
def mark_tip_read(
    tip_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Mark a guidance tip as read."""
    tip = db.query(ContentGuidance).filter(
        ContentGuidance.id == tip_id,
        ContentGuidance.user_id == user.id,
    ).first()

    if not tip:
        raise HTTPException(status_code=404, detail="Tip not found")

    tip.is_read = True
    db.commit()

    return {"message": "Marked as read"}


# ─── On-the-fly Guidance Generation ───────────────────────
def _generate_guidance_now(user_id: str, db: Session) -> List[ContentGuidance]:
    """Generate guidance immediately if none exists."""
    brand = db.query(Brand).filter(Brand.user_id == user_id).first()
    if not brand or brand.scan_status != "completed":
        return []

    brand_profile = {
        "business_name": brand.business_name,
        "industry": brand.industry,
        "target_audience": brand.target_audience,
        "brand_tone": brand.brand_tone,
    }

    all_guidance = []
    today = date.today()

    for gtype in ["weekly_tip", "posting_schedule", "content_mix"]:
        try:
            data = gemini.generate_guidance(brand_profile, gtype)
            g = ContentGuidance(
                user_id=user_id,
                brand_id=brand.id,
                guidance_type=gtype,
                title=data.get("title", "Tip"),
                content=data.get("content", ""),
                metadata_json=data.get("metadata_json"),
                week_of=today,
            )
            db.add(g)
            all_guidance.append(g)
        except Exception:
            pass

    db.commit()
    return all_guidance
