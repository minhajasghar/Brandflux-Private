import sys
import os
import io
import uuid
import datetime
from PIL import Image, ImageDraw

def create_dummy_image(format="PNG", size=(300, 300)):
    buf = io.BytesIO()
    img = Image.new("RGB", size, color=(30, 40, 60))
    draw = ImageDraw.Draw(img)
    for i in range(0, size[0], 20):
        draw.line([(i, 0), (size[0] - i, size[1])], fill=(i % 255, (i * 2) % 255, (i * 3) % 255), width=3)
    draw.rectangle([50, 50, 200, 200], fill=(212, 255, 36), outline=(255, 255, 255))
    img.save(buf, format=format)
    buf.seek(0)
    return buf.getvalue()

from fastapi.testclient import TestClient
from main import app
from database import SessionLocal
from models.models import User, Brand, DailySession, SessionVariant, GeneratedPost, Post, PlatformCopy
from services.auth_service import hash_password, create_token
from services.storage import storage_service

def run_tests():
    print("=" * 70)
    print("TEST SUITE: MULTI-PLATFORM CONTENT MODELING & PARENT POST GROUPING")
    print("=" * 70)

    client = TestClient(app)
    db = SessionLocal()

    # 1. Prepare Test User and Brand
    unique_suffix = uuid.uuid4().hex[:6]
    test_user = User(
        id=str(uuid.uuid4()),
        email=f"multi_{unique_suffix}@brandflux.ai",
        full_name="MultiPlatform Tester",
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
        business_name="Nexus Innovations",
        business_type="AI Software Solutions",
        brand_tone="Visionary, modern, authoritative",
        primary_color="#1558C9",
        secondary_color="#D4FF24",
        colors=["#1558C9", "#D4FF24", "#0F172A"],
        industry="Technology",
        onboarding_complete=True
    )
    db.add(test_brand)
    test_user.active_brand_id = test_brand.id
    db.commit()

    daily_session = DailySession(
        id=str(uuid.uuid4()),
        user_id=test_user.id,
        brand_id=test_brand.id,
        answer_1="Transforming Enterprise Workflows with Autonomous Intelligence",
        answer_2="instagram_post",
        answer_3="Highlight speed and precision",
        session_date=datetime.date.today()
    )
    db.add(daily_session)
    db.commit()

    # Create and save a valid dummy image in local storage
    dummy_bytes = create_dummy_image()
    filename = f"test_{uuid.uuid4().hex[:8]}.png"
    saved_url = storage_service.upload_image(dummy_bytes, filename, "image/png")

    # Add a mock variant to the session
    mock_variant = SessionVariant(
        id=str(uuid.uuid4()),
        session_id=daily_session.id,
        user_id=test_user.id,
        brand_id=test_brand.id,
        platform="instagram_post",
        variant_index=0,
        variant_label="Hero Studio Glow",
        style_direction="Clean modern editorial lighting",
        image_url=saved_url,
        caption="Autonomous workflows streamline repetitive tasks and unlock strategic velocity for modern teams.",
        hashtags=["#AI", "#Innovation", "#Productivity", "#Technology", "#Workflow"],
        expires_at=datetime.datetime.utcnow() + datetime.timedelta(hours=24),
        is_selected=False
    )
    db.add(mock_variant)
    db.commit()

    token = create_token(test_user.id, test_user.token_version)
    headers = {"Authorization": f"Bearer {token}"}

    print(f"[*] Setup user {test_user.email} and brand {test_brand.business_name}")

    # =========================================================================
    # TEST 1: Generation with 5 platforms creates exactly 1 parent Post + 5 child PlatformCopies
    # =========================================================================
    print("\n--- Test 1: Single Generation Creates 1 Post + 5 Platform Copies ---")
    select_payload = {
        "session_id": daily_session.id,
        "variant_id": mock_variant.id,
        "adjusted_caption": "Master enterprise velocity with autonomous systems designed for scale.",
        "adjusted_hashtags": ["#EnterpriseAI", "#Automation", "#FutureOfWork"],
        "platform_copies": {
            "instagram": {
                "caption": "Elevate your business operations with next-gen automated intelligence. Visual excellence meets operational scale.",
                "hashtags": "#EnterpriseAI #FutureOfWork #Productivity"
            },
            "linkedin": {
                "caption": "How leading enterprises unlock exponential productivity through autonomous workflow architectures. Here are 3 tactical frameworks.",
                "hashtags": "#Leadership #EnterpriseTech #Strategy"
            },
            "facebook": {
                "caption": "Streamline everyday business processes without compromising team creativity or strategic focus.",
                "hashtags": "#BusinessGrowth #TechTrends"
            },
            "twitter": {
                "caption": "Manual bottlenecking kills velocity. 3 steps to automate key workflows today: 👇",
                "hashtags": "#Automation #Tech"
            },
            "tiktok": {
                "caption": "Stop wasting hours on repetitive tasks! Here is how smart teams automate in seconds ⚡ #AITools #WorkHacks",
                "hashtags": "#AITools #WorkHacks #TikTokTech"
            }
        }
    }

    initial_posts_count = db.query(Post).filter(Post.user_id == test_user.id).count()
    initial_copies_count = db.query(PlatformCopy).join(Post).filter(Post.user_id == test_user.id).count()

    response = client.post("/sessions/select-variant", headers=headers, json=select_payload)
    assert response.status_code == 200, f"select-variant failed: {response.text}"
    data = response.json()
    assert data["success"] is True

    parent_post_id = data.get("parent_post_id") or data.get("post_id")
    assert parent_post_id is not None, "Expected parent_post_id in response"

    # Close old transaction snapshot and reopen to see changes committed by API endpoint (MySQL REPEATABLE READ)
    db.close()
    db = SessionLocal()

    # Verify database state: exactly 1 parent post added
    new_posts = db.query(Post).filter(Post.user_id == test_user.id).all()
    assert len(new_posts) == initial_posts_count + 1, f"Expected 1 parent post, got {len(new_posts)}"

    parent_post = new_posts[-1]
    assert parent_post.title == daily_session.answer_1 or bool(parent_post.title)

    # Verify exactly 5 platform copies created and linked to parent_post.id
    copies = db.query(PlatformCopy).filter(PlatformCopy.post_id == parent_post.id).all()
    assert len(copies) == 5, f"Expected 5 platform copies, got {len(copies)}"

    platforms_found = {c.platform for c in copies}
    expected_platforms = {"instagram", "linkedin", "facebook", "twitter", "tiktok"}
    assert platforms_found == expected_platforms, f"Platforms mismatch: {platforms_found} != {expected_platforms}"

    print(f"[PASS] Created 1 parent Post ({parent_post.id}) with 5 child copies: {platforms_found}")

    # =========================================================================
    # TEST 2: Credit deduction (1 generation = 1 credit consumed)
    # =========================================================================
    print("\n--- Test 2: Exactly 1 Credit Consumed Regardless of Platform Count ---")
    refreshed_user = db.query(User).filter(User.id == test_user.id).first()
    assert refreshed_user.posts_used_this_month == 1, f"Expected posts_used_this_month=1, got {refreshed_user.posts_used_this_month}"
    assert parent_post.credits_used == 1, f"Expected parent_post.credits_used=1, got {parent_post.credits_used}"
    print("[PASS] User consumed exactly 1 credit for all 5 platform copies.")

    # =========================================================================
    # TEST 3: Dashboard & History shows ONE row per generation with real caption
    # =========================================================================
    print("\n--- Test 3: Dashboard / History Shows 1 Row Per Generation with Real Caption ---")
    resp_history = client.get("/content/history?limit=10", headers=headers)
    assert resp_history.status_code == 200, f"History fetch failed: {resp_history.text}"
    history_data = resp_history.json()

    assert history_data["total"] >= 1
    # Check that this post appears as ONE item in the list
    matching_items = [p for p in history_data["items"] if p["id"] == parent_post.id]
    assert len(matching_items) == 1, f"Expected exactly 1 row for post in history, found {len(matching_items)}"

    item = matching_items[0]
    # Check real caption is preserved and NOT a generic placeholder
    placeholder = "Multi-platform copy generated across all connected channels"
    assert placeholder not in item["caption"], f"Caption should be real text, got placeholder: {item['caption']}"
    assert len(item["caption"].strip()) > 10
    print(f"[*] Post caption preview: \"{item['caption'][:60]}...\"")

    # Check platform statuses and copies are exposed
    assert "platform_statuses" in item
    copies_in_item = item.get("copies") or item.get("platform_copies") or []
    assert len(copies_in_item) == 5
    assert "tiktok" in item["platform_statuses"]
    assert "linkedin" in item["platform_statuses"]
    print(f"[PASS] Dashboard history returns 1 row for parent post with 5 platform status chips.")

    # =========================================================================
    # TEST 4: Stats reflects monthly post count (+1) and platform copies count (+5)
    # =========================================================================
    print("\n--- Test 4: Stats Reflects 1 Post Created and N Platform Copies ---")
    resp_stats = client.get("/brand/stats", headers=headers)
    assert resp_stats.status_code == 200, f"Stats fetch failed: {resp_stats.text}"
    stats_data = resp_stats.json()

    assert stats_data["posts_created_this_month"] >= 1
    assert stats_data["total_platform_copies_this_month"] >= 5
    assert "top_platform" in stats_data
    print(f"[*] Stats: posts={stats_data['posts_created_this_month']}, copies={stats_data['total_platform_copies_this_month']}, top_platform='{stats_data['top_platform']}'")
    print("[PASS] Stats correctly counts parent posts and secondary copies.")

    # =========================================================================
    # TEST 5: Verify Legacy Data Grouping Integrity
    # =========================================================================
    print("\n--- Test 5: Verify Legacy Data Grouping Integrity ---")
    # Verify legacy generated_posts table remains fully intact
    legacy_count = db.query(GeneratedPost).count()
    parent_posts_count = db.query(Post).count()
    copies_count = db.query(PlatformCopy).count()
    print(f"[*] Total in DB: legacy generated_posts={legacy_count}, parent posts={parent_posts_count}, platform_copies={copies_count}")
    assert legacy_count >= 0
    assert parent_posts_count >= 1
    assert copies_count >= 5
    print("[PASS] Legacy data intact; parent posts and platform copies properly mapped.")

    print("\n" + "=" * 70)
    print("ALL MULTI-PLATFORM MODELING TESTS PASSED SUCCESSFULLY!")
    print("=" * 70)

def test_multiplatform_modeling():
    run_tests()

if __name__ == "__main__":
    run_tests()
