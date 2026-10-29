import logging
from typing import Dict, Any, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, BackgroundTasks
from sqlalchemy.orm import Session
from pydantic import BaseModel

from database import get_db
from models.models import User, Brand, ScheduledPost
from middleware.auth import get_current_user
from services.analytics.metrics_collector import sync_brand_metrics
from services.analytics.learning_engine import learning_engine
from services.brand_service import resolve_user_brand

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/analytics", tags=["analytics"])


def get_user_brand(user: User, db: Session, brand_id: Optional[str] = None) -> Brand:
    brand = resolve_user_brand(user, db, brand_id=brand_id)
    if not brand:
        raise HTTPException(
            status_code=404,
            detail="No brand profile found. Please complete onboarding first."
        )
    return brand


@router.get("/overview")
def get_analytics_overview(
    days: int = Query(30, ge=1, le=365),
    brand_id: Optional[str] = Query(None),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Retrieve performance overview: KPI cards, platform distributions,
    and daily time series for graphing.
    """
    brand = get_user_brand(user, db, brand_id=brand_id)
    return learning_engine.get_performance_overview(brand.id, db, days=days)


@router.get("/top-bottom")
def get_top_and_bottom_posts(
    days: int = Query(30, ge=1, le=365),
    limit: int = Query(5, ge=1, le=20),
    brand_id: Optional[str] = Query(None),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Retrieve top N and bottom N performing posts for comparison and feedback.
    """
    brand = get_user_brand(user, db, brand_id=brand_id)
    return learning_engine.get_top_and_bottom_posts(brand.id, db, limit=limit, days=days)


@router.get("/what-worked")
def get_what_worked_summary(
    days: int = Query(30, ge=1, le=365),
    brand_id: Optional[str] = Query(None),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Synthesize an AI-driven 'What Worked vs What Didn't' summary with
    actionable rules for the next generation cycle.
    """
    brand = get_user_brand(user, db, brand_id=brand_id)
    return learning_engine.generate_what_worked_summary(brand.id, db, days=days)


@router.post("/sync")
async def trigger_metrics_sync(
    days: int = Query(30, ge=1, le=365),
    brand_id: Optional[str] = Query(None),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Manually pull and update post metrics (likes, comments, shares, reach)
    for all published posts.
    """
    brand = get_user_brand(user, db, brand_id=brand_id)
    result = await sync_brand_metrics(brand.id, db, days=days)
    return {
        "success": True,
        "message": f"Successfully synced metrics for {result['total_synced']} posts.",
        "brand_id": brand.id,
        "total_synced": result["total_synced"]
    }

