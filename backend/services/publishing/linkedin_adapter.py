import os
import logging
import time
import httpx
from typing import Optional, Dict, Any

from models.models import SocialAccount
from services.publishing.base import PlatformPublisher, PublishResult, MetricsResult
from services.encryption import decrypt_token

logger = logging.getLogger(__name__)

LINKEDIN_API_BASE = "https://api.linkedin.com"
LINKEDIN_VERSION = os.getenv("LINKEDIN_VERSION", "202610").strip()


class LinkedInPublisher(PlatformPublisher):
    """LinkedIn Posts API adapter supporting text and image publications."""

    def _get_token(self, account: SocialAccount) -> str:
        return decrypt_token(account.access_token_encrypted)

    def _get_author_urn(self, account: SocialAccount) -> str:
        author_id = account.account_id
        if author_id.startswith("urn:li:"):
            return author_id
        if account.metadata_json and account.metadata_json.get("is_organization"):
            return f"urn:li:organization:{author_id}"
        return f"urn:li:person:{author_id}"

    async def publish_text(self, text: str, account: SocialAccount) -> PublishResult:
        start_time = time.time()
        token = self._get_token(account)
        author = self._get_author_urn(account)

        url = f"{LINKEDIN_API_BASE}/rest/posts"
        headers = {
            "Authorization": f"Bearer {token}",
            "X-Restli-Protocol-Version": "2.0.0",
            "LinkedIn-Version": LINKEDIN_VERSION,
            "Content-Type": "application/json"
        }
        payload = {
            "author": author,
            "commentary": text,
            "visibility": "PUBLIC",
            "distribution": {
                "feedDistribution": "MAIN_FEED",
                "targetEntities": [],
                "thirdPartyDistributionChannels": []
            },
            "lifecycleState": "PUBLISHED",
            "isReshareDisabledByAuthor": False
        }
        sanitized_payload = {"author": author, "text_length": len(text)}

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                res = await client.post(url, json=payload, headers=headers)
                duration_ms = int((time.time() - start_time) * 1000)

                if res.status_code in (200, 201):
                    post_id = res.headers.get("x-restli-id") or res.headers.get("x-linkedin-id")
                    if not post_id:
                        data = res.json() if res.headers.get("content-type", "").startswith("application/json") else {}
                        post_id = data.get("id")

                    if post_id:
                        permalink = f"https://www.linkedin.com/feed/update/{post_id}"
                        return PublishResult(
                            success=True,
                            status="Published",
                            external_post_id=post_id,
                            permalink=permalink,
                            http_status=res.status_code,
                            duration_ms=duration_ms,
                            sanitized_payload=sanitized_payload
                        )

                data = res.json() if res.headers.get("content-type", "").startswith("application/json") else {}
                err_msg = data.get("message", res.text)
                err_code = str(data.get("status", res.status_code))
                status = "needs_reconnect" if res.status_code in (401, 403) else "Failed"
                return PublishResult(
                    success=False,
                    status=status,
                    error=err_msg,
                    error_code=err_code,
                    http_status=res.status_code,
                    duration_ms=duration_ms,
                    sanitized_payload=sanitized_payload,
                    raw_response=data
                )
        except Exception as e:
            logger.error(f"LinkedIn publish_text error: {e}")
            return PublishResult(
                success=False,
                status="Failed",
                error=str(e),
                error_code="NETWORK_ERROR",
                duration_ms=int((time.time() - start_time) * 1000),
                sanitized_payload=sanitized_payload
            )

    async def publish_image(self, image_url: str, caption: str, account: SocialAccount) -> PublishResult:
        start_time = time.time()
        token = self._get_token(account)
        author = self._get_author_urn(account)

        headers = {
            "Authorization": f"Bearer {token}",
            "X-Restli-Protocol-Version": "2.0.0",
            "LinkedIn-Version": LINKEDIN_VERSION,
            "Content-Type": "application/json"
        }
        sanitized_payload = {"author": author, "image_url": image_url, "caption_length": len(caption or "")}

        async with httpx.AsyncClient(timeout=45.0) as client:
            try:
                # Step 1: Initialize image upload
                init_url = f"{LINKEDIN_API_BASE}/rest/images?action=initializeUpload"
                init_payload = {
                    "initializeUploadRequest": {
                        "owner": author
                    }
                }
                init_res = await client.post(init_url, json=init_payload, headers=headers)
                
                if init_res.status_code == 200:
                    init_data = init_res.json().get("value", {})
                    upload_url = init_data.get("uploadUrl")
                    image_urn = init_data.get("image")

                    # Download image bytes and upload to LinkedIn storage
                    img_download = await client.get(image_url)
                    if img_download.status_code == 200 and upload_url:
                        await client.put(upload_url, content=img_download.content, headers={"Authorization": f"Bearer {token}"})

                        # Step 2: Create post referencing uploaded image URN
                        post_payload = {
                            "author": author,
                            "commentary": caption,
                            "visibility": "PUBLIC",
                            "distribution": {
                                "feedDistribution": "MAIN_FEED",
                                "targetEntities": [],
                                "thirdPartyDistributionChannels": []
                            },
                            "content": {
                                "media": {
                                    "title": "Brandflux Update",
                                    "id": image_urn
                                }
                            },
                            "lifecycleState": "PUBLISHED"
                        }
                        post_res = await client.post(f"{LINKEDIN_API_BASE}/rest/posts", json=post_payload, headers=headers)
                        duration_ms = int((time.time() - start_time) * 1000)

                        if post_res.status_code in (200, 201):
                            post_id = post_res.headers.get("x-restli-id") or post_res.headers.get("x-linkedin-id") or image_urn
                            permalink = f"https://www.linkedin.com/feed/update/{post_id}"
                            return PublishResult(
                                success=True,
                                status="Published",
                                external_post_id=post_id,
                                permalink=permalink,
                                http_status=post_res.status_code,
                                duration_ms=duration_ms,
                                sanitized_payload=sanitized_payload
                            )

                # If initialization or posting failed
                duration_ms = int((time.time() - start_time) * 1000)
                init_err = init_res.json() if init_res.headers.get("content-type", "").startswith("application/json") else {}
                err_msg = init_err.get("message", init_res.text)
                status = "needs_reconnect" if init_res.status_code in (401, 403) else "Failed"
                return PublishResult(
                    success=False,
                    status=status,
                    error=err_msg,
                    error_code=str(init_res.status_code),
                    http_status=init_res.status_code,
                    duration_ms=duration_ms,
                    sanitized_payload=sanitized_payload,
                    raw_response=init_err
                )

            except Exception as e:
                logger.error(f"LinkedIn publish_image error: {e}")
                return PublishResult(
                    success=False,
                    status="Failed",
                    error=str(e),
                    error_code="NETWORK_ERROR",
                    duration_ms=int((time.time() - start_time) * 1000),
                    sanitized_payload=sanitized_payload
                )


    async def publish_story(self, media_url: str, account: SocialAccount) -> PublishResult:
        # LinkedIn native stories were sunset; post as standard vertical visual update
        return await self.publish_image(media_url, "Daily Update from Brandflux", account)

    async def get_metrics(self, external_post_id: str, account: SocialAccount) -> MetricsResult:
        token = self._get_token(account)
        headers = {
            "Authorization": f"Bearer {token}",
            "X-Restli-Protocol-Version": "2.0.0",
            "LinkedIn-Version": LINKEDIN_VERSION
        }
        async with httpx.AsyncClient(timeout=20.0) as client:
            try:
                # Query social engagement metrics
                url = f"{LINKEDIN_API_BASE}/rest/socialActions/{external_post_id}"
                res = await client.get(url, headers=headers)
                if res.status_code == 200:
                    data = res.json()
                    likes = data.get("likesSummary", {}).get("totalLikes", 0)
                    comments = data.get("commentsSummary", {}).get("totalComments", 0)
                    return MetricsResult(
                        likes=likes,
                        comments=comments,
                        engagement=likes + comments,
                        raw_data=data
                    )
            except Exception as e:
                logger.warning(f"Failed to fetch LinkedIn metrics for {external_post_id}: {e}")
        return MetricsResult()

