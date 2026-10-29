import logging
from typing import List, Dict, Any, Optional
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query, BackgroundTasks
from sqlalchemy.orm import Session
from pydantic import BaseModel

from database import get_db
from models.models import Brand, User, AutopilotConfig, AutopilotLog, ScheduledPost
from middleware.auth import get_current_user
from services.autopilot.agent import autopilot_agent

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/autopilot", tags=["autopilot"])


# ─── Pydantic Schemas ────────────────────────────────────────────────────────

class AutopilotConfigUpdate(BaseModel):
    enabled: Optional[bool] = None
    kill_switch: Optional[bool] = None
    mode: Optional[str] = None  # "approval" or "autopilot"
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
    max_posts_per_day: int
    banned_topics: List[str]
    allowed_prices_discounts: List[str]
    target_platforms: List[str]
    notification_email: Optional[str] = None
    last_run_at: Optional[datetime] = None
    last_run_id: Optional[str] = None
    last_run_summary: Optional[str] = None

    class Config:
        from_attributes = True

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


# ─── Endpoints ───────────────────────────────────────────────────────────────

@router.get("/config", response_model=AutopilotConfigResponse)
def get_autopilot_config(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Retrieve brand's Autopilot settings, mode, and kill switch status."""
    brand = db.query(Brand).filter(Brand.user_id == user.id).first()
    if not brand:
        raise HTTPException(status_code=404, detail="Brand not found")

    config = db.query(AutopilotConfig).filter(AutopilotConfig.brand_id == brand.id).first()
    if not config:
        config = AutopilotConfig(
            brand_id=brand.id,
            enabled=True,
            kill_switch=False,
            mode="approval",
            max_posts_per_day=2,
            banned_topics=["politics", "unverified health cures", "gambling"],
            allowed_prices_discounts=[],
            target_platforms=["instagram_post", "linkedin", "facebook"],
            notification_email=user.email
        )
        db.add(config)
        db.commit()
        db.refresh(config)

    return config


@router.put("/config", response_model=AutopilotConfigResponse)
def update_autopilot_config(
    req: AutopilotConfigUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update Autopilot mode ('approval'/'autopilot'), guardrails, and settings."""
    brand = db.query(Brand).filter(Brand.user_id == user.id).first()
    if not brand:
        raise HTTPException(status_code=404, detail="Brand not found")

    config = db.query(AutopilotConfig).filter(AutopilotConfig.brand_id == brand.id).first()
    if not config:
        config = AutopilotConfig(brand_id=brand.id)
        db.add(config)

    update_data = req.model_dump(exclude_unset=True)
    if "mode" in update_data and update_data["mode"] not in ("approval", "autopilot"):
        raise HTTPException(status_code=400, detail="Mode must be either 'approval' or 'autopilot'")

    for field, val in update_data.items():
        setattr(config, field, val)

    db.commit()
    db.refresh(config)
    return config


@router.post("/kill-switch")
def toggle_kill_switch(
    req: KillSwitchToggle,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Emergency kill switch: Immediately enables or disables all autonomous generation and scheduling.
    """
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

    # Log the action in audit trail
    log_entry = AutopilotLog(
        brand_id=brand.id,
        run_id="manual_override",
        stage="GUARDRAILS",
        status="BLOCKED" if req.kill_switch else "INFO",
        decision_summary=f"Emergency Kill Switch {'ENGAGED' if req.kill_switch else 'DISENGAGED'}. Reason: {req.reason}",
        details_json={"operator_id": user.id, "kill_switch": req.kill_switch}
    )
    db.add(log_entry)
    db.commit()

    return {
        "status": "success",
        "kill_switch": config.kill_switch,
        "message": f"Kill switch {'activated: all autonomous posting paused' if config.kill_switch else 'deactivated: autopilot operational'}"
    }


@router.post("/run-now")
async def trigger_autopilot_now(
    force: bool = False,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Manually trigger the full weekly 7-day Autopilot cycle for the user's brand.
    """
    brand = db.query(Brand).filter(Brand.user_id == user.id).first()
    if not brand:
        raise HTTPException(status_code=404, detail="Brand not found")

    try:
        result = await autopilot_agent.run_weekly_autopilot(
            brand_id=brand.id,
            db=db,
            force=force
        )
        return result
    except Exception as e:
        logger.error(f"Autopilot trigger failure: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/logs", response_model=List[AutopilotLogResponse])
def get_autopilot_decision_logs(
    limit: int = 50,
    run_id: Optional[str] = None,
    stage: Optional[str] = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Retrieve full audit log of all decisions, self-critique scores, and guardrail checks."""
    brand = db.query(Brand).filter(Brand.user_id == user.id).first()
    if not brand:
        raise HTTPException(status_code=404, detail="Brand not found")

    query = db.query(AutopilotLog).filter(AutopilotLog.brand_id == brand.id)
    if run_id:
        query = query.filter(AutopilotLog.run_id == run_id)
    if stage:
        query = query.filter(AutopilotLog.stage == stage)

    return query.order_by(AutopilotLog.created_at.desc()).limit(limit).all()


@router.get("/pending-posts")
def get_pending_approval_posts(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """List all scheduled posts currently pending user approval."""
    brand = db.query(Brand).filter(Brand.user_id == user.id).first()
    if not brand:
        raise HTTPException(status_code=404, detail="Brand not found")

    posts = db.query(ScheduledPost).filter(
        ScheduledPost.brand_id == brand.id,
        ScheduledPost.status == "Pending Approval"
    ).order_by(ScheduledPost.scheduled_at.asc()).all()

    return {
        "pending_count": len(posts),
        "posts": posts
    }


@router.post("/approve-all")
def approve_all_pending_posts(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """1-click approve all pending posts to 'Scheduled'."""
    brand = db.query(Brand).filter(Brand.user_id == user.id).first()
    if not brand:
        raise HTTPException(status_code=404, detail="Brand not found")

    updated = db.query(ScheduledPost).filter(
        ScheduledPost.brand_id == brand.id,
        ScheduledPost.status == "Pending Approval"
    ).update({"status": "Scheduled"}, synchronize_session=False)

    db.commit()

    log_entry = AutopilotLog(
        brand_id=brand.id,
        run_id="batch_approval",
        stage="DISPATCH",
        status="SUCCESS",
        decision_summary=f"User approved all {updated} pending posts into 'Scheduled' state.",
        details_json={"approved_count": updated}
    )
    db.add(log_entry)
    db.commit()

    return {
        "status": "success",
        "approved_count": updated,
        "message": f"Successfully scheduled {updated} posts for automated publishing."
    }


@router.post("/posts/{post_id}/approve")
def approve_single_post(
    post_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Approve a single post to 'Scheduled'."""
    brand = db.query(Brand).filter(Brand.user_id == user.id).first()
    if not brand:
        raise HTTPException(status_code=404, detail="Brand not found")

    post = db.query(ScheduledPost).filter(
        ScheduledPost.id == post_id,
        ScheduledPost.brand_id == brand.id
    ).first()

    if not post:
        raise HTTPException(status_code=404, detail="Post not found")

    post.status = "Scheduled"
    db.commit()
    db.refresh(post)
    return {"status": "success", "post_id": post.id, "post_status": post.status}


@router.post("/posts/{post_id}/reject")
def reject_single_post(
    post_id: str,
    reason: Optional[str] = "Rejected by user",
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Reject and cancel a post."""
    brand = db.query(Brand).filter(Brand.user_id == user.id).first()
    if not brand:
        raise HTTPException(status_code=404, detail="Brand not found")

    post = db.query(ScheduledPost).filter(
        ScheduledPost.id == post_id,
        ScheduledPost.brand_id == brand.id
    ).first()

    if not post:
        raise HTTPException(status_code=404, detail="Post not found")

    post.status = "Draft"
    post.error = f"Rejected: {reason}"
    db.commit()
    db.refresh(post)
    return {"status": "success", "post_id": post.id, "post_status": post.status, "reason": reason}

