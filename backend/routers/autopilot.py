import logging
from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, Query, BackgroundTasks, UploadFile, File
from sqlalchemy.orm import Session
from pydantic import BaseModel

from database import get_db
from models.models import Brand, User, AutopilotConfig, AutopilotLog, ScheduledPost, SessionVariant, SocialAccount
from middleware.auth import get_current_user
from services.autopilot.agent import autopilot_agent
from services.autopilot.planner import compute_next_posts_preview, WEEKDAYS_MAP
from services.storage import storage_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/autopilot", tags=["autopilot"])


# ─── Pydantic Schemas ────────────────────────────────────────────────────────

class AutopilotConfigUpdate(BaseModel):
    enabled: Optional[bool] = None
    kill_switch: Optional[bool] = None
    mode: Optional[str] = None  # "weekly_plan" or "ask_before_each"
    frequency: Optional[str] = None  # "daily", "every_2_days", "every_3_days", "weekly", "custom"
    custom_weekdays: Optional[List[str]] = None  # ["Mon", "Tue", ...]
    posting_time: Optional[str] = None  # "07:00"
    timezone: Optional[str] = None  # "Asia/Karachi"
    max_posts_per_day: Optional[int] = None
    banned_topics: Optional[List[str]] = None
    allowed_prices_discounts: Optional[List[str]] = None
    target_platforms: Optional[List[str]] = None
    notification_email: Optional[str] = None

class AutopilotConfigResponse(BaseModel):
    id: str
    brand_id: str
    enabled: bool
    kill_switch: bool
    mode: str
    frequency: str
    custom_weekdays: List[str]
    posting_time: str
    timezone: str
    max_posts_per_day: int
    banned_topics: List[str]
    allowed_prices_discounts: List[str]
    target_platforms: List[str]
    connected_platforms: List[str]
    next_posts_preview: str
    notification_email: Optional[str] = None
    last_event_prompt_response: Optional[str] = None
    last_run_at: Optional[datetime] = None
    last_run_id: Optional[str] = None
    last_run_summary: Optional[str] = None

class AutopilotLogResponse(BaseModel):
    id: str
    run_id: str
    stage: str
    status: str
    decision_summary: str
    details_json: Optional[Dict[str, Any]] = None
    created_at: datetime

    class Config:
        from_attributes = True

class KillSwitchToggle(BaseModel):
    kill_switch: bool
    reason: Optional[str] = "Manual operator toggle"

class EventCheckinRequest(BaseModel):
    has_event: bool
    event_details: Optional[str] = ""

class CardPromptEditRequest(BaseModel):
    prompt: str

class CardCaptionUpdateRequest(BaseModel):
    caption: str
    platform: Optional[str] = None

class CardChangeImageRequest(BaseModel):
    change_type: str  # "swap_variant" | "library" | "upload"
    image_url: Optional[str] = None

class CardRescheduleRequest(BaseModel):
    scheduled_at: datetime

class RunPlanRequest(BaseModel):
    force: bool = False
    event_details: Optional[str] = None


# ─── Configuration Endpoints ─────────────────────────────────────────────────

@router.get("/config")
def get_autopilot_config(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Retrieve brand's Autopilot settings, plain preview text, and connected platforms."""
    brand = db.query(Brand).filter(Brand.user_id == user.id).first()
    if not brand:
        raise HTTPException(status_code=404, detail="Brand not found")

    config = db.query(AutopilotConfig).filter(AutopilotConfig.brand_id == brand.id).first()
    if not config:
        config = AutopilotConfig(
            brand_id=brand.id,
            enabled=True,
            kill_switch=False,
            mode="weekly_plan",
            frequency="custom",
            custom_weekdays=["Tue", "Thu"],
            posting_time="07:00",
            timezone="Asia/Karachi",
            max_posts_per_day=2,
            banned_topics=["politics", "unverified health cures", "gambling"],
            allowed_prices_discounts=[],
            target_platforms=["facebook", "linkedin", "tiktok"],
            notification_email=user.email
        )
        db.add(config)
        db.commit()
        db.refresh(config)

    connected = autopilot_agent.get_connected_platforms(brand.id, db)
    preview = compute_next_posts_preview(config.frequency or "custom", config.custom_weekdays)

    return {
        "id": config.id,
        "brand_id": config.brand_id,
        "enabled": config.enabled,
        "kill_switch": config.kill_switch,
        "mode": config.mode or "weekly_plan",
        "frequency": config.frequency or "custom",
        "custom_weekdays": config.custom_weekdays or ["Tue", "Thu"],
        "posting_time": config.posting_time or "07:00",
        "timezone": config.timezone or "Asia/Karachi",
        "max_posts_per_day": config.max_posts_per_day or 2,
        "banned_topics": config.banned_topics or [],
        "allowed_prices_discounts": config.allowed_prices_discounts or [],
        "target_platforms": config.target_platforms or connected,
        "connected_platforms": connected,
        "next_posts_preview": preview,
        "notification_email": config.notification_email or user.email,
        "last_event_prompt_response": config.last_event_prompt_response,
        "last_run_at": config.last_run_at,
        "last_run_id": config.last_run_id,
        "last_run_summary": config.last_run_summary
    }


@router.put("/config")
def update_autopilot_config(
    req: AutopilotConfigUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update Autopilot settings (frequency, custom weekdays, posting time, mode, toggle ON/OFF)."""
    brand = db.query(Brand).filter(Brand.user_id == user.id).first()
    if not brand:
        raise HTTPException(status_code=404, detail="Brand not found")

    config = db.query(AutopilotConfig).filter(AutopilotConfig.brand_id == brand.id).first()
    if not config:
        config = AutopilotConfig(brand_id=brand.id)
        db.add(config)

    update_data = req.model_dump(exclude_unset=True)

    # Validate mode
    if "mode" in update_data and update_data["mode"] not in ("weekly_plan", "ask_before_each", "approval", "autopilot"):
        raise HTTPException(status_code=400, detail="Invalid mode setting")

    # Map legacy modes if needed
    if update_data.get("mode") == "approval":
        update_data["mode"] = "weekly_plan"

    for field, val in update_data.items():
        setattr(config, field, val)

    db.commit()
    db.refresh(config)

    connected = autopilot_agent.get_connected_platforms(brand.id, db)
    preview = compute_next_posts_preview(config.frequency or "custom", config.custom_weekdays)

    return {
        "id": config.id,
        "brand_id": config.brand_id,
        "enabled": config.enabled,
        "kill_switch": config.kill_switch,
        "mode": config.mode or "weekly_plan",
        "frequency": config.frequency or "custom",
        "custom_weekdays": config.custom_weekdays or ["Tue", "Thu"],
        "posting_time": config.posting_time or "07:00",
        "timezone": config.timezone or "Asia/Karachi",
        "max_posts_per_day": config.max_posts_per_day or 2,
        "banned_topics": config.banned_topics or [],
        "allowed_prices_discounts": config.allowed_prices_discounts or [],
        "target_platforms": config.target_platforms or connected,
        "connected_platforms": connected,
        "next_posts_preview": preview,
        "notification_email": config.notification_email,
        "last_event_prompt_response": config.last_event_prompt_response,
        "last_run_at": config.last_run_at,
        "last_run_id": config.last_run_id,
        "last_run_summary": config.last_run_summary
    }


@router.post("/kill-switch")
def toggle_kill_switch(
    req: KillSwitchToggle,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Emergency master toggle for the Autopilot engine."""
    brand = db.query(Brand).filter(Brand.user_id == user.id).first()
    if not brand:
        raise HTTPException(status_code=404, detail="Brand not found")

    config = db.query(AutopilotConfig).filter(AutopilotConfig.brand_id == brand.id).first()
    if not config:
        config = AutopilotConfig(brand_id=brand.id)
        db.add(config)

    config.kill_switch = req.kill_switch
    db.commit()
    db.refresh(config)

    autopilot_agent._log_decision(
        db=db, brand_id=brand.id, run_id="manual_override",
        stage="GUARDRAILS",
        status="BLOCKED" if req.kill_switch else "INFO",
        summary=f"Emergency Kill Switch {'ENGAGED' if req.kill_switch else 'DISENGAGED'}. Reason: {req.reason}",
        details={"operator_id": user.id, "kill_switch": req.kill_switch}
    )

    return {
        "status": "success",
        "kill_switch": config.kill_switch,
        "message": f"Kill switch {'activated: all autonomous posting paused' if config.kill_switch else 'deactivated: autopilot operational'}"
    }


# ─── Event Check-In & Plan Generation ────────────────────────────────────────

@router.post("/event-checkin")
def answer_event_checkin(
    req: EventCheckinRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Records answer to evening question: 'Any event, offer or launch next week? (No / Yes + details)'
    """
    brand = db.query(Brand).filter(Brand.user_id == user.id).first()
    if not brand:
        raise HTTPException(status_code=404, detail="Brand not found")

    config = db.query(AutopilotConfig).filter(AutopilotConfig.brand_id == brand.id).first()
    if not config:
        config = AutopilotConfig(brand_id=brand.id)
        db.add(config)

    ans = req.event_details.strip() if req.has_event and req.event_details else None
    config.last_event_prompt_response = ans
    db.commit()

    autopilot_agent._log_decision(
        db=db, brand_id=brand.id, run_id="event_checkin",
        stage="CHECKIN", status="SUCCESS",
        summary=f"Weekly check-in answered: {'Event recorded: ' + ans if ans else 'No upcoming events'}.",
        details={"has_event": req.has_event, "details": ans}
    )

    return {
        "status": "success",
        "has_event": req.has_event,
        "event_details": ans,
        "message": "Weekly check-in recorded. Ready to generate plan."
    }


@router.post("/generate-weekly-plan")
@router.post("/run-now")
async def generate_weekly_plan(
    req: Optional[RunPlanRequest] = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Generate weekly plan cards for the chosen frequency and days.
    Places cards in Pending Approval on the review screen.
    """
    brand = db.query(Brand).filter(Brand.user_id == user.id).first()
    if not brand:
        raise HTTPException(status_code=404, detail="Brand not found")

    force = req.force if req else False
    event_text = req.event_details if req else None

    try:
        result = await autopilot_agent.run_weekly_autopilot(
            brand_id=brand.id,
            db=db,
            force=force,
            event_prompt_text=event_text
        )
        return result
    except Exception as e:
        logger.error(f"Autopilot plan generation failure: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/weekly-plan")
def get_weekly_plan_cards(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Retrieve active weekly plan cards for the review screen.
    """
    brand = db.query(Brand).filter(Brand.user_id == user.id).first()
    if not brand:
        raise HTTPException(status_code=404, detail="Brand not found")

    # Fetch future scheduled posts or recent autopilot-generated cards
    now = datetime.utcnow() - timedelta(hours=12)
    posts = db.query(ScheduledPost).filter(
        ScheduledPost.brand_id == brand.id,
        ScheduledPost.scheduled_at >= now
    ).order_by(ScheduledPost.scheduled_at.asc()).limit(14).all()

    cards = [autopilot_agent.serialize_scheduled_post(p) for p in posts]

    pending_count = sum(1 for c in cards if c["status"] == "Pending Approval")
    approved_count = sum(1 for c in cards if c["status"] == "Scheduled")

    return {
        "total_cards": len(cards),
        "pending_count": pending_count,
        "approved_count": approved_count,
        "cards": cards
    }


# ─── Card Interactive Edit Operations ────────────────────────────────────────

@router.post("/cards/{card_id}/edit-prompt")
async def edit_card_with_prompt(
    card_id: str,
    req: CardPromptEditRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    (a) Edit with prompt: A text box ('make it about our Eid offer') that regenerates ONLY that day's post.
    Resets status to Pending Approval.
    """
    brand = db.query(Brand).filter(Brand.user_id == user.id).first()
    if not brand:
        raise HTTPException(status_code=404, detail="Brand not found")

    try:
        post = await autopilot_agent.edit_post_with_prompt(
            post_id=card_id,
            prompt=req.prompt,
            db=db
        )
        return {"status": "success", "card": autopilot_agent.serialize_scheduled_post(post)}
    except Exception as e:
        logger.error(f"Error editing card with prompt: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/cards/{card_id}/copy")
def update_card_caption(
    card_id: str,
    req: CardCaptionUpdateRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    (b) Manual caption edit per platform. Resets status to Pending Approval.
    """
    brand = db.query(Brand).filter(Brand.user_id == user.id).first()
    if not brand:
        raise HTTPException(status_code=404, detail="Brand not found")

    try:
        post = autopilot_agent.update_card_caption(
            post_id=card_id,
            caption=req.caption,
            platform_key=req.platform,
            db=db
        )
        return {"status": "success", "card": autopilot_agent.serialize_scheduled_post(post)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/cards/{card_id}/change-image")
def change_card_image(
    card_id: str,
    req: CardChangeImageRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    (c) Change image: pick the other variant, pick from library, or set uploaded image.
    Picking a library image removes its 7-day auto-delete tag. Resets status to Pending Approval.
    """
    brand = db.query(Brand).filter(Brand.user_id == user.id).first()
    if not brand:
        raise HTTPException(status_code=404, detail="Brand not found")

    try:
        post = autopilot_agent.change_card_image(
            post_id=card_id,
            change_type=req.change_type,
            image_url=req.image_url,
            db=db
        )
        return {"status": "success", "card": autopilot_agent.serialize_scheduled_post(post)}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/cards/{card_id}/upload-image")
async def upload_card_custom_image(
    card_id: str,
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Upload custom image directly for this card."""
    brand = db.query(Brand).filter(Brand.user_id == user.id).first()
    if not brand:
        raise HTTPException(status_code=404, detail="Brand not found")

    content = await file.read()
    ext = file.filename.split(".")[-1] if file.filename and "." in file.filename else "png"
    filename = f"upload_card_{card_id[:8]}_{uuid.uuid4().hex[:6]}.{ext}"
    url = storage_service.upload_image(content, filename)

    post = autopilot_agent.change_card_image(
        post_id=card_id,
        change_type="upload",
        image_url=url,
        db=db
    )
    return {"status": "success", "card": autopilot_agent.serialize_scheduled_post(post)}


@router.post("/cards/{card_id}/skip")
def skip_card_day(
    card_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    (d) Skip the day.
    """
    brand = db.query(Brand).filter(Brand.user_id == user.id).first()
    if not brand:
        raise HTTPException(status_code=404, detail="Brand not found")

    post = autopilot_agent.skip_card(post_id=card_id, db=db)
    return {"status": "success", "card": autopilot_agent.serialize_scheduled_post(post)}


@router.post("/cards/{card_id}/reschedule")
def reschedule_card_day(
    card_id: str,
    req: CardRescheduleRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    (d) Move card to another date/time. Resets status to Pending Approval.
    """
    brand = db.query(Brand).filter(Brand.user_id == user.id).first()
    if not brand:
        raise HTTPException(status_code=404, detail="Brand not found")

    post = autopilot_agent.reschedule_card(post_id=card_id, new_datetime=req.scheduled_at, db=db)
    return {"status": "success", "card": autopilot_agent.serialize_scheduled_post(post)}


@router.post("/cards/{card_id}/toggle-status")
@router.post("/posts/{card_id}/approve")
def toggle_card_status(
    card_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    (e) Per-card status toggle (Pending Approval <-> Scheduled/Approved).
    """
    brand = db.query(Brand).filter(Brand.user_id == user.id).first()
    if not brand:
        raise HTTPException(status_code=404, detail="Brand not found")

    post = autopilot_agent.toggle_card_approval(post_id=card_id, db=db)
    return {"status": "success", "card": autopilot_agent.serialize_scheduled_post(post)}


@router.post("/approve-all")
def approve_all_cards(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Top action: Approve all pending cards into 'Scheduled' in 1 click."""
    brand = db.query(Brand).filter(Brand.user_id == user.id).first()
    if not brand:
        raise HTTPException(status_code=404, detail="Brand not found")

    count = autopilot_agent.approve_all_cards(brand_id=brand.id, db=db)
    return {"status": "success", "approved_count": count, "message": f"Successfully approved {count} posts into Scheduled."}


@router.post("/cards/{card_id}/publish-now")
async def publish_card_now_verified(
    card_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Verified Publishing execution for card:
    Publishes to official connected platform API (Facebook Page, etc.) and returns genuine permalink.
    """
    brand = db.query(Brand).filter(Brand.user_id == user.id).first()
    if not brand:
        raise HTTPException(status_code=404, detail="Brand not found")

    res = await autopilot_agent.publish_card_now_verified(post_id=card_id, db=db)
    return res


# ─── Image Library & Audit Logs ──────────────────────────────────────────────

@router.get("/image-library")
def get_image_library(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Retrieve previously generated images library from session variants & posts.
    """
    brand = db.query(Brand).filter(Brand.user_id == user.id).first()
    if not brand:
        raise HTTPException(status_code=404, detail="Brand not found")

    # Query variants for this brand
    variants = db.query(SessionVariant).filter(
        SessionVariant.brand_id == brand.id,
        SessionVariant.image_url != None
    ).order_by(SessionVariant.created_at.desc()).limit(30).all()

    items = []
    seen_urls = set()
    for v in variants:
        if v.image_url and v.image_url not in seen_urls:
            seen_urls.add(v.image_url)
            items.append({
                "id": v.id,
                "url": v.image_url,
                "headline": v.headline or "Brand Creative",
                "created_at": v.created_at.isoformat() if v.created_at else None,
                "is_permanent": v.expires_at is None
            })

    return {"count": len(items), "images": items}


@router.get("/logs", response_model=List[AutopilotLogResponse])
def get_autopilot_decision_logs(
    limit: int = 50,
    run_id: Optional[str] = None,
    stage: Optional[str] = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Retrieve full audit log of all decisions, edits, and self-critique steps."""
    brand = db.query(Brand).filter(Brand.user_id == user.id).first()
    if not brand:
        raise HTTPException(status_code=404, detail="Brand not found")

    query = db.query(AutopilotLog).filter(AutopilotLog.brand_id == brand.id)
    if run_id:
        query = query.filter(AutopilotLog.run_id == run_id)
    if stage:
        query = query.filter(AutopilotLog.stage == stage)

    return query.order_by(AutopilotLog.created_at.desc()).limit(limit).all()
