from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from sqlalchemy.orm import Session
from datetime import datetime, date
import logging

from database import SessionLocal
from models.models import Brand, SmartQuestion, ContentGuidance, User
from services import gemini
from services import scraper
from config import DAILY_QUESTIONS_HOUR, WEEKLY_GUIDANCE_DAY

logger = logging.getLogger(__name__)

scheduler = AsyncIOScheduler()


# ═══════════════════════════════════════════════════════════
# JOB 1: Daily Smart Questions (runs every day at 6 AM)
# ═══════════════════════════════════════════════════════════
async def generate_daily_questions():
    """Generate 3 smart questions for each active user."""
    logger.info("⏰ Running daily questions job...")
    db = SessionLocal()
    try:
        brands = db.query(Brand).filter(
            Brand.scan_status == "completed",
            Brand.onboarding_complete == True
        ).all()

        for brand in brands:
            try:
                # Build brand profile dict
                brand_profile = {
                    "business_name": brand.business_name,
                    "business_type": brand.business_type,
                    "industry": brand.industry,
                    "target_audience": brand.target_audience,
                    "products_services": brand.products_services or [],
                    "detected_products": brand.detected_products or [],
                    "detected_services": brand.detected_services or [],
                    "brand_keywords": brand.brand_keywords or [],
                    "brand_tone": brand.brand_tone,
                    "content_themes": brand.content_themes or [],
                }

                # Get previous answers for context
                from models.models import UserAnswer
                prev_answers = db.query(UserAnswer).filter(
                    UserAnswer.user_id == brand.user_id
                ).order_by(UserAnswer.created_at.desc()).limit(10).all()

                prev_answers_data = []
                for ans in prev_answers:
                    q = db.query(SmartQuestion).filter(SmartQuestion.id == ans.question_id).first()
                    if q:
                        prev_answers_data.append({
                            "question": q.question_text,
                            "answer": ans.answer_text
                        })

                # Generate questions via Gemini
                questions = gemini.generate_smart_questions(brand_profile, prev_answers_data)

                # Save to DB
                today = date.today()
                for q_data in questions:
                    question = SmartQuestion(
                        user_id=brand.user_id,
                        brand_id=brand.id,
                        question_text=q_data.get("question_text", ""),
                        question_context=q_data.get("question_context", ""),
                        question_type=q_data.get("question_type", "general"),
                        options=q_data.get("options"),
                        date_for=today,
                    )
                    db.add(question)

                db.commit()
                logger.info(f"✅ Generated questions for brand: {brand.business_name}")

            except Exception as e:
                logger.error(f"❌ Error generating questions for brand {brand.id}: {str(e)}")
                db.rollback()

    except Exception as e:
        logger.error(f"❌ Daily questions job failed: {str(e)}")
    finally:
        db.close()


# ═══════════════════════════════════════════════════════════
# JOB 2: Weekly Guidance (runs every Monday at 7 AM)
# ═══════════════════════════════════════════════════════════
async def generate_weekly_guidance():
    """Generate weekly content guidance for each active user."""
    logger.info("⏰ Running weekly guidance job...")
    db = SessionLocal()
    try:
        brands = db.query(Brand).filter(
            Brand.scan_status == "completed"
        ).all()

        for brand in brands:
            try:
                brand_profile = {
                    "business_name": brand.business_name,
                    "industry": brand.industry,
                    "target_audience": brand.target_audience,
                    "brand_tone": brand.brand_tone,
                }

                # Generate all 3 types
                for gtype in ["weekly_tip", "posting_schedule", "content_mix"]:
                    try:
                        guidance_data = gemini.generate_guidance(brand_profile, gtype)
                        guidance = ContentGuidance(
                            user_id=brand.user_id,
                            brand_id=brand.id,
                            guidance_type=gtype,
                            title=guidance_data.get("title", "Weekly Tip"),
                            content=guidance_data.get("content", ""),
                            metadata_json=guidance_data.get("metadata_json"),
                            week_of=date.today(),
                        )
                        db.add(guidance)
                    except Exception as e:
                        logger.error(f"Error generating {gtype} for {brand.id}: {str(e)}")

                db.commit()
                logger.info(f"✅ Generated guidance for brand: {brand.business_name}")

            except Exception as e:
                logger.error(f"❌ Error generating guidance for brand {brand.id}: {str(e)}")
                db.rollback()

    except Exception as e:
        logger.error(f"❌ Weekly guidance job failed: {str(e)}")
    finally:
        db.close()


# ═══════════════════════════════════════════════════════════
# JOB 3: Permanent Purge of Soft-Deleted Accounts (runs daily at 3 AM)
# ═══════════════════════════════════════════════════════════
async def purge_expired_soft_deleted_users_job():
    """Permanently purges users whose 30-day soft-delete grace period has elapsed."""
    from services.admin_service import purge_expired_soft_deleted_users
    logger.info("⏰ Running expired soft-deleted users purge job...")
    db = SessionLocal()
    try:
        result = purge_expired_soft_deleted_users(db, retention_days=30)
        logger.info(f"✅ User purge job finished: {result.get('purged_count', 0)} users purged.")
    except Exception as e:
        logger.error(f"❌ User purge job error: {e}")
    finally:
        db.close()


async def check_approval_deadlines_job():
    """Check pending post approval deadlines and reminders."""
    from services.approval_service import check_deadlines_and_reminders
    db = SessionLocal()
    try:
        res = await check_deadlines_and_reminders(db)
        if res.get("reminders_sent") or res.get("skipped_count"):
            logger.info(f"⏰ Approval check: {res['reminders_sent']} reminders sent, {res['skipped_count']} posts skipped.")
    except Exception as e:
        logger.error(f"Approval deadline check error: {e}")
    finally:
        db.close()


async def check_and_publish_due_posts_job():
    """
    Periodic job running every 30 seconds directly in AsyncIOScheduler.
    Finds ScheduledPost records whose scheduled_at <= utcnow() and status in ('Scheduled', 'Draft')
    and publishes them via the canonical execute_social_publish function.
    """
    from models.models import ScheduledPost
    from services.publishing.publish_service import execute_social_publish
    from datetime import datetime

    db = SessionLocal()
    try:
        now = datetime.utcnow()
        due_posts = db.query(ScheduledPost).filter(
            ScheduledPost.scheduled_at <= now,
            ScheduledPost.status.in_(["Scheduled", "Draft"])
        ).limit(20).all()

        if not due_posts:
            return

        logger.info(f"⏰ [Publish Agent] Found {len(due_posts)} due scheduled post(s) to publish live.")

        for post in due_posts:
            # Idempotency guard
            if post.status == "Published" and post.external_post_id:
                continue

            post.status = "Publishing"
            db.commit()

            try:
                result = await execute_social_publish(
                    db=db,
                    platform=post.platform,
                    brand_id=post.brand_id,
                    caption=post.caption,
                    image_url=post.media_url,
                    platform_copy_id=post.platform_copy_id,
                    scheduled_post_id=post.id
                )
                if result.success:
                    logger.info(f"✅ [Publish Agent] Successfully published scheduled post {post.id} ({post.platform}): {result.external_post_id}")
                else:
                    logger.warning(f"⚠️ [Publish Agent] Failed publishing post {post.id} ({post.platform}): {result.error}")
            except Exception as pub_err:
                logger.error(f"❌ [Publish Agent] Error publishing post {post.id}: {pub_err}")
                post.status = "Failed"
                post.error = str(pub_err)
                db.commit()
    except Exception as e:
        logger.error(f"❌ [Publish Agent] check_and_publish_due_posts_job error: {e}")
    finally:
        db.close()


# ═══════════════════════════════════════════════════════════
# SCHEDULER SETUP
# ═══════════════════════════════════════════════════════════
def start_scheduler():
    """Initialize and start the background scheduler."""
    # Periodic check to publish due scheduled posts live (every 30 seconds)
    scheduler.add_job(
        check_and_publish_due_posts_job,
        "interval",
        seconds=30,
        id="publish_due_scheduled_posts",
        replace_existing=True,
        name="Publish Due Scheduled Posts Live"
    )

    # Daily questions at configured hour
    scheduler.add_job(
        generate_daily_questions,
        CronTrigger(hour=DAILY_QUESTIONS_HOUR, minute=0),
        id="daily_questions",
        replace_existing=True,
        name="Generate Daily Smart Questions"
    )

    # Weekly guidance on Monday at 7 AM
    scheduler.add_job(
        generate_weekly_guidance,
        CronTrigger(day_of_week=WEEKLY_GUIDANCE_DAY, hour=7, minute=0),
        id="weekly_guidance",
        replace_existing=True,
        name="Generate Weekly Content Guidance"
    )

    # Daily account retention purge at 3 AM
    scheduler.add_job(
        purge_expired_soft_deleted_users_job,
        CronTrigger(hour=3, minute=0),
        id="purge_expired_users",
        replace_existing=True,
        name="Permanent Purge Expired Soft-Deleted Users (30-day grace period)"
    )

    # Periodic check for approver reminders and deadlines (every 10 minutes)
    scheduler.add_job(
        check_approval_deadlines_job,
        "interval",
        minutes=10,
        id="check_approval_deadlines",
        replace_existing=True,
        name="Check Approval Deadlines and Reminders"
    )

    scheduler.start()
    logger.info("🚀 Background scheduler started")


def stop_scheduler():
    """Gracefully stop the scheduler."""
    if scheduler.running:
        scheduler.shutdown()
        logger.info("🛑 Background scheduler stopped")
