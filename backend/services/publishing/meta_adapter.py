import logging
import os
import time
import asyncio
import httpx
from typing import Optional, Dict, Any

from models.models import SocialAccount
from services.publishing.base import PlatformPublisher, PublishResult, MetricsResult
from services.encryption import decrypt_token
import config

logger = logging.getLogger(__name__)

GRAPH_API_VERSION = "v19.0"
GRAPH_API_BASE = f"https://graph.facebook.com/{GRAPH_API_VERSION}"


class MetaPublisher(PlatformPublisher):
    """Meta Graph API adapter for Instagram Business & Facebook Pages."""

    def _get_token(self, account: SocialAccount) -> str:
        return decrypt_token(account.access_token_encrypted)

    def _resolve_local_image_path(self, image_url: str) -> Optional[str]:
        """Resolves local media URLs or file names to an absolute file path on disk."""
        if not image_url:
            return None
        # Extract filename from URL like http://localhost:8000/api/media/posts/test.png
        filename = image_url.split("/")[-1].split("?")[0]
        possible_dirs = [
            config.PROCESSED_IMAGES_DIR,
            os.path.join(config.BASE_DIR, "processed_images"),
            os.path.join(config.BASE_DIR, "uploads"),
            os.path.join(config.BASE_DIR, "media"),
        ]
        for d in possible_dirs:
            p = os.path.join(d, filename)
            if os.path.exists(p):
                return p
        if os.path.exists(image_url):
            return image_url
        return None

    async def _stage_local_image_via_facebook_cdn(
        self,
        local_path: str,
        token: str,
        client: httpx.AsyncClient,
        account: SocialAccount
    ) -> Optional[str]:
        """
        Stages a local image file as an unpublished, temporary photo on the linked Facebook Page
        and returns Meta's own public scontent.fbcdn.net JPEG URL so Instagram Graph API /media
        can always fetch it reliably (even when running on localhost or behind a private network).
        """
        if not local_path or not os.path.exists(local_path):
            return None
        try:
            import io
            from PIL import Image
            buf = io.BytesIO()
            with Image.open(local_path) as im:
                rgb = im.convert("RGB")
                rgb.save(buf, format="JPEG", quality=94, optimize=True)
            jpeg_bytes = buf.getvalue()

            # Discover linked Facebook Page ID from the Page Access Token
            page_id = (account.metadata_json or {}).get("page_id") if isinstance(account.metadata_json, dict) else None
            if not page_id:
                me_res = await client.get(
                    f"{GRAPH_API_BASE}/me",
                    params={"fields": "id", "access_token": token}
                )
                if me_res.status_code == 200 and me_res.headers.get("content-type", "").startswith("application/json"):
                    me_id = me_res.json().get("id")
                    if me_id and str(me_id) != str(account.account_id):
                        page_id = str(me_id)

            if not page_id:
                return None

            up_res = await client.post(
                f"{GRAPH_API_BASE}/{page_id}/photos",
                data={"published": "false", "temporary": "true", "access_token": token},
                files={"source": ("ig_stage.jpg", jpeg_bytes, "image/jpeg")}
            )
            if up_res.status_code != 200:
                return None
            photo_id = up_res.json().get("id")
            if not photo_id:
                return None

            img_res = await client.get(
                f"{GRAPH_API_BASE}/{photo_id}",
                params={"fields": "images", "access_token": token}
            )
            if img_res.status_code == 200:
                images = img_res.json().get("images") or []
                if images and isinstance(images, list) and images[0].get("source"):
                    cdn_url = images[0]["source"]
                    logger.info(f"Staged local image for Instagram via Meta CDN: {cdn_url[:80]}...")
                    return cdn_url
        except Exception as stage_err:
            logger.debug(f"Facebook CDN staging fallback: {stage_err}")
        return None

    def _prepare_instagram_image_url(self, image_url: str) -> tuple[Optional[str], Optional[str]]:
        """
        Ensure Instagram receives a publicly reachable JPEG URL.
        Meta's /media endpoint fetches image_url from its servers (cannot upload multipart bytes
        like Facebook) and rejects localhost URLs and some RGBA PNGs.
        Returns (resolved_url, error_message).
        """
        if not image_url:
            return None, "No image URL provided for Instagram post."

        from services.storage import storage_service

        local_path = self._resolve_local_image_path(image_url)
        is_localhost_url = (
            image_url.startswith("/")
            or "://localhost" in image_url
            or "://127.0.0.1" in image_url
        )

        # If we have the file on disk, convert to RGB JPEG for maximum Meta compatibility
        if local_path and os.path.exists(local_path):
            try:
                from PIL import Image
                stem, ext = os.path.splitext(os.path.basename(local_path))
                if ext.lower() not in (".jpg", ".jpeg"):
                    ig_filename = f"{stem}_ig.jpg"
                    ig_path = os.path.join(config.PROCESSED_IMAGES_DIR, ig_filename)
                    if not os.path.exists(ig_path):
                        with Image.open(local_path) as im:
                            rgb = im.convert("RGB")
                            rgb.save(ig_path, format="JPEG", quality=92, optimize=True)
                    with open(ig_path, "rb") as f:
                        ig_bytes = f.read()
                    # upload_image uploads to R2 if enabled, else uses storage_service.get_public_base_url()
                    resolved = storage_service.upload_image(ig_bytes, ig_filename, content_type="image/jpeg")
                    if "://localhost" not in resolved and "://127.0.0.1" not in resolved:
                        return resolved, None
                    is_localhost_url = True
                    image_url = resolved
            except Exception as conv_err:
                logger.warning(f"Instagram JPEG conversion fallback for {local_path}: {conv_err}")

        # Rewrite localhost/relative URL if a public base URL is configured
        if is_localhost_url:
            public_base = storage_service.get_public_base_url()
            if "localhost" not in public_base and "127.0.0.1" not in public_base:
                filename = image_url.split("/")[-1].split("?")[0]
                return f"{public_base.rstrip('/')}/api/media/posts/{filename}", None
            return None, (
                "Instagram requires a publicly reachable HTTPS image URL (received localhost). "
                "Set BACKEND_PUBLIC_URL or BACKEND_BASE_URL in .env to your public domain (e.g. https://brandflux.tntinnov.com)."
            )

        return image_url, None

    async def publish_text(self, text: str, account: SocialAccount) -> PublishResult:
        start_time = time.time()
        token = self._get_token(account)
        page_id = account.account_id

        # Instagram does not support text-only posts
        if account.platform in ("instagram", "instagram_post", "instagram_story"):
            return PublishResult(
                success=False,
                status="Failed",
                error="Instagram requires an image or video asset for all published updates.",
                error_code="INSTAGRAM_TEXT_NOT_SUPPORTED",
                http_status=400,
                duration_ms=int((time.time() - start_time) * 1000)
            )

        url = f"{GRAPH_API_BASE}/{page_id}/feed"
        sanitized_payload = {"endpoint": f"/{page_id}/feed", "message_length": len(text)}

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                res = await client.post(url, data={"message": text, "access_token": token})
                duration_ms = int((time.time() - start_time) * 1000)
                data = res.json() if res.headers.get("content-type", "").startswith("application/json") else {}

                if res.status_code == 200 and "id" in data:
                    post_id = data["id"]
                    permalink = f"https://www.facebook.com/{post_id}"
                    
                    # Follow-up verification check
                    try:
                        check_res = await client.get(
                            f"{GRAPH_API_BASE}/{post_id}",
                            params={"fields": "id,permalink_url", "access_token": token}
                        )
                        if check_res.status_code == 200:
                            check_data = check_res.json()
                            if "permalink_url" in check_data:
                                permalink = check_data["permalink_url"]
                    except Exception as err:
                        logger.warning(f"Follow-up check non-fatal error: {err}")

                    return PublishResult(
                        success=True,
                        status="Published",
                        external_post_id=post_id,
                        permalink=permalink,
                        http_status=res.status_code,
                        duration_ms=duration_ms,
                        sanitized_payload=sanitized_payload,
                        raw_response=data
                    )

                err_obj = data.get("error", {})
                err_msg = err_obj.get("message", res.text)
                err_code = str(err_obj.get("code", res.status_code))
                
                # Check for token expiry/invalidation
                status = "needs_reconnect" if err_obj.get("code") in (190, 102, 10) else "Failed"
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
            logger.error(f"Meta publish_text exception: {e}")
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
        target_id = account.account_id
        is_instagram = account.platform in ("instagram", "instagram_post")

        async with httpx.AsyncClient(timeout=60.0) as client:
            try:
                # ─── 1. INSTAGRAM PUBLISHING (Container + Polling + Publish) ────
                if is_instagram:
                    local_ig_path = self._resolve_local_image_path(image_url)
                    staged_cdn_url = None
                    if local_ig_path and os.path.exists(local_ig_path):
                        staged_cdn_url = await self._stage_local_image_via_facebook_cdn(
                            local_ig_path, token, client, account
                        )
                    if staged_cdn_url:
                        ig_image_url, prep_err = staged_cdn_url, None
                    else:
                        ig_image_url, prep_err = self._prepare_instagram_image_url(image_url)
                    sanitized_payload = {
                        "platform": "instagram",
                        "target_id": target_id,
                        "image_url": ig_image_url or image_url,
                        "caption_length": len(caption or "")
                    }
                    if prep_err or not ig_image_url:
                        return PublishResult(
                            success=False,
                            status="Failed",
                            error=prep_err or "Invalid Instagram image URL.",
                            error_code="INVALID_IG_IMAGE_URL",
                            http_status=400,
                            duration_ms=int((time.time() - start_time) * 1000),
                            sanitized_payload=sanitized_payload
                        )

                    # Verify account is Instagram Professional (Business or Creator)
                    try:
                        acct_check = await client.get(
                            f"{GRAPH_API_BASE}/{target_id}",
                            params={"fields": "id,username,account_type", "access_token": token}
                        )
                        if acct_check.status_code == 200:
                            acct_data = acct_check.json()
                            acc_type = acct_data.get("account_type", "").upper()
                            if acc_type and acc_type not in ("BUSINESS", "MEDIA_CREATOR"):
                                return PublishResult(
                                    success=False,
                                    status="needs_reconnect",
                                    error=f"Instagram account @{acct_data.get('username')} is '{acc_type}'. Meta API requires a Professional (Business or Creator) Instagram account.",
                                    error_code="NOT_BUSINESS_ACCOUNT",
                                    http_status=400,
                                    duration_ms=int((time.time() - start_time) * 1000),
                                    sanitized_payload=sanitized_payload
                                )
                    except Exception as err:
                        logger.warning(f"IG account check error (continuing): {err}")

                    # Step 1: Create media container
                    create_url = f"{GRAPH_API_BASE}/{target_id}/media"
                    create_res = await client.post(
                        create_url,
                        data={
                            "image_url": ig_image_url,
                            "caption": caption or "",
                            "access_token": token
                        }
                    )
                    create_data = create_res.json() if create_res.headers.get("content-type", "").startswith("application/json") else {}

                    if create_res.status_code != 200 or "id" not in create_data:
                        err_obj = create_data.get("error", {})
                        err_msg = err_obj.get("message", create_res.text)
                        err_code = str(err_obj.get("code", create_res.status_code))
                        status = "needs_reconnect" if err_obj.get("code") in (190, 102, 10) else "Failed"
                        return PublishResult(
                            success=False,
                            status=status,
                            error=f"Instagram media container creation failed: {err_msg}",
                            error_code=err_code,
                            http_status=create_res.status_code,
                            duration_ms=int((time.time() - start_time) * 1000),
                            sanitized_payload=sanitized_payload,
                            raw_response=create_data
                        )

                    creation_id = create_data["id"]

                    # Step 2: Poll container status until FINISHED
                    container_status = "IN_PROGRESS"
                    for _ in range(15):
                        await asyncio.sleep(2.0)
                        status_res = await client.get(
                            f"{GRAPH_API_BASE}/{creation_id}",
                            params={"fields": "status_code,status", "access_token": token}
                        )
                        if status_res.status_code == 200:
                            s_data = status_res.json()
                            container_status = s_data.get("status_code", "").upper()
                            if container_status == "FINISHED":
                                break
                            elif container_status in ("ERROR", "EXPIRED"):
                                return PublishResult(
                                    success=False,
                                    status="Failed",
                                    error=f"Instagram container processing failed with status: {container_status}",
                                    error_code=f"CONTAINER_{container_status}",
                                    http_status=400,
                                    duration_ms=int((time.time() - start_time) * 1000),
                                    sanitized_payload=sanitized_payload,
                                    raw_response=s_data
                                )

                    if container_status != "FINISHED":
                        return PublishResult(
                            success=False,
                            status="Failed",
                            error="Instagram container processing timed out before finishing.",
                            error_code="CONTAINER_TIMEOUT",
                            http_status=408,
                            duration_ms=int((time.time() - start_time) * 1000),
                            sanitized_payload=sanitized_payload
                        )

                    # Step 3: Publish container
                    pub_url = f"{GRAPH_API_BASE}/{target_id}/media_publish"
                    pub_res = await client.post(
                        pub_url,
                        data={
                            "creation_id": creation_id,
                            "access_token": token
                        }
                    )
                    pub_data = pub_res.json() if pub_res.headers.get("content-type", "").startswith("application/json") else {}

                    if pub_res.status_code == 200 and "id" in pub_data:
                        ig_media_id = pub_data["id"]
                        permalink = f"https://www.instagram.com/p/{ig_media_id}/"

                        # Follow-up check: Fetch real Instagram permalink
                        try:
                            f_check = await client.get(
                                f"{GRAPH_API_BASE}/{ig_media_id}",
                                params={"fields": "id,permalink", "access_token": token}
                            )
                            if f_check.status_code == 200:
                                f_data = f_check.json()
                                if "permalink" in f_data:
                                    permalink = f_data["permalink"]
                        except Exception as e:
                            logger.warning(f"IG follow-up permalink fetch non-fatal: {e}")

                        return PublishResult(
                            success=True,
                            status="Published",
                            external_post_id=ig_media_id,
                            permalink=permalink,
                            http_status=pub_res.status_code,
                            duration_ms=int((time.time() - start_time) * 1000),
                            sanitized_payload=sanitized_payload,
                            raw_response=pub_data
                        )

                    err_obj = pub_data.get("error", {})
                    err_msg = err_obj.get("message", pub_res.text)
                    err_code = str(err_obj.get("code", pub_res.status_code))
                    status = "needs_reconnect" if err_obj.get("code") in (190, 102, 10) else "Failed"
                    return PublishResult(
                        success=False,
                        status=status,
                        error=f"Instagram media_publish failed: {err_msg}",
                        error_code=err_code,
                        http_status=pub_res.status_code,
                        duration_ms=int((time.time() - start_time) * 1000),
                        sanitized_payload=sanitized_payload,
                        raw_response=pub_data
                    )

                # ─── 2. FACEBOOK PAGE PHOTO PUBLISHING ──────────────────────
                else:
                    fb_url = f"{GRAPH_API_BASE}/{target_id}/photos"
                    sanitized_payload = {
                        "platform": "facebook",
                        "target_id": target_id,
                        "caption_length": len(caption or "")
                    }

                    local_path = self._resolve_local_image_path(image_url)

                    # If local file exists, upload multipart file bytes directly
                    if local_path and os.path.exists(local_path):
                        with open(local_path, "rb") as img_file:
                            file_content = img_file.read()
                        files = {"source": ("image.png", file_content, "image/png")}
                        data = {"message": caption or "", "access_token": token}
                        fb_res = await client.post(fb_url, data=data, files=files)
                    else:
                        # Otherwise send remote URL
                        data = {"url": image_url, "message": caption or "", "access_token": token}
                        fb_res = await client.post(fb_url, data=data)

                    duration_ms = int((time.time() - start_time) * 1000)
                    fb_data = fb_res.json() if fb_res.headers.get("content-type", "").startswith("application/json") else {}

                    if fb_res.status_code == 200 and ("id" in fb_data or "post_id" in fb_data):
                        ext_id = fb_data.get("post_id") or fb_data.get("id")
                        permalink = f"https://www.facebook.com/{ext_id}"

                        # Follow-up check: Fetch real Facebook permalink & verify post exists
                        try:
                            check_res = await client.get(
                                f"{GRAPH_API_BASE}/{ext_id}",
                                params={"fields": "id,permalink_url", "access_token": token}
                            )
                            if check_res.status_code == 200:
                                check_data = check_res.json()
                                if "permalink_url" in check_data:
                                    permalink = check_data["permalink_url"]
                        except Exception as e:
                            logger.warning(f"Facebook follow-up check non-fatal error: {e}")

                        return PublishResult(
                            success=True,
                            status="Published",
                            external_post_id=ext_id,
                            permalink=permalink,
                            http_status=fb_res.status_code,
                            duration_ms=duration_ms,
                            sanitized_payload=sanitized_payload,
                            raw_response=fb_data
                        )

                    err_obj = fb_data.get("error", {})
                    err_msg = err_obj.get("message", fb_res.text)
                    err_code = str(err_obj.get("code", fb_res.status_code))
                    status = "needs_reconnect" if err_obj.get("code") in (190, 102, 10) else "Failed"
                    return PublishResult(
                        success=False,
                        status=status,
                        error=f"Facebook photo publish failed: {err_msg}",
                        error_code=err_code,
                        http_status=fb_res.status_code,
                        duration_ms=duration_ms,
                        sanitized_payload=sanitized_payload,
                        raw_response=fb_data
                    )

            except Exception as e:
                logger.error(f"Meta publish_image error: {e}")
                return PublishResult(
                    success=False,
                    status="Failed",
                    error=str(e),
                    error_code="NETWORK_ERROR",
                    duration_ms=int((time.time() - start_time) * 1000)
                )

    async def publish_story(self, media_url: str, account: SocialAccount) -> PublishResult:
        start_time = time.time()
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

                # Poll container
                for _ in range(10):
                    await asyncio.sleep(2.0)
                    s_res = await client.get(
                        f"{GRAPH_API_BASE}/{creation_id}",
                        params={"fields": "status_code", "access_token": token}
                    )
                    if s_res.status_code == 200 and s_res.json().get("status_code") == "FINISHED":
                        break

                pub_url = f"{GRAPH_API_BASE}/{target_id}/media_publish"
                pub_res = await client.post(
                    pub_url,
                    data={"creation_id": creation_id, "access_token": token}
                )
                pub_data = pub_res.json()
                if pub_res.status_code == 200 and "id" in pub_data:
                    return PublishResult(
                        success=True,
                        status="Published",
                        external_post_id=pub_data["id"],
                        permalink=f"https://www.instagram.com/stories/{target_id}/",
                        raw_response=pub_data,
                        duration_ms=int((time.time() - start_time) * 1000)
                    )

                err = pub_data.get("error", {}).get("message", pub_res.text)
                return PublishResult(success=False, status="Failed", error=err, raw_response=pub_data)

            except Exception as e:
                logger.error(f"Meta publish_story error: {e}")
                return PublishResult(success=False, status="Failed", error=str(e))

    async def get_metrics(self, external_post_id: str, account: SocialAccount) -> MetricsResult:
        token = self._get_token(account)
        async with httpx.AsyncClient(timeout=20.0) as client:
            try:
                url = f"{GRAPH_API_BASE}/{external_post_id}/insights"
                res = await client.get(url, params={"access_token": token, "metric": "impressions,reach,engagement"})
                if res.status_code == 200:
                    data = res.json().get("data", [])
                    metrics = {m.get("name"): m.get("values", [{}])[0].get("value", 0) for m in data}
                    return MetricsResult(
                        impressions=metrics.get("impressions", 0),
                        reach=metrics.get("reach", 0),
                        engagement=metrics.get("engagement", 0),
                        raw_data=res.json()
                    )
                return MetricsResult()
            except Exception as e:
                logger.error(f"Meta get_metrics error: {e}")
                return MetricsResult()

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

