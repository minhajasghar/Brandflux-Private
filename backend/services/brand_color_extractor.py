import asyncio
import colorsys
import json
import logging
import math
import os
import re
from typing import Dict, Any, List, Optional, Tuple
from urllib.parse import urljoin, urlparse

import httpx
from bs4 import BeautifulSoup
from PIL import Image

logger = logging.getLogger(__name__)


# ─── Color Utility Helpers ──────────────────────────────────────────────────

def hex_to_rgb(hex_code: str) -> Optional[Tuple[int, int, int]]:
    """Convert hex string (#RGB or #RRGGBB) to (R, G, B) tuple."""
    hex_code = hex_code.strip().lstrip("#")
    if len(hex_code) == 3:
        hex_code = "".join([c * 2 for c in hex_code])
    if len(hex_code) != 6:
        return None
    try:
        r = int(hex_code[0:2], 16)
        g = int(hex_code[2:4], 16)
        b = int(hex_code[4:6], 16)
        return (r, g, b)
    except ValueError:
        return None


def rgb_to_hex(r: int, g: int, b: int) -> str:
    """Convert (R, G, B) to uppercase hex #RRGGBB."""
    return f"#{max(0, min(255, r)):02X}{max(0, min(255, g)):02X}{max(0, min(255, b)):02X}"


def parse_css_color(color_str: str) -> Optional[str]:
    """Parse rgb(), rgba(), hsl(), hsla(), or hex string to normalized #RRGGBB hex."""
    if not color_str:
        return None
    color_str = color_str.strip()

    # Transparent or inherit
    if color_str in ("transparent", "inherit", "initial", "unset", "none"):
        return None

    # Hex
    if color_str.startswith("#"):
        rgb = hex_to_rgb(color_str)
        return rgb_to_hex(*rgb) if rgb else None

    # rgb / rgba
    m = re.match(r"rgba?\(\s*([\d\.]+)\s*,\s*([\d\.]+)\s*,\s*([\d\.]+)(?:\s*,\s*([\d\.]+))?\s*\)", color_str)
    if m:
        r = int(float(m.group(1)))
        g = int(float(m.group(2)))
        b = int(float(m.group(3)))
        alpha = float(m.group(4)) if m.group(4) is not None else 1.0
        if alpha < 0.15:  # Transparent or near transparent
            return None
        return rgb_to_hex(r, g, b)

    # hsl / hsla
    m_hsl = re.match(r"hsla?\(\s*([\d\.]+)(?:deg)?\s*,\s*([\d\.]+)%\s*,\s*([\d\.]+)%(?:\s*,\s*([\d\.]+))?\s*\)", color_str)
    if m_hsl:
        h = float(m_hsl.group(1)) / 360.0
        s = float(m_hsl.group(2)) / 100.0
        l = float(m_hsl.group(3)) / 100.0
        alpha = float(m_hsl.group(4)) if m_hsl.group(4) is not None else 1.0
        if alpha < 0.15:
            return None
        r, g, b = colorsys.hls_to_rgb(h, l, s)
        return rgb_to_hex(int(r * 255), int(g * 255), int(b * 255))

    return None


def get_hsl(hex_code: str) -> Tuple[float, float, float]:
    """Return (h, s, l) with values in range [0, 1]."""
    rgb = hex_to_rgb(hex_code)
    if not rgb:
        return (0.0, 0.0, 0.0)
    r, g, b = [x / 255.0 for x in rgb]
    return colorsys.rgb_to_hls(r, g, b)  # Note: colorsys returns (h, l, s)


def color_distance(hex1: str, hex2: str) -> float:
    """Weighted Euclidean distance in RGB space."""
    rgb1 = hex_to_rgb(hex1)
    rgb2 = hex_to_rgb(hex2)
    if not rgb1 or not rgb2:
        return 999.0
    r1, g1, b1 = rgb1
    r2, g2, b2 = rgb2
    # Weighted RGB Euclidean distance (closer to human perception)
    r_mean = (r1 + r2) / 2
    delta_r = r1 - r2
    delta_g = g1 - g2
    delta_b = b1 - b2
    return math.sqrt(
        (2 + r_mean / 256) * (delta_r ** 2) +
        4 * (delta_g ** 2) +
        (2 + (255 - r_mean) / 256) * (delta_b ** 2)
    )


def is_neutral(hex_code: str) -> bool:
    """Check if color is neutral (near-white, near-black, or low saturation grey/slate)."""
    h, l, s = get_hsl(hex_code)
    if l > 0.88:  # Near white
        return True
    if l < 0.18:  # Near black / very dark slate / charcoal (e.g. #111827, #1F2937)
        return True
    if s < 0.20:  # Desaturated grey
        return True
    return False


# ─── Color Candidate Data Class ─────────────────────────────────────────────

class ColorCandidate:
    def __init__(self, hex_code: str, weight: float, source: str):
        self.hex_code = hex_code.upper()
        self.weight = weight
        self.source = source


# ─── Brand Color Extractor Engine ───────────────────────────────────────────

class BrandColorExtractor:
    def __init__(self, website_url: str):
        if not website_url.startswith("http"):
            website_url = "https://" + website_url
        self.url = website_url
        self.candidates: List[ColorCandidate] = []
        self.screenshot_bytes: Optional[bytes] = None
        self.logo_url: Optional[str] = None

    async def extract_palette(self) -> Dict[str, Any]:
        """
        Run the complete 6-layer brand color extraction pipeline:
        (1) Read meta theme-color and manifest theme_color
        (2) Render page with Playwright and read CSS custom properties
        (3) Sample computed colors of buttons, links, headings, nav, CTA elements
        (4) Extract logo colors with ColorThief and filter neutrals
        (5) Cluster similar colors, rank by weight, separate brand vs neutrals
        (6) Fall back to Gemini vision on screenshot if result is weak
        """
        logger.info(f"Starting layered brand color extraction for {self.url}")

        playwright_success = False

        # Try Playwright-driven extraction first (covers Layers 1, 2, 3, screenshot & logo)
        try:
            playwright_success = await self._run_playwright_extraction()
        except Exception as e:
            logger.warning(f"Playwright extraction encountered error: {e}. Falling back to HTTP.")

        # If Playwright failed, timed out, or missed meta tags, run HTTP fallback
        if not playwright_success:
            await self._run_static_extraction()

        # Layer 4: Extract and filter logo colors
        await self._extract_logo_colors()

        # Layer 5: Cluster and rank colors
        result = self._cluster_and_rank_palette()

        # Layer 6: Gemini Vision Fallback if result is weak
        is_weak = (
            not result.get("primary") or
            result.get("primary", {}).get("confidence", 0) < 0.55 or
            len(result.get("brand_colors", [])) < 1
        )

        if is_weak and self.screenshot_bytes:
            logger.info("Color extraction result was weak; falling back to Gemini Vision.")
            gemini_result = await self._run_gemini_vision_fallback()
            if gemini_result:
                result = gemini_result

        return result

    # ─── (1) & (2) & (3) Playwright Browser Extraction ───────────────────────

    async def _run_playwright_extraction(self) -> bool:
        """Run headless Playwright browser to capture rendered DOM, CSS vars, and computed colors."""
        from playwright.async_api import async_playwright

        async with async_playwright() as p:
            browser = None
            try:
                browser = await p.chromium.launch(
                    headless=True,
                    args=[
                        "--no-sandbox",
                        "--disable-setuid-sandbox",
                        "--disable-dev-shm-usage",
                        "--disable-gpu",
                    ]
                )
                context = await browser.new_context(
                    viewport={"width": 1280, "height": 800},
                    user_agent=(
                        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                        "AppleWebKit/537.36 (KHTML, like Gecko) "
                        "Chrome/124.0.0.0 Safari/537.36"
                    )
                )
                page = await context.new_page()

                # Navigate with graceful timeout
                try:
                    await page.goto(self.url, wait_until="networkidle", timeout=12000)
                except Exception:
                    try:
                        await page.goto(self.url, wait_until="domcontentloaded", timeout=7000)
                        await page.wait_for_timeout(1500)
                    except Exception as e:
                        logger.warning(f"Playwright page navigation failed: {e}")
                        return False

                # Layer 1 in Playwright: Meta & Manifest
                meta_colors = await page.evaluate("""() => {
                    const canvas = document.createElement('canvas');
                    canvas.width = 1;
                    canvas.height = 1;
                    const ctx = canvas.getContext('2d', { willReadFrequently: true });

                    function toHex(cssColor) {
                        if (!cssColor || cssColor === 'transparent' || cssColor === 'inherit' || cssColor === 'initial') return null;
                        ctx.fillStyle = '#00000000';
                        ctx.clearRect(0, 0, 1, 1);
                        ctx.fillStyle = cssColor;
                        ctx.fillRect(0, 0, 1, 1);
                        const data = ctx.getImageData(0, 0, 1, 1).data;
                        if (data[3] < 20) return null;
                        return '#' + [data[0], data[1], data[2]].map(x => x.toString(16).padStart(2, '0')).join('').toUpperCase();
                    }

                    const colors = [];
                    const metaTheme = document.querySelector('meta[name="theme-color"]');
                    if (metaTheme && metaTheme.content) {
                        const h = toHex(metaTheme.content);
                        if (h) colors.push({ color: h, source: 'meta_theme_color' });
                    }

                    const metaTile = document.querySelector('meta[name="msapplication-TileColor"]');
                    if (metaTile && metaTile.content) {
                        const h = toHex(metaTile.content);
                        if (h) colors.push({ color: h, source: 'meta_tile_color' });
                    }

                    const metaNav = document.querySelector('meta[name="msapplication-navbutton-color"]');
                    if (metaNav && metaNav.content) {
                        const h = toHex(metaNav.content);
                        if (h) colors.push({ color: h, source: 'meta_nav_color' });
                    }

                    return colors;
                }""")
                for item in (meta_colors or []):
                    hex_val = parse_css_color(item.get("color")) or item.get("color")
                    if hex_val:
                        self.candidates.append(ColorCandidate(hex_val, weight=75.0, source=item.get("source", "meta")))

                # Check Web App Manifest link
                manifest_url = await page.evaluate("""() => {
                    const link = document.querySelector('link[rel="manifest"]');
                    return link ? link.href : null;
                }""")
                if manifest_url:
                    await self._fetch_manifest_colors(manifest_url)

                # Layer 2: Read CSS Custom Properties (--primary, --brand, etc.) normalized via canvas
                css_vars = await page.evaluate("""() => {
                    const canvas = document.createElement('canvas');
                    canvas.width = 1;
                    canvas.height = 1;
                    const ctx = canvas.getContext('2d', { willReadFrequently: true });

                    function toHex(cssColor) {
                        if (!cssColor || cssColor === 'transparent' || cssColor === 'inherit' || cssColor === 'initial') return null;
                        ctx.fillStyle = '#00000000';
                        ctx.clearRect(0, 0, 1, 1);
                        ctx.fillStyle = cssColor;
                        ctx.fillRect(0, 0, 1, 1);
                        const data = ctx.getImageData(0, 0, 1, 1).data;
                        if (data[3] < 20) return null;
                        return '#' + [data[0], data[1], data[2]].map(x => x.toString(16).padStart(2, '0')).join('').toUpperCase();
                    }

                    const found = [];
                    const rootStyle = getComputedStyle(document.documentElement);
                    const brandKeywords = [
                        '--primary', '--brand', '--accent', '--color-primary', '--color-brand',
                        '--color-accent', '--primary-color', '--brand-color', '--accent-color',
                        '--theme-primary', '--theme-color', '--main-color', '--brand-primary',
                        '--brand-accent', '--color-btn-primary', '--btn-primary-bg'
                    ];

                    for (const name of brandKeywords) {
                        const val = rootStyle.getPropertyValue(name);
                        if (val && val.trim()) {
                            const hex = toHex(val.trim());
                            if (hex) found.push({ name, value: hex });
                        }
                    }

                    try {
                        for (const sheet of document.styleSheets) {
                            try {
                                const rules = sheet.cssRules || sheet.rules;
                                if (!rules) continue;
                                for (const rule of rules) {
                                    if (rule.style) {
                                        for (let i = 0; i < rule.style.length; i++) {
                                            const prop = rule.style[i];
                                            if (prop.startsWith('--') &&
                                                (prop.includes('primary') || prop.includes('brand') || prop.includes('accent') || prop.includes('theme'))) {
                                                const v = rule.style.getPropertyValue(prop);
                                                if (v && v.trim()) {
                                                    const hex = toHex(v.trim());
                                                    if (hex) found.push({ name: prop, value: hex });
                                                }
                                            }
                                        }
                                    }
                                }
                            } catch (e) {}
                        }
                    } catch (e) {}

                    return found;
                }""")

                for v in (css_vars or []):
                    hex_val = parse_css_color(v.get("value")) or v.get("value")
                    if hex_val:
                        self.candidates.append(ColorCandidate(hex_val, weight=60.0, source=f"css_var({v.get('name')})"))

                # Layer 3: Sample computed colors of buttons, links, headings, badges, text, and borders
                dom_samples = await page.evaluate("""() => {
                    const canvas = document.createElement('canvas');
                    canvas.width = 1;
                    canvas.height = 1;
                    const ctx = canvas.getContext('2d', { willReadFrequently: true });

                    function toHex(cssColor) {
                        if (!cssColor || cssColor === 'transparent' || cssColor === 'inherit' || cssColor === 'initial' || cssColor === 'none') return null;
                        ctx.fillStyle = '#00000000';
                        ctx.clearRect(0, 0, 1, 1);
                        ctx.fillStyle = cssColor;
                        ctx.fillRect(0, 0, 1, 1);
                        const data = ctx.getImageData(0, 0, 1, 1).data;
                        if (data[3] < 20) return null; // transparent
                        return '#' + [data[0], data[1], data[2]].map(x => x.toString(16).padStart(2, '0')).join('').toUpperCase();
                    }

                    const results = [];
                    const selectors = [
                        'button', 'a', '[role="button"]', 'input[type="submit"]',
                        'nav', 'header', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
                        'span', 'p', 'strong', 'em', 'svg',
                        '[class*="btn"]', '[class*="button"]', '[class*="cta"]',
                        '[class*="primary"]', '[class*="accent"]', '[class*="badge"]',
                        '[class*="tag"]', '[class*="pill"]', '[class*="chip"]',
                        '[class*="text-"]', '[class*="bg-"]', '[class*="border-"]'
                    ];

                    const elements = document.querySelectorAll(selectors.join(','));
                    const vh = window.innerHeight || 800;

                    for (const el of elements) {
                        const rect = el.getBoundingClientRect();
                        if (rect.width < 4 || rect.height < 4) continue;

                        const style = window.getComputedStyle(el);
                        if (style.display === 'none' || style.visibility === 'hidden' || parseFloat(style.opacity) < 0.2) continue;

                        const bg = toHex(style.backgroundColor);
                        const col = toHex(style.color);
                        const border = toHex(style.borderColor);

                        // If all are transparent or missing, skip
                        if (!bg && !col && !border) continue;

                        const className = (el.className || '').toString();
                        const isCta = /btn|button|cta|submit|primary/i.test(className + ' ' + (el.getAttribute('role') || '') + ' ' + el.tagName);
                        const isHeading = /^H[1-6]$/i.test(el.tagName);
                        const isNav = /nav|header/i.test(el.tagName + ' ' + className);
                        const isBadge = /badge|tag|pill|chip|highlight/i.test(className);
                        const inViewport = (rect.top >= 0 && rect.top <= vh);

                        const area = Math.min(rect.width * rect.height, 80000);
                        let w = Math.sqrt(area);

                        if (isCta) w *= 3.5;
                        else if (isBadge) w *= 2.5;
                        else if (isHeading) w *= 2.0;
                        else if (isNav) w *= 1.4;
                        if (inViewport) w *= 1.3;

                        results.push({
                            bg,
                            col,
                            border,
                            weight: w,
                            isCta,
                            tag: el.tagName.toLowerCase()
                        });
                    }
                    return results.slice(0, 300);
                }""")

                for s in (dom_samples or []):
                    w = float(s.get("weight", 10.0))
                    # Background color
                    bg_hex = s.get("bg")
                    if bg_hex:
                        tag_desc = "cta_button" if s.get("isCta") else s.get("tag", "element")
                        self.candidates.append(ColorCandidate(bg_hex, weight=w * (2.0 if s.get("isCta") else 1.0), source=f"dom_bg({tag_desc})"))

                    # Text color
                    col_hex = s.get("col")
                    if col_hex:
                        self.candidates.append(ColorCandidate(col_hex, weight=w * 1.0, source=f"dom_text({s.get('tag')})"))

                    # Border color
                    border_hex = s.get("border")
                    if border_hex and not is_neutral(border_hex):
                        self.candidates.append(ColorCandidate(border_hex, weight=w * 1.2, source=f"dom_border({s.get('tag')})"))

                # Capture logo URL and Page Screenshot for Layer 6 fallback
                self.logo_url = await page.evaluate("""() => {
                    const og = document.querySelector('meta[property="og:image"]');
                    if (og && og.content) return og.content;

                    const logoImgs = document.querySelectorAll('img[src*="logo" i], img[alt*="logo" i], img[class*="logo" i]');
                    for (const img of logoImgs) {
                        if (img.src) return img.src;
                    }
                    return null;
                }""")

                # Capture viewport screenshot for Gemini vision fallback
                try:
                    self.screenshot_bytes = await page.screenshot(type="png", full_page=False)
                except Exception as e:
                    logger.debug(f"Could not capture screenshot: {e}")

                return True
            finally:
                if browser:
                    await browser.close()

    # ─── Static HTTP Fallback for Layers 1, 2, 3 ────────────────────────────

    async def _run_static_extraction(self):
        """Fallback to HTTPX request + BeautifulSoup when Playwright is unavailable or fails."""
        try:
            async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
                headers = {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36"
                }
                res = await client.get(self.url, headers=headers)
                if res.status_code >= 400:
                    return

                html = res.text
                soup = BeautifulSoup(html, "html.parser")

                # Meta tags
                meta_theme = soup.find("meta", attrs={"name": "theme-color"})
                if meta_theme and meta_theme.get("content"):
                    hex_val = parse_css_color(meta_theme["content"])
                    if hex_val:
                        self.candidates.append(ColorCandidate(hex_val, weight=65.0, source="meta_theme_color"))

                meta_tile = soup.find("meta", attrs={"name": "msapplication-TileColor"})
                if meta_tile and meta_tile.get("content"):
                    hex_val = parse_css_color(meta_tile["content"])
                    if hex_val:
                        self.candidates.append(ColorCandidate(hex_val, weight=50.0, source="meta_tile_color"))

                # Manifest
                manifest_link = soup.find("link", attrs={"rel": "manifest"})
                if manifest_link and manifest_link.get("href"):
                    full_manifest = urljoin(self.url, manifest_link["href"])
                    await self._fetch_manifest_colors(full_manifest)

                # Fetch external linked stylesheets to capture CSS variables and brand rules
                combined_css = html
                try:
                    stylesheet_links = soup.find_all("link", rel=lambda r: r and "stylesheet" in r)
                    css_urls = [urljoin(self.url, l.get("href")) for l in stylesheet_links if l.get("href")][:4]
                    for css_u in css_urls:
                        try:
                            css_res = await client.get(css_u, timeout=5.0)
                            if css_res.status_code == 200:
                                combined_css += "\n" + css_res.text
                        except Exception:
                            pass
                except Exception:
                    pass

                # Regex search for CSS variables in inline styles and stylesheets
                var_matches = re.findall(r"--(?:primary|brand|accent)[a-zA-Z0-9_-]*\s*:\s*(#[0-9a-fA-F]{3,6}|rgba?\([^)]+\))", combined_css)
                for val in var_matches:
                    hex_val = parse_css_color(val)
                    if hex_val:
                        self.candidates.append(ColorCandidate(hex_val, weight=45.0, source="html_css_var"))

                # General HTML / CSS hex color parsing for fallback resilience
                hex_matches = re.findall(r"#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b", combined_css)
                for color in hex_matches:
                    hex_val = parse_css_color(color)
                    if hex_val:
                        # Give non-neutral brand colors higher weight
                        w = 20.0 if not is_neutral(hex_val) else 5.0
                        self.candidates.append(ColorCandidate(hex_val, weight=w, source="css_static"))

                # Logo detection
                if not self.logo_url:
                    og_img = soup.find("meta", property="og:image")
                    if og_img and og_img.get("content"):
                        self.logo_url = urljoin(self.url, og_img["content"])
                    else:
                        for img in soup.find_all("img", src=True):
                            src = img["src"].lower()
                            alt = img.get("alt", "").lower()
                            if "logo" in src or "logo" in alt:
                                self.logo_url = urljoin(self.url, img["src"])
                                break
        except Exception as e:
            logger.warning(f"Static extraction failed: {e}")

    async def _fetch_manifest_colors(self, manifest_url: str):
        """Fetch webmanifest and parse theme_color & background_color."""
        try:
            async with httpx.AsyncClient(timeout=5.0, follow_redirects=True) as client:
                res = await client.get(manifest_url)
                if res.status_code == 200:
                    data = res.json()
                    theme_color = data.get("theme_color")
                    if theme_color:
                        hex_val = parse_css_color(theme_color)
                        if hex_val:
                            self.candidates.append(ColorCandidate(hex_val, weight=65.0, source="manifest_theme_color"))

                    bg_color = data.get("background_color")
                    if bg_color:
                        hex_val = parse_css_color(bg_color)
                        if hex_val:
                            self.candidates.append(ColorCandidate(hex_val, weight=30.0, source="manifest_bg_color"))
        except Exception as e:
            logger.debug(f"Could not load manifest {manifest_url}: {e}")

    # ─── (4) Logo Color Extraction with ColorThief ──────────────────────────

    async def _extract_logo_colors(self):
        """Extract dominant logo colors using ColorThief, filtering near-white, near-black, and greys."""
        if not self.logo_url:
            return

        full_logo_url = urljoin(self.url, self.logo_url)
        try:
            async with httpx.AsyncClient(timeout=8.0, follow_redirects=True) as client:
                res = await client.get(full_logo_url)
                if res.status_code != 200 or not res.content:
                    return

                # If SVG logo, extract fill & stroke colors directly from XML text
                if full_logo_url.lower().endswith(".svg") or "svg" in full_logo_url.lower() or b"<svg" in res.content[:200]:
                    svg_text = res.text
                    svg_hexes = re.findall(r"#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b", svg_text)
                    for hx in svg_hexes:
                        hx_norm = parse_css_color(hx)
                        if hx_norm:
                            if is_neutral(hx_norm):
                                self.candidates.append(ColorCandidate(hx_norm, weight=15.0, source="logo_svg_neutral"))
                            else:
                                self.candidates.append(ColorCandidate(hx_norm, weight=60.0, source="logo_svg_brand"))
                    return

                image_bytes = res.content
                from colorthief import ColorThief
                import io

                color_thief = ColorThief(io.BytesIO(image_bytes))
                palette = color_thief.get_palette(color_count=8, quality=5)

                for r, g, b in palette:
                    hex_code = rgb_to_hex(r, g, b)
                    # Filter out near-white, near-black, and desaturated grey
                    if is_neutral(hex_code):
                        # Save neutrals with smaller weight
                        self.candidates.append(ColorCandidate(hex_code, weight=15.0, source="logo_neutral"))
                    else:
                        # Vibrant logo brand colors get high weight
                        self.candidates.append(ColorCandidate(hex_code, weight=55.0, source="logo_colorthief"))
        except Exception as e:
            logger.debug(f"ColorThief logo color extraction skipped: {e}")

    # ─── (5) Color Clustering, Ranking & Separation ─────────────────────────

    def _cluster_and_rank_palette(self) -> Dict[str, Any]:
        """Cluster candidates by color distance, sum weights, rank, and separate into primary/secondary/accent/neutrals."""
        if not self.candidates:
            # Fallback neutral palette if site is completely unreachable
            return {
                "primary": {"hex": "#2563EB", "confidence": 0.35, "source": "universal_fallback"},
                "secondary": {"hex": "#64748B", "confidence": 0.35, "source": "universal_fallback"},
                "accent": {"hex": "#38BDF8", "confidence": 0.35, "source": "universal_fallback"},
                "neutrals": [
                    {"hex": "#0F172A", "confidence": 0.35, "source": "default_dark"},
                    {"hex": "#F8FAFC", "confidence": 0.35, "source": "default_light"}
                ],
                "colors": ["#2563EB", "#64748B", "#38BDF8", "#0F172A", "#F8FAFC"],
                "brand_colors": ["#2563EB"],
                "extraction_method": "universal_fallback"
            }

        # Cluster similar colors (distance threshold <= 36.0)
        clusters: List[Dict[str, Any]] = []

        for cand in self.candidates:
            matched_cluster = None
            for c in clusters:
                if color_distance(cand.hex_code, c["hex"]) <= 36.0:
                    matched_cluster = c
                    break

            if matched_cluster:
                matched_cluster["weight"] += cand.weight
                matched_cluster["sources"].add(cand.source)
                # If this candidate is more saturated than current centroid, adopt it
                h1, l1, s1 = get_hsl(cand.hex_code)
                h2, l2, s2 = get_hsl(matched_cluster["hex"])
                if s1 > s2 and not is_neutral(cand.hex_code):
                    matched_cluster["hex"] = cand.hex_code
            else:
                clusters.append({
                    "hex": cand.hex_code,
                    "weight": cand.weight,
                    "sources": {cand.source}
                })

        total_weight = sum(c["weight"] for c in clusters) or 1.0

        # Separate into brand colors (chromatic) and neutrals
        brand_clusters: List[Dict[str, Any]] = []
        neutral_clusters: List[Dict[str, Any]] = []

        for c in clusters:
            h, l, s = get_hsl(c["hex"])
            # Calculate confidence score
            source_count = len(c["sources"])
            has_explicit_meta = any("meta" in s or "manifest" in s or "css_var" in s for s in c["sources"])
            
            # Confidence formula (0.40 - 0.98)
            conf = min(0.98, max(0.40, (c["weight"] / total_weight) * 0.45 + (source_count * 0.15) + (0.25 if has_explicit_meta else 0.0)))
            c["confidence"] = round(conf, 2)
            c["source_list"] = list(c["sources"])

            if is_neutral(c["hex"]):
                neutral_clusters.append(c)
            else:
                brand_clusters.append(c)

        # Sort brand clusters by vibrancy and weight
        def brand_cluster_score(c):
            h, l, s = get_hsl(c["hex"])
            vibrancy = (s ** 0.5) * (1.0 - abs(l - 0.5) * 0.7)
            sources_str = " ".join(c.get("sources", []))
            boost = 1.0
            if "logo" in sources_str or "css_var" in sources_str or "button" in sources_str:
                boost = 1.25
            return c["weight"] * vibrancy * boost

        brand_clusters.sort(key=brand_cluster_score, reverse=True)
        neutral_clusters.sort(key=lambda x: x["weight"], reverse=True)

        # Determine Primary, Secondary, and Accent
        primary = None
        secondary = None
        accent = None

        if brand_clusters:
            primary = {
                "hex": brand_clusters[0]["hex"],
                "confidence": brand_clusters[0]["confidence"],
                "source": ", ".join(brand_clusters[0]["source_list"][:2])
            }

            # Find secondary (distinct from primary by distance >= 40)
            for c in brand_clusters[1:]:
                if color_distance(c["hex"], primary["hex"]) >= 40.0:
                    secondary = {
                        "hex": c["hex"],
                        "confidence": c["confidence"],
                        "source": ", ".join(c["source_list"][:2])
                    }
                    break

            # Find accent (vibrant, high saturation color distinct from primary and secondary)
            for c in brand_clusters[1:]:
                if c["hex"] != primary["hex"] and (not secondary or c["hex"] != secondary["hex"]):
                    h, l, s = get_hsl(c["hex"])
                    if s >= 0.25:  # Vibrant
                        accent = {
                            "hex": c["hex"],
                            "confidence": c["confidence"],
                            "source": ", ".join(c["source_list"][:2])
                        }
                        break

            # Fallbacks if distinct secondary/accent not found in brand clusters
            if not secondary:
                if len(brand_clusters) > 1:
                    secondary = {
                        "hex": brand_clusters[1]["hex"],
                        "confidence": brand_clusters[1]["confidence"],
                        "source": ", ".join(brand_clusters[1]["source_list"][:2])
                    }
                elif neutral_clusters:
                    secondary = {
                        "hex": neutral_clusters[0]["hex"],
                        "confidence": neutral_clusters[0]["confidence"],
                        "source": ", ".join(neutral_clusters[0]["source_list"][:2])
                    }
                else:
                    # Derive harmonious analogous companion from the user's primary color
                    h, l, s = get_hsl(primary["hex"])
                    r, g, b = colorsys.hls_to_rgb((h + 0.08) % 1.0, max(0.25, min(0.75, l)), max(0.40, s))
                    derived_hex = rgb_to_hex(int(r * 255), int(g * 255), int(b * 255))
                    secondary = {"hex": derived_hex, "confidence": 0.60, "source": "analogous_derived"}

            if not accent:
                if len(neutral_clusters) > 1 and neutral_clusters[1]["hex"] != secondary.get("hex"):
                    accent = {
                        "hex": neutral_clusters[1]["hex"],
                        "confidence": neutral_clusters[1]["confidence"],
                        "source": ", ".join(neutral_clusters[1]["source_list"][:2])
                    }
                elif len(neutral_clusters) > 0 and neutral_clusters[0]["hex"] != secondary.get("hex"):
                    accent = {
                        "hex": neutral_clusters[0]["hex"],
                        "confidence": neutral_clusters[0]["confidence"],
                        "source": ", ".join(neutral_clusters[0]["source_list"][:2])
                    }
                else:
                    # Derive vibrant accent or complement from user's primary color
                    h, l, s = get_hsl(primary["hex"])
                    r, g, b = colorsys.hls_to_rgb((h + 0.50) % 1.0, max(0.35, min(0.70, l)), max(0.60, s))
                    derived_accent = rgb_to_hex(int(r * 255), int(g * 255), int(b * 255))
                    accent = {"hex": derived_accent, "confidence": 0.65, "source": "complement_derived"}

        else:
            # All detected colors were neutral (e.g. minimalist black/white/grey website)
            primary_neutral = neutral_clusters[0] if neutral_clusters else {"hex": "#09090B", "confidence": 0.60, "source_list": ["monochrome"]}
            primary = {
                "hex": primary_neutral["hex"],
                "confidence": primary_neutral["confidence"],
                "source": ", ".join(primary_neutral.get("source_list", ["monochrome"])[:2])
            }
            # Opposite contrast neutral
            opp_neutral = None
            for n in neutral_clusters[1:]:
                if color_distance(n["hex"], primary["hex"]) >= 60.0:
                    opp_neutral = n
                    break
            secondary_hex = opp_neutral["hex"] if opp_neutral else ("#FFFFFF" if primary["hex"] in ("#000000", "#09090B") else "#09090B")
            secondary = {"hex": secondary_hex, "confidence": 0.60, "source": "monochrome_contrast"}

            # Midtone accent
            accent_hex = "#71717A" if primary["hex"] in ("#000000", "#09090B") else "#52525B"
            accent = {"hex": accent_hex, "confidence": 0.60, "source": "monochrome_slate"}

        neutrals_out = [
            {"hex": c["hex"], "confidence": c["confidence"], "source": ", ".join(c["source_list"][:2])}
            for c in neutral_clusters[:4]
        ]

        # Consolidate overall colors array: prioritize genuine brand clusters first
        palette_colors: List[str] = [primary["hex"]]
        if secondary and secondary["hex"] not in palette_colors:
            palette_colors.append(secondary["hex"])
        if accent and accent["hex"] not in palette_colors:
            palette_colors.append(accent["hex"])
        # Add any other distinct brand colors before adding neutrals
        for bc in brand_clusters:
            if bc["hex"] not in palette_colors and len(palette_colors) < 5:
                palette_colors.append(bc["hex"])
        # Only add neutrals if palette still has room (< 4 colors)
        if len(palette_colors) < 4:
            for n in neutrals_out:
                if n["hex"] not in palette_colors and len(palette_colors) < 5:
                    palette_colors.append(n["hex"])

        return {
            "primary": primary,
            "secondary": secondary,
            "accent": accent,
            "neutrals": neutrals_out,
            "colors": palette_colors[:6],
            "brand_colors": [c["hex"] for c in brand_clusters[:5]],
            "extraction_method": "layered_dom_css_colorthief"
        }

    # ─── (6) Gemini Vision Fallback on Page Screenshot ──────────────────────

    async def _run_gemini_vision_fallback(self) -> Optional[Dict[str, Any]]:
        """Call Gemini Vision model to analyze the website screenshot when heuristic extraction is weak."""
        if not self.screenshot_bytes:
            return None

        try:
            from services.gemini import get_client
            from google.genai import types

            client = get_client()
            if not client:
                logger.warning("Gemini client unavailable for screenshot vision fallback")
                return None

            prompt = (
                "You are an elite brand designer and UI/UX expert. "
                "Analyze this screenshot of the brand's website and extract its authentic brand color palette.\n"
                "Determine:\n"
                "1. Primary Brand Color (the core identity color used on logos, active navigation, key buttons).\n"
                "2. Secondary Brand Color (supporting accent or brand tone).\n"
                "3. Accent Color (high-visibility CTA button or highlight color).\n"
                "4. Neutrals (background and body text colors).\n\n"
                "Respond ONLY with valid JSON in this exact structure:\n"
                "{\n"
                '  "primary_hex": "#2563EB",\n'
                '  "primary_confidence": 0.95,\n'
                '  "secondary_hex": "#F59E0B",\n'
                '  "secondary_confidence": 0.88,\n'
                '  "accent_hex": "#8B5CF6",\n'
                '  "accent_confidence": 0.82,\n'
                '  "neutral_background": "#09090B",\n'
                '  "neutral_text": "#F4F5F7"\n'
                "}"
            )

            image_part = types.Part.from_bytes(
                data=self.screenshot_bytes,
                mime_type="image/png"
            )

            response = client.models.generate_content(
                model="gemini-2.5-flash",
                contents=[prompt, image_part]
            )

            text = response.text.strip()
            # Clean markdown code blocks
            if text.startswith("```"):
                lines = text.split("\n")
                lines = [l for l in lines if not l.strip().startswith("```")]
                text = "\n".join(lines)

            data = json.loads(text)

            primary_hex = parse_css_color(data.get("primary_hex"))
            if not primary_hex:
                return None
            secondary_hex = parse_css_color(data.get("secondary_hex"))
            accent_hex = parse_css_color(data.get("accent_hex")) or secondary_hex
            neutral_bg = parse_css_color(data.get("neutral_background")) or "#09090B"
            neutral_text = parse_css_color(data.get("neutral_text")) or "#FFFFFF"

            return {
                "primary": {
                    "hex": primary_hex,
                    "confidence": float(data.get("primary_confidence", 0.92)),
                    "source": "gemini_vision_screenshot"
                },
                "secondary": {
                    "hex": secondary_hex,
                    "confidence": float(data.get("secondary_confidence", 0.85)),
                    "source": "gemini_vision_screenshot"
                },
                "accent": {
                    "hex": accent_hex,
                    "confidence": float(data.get("accent_confidence", 0.80)),
                    "source": "gemini_vision_screenshot"
                },
                "neutrals": [
                    {"hex": neutral_bg, "confidence": 0.90, "source": "gemini_vision_background"},
                    {"hex": neutral_text, "confidence": 0.90, "source": "gemini_vision_text"}
                ],
                "colors": [primary_hex, secondary_hex, accent_hex, neutral_bg, neutral_text],
                "brand_colors": [primary_hex, secondary_hex, accent_hex],
                "extraction_method": "gemini_vision"
            }
        except Exception as e:
            logger.error(f"Gemini vision screenshot fallback error: {e}")
            return None

