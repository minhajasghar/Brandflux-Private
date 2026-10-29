import logging
import httpx
from typing import Optional, Dict, Any

from models.models import SocialAccount
from services.publishing.base import PlatformPublisher, PublishResult, MetricsResult
from config import AYRSHARE_API_KEY

logger = logging.getLogger(__name__)

AYRSHARE_API_BASE = "https://app.ayrshare.com/api"


class AyrshareAggregatorPublisher(PlatformPublisher):
    """
    Social aggregator adapter (Ayrshare API) implementing the PlatformPublisher interface.
    Activated dynamically when USE_SOCIAL_AGGREGATOR=true.
    """

    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or AYRSHARE_API_KEY

    def _get_headers(self) -> Dict[str, str]:
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }

    def _normalize_platform(self, platform: str) -> str:
        mapping = {
            "instagram_post": "instagram",
            "instagram_story": "instagram",
            "linkedin_post": "linkedin",
            "facebook_post": "facebook",
        }
        return mapping.get(platform, platform)

    async def publish_text(self, text: str, account: SocialAccount) -> PublishResult:
        plat = self._normalize_platform(account.platform)
        payload = {
            "post": text,
            "platforms": [plat]
        }
        return await self._send_post(payload)

    async def publish_image(self, image_url: str, caption: str, account: SocialAccount) -> PublishResult:
        plat = self._normalize_platform(account.platform)
        payload = {
            "post": caption,
            "platforms": [plat],
            "mediaUrls": [image_url]
        }
        return await self._send_post(payload)

    async def publish_story(self, media_url: str, account: SocialAccount) -> PublishResult:
        payload = {
            "post": "",
            "platforms": ["instagram"],
            "mediaUrls": [media_url],
            "instagramOptions": {
                "story": True
            }
        }
        return await self._send_post(payload)

    async def _send_post(self, payload: Dict[str, Any]) -> PublishResult:
        url = f"{AYRSHARE_API_BASE}/post"
        try:
            async with httpx.AsyncClient(timeout=45.0) as client:
                res = await client.post(url, json=payload, headers=self._get_headers())
                data = res.json()
                if res.status_code == 200 and data.get("status") == "success":
                    ext_id = data.get("id")
                    post_ids = data.get("postIds", [])
                    if post_ids and isinstance(post_ids, list):
                        ext_id = post_ids[0].get("id") or ext_id
                    return PublishResult(success=True, status="Published", external_post_id=ext_id, raw_response=data)

                err_msg = data.get("message") or res.text
                return PublishResult(success=False, status="Failed", error=err_msg, raw_response=data)
        except Exception as e:
            logger.error(f"Aggregator publish error: {e}")
            return PublishResult(success=False, status="Failed", error=str(e))

    async def get_metrics(self, external_post_id: str, account: SocialAccount) -> MetricsResult:
        url = f"{AYRSHARE_API_BASE}/analytics/post"
        try:
            async with httpx.AsyncClient(timeout=20.0) as client:
                res = await client.post(url, json={"id": external_post_id}, headers=self._get_headers())
                if res.status_code == 200:
                    data = res.json()
                    analytics = data.get("analytics", {})
                    return MetricsResult(
                        impressions=analytics.get("impressions", 0),
                        reach=analytics.get("reach", 0),
                        engagement=analytics.get("engagement", 0),
                        likes=analytics.get("likes", 0),
                        comments=analytics.get("comments", 0),
                        shares=analytics.get("shares", 0),
                        clicks=analytics.get("clicks", 0),
                        raw_data=data
                    )
        except Exception as e:
            logger.warning(f"Aggregator analytics failed for {external_post_id}: {e}")
        return MetricsResult()

