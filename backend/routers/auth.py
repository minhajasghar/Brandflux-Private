from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from sqlalchemy.orm import Session
from datetime import datetime

from database import get_db
from models.models import User, Brand
from models.schemas import SignupRequest, LoginRequest, AuthResponse, BrandProfile
from services import auth_service, scraper
from middleware.auth import get_current_user

router = APIRouter(prefix="/auth", tags=["auth"])

@router.post("/signup", response_model=AuthResponse)
async def signup(req: SignupRequest, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    """
    Sign up: creates user + brand + triggers first website scan.
    """
    # 1. Check if email already exists
    existing = db.query(User).filter(User.email == req.email).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )

    # 2. Hash the password using passlib bcrypt
    # 3. Create new User in database
    user = User(
        email=req.email,
        password_hash=auth_service.hash_password(req.password),
        full_name=req.full_name,
    )
    db.add(user)
    db.flush()

    # 4. Create empty Brand record linked to user with website_url saved
    brand = Brand(
        user_id=user.id,
        business_name=req.website_url,  # Temporary
        website_url=req.website_url,
        scan_status="pending",
    )
    db.add(brand)
    db.commit()
    db.refresh(user)
    db.refresh(brand)

    # Trigger first scan in background
    from routers.auth import _run_first_scan
    background_tasks.add_task(_run_first_scan, brand.id, brand.user_id, req.website_url)

    # 5. Generate JWT token (expires in 7 days)
    token = auth_service.create_token(user.id)

    # 6. Return response
    return AuthResponse(
        token=token,
        user_id=user.id,
        email=user.email,
        full_name=user.full_name,
        onboarding_complete=False
    )

@router.post("/login", response_model=AuthResponse)
def login(req: LoginRequest, db: Session = Depends(get_db)):
    """Log in and get JWT token."""
    # 1. Find user by email
    user = db.query(User).filter(User.email == req.email).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )

    # 2. Verify password hash
    if not auth_service.verify_password(req.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid password"
        )

    brand = db.query(Brand).filter(Brand.user_id == user.id).first()

    # 3. Generate JWT token
    token = auth_service.create_token(user.id)

    # 4. Return response
    return AuthResponse(
        token=token,
        user_id=user.id,
        email=user.email,
        full_name=user.full_name,
        onboarding_complete=brand.onboarding_complete if brand else False
    )

@router.get("/me")
def get_me(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Return current user info + brand info."""
    brand = db.query(Brand).filter(Brand.user_id == user.id).first()
    
    return {
        "user": {
            "id": user.id,
            "email": user.email,
            "full_name": user.full_name,
            "plan": user.plan,
            "created_at": user.created_at
        },
        "brand": brand
    }

# ─── Background Task: First Scan ──────────────────────────
# (Keep existing _run_first_scan logic but ensure it uses the new service if needed)
async def _run_first_scan(brand_id: str, user_id: str, website_url: str):
    from database import SessionLocal
    from models.models import BrandScanLog, WebsiteScan
    from services import gemini
    from services.image_processor import process_logo
    
    db = SessionLocal()
    try:
        brand = db.query(Brand).filter(Brand.id == brand_id).first()
        if not brand: return
        
        brand.scan_status = "scanning"
        db.commit()

        scan_log = BrandScanLog(brand_id=brand_id, status="started")
        db.add(scan_log)
        db.commit()

        from services.scraper import BrandScraper
        scraper = BrandScraper(website_url)
        scraped_data = await scraper.scrape()
        
        if "error" in scraped_data:
            brand.scan_status = "failed"
            db.commit()
            return

        scan_log.scraped_data = scraped_data

        try:
            analysis = gemini.analyze_brand(scraped_data)
            brand.business_name = analysis.get("business_name", brand.business_name)
            brand.tagline = analysis.get("tagline")
            brand.business_type = analysis.get("business_type")
            brand.industry = analysis.get("industry")
            brand.target_audience = analysis.get("target_audience")
            brand.products_services = analysis.get("products_services")
            brand.brand_tone = analysis.get("brand_tone")
            brand.brand_personality = analysis.get("brand_personality")
            brand.brand_voice = analysis.get("brand_voice")
            brand.content_themes = analysis.get("content_themes")
            brand.detected_products = analysis.get("detected_products")
            brand.detected_services = analysis.get("detected_services")
            brand.brand_keywords = analysis.get("brand_keywords")
            brand.posting_strategy = analysis.get("posting_strategy")
            brand.last_scanned_at = datetime.utcnow()
        except Exception:
            pass

        brand.logo_url = scraped_data.get("logo_url")
        brand.social_links = scraped_data.get("social_links")
        
        if scraped_data.get("colors"):
            brand.colors = scraped_data["colors"]
            brand.primary_color = scraped_data["colors"][0]

        if scraped_data.get("logo_url"):
            try:
                logo_result = await process_logo(scraped_data["logo_url"], brand_id)
                if logo_result.get("colors"):
                    brand.colors = logo_result["colors"]
                    brand.primary_color = logo_result["colors"][0]
                brand.logo_style = logo_result.get("logo_style", "")
            except Exception:
                pass

        brand.scan_status = "completed"
        brand.last_synced_at = datetime.utcnow()
        brand.onboarding_complete = True
        
        scan_log.status = "completed"
        scan_log.completed_at = datetime.utcnow()
        
        web_scan = WebsiteScan(
            user_id=user_id,
            brand_id=brand_id,
            website_url=website_url,
            raw_text=scraped_data.get("text_content"),
            detected_products=brand.detected_products,
            detected_colors=brand.colors,
            detected_logo_url=brand.logo_url,
            changes_detected=True,
            scan_status="complete",
            scanned_at=datetime.utcnow()
        )
        db.add(web_scan)
        db.commit()

    except Exception:
        db.rollback()
        brand = db.query(Brand).filter(Brand.id == brand_id).first()
        if brand: brand.scan_status = "failed"; db.commit()
    finally:
        db.close()
