from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
from typing import List, Optional
import uuid

from database import get_db
from models.models import Brand, User, ScheduledPost
from models.schemas import (
    ScheduledPostCreate,
    ScheduledPostUpdate,
    ScheduledPostResponse
)
from middleware.auth import get_current_user
from services.brand_service import resolve_user_brand

router = APIRouter(prefix="/calendar", tags=["calendar"])


@router.get("/posts", response_model=List[ScheduledPostResponse])
def get_scheduled_posts(
    start_date: Optional[datetime] = Query(None, description="Filter from start date"),
    end_date: Optional[datetime] = Query(None, description="Filter to end date"),
    platform: Optional[str] = Query(None, description="Filter by platform"),
    status: Optional[str] = Query(None, description="Filter by status (Draft, Scheduled, Publishing, Published, Failed)"),
    brand_id: Optional[str] = Query(None, description="Filter by brand"),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Retrieve all scheduled posts for the authenticated user's brand.
    Supports range filtering for month/week calendar view queries.
    """
    brand = resolve_user_brand(user, db, brand_id=brand_id)
    if not brand:
        return []

    query = db.query(ScheduledPost).filter(ScheduledPost.brand_id == brand.id)

    if start_date and isinstance(start_date, datetime):
        query = query.filter(ScheduledPost.scheduled_at >= start_date)
    if end_date and isinstance(end_date, datetime):
        query = query.filter(ScheduledPost.scheduled_at <= end_date)
    if platform and isinstance(platform, str):
        query = query.filter(ScheduledPost.platform == platform)
    if status and isinstance(status, str):
        query = query.filter(ScheduledPost.status == status)

    posts = query.order_by(ScheduledPost.scheduled_at.asc()).all()
    return posts

    return posts


@router.post("/posts", response_model=ScheduledPostResponse)
def create_scheduled_post(
    req: ScheduledPostCreate,
    brand_id: Optional[str] = Query(None),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Create a new scheduled post in the calendar."""
    brand = resolve_user_brand(user, db, brand_id=brand_id)
    if not brand:
        brand = Brand(user_id=user.id, business_name=user.full_name or "My Brand", name=user.full_name or "My Brand")
        db.add(brand)
        db.commit()
        db.refresh(brand)
        user.active_brand_id = brand.id
        db.commit()

    valid_statuses = {"Draft", "Scheduled", "Publishing", "Published", "Failed"}
    normalized_status = req.status.capitalize() if req.status else "Draft"
    if normalized_status not in valid_statuses:
        normalized_status = "Draft"

    post = ScheduledPost(
        id=str(uuid.uuid4()),
        brand_id=brand.id,
        post_id=req.post_id,
        platform_copy_id=req.platform_copy_id,
        platform=req.platform,
        caption=req.caption,
        media_url=req.media_url,
        scheduled_at=req.scheduled_at,
        status=normalized_status
    )
    db.add(post)
    db.commit()
    db.refresh(post)
    return post


@router.get("/posts/{post_id}", response_model=ScheduledPostResponse)
def get_single_scheduled_post(
    post_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Retrieve details of a single scheduled post."""
    post = db.query(ScheduledPost).join(Brand, Brand.id == ScheduledPost.brand_id).filter(
        ScheduledPost.id == post_id,
        Brand.user_id == user.id
    ).first()

    if not post:
        raise HTTPException(status_code=404, detail="Scheduled post not found")
    return post


@router.put("/posts/{post_id}", response_model=ScheduledPostResponse)
@router.patch("/posts/{post_id}", response_model=ScheduledPostResponse)
def update_scheduled_post(
    post_id: str,
    req: ScheduledPostUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Update a scheduled post.
    Supports rescheduling via drag-and-drop or editing content via side drawer.
    """
    post = db.query(ScheduledPost).join(Brand, Brand.id == ScheduledPost.brand_id).filter(
        ScheduledPost.id == post_id,
        Brand.user_id == user.id
    ).first()

    if not post:
        raise HTTPException(status_code=404, detail="Scheduled post not found")

    update_data = req.model_dump(exclude_unset=True)
    
    # Capitalize status if passed
    if "status" in update_data and update_data["status"]:
        valid_statuses = {"Draft", "Scheduled", "Publishing", "Published", "Failed"}
        cap = update_data["status"].capitalize()
        if cap in valid_statuses:
            update_data["status"] = cap

    content_changed = any(k in update_data for k in ["caption", "media_url", "scheduled_at", "platform_copies"])
    for field, val in update_data.items():
        setattr(post, field, val)

    # Rule: Any edit after approval returns the post to in_review when approval required
    brand = db.query(Brand).filter(Brand.id == post.brand_id).first()
    if brand and brand.require_approval and content_changed:
        post.status = "In Review"
        post.approved_version_hash = None
        if post.post_id:
            parent = db.query(Post).filter(Post.id == post.post_id).first()
            if parent:
                parent.status = "in_review"
                parent.approved_version_hash = None

    post.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(post)
    return post


class BatchScheduledPostCreate(BaseModel):
    platforms: List[str]
    caption: Optional[str] = None
    media_url: Optional[str] = None
    scheduled_at: datetime
    status: Optional[str] = "Scheduled"
    post_id: Optional[str] = None
    platform_copy_id: Optional[str] = None


@router.post("/posts/batch")
def create_scheduled_posts_batch(
    req: BatchScheduledPostCreate,
    brand_id: Optional[str] = Query(None),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Schedule across multiple platforms simultaneously in one click."""
    brand = resolve_user_brand(user, db, brand_id=brand_id)
    if not brand:
        brand = Brand(user_id=user.id, business_name=user.full_name or "My Brand", name=user.full_name or "My Brand")
        db.add(brand)
        db.commit()
        db.refresh(brand)
        user.active_brand_id = brand.id
        db.commit()

    if not req.platforms:
        raise HTTPException(status_code=400, detail="Select at least one platform to schedule.")

    created_posts = []
    valid_statuses = {"Draft", "Scheduled", "Publishing", "Published", "Failed"}
    normalized_status = req.status.capitalize() if req.status else "Scheduled"
    if normalized_status not in valid_statuses:
        normalized_status = "Scheduled"

    for plat in req.platforms:
        clean_plat = plat.strip().lower()
        post = ScheduledPost(
            id=str(uuid.uuid4()),
            brand_id=brand.id,
            post_id=req.post_id,
            platform_copy_id=req.platform_copy_id,
            platform=clean_plat,
            caption=req.caption,
            media_url=req.media_url,
            scheduled_at=req.scheduled_at,
            status=normalized_status
        )
        db.add(post)
        created_posts.append(post)

    db.commit()
    for p in created_posts:
        db.refresh(p)

    return {
        "status": "success",
        "count": len(created_posts),
        "posts": [
            {
                "id": p.id,
                "platform": p.platform,
                "scheduled_at": p.scheduled_at.isoformat() if p.scheduled_at else None,
                "status": p.status
            }
            for p in created_posts
        ]
    }


@router.post("/posts/{post_id}/publish-now")
async def publish_scheduled_post_now(
    post_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Immediately publish a scheduled post live without waiting."""
    post = db.query(ScheduledPost).filter(ScheduledPost.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="Scheduled post not found")

    brand = resolve_user_brand(user, db, brand_id=post.brand_id)
    if not brand:
        raise HTTPException(status_code=403, detail="You do not have access to this scheduled post.")

    from services.publishing.publish_service import execute_social_publish
    post.status = "Publishing"
    db.commit()

    result = await execute_social_publish(
        db=db,
        platform=post.platform,
        brand_id=post.brand_id,
        caption=post.caption,
        image_url=post.media_url,
        platform_copy_id=post.platform_copy_id,
        scheduled_post_id=post.id
    )

    if result.success:
        return {
            "status": "published",
            "message": f"Successfully published live to {post.platform.capitalize()}!",
            "external_post_id": result.external_post_id,
            "permalink": result.permalink
        }
    else:
        raise HTTPException(
            status_code=400,
            detail={
                "message": result.error or "Publishing failed.",
                "status": post.status,
                "platform": post.platform,
                "error_code": result.error_code
            }
        )


@router.delete("/posts/{post_id}")
def delete_scheduled_post(
    post_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete a post from the calendar schedule."""
    post = db.query(ScheduledPost).join(Brand, Brand.id == ScheduledPost.brand_id).filter(
        ScheduledPost.id == post_id,
        Brand.user_id == user.id
    ).first()

    if not post:
        raise HTTPException(status_code=404, detail="Scheduled post not found")

    db.delete(post)
    db.commit()
    return {"status": "success", "message": "Scheduled post deleted", "id": post_id}

