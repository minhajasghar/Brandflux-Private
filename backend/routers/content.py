from fastapi import APIRouter, Depends, HTTPException, Request, Query
from sqlalchemy.orm import Session
from datetime import date
from typing import List, Optional

from database import get_db
from models.models import Brand, ContentIdea, GeneratedPost, SmartQuestion, UserAnswer, User, SessionVariant
from models.schemas import (
    ContentGenerateRequest, GeneratedPostResponse,
    ContentBatchResponse
)
from middleware.auth import get_current_user
from middleware.limiter import limiter
from config import RATE_LIMIT_CONTENT_GEN
from services import gemini
from services.brand_service import resolve_user_brand

router = APIRouter(prefix="/content", tags=["content"])


@router.post("/generate", response_model=ContentBatchResponse)
@limiter.limit(RATE_LIMIT_CONTENT_GEN)
def generate_content(
    request: Request,
    req: ContentGenerateRequest,
    brand_id: Optional[str] = Query(None),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Generate content for multiple platforms.
    Uses brand profile + today's answered questions.
    """
    brand = resolve_user_brand(user, db, brand_id=brand_id)
    if not brand:
        raise HTTPException(status_code=404, detail="No brand found")
    if brand.scan_status != "completed":
        raise HTTPException(status_code=400, detail="Brand scan not completed yet")

    # Build saved brand kit profile
    brand_profile = {
        "business_name": brand.business_name,
        "tagline": brand.tagline,
        "industry": brand.industry or brand.business_type,
        "target_audience": brand.target_audience,
        "brand_tone": brand.brand_tone,
        "brand_voice": brand.brand_voice,
        "brand_personality": brand.brand_personality,
        "brand_keywords": brand.brand_keywords or [],
        "content_themes": brand.content_themes or [],
        "products_services": brand.products_services or brand.detected_products or [],
        "colors": brand.colors or ["#1558C9", "#D4FF24"],
        "primary_color": brand.primary_color or "#1558C9",
        "secondary_color": brand.secondary_color or "#D4FF24",
    }

    # Get today's answers
    today = date.today()
    todays_questions = db.query(SmartQuestion).filter(
        SmartQuestion.user_id == user.id,
        SmartQuestion.date_for == today,
        SmartQuestion.is_answered == True,
    ).all()

    answers_data = []
    for q in todays_questions:
        answer = db.query(UserAnswer).filter(
            UserAnswer.question_id == q.id
        ).first()
        if answer:
            answers_data.append({
                "question": q.question_text,
                "answer": answer.answer_text,
            })

    # Create content idea
    idea = ContentIdea(
        user_id=user.id,
        brand_id=brand.id,
        idea_title=req.topic or "Daily Content",
        idea_description=f"Content generated from {len(answers_data)} answers",
        content_type="mixed",
        template_type="ai_generated",
        status="generating",
        week_of=today,
    )
    db.add(idea)
    db.commit()
    db.refresh(idea)

    # Generate for each platform
    posts = []
    for platform in req.platforms:
        try:
            content = gemini.generate_content(
                brand_profile=brand_profile,
                answers=answers_data,
                platform=platform,
                topic=req.topic,
            )

            post = GeneratedPost(
                idea_id=idea.id,
                user_id=user.id,
                brand_id=brand.id,
                platform=platform,
                caption=content.get("caption", ""),
                hashtags=content.get("hashtags", []),
                call_to_action=content.get("call_to_action", ""),
                posting_time_suggestion=content.get("posting_time_suggestion", ""),
                content_mix_type=content.get("content_mix_type", ""),
                status="draft",
            )
            db.add(post)
            posts.append(post)

        except Exception as e:
            # If one platform fails, continue with others
            post = GeneratedPost(
                idea_id=idea.id,
                user_id=user.id,
                brand_id=brand.id,
                platform=platform,
                caption=f"Error generating content: {str(e)}",
                status="failed",
            )
            db.add(post)
            posts.append(post)

    idea.status = "generated"
    db.commit()

    # Refresh posts to get IDs
    for post in posts:
        db.refresh(post)

    # Update user's post count
    user_obj = db.query(User).filter(User.id == user.id).first()
    if user_obj:
        user_obj.posts_used_this_month = (user_obj.posts_used_this_month or 0) + len(posts)
        db.commit()

    return ContentBatchResponse(
        idea_id=idea.id,
        idea_title=idea.idea_title,
        posts=[GeneratedPostResponse.model_validate(p) for p in posts],
    )


@router.get("/posts", response_model=List[GeneratedPostResponse])
def list_posts(
    platform: str = None,
    brand_id: Optional[str] = Query(None),
    limit: int = 20,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """List generated posts, optionally filtered by platform and brand."""
    brand = resolve_user_brand(user, db, brand_id=brand_id)
    query = db.query(GeneratedPost).filter(GeneratedPost.user_id == user.id)

    if brand:
        query = query.filter(GeneratedPost.brand_id == brand.id)
    if platform:
        query = query.filter(GeneratedPost.platform == platform)

    posts = query.order_by(GeneratedPost.created_at.desc()).limit(limit).all()
    return posts


@router.get("/posts/{post_id}", response_model=GeneratedPostResponse)
def get_post(
    post_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get a single generated post."""
    post = db.query(GeneratedPost).filter(
        GeneratedPost.id == post_id,
        GeneratedPost.user_id == user.id,
    ).first()

    if not post:
        raise HTTPException(status_code=404, detail="Post not found")

    return post

# ─── Content History & Saved Templates Endpoints ──────────────────
from pydantic import BaseModel
from models.models import SavedTemplate

class SaveTemplateRequest(BaseModel):
    content_id: str
    platform: str
    custom_name: str

@router.get("/history")
async def get_content_history(
    page: int = 1,
    limit: int = 10,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Return paginated list of generated sessions/content."""
    offset = (page - 1) * limit
    
    # Query total generated ideas
    total = db.query(ContentIdea).filter(
        ContentIdea.user_id == user.id,
        ContentIdea.status == "generated"
    ).count()
    
    ideas = db.query(ContentIdea).filter(
        ContentIdea.user_id == user.id,
        ContentIdea.status == "generated"
    ).order_by(ContentIdea.created_at.desc()).offset(offset).limit(limit).all()
    
    items = []
    for idea in ideas:
        instagram_caption = ""
        linkedin_caption = ""
        platforms = []
        image_url = None
        
        for post in idea.generated_posts:
            if not image_url and (post.post_image_url or post.story_image_url or post.banner_image_url):
                image_url = post.post_image_url or post.story_image_url or post.banner_image_url
            if "instagram_post" in post.platform:
                instagram_caption = post.caption[:100] if post.caption else ""
                platforms.append("instagram")
            elif "linkedin" in post.platform:
                linkedin_caption = post.caption[:100] if post.caption else ""
                platforms.append("linkedin")
            elif "facebook" in post.platform:
                platforms.append("facebook")
            elif "story" in post.platform:
                platforms.append("instagram_story")
            elif "twitter" in post.platform:
                platforms.append("twitter")

        # Fallback to selected variant for this brand if not set on post directly
        if not image_url:
            variant = db.query(SessionVariant).filter(
                SessionVariant.user_id == user.id,
                SessionVariant.brand_id == idea.brand_id,
                SessionVariant.is_selected == True
            ).order_by(SessionVariant.created_at.desc()).first()
            if variant and variant.image_url:
                image_url = variant.image_url
                
        items.append({
            "id": idea.id,
            "session_date": idea.created_at.date().isoformat() if idea.created_at else "",
            "session_theme": idea.idea_title,
            "instagram_caption": instagram_caption,
            "linkedin_caption": linkedin_caption,
            "platforms_generated": list(set(platforms)),
            "image_url": image_url,
            "created_at": idea.created_at.isoformat() if idea.created_at else ""
        })
        
    has_more = offset + len(ideas) < total
    return {
        "items": items,
        "total": total,
        "page": page,
        "has_more": has_more
    }

@router.get("/history/{id}")
async def get_content_history_detail(
    id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Return full detailed multi-platform output for one historical session."""
    idea = db.query(ContentIdea).filter(
        ContentIdea.id == id,
        ContentIdea.user_id == user.id
    ).first()
    
    if not idea:
        raise HTTPException(status_code=404, detail="Content history session not found")

    # Find primary image URL for this session
    primary_image_url = None
    for post in idea.generated_posts:
        if not primary_image_url and (post.post_image_url or post.story_image_url or post.banner_image_url):
            primary_image_url = post.post_image_url or post.story_image_url or post.banner_image_url
            break

    if not primary_image_url:
        variant = db.query(SessionVariant).filter(
            SessionVariant.user_id == user.id,
            SessionVariant.brand_id == idea.brand_id,
            SessionVariant.is_selected == True
        ).order_by(SessionVariant.created_at.desc()).first()
        if variant and variant.image_url:
            primary_image_url = variant.image_url
        
    content = {
        "session_theme": idea.idea_title,
        "image_url": primary_image_url,
        "instagram_post": None,
        "instagram_story": None,
        "linkedin_post": None,
        "facebook_post": None,
        "twitter_post": None,
        "guidance": {
            "tip_of_day": idea.idea_description,
            "this_week_suggestion": "Optimal content calendar suggestion loaded.",
            "best_performing_type": idea.content_type
        }
    }
    
    for post in idea.generated_posts:
        img_url = post.post_image_url or post.story_image_url or post.banner_image_url or primary_image_url
        platform_data = {
            "caption": post.caption,
            "hashtags": post.hashtags or [],
            "call_to_action": post.call_to_action,
            "image_url": img_url
        }
        if post.posting_time_suggestion:
            parts = post.posting_time_suggestion.split()
            platform_data["best_day"] = parts[0] if len(parts) > 0 else "Today"
            platform_data["best_time"] = " ".join(parts[1:]) if len(parts) > 1 else "Optimized time"
            
        if post.platform == "instagram_post":
            content["instagram_post"] = platform_data
        elif post.platform == "instagram_story":
            content["instagram_story"] = {
                "text": post.caption,
                "cta": post.call_to_action,
                "poll_question": "Swipe up to access!",
                "image_url": post.story_image_url or img_url
            }
        elif post.platform == "linkedin_post":
            content["linkedin_post"] = platform_data
        elif post.platform == "facebook_post":
            content["facebook_post"] = {
                "caption": post.caption,
                "hashtags": post.hashtags or [],
                "image_url": img_url
            }
        elif post.platform == "twitter_post":
            content["twitter_post"] = {
                "caption": post.caption,
                "hashtags": post.hashtags or [],
                "image_url": img_url
            }
            
    return content

@router.post("/save-template")
async def save_template(
    req: SaveTemplateRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Save a specific caption as a template for future reuse."""
    post = db.query(GeneratedPost).filter(
        GeneratedPost.id == req.content_id,
        GeneratedPost.user_id == user.id
    ).first()
    
    if not post:
        post = db.query(GeneratedPost).filter(
            GeneratedPost.idea_id == req.content_id,
            GeneratedPost.platform == req.platform,
            GeneratedPost.user_id == user.id
        ).first()
        
    if not post:
        raise HTTPException(status_code=404, detail="Original content post not found")
        
    template = SavedTemplate(
        user_id=user.id,
        content_id=req.content_id,
        platform=req.platform,
        custom_name=req.custom_name,
        caption=post.caption,
        hashtags=post.hashtags
    )
    db.add(template)
    db.commit()
    db.refresh(template)
    
    return {
        "success": True,
        "message": "Template saved successfully!",
        "template": {
            "id": template.id,
            "custom_name": template.custom_name,
            "platform": template.platform,
            "caption": template.caption,
            "hashtags": template.hashtags
        }
    }

@router.get("/templates")
async def get_templates(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Return user's saved templates."""
    templates = db.query(SavedTemplate).filter(
        SavedTemplate.user_id == user.id
    ).order_by(SavedTemplate.created_at.desc()).all()
    
    return [
        {
            "id": t.id,
            "content_id": t.content_id,
            "platform": t.platform,
            "custom_name": t.custom_name,
            "caption": t.caption,
            "hashtags": t.hashtags or [],
            "created_at": t.created_at.isoformat() if t.created_at else ""
        } for t in templates
    ]

# ─── Image Generation Endpoint ─────────────────────────────────────
class GenerateImagesRequest(BaseModel):
    prompt: str
    post_text: str
    cta: str = ""

@router.post("/generate-images")
async def generate_images_endpoint(
    req: GenerateImagesRequest,
    brand_id: Optional[str] = Query(None),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Generate all four branded social media graphics with intelligent Gemini prompt engineering.
    """
    brand = resolve_user_brand(user, db, brand_id=brand_id)
    if not brand:
        raise HTTPException(status_code=404, detail="No brand found")
        
    brand_profile = {
        "business_name": brand.business_name,
        "business_type": brand.business_type,
        "colors": brand.colors or [],
        "primary_color": brand.primary_color,
        "logo_style": brand.logo_style,
        "brand_tone": brand.brand_tone,
        "logo_url": brand.logo_url
    }
    
    from services.gemini_service import GeminiService
    from services.image_generator import ImageGenerator
    
    gemini = GeminiService()
    generator = ImageGenerator()
    
    results = {}
    platforms = [
        ('instagram_post', 'instagram'),
        ('instagram_story', 'story'),
        ('linkedin', 'linkedin'),
        ('facebook', 'facebook')
    ]
    
    for platform_key, gemini_platform_name in platforms:
        try:
            # 1. Ask Gemini to write a high-fidelity image prompt
            prompt_data = gemini.generate_image_prompt(
                brand_profile=brand_profile,
                content_theme=req.prompt,
                platform=gemini_platform_name,
                special_message=req.cta
            )
            
            # 2. Ask Gemini to extract a high-impact short text overlay from the caption
            overlay_data = gemini.generate_post_text_overlay(
                caption=req.post_text,
                platform=gemini_platform_name
            )
            
            main_prompt = prompt_data.get("main_prompt", req.prompt)
            style = prompt_data.get("style", "digital art")
            
            # Text lines for overlay: headline + subtext
            headline = overlay_data.get("headline", "")
            subtext = overlay_data.get("subtext", "")
            cta = overlay_data.get("cta", req.cta)
            
            combined_overlay_text = f"{headline}\n{subtext}".strip()
            if not combined_overlay_text:
                combined_overlay_text = req.post_text[:80]
                
            # 3. Generate background bytes with correct dimensions
            w, h = (1080, 1080)
            if platform_key == 'instagram_story':
                w, h = (1080, 1920)
            elif platform_key == 'linkedin':
                w, h = (1200, 627)
            elif platform_key == 'facebook':
                w, h = (1200, 630)
                
            # 3. Generate picture strictly via Google's Nano Banana 2.1 (Gemini API)
            from services.nano_banana_generator import nano_banana_generator
            aspect_ratio, (w, h) = nano_banana_generator.normalize_aspect_ratio(platform_key)
            bg_url = await nano_banana_generator.generate_background(
                brand_profile=brand_profile,
                daily_context={"topic": req.prompt, "focus": req.post_text},
                aspect_ratio=aspect_ratio,
                user_id=user.id,
                brand_id=brand.id,
                db=db
            )

            if bg_url:
                results[platform_key] = bg_url
            else:
                raise Exception(nano_banana_generator.last_error_message or "Nano Banana 2.1 failed to generate picture")
            
        except Exception as plat_err:
            logger.error(f"Failed to generate for {platform_key}: {plat_err}")
            results[platform_key] = ""
            
    return {
        "success": True,
        "images": results
    }



# ═══════════════════════════════════════════════════════════
# PLAYWRIGHT HTML/CSS CAROUSEL & TEMPLATE GENERATION
# ═══════════════════════════════════════════════════════════
from models.schemas import (
    CarouselGenerateRequest,
    CarouselResponse,
    TemplateRenderRequest,
    TemplateRenderResponse
)
from services.carousel_generator import carousel_generator
from services.image_generator import image_generator
from services.storage import storage_service
import uuid


@router.post("/carousel", response_model=CarouselResponse)
async def generate_carousel(
    req: CarouselGenerateRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Generate an ordered 3-7 slide social carousel (Hook, Points, CTA)
    rendered to high-resolution PNGs via Playwright HTML/CSS templates.
    """
    brand = db.query(Brand).filter(Brand.user_id == user.id).first()
    if not brand:
        raise HTTPException(status_code=404, detail="Brand profile not found")

    brand_profile = {
        "business_name": brand.business_name,
        "tagline": brand.tagline,
        "industry": brand.industry or brand.business_type,
        "target_audience": brand.target_audience,
        "brand_tone": brand.brand_tone,
        "colors": brand.colors or ["#1558C9", "#D4FF24"],
        "primary_color": brand.primary_color or "#1558C9",
        "secondary_color": brand.secondary_color or "#D4FF24",
        "logo_url": brand.logo_url,
        "clean_logo_url": brand.clean_logo_url or brand.logo_url,
        "website_url": brand.website_url,
        "brand_handle": f"@{brand.business_name.lower().replace(' ', '')}"
    }

    try:
        result = await carousel_generator.generate_carousel(
            topic=req.topic,
            brand_profile=brand_profile,
            slide_count=req.slide_count or 5,
            aspect_ratio=req.aspect_ratio or "1:1",
            custom_cta=req.custom_cta
        )
        return result
    except Exception as e:
        logger.error(f"Carousel generation error: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to generate carousel: {str(e)}")


@router.get("/templates")
def list_available_templates():
    """
    List the 6 available HTML/CSS templates with supported aspect ratios and descriptions.
    """
    return {
        "templates": [
            {
                "id": "quote",
                "name": "Minimalist Bold Quote / Statement",
                "aspect_ratios": ["1:1", "4:5", "9:16"],
                "best_for": "Author quotes, contrarian viewpoints, mindset shift posts",
                "supported_keys": ["headline", "subtext", "author_name", "author_title", "cta", "category"]
            },
            {
                "id": "stat",
                "name": "Stat & Metric Highlight",
                "aspect_ratios": ["1:1", "4:5"],
                "best_for": "Case study proof, benchmark reports, numerical gains",
                "supported_keys": ["stat_value", "headline", "description", "metric_label", "source", "cta", "category"]
            },
            {
                "id": "checklist",
                "name": "Actionable Checklist & Value Stack",
                "aspect_ratios": ["4:5", "1:1"],
                "best_for": "Step-by-step checklists, audit items, actionable advice",
                "supported_keys": ["eyebrow", "headline", "items", "cta", "category"]
            },
            {
                "id": "before_after",
                "name": "Comparison Split (Old Way vs New Way)",
                "aspect_ratios": ["1:1", "4:5"],
                "best_for": "Positioning teardowns, methodology comparison, problem vs solution",
                "supported_keys": ["headline", "old_label", "old_points", "new_label", "new_points", "cta"]
            },
            {
                "id": "announcement",
                "name": "Full-Bleed Announcement Hero / Story",
                "aspect_ratios": ["9:16", "1:1"],
                "best_for": "Feature launches, event promos, vertical mobile stories & reels",
                "supported_keys": ["eyebrow", "headline", "subtext", "feature_title", "feature_desc", "cta"]
            },
            {
                "id": "process",
                "name": "Framework & 3-Step Process",
                "aspect_ratios": ["1:1", "4:5"],
                "best_for": "Thought leadership frameworks, blueprints, roadmap explainers",
                "supported_keys": ["eyebrow", "headline", "steps", "cta", "category"]
            }
        ]
    }


@router.post("/templates/render", response_model=TemplateRenderResponse)
async def render_template_post(
    req: TemplateRenderRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Render any of the 6 HTML/CSS templates on-demand to PNG via Playwright.
    """
    brand = db.query(Brand).filter(Brand.user_id == user.id).first()
    if not brand:
        raise HTTPException(status_code=404, detail="Brand profile not found")

    brand_profile = {
        "business_name": brand.business_name,
        "tagline": brand.tagline,
        "industry": brand.industry or brand.business_type,
        "brand_tone": brand.brand_tone,
        "colors": brand.colors or ["#1558C9", "#D4FF24"],
        "primary_color": brand.primary_color or "#1558C9",
        "secondary_color": brand.secondary_color or "#D4FF24",
        "logo_url": brand.logo_url,
        "clean_logo_url": brand.clean_logo_url or brand.logo_url,
        "website_url": brand.website_url,
        "brand_handle": f"@{brand.business_name.lower().replace(' ', '')}"
    }

    try:
        from services.image_generator import ASPECT_RATIO_DIMENSIONS
        aspect = req.aspect_ratio or "1:1"
        width, height = ASPECT_RATIO_DIMENSIONS.get(aspect, (1080, 1080))

        context = {
            "brand_name": brand_profile["business_name"],
            "brand_tagline": brand_profile["tagline"],
            "brand_handle": brand_profile["brand_handle"],
            "brand_logo": brand_profile["clean_logo_url"],
            "website_url": brand_profile["website_url"],
            "headline": req.headline or f"Mastering {brand_profile['industry']}",
            "subtext": req.subtext or "",
            "cta": req.cta or "Learn More",
            "category": req.category or "STRATEGY",
            "colors": brand_profile["colors"],
            "primary_color": brand_profile["primary_color"],
            "secondary_color": brand_profile["secondary_color"],
            **(req.extra_data or {})
        }

        png_bytes = await image_generator.render_template(
            template_name=req.template_name,
            context=context,
            aspect_ratio=aspect,
            width=width,
            height=height
        )

        filename = f"tpl_{req.template_name}_{aspect.replace(':', 'x')}_{uuid.uuid4().hex[:8]}.png"
        image_url = storage_service.upload_image(png_bytes, filename)

        return {
            "success": True,
            "template_name": req.template_name,
            "aspect_ratio": aspect,
            "image_url": image_url,
            "dimensions": {"width": width, "height": height}
        }

    except Exception as e:
        logger.error(f"Template rendering failed: {e}")
        raise HTTPException(status_code=500, detail=f"Template render error: {str(e)}")
