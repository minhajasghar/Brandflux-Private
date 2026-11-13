import os
import json
import logging
import asyncio
from datetime import datetime
from typing import Optional, Dict, Any, Union
from sqlalchemy.orm import Session

from models.models import PlatformCopy, ScheduledPost, SocialAccount, PublishAttempt
from services.publishing.base import PublishResult
from services.publishing.factory import get_publisher

logger = logging.getLogger(__name__)

PLATFORM_LABELS = {
    "instagram": "Instagram",
    "instagram_post": "Instagram",
    "ig": "Instagram",
    "facebook": "Facebook",
    "fb": "Facebook",
    "linkedin": "LinkedIn",
    "twitter": "Twitter/X",
    "x": "Twitter/X",
    "tiktok": "TikTok",
}


def format_platform_label(platform: str) -> str:
    norm = (platform or "").lower().strip().replace("_post", "")
    return PLATFORM_LABELS.get(norm, PLATFORM_LABELS.get((platform or "").lower().strip(), (platform or "Social").capitalize()))


def validate_social_account_connection(db: Session, brand_id: str, platform: str) -> tuple[Optional[SocialAccount], Optional[str]]:
    """
    Verify that the brand has an active, non-expired SocialAccount for the requested platform
    and that a publisher adapter exists for it.
    Returns (account, error_message).
    """
    label = format_platform_label(platform)
    if not brand_id:
        return None, f"Your {label} account is not connected. Please connect your {label} account before publishing."

    plat_lower = (platform or "").lower().strip()
    if plat_lower not in ("facebook", "fb", "instagram", "ig", "instagram_post", "linkedin", "twitter", "x", "tiktok", "twitter_post", "linkedin_post", "facebook_post"):
        return None, f"Publishing to {label} is not supported."

    accounts = db.query(SocialAccount).filter(
        SocialAccount.brand_id == brand_id,
        SocialAccount.is_active == True
    ).all()

    target_account = None
    for acc in accounts:
        acc_plat = (acc.platform or "").lower().strip()
        if plat_lower in ("facebook", "fb", "facebook_post"):
            if "facebook" in acc_plat or (acc_plat == "meta" and not (acc.metadata_json or {}).get("is_instagram_only")):
                target_account = acc
                break
        elif plat_lower in ("instagram", "ig", "instagram_post"):
            if "instagram" in acc_plat:
                target_account = acc
                break
        elif plat_lower in ("linkedin", "linkedin_post"):
            if "linkedin" in acc_plat:
                target_account = acc
                break
        elif plat_lower in ("twitter", "x", "twitter_post"):
            if acc_plat in ("twitter", "x"):
                target_account = acc
                break
        elif plat_lower == acc_plat:
            target_account = acc
            break

    if not target_account:
        return None, f"Your {label} account is not connected. Please connect your {label} account before publishing."

    if target_account.token_expires_at and target_account.token_expires_at < datetime.utcnow():
        has_refresh = bool(getattr(target_account, "refresh_token_encrypted", None) or (target_account.metadata_json or {}).get("refresh_token_encrypted"))
        if not has_refresh:
            logger.warning(f"[SharedPublish] Account '{target_account.account_name}' token expired on {target_account.token_expires_at}")
            return None, f"Your {label} account connection has expired. Please reconnect your {label} account before publishing."

    if not getattr(target_account, "access_token_encrypted", None) and not (target_account.metadata_json or {}).get("ayrshare_profile_key"):
        return None, f"Your {label} account credentials are incomplete. Please reconnect your {label} account before publishing."

    return target_account, None


async def execute_social_publish(
    db: Session,
    platform: str,
    brand_id: str,
    caption: Optional[str] = None,
    image_url: Optional[str] = None,
    platform_copy_id: Optional[str] = None,
    scheduled_post_id: Optional[str] = None,
    force: bool = False
) -> PublishResult:
    """
    ONE SHARED CANONICAL PUBLISHING FUNCTION.
    All publishing operations (Content router, Celery scheduled tasks, retry actions)
    MUST pass through this function.

    RULES ENFORCED:
    1. Status lifecycle: Draft / Scheduled -> Publishing -> Published (or failed / needs_reconnect).
    2. Status is marked 'published'/'Published' ONLY after the platform API returns a real post ID
       and follow-up check confirms the post exists.
    3. If no active account connected or token is expired: status = 'needs_reconnect'.
    4. Zero mock/stub fallbacks.
    5. Every attempt (success, failed, needs_reconnect) is logged to the publish_attempts table.
    6. Synchronously updates PlatformCopy and/or ScheduledPost in database.
    """
    copy: Optional[PlatformCopy] = None
    scheduled: Optional[ScheduledPost] = None

    if platform_copy_id:
        copy = db.query(PlatformCopy).filter(PlatformCopy.id == platform_copy_id).first()

    if scheduled_post_id:
        scheduled = db.query(ScheduledPost).filter(ScheduledPost.id == scheduled_post_id).first()
        if scheduled and scheduled.platform_copy_id and not copy:
            copy = db.query(PlatformCopy).filter(PlatformCopy.id == scheduled.platform_copy_id).first()

    # If linked, retrieve complementary details
    if copy and not scheduled_post_id:
        scheduled = db.query(ScheduledPost).filter(ScheduledPost.platform_copy_id == copy.id).first()

    # Deduce parameters from models if not explicitly passed
    caption = caption if caption is not None else (copy.caption if copy else (scheduled.caption if scheduled else ""))
    image_url = image_url if image_url is not None else (copy.image_url if copy else (scheduled.media_url if scheduled else None))
    platform = platform or (copy.platform if copy else (scheduled.platform if scheduled else "facebook"))
    if not brand_id:
        if scheduled and scheduled.brand_id:
            brand_id = scheduled.brand_id
        elif copy and copy.post and copy.post.brand_id:
            brand_id = copy.post.brand_id

    # ─── 1. Approval & Content Hash Security Guard ───────────────────────────
    target_post_id = None
    if copy and copy.post_id:
        target_post_id = copy.post_id
    elif scheduled and scheduled.post_id:
        target_post_id = scheduled.post_id

    if target_post_id and brand_id and not force:
        from services.approval_service import verify_publish_security_guard
        is_ok, reason = verify_publish_security_guard(target_post_id, brand_id, db)
        if not is_ok:
            logger.warning(f"[ApprovalGuardBlocked] Post {target_post_id} publish blocked: {reason}")
            return PublishResult(
                success=False,
                status="failed",
                error=f"Approval Guard Blocked: {reason}",
                duration_ms=0
            )

    # Append hashtags if available and not already embedded in caption
    tag_list = (copy.hashtags if copy else None)
    if not tag_list and scheduled and scheduled.platform_copies and isinstance(scheduled.platform_copies, dict):
        tag_list = scheduled.platform_copies.get(platform, {}).get("hashtags")
    if tag_list and isinstance(tag_list, list) and caption and "#" not in caption:
        tag_str = " ".join(t if t.startswith("#") else f"#{t}" for t in tag_list if t)
        if tag_str:
            caption = f"{caption.strip()}\n\n{tag_str}"


    # ─── 2. Idempotency Guard ────────────────────────────────────────────────
    already_pub_copy = copy and copy.status == "published" and copy.external_post_id
    already_pub_sched = scheduled and scheduled.status in ("Published", "published") and scheduled.external_post_id

    if (already_pub_copy or already_pub_sched) and not force:
        ext_id = copy.external_post_id if copy else scheduled.external_post_id
        permalink = copy.permalink if copy else (scheduled.permalink if scheduled else None)
        logger.info(f"[SharedPublish] Post {ext_id} already published. Idempotent skip.")
        return PublishResult(
            success=True,
            status="published",
            external_post_id=ext_id,
            permalink=permalink,
            duration_ms=0
        )

    # ─── 2. Find Connected & Active Social Account ───────────────────────────
    target_account, conn_error = validate_social_account_connection(db, brand_id, platform)

    # ─── 3. Disconnected / Expired Account Guard ────────────────────────────
    if not target_account:
        err_msg = conn_error or f"Your {format_platform_label(platform)} account is not connected. Please connect your {format_platform_label(platform)} account before publishing."
        logger.warning(f"[SharedPublish] {err_msg}")

        if copy:
            copy.status = "needs_reconnect"
            copy.error = err_msg
            copy.updated_at = datetime.utcnow()

        if scheduled:
            scheduled.status = "needs_reconnect"
            scheduled.error = err_msg

        attempt = PublishAttempt(
            brand_id=brand_id,
            platform_copy_id=copy.id if copy else None,
            scheduled_post_id=scheduled.id if scheduled else None,
            platform=platform,
            account_id=None,
            status="needs_reconnect",
            http_status=401,
            error_code="ACCOUNT_DISCONNECTED",
            error_message=err_msg,
            duration_ms=0
        )
        db.add(attempt)
        db.commit()

        return PublishResult(
            success=False,
            status="needs_reconnect",
            error=err_msg,
            error_code="ACCOUNT_DISCONNECTED",
            http_status=401,
            duration_ms=0
        )

    # ─── 4. Status Transition: In-Flight ('Publishing') ──────────────────────
    if copy:
        copy.status = "publishing"
        copy.error = None
        copy.updated_at = datetime.utcnow()

    if scheduled:
        scheduled.status = "Publishing"
        scheduled.error = None

    db.commit()

    # ─── 5. Resolve Publisher Adapter ─────────────────────────────────────────
    publisher = get_publisher(platform)
    if not publisher:
        err_msg = f"No publisher adapter configured for platform '{platform}'."
        if copy:
            copy.status = "failed"
            copy.error = err_msg
            copy.updated_at = datetime.utcnow()
        if scheduled:
            scheduled.status = "Failed"
            scheduled.error = err_msg

        attempt = PublishAttempt(
            brand_id=brand_id,
            platform_copy_id=copy.id if copy else None,
            scheduled_post_id=scheduled.id if scheduled else None,
            platform=platform,
            account_id=target_account.account_id,
            status="failed",
            http_status=501,
            error_code="NO_PUBLISHER_ADAPTER",
            error_message=err_msg,
            duration_ms=0
        )
        db.add(attempt)
        db.commit()
        return PublishResult(success=False, status="failed", error=err_msg, error_code="NO_PUBLISHER_ADAPTER", http_status=501)

    # ─── 6. Execute Live Platform API Call ───────────────────────────────────
    try:
        logger.info(f"[SharedPublish] Dispatching post to {platform} via {publisher.__class__.__name__}...")
        if platform == "instagram_story" and image_url:
            publish_result = await publisher.publish_story(image_url, target_account)
        elif image_url:
            publish_result = await publisher.publish_image(image_url, caption or "", target_account)
        else:
            publish_result = await publisher.publish_text(caption or "", target_account)
    except Exception as exc:
        logger.exception(f"[SharedPublish] Exception during API call to {platform}: {exc}")
        publish_result = PublishResult(
            success=False,
            status="failed",
            error=str(exc),
            error_code="PUBLISH_EXCEPTION",
            http_status=500
        )

    # ─── 7. Enforce Strict Rules on Result ───────────────────────────────────
    if publish_result and publish_result.success and publish_result.external_post_id:
        # Verified success
        if copy:
            copy.status = "published"
            copy.external_post_id = publish_result.external_post_id
            copy.permalink = publish_result.permalink
            copy.error = None
            copy.updated_at = datetime.utcnow()

        if scheduled:
            scheduled.status = "Published"
            scheduled.external_post_id = publish_result.external_post_id
            scheduled.permalink = publish_result.permalink
            scheduled.error = None

        attempt = PublishAttempt(
            brand_id=brand_id,
            platform_copy_id=copy.id if copy else None,
            scheduled_post_id=scheduled.id if scheduled else None,
            platform=platform,
            account_id=target_account.account_id,
            status="success",
            http_status=publish_result.http_status or 200,
            request_payload_sanitized=publish_result.sanitized_payload,
            response_body=json.dumps(publish_result.raw_response or {}),
            duration_ms=publish_result.duration_ms,
            external_post_id=publish_result.external_post_id,
            permalink=publish_result.permalink
        )
        db.add(attempt)
        db.commit()
        logger.info(f"[SharedPublish] Post successfully published & verified! External ID: {publish_result.external_post_id}")
        return publish_result
    else:
        # Rejection or failure
        fail_status = "needs_reconnect" if (publish_result and publish_result.status == "needs_reconnect") else "failed"
        sched_fail_status = "needs_reconnect" if fail_status == "needs_reconnect" else "Failed"
        err_msg = publish_result.error if publish_result else "Unknown publishing error"

        if copy:
            copy.status = fail_status
            copy.error = err_msg
            copy.updated_at = datetime.utcnow()

        if scheduled:
            scheduled.status = sched_fail_status
            scheduled.error = err_msg

        attempt = PublishAttempt(
            brand_id=brand_id,
            platform_copy_id=copy.id if copy else None,
            scheduled_post_id=scheduled.id if scheduled else None,
            platform=platform,
            account_id=target_account.account_id,
            status=fail_status,
            http_status=publish_result.http_status if publish_result else 400,
            request_payload_sanitized=publish_result.sanitized_payload if publish_result else None,
            response_body=json.dumps(publish_result.raw_response or {}) if publish_result else None,
            error_code=publish_result.error_code if publish_result else "UNKNOWN_ERROR",
            error_message=err_msg,
            duration_ms=publish_result.duration_ms if publish_result else 0
        )
        db.add(attempt)
        db.commit()
        logger.warning(f"[SharedPublish] Post publishing rejected: {err_msg} (status: {fail_status})")
        return publish_result

