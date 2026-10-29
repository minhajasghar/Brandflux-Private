import logging
import httpx
from typing import Optional, Dict, Any

from models.models import SocialAccount
from services.publishing.base import PlatformPublisher, PublishResult, MetricsResult
from services.encryption import decrypt_token

logger = logging.getLogger(__name__)

GRAPH_API_VERSION = "v19.0"
GRAPH_API_BASE = f"https://graph.facebook.com/{GRAPH_API_VERSION}"


class MetaPublisher(PlatformPublisher):
    """Meta Graph API adapter for Instagram Business & Facebook Pages."""

    def _get_token(self, account: SocialAccount) -> str:
        return decrypt_token(account.access_token_encrypted)

    async def publish_text(self, text: str, account: SocialAccount) -> PublishResult:
        token = self._get_token(account)
        page_id = account.account_id

        # Instagram does not support text-only without image canvas; route to Facebook feed
        if account.platform in ("instagram", "instagram_post", "instagram_story"):
            return PublishResult(
                success=False,
                status="Failed",
                error="Instagram requires an image or video asset for all published feed updates."
            )

        url = f"{GRAPH_API_BASE}/{page_id}/feed"
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                res = await client.post(url, data={"message": text, "access_token": token})
                data = res.json()
                if res.status_code == 200 and "id" in data:
                    return PublishResult(success=True, status="Published", external_post_id=data["id"], raw_response=data)
                
                err_msg = data.get("error", {}).get("message", res.text)
                return PublishResult(success=False, status="Failed", error=err_msg, raw_response=data)
        except Exception as e:
            logger.error(f"Meta publish_text error: {e}")
            return PublishResult(success=False, status="Failed", error=str(e))

    async def publish_image(self, image_url: str, caption: str, account: SocialAccount) -> PublishResult:
        token = self._get_token(account)
        target_id = account.account_id

        async with httpx.AsyncClient(timeout=45.0) as client:
            try:
                # ─── Instagram 2-Step Container Publishing ──────────────────
                if account.platform in ("instagram", "instagram_post"):
                    # Step 1: Create media container
                    create_url = f"{GRAPH_API_BASE}/{target_id}/media"
                    create_res = await client.post(
                        create_url,
                        data={
                            "image_url": image_url,
                            "caption": caption,
                            "access_token": token
                        }
                    )
                    create_data = create_res.json()
                    if create_res.status_code != 200 or "id" not in create_data:
                        err_msg = create_data.get("error", {}).get("message", create_res.text)
                        return PublishResult(success=False, status="Failed", error=err_msg, raw_response=create_data)

                    creation_id = create_data["id"]

                    # Step 2: Publish media container
                    pub_url = f"{GRAPH_API_BASE}/{target_id}/media_publish"
                    pub_res = await client.post(
                        pub_url,
                        data={
                            "creation_id": creation_id,
                            "access_token": token
                        }
                    )
                    pub_data = pub_res.json()
                    if pub_res.status_code == 200 and "id" in pub_data:
                        return PublishResult(success=True, status="Published", external_post_id=pub_data["id"], raw_response=pub_data)

                    err_msg = pub_data.get("error", {}).get("message", pub_res.text)
                    return PublishResult(success=False, status="Failed", error=err_msg, raw_response=pub_data)

                # ─── Facebook Page Photo Publishing ─────────────────────────
                else:
                    fb_url = f"{GRAPH_API_BASE}/{target_id}/photos"
                    fb_res = await client.post(
                        fb_url,
                        data={
                            "url": image_url,
                            "message": caption,
                            "access_token": token
                        }
                    )
                    fb_data = fb_res.json()
                    if fb_res.status_code == 200 and ("id" in fb_data or "post_id" in fb_data):
                        ext_id = fb_data.get("post_id") or fb_data.get("id")
                        return PublishResult(success=True, status="Published", external_post_id=ext_id, raw_response=fb_data)

                    err_msg = fb_data.get("error", {}).get("message", fb_res.text)
                    return PublishResult(success=False, status="Failed", error=err_msg, raw_response=fb_data)

            except Exception as e:
                logger.error(f"Meta publish_image error: {e}")
                return PublishResult(success=False, status="Failed", error=str(e))

    async def publish_story(self, media_url: str, account: SocialAccount) -> PublishResult:
        token = self._get_token(account)
        target_id = account.account_id

        async with httpx.AsyncClient(timeout=45.0) as client:
            try:
                # Instagram Stories container
                create_url = f"{GRAPH_API_BASE}/{target_id}/media"
                create_res = await client.post(
                    create_url,
                    data={
                        "image_url": media_url,
                        "media_type": "STORIES",
                        "access_token": token
                    }
                )
                create_data = create_res.json()
                if create_res.status_code != 200 or "id" not in create_data:
                    err = create_data.get("error", {}).get("message", create_res.text)
                    return PublishResult(success=False, status="Failed", error=err, raw_response=create_data)

                creation_id = create_data["id"]

                pub_url = f"{GRAPH_API_BASE}/{target_id}/media_publish"
                pub_res = await client.post(
                    pub_url,
                    data={"creation_id": creation_id, "access_token": token}
                )
                pub_data = pub_res.json()
                if pub_res.status_code == 200 and "id" in pub_data:
                    return PublishResult(success=True, status="Published", external_post_id=pub_data["id"], raw_response=pub_data)

                err = pub_data.get("error", {}).get("message", pub_res.text)
                return PublishResult(success=False, status="Failed", error=err, raw_response=pub_data)

            except Exception as e:
                logger.error(f"Meta publish_story error: {e}")
                return PublishResult(success=False, status="Failed", error=str(e))

    async def get_metrics(self, external_post_id: str, account: SocialAccount) -> MetricsResult:
        token = self._get_token(account)
        async with httpx.AsyncClient(timeout=20.0) as client:
            try:
                # 1. Fetch object fields (likes, comments, shares)
                fields_url = f"{GRAPH_API_BASE}/{external_post_id}"
                fields_res = await client.get(
                    fields_url,
                    params={"fields": "like_count,comments_count,shares", "access_token": token}
                )
                fields_data = fields_res.json() if fields_res.status_code == 200 else {}
                likes = fields_data.get("like_count") or (fields_data.get("likes", {}).get("summary", {}).get("total_count", 0) if isinstance(fields_data.get("likes"), dict) else 0)
                comments = fields_data.get("comments_count") or (fields_data.get("comments", {}).get("summary", {}).get("total_count", 0) if isinstance(fields_data.get("comments"), dict) else 0)
                shares = fields_data.get("shares", {}).get("count", 0) if isinstance(fields_data.get("shares"), dict) else 0

                # 2. Fetch insights (impressions, reach)
                url = f"{GRAPH_API_BASE}/{external_post_id}/insights"
                res = await client.get(
                    url,
                    params={
                        "metric": "impressions,reach,total_interactions",
                        "access_token": token
                    }
                )
                data = res.json() if res.status_code == 200 else {}
                metrics = MetricsResult(
                    likes=int(likes or 0),
                    comments=int(comments or 0),
                    shares=int(shares or 0),
                    raw_data={"fields": fields_data, "insights": data}
                )
                for item in data.get("data", []):
                    name = item.get("name")
                    values = item.get("values", [{}])
                    val = values[0].get("value", 0) if values else 0
                    if name == "impressions":
                        metrics.impressions = int(val)
                    elif name == "reach":
                        metrics.reach = int(val)
                    elif name == "total_interactions":
                        metrics.engagement = int(val)
                if not metrics.engagement:
                    metrics.engagement = metrics.likes + metrics.comments + metrics.shares
                return metrics
            except Exception as e:
                logger.warning(f"Failed to fetch Meta metrics for {external_post_id}: {e}")
                return MetricsResult()

