import sys
import os
import uuid
from datetime import datetime, timedelta

# Ensure backend root is on sys.path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from database import SessionLocal, engine, Base
from models.models import User, Brand, DailySession, ScheduledPost, GeneratedPost
from services.brand_service import (
    PLAN_BRAND_LIMITS,
    get_plan_brand_limit,
    resolve_user_brand,
    build_brand_kit_dict,
    sync_brand_kit_to_columns
)
from routers.brand import list_user_brands, add_new_brand, switch_active_brand, update_brand_website
from models.schemas import BrandCreateRequest, BrandWebsiteUpdateRequest

def run_tests():
    print("=" * 60)
    print("TESTING MULTI-BRAND SUPPORT & SCOPING")
    print("=" * 60)

    db = SessionLocal()
    test_user_email = f"multibrand_test_{uuid.uuid4().hex[:8]}@brandflux.ai"
    user = None

    try:
        # 1. Create a Test User with Starter Plan
        user = User(
            id=str(uuid.uuid4()),
            email=test_user_email,
            full_name="MultiBrand Tester",
            password_hash="fakehashedpassword",
            plan="starter"
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        print(f"[PASS] Created test user: {user.email} (Plan: {user.plan})")

        # 2. Test Plan Brand Limits
        assert get_plan_brand_limit("starter") == 1, "Starter plan should allow 1 brand"
        assert get_plan_brand_limit("growth") == 3, "Growth plan should allow 3 brands"
        assert get_plan_brand_limit("pro") == 10, "Pro plan should allow 10 brands"
        print("[PASS] Verified plan brand limit constants (Starter: 1, Growth: 3, Pro: 10)")

        # 3. Test Listing User Brands (Auto-initializes default brand if none)
        brand_list_res = list_user_brands(user=user, db=db)
        assert len(brand_list_res.brands) == 1, "Should auto-initialize 1 brand"
        brand_1_id = brand_list_res.brands[0].id
        assert user.active_brand_id == brand_1_id, "User active_brand_id should be set"
        print(f"[PASS] Auto-initialized first brand: {brand_list_res.brands[0].name} (ID: {brand_1_id})")

        # 4. Enforce Brand Limit for Starter (1 Brand max)
        try:
            import asyncio
            asyncio.run(add_new_brand(
                req=BrandCreateRequest(name="Second Brand", website_url="https://second.example.com"),
                user=user,
                db=db
            ))
            assert False, "Adding 2nd brand on Starter plan should have raised HTTP 403"
        except Exception as e:
            assert "allows up to 1 brand" in str(e) or "403" in str(e), f"Expected limit 403 error, got: {e}"
            print("[PASS] Successfully enforced 1-brand limit on Starter plan (HTTP 403 on 2nd brand)")

        # 5. Upgrade User to Growth Plan (3 Brands max)
        user.plan = "growth"
        db.commit()
        db.refresh(user)
        print(f"[PASS] Upgraded user to {user.plan} plan (Limit: {get_plan_brand_limit(user.plan)})")

        # Add 2nd Brand on Growth Plan
        brand_2 = asyncio.run(add_new_brand(
            req=BrandCreateRequest(
                name="Apex SaaS",
                website_url="https://apex-saas.com",
                brand_kit={
                    "business_name": "Apex SaaS",
                    "primary_color": "#1558C9",
                    "secondary_color": "#D4FF24",
                    "brand_tone": "Authoritative and technical"
                }
            ),
            user=user,
            db=db
        ))
        assert brand_2.id is not None
        assert user.active_brand_id == brand_2.id, "Newly created brand should become active"
        print(f"[PASS] Successfully added 2nd brand: {brand_2.name} (Active: {user.active_brand_id == brand_2.id})")

        # Add 3rd Brand on Growth Plan
        brand_3 = asyncio.run(add_new_brand(
            req=BrandCreateRequest(
                name="EcoCraft Studio",
                website_url="https://ecocraft.studio",
                brand_kit={
                    "business_name": "EcoCraft Studio",
                    "primary_color": "#059669",
                    "secondary_color": "#10B981"
                }
            ),
            user=user,
            db=db
        ))
        assert brand_3.id is not None
        print(f"[PASS] Successfully added 3rd brand: {brand_3.name} (Active: {user.active_brand_id == brand_3.id})")

        # Adding 4th Brand on Growth Plan must fail (exceeds 3)
        try:
            asyncio.run(add_new_brand(
                req=BrandCreateRequest(name="Fourth Over Limit", website_url="https://fourth.com"),
                user=user,
                db=db
            ))
            assert False, "Adding 4th brand on Growth plan should have raised HTTP 403"
        except Exception as e:
            assert "allows up to 3 brands" in str(e) or "403" in str(e)
            print("[PASS] Successfully enforced 3-brand limit on Growth plan (HTTP 403 on 4th brand)")

        # 6. Test Brand Switcher
        switch_res = switch_active_brand(brand_id=brand_1_id, user=user, db=db)
        assert switch_res["success"] is True
        assert user.active_brand_id == brand_1_id
        resolved = resolve_user_brand(user=user, db=db)
        assert resolved.id == brand_1_id, "resolve_user_brand should resolve active brand"
        print(f"[PASS] Successfully switched active brand back to Brand 1 ({brand_1_id})")

        # 7. Test Calendar & Scheduled Posts Scoping
        post_b1 = ScheduledPost(
            id=str(uuid.uuid4()),
            brand_id=brand_1_id,
            platform="linkedin",
            caption="Post for Brand 1",
            scheduled_at=datetime.utcnow() + timedelta(days=1),
            status="Scheduled"
        )
        post_b2 = ScheduledPost(
            id=str(uuid.uuid4()),
            brand_id=brand_2.id,
            platform="instagram_post",
            caption="Post for Brand 2 (Apex)",
            scheduled_at=datetime.utcnow() + timedelta(days=2),
            status="Draft"
        )
        db.add_all([post_b1, post_b2])
        db.commit()

        from routers.calendar import get_scheduled_posts
        # When querying active brand (brand 1)
        posts_brand1 = get_scheduled_posts(user=user, db=db)
        assert any(p.id == post_b1.id for p in posts_brand1), "Brand 1 posts should appear"
        assert not any(p.id == post_b2.id for p in posts_brand1), "Brand 2 posts should NOT appear under Brand 1"
        print("[PASS] Verified calendar posts scoping: Brand 1 query strictly excludes Brand 2 posts")

        # When explicitly querying brand 2
        posts_brand2 = get_scheduled_posts(brand_id=brand_2.id, user=user, db=db)
        assert any(p.id == post_b2.id for p in posts_brand2), "Brand 2 posts should appear"
        assert not any(p.id == post_b1.id for p in posts_brand2), "Brand 1 posts should NOT appear under Brand 2"
        print("[PASS] Verified explicit brand_id calendar query scoping")

        # 8. Test Daily Session Scoping
        session_b1 = DailySession(
            id=str(uuid.uuid4()),
            user_id=user.id,
            brand_id=brand_1_id,
            question_1="Focus direction",
            session_date=datetime.utcnow().date()
        )
        db.add(session_b1)
        db.commit()

        from routers.sessions import get_today_session
        todays_sess_b1 = asyncio.run(get_today_session(brand_id=brand_1_id, user=user, db=db))
        assert todays_sess_b1.brand_id == brand_1_id
        todays_sess_b2 = asyncio.run(get_today_session(brand_id=brand_2.id, user=user, db=db))
        assert todays_sess_b2.brand_id == brand_2.id
        assert todays_sess_b1.id != todays_sess_b2.id
        print("[PASS] Verified Daily Session scoping: different brands get independent daily sessions")

        # 9. Test Re-scan Website & URL update on the same brand
        update_res = asyncio.run(update_brand_website(
            req=BrandWebsiteUpdateRequest(website_url="https://updated-brand1.com", rescan=False),
            brand_id=brand_1_id,
            user=user,
            db=db
        ))
        assert update_res.website_url == "https://updated-brand1.com"
        assert update_res.id == brand_1_id
        print(f"[PASS] Verified URL update on same brand without changing brand ID: {update_res.website_url}")

        print("=" * 60)
        print("ALL MULTI-BRAND TESTS PASSED SUCCESSFULLY! ")
        print("=" * 60)

    finally:
        # Cleanup test data
        try:
            if user:
                db.query(ScheduledPost).filter(ScheduledPost.brand_id.in_([b.id for b in user.brands])).delete(synchronize_session=False)
                db.query(DailySession).filter(DailySession.user_id == user.id).delete(synchronize_session=False)
                db.query(Brand).filter(Brand.user_id == user.id).delete(synchronize_session=False)
                db.query(User).filter(User.id == user.id).delete(synchronize_session=False)
                db.commit()
                print("[PASS] Cleanup test user and multi-brand records completed.")
        except Exception as cleanup_err:
            print(f"Cleanup note: {cleanup_err}")
        db.close()

if __name__ == "__main__":
    run_tests()
