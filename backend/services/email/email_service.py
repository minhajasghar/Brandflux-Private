import os
import logging
from typing import Dict, Any, Optional
from sqlalchemy.orm import Session

from config import EMAIL_PROVIDER
from database import SessionLocal
from models.models import EmailLog, User
from services.email.dev_provider import DevEmailProvider
from services.email.resend_provider import ResendEmailProvider
from services.email.templates import render_template, extract_links
from services.notification_service import create_notification

logger = logging.getLogger("email.service")

# Map provider instances
_DEV_PROVIDER = DevEmailProvider()
_RESEND_PROVIDER = ResendEmailProvider()

def get_email_provider():
    provider_name = os.getenv("EMAIL_PROVIDER", EMAIL_PROVIDER or "dev").strip().lower()
    if provider_name == "resend":
        return _RESEND_PROVIDER
    return _DEV_PROVIDER

async def send_email(
    to: str,
    template: str,
    data: Dict[str, Any],
    user_id: Optional[str] = None,
    brand_id: Optional[str] = None,
    idempotency_key: Optional[str] = None,
    db: Optional[Session] = None
) -> Dict[str, Any]:
    """
    Unified canonical email sending function.
    - Resolves provider dynamically based on EMAIL_PROVIDER env var.
    - In dev mode: captures email into email_logs table without sending external traffic.
    - In resend mode: sends via Resend API (when configured).
    - Checks idempotency: duplicate idempotency_key returns existing log.
    - Mirrors each email as an in-app actionable notification.
    """
    close_db_when_done = False
    if db is None:
        db = SessionLocal()
        close_db_when_done = True

    try:
        # 1. Idempotency Check
        if idempotency_key:
            existing_log = db.query(EmailLog).filter(EmailLog.idempotency_key == idempotency_key).first()
            if existing_log:
                logger.info(f"[EMAIL SKIPPED - IDEMPOTENT] key='{idempotency_key}', id={existing_log.id}")
                return {
                    "id": existing_log.id,
                    "status": existing_log.status,
                    "provider": existing_log.provider,
                    "idempotent": True
                }

        # 2. Check user notification mute preferences
        if user_id:
            user = db.query(User).filter(User.id == user_id).first()
            if user and user.notification_preferences:
                prefs = user.notification_preferences
                # If user muted this category (e.g. email_autopilot: false)
                if template.startswith("autopilot_") and prefs.get("email_autopilot") is False:
                    logger.info(f"User {user_id} has muted Autopilot emails. Email send skipped.")
                    # Still create in-app notification below!
                    _create_matching_inapp_notification(user_id, brand_id, template, data, db)
                    return {"status": "muted", "provider": "muted"}

        # 3. Render Template
        subject, full_html, plain_text = render_template(template, data)
        parsed_links = extract_links(full_html)

        # 4. Dispatch to Provider (Dev or Resend)
        provider = get_email_provider()
        provider_name = "resend" if isinstance(provider, ResendEmailProvider) else "dev"
        result = await provider.send(
            recipient=to,
            subject=subject,
            template=template,
            full_html=full_html,
            plain_text=plain_text,
            metadata=data
        )

        status = result.get("status", "captured (dev)")

        # 5. Save Email Log Record
        log_entry = EmailLog(
            user_id=user_id,
            brand_id=brand_id,
            recipient=to,
            subject=subject,
            template=template,
            status=status,
            provider=provider_name,
            full_html=full_html,
            plain_text=plain_text,
            links_json=parsed_links,
            metadata_json=data,
            idempotency_key=idempotency_key
        )
        db.add(log_entry)
        db.commit()
        db.refresh(log_entry)

        # 6. Mirror In-App Notification (The single source of truth)
        if user_id:
            _create_matching_inapp_notification(user_id, brand_id, template, data, db, idempotency_key)

        return {
            "id": log_entry.id,
            "status": log_entry.status,
            "provider": log_entry.provider,
            "subject": log_entry.subject,
            "recipient": log_entry.recipient,
            "links": parsed_links
        }

    except Exception as e:
        logger.error(f"Error in send_email: {e}")
        db.rollback()
        raise e
    finally:
        if close_db_when_done:
            db.close()


def _create_matching_inapp_notification(
    user_id: str,
    brand_id: Optional[str],
    template: str,
    data: Dict[str, Any],
    db: Session,
    idempotency_key: Optional[str] = None
):
    """
    Every email that would be sent must also create the matching in-app notification,
    so the full flow works without email.
    """
    notif_key = f"notif_{idempotency_key}" if idempotency_key else None

    if template == "verify_email":
        create_notification(
            user_id=user_id,
            brand_id=brand_id,
            title="Verify your email address",
            message="Please confirm your email address to activate all Brandflux features.",
            type="info",
            action_type="link",
            action_payload={"url": data.get("verification_url", "/verify")},
            idempotency_key=notif_key,
            db=db
        )
    elif template == "welcome":
        create_notification(
            user_id=user_id,
            brand_id=brand_id,
            title="Welcome to Brandflux! 🚀",
            message="Your account is verified. Connect your social channels and start creating your first posts.",
            type="welcome",
            action_type="link",
            action_payload={"url": data.get("create_post_url", "/session")},
            idempotency_key=notif_key,
            db=db
        )
    elif template == "autopilot_checkin":
        brand_name = data.get("brand_name", "your brand")
        platforms = data.get("platforms", ["Facebook", "Instagram", "LinkedIn"])
        create_notification(
            user_id=user_id,
            brand_id=brand_id,
            title=f"Autopilot Check-in for {brand_name}",
            message="Generic or Special post today? Choose today's direction and platforms.",
            type="autopilot_checkin",
            action_type="checkin",
            action_payload={
                "brand_name": brand_name,
                "platforms": platforms,
                "generic_url": data.get("generic_url"),
                "special_url": data.get("special_url"),
                "skip_url": data.get("skip_url"),
                "run_id": data.get("run_id")
            },
            idempotency_key=notif_key,
            db=db
        )
    elif template == "autopilot_post_ready":
        title = data.get("title", "Daily Content")
        create_notification(
            user_id=user_id,
            brand_id=brand_id,
            title="Your post is ready for review 🎨",
            message=f"Autopilot prepared '{title}'. Review image variants and captions now.",
            type="autopilot_post_ready",
            action_type="review",
            action_payload={
                "post_id": data.get("post_id"),
                "review_url": data.get("review_url", "/ideas")
            },
            idempotency_key=notif_key,
            db=db
        )
    elif template == "autopilot_result":
        is_success = data.get("status") == "success"
        platform = data.get("platform", "Social").capitalize()
        if is_success:
            create_notification(
                user_id=user_id,
                brand_id=brand_id,
                title=f"Post published on {platform}! 🎉",
                message="Your post is live and verified on the platform.",
                type="autopilot_result",
                action_type="view_post",
                action_payload={
                    "platform": platform,
                    "permalink": data.get("permalink")
                },
                idempotency_key=notif_key,
                db=db
            )
        else:
            create_notification(
                user_id=user_id,
                brand_id=brand_id,
                title=f"Publishing failed on {platform} ⚠️",
                message=data.get("error", "An error occurred during publishing."),
                type="failed",
                action_type="retry",
                action_payload={
                    "platform": platform,
                    "error": data.get("error"),
                    "retry_url": data.get("retry_url", "/ideas")
                },
                idempotency_key=notif_key,
                db=db
            )
    elif template == "reconnect_needed":
        platform = data.get("platform", "Social").capitalize()
        create_notification(
            user_id=user_id,
            brand_id=brand_id,
            title=f"Reconnect {platform} account ⚠️",
            message=f"The access token for {platform} has expired. Please reconnect in Settings.",
            type="needs_reconnect",
            action_type="reconnect",
            action_payload={
                "platform": platform,
                "reconnect_url": data.get("reconnect_url", "/settings?tab=connected")
            },
            idempotency_key=notif_key,
            db=db
        )
    elif template == "admin_alert":
        create_notification(
            user_id=user_id,
            brand_id=brand_id,
            title=data.get("alert_title", "System Alert"),
            message=data.get("alert_message", ""),
            type="alert",
            action_type="link",
            action_payload={"url": data.get("admin_url", "/admin")},
            idempotency_key=notif_key,
            db=db
        )

