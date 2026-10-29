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
    - Strictly idempotent: guarantees a post is never published twice.
    - Exponential backoff on transient network or API failures.
    - Writes final status, external_post_id, or error back to the database.
    """
    db = SessionLocal()
    try:
        post = db.query(ScheduledPost).filter(ScheduledPost.id == post_id).first()
        if not post:
            logger.error(f"[PublishTask] Post {post_id} not found in database.")
            return {"status": "not_found", "post_id": post_id}

        # ─── Idempotency Guard ──────────────────────────────────────────────
        if post.status == "Published":
            logger.info(f"[PublishTask] Post {post_id} is already Published. Skipping.")
            return {"status": "already_published", "external_post_id": post.external_post_id}

        if post.status == "Publishing" and self.request.retries == 0:
            logger.warning(f"[PublishTask] Post {post_id} is currently Publishing. Preventing duplicate run.")
            return {"status": "concurrent_publishing"}

        # Mark in progress
        post.status = "Publishing"
        db.commit()

        # ─── Find Connected Social Account ──────────────────────────────────
        account = db.query(SocialAccount).filter(
            SocialAccount.brand_id == post.brand_id,
            SocialAccount.is_active == True
        ).all()

        target_account = None
        plat_lower = post.platform.lower()

        # Match specific or family platform
        for acc in account:
            acc_plat = acc.platform.lower()
            if ("instagram" in plat_lower and "instagram" in acc_plat) or \
               ("linkedin" in plat_lower and "linkedin" in acc_plat) or \
               ("facebook" in plat_lower and "facebook" in acc_plat) or \
               ("meta" in acc_plat):
                target_account = acc
                break

        if not target_account and account:
            # Fallback to first active account
            target_account = account[0]

        if not target_account:
            err_msg = f"No active social account connected for platform '{post.platform}'."
            logger.error(f"[PublishTask] {err_msg}")
            post.status = "Failed"
            post.error = err_msg
            db.commit()
            return {"status": "failed", "error": err_msg}

        # ─── Execute Publication via Platform Adapter ───────────────────────
        publisher = get_publisher(post.platform)
        logger.info(f"[PublishTask] Publishing post {post.id} to {post.platform} using {publisher.__class__.__name__}...")

        if post.platform == "instagram_story" and post.media_url:
            result = run_async(publisher.publish_story(post.media_url, target_account))
        elif post.media_url:
            result = run_async(publisher.publish_image(post.media_url, post.caption or "", target_account))
        else:
            result = run_async(publisher.publish_text(post.caption or "", target_account))

        # ─── Database Writeback ─────────────────────────────────────────────
        if result.success:
            post.status = "Published"
            post.external_post_id = result.external_post_id
            post.error = None
            db.commit()
            logger.info(f"[PublishTask] Successfully published post {post.id}. External ID: {result.external_post_id}")
            return {"status": "published", "external_post_id": result.external_post_id}
        else:
            # Retry with exponential backoff if retries left
            retry_count = self.request.retries
            max_retries = self.max_retries or 3
            if retry_count < max_retries:
                countdown = int(60 * (2 ** retry_count))  # 60s, 120s, 240s
                logger.warning(
                    f"[PublishTask] Attempt {retry_count + 1} failed: {result.error}. "
                    f"Retrying in {countdown}s with exponential backoff..."
                )
                db.commit()
                raise self.retry(exc=Exception(result.error), countdown=countdown)
            else:
                post.status = "Failed"
                post.error = result.error
                db.commit()
                logger.error(f"[PublishTask] All retries exhausted for post {post.id}. Error: {result.error}")
                return {"status": "failed", "error": result.error}

    except Exception as exc:
        db.rollback()
        # If it was an internal self.retry exception, re-raise it for Celery
        if "Retry" in exc.__class__.__name__:
            raise exc

        logger.exception(f"[PublishTask] Unhandled exception publishing {post_id}: {exc}")
        # Mark failed on final crash
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


