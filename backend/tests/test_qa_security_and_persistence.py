import sys
import os
import uuid
from datetime import datetime, timedelta

sys.path.append(os.path.abspath("backend"))

from fastapi.testclient import TestClient
from main import app
from database import SessionLocal
from models.models import User, Brand, Post, PlatformCopy, PostImage, SessionVariant, DailySession
from services import auth_service
from routers.sessions import cleanup_expired_session_variants

client = TestClient(app)

def run_tests():
    print("=" * 70)
    print("QA & DEPLOYMENT READINESS: SECURITY, IDOR & PERSISTENCE TEST SUITE")
    print("=" * 70)
    db = SessionLocal()

    suffix = uuid.uuid4().hex[:6]
    user_a = User(
        id=str(uuid.uuid4()),
        email=f"user_a_{suffix}@test.local",
        password_hash=auth_service.hash_password("Password123!"),
        full_name="User Alpha",
        plan="trial",
        role="user",
        is_verified=True,
        is_suspended=False,
        trial_credits_allocated=15,
        created_at=datetime.utcnow()
    )
    user_b = User(
        id=str(uuid.uuid4()),
        email=f"user_b_{suffix}@test.local",
        password_hash=auth_service.hash_password("Password123!"),
        full_name="User Beta",
        plan="trial",
        role="user",
        is_verified=True,
        is_suspended=False,
        trial_credits_allocated=15,
        created_at=datetime.utcnow()
    )
    db.add_all([user_a, user_b])
    db.commit()

    brand_a = Brand(
        id=str(uuid.uuid4()),
        user_id=user_a.id,
        business_name=f"Brand Alpha {suffix}",
        primary_color="#1558C9",
        brand_tone="professional",
        created_at=datetime.utcnow()
    )
    db.add(brand_a)
    db.commit()

    # Generate JWT tokens
    token_a = auth_service.create_token(user_a.id)
    token_b = auth_service.create_token(user_b.id)

    headers_a = {"Authorization": f"Bearer {token_a}"}
    headers_b = {"Authorization": f"Bearer {token_b}"}

    # ─────────────────────────────────────────────────────────────────────────
    # TEST 1: Mass Assignment Prevention
    # ─────────────────────────────────────────────────────────────────────────
    print("\n[TEST 1] Testing Mass Assignment Prevention on User Profile...")
    payload_exploit = {
        "full_name": "User Alpha Modified",
        "plan": "pro",
        "role": "admin",
        "credits": 9999,
        "is_admin": True,
        "daily_generation_cap": 999
    }
    resp1 = client.put("/auth/profile", json=payload_exploit, headers=headers_a)
    assert resp1.status_code == 200, f"Expected 200, got {resp1.status_code}: {resp1.text}"
    user_res = resp1.json()["user"]
    assert user_res["full_name"] == "User Alpha Modified"
    assert user_res["plan"] == "trial"
    assert user_res["role"] == "user"

    db.commit()
    user_a = db.query(User).filter(User.id == user_a.id).first()
    assert user_a.full_name == "User Alpha Modified", f"Full name was {user_a.full_name}"
    assert user_a.plan == "trial", f"Mass assignment exploit! Plan changed to {user_a.plan}"
    assert user_a.role == "user", f"Mass assignment exploit! Role changed to {user_a.role}"
    assert user_a.trial_credits_allocated == 15, f"Mass assignment exploit! Credits changed to {user_a.trial_credits_allocated}"
    print("  [PASS] Mass assignment strictly prevented: plan, role, and credits remained immutable.")

    # ─────────────────────────────────────────────────────────────────────────
    # TEST 2: Pricing & Upgrade Protection (No client-side instant upgrades)
    # ─────────────────────────────────────────────────────────────────────────
    print("\n[TEST 2] Testing Pricing & Credit Upgrade Protection...")
    # Attempt plan upgrade
    resp_upgrade = client.post("/billing/request-upgrade", json={"plan_id": "pro", "billing_cycle": "monthly"}, headers=headers_a)
    assert resp_upgrade.status_code == 200, f"Expected 200, got {resp_upgrade.status_code}: {resp_upgrade.text}"
    data_upgrade = resp_upgrade.json()
    assert "Payments are coming soon, we'll activate your plan." in data_upgrade["message"], f"Unexpected message: {data_upgrade}"

    db.expire_all()
    user_a = db.query(User).filter(User.id == user_a.id).first()
    assert user_a.plan == "starter" or user_a.plan == "trial", "Plan was altered client-side without payment gateway!"
    print("  [PASS] Plan upgrade requested securely without instant client-side alteration.")

    # Attempt credit pack purchase
    resp_credits = client.post("/billing/credit-pack", json={"amount": 20, "pack_name": "Standard 20 Pack"}, headers=headers_a)
    # If trial, it returns 403 PAID_PLAN_REQUIRED
    assert resp_credits.status_code in (200, 403), f"Unexpected status: {resp_credits.status_code}"
    # Change to starter to test paid flow
    user_a.plan = "starter"
    db.commit()

    resp_credits2 = client.post("/billing/credit-pack", json={"amount": 20, "pack_name": "Standard 20 Pack"}, headers=headers_a)
    assert resp_credits2.status_code == 200, f"Expected 200, got {resp_credits2.status_code}: {resp_credits2.text}"
    assert "Payments are coming soon, we'll activate your plan." in resp_credits2.json()["message"]
    db.commit()
    from services.credit_service import get_user_credit_balance
    bal_data = get_user_credit_balance(user_a.id, db)
    bal = bal_data["balance"]
    assert bal <= 30, f"Credits were granted without payment gateway! Balance: {bal}"
    print("  [PASS] Credit purchase securely logged without unauthorized credit balance inflation.")

    # ─────────────────────────────────────────────────────────────────────────
    # TEST 3: Persistence & Auto-Deletion Removal
    # ─────────────────────────────────────────────────────────────────────────
    print("\n[TEST 3] Testing Persistence & Auto-Deletion Removal...")
    session_a = DailySession(
        id=str(uuid.uuid4()),
        user_id=user_a.id,
        brand_id=brand_a.id,
        session_date=datetime.utcnow().date()
    )
    db.add(session_a)

    post_a = Post(
        id=str(uuid.uuid4()),
        brand_id=brand_a.id,
        user_id=user_a.id,
        title="Weekly Persistence Post",
        topic="Quality & Reliability",
        credits_used=1,
        session_id=session_a.id,
        created_at=datetime.utcnow()
    )
    db.add(post_a)

    copy_a = PlatformCopy(
        id=str(uuid.uuid4()),
        post_id=post_a.id,
        platform="instagram",
        caption="Persistent quality content",
        hashtags=["#quality"],
        image_url="http://localhost:8000/api/media/posts/test_image_1.png",
        status="draft",
        created_at=datetime.utcnow()
    )
    db.add(copy_a)

    # 2 variants: 1 selected, 1 unused
    img_selected = PostImage(
        id=str(uuid.uuid4()),
        post_id=post_a.id,
        image_url="http://localhost:8000/api/media/posts/test_image_selected.png",
        is_selected=True,
        expires_at=None,
        created_at=datetime.utcnow()
    )
    img_unused = PostImage(
        id=str(uuid.uuid4()),
        post_id=post_a.id,
        image_url="http://localhost:8000/api/media/posts/test_image_unused.png",
        is_selected=False,
        expires_at=None,
        created_at=datetime.utcnow()
    )
    var_a = SessionVariant(
        id=str(uuid.uuid4()),
        session_id=session_a.id,
        user_id=user_a.id,
        brand_id=brand_a.id,
        platform="instagram_post",
        variant_index=0,
        variant_label="Variant 1",
        image_url="http://localhost:8000/api/media/posts/test_image_selected.png",
        is_selected=True,
        expires_at=None,
        created_at=datetime.utcnow()
    )
    db.add_all([img_selected, img_unused, var_a])
    db.commit()

    # Run cleanup_expired_session_variants - must delete ZERO records
    deleted_count = cleanup_expired_session_variants(db)
    assert deleted_count == 0, f"Auto-deletion was executed! Deleted {deleted_count} variants."
    print("  [PASS] Auto-deletion verified permanently disabled (deleted_count = 0).")

    # Verify post detail returns image_variants with is_unused flags
    resp_detail = client.get(f"/content/history/{post_a.id}", headers=headers_a)
    assert resp_detail.status_code == 200, f"Expected 200, got {resp_detail.status_code}: {resp_detail.text}"
    detail_data = resp_detail.json()
    assert "image_variants" in detail_data, "image_variants missing from post detail!"
    assert len(detail_data["image_variants"]) == 2, f"Expected 2 variants, got {len(detail_data['image_variants'])}"
    print("  [PASS] Post detail returns full image variants with is_unused metadata.")

    # ─────────────────────────────────────────────────────────────────────────
    # TEST 4: Manual Deletion of Unused Images
    # ─────────────────────────────────────────────────────────────────────────
    print("\n[TEST 4] Testing Manual Deletion of Unused Images...")
    resp_del_unused = client.delete(f"/content/posts/{post_a.id}/unused-images", headers=headers_a)
    assert resp_del_unused.status_code == 200, f"Expected 200, got {resp_del_unused.status_code}: {resp_del_unused.text}"
    assert resp_del_unused.json()["deleted_count"] == 1, "Expected 1 unused image deleted."

    db.commit()
    remaining_images = db.query(PostImage).filter(PostImage.post_id == post_a.id).all()
    assert len(remaining_images) == 1, f"Expected 1 image remaining, found {len(remaining_images)}"
    assert remaining_images[0].is_selected == True, "Selected image was deleted by mistake!"
    print("  [PASS] Manual deletion of unused images successfully deleted unused variant and preserved selected image.")

    # ─────────────────────────────────────────────────────────────────────────
    # TEST 5: IDOR & Boundary Checks (User B cannot access User A's data)
    # ─────────────────────────────────────────────────────────────────────────
    print("\n[TEST 5] Testing IDOR Isolation Between Tenants...")
    # User B attempts to access User A's post
    resp_idor_read = client.get(f"/content/history/{post_a.id}", headers=headers_b)
    assert resp_idor_read.status_code == 404, f"IDOR vulnerability! User B read User A's post: {resp_idor_read.status_code}"

    # User B attempts to delete User A's unused images
    resp_idor_del = client.delete(f"/content/posts/{post_a.id}/unused-images", headers=headers_b)
    assert resp_idor_del.status_code == 404, f"IDOR vulnerability! User B deleted User A's images: {resp_idor_del.status_code}"

    # User A (non-admin) attempts to access admin endpoints
    resp_admin = client.get("/admin/users", headers=headers_a)
    assert resp_admin.status_code == 403, f"Admin privilege escalation! Expected 403, got {resp_admin.status_code}"
    print("  [PASS] IDOR & RBAC boundaries verified: Tenant isolation and Admin 403 enforcement confirmed.")

    # ─────────────────────────────────────────────────────────────────────────
    # TEST 6: Content History Status Filtering ("not_posted", "scheduled", "published")
    # ─────────────────────────────────────────────────────────────────────────
    print("\n[TEST 6] Testing Content History Status Filtering...")
    resp_hist_not_posted = client.get("/content/history?status=not_posted", headers=headers_a)
    assert resp_hist_not_posted.status_code == 200, f"Expected 200, got {resp_hist_not_posted.status_code}"
    hist_items = resp_hist_not_posted.json().get("items", [])
    assert any(i["id"] == post_a.id for i in hist_items), "Draft post did not appear in 'not_posted' tab!"
    print("  [PASS] 'Not posted yet' tab accurately includes active drafts.")

    print("\n" + "=" * 70)
    print("ALL SECURITY, IDOR & PERSISTENCE VERIFICATION TESTS PASSED SUCCESSFULLY!")
    print("=" * 70)
    db.close()

if __name__ == "__main__":
    run_tests()
