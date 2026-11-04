import os
import logging
import time
import httpx
from typing import Optional, Dict, Any, List

from models.models import SocialAccount
from services.publishing.base import PlatformPublisher, PublishResult, MetricsResult
from services.encryption import decrypt_token

logger = logging.getLogger(__name__)

TIKTOK_API_BASE = "https://open.tiktokapis.com/v2"


class TikTokPublisher(PlatformPublisher):
    """
    TikTok Content Posting API (v2) adapter.
    Publishes photo carousels, single photos, and video posts to authorized TikTok creator profiles.
    """

    def _get_token(self, account: SocialAccount) -> str:
        return decrypt_token(account.access_token_encrypted)

    def _format_media_url(self, raw_url: str) -> str:
        """Ensure media URL is publicly accessible by TikTok servers."""
        if not raw_url:
            return ""
        # If localhost, map to public tunnel URL
        tunnel_url = os.getenv("TIKTOK_TUNNEL_URL", "https://brandflux-oauth.loca.lt").rstrip("/")
        if "localhost:8000" in raw_url or "127.0.0.1:8000" in raw_url:
            raw_url = raw_url.replace("http://localhost:8000", tunnel_url).replace("http://127.0.0.1:8000", tunnel_url)
        return raw_url

    async def publish_text(self, text: str, account: SocialAccount) -> PublishResult:
        """
        TikTok requires media (it is a short-form video & photo platform).
        If called without media, return clear instructions.
        """
        return PublishResult(
            success=False,
            status="Failed",
            error="TikTok requires an image or video attachment to publish.",
            error_code="MEDIA_REQUIRED",
            http_status=400,
            duration_ms=0
        )

    async def publish_image(self, image_url: str, caption: str, account: SocialAccount) -> PublishResult:
        """
        Publish single photo post via TikTok Content Posting API v2.
        """
        start_time = time.time()
        token = self._get_token(account)
        public_img = self._format_media_url(image_url)

        if not public_img:
            return PublishResult(
                success=False,
                status="Failed",
                error="Valid public image URL is required for TikTok photo posts.",
                error_code="MISSING_MEDIA_URL",
                http_status=400,
                duration_ms=0
            )

        url = f"{TIKTOK_API_BASE}/post/publish/content/init/"
        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json; charset=UTF-8"
        }

        # Clean title / caption
        clean_title = (caption[:90] if caption else "Brandflux Update").strip()
        clean_desc = (caption or "").strip()

        # Use MEDIA_UPLOAD with photo_cover_index 0 (first image)
        payload = {
            "post_mode": "MEDIA_UPLOAD",
            "media_type": "PHOTO",
            "post_info": {
                "title": clean_title,
                "description": clean_desc
            },
            "source_info": {
                "source": "PULL_FROM_URL",
                "photo_cover_index": 0,
                "photo_images": [
                    public_img
                ]
            }
        }
        sanitized_payload = {"title": clean_title, "images_count": 1, "image_url": public_img}

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                res = await client.post(url, json=payload, headers=headers)
                duration_ms = int((time.time() - start_time) * 1000)
                res_data = res.json()
                logger.info(f"TikTok publish response: {res.status_code} - {res_data}")

                err_info = res_data.get("error", {})
                err_code = err_info.get("code")
                err_msg = err_info.get("message") or ""

                if res.status_code == 200 and err_code == "ok":
                    publish_id = res_data.get("data", {}).get("publish_id")
                    username = account.account_name.lstrip("@") if account.account_name else "user"
                    permalink = f"https://www.tiktok.com/@{username}"

                    return PublishResult(
                        success=True,
                        status="Published",
                        external_post_id=publish_id,
                        permalink=permalink,
                        http_status=res.status_code,
                        duration_ms=duration_ms,
                        sanitized_payload=sanitized_payload,
                        raw_response=res_data
                    )

                status = "needs_reconnect" if "token" in err_msg.lower() or res.status_code in (401, 403) else "Failed"
                return PublishResult(
                    success=False,
                    status=status,
                    error=err_msg or f"TikTok API error: {err_code}",
                    error_code=err_code or str(res.status_code),
                    http_status=res.status_code,
                    duration_ms=duration_ms,
                    sanitized_payload=sanitized_payload,
                    raw_response=res_data
                )
        except Exception as e:
            logger.error(f"TikTok publish_image error: {e}")
            return PublishResult(
                success=False,
                status="Failed",
                error=str(e),
                error_code="NETWORK_ERROR",
                duration_ms=int((time.time() - start_time) * 1000),
                sanitized_payload=sanitized_payload
            )

    async def publish_story(self, media_url: str, account: SocialAccount) -> PublishResult:
        return await self.publish_image(media_url, "Daily Update from Brandflux", account)

    async def get_metrics(self, external_post_id: str, account: SocialAccount) -> MetricsResult:
        return MetricsResult()

