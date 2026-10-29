import os
import io
import uuid
import math
import asyncio
import concurrent.futures
import urllib.parse
import httpx
import logging
from typing import Dict, Any, Optional, List, Tuple
from services.renderer.html_renderer import html_renderer

logger = logging.getLogger(__name__)


def _run_async(coro):
    """Bridge async Playwright calls from sync FastAPI or Celery contexts."""
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        return asyncio.run(coro)

    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
        return pool.submit(asyncio.run, coro).result()


# ─── Dimensions Map ─────────────────────────────────────────────────────────

ASPECT_RATIO_DIMENSIONS = {
    "1:1": (1080, 1080),
    "4:5": (1080, 1350),
    "9:16": (1080, 1920),
    "16:9": (1920, 1080),
    "linkedin_banner": (1200, 627),
    "facebook_post": (1200, 630),
}

PLATFORM_DEFAULT_DIMENSIONS = {
    "instagram_post": (1080, 1080),
    "instagram_story": (1080, 1920),
    "story": (1080, 1920),
    "linkedin": (1200, 627),
    "linkedin_post": (1200, 627),
    "facebook": (1200, 630),
    "facebook_post": (1200, 630),
}

# Template filename mapping
TEMPLATE_MAP = {
    "quote": "quote_bold.html",
    "stat": "stat_metric.html",
    "checklist": "checklist_value.html",
    "before_after": "before_after.html",
    "announcement": "announcement_hero.html",
    "process": "process_steps.html",
    "carousel_slide": "carousel_slide.html",
}


class ImageGenerator:
    """
    Next-generation social graphic generator powered by HTML/CSS and headless Playwright.
    Replaces Pillow bitmap drawing with pixel-perfect responsive web templates.
    """

    def __init__(self):
        self.renderer = html_renderer

    async def generate_background(
        self,
        prompt: str,
        style: str = "photography",
        width: int = 1080,
        height: int = 1080,
        platform: str = "instagram_post",
        brand_profile: dict = None
    ) -> bytes:
        """
        Optional background scene generator using Pollinations AI.
        """
        try:
            import random
            seed = random.randint(10000, 99999)
            clean_prompt = prompt.replace("\n", " ").strip()
            encoded = urllib.parse.quote(f"{clean_prompt}, commercial quality, high resolution, 8k")
            url = (
                f"https://image.pollinations.ai/prompt/{encoded}"
                f"?width={width}&height={height}&nologo=true&seed={seed}"
            )

            async with httpx.AsyncClient(timeout=45.0) as client:
                response = await client.get(url)
                if response.status_code == 200 and len(response.content) > 5000:
                    return response.content
                raise Exception(f"Pollinations status {response.status_code}")
        except Exception as e:
            logger.warning(f"Background generation fallback: {e}")
            # Generate solid dark background bytes fallback
            return b""

    async def create_branded_post_async(
        self,
        brand_profile: dict,
        post_text: str,
        platform: str = "instagram_post",
        cta: str = "",
        template_style: Optional[str] = None,
        background_bytes: Optional[bytes] = None,
        background_image_url: Optional[str] = None,
        aspect_ratio: Optional[str] = None,
        extra_context: Optional[dict] = None
    ) -> bytes:
        """
        Async rendering of brand graphic using Playwright HTML/CSS templates.
        """
        # 1. Resolve dimensions
        if aspect_ratio and aspect_ratio in ASPECT_RATIO_DIMENSIONS:
            width, height = ASPECT_RATIO_DIMENSIONS[aspect_ratio]
        else:
            width, height = PLATFORM_DEFAULT_DIMENSIONS.get(platform, (1080, 1080))

        # 2. Pick template based on platform & requested style
        if not template_style:
            if platform in ("instagram_story", "story"):
                template_style = "announcement"
            elif "\n" in post_text and ("•" in post_text or "-" in post_text or "1." in post_text):
                template_style = "checklist"
            elif any(sym in post_text for sym in ("%", "$", "x", "+")):
                template_style = "stat"
            else:
                template_style = "quote"

        template_file = TEMPLATE_MAP.get(template_style, "quote_bold.html")

        # 3. Build template context
        colors = brand_profile.get("colors") or []
        primary = brand_profile.get("primary_color") or (colors[0] if colors else "#1558C9")
        secondary = brand_profile.get("secondary_color") or (colors[1] if len(colors) > 1 else "#D4FF24")
        brand_name = brand_profile.get("business_name") or "Brandflux"
        brand_handle = brand_profile.get("brand_handle") or f"@{brand_name.lower().replace(' ', '')}"
        brand_logo = brand_profile.get("clean_logo_url") or brand_profile.get("logo_url") or ""
        website_url = brand_profile.get("website_url") or ""

        # Parse headline and subtext from post_text
        lines = [line.strip() for line in post_text.strip().split("\n") if line.strip()]
        headline = lines[0] if lines else post_text
        subtext = " ".join(lines[1:]) if len(lines) > 1 else ""

        # Context defaults
        context = {
            "brand_name": brand_name,
            "brand_tagline": brand_profile.get("tagline", "Automate Your Social Growth"),
            "brand_handle": brand_handle,
            "brand_logo": brand_logo,
            "website_url": website_url,
            "headline": headline,
            "subtext": subtext,
            "cta": cta or "Learn More",
            "colors": [primary, secondary],
            "primary_color": primary,
            "secondary_color": secondary,
            "aspect_ratio": f"{width}:{height}",
            "background_image_url": background_image_url,
            **(extra_context or {})
        }

        # Template specific enrichments
        if template_style == "stat" and "stat_value" not in context:
            # Extract possible stat
            import re
            stat_match = re.search(r"(\+?\d+[\%xXkKmM]|\$\d+[\w]*)", post_text)
            context["stat_value"] = stat_match.group(0) if stat_match else "10x"
            context["metric_label"] = "KEY PERFORMANCE IMPACT"

        elif template_style == "checklist" and "items" not in context:
            context["items"] = [
                {"title": line.lstrip("•-0123456789. "), "description": ""}
                for line in lines[1:5]
            ] if len(lines) > 1 else [
                {"title": "Automate Everyday Content", "description": "Free up creative bandwidth with Playwright templates"},
                {"title": "Maintain Brand Identity", "description": "Keep consistent colors, fonts, and logos across all channels"},
                {"title": "Schedule & Distribute", "description": "1-click multi-platform calendar dispatch"}
            ]

        elif template_style == "before_after" and "old_points" not in context:
            context["old_points"] = ["Slow manual edits in Canva", "Inconsistent brand typography", "Broken image resolution"]
            context["new_points"] = ["Automated Playwright 2x Retina PNGs", "Precise brand color system", "1-Click multi-platform export"]

        elif template_style == "process" and "steps" not in context:
            context["steps"] = [
                {"title": "1. Analyze Brand DNA", "description": "Scrape website colors, logo, and tone."},
                {"title": "2. Generate High-Retention Slides", "description": "Gemini crafts hook, points, and CTA."},
                {"title": "3. Export Crisp PNGs", "description": "Playwright compiles to 2x retina images."}
            ]

        # 4. Render HTML/CSS to PNG bytes
        return await self.renderer.render_template(
            template_name=template_file,
            context=context,
            width=width,
            height=height
        )

    def create_branded_post(
        self,
        background_bytes: Optional[bytes],
        brand_profile: dict,
        post_text: str,
        platform: str = "instagram_post",
        cta: str = "",
        background_image_url: Optional[str] = None
    ) -> bytes:
        """
        Synchronous drop-in replacement for legacy Pillow generator.
        Delegates to Playwright HTMLRenderer.
        """
        return _run_async(self.create_branded_post_async(
            brand_profile=brand_profile,
            post_text=post_text,
            platform=platform,
            cta=cta,
            background_bytes=background_bytes,
            background_image_url=background_image_url
        ))

    async def render_template(
        self,
        template_name: str,
        context: Dict[str, Any],
        aspect_ratio: str = "1:1",
        width: Optional[int] = None,
        height: Optional[int] = None
    ) -> bytes:
        """
        Directly render any of the 6 templates with custom context and aspect ratio.
        """
        if not width or not height:
            width, height = ASPECT_RATIO_DIMENSIONS.get(aspect_ratio, (1080, 1080))

        tpl_file = TEMPLATE_MAP.get(template_name, template_name)
        if not tpl_file.endswith(".html"):
            tpl_file = f"{tpl_file}.html"

        return await self.renderer.render_template(
            template_name=tpl_file,
            context=context,
            width=width,
            height=height
        )


# Global instance
image_generator = ImageGenerator()
