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
        base = os.getenv("BACKEND_PUBLIC_URL") or os.getenv("API_BASE_URL") or os.getenv("PUBLIC_API_URL")
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
        Generate a high-resolution, branded fallback PNG on-the-fly when AI generation
        or Playwright rendering experiences transient failure. Ensures 100% 200 OK image delivery.
        """
        width, height = (1080, 1080)
        if platform in ("instagram_story", "story"):
            width, height = (1080, 1920)
        elif platform in ("linkedin_post", "facebook_post"):
            width, height = (1200, 630)

        img = Image.new("RGB", (width, height), color=(13, 15, 22)) # Dark design token #0D0F16
        draw = ImageDraw.Draw(img)

        # Primary brand color
        brand_name = (brand_profile.get("business_name") if brand_profile else None) or "Brandflux"
        primary_color = (brand_profile.get("primary_color") if brand_profile else None) or "#1558C9"
        secondary_color = (brand_profile.get("secondary_color") if brand_profile else None) or "#D4FF24"

        # Background decorative accent glow
        try:
            # Draw top accent bar
            draw.rectangle([(0, 0), (width, 16)], fill=primary_color)
            # Subtle corner geometry
            draw.ellipse([(-100, -100), (400, 400)], fill=(21, 88, 201, 30))
            draw.rectangle([(60, height - 120), (width - 60, height - 116)], fill=(28, 32, 48))
        except Exception:
            pass

        # Text rendering
        clean_headline = (headline or "Creative Focus for Today").strip()
        if len(clean_headline) > 80:
            clean_headline = clean_headline[:77] + "..."

        # Brand header
        draw.text((80, 80), brand_name.upper(), fill=secondary_color)
        draw.text((80, 110), "AI SOCIAL CREATIVE", fill=(138, 147, 165))

        # Main Headline
        draw.text((80, height // 2 - 80), clean_headline, fill=(245, 247, 250))

        # CTA bar
        draw.rounded_rectangle(
            [(80, height - 220), (380, height - 160)],
            radius=12,
            fill=primary_color
        )
        draw.text((110, height - 200), "DISCOVER MORE  ->", fill=(255, 255, 255))

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

