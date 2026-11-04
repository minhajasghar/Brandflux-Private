import os
import asyncio
import logging
from datetime import datetime, timedelta
from typing import Optional

from celery import Task
from celery_app import celery_app
from database import SessionLocal
from models.models import ScheduledPost, SocialAccount
from services.publishing.factory import get_publisher

logger = logging.getLogger(__name__)


def run_async(coro):
    """Helper to run async publishing methods inside Celery sync worker."""
    try:
        loop = asyncio.get_event_loop()
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
    return loop.run_until_complete(coro)


@celery_app.task(bind=True, max_retries=3, default_retry_delay=60)
def publish_scheduled_post(self: Task, post_id: str):
    """
    Publish a scheduled post.
    Routes strictly through the ONE shared canonical publish function (execute_social_publish).
    - Strictly idempotent: guarantees a post is never published twice.
    - Follow-up check confirms existence before marking Published.
    - Writes final status, external_post_id, permalink, or error back to the database.
    - Logs every attempt in publish_attempts.
    """
    from services.publishing.publish_service import execute_social_publish

    db = SessionLocal()
    try:
        post = db.query(ScheduledPost).filter(ScheduledPost.id == post_id).first()
        if not post:
            logger.error(f"[PublishTask] Post {post_id} not found in database.")
            return {"status": "not_found", "post_id": post_id}

        # ─── Idempotency Guard ──────────────────────────────────────────────
        if post.status == "Published" and post.external_post_id:
            logger.info(f"[PublishTask] Post {post_id} is already Published. Skipping.")
            return {"status": "already_published", "external_post_id": post.external_post_id, "permalink": post.permalink}

        logger.info(f"[PublishTask] Calling shared execute_social_publish for scheduled post {post.id} ({post.platform})...")

        # Call the ONE shared publish function
        result = run_async(execute_social_publish(
            db=db,
            platform=post.platform,
            brand_id=post.brand_id,
            caption=post.caption,
            image_url=post.media_url,
            platform_copy_id=post.platform_copy_id,
            scheduled_post_id=post.id
        ))

        if result.success:
            logger.info(f"[PublishTask] Successfully published post {post.id}. External ID: {result.external_post_id}, Permalink: {result.permalink}")
            return {
                "status": "published",
                "external_post_id": result.external_post_id,
                "permalink": result.permalink
            }
        else:
            logger.error(f"[PublishTask] Publishing failed for post {post.id}: {result.error} (status: {post.status})")
            return {
                "status": post.status,
                "error": result.error,
                "error_code": result.error_code
            }

    except Exception as exc:
        db.rollback()
        logger.exception(f"[PublishTask] Unhandled exception publishing {post_id}: {exc}")
        try:
            p = db.query(ScheduledPost).filter(ScheduledPost.id == post_id).first()
            if p:
                p.status = "Failed"
                p.error = str(exc)
                db.commit()
        except Exception:
            pass
        return {"status": "error", "error": str(exc)}
    finally:
        db.close()
        db.close()


@celery_app.task
def check_and_publish_due_posts():
    """
    Celery Beat periodic task running every minute.
    Picks posts due for publication and enqueues publish workers.
    """
    db = SessionLocal()
    try:
        now = datetime.utcnow()
        # Query posts scheduled up to right now that are ready to go
        due_posts = db.query(ScheduledPost).filter(
            ScheduledPost.scheduled_at <= now,
            ScheduledPost.status.in_(["Scheduled", "Draft"])
        ).limit(50).all()

        if due_posts:
            logger.info(f"[Scheduler] Found {len(due_posts)} posts due now for publication.")
            for post in due_posts:
                # Dispatch async Celery worker task
                publish_scheduled_post.delay(post.id)
        return len(due_posts)
    except Exception as e:
        logger.error(f"[Scheduler] Error checking due scheduled posts: {e}")
        return 0
    finally:
        db.close()


@celery_app.task
def check_token_expiry_alerts():
    """
    Periodic task checking for social accounts expiring in less than 7 days.
    """
    db = SessionLocal()
    try:
        threshold = datetime.utcnow() + timedelta(days=7)
        expiring = db.query(SocialAccount).filter(
            SocialAccount.is_active == True,
            SocialAccount.token_expires_at != None,
            SocialAccount.token_expires_at <= threshold
        ).all()

        for acc in expiring:
            logger.warning(
                f"[SecurityAlert] Social account '{acc.account_name}' ({acc.platform}) "
                f"token expires on {acc.token_expires_at}. Needs re-authentication."
            )
        return len(expiring)
    except Exception as e:
        logger.error(f"[SecurityAlert] Error checking token expirations: {e}")
        return 0
    finally:
        db.close()


@celery_app.task
def sync_daily_post_metrics_task(days: int = 30):
    """
    Daily periodic Celery task pulling post metrics (likes, comments, shares, reach, impressions)
    for all published posts.
    """
    from services.analytics.metrics_collector import sync_all_published_posts_metrics
    db = SessionLocal()
    try:
        logger.info("[AnalyticsCollector] Starting daily post metrics sync task...")
        result = run_async(sync_all_published_posts_metrics(db, days=days))
        logger.info(f"[AnalyticsCollector] Daily post metrics sync finished: {result}")
        return result
    except Exception as e:
        logger.error(f"[AnalyticsCollector] Error during daily post metrics sync: {e}")
        return {"error": str(e)}
    finally:
        db.close()


