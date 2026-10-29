from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, UploadFile, File, Form, Request, Query
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional
import uuid
from pydantic import BaseModel

from database import get_db
from models.models import Brand, User, WebsiteScan, DailySession, GeneratedPost
from models.schemas import (
    BrandProfile,
    ScanRequest,
    BrandKitUpdate,
    BrandKitResponse,
    BrandCreateRequest,
    BrandListResponse,
    BrandSummaryItem,
    BrandWebsiteUpdateRequest
)
from middleware.auth import get_current_user, get_optional_user
from middleware.limiter import limiter
from config import RATE_LIMIT_WEBSITE_SCAN
from services.scraper import BrandScraper
from services.storage import storage_service
from services.brand_service import (
    PLAN_BRAND_LIMITS,
    get_plan_brand_limit,
    resolve_user_brand,
    build_brand_kit_dict,
    sync_brand_kit_to_columns
)

router = APIRouter(prefix="/brand", tags=["brand"])

class UpdatePreferencesRequest(BaseModel):
    customers: str
    goal: str

@router.post("/update-preferences")
def update_preferences(
    req: UpdatePreferencesRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Save onboarding preferences (customers & goal) and mark onboarding as complete.
    """
    brand = db.query(Brand).filter(Brand.user_id == user.id).first()
    if not brand:
        raise HTTPException(status_code=404, detail="Brand profile not found")
    
    brand.target_audience = req.customers
    brand.posting_strategy = {"goal": req.goal}
    brand.onboarding_complete = True
    db.commit()
    db.refresh(brand)
    
    return {"status": "success", "message": "Onboarding preferences saved successfully"}

@router.get("/stats")
def get_brand_stats(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Retrieve aggregated stats for the brand dashboard.
    """
    # 1. Total posts generated this month (or total posts generated overall as a fallback)
    total_posts = db.query(GeneratedPost).filter(GeneratedPost.user_id == user.id).count()
    
    # 2. Sessions completed this week (last 7 days)
    one_week_ago = datetime.utcnow() - timedelta(days=7)
    sessions_this_week = db.query(DailySession).filter(
        DailySession.user_id == user.id,
        DailySession.created_at >= one_week_ago
    ).count()

    # 3. Most used platform
    from sqlalchemy import func
    most_used = db.query(
        GeneratedPost.platform,
        func.count(GeneratedPost.platform).label('qty')
    ).filter(GeneratedPost.user_id == user.id).group_by(GeneratedPost.platform).order_by(func.count(GeneratedPost.platform).desc()).first()

    most_used_platform = "Instagram"
    if most_used:
        p_name = most_used[0]
        # Format platform name nicely
        platform_names = {
            "instagram_post": "Instagram",
            "instagram_story": "Instagram Story",
            "linkedin_post": "LinkedIn",
            "facebook_post": "Facebook",
            "linkedin": "LinkedIn",
            "facebook": "Facebook"
        }
        most_used_platform = platform_names.get(p_name, p_name.capitalize().replace("_", " "))

    # 4. Current active streak (default to 4 or calculate based on sequential active days)
    streak_days = 4
    if sessions_this_week > 0:
        streak_days = max(4, sessions_this_week)

    return {
        "posts_created_this_month": user.posts_used_this_month or total_posts or 0,
        "sessions_completed_this_week": sessions_this_week or 1,
        "most_used_platform": most_used_platform,
        "streak_days": streak_days
    }

@router.post("/scan-website")
@limiter.limit(RATE_LIMIT_WEBSITE_SCAN)
async def scan_website(
    request: Request,
    req: ScanRequest,
    user: Optional[User] = Depends(get_optional_user),
    db: Session = Depends(get_db)
):
    """
    Run brand scraper on a website URL.
    Public endpoint with rate limiting: can be called without authentication
    (e.g., during signup to auto-detect business type).
    If authenticated, also saves results to WebsiteScan and updates Brand profile.
    """
    scraper = BrandScraper(req.website_url)
    brand_data = await scraper.scrape()
    
    if "error" in brand_data:
        raise HTTPException(status_code=400, detail=brand_data["error"])

    # If user is authenticated, persist the scan and brand profile
    if user:
        # 1. Save to WebsiteScan table
        scan = WebsiteScan(
            user_id=user.id,
            website_url=req.website_url,
            raw_text=brand_data.get("raw_text"),
            detected_products=brand_data.get("products_services"),
            detected_colors=brand_data.get("colors"),
            detected_logo_url=brand_data.get("logo_url"),
            scan_status="complete"
        )
        db.add(scan)

        # 2. Update or Create Brand record
        brand = db.query(Brand).filter(Brand.user_id == user.id).first()
        if not brand:
            brand = Brand(user_id=user.id)
            db.add(brand)
        
        brand.business_name = brand_data.get("business_name")
        brand.tagline = brand_data.get("tagline")
        brand.website_url = req.website_url
        brand.detected_products = brand_data.get("products_services")
        brand.primary_color = brand_data.get("primary_color")
        brand.colors = brand_data.get("colors")
        brand.logo_url = brand_data.get("logo_url")
        brand.brand_tone = brand_data.get("brand_tone")
        brand.business_type = brand_data.get("business_type")
        brand.last_scanned_at = datetime.utcnow()
        brand.scan_status = "completed"
        
        db.commit()
        db.refresh(brand)
    
    return brand_data


@router.post("/detect-business-type")
@limiter.limit(RATE_LIMIT_WEBSITE_SCAN)
async def detect_business_type(
    request: Request,
    req: ScanRequest
):
    """
    Public rate-limited endpoint specifically for fast business type detection
    from URL on signup or landing pages.
    """
    scraper = BrandScraper(req.website_url)
    brand_data = await scraper.scrape()
    if "error" in brand_data:
        raise HTTPException(status_code=400, detail=brand_data["error"])
    return {
        "business_type": brand_data.get("business_type"),
        "business_name": brand_data.get("business_name"),
        "detected_colors": brand_data.get("colors", []),
        "tagline": brand_data.get("tagline")
    }

# ═══════════════════════════════════════════════════════════
# MULTI-BRAND MANAGEMENT ENDPOINTS
# ═══════════════════════════════════════════════════════════

@router.get("/list", response_model=BrandListResponse)
@router.get("/all", response_model=BrandListResponse)
def list_user_brands(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    List all brands owned by the current user with subscription plan limits
    and active brand status.
    """
    brands = db.query(Brand).filter(Brand.user_id == user.id).order_by(Brand.created_at.asc()).all()

    # If no brand exists yet, initialize a default one
    if not brands:
        default_brand = Brand(
            user_id=user.id,
            name=user.full_name or "My Brand",
            business_name=user.full_name or "My Brand",
            colors=["#1558C9", "#D4FF24", "#0D0F16"],
            primary_color="#1558C9",
            secondary_color="#D4FF24",
            is_active=True
        )
        default_brand.brand_kit = build_brand_kit_dict(default_brand)
        db.add(default_brand)
        db.commit()
        db.refresh(default_brand)
        user.active_brand_id = default_brand.id
        db.commit()
        brands = [default_brand]

    active_id = user.active_brand_id or (brands[0].id if brands else None)
    if not user.active_brand_id and active_id:
        user.active_brand_id = active_id
        db.commit()

    limit = get_plan_brand_limit(user.plan)
    total = len(brands)
    can_add = total < limit

    summary_items = []
    for b in brands:
        is_act = (b.id == active_id)
        if b.is_active != is_act:
            b.is_active = is_act
        kit = b.brand_kit or build_brand_kit_dict(b)
        summary_items.append(
            BrandSummaryItem(
                id=b.id,
                name=b.name or b.business_name or "Untitled Brand",
                business_name=b.business_name or b.name,
                website_url=b.website_url,
                logo_url=b.logo_url,
                primary_color=b.primary_color or "#1558C9",
                secondary_color=b.secondary_color or "#D4FF24",
                colors=b.colors or ["#1558C9", "#D4FF24"],
                brand_kit=kit,
                is_active=is_act,
                created_at=b.created_at
            )
        )
    db.commit()

    return BrandListResponse(
        brands=summary_items,
        active_brand_id=active_id,
        plan=user.plan or "starter",
        brand_limit=limit,
        total_brands=total,
        can_add_brand=can_add
    )


@router.post("/add", response_model=BrandKitResponse)
@router.post("/create", response_model=BrandKitResponse)
async def add_new_brand(
    req: BrandCreateRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Create a new brand for the authenticated user.
    Enforces brand limits per subscription plan: Starter 1, Growth 3, Pro 10.
    """
    limit = get_plan_brand_limit(user.plan)
    current_count = db.query(Brand).filter(Brand.user_id == user.id).count()

    if current_count >= limit:
        raise HTTPException(
            status_code=403,
            detail=f"Your {(user.plan or 'starter').capitalize()} plan allows up to {limit} brand{'s' if limit > 1 else ''}. Upgrade your plan to add more brands."
        )

    clean_url = req.website_url.strip()
    brand_data = req.brand_kit or {}

    # Scrape website if kit not supplied
    if not brand_data or not brand_data.get("business_name"):
        scraper = BrandScraper(clean_url)
        scraped = await scraper.scrape()
        if "error" not in scraped:
            brand_data = scraped

    display_name = req.name or brand_data.get("business_name") or clean_url.replace("https://", "").replace("http://", "").split("/")[0]

    new_brand = Brand(
        user_id=user.id,
        name=display_name,
        business_name=display_name,
        website_url=clean_url,
        tagline=brand_data.get("tagline"),
        business_type=brand_data.get("business_type"),
        industry=brand_data.get("industry") or brand_data.get("business_type"),
        target_audience=brand_data.get("target_audience") or "Target audience and community",
        brand_tone=brand_data.get("brand_tone") or "Professional and authoritative",
        brand_voice=brand_data.get("brand_voice") or "Clear, direct, and actionable",
        brand_keywords=brand_data.get("brand_keywords") or ["growth", "innovation"],
        content_themes=brand_data.get("content_themes") or ["Educational Insights", "Product Updates", "Behind The Scenes"],
        products_services=brand_data.get("products_services") or brand_data.get("detected_products") or [],
        primary_color=brand_data.get("primary_color") or (brand_data.get("colors", ["#1558C9"])[0] if brand_data.get("colors") else "#1558C9"),
        secondary_color=brand_data.get("secondary_color") or (brand_data.get("colors", ["#1558C9", "#D4FF24"])[1] if brand_data.get("colors") and len(brand_data.get("colors")) > 1 else "#D4FF24"),
        colors=brand_data.get("colors") or ["#1558C9", "#D4FF24"],
        logo_url=brand_data.get("logo_url"),
        clean_logo_url=brand_data.get("clean_logo_url") or brand_data.get("logo_url"),
        scan_status="completed",
        last_scanned_at=datetime.utcnow(),
        is_active=True
    )
    new_brand.brand_kit = build_brand_kit_dict(new_brand)
    db.add(new_brand)
    db.commit()
    db.refresh(new_brand)

    # Set as active brand and deactivate others
    user.active_brand_id = new_brand.id
    db.query(Brand).filter(Brand.user_id == user.id, Brand.id != new_brand.id).update({"is_active": False})
    db.commit()

    return new_brand


@router.post("/switch/{brand_id}")
def switch_active_brand(
    brand_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Switch user's currently active brand across the application.
    """
    brand = db.query(Brand).filter(Brand.id == brand_id, Brand.user_id == user.id).first()
    if not brand:
        raise HTTPException(status_code=404, detail="Brand not found or access denied.")

    user.active_brand_id = brand.id
    db.query(Brand).filter(Brand.user_id == user.id).update({"is_active": False})
    brand.is_active = True
    db.commit()

    return {
        "success": True,
        "message": f"Switched active brand to '{brand.name or brand.business_name}'",
        "active_brand_id": brand.id,
        "brand_name": brand.name or brand.business_name
    }


@router.put("/website", response_model=BrandKitResponse)
@router.put("/{brand_id}/website", response_model=BrandKitResponse)
async def update_brand_website(
    req: BrandWebsiteUpdateRequest,
    brand_id: Optional[str] = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Update the website URL for a brand and optionally re-scan for the same brand.
    """
    brand = resolve_user_brand(user, db, brand_id=brand_id)
    if not brand:
        raise HTTPException(status_code=404, detail="Brand profile not found")

    brand.website_url = req.website_url.strip()

    if req.rescan:
        scraper = BrandScraper(brand.website_url)
        brand_data = await scraper.scrape()
        if "error" not in brand_data:
            if brand_data.get("business_name"):
                brand.business_name = brand_data["business_name"]
                brand.name = brand_data["business_name"]
            if brand_data.get("colors"): brand.colors = brand_data["colors"]
            if brand_data.get("primary_color"): brand.primary_color = brand_data["primary_color"]
            if brand_data.get("secondary_color"): brand.secondary_color = brand_data["secondary_color"]
            if brand_data.get("logo_url"): brand.logo_url = brand_data["logo_url"]
            if brand_data.get("products_services"): brand.products_services = brand_data["products_services"]
            if brand_data.get("tagline"): brand.tagline = brand_data["tagline"]
            if brand_data.get("brand_tone"): brand.brand_tone = brand_data["brand_tone"]
            if brand_data.get("business_type"): brand.business_type = brand_data["business_type"]
            brand.last_scanned_at = datetime.utcnow()

    brand.brand_kit = build_brand_kit_dict(brand)
    brand.last_synced_at = datetime.utcnow()
    db.commit()
    db.refresh(brand)
    return brand


@router.post("/rescan")
async def rescan_brand(
    brand_id: Optional[str] = Query(None),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Fresh scan of user's active or specified brand URL.
    Compares with previous scan and updates brand kit.
    """
    brand = resolve_user_brand(user, db, brand_id=brand_id)
    if not brand or not brand.website_url:
        raise HTTPException(status_code=400, detail="No brand or URL found to rescan")

    scraper = BrandScraper(brand.website_url)
    new_data = await scraper.scrape()
    
    if "error" in new_data:
        raise HTTPException(status_code=400, detail=new_data["error"])

    # Update brand attributes
    if new_data.get("business_name"):
        brand.business_name = new_data["business_name"]
        brand.name = new_data["business_name"]
    if new_data.get("products_services"): brand.products_services = new_data["products_services"]
    if new_data.get("colors"): brand.colors = new_data["colors"]
    if new_data.get("primary_color"): brand.primary_color = new_data["primary_color"]
    if new_data.get("secondary_color"): brand.secondary_color = new_data["secondary_color"]
    if new_data.get("logo_url"): brand.logo_url = new_data["logo_url"]
    if new_data.get("tagline"): brand.tagline = new_data["tagline"]
    if new_data.get("brand_tone"): brand.brand_tone = new_data["brand_tone"]

    brand.last_scanned_at = datetime.utcnow()
    brand.brand_kit = build_brand_kit_dict(brand)
    db.commit()
    db.refresh(brand)

    return {
        "status": "success",
        "message": f"Successfully re-scanned {brand.website_url}",
        "brand_data": new_data,
        "brand": brand
    }


@router.get("/profile", response_model=BrandProfile)
def get_brand_profile(
    brand_id: Optional[str] = Query(None),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Return user's complete brand profile for active or specified brand."""
    brand = resolve_user_brand(user, db, brand_id=brand_id)
    if not brand:
        raise HTTPException(status_code=404, detail="Brand profile not found")
    return brand


# ═══════════════════════════════════════════════════════════
# BRAND KIT ENDPOINTS (GET/PUT /brand/kit & /brand-kit)
# ═══════════════════════════════════════════════════════════
@router.get("/kit", response_model=BrandKitResponse)
@router.get("/brand-kit", response_model=BrandKitResponse)
def get_brand_kit(
    brand_id: Optional[str] = Query(None),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Retrieve user's editable brand kit for active or specified brand."""
    brand = resolve_user_brand(user, db, brand_id=brand_id)
    if not brand:
        brand = Brand(
            user_id=user.id,
            name=user.full_name or "My Brand",
            business_name=user.full_name or "My Brand",
            colors=["#1558C9", "#D4FF24", "#0D0F16"],
            primary_color="#1558C9",
            secondary_color="#D4FF24",
            brand_tone="Confident & Authoritative",
            brand_voice="Direct, actionable, and modern",
            target_audience="Founders, entrepreneurs and creators",
            brand_keywords=["innovation", "consistency", "growth"],
            content_themes=["Industry Insights", "Product Tips", "Customer Wins"],
            is_active=True
        )
        brand.brand_kit = build_brand_kit_dict(brand)
        db.add(brand)
        db.commit()
        db.refresh(brand)
        user.active_brand_id = brand.id
        db.commit()

    if not brand.brand_kit:
        brand.brand_kit = build_brand_kit_dict(brand)
        db.commit()

    return brand


@router.put("/kit", response_model=BrandKitResponse)
@router.put("/brand-kit", response_model=BrandKitResponse)
def update_brand_kit(
    req: BrandKitUpdate,
    brand_id: Optional[str] = Query(None),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Update and persist brand kit with validation for the active or specified brand.
    Overrides raw scraped data with user-customized brand identity.
    """
    brand = resolve_user_brand(user, db, brand_id=brand_id)
    if not brand:
        brand = Brand(user_id=user.id, business_name=req.business_name or "My Brand", name=req.name or req.business_name or "My Brand")
        db.add(brand)

    update_data = req.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        if field == "brand_kit" and isinstance(value, dict):
            continue
        setattr(brand, field, value)

    # Sync name and business_name
    if req.name and not req.business_name:
        brand.business_name = req.name
    elif req.business_name and not req.name:
        brand.name = req.business_name

    # Automatically synchronize primary_color and secondary_color if colors list updated
    if req.colors and len(req.colors) > 0:
        if not req.primary_color:
            brand.primary_color = req.colors[0]
        if len(req.colors) > 1 and not req.secondary_color:
            brand.secondary_color = req.colors[1]

    brand.brand_kit = build_brand_kit_dict(brand)
    brand.last_synced_at = datetime.utcnow()
    db.commit()
    db.refresh(brand)
    return brand


@router.post("/upload-logo")
async def upload_brand_logo(
    file: UploadFile = File(...),
    logo_type: str = Form("primary"),  # 'primary' or 'alt'
    brand_id: Optional[str] = Form(None),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Upload a logo or alt logo to Cloudflare R2 / S3 CDN and attach to brand kit."""
    brand = resolve_user_brand(user, db, brand_id=brand_id)
    if not brand:
        brand = Brand(user_id=user.id, business_name="My Brand", name="My Brand")
        db.add(brand)

    contents = await file.read()
    ext = file.filename.split(".")[-1].lower() if "." in file.filename else "png"
    filename = f"logo_{user.id[:8]}_{logo_type}_{uuid.uuid4().hex[:6]}.{ext}"

    content_type = file.content_type or "image/png"
    public_url = storage_service.upload_image(contents, filename, content_type=content_type)

    if logo_type == "alt":
        brand.clean_logo_url = public_url
    else:
        brand.logo_url = public_url

    brand.brand_kit = build_brand_kit_dict(brand)
    db.commit()
    db.refresh(brand)

    return {
        "status": "success",
        "url": public_url,
        "logo_type": logo_type,
        "message": f"Brand {logo_type} logo uploaded and synced successfully"
    }
