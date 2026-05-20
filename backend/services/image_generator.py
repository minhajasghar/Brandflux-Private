import os
import io
import uuid
import math
import urllib.parse
import httpx
from PIL import Image, ImageDraw, ImageFont, ImageFilter

# ─── Font helpers ────────────────────────────────────────────────────────────

FONT_CANDIDATES = [
    "C:\\Windows\\Fonts\\segoeuib.ttf",   # Segoe UI Bold  (clean, modern)
    "C:\\Windows\\Fonts\\calibrib.ttf",   # Calibri Bold
    "C:\\Windows\\Fonts\\arialbd.ttf",    # Arial Bold
    "C:\\Windows\\Fonts\\arial.ttf",      # Arial
    "C:\\Windows\\Fonts\\verdanab.ttf",   # Verdana Bold
]
FONT_LIGHT_CANDIDATES = [
    "C:\\Windows\\Fonts\\segoeuil.ttf",
    "C:\\Windows\\Fonts\\calibril.ttf",
    "C:\\Windows\\Fonts\\arial.ttf",
    "C:\\Windows\\Fonts\\verdana.ttf",
]

def _load_font(size: int, bold: bool = True) -> ImageFont.FreeTypeFont:
    candidates = FONT_CANDIDATES if bold else FONT_LIGHT_CANDIDATES
    for path in candidates:
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, size)
            except Exception:
                continue
    return ImageFont.load_default()


# ─── Color helpers ───────────────────────────────────────────────────────────

def _hex_to_rgb(hex_str: str) -> tuple:
    h = str(hex_str).lstrip('#')
    if len(h) == 3:
        h = ''.join(c * 2 for c in h)
    if len(h) != 6:
        return (15, 23, 42)
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16))


def _darken(rgb: tuple, factor: float = 0.4) -> tuple:
    return tuple(int(c * (1 - factor)) for c in rgb)


def _lighten(rgb: tuple, factor: float = 0.4) -> tuple:
    return tuple(min(255, int(c + (255 - c) * factor)) for c in rgb)


def _luminance(rgb: tuple) -> float:
    r, g, b = [x / 255.0 for x in rgb]
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


# ─── Drawing helpers ─────────────────────────────────────────────────────────

def _draw_text_with_shadow(
    draw: ImageDraw.Draw,
    xy: tuple, text: str, font,
    fill=(255, 255, 255),
    shadow_offset: int = 2,
    shadow_alpha: int = 160
):
    """Draw text with a drop-shadow for legibility."""
    sx, sy = xy[0] + shadow_offset, xy[1] + shadow_offset
    draw.text((sx, sy), text, font=font, fill=(0, 0, 0, shadow_alpha))
    draw.text(xy, text, font=font, fill=fill)


def _text_width(draw: ImageDraw.Draw, text: str, font) -> int:
    try:
        bbox = draw.textbbox((0, 0), text, font=font)
        return bbox[2] - bbox[0]
    except Exception:
        try:
            return font.getlength(text)
        except Exception:
            return len(text) * 14


def _wrap_text(draw: ImageDraw.Draw, text: str, font, max_w: int) -> list:
    words = text.split()
    lines, current = [], []
    for word in words:
        test = ' '.join(current + [word])
        if _text_width(draw, test, font) <= max_w:
            current.append(word)
        else:
            if current:
                lines.append(' '.join(current))
            current = [word]
    if current:
        lines.append(' '.join(current))
    return lines


def _draw_rounded_rect(draw: ImageDraw.Draw, xy, radius: int, fill):
    x0, y0, x1, y1 = xy
    draw.rounded_rectangle([x0, y0, x1, y1], radius=radius, fill=fill)


def _vertical_gradient(size: tuple, top_color: tuple, bottom_color: tuple, alpha_top=0, alpha_bottom=220) -> Image.Image:
    """Create a vertical gradient RGBA overlay."""
    w, h = size
    grad = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    for y in range(h):
        t = y / max(h - 1, 1)
        a = int(alpha_top + (alpha_bottom - alpha_top) * t)
        r = int(top_color[0] + (bottom_color[0] - top_color[0]) * t)
        g = int(top_color[1] + (bottom_color[1] - top_color[1]) * t)
        b = int(top_color[2] + (bottom_color[2] - top_color[2]) * t)
        grad.paste((r, g, b, a), (0, y, w, y + 1))
    return grad


# ─── Platform Pollinations prompt builder ────────────────────────────────────

def _build_pollinations_prompt(base_prompt: str, platform: str, brand_profile: dict, style: str) -> str:
    """
    Build a highly detailed, platform-aware Pollinations prompt.
    """
    business_type = brand_profile.get('business_type', 'business')
    tone = (brand_profile.get('brand_tone') or 'professional').lower()

    # Tone → visual descriptor
    tone_visual = {
        'fun': 'vibrant, colorful, energetic, playful lighting, bold colors',
        'professional': 'clean, minimalist, corporate, sharp lighting, sophisticated',
        'inspiring': 'dramatic golden-hour lighting, epic atmosphere, motivational',
        'friendly': 'warm sunlight, inviting, soft bokeh, approachable',
        'luxury': 'dark moody, gold accents, premium materials, high-end',
        'casual': 'candid lifestyle, natural light, relaxed, everyday feel',
    }.get(tone, 'clean, professional, visually striking')

    # Business type → scene context
    biz_visual = {
        'restaurant': 'beautifully plated food, warm restaurant ambiance',
        'cafe / coffee shop': 'steaming coffee, cozy cafe interior, morning light',
        'retail store': 'elegant product display, lifestyle photography',
        'e-commerce': 'product showcase, clean background, lifestyle context',
        'saas / software': 'glowing UI screens, tech workspace, blue light',
        'agency': 'creative studio, collaboration, modern office',
        'fitness / gym': 'athletic motion, gym equipment, motivational energy',
        'healthcare / clinic': 'clean medical setting, trust, care, light tones',
        'real estate': 'luxury interior, architectural photography, golden light',
        'beauty / salon': 'elegant cosmetics, soft pastel tones, clean styling',
        'education / coaching': 'learning environment, books, bright inspiring space',
        'consulting': 'professional meeting, strategy board, city skyline',
    }.get((business_type or '').lower(), 'modern commercial photography, professional')

    # Platform → composition rules
    platform_rule = {
        'instagram_post': 'square composition 1:1, centered subject, high contrast, Instagram-worthy',
        'instagram_story': 'vertical 9:16 full-bleed, immersive, bold visual elements near top third',
        'linkedin': 'wide landscape 1.91:1, professional setting, corporate, clean margins',
        'facebook': 'wide landscape, warm community feel, relatable everyday scene',
    }.get(platform, 'professional social media composition')

    # Style mapping
    style_map = {
        'photography': 'photorealistic, DSLR quality, shallow depth of field, studio lighting',
        'digital art': 'digital illustration, clean vector style, modern graphic design',
        'minimalist': 'minimal composition, lots of negative space, single focal point',
        'illustration': 'artistic illustration, editorial style, creative',
    }.get(style, 'photorealistic, professional photography')

    # Negative prompts
    negatives = "no text, no words, no letters, no watermark, no logo, no UI elements, no borders, not blurry, no distorted faces, no ugly artifacts"

    full_prompt = (
        f"{base_prompt}, {biz_visual}, {tone_visual}, {platform_rule}, "
        f"{style_map}, cinematic composition, rule of thirds, highly detailed, "
        f"8K ultra HD, sharp focus, professional color grading, commercial quality"
    )

    return full_prompt, negatives


# ─── Main ImageGenerator class ───────────────────────────────────────────────

class ImageGenerator:

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
        Generate a high-quality background using Pollinations AI with
        platform-aware, richly detailed prompts.
        """
        try:
            bp = brand_profile or {}
            full_prompt, negatives = _build_pollinations_prompt(prompt, platform, bp, style)

            encoded = urllib.parse.quote(full_prompt)
            neg_encoded = urllib.parse.quote(negatives)

            # Pollinations v2 API with seed for consistency
            import random
            seed = random.randint(10000, 99999)
            url = (
                f"https://image.pollinations.ai/prompt/{encoded}"
                f"?width={width}&height={height}"
                f"&nologo=true&enhance=true&seed={seed}"
                f"&negative={neg_encoded}"
            )

            async with httpx.AsyncClient(timeout=90.0) as client:
                response = await client.get(url)
                if response.status_code == 200 and len(response.content) > 5000:
                    return response.content
                raise Exception(f"Pollinations returned status {response.status_code} or empty image")

        except Exception as e:
            print(f"[ImageGenerator] Background generation failed: {e}")
            raise e

    def create_branded_post(
        self,
        background_bytes: bytes,
        brand_profile: dict,
        post_text: str,
        platform: str,
        cta: str = ""
    ) -> bytes:
        """
        Compose a premium branded social post with:
        - Smooth vertical gradient overlay (not flat block)
        - Large bold headline with drop shadow
        - CTA pill badge
        - Business name tag with accent color pill
        - Thin accent bottom bar
        - Logo top-right
        """
        # ── Open & resize background ─────────────────────────────────────────
        bg = Image.open(io.BytesIO(background_bytes)).convert("RGBA")

        SIZES = {
            'instagram_post':  (1080, 1080),
            'instagram_story': (1080, 1920),
            'linkedin':        (1200, 627),
            'facebook':        (1200, 630),
        }
        size = SIZES.get(platform, (1080, 1080))
        bg = bg.resize(size, Image.Resampling.LANCZOS)
        W, H = size

        # ── Brand colors ─────────────────────────────────────────────────────
        colors = brand_profile.get("colors") or []
        primary_hex = colors[0] if colors else (brand_profile.get("primary_color") or "#1E3A5F")
        secondary_hex = colors[1] if len(colors) > 1 else (brand_profile.get("secondary_color") or "#FFFFFF")

        primary_rgb = _hex_to_rgb(primary_hex)
        secondary_rgb = _hex_to_rgb(secondary_hex)
        dark_primary = _darken(primary_rgb, 0.5)

        # Decide text color from background luminance
        lum = _luminance(primary_rgb)
        text_color = (255, 255, 255) if lum < 0.55 else (20, 20, 20)
        accent_text_color = (255, 255, 255) if _luminance(dark_primary) < 0.55 else (20, 20, 20)

        # ── Smooth gradient overlay (bottom 55%) ─────────────────────────────
        gradient_start_y = int(H * 0.38)
        grad_h = H - gradient_start_y
        grad = _vertical_gradient(
            (W, grad_h),
            top_color=dark_primary,
            bottom_color=dark_primary,
            alpha_top=10,
            alpha_bottom=230,
        )
        grad_canvas = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        grad_canvas.paste(grad, (0, gradient_start_y))
        bg = Image.alpha_composite(bg, grad_canvas)

        draw = ImageDraw.Draw(bg)

        # ── Font sizes tuned per platform ────────────────────────────────────
        if platform == 'instagram_story':
            sz_biz, sz_main, sz_sub, sz_cta = 30, 68, 32, 26
        elif platform in ('linkedin', 'facebook'):
            sz_biz, sz_main, sz_sub, sz_cta = 22, 46, 26, 20
        else:
            # instagram_post (square)
            sz_biz, sz_main, sz_sub, sz_cta = 26, 58, 30, 22

        font_biz  = _load_font(sz_biz, bold=True)
        font_main = _load_font(sz_main, bold=True)
        font_sub  = _load_font(sz_sub,  bold=False)
        font_cta  = _load_font(sz_cta,  bold=True)

        # ── Business name pill (top-left) ────────────────────────────────────
        biz_name = (brand_profile.get("business_name") or "My Brand").upper()
        MARGIN = 28
        pill_pad_x, pill_pad_y = 18, 10
        biz_w = _text_width(draw, biz_name, font_biz)
        pill_x0 = MARGIN
        pill_y0 = MARGIN
        pill_x1 = MARGIN + biz_w + pill_pad_x * 2
        pill_y1 = MARGIN + sz_biz + pill_pad_y * 2

        # semi-transparent white pill background
        pill_bg = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        pill_draw = ImageDraw.Draw(pill_bg)
        pill_draw.rounded_rectangle(
            [pill_x0, pill_y0, pill_x1, pill_y1],
            radius=12,
            fill=(*primary_rgb, 200)
        )
        bg = Image.alpha_composite(bg, pill_bg)
        draw = ImageDraw.Draw(bg)
        _draw_text_with_shadow(
            draw, (pill_x0 + pill_pad_x, pill_y0 + pill_pad_y),
            biz_name, font_biz,
            fill=(*text_color, 255), shadow_offset=1
        )

        # ── Logo (top-right) ─────────────────────────────────────────────────
        logo_url = brand_profile.get("logo_url")
        if logo_url:
            try:
                with httpx.Client(timeout=10.0) as client:
                    logo_res = client.get(logo_url)
                    if logo_res.status_code == 200:
                        logo_img = Image.open(io.BytesIO(logo_res.content)).convert("RGBA")
                        max_dim = 100 if platform != 'instagram_story' else 120
                        logo_img.thumbnail((max_dim, max_dim), Image.Resampling.LANCZOS)
                        lw, lh = logo_img.size
                        pos_x = W - lw - MARGIN
                        pos_y = MARGIN
                        logo_canvas = Image.new("RGBA", (W, H), (0, 0, 0, 0))
                        logo_canvas.paste(logo_img, (pos_x, pos_y), logo_img)
                        bg = Image.alpha_composite(bg, logo_canvas)
                        draw = ImageDraw.Draw(bg)
            except Exception as e:
                print(f"[Logo] Error: {e}")

        # ── Main headline text (centered, bottom area) ───────────────────────
        max_text_w = W - MARGIN * 4
        lines = _wrap_text(draw, post_text, font_main, max_text_w)[:3]

        # Calculate total text block height
        line_h = sz_main + 10
        total_text_h = len(lines) * line_h

        # Position: for story put near bottom; for square/landscape center-bottom
        if platform == 'instagram_story':
            text_y = H - total_text_h - 160
        else:
            text_y = int(H * 0.58)

        for line in lines:
            lw = _text_width(draw, line, font_main)
            x = (W - lw) / 2
            _draw_text_with_shadow(
                draw, (x, text_y), line, font_main,
                fill=(255, 255, 255, 255), shadow_offset=3
            )
            text_y += line_h

        # ── CTA pill button ───────────────────────────────────────────────────
        if cta:
            cta_text = cta.strip()[:50]
            cta_w = _text_width(draw, cta_text, font_cta)
            cta_pad_x, cta_pad_y = 24, 12
            cta_total_w = cta_w + cta_pad_x * 2
            cta_total_h = sz_cta + cta_pad_y * 2

            if platform == 'instagram_story':
                cta_y0 = H - cta_total_h - 60
            else:
                cta_y0 = H - cta_total_h - 36

            cta_x0 = (W - cta_total_w) // 2

            # Draw pill with white background & primary color text
            cta_canvas = Image.new("RGBA", (W, H), (0, 0, 0, 0))
            cta_draw = ImageDraw.Draw(cta_canvas)
            cta_draw.rounded_rectangle(
                [cta_x0, cta_y0, cta_x0 + cta_total_w, cta_y0 + cta_total_h],
                radius=cta_total_h // 2,
                fill=(255, 255, 255, 240)
            )
            bg = Image.alpha_composite(bg, cta_canvas)
            draw = ImageDraw.Draw(bg)

            # CTA text in primary color
            draw.text(
                (cta_x0 + cta_pad_x, cta_y0 + cta_pad_y),
                cta_text,
                font=font_cta,
                fill=(*primary_rgb, 255)
            )

        # ── Accent bottom bar (4px gradient strip) ───────────────────────────
        bar_h = 6
        bar_canvas = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        bar_draw = ImageDraw.Draw(bar_canvas)
        # Draw a gradient bar using segments
        seg = max(1, W // 6)
        for i in range(6):
            t = i / 5
            r = int(primary_rgb[0] + (secondary_rgb[0] - primary_rgb[0]) * t)
            g = int(primary_rgb[1] + (secondary_rgb[1] - primary_rgb[1]) * t)
            b = int(primary_rgb[2] + (secondary_rgb[2] - primary_rgb[2]) * t)
            bar_draw.rectangle(
                [i * seg, H - bar_h, min((i + 1) * seg, W), H],
                fill=(r, g, b, 255)
            )
        bg = Image.alpha_composite(bg, bar_canvas)

        # ── Output ────────────────────────────────────────────────────────────
        out = io.BytesIO()
        bg.convert("RGB").save(out, format='PNG', quality=95)
        return out.getvalue()

    async def generate_all_platform_sizes(
        self,
        prompt: str,
        brand_profile: dict,
        post_text: str,
        cta: str = "",
        style: str = "photography"
    ) -> dict:
        """Generate all four social media platform sizes."""
        sizes_config = [
            ('instagram_post',  1080, 1080),
            ('instagram_story', 1080, 1920),
            ('linkedin',        1200, 627),
            ('facebook',        1200, 630),
        ]

        results = {}
        for platform, w, h in sizes_config:
            try:
                bg_bytes = await self.generate_background(
                    prompt, style=style, width=w, height=h,
                    platform=platform, brand_profile=brand_profile
                )
            except Exception as e:
                print(f"[ImageGenerator] Background failed for {platform}: {e}, using solid color fallback")
                primary_rgb = _hex_to_rgb(
                    (brand_profile.get("colors") or [None])[0]
                    or brand_profile.get("primary_color")
                    or "#1E3A5F"
                )
                solid = Image.new("RGBA", (w, h), (*primary_rgb, 255))
                buf = io.BytesIO()
                solid.save(buf, format='PNG')
                bg_bytes = buf.getvalue()

            final_bytes = self.create_branded_post(bg_bytes, brand_profile, post_text, platform, cta)

            filename = f"post_{platform}_{uuid.uuid4().hex[:10]}.png"
            tmp_dir = "c:/dev2/brandai/backend/processed_images"
            os.makedirs(tmp_dir, exist_ok=True)
            tmp_path = os.path.join(tmp_dir, filename)
            with open(tmp_path, "wb") as f:
                f.write(final_bytes)

            # Upload to Supabase if configured
            import os as _os
            supabase_url = _os.getenv("SUPABASE_URL")
            supabase_key = _os.getenv("SUPABASE_KEY")
            public_url = f"http://localhost:8000/static/{filename}"

            if supabase_url and supabase_key:
                try:
                    headers = {
                        "Authorization": f"Bearer {supabase_key}",
                        "apikey": supabase_key
                    }
                    upload_url = f"{supabase_url}/storage/v1/object/posts/{filename}"
                    async with httpx.AsyncClient() as client:
                        up_res = await client.post(
                            upload_url, headers=headers,
                            files={"file": (filename, final_bytes, "image/png")}
                        )
                        if up_res.status_code == 200:
                            public_url = f"{supabase_url}/storage/v1/object/public/posts/{filename}"
                except Exception as e:
                    print(f"[Supabase] Upload failed for {platform}: {e}")

            results[platform] = public_url

        return results
