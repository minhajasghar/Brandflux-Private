import logging
from typing import Dict, Any, Optional
from fastapi import APIRouter, Request, Response, HTTPException, Depends, Query
from sqlalchemy.orm import Session

from database import get_db
from models.models import ScheduledPost, SocialAccount
from config import META_WEBHOOK_VERIFY_TOKEN
from services.publishing.factory import get_publisher

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/webhooks", tags=["webhooks"])


# ═══════════════════════════════════════════════════════════
# 1. META WEBHOOK (INSTAGRAM & FACEBOOK)
# ═══════════════════════════════════════════════════════════
@router.get("/meta")
def meta_webhook_verification(
    mode: Optional[str] = Query(None, alias="hub.mode"),
    verify_token: Optional[str] = Query(None, alias="hub.verify_token"),
    challenge: Optional[str] = Query(None, alias="hub.challenge"),
):
    """
    Handle Meta Webhook challenge verification handshake.
    """
    if mode == "subscribe" and verify_token == META_WEBHOOK_VERIFY_TOKEN:
        logger.info("[Webhook] Meta challenge verified successfully.")
        return Response(content=challenge, media_type="text/plain")
    
    logger.warning("[Webhook] Meta verification failed: invalid verify_token.")
    raise HTTPException(status_code=403, detail="Verification token mismatch")


@router.post("/meta")
async def meta_webhook_events(
    request: Request,
    db: Session = Depends(get_db)
):
    """
    Receive real-time event updates from Meta Graph API (e.g. media post success, comments, insights).
    """
    try:
        body = await request.json()
    except Exception:
        body = {}

    logger.info(f"[Webhook] Meta event received: {body}")

    # Process entry changes
    for entry in body.get("entry", []):
        for change in entry.get("changes", []):
            field = change.get("field")
            val = change.get("value", {})
            media_id = val.get("media_id") or val.get("id")

            if media_id:
                # Find matching scheduled post strictly by existing external_post_id
                post = db.query(ScheduledPost).filter(
                    ScheduledPost.external_post_id == str(media_id)
                ).first()

                # RULE: Webhooks may only CONFIRM or update a post that already has an external_post_id;
                # they must NEVER create a "Published" status on their own.
                if post and post.external_post_id and post.status == "Published":
                    logger.info(f"[Webhook] Confirmed live Meta event for verified published post {post.id} (external ID: {post.external_post_id}).")

    return {"status": "received"}


# ═══════════════════════════════════════════════════════════
# 2. AGGREGATOR WEBHOOK (AYRSHARE)
# ═══════════════════════════════════════════════════════════
@router.post("/ayrshare")
async def ayrshare_webhook_events(
    request: Request,
    db: Session = Depends(get_db)
):
    """
    Receive asynchronous post status callbacks from Ayrshare aggregator.
    Webhooks may only confirm already verified published posts or record failure.
    """
    try:
        data = await request.json()
    except Exception:
        data = {}

    logger.info(f"[Webhook] Ayrshare webhook payload: {data}")

    post_id = data.get("id") or data.get("refId")
    status = data.get("status")

    if post_id:
        post = db.query(ScheduledPost).filter(
            ScheduledPost.external_post_id == str(post_id)
        ).first()

        # Webhooks may only confirm or update a post that already has an external_post_id
        if post and post.external_post_id:
            if status == "success" and post.status == "Published":
                logger.info(f"[Webhook] Confirmed aggregator status for already published post {post.id}.")
            elif status == "error":
                post.status = "Failed"
                post.error = data.get("error") or "Aggregator publish failed"
                db.commit()
                logger.warning(f"[Webhook] Updated post {post.id} status to 'Failed' per error event.")

    return {"status": "received"}


# ═══════════════════════════════════════════════════════════
# 3. ON-DEMAND POLLING ENDPOINT (CONFIRM STATUS & METRICS)
# ═══════════════════════════════════════════════════════════
@router.get("/posts/{post_id}/poll-status")
async def poll_post_status(
    post_id: str,
    db: Session = Depends(get_db)
):
    """
    Poll live publishing status and real-time performance metrics for a scheduled post.
    """
    post = db.query(ScheduledPost).filter(ScheduledPost.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="Scheduled post not found")

    if not post.external_post_id:
        return {
            "post_id": post.id,
            "status": post.status,
            "external_post_id": None,
            "metrics": None
        }

    account = db.query(SocialAccount).filter(
        SocialAccount.brand_id == post.brand_id,
        SocialAccount.is_active == True
    ).first()

    publisher = get_publisher(post.platform)
    metrics = None

    if account and post.status == "Published":
        try:
            metrics_res = await publisher.get_metrics(post.external_post_id, account)
            metrics = {
                "impressions": metrics_res.impressions,
                "reach": metrics_res.reach,
                "engagement": metrics_res.engagement,
                "likes": metrics_res.likes,
                "comments": metrics_res.comments,
                "shares": metrics_res.shares,
                "clicks": metrics_res.clicks
            }
        except Exception as e:
            logger.warning(f"Error fetching live metrics during poll: {e}")

    return {
        "post_id": post.id,
        "status": post.status,
        "external_post_id": post.external_post_id,
        "error": post.error,
        "metrics": metrics
    }

