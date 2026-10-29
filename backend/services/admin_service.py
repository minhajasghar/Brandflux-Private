import logging
import uuid
from datetime import datetime, timedelta
from typing import Dict, Any, List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import func, desc, or_

from models.models import User, Brand, Usage, AuditLog, GeneratedPost, ScheduledPost, DailySession
from services.auth_service import hash_password
from config import ADMIN_EMAIL, ADMIN_PASSWORD

logger = logging.getLogger(__name__)


def seed_initial_admin(db: Session) -> Optional[User]:
    """
    Seed or upgrade the initial administrator account from environment variables.
    Ensures role='admin' and active status.
    """
    if not ADMIN_EMAIL:
        return None

    try:
        admin_user = db.query(User).filter(func.lower(User.email) == ADMIN_EMAIL.lower()).first()
        if not admin_user:
            admin_user = User(
                id=str(uuid.uuid4()),
                email=ADMIN_EMAIL,
                password_hash=hash_password(ADMIN_PASSWORD or "Admin123!#Brandflux"),
                full_name="System Administrator",
                role="admin",
                plan="pro",
                is_suspended=False,
                is_deleted=False,
                token_version=1
            )
            db.add(admin_user)
            db.commit()
            db.refresh(admin_user)
            logger.info(f"👑 Initial administrator seeded: {ADMIN_EMAIL}")
        else:
            changed = False
            if admin_user.role != "admin":
                admin_user.role = "admin"
                changed = True
            if admin_user.is_suspended:
                admin_user.is_suspended = False
                changed = True
            if admin_user.is_deleted:
                admin_user.is_deleted = False
                changed = True
            if changed:
                db.commit()
                logger.info(f"👑 Verified administrator privileges for: {ADMIN_EMAIL}")
        return admin_user
    except Exception as e:
        logger.error(f"Failed to seed initial admin: {e}")
        db.rollback()
        return None


def log_audit_action(
    db: Session,
    admin: User,
    action: str,
    target_id: Optional[str] = None,
    target_email: Optional[str] = None,
    target_type: str = "user",
    details: Optional[Dict[str, Any]] = None,
    ip_address: Optional[str] = None
) -> AuditLog:
    """Record an administrative action to the audit_logs table."""
    audit_entry = AuditLog(
        id=str(uuid.uuid4()),
        admin_id=admin.id,
        admin_email=admin.email,
        action=action,
        target_type=target_type,
        target_id=target_id,
        target_email=target_email,
        details=details or {},
        ip_address=ip_address
    )
    db.add(audit_entry)
    db.commit()
    db.refresh(audit_entry)
    logger.info(f"🛡️ AUDIT [{action}]: Admin {admin.email} -> Target {target_email or target_id}")
    return audit_entry


def get_admin_overview_metrics(db: Session) -> Dict[str, Any]:
    """Calculate platform-wide KPI metrics and daily time-series."""
    now = datetime.utcnow()
    d7_ago = now - timedelta(days=7)
    d30_ago = now - timedelta(days=30)
    d14_ago = now - timedelta(days=14)

    total_users = db.query(User).filter(User.is_deleted == False).count()
    new_signups_7d = db.query(User).filter(User.created_at >= d7_ago, User.is_deleted == False).count()
    new_signups_30d = db.query(User).filter(User.created_at >= d30_ago, User.is_deleted == False).count()

    # Active users: users with activity in last 30 days
    active_users = db.query(User).filter(
        User.is_deleted == False,
        or_(
            User.last_active_at >= d30_ago,
            User.created_at >= d30_ago
        )
    ).count()

    posts_generated = db.query(GeneratedPost).count()

    # Cost totals from usage table
    total_cost_res = db.query(func.sum(Usage.cost)).filter(Usage.status == "success").scalar()
    total_ai_cost = round(float(total_cost_res or 0.0), 3)

    # Failures count
    failures_count = db.query(Usage).filter(Usage.status.in_(["fallback", "failed"])).count()

    # Daily AI cost and generation counts for the last 14 days
    ai_cost_per_day = []
    for i in range(14):
        day_date = (now - timedelta(days=13 - i)).date()
        day_start = datetime.combine(day_date, datetime.min.time())
        day_end = datetime.combine(day_date, datetime.max.time())

        day_cost = db.query(func.sum(Usage.cost)).filter(
            Usage.created_at >= day_start,
            Usage.created_at <= day_end,
            Usage.status == "success"
        ).scalar() or 0.0

        day_gens = db.query(Usage).filter(
            Usage.created_at >= day_start,
            Usage.created_at <= day_end
        ).count()

        day_fails = db.query(Usage).filter(
            Usage.created_at >= day_start,
            Usage.created_at <= day_end,
            Usage.status.in_(["fallback", "failed"])
        ).count()

        day_signups = db.query(User).filter(
            User.created_at >= day_start,
            User.created_at <= day_end
        ).count()

        ai_cost_per_day.append({
            "date": day_date.strftime("%b %d"),
            "full_date": str(day_date),
            "cost": round(float(day_cost), 3),
            "generations": day_gens,
            "failures": day_fails,
            "signups": day_signups
        })

    # Recent failure logs
    recent_failures = db.query(Usage).filter(
        Usage.status.in_(["fallback", "failed"])
    ).order_by(Usage.created_at.desc()).limit(10).all()

    failures_list = [
        {
            "id": f.id,
            "user_id": f.user_id,
            "brand_id": f.brand_id,
            "model": f.model,
            "error_message": f.error_message or "Generation failed or timed out",
            "aspect_ratio": f.aspect_ratio,
            "created_at": f.created_at.isoformat() if f.created_at else None
        }
        for f in recent_failures
    ]

    return {
        "total_users": total_users,
        "new_signups_7d": new_signups_7d,
        "new_signups_30d": new_signups_30d,
        "active_users": active_users,
        "posts_generated": posts_generated,
        "total_ai_cost": total_ai_cost,
        "failures_count": failures_count,
        "ai_cost_per_day": ai_cost_per_day,
        "recent_failures": failures_list
    }


def detect_abuse_flags_for_user(user: User, db: Session) -> List[Dict[str, Any]]:
    """Inspect user usage metrics and evaluate abuse flags."""
    flags = []
    now = datetime.utcnow()
    d1_ago = now - timedelta(hours=24)

    # 1. Generation spike in 24 hours
    gens_24h = db.query(Usage).filter(Usage.user_id == user.id, Usage.created_at >= d1_ago).count()
    if gens_24h >= 40:
        flags.append({
            "type": "spike_24h",
            "severity": "critical" if gens_24h >= 80 else "warning",
            "message": f"High 24h generation spike: {gens_24h} requests in the past 24 hours."
        })

    # 2. High failure rate (minimum 5 requests)
    total_gens = db.query(Usage).filter(Usage.user_id == user.id).count()
    if total_gens >= 5:
        fails = db.query(Usage).filter(
            Usage.user_id == user.id,
            Usage.status.in_(["fallback", "failed"])
        ).count()
        fail_pct = round((fails / total_gens) * 100, 1)
        if fail_pct >= 40.0:
            flags.append({
                "type": "high_failure_rate",
                "severity": "warning",
                "message": f"High failure rate: {fail_pct}% ({fails}/{total_gens} requests failed)."
            })

    # 3. Monthly limit exceeded
    plan_limit = {"starter": 30, "free": 15, "growth": 100, "pro": 500}.get(user.plan.lower(), 30)
    used_month = user.posts_used_this_month or 0
    if used_month > plan_limit * 1.5:
        flags.append({
            "type": "plan_limit_exceeded",
            "severity": "warning",
            "message": f"Usage exceeded plan allowance: {used_month}/{plan_limit} posts used."
        })

    return flags

