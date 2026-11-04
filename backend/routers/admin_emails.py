from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime

from database import get_db
from models.models import User, EmailLog
from middleware.auth import get_current_user

router = APIRouter(prefix="/admin/emails", tags=["admin-emails"])

def verify_admin_access(user: User):
    if not user or user.role not in ("admin", "support_admin"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin privilege required"
        )

@router.get("")
def list_captured_emails(
    recipient: Optional[str] = None,
    template: Optional[str] = None,
    status_filter: Optional[str] = None,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    List captured emails in Dev Outbox with filters.
    Admin only.
    """
    verify_admin_access(user)

    query = db.query(EmailLog)
    if recipient:
        query = query.filter(EmailLog.recipient.ilike(f"%{recipient.strip()}%"))
    if template and template != "all":
        query = query.filter(EmailLog.template == template)
    if status_filter and status_filter != "all":
        query = query.filter(EmailLog.status == status_filter)

    total = query.count()
    logs = query.order_by(EmailLog.created_at.desc()).offset(offset).limit(limit).all()

    items = []
    for log in logs:
        items.append({
            "id": log.id,
            "recipient": log.recipient,
            "subject": log.subject,
            "template": log.template,
            "status": log.status,
            "provider": log.provider,
            "user_id": log.user_id,
            "created_at": log.created_at.isoformat() if log.created_at else None,
            "links_count": len(log.links_json or []) if log.links_json else 0
        })

    return {
        "items": items,
        "total": total,
        "limit": limit,
        "offset": offset,
        "dev_mode": True
    }

@router.get("/{email_id}")
def get_captured_email_detail(
    email_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get full captured email detail including rendered HTML, plain text, and parsed links.
    Admin only.
    """
    verify_admin_access(user)

    log = db.query(EmailLog).filter(EmailLog.id == email_id).first()
    if not log:
        raise HTTPException(status_code=404, detail="Email record not found")

    return {
        "id": log.id,
        "recipient": log.recipient,
        "subject": log.subject,
        "template": log.template,
        "status": log.status,
        "provider": log.provider,
        "user_id": log.user_id,
        "brand_id": log.brand_id,
        "full_html": log.full_html,
        "plain_text": log.plain_text,
        "links": log.links_json or [],
        "metadata": log.metadata_json or {},
        "idempotency_key": log.idempotency_key,
        "created_at": log.created_at.isoformat() if log.created_at else None
    }

