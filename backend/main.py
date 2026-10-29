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
from routers import calendar, oauth, webhooks, autopilot, analytics, admin as admin_router
app.include_router(calendar.router)
app.include_router(oauth.router)
app.include_router(webhooks.router)
app.include_router(autopilot.router)
app.include_router(analytics.router)
app.include_router(admin_router.router)

# ─── Direct /brand-kit Route Aliases ───────────────────────
from routers.brand import get_brand_kit, update_brand_kit
from models.schemas import BrandKitResponse
app.add_api_route("/brand-kit", get_brand_kit, methods=["GET"], response_model=BrandKitResponse, tags=["brand-kit"])
app.add_api_route("/brand-kit", update_brand_kit, methods=["PUT"], response_model=BrandKitResponse, tags=["brand-kit"])

# ─── Static Files (Fallback) ──────────────────────────────
os.makedirs(PROCESSED_IMAGES_DIR, exist_ok=True)
app.mount("/static", StaticFiles(directory=PROCESSED_IMAGES_DIR), name="static")

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
