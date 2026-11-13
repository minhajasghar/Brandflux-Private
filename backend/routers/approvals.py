from sqlalchemy import func
import uuid
import logging
logger = logging.getLogger("approvals_router")
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from datetime import datetime
from typing import List, Dict, Any, Optional
from pydantic import BaseModel

from database import get_db
from models.models import (
    User, Brand, Post, PlatformCopy, ScheduledPost, PostImage,
    BrandMember, PostVersion, PostApproval
)
from middleware.auth import get_current_user
from services.brand_service import resolve_user_brand, get_user_brand_role
from services.approval_service import (
    submit_post_for_approval,
    approve_post,
    edit_and_approve_post,
    request_changes_post,
    reject_post,
    get_post_bundle,
    create_post_snapshot,
    compute_content_hash,
    log_approval_audit
)

router = APIRouter(prefix="/approvals", tags=["approvals"])


# ─── Request Schemas ─────────────────────────────────────────────────────────

class ApproveRequest(BaseModel):
    notes: Optional[str] = None

class EditAndApproveRequest(BaseModel):
    captions: Dict[str, str]
    hashtags: Optional[Dict[str, Any]] = None
    image_url: Optional[str] = None
    scheduled_time: Optional[datetime] = None
    notes: Optional[str] = None

class RequestChangesRequest(BaseModel):
    comment: str
    chips: Optional[List[str]] = []

class RejectRequest(BaseModel):
    reason: str

class ResubmitRequest(BaseModel):
    captions: Optional[Dict[str, str]] = None
    hashtags: Optional[Dict[str, Any]] = None
    image_url: Optional[str] = None
    scheduled_time: Optional[datetime] = None
    note: Optional[str] = None


# ─── Inbox Endpoint ──────────────────────────────────────────────────────────

@router.get("/inbox")
def get_approvals_inbox(
    status: str = Query("waiting", description="waiting | changes_requested | approved | all"),
    brand_id: Optional[str] = Query(None),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Retrieve approval inbox posts:
    - Tabs: Waiting (in_review), Changes requested, Approved, All.
    - Role is per brand: an approver sees only their assigned brand.
    - Creator also sees their brand's approval posts.
    """
    brand = resolve_user_brand(user, db, brand_id=brand_id)
    if not brand:
        return {"posts": [], "counts": {"waiting": 0, "changes_requested": 0, "approved": 0, "all": 0}}

    user_role = get_user_brand_role(user, brand.id, db)
    if not user_role:
        raise HTTPException(status_code=403, detail="You do not have access to this brand's approvals.")

    query = db.query(Post).filter(Post.brand_id == brand.id)

    # Status mapping
    status_filter = status.lower().strip()
    if status_filter == "waiting":
        query = query.filter(Post.status.in_(["in_review", "pending_approval"]))
    elif status_filter == "changes_requested":
        query = query.filter(Post.status == "changes_requested")
    elif status_filter == "approved":
        query = query.filter(Post.status == "approved")

    posts = query.order_by(Post.created_at.desc()).limit(100).all()

    # Calculate badge counts
    waiting_cnt = db.query(Post).filter(Post.brand_id == brand.id, Post.status.in_(["in_review", "pending_approval"])).count()
    changes_cnt = db.query(Post).filter(Post.brand_id == brand.id, Post.status == "changes_requested").count()
    approved_cnt = db.query(Post).filter(Post.brand_id == brand.id, Post.status == "approved").count()
    total_cnt = db.query(Post).filter(Post.brand_id == brand.id).count()

    serialized = []
    for p in posts:
        # Get thumbnail and scheduled time
        sched = db.query(ScheduledPost).filter(ScheduledPost.post_id == p.id).first()
        copies = db.query(PlatformCopy).filter(PlatformCopy.post_id == p.id).all()
        platforms = [c.platform for c in copies]

        thumb = None
        for c in copies:
            if c.image_url:
                thumb = c.image_url
                break
        if not thumb:
            sel_img = db.query(PostImage).filter(PostImage.post_id == p.id, PostImage.is_selected == True).first()
            if sel_img:
                thumb = sel_img.image_url
            else:
                first_img = db.query(PostImage).filter(PostImage.post_id == p.id).first()
                if first_img:
                    thumb = first_img.image_url

        latest_ver = db.query(PostVersion).filter(PostVersion.post_id == p.id).order_by(PostVersion.version_number.desc()).first()

        creator_user = p.user or db.query(User).filter(User.id == brand.user_id).first()

        serialized.append({
            "id": p.id,
            "title": p.title,
            "topic": p.topic,
            "status": p.status,
            "created_at": p.created_at.isoformat() if p.created_at else None,
            "scheduled_time": sched.scheduled_at.isoformat() if (sched and sched.scheduled_at) else None,
            "thumbnail_url": thumb,
            "platforms": platforms,
            "creator_name": creator_user.full_name or creator_user.email if creator_user else "Creator",
            "version_number": latest_ver.version_number if latest_ver else 1,
            "content_hash": latest_ver.content_hash if latest_ver else None,
            "decision": latest_ver.decision if latest_ver else None,
            "decision_notes": latest_ver.decision_notes if latest_ver else None,
            "changes_requested_chips": latest_ver.changes_requested_chips if latest_ver else []
        })

    return {
        "brand_id": brand.id,
        "brand_name": brand.name or brand.business_name,
        "user_role": user_role,
        "require_approval": bool(brand.require_approval),
        "approval_mode": brand.approval_mode or "anyone",
        "counts": {
            "waiting": waiting_cnt,
            "changes_requested": changes_cnt,
            "approved": approved_cnt,
            "all": total_cnt
        },
        "posts": serialized
    }


# ─── Approver Accounts Management from Approvals Section ────────────────────

class CreateApproverAccountRequest(BaseModel):
    brand_id: Optional[str] = None
    email: str
    full_name: Optional[str] = None
    password: Optional[str] = None  # If provided, creates active approver user immediately

@router.get("/team")
def get_approvals_team(
    brand_id: Optional[str] = Query(None),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Retrieve current approver accounts and team approval settings for the brand.
    Accessible from the Approval section.
    """
    brand = resolve_user_brand(user, db, brand_id=brand_id)
    if not brand:
        raise HTTPException(status_code=404, detail="No active brand found.")

    user_role = get_user_brand_role(user, brand.id, db)
    if not user_role:
        raise HTTPException(status_code=403, detail="You do not have access to this brand's team.")

    from services.plan_service import get_plan
    plan = get_plan(db, user.plan)
    max_approvers = 999999 if getattr(user, "is_non_payment", False) else getattr(plan, "max_approvers", 1)

    members = db.query(BrandMember).filter(
        BrandMember.brand_id == brand.id
    ).order_by(BrandMember.created_at.asc()).all()

    serialized_members = []
    active_count = 0
    for m in members:
        if m.role == "approver" and m.status == "active":
            active_count += 1

        member_email = m.invited_email
        member_name = None
        if m.user:
            member_email = m.user.email
            member_name = m.user.full_name

        serialized_members.append({
            "id": m.id,
            "user_id": m.user_id,
            "email": member_email,
            "name": member_name or (member_email.split("@")[0] if member_email else "Member"),
            "role": m.role,
            "status": m.status,
            "invitation_token": m.invitation_token if user_role in ("creator", "admin") else None,
            "invitation_expires_at": m.invitation_expires_at.isoformat() if m.invitation_expires_at else None,
            "accepted_at": m.accepted_at.isoformat() if m.accepted_at else None,
            "created_at": m.created_at.isoformat() if m.created_at else None
        })

    return {
        "brand_id": brand.id,
        "brand_name": brand.name or brand.business_name,
        "user_role": user_role,
        "plan": user.plan,
        "plan_limit": max_approvers,
        "active_approvers_count": active_count,
        "require_approval": bool(brand.require_approval),
        "approval_mode": brand.approval_mode or "anyone",
        "approval_deadline_hours": brand.approval_deadline_hours or 24,
        "approval_reminder_hours": brand.approval_reminder_hours or 6,
        "members": serialized_members
    }

@router.post("/team/create")
async def create_approver_account(
    req: CreateApproverAccountRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Directly create or invite an approver account from the Approval section.
    If password is provided, creates a fully active login account immediately.
    If password is omitted, generates a 7-day secure invitation token and sends an invite.
    """
    brand = resolve_user_brand(user, db, brand_id=req.brand_id)
    if not brand:
        raise HTTPException(status_code=404, detail="Brand not found")

    user_role = get_user_brand_role(user, brand.id, db)
    if user_role not in ("creator", "admin"):
        raise HTTPException(status_code=403, detail="Only brand creators can create or invite approver accounts.")

    # 1. Enforce Plan Limits
    from services.plan_service import get_plan
    plan = get_plan(db, user.plan)
    max_approvers = 999999 if getattr(user, "is_non_payment", False) else getattr(plan, "max_approvers", 1)

    current_count = db.query(BrandMember).filter(
        BrandMember.brand_id == brand.id,
        BrandMember.role == "approver",
        BrandMember.status.in_(["active", "invited"])
    ).count()

    if current_count >= max_approvers:
        raise HTTPException(
            status_code=400,
            detail=f"Your {user.plan.capitalize()} plan allows up to {max_approvers} approver(s). Upgrade to invite more team members."
        )

    clean_email = req.email.strip().lower()
    if not clean_email or "@" not in clean_email:
        raise HTTPException(status_code=400, detail="A valid email address is required.")

    # 2. Check for existing active membership for this brand
    existing_member = db.query(BrandMember).filter(
        BrandMember.brand_id == brand.id,
        (BrandMember.invited_email == clean_email) | (BrandMember.user_id.in_(
            db.query(User.id).filter(func.lower(User.email) == clean_email)
        ))
    ).first()

    if existing_member and existing_member.status == "active":
        raise HTTPException(status_code=400, detail=f"{clean_email} is already an active approver for this brand.")

    from services.auth_service import hash_password
    import secrets
    from datetime import timedelta
    from config import APP_BASE_URL
    from services.email.email_service import send_email

    now = datetime.utcnow()
    existing_user = db.query(User).filter(func.lower(User.email) == clean_email).first()

    # Case A: Password provided -> create/activate active user account immediately!
    if req.password and req.password.strip():
        pwd = req.password.strip()
        if len(pwd) < 6:
            raise HTTPException(status_code=400, detail="Password must be at least 6 characters.")

        if existing_user:
            existing_user.password_hash = hash_password(pwd)
            existing_user.is_approved = True
            existing_user.is_verified = True
            existing_user.active_brand_id = brand.id
            target_user = existing_user

            # Clean up unonboarded dummy brand from standalone signup
            dummy_brands = db.query(Brand).filter(
                Brand.user_id == existing_user.id,
                Brand.id != brand.id,
                Brand.onboarding_complete == False
            ).all()
            for db_item in dummy_brands:
                try:
                    db.delete(db_item)
                except Exception:
                    pass
        else:
            target_user = User(
                id=str(uuid.uuid4()),
                email=clean_email,
                password_hash=hash_password(pwd),
                full_name=req.full_name or clean_email.split("@")[0].capitalize(),
                role="user",
                plan="starter",
                is_approved=True,
                is_verified=True,
                welcome_sent=True,
                active_brand_id=brand.id
            )
            db.add(target_user)
            db.flush()

        if existing_member:
            existing_member.user_id = target_user.id
            existing_member.status = "active"
            existing_member.invitation_token = None
            existing_member.accepted_at = now
            member = existing_member
        else:
            member = BrandMember(
                id=str(uuid.uuid4()),
                brand_id=brand.id,
                user_id=target_user.id,
                role="approver",
                status="active",
                invited_email=clean_email,
                invited_by_user_id=user.id,
                accepted_at=now
            )
            db.add(member)

        db.commit()

        log_approval_audit(
            db=db,
            user=user,
            action="approver_account_created_direct",
            target_id=member.id,
            target_type="brand_member",
            details={"email": clean_email, "brand_id": brand.id, "login_ready": True}
        )

        return {
            "status": "success",
            "message": f"Approver account successfully created for {clean_email}! They can now log in directly.",
            "member_id": member.id,
            "email": clean_email,
            "account_status": "active",
            "login_ready": True
        }

    # Case B: Password omitted -> send invitation link
    invitation_token = secrets.token_urlsafe(32)
    invitation_expires_at = now + timedelta(days=7)

    if existing_member:
        existing_member.status = "invited"
        existing_member.invitation_token = invitation_token
        existing_member.invitation_expires_at = invitation_expires_at
        existing_member.invited_email = clean_email
        existing_member.invited_by_user_id = user.id
        member = existing_member
    else:
        member = BrandMember(
            id=str(uuid.uuid4()),
            brand_id=brand.id,
            user_id=existing_user.id if existing_user else None,
            role="approver",
            status="invited",
            invited_email=clean_email,
            invitation_token=invitation_token,
            invitation_expires_at=invitation_expires_at,
            invited_by_user_id=user.id
        )
        db.add(member)

    db.commit()

    invite_url = f"{APP_BASE_URL}/invite/accept?token={invitation_token}"

    try:
        send_email(
            to=clean_email,
            template="team_invite",
            data={
                "inviter_name": user.full_name or user.email,
                "brand_name": brand.name or brand.business_name,
                "invite_url": invite_url
            },
            user_id=user.id,
            brand_id=brand.id,
            idempotency_key=f"invite_{member.id}_{now.strftime('%Y%m%d%H%M')}"
        )
    except Exception as em_err:
        logger.warning(f"Email delivery notice for invite: {em_err}")

    log_approval_audit(
        db=db,
        user=user,
        action="approver_invited",
        target_id=member.id,
        target_type="brand_member",
        details={"invited_email": clean_email, "brand_id": brand.id}
    )

    return {
        "status": "success",
        "message": f"Invitation link generated and sent to {clean_email}.",
        "member_id": member.id,
        "email": clean_email,
        "invite_url": invite_url,
        "account_status": "invited",
        "login_ready": False
    }

@router.delete("/team/{member_id}")
def remove_approver_member(
    member_id: str,
    brand_id: Optional[str] = Query(None),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Remove an approver member from the brand."""
    brand = resolve_user_brand(user, db, brand_id=brand_id)
    if not brand:
        raise HTTPException(status_code=404, detail="Brand not found")

    user_role = get_user_brand_role(user, brand.id, db)
    if user_role not in ("creator", "admin"):
        raise HTTPException(status_code=403, detail="Only brand creators can remove approvers.")

    member = db.query(BrandMember).filter(BrandMember.id == member_id, BrandMember.brand_id == brand.id).first()
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")

    member.status = "removed"
    member.invitation_token = None
    if member.user_id:
        removed_u = db.query(User).filter(User.id == member.user_id).first()
        if removed_u and removed_u.active_brand_id == brand.id:
            removed_u.active_brand_id = None
    db.commit()

    log_approval_audit(
        db=db,
        user=user,
        action="approver_removed",
        target_id=member.id,
        target_type="brand_member",
        details={"member_id": member_id, "brand_id": brand.id}
    )

    return {"status": "success", "message": "Approver removed from brand."}


# ─── Detail & Review Screen ──────────────────────────────────────────────────

@router.get("/{post_id}")
def get_approval_post_detail(
    post_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Detailed review screen:
    - Per-platform previews with tailored copy
    - Existing visual variants (can choose among them, cannot generate new)
    - Version history & visual diff between current and previous snapshot
    - Comments thread
    - Action authorization flags
    """
    post = db.query(Post).filter(Post.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")

    brand = db.query(Brand).filter(Brand.id == post.brand_id).first()
    if not brand:
        raise HTTPException(status_code=404, detail="Brand not found")

    user_role = get_user_brand_role(user, brand.id, db)
    if not user_role:
        raise HTTPException(status_code=403, detail="You do not have access to this brand's post.")

    is_creator = (user.id == post.user_id or user.id == brand.user_id or user_role == "creator")
    is_approver = (user_role == "approver" and not is_creator)

    # Platform copies
    copies = db.query(PlatformCopy).filter(PlatformCopy.post_id == post.id).all()
    serialized_copies = []
    for c in copies:
        serialized_copies.append({
            "id": c.id,
            "platform": c.platform,
            "caption": c.caption or "",
            "hashtags": c.hashtags or [],
            "image_url": c.image_url,
            "aspect_ratio": c.aspect_ratio or "1:1",
            "status": c.status
        })

    # Visual variants
    images = db.query(PostImage).filter(PostImage.post_id == post.id).all()
    serialized_images = [
        {"id": img.id, "image_url": img.image_url, "is_selected": img.is_selected}
        for img in images
    ]

    # Versions
    versions = db.query(PostVersion).filter(PostVersion.post_id == post.id).order_by(PostVersion.version_number.asc()).all()
    serialized_versions = []
    for v in versions:
        sub_user = v.submitted_by or db.query(User).filter(User.id == v.submitted_by_id).first()
        dec_user = v.decision_by or db.query(User).filter(User.id == v.decision_by_id).first()
        serialized_versions.append({
            "id": v.id,
            "version_number": v.version_number,
            "content_hash": v.content_hash,
            "status": v.status,
            "decision": v.decision,
            "decision_notes": v.decision_notes,
            "changes_requested_chips": v.changes_requested_chips or [],
            "submitted_by_name": sub_user.full_name or sub_user.email if sub_user else "Team Member",
            "decision_by_name": dec_user.full_name or dec_user.email if dec_user else None,
            "created_at": v.created_at.isoformat() if v.created_at else None,
            "scheduled_time": v.scheduled_time.isoformat() if v.scheduled_time else None,
            "image_url": v.image_url,
            "captions": v.captions or {},
            "hashtags": v.hashtags or {}
        })

    # Version Diff (compares latest vs previous)
    diff = {"has_diff": False, "captions": {}, "hashtags": False, "image": False, "time": False}
    if len(versions) >= 2:
        curr = versions[-1]
        prev = versions[-2]
        diff["has_diff"] = True
        diff["image"] = (curr.image_url != prev.image_url)
        diff["time"] = (curr.scheduled_time != prev.scheduled_time)
        diff["hashtags"] = (curr.hashtags != prev.hashtags)

        curr_caps = curr.captions or {}
        prev_caps = prev.captions or {}
        for plat in set(list(curr_caps.keys()) + list(prev_caps.keys())):
            c_text = curr_caps.get(plat, "")
            p_text = prev_caps.get(plat, "")
            if c_text != p_text:
                diff["captions"][plat] = {
                    "previous": p_text,
                    "current": c_text
                }

    sched = db.query(ScheduledPost).filter(ScheduledPost.post_id == post.id).first()
    creator_user = post.user or db.query(User).filter(User.id == brand.user_id).first()

    return {
        "post": {
            "id": post.id,
            "title": post.title,
            "topic": post.topic,
            "status": post.status,
            "approved_version_hash": post.approved_version_hash,
            "created_at": post.created_at.isoformat() if post.created_at else None,
            "scheduled_time": sched.scheduled_at.isoformat() if (sched and sched.scheduled_at) else None,
            "creator_name": creator_user.full_name or creator_user.email if creator_user else "Creator",
            "creator_email": creator_user.email if creator_user else None
        },
        "brand": {
            "id": brand.id,
            "name": brand.name or brand.business_name,
            "require_approval": bool(brand.require_approval),
            "approval_mode": brand.approval_mode or "anyone"
        },
        "platform_copies": serialized_copies,
        "image_variants": serialized_images,
        "versions": serialized_versions,
        "diff": diff,
        "permissions": {
            "is_creator": is_creator,
            "is_approver": is_approver,
            "can_approve": (is_approver and not is_creator) or (not brand.require_approval),
            "can_request_changes": (is_approver and not is_creator),
            "can_reject": (is_approver and not is_creator),
            "can_resubmit": (is_creator and post.status in ("changes_requested", "rejected", "draft")),
            "can_submit": (is_creator and post.status in ("draft", "rejected")),
            "can_publish": (is_creator and (post.status == "approved" or not brand.require_approval))
        }
    }


# ─── Actions Endpoints ───────────────────────────────────────────────────────

@router.post("/{post_id}/submit")
async def submit_for_approval_endpoint(
    post_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Creator submits draft for team approval."""
    version = await submit_post_for_approval(post_id=post_id, user=user, db=db)
    return {"status": "success", "message": "Post submitted for approval.", "version": version.version_number}


@router.post("/{post_id}/approve")
async def approve_post_endpoint(
    post_id: str,
    req: ApproveRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Approver approves post."""
    result = await approve_post(post_id=post_id, user=user, notes=req.notes, db=db)
    return result


@router.post("/{post_id}/edit-and-approve")
async def edit_and_approve_endpoint(
    post_id: str,
    req: EditAndApproveRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Approver tweaks post content and approves."""
    result = await edit_and_approve_post(
        post_id=post_id,
        user=user,
        updated_captions=req.captions,
        updated_hashtags=req.hashtags or {},
        updated_image_url=req.image_url,
        updated_time=req.scheduled_time,
        notes=req.notes,
        db=db
    )
    return result


@router.post("/{post_id}/request-changes")
async def request_changes_endpoint(
    post_id: str,
    req: RequestChangesRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Approver requests revisions with required comment and optional chips."""
    result = await request_changes_post(
        post_id=post_id,
        user=user,
        comment=req.comment,
        chips=req.chips or [],
        db=db
    )
    return result


@router.post("/{post_id}/reject")
async def reject_post_endpoint(
    post_id: str,
    req: RejectRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Approver rejects post with required reason."""
    result = await reject_post(
        post_id=post_id,
        user=user,
        reason=req.reason,
        db=db
    )
    return result


@router.post("/{post_id}/resubmit")
async def resubmit_post_endpoint(
    post_id: str,
    req: ResubmitRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Creator resubmits updated post ('Fix & resubmit'):
    - Applies revised captions/hashtags/image/time
    - Creates a new snapshot version
    - Sets post status to 'in_review'
    - Notifies approvers
    """
    post = db.query(Post).filter(Post.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")

    brand = db.query(Brand).filter(Brand.id == post.brand_id).first()
    if not brand:
        raise HTTPException(status_code=404, detail="Brand not found")

    user_role = get_user_brand_role(user, brand.id, db)
    if user_role not in ("creator", "admin") and user.id != brand.user_id:
        raise HTTPException(status_code=403, detail="Only the brand creator can modify and resubmit posts.")

    # Update copies if provided
    copies = db.query(PlatformCopy).filter(PlatformCopy.post_id == post.id).all()
    if req.captions:
        for c in copies:
            if c.platform in req.captions:
                c.caption = req.captions[c.platform]
            if req.hashtags and c.platform in req.hashtags:
                c.hashtags = req.hashtags[c.platform]
            if req.image_url:
                c.image_url = req.image_url
            if req.scheduled_time:
                c.scheduled_at = req.scheduled_time
            c.status = "in_review"

    sched = db.query(ScheduledPost).filter(ScheduledPost.post_id == post.id).first()
    if sched:
        if req.image_url:
            sched.media_url = req.image_url
        if req.scheduled_time:
            sched.scheduled_at = req.scheduled_time
        sched.status = "In Review"
        sched.approved_version_hash = None

    db.commit()

    version = await submit_post_for_approval(post_id=post.id, user=user, db=db, note=req.note or "Fix & Resubmit")
    return {"status": "success", "message": "Post resubmitted for approval.", "version": version.version_number}


@router.post("/{post_id}/publish-now")
async def publish_approved_post_now(
    post_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Publish an approved post immediately to all connected platforms."""
    post = db.query(Post).filter(Post.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")

    brand = db.query(Brand).filter(Brand.id == post.brand_id).first()
    if not brand:
        raise HTTPException(status_code=404, detail="Brand not found")

    user_role = get_user_brand_role(user, brand.id, db)
    if user_role not in ("creator", "admin") and user.id != brand.user_id:
        raise HTTPException(status_code=403, detail="Only the brand creator can modify and resubmit posts.")

    user_role = get_user_brand_role(user, brand.id, db)
    if not user_role:
        raise HTTPException(status_code=403, detail="You do not have access to this brand.")

    # Find all platform copies for this post
    copies = db.query(PlatformCopy).filter(PlatformCopy.post_id == post.id).all()
    if not copies:
        raise HTTPException(status_code=400, detail="No platform copies found for this post.")

    from routers.content import publish_platform_copy
    from services.publishing.publish_service import format_platform_label
    results = []
    errors = []
    skipped_disconnected = []
    disconnected_messages = []

    for copy in copies:
        label = format_platform_label(copy.platform)
        try:
            res = await publish_platform_copy(copy_id=copy.id, force=True, user=user, db=db)
            results.append(res)
        except HTTPException as he:
            detail = he.detail if isinstance(he.detail, dict) else {"message": str(he.detail)}
            if detail.get("status") == "needs_reconnect" or "not connected" in str(detail.get("message", "")).lower() or detail.get("error_code") == "ACCOUNT_DISCONNECTED":
                if label not in skipped_disconnected:
                    skipped_disconnected.append(label)
                msg = detail.get("message") or f"Your {label} account is not connected. Please connect your {label} account before publishing."
                if msg not in disconnected_messages:
                    disconnected_messages.append(msg)
            errors.append({"platform": copy.platform, **detail})
        except Exception as e:
            errors.append({"platform": copy.platform, "message": str(e), "status": "failed"})

    published_platforms = [format_platform_label(r.get("platform", "")) for r in results if r.get("platform")]

    # Mark post status as published if at least one succeeded
    if published_platforms:
        post.status = "published"
        db.commit()

    return {
        "success": len(results) > 0,
        "published_count": len(results),
        "published_platforms": published_platforms,
        "skipped_disconnected": skipped_disconnected,
        "disconnected_messages": disconnected_messages,
        "results": results,
        "errors": errors
    }

