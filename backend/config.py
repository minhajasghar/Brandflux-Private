import os
from dotenv import load_dotenv

load_dotenv()

# ─── Gemini AI ─────────────────────────────────────────────
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")

# ─── Auth ──────────────────────────────────────────────────
SECRET_KEY = os.getenv("SECRET_KEY", "brandflux-super-secret-key-12345")
JWT_ALGORITHM = "HS256"
JWT_EXPIRATION_DAYS = 7  # 7 days expiration

# ─── Scraper ───────────────────────────────────────────────
SCRAPER_TIMEOUT = 15.0
SCAN_STALE_MINUTES = 30  # Re-scan if last scan is older than this

# ─── Scheduler ─────────────────────────────────────────────
DAILY_QUESTIONS_HOUR = 6  # Generate daily questions at 6 AM
WEEKLY_GUIDANCE_DAY = "mon"  # Weekly tips on Monday
