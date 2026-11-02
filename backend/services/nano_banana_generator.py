import os
import io
import time
import uuid
import base64
import asyncio
import traceback
import logging
from typing import Dict, Any, Optional, Tuple, List
import httpx
from sqlalchemy.orm import Session

from config import GEMINI_API_KEY, IMAGE_MODEL
from services.storage import storage_service
from services.renderer.html_renderer import html_renderer
from database import SessionLocal

logger = logging.getLogger(__name__)


class GeminiBillingError(Exception):
    """Raised when the Gemini API key is missing or billing is not enabled."""
    pass


class NanoBananaGenerator:
    """
    AI-generated background generator using Google's Nano Banana 2.1 via Gemini API.
    - Model ID configured via env var IMAGE_MODEL (default: gemini-nano-banana-2.1)
    - Generates visual background/hero textures from brand kit and daily check-in context
    - Strictly forbids the model from rendering text or logos (handled by HTML overlay)
    - Supports aspect ratios: 1:1, 4:5, 9:16
    - Features timeout, exponential backoff retries, and fallback to gradient/solid background
    - Saves outputs to Cloudflare R2 and logs usage/cost to the database
    """

    # Google AI Studio / Gemini API native image pricing (gemini-nano-banana-2.1 / flash-image at 1K resolution):
    # Output tokens billed at ~$60/M tokens ≈ $0.067 per 1024x1024 image
    COST_PER_IMAGE_USD = 0.067

    def __init__(self):
        self._model_override = None
        self._api_key_override = None
        self.timeout_seconds = 38.0
        self.max_retries = 2
        self.last_error_message = None

    @property
    def model_id(self) -> str:
        if self._model_override is not None:
            return self._model_override
        try:
            from services.admin_service import get_ai_credentials
            creds = get_ai_credentials()
            if creds.get("image_model"):
                return creds["image_model"]
        except Exception:
            pass
        return os.getenv("IMAGE_MODEL", IMAGE_MODEL or "gemini-nano-banana-2.1").strip()

    @model_id.setter
    def model_id(self, val: str):
        self._model_override = val

    @property
    def api_key(self) -> str:
        if self._api_key_override is not None:
            return self._api_key_override
        try:
            from services.admin_service import get_ai_credentials
            creds = get_ai_credentials()
            if creds.get("gemini_api_key"):
                return creds["gemini_api_key"]
        except Exception:
            pass
        return os.getenv("GEMINI_API_KEY", GEMINI_API_KEY or "").strip().strip('"').strip("'")

    @api_key.setter
    def api_key(self, val: str):
        self._api_key_override = val

    def get_active_model(self) -> str:
        """Dynamic read of IMAGE_MODEL to allow env changes without code edits."""
        return self.model_id

    def get_api_key(self) -> str:
        """Dynamic read of GEMINI_API_KEY."""
        return self.api_key

    def validate_api_key(self) -> None:
        """
        Validate presence of Gemini API key.
        Raises GeminiBillingError if missing or default placeholder.
        """
        key = self.get_api_key()
        if not key or key in ("your_gemini_api_key_here", "dummy_key", "test_key", ""):
            raise GeminiBillingError(
                "Gemini API key is missing or unconfigured. Image generation with Google's Nano Banana 2.1 "
                f"({self.get_active_model()}) requires a paid Gemini API key with billing enabled. "
                "Please configure a valid GEMINI_API_KEY with active Google Cloud billing in your environment."
            )

    def normalize_aspect_ratio(self, ratio_or_platform: Optional[str]) -> Tuple[str, Tuple[int, int]]:
        """
        Map aspect ratio or social platform to supported ratios (1:1, 4:5, 9:16)
        and pixel dimensions.
        """
        if not ratio_or_platform:
            return "1:1", (1080, 1080)

        cleaned = str(ratio_or_platform).lower().strip()

        if cleaned in ("1:1", "square", "instagram_post", "post"):
            return "1:1", (1080, 1080)
        elif cleaned in ("4:5", "portrait", "feed_portrait", "linkedin", "linkedin_post", "facebook", "facebook_post"):
            return "4:5", (1080, 1350)
        elif cleaned in ("9:16", "story", "instagram_story", "vertical", "reel"):
            return "9:16", (1080, 1920)

        # Default fallback
        return "1:1", (1080, 1080)

    def build_background_prompt(
        self,
        brand_profile: Dict[str, Any],
        daily_context: Optional[Dict[str, Any]] = None,
        aspect_ratio: str = "1:1",
        reference_images: Optional[List[Dict[str, Any]]] = None,
        reference_context: Optional[str] = None,
        variant_style: Optional[str] = None
    ) -> str:
        """
        Construct a background visual prompt using brand kit, daily check-in context,
        reference images (modes: 'use_photo' vs 'style_inspiration'), and variant composition styles.
        Explicitly instructs the model NOT to generate text or logos.
        """
        daily_context = daily_context or {}

        # Brand Kit Variables
        business_name = brand_profile.get("business_name") or brand_profile.get("name") or "Brand"
        industry = brand_profile.get("industry") or brand_profile.get("business_type") or "technology and business"
        tone = brand_profile.get("brand_tone") or "modern, authoritative, and clean"
        primary_color = brand_profile.get("primary_color") or "#1558C9"
        secondary_color = brand_profile.get("secondary_color") or "#D4FF24"

        # Daily Check-in Context
        focus = daily_context.get("answer_1") or daily_context.get("focus") or ""
        special_message = daily_context.get("answer_2") or daily_context.get("special_message") or ""
        theme = daily_context.get("theme") or daily_context.get("session_theme") or daily_context.get("topic") or focus or "growth and strategy"

        context_clues = []
        if focus:
            context_clues.append(f"Subject theme: {focus}")
        if special_message:
            context_clues.append(f"Context notes: {special_message}")
        if reference_context:
            context_clues.append(f"User Creative Context: {reference_context}")

        # Reference Images Guidance
        ref_guidance = []
        if reference_images:
            for i, ref in enumerate(reference_images, 1):
                mode = ref.get("mode", "use_photo")
                if mode == "use_photo":
                    ref_guidance.append(
                        f"[Reference {i} - 'Use my photo' mode]: Preserve and enhance the exact subject/product from this reference image, "
                        f"elevating it into a premium studio presentation integrated with {primary_color} ambient lighting."
                    )
                else:  # style_inspiration
                    ref_guidance.append(
                        f"[Reference {i} - 'Style inspiration' mode]: Match the aesthetic mood, color harmony, and artistic lighting of this reference, "
                        f"but generate completely new content. STRICT RESTRICTION: Do NOT copy any logos, text, or identifiable persons from this reference."
                    )

        ref_section = " ".join(ref_guidance) if ref_guidance else ""

        ratio_desc = {
            "1:1": "square 1:1 framing with balanced central atmospheric composition",
            "4:5": "vertical 4:5 portrait composition with elegant negative space",
            "9:16": "tall 9:16 vertical composition with ample breathing room in the upper and center regions"
        }.get(aspect_ratio, "1:1 composition")

        # Composition / Angle / Mood variation prompt
        variant_angle = variant_style or "cinematic volumetric lighting with modern dynamic perspective"

        context_str = "; ".join(context_clues) if context_clues else f"Theme: {theme}"

        prompt = (
            f"Commercial atmospheric hero background visual for a {industry} brand with {tone} aesthetic. "
            f"Visual elements inspired by {context_str}. "
            f"{ref_section} "
            f"Style direction: {variant_angle}. "
            f"Lighting and ambient color accents harmoniously incorporating luminous cobalt blue ({primary_color}) "
            f"and electric lime highlights ({secondary_color}) with deep charcoal studio atmosphere. "
            f"Composition: {ratio_desc}, 8k resolution, clean architectural negative space, "
            f"smooth subtle 3D textures, clean studio render. "
            f"CRITICAL STRICT REQUIREMENT: Absolutely NO text, NO typography, NO words, NO letters, NO numbers, "
            f"NO logos, NO icons, NO watermarks, NO badges, and NO slogans. "
            f"This is strictly an empty background layer designed for HTML overlay."
        )
        return prompt

    async def _call_gemini_api(self, prompt: str, aspect_ratio: str) -> bytes:
        """
        Execute API call to Gemini with timeout and return raw PNG bytes.
        Calls the generateContent endpoint with responseModalities=['IMAGE'],
        and falls back to predict for Imagen models.
        """
        self.validate_api_key()
        api_key = self.get_api_key()
        model_name = self.get_active_model()
        clean_model = model_name.replace("models/", "")
        headers = {"Content-Type": "application/json"}

        # 1. Primary: generateContent endpoint (standard for gemini-nano-banana and multimodal Gemini models)
        content_url = f"https://generativelanguage.googleapis.com/v1beta/models/{clean_model}:generateContent?key={api_key}"
        content_payload = {
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {"responseModalities": ["IMAGE"]}
        }

        async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
            try:
                res = await client.post(content_url, json=content_payload, headers=headers)
                if res.status_code == 200:
                    data = res.json()
                    candidates = data.get("candidates", [])
                    if candidates:
                        parts = candidates[0].get("content", {}).get("parts", [])
                        for part in parts:
                            inline = part.get("inlineData", {})
                            if inline.get("data"):
                                return base64.b64decode(inline["data"])
                elif res.status_code in (400, 402, 403, 429):
                    err_text = res.text
                    if any(kw in err_text.lower() for kw in ("billing", "quota", "resource_exhausted", "permission_denied", "payment")):
                        raise GeminiBillingError(
                            f"Gemini API image generation failed ({res.status_code}): Billing must be enabled on your "
                            f"Google Cloud / AI Studio project for model '{model_name}'. Details: {err_text}"
                        )
                    logger.info(f"generateContent returned status {res.status_code}, falling through to predict endpoint")
            except GeminiBillingError:
                raise
            except Exception as ex:
                logger.warning(f"generateContent attempt encountered exception: {ex}")

            # 2. Secondary fallback: predict endpoint (for Imagen-style endpoints)
            predict_url = f"https://generativelanguage.googleapis.com/v1beta/models/{clean_model}:predict?key={api_key}"
            predict_payload = {
                "instances": [{"prompt": prompt}],
                "parameters": {
                    "sampleCount": 1,
                    "aspectRatio": aspect_ratio,
                    "outputMimeType": "image/png"
                }
            }
            pred_res = await client.post(predict_url, json=predict_payload, headers=headers)
            if pred_res.status_code == 200:
                data = pred_res.json()
                predictions = data.get("predictions") or []
                if predictions:
                    first_pred = predictions[0]
                    b64 = (
                        first_pred.get("bytesBase64Encoded")
                        or (first_pred.get("image", {}).get("imageBytes") if isinstance(first_pred, dict) else None)
                        or (first_pred if isinstance(first_pred, str) else None)
                    )
                    if b64:
                        return base64.b64decode(b64)

            raise Exception(f"Gemini API image generation failed. generateContent: {res.status_code if 'res' in locals() else 'error'}, predict: {pred_res.status_code}: {pred_res.text}")

    async def generate_background_with_retry(
        self,
        prompt: str,
        aspect_ratio: str
    ) -> bytes:
        """
        Execute image generation with timeout and exponential backoff retry.
        """
        last_error = None
        for attempt in range(1, self.max_retries + 1):
            try:
                logger.info(
                    f"🎨 [Attempt {attempt}/{self.max_retries}] Requesting background from {self.get_active_model()} "
                    f"({aspect_ratio})..."
                )
                image_bytes = await self._call_gemini_api(prompt, aspect_ratio)
                if image_bytes and len(image_bytes) > 1000:
                    logger.info(
                        f"✓ Received {len(image_bytes)} bytes from {self.get_active_model()} on attempt {attempt}"
                    )
                    return image_bytes
            except GeminiBillingError as bill_err:
                # Do not retry on permanent billing/auth errors
                logger.error(f"❌ Gemini Billing Error: {bill_err}")
                raise bill_err
            except Exception as e:
                last_error = e
                logger.warning(f"⚠️ Image generation attempt {attempt} failed: {e}")
                if attempt < self.max_retries:
                    backoff = (2 ** (attempt - 1)) * 1.5
                    await asyncio.sleep(backoff)

        raise last_error or Exception("Image generation failed after maximum retries")

    def _log_usage(
        self,
        user_id: Optional[str],
        brand_id: Optional[str],
        model: str,
        prompt: str,
        aspect_ratio: str,
        media_url: Optional[str],
        status: str,
        error_message: Optional[str],
        duration_ms: int,
        db: Optional[Session] = None
    ) -> None:
        """Log per-generation cost, model usage, and outcome to the usage table."""
        from models.models import Usage
        should_close = False
        session = db
        if session is None:
            session = SessionLocal()
            should_close = True

        try:
            usage_record = Usage(
                id=str(uuid.uuid4()),
                user_id=user_id,
                brand_id=brand_id,
                feature="image_generation",
                model=model,
                prompt=prompt,
                aspect_ratio=aspect_ratio,
                media_url=media_url,
                cost=self.COST_PER_IMAGE_USD if status == "success" else 0.0,
                credits_used=1 if status == "success" else 0,
                status=status,
                error_message=error_message,
                duration_ms=duration_ms
            )
            session.add(usage_record)
            session.commit()
            logger.info(
                f"📊 Logged generation usage: Model={model}, Status={status}, "
                f"Cost=${usage_record.cost:.3f}, Duration={duration_ms}ms"
            )
        except Exception as log_err:
            logger.error(f"Failed to record generation usage: {log_err}")
            session.rollback()
        finally:
            if should_close:
                session.close()

    async def generate_background(
        self,
        brand_profile: Dict[str, Any],
        daily_context: Optional[Dict[str, Any]] = None,
        aspect_ratio: str = "1:1",
        user_id: Optional[str] = None,
        brand_id: Optional[str] = None,
        reference_images: Optional[List[Dict[str, Any]]] = None,
        reference_context: Optional[str] = None,
        variant_style: Optional[str] = None,
        db: Optional[Session] = None
    ) -> Optional[str]:
        """
        High-level orchestrator:
        1. Formulates prompt from brand kit, daily check-in, reference images & modes, and variant composition style.
        2. Normalizes aspect ratio to 1:1, 4:5, or 9:16.
        3. Calls Nano Banana 2.1 via Gemini API with retries and timeout.
        4. Uploads generated visual to Cloudflare R2 and gets public CDN URL.
        5. Logs per-generation usage/cost to the database `usage` table.
        6. On failure or missing billing: logs failure and returns None (triggering CSS gradient fallback).
        """
        norm_ratio, (w, h) = self.normalize_aspect_ratio(aspect_ratio)
        prompt = self.build_background_prompt(
            brand_profile=brand_profile,
            daily_context=daily_context,
            aspect_ratio=norm_ratio,
            reference_images=reference_images,
            reference_context=reference_context,
            variant_style=variant_style
        )
        model_name = self.get_active_model()
        start_time = time.time()

        try:
            # Generate background visual
            image_bytes = await self.generate_background_with_retry(prompt, norm_ratio)

            # Upload to Cloudflare R2
            filename = f"bg_banana_{uuid.uuid4().hex[:10]}.png"
            public_url = storage_service.upload_image(image_bytes, filename)

            elapsed_ms = int((time.time() - start_time) * 1000)

            # Log successful usage
            self._log_usage(
                user_id=user_id,
                brand_id=brand_id,
                model=model_name,
                prompt=prompt,
                aspect_ratio=norm_ratio,
                media_url=public_url,
                status="success",
                error_message=None,
                duration_ms=elapsed_ms,
                db=db
            )

            return public_url

        except GeminiBillingError as bill_err:
            elapsed_ms = int((time.time() - start_time) * 1000)
            logger.error(f"⚠️ Falling back to CSS ambient/solid background: {bill_err}")
            self.last_error_message = f"Google Cloud billing required: {bill_err}"
            self._log_usage(
                user_id=user_id,
                brand_id=brand_id,
                model=model_name,
                prompt=prompt,
                aspect_ratio=norm_ratio,
                media_url=None,
                status="fallback",
                error_message=str(bill_err),
                duration_ms=elapsed_ms,
                db=db
            )
            # Return None to trigger HTML/CSS gradient/solid background fallback
            return None

        except Exception as gen_err:
            elapsed_ms = int((time.time() - start_time) * 1000)
            err_str = str(gen_err)
            if "401" in err_str or "UNAUTHENTICATED" in err_str or "API key not valid" in err_str:
                self.last_error_message = "Google Gemini API key invalid or unauthenticated (HTTP 401). Please check GEMINI_API_KEY in backend/.env."
            elif "429" in err_str or "RESOURCE_EXHAUSTED" in err_str or "quota" in err_str.lower():
                self.last_error_message = "Google Gemini rate limit / quota exceeded (HTTP 429). Please wait a moment or check your AI Studio quota."
            elif "timeout" in err_str.lower():
                self.last_error_message = "Image generation timed out after 38s. Google AI Studio server took too long to respond."
            else:
                self.last_error_message = f"Image generation failed: {err_str[:120]}"

            logger.error(
                f"❌ Nano Banana generation failed ({gen_err}) after {elapsed_ms}ms:\n{traceback.format_exc()}\nFalling back to template gradient/solid background."
            )
            self._log_usage(
                user_id=user_id,
                brand_id=brand_id,
                model=model_name,
                prompt=prompt,
                aspect_ratio=norm_ratio,
                media_url=None,
                status="fallback",
                error_message=str(gen_err),
                duration_ms=elapsed_ms,
                db=db
            )
            return None

    async def render_post_with_background(
        self,
        template_name: str,
        context: Dict[str, Any],
        brand_profile: Dict[str, Any],
        daily_context: Optional[Dict[str, Any]] = None,
        aspect_ratio: str = "1:1",
        user_id: Optional[str] = None,
        brand_id: Optional[str] = None,
        reference_images: Optional[List[Dict[str, Any]]] = None,
        reference_context: Optional[str] = None,
        variant_style: Optional[str] = None,
        db: Optional[Session] = None
    ) -> Tuple[bytes, str, Optional[str]]:
        """
        Full pipeline:
        1. Generate AI background via Nano Banana 2.1 (or fallback to None), incorporating references and variant styles.
        2. Inject `background_image_url` into template context.
        3. Render Playwright HTML/CSS template to crisp PNG bytes.
        4. Upload post PNG to R2.
        5. Return (png_bytes, public_post_url, background_image_url).
        """
        norm_ratio, (width, height) = self.normalize_aspect_ratio(aspect_ratio)

        # 1. Generate or fallback background image
        bg_url = await self.generate_background(
            brand_profile=brand_profile,
            daily_context=daily_context,
            aspect_ratio=norm_ratio,
            user_id=user_id,
            brand_id=brand_id,
            reference_images=reference_images,
            reference_context=reference_context,
            variant_style=variant_style,
            db=db
        )

        # 2. Enrich template context
        enriched_context = {
            **context,
            "background_image_url": bg_url,
            "aspect_ratio": norm_ratio,
            "width": width,
            "height": height
        }

        # 3. Render HTML to PNG via Playwright
        tpl_file = template_name if template_name.endswith(".html") else f"{template_name}.html"
        png_bytes = await html_renderer.render_template(
            template_name=tpl_file,
            context=enriched_context,
            width=width,
            height=height
        )

        # 4. Upload post to R2
        filename = f"post_{norm_ratio.replace(':', '_')}_{uuid.uuid4().hex[:10]}.png"
        post_url = storage_service.upload_image(png_bytes, filename)

        return png_bytes, post_url, bg_url


# Global instance
nano_banana_generator = NanoBananaGenerator()
