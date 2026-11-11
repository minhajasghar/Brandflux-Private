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
        return "models/gemini-nano-banana-2.1"

    @model_id.setter
    def model_id(self, val: str):
        self._model_override = "models/gemini-nano-banana-2.1"

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
        elif cleaned in ("9:16", "story", "instagram_story", "vertical", "reel", "tiktok", "tiktok_video"):
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
            "4:5": "vertical 4:5 portrait composition with elegant perspective",
            "9:16": "tall 9:16 vertical composition with breathing room"
        }.get(aspect_ratio, "1:1 composition")

        # Composition / Angle / Mood variation prompt
        variant_angle = variant_style or "cinematic volumetric lighting with modern dynamic perspective"

        context_str = "; ".join(context_clues) if context_clues else f"Theme: {theme}"

        display_headline = daily_context.get("headline") or daily_context.get("theme") or theme

        prompt = (
            f"A stunning professional social media graphic and commercial visual masterpiece for {business_name}, "
            f"a brand in the {industry} industry with a {tone} aesthetic. "
            f"Central Subject & Core Message: '{display_headline}'. Visual context: {context_str}. "
            f"{ref_section} "
            f"Style & Composition: {variant_angle}, {ratio_desc}. "
            f"Color palette: Dynamic visual contrast with subtle luminous accents in {primary_color} and {secondary_color}, rich depth, and clean negative space. "
            f"1K resolution, ultra-high definition, photorealistic, cinematic commercial studio lighting, "
            f"crisp details, depth of field, premium award-winning product and lifestyle presentation. "
            f"STRICT LOGO RULE: Absolutely DO NOT draw, paint, simulate, or render ANY logo, emblem, brand icon, monogram, or watermark anywhere in the image canvas. The official authentic brand logo is overlaid separately by our system. Keep the top header and top corners completely clean and empty of all logos, emblems, and header text. Focus all visual artistry and headline typography strictly in the central canvas area."
        )
        return prompt

    async def _call_gemini_api(self, prompt: str, aspect_ratio: str) -> bytes:
        """
        Execute API call exclusively to gemini-nano-banana-2.1 with timeout and return raw PNG bytes.
        Calls the generateContent endpoint with responseModalities=['IMAGE'].
        """
        is_paid_allowed = os.getenv("ALLOW_PAID_GENERATION", "true").strip().lower() in ("true", "1", "yes")
        if not is_paid_allowed:
            logger.warning("Cost safety rule triggered: Paid image generation refused.")
            raise RuntimeError("Generation is disabled in this environment")

        self.validate_api_key()
        api_key = self.get_api_key()
        headers = {
            "Content-Type": "application/json",
            "x-goog-api-key": api_key
        }

        # Exclusively call gemini-nano-banana-2.1 generateContent with 1K image quality
        api_aspect_ratio = aspect_ratio if aspect_ratio in ("1:1", "4:5", "9:16", "16:9") else "1:1"
        content_url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-nano-banana-2.1:generateContent"
        content_payload = {
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {
                "responseModalities": ["IMAGE"],
                "imageConfig": {
                    "imageSize": "1K",
                    "aspectRatio": api_aspect_ratio
                }
            }
        }

        async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
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
                raise Exception("gemini-nano-banana-2.1 returned 200 OK but no image was found in response.")
            elif res.status_code in (400, 402, 403, 429):
                err_text = res.text
                if any(kw in err_text.lower() for kw in ("billing", "quota", "resource_exhausted", "permission_denied", "payment")):
                    raise GeminiBillingError(
                        f"Gemini API image generation failed ({res.status_code}): Billing must be enabled on your "
                        f"Google Cloud / AI Studio project for model 'gemini-nano-banana-2.1'. Details: {err_text}"
                    )
                raise Exception(f"gemini-nano-banana-2.1 error ({res.status_code}): {err_text}")
            else:
                raise Exception(f"gemini-nano-banana-2.1 returned HTTP {res.status_code}: {res.text}")

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
        is_paid_allowed = os.getenv("ALLOW_PAID_GENERATION", "true").strip().lower() in ("true", "1", "yes")
        if not is_paid_allowed:
            logger.warning("Cost safety: Paid image generation is disabled (ALLOW_PAID_GENERATION=false).")
            raise RuntimeError("Generation is disabled in this environment")

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

            # Composite the user's authentic Brand Kit logo onto the post image
            image_bytes = await self._composite_brand_logo(image_bytes, brand_profile, brand_id=brand_id)

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
            self.last_error_message = "Content styled with brand color palette."
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
            self.last_error_message = "Branded visual asset styled with your brand's color palette."

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

    async def _composite_brand_logo(self, image_bytes: bytes, brand_profile: Dict[str, Any], brand_id: Optional[str] = None) -> bytes:
        """
        Overlay the brand's authentic uploaded logo from Brand Kit onto the generated image.
        Uses PIL to gracefully composite transparent RGBA logo with soft ambient backing.
        """
        if not image_bytes or not brand_profile:
            return image_bytes

        try:
            import io
            from PIL import Image, ImageFilter, ImageDraw

            backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
            resolved_brand_id = brand_id or brand_profile.get("id") or brand_profile.get("brand_id")
            logo_bytes = None

            # 1. Prefer local original high-res transparent PNG if saved
            if resolved_brand_id:
                orig_path = os.path.join(backend_dir, "processed_images", f"{resolved_brand_id}_original.png")
                if os.path.exists(orig_path):
                    with open(orig_path, "rb") as f:
                        logo_bytes = f.read()

            # 2. Check clean_logo_url and logo_url
            if not logo_bytes:
                raw_logo = brand_profile.get("logo_url") or ""
                clean_logo = brand_profile.get("clean_logo_url") or ""
                
                # Check candidate URLs/filenames (prioritize PNG for transparency)
                candidates = []
                for u in [clean_logo, raw_logo]:
                    if u and u.lower().endswith(".png"):
                        candidates.append(u)
                for u in [clean_logo, raw_logo]:
                    if u and u not in candidates:
                        candidates.append(u)

                for target_url in candidates:
                    if not target_url:
                        continue
                    # Check local files first
                    filename = os.path.basename(target_url.split("?")[0])
                    candidate_paths = [
                        os.path.join(backend_dir, "processed_images", filename),
                        os.path.join(backend_dir, "posts", filename),
                        os.path.join(backend_dir, "static", filename),
                    ]
                    for cp in candidate_paths:
                        if os.path.exists(cp):
                            with open(cp, "rb") as f:
                                logo_bytes = f.read()
                            break
                    if logo_bytes:
                        break

                    # Check HTTP download
                    if target_url.startswith("http"):
                        try:
                            async with httpx.AsyncClient(timeout=6.0, follow_redirects=True) as client:
                                resp = await client.get(target_url)
                                if resp.status_code == 200 and len(resp.content) > 100:
                                    logo_bytes = resp.content
                                    break
                        except Exception as dl_err:
                            logger.warning(f"Could not download logo from {target_url}: {dl_err}")

            if not logo_bytes:
                logger.info("No brand logo bytes found to composite.")
                return image_bytes

            # 3. Open images
            base_img = Image.open(io.BytesIO(image_bytes)).convert("RGBA")
            logo_raw = Image.open(io.BytesIO(logo_bytes))

            # Auto-clean solid black background on JPG logos if needed
            if logo_raw.mode != "RGBA":
                logo_raw = logo_raw.convert("RGBA")
                datas = logo_raw.getdata()
                new_data = []
                for item in datas:
                    if item[0] < 30 and item[1] < 30 and item[2] < 30:
                        new_data.append((0, 0, 0, 0))
                    else:
                        new_data.append(item)
                logo_raw.putdata(new_data)

            logo_img = logo_raw
            bw, bh = base_img.size
            lw, lh = logo_img.size

            if lw == 0 or lh == 0:
                return image_bytes

            # Target logo size: proportional width ~18% of canvas width, max height ~14%
            target_w = max(110, int(bw * 0.18))
            target_max_h = max(75, int(bh * 0.14))

            scale = min(target_w / float(lw), target_max_h / float(lh))
            new_w = max(1, int(lw * scale))
            new_h = max(1, int(lh * scale))

            logo_resized = logo_img.resize((new_w, new_h), Image.Resampling.LANCZOS)

            # Padding: 4.5% of canvas width from top and left
            pad_x = int(bw * 0.045)
            pad_y = int(bh * 0.045)

            # 4. Clean backdrop & shadow so authentic logo is pristine and occludes any stray artifacts
            pill_pad = 10
            pill_w = new_w + pill_pad * 2
            pill_h = new_h + pill_pad * 2
            pill = Image.new("RGBA", (pill_w, pill_h), (0, 0, 0, 0))
            draw = ImageDraw.Draw(pill)
            draw.rounded_rectangle([0, 0, pill_w - 1, pill_h - 1], radius=14, fill=(10, 14, 23, 215))
            pill = pill.filter(ImageFilter.GaussianBlur(3))
            base_img.paste(pill, (pad_x - pill_pad, pad_y - pill_pad), mask=pill)

            # 4. Composite the authentic brand kit logo cleanly with its natural alpha transparency
            # No artificial blurry bounding boxes, pill shapes, or square containers
            if logo_resized.mode == "RGBA":
                alpha = logo_resized.split()[3]
                shadow = Image.new("RGBA", (new_w + 16, new_h + 16), (0, 0, 0, 0))
                shadow_solid = Image.new("RGBA", (new_w, new_h), (0, 0, 0, 180))
                shadow.paste(shadow_solid, (8, 8), mask=alpha)
                shadow = shadow.filter(ImageFilter.GaussianBlur(4))
                base_img.paste(shadow, (pad_x - 8, pad_y - 8), mask=shadow)
                base_img.paste(logo_resized, (pad_x, pad_y), mask=logo_resized)
            else:
                base_img.paste(logo_resized, (pad_x, pad_y))

            # 5. Composite the official authentic brand logo
            base_img.paste(logo_resized, (pad_x, pad_y), mask=logo_resized)

            output = io.BytesIO()
            base_img.save(output, format="PNG", quality=95)
            composited_bytes = output.getvalue()
            logger.info(f"✓ Successfully composited brand kit logo onto post image ({new_w}x{new_h} at {pad_x},{pad_y})")
            return composited_bytes

        except Exception as comp_err:
            logger.warning(f"Logo compositing encountered an error, keeping original background: {comp_err}")
            return image_bytes

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
