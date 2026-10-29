import asyncio
import logging
from celery_app import celery_app
from database import SessionLocal
from models.models import Brand, AutopilotConfig
from services.autopilot.agent import autopilot_agent

logger = logging.getLogger(__name__)


def _run_async(coro):
    return asyncio.run(coro)


@celery_app.task(name="tasks.autopilot_tasks.run_weekly_autopilot_all_brands")
def run_weekly_autopilot_all_brands():
    """
    Weekly Celery scheduled job.
    Iterates over all brands with Autopilot enabled, generates 7 days of posts,
    evaluates through self-critique, and queues them as Pending Approval or Scheduled.
    """
    db = SessionLocal()
    try:
        brands = db.query(Brand).all()
        logger.info(f"[Celery Autopilot] Running weekly cycle for {len(brands)} registered brands.")

        for brand in brands:
            config = db.query(AutopilotConfig).filter(AutopilotConfig.brand_id == brand.id).first()
            if config and (not config.enabled or config.kill_switch):
                logger.info(f"[Celery Autopilot] Brand {brand.business_name} skipped (disabled or kill switch active).")
                continue

            try:
                _run_async(autopilot_agent.run_weekly_autopilot(brand_id=brand.id, db=db))
            except Exception as e:
                logger.error(f"[Celery Autopilot] Error executing autopilot for brand {brand.id}: {e}")

    finally:
        db.close()

