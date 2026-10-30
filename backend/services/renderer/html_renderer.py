import os
import asyncio
import logging
from typing import Dict, Any, Optional
from jinja2 import Environment, FileSystemLoader, select_autoescape
from playwright.async_api import async_playwright, Browser, Playwright

logger = logging.getLogger(__name__)

TEMPLATES_DIR = os.path.join(os.path.dirname(__file__), "templates")


class HTMLRenderer:
    """
    Renders high-fidelity HTML/CSS templates to PNG using headless Playwright Chromium.
    Reuses browser instance across calls for optimal throughput and sub-second rendering.
    """

    _instance: Optional["HTMLRenderer"] = None
    _lock = asyncio.Lock()

    def __init__(self):
        self.jinja_env = Environment(
            loader=FileSystemLoader(TEMPLATES_DIR),
            autoescape=select_autoescape(["html", "xml"])
        )
        self._playwright: Optional[Playwright] = None
        self._browser: Optional[Browser] = None
        self._init_lock = asyncio.Lock()

    @classmethod
    def get_instance(cls) -> "HTMLRenderer":
        if cls._instance is None:
            cls._instance = HTMLRenderer()
        return cls._instance

    async def _get_browser(self) -> Browser:
        async with self._init_lock:
            if self._browser is None or not self._browser.is_connected():
                if self._playwright is None:
                    self._playwright = await async_playwright().start()
                
                self._browser = await self._playwright.chromium.launch(
                    headless=True,
                    args=[
                        "--no-sandbox",
                        "--disable-setuid-sandbox",
                        "--disable-dev-shm-usage",
                        "--disable-gpu",
                        "--font-render-hinting=none",
                    ]
                )
                logger.info("🚀 Playwright Chromium browser initialized for HTML template rendering")
            return self._browser

    async def render_html(
        self,
        html_content: str,
        width: int = 1080,
        height: int = 1080,
        device_scale_factor: int = 2
    ) -> bytes:
        """
        Render raw HTML string to PNG bytes with high-DPI scaling.
        Auto-recovers from closed connections or event-loop recycling.
        """
        context = None
        page = None
        for attempt in range(2):
            try:
                browser = await self._get_browser()
                context = await browser.new_context(
                    viewport={"width": width, "height": height},
                    device_scale_factor=device_scale_factor
                )
                page = await context.new_page()
                break
            except Exception as e:
                logger.warning(f"Browser context creation failed (attempt {attempt+1}): {e}, recycling browser instance...")
                async with self._init_lock:
                    try:
                        if self._browser:
                            await self._browser.close()
                    except Exception:
                        pass
                    try:
                        if self._playwright:
                            await self._playwright.stop()
                    except Exception:
                        pass
                    self._browser = None
                    self._playwright = None
                if attempt == 1:
                    raise

        try:
            # Set HTML content and wait for DOM and styling
            try:
                await page.set_content(html_content, wait_until="load", timeout=8000)
            except Exception:
                await page.set_content(html_content, wait_until="domcontentloaded", timeout=5000)
            
            # Wait for Google Fonts to finish loading in DOM
            try:
                await page.evaluate("document.fonts.ready")
            except Exception:
                pass

            # Screenshot exact viewport
            png_bytes = await page.screenshot(
                type="png",
                full_page=False
            )
            return png_bytes
        finally:
            if page:
                try:
                    await page.close()
                except Exception:
                    pass
            if context:
                try:
                    await context.close()
                except Exception:
                    pass

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
        # Ensure dimensions in context
        merged_context = {
            "width": width,
            "height": height,
            **context
        }

        # Normalize brand colors
        if "brand_colors" not in merged_context:
            colors = merged_context.get("colors") or []
            primary = merged_context.get("primary_color") or (colors[0] if colors else "#1558C9")
            secondary = merged_context.get("secondary_color") or (colors[1] if len(colors) > 1 else "#D4FF24")
            merged_context["brand_colors"] = {
                "bg": "#05060A",
                "surface": "#0D0F16",
                "surface_card": "#121622",
                "border": "#1C2030",
                "primary": primary,
                "primary_light": "#4C8DFF",
                "accent": secondary,
                "text": "#F4F5F7",
                "muted": "#8A90A2",
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
        """Clean shutdown of browser and playwright context."""
        try:
            if self._browser and self._browser.is_connected():
                await self._browser.close()
        except Exception:
            pass
        finally:
            self._browser = None

        try:
            if self._playwright:
                await self._playwright.stop()
        except Exception:
            pass
        finally:
            self._playwright = None
        logger.info("🛑 Playwright browser shut down")


# Global singleton instance
html_renderer = HTMLRenderer.get_instance()

