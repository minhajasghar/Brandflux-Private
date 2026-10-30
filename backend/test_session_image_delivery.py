import sys
import os
import io
import uuid
from datetime import datetime, timedelta
from PIL import Image, ImageDraw

# Force stdout to utf-8 for Windows console
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from fastapi.testclient import TestClient
from main import app
from database import SessionLocal
from models.models import User, Brand, DailySession, SessionVariant, GeneratedPost
from services.auth_service import hash_password, create_token
from services.storage import storage_service

def create_sample_banner_image():
    buf = io.BytesIO()
    img = Image.new("RGB", (1080, 1080), color=(15, 23, 42))
    draw = ImageDraw.Draw(img)
    draw.rectangle([50, 50, 1030, 1030], outline=(21, 88, 201), width=10)
    draw.text((200, 500), "Brandflux Public Delivery Test", fill=(212, 255, 36))
    img.save(buf, format="PNG")
    buf.seek(0)
    return buf.getvalue()

def run_delivery_suite():
    print("=" * 70)
    print("BRANDFLUX IMAGE DELIVERY & CREDIT DEDUCTION VERIFICATION SUITE")
    print("=" * 70)

    client = TestClient(app)
    db = SessionLocal()

    # 1. Create a test user and brand
    unique_suffix = uuid.uuid4().hex[:6]
    test_user = User(
        id=str(uuid.uuid4()),
        email=f"image_delivery_{unique_suffix}@brandflux.ai",
        full_name="Delivery Tester",
        password_hash=hash_password("Pass12345!"),
        plan="growth",
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
        business_name="Aura Botanica",
        business_type="Wellness",
        brand_tone="Minimalist, modern, serene",
        primary_color="#1558C9",
        secondary_color="#D4FF24",
        industry="Lifestyle",
        onboarding_complete=True
    )
    db.add(test_brand)
    test_user.active_brand_id = test_brand.id

    daily_session = DailySession(
        id=str(uuid.uuid4()),
        user_id=test_user.id,
        brand_id=test_brand.id,
        question_1="Topic",
        answer_1="Morning rituals and botanical skincare",
        question_2="Channels",
        answer_2="instagram_post",
        question_3="Details",
        answer_3="Launch announcement"
    )
    db.add(daily_session)
    db.commit()

    token = create_token(test_user.id, test_user.token_version)
    headers = {"Authorization": f"Bearer {token}"}

    # 2. Store a real public image through storage_service to get a public URL
    image_bytes = create_sample_banner_image()
    filename = f"test_delivery_{uuid.uuid4().hex[:8]}.png"
    public_image_url = storage_service.upload_image(
        image_bytes, 
        filename=filename, 
        content_type="image/png"
    )
    print(f"\n[STEP 1] Public image generated and stored: {public_image_url}")

    # =========================================================================
    # REQUIREMENT 5 TEST: Verify Variant Image URL returns 200 with image content-type
    # =========================================================================
    print("\n--- Test: Verify Generated Variant Image Endpoint Returns HTTP 200 & Image Content-Type ---")
    
    # Extract the path from the URL
    if public_image_url.startswith("http"):
        from urllib.parse import urlparse
        path = urlparse(public_image_url).path
    else:
        path = public_image_url

    response = client.get(path)
    print(f"HTTP GET {path} -> Status: {response.status_code}")
    print(f"Content-Type: {response.headers.get('content-type')}")
    print(f"Content-Length: {len(response.content)} bytes")

    assert response.status_code == 200, f"Expected 200 OK, got {response.status_code}"
    content_type = response.headers.get("content-type", "")
    assert "image" in content_type, f"Expected image content-type, got {content_type}"
    assert len(response.content) > 1000, "Image content is unexpectedly empty or truncated"
    print("[PASS] Image URL returns HTTP 200 OK with valid image/ content-type!")

    # Verify HEAD request works as well (used by reachability probes)
    head_response = client.head(path)
    assert head_response.status_code == 200
    assert "image" in head_response.headers.get("content-type", "")
    print("[PASS] HEAD request succeeds with HTTP 200 OK")

    # =========================================================================
    # REQUIREMENT 4 TEST: Credit Deducted ONLY when verified reachable
    # =========================================================================
    print("\n--- Test: Credit Protection When Image is Missing / Broken ---")
    
    # Create a variant with a non-existent / broken image
    broken_variant = SessionVariant(
        id=str(uuid.uuid4()),
        session_id=daily_session.id,
        user_id=test_user.id,
        brand_id=test_brand.id,
        variant_index=0,
        variant_label="Broken Variant",
        style_direction="Missing File Test",
        image_url="http://localhost:8000/api/media/posts/non_existent_image_99999.png",
        headline="Missing Image Post",
        caption="This should fail credit deduction",
        call_to_action="Click",
        is_selected=False,
        expires_at=datetime.utcnow() + timedelta(days=7)
    )
    db.add(broken_variant)
    db.commit()

    # Attempt to select the broken variant
    broken_select_payload = {
        "session_id": daily_session.id,
        "variant_id": broken_variant.id,
        "adjusted_caption": "Testing broken variant",
        "adjusted_hashtags": ["#test"]
    }
    resp_broken = client.post("/sessions/select-variant", headers=headers, json=broken_select_payload)
    print(f"Broken Variant Select Response Status: {resp_broken.status_code}")
    print(f"Broken Variant Error Detail: {resp_broken.text}")

    assert resp_broken.status_code == 400, f"Expected 400 Bad Request, got {resp_broken.status_code}"
    assert "not verified or reachable" in resp_broken.text or "Regenerate" in resp_broken.text
    
    # Verify credit was NOT deducted
    db.refresh(test_user)
    assert test_user.posts_used_this_month == 0, f"Credit was wrongly deducted! posts_used_this_month = {test_user.posts_used_this_month}"
    print("[PASS] Zero credits deducted when variant image is unreachable or broken!")

    # Now create a variant with the verified, valid public image
    print("\n--- Test: Credit Deducted ONLY After Verified Storage ---")
    valid_variant = SessionVariant(
        id=str(uuid.uuid4()),
        session_id=daily_session.id,
        user_id=test_user.id,
        brand_id=test_brand.id,
        variant_index=1,
        variant_label="Valid Reachable Variant",
        style_direction="Minimalist Hero",
        image_url=public_image_url,
        headline="Verified Post",
        caption="This should succeed and deduct 1 credit",
        call_to_action="Explore",
        is_selected=False,
        expires_at=datetime.utcnow() + timedelta(days=7)
    )
    db.add(valid_variant)
    db.commit()

    valid_select_payload = {
        "session_id": daily_session.id,
        "variant_id": valid_variant.id,
        "adjusted_caption": "Valid post caption",
        "adjusted_hashtags": ["#success", "#wellness"]
    }
    resp_valid = client.post("/sessions/select-variant", headers=headers, json=valid_select_payload)
    print(f"Valid Variant Select Response Status: {resp_valid.status_code}")
    assert resp_valid.status_code == 200, f"Expected 200 OK, got {resp_valid.status_code}"
    
    # Verify credit IS deducted by exactly 1
    db.refresh(test_user)
    assert test_user.posts_used_this_month == 1, f"Expected exactly 1 credit deducted, found {test_user.posts_used_this_month}"
    print("[PASS] Exactly 1 credit deducted after variant image is successfully verified in storage!")

    # Verify GeneratedPost in DB has correct public image URL
    post = db.query(GeneratedPost).filter(GeneratedPost.id == resp_valid.json()["post_id"]).first()
    assert post is not None
    assert post.post_image_url == public_image_url
    print(f"[PASS] GeneratedPost saved with stable public URL: {post.post_image_url}")

    print("\n" + "=" * 70)
    print("ALL IMAGE DELIVERY & CREDIT INTEGRITY CHECKS PASSED (100%)")
    print("=" * 70)

if __name__ == "__main__":
    run_delivery_suite()
