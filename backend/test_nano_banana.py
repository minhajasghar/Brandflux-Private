import sys
import os
import uuid
import time
import asyncio

# Ensure backend root is on sys.path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from database import SessionLocal, engine, Base
from models.models import User, Brand, Usage
from services.nano_banana_generator import (
    NanoBananaGenerator,
    GeminiBillingError,
    nano_banana_generator
)
from services.renderer.html_renderer import html_renderer
from services.storage import storage_service

async def run_async_tests():
    print("=" * 65)
    print("TESTING GOOGLE NANO BANANA 2.1 & PLAYWRIGHT AI BACKGROUNDS")
    print("=" * 65)

    # Ensure all tables (including usage) are created in database
    Base.metadata.create_all(bind=engine)

    db = SessionLocal()
    test_user_id = str(uuid.uuid4())
    test_brand_id = str(uuid.uuid4())

    try:
        # 1. Verify IMAGE_MODEL configuration
        os.environ["IMAGE_MODEL"] = "gemini-nano-banana-2.1"
        generator = NanoBananaGenerator()
        active_model = generator.get_active_model()
        assert active_model == "gemini-nano-banana-2.1", f"Expected gemini-nano-banana-2.1, got {active_model}"
        print(f"[PASS] Model ID configured: '{active_model}' via env var IMAGE_MODEL")

        # Test changing env var dynamically without code edits
        os.environ["IMAGE_MODEL"] = "gemini-nano-banana-2.1-custom"
        assert generator.get_active_model() == "gemini-nano-banana-2.1-custom"
        os.environ["IMAGE_MODEL"] = "gemini-nano-banana-2.1"
        print("[PASS] Dynamic IMAGE_MODEL reconfiguration verified without code edits")

        # 2. Test Paid Gemini API Key Validation & Error Messaging
        # Case A: Missing or empty key
        generator.api_key = ""
        try:
            generator.validate_api_key()
            assert False, "Should have raised GeminiBillingError on empty API key"
        except GeminiBillingError as err:
            err_msg = str(err)
            assert "paid Gemini API key with billing enabled" in err_msg
            assert "gemini-nano-banana-2.1" in err_msg
            print("[PASS] Verified clear billing error message when Gemini API key is missing:")
            print(f"       -> \"{err_msg[:80]}...\"")

        # Case B: Placeholder key
        generator.api_key = "your_gemini_api_key_here"
        try:
            generator.validate_api_key()
            assert False, "Should have raised GeminiBillingError on placeholder key"
        except GeminiBillingError as err:
            assert "billing enabled" in str(err)
            print("[PASS] Verified clear billing error message on placeholder key")

        # 3. Test Aspect Ratios (1:1, 4:5, 9:16)
        r_1_1, dim_1_1 = generator.normalize_aspect_ratio("1:1")
        assert r_1_1 == "1:1" and dim_1_1 == (1080, 1080)

        r_4_5, dim_4_5 = generator.normalize_aspect_ratio("4:5")
        assert r_4_5 == "4:5" and dim_4_5 == (1080, 1350)

        r_9_16, dim_9_16 = generator.normalize_aspect_ratio("9:16")
        assert r_9_16 == "9:16" and dim_9_16 == (1080, 1920)

        # Platform aliases
        assert generator.normalize_aspect_ratio("instagram_post")[0] == "1:1"
        assert generator.normalize_aspect_ratio("linkedin_post")[0] == "4:5"
        assert generator.normalize_aspect_ratio("instagram_story")[0] == "9:16"
        print("[PASS] Verified 1:1, 4:5, and 9:16 aspect ratios and platform mappings")

        # 4. Test Background Prompt Construction
        sample_brand = {
            "business_name": "QuantPulse Analytics",
            "industry": "FinTech SaaS",
            "brand_tone": "Authoritative and cutting-edge",
            "primary_color": "#1558C9",
            "secondary_color": "#D4FF24"
        }
        sample_daily = {
            "answer_1": "Q3 Revenue Breakthroughs and Autonomous Metrics",
            "answer_2": "Special founder milestone announcement",
            "theme": "Revenue Growth"
        }

        prompt_1_1 = generator.build_background_prompt(sample_brand, sample_daily, "1:1")
        assert "FinTech SaaS" in prompt_1_1
        assert "Authoritative and cutting-edge" in prompt_1_1
        assert "#1558C9" in prompt_1_1
        assert "#D4FF24" in prompt_1_1
        assert "Q3 Revenue Breakthroughs" in prompt_1_1
        # Critical negative prompt check: model must NOT render text or logos
        assert "NO text" in prompt_1_1 and "NO typography" in prompt_1_1 and "NO logos" in prompt_1_1
        print("[PASS] Verified background prompt generation with brand kit, daily check-in, and strict negative text constraints")

        # 5. Test Usage Logging & Fallback on Key Error
        # Call generate_background with missing/invalid key to test fallback
        bg_result = await generator.generate_background(
            brand_profile=sample_brand,
            daily_context=sample_daily,
            aspect_ratio="1:1",
            user_id=test_user_id,
            brand_id=test_brand_id,
            db=db
        )

        # Must return None so HTML/CSS template falls back to ambient/solid background
        assert bg_result is None, "Should have returned None to trigger CSS gradient fallback"
        print("[PASS] Verified graceful fallback to CSS gradient/solid background when AI generation is unconfigured")

        # Check usage table entry was created
        usage_record = db.query(Usage).filter(Usage.user_id == test_user_id).order_by(Usage.created_at.desc()).first()
        assert usage_record is not None, "Usage record must be logged to database"
        assert usage_record.model == "gemini-nano-banana-2.1"
        assert usage_record.aspect_ratio == "1:1"
        assert usage_record.status == "fallback"
        assert "billing" in usage_record.error_message.lower() or "gemini api key" in usage_record.error_message.lower()
        print(f"[PASS] Verified usage table entry logged: Model='{usage_record.model}', Status='{usage_record.status}', Cost=${usage_record.cost}")

        # 6. Test Logging Success to Usage Table
        generator._log_usage(
            user_id=test_user_id,
            brand_id=test_brand_id,
            model="gemini-nano-banana-2.1",
            prompt=prompt_1_1,
            aspect_ratio="4:5",
            media_url="https://pub-r2.brandflux.ai/bg_banana_test123.png",
            status="success",
            error_message=None,
            duration_ms=1450,
            db=db
        )

        success_usage = db.query(Usage).filter(
            Usage.user_id == test_user_id,
            Usage.status == "success"
        ).first()
        assert success_usage is not None
        assert success_usage.cost == 0.03
        assert success_usage.credits_used == 1
        assert success_usage.aspect_ratio == "4:5"
        assert success_usage.media_url == "https://pub-r2.brandflux.ai/bg_banana_test123.png"
        print(f"[PASS] Verified successful generation usage logging: Cost=${success_usage.cost:.3f}, Duration={success_usage.duration_ms}ms")

        # 7. Test Playwright HTML Template Rendering with Background Layer & Fallback
        # A: Render with AI background URL
        mock_bg_url = "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=1080&q=80"
        context_with_bg = {
            "brand_name": "QuantPulse",
            "headline": "Scaling FinTech To 100k Users",
            "subtext": "How automated intelligence changes customer acquisition",
            "cta": "Read Report",
            "primary_color": "#1558C9",
            "secondary_color": "#D4FF24",
            "background_image_url": mock_bg_url
        }

        # 1:1 Rendering
        png_1_1 = await html_renderer.render_template(
            template_name="announcement_hero.html",
            context=context_with_bg,
            width=1080,
            height=1080
        )
        assert len(png_1_1) > 20000, f"Expected valid PNG bytes, got {len(png_1_1)}"
        print(f"[PASS] Rendered 1:1 template with AI background layer ({len(png_1_1)} bytes)")

        # 4:5 Rendering
        png_4_5 = await html_renderer.render_template(
            template_name="quote_bold.html",
            context=context_with_bg,
            width=1080,
            height=1350
        )
        assert len(png_4_5) > 20000, f"Expected valid PNG bytes, got {len(png_4_5)}"
        print(f"[PASS] Rendered 4:5 portrait template with AI background layer ({len(png_4_5)} bytes)")

        # 9:16 Rendering
        png_9_16 = await html_renderer.render_template(
            template_name="announcement_hero.html",
            context=context_with_bg,
            width=1080,
            height=1920
        )
        assert len(png_9_16) > 20000, f"Expected valid PNG bytes, got {len(png_9_16)}"
        print(f"[PASS] Rendered 9:16 story template with AI background layer ({len(png_9_16)} bytes)")

        # B: Render with background fallback (background_image_url is None)
        context_fallback = {
            "brand_name": "QuantPulse",
            "headline": "Fallback To Ambient Glow",
            "subtext": "Pure CSS ambient glow and grid pattern render smoothly",
            "cta": "Explore",
            "primary_color": "#1558C9",
            "secondary_color": "#D4FF24",
            "background_image_url": None
        }
        png_fallback = await html_renderer.render_template(
            template_name="checklist_value.html",
            context=context_fallback,
            width=1080,
            height=1080
        )
        assert len(png_fallback) > 20000
        print(f"[PASS] Rendered template with gradient/solid fallback ({len(png_fallback)} bytes)")

        # 8. Test Uploading Generated Image to Storage / R2
        r2_url = storage_service.upload_image(png_1_1, f"test_banana_render_{uuid.uuid4().hex[:8]}.png")
        assert r2_url and (r2_url.startswith("http://") or r2_url.startswith("https://"))
        print(f"[PASS] Saved generated graphic to storage CDN: {r2_url}")

        print("=" * 65)
        print("ALL NANO BANANA 2.1 & PLAYWRIGHT BACKGROUND TESTS PASSED!")
        print("=" * 65)

    finally:
        # Cleanup test usage records
        try:
            db.query(Usage).filter(Usage.user_id == test_user_id).delete(synchronize_session=False)
            db.commit()
            print("[PASS] Cleanup test usage records completed.")
        except Exception as cleanup_err:
            print(f"Cleanup note: {cleanup_err}")
        db.close()
        await html_renderer.close()

if __name__ == "__main__":
    asyncio.run(run_async_tests())
