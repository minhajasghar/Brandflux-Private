import uuid
import secrets
from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks, Query
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
from pydantic import BaseModel
from typing import Optional

from database import get_db
from models.models import User, Brand
from models.schemas import SignupRequest, LoginRequest, AuthResponse, BrandProfile
from services import auth_service, scraper
from middleware.auth import get_current_user
from config import APP_BASE_URL, EMAIL_PROVIDER
from services.email.email_service import send_email

router = APIRouter(prefix="/auth", tags=["auth"])

class VerifyEmailRequest(BaseModel):
    token: str

class ResendVerificationRequest(BaseModel):
    email: str

@router.post("/signup", response_model=AuthResponse)
async def signup(req: SignupRequest, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    """
    Sign up: creates user + brand + triggers first website scan + sends verification email.
    """
    # 1. Check if email already exists
    existing = db.query(User).filter(User.email == req.email.strip().lower()).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )

    # 1b. Enforce one trial per website domain
    import urllib.parse
    parsed_domain = urllib.parse.urlparse(req.website_url if "://" in req.website_url else f"http://{req.website_url}").netloc.lower()
    clean_domain = parsed_domain.replace("www.", "").strip()
    if clean_domain:
        existing_domain_brand = db.query(Brand).join(User, Brand.user_id == User.id).filter(
            Brand.website_url.ilike(f"%{clean_domain}%"),
            User.plan.in_(["trial", "free"])
        ).first()
        if existing_domain_brand:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="A free trial has already been registered for this website domain. Please sign in or choose a paid plan."
            )

    # 2. Hash the password using passlib bcrypt
    # 3. Create new User with verification token
    verify_token = uuid.uuid4().hex
    user = User(
        email=req.email.strip().lower(),
        password_hash=auth_service.hash_password(req.password),
        full_name=req.full_name,
        is_verified=True,
        verification_token=verify_token,
        verification_token_expires_at=datetime.utcnow() + timedelta(hours=24),
        welcome_sent=False
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

    # 5. Dispatch Verification Email (Dev mode captures in outbox, Resend sends)
    verification_url = f"{APP_BASE_URL}/verify?token={verify_token}"
    background_tasks.add_task(
        send_email,
        to=user.email,
        template="verify_email",
        data={
            "verification_url": verification_url,
            "full_name": user.full_name or "there"
        },
        user_id=user.id,
        brand_id=brand.id,
        idempotency_key=f"verify_{user.id}_{verify_token[:8]}"
    )

    # 6. Generate JWT token
    token = auth_service.create_token(user.id, token_version=getattr(user, "token_version", 1) or 1)

    # 7. Return response
    is_dev = (EMAIL_PROVIDER or "dev").strip().lower() == "dev"
    return AuthResponse(
        token=token,
        user_id=user.id,
        email=user.email,
        full_name=user.full_name,
        role=getattr(user, "role", "user") or "user",
        is_suspended=getattr(user, "is_suspended", False) or False,
        onboarding_complete=False,
        is_verified=False,
        is_approved=False,
        is_non_payment=False,
        dev_mode=is_dev,
        verification_token=verify_token if is_dev else None
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

    # 2. Block soft-deleted users
    if getattr(user, "is_deleted", False):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )

    # 3. Block suspended users at login
    if getattr(user, "is_suspended", False):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your account has been suspended by an administrator. Please contact support."
        )

    # 4. Verify password hash
    if not auth_service.verify_password(req.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid password"
        )

    # 4b. Check user approval status (unapproved users will be routed to /payment screen)
    user_role = getattr(user, "role", "user") or "user"
    is_user_approved = bool(getattr(user, "is_approved", False) or user_role in ("admin", "support_admin"))

    brand = db.query(Brand).filter(Brand.user_id == user.id).first()
    user_role = getattr(user, "role", "user") or "user"
    # Admins do not need brand onboarding to access the admin portal
    is_onboarding_complete = True if user_role == "admin" else (brand.onboarding_complete if brand else False)

    # 5. Generate JWT token
    token = auth_service.create_token(user.id, token_version=getattr(user, "token_version", 1) or 1)

    # 6. Return response
    return AuthResponse(
        token=token,
        user_id=user.id,
        email=user.email,
        full_name=user.full_name,
        role=user_role,
        is_suspended=getattr(user, "is_suspended", False) or False,
        onboarding_complete=is_onboarding_complete,
        is_verified=getattr(user, "is_verified", True),
        is_approved=is_user_approved,
        is_non_payment=getattr(user, "is_non_payment", False)
    )

@router.post("/verify-email")
async def verify_email_endpoint(
    req: VerifyEmailRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    """
    Verify user's email with single-use 24h token.
    On success: marks user verified, triggers welcome email once, and returns login token.
    """
    token = req.token.strip()
    if not token:
        raise HTTPException(status_code=400, detail="Verification token is required")

    user = db.query(User).filter(User.verification_token == token).first()
    if not user:
        raise HTTPException(status_code=400, detail="Invalid or already used verification token")

    if user.verification_token_expires_at and user.verification_token_expires_at < datetime.utcnow():
        raise HTTPException(status_code=400, detail="Verification link has expired. Please request a new one.")

    user.is_verified = True
    user.verification_token = None
    user.verification_token_expires_at = None

    # Trial officially begins at email verification: 14 days OR 15 credits
    now = datetime.utcnow()
    if not user.trial_started_at:
        user.trial_started_at = now
        user.trial_ends_at = now + timedelta(days=14)
        user.plan = "trial"

    # Grant initial 15 post credits to user's ledger
    from services.credit_service import ensure_user_ledger_initialized
    ensure_user_ledger_initialized(user, db)

    # Send Welcome Email idempotently (sent once after verification)
    if not user.welcome_sent:
        user.welcome_sent = True
        create_post_url = f"{APP_BASE_URL}/session"
        brand = db.query(Brand).filter(Brand.user_id == user.id).first()
        brand_id = brand.id if brand else None
        background_tasks.add_task(
            send_email,
            to=user.email,
            template="welcome",
            data={
                "full_name": user.full_name or "there",
                "create_post_url": create_post_url
            },
            user_id=user.id,
            brand_id=brand_id,
            idempotency_key=f"welcome_{user.id}"
        )

    db.commit()
    db.refresh(user)

    brand = db.query(Brand).filter(Brand.user_id == user.id).first()
    user_role = getattr(user, "role", "user") or "user"
    is_onboarding_complete = True if user_role == "admin" else (brand.onboarding_complete if brand else False)
    jwt_token = auth_service.create_token(user.id, token_version=getattr(user, "token_version", 1) or 1)

    return {
        "status": "success",
        "message": "Email verified successfully!",
        "token": jwt_token,
        "user_id": user.id,
        "email": user.email,
        "full_name": user.full_name,
        "role": user_role,
        "is_verified": True,
        "is_approved": getattr(user, "is_approved", False),
        "is_non_payment": getattr(user, "is_non_payment", False),
        "onboarding_complete": is_onboarding_complete
    }

@router.get("/verify-info")
def get_verify_info(
    email: str = Query(...),
    db: Session = Depends(get_db)
):
    """
    Returns verification status for email, and in dev mode returns verification_token for instant verify.
    """
    user = db.query(User).filter(User.email == email.strip().lower()).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    is_dev = (EMAIL_PROVIDER or "dev").strip().lower() == "dev"
    return {
        "email": user.email,
        "is_verified": bool(user.is_verified),
        "dev_mode": is_dev,
        "verification_token": user.verification_token if is_dev else None
    }

@router.post("/resend-verification")
async def resend_verification(
    req: ResendVerificationRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    """Resend a new verification token if not yet verified."""
    user = db.query(User).filter(User.email == req.email.strip().lower()).first()
    if not user:
        raise HTTPException(status_code=404, detail="Account not found")

    if user.is_verified:
        return {"status": "already_verified", "message": "Email is already verified"}

    new_token = uuid.uuid4().hex
    user.verification_token = new_token
    user.verification_token_expires_at = datetime.utcnow() + timedelta(hours=24)
    db.commit()

    brand = db.query(Brand).filter(Brand.user_id == user.id).first()
    verification_url = f"{APP_BASE_URL}/verify?token={new_token}"
    background_tasks.add_task(
        send_email,
        to=user.email,
        template="verify_email",
        data={
            "verification_url": verification_url,
            "full_name": user.full_name or "there"
        },
        user_id=user.id,
        brand_id=brand.id if brand else None,
        idempotency_key=f"verify_{user.id}_{new_token[:8]}"
    )

    return {"status": "success", "message": "Verification email sent"}

class UpdateProfileRequest(BaseModel):
    full_name: Optional[str] = None
    email: Optional[str] = None

class RequestEmailChangeRequest(BaseModel):
    new_email: str
    current_password: str

class ConfirmEmailChangeRequest(BaseModel):
    token: str


@router.put("/profile")
def update_profile(
    req: UpdateProfileRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update current user profile (full name saves immediately; email changes require password verification)."""
    if req.full_name is not None:
        user.full_name = req.full_name.strip()

    if req.email and req.email.strip().lower() != user.email.lower():
        raise HTTPException(
            status_code=400,
            detail="To change your email address, please use the Email Change verification form which requires password confirmation."
        )

    db.commit()
    db.refresh(user)

    fresh_token = auth_service.create_token(user.id)

    return {
        "status": "success",
        "message": "Full name saved successfully.",
        "token": fresh_token,
        "user": {
            "id": user.id,
            "email": user.email,
            "full_name": user.full_name,
            "plan": user.plan,
            "role": getattr(user, "role", "user") or "user"
        }
    }


@router.post("/request-email-change")
async def request_email_change(
    req: RequestEmailChangeRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Request email change:
    - Requires current password verification.
    - Validates uniqueness of new email.
    - Sends verification link to new email address (captured in Emails outbox in dev mode).
    - Sends security notice to current email address.
    - Applies only when confirmed.
    """
    # 1. Verify current password
    if not auth_service.verify_password(req.current_password, user.password_hash):
        raise HTTPException(status_code=400, detail="Incorrect current password. Please try again.")

    new_email = req.new_email.strip().lower()
    if "@" not in new_email or "." not in new_email:
        raise HTTPException(status_code=400, detail="Please enter a valid email address.")

    if new_email == user.email.lower():
        raise HTTPException(status_code=400, detail="The new email address cannot be the same as your current address.")

    # 2. Check uniqueness
    existing = db.query(User).filter(User.email == new_email, User.id != user.id).first()
    if existing:
        raise HTTPException(status_code=400, detail="This email address is already in use by another account.")

    # 3. Generate token & expiration (24h)
    token = secrets.token_urlsafe(32)
    user.pending_email = new_email
    user.email_change_token = token
    user.email_change_expires_at = datetime.utcnow() + timedelta(hours=24)
    db.commit()

    verification_url = f"{APP_BASE_URL}/settings?tab=account&verify_email_token={token}"

    # 4. Send verification email to NEW address
    try:
        await send_email(
            to=new_email,
            template="email_change_verification",
            data={
                "verification_url": verification_url,
                "full_name": user.full_name or "there",
                "new_email": new_email
            },
            user_id=user.id,
            db=db
        )
    except Exception as e:
        print(f"Notice: Failed to dispatch email to new address: {e}")

    # 5. Send security notification to OLD/CURRENT address
    try:
        await send_email(
            to=user.email,
            template="email_change_notice",
            data={
                "full_name": user.full_name or "there",
                "new_email": new_email
            },
            user_id=user.id,
            db=db
        )
    except Exception as e:
        print(f"Notice: Failed to dispatch security notice to old address: {e}")

    return {
        "status": "success",
        "message": f"Verification link sent to {new_email}. Please check the inbox (or Admin > Emails outbox) and click the link to confirm.",
        "pending_email": new_email,
        "token_preview": token
    }


@router.post("/confirm-email-change")
def confirm_email_change(
    req: ConfirmEmailChangeRequest,
    db: Session = Depends(get_db)
):
    """Confirm and apply email address update via verification token."""
    user = db.query(User).filter(User.email_change_token == req.token).first()
    if not user:
        raise HTTPException(status_code=400, detail="Invalid or expired email change token.")

    if not user.email_change_expires_at or user.email_change_expires_at < datetime.utcnow():
        user.email_change_token = None
        user.pending_email = None
        user.email_change_expires_at = None
        db.commit()
        raise HTTPException(status_code=400, detail="This email change token has expired. Please request a new one.")

    new_email = user.pending_email
    if not new_email:
        raise HTTPException(status_code=400, detail="No pending email update found for this token.")

    # Re-verify uniqueness
    conflict = db.query(User).filter(User.email == new_email, User.id != user.id).first()
    if conflict:
        user.email_change_token = None
        user.pending_email = None
        db.commit()
        raise HTTPException(status_code=400, detail="This email address was recently registered by another user.")

    # Apply email change
    old_email = user.email
    user.email = new_email
    user.pending_email = None
    user.email_change_token = None
    user.email_change_expires_at = None
    db.commit()
    db.refresh(user)

    fresh_token = auth_service.create_token(user.id)

    return {
        "status": "success",
        "message": f"Your account email has been successfully updated from {old_email} to {new_email}!",
        "token": fresh_token,
        "user": {
            "id": user.id,
            "email": user.email,
            "full_name": user.full_name,
            "plan": user.plan,
            "role": getattr(user, "role", "user") or "user"
        }
    }


@router.get("/me")
def get_me(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Return current user info + brand info + team role."""
    from services.brand_service import resolve_user_brand, get_user_brand_role
    brand = resolve_user_brand(user, db)
    brand_role = get_user_brand_role(user, brand.id, db) if brand else "creator"
    is_approver = (brand_role == "approver")
    
    return {
        "user": {
            "id": user.id,
            "email": user.email,
            "full_name": user.full_name,
            "plan": "Approver" if is_approver else user.plan,
            "role": getattr(user, "role", "user") or "user",
            "is_suspended": getattr(user, "is_suspended", False) or False,
            "is_approved": bool(getattr(user, "is_approved", False)),
            "is_non_payment": bool(getattr(user, "is_non_payment", False)),
            "created_at": user.created_at,
            "brand_role": brand_role,
            "is_approver": is_approver,
            "has_credits": not is_approver,
            "has_billing": not is_approver,
            "has_generation": not is_approver,
            "has_connections": not is_approver
        },
        "brand": brand,
        "brand_role": brand_role
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
            brand.primary_color = scraped_data.get("primary_color") or scraped_data["colors"][0]
            brand.secondary_color = scraped_data.get("secondary_color") or (scraped_data["colors"][1] if len(scraped_data["colors"]) > 1 else None)
            from services.brand_service import build_brand_kit_dict
            brand.brand_kit = build_brand_kit_dict(brand)
            if scraped_data.get("color_palette"):
                brand.brand_kit["color_palette"] = scraped_data.get("color_palette")

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
