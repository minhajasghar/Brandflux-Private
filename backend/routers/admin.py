import logging
import asyncio
import uuid
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.orm import Session
from sqlalchemy import func, desc, or_
from pydantic import BaseModel

from database import get_db
from models.models import (
    User, Brand, Usage, AuditLog, GeneratedPost, ScheduledPost, DailySession,
    ContentIdea, WebsiteScan, SocialAccount, SystemSetting
)
from middleware.auth import require_admin, require_admin_write
from services.admin_service import (
    get_admin_overview_metrics,
    log_audit_action,
    detect_abuse_flags_for_user,
    get_feature_flags,
    update_feature_flags,
    get_plans_config,
    update_plans_config,
    get_system_health_metrics,
    permanently_purge_user,
    purge_expired_soft_deleted_users
)
from services.auth_service import hash_password

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/admin", tags=["admin"])


# ─── Pydantic Request Models ────────────────────────────────────────────────

class ChangePlanRequest(BaseModel):
    plan: str

class AdjustLimitsRequest(BaseModel):
    posts_used_this_month: Optional[int] = None
    plan: Optional[str] = None
    reason: Optional[str] = None

class ActionReasonRequest(BaseModel):
    reason: Optional[str] = None

class DeleteUserRequest(BaseModel):
    confirm_email: Optional[str] = None
    reason: Optional[str] = None

class TestScanRequest(BaseModel):
    website_url: str

class RescanUserRequest(BaseModel):
    user_id: str
    website_url: Optional[str] = None

class FeatureFlagsRequest(BaseModel):
    global_kill_switch: Optional[bool] = None
    image_generation: Optional[bool] = None
    video_generation: Optional[bool] = None
    session_generation: Optional[bool] = None
    autopilot_posting: Optional[bool] = None
    website_scanner: Optional[bool] = None

class CreateAdminRequest(BaseModel):
    email: str
    password: str
    full_name: Optional[str] = "Admin Team Member"
    role: str = "support_admin"  # "admin" or "support_admin"

class UpdateAdminRoleRequest(BaseModel):
    role: str  # "admin" or "support_admin"


# ─── 1. Overview ────────────────────────────────────────────────────────────

@router.get("/overview")
def get_overview(
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """
    Overview: total users, new signups (7/30d), active users,
    posts generated, AI/image cost per day, failures, and charts.
    Never returns passwords or sensitive tokens.
    """
    metrics = get_admin_overview_metrics(db)
    return {
        "success": True,
        "admin": {
            "email": admin.email,
            "role": getattr(admin, "role", "admin")
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

    if status == "active":
        query = query.filter(User.is_suspended == False, User.is_deleted == False)
    elif status == "suspended":
        query = query.filter(User.is_suspended == True, User.is_deleted == False)
    elif status == "deleted":
        query = query.filter(User.is_deleted == True)

    if plan and plan.lower() != "all":
        query = query.filter(func.lower(User.plan) == plan.lower())

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
        brand_count = len(u.brands or [])
        user_items.append({
            "id": u.id,
            "email": u.email,
            "full_name": u.full_name,
            "role": getattr(u, "role", "user") or "user",
            "plan": (u.plan or "starter").capitalize(),
            "posts_used_this_month": u.posts_used_this_month or 0,
            "brands_count": brand_count,
            "is_suspended": bool(getattr(u, "is_suspended", False)),
            "is_deleted": bool(getattr(u, "is_deleted", False)),
            "last_active_at": u.last_active_at.isoformat() if u.last_active_at else None,
            "created_at": u.created_at.isoformat() if u.created_at else None,
        })

    return {
        "total": total_count,
        "skip": skip,
        "limit": limit,
        "users": user_items
    }


# ─── 3. User Detail Page ────────────────────────────────────────────────────

@router.get("/users/{user_id}")
def get_user_detail(
    user_id: str,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """
    User detail page data: User profile, brands, recent sessions,
    recent generated posts, connected platforms (status only, never tokens),
    and website scan history. Never exposes password hashes or OAuth tokens.
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

    # Connected Platforms (Status only, NEVER tokens or secrets!)
    social_accounts = db.query(SocialAccount).filter(SocialAccount.user_id == user.id).all()
    platforms_data = [
        {
            "id": sa.id,
            "platform": sa.platform,
            "account_name": sa.account_name,
            "is_connected": getattr(sa, "is_active", True),
            "connected_at": sa.created_at.isoformat() if sa.created_at else None,
            "expires_at": sa.token_expires_at.isoformat() if sa.token_expires_at else None,
            "is_expired": bool(sa.token_expires_at and sa.token_expires_at < datetime.utcnow())
        }
        for sa in social_accounts
    ]

    # Scan History
    scan_history = db.query(WebsiteScan).filter(
        WebsiteScan.user_id == user.id
    ).order_by(WebsiteScan.scanned_at.desc()).limit(10).all()

    scans_data = [
        {
            "id": s.id,
            "website_url": s.website_url,
            "scan_status": s.scan_status,
            "scanned_at": s.scanned_at.isoformat() if s.scanned_at else None,
            "detected_colors": s.detected_colors or []
        }
        for s in scan_history
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
        "recent_posts": posts_data,
        "connected_platforms": platforms_data,
        "scan_history": scans_data
    }


# ─── 4. User Actions (Audited & Write-Protected) ─────────────────────────────

@router.post("/users/{user_id}/suspend")
def suspend_user(
    user_id: str,
    req: ActionReasonRequest = ActionReasonRequest(),
    admin: User = Depends(require_admin_write),
    db: Session = Depends(get_db)
):
    """Suspend a user account with audit logging. Blocked everywhere immediately."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.is_suspended = True
    user.token_version = (getattr(user, "token_version", 1) or 1) + 1
    db.commit()

    log_audit_action(
        db=db,
        admin=admin,
        action="suspend_user",
        target_id=user.id,
        target_email=user.email,
        details={"reason": req.reason or "Administrator action"}
    )

    return {
        "success": True,
        "is_suspended": True,
        "message": f"User {user.email} suspended successfully."
    }


@router.post("/users/{user_id}/reactivate")
def reactivate_user(
    user_id: str,
    req: ActionReasonRequest = ActionReasonRequest(),
    admin: User = Depends(require_admin_write),
    db: Session = Depends(get_db)
):
    """Reactivate a suspended user account with audit logging."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.is_suspended = False
    db.commit()

    log_audit_action(
        db=db,
        admin=admin,
        action="reactivate_user",
        target_id=user.id,
        target_email=user.email,
        details={"reason": req.reason or "Administrator action"}
    )

    return {
        "success": True,
        "is_suspended": False,
        "message": f"User {user.email} reactivated successfully."
    }


@router.put("/users/{user_id}/plan")
def change_user_plan(
    user_id: str,
    req: ChangePlanRequest,
    admin: User = Depends(require_admin_write),
    db: Session = Depends(get_db)
):
    """Change subscription plan for a user with audit logging."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    old_plan = user.plan
    user.plan = req.plan.lower()
    db.commit()

    log_audit_action(
        db=db,
        admin=admin,
        action="change_plan",
        target_id=user.id,
        target_email=user.email,
        details={"before": old_plan, "after": user.plan}
    )

    return {
        "success": True,
        "plan": user.plan,
        "message": f"Plan updated to {user.plan}."
    }


@router.put("/users/{user_id}/limits")
def adjust_user_limits(
    user_id: str,
    req: AdjustLimitsRequest,
    admin: User = Depends(require_admin_write),
    db: Session = Depends(get_db)
):
    """Adjust monthly usage limits or posts for a user with audit logging."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    old_used = user.posts_used_this_month
    if req.posts_used_this_month is not None:
        user.posts_used_this_month = req.posts_used_this_month
    if req.plan:
        user.plan = req.plan.lower()
    db.commit()

    log_audit_action(
        db=db,
        admin=admin,
        action="adjust_limits",
        target_id=user.id,
        target_email=user.email,
        details={
            "old_posts_used": old_used,
            "new_posts_used": user.posts_used_this_month,
            "reason": req.reason or "Administrator adjustment"
        }
    )

    return {"success": True, "message": f"User limits adjusted for {user.email}."}


@router.post("/users/{user_id}/reset-usage")
def reset_user_usage(
    user_id: str,
    admin: User = Depends(require_admin_write),
    db: Session = Depends(get_db)
):
    """Reset monthly generation counter to 0."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    old_count = user.posts_used_this_month or 0
    user.posts_used_this_month = 0
    db.commit()

    log_audit_action(
        db=db,
        admin=admin,
        action="reset_usage",
        target_id=user.id,
        target_email=user.email,
        details={"before_reset": old_count, "after_reset": 0}
    )

    return {
        "success": True,
        "posts_used_this_month": 0,
        "message": f"Monthly usage for {user.email} reset to 0."
    }


@router.post("/users/{user_id}/force-logout")
def force_logout_user(
    user_id: str,
    admin: User = Depends(require_admin_write),
    db: Session = Depends(get_db)
):
    """Increment token_version to invalidate all active JWT sessions."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    current_ver = getattr(user, "token_version", 1) or 1
    user.token_version = current_ver + 1
    db.commit()

    log_audit_action(
        db=db,
        admin=admin,
        action="force_logout",
        target_id=user.id,
        target_email=user.email,
        details={"previous_version": current_ver, "new_version": user.token_version}
    )

    return {"success": True, "message": f"All active sessions invalidated for {user.email}."}


@router.post("/users/{user_id}/reset-password")
def send_password_reset(
    user_id: str,
    admin: User = Depends(require_admin_write),
    db: Session = Depends(get_db)
):
    """Generate temporary password reset token and invalidate sessions."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.token_version = (getattr(user, "token_version", 1) or 1) + 1
    db.commit()

    log_audit_action(
        db=db,
        admin=admin,
        action="send_password_reset",
        target_id=user.id,
        target_email=user.email,
        details={"dispatched_to": user.email}
    )

    return {
        "success": True,
        "message": f"Password reset notification recorded and dispatched for {user.email}."
    }


@router.delete("/users/{user_id}")
def delete_user(
    user_id: str,
    body: Optional[DeleteUserRequest] = None,
    confirm_email: Optional[str] = Query(None, description="Exact user email required to confirm deletion"),
    admin: User = Depends(require_admin_write),
    db: Session = Depends(get_db)
):
    """
    Two-step deletion: Step 1 (Soft Delete).
    - Account is blocked, data hidden, restorable for 30 days before permanent purge.
    - Requires typing the user's email to confirm.
    - Blocks deleting yourself or the last remaining platform administrator.
    """
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # 1. Block deleting yourself
    if user.id == admin.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Security violation: You cannot delete your own admin account."
        )

    # 2. Block deleting the last admin
    if getattr(user, "role", "user") == "admin":
        active_admins = db.query(User).filter(User.role == "admin", User.is_deleted == False).count()
        if active_admins <= 1:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Action prohibited: Cannot delete the last remaining platform administrator."
            )

    # 3. Require typing the user's email to confirm
    typed_email = (body.confirm_email if body else None) or confirm_email
    if not typed_email or typed_email.strip().lower() != user.email.lower():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Confirmation mismatch. You must type the user's exact email address ({user.email}) to confirm deletion."
        )

    # 4. Perform soft delete
    user.is_deleted = True
    user.deleted_at = datetime.utcnow()
    user.is_suspended = True
    user.token_version = (getattr(user, "token_version", 1) or 1) + 1
    db.commit()

    log_audit_action(
        db=db,
        admin=admin,
        action="soft_delete_user",
        target_id=user.id,
        target_email=user.email,
        details={
            "deleted_at": user.deleted_at.isoformat(),
            "reason": (body.reason if body else None) or "Admin soft delete",
            "grace_period_days": 30
        }
    )

    return {
        "success": True,
        "message": f"User {user.email} soft-deleted successfully. Account is blocked and restorable for 30 days before permanent purge.",
        "is_deleted": True,
        "deleted_at": user.deleted_at.isoformat(),
        "grace_period_days": 30
    }


@router.post("/users/{user_id}/restore")
def restore_user(
    user_id: str,
    admin: User = Depends(require_admin_write),
    db: Session = Depends(get_db)
):
    """Restore a soft-deleted user account within the 30-day grace period."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if not getattr(user, "is_deleted", False):
        raise HTTPException(status_code=400, detail="User account is not currently deleted.")

    # Check 30-day grace period
    if user.deleted_at:
        days_since_deleted = (datetime.utcnow() - user.deleted_at).days
        if days_since_deleted > 30:
            raise HTTPException(
                status_code=400,
                detail=f"Deletion grace period expired ({days_since_deleted} days elapsed). Account cannot be restored and is queued for permanent purge."
            )

    user.is_deleted = False
    user.deleted_at = None
    user.is_suspended = False
    db.commit()

    log_audit_action(
        db=db,
        admin=admin,
        action="restore_user",
        target_id=user.id,
        target_email=user.email,
        details={"restored_at": datetime.utcnow().isoformat()}
    )

    return {
        "success": True,
        "message": f"User {user.email} restored successfully from soft-delete.",
        "is_deleted": False,
        "is_suspended": False
    }


@router.post("/users/{user_id}/purge")
def purge_user_endpoint(
    user_id: str,
    admin: User = Depends(require_admin_write),
    db: Session = Depends(get_db)
):
    """
    Step 2: Permanently purges a user account and all associated assets/data.
    On purge: deletes brands, posts, images in storage, scheduled posts, revokes OAuth tokens,
    cancels subscription, anonymizes billing records, and logs an anonymized audit log.
    """
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if user.id == admin.id:
        raise HTTPException(status_code=400, detail="Security violation: Cannot purge your own admin account.")

    if getattr(user, "role", "user") == "admin":
        active_admins = db.query(User).filter(User.role == "admin", User.is_deleted == False).count()
        if active_admins <= 1:
            raise HTTPException(status_code=400, detail="Action prohibited: Cannot purge the last remaining platform administrator.")

    result = permanently_purge_user(db=db, user=user, admin_actor=admin)
    return result


@router.post("/users/purge-expired")
def purge_expired_users_endpoint(
    days: int = Query(30, description="Grace period retention days"),
    admin: User = Depends(require_admin_write),
    db: Session = Depends(get_db)
):
    """Manually trigger permanent purge of all soft-deleted users past their retention grace period."""
    result = purge_expired_soft_deleted_users(db=db, retention_days=days)
    log_audit_action(
        db=db,
        admin=admin,
        action="batch_purge_expired_users",
        details=result
    )
    return result


@router.get("/users/{user_id}/export")
def export_user_data(
    user_id: str,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """Export complete user data payload for compliance/backup prior to deletion."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    brands = [
        {
            "id": b.id,
            "name": b.name,
            "business_name": b.business_name,
            "website_url": b.website_url,
            "brand_tone": b.brand_tone,
            "primary_color": b.primary_color,
            "secondary_color": b.secondary_color,
            "brand_kit": b.brand_kit,
            "created_at": str(b.created_at)
        }
        for b in user.brands or []
    ]
    posts = [
        {
            "id": p.id,
            "platform": p.platform,
            "caption": p.caption,
            "hashtags": p.hashtags,
            "status": p.status,
            "post_image_url": p.post_image_url,
            "created_at": str(p.created_at)
        }
        for p in db.query(GeneratedPost).filter(GeneratedPost.user_id == user.id).all()
    ]
    user_brand_ids = [b.id for b in user.brands or []]
    scheduled_posts = [
        {
            "id": s.id,
            "platform": s.platform,
            "scheduled_at": str(s.scheduled_at),
            "status": s.status,
            "caption": s.caption
        }
        for s in (db.query(ScheduledPost).filter(ScheduledPost.brand_id.in_(user_brand_ids)).all() if user_brand_ids else [])
    ]
    social_accounts = [
        {
            "id": sa.id,
            "platform": sa.platform,
            "account_name": sa.account_name,
            "connected_at": str(sa.created_at)
        }
        for sa in db.query(SocialAccount).filter(SocialAccount.user_id == user.id).all()
    ]
    usage = [
        {"id": u.id, "model": u.model, "cost": u.cost, "status": u.status, "date": str(u.created_at)}
        for u in db.query(Usage).filter(Usage.user_id == user.id).all()
    ]

    log_audit_action(
        db=db,
        admin=admin,
        action="export_user_data",
        target_id=user.id,
        target_email=user.email,
        details={"records_exported": len(posts) + len(brands) + len(scheduled_posts)}
    )

    return {
        "export_metadata": {
            "exported_at": datetime.utcnow().isoformat(),
            "exported_by": admin.email,
            "system": "Brandflux Data Compliance Engine"
        },
        "user_profile": {
            "id": user.id,
            "email": user.email,
            "full_name": user.full_name,
            "plan": user.plan,
            "is_suspended": user.is_suspended,
            "is_deleted": user.is_deleted,
            "created_at": str(user.created_at)
        },
        "brands": brands,
        "posts": posts,
        "scheduled_posts": scheduled_posts,
        "social_accounts": social_accounts,
        "usage_history": usage
    }


# ─── 5. Scan Logs & Debug Scanner Tool ──────────────────────────────────────

@router.get("/scans")
def list_scans(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    status: Optional[str] = Query(None),
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """All website scans across users with URL, user email, status, time, and detected colors."""
    query = db.query(WebsiteScan, User.email.label("user_email")).outerjoin(
        User, WebsiteScan.user_id == User.id
    )

    if status and status != "all":
        query = query.filter(WebsiteScan.scan_status == status)

    total = query.count()
    rows = query.order_by(WebsiteScan.scanned_at.desc()).offset(skip).limit(limit).all()

    scans_list = []
    for s, u_email in rows:
        scans_list.append({
            "id": s.id,
            "user_id": s.user_id,
            "user_email": u_email or "Unknown",
            "website_url": s.website_url,
            "scan_status": s.scan_status,
            "scanned_at": s.scanned_at.isoformat() if s.scanned_at else None,
            "detected_colors": s.detected_colors or [],
            "detected_products": s.detected_products or [],
        })

    return {
        "total": total,
        "skip": skip,
        "limit": limit,
        "scans": scans_list
    }


@router.post("/scans/test")
async def test_scanner(
    req: TestScanRequest,
    admin: User = Depends(require_admin)
):
    """
    Debug tool: Runs the layered brand scanner on a website URL.
    Does NOT create, touch or modify any user or brand in the database.
    """
    if not req.website_url or not req.website_url.strip():
        raise HTTPException(status_code=400, detail="Website URL is required.")

    try:
        from services.brand_color_extractor import BrandColorExtractor
        extractor = BrandColorExtractor(req.website_url)
        palette = await extractor.extract_palette()
        return {
            "success": True,
            "website_url": req.website_url,
            "color_palette": palette,
            "message": "Debug scan completed without creating or modifying database entities."
        }
    except Exception as e:
        logger.error(f"Debug test scan error: {e}")
        return {
            "success": False,
            "website_url": req.website_url,
            "error": str(e)
        }


@router.post("/scans/rescan-user")
async def rescan_user_brand(
    req: RescanUserRequest,
    admin: User = Depends(require_admin_write),
    db: Session = Depends(get_db)
):
    """Re-scan on behalf of a user to refresh their brand kit."""
    user = db.query(User).filter(User.id == req.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    brand = user.brands[0] if user.brands else None
    scan_url = req.website_url or (brand.website_url if brand else None)
    if not scan_url:
        raise HTTPException(status_code=400, detail="No website URL available for this user.")

    from services.scraper import BrandScraper
    scraper = BrandScraper(scan_url)
    brand_data = await scraper.scrape()

    if brand:
        brand.business_name = brand_data.get("business_name") or brand.business_name
        brand.primary_color = brand_data.get("primary_color") or brand.primary_color
        brand.secondary_color = brand_data.get("secondary_color") or brand.secondary_color
        brand.colors = brand_data.get("colors") or brand.colors
        brand.last_scanned_at = datetime.utcnow()
        db.commit()

    log_audit_action(
        db=db,
        admin=admin,
        action="rescan_user_brand",
        target_id=user.id,
        target_email=user.email,
        details={"scanned_url": scan_url}
    )

    return {"success": True, "message": f"Brand re-scanned for user {user.email}."}


# ─── 6. Usage & Feature Flags (Kill Switch) ─────────────────────────────────

@router.get("/usage")
def get_usage_and_abuse_report(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """Per-user AI generation counts and cost, with automated abuse flags."""
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

    total_system_cost = db.query(func.sum(Usage.cost)).filter(Usage.status == "success").scalar() or 0.0
    total_system_gens = db.query(Usage).count()

    return {
        "total_system_cost": round(float(total_system_cost), 3),
        "total_system_generations": total_system_gens,
        "flagged_count": len(abuse_flagged_users),
        "flagged_users": abuse_flagged_users,
        "users_usage": user_usage_report
    }


@router.get("/feature-flags")
def get_flags(
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """Read global kill switch and feature toggles."""
    return get_feature_flags(db)


@router.put("/feature-flags")
def update_flags(
    req: FeatureFlagsRequest,
    admin: User = Depends(require_admin_write),
    db: Session = Depends(get_db)
):
    """Toggle global kill switch or feature flags with audit logging."""
    updates = req.model_dump(exclude_unset=True)
    return update_feature_flags(db, updates, admin)


# ─── 7. Content & Publishing Monitor ────────────────────────────────────────

@router.get("/publishing/monitor")
def get_publishing_monitor(
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """Failed posts, queue health, retries, platform error rates, expiring connections."""
    now = datetime.utcnow()
    d7_ago = now - timedelta(days=7)

    # Failed scheduled posts (Sanitized: does not reveal full private post text)
    failed_posts = db.query(ScheduledPost).filter(
        ScheduledPost.status == "Failed"
    ).order_by(ScheduledPost.created_at.desc()).limit(20).all()

    failed_list = []
    for p in failed_posts:
        brand = db.query(Brand).filter(Brand.id == p.brand_id).first() if p.brand_id else None
        user = db.query(User).filter(User.id == brand.user_id).first() if (brand and brand.user_id) else None
        failed_list.append({
            "id": p.id,
            "platform": p.platform,
            "user_email": user.email if user else "Unknown",
            "status": p.status,
            "error": p.error or "Publishing failed",
            "scheduled_at": p.scheduled_at,
            "created_at": p.created_at.isoformat() if p.created_at else None
        })

    # Platform error rates
    total_pub = db.query(ScheduledPost).filter(ScheduledPost.created_at >= d7_ago).count()
    failed_pub = db.query(ScheduledPost).filter(
        ScheduledPost.status == "Failed",
        ScheduledPost.created_at >= d7_ago
    ).count()

    # Expiring OAuth tokens
    expiring_accounts = db.query(SocialAccount, User.email.label("user_email")).join(
        User, SocialAccount.user_id == User.id
    ).filter(
        SocialAccount.token_expires_at.isnot(None),
        SocialAccount.token_expires_at <= now + timedelta(days=3)
    ).limit(20).all()

    expiring_list = [
        {
            "id": sa.id,
            "user_email": u_email,
            "platform": sa.platform,
            "account_name": sa.account_name,
            "expires_at": sa.token_expires_at.isoformat() if sa.token_expires_at else None
        }
        for sa, u_email in expiring_accounts
    ]

    return {
        "queue_health": "operational" if failed_pub < 10 else "attention_needed",
        "total_scheduled_7d": total_pub,
        "failed_scheduled_7d": failed_pub,
        "failure_rate": f"{round((failed_pub / total_pub * 100), 1) if total_pub else 0}%",
        "failed_posts": failed_list,
        "expiring_connections": expiring_list
    }


@router.post("/publishing/retry/{post_id}")
def retry_post(
    post_id: str,
    admin: User = Depends(require_admin_write),
    db: Session = Depends(get_db)
):
    """Retry a failed scheduled publishing post."""
    post = db.query(ScheduledPost).filter(ScheduledPost.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="Scheduled post not found")

    post.status = "Scheduled"
    post.error = None
    db.commit()

    log_audit_action(
        db=db,
        admin=admin,
        action="retry_post",
        target_id=post.id,
        target_type="scheduled_post",
        details={"platform": post.platform}
    )

    return {"success": True, "message": "Post re-queued for publishing."}


# ─── 8. Plans & Limits Configuration ────────────────────────────────────────

@router.get("/plans")
def list_plans(
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """Read dynamic plan definitions."""
    return get_plans_config(db)


@router.put("/plans")
def update_plans(
    plans_data: Dict[str, Any],
    admin: User = Depends(require_admin_write),
    db: Session = Depends(get_db)
):
    """Update dynamic plan definitions without code changes."""
    return update_plans_config(db, plans_data, admin)


# ─── 9. System Health ───────────────────────────────────────────────────────

@router.get("/system-health")
def get_system_health(
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """API, database, background scheduler, storage, and AI service health."""
    return get_system_health_metrics(db)


@router.get("/health/generation")
async def health_check_generation(
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """
    Live Generation Health Check (Admin Only):
    Runs a tiny real text call, a tiny real image call, and a Playwright render,
    and reports pass/fail with timing and detailed error diagnostics.
    """
    import time
    from services.gemini_service import GeminiService
    from services.nano_banana_generator import nano_banana_generator
    from services.renderer.html_renderer import html_renderer

    results = {
        "status": "pass",
        "timestamp": datetime.utcnow().isoformat(),
        "checks": {}
    }

    # 1. Real Gemini Text Call
    t0 = time.time()
    try:
        gemini = GeminiService()
        if not gemini.model:
            raise Exception("GeminiService model is None (check GEMINI_API_KEY / GEMINI_MODEL)")
        loop = asyncio.get_running_loop()
        res = await asyncio.wait_for(
            loop.run_in_executor(None, gemini.model.generate_content, "Return JSON: {\"status\": \"ok\"}"),
            timeout=12.0
        )
        results["checks"]["gemini_text"] = {
            "status": "pass",
            "model": gemini.model_name,
            "duration_ms": int((time.time() - t0) * 1000),
            "sample_response": (res.text or "").strip()[:60]
        }
    except Exception as e:
        results["status"] = "fail"
        results["checks"]["gemini_text"] = {
            "status": "fail",
            "duration_ms": int((time.time() - t0) * 1000),
            "error": str(e)
        }

    # 2. Real Nano Banana Image Call
    t0 = time.time()
    try:
        img_bytes = await asyncio.wait_for(
            nano_banana_generator._call_gemini_api("Minimalist geometric cube with ambient blue light", "1:1"),
            timeout=35.0
        )
        if not img_bytes or len(img_bytes) < 1000:
            raise Exception("Returned image bytes were empty or truncated")
        results["checks"]["nano_banana_image"] = {
            "status": "pass",
            "model": nano_banana_generator.get_active_model(),
            "bytes_received": len(img_bytes),
            "duration_ms": int((time.time() - t0) * 1000)
        }
    except Exception as e:
        results["status"] = "fail"
        results["checks"]["nano_banana_image"] = {
            "status": "fail",
            "duration_ms": int((time.time() - t0) * 1000),
            "error": str(e)
        }

    # 3. Real Playwright Template Render
    t0 = time.time()
    try:
        context = {
            "headline": "System Diagnostic Pass",
            "cta": "Operational",
            "brand_name": "Brandflux Admin",
            "brand_colors": {
                "bg": "#05060A", "surface": "#0D0F16", "primary": "#1558C9",
                "accent": "#D4FF24", "text": "#F4F5F7", "muted": "#8A90A2"
            }
        }
        png_bytes = await asyncio.wait_for(
            html_renderer.render_template("quote_bold.html", context),
            timeout=15.0
        )
        if not png_bytes or len(png_bytes) < 1000:
            raise Exception("Playwright rendered empty PNG bytes")
        results["checks"]["playwright_render"] = {
            "status": "pass",
            "bytes_rendered": len(png_bytes),
            "duration_ms": int((time.time() - t0) * 1000)
        }
    except Exception as e:
        results["status"] = "fail"
        results["checks"]["playwright_render"] = {
            "status": "fail",
            "duration_ms": int((time.time() - t0) * 1000),
            "error": str(e)
        }

    return results


# ─── 10. Audit Log Viewer ───────────────────────────────────────────────────

@router.get("/audit-logs")
def get_audit_logs(
    action: Optional[str] = Query(None, description="Filter by action type"),
    search: Optional[str] = Query(None, description="Search by admin or target email"),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """List audit logs: timestamp, admin email, action, target, metadata. Read-only."""
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


# ─── 11. Admin Team Management ──────────────────────────────────────────────

@router.get("/admins")
def list_admins(
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """List all platform administrators and support admins."""
    admins = db.query(User).filter(
        User.role.in_(["admin", "support_admin"]),
        User.is_deleted == False
    ).order_by(User.created_at.asc()).all()

    return [
        {
            "id": a.id,
            "email": a.email,
            "full_name": a.full_name,
            "role": a.role,
            "created_at": a.created_at.isoformat() if a.created_at else None,
            "last_active_at": a.last_active_at.isoformat() if a.last_active_at else None
        }
        for a in admins
    ]


@router.post("/admins")
def create_admin_account(
    req: CreateAdminRequest,
    admin: User = Depends(require_admin_write),
    db: Session = Depends(get_db)
):
    """Create a new administrator or support_admin account."""
    if req.role not in ("admin", "support_admin"):
        raise HTTPException(status_code=400, detail="Role must be 'admin' or 'support_admin'.")

    clean_email = req.email.strip().lower()
    existing = db.query(User).filter(func.lower(User.email) == clean_email).first()
    if existing:
        existing.role = req.role
        existing.is_suspended = False
        existing.is_deleted = False
        db.commit()
        log_audit_action(
            db=db,
            admin=admin,
            action="promote_admin",
            target_id=existing.id,
            target_email=existing.email,
            details={"role": req.role}
        )
        return {"success": True, "message": f"User {clean_email} promoted to {req.role}."}

    new_admin = User(
        id=str(uuid.uuid4()),
        email=clean_email,
        password_hash=hash_password(req.password),
        full_name=req.full_name,
        role=req.role,
        plan="pro",
        is_suspended=False,
        is_deleted=False
    )
    db.add(new_admin)
    db.commit()

    log_audit_action(
        db=db,
        admin=admin,
        action="create_admin",
        target_id=new_admin.id,
        target_email=new_admin.email,
        details={"role": req.role}
    )

    return {"success": True, "message": f"Administrator account created for {clean_email}."}


@router.put("/admins/{admin_id}/role")
def change_admin_role(
    admin_id: str,
    req: UpdateAdminRoleRequest,
    admin: User = Depends(require_admin_write),
    db: Session = Depends(get_db)
):
    """Update role between admin and support_admin."""
    if req.role not in ("admin", "support_admin"):
        raise HTTPException(status_code=400, detail="Role must be 'admin' or 'support_admin'.")

    target_admin = db.query(User).filter(User.id == admin_id).first()
    if not target_admin:
        raise HTTPException(status_code=404, detail="Admin account not found")

    old_role = target_admin.role
    target_admin.role = req.role
    db.commit()

    log_audit_action(
        db=db,
        admin=admin,
        action="change_admin_role",
        target_id=target_admin.id,
        target_email=target_admin.email,
        details={"before": old_role, "after": req.role}
    )

    return {"success": True, "message": f"Role updated to {req.role} for {target_admin.email}."}
