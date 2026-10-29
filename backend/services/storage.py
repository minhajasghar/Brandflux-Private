import os
import logging
from typing import Optional
import boto3
from botocore.config import Config

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

    def upload_image(self, image_bytes: bytes, filename: str, content_type: str = "image/png") -> str:
        """
        Upload image bytes to Cloudflare R2 and return the public CDN URL.
        Falls back to local /static route if R2 is unconfigured.
        """
        # Always persist a local copy for local preview & offline dev resilience
        local_path = os.path.join(PROCESSED_IMAGES_DIR, filename)
        try:
            with open(local_path, "wb") as f:
                f.write(image_bytes)
        except Exception as e:
            logger.warning(f"Could not write local preview copy for {filename}: {e}")

        # Upload to Cloudflare R2
        if self.enabled and self.client:
            try:
                key = f"posts/{filename}"
                self.client.put_object(
                    Bucket=self.bucket_name,
                    Key=key,
                    Body=image_bytes,
                    ContentType=content_type,
                )
                if self.public_url:
                    cdn_url = f"{self.public_url.rstrip('/')}/{key}"
                else:
                    cdn_url = f"https://{self.bucket_name}.r2.cloudflarestorage.com/{key}"
                logger.info(f"Successfully uploaded {filename} to Cloudflare R2: {cdn_url}")
                return cdn_url
            except Exception as e:
                logger.error(f"Cloudflare R2 upload error for {filename}: {e}. Reverting to local URL.")

        return f"http://localhost:8000/static/{filename}"


# Singleton instance
storage_service = StorageService()

