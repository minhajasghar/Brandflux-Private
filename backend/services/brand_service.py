import json
import logging
from typing import Optional, Dict, Any
from sqlalchemy.orm import Session
from fastapi import HTTPException

from models.models import User, Brand

logger = logging.getLogger(__name__)

# Plan brand limits as specified: Starter 1, Growth 3, Pro 10
PLAN_BRAND_LIMITS = {
    "free": 1,
    "starter": 1,
    "growth": 3,
    "pro": 10,
    "agency": 25
}


def get_plan_brand_limit(plan: Optional[str]) -> int:
    """Return maximum allowed brands for a given subscription plan."""
    norm_plan = (plan or "starter").lower().strip()
    return PLAN_BRAND_LIMITS.get(norm_plan, 1)


def resolve_user_brand(
    user: User,
    db: Session,
    brand_id: Optional[str] = None
) -> Optional[Brand]:
    """
    Resolve the active brand for a user:
    1. If explicit brand_id provided, verify ownership.
    2. Else if user.active_brand_id is set, verify ownership.
    3. Else fallback to user's first created brand.
    """
    # Guard against FastAPI Query object when endpoints are called directly in tests
    if brand_id and not isinstance(brand_id, str):
        brand_id = getattr(brand_id, "default", None)
        if not isinstance(brand_id, str):
            brand_id = None

    if brand_id:
        brand = db.query(Brand).filter(Brand.id == brand_id, Brand.user_id == user.id).first()
        if brand:
            return brand

    if user.active_brand_id:
        brand = db.query(Brand).filter(Brand.id == user.active_brand_id, Brand.user_id == user.id).first()
        if brand:
            return brand

    brand = db.query(Brand).filter(Brand.user_id == user.id).order_by(Brand.created_at.asc()).first()
    if brand and not user.active_brand_id:
        user.active_brand_id = brand.id
        db.commit()
    return brand


def build_brand_kit_dict(brand: Brand) -> Dict[str, Any]:
    """Assemble a complete brand kit dictionary from brand columns."""
    return {
        "id": brand.id,
        "name": brand.name or brand.business_name,
        "business_name": brand.business_name or brand.name,
        "tagline": brand.tagline,
        "website_url": brand.website_url,
        "business_type": brand.business_type,
        "industry": brand.industry,
        "target_audience": brand.target_audience,
        "brand_tone": brand.brand_tone,
        "brand_voice": brand.brand_voice,
        "brand_personality": brand.brand_personality,
        "brand_keywords": brand.brand_keywords or [],
        "content_themes": brand.content_themes or [],
        "products_services": brand.products_services or brand.detected_products or [],
        "primary_color": brand.primary_color or "#1558C9",
        "secondary_color": brand.secondary_color or "#D4FF24",
        "colors": brand.colors or ["#1558C9", "#D4FF24"],
        "logo_url": brand.logo_url,
        "clean_logo_url": brand.clean_logo_url or brand.logo_url,
        "logo_style": brand.logo_style,
        "primary_font": brand.primary_font or "Plus Jakarta Sans",
        "secondary_font": brand.secondary_font or "Plus Jakarta Sans"
    }


def sync_brand_kit_to_columns(brand: Brand, kit: Dict[str, Any]) -> None:
    """Synchronize JSON brand_kit attributes onto individual Brand columns."""
    if "business_name" in kit and kit["business_name"]:
        brand.business_name = kit["business_name"]
        brand.name = kit["business_name"]
    elif "name" in kit and kit["name"]:
        brand.name = kit["name"]
        brand.business_name = kit["name"]

    if "tagline" in kit: brand.tagline = kit["tagline"]
    if "website_url" in kit: brand.website_url = kit["website_url"]
    if "business_type" in kit: brand.business_type = kit["business_type"]
    if "industry" in kit: brand.industry = kit["industry"]
    if "target_audience" in kit: brand.target_audience = kit["target_audience"]
    if "brand_tone" in kit: brand.brand_tone = kit["brand_tone"]
    if "brand_voice" in kit: brand.brand_voice = kit["brand_voice"]
    if "brand_personality" in kit: brand.brand_personality = kit["brand_personality"]
    if "brand_keywords" in kit: brand.brand_keywords = kit["brand_keywords"]
    if "content_themes" in kit: brand.content_themes = kit["content_themes"]
    if "products_services" in kit: brand.products_services = kit["products_services"]
    if "primary_color" in kit: brand.primary_color = kit["primary_color"]
    if "secondary_color" in kit: brand.secondary_color = kit["secondary_color"]
    if "colors" in kit: brand.colors = kit["colors"]
    if "logo_url" in kit: brand.logo_url = kit["logo_url"]
    if "clean_logo_url" in kit: brand.clean_logo_url = kit["clean_logo_url"]
    if "logo_style" in kit: brand.logo_style = kit["logo_style"]
    if "primary_font" in kit: brand.primary_font = kit["primary_font"]
    if "secondary_font" in kit: brand.secondary_font = kit["secondary_font"]

    # Store full JSON representation
    brand.brand_kit = build_brand_kit_dict(brand)
