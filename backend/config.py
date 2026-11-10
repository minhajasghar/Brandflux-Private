import os
from typing import List
from dotenv import load_dotenv

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# ─── Load Environment Variables ────────────────────────────
env_path = os.path.join(BASE_DIR, ".env")
load_dotenv(env_path)
load_dotenv()

# ─── Database Configuration ────────────────────────────────
DEFAULT_SQLITE_PATH = os.path.join(BASE_DIR, "brandai.db").replace("\\", "/")
DATABASE_URL_ENV = os.getenv("DATABASE_URL", "")

if DATABASE_URL_ENV:
    # If a relative SQLite path like sqlite:///./brandai.db is given, pin it to backend/brandai.db
    if DATABASE_URL_ENV.startswith("sqlite:///./"):
        db_filename = DATABASE_URL_ENV.replace("sqlite:///./", "")
        DATABASE_URL = f"sqlite:///{os.path.join(BASE_DIR, db_filename).replace(chr(92), '/')}"
    else:
        DATABASE_URL = DATABASE_URL_ENV
else:
    DATABASE_URL = f"sqlite:///{DEFAULT_SQLITE_PATH}"
# Fix SQLAlchemy dialect for heroku/render style URLs if present
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

# ─── Redis Configuration ───────────────────────────────────
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")

# ─── CORS Allowed Origins ──────────────────────────────────
CORS_ALLOWED_ORIGINS_RAW = os.getenv(
    "CORS_ALLOWED_ORIGINS",
    "http://localhost:3000,http://127.0.0.1:3000"
)
CORS_ALLOWED_ORIGINS: List[str] = [
    origin.strip()
    for origin in CORS_ALLOWED_ORIGINS_RAW.split(",")
    if origin.strip()
]

# ─── Cloudflare R2 / S3-Compatible Storage ─────────────────
R2_ACCOUNT_ID = os.getenv("R2_ACCOUNT_ID", "").strip()
R2_ACCESS_KEY_ID = os.getenv("R2_ACCESS_KEY_ID", "").strip()
R2_SECRET_ACCESS_KEY = os.getenv("R2_SECRET_ACCESS_KEY", "").strip()
R2_BUCKET_NAME = os.getenv("R2_BUCKET_NAME", "brandflux-media").strip()
R2_PUBLIC_URL = os.getenv("R2_PUBLIC_URL", "").strip().rstrip("/")
R2_ENDPOINT_URL = (
    os.getenv("R2_ENDPOINT_URL")
    or (f"https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com" if R2_ACCOUNT_ID else "")
)

# ─── Rate Limiting ─────────────────────────────────────────
RATE_LIMIT_CONTENT_GEN = os.getenv("RATE_LIMIT_CONTENT_GEN", "5/minute")
RATE_LIMIT_SESSION_GEN = os.getenv("RATE_LIMIT_SESSION_GEN", "5/minute")
RATE_LIMIT_WEBSITE_SCAN = os.getenv("RATE_LIMIT_WEBSITE_SCAN", "20/minute")

# ─── Directories (Fallback & Temp) ─────────────────────────
PROCESSED_IMAGES_DIR = os.path.join(BASE_DIR, "processed_images")
os.makedirs(PROCESSED_IMAGES_DIR, exist_ok=True)

# ─── Gemini AI & Image Generation ─────────────────────────
ALLOW_PAID_GENERATION = os.getenv("ALLOW_PAID_GENERATION", "true").strip().lower() in ("true", "1", "yes")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "").strip().strip('"').strip("'")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "models/gemini-2.5-flash").strip()
IMAGE_MODEL = os.getenv("IMAGE_MODEL", "models/gemini-nano-banana-2.1").strip()

# ─── Auth & Security ───────────────────────────────────────
SECRET_KEY = os.getenv("SECRET_KEY", "brandflux-super-secret-key-12345")
JWT_ALGORITHM = "HS256"
JWT_EXPIRATION_DAYS = 7  # 7 days expiration

# Initial Admin Seeding Configuration
ADMIN_EMAIL = os.getenv("ADMIN_EMAIL", "admin@brandflux.ai").strip().lower()
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "Admin123!#Brandflux").strip()

# Fernet Encryption Key for Social OAuth Tokens
ENCRYPTION_KEY = os.getenv("ENCRYPTION_KEY", "").strip()

# ─── Social Media OAuth & Publishing ───────────────────────
META_APP_ID = os.getenv("META_APP_ID", "").strip()
META_APP_SECRET = os.getenv("META_APP_SECRET", "").strip()
META_REDIRECT_URI = os.getenv("META_REDIRECT_URI", "http://localhost:8000/oauth/meta/callback").strip()
META_WEBHOOK_VERIFY_TOKEN = os.getenv("META_WEBHOOK_VERIFY_TOKEN", "brandflux-meta-verify-token-12345").strip()

LINKEDIN_CLIENT_ID = os.getenv("LINKEDIN_CLIENT_ID", "").strip()
LINKEDIN_CLIENT_SECRET = os.getenv("LINKEDIN_CLIENT_SECRET", "").strip()
LINKEDIN_REDIRECT_URI = os.getenv("LINKEDIN_REDIRECT_URI", "http://localhost:8000/oauth/linkedin/callback").strip()

TIKTOK_CLIENT_KEY = os.getenv("TIKTOK_CLIENT_KEY", "").strip()
TIKTOK_CLIENT_SECRET = os.getenv("TIKTOK_CLIENT_SECRET", "").strip()
TIKTOK_REDIRECT_URI = os.getenv("TIKTOK_REDIRECT_URI", "https://brandflux-oauth.loca.lt/oauth/tiktok/callback").strip()

TWITTER_CLIENT_ID = os.getenv("TWITTER_CLIENT_ID", "").strip()
TWITTER_CLIENT_SECRET = os.getenv("TWITTER_CLIENT_SECRET", "").strip()
TWITTER_REDIRECT_URI = os.getenv("TWITTER_REDIRECT_URI", "http://localhost:8000/oauth/twitter/callback").strip()

# ─── Aggregator Feature Flag (e.g. Ayrshare) ────────────────
USE_SOCIAL_AGGREGATOR = os.getenv("USE_SOCIAL_AGGREGATOR", "false").lower() in ("true", "1", "yes")
AYRSHARE_API_KEY = os.getenv("AYRSHARE_API_KEY", "").strip()

# ─── Scraper ───────────────────────────────────────────────
SCRAPER_TIMEOUT = float(os.getenv("SCRAPER_TIMEOUT", "15.0"))
SCAN_STALE_MINUTES = int(os.getenv("SCAN_STALE_MINUTES", "30"))

# ─── Scheduler ─────────────────────────────────────────────
DAILY_QUESTIONS_HOUR = int(os.getenv("DAILY_QUESTIONS_HOUR", "6"))
WEEKLY_GUIDANCE_DAY = os.getenv("WEEKLY_GUIDANCE_DAY", "mon")

# ─── Email & In-App Notification System ─────────────────────
EMAIL_PROVIDER = os.getenv("EMAIL_PROVIDER", "dev").strip().lower()
APP_BASE_URL = os.getenv("APP_BASE_URL", "http://localhost:3000").strip().rstrip("/")
BACKEND_BASE_URL = os.getenv("BACKEND_BASE_URL", "http://localhost:8000").strip().rstrip("/")
EMAIL_API_KEY = os.getenv("EMAIL_API_KEY", "").strip()
EMAIL_FROM = os.getenv("EMAIL_FROM", "notifications@brandflux.ai").strip()
EMAIL_FROM_NAME = os.getenv("EMAIL_FROM_NAME", "Brandflux").strip()
EMAIL_REPLY_TO = os.getenv("EMAIL_REPLY_TO", "support@brandflux.ai").strip()
ADMIN_ALERT_EMAIL = os.getenv("ADMIN_ALERT_EMAIL", "admin@brandflux.ai").strip()

