import json
import hashlib
import logging
from datetime import datetime, timedelta
from typing import Dict, Any, Optional, List, Tuple
from sqlalchemy.orm import Session
from fastapi import HTTPException

from models.models import (
    User, Brand, Post, PlatformCopy, ScheduledPost, PostImage,
    BrandMember, PostVersion, PostApproval, AuditLog, Plan
)
from services.email.email_service import send_email

logger = logging.getLogger("approval_service")


def compute_content_hash(
    captions: Optional[Dict[str, Any]],
    hashtags: Optional[Dict[str, Any]],
    image_url: Optional[str],
    scheduled_time: Optional[datetime]
) -> str:
    """
    Deterministic SHA256 content hash of post snapshot.
    Ensures that any change in platform captions, hashtags, image URL, or scheduled time
    generates a completely different hash.
    """
    norm_captions = {str(k).lower(): str(v or "").strip() for k, v in sorted((captions or {}).items())}
    
    norm_hashtags = {}
    for k, v in sorted((hashtags or {}).items()):
        if isinstance(v, list):
            norm_hashtags[str(k).lower()] = sorted([str(tag).strip() for tag in v if tag])
        else:
            norm_hashtags[str(k).lower()] = [str(v).strip()] if v else []

    # Normalize datetime by truncating microseconds to maintain consistent hashes across DB storage
    time_str = scheduled_time.replace(microsecond=0).isoformat() if scheduled_time else ""
    norm_image = (image_url or "").strip()

    payload = {
        "captions": norm_captions,
        "hashtags": norm_hashtags,
        "image_url": norm_image,
        "scheduled_time": time_str
    }
    raw = json.dumps(payload, sort_keys=True, ensure_ascii=False)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def log_approval_audit(
    db: Session,
    user: User,
    action: str,
    target_id: Optional[str] = None,
    target_type: str = "post",
    details: Optional[Dict[str, Any]] = None
) -> AuditLog:
    """Record an immutable audit log entry for team/approval activities."""
    entry = AuditLog(
        action=action,
        admin_id=user.id,
        admin_email=user.email,
        target_type=target_type,
        target_id=target_id,
        target_email=user.email,
        details=details or {}
    )
    db.add(entry)
    db.commit()
    return entry


def get_active_approvers(brand_id: str, db: Session) -> List[User]:
    """Retrieve all users who have an active approver role for the brand."""
    members = db.query(BrandMember).filter(
        BrandMember.brand_id == brand_id,
        BrandMember.role == "approver",
        BrandMember.status == "active"
    ).all()
    user_ids = [m.user_id for m in members if m.user_id]
    if not user_ids:
        return []
    return db.query(User).filter(User.id.in_(user_ids)).all()


def get_post_bundle(post_id: str, db: Session) -> Tuple[Post, Optional[ScheduledPost], Dict[str, str], Dict[str, list], Optional[str], Optional[datetime]]:
    """Helper to extract current captions, hashtags, image, and time from a Post and its PlatformCopies."""
    post = db.query(Post).filter(Post.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")

    sched = db.query(ScheduledPost).filter(ScheduledPost.post_id == post.id).first()
    
    captions = {}
    hashtags = {}
    image_url = None
    scheduled_time = sched.scheduled_at if sched else None

    # Platform copies
    copies = db.query(PlatformCopy).filter(PlatformCopy.post_id == post.id).all()
    for c in copies:
        captions[c.platform] = c.caption or ""
        hashtags[c.platform] = c.hashtags or []
        if not image_url and c.image_url:
            image_url = c.image_url
        if not scheduled_time and c.scheduled_at:
            scheduled_time = c.scheduled_at

    # If no copy image, try selected PostImage
    if not image_url:
        sel_img = db.query(PostImage).filter(PostImage.post_id == post.id, PostImage.is_selected == True).first()
        if sel_img:
            image_url = sel_img.image_url
        else:
            first_img = db.query(PostImage).filter(PostImage.post_id == post.id).first()
            if first_img:
                image_url = first_img.image_url

    if not image_url and sched and sched.media_url:
        image_url = sched.media_url

    return post, sched, captions, hashtags, image_url, scheduled_time


def create_post_snapshot(
    post_id: str,
    submitted_by: User,
    db: Session,
    captions: Optional[Dict[str, str]] = None,
    hashtags: Optional[Dict[str, Any]] = None,
    image_url: Optional[str] = None,
    scheduled_time: Optional[datetime] = None,
    note: Optional[str] = None
) -> PostVersion:
    """Create a new version snapshot for a post."""
    post, sched, cur_captions, cur_hashtags, cur_image, cur_time = get_post_bundle(post_id, db)

    final_captions = captions if captions is not None else cur_captions
    final_hashtags = hashtags if hashtags is not None else cur_hashtags
    final_image = image_url if image_url is not None else cur_image
    final_time = scheduled_time if scheduled_time is not None else cur_time

    # Find highest version number
    last_ver = db.query(PostVersion).filter(PostVersion.post_id == post.id).order_by(PostVersion.version_number.desc()).first()
    ver_num = (last_ver.version_number + 1) if last_ver else 1

    content_hash = compute_content_hash(final_captions, final_hashtags, final_image, final_time)

    version = PostVersion(
        post_id=post.id,
        scheduled_post_id=sched.id if sched else None,
        brand_id=post.brand_id,
        version_number=ver_num,
        submitted_by_id=submitted_by.id,
        captions=final_captions,
        hashtags=final_hashtags,
        image_url=final_image,
        scheduled_time=final_time,
        content_hash=content_hash,
        status="in_review",
        decision_notes=note
    )
    db.add(version)
    db.commit()
    db.refresh(version)

    return version


async def submit_post_for_approval(
    post_id: str,
    user: User,
    db: Session,
    note: Optional[str] = None
) -> PostVersion:
    """
    Submit a post for approver review:
    - Enforces brand ownership/creator role.
    - Captures snapshot version with content hash.
    - Sets post & scheduled post status to 'in_review'.
    - Dispatches notifications to all active approvers.
    - Records audit log.
    """
    post, sched, captions, hashtags, image_url, scheduled_time = get_post_bundle(post_id, db)
    brand = db.query(Brand).filter(Brand.id == post.brand_id).first()
    if not brand:
        raise HTTPException(status_code=404, detail="Brand not found")

    version = create_post_snapshot(
        post_id=post.id,
        submitted_by=user,
        db=db,
        captions=captions,
        hashtags=hashtags,
        image_url=image_url,
        scheduled_time=scheduled_time,
        note=note
    )

    post.status = "in_review"
    post.approved_version_hash = None
    if sched:
        sched.status = "In Review"
        sched.approved_version_hash = None

    # Update copies status to in_review
    copies = db.query(PlatformCopy).filter(PlatformCopy.post_id == post.id).all()
    for c in copies:
        if c.status not in ("posted", "publishing"):
            c.status = "in_review"

    db.commit()

    # Notify all active approvers
    approvers = get_active_approvers(brand.id, db)
    for approver in approvers:
        try:
            await send_email(
                to=approver.email,
                template="post_submitted",
                data={
                    "brand_name": brand.name or brand.business_name or "Your Brand",
                    "title": post.title,
                    "creator_name": user.full_name or user.email,
                    "review_url": f"/approvals/{post.id}",
                    "scheduled_time": scheduled_time.strftime("%A, %b %d at %I:%M %p") if scheduled_time else "Unscheduled",
                    "post_id": post.id
                },
                user_id=approver.id,
                brand_id=brand.id,
                idempotency_key=f"sub_{post.id}_v{version.version_number}_{approver.id}",
                db=db
            )
        except Exception as e:
            logger.warning(f"Error sending submit notification to {approver.email}: {e}")

    log_approval_audit(
        db=db,
        user=user,
        action="post_submitted_for_approval",
        target_id=post.id,
        details={
            "version": version.version_number,
            "hash": version.content_hash,
            "approvers_count": len(approvers)
        }
    )

    return version


async def approve_post(
    post_id: str,
    user: User,
    notes: Optional[str],
    db: Session
) -> Dict[str, Any]:
    """
    Approve post by an active approver:
    - Rule: The creator cannot approve their own post when approval is required.
    - Rule: Any one vs All modes.
    - Lock hash: Approved post hash is stored.
    """
    post, sched, captions, hashtags, image_url, scheduled_time = get_post_bundle(post_id, db)
    brand = db.query(Brand).filter(Brand.id == post.brand_id).first()
    if not brand:
        raise HTTPException(status_code=404, detail="Brand not found")

    # 1. Rule: Block creator self-approval when approval required
    if brand.require_approval:
        if user.id == post.user_id or user.id == brand.user_id:
            raise HTTPException(
                status_code=403,
                detail="Self-approval is forbidden. An approver must review and approve this post."
            )
        # Check active approver membership
        member = db.query(BrandMember).filter(
            BrandMember.brand_id == brand.id,
            BrandMember.user_id == user.id,
            BrandMember.role == "approver",
            BrandMember.status == "active"
        ).first()
        if not member:
            raise HTTPException(status_code=403, detail="Only active approvers can approve posts.")

    latest_version = db.query(PostVersion).filter(PostVersion.post_id == post.id).order_by(PostVersion.version_number.desc()).first()
    if not latest_version:
        latest_version = create_post_snapshot(post.id, user, db)

    # Record individual approver decision in PostApproval
    approval_rec = PostApproval(
        post_version_id=latest_version.id,
        approver_id=user.id,
        decision="approved",
        notes=notes
    )
    db.add(approval_rec)
    db.commit()

    active_approvers = get_active_approvers(brand.id, db)
    total_approvers = len(active_approvers)

    should_mark_approved = False
    if brand.approval_mode == "all" and total_approvers > 1:
        # Check if all active approvers have approved this version
        distinct_approved_ids = db.query(PostApproval.approver_id).filter(
            PostApproval.post_version_id == latest_version.id,
            PostApproval.decision == "approved"
        ).distinct().all()
        approved_count = len(distinct_approved_ids)
        if approved_count >= total_approvers:
            should_mark_approved = True
        else:
            should_mark_approved = False
    else:
        # "anyone" mode (or solo / 1 approver)
        should_mark_approved = True

    if should_mark_approved:
        latest_version.status = "approved"
        latest_version.decision = "approved"
        latest_version.decision_by_id = user.id
        latest_version.decision_at = datetime.utcnow()
        latest_version.decision_notes = notes

        post.status = "approved"
        post.approved_version_hash = latest_version.content_hash

        if sched:
            sched.status = "Scheduled" if sched.scheduled_at else "Draft"
            sched.approved_version_hash = latest_version.content_hash

        copies = db.query(PlatformCopy).filter(PlatformCopy.post_id == post.id).all()
        for c in copies:
            if c.status not in ("posted", "publishing"):
                c.status = "approved"

        db.commit()

        # Notify creator that post is fully approved
        creator = db.query(User).filter(User.id == post.user_id).first() or db.query(User).filter(User.id == brand.user_id).first()
        if creator:
            try:
                await send_email(
                    to=creator.email,
                    template="post_approved",
                    data={
                        "brand_name": brand.name or brand.business_name or "Your Brand",
                        "title": post.title,
                        "approver_name": user.full_name or user.email,
                        "post_url": f"/calendar?post_id={post.id}",
                        "is_edited": False,
                        "post_id": post.id
                    },
                    user_id=creator.id,
                    brand_id=brand.id,
                    idempotency_key=f"appr_{post.id}_v{latest_version.version_number}",
                    db=db
                )
            except Exception as e:
                logger.warning(f"Error sending approved email: {e}")

        log_approval_audit(
            db=db,
            user=user,
            action="post_approved",
            target_id=post.id,
            details={"version": latest_version.version_number, "hash": latest_version.content_hash}
        )

        return {"status": "approved", "fully_approved": True, "version": latest_version.version_number}
    else:
        # Partial approval in "All" mode
        db.commit()
        log_approval_audit(
            db=db,
            user=user,
            action="post_partially_approved",
            target_id=post.id,
            details={"version": latest_version.version_number, "approved_by": user.email}
        )
        return {"status": "in_review", "fully_approved": False, "version": latest_version.version_number, "message": "Approval recorded. Awaiting other approvers."}


async def edit_and_approve_post(
    post_id: str,
    user: User,
    updated_captions: Dict[str, str],
    updated_hashtags: Dict[str, Any],
    updated_image_url: Optional[str],
    updated_time: Optional[datetime],
    notes: Optional[str],
    db: Session
) -> Dict[str, Any]:
    """
    Approver tweaks copy/image/time, creating a new approved snapshot.
    Creator is alerted with 'Edit & Approved'.
    """
    post, sched, cur_captions, cur_hashtags, cur_image, cur_time = get_post_bundle(post_id, db)
    brand = db.query(Brand).filter(Brand.id == post.brand_id).first()
    if not brand:
        raise HTTPException(status_code=404, detail="Brand not found")

    # Block creator self-approval
    if brand.require_approval:
        if user.id == post.user_id or user.id == brand.user_id:
            raise HTTPException(status_code=403, detail="Self-approval is forbidden.")
        member = db.query(BrandMember).filter(
            BrandMember.brand_id == brand.id,
            BrandMember.user_id == user.id,
            BrandMember.role == "approver",
            BrandMember.status == "active"
        ).first()
        if not member:
            raise HTTPException(status_code=403, detail="Only active approvers can edit and approve.")

    # 1. Update PlatformCopies with new text & image
    copies = db.query(PlatformCopy).filter(PlatformCopy.post_id == post.id).all()
    for c in copies:
        if c.platform in updated_captions:
            c.caption = updated_captions[c.platform]
        if c.platform in updated_hashtags:
            c.hashtags = updated_hashtags[c.platform]
        if updated_image_url:
            c.image_url = updated_image_url
        if updated_time:
            c.scheduled_at = updated_time
        c.status = "approved"

    # 2. Update ScheduledPost if linked
    if sched:
        if updated_image_url:
            sched.media_url = updated_image_url
        if updated_time:
            sched.scheduled_at = updated_time
        sched.status = "Scheduled" if (updated_time or sched.scheduled_at) else "Draft"

    # 3. Create a new approved version snapshot authored by approver
    version = create_post_snapshot(
        post_id=post.id,
        submitted_by=user,
        db=db,
        captions=updated_captions,
        hashtags=updated_hashtags,
        image_url=updated_image_url,
        scheduled_time=updated_time,
        note=f"[Edit & Approved]: {notes or 'Minor tweaks made'}"
    )

    version.status = "approved"
    version.decision = "approved"
    version.decision_by_id = user.id
    version.decision_at = datetime.utcnow()
    version.decision_notes = notes

    post.status = "approved"
    post.approved_version_hash = version.content_hash
    if sched:
        sched.approved_version_hash = version.content_hash

    approval_rec = PostApproval(
        post_version_id=version.id,
        approver_id=user.id,
        decision="approved",
        notes=f"Edited & Approved: {notes or ''}"
    )
    db.add(approval_rec)
    db.commit()

    # Notify creator of the edited & approved post
    creator = db.query(User).filter(User.id == post.user_id).first() or db.query(User).filter(User.id == brand.user_id).first()
    if creator:
        try:
            from services.notification_service import create_notification
            note_text = f": \"{notes.strip()}\"" if notes and notes.strip() else "."
            create_notification(
                user_id=creator.id,
                brand_id=brand.id,
                title="Post Edited & Approved by Approver",
                message=f"{user.full_name or user.email} made minor adjustments and approved your post{note_text}",
                type="success",
                action_type="open_approvals",
                action_payload={"post_id": post.id, "notes": notes},
                idempotency_key=f"notif_edit_appr_{post.id}_v{version.version_number}",
                db=db
            )
        except Exception as notif_err:
            logger.warning(f"Error creating edit & approved in-app notification: {notif_err}")

        try:
            await send_email(
                to=creator.email,
                template="post_approved",
                data={
                    "brand_name": brand.name or brand.business_name or "Your Brand",
                    "title": post.title,
                    "approver_name": user.full_name or user.email,
                    "post_url": f"/calendar?post_id={post.id}",
                    "is_edited": True,
                    "post_id": post.id
                },
                user_id=creator.id,
                brand_id=brand.id,
                idempotency_key=f"edit_appr_{post.id}_v{version.version_number}",
                db=db
            )
        except Exception as e:
            logger.warning(f"Error sending edit & approved notification: {e}")

    log_approval_audit(
        db=db,
        user=user,
        action="post_edited_and_approved",
        target_id=post.id,
        details={"version": version.version_number, "hash": version.content_hash}
    )

    return {"status": "approved", "version": version.version_number, "edited": True}


async def request_changes_post(
    post_id: str,
    user: User,
    comment: str,
    chips: List[str],
    db: Session
) -> Dict[str, Any]:
    """Request revisions from creator. Comment is strictly required."""
    if not comment or not comment.strip():
        raise HTTPException(status_code=400, detail="A revision comment is required when requesting changes.")

    post, sched, captions, hashtags, image_url, scheduled_time = get_post_bundle(post_id, db)
    brand = db.query(Brand).filter(Brand.id == post.brand_id).first()
    if not brand:
        raise HTTPException(status_code=404, detail="Brand not found")

    if brand.require_approval:
        if user.id == post.user_id or user.id == brand.user_id:
            raise HTTPException(status_code=403, detail="Self-approval is forbidden.")
        member = db.query(BrandMember).filter(
            BrandMember.brand_id == brand.id,
            BrandMember.user_id == user.id,
            BrandMember.role == "approver",
            BrandMember.status == "active"
        ).first()
        if not member:
            raise HTTPException(status_code=403, detail="Only active approvers can request changes.")

    latest_version = db.query(PostVersion).filter(PostVersion.post_id == post.id).order_by(PostVersion.version_number.desc()).first()
    if not latest_version:
        latest_version = create_post_snapshot(post.id, user, db)

    latest_version.status = "changes_requested"
    latest_version.decision = "changes_requested"
    latest_version.decision_by_id = user.id
    latest_version.decision_at = datetime.utcnow()
    latest_version.decision_notes = comment.strip()
    latest_version.changes_requested_chips = chips or []

    post.status = "changes_requested"
    post.approved_version_hash = None

    if sched:
        sched.status = "Draft"
        sched.approved_version_hash = None

    copies = db.query(PlatformCopy).filter(PlatformCopy.post_id == post.id).all()
    for c in copies:
        if c.status not in ("posted", "publishing"):
            c.status = "changes_requested"

    approval_rec = PostApproval(
        post_version_id=latest_version.id,
        approver_id=user.id,
        decision="changes_requested",
        notes=comment.strip(),
        chips=chips or []
    )
    db.add(approval_rec)
    db.commit()

    # Notify creator
    creator = db.query(User).filter(User.id == post.user_id).first() or db.query(User).filter(User.id == brand.user_id).first()
    if creator:
        try:
            from services.notification_service import create_notification
            chips_text = f" (Focus: {', '.join(chips)})" if chips else ""
            create_notification(
                user_id=creator.id,
                brand_id=brand.id,
                title="Approver Requested Revisions",
                message=f"{user.full_name or user.email} requested changes: \"{comment.strip()}\"{chips_text}",
                type="warning",
                action_type="open_approvals",
                action_payload={
                    "post_id": post.id,
                    "comment": comment.strip(),
                    "chips": chips or []
                },
                idempotency_key=f"notif_chg_{post.id}_v{latest_version.version_number}",
                db=db
            )
        except Exception as notif_err:
            logger.warning(f"Error creating in-app revisions notification: {notif_err}")

        try:
            await send_email(
                to=creator.email,
                template="post_changes_requested",
                data={
                    "brand_name": brand.name or brand.business_name or "Your Brand",
                    "title": post.title,
                    "approver_name": user.full_name or user.email,
                    "comment": comment.strip(),
                    "chips": chips or [],
                    "edit_url": f"/session?edit_post_id={post.id}",
                    "post_id": post.id
                },
                user_id=creator.id,
                brand_id=brand.id,
                idempotency_key=f"chg_{post.id}_v{latest_version.version_number}",
                db=db
            )
        except Exception as e:
            logger.warning(f"Error sending changes requested email: {e}")

    log_approval_audit(
        db=db,
        user=user,
        action="post_changes_requested",
        target_id=post.id,
        details={"comment": comment.strip(), "chips": chips}
    )

    return {"status": "changes_requested", "version": latest_version.version_number}


async def reject_post(
    post_id: str,
    user: User,
    reason: str,
    db: Session
) -> Dict[str, Any]:
    """Reject post. Reason is strictly required."""
    if not reason or not reason.strip():
        raise HTTPException(status_code=400, detail="A reason is required when rejecting a post.")

    post, sched, captions, hashtags, image_url, scheduled_time = get_post_bundle(post_id, db)
    brand = db.query(Brand).filter(Brand.id == post.brand_id).first()
    if not brand:
        raise HTTPException(status_code=404, detail="Brand not found")

    if brand.require_approval:
        if user.id == post.user_id or user.id == brand.user_id:
            raise HTTPException(status_code=403, detail="Self-approval is forbidden.")
        member = db.query(BrandMember).filter(
            BrandMember.brand_id == brand.id,
            BrandMember.user_id == user.id,
            BrandMember.role == "approver",
            BrandMember.status == "active"
        ).first()
        if not member:
            raise HTTPException(status_code=403, detail="Only active approvers can reject posts.")

    latest_version = db.query(PostVersion).filter(PostVersion.post_id == post.id).order_by(PostVersion.version_number.desc()).first()
    if not latest_version:
        latest_version = create_post_snapshot(post.id, user, db)

    latest_version.status = "rejected"
    latest_version.decision = "rejected"
    latest_version.decision_by_id = user.id
    latest_version.decision_at = datetime.utcnow()
    latest_version.decision_notes = reason.strip()

    post.status = "rejected"
    post.approved_version_hash = None

    if sched:
        sched.status = "Draft"
        sched.approved_version_hash = None

    copies = db.query(PlatformCopy).filter(PlatformCopy.post_id == post.id).all()
    for c in copies:
        if c.status not in ("posted", "publishing"):
            c.status = "rejected"

    approval_rec = PostApproval(
        post_version_id=latest_version.id,
        approver_id=user.id,
        decision="rejected",
        notes=reason.strip()
    )
    db.add(approval_rec)
    db.commit()

    creator = db.query(User).filter(User.id == post.user_id).first() or db.query(User).filter(User.id == brand.user_id).first()
    if creator:
        try:
            await send_email(
                to=creator.email,
                template="post_rejected",
                data={
                    "brand_name": brand.name or brand.business_name or "Your Brand",
                    "title": post.title,
                    "approver_name": user.full_name or user.email,
                    "reason": reason.strip(),
                    "post_url": f"/ideas",
                    "post_id": post.id
                },
                user_id=creator.id,
                brand_id=brand.id,
                idempotency_key=f"rej_{post.id}_v{latest_version.version_number}",
                db=db
            )
        except Exception as e:
            logger.warning(f"Error sending reject email: {e}")

    log_approval_audit(
        db=db,
        user=user,
        action="post_rejected",
        target_id=post.id,
        details={"reason": reason.strip()}
    )

    return {"status": "rejected", "version": latest_version.version_number}


def edit_post_after_approval_guard(post: Post, db: Session) -> bool:
    """
    Rule: 'any edit after approval returns the post to in_review.'
    If post was approved, invalidates hash and sets back to in_review.
    """
    if post.status == "approved" or (hasattr(post, "approved_version_hash") and post.approved_version_hash):
        post.status = "in_review"
        post.approved_version_hash = None

        sched = db.query(ScheduledPost).filter(ScheduledPost.post_id == post.id).first()
        if sched:
            sched.status = "In Review"
            sched.approved_version_hash = None

        db.commit()
        return True
    return False


def verify_publish_security_guard(post_id: str, brand_id: str, db: Session) -> Tuple[bool, str]:
    """
    Rule: 'Publish only if the hash equals the approved version.'
    Ensures that if the brand requires approval:
    1. Post status must be 'approved'.
    2. Current calculated content hash must match approved_version_hash.
    """
    brand = db.query(Brand).filter(Brand.id == brand_id).first()
    if not brand or not brand.require_approval:
        return True, "Approval not required."

    post = db.query(Post).filter(Post.id == post_id).first()
    if not post:
        return False, "Post not found."

    if post.status != "approved":
        return False, f"Post status is '{post.status}'. Approval is required before publishing."

    if not post.approved_version_hash:
        return False, "Post does not have an approved snapshot hash."

    # Compute current content hash
    _, _, captions, hashtags, image_url, scheduled_time = get_post_bundle(post.id, db)
    current_hash = compute_content_hash(captions, hashtags, image_url, scheduled_time)

    if current_hash != post.approved_version_hash:
        # Reset status since content was tampered after approval
        post.status = "in_review"
        post.approved_version_hash = None
        db.commit()
        return False, "Post content was modified after approval. It has been returned to in_review."

    return True, "Verified approved hash match."


async def check_deadlines_and_reminders(db: Session) -> Dict[str, int]:
    """
    Scheduled background task:
    - Reminds approvers before deadline.
    - If deadline reached with no approval: 'no decision = skip, never auto-publish; alert the creator'.
    """
    now = datetime.utcnow()
    reminders_sent = 0
    skipped_count = 0

    # Query all brands with require_approval == True
    brands = db.query(Brand).filter(Brand.require_approval == True).all()
    for brand in brands:
        reminder_window = now + timedelta(hours=brand.approval_reminder_hours or 6)

        # Pending posts
        sched_posts = db.query(ScheduledPost).filter(
            ScheduledPost.brand_id == brand.id,
            ScheduledPost.status.in_(["Draft", "Pending Approval", "In Review"]),
            ScheduledPost.scheduled_at != None
        ).all()

        for sp in sched_posts:
            # 1. Past scheduled time -> SKIP! Never auto-publish!
            if sp.scheduled_at <= now:
                sp.status = "Skipped"
                sp.error = "Approval deadline expired with no decision. Post skipped for safety."
                db.commit()
                skipped_count += 1

                # Alert creator
                creator = db.query(User).filter(User.id == brand.user_id).first()
                if creator:
                    try:
                        await send_email(
                            to=creator.email,
                            template="approval_skipped",
                            data={
                                "brand_name": brand.name or brand.business_name or "Your Brand",
                                "title": sp.headline or sp.topic or "Scheduled Post",
                                "post_url": f"/calendar?post_id={sp.id}",
                                "post_id": sp.id
                            },
                            user_id=creator.id,
                            brand_id=brand.id,
                            idempotency_key=f"skip_{sp.id}_{sp.scheduled_at.strftime('%Y%m%d%H%M')}",
                            db=db
                        )
                    except Exception as e:
                        logger.warning(f"Error sending skip alert: {e}")

                if creator:
                    log_approval_audit(
                        db=db,
                        user=creator,
                        action="post_approval_skipped",
                        target_id=sp.id,
                        details={"scheduled_at": sp.scheduled_at.isoformat()}
                    )

            # 2. Within reminder window -> Send Reminder
            elif sp.scheduled_at <= reminder_window:
                hours_left = max(1, int((sp.scheduled_at - now).total_seconds() / 3600))
                approvers = get_active_approvers(brand.id, db)
                for approver in approvers:
                    try:
                        res = await send_email(
                            to=approver.email,
                            template="approval_reminder",
                            data={
                                "brand_name": brand.name or brand.business_name or "Your Brand",
                                "title": sp.headline or sp.topic or "Scheduled Post",
                                "hours_left": hours_left,
                                "review_url": f"/approvals/{sp.post_id or sp.id}",
                                "post_id": sp.id
                            },
                            user_id=approver.id,
                            brand_id=brand.id,
                            idempotency_key=f"rem_{sp.id}_{approver.id}_{sp.scheduled_at.strftime('%Y%m%d%H')}",
                            db=db
                        )
                        if not res.get("idempotent"):
                            reminders_sent += 1
                    except Exception as e:
                        logger.warning(f"Error sending reminder to {approver.email}: {e}")

    return {"reminders_sent": reminders_sent, "skipped_count": skipped_count}
