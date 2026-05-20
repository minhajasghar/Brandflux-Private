from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import logging
import os
from dotenv import load_dotenv

load_dotenv()

from database import engine
import models.models as models
from services.scheduler import start_scheduler, stop_scheduler
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
    models.Base.metadata.create_all(bind=engine)
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

# ─── CORS ──────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
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

from fastapi.staticfiles import StaticFiles
app.mount("/static", StaticFiles(directory="c:/dev2/brandai/backend/processed_images"), name="static")


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
