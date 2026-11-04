import os
import redis
from celery import Celery
from config import REDIS_URL

broker_url = REDIS_URL
backend_url = REDIS_URL

# Check Redis connectivity; if unreachable on local dev/Windows, fallback to SQLite transport
try:
    r = redis.Redis.from_url(REDIS_URL, socket_connect_timeout=0.8)
    r.ping()
except Exception:
    base_dir = os.path.dirname(os.path.abspath(__file__))
    broker_db = os.path.join(base_dir, "celery_broker.sqlite").replace("\\", "/")
    broker_url = f"sqla+sqlite:///{broker_db}"
    backend_url = f"db+sqlite:///{broker_db}"

celery_app = Celery(
    "brandflux_publishing",
    broker=broker_url,
    backend=backend_url,
    include=["tasks.publishing_tasks", "tasks.autopilot_tasks"]
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_time_limit=300,  # 5 minutes maximum runtime
    broker_connection_retry_on_startup=True,
    beat_schedule={
        "check-due-scheduled-posts-every-minute": {
            "task": "tasks.publishing_tasks.check_and_publish_due_posts",
            "schedule": 60.0,
        },
        "check-token-expiry-alerts-daily": {
            "task": "tasks.publishing_tasks.check_token_expiry_alerts",
            "schedule": 86400.0,  # once every 24 hours
        },
        "sync-daily-post-metrics": {
            "task": "tasks.publishing_tasks.sync_daily_post_metrics_task",
            "schedule": 86400.0,  # once every 24 hours
        },
        "run-weekly-autopilot-every-sunday": {
            "task": "tasks.autopilot_tasks.run_weekly_autopilot_all_brands",
            "schedule": 604800.0,  # once every 7 days
        }
    }
)

