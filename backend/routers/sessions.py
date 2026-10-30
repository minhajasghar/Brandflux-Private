from fastapi import APIRouter, Depends, HTTPException, Request, Query, UploadFile, File, Form, status
from sqlalchemy.orm import Session
from datetime import date, datetime, timedelta
from typing import List, Optional, Dict, Any
import os
import io
import uuid
import httpx
import asyncio
import logging

from database import get_db
from models.models import Brand, User, DailySession, WebsiteScan, ContentIdea, GeneratedPost, SessionVariant, Usage
from models.schemas import (
    DailySessionResponse, SessionGenerationRequest, SelectVariantRequest,
    RegenerateVariantRequest, MultiVariantSessionResponse, VariantResponseItem
)
from middleware.auth import get_current_user
from middleware.limiter import limiter
from config import RATE_LIMIT_SESSION_GEN
from services.gemini_service import GeminiService
from services.image_generator import ImageGenerator
from services.brand_service import resolve_user_brand
from services.nano_banana_generator import nano_banana_generator
from services.storage import storage_service
from services.image_validator import validate_and_process_reference_image, run_basic_content_moderation

logger = logging.getLogger(__name__)

# Plan variant limits: Starter 2, Growth 3, Pro 4 (fallback: default 3)
PLAN_VARIANT_LIMITS = {
    "free": 2,
    "starter": 2,
    "growth": 3,
    "pro": 4,
    "agency": 4
}

# Distinct composition / angle / mood directions for image variants
VARIANT_STYLES = [
    {
        "label": "Hero Studio Glow",
        "direction": "clean centered studio product lighting with dramatic cobalt blue and electric lime ambient back-rim lighting, high depth of field"
    },
    {
        "label": "Dynamic Low-Angle",
        "direction": "bold architectural low-angle perspective, dynamic diagonal volumetric shadows, atmospheric futuristic studio render"
    },
    {
        "label": "Minimalist High-Key",
        "direction": "modern minimalist negative space composition, soft overhead diffuse daylight, clean editorial aesthetic"
    },
    {
        "label": "Cinematic Neon Rim",
        "direction": "cinematic dark-mode commercial aesthetic with luminous accent edge lighting, dark brushed metal textures"
    }
]

def get_max_variants_for_user(user: User) -> int:
    norm_plan = (user.plan or "starter").lower().strip()
    return PLAN_VARIANT_LIMITS.get(norm_plan, 3)

def get_credits_remaining_for_user(user: User, db: Session) -> int:
    # Monthly plan caps: Starter 60, Growth 150, Pro 300, Agency 1000
    plan_monthly_credits = {
        "free": 30,
        "starter": 60,
        "growth": 150,
        "pro": 300,
        "agency": 1000
    }
    cap = plan_monthly_credits.get((user.plan or "starter").lower(), 60)
    used = user.posts_used_this_month or 0
    return max(0, cap - used)

router = APIRouter(prefix="/sessions", tags=["sessions"])
gemini = GeminiService()
image_gen = ImageGenerator()

async def generate_image(
    prompt: str,
    platform: str,
    brand_profile: dict,
    caption: str,
    cta: str = "",
    style: str = "digital art",
    daily_context: Optional[dict] = None,
    user_id: Optional[str] = None,
    brand_id: Optional[str] = None,
    db: Optional[Session] = None
) -> str:
    """
    Generate a branded social media graphic using:
    1. Google's Nano Banana 2.1 via Gemini API (model ID from env IMAGE_MODEL) for AI background visual.
    2. Playwright HTML/CSS templates for crisp responsive typography, logo, and CTA overlay.
    3. Graceful fallback to CSS ambient gradient/glow if AI generation fails or key unconfigured.
    4. Save outputs to Cloudflare R2 and log per-generation cost/usage to database usage table.
    """
    try:
        # 1. Get overlay text from Gemini
        loop = asyncio.get_running_loop()
        overlay = await loop.run_in_executor(
            None,
            gemini.generate_post_text_overlay,
            caption,
            platform
        )
        post_text = overlay.get("headline") or "Grow Your Business"
        overlay_cta = overlay.get("cta") or cta or ""
        
        # 2. Resolve aspect ratio (1:1, 4:5, 9:16) and dimensions
        aspect_ratio, (w, h) = nano_banana_generator.normalize_aspect_ratio(platform)
        
        # 3. Generate background visual via Google's Nano Banana 2.1 (Gemini API)
        # Timeout, retry with backoff, and fallback to CSS ambient gradient are handled automatically.
        bg_url = await nano_banana_generator.generate_background(
            brand_profile=brand_profile,
            daily_context=daily_context or {"topic": prompt, "focus": caption},
            aspect_ratio=aspect_ratio,
            user_id=user_id,
            brand_id=brand_id,
            db=db
        )
        
        # 4. Render Playwright HTML/CSS template (headline, logo, and CTA in HTML overlay)
        final_bytes = await image_gen.create_branded_post_async(
            brand_profile=brand_profile,
            post_text=post_text,
            platform=platform,
            cta=overlay_cta,
            background_image_url=bg_url,
            aspect_ratio=aspect_ratio
        )
        
        # 5. Upload to Cloudflare R2 / S3 CDN
        image_gen_platform = platform.replace("_post", "")
        filename = f"post_{image_gen_platform}_{uuid.uuid4().hex[:10]}.png"
        public_url = storage_service.upload_image(final_bytes, filename)
        return public_url
    except Exception as e:
        logger.error(f"Error in generate_image for {platform}: {e}")
        return f"http://localhost:8000/static/fallback_{platform}.png"
    except Exception as e:
        print(f"Error in generate_image for {platform}: {e}")
        return f"http://localhost:8000/static/fallback_{platform}.png"

@router.post("/questions")
async def start_session(
    brand_id: Optional[str] = Query(None),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Start or retrieve today's session."""
    brand = resolve_user_brand(user, db, brand_id=brand_id)
    if not brand:
        raise HTTPException(status_code=404, detail="Brand profile not found")

    # Check if session already exists for today
    existing_session = db.query(DailySession).filter(
        DailySession.user_id == user.id,
        DailySession.brand_id == brand.id,
        DailySession.session_date == date.today()
    ).first()

    if existing_session:
        questions = [
            {"question_id": "q1", "question": "Focus", "options": [], "type": "focus"},
            {"question_id": "q2", "question": "Platform", "options": [], "type": "platform"},
            {"question_id": "q3", "question": "Special", "options": [], "type": "special"}
        ]
        return {
            "session_id": existing_session.id,
            "questions": questions,
            "is_new": False
        }

    # Create session record
    session = DailySession(
        user_id=user.id,
        brand_id=brand.id,
        question_1="Focus",
        question_2="Platform",
        question_3="Special",
        session_date=date.today()
    )
    db.add(session)
    db.commit()
    db.refresh(session)

    return {
        "session_id": session.id,
        "questions": [
            {"question_id": "q1", "question": "Focus", "options": [], "type": "focus"},
            {"question_id": "q2", "question": "Platform", "options": [], "type": "platform"},
            {"question_id": "q3", "question": "Special", "options": [], "type": "special"}
        ]
    }

@router.get("/recent-history")
async def get_recent_history(
    brand_id: Optional[str] = Query(None),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Return the last 7 generated content ideas for history tracking."""
    brand = resolve_user_brand(user, db, brand_id=brand_id)
    query = db.query(ContentIdea).filter(ContentIdea.user_id == user.id)
    if brand:
        query = query.filter(ContentIdea.brand_id == brand.id)
    ideas = query.order_by(ContentIdea.created_at.desc()).limit(7).all()
    
    return [
        {
            "content_type": idea.content_type,
            "theme": idea.idea_title
        } for idea in ideas
    ]

@router.post("/generate-all")
@router.post("/generate-content")
@limiter.limit(RATE_LIMIT_SESSION_GEN)
async def generate_session_content(
    request: Request,
    req: SessionGenerationRequest,
    brand_id: Optional[str] = Query(None),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Generate multi-platform content based on session answers and AI strategy decision."""
    if getattr(user, "role", "user") in ("admin", "support_admin"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Portal boundary enforcement: Platform administrators cannot generate customer brand content. Please use a customer account."
        )

    session = db.query(DailySession).filter(DailySession.id == req.session_id).first()
    target_brand_id = brand_id or (session.brand_id if session else None)
    brand = resolve_user_brand(user, db, brand_id=target_brand_id)
    
    if not brand or not session:
        raise HTTPException(status_code=404, detail="Brand or Session not found")

    # 2. Get latest WebsiteScan
    scan = db.query(WebsiteScan).filter(WebsiteScan.brand_id == brand.id).order_by(WebsiteScan.scanned_at.desc()).first()
    if not scan:
        scan = db.query(WebsiteScan).filter(WebsiteScan.user_id == user.id).order_by(WebsiteScan.scanned_at.desc()).first()
        
    website_data = (scan.raw_text if scan and scan.raw_text else "No recent scan data available.")

    # Update session with answers
    session.answer_1 = req.answer_1
    session.answer_2 = req.answer_2
    session.answer_3 = req.answer_3
    db.commit()

    # 2. Get last posts history  
    recent_ideas = db.query(ContentIdea).filter(
        ContentIdea.user_id == user.id
    ).order_by(ContentIdea.created_at.desc()).limit(7).all()
    
    last_posts_history = [
        {
            "content_type": idea.content_type,
            "theme": idea.idea_title
        } for idea in recent_ideas
    ]

    # 3. Build comprehensive Brand Kit profile (reads from saved kit, not raw scrape)
    is_special_day = "special" in req.answer_1.lower() or "yes" in req.answer_1.lower()
    special_message = req.answer_2 if is_special_day else ""

    brand_profile = {
        "business_name": brand.business_name,
        "tagline": brand.tagline,
        "business_type": brand.business_type,
        "industry": brand.industry,
        "target_audience": brand.target_audience,
        "brand_tone": brand.brand_tone,
        "brand_personality": brand.brand_personality,
        "brand_voice": brand.brand_voice,
        "brand_keywords": brand.brand_keywords or [],
        "content_themes": brand.content_themes or [],
        "products_services": brand.products_services or brand.detected_products or [],
        "detected_products": brand.detected_products or brand.products_services or [],
        "colors": brand.colors or ["#1558C9", "#D4FF24"],
        "primary_color": brand.primary_color or "#1558C9",
        "secondary_color": brand.secondary_color or "#D4FF24",
        "logo_style": brand.logo_style,
        "logo_url": brand.logo_url,
        "clean_logo_url": brand.clean_logo_url
    }

    from services.analytics.learning_engine import learning_engine
    learning_context = learning_engine.get_learning_prompt_context(brand.id, db)

    decided_strategy = gemini.decide_content_strategy(
        brand_profile=brand_profile,
        special_message=special_message,
        is_special_day=is_special_day,
        last_posts_history=last_posts_history,
        learning_context=learning_context
    )

    # 4. Generate all platform captions (Gemini)
    answers = {
        "answer_1": req.answer_1,
        "answer_2": req.answer_2,
        "answer_3": req.answer_3
    }
    
    content_data = gemini.generate_multi_platform_content(
        brand_profile=brand_profile,
        session_answers=answers,
        website_data=website_data,
        last_posts_history=last_posts_history,
        decided_strategy=decided_strategy,
        learning_context=learning_context
    )
    
    if not content_data:
        raise HTTPException(status_code=500, detail="Failed to generate content")

    # 5. Generate image prompts (Gemini)
    prompt_res = gemini.generate_image_prompt(
        brand_profile=brand_profile,
        content_theme=content_data.get("session_theme", "Daily Content"),
        platform="all",
        special_message=special_message
    )
    prompt = prompt_res.get("main_prompt") or f"A high-quality branded post about {content_data.get('session_theme', 'Daily Content')}"
    style = prompt_res.get("style", "digital art")

    # 6. Generate images for all platforms in parallel
    instagram_caption = content_data.get("instagram_post", {}).get("caption") or ""
    instagram_cta = content_data.get("instagram_post", {}).get("call_to_action") or ""
    
    linkedin_caption = content_data.get("linkedin_post", {}).get("caption") or ""
    linkedin_cta = content_data.get("linkedin_post", {}).get("call_to_action") or ""
    
    facebook_caption = content_data.get("facebook_post", {}).get("caption") or ""
    facebook_cta = content_data.get("facebook_post", {}).get("call_to_action") or ""
    
    story_text = content_data.get("instagram_story", {}).get("text") or content_data.get("instagram_story", {}).get("caption") or ""
    story_cta = content_data.get("instagram_story", {}).get("cta") or ""

    daily_context = {
        "answer_1": req.answer_1,
        "answer_2": req.answer_2,
        "answer_3": req.answer_3,
        "theme": content_data.get("session_theme", "Daily Content"),
        "special_message": special_message
    }

    instagram_task = generate_image(
        prompt, 'instagram_post', brand_profile, instagram_caption, instagram_cta, style,
        daily_context=daily_context, user_id=user.id, brand_id=brand.id, db=db
    )
    linkedin_task = generate_image(
        prompt, 'linkedin_post', brand_profile, linkedin_caption, linkedin_cta, style,
        daily_context=daily_context, user_id=user.id, brand_id=brand.id, db=db
    )
    facebook_task = generate_image(
        prompt, 'facebook_post', brand_profile, facebook_caption, facebook_cta, style,
        daily_context=daily_context, user_id=user.id, brand_id=brand.id, db=db
    )
    story_task = generate_image(
        prompt, 'instagram_story', brand_profile, story_text, story_cta, style,
        daily_context=daily_context, user_id=user.id, brand_id=brand.id, db=db
    )

    all_images = await asyncio.gather(
        instagram_task, linkedin_task,
        facebook_task, story_task
    )
    instagram_url, linkedin_url, facebook_url, story_url = all_images

    # 7. Save everything to DB
    idea = ContentIdea(
        user_id=user.id,
        brand_id=brand.id,
        idea_title=content_data.get("session_theme", "Daily Content"),
        idea_description=f"Generated from session on {date.today()}",
        content_type=decided_strategy.get("decided_focus", "educational"),
        template_type="ai_generated",
        status="generated"
    )
    db.add(idea)
    db.flush()

    # Save individual posts
    platforms = ["instagram_post", "instagram_story", "linkedin_post", "facebook_post"]
    for platform in platforms:
        p_data = content_data.get(platform)
        if p_data:
            post = GeneratedPost(
                idea_id=idea.id,
                user_id=user.id,
                brand_id=brand.id,
                platform=platform,
                caption=p_data.get("caption") or p_data.get("text"),
                hashtags=p_data.get("hashtags"),
                call_to_action=p_data.get("call_to_action") or p_data.get("cta"),
                posting_time_suggestion=f"{p_data.get('best_day', '')} {p_data.get('best_time', '')}".strip(),
                status="draft"
            )
            # Add image URLs depending on the platform
            if platform == "instagram_post":
                post.post_image_url = instagram_url
            elif platform == "instagram_story":
                post.story_image_url = story_url
            elif platform == "linkedin_post":
                post.post_image_url = linkedin_url
                post.banner_image_url = linkedin_url
            elif platform == "facebook_post":
                post.post_image_url = facebook_url
                
            db.add(post)

    db.commit()

    # 8. Return captions + image URLs structured exactly as requested
    return {
        "session_id": session.id,
        "session_theme": content_data.get("session_theme", "Daily Content"),
        "instagram_post": {
            "caption": instagram_caption,
            "hashtags": content_data.get("instagram_post", {}).get("hashtags") or [],
            "best_time": content_data.get("instagram_post", {}).get("best_time") or "7:00 PM",
            "image_url": instagram_url,
            "image_status": "ready"
        },
        "instagram_story": {
            "text": story_text,
            "image_url": story_url
        },
        "linkedin": {
            "caption": linkedin_caption,
            "image_url": linkedin_url
        },
        "facebook": {
            "caption": facebook_caption,
            "image_url": facebook_url
        },
        "guidance": content_data.get("guidance") or {}
    }

@router.get("/today")
async def get_today_session(
    brand_id: Optional[str] = Query(None),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Return today's session if it exists, or initialize a new one if not."""
    brand = resolve_user_brand(user, db, brand_id=brand_id)
    if not brand:
        raise HTTPException(status_code=404, detail="Brand profile not found")

    session = db.query(DailySession).filter(
        DailySession.user_id == user.id,
        DailySession.brand_id == brand.id,
        DailySession.session_date == date.today()
    ).first()
    
    if not session:
        session = DailySession(
            user_id=user.id,
            brand_id=brand.id,
            question_1="Focus direction",
            question_2="Platform selection",
            question_3="Special highlights",
            session_date=date.today()
        )
        db.add(session)
        db.commit()
        db.refresh(session)
        
    return session

@router.get("/streak")
async def get_content_streak(
    brand_id: Optional[str] = Query(None),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Calculate the consecutive content creation days and last 7 days history."""
    today = date.today()
    brand = resolve_user_brand(user, db, brand_id=brand_id)
    
    # Get all session dates for the user and brand, ordered descending
    query = db.query(DailySession).filter(DailySession.user_id == user.id)
    if brand:
        query = query.filter(DailySession.brand_id == brand.id)
    sessions = query.order_by(DailySession.session_date.desc()).all()
    
    session_dates = {s.session_date for s in sessions}
    
    # Calculate last 7 days history (from today going backward 6 days)
    history = []
    for i in range(7):
        day = today - timedelta(days=i)
        history.append(day in session_dates)
    
    # Reverse history so it goes from 6 days ago -> today
    history.reverse()
    
    # Calculate streak (consecutive days starting from today or yesterday going backward)
    streak_count = 0
    current_day = today
    
    # If there is no session today, check if there was one yesterday to maintain the streak
    if today not in session_dates:
        current_day = today - timedelta(days=1)
        
    while current_day in session_dates:
        streak_count += 1
        current_day -= timedelta(days=1)
        
    return {
        "streak_count": streak_count,
        "history": history
    }


# ─── Upload Reference Image Endpoint ───────────────────────────────────────
@router.post("/upload-reference")
async def upload_reference_image(
    file: UploadFile = File(...),
    mode: str = Form("use_photo"),  # "use_photo" | "style_inspiration"
    user: User = Depends(get_current_user)
):
    """
    Validate reference image (type, max 8MB), strip EXIF for privacy,
    run content moderation, store in private R2 bucket, and return signed URL.
    """
    if mode not in ("use_photo", "style_inspiration"):
        mode = "use_photo"

    raw_bytes = await file.read()
    cleaned_bytes, ext, width, height = validate_and_process_reference_image(
        raw_bytes,
        original_filename=file.filename
    )

    # Heuristic moderation
    run_basic_content_moderation(cleaned_bytes)

    # Store in private R2 bucket with signed URL or local storage fallback
    filename = f"ref_{user.id[:8]}_{uuid.uuid4().hex[:8]}.{ext}"
    content_type = f"image/{'jpeg' if ext in ('jpg', 'jpeg') else ext}"
    signed_url = storage_service.upload_private_reference(
        image_bytes=cleaned_bytes,
        filename=filename,
        content_type=content_type
    )

    return {
        "url": signed_url,
        "filename": filename,
        "mode": mode,
        "width": width,
        "height": height,
        "size_kb": round(len(cleaned_bytes) / 1024, 1)
    }


# ─── Multi-Variant Generation Task ──────────────────────────────────────────
async def generate_single_variant(
    index: int,
    style_info: Dict[str, str],
    platform: str,
    brand_profile: Dict[str, Any],
    headline: str,
    caption: str,
    cta: str,
    daily_context: Dict[str, Any],
    reference_images: Optional[List[Dict[str, Any]]],
    reference_context: Optional[str],
    user: User,
    brand: Brand,
    session: DailySession,
    db: Session
) -> VariantResponseItem:
    """Generate a single variant in parallel with independent error handling."""
    variant_id = str(uuid.uuid4())
    aspect_ratio, (w, h) = nano_banana_generator.normalize_aspect_ratio(platform)

    try:
        # 1. Generate background via Nano Banana 2.1 incorporating references and style direction
        bg_url = await nano_banana_generator.generate_background(
            brand_profile=brand_profile,
            daily_context=daily_context,
            aspect_ratio=aspect_ratio,
            user_id=user.id,
            brand_id=brand.id,
            reference_images=reference_images,
            reference_context=reference_context,
            variant_style=style_info["direction"],
            db=db
        )

        # 2. Render Playwright HTML/CSS template to crisp PNG bytes
        final_bytes = await image_gen.create_branded_post_async(
            brand_profile=brand_profile,
            post_text=headline,
            platform=platform,
            cta=cta,
            background_image_url=bg_url,
            aspect_ratio=aspect_ratio
        )

        # 3. Upload variant PNG to storage with unguessable token
        image_gen_platform = platform.replace("_post", "")
        filename = f"variant_{index}_{image_gen_platform}_{uuid.uuid4().hex}.png"
        public_url = storage_service.upload_image(final_bytes, filename)

        # 4. Save to session_variants with 7-day auto-expiry
        expiry = datetime.utcnow() + timedelta(days=7)
        variant_record = SessionVariant(
            id=variant_id,
            session_id=session.id,
            user_id=user.id,
            brand_id=brand.id,
            platform=platform,
            variant_index=index,
            variant_label=f"Variant {index + 1}: {style_info['label']}",
            style_direction=style_info["direction"],
            image_url=public_url,
            background_url=bg_url,
            headline=headline,
            caption=caption,
            call_to_action=cta,
            is_selected=False,
            expires_at=expiry
        )
        db.add(variant_record)
        db.commit()

        return VariantResponseItem(
            id=variant_id,
            variant_index=index,
            variant_label=f"Variant {index + 1}: {style_info['label']}",
            style_direction=style_info["direction"],
            image_url=public_url,
            headline=headline,
            caption=caption,
            call_to_action=cta,
            is_selected=False,
            status="ready",
            error=None
        )
    except Exception as e:
        logger.error(f"Error generating variant {index} ({style_info['label']}): {e}")
        # Produce a real branded fallback PNG to guarantee valid 200 image serving
        try:
            fallback_bytes = storage_service.generate_fallback_image(
                brand_profile=brand_profile,
                headline=headline,
                platform=platform
            )
            image_gen_platform = platform.replace("_post", "")
            filename = f"variant_{index}_{image_gen_platform}_{uuid.uuid4().hex}.png"
            public_url = storage_service.upload_image(fallback_bytes, filename)
            status_val = "ready"
        except Exception as fb_err:
            logger.error(f"Fallback generation error: {fb_err}")
            public_url = f"{storage_service.get_public_base_url()}/api/media/posts/fallback_{platform}.png"
            status_val = "fallback"

        expiry = datetime.utcnow() + timedelta(days=7)
        try:
            variant_record = SessionVariant(
                id=variant_id,
                session_id=session.id,
                user_id=user.id,
                brand_id=brand.id,
                platform=platform,
                variant_index=index,
                variant_label=f"Variant {index + 1}: {style_info['label']}",
                style_direction=style_info["direction"],
                image_url=public_url,
                background_url=None,
                headline=headline,
                caption=caption,
                call_to_action=cta,
                is_selected=False,
                expires_at=expiry
            )
            db.add(variant_record)
            db.commit()
        except Exception as db_err:
            logger.error(f"Failed to persist fallback variant record: {db_err}")
            db.rollback()

        return VariantResponseItem(
            id=variant_id,
            variant_index=index,
            variant_label=f"Variant {index + 1}: {style_info['label']}",
            style_direction=style_info["direction"],
            image_url=public_url,
            headline=headline,
            caption=caption,
            call_to_action=cta,
            is_selected=False,
            status=status_val,
            error=str(e)
        )


@router.post("/generate-variants", response_model=MultiVariantSessionResponse)
@limiter.limit(RATE_LIMIT_SESSION_GEN)
async def generate_session_variants(
    request: Request,
    req: SessionGenerationRequest,
    brand_id: Optional[str] = Query(None),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Enhanced Session Generator with Reference Input and Multiple Image Variants:
    1. Supports Reference Area: text only, image only, or image + text.
    2. Respects Reference Modes ("Use my photo" vs "Style inspiration").
    3. Produces N genuinely distinct image variants in parallel (plan limits: Starter 2, Growth 3, Pro 4).
    4. Text, logo, and CTA are preserved cleanly in the Playwright HTML overlay.
    5. Stores variants with 7-day auto-expiry for unselected variants.
    6. Logs generation usage and returns remaining credits.
    """
    if getattr(user, "role", "user") in ("admin", "support_admin"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Portal boundary enforcement: Platform administrators cannot generate customer brand content. Please use a customer account."
        )

    session = db.query(DailySession).filter(DailySession.id == req.session_id).first()
    target_brand_id = brand_id or (session.brand_id if session else None)
    brand = resolve_user_brand(user, db, brand_id=target_brand_id)

    if not brand or not session:
        raise HTTPException(status_code=404, detail="Brand or Session not found")

    # 1. Update session answers
    session.answer_1 = req.answer_1
    session.answer_2 = req.answer_2
    session.answer_3 = req.answer_3
    db.commit()

    # 2. Brand profile assembly
    brand_profile = {
        "business_name": brand.business_name,
        "tagline": brand.tagline,
        "business_type": brand.business_type,
        "industry": brand.industry,
        "target_audience": brand.target_audience,
        "brand_tone": brand.brand_tone,
        "brand_personality": brand.brand_personality,
        "brand_voice": brand.brand_voice,
        "brand_keywords": brand.brand_keywords or [],
        "content_themes": brand.content_themes or [],
        "products_services": brand.products_services or brand.detected_products or [],
        "colors": brand.colors or ["#1558C9", "#D4FF24"],
        "primary_color": brand.primary_color or "#1558C9",
        "secondary_color": brand.secondary_color or "#D4FF24",
        "logo_style": brand.logo_style,
        "logo_url": brand.logo_url,
        "clean_logo_url": brand.clean_logo_url
    }

    # 3. Determine plan limit for variants
    max_allowed = get_max_variants_for_user(user)
    count = min(req.variant_count or max_allowed, max_allowed)
    selected_styles = VARIANT_STYLES[:count]

    # 4. Generate copy / captions once (shared across variants)
    is_special_day = "special" in req.answer_1.lower() or "yes" in req.answer_1.lower()
    special_message = req.answer_2 if is_special_day else ""
    if req.context_text:
        special_message = f"{special_message} Context: {req.context_text}".strip()

    from services.analytics.learning_engine import learning_engine
    learning_context = learning_engine.get_learning_prompt_context(brand.id, db)

    decided_strategy = gemini.decide_content_strategy(
        brand_profile=brand_profile,
        special_message=special_message,
        is_special_day=is_special_day,
        last_posts_history=[],
        learning_context=learning_context
    )

    answers = {
        "answer_1": req.answer_1,
        "answer_2": req.answer_2,
        "answer_3": req.answer_3,
        "context_text": req.context_text or ""
    }

    content_data = gemini.generate_multi_platform_content(
        brand_profile=brand_profile,
        session_answers=answers,
        website_data=brand.tagline or brand.business_name,
        last_posts_history=[],
        decided_strategy=decided_strategy,
        learning_context=learning_context
    ) or {}

    platform = req.target_platform or "instagram_post"
    p_data = content_data.get(platform, {})
    caption = p_data.get("caption") or f"Exciting new perspectives from {brand.business_name}."
    hashtags = p_data.get("hashtags") or ["#business", "#innovation", "#growth"]
    cta = p_data.get("call_to_action") or p_data.get("cta") or "Discover more today"
    best_time = f"{p_data.get('best_day', 'Today')} {p_data.get('best_time', '7:00 PM')}".strip()

    # Generate crisp headline overlay for the HTML template
    loop = asyncio.get_running_loop()
    overlay = await loop.run_in_executor(
        None,
        gemini.generate_post_text_overlay,
        caption,
        platform
    )
    headline = overlay.get("headline") or content_data.get("session_theme", "Daily Focus")
    overlay_cta = overlay.get("cta") or cta

    daily_context = {
        "answer_1": req.answer_1,
        "answer_2": req.answer_2,
        "answer_3": req.answer_3,
        "theme": content_data.get("session_theme", "Daily Content"),
        "special_message": special_message
    }

    ref_imgs = [r.dict() for r in (req.reference_images or [])]

    # 5. Execute N variants in parallel with per-variant resilience
    variant_tasks = [
        generate_single_variant(
            index=i,
            style_info=style,
            platform=platform,
            brand_profile=brand_profile,
            headline=headline,
            caption=caption,
            cta=overlay_cta,
            daily_context=daily_context,
            reference_images=ref_imgs,
            reference_context=req.context_text,
            user=user,
            brand=brand,
            session=session,
            db=db
        )
        for i, style in enumerate(selected_styles)
    ]

    variant_results = await asyncio.gather(*variant_tasks)

    # 6. Default select the first successfully generated variant
    if variant_results:
        first_valid = next((v for v in variant_results if v.status == "ready"), variant_results[0])
        first_valid.is_selected = True
        db_var = db.query(SessionVariant).filter(SessionVariant.id == first_valid.id).first()
        if db_var:
            db_var.is_selected = True
            db.commit()

    credits_rem = get_credits_remaining_for_user(user, db)

    return MultiVariantSessionResponse(
        session_id=session.id,
        session_theme=content_data.get("session_theme", "Daily Content"),
        caption=caption,
        hashtags=hashtags,
        call_to_action=overlay_cta,
        posting_time_suggestion=best_time,
        variants=variant_results,
        credits_remaining=credits_rem,
        plan=(user.plan or "starter").capitalize(),
        max_variants_allowed=max_allowed,
        guidance=content_data.get("guidance") or {}
    )


# ─── Variant Selection & Finalization ───────────────────────────────────────
@router.post("/select-variant")
def select_session_variant(
    req: SelectVariantRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Select one variant:
    - Marks it as is_selected = True.
    - Persists only the selected variant to GeneratedPost history and calendar/publishing queue.
    - Unselected variants remain temporary with 7-day auto-expiry.
    - Increments posts_used_this_month usage counter.
    """
    variant = db.query(SessionVariant).filter(
        SessionVariant.id == req.variant_id,
        SessionVariant.user_id == user.id
    ).first()
    if not variant:
        raise HTTPException(status_code=404, detail="Variant not found")

    if getattr(user, "role", "user") in ("admin", "support_admin"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Portal boundary enforcement: Platform administrators cannot generate customer brand content. Please use a customer account."
        )

    session = db.query(DailySession).filter(DailySession.id == req.session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # Update is_selected across session variants
    db.query(SessionVariant).filter(SessionVariant.session_id == req.session_id).update({"is_selected": False})
    variant.is_selected = True

    final_caption = req.adjusted_caption or variant.caption or ""
    final_hashtags = req.adjusted_hashtags if req.adjusted_hashtags is not None else variant.hashtags

    # Create permanent ContentIdea & GeneratedPost
    idea = ContentIdea(
        user_id=user.id,
        brand_id=variant.brand_id,
        idea_title=variant.headline or "Daily Post",
        idea_description=f"Finalized variant from session on {date.today()}",
        content_type="session_variant",
        template_type="ai_generated",
        status="generated"
    )
    db.add(idea)
    db.flush()

    post = GeneratedPost(
        idea_id=idea.id,
        user_id=user.id,
        brand_id=variant.brand_id,
        platform=variant.platform,
        caption=final_caption,
        hashtags=final_hashtags,
        call_to_action=variant.call_to_action,
        post_image_url=variant.image_url,
        status="draft"
    )
    db.add(post)

    # Verify image reachability in storage before deducting credit!
    filename = os.path.basename(variant.image_url.split("?")[0]) if variant.image_url else ""
    if not storage_service.verify_image_reachable(filename):
        raise HTTPException(
            status_code=400,
            detail="The selected variant image is not verified or reachable in storage. Please click 'Regenerate this variant' to generate a fresh image before saving."
        )

    # Increment user monthly posts counter ONLY after image verification succeeds
    user.posts_used_this_month = (user.posts_used_this_month or 0) + 1
    db.commit()

    return {
        "success": True,
        "message": "Variant selected and saved to your history and calendar queue.",
        "post_id": post.id,
        "selected_variant_id": variant.id,
        "image_url": variant.image_url,
        "caption": final_caption,
        "hashtags": final_hashtags
    }


# ─── Regenerate Single Variant / More Like This ────────────────────────────
@router.post("/regenerate-variant")
async def regenerate_single_variant_endpoint(
    req: RegenerateVariantRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Regenerate one variant or produce a fresh variant based on user feedback.
    Logs cost to usage table.
    """
    if getattr(user, "role", "user") in ("admin", "support_admin"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Portal boundary enforcement: Platform administrators cannot generate customer brand content. Please use a customer account."
        )

    session = db.query(DailySession).filter(DailySession.id == req.session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    brand = resolve_user_brand(user, db, brand_id=session.brand_id)
    if not brand:
        raise HTTPException(status_code=404, detail="Brand not found")

    brand_profile = {
        "business_name": brand.business_name,
        "tagline": brand.tagline,
        "industry": brand.industry or brand.business_type,
        "brand_tone": brand.brand_tone,
        "primary_color": brand.primary_color or "#1558C9",
        "secondary_color": brand.secondary_color or "#D4FF24",
        "logo_url": brand.logo_url
    }

    direction = req.style_direction or "enhanced dramatic composition with volumetric rim lighting"
    style_info = {"label": "Refreshed Variation", "direction": direction}

    variant_item = await generate_single_variant(
        index=99,
        style_info=style_info,
        platform=req.target_platform or "instagram_post",
        brand_profile=brand_profile,
        headline=brand.business_name or "Brand Update",
        caption=session.answer_2 or "Exciting new update",
        cta="Learn More",
        daily_context={"theme": session.answer_1 or "Brand"},
        reference_images=[],
        reference_context=req.reference_context,
        user=user,
        brand=brand,
        session=session,
        db=db
    )

    return {
        "success": True,
        "variant": variant_item
    }


# ─── Cleanup Expired Unselected Variants ───────────────────────────────────
def cleanup_expired_session_variants(db: Session) -> int:
    """Delete unselected session variants older than 7 days."""
    now = datetime.utcnow()
    deleted = db.query(SessionVariant).filter(
        SessionVariant.is_selected == False,
        SessionVariant.expires_at <= now
    ).delete(synchronize_session=False)
    db.commit()
    logger.info(f"Cleaned up {deleted} expired unselected session variants.")
    return deleted

