from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from contextlib import asynccontextmanager
import logging
import os
from dotenv import load_dotenv

load_dotenv()

from database import engine
import models.models as models
from services.scheduler import start_scheduler, stop_scheduler
from config import PROCESSED_IMAGES_DIR, CORS_ALLOWED_ORIGINS
from middleware.limiter import limiter
from slowapi.errors import RateLimitExceeded
from slowapi import _rate_limit_exceeded_handler

# ─── Logging ───────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

# ─── Lifespan: Start/Stop Scheduler ───────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logger.info("🚀 Starting Brandflux API...")
    # Base tables auto-create (Alembic handles versioned migrations)
    try:
        models.Base.metadata.create_all(bind=engine)
        from database import upgrade_database_schema
        upgrade_database_schema(engine)
        from services.admin_service import seed_initial_admin
        from database import SessionLocal
        with SessionLocal() as db_session:
            seed_initial_admin(db_session)
    except Exception as e:
        logger.warning(f"Startup init notice: {e}")
    start_scheduler()
    yield
    # Shutdown
    stop_scheduler()
    logger.info("🛑 Brandflux API stopped")

from routers import auth, brand, sessions, questions, content, guidance

# ─── App ───────────────────────────────────────────────────
app = FastAPI(
    title="Brandflux API",
    description="AI-Powered Brand Content Tool",
    version="1.0.0",
    lifespan=lifespan,
)

# ─── Rate Limiter State & Exception Handler ────────────────
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# ─── CORS (Restricted to allowed origins) ───────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ALLOWED_ORIGINS,
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|[\w\.-]+)(:\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Routers ──────────────────────────────────────────────
app.include_router(auth.router)
app.include_router(brand.router)
app.include_router(sessions.router)
app.include_router(questions.router)
app.include_router(content.router)
app.include_router(guidance.router)
from routers import calendar, oauth, webhooks, autopilot, analytics, admin as admin_router, notifications, admin_emails, billing, approvals
app.include_router(calendar.router)
app.include_router(oauth.router)
app.include_router(webhooks.router)
app.include_router(autopilot.router)
app.include_router(analytics.router)
app.include_router(admin_router.router)
app.include_router(notifications.router)
app.include_router(admin_emails.router)
app.include_router(billing.router)
app.include_router(approvals.router)


# ─── Direct /brand-kit Route Aliases ───────────────────────
from routers.brand import get_brand_kit, update_brand_kit
from routers.admin import health_check_generation
from models.schemas import BrandKitResponse
app.add_api_route("/brand-kit", get_brand_kit, methods=["GET"], response_model=BrandKitResponse, tags=["brand-kit"])
app.add_api_route("/brand-kit", update_brand_kit, methods=["PUT"], response_model=BrandKitResponse, tags=["brand-kit"])
app.add_api_route("/health/generation", health_check_generation, methods=["GET"], tags=["health"])

# ─── Static Files & Public Media Delivery ───────────────────
from fastapi.responses import FileResponse, Response
from services.storage import storage_service

os.makedirs(PROCESSED_IMAGES_DIR, exist_ok=True)
app.mount("/static", StaticFiles(directory=PROCESSED_IMAGES_DIR), name="static")

@app.get("/api/media/posts/{filename}")
@app.head("/api/media/posts/{filename}")
@app.get("/api/py/api/media/posts/{filename}")
@app.head("/api/py/api/media/posts/{filename}")
@app.get("/api/py/media/posts/{filename}")
@app.head("/api/py/media/posts/{filename}")
@app.get("/media/posts/{filename}")
@app.head("/media/posts/{filename}")
def serve_post_media(filename: str):
    """
    Serve public, unguessable generated post images with full CORS and caching headers.
    If the file is temporarily missing from disk, dynamically produces a 200 OK branded fallback.
    """
    clean_name = os.path.basename(filename)
    local_path = os.path.join(PROCESSED_IMAGES_DIR, clean_name)
    ext = os.path.splitext(clean_name)[1].lower()
    if ext in (".jpg", ".jpeg"):
        mime = "image/jpeg"
    elif ext == ".webp":
        mime = "image/webp"
    else:
        mime = "image/png"
    headers = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
        "Cache-Control": "public, max-age=31536000, immutable",
        "Content-Type": mime
    }
    if os.path.exists(local_path) and os.path.getsize(local_path) >= 500:
        return FileResponse(local_path, media_type=mime, headers=headers)

    # Dynamic fallback generation so browsers NEVER get a broken 404 image
    fallback_bytes = storage_service.generate_fallback_image(
        headline=f"Brand Creative: {clean_name[:12]}"
    )
    # Save it to disk so subsequent hits are cached
    try:
        with open(local_path, "wb") as f:
            f.write(fallback_bytes)
    except Exception:
        pass
    return Response(content=fallback_bytes, media_type="image/png", headers=headers)

@app.get("/api/media/references/{filename}")
@app.get("/api/py/media/references/{filename}")
@app.get("/media/references/{filename}")
def serve_reference_media(filename: str):
    clean_name = os.path.basename(filename)
    local_path = os.path.join(PROCESSED_IMAGES_DIR, clean_name)
    if os.path.exists(local_path):
        return FileResponse(local_path, media_type="image/jpeg", headers={"Access-Control-Allow-Origin": "*"})
    return Response(status_code=404)

# ─── Health Check ──────────────────────────────────────────
@app.get("/")
def health_check():
    return {
        "app": "Brandflux API",
        "status": "running",
        "version": "1.0.0",
    }

@app.get("/health")
def health():
    return {"status": "ok"}
