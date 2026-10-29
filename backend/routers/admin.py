import logging
from datetime import datetime
from typing import List, Dict, Any, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.orm import Session
from sqlalchemy import func, desc, or_
from pydantic import BaseModel

from database import get_db
from models.models import User, Brand, Usage, AuditLog, GeneratedPost, DailySession, ContentIdea
from middleware.auth import require_admin
from services.admin_service import (
    get_admin_overview_metrics,
    log_audit_action,
    detect_abuse_flags_for_user
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/admin", tags=["admin"])


# ─── Pydantic Request Models ────────────────────────────────────────────────

class ChangePlanRequest(BaseModel):
    plan: str

class ActionReasonRequest(BaseModel):
    reason: Optional[str] = None


# ─── 1. Overview ────────────────────────────────────────────────────────────

@router.get("/overview")
def get_overview(
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """
    Overview: total users, new signups (7/30d), active users,
    posts generated, AI/image cost per day, failures, and charts.
    """
    metrics = get_admin_overview_metrics(db)
    return {
        "success": True,
        "admin": {
            "email": admin.email,
            "role": admin.role
        },
        **metrics
    }


# ─── 2. Users Searchable List ───────────────────────────────────────────────

@router.get("/users")
def list_users(
    search: Optional[str] = Query(None, description="Search by email or name"),
    plan: Optional[str] = Query(None, description="Filter by plan"),
    status: Optional[str] = Query("all", description="all, active, suspended, deleted"),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """
    Searchable and filterable users list:
    Email, plan, brands count, usage this month, last active, and status.
    Never exposes password hashes or OAuth tokens.
    """
    query = db.query(User)

    # Status filter
    if status == "active":
        query = query.filter(User.is_suspended == False, User.is_deleted == False)
    elif status == "suspended":
        query = query.filter(User.is_suspended == True, User.is_deleted == False)
    elif status == "deleted":
        query = query.filter(User.is_deleted == True)
    elif status == "all":
        # By default exclude permanently deleted unless requested
        pass

    # Plan filter
    if plan and plan.lower() != "all":
        query = query.filter(func.lower(User.plan) == plan.lower())

    # Search filter
    if search and search.strip():
        term = f"%{search.strip().lower()}%"
        query = query.filter(or_(
            func.lower(User.email).like(term),
            func.lower(User.full_name).like(term)
        ))

    total_count = query.count()
    users = query.order_by(User.created_at.desc()).offset(skip).limit(limit).all()

    user_items = []
    for u in users:
        brand_count = len(u.brands) if u.brands else 0

        # Calculate user status string
        user_status = "active"
        if getattr(u, "is_deleted", False):
            user_status = "deleted"
        elif getattr(u, "is_suspended", False):
            user_status = "suspended"

        user_items.append({
            "id": u.id,
            "email": u.email,
            "full_name": u.full_name,
            "role": getattr(u, "role", "user") or "user",
            "plan": (u.plan or "starter").capitalize(),
            "brands_count": brand_count,
            "posts_used_this_month": u.posts_used_this_month or 0,
            "status": user_status,
            "is_suspended": bool(getattr(u, "is_suspended", False)),
            "is_deleted": bool(getattr(u, "is_deleted", False)),
            "last_active_at": u.last_active_at.isoformat() if u.last_active_at else None,
            "created_at": u.created_at.isoformat() if u.created_at else None
        })

    return {
        "total": total_count,
        "skip": skip,
        "limit": limit,
        "users": user_items
    }


# ─── 3. User Detail View ────────────────────────────────────────────────────

@router.get("/users/{user_id}")
def get_user_detail(
    user_id: str,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """
    User detail page data: User profile, brands, recent sessions,
    recent generated posts, and AI usage summaries.
    Never exposes password hashes or OAuth tokens.
    """
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Brands (sanitized)
    brands_data = []
    for b in user.brands or []:
        brands_data.append({
            "id": b.id,
            "name": b.name or b.business_name,
            "business_name": b.business_name,
            "website_url": b.website_url,
            "industry": b.industry,
            "primary_color": b.primary_color,
            "secondary_color": b.secondary_color,
            "logo_url": b.logo_url,
            "is_active": b.is_active,
            "scan_status": b.scan_status,
            "created_at": b.created_at.isoformat() if b.created_at else None
        })

    # Recent generated posts
    recent_posts = db.query(GeneratedPost).filter(
        GeneratedPost.user_id == user.id
    ).order_by(GeneratedPost.created_at.desc()).limit(8).all()

    posts_data = [
        {
            "id": p.id,
            "platform": p.platform,
            "caption": (p.caption or "")[:150],
            "status": p.status,
            "post_image_url": p.post_image_url,
            "created_at": p.created_at.isoformat() if p.created_at else None
        }
        for p in recent_posts
    ]

    # AI Usage Stats
    total_gens = db.query(Usage).filter(Usage.user_id == user.id).count()
    total_cost_val = db.query(func.sum(Usage.cost)).filter(
        Usage.user_id == user.id,
        Usage.status == "success"
    ).scalar() or 0.0

    abuse_flags = detect_abuse_flags_for_user(user, db)

    return {
        "user": {
            "id": user.id,
            "email": user.email,
            "full_name": user.full_name,
            "role": getattr(user, "role", "user") or "user",
            "plan": (user.plan or "starter").capitalize(),
            "posts_used_this_month": user.posts_used_this_month or 0,
            "is_suspended": bool(getattr(user, "is_suspended", False)),
            "is_deleted": bool(getattr(user, "is_deleted", False)),
            "deleted_at": user.deleted_at.isoformat() if user.deleted_at else None,
            "token_version": getattr(user, "token_version", 1) or 1,
            "last_active_at": user.last_active_at.isoformat() if user.last_active_at else None,
            "created_at": user.created_at.isoformat() if user.created_at else None,
            "total_ai_generations": total_gens,
            "total_ai_cost": round(float(total_cost_val), 3),
            "abuse_flags": abuse_flags
        },
        "brands": brands_data,
        "recent_posts": posts_data
    }


# ─── 4. Admin Actions ───────────────────────────────────────────────────────

@router.post("/users/{user_id}/suspend")
def suspend_user(
    user_id: str,
    req: ActionReasonRequest = None,
    admin: User = Depends(require_admin),
    request: Request = None,
    db: Session = Depends(get_db)
):
    """Suspend user account. Blocks user at login and on every API call."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.id == admin.id:
        raise HTTPException(status_code=400, detail="Cannot suspend your own admin account")

    user.is_suspended = True
    # Increment token_version to invalidate active sessions immediately
    user.token_version = (user.token_version or 1) + 1
    db.commit()

    client_ip = request.client.host if request and request.client else None
    log_audit_action(
        db=db,
        admin=admin,
        action="suspend_user",
        target_id=user.id,
        target_email=user.email,
        details={"reason": req.reason if req else "Admin manual suspension"},
        ip_address=client_ip
    )

    return {
        "success": True,
        "message": f"User {user.email} suspended successfully",
        "is_suspended": True
    }


@router.post("/users/{user_id}/reactivate")
def reactivate_user(
    user_id: str,
    req: ActionReasonRequest = None,
    admin: User = Depends(require_admin),
    request: Request = None,
    db: Session = Depends(get_db)
):
    """Reactivate a suspended user account."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.is_suspended = False
    db.commit()

    client_ip = request.client.host if request and request.client else None
    log_audit_action(
        db=db,
        admin=admin,
        action="reactivate_user",
        target_id=user.id,
        target_email=user.email,
        details={"reason": req.reason if req else "Admin manual reactivation"},
        ip_address=client_ip
    )

    return {
        "success": True,
        "message": f"User {user.email} reactivated successfully",
        "is_suspended": False
    }


@router.put("/users/{user_id}/plan")
def change_user_plan(
    user_id: str,
    req: ChangePlanRequest,
    admin: User = Depends(require_admin),
    request: Request = None,
    db: Session = Depends(get_db)
):
    """Change user subscription plan."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    old_plan = user.plan
    new_plan = req.plan.lower().strip()
    valid_plans = {"starter", "free", "growth", "pro", "agency"}
    if new_plan not in valid_plans:
        raise HTTPException(status_code=400, detail=f"Invalid plan. Must be one of: {', '.join(valid_plans)}")

    user.plan = new_plan
    db.commit()

    client_ip = request.client.host if request and request.client else None
    log_audit_action(
        db=db,
        admin=admin,
        action="change_plan",
        target_id=user.id,
        target_email=user.email,
        details={"old_plan": old_plan, "new_plan": new_plan},
        ip_address=client_ip
    )

    return {
        "success": True,
        "message": f"Plan for {user.email} updated to {new_plan.capitalize()}",
        "plan": new_plan
    }


@router.post("/users/{user_id}/reset-usage")
def reset_user_usage(
    user_id: str,
    admin: User = Depends(require_admin),
    request: Request = None,
    db: Session = Depends(get_db)
):
    """Reset posts_used_this_month counter for a user."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    previous_usage = user.posts_used_this_month or 0
    user.posts_used_this_month = 0
    db.commit()

    client_ip = request.client.host if request and request.client else None
    log_audit_action(
        db=db,
        admin=admin,
        action="reset_usage",
        target_id=user.id,
        target_email=user.email,
        details={"previous_usage": previous_usage},
        ip_address=client_ip
    )

    return {
        "success": True,
        "message": f"Reset monthly usage for {user.email} (was {previous_usage})",
        "posts_used_this_month": 0
    }


@router.post("/users/{user_id}/force-logout")
def force_logout_user(
    user_id: str,
    admin: User = Depends(require_admin),
    request: Request = None,
    db: Session = Depends(get_db)
):
    """
    Force logout: Invalidate all existing JWT sessions for the user by
    incrementing their token_version counter.
    """
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.token_version = (user.token_version or 1) + 1
    db.commit()

    client_ip = request.client.host if request and request.client else None
    log_audit_action(
        db=db,
        admin=admin,
        action="force_logout",
        target_id=user.id,
        target_email=user.email,
        details={"new_token_version": user.token_version},
        ip_address=client_ip
    )

    return {
        "success": True,
        "message": f"Forced logout for {user.email}. All active sessions invalidated.",
        "token_version": user.token_version
    }


@router.delete("/users/{user_id}")
def delete_user(
    user_id: str,
    admin: User = Depends(require_admin),
    request: Request = None,
    db: Session = Depends(get_db)
):
    """Soft delete user account. Inactivates access while preserving data for audit."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.id == admin.id:
        raise HTTPException(status_code=400, detail="Cannot delete your own admin account")

    user.is_deleted = True
    user.deleted_at = datetime.utcnow()
    user.token_version = (user.token_version or 1) + 1
    db.commit()

    client_ip = request.client.host if request and request.client else None
    log_audit_action(
        db=db,
        admin=admin,
        action="soft_delete_user",
        target_id=user.id,
        target_email=user.email,
        details={"deleted_at": user.deleted_at.isoformat()},
        ip_address=client_ip
    )

    return {
        "success": True,
        "message": f"User {user.email} soft-deleted successfully",
        "is_deleted": True
    }


# ─── 5. Usage & Limits with Abuse Flags ─────────────────────────────────────

@router.get("/usage")
def get_usage_and_abuse_report(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """
    Per-user AI generation counts and cost, with automated abuse flags.
    """
    users = db.query(User).filter(User.is_deleted == False).order_by(User.created_at.desc()).offset(skip).limit(limit).all()

    user_usage_report = []
    abuse_flagged_users = []

    for u in users:
        total_gens = db.query(Usage).filter(Usage.user_id == u.id).count()
        failed_gens = db.query(Usage).filter(
            Usage.user_id == u.id,
            Usage.status.in_(["fallback", "failed"])
        ).count()
        cost_sum = db.query(func.sum(Usage.cost)).filter(
            Usage.user_id == u.id,
            Usage.status == "success"
        ).scalar() or 0.0

        flags = detect_abuse_flags_for_user(u, db)

        entry = {
            "user_id": u.id,
            "email": u.email,
            "plan": (u.plan or "starter").capitalize(),
            "monthly_posts_used": u.posts_used_this_month or 0,
            "total_ai_generations": total_gens,
            "failed_generations": failed_gens,
            "total_cost": round(float(cost_sum), 3),
            "flags": flags,
            "is_suspended": bool(getattr(u, "is_suspended", False))
        }

        user_usage_report.append(entry)
        if flags:
            abuse_flagged_users.append(entry)

    # Global usage stats
    total_system_cost = db.query(func.sum(Usage.cost)).filter(Usage.status == "success").scalar() or 0.0
    total_system_gens = db.query(Usage).count()

    return {
        "total_system_cost": round(float(total_system_cost), 3),
        "total_system_generations": total_system_gens,
        "flagged_count": len(abuse_flagged_users),
        "flagged_users": abuse_flagged_users,
        "users_usage": user_usage_report
    }


# ─── 6. Audit Log Viewer ────────────────────────────────────────────────────

@router.get("/audit-logs")
def get_audit_logs(
    action: Optional[str] = Query(None, description="Filter by action type"),
    search: Optional[str] = Query(None, description="Search by admin or target email"),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """
    List audit logs: timestamp, admin email, action, target, metadata.
    """
    query = db.query(AuditLog)

    if action and action != "all":
        query = query.filter(AuditLog.action == action)

    if search and search.strip():
        term = f"%{search.strip().lower()}%"
        query = query.filter(or_(
            func.lower(AuditLog.admin_email).like(term),
            func.lower(AuditLog.target_email).like(term)
        ))

    total = query.count()
    logs = query.order_by(AuditLog.created_at.desc()).offset(skip).limit(limit).all()

    log_items = [
        {
            "id": l.id,
            "admin_email": l.admin_email,
            "action": l.action,
            "target_type": l.target_type,
            "target_id": l.target_id,
            "target_email": l.target_email,
            "details": l.details,
            "ip_address": l.ip_address,
            "created_at": l.created_at.isoformat() if l.created_at else None
        }
        for l in logs
    ]

    return {
        "total": total,
        "skip": skip,
        "limit": limit,
        "logs": log_items
    }

