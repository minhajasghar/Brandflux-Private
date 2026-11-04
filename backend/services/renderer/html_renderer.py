import os
import asyncio
import time
import logging
import concurrent.futures
from typing import Dict, Any, Optional
from jinja2 import Environment, FileSystemLoader, select_autoescape
from playwright.sync_api import sync_playwright

logger = logging.getLogger(__name__)

TEMPLATES_DIR = os.path.join(os.path.dirname(__file__), "templates")

# Dedicated background thread pool for Playwright rendering (isolated from uvicorn asyncio loop)
_RENDER_POOL = concurrent.futures.ThreadPoolExecutor(max_workers=2, thread_name_prefix="playwright_worker")


def _sync_render_html(html_content: str, width: int, height: int, device_scale_factor: int) -> bytes:
    """
    Synchronous render executed in dedicated thread with independent greenlet event loop.
    Completely prevents Windows uvicorn event-loop collisions and hanging.
    """
    t0 = time.time()
    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=True,
            args=[
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-dev-shm-usage",
                "--disable-gpu",
                "--font-render-hinting=none",
            ]
        )
        try:
            page = browser.new_page(
                viewport={"width": width, "height": height},
                device_scale_factor=device_scale_factor
            )
            # Wait for DOM and images
            try:
                page.set_content(html_content, wait_until="load", timeout=7000)
            except Exception:
                page.set_content(html_content, wait_until="domcontentloaded", timeout=4000)

            # Wait briefly for fonts
            try:
                page.evaluate("document.fonts.ready")
            except Exception:
                pass

            png_bytes = page.screenshot(type="png", full_page=False)
            elapsed = time.time() - t0
            logger.info(f"✓ Playwright rendered {len(png_bytes)} bytes in {elapsed:.2f}s")
            return png_bytes
        finally:
            browser.close()


class HTMLRenderer:
    """
    Renders high-fidelity HTML/CSS templates to PNG using isolated Playwright workers.
    """
    _instance: Optional["HTMLRenderer"] = None

    def __init__(self):
        self.jinja_env = Environment(
            loader=FileSystemLoader(TEMPLATES_DIR),
            autoescape=select_autoescape(["html", "xml"])
        )

    @classmethod
    def get_instance(cls) -> "HTMLRenderer":
        if cls._instance is None:
            cls._instance = HTMLRenderer()
        return cls._instance

    async def render_html(
        self,
        html_content: str,
        width: int = 1080,
        height: int = 1080,
        device_scale_factor: int = 2
    ) -> bytes:
        """
        Non-blocking dispatch to dedicated isolated thread pool with timeout safety net.
        """
        loop = asyncio.get_running_loop()
        return await asyncio.wait_for(
            loop.run_in_executor(_RENDER_POOL, _sync_render_html, html_content, width, height, device_scale_factor),
            timeout=15.0
        )

    async def render_template(
        self,
        template_name: str,
        context: Dict[str, Any],
        width: int = 1080,
        height: int = 1080,
        device_scale_factor: int = 2
    ) -> bytes:
        """
        Render a Jinja2 HTML template with brand variables and data context.
        """
        merged_context = {
            "width": width,
            "height": height,
            **context
        }

        # Normalize brand colors
        if "brand_colors" not in merged_context:
            colors = merged_context.get("colors") or []
            primary = merged_context.get("primary_color") or (colors[0] if colors else "#F97316")
            secondary = merged_context.get("secondary_color") or (colors[1] if len(colors) > 1 else "#F48C25")
            
            # Dynamic primary glow and highlight tint
            try:
                hex_clean = primary.lstrip("#")
                if len(hex_clean) == 3:
                    hex_clean = "".join([c * 2 for c in hex_clean])
                r, g, b = int(hex_clean[0:2], 16), int(hex_clean[2:4], 16), int(hex_clean[4:6], 16)
                glow = f"rgba({r}, {g}, {b}, 0.28)"
                primary_light = f"#{min(255, int(r * 1.15)):02X}{min(255, int(g * 1.15)):02X}{min(255, int(b * 1.15)):02X}"
            except Exception:
                glow = "rgba(249, 115, 22, 0.28)"
                primary_light = primary

            merged_context["brand_colors"] = {
                "bg": "#0B0F17",
                "surface": "#111827",
                "surface_card": "#1F2937",
                "border": "rgba(255, 255, 255, 0.12)",
                "primary": primary,
                "primary_light": primary_light,
                "primary_glow": glow,
                "accent": secondary,
                "text": "#F9FAFB",
                "muted": "#9CA3AF",
            }

        template = self.jinja_env.get_template(template_name)
        html_content = template.render(**merged_context)
        return await self.render_html(
            html_content=html_content,
            width=width,
            height=height,
            device_scale_factor=device_scale_factor
        )

    async def close(self):
        """Clean shutdown."""
        pass


html_renderer = HTMLRenderer()
