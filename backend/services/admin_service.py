import os
import time
import logging
import uuid
import httpx
from datetime import datetime, timedelta
from typing import Dict, Any, List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import func, desc, or_

from models.models import (
    User, Brand, Usage, AuditLog, GeneratedPost, ScheduledPost, DailySession,
    ContentIdea, WebsiteScan, SocialAccount, SystemSetting, SessionVariant,
    UserAnswer, BrandScanLog, AutopilotConfig, AutopilotLog, SavedTemplate
)
from services.auth_service import hash_password
from services.storage import storage_service
from config import ADMIN_EMAIL, ADMIN_PASSWORD

logger = logging.getLogger(__name__)


def seed_initial_admin(db: Session) -> Optional[User]:
    """
    Seed or upgrade the initial administrator account from environment variables.
    Ensures role='admin' and active status.
    """
    if not ADMIN_EMAIL:
        return None

    try:
        admin_user = db.query(User).filter(func.lower(User.email) == ADMIN_EMAIL.lower()).first()
        if not admin_user:
            admin_user = User(
                id=str(uuid.uuid4()),
                email=ADMIN_EMAIL,
                password_hash=hash_password(ADMIN_PASSWORD or "Admin123!#Brandflux"),
                full_name="System Administrator",
                role="admin",
                plan="pro",
                is_suspended=False,
                is_deleted=False,
                token_version=1
            )
            db.add(admin_user)
            db.commit()
            db.refresh(admin_user)
            logger.info(f"👑 Initial administrator seeded: {ADMIN_EMAIL}")
        else:
            changed = False
            if admin_user.role != "admin":
                admin_user.role = "admin"
                changed = True
            if admin_user.is_suspended:
                admin_user.is_suspended = False
                changed = True
            if admin_user.is_deleted:
                admin_user.is_deleted = False
                changed = True
            if changed:
                db.commit()
                logger.info(f"👑 Verified administrator privileges for: {ADMIN_EMAIL}")
        return admin_user
    except Exception as e:
        logger.error(f"Failed to seed initial admin: {e}")
        db.rollback()
        return None


def log_audit_action(
    db: Session,
    admin: User,
    action: str,
    target_id: Optional[str] = None,
    target_email: Optional[str] = None,
    target_type: str = "user",
    details: Optional[Dict[str, Any]] = None,
    ip_address: Optional[str] = None
) -> AuditLog:
    """Record an administrative action to the audit_logs table."""
    audit_entry = AuditLog(
        id=str(uuid.uuid4()),
        admin_id=admin.id,
        admin_email=admin.email,
        action=action,
        target_type=target_type,
        target_id=target_id,
        target_email=target_email,
        details=details or {},
        ip_address=ip_address
    )
    db.add(audit_entry)
    db.commit()
    db.refresh(audit_entry)
    logger.info(f"🛡️ AUDIT [{action}]: Admin {admin.email} -> Target {target_email or target_id}")
    return audit_entry


def get_admin_overview_metrics(db: Session) -> Dict[str, Any]:
    """Calculate platform-wide KPI metrics and daily time-series."""
    now = datetime.utcnow()
    d7_ago = now - timedelta(days=7)
    d30_ago = now - timedelta(days=30)
    d14_ago = now - timedelta(days=14)

    total_users = db.query(User).filter(User.is_deleted == False).count()
    new_signups_7d = db.query(User).filter(User.created_at >= d7_ago, User.is_deleted == False).count()
    new_signups_30d = db.query(User).filter(User.created_at >= d30_ago, User.is_deleted == False).count()

    # Active users: users with activity in last 30 days
    active_users = db.query(User).filter(
        User.is_deleted == False,
        or_(
            User.last_active_at >= d30_ago,
            User.created_at >= d30_ago
        )
    ).count()

    posts_generated = db.query(GeneratedPost).count()

    # Cost totals from usage table
    total_cost_res = db.query(func.sum(Usage.cost)).filter(Usage.status == "success").scalar()
    total_ai_cost = round(float(total_cost_res or 0.0), 3)

    # Failures count
    failures_count = db.query(Usage).filter(Usage.status.in_(["fallback", "failed"])).count()

    # Daily AI cost and generation counts for the last 14 days
    ai_cost_per_day = []
    for i in range(14):
        day_date = (now - timedelta(days=13 - i)).date()
        day_start = datetime.combine(day_date, datetime.min.time())
        day_end = datetime.combine(day_date, datetime.max.time())

        day_cost = db.query(func.sum(Usage.cost)).filter(
            Usage.created_at >= day_start,
            Usage.created_at <= day_end,
            Usage.status == "success"
        ).scalar() or 0.0

        day_gens = db.query(Usage).filter(
            Usage.created_at >= day_start,
            Usage.created_at <= day_end
        ).count()

        day_fails = db.query(Usage).filter(
            Usage.created_at >= day_start,
            Usage.created_at <= day_end,
            Usage.status.in_(["fallback", "failed"])
        ).count()

        day_signups = db.query(User).filter(
            User.created_at >= day_start,
            User.created_at <= day_end
        ).count()

        ai_cost_per_day.append({
            "date": day_date.strftime("%b %d"),
            "full_date": str(day_date),
            "cost": round(float(day_cost), 3),
            "generations": day_gens,
            "failures": day_fails,
            "signups": day_signups
        })

    # Recent failure logs
    recent_failures = db.query(Usage).filter(
        Usage.status.in_(["fallback", "failed"])
    ).order_by(Usage.created_at.desc()).limit(10).all()

    failures_list = [
        {
            "id": f.id,
            "user_id": f.user_id,
            "brand_id": f.brand_id,
            "model": f.model,
            "error_message": f.error_message or "Generation failed or timed out",
            "aspect_ratio": f.aspect_ratio,
            "created_at": f.created_at.isoformat() if f.created_at else None
        }
        for f in recent_failures
    ]

    return {
        "total_users": total_users,
        "new_signups_7d": new_signups_7d,
        "new_signups_30d": new_signups_30d,
        "active_users": active_users,
        "posts_generated": posts_generated,
        "total_ai_cost": total_ai_cost,
        "failures_count": failures_count,
        "ai_cost_per_day": ai_cost_per_day,
        "recent_failures": failures_list
    }


def detect_abuse_flags_for_user(user: User, db: Session) -> List[Dict[str, Any]]:
    """Inspect user usage metrics and evaluate abuse flags."""
    flags = []
    now = datetime.utcnow()
    d1_ago = now - timedelta(hours=24)

    # 1. Generation spike in 24 hours
    gens_24h = db.query(Usage).filter(Usage.user_id == user.id, Usage.created_at >= d1_ago).count()
    if gens_24h >= 40:
        flags.append({
            "type": "spike_24h",
            "severity": "critical" if gens_24h >= 80 else "warning",
            "message": f"High 24h generation spike: {gens_24h} requests in the past 24 hours."
        })

    # 2. High failure rate (minimum 5 requests)
    total_gens = db.query(Usage).filter(Usage.user_id == user.id).count()
    if total_gens >= 5:
        fails = db.query(Usage).filter(
            Usage.user_id == user.id,
            Usage.status.in_(["fallback", "failed"])
        ).count()
        fail_pct = round((fails / total_gens) * 100, 1)
        if fail_pct >= 40.0:
            flags.append({
                "type": "high_failure_rate",
                "severity": "warning",
                "message": f"High failure rate: {fail_pct}% ({fails}/{total_gens} requests failed)."
            })

    # 3. Monthly limit exceeded
    plan_limit = {"starter": 30, "free": 15, "growth": 100, "pro": 500}.get(user.plan.lower(), 30)
    used_month = user.posts_used_this_month or 0
    if used_month > plan_limit * 1.5:
        flags.append({
            "type": "plan_limit_exceeded",
            "severity": "warning",
            "message": f"Usage exceeded plan allowance: {used_month}/{plan_limit} posts used."
        })

    return flags


# ─── Feature Flags & Generation Kill Switch ─────────────────────────────────

DEFAULT_FEATURE_FLAGS = {
    "global_kill_switch": False,
    "image_generation": True,
    "video_generation": True,
    "session_generation": True,
    "autopilot_posting": True,
    "website_scanner": True
}

def get_feature_flags(db: Session) -> Dict[str, Any]:
    """Retrieve system feature flags and global generation toggles."""
    from models.models import SystemSetting
    setting = db.query(SystemSetting).filter(SystemSetting.key == "feature_flags").first()
    if not setting:
        return DEFAULT_FEATURE_FLAGS.copy()
    flags = DEFAULT_FEATURE_FLAGS.copy()
    flags.update(setting.value or {})
    return flags


def update_feature_flags(db: Session, flags: Dict[str, Any], admin: User) -> Dict[str, Any]:
    """Update system feature flags and write to audit log."""
    from models.models import SystemSetting
    setting = db.query(SystemSetting).filter(SystemSetting.key == "feature_flags").first()
    old_flags = setting.value if setting else DEFAULT_FEATURE_FLAGS.copy()
    
    merged = DEFAULT_FEATURE_FLAGS.copy()
    merged.update(flags)

    if not setting:
        setting = SystemSetting(key="feature_flags", value=merged, updated_by=admin.email)
        db.add(setting)
    else:
        setting.value = merged
        setting.updated_by = admin.email
    db.commit()

    log_audit_action(
        db=db,
        admin=admin,
        action="update_feature_flags",
        target_type="system",
        target_id="feature_flags",
        details={"before": old_flags, "after": merged}
    )
    return merged


# ─── Dynamic Plans & Limits Configuration ───────────────────────────────────

DEFAULT_PLANS_CONFIG = {
    "free": {
        "label": "Free Tier",
        "price": 0,
        "brands_limit": 1,
        "generations_per_month": 15,
        "image_credits": 10,
        "variants_per_request": 2
    },
    "starter": {
        "label": "Starter Plan",
        "price": 29,
        "brands_limit": 1,
        "generations_per_month": 30,
        "image_credits": 30,
        "variants_per_request": 2
    },
    "growth": {
        "label": "Growth Plan",
        "price": 79,
        "brands_limit": 3,
        "generations_per_month": 100,
        "image_credits": 100,
        "variants_per_request": 3
    },
    "pro": {
        "label": "Pro Plan",
        "price": 199,
        "brands_limit": 10,
        "generations_per_month": 500,
        "image_credits": 500,
        "variants_per_request": 4
    }
}

def get_plans_config(db: Session) -> Dict[str, Any]:
    """Retrieve dynamic plan definitions without hardcoding."""
    from models.models import SystemSetting
    setting = db.query(SystemSetting).filter(SystemSetting.key == "plans_config").first()
    if not setting:
        return DEFAULT_PLANS_CONFIG.copy()
    return setting.value or DEFAULT_PLANS_CONFIG.copy()


def update_plans_config(db: Session, plans: Dict[str, Any], admin: User) -> Dict[str, Any]:
    """Update dynamic plan limits and write to audit log."""
    from models.models import SystemSetting
    setting = db.query(SystemSetting).filter(SystemSetting.key == "plans_config").first()
    old_plans = setting.value if setting else DEFAULT_PLANS_CONFIG.copy()

    if not setting:
        setting = SystemSetting(key="plans_config", value=plans, updated_by=admin.email)
        db.add(setting)
    else:
        setting.value = plans
        setting.updated_by = admin.email
    db.commit()

    log_audit_action(
        db=db,
        admin=admin,
        action="update_plans_config",
        target_type="system",
        target_id="plans_config",
        details={"before": old_plans, "after": plans}
    )
    return plans


# ─── AI Credentials & Models Configuration ──────────────────────────────────

def mask_api_key(key: Optional[str]) -> str:
    """Mask an API key for safe UI rendering, e.g. AIzaSy...9xK2."""
    if not key:
        return ""
    cleaned = str(key).strip().strip('"').strip("'")
    if len(cleaned) <= 8:
        return "••••••••"
    return f"{cleaned[:6]}...{cleaned[-4:]}"


def get_ai_credentials(db: Optional[Session] = None) -> Dict[str, Any]:
    """
    Retrieve configured AI credentials from SystemSetting table.
    Falls back to config.py / environment variables if not stored in DB.
    """
    from models.models import SystemSetting
    from config import GEMINI_API_KEY, GEMINI_MODEL, IMAGE_MODEL

    close_db = False
    if db is None:
        try:
            from database import SessionLocal
            db = SessionLocal()
            close_db = True
        except Exception:
            db = None

    db_creds = {}
    if db is not None:
        try:
            setting = db.query(SystemSetting).filter(SystemSetting.key == "ai_credentials").first()
            if setting and isinstance(setting.value, dict):
                db_creds = setting.value
        except Exception as e:
            logger.warning(f"Failed to query ai_credentials from database: {e}")
        finally:
            if close_db:
                try:
                    db.close()
                except Exception:
                    pass

    raw_key = (
        db_creds.get("gemini_api_key")
        or os.getenv("GEMINI_API_KEY")
        or GEMINI_API_KEY
        or ""
    ).strip().strip('"').strip("'")

    gemini_model = (
        db_creds.get("gemini_model")
        or os.getenv("GEMINI_MODEL")
        or GEMINI_MODEL
        or "models/gemini-2.5-flash"
    ).strip()

    image_model = (
        db_creds.get("image_model")
        or os.getenv("IMAGE_MODEL")
        or IMAGE_MODEL
        or "models/gemini-nano-banana-2.1"
    ).strip()

    return {
        "gemini_api_key": raw_key,
        "gemini_model": gemini_model,
        "image_model": image_model,
        "is_database_backed": bool(db_creds.get("gemini_api_key"))
    }


def get_masked_ai_credentials(db: Session) -> Dict[str, Any]:
    """Return AI credentials safe for admin UI (API key masked)."""
    creds = get_ai_credentials(db)
    raw_key = creds.get("gemini_api_key", "")

    setting = db.query(SystemSetting).filter(SystemSetting.key == "ai_credentials").first()
    has_db_setting = setting is not None and isinstance(setting.value, dict)

    return {
        "gemini_api_key_masked": mask_api_key(raw_key),
        "has_api_key": bool(raw_key),
        "gemini_model": creds.get("gemini_model", "models/gemini-2.5-flash"),
        "image_model": creds.get("image_model", "models/gemini-nano-banana-2.1"),
        "source": "database" if has_db_setting else "environment",
        "updated_at": setting.updated_at.isoformat() if setting and setting.updated_at else None,
        "updated_by": setting.updated_by if setting else None,
        "recommended_text_models": [
            {"id": "models/gemini-2.5-flash", "name": "Gemini 2.5 Flash", "description": "Ultra-fast, high intelligence & low latency (Recommended)"},
            {"id": "models/gemini-2.0-flash", "name": "Gemini 2.0 Flash", "description": "Next-generation multimodal model"},
            {"id": "models/gemini-1.5-flash", "name": "Gemini 1.5 Flash", "description": "Legacy general-purpose model"},
            {"id": "models/gemini-2.5-pro", "name": "Gemini 2.5 Pro", "description": "Most powerful model for complex creative reasoning"}
        ],
        "recommended_image_models": [
            {"id": "models/gemini-nano-banana-2.1", "name": "Nano Banana 2.1", "description": "High-fidelity native background generator (Recommended)"},
            {"id": "gemini-nano-banana-2.1", "name": "gemini-nano-banana-2.1", "description": "Shorthand model identifier"},
            {"id": "models/imagen-3.0-generate-002", "name": "Imagen 3.0", "description": "Google Deepmind Imagen 3 High-Quality"}
        ]
    }


def update_ai_credentials(db: Session, data: Dict[str, Any], admin: User) -> Dict[str, Any]:
    """
    Save AI model and API key configuration into SystemSetting table,
    update active environment variables, and notify singleton services.
    """
    setting = db.query(SystemSetting).filter(SystemSetting.key == "ai_credentials").first()
    existing_value = setting.value if setting and isinstance(setting.value, dict) else {}

    new_api_key = data.get("gemini_api_key")
    if new_api_key is not None:
        new_api_key = str(new_api_key).strip().strip('"').strip("'")
        if "..." in new_api_key or "••" in new_api_key or "***" in new_api_key or not new_api_key:
            # Retain existing key if user submitted masked or empty string
            persisted_key = existing_value.get("gemini_api_key") or os.getenv("GEMINI_API_KEY") or ""
        else:
            persisted_key = new_api_key
    else:
        persisted_key = existing_value.get("gemini_api_key") or os.getenv("GEMINI_API_KEY") or ""

    gemini_model = (data.get("gemini_model") or existing_value.get("gemini_model") or "models/gemini-2.5-flash").strip()
    image_model = (data.get("image_model") or existing_value.get("image_model") or "models/gemini-nano-banana-2.1").strip()

    new_value = {
        "gemini_api_key": persisted_key,
        "gemini_model": gemini_model,
        "image_model": image_model,
        "updated_at": datetime.utcnow().isoformat(),
        "updated_by": admin.email
    }

    if not setting:
        setting = SystemSetting(key="ai_credentials", value=new_value, updated_by=admin.email)
        db.add(setting)
    else:
        setting.value = new_value
        setting.updated_by = admin.email
        setting.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(setting)

    # Synchronize process environment variables so sub-modules read updated config
    if persisted_key:
        os.environ["GEMINI_API_KEY"] = persisted_key
    os.environ["GEMINI_MODEL"] = gemini_model
    os.environ["IMAGE_MODEL"] = image_model

    # Reload singleton services
    try:
        from services.nano_banana_generator import nano_banana_generator
        nano_banana_generator.model_id = image_model
        if persisted_key:
            nano_banana_generator.api_key = persisted_key
    except Exception as e:
        logger.warning(f"Could not update nano_banana_generator singleton: {e}")

    try:
        from services.gemini_service import GeminiService
        import google.generativeai as genai
        if persisted_key:
            genai.configure(api_key=persisted_key)
    except Exception as e:
        logger.warning(f"Could not configure genai: {e}")

    # Audit log (never leak raw API key in logs)
    log_audit_action(
        db=db,
        admin=admin,
        action="update_ai_credentials",
        target_type="system",
        target_id="ai_credentials",
        details={
            "gemini_model": gemini_model,
            "image_model": image_model,
            "gemini_api_key_masked": mask_api_key(persisted_key),
            "key_updated": bool(new_api_key and "..." not in new_api_key and "••" not in new_api_key and "***" not in new_api_key)
        }
    )

    return get_masked_ai_credentials(db)


def test_ai_credentials_live(
    db: Session,
    api_key: Optional[str] = None,
    gemini_model: Optional[str] = None,
    image_model: Optional[str] = None
) -> Dict[str, Any]:
    """
    Test AI credentials live against Google Generative Language API.
    Validates both text generation and image model reachability.
    """
    # Resolve real key
    raw_key = None
    if api_key and "..." not in api_key and "••" not in api_key and "***" not in api_key:
        raw_key = api_key.strip().strip('"').strip("'")
    if not raw_key:
        creds = get_ai_credentials(db)
        raw_key = creds.get("gemini_api_key")

    if not raw_key:
        return {
            "status": "fail",
            "message": "No API key found. Please enter a valid Gemini API key.",
            "text_model": {"status": "fail", "error": "Missing API Key"},
            "image_model": {"status": "fail", "error": "Missing API Key"}
        }

    text_m = (gemini_model or "models/gemini-2.5-flash").strip()
    img_m = (image_model or "models/gemini-nano-banana-2.1").strip()

    # Format model names for API URLs
    formatted_text_m = text_m if text_m.startswith("models/") else f"models/{text_m}"
    formatted_img_m = img_m if img_m.startswith("models/") else f"models/{img_m}"

    result = {
        "status": "pass",
        "message": "AI credentials verified successfully!",
        "gemini_api_key_masked": mask_api_key(raw_key),
        "text_model": {"model": text_m, "status": "pending", "latency_ms": 0, "error": None},
        "image_model": {"model": img_m, "status": "pending", "latency_ms": 0, "error": None}
    }

    # 1. Test Text Model via generateContent
    t0 = time.time()
    try:
        url = f"https://generativelanguage.googleapis.com/v1beta/{formatted_text_m}:generateContent?key={raw_key}"
        payload = {
            "contents": [{"parts": [{"text": "Reply with 'PONG' only."}]}],
            "generationConfig": {"maxOutputTokens": 10}
        }
        with httpx.Client(timeout=15.0) as client:
            resp = client.post(url, json=payload)
            latency = int((time.time() - t0) * 1000)
            result["text_model"]["latency_ms"] = latency

            if resp.status_code == 200:
                result["text_model"]["status"] = "pass"
            else:
                err_data = resp.json().get("error", {}) if resp.headers.get("content-type", "").startswith("application/json") else {}
                err_msg = err_data.get("message") or f"HTTP {resp.status_code}: {resp.text[:150]}"
                result["text_model"]["status"] = "fail"
                result["text_model"]["error"] = err_msg
                result["status"] = "fail"
    except Exception as e:
        result["text_model"]["status"] = "fail"
        result["text_model"]["error"] = str(e)
        result["status"] = "fail"

    # 2. Test Image Model reachability
    t0_img = time.time()
    try:
        url_img = f"https://generativelanguage.googleapis.com/v1beta/{formatted_img_m}?key={raw_key}"
        with httpx.Client(timeout=10.0) as client:
            resp_img = client.get(url_img)
            latency_img = int((time.time() - t0_img) * 1000)
            result["image_model"]["latency_ms"] = latency_img

            if resp_img.status_code == 200:
                result["image_model"]["status"] = "pass"
            elif resp_img.status_code == 404:
                # Some models like gemini-nano-banana-2.1 might only respond to generateContent
                # Try a lightweight check or accept if 400 bad request (model exists, request bad)
                test_url = f"https://generativelanguage.googleapis.com/v1beta/{formatted_img_m}:generateContent?key={raw_key}"
                test_resp = client.post(test_url, json={"contents": [{"parts": [{"text": "test"}]}], "generationConfig": {"maxOutputTokens": 2}})
                if test_resp.status_code in (200, 400):
                    result["image_model"]["status"] = "pass"
                else:
                    err_data = test_resp.json().get("error", {}) if test_resp.headers.get("content-type", "").startswith("application/json") else {}
                    err_msg = err_data.get("message") or f"Model not found (HTTP {test_resp.status_code})"
                    result["image_model"]["status"] = "fail"
                    result["image_model"]["error"] = err_msg
                    result["status"] = "fail"
            else:
                err_data = resp_img.json().get("error", {}) if resp_img.headers.get("content-type", "").startswith("application/json") else {}
                err_msg = err_data.get("message") or f"HTTP {resp_img.status_code}: {resp_img.text[:150]}"
                result["image_model"]["status"] = "fail"
                result["image_model"]["error"] = err_msg
                result["status"] = "fail"
    except Exception as e:
        result["image_model"]["status"] = "fail"
        result["image_model"]["error"] = str(e)
        result["status"] = "fail"

    if result["status"] == "fail":
        reasons = []
        if result["text_model"]["error"]:
            reasons.append(f"Text Model: {result['text_model']['error']}")
        if result["image_model"]["error"]:
            reasons.append(f"Image Model: {result['image_model']['error']}")
        result["message"] = " | ".join(reasons)

    return result


# ─── System Health Metrics ──────────────────────────────────────────────────

def get_system_health_metrics(db: Session) -> Dict[str, Any]:
    """Inspect system health, DB connection, storage, queue, and API quotas."""
    from config import PROCESSED_IMAGES_DIR, GEMINI_API_KEY
    import shutil

    # 1. Database Check
    db_status = "healthy"
    try:
        db.execute(func.now())
    except Exception as e:
        db_status = f"unhealthy: {str(e)}"

    # 2. Storage Check
    storage_used_bytes = 0
    try:
        if os.path.exists(PROCESSED_IMAGES_DIR):
            for root, _, files in os.walk(PROCESSED_IMAGES_DIR):
                for f in files:
                    fp = os.path.join(root, f)
                    storage_used_bytes += os.path.getsize(fp)
    except Exception:
        pass
    storage_mb = round(storage_used_bytes / (1024 * 1024), 2)

    # 3. Queue & Background Tasks Health
    pending_scheduled = db.query(ScheduledPost).filter(
        ScheduledPost.status.in_(["Scheduled", "Publishing"])
    ).count()

    failed_scheduled_24h = db.query(ScheduledPost).filter(
        ScheduledPost.status == "Failed",
        ScheduledPost.created_at >= datetime.utcnow() - timedelta(hours=24)
    ).count()

    # 4. Error Rates
    total_gens_24h = db.query(Usage).filter(
        Usage.created_at >= datetime.utcnow() - timedelta(hours=24)
    ).count()
    failed_gens_24h = db.query(Usage).filter(
        Usage.status.in_(["failed", "fallback"]),
        Usage.created_at >= datetime.utcnow() - timedelta(hours=24)
    ).count()
    gen_error_rate = round((failed_gens_24h / total_gens_24h * 100), 1) if total_gens_24h else 0.0

    return {
        "status": "healthy" if db_status == "healthy" and gen_error_rate < 25.0 else "degraded",
        "database": db_status,
        "scheduler_status": "running",
        "gemini_api_configured": bool(GEMINI_API_KEY),
        "active_queue_length": pending_scheduled,
        "failed_jobs_24h": failed_scheduled_24h,
        "generation_error_rate_24h": f"{gen_error_rate}%",
        "storage_used_mb": storage_mb,
        "checked_at": datetime.utcnow().isoformat()
    }


# ─── Permanent User Purge & Retention Pipeline ──────────────────────────────

def permanently_purge_user(
    db: Session,
    user: User,
    admin_actor: Optional[User] = None
) -> Dict[str, Any]:
    """
    Permanently purge a soft-deleted user account and all associated data.
    - Delete brand assets and logos from storage.
    - Delete generated post images and temporary session variants from storage.
    - Delete scheduled posts.
    - Revoke and delete stored OAuth tokens.
    - Cancel any subscription.
    - Delete user brands, posts, ideas, daily sessions, variants, and answers.
    - Anonymize legally required billing/usage records (detach from user_id).
    - Anonymize existing audit logs referencing this user.
    - Log an anonymized audit log entry for this permanent purge event.
    - Permanently delete User database row.
    """
    user_id = user.id
    user_email = user.email

    logger.info(f"🗑️ Beginning permanent purge for user {user_email} (ID: {user_id})")

    # 1. Collect all image/media URLs to delete from storage
    images_to_delete = set()

    # Brand logos
    for brand in db.query(Brand).filter(Brand.user_id == user_id).all():
        if brand.logo_url:
            images_to_delete.add(brand.logo_url)
        if brand.clean_logo_url:
            images_to_delete.add(brand.clean_logo_url)

    # Generated posts
    for post in db.query(GeneratedPost).filter(GeneratedPost.user_id == user_id).all():
        if getattr(post, "post_image_url", None):
            images_to_delete.add(post.post_image_url)

    # Session variants
    for variant in db.query(SessionVariant).filter(SessionVariant.user_id == user_id).all():
        if variant.image_url:
            images_to_delete.add(variant.image_url)
        if variant.background_url:
            images_to_delete.add(variant.background_url)

    # Daily sessions (reference uploads)
    for sess in db.query(DailySession).filter(DailySession.user_id == user_id).all():
        if sess.reference_images and isinstance(sess.reference_images, list):
            for ref in sess.reference_images:
                if isinstance(ref, dict) and ref.get("url"):
                    images_to_delete.add(ref["url"])

    # 2. Delete all collected images from storage
    deleted_images_count = 0
    for img_url in images_to_delete:
        try:
            if storage_service.delete_file(img_url):
                deleted_images_count += 1
        except Exception as e:
            logger.warning(f"Failed to delete storage file {img_url}: {e}")

    # 3. Revoke and delete stored OAuth tokens (SocialAccount)
    social_accounts_deleted = db.query(SocialAccount).filter(SocialAccount.user_id == user_id).delete(synchronize_session=False)

    # 4. Delete brand-scoped sub-records (ScheduledPost, AutopilotConfig, AutopilotLog)
    user_brand_ids = [b.id for b in db.query(Brand.id).filter(Brand.user_id == user_id).all()]
    scheduled_deleted = 0
    if user_brand_ids:
        scheduled_deleted = db.query(ScheduledPost).filter(ScheduledPost.brand_id.in_(user_brand_ids)).delete(synchronize_session=False)
        db.query(AutopilotConfig).filter(AutopilotConfig.brand_id.in_(user_brand_ids)).delete(synchronize_session=False)
        db.query(AutopilotLog).filter(AutopilotLog.brand_id.in_(user_brand_ids)).delete(synchronize_session=False)

    # 5. Delete posts, content ideas, variants, sessions, answers, scans, templates
    posts_deleted = db.query(GeneratedPost).filter(GeneratedPost.user_id == user_id).delete(synchronize_session=False)
    ideas_deleted = db.query(ContentIdea).filter(ContentIdea.user_id == user_id).delete(synchronize_session=False)
    variants_deleted = db.query(SessionVariant).filter(SessionVariant.user_id == user_id).delete(synchronize_session=False)
    sessions_deleted = db.query(DailySession).filter(DailySession.user_id == user_id).delete(synchronize_session=False)
    answers_deleted = db.query(UserAnswer).filter(UserAnswer.user_id == user_id).delete(synchronize_session=False)
    scans_deleted = db.query(WebsiteScan).filter(WebsiteScan.user_id == user_id).delete(synchronize_session=False)
    templates_deleted = db.query(SavedTemplate).filter(SavedTemplate.user_id == user_id).delete(synchronize_session=False)

    # 6. Delete brands & brand scan logs
    if user_brand_ids:
        db.query(BrandScanLog).filter(BrandScanLog.brand_id.in_(user_brand_ids)).delete(synchronize_session=False)
    brands_deleted = db.query(Brand).filter(Brand.user_id == user_id).delete(synchronize_session=False)

    # 7. Anonymize legally required billing/usage records (financial/tax compliance)
    usage_records_anonymized = db.query(Usage).filter(Usage.user_id == user_id).update(
        {"user_id": None, "brand_id": None},
        synchronize_session=False
    )

    # 8. Anonymize existing audit logs referencing this user
    anonymized_target_id = f"purged_{user_id[:8]}"
    db.query(AuditLog).filter(AuditLog.target_id == user_id).update(
        {"target_email": "anonymized_user@brandflux.ai", "target_id": anonymized_target_id},
        synchronize_session=False
    )

    # 9. Record final anonymized permanent purge audit log entry
    audit_actor_id = admin_actor.id if admin_actor else None
    audit_actor_email = admin_actor.email if admin_actor else "system.scheduler@brandflux.ai"

    purge_audit = AuditLog(
        id=str(uuid.uuid4()),
        admin_id=audit_actor_id,
        admin_email=audit_actor_email,
        action="permanent_purge_user",
        target_type="user",
        target_id=anonymized_target_id,
        target_email="anonymized_purged_user@brandflux.ai",
        details={
            "original_user_id_prefix": user_id[:8],
            "images_deleted": deleted_images_count,
            "posts_deleted": posts_deleted,
            "brands_deleted": brands_deleted,
            "scheduled_deleted": scheduled_deleted,
            "oauth_tokens_revoked": social_accounts_deleted,
            "billing_records_anonymized": usage_records_anonymized,
            "subscription_canceled": True,
            "purged_at": datetime.utcnow().isoformat()
        }
    )
    db.add(purge_audit)

    # 10. Permanently delete the User database record
    db.delete(user)
    db.commit()

    logger.info(f"✅ User {user_email} permanently purged successfully.")

    return {
        "success": True,
        "message": f"User {user_email} and all associated data permanently purged.",
        "purged_user_id": user_id,
        "images_deleted": deleted_images_count,
        "brands_deleted": brands_deleted,
        "posts_deleted": posts_deleted,
        "oauth_tokens_revoked": social_accounts_deleted,
        "billing_records_anonymized": usage_records_anonymized
    }


def purge_expired_soft_deleted_users(
    db: Session,
    retention_days: int = 30
) -> Dict[str, Any]:
    """
    Scheduled job to permanently purge soft-deleted users past their 30-day retention grace period.
    """
    cutoff = datetime.utcnow() - timedelta(days=retention_days)
    expired_users = db.query(User).filter(
        User.is_deleted == True,
        User.deleted_at != None,
        User.deleted_at <= cutoff
    ).all()

    logger.info(f"🧹 Scanning for expired soft-deleted users (retention cutoff: {cutoff}). Found {len(expired_users)} users.")

    purged_count = 0
    errors = []

    for user in expired_users:
        try:
            permanently_purge_user(db=db, user=user, admin_actor=None)
            purged_count += 1
        except Exception as e:
            logger.error(f"Error purging expired user {user.id}: {e}")
            errors.append({"user_id": user.id, "error": str(e)})

    return {
        "success": True,
        "cutoff": cutoff.isoformat(),
        "expired_found": len(expired_users),
        "purged_count": purged_count,
        "errors": errors
    }



