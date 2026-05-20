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
    """Remove background from logo image using rembg."""
    try:
        from rembg import remove
        output = remove(image_bytes)
        return output
    except ImportError:
        logger.warning("rembg not installed — skipping background removal")
        return None
    except Exception as e:
        logger.error(f"Error removing background: {str(e)}")
        return None


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
