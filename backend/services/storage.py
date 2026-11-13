import os
import io
import logging
from typing import Optional, Dict, Any
import boto3
from botocore.config import Config
from PIL import Image, ImageDraw, ImageFont

from config import (
    R2_ACCOUNT_ID,
    R2_ACCESS_KEY_ID,
    R2_SECRET_ACCESS_KEY,
    R2_BUCKET_NAME,
    R2_PUBLIC_URL,
    R2_ENDPOINT_URL,
    PROCESSED_IMAGES_DIR,
)

logger = logging.getLogger(__name__)


class StorageService:
    """Service to upload and serve media from Cloudflare R2 (S3-compatible) or local fallback."""

    def __init__(self):
        self.bucket_name = R2_BUCKET_NAME
        self.public_url = R2_PUBLIC_URL
        self.enabled = bool(
            R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY and (R2_ENDPOINT_URL or R2_ACCOUNT_ID)
        )
        self.client = None

        if self.enabled:
            endpoint = R2_ENDPOINT_URL or f"https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com"
            try:
                self.client = boto3.client(
                    service_name="s3",
                    endpoint_url=endpoint,
                    aws_access_key_id=R2_ACCESS_KEY_ID,
                    aws_secret_access_key=R2_SECRET_ACCESS_KEY,
                    region_name="auto",
                    config=Config(s3={"addressing_style": "path"})
                )
                logger.info(f"Initialized Cloudflare R2 storage for bucket '{self.bucket_name}' at endpoint: {endpoint}")
            except Exception as e:
                logger.error(f"Failed to initialize Cloudflare R2 storage client: {e}")
                self.enabled = False
        else:
            logger.info("Cloudflare R2 credentials not fully set; operating in local storage mode with CDN fallback.")

    def get_public_base_url(self) -> str:
        """Resolve public backend URL for media delivery."""
        import config
        for candidate in (
            os.getenv("BACKEND_PUBLIC_URL"),
            os.getenv("API_BASE_URL"),
            os.getenv("PUBLIC_API_URL"),
            getattr(config, "BACKEND_BASE_URL", None),
            getattr(config, "APP_BASE_URL", None),
        ):
            if candidate and "localhost" not in candidate and "127.0.0.1" not in candidate:
                return candidate.rstrip("/")
        base = os.getenv("BACKEND_PUBLIC_URL") or os.getenv("API_BASE_URL") or os.getenv("PUBLIC_API_URL") or getattr(config, "BACKEND_BASE_URL", None)
        if base:
            return base.rstrip("/")
        return "http://localhost:8000"

    def upload_image(self, image_bytes: bytes, filename: str, content_type: str = "image/png") -> str:
        """
        Upload image bytes to Cloudflare R2 and return a stable public unguessable URL.
        If R2 public CDN is unconfigured, serves via the public /api/media/posts route.
        """
        # Always persist a local copy for local preview & offline dev resilience
        local_path = os.path.join(PROCESSED_IMAGES_DIR, filename)
        try:
            with open(local_path, "wb") as f:
                f.write(image_bytes)
        except Exception as e:
            logger.warning(f"Could not write local preview copy for {filename}: {e}")

        # Upload to Cloudflare R2 if configured
        if self.enabled and self.client:
            try:
                key = f"posts/{filename}"
                self.client.put_object(
                    Bucket=self.bucket_name,
                    Key=key,
                    Body=image_bytes,
                    ContentType=content_type,
                )
                # If custom CDN / public domain is configured (e.g. cdn.brandflux.ai or pub-xxx.r2.dev)
                if self.public_url:
                    cdn_url = f"{self.public_url.rstrip('/')}/posts/{filename}"
                else:
                    # R2 raw endpoint requires signed access; generate long-lived presigned URL (7 days)
                    cdn_url = self.client.generate_presigned_url(
                        ClientMethod="get_object",
                        Params={"Bucket": self.bucket_name, "Key": key},
                        ExpiresIn=604800
                    )
                logger.info(f"Successfully uploaded {filename} to Cloudflare R2: {cdn_url}")
                return cdn_url
            except Exception as e:
                logger.error(f"Cloudflare R2 upload error for {filename}: {e}. Reverting to local URL.")

        # Local public URL route with CORS and caching
        return f"{self.get_public_base_url()}/api/media/posts/{filename}"

    def verify_image_reachable(self, filename_or_url: str) -> bool:
        """
        Verify that an image actually exists in storage and contains valid image data (> 500 bytes).
        Works with either filenames or full URLs.
        """
        if not filename_or_url:
            return False

        # Extract filename from URL
        clean_name = filename_or_url.split("?")[0].split("#")[0]
        filename = os.path.basename(clean_name)
        if not filename:
            return False

        local_path = os.path.join(PROCESSED_IMAGES_DIR, filename)
        if os.path.exists(local_path):
            try:
                size = os.path.getsize(local_path)
                return size >= 500
            except Exception:
                return False

        # If R2 client is enabled and file not on local disk, check remote object
        if self.enabled and self.client:
            try:
                key = f"posts/{filename}"
                head = self.client.head_object(Bucket=self.bucket_name, Key=key)
                return head.get("ContentLength", 0) >= 500
            except Exception:
                pass

        return False

    def delete_file(self, filename_or_url: str) -> bool:
        """
        Permanently delete an image/media file from local storage and Cloudflare R2 bucket.
        Handles both raw filenames and full URLs.
        """
        if not filename_or_url:
            return False

        clean_name = filename_or_url.split("?")[0].split("#")[0]
        filename = os.path.basename(clean_name)
        if not filename:
            return False

        # 1. Delete local file copy
        local_path = os.path.join(PROCESSED_IMAGES_DIR, filename)
        if os.path.exists(local_path):
            try:
                os.remove(local_path)
                logger.info(f"Deleted local file copy: {local_path}")
            except Exception as e:
                logger.warning(f"Could not delete local file {local_path}: {e}")

        # 2. Delete from Cloudflare R2 if client enabled
        if self.enabled and self.client:
            for prefix in ("posts/", "references/", ""):
                try:
                    self.client.delete_object(
                        Bucket=self.bucket_name,
                        Key=f"{prefix}{filename}"
                    )
                except Exception:
                    pass

        return True

    def generate_fallback_image(
        self,
        brand_profile: Optional[Dict[str, Any]] = None,
        headline: Optional[str] = None,
        platform: str = "instagram_post"
    ) -> bytes:
        """
        Clean minimal placeholder PNG without hardcoded text or fake UI overlays.
        """
        width, height = (1080, 1080)
        if platform in ("instagram_story", "story"):
            width, height = (1080, 1920)
        elif platform in ("linkedin_post", "facebook_post"):
            width, height = (1200, 630)

        img = Image.new("RGB", (width, height), color=(13, 15, 22))
        buf = io.BytesIO()
        img.save(buf, format="PNG", optimize=True)
        buf.seek(0)
        return buf.getvalue()

    def upload_private_reference(
        self,
        image_bytes: bytes,
        filename: str,
        content_type: str = "image/jpeg"
    ) -> str:
        """
        Store uploaded reference image securely in private R2 bucket or local storage,
        and generate a time-limited signed URL (default 24 hours).
        """
        key = f"references/{filename}"

        # Persist local reference copy
        local_path = os.path.join(PROCESSED_IMAGES_DIR, filename)
        try:
            with open(local_path, "wb") as f:
                f.write(image_bytes)
        except Exception as e:
            logger.warning(f"Could not save local reference file {filename}: {e}")

        # If R2 client available, upload to private bucket and generate signed URL
        if self.enabled and self.client:
            try:
                self.client.put_object(
                    Bucket=self.bucket_name,
                    Key=key,
                    Body=image_bytes,
                    ContentType=content_type,
                )
                # Generate presigned URL valid for 24 hours (86400 seconds)
                presigned_url = self.client.generate_presigned_url(
                    ClientMethod="get_object",
                    Params={"Bucket": self.bucket_name, "Key": key},
                    ExpiresIn=86400
                )
                logger.info(f"Generated signed URL for reference image {filename}")
                return presigned_url
            except Exception as e:
                logger.error(f"Error creating presigned URL for reference image {filename}: {e}")

        # Local fallback signed mock/static URL
        return f"{self.get_public_base_url()}/api/media/references/{filename}"


# Singleton instance
storage_service = StorageService()

