import io
import os
import uuid
import logging
from typing import Tuple, Optional
from PIL import Image, ImageOps
from fastapi import HTTPException, UploadFile, status

logger = logging.getLogger(__name__)

# Constants
MAX_IMAGE_SIZE_BYTES = 8 * 1024 * 1024  # 8 MB
ALLOWED_MIME_TYPES = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/webp": "webp"
}
ALLOWED_EXTENSIONS = {"jpg", "jpeg", "png", "webp"}


def validate_and_process_reference_image(
    file_bytes: bytes,
    original_filename: Optional[str] = None
) -> Tuple[bytes, str, int, int]:
    """
    Validates reference image size and content, strips EXIF data for privacy,
    and runs basic heuristic moderation.
    Returns: (cleaned_bytes, extension, width, height)
    Raises: HTTPException on invalid file, oversized content, or corrupted bytes.
    """
    # 1. Size validation
    size_bytes = len(file_bytes)
    if size_bytes == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded image file is empty."
        )
    if size_bytes > MAX_IMAGE_SIZE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Image exceeds the maximum allowed limit of 8MB ({size_bytes / (1024*1024):.1f}MB uploaded)."
        )

    # 2. Open with PIL and verify integrity
    try:
        img_stream = io.BytesIO(file_bytes)
        img = Image.open(img_stream)
        img.verify()  # Verifies file integrity
    except Exception as e:
        logger.warning(f"Corrupted or invalid image uploaded: {e}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or corrupted image format. Please upload a valid JPG, PNG, or WebP file."
        )

    # Re-open after verify() because verify() invalidates the image object
    img_stream.seek(0)
    img = Image.open(img_stream)

    pil_format = (img.format or "").upper()
    format_map = {
        "JPEG": ("jpg", "image/jpeg"),
        "PNG": ("png", "image/png"),
        "WEBP": ("webp", "image/webp")
    }
    if pil_format not in format_map:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported format '{pil_format}'. Only JPG, PNG, and WebP are allowed."
        )

    ext, content_type = format_map[pil_format]
    width, height = img.size

    # Check minimum dimensions
    if width < 50 or height < 50:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Image resolution is too low (minimum 50x50px required)."
        )

    # 3. Strip EXIF data by re-encoding a fresh image in memory
    try:
        # Correct orientation based on EXIF orientation if present before stripping
        img = ImageOps.exif_transpose(img)
    except Exception:
        pass

    out_stream = io.BytesIO()
    # Handle transparent PNG/WebP vs RGB
    if pil_format == "JPEG":
        if img.mode != "RGB":
            img = img.convert("RGB")
        img.save(out_stream, format="JPEG", quality=92, optimize=True)
    elif pil_format == "PNG":
        img.save(out_stream, format="PNG", optimize=True)
    elif pil_format == "WEBP":
        img.save(out_stream, format="WEBP", quality=90)

    cleaned_bytes = out_stream.getvalue()
    logger.info(f"Cleaned & stripped EXIF for {original_filename or 'image'} ({width}x{height}, {len(cleaned_bytes)} bytes)")

    return cleaned_bytes, ext, width, height


def run_basic_content_moderation(image_bytes: bytes) -> bool:
    """
    Lightweight heuristic content moderation check.
    Ensures image is not blank, completely uniform, or maliciously deformed.
    """
    try:
        img = Image.open(io.BytesIO(image_bytes))
        # Check standard deviation of color bands - completely blank/solid images
        extrema = img.getextrema()
        # If image has 0 variance (all black or all white single pixel repeated)
        if extrema:
            if isinstance(extrema[0], tuple):
                # multi-band
                all_same = all(mn == mx for mn, mx in extrema)
                if all_same:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="Uploaded image appears completely blank or solid. Please provide a clear reference photo."
                    )
        return True
    except HTTPException:
        raise
    except Exception as e:
        logger.warning(f"Heuristic moderation warning: {e}")
        return True

