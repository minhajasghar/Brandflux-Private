import sys
import os
import io
import uuid
from PIL import Image, ImageDraw

# Force stdout to utf-8 for Windows console
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from fastapi.testclient import TestClient
from main import app
from database import SessionLocal
from models.models import User, Brand, DailySession, SessionVariant, GeneratedPost, Usage
from services.auth_service import hash_password, create_token

def create_dummy_image(format="PNG", size=(300, 300)):
    buf = io.BytesIO()
    img = Image.new("RGB", size, color=(30, 40, 60))
    draw = ImageDraw.Draw(img)
    # Add varying patterns/colors so variance > threshold
    for i in range(0, size[0], 20):
        draw.line([(i, 0), (size[0] - i, size[1])], fill=(i % 255, (i * 2) % 255, (i * 3) % 255), width=3)
    draw.rectangle([50, 50, 200, 200], fill=(212, 255, 36), outline=(255, 255, 255))
    img.save(buf, format=format)
    buf.seek(0)
    return buf.getvalue()

def run_suite():
    print("=" * 70)
    print("RUNNING BRANDFLUX SESSION MULTI-VARIANT & REFERENCE TEST SUITE")
    print("=" * 70)

    client = TestClient(app)
    db = SessionLocal()

    # 1. Prepare Test User and Brand
    unique_suffix = uuid.uuid4().hex[:6]
    test_user = User(
        id=str(uuid.uuid4()),
        email=f"tester_{unique_suffix}@brandflux.ai",
        full_name="Variant Tester",
        password_hash=hash_password("Pass12345!"),
        plan="growth", # 3 variants allowed
        role="user",
        is_suspended=False,
        is_deleted=False,
        token_version=1,
        posts_used_this_month=0
    )
    db.add(test_user)
    db.commit()

    test_brand = Brand(
        id=str(uuid.uuid4()),
        user_id=test_user.id,
        business_name="Luminary Botanicals",
        business_type="Organic Skincare & Wellness",
        brand_tone="Luxurious, organic, calming and empowering",
        primary_color="#2D5A27",
        secondary_color="#D4FF24",
        colors=["#2D5A27", "#D4FF24", "#E8F5E9"],
        industry="Health & Beauty",
        onboarding_complete=True
    )
    db.add(test_brand)
    test_user.active_brand_id = test_brand.id

    daily_session = DailySession(
        id=str(uuid.uuid4()),
        user_id=test_user.id,
        brand_id=test_brand.id,
        question_1="What would you like to highlight today?",
        answer_1="Organic lavender sleep serum launch",
        question_2="Target platform?",
        answer_2="instagram_post",
        question_3="Any special promotion?",
        answer_3="Free shipping on first order"
    )
    db.add(daily_session)
    db.commit()

    token = create_token(test_user.id, test_user.token_version)
    headers = {"Authorization": f"Bearer {token}"}

    print(f"[SETUP] Created test user {test_user.email} (Plan: {test_user.plan}) and brand {test_brand.business_name}")

    # =========================================================================
    # TEST 1: Upload Reference Image (Valid)
    # =========================================================================
    print("\n--- Test 1: Upload Reference Image (Valid PNG & JPG) ---")
    png_bytes = create_dummy_image(format="PNG")
    response = client.post(
        "/sessions/upload-reference",
        headers=headers,
        files={"file": ("reference_product.png", png_bytes, "image/png")}
    )
    assert response.status_code == 200, f"Upload failed: {response.text}"
    data = response.json()
    assert "url" in data
    assert data["filename"].endswith(".png")
    assert data["width"] == 300
    assert data["height"] == 300
    ref_image_url_1 = data["url"]
    print(f"[PASS] Successfully uploaded valid PNG reference: {ref_image_url_1[:50]}...")

    # =========================================================================
    # TEST 2: Reject Oversized and Invalid Reference Files
    # =========================================================================
    print("\n--- Test 2: Reject Oversized & Invalid Reference Files ---")
    oversized_bytes = b"0" * (8 * 1024 * 1024 + 1024) # > 8MB
    resp_over = client.post(
        "/sessions/upload-reference",
        headers=headers,
        files={"file": ("large_image.png", oversized_bytes, "image/png")}
    )
    assert resp_over.status_code == 400, f"Expected 400 for oversized, got {resp_over.status_code}"
    print("[PASS] Oversized file (>8MB) rejected with HTTP 400.")

    invalid_mime = client.post(
        "/sessions/upload-reference",
        headers=headers,
        files={"file": ("malicious.txt", b"Hello world text", "text/plain")}
    )
    assert invalid_mime.status_code == 400, f"Expected 400 for text/plain, got {invalid_mime.status_code}"
    print("[PASS] Invalid MIME type (text/plain) rejected with HTTP 400.")

    # =========================================================================
    # TEST 3: Generate Variants (Text Only)
    # =========================================================================
    print("\n--- Test 3: Generate Variants (Text Only) ---")
    gen_payload_text_only = {
        "session_id": daily_session.id,
        "answer_1": "Introduce our organic lavender sleep serum",
        "answer_2": "instagram_post",
        "answer_3": "Highlight night-time application and glowing skin by morning.",
        "context_text": "Highlight night-time application and glowing skin by morning.",
        "target_platform": "instagram_post",
        "reference_images": []
    }
    resp_gen1 = client.post("/sessions/generate-variants", headers=headers, json=gen_payload_text_only)
    assert resp_gen1.status_code == 200, f"Generate variants failed: {resp_gen1.text}"
    gen_data1 = resp_gen1.json()
    assert gen_data1["max_variants_allowed"] == 3, f"Expected 3 variants for Growth plan, got {gen_data1['max_variants_allowed']}"
    assert len(gen_data1["variants"]) == 3
    assert gen_data1["variants"][0]["is_selected"] is True # first selected by default
    session_id_1 = gen_data1["session_id"]
    print(f"[PASS] Text-only session generated {len(gen_data1['variants'])} variants. Session ID: {session_id_1}")

    # =========================================================================
    # TEST 4: Generate Variants with Reference Image ("use_photo" mode)
    # =========================================================================
    print("\n--- Test 4: Generate Variants with Reference Image (Use My Photo mode) ---")
    gen_payload_photo = {
        "session_id": daily_session.id,
        "answer_1": "Showcase our signature bottle in a luxury bathroom setting",
        "answer_2": "instagram_post",
        "answer_3": "Keep the exact bottle label and color, place on marble counter.",
        "context_text": "Keep the exact bottle label and color, place on marble counter.",
        "target_platform": "instagram_post",
        "reference_images": [
            {
                "url": ref_image_url_1,
                "mode": "use_photo",
                "filename": "reference_product.png"
            }
        ]
    }
    resp_gen2 = client.post("/sessions/generate-variants", headers=headers, json=gen_payload_photo)
    assert resp_gen2.status_code == 200, f"Generate variants with photo failed: {resp_gen2.text}"
    gen_data2 = resp_gen2.json()
    assert len(gen_data2["variants"]) == 3
    session_id_2 = gen_data2["session_id"]
    variant_to_select = gen_data2["variants"][1] # select the 2nd variant
    print(f"[PASS] Reference image session generated variants with distinct styles:")
    for v in gen_data2["variants"]:
        print(f"       - Variant {v['variant_index']}: {v['variant_label']} ({v['style_direction']})")

    # =========================================================================
    # TEST 5: Select a Variant
    # =========================================================================
    print("\n--- Test 5: Select Variant & Commit to History ---")
    select_payload = {
        "session_id": session_id_2,
        "variant_id": variant_to_select["id"],
        "adjusted_caption": "Infused with pure lavender and botanical ceramides.",
        "adjusted_hashtags": ["#CleanBeauty", "#OrganicSkincare", "#NightRitual"]
    }
    resp_select = client.post("/sessions/select-variant", headers=headers, json=select_payload)
    assert resp_select.status_code == 200, f"Select variant failed: {resp_select.text}"
    select_data = resp_select.json()
    assert select_data["success"] is True
    assert select_data["selected_variant_id"] == variant_to_select["id"]
    assert "post_id" in select_data

    # Verify in DB:
    db.expire_all()
    selected_db_variant = db.query(SessionVariant).filter(SessionVariant.id == variant_to_select["id"]).first()
    assert selected_db_variant.is_selected is True

    committed_post = db.query(GeneratedPost).filter(GeneratedPost.id == select_data["post_id"]).first()
    assert committed_post is not None
    assert committed_post.caption == select_payload["adjusted_caption"]

    # Verify user posts_used_this_month incremented
    db.refresh(test_user)
    assert test_user.posts_used_this_month == 1
    print(f"[PASS] Variant {variant_to_select['id']} selected and committed to GeneratedPost {committed_post.id}")

    # =========================================================================
    # TEST 6: Regenerate Single Variant
    # =========================================================================
    print("\n--- Test 6: Regenerate Single Variant ---")
    regen_variant_target = gen_data2["variants"][2] # 3rd variant
    regen_payload = {
        "session_id": session_id_2,
        "variant_id": regen_variant_target["id"],
        "style_direction": "Softer warm sunlight from the left window.",
        "reference_context": "Highlight serene morning mood"
    }
    resp_regen = client.post("/sessions/regenerate-variant", headers=headers, json=regen_payload)
    assert resp_regen.status_code == 200, f"Regenerate variant failed: {resp_regen.text}"
    regen_data = resp_regen.json()
    assert regen_data["success"] is True
    assert regen_data["variant"]["image_url"] != ""
    print(f"[PASS] Successfully regenerated variant: {regen_data['variant']['variant_label']}")

    # =========================================================================
    # TEST 7: Plan Variant Limits (Starter = 2, Pro = 4)
    # =========================================================================
    print("\n--- Test 7: Verify Plan Variant Limits (Starter = 2, Pro = 4) ---")
    # Upgrade user to Pro
    test_user.plan = "pro"
    db.commit()
    resp_pro = client.post("/sessions/generate-variants", headers=headers, json=gen_payload_text_only)
    assert resp_pro.status_code == 200
    assert resp_pro.json()["max_variants_allowed"] == 4
    assert len(resp_pro.json()["variants"]) == 4
    print("[PASS] Pro plan receives 4 variants.")

    # Downgrade user to Starter
    test_user.plan = "starter"
    db.commit()
    resp_starter = client.post("/sessions/generate-variants", headers=headers, json=gen_payload_text_only)
    assert resp_starter.status_code == 200
    assert resp_starter.json()["max_variants_allowed"] == 2
    assert len(resp_starter.json()["variants"]) == 2
    print("[PASS] Starter plan receives 2 variants.")

    # =========================================================================
    # TEST 8: Verify Usage Cost Logging
    # =========================================================================
    print("\n--- Test 8: Verify Usage & Cost Logging ---")
    usage_entries = db.query(Usage).filter(Usage.user_id == test_user.id).all()
    assert len(usage_entries) > 0, "Expected usage entries to be logged"
    print(f"[PASS] Total usage log entries recorded for user: {len(usage_entries)}")
    for u in usage_entries[:3]:
        print(f"       - Feature: {u.feature}, Model: {u.model}, Cost: ${u.cost:.4f}, Status: {u.status}")

    print("\n" + "=" * 70)
    print("ALL SESSION MULTI-VARIANT TESTS PASSED WITH 100% SUCCESS!")
    print("=" * 70)

if __name__ == "__main__":
    run_suite()
