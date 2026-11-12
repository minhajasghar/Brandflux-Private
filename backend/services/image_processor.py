from PIL import Image
import httpx
import io
import os
import logging
from typing import Dict, Any, List, Optional, Tuple

logger = logging.getLogger(__name__)

# Directory for processed images
PROCESSED_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "processed_images")
os.makedirs(PROCESSED_DIR, exist_ok=True)


async def download_image(url: str) -> Optional[bytes]:
    """Download an image from URL."""
    try:
        async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
            response = await client.get(url)
            response.raise_for_status()
            return response.content
    except Exception as e:
        logger.error(f"Error downloading image from {url}: {str(e)}")
        return None


def extract_colors_from_image(image_bytes: bytes, num_colors: int = 5) -> List[str]:
    """Extract dominant colors from an image using colorthief."""
    try:
        from colorthief import ColorThief
        color_thief = ColorThief(io.BytesIO(image_bytes))
        palette = color_thief.get_palette(color_count=num_colors, quality=5)
        return [f"#{r:02x}{g:02x}{b:02x}" for r, g, b in palette]
    except Exception as e:
        logger.error(f"Error extracting colors: {str(e)}")
        return []


def analyze_logo_style(image_bytes: bytes) -> Dict[str, Any]:
    """Analyze logo image characteristics."""
    try:
        img = Image.open(io.BytesIO(image_bytes))
        width, height = img.size
        mode = img.mode

        # Determine style characteristics
        is_square = abs(width - height) < max(width, height) * 0.1
        is_transparent = mode in ("RGBA", "LA") or "transparency" in img.info
        aspect = "square" if is_square else ("landscape" if width > height else "portrait")

        return {
            "width": width,
            "height": height,
            "aspect": aspect,
            "has_transparency": is_transparent,
            "format": img.format or "unknown",
            "style_guess": "minimal" if is_transparent else "solid_background"
        }
    except Exception as e:
        logger.error(f"Error analyzing logo: {str(e)}")
        return {}


def remove_background(image_bytes: bytes) -> Optional[bytes]:
    """
    Remove background from logo image to produce transparent PNG.
    1. Tries rembg if available with onnxruntime.
    2. Fallback to intelligent PIL corner-chroma flood fill:
       Detects corner background color (black, dark, white, light grey, or solid),
       and makes matching background pixels transparent with smooth edge feathering.
    """
    try:
        from rembg import remove
        output = remove(image_bytes)
        if output:
            return output
    except Exception as e:
        logger.debug(f"rembg not available or failed: {e}; using PIL intelligent background removal")

    try:
        from PIL import Image
        import numpy as np

        img = Image.open(io.BytesIO(image_bytes)).convert("RGBA")
        width, height = img.size
        if width < 2 or height < 2:
            return image_bytes

        # Sample corner pixels (0,0), (w-1, 0), (0, h-1), (w-1, h-1)
        corners = [
            img.getpixel((0, 0)),
            img.getpixel((width - 1, 0)),
            img.getpixel((0, height - 1)),
            img.getpixel((width - 1, height - 1))
        ]

        # Calculate average corner RGB
        avg_r = sum(c[0] for c in corners) / 4.0
        avg_g = sum(c[1] for c in corners) / 4.0
        avg_b = sum(c[2] for c in corners) / 4.0

        diffs = [
            ((c[0] - avg_r)**2 + (c[1] - avg_g)**2 + (c[2] - avg_b)**2)**0.5
            for c in corners
        ]
        is_uniform = max(diffs) < 55.0 or (avg_r < 35 and avg_g < 35 and avg_b < 35) or (avg_r > 225 and avg_g > 225 and avg_b > 225)

        data = np.array(img, dtype=np.uint8)
        r, g, b, a = data[:, :, 0], data[:, :, 1], data[:, :, 2], data[:, :, 3]

        if is_uniform:
            dist = np.sqrt(
                (r.astype(float) - avg_r)**2 +
                (g.astype(float) - avg_g)**2 +
                (b.astype(float) - avg_b)**2
            )
            tolerance = 35.0
            feather = 16.0
            mask = np.clip((dist - tolerance) / max(feather, 1.0), 0.0, 1.0)
            data[:, :, 3] = (a.astype(float) * mask).astype(np.uint8)
        else:
            white_dist = np.sqrt((r.astype(float) - 255)**2 + (g.astype(float) - 255)**2 + (b.astype(float) - 255)**2)
            black_dist = np.sqrt(r.astype(float)**2 + g.astype(float)**2 + b.astype(float)**2)
            if np.mean(white_dist[:5, :]) < 40:
                mask = np.clip((white_dist - 35.0) / 20.0, 0.0, 1.0)
                data[:, :, 3] = (a.astype(float) * mask).astype(np.uint8)
            elif np.mean(black_dist[:5, :]) < 40:
                mask = np.clip((black_dist - 35.0) / 20.0, 0.0, 1.0)
                data[:, :, 3] = (a.astype(float) * mask).astype(np.uint8)

        result_img = Image.fromarray(data, "RGBA")
        out_buf = io.BytesIO()
        result_img.save(out_buf, format="PNG")
        return out_buf.getvalue()
    except Exception as exc:
        logger.error(f"PIL background removal failed: {exc}")
        return image_bytes



async def process_logo(logo_url: str, brand_id: str) -> Dict[str, Any]:
    """
    Full logo processing pipeline:
    1. Download logo
    2. Extract colors
    3. Analyze style
    4. Remove background
    5. Save processed version
    """
    result = {
        "colors": [],
        "logo_style": "",
        "clean_logo_path": None,
        "original_saved": False
    }

    # Download
    image_bytes = await download_image(logo_url)
    if not image_bytes:
        return result

    # Save original
    original_path = os.path.join(PROCESSED_DIR, f"{brand_id}_original.png")
    with open(original_path, "wb") as f:
        f.write(image_bytes)
    result["original_saved"] = True

    # Extract colors
    result["colors"] = extract_colors_from_image(image_bytes)

    # Analyze style
    style_info = analyze_logo_style(image_bytes)
    result["logo_style"] = style_info.get("style_guess", "")
    result["logo_analysis"] = style_info

    # Remove background
    clean_bytes = remove_background(image_bytes)
    if clean_bytes:
        clean_path = os.path.join(PROCESSED_DIR, f"{brand_id}_clean.png")
        with open(clean_path, "wb") as f:
            f.write(clean_bytes)
        result["clean_logo_path"] = clean_path

    return result
