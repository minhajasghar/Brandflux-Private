from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, UploadFile, File, Form, Request, Query
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional
import uuid
from pydantic import BaseModel

from database import get_db
from models.models import (
    Brand, User, WebsiteScan, DailySession, GeneratedPost, Post, PlatformCopy,
    BrandMember, PostVersion, PostApproval, Plan, AuditLog
)
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
from config import RATE_LIMIT_WEBSITE_SCAN, APP_BASE_URL
from services.scraper import BrandScraper
from services.storage import storage_service
from services.brand_service import (
    PLAN_BRAND_LIMITS,
    get_plan_brand_limit,
    resolve_user_brand,
    build_brand_kit_dict,
    sync_brand_kit_to_columns,
    get_user_brand_role
)
from services.plan_service import get_plan
from services.email.email_service import send_email
from services.auth_service import create_token, hash_password, verify_password
from services.approval_service import log_approval_audit

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
    Retrieve aggregated stats for the brand dashboard:
    - posts_created_this_month: Count of parent posts (one generation = one post)
    - total_platform_copies_this_month: Count of child platform copies across posts
    - sessions_completed_this_week: Count of parent posts/sessions created in the last 7 days
    - top_platform: Platform with the most PUBLISHED posts (e.g. "Instagram", "X / Twitter", "LinkedIn", "Facebook", "TikTok", or "-" if none)
    """
    from sqlalchemy import func
    now = datetime.utcnow()
    start_of_month = datetime(now.year, now.month, 1)
    one_week_ago = now - timedelta(days=7)

    # 1. Parent posts created this month (1 generation = 1 post)
    parent_posts_month_count = db.query(Post).filter(
        Post.user_id == user.id,
        Post.created_at >= start_of_month
    ).count()

    total_parent_posts = db.query(Post).filter(Post.user_id == user.id).count()
    posts_created_this_month = parent_posts_month_count if parent_posts_month_count > 0 else (user.posts_used_this_month or total_parent_posts or 0)

    # 2. Child platform copies created this month
    total_copies_month_count = db.query(PlatformCopy).join(Post, Post.id == PlatformCopy.post_id).filter(
        Post.user_id == user.id,
        PlatformCopy.created_at >= start_of_month
    ).count()

    total_copies_all = db.query(PlatformCopy).join(Post, Post.id == PlatformCopy.post_id).filter(
        Post.user_id == user.id
    ).count()

    total_platform_copies_this_month = total_copies_month_count if total_copies_month_count > 0 else total_copies_all

    # 3. Sessions completed this week (consistent with parent generations)
    sessions_this_week = db.query(Post).filter(
        Post.user_id == user.id,
        Post.created_at >= one_week_ago
    ).count()

    if sessions_this_week == 0:
        sessions_this_week = db.query(DailySession).filter(
            DailySession.user_id == user.id,
            DailySession.created_at >= one_week_ago
        ).count()

    # 4. Top platform with most PUBLISHED posts (or "-" if nothing is published yet)
    published_query = db.query(
        PlatformCopy.platform,
        func.count(PlatformCopy.id).label('qty')
    ).join(Post, Post.id == PlatformCopy.post_id).filter(
        Post.user_id == user.id,
        PlatformCopy.status == 'published'
    ).group_by(PlatformCopy.platform).order_by(func.count(PlatformCopy.id).desc()).first()

    platform_names = {
        "instagram": "Instagram",
        "instagram_post": "Instagram",
        "instagram_story": "Instagram Story",
        "linkedin": "LinkedIn",
        "linkedin_post": "LinkedIn",
        "facebook": "Facebook",
        "facebook_post": "Facebook",
        "twitter": "X / Twitter",
        "twitter_post": "X / Twitter",
        "tiktok": "TikTok"
    }

    if published_query:
        p_name = (published_query[0] or "").lower()
        top_platform = platform_names.get(p_name, p_name.capitalize().replace("_", " "))
    else:
        # Prompt: "Top platform = platform with the most PUBLISHED posts (or most selected), shown as 'Instagram', 'X / Twitter', etc., not 'Twitter post'; show '-' if nothing is published yet."
        top_platform = "-"

    # 5. Streak calculation
    streak_days = max(1, min(7, sessions_this_week or 1))

    return {
        "posts_created_this_month": posts_created_this_month,
        "total_platform_copies_this_month": total_platform_copies_this_month,
        "sessions_completed_this_week": sessions_this_week or 1,
        "top_platform": top_platform,
        "most_used_platform": top_platform,
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
        brand.secondary_color = brand_data.get("secondary_color")
        brand.colors = brand_data.get("colors")
        brand.logo_url = brand_data.get("logo_url")
        brand.brand_tone = brand_data.get("brand_tone")
        brand.business_type = brand_data.get("business_type")
        brand.brand_kit = build_brand_kit_dict(brand)
        if brand_data.get("color_palette"):
            brand.brand_kit["color_palette"] = brand_data.get("color_palette")
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
            is_fallback = brand_data.get("color_palette", {}).get("extraction_method") == "universal_fallback"
            if brand_data.get("colors") and not is_fallback: brand.colors = brand_data["colors"]
            if brand_data.get("primary_color") and not is_fallback: brand.primary_color = brand_data["primary_color"]
            if brand_data.get("secondary_color") and not is_fallback: brand.secondary_color = brand_data["secondary_color"]
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
    is_fallback = new_data.get("color_palette", {}).get("extraction_method") == "universal_fallback"
    if new_data.get("colors") and not is_fallback: brand.colors = new_data["colors"]
    if new_data.get("primary_color") and not is_fallback: brand.primary_color = new_data["primary_color"]
    if new_data.get("secondary_color") and not is_fallback: brand.secondary_color = new_data["secondary_color"]
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


# ═══════════════════════════════════════════════════════════════
# TEAM & APPROVER WORKFLOW MANAGEMENT
# ═══════════════════════════════════════════════════════════════

class TeamInviteRequest(BaseModel):
    email: str

class TeamSettingsUpdateRequest(BaseModel):
    require_approval: Optional[bool] = None
    approval_mode: Optional[str] = None  # "anyone" | "all"
    approval_autopilot_routing: Optional[str] = None  # "approvers" | "creator"
    approval_deadline_hours: Optional[int] = None
    approval_reminder_hours: Optional[int] = None

class AcceptInviteRequest(BaseModel):
    token: str
    password: Optional[str] = None
    full_name: Optional[str] = None


@router.get("/{brand_id}/team")
def get_brand_team(
    brand_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Retrieve team members, approver plan limits, and approval settings for a brand.
    Accessible ONLY to the brand creator/owner.
    """
    brand = db.query(Brand).filter(Brand.id == brand_id).first()
    if not brand:
        raise HTTPException(status_code=404, detail="Brand not found")

    role = get_user_brand_role(user, brand.id, db)
    if role != "creator":
        raise HTTPException(status_code=403, detail="Only brand creators can view and manage team settings.")

    plan = get_plan(db, user.plan)
    max_approvers = getattr(plan, "max_approvers", 1)

    members = db.query(BrandMember).filter(BrandMember.brand_id == brand.id).order_by(BrandMember.created_at.asc()).all()
    
    serialized_members = []
    active_count = 0
    for m in members:
        if m.role == "approver" and m.status == "active":
            active_count += 1
        
        member_email = m.invited_email
        member_name = None
        if m.user:
            member_email = m.user.email
            member_name = m.user.full_name

        serialized_members.append({
            "id": m.id,
            "user_id": m.user_id,
            "email": member_email,
            "name": member_name or (member_email.split("@")[0] if member_email else "Member"),
            "role": m.role,
            "status": m.status,
            "invitation_expires_at": m.invitation_expires_at.isoformat() if m.invitation_expires_at else None,
            "accepted_at": m.accepted_at.isoformat() if m.accepted_at else None,
            "created_at": m.created_at.isoformat() if m.created_at else None
        })

    return {
        "brand_id": brand.id,
        "brand_name": brand.name or brand.business_name,
        "plan": user.plan,
        "plan_limit": max_approvers,
        "active_approvers_count": active_count,
        "require_approval": bool(brand.require_approval),
        "approval_mode": brand.approval_mode or "anyone",
        "approval_autopilot_routing": brand.approval_autopilot_routing or "approvers",
        "approval_deadline_hours": brand.approval_deadline_hours or 24,
        "approval_reminder_hours": brand.approval_reminder_hours or 6,
        "members": serialized_members
    }


@router.post("/{brand_id}/team/invite")
async def invite_team_approver(
    brand_id: str,
    req: TeamInviteRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Invite a new approver via email with a single-use 7-day token.
    Enforces plan-based approver limits (Trial 1, Starter 1, Growth 3, Pro 10).
    Creator only.
    """
    brand = db.query(Brand).filter(Brand.id == brand_id).first()
    if not brand:
        raise HTTPException(status_code=404, detail="Brand not found")

    role = get_user_brand_role(user, brand.id, db)
    if role != "creator":
        raise HTTPException(status_code=403, detail="Only brand creators can invite team members.")

    target_email = req.email.strip().lower()
    if not target_email or "@" not in target_email:
        raise HTTPException(status_code=400, detail="A valid email address is required.")

    if target_email == user.email.lower():
        raise HTTPException(status_code=400, detail="You cannot invite yourself as an approver.")

    # 1. Enforce Plan Limits
    plan = get_plan(db, user.plan)
    max_approvers = getattr(plan, "max_approvers", 1)
    
    current_count = db.query(BrandMember).filter(
        BrandMember.brand_id == brand.id,
        BrandMember.role == "approver",
        BrandMember.status.in_(["active", "invited"])
    ).count()

    if current_count >= max_approvers:
        raise HTTPException(
            status_code=400,
            detail=f"Your {user.plan.capitalize()} plan allows up to {max_approvers} approver(s). Please upgrade to invite more team members."
        )

    # 2. Check for existing active or invited membership
    existing = db.query(BrandMember).filter(
        BrandMember.brand_id == brand.id,
        BrandMember.invited_email == target_email,
        BrandMember.status.in_(["active", "invited"])
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"{target_email} is already an active or invited member.")

    # 3. Create 7-day single-use invitation token
    token = uuid.uuid4().hex + uuid.uuid4().hex
    expires_at = datetime.utcnow() + timedelta(days=7)

    existing_user = db.query(User).filter(User.email == target_email).first()

    member = BrandMember(
        brand_id=brand.id,
        user_id=existing_user.id if existing_user else None,
        role="approver",
        status="invited",
        invited_email=target_email,
        invitation_token=token,
        invitation_expires_at=expires_at,
        invited_by_user_id=user.id
    )
    db.add(member)
    db.commit()
    db.refresh(member)

    # 4. Dispatch Email (Captured in dev mode or sent via provider)
    invite_url = f"{APP_BASE_URL}/invite/accept?token={token}"
    try:
        await send_email(
            to=target_email,
            template="approver_invite",
            data={
                "brand_name": brand.name or brand.business_name or "Your Brand",
                "inviter_name": user.full_name or user.email,
                "invite_url": invite_url
            },
            user_id=existing_user.id if existing_user else None,
            brand_id=brand.id,
            idempotency_key=f"team_inv_{member.id}",
            db=db
        )
    except Exception as e:
        logger.warning(f"Error dispatching approver invitation email: {e}")

    # 5. Audit Log
    log_approval_audit(
        db=db,
        user=user,
        action="approver_invited",
        target_id=member.id,
        target_type="brand_member",
        details={"invited_email": target_email, "brand_id": brand.id, "plan_limit": max_approvers}
    )

    return {
        "status": "success",
        "message": f"Invitation sent to {target_email}",
        "member_id": member.id,
        "token": token,
        "invite_url": invite_url,
        "expires_at": expires_at.isoformat()
    }


@router.post("/{brand_id}/team/resend-invite/{member_id}")
async def resend_approver_invite(
    brand_id: str,
    member_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Resend invitation with a refreshed 7-day token."""
    brand = db.query(Brand).filter(Brand.id == brand_id).first()
    if not brand:
        raise HTTPException(status_code=404, detail="Brand not found")

    role = get_user_brand_role(user, brand.id, db)
    if role != "creator":
        raise HTTPException(status_code=403, detail="Only brand creators can resend invitations.")

    member = db.query(BrandMember).filter(BrandMember.id == member_id, BrandMember.brand_id == brand.id).first()
    if not member or member.status != "invited":
        raise HTTPException(status_code=404, detail="Invited member not found or already active.")

    token = uuid.uuid4().hex + uuid.uuid4().hex
    expires_at = datetime.utcnow() + timedelta(days=7)
    member.invitation_token = token
    member.invitation_expires_at = expires_at
    db.commit()

    invite_url = f"{APP_BASE_URL}/invite/accept?token={token}"
    try:
        await send_email(
            to=member.invited_email,
            template="approver_invite",
            data={
                "brand_name": brand.name or brand.business_name or "Your Brand",
                "inviter_name": user.full_name or user.email,
                "invite_url": invite_url
            },
            user_id=member.user_id,
            brand_id=brand.id,
            idempotency_key=f"team_resend_{member.id}_{token[:8]}",
            db=db
        )
    except Exception as e:
        logger.warning(f"Error resending invite: {e}")

    return {"status": "success", "message": f"Invitation resent to {member.invited_email}", "invite_url": invite_url}


@router.delete("/{brand_id}/team/members/{member_id}")
def remove_team_member(
    brand_id: str,
    member_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Remove an approver.
    Rule: 'Block removing the last approver while approval is required.'
    Creator only.
    """
    brand = db.query(Brand).filter(Brand.id == brand_id).first()
    if not brand:
        raise HTTPException(status_code=404, detail="Brand not found")

    role = get_user_brand_role(user, brand.id, db)
    if role != "creator":
        raise HTTPException(status_code=403, detail="Only brand creators can remove team members.")

    member = db.query(BrandMember).filter(BrandMember.id == member_id, BrandMember.brand_id == brand.id).first()
    if not member:
        raise HTTPException(status_code=404, detail="Team member not found.")

    if member.role == "creator":
        raise HTTPException(status_code=400, detail="Cannot remove the brand creator.")

    # Rule: Block removing last approver while approval is required
    if brand.require_approval and member.status == "active":
        active_remaining = db.query(BrandMember).filter(
            BrandMember.brand_id == brand.id,
            BrandMember.id != member.id,
            BrandMember.role == "approver",
            BrandMember.status == "active"
        ).count()
        if active_remaining < 1:
            raise HTTPException(
                status_code=400,
                detail="Cannot remove the last active approver while 'Require approval' is enabled. Please disable approval requirement in settings first."
            )

    member.status = "removed"
    db.commit()

    log_approval_audit(
        db=db,
        user=user,
        action="approver_removed",
        target_id=member.id,
        target_type="brand_member",
        details={"removed_email": member.invited_email, "brand_id": brand.id}
    )

    return {"status": "success", "message": "Team member removed."}


@router.put("/{brand_id}/team/settings")
def update_team_approval_settings(
    brand_id: str,
    req: TeamSettingsUpdateRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Update team approval settings:
    - 'Require approval' (default OFF, enabled when at least 1 approver is active)
    - mode: 'Any one' (default) or 'All'
    - Autopilot drafts: to approvers (default) or creator first
    - reminder + deadline
    Creator only.
    """
    brand = db.query(Brand).filter(Brand.id == brand_id).first()
    if not brand:
        raise HTTPException(status_code=404, detail="Brand not found")

    role = get_user_brand_role(user, brand.id, db)
    if role != "creator":
        raise HTTPException(status_code=403, detail="Only brand creators can update approval settings.")

    # Rule: 'Require approval' can only be enabled when at least 1 approver is active
    if req.require_approval is True:
        active_count = db.query(BrandMember).filter(
            BrandMember.brand_id == brand.id,
            BrandMember.role == "approver",
            BrandMember.status == "active"
        ).count()
        if active_count < 1:
            raise HTTPException(
                status_code=400,
                detail="Cannot enable 'Require approval' without at least one active approver. Wait for an invited approver to accept their invitation first."
            )

    if req.require_approval is not None:
        brand.require_approval = req.require_approval
    if req.approval_mode in ("anyone", "all"):
        brand.approval_mode = req.approval_mode
    if req.approval_autopilot_routing in ("approvers", "creator"):
        brand.approval_autopilot_routing = req.approval_autopilot_routing
    if req.approval_deadline_hours is not None and req.approval_deadline_hours > 0:
        brand.approval_deadline_hours = req.approval_deadline_hours
    if req.approval_reminder_hours is not None and req.approval_reminder_hours > 0:
        brand.approval_reminder_hours = req.approval_reminder_hours

    db.commit()
    db.refresh(brand)

    log_approval_audit(
        db=db,
        user=user,
        action="team_settings_updated",
        target_id=brand.id,
        target_type="brand",
        details={
            "require_approval": brand.require_approval,
            "approval_mode": brand.approval_mode,
            "approval_autopilot_routing": brand.approval_autopilot_routing,
            "approval_deadline_hours": brand.approval_deadline_hours,
            "approval_reminder_hours": brand.approval_reminder_hours
        }
    )

    return {
        "status": "success",
        "require_approval": brand.require_approval,
        "approval_mode": brand.approval_mode,
        "approval_autopilot_routing": brand.approval_autopilot_routing,
        "approval_deadline_hours": brand.approval_deadline_hours,
        "approval_reminder_hours": brand.approval_reminder_hours
    }


# ═══════════════════════════════════════════════════════════════
# PUBLIC INVITATION ACCEPTANCE
# ═══════════════════════════════════════════════════════════════

@router.get("/invite/details")
def get_invitation_details(token: str, db: Session = Depends(get_db)):
    """Fetch details of an approver invitation token (public)."""
    if not token:
        raise HTTPException(status_code=400, detail="Token is required.")

    member = db.query(BrandMember).filter(BrandMember.invitation_token == token).first()
    if not member:
        raise HTTPException(status_code=404, detail="Invalid invitation link.")

    is_expired = member.invitation_expires_at and member.invitation_expires_at < datetime.utcnow()
    brand = db.query(Brand).filter(Brand.id == member.brand_id).first()
    inviter = db.query(User).filter(User.id == member.invited_by_user_id).first() if member.invited_by_user_id else None

    existing_user = db.query(User).filter(User.email == member.invited_email).first()

    return {
        "valid": not is_expired and member.status == "invited",
        "is_expired": bool(is_expired),
        "status": member.status,
        "invited_email": member.invited_email,
        "brand_name": brand.name or brand.business_name if brand else "Brandflux Workspace",
        "inviter_name": inviter.full_name or inviter.email if inviter else "Team Owner",
        "user_exists": bool(existing_user)
    }


@router.post("/invite/accept")
def accept_invitation(req: AcceptInviteRequest, db: Session = Depends(get_db)):
    """
    Accept an approver invitation:
    - Single-use 7-day token validation.
    - Creates user account if non-existent, setting onboarding_complete=True.
    - Activates membership and sets active_brand_id to this brand.
    - Lands directly on /approvals with no onboarding.
    """
    member = db.query(BrandMember).filter(BrandMember.invitation_token == req.token).first()
    if not member:
        raise HTTPException(status_code=404, detail="Invalid invitation token.")

    if member.status != "invited":
        raise HTTPException(status_code=400, detail="This invitation has already been accepted or is no longer valid.")

    if member.invitation_expires_at and member.invitation_expires_at < datetime.utcnow():
        raise HTTPException(status_code=400, detail="This invitation link has expired. Please ask the brand creator for a new invite.")

    brand = db.query(Brand).filter(Brand.id == member.brand_id).first()
    if not brand:
        raise HTTPException(status_code=404, detail="Associated brand not found.")

    target_email = member.invited_email.strip().lower()
    user = db.query(User).filter(User.email == target_email).first()

    if user:
        # Existing user accepting invite
        if req.password:
            # If password provided, verify it
            if not verify_password(req.password, user.password_hash):
                raise HTTPException(status_code=400, detail="Invalid credentials for existing user.")
        member.user_id = user.id
    else:
        # Create new approver user directly with onboarding_complete=True
        if not req.password or len(req.password) < 6:
            raise HTTPException(status_code=400, detail="A secure password (at least 6 characters) is required to create your account.")
        
        user = User(
            email=target_email,
            password_hash=hash_password(req.password),
            full_name=req.full_name or target_email.split("@")[0].capitalize(),
            plan="free",
            is_verified=True,
            active_brand_id=brand.id
        )
        db.add(user)
        db.flush()
        member.user_id = user.id

    # Activate member & wipe invitation token to guarantee single-use enforcement
    member.status = "active"
    member.invitation_token = None
    member.accepted_at = datetime.utcnow()
    user.active_brand_id = brand.id
    db.commit()

    token = create_token(user.id, user.token_version)

    log_approval_audit(
        db=db,
        user=user,
        action="approver_invite_accepted",
        target_id=member.id,
        target_type="brand_member",
        details={"brand_id": brand.id, "email": user.email}
    )

    return {
        "status": "success",
        "message": "Invitation accepted successfully",
        "token": token,
        "redirect": "/approvals",
        "user": {
            "id": user.id,
            "email": user.email,
            "full_name": user.full_name,
            "brand_id": brand.id,
            "role": "approver"
        }
    }

