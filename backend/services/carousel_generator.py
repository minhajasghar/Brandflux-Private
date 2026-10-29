import uuid
import logging
from typing import Dict, Any, List, Optional
from services.gemini_service import GeminiService
from services.renderer.html_renderer import html_renderer
from services.storage import storage_service

logger = logging.getLogger(__name__)


class CarouselGenerator:
    """
    Produces consistent 3–7 slide social carousels (Hook, Points, CTA)
    and exports them as an ordered high-resolution image set.
    """

    def __init__(self):
        self.gemini = GeminiService()
        self.renderer = html_renderer

    async def generate_carousel(
        self,
        topic: str,
        brand_profile: Dict[str, Any],
        slide_count: int = 5,
        aspect_ratio: str = "1:1",
        custom_cta: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Generate a multi-slide carousel on a given topic, rendered to PNG via Playwright.

        :param topic: The subject/theme of the carousel
        :param brand_profile: Dict containing brand name, colors, logo, tagline, etc.
        :param slide_count: Number of slides between 3 and 7 (default 5)
        :param aspect_ratio: "1:1" (1080x1080) or "4:5" (1080x1350)
        :param custom_cta: Optional custom call-to-action text
        :return: Dict containing topic, slide metadata, and ordered image URLs
        """
        # Validate slide count
        slide_count = max(3, min(7, int(slide_count)))

        # Determine dimensions
        if aspect_ratio == "4:5":
            width, height = 1080, 1350
        else:
            width, height = 1080, 1080
            aspect_ratio = "1:1"

        logger.info(f"Generating {slide_count}-slide carousel for topic '{topic}' ({aspect_ratio})")

        # 1. Generate structured outline with Gemini
        slide_outlines = self.gemini.generate_carousel_content(
            topic=topic,
            brand_profile=brand_profile,
            slide_count=slide_count,
            custom_cta=custom_cta
        )

        # 2. Extract brand details
        colors = brand_profile.get("colors") or []
        primary = brand_profile.get("primary_color") or (colors[0] if colors else "#1558C9")
        secondary = brand_profile.get("secondary_color") or (colors[1] if len(colors) > 1 else "#D4FF24")
        brand_name = brand_profile.get("business_name") or "Brandflux"
        brand_handle = brand_profile.get("brand_handle") or f"@{brand_name.lower().replace(' ', '')}"
        brand_logo = brand_profile.get("clean_logo_url") or brand_profile.get("logo_url") or ""
        website_url = brand_profile.get("website_url") or ""

        brand_colors = {
            "bg": "#05060A",
            "surface": "#0D0F16",
            "surface_card": "#121622",
            "border": "#1C2030",
            "primary": primary,
            "primary_light": "#4C8DFF",
            "accent": secondary,
            "text": "#F4F5F7",
            "muted": "#8A90A2"
        }

        carousel_id = uuid.uuid4().hex[:8]
        rendered_slides: List[Dict[str, Any]] = []
        ordered_image_urls: List[str] = []

        # 3. Render each slide in sequence
        for idx, slide_data in enumerate(slide_outlines):
            slide_num = idx + 1
            role = slide_data.get("role", "point")
            if slide_num == 1:
                role = "hook"
            elif slide_num == slide_count:
                role = "cta"

            context = {
                "role": role,
                "current_slide": slide_num,
                "total_slides": slide_count,
                "brand_name": brand_name,
                "brand_handle": brand_handle,
                "brand_logo": brand_logo,
                "website_url": website_url,
                "brand_colors": brand_colors,
                "headline": slide_data.get("headline", ""),
                "subtext": slide_data.get("subtext", ""),
                "topic_tag": slide_data.get("topic_tag", "GUIDE"),
                "point_index": slide_data.get("point_index", idx),
                "takeaway": slide_data.get("takeaway", ""),
                "cta_text": slide_data.get("cta_text", custom_cta or "Save For Later"),
                "aspect_ratio": aspect_ratio
            }

            try:
                png_bytes = await self.renderer.render_template(
                    template_name="carousel_slide.html",
                    context=context,
                    width=width,
                    height=height
                )

                # 4. Upload slide to storage
                filename = f"carousel_{carousel_id}_slide_{slide_num:02d}.png"
                image_url = storage_service.upload_image(png_bytes, filename)

                rendered_slides.append({
                    "slide_number": slide_num,
                    "role": role,
                    "headline": context["headline"],
                    "subtext": context["subtext"],
                    "image_url": image_url,
                    "filename": filename
                })
                ordered_image_urls.append(image_url)

            except Exception as slide_err:
                logger.error(f"Failed to render slide {slide_num}: {slide_err}")
                fallback_url = f"http://localhost:8000/static/fallback_slide_{slide_num}.png"
                rendered_slides.append({
                    "slide_number": slide_num,
                    "role": role,
                    "headline": context["headline"],
                    "subtext": context["subtext"],
                    "image_url": fallback_url,
                    "error": str(slide_err)
                })
                ordered_image_urls.append(fallback_url)

        return {
            "success": True,
            "carousel_id": carousel_id,
            "topic": topic,
            "slide_count": len(rendered_slides),
            "aspect_ratio": aspect_ratio,
            "dimensions": {"width": width, "height": height},
            "slides": rendered_slides,
            "ordered_image_urls": ordered_image_urls
        }


# Global instance
carousel_generator = CarouselGenerator()

