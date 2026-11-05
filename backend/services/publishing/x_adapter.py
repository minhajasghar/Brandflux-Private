import os
import re
import time
import logging
import httpx
from datetime import datetime, timedelta
from typing import Optional, Dict, Any, Tuple
from sqlalchemy.orm import Session

from models.models import SocialAccount
from services.publishing.base import PlatformPublisher, PublishResult, MetricsResult
from services.encryption import decrypt_token, encrypt_token

logger = logging.getLogger(__name__)

TWITTER_API_BASE = "https://api.twitter.com"


class XPublisher(PlatformPublisher):
    """
    Official X (formerly Twitter) API v2 Publisher adapter.
    Enforces OAuth 2.0 PKCE authentication, automatic token refresh,
    280-character limit, default link avoidance (to prevent high credit tier burn),
    media attachments, and strict credit/tier error handling.
    """

    def _get_credentials(self) -> Tuple[str, str, str]:
        from config import TWITTER_CLIENT_ID, TWITTER_CLIENT_SECRET, TWITTER_REDIRECT_URI
        client_id = os.getenv("TWITTER_CLIENT_ID", TWITTER_CLIENT_ID).strip()
        client_secret = os.getenv("TWITTER_CLIENT_SECRET", TWITTER_CLIENT_SECRET).strip()
        redirect_uri = os.getenv("TWITTER_REDIRECT_URI", TWITTER_REDIRECT_URI).strip()
        return client_id, client_secret, redirect_uri

    async def _get_valid_token(self, account: SocialAccount, db: Optional[Session] = None) -> Tuple[str, Optional[str]]:
        """
        Returns (access_token, error_message).
        If token is near expiry and refresh token is available, automatically refreshes it.
        """
        raw_token = decrypt_token(account.access_token_encrypted)
        
        # Check expiry
        now = datetime.utcnow()
        if account.token_expires_at and account.token_expires_at <= (now + timedelta(minutes=5)):
            if account.refresh_token_encrypted:
                logger.info(f"X (Twitter) token for account {account.account_name} is expiring/expired. Attempting automatic refresh...")
                refreshed_token = await self._refresh_access_token(account, db)
                if refreshed_token:
                    return refreshed_token, None
                else:
                    return "", "X token expired and automatic refresh failed. Please reconnect your account."
            else:
                return raw_token, None  # Proceed with raw token, API will return 401 if expired
        
        return raw_token, None

    async def _refresh_access_token(self, account: SocialAccount, db: Optional[Session] = None) -> Optional[str]:
        """
        Refreshes OAuth 2.0 token using offline.access refresh token.
        """
        if not account.refresh_token_encrypted:
            return None

        client_id, client_secret, _ = self._get_credentials()
        if not client_id:
            logger.error("Cannot refresh X token: TWITTER_CLIENT_ID is not configured.")
            return None

        refresh_token = decrypt_token(account.refresh_token_encrypted)
        token_url = f"{TWITTER_API_BASE}/2/oauth2/token"
        data = {
            "grant_type": "refresh_token",
            "refresh_token": refresh_token,
            "client_id": client_id
        }
        headers = {"Content-Type": "application/x-www-form-urlencoded"}
        auth = (client_id, client_secret) if client_secret else None

        try:
            async with httpx.AsyncClient(timeout=20.0) as client:
                res = await client.post(token_url, data=data, headers=headers, auth=auth)
                if res.status_code == 200:
                    token_info = res.json()
                    new_access = token_info.get("access_token")
                    new_refresh = token_info.get("refresh_token")
                    expires_in = token_info.get("expires_in", 7200)

                    account.access_token_encrypted = encrypt_token(new_access)
                    if new_refresh:
                        account.refresh_token_encrypted = encrypt_token(new_refresh)
                    account.token_expires_at = datetime.utcnow() + timedelta(seconds=expires_in)
                    account.is_active = True

                    if db:
                        db.commit()
                        db.refresh(account)

                    logger.info(f"Successfully refreshed X token for {account.account_name}")
                    return new_access
                else:
                    logger.error(f"X token refresh failed with HTTP {res.status_code}: {res.text}")
                    return None
        except Exception as e:
            logger.error(f"Exception during X token refresh: {e}")
            return None

    def prepare_tweet_text(self, text: str, allow_links: bool = False) -> str:
        """
        Enforce X constraints:
        1. Avoid links by default: Strips http/https links so posts do not trigger expensive link post billing.
        2. Enforce 280-character maximum limit, breaking neatly at whitespace where possible.
        """
        if not text:
            return ""

        cleaned = text.strip()

        # Remove URLs by default unless explicitly allowed
        if not allow_links:
            # Replace URLs with bare domain or remove
            cleaned = re.sub(r'https?://[^\s]+', '', cleaned).strip()

        # Collapse excessive newlines
        cleaned = re.sub(r'\n{3,}', '\n\n', cleaned)

        # Enforce 280 char limit
        if len(cleaned) > 280:
            truncated = cleaned[:277]
            # Try to cut at last word boundary
            last_space = truncated.rfind(' ')
            if last_space > 200:
                truncated = truncated[:last_space]
            cleaned = truncated.rstrip() + "..."

        return cleaned

    async def _upload_media(self, image_url: str, account: SocialAccount) -> Optional[str]:
        """
        Attempts media upload to Twitter v1.1 upload endpoint if credentials allow,
        or returns None so tweet is gracefully dispatched as text.
        """
        if not image_url:
            return None

        # Fetch image bytes
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                img_res = await client.get(image_url)
                if img_res.status_code != 200:
                    logger.warning(f"Failed to fetch image for X upload: {image_url} (HTTP {img_res.status_code})")
                    return None
                img_bytes = img_res.content

            token, _ = await self._get_valid_token(account)
            upload_url = "https://upload.twitter.com/1.1/media/upload.json"
            files = {"media": ("image.png", img_bytes, "image/png")}
            headers = {"Authorization": f"Bearer {token}"}

            async with httpx.AsyncClient(timeout=45.0) as client:
                up_res = await client.post(upload_url, files=files, headers=headers)
                if up_res.status_code in (200, 201, 202):
                    media_id = up_res.json().get("media_id_string")
                    return media_id
                else:
                    logger.warning(f"Twitter media upload returned HTTP {up_res.status_code}: {up_res.text}")
                    return None
        except Exception as e:
            logger.warning(f"Error uploading media to X: {e}")
            return None

    async def publish_text(self, text: str, account: SocialAccount) -> PublishResult:
        """
        Publish a verified text tweet to X (Twitter) v2 API.
        """
        start_time = time.time()
        token, token_err = await self._get_valid_token(account)
        if token_err:
            return PublishResult(
                success=False,
                status="needs_reconnect",
                error=token_err,
                error_code="TOKEN_EXPIRED",
                http_status=401,
                duration_ms=int((time.time() - start_time) * 1000)
            )

        tweet_body = self.prepare_tweet_text(text, allow_links=False)
        if not tweet_body:
            return PublishResult(
                success=False,
                status="Failed",
                error="Tweet content is empty after cleaning.",
                error_code="EMPTY_CONTENT",
                http_status=400,
                duration_ms=0
            )

        url = f"{TWITTER_API_BASE}/2/tweets"
        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json"
        }
        payload = {"text": tweet_body}

        return await self._execute_tweet_request(url, payload, headers, start_time, tweet_body, account)

    async def publish_image(self, image_url: str, caption: str, account: SocialAccount) -> PublishResult:
        """
        Publish an image tweet to X (Twitter) v2 API.
        Enforces 280-character limit, uploads media, and publishes.
        If media upload is unsupported by the app tier, safely posts text.
        """
        start_time = time.time()
        token, token_err = await self._get_valid_token(account)
        if token_err:
            return PublishResult(
                success=False,
                status="needs_reconnect",
                error=token_err,
                error_code="TOKEN_EXPIRED",
                http_status=401,
                duration_ms=int((time.time() - start_time) * 1000)
            )

        tweet_body = self.prepare_tweet_text(caption, allow_links=False)
        media_id = await self._upload_media(image_url, account)

        url = f"{TWITTER_API_BASE}/2/tweets"
        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json"
        }
        payload: Dict[str, Any] = {"text": tweet_body}
        if media_id:
            payload["media"] = {"media_ids": [media_id]}

        return await self._execute_tweet_request(url, payload, headers, start_time, tweet_body, account)

    async def _execute_tweet_request(
        self,
        url: str,
        payload: Dict[str, Any],
        headers: Dict[str, str],
        start_time: float,
        tweet_body: str,
        account: SocialAccount
    ) -> PublishResult:
        sanitized = {"text_length": len(tweet_body), "has_media": "media" in payload}

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                res = await client.post(url, json=payload, headers=headers)
                duration_ms = int((time.time() - start_time) * 1000)
                status_code = res.status_code
                raw_json = res.json() if res.headers.get("content-type", "").startswith("application/json") else {}

                # 1. SUCCESS (201 Created)
                if status_code in (200, 201):
                    data = raw_json.get("data", {})
                    tweet_id = data.get("id")
                    if tweet_id:
                        username = (account.account_name or "i").replace("@", "").strip()
                        permalink = f"https://x.com/{username}/status/{tweet_id}"
                        return PublishResult(
                            success=True,
                            status="Published",
                            external_post_id=tweet_id,
                            permalink=permalink,
                            http_status=status_code,
                            duration_ms=duration_ms,
                            sanitized_payload=sanitized,
                            raw_response=raw_json
                        )

                # 2. INSUFFICIENT CREDITS / TIER LIMIT / 402 / 403
                res_text = res.text.lower()
                is_credit_issue = (
                    status_code == 402 or
                    "credit" in res_text or
                    "usage cap" in res_text or
                    "quota" in res_text or
                    "credits are low" in res_text or
                    "plan limit" in res_text
                )

                if is_credit_issue:
                    err_msg = "Insufficient X/Twitter API credits or usage cap exceeded. Please upgrade your X Developer plan."
                    logger.error(f"X publishing blocked due to credits/quota: {res.text}")
                    return PublishResult(
                        success=False,
                        status="Failed",
                        error=err_msg,
                        error_code="INSUFFICIENT_CREDITS",
                        http_status=status_code,
                        duration_ms=duration_ms,
                        sanitized_payload=sanitized,
                        raw_response=raw_json
                    )

                # 3. 403 FORBIDDEN / PERMISSION ISSUE
                if status_code == 403:
                    err_msg = "X/Twitter API 403 Forbidden: You do not have write permissions or your app permissions are misconfigured."
                    logger.error(f"X publishing 403 Forbidden: {res.text}")
                    return PublishResult(
                        success=False,
                        status="Failed",
                        error=err_msg,
                        error_code="FORBIDDEN_APP_PERMISSIONS",
                        http_status=403,
                        duration_ms=duration_ms,
                        sanitized_payload=sanitized,
                        raw_response=raw_json
                    )

                # 4. 401 UNAUTHORIZED / TOKEN EXPIRED
                if status_code == 401:
                    return PublishResult(
                        success=False,
                        status="needs_reconnect",
                        error="X (Twitter) session expired or unauthorized. Please reconnect your account.",
                        error_code="AUTH_EXPIRED",
                        http_status=401,
                        duration_ms=duration_ms,
                        sanitized_payload=sanitized,
                        raw_response=raw_json
                    )

                # 5. OTHER FAILURES
                detail = raw_json.get("detail") or raw_json.get("title") or res.text
                return PublishResult(
                    success=False,
                    status="Failed",
                    error=f"X API Error ({status_code}): {detail}",
                    error_code="API_ERROR",
                    http_status=status_code,
                    duration_ms=duration_ms,
                    sanitized_payload=sanitized,
                    raw_response=raw_json
                )

        except Exception as e:
            duration_ms = int((time.time() - start_time) * 1000)
            logger.error(f"Unexpected exception while publishing to X: {e}")
            return PublishResult(
                success=False,
                status="Failed",
                error=f"Connection error publishing to X: {str(e)}",
                error_code="NETWORK_ERROR",
                http_status=500,
                duration_ms=duration_ms,
                sanitized_payload=sanitized
            )

    async def publish_story(self, media_url: str, account: SocialAccount) -> PublishResult:
        """Stories do not exist on X (Fleets was discontinued)."""
        return PublishResult(
            success=False,
            status="Failed",
            error="Stories are not supported on X (Twitter).",
            error_code="STORIES_UNSUPPORTED",
            http_status=400,
            duration_ms=0
        )

    async def get_metrics(self, external_post_id: str, account: SocialAccount) -> MetricsResult:
        """
        Fetch tweet performance metrics from X v2 API.
        """
        token, token_err = await self._get_valid_token(account)
        if token_err or not token:
            return MetricsResult()

        url = f"{TWITTER_API_BASE}/2/tweets/{external_post_id}?tweet.fields=public_metrics,non_public_metrics"
        headers = {"Authorization": f"Bearer {token}"}

        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                res = await client.get(url, headers=headers)
                if res.status_code == 200:
                    data = res.json().get("data", {})
                    pub = data.get("public_metrics", {})
                    non_pub = data.get("non_public_metrics", {})

                    likes = pub.get("like_count", 0)
                    retweets = pub.get("retweet_count", 0)
                    replies = pub.get("reply_count", 0)
                    quotes = pub.get("quote_count", 0)
                    impressions = non_pub.get("impression_count", pub.get("impression_count", 0))

                    return MetricsResult(
                        impressions=impressions,
                        reach=impressions,
                        engagement=likes + retweets + replies + quotes,
                        likes=likes,
                        comments=replies,
                        shares=retweets + quotes,
                        clicks=0,
                        raw_data=data
                    )
        except Exception as e:
            logger.warning(f"Error fetching X metrics: {e}")

        return MetricsResult()

