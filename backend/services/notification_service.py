import logging
from typing import Optional, Dict, Any
from datetime import datetime
from sqlalchemy.orm import Session
from models.models import Notification
from database import SessionLocal

logger = logging.getLogger("notifications")

def create_notification(
    user_id: str,
    title: str,
    message: str,
    type: str = "info",
    brand_id: Optional[str] = None,
    action_type: Optional[str] = None,
    action_payload: Optional[Dict[str, Any]] = None,
    idempotency_key: Optional[str] = None,
    db: Optional[Session] = None
) -> Optional[Notification]:
    """
    Create an in-app notification for a user.
    The Notification Center is the single source of truth for user activities.
    Supports idempotency to prevent duplicate notifications.
    """
    close_db_when_done = False
    if db is None:
        db = SessionLocal()
        close_db_when_done = True

    try:
        # Idempotency check
        if idempotency_key:
            existing = db.query(Notification).filter(Notification.idempotency_key == idempotency_key).first()
            if existing:
                logger.info(f"Notification with idempotency_key '{idempotency_key}' already exists. Skipping.")
                return existing

        notif = Notification(
            user_id=user_id,
            brand_id=brand_id,
            title=title,
            message=message,
            type=type,
            action_type=action_type,
            action_payload=action_payload or {},
            idempotency_key=idempotency_key
        )
        db.add(notif)
        db.commit()
        db.refresh(notif)
        logger.info(f"Created in-app notification [{type}] for user {user_id}: {title}")
        return notif
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to create notification: {e}")
        return None
    finally:
        if close_db_when_done:
            db.close()

