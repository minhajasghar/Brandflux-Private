from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import date
from typing import List

from database import get_db
from models.models import Brand, ContentIdea, GeneratedPost, SmartQuestion, UserAnswer, User
from models.schemas import (
    ContentGenerateRequest, GeneratedPostResponse,
    ContentBatchResponse
)
from middleware.auth import get_current_user
from services import gemini

router = APIRouter(prefix="/content", tags=["content"])


@router.post("/generate", response_model=ContentBatchResponse)
def generate_content(
    req: ContentGenerateRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Generate content for multiple platforms.
    Uses brand profile + today's answered questions.
    """
    brand = db.query(Brand).filter(Brand.user_id == user.id).first()
    if not brand:
        raise HTTPException(status_code=404, detail="No brand found")
    if brand.scan_status != "completed":
        raise HTTPException(status_code=400, detail="Brand scan not completed yet")

    # Build brand profile
    brand_profile = {
        "business_name": brand.business_name,
        "industry": brand.industry,
        "target_audience": brand.target_audience,
        "brand_tone": brand.brand_tone,
        "brand_voice": brand.brand_voice,
        "products_services": brand.products_services or [],
        "content_themes": brand.content_themes or [],
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
    limit: int = 20,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """List generated posts, optionally filtered by platform."""
    query = db.query(GeneratedPost).filter(GeneratedPost.user_id == user.id)

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
        
        for post in idea.generated_posts:
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
                
        items.append({
            "id": idea.id,
            "session_date": idea.created_at.date().isoformat() if idea.created_at else "",
            "session_theme": idea.idea_title,
            "instagram_caption": instagram_caption,
            "linkedin_caption": linkedin_caption,
            "platforms_generated": list(set(platforms)),
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
        
    content = {
        "session_theme": idea.idea_title,
        "instagram_post": None,
        "instagram_story": None,
        "linkedin_post": None,
        "facebook_post": None,
        "guidance": {
            "tip_of_day": idea.idea_description,
            "this_week_suggestion": "Optimal content calendar suggestion loaded.",
            "best_performing_type": idea.content_type
        }
    }
    
    for post in idea.generated_posts:
        platform_data = {
            "caption": post.caption,
            "hashtags": post.hashtags or [],
            "call_to_action": post.call_to_action
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
                "poll_question": "Swipe up to access!"
            }
        elif post.platform == "linkedin_post":
            content["linkedin_post"] = platform_data
        elif post.platform == "facebook_post":
            content["facebook_post"] = {
                "caption": post.caption,
                "hashtags": post.hashtags or []
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
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Generate all four branded social media graphics with intelligent Gemini prompt engineering.
    """
    brand = db.query(Brand).filter(Brand.user_id == user.id).first()
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
                
            bg_bytes = None
            try:
                bg_bytes = await generator.generate_background(main_prompt, style=style, width=w, height=h)
            except Exception as bg_err:
                print(f"Background generation failed for {platform_key}: {bg_err}, falling back to solid primary color.")
                colors = brand_profile.get("colors") or []
                primary_hex = colors[0] if colors else (brand_profile.get("primary_color") or "#0F172A")
                
                # Parse solid color
                hex_str = str(primary_hex).lstrip('#')
                if len(hex_str) == 3:
                    hex_str = ''.join([c*2 for c in hex_str])
                r, g, b = (15, 23, 42)
                if len(hex_str) == 6:
                    r, g, b = int(hex_str[0:2], 16), int(hex_str[2:4], 16), int(hex_str[4:6], 16)
                
                from PIL import Image
                import io
                solid_img = Image.new("RGBA", (w, h), (r, g, b, 255))
                solid_io = io.BytesIO()
                solid_img.save(solid_io, format='PNG')
                bg_bytes = solid_io.getvalue()
                
            # 4. Composite branded elements
            final_bytes = generator.create_branded_post(
                background_bytes=bg_bytes,
                brand_profile=brand_profile,
                post_text=combined_overlay_text,
                platform=platform_key,
                cta=cta
            )
            
            # 5. Save to local serving folder
            import uuid
            import os
            filename = f"post_{platform_key}_{uuid.uuid4().hex[:10]}.png"
            tmp_dir = "c:/dev2/brandai/backend/processed_images"
            os.makedirs(tmp_dir, exist_ok=True)
            tmp_path = os.path.join(tmp_dir, filename)
            
            with open(tmp_path, "wb") as f:
                f.write(final_bytes)
                
            # Check for Supabase credentials
            supabase_url = os.getenv("SUPABASE_URL")
            supabase_key = os.getenv("SUPABASE_KEY")
            uploaded = False
            public_url = ""
            
            if supabase_url and supabase_key:
                try:
                    import httpx
                    headers = {
                        "Authorization": f"Bearer {supabase_key}",
                        "apikey": supabase_key
                    }
                    upload_url = f"{supabase_url}/storage/v1/object/posts/{filename}"
                    async with httpx.AsyncClient() as client:
                        up_res = await client.post(
                            upload_url,
                            headers=headers,
                            files={"file": (filename, final_bytes, "image/png")}
                        )
                        if up_res.status_code == 200:
                            public_url = f"{supabase_url}/storage/v1/object/public/posts/{filename}"
                            uploaded = True
                except Exception as up_err:
                    print(f"Supabase upload failed: {up_err}, reverting to local server route.")
                    
            if not uploaded:
                public_url = f"http://localhost:8000/static/{filename}"
                
            results[platform_key] = public_url
            
        except Exception as plat_err:
            print(f"Failed to generate for {platform_key}: {plat_err}")
            results[platform_key] = f"http://localhost:8000/static/fallback.png"
            
    return {
        "success": True,
        "images": results
    }
