from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from datetime import datetime
from typing import List, Optional, Dict, Any
from pydantic import BaseModel

from database import get_db
from models.models import User, Notification
from middleware.auth import get_current_user

router = APIRouter(prefix="/notifications", tags=["notifications"])

class NotificationActionRequest(BaseModel):
    action: str  # e.g., 'checkin', 'retry', 'dismiss'
    choice: Optional[str] = None  # 'generic', 'special', 'skip'
    special_text: Optional[str] = None
    selected_platforms: Optional[List[str]] = None

@router.get("/unread-count")
def get_unread_count(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Return quick count of unread in-app notifications for header bell badge."""
    count = db.query(Notification).filter(
        Notification.user_id == user.id,
        Notification.is_read == False
    ).count()
    return {"unread_count": count}

@router.get("")
def list_notifications(
    unread_only: bool = False,
    limit: int = Query(30, ge=1, le=100),
    offset: int = Query(0, ge=0),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """List in-app notifications for current user, newest first."""
    query = db.query(Notification).filter(Notification.user_id == user.id)
    if unread_only:
        query = query.filter(Notification.is_read == False)

    total = query.count()
    notifs = query.order_by(Notification.created_at.desc()).offset(offset).limit(limit).all()

    items = []
    for n in notifs:
        items.append({
            "id": n.id,
            "title": n.title,
            "message": n.message,
            "type": n.type,
            "is_read": n.is_read,
            "read_at": n.read_at.isoformat() if n.read_at else None,
            "action_type": n.action_type,
            "action_payload": n.action_payload or {},
            "created_at": n.created_at.isoformat() if n.created_at else None,
        })

    unread_count = db.query(Notification).filter(
        Notification.user_id == user.id,
        Notification.is_read == False
    ).count()

    return {
        "items": items,
        "total": total,
        "unread_count": unread_count
    }

@router.post("/{notification_id}/read")
def mark_notification_as_read(
    notification_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Mark a specific notification as read."""
    notif = db.query(Notification).filter(
        Notification.id == notification_id,
        Notification.user_id == user.id
    ).first()
    if not notif:
        raise HTTPException(status_code=404, detail="Notification not found")

    notif.is_read = True
    notif.read_at = datetime.utcnow()
    db.commit()
    return {"status": "success", "id": notification_id}

@router.post("/mark-all-read")
def mark_all_notifications_as_read(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Mark all unread notifications as read."""
    db.query(Notification).filter(
        Notification.user_id == user.id,
        Notification.is_read == False
    ).update({
        Notification.is_read: True,
        Notification.read_at: datetime.utcnow()
    }, synchronize_session=False)
    db.commit()
    return {"status": "success"}

@router.post("/{notification_id}/action")
async def execute_notification_action(
    notification_id: str,
    req: NotificationActionRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Execute an inline action from the Notification Center.
    For example: responding to an Autopilot check-in (Generic / Special / Skip).
    """
    notif = db.query(Notification).filter(
        Notification.id == notification_id,
        Notification.user_id == user.id
    ).first()
    if not notif:
        raise HTTPException(status_code=404, detail="Notification not found")

    # Mark as read upon interaction
    notif.is_read = True
    notif.read_at = datetime.utcnow()

    # Handle Autopilot check-in response
    if notif.action_type == "checkin":
        choice = req.choice or "generic"
        special_text = req.special_text or ""
        selected_platforms = req.selected_platforms or ["Facebook"]

        # Update action_payload with response status
        payload = dict(notif.action_payload or {})
        payload["answered"] = True
        payload["user_choice"] = choice
        payload["special_text"] = special_text
        payload["selected_platforms"] = selected_platforms
        payload["answered_at"] = datetime.utcnow().isoformat()
        notif.action_payload = payload
        db.commit()

        if choice == "skip":
            return {
                "status": "success",
                "message": "Today's post skipped as requested.",
                "choice": choice
            }

        return {
            "status": "success",
            "message": f"Check-in recorded ({choice}). Generation queued.",
            "choice": choice,
            "platforms": selected_platforms
        }

    db.commit()
    return {"status": "success"}

