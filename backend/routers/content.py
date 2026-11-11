from fastapi import APIRouter, Depends, HTTPException, Request, Query
from sqlalchemy.orm import Session
from datetime import date, datetime
from typing import List, Optional, Dict, Any
import uuid

from database import get_db
from models.models import (
    Brand, ContentIdea, GeneratedPost, SmartQuestion, UserAnswer,
    User, SessionVariant, Post, PlatformCopy, ScheduledPost,
    SocialAccount, PublishAttempt
)
import json
import logging
logger = logging.getLogger(__name__)
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

    from services.brand_service import get_user_brand_role
    if get_user_brand_role(user, brand.id, db) == "approver":
        raise HTTPException(status_code=403, detail="Approvers cannot generate new content. Only brand creators can generate content.")

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
    platform: Optional[str] = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Return paginated list of parent posts (generations) with their child platform copies.
    - One row per generation.
    - Real first-line caption preview (no generic placeholders).
    - Status badges per platform.
    """
    offset = (page - 1) * limit

    # Query Post table
    post_query = db.query(Post).filter(Post.user_id == user.id)

    if platform and platform != "all":
        norm_p = platform.lower().replace("_post", "").replace("x", "twitter")
        post_query = post_query.join(PlatformCopy, PlatformCopy.post_id == Post.id).filter(
            PlatformCopy.platform.ilike(f"%{norm_p}%")
        ).distinct()

    total = post_query.count()
    posts = post_query.order_by(Post.created_at.desc()).offset(offset).limit(limit).all()

    # Fallback to ContentIdea if posts table is completely empty for this user
    if total == 0:
        idea_query = db.query(ContentIdea).filter(
            ContentIdea.user_id == user.id,
            ContentIdea.status == "generated"
        )
        total = idea_query.count()
        ideas = idea_query.order_by(ContentIdea.created_at.desc()).offset(offset).limit(limit).all()
        items = []
        for idea in ideas:
            ig_cap = ""
            li_cap = ""
            platforms = []
            img_url = None
            for p in idea.generated_posts:
                if not img_url and (p.post_image_url or p.story_image_url or p.banner_image_url):
                    img_url = p.post_image_url or p.story_image_url or p.banner_image_url
                if "instagram" in p.platform:
                    ig_cap = p.caption or ""
                    platforms.append("instagram")
                elif "linkedin" in p.platform:
                    li_cap = p.caption or ""
                    platforms.append("linkedin")
                elif "facebook" in p.platform:
                    platforms.append("facebook")
                elif "twitter" in p.platform:
                    platforms.append("twitter")
                elif "tiktok" in p.platform:
                    platforms.append("tiktok")

            first_line = ""
            for cap in [ig_cap, li_cap]:
                if cap and cap.strip():
                    lines = [l.strip() for l in cap.split("\n") if l.strip()]
                    if lines:
                        first_line = lines[0]
                        break

            items.append({
                "id": idea.id,
                "session_date": idea.created_at.date().isoformat() if idea.created_at else "",
                "session_theme": idea.idea_title,
                "title": idea.idea_title,
                "caption": first_line or "Daily Generation",
                "instagram_caption": ig_cap[:100],
                "linkedin_caption": li_cap[:100],
                "platforms_generated": list(set(platforms)),
                "platform_statuses": {p: "draft" for p in platforms},
                "copies": [],
                "image_url": img_url,
                "created_at": idea.created_at.isoformat() if idea.created_at else ""
            })
        return {
            "items": items,
            "total": total,
            "page": page,
            "has_more": (offset + len(ideas)) < total
        }

    items = []
    for post in posts:
        primary_img = None
        copies_list = []
        platforms_list = []
        platform_statuses = {}
        real_caption = ""

        for copy in post.platform_copies:
            if not primary_img and copy.image_url:
                primary_img = copy.image_url
            p_name = copy.platform.lower()
            platforms_list.append(p_name)
            platform_statuses[p_name] = copy.status or "draft"

            if not real_caption and copy.caption and copy.caption.strip():
                lines = [l.strip() for l in copy.caption.split("\n") if l.strip()]
                if lines:
                    real_caption = lines[0]

            copies_list.append({
                "id": copy.id,
                "platform": copy.platform,
                "caption": copy.caption or "",
                "hashtags": copy.hashtags or [],
                "image_url": copy.image_url,
                "aspect_ratio": copy.aspect_ratio,
                "status": copy.status or "draft",
                "scheduled_at": copy.scheduled_at.isoformat() if copy.scheduled_at else None,
                "external_post_id": copy.external_post_id,
                "permalink": copy.permalink,
                "error": copy.error
            })

        # Fallback to variant image if none on copy
        if not primary_img:
            var = db.query(SessionVariant).filter(
                SessionVariant.user_id == user.id,
                SessionVariant.brand_id == post.brand_id,
                SessionVariant.is_selected == True
            ).order_by(SessionVariant.created_at.desc()).first()
            if var and var.image_url:
                primary_img = var.image_url

        items.append({
            "id": post.id,
            "title": post.title or post.topic or "Daily Content",
            "session_theme": post.title or post.topic or "Daily Content",
            "caption": real_caption or f"Content generation for {post.title or 'social channels'}",
            "session_date": post.created_at.date().isoformat() if post.created_at else "",
            "platforms_generated": list(dict.fromkeys(platforms_list)),
            "platform_statuses": platform_statuses,
            "copies": copies_list,
            "copies_count": len(copies_list),
            "image_url": primary_img,
            "created_at": post.created_at.isoformat() if post.created_at else ""
        })

    has_more = (offset + len(posts)) < total
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
    """Return full detailed multi-platform output for one historical parent post."""
    post = db.query(Post).filter(
        Post.id == id,
        Post.user_id == user.id
    ).first()

    # If found via Post table:
    if post:
        primary_img = None
        for copy in post.platform_copies:
            if not primary_img and copy.image_url:
                primary_img = copy.image_url
                break

        if not primary_img:
            var = db.query(SessionVariant).filter(
                SessionVariant.user_id == user.id,
                SessionVariant.brand_id == post.brand_id,
                SessionVariant.is_selected == True
            ).order_by(SessionVariant.created_at.desc()).first()
            if var and var.image_url:
                primary_img = var.image_url

        content = {
            "id": post.id,
            "session_theme": post.title,
            "title": post.title,
            "image_url": primary_img,
            "created_at": post.created_at.isoformat() if post.created_at else "",
            "credits_used": post.credits_used,
            "platforms": {},
            "instagram_post": None,
            "instagram_story": None,
            "linkedin_post": None,
            "facebook_post": None,
            "twitter_post": None,
            "tiktok": None,
            "copies": [],
            "guidance": {
                "tip_of_day": f"Tailored content for {post.title}",
                "this_week_suggestion": "Optimal content calendar suggestion loaded.",
                "best_performing_type": "Multi-Platform Campaign"
            }
        }

        for copy in post.platform_copies:
            img = copy.image_url or primary_img
            p_data = {
                "id": copy.id,
                "copy_id": copy.id,
                "platform": copy.platform,
                "caption": copy.caption or "",
                "hashtags": copy.hashtags or [],
                "image_url": img,
                "aspect_ratio": copy.aspect_ratio or "1:1",
                "status": copy.status or "draft",
                "scheduled_at": copy.scheduled_at.isoformat() if copy.scheduled_at else None,
                "external_post_id": copy.external_post_id,
                "permalink": copy.permalink,
                "error": copy.error,
                "best_day": "Today",
                "best_time": "Optimal time"
            }
            content["copies"].append(p_data)
            p_key = copy.platform.lower()
            content["platforms"][p_key] = p_data

            if "instagram" in p_key:
                content["instagram_post"] = p_data
            elif "linkedin" in p_key:
                content["linkedin_post"] = p_data
            elif "facebook" in p_key:
                content["facebook_post"] = p_data
            elif "twitter" in p_key or "x" == p_key:
                content["twitter_post"] = p_data
            elif "tiktok" in p_key:
                content["tiktok"] = p_data

        return content

    # Legacy fallback: query ContentIdea
    idea = db.query(ContentIdea).filter(
        ContentIdea.id == id,
        ContentIdea.user_id == user.id
    ).first()

    if not idea:
        raise HTTPException(status_code=404, detail="Content history session not found")

    primary_image_url = None
    for p in idea.generated_posts:
        if not primary_image_url and (p.post_image_url or p.story_image_url or p.banner_image_url):
            primary_image_url = p.post_image_url or p.story_image_url or p.banner_image_url
            break

    content = {
        "id": idea.id,
        "session_theme": idea.idea_title,
        "title": idea.idea_title,
        "image_url": primary_image_url,
        "instagram_post": None,
        "instagram_story": None,
        "linkedin_post": None,
        "facebook_post": None,
        "twitter_post": None,
        "tiktok": None,
        "platforms": {},
        "copies": [],
        "guidance": {
            "tip_of_day": idea.idea_description,
            "this_week_suggestion": "Optimal content calendar suggestion loaded.",
            "best_performing_type": idea.content_type
        }
    }

    for p in idea.generated_posts:
        img_url = p.post_image_url or p.story_image_url or p.banner_image_url or primary_image_url
        platform_data = {
            "id": p.id,
            "copy_id": p.id,
            "caption": p.caption or "",
            "hashtags": p.hashtags or [],
            "call_to_action": p.call_to_action,
            "image_url": img_url,
            "status": p.status or "draft"
        }
        if p.posting_time_suggestion:
            parts = p.posting_time_suggestion.split()
            platform_data["best_day"] = parts[0] if len(parts) > 0 else "Today"
            platform_data["best_time"] = " ".join(parts[1:]) if len(parts) > 1 else "Optimized time"

        plat = p.platform.lower()
        if "instagram_post" in plat or plat == "instagram":
            content["instagram_post"] = platform_data
            content["platforms"]["instagram"] = platform_data
        elif "linkedin" in plat:
            content["linkedin_post"] = platform_data
            content["platforms"]["linkedin"] = platform_data
        elif "facebook" in plat:
            content["facebook_post"] = platform_data
            content["platforms"]["facebook"] = platform_data
        elif "twitter" in plat:
            content["twitter_post"] = platform_data
            content["platforms"]["twitter"] = platform_data
        elif "tiktok" in plat:
            content["tiktok"] = platform_data
            content["platforms"]["tiktok"] = platform_data

        content["copies"].append(platform_data)

    return content

# ─── Per-Platform Actions: Publish, Schedule, Retry ────────────────────────
from pydantic import BaseModel

class ScheduleCopyRequest(BaseModel):
    scheduled_at: datetime

class PublishBatchRequest(BaseModel):
    copy_ids: List[str]
    force: Optional[bool] = False

@router.post("/copy/{copy_id}/publish")
async def publish_platform_copy(
    copy_id: str,
    force: bool = False,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Publish a single platform copy live to its respective social platform API.
    Routes strictly through the ONE shared canonical publish service (execute_social_publish).
    RULES ENFORCED:
    - Status lifecycle: draft -> publishing -> published, or failed / needs_reconnect.
    - Status is marked 'published' ONLY after API returns a real external post ID and verified permalink.
    - If no account or token expired, status is marked 'needs_reconnect'.
    - Zero stubs/mock fallbacks.
    - All attempts logged to publish_attempts table.
    """
    from services.publishing.publish_service import execute_social_publish

    copy = db.query(PlatformCopy).join(Post).filter(
        PlatformCopy.id == copy_id,
        Post.user_id == user.id
    ).first()

    if not copy:
        raise HTTPException(status_code=404, detail="Platform copy not found")

    brand_id = copy.post.brand_id if copy.post else None

    # Server-side plan & trial enforcement
    from services.plan_service import get_user_plan_limits, charge_x_publishing_credit
    limits = get_user_plan_limits(db, user)
    if limits["is_trial"] and limits["trial_is_expired"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "code": "TRIAL_EXPIRED",
                "message": "Your 14-day free trial has expired or credits have been exhausted. Upgrade to continue publishing.",
                "upgrade_url": "/pricing"
            }
        )

    # X posting rules (Pro only, +1 credit if post contains a link)
    if copy.platform and copy.platform.lower() in ("x", "twitter"):
        has_link = bool(copy.caption and ("http://" in copy.caption or "https://" in copy.caption))
        charge_x_publishing_credit(db, user, has_link=has_link, reference_id=copy.id)

    # Call canonical shared publish service
    result = await execute_social_publish(
        db=db,
        platform=copy.platform,
        brand_id=brand_id,
        caption=copy.caption,
        image_url=copy.image_url,
        platform_copy_id=copy.id,
        force=force
    )

    if result.success and copy.status == "published":
        return {
            "success": True,
            "message": f"Successfully published live to {copy.platform.capitalize()}!",
            "copy_id": copy.id,
            "platform": copy.platform,
            "status": "published",
            "external_post_id": copy.external_post_id,
            "permalink": copy.permalink
        }
    else:
        raise HTTPException(
            status_code=400,
            detail={
                "message": result.error or "Publishing failed.",
                "status": copy.status,
                "platform": copy.platform,
                "error_code": result.error_code
            }
        )

@router.post("/publish-batch")
async def publish_batch_copies(
    req: PublishBatchRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Publish multiple platform copies in one action."""
    results = []
    errors = []
    for c_id in req.copy_ids:
        try:
            res = await publish_platform_copy(copy_id=c_id, force=bool(req.force), user=user, db=db)
            results.append(res)
        except HTTPException as he:
            detail = he.detail if isinstance(he.detail, dict) else {"message": str(he.detail)}
            errors.append({"copy_id": c_id, **detail})
        except Exception as e:
            errors.append({"copy_id": c_id, "message": str(e), "status": "failed"})

    return {
        "success": len(results) > 0,
        "published_count": len(results),
        "results": results,
        "errors": errors
    }

@router.get("/copy/{copy_id}/attempts")
def get_copy_publish_attempts(
    copy_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Retrieve full audit history of publish attempts for a specific platform copy."""
    copy = db.query(PlatformCopy).join(Post).filter(
        PlatformCopy.id == copy_id,
        Post.user_id == user.id
    ).first()
    if not copy:
        raise HTTPException(status_code=404, detail="Platform copy not found")

    attempts = db.query(PublishAttempt).filter(
        PublishAttempt.platform_copy_id == copy_id
    ).order_by(PublishAttempt.created_at.desc()).all()

    return {
        "copy_id": copy_id,
        "platform": copy.platform,
        "current_status": copy.status,
        "attempts": [
            {
                "id": a.id,
                "status": a.status,
                "http_status": a.http_status,
                "error_code": a.error_code,
                "error_message": a.error_message,
                "duration_ms": a.duration_ms,
                "external_post_id": a.external_post_id,
                "permalink": a.permalink,
                "created_at": a.created_at.isoformat() if a.created_at else None
            }
            for a in attempts
        ]
    }

@router.post("/copy/{copy_id}/reset")
def reset_platform_copy_status(
    copy_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Reset a failed or needs_reconnect copy back to draft status."""
    copy = db.query(PlatformCopy).join(Post).filter(
        PlatformCopy.id == copy_id,
        Post.user_id == user.id
    ).first()
    if not copy:
        raise HTTPException(status_code=404, detail="Platform copy not found")

    copy.status = "draft"
    copy.error = None
    copy.updated_at = datetime.utcnow()
    db.commit()
    return {"success": True, "copy_id": copy.id, "status": "draft"}

@router.post("/copy/{copy_id}/schedule")
async def schedule_platform_copy(
    copy_id: str,
    req: ScheduleCopyRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Schedule a platform copy for a specific date/time."""
    copy = db.query(PlatformCopy).join(Post).filter(
        PlatformCopy.id == copy_id,
        Post.user_id == user.id
    ).first()

    if not copy:
        raise HTTPException(status_code=404, detail="Platform copy not found")

    copy.status = "scheduled"
    copy.scheduled_at = req.scheduled_at
    copy.updated_at = datetime.utcnow()

    # Also add or update ScheduledPost in calendar
    brand_id = copy.post.brand_id if copy.post else None
    if brand_id:
        existing_sched = db.query(ScheduledPost).filter(ScheduledPost.platform_copy_id == copy.id).first()
        if existing_sched:
            existing_sched.scheduled_at = req.scheduled_at
            existing_sched.status = "Scheduled"
            existing_sched.caption = copy.caption
            existing_sched.media_url = copy.image_url
        else:
            sched = ScheduledPost(
                id=str(uuid.uuid4()),
                brand_id=brand_id,
                post_id=copy.post_id,
                platform_copy_id=copy.id,
                platform=copy.platform,
                caption=copy.caption,
                media_url=copy.image_url,
                scheduled_at=req.scheduled_at,
                status="Scheduled"
            )
            db.add(sched)

    db.commit()

    return {
        "success": True,
        "message": f"Scheduled for {copy.platform.capitalize()} on {req.scheduled_at.strftime('%b %d at %I:%M %p')}.",
        "copy_id": copy.id,
        "platform": copy.platform,
        "status": copy.status,
        "scheduled_at": copy.scheduled_at.isoformat()
    }

@router.post("/copy/{copy_id}/retry")
async def retry_platform_copy(
    copy_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Retry a failed platform copy or reset to draft."""
    copy = db.query(PlatformCopy).join(Post).filter(
        PlatformCopy.id == copy_id,
        Post.user_id == user.id
    ).first()

    if not copy:
        raise HTTPException(status_code=404, detail="Platform copy not found")

    copy.status = "draft"
    copy.error = None
    copy.updated_at = datetime.utcnow()
    db.commit()

    return {
        "success": True,
        "message": f"Reset status to draft for {copy.platform.capitalize()}.",
        "copy_id": copy.id,
        "platform": copy.platform,
        "status": copy.status
    }

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
