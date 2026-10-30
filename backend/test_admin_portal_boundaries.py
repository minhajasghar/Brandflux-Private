import sys
import os
import io
import uuid
from datetime import datetime, timedelta

# Force stdout to utf-8 for Windows console
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from fastapi.testclient import TestClient
from main import app
from database import SessionLocal
from models.models import (
    User, Brand, DailySession, SessionVariant, GeneratedPost, ScheduledPost,
    SocialAccount, Usage, AuditLog
)
from services.auth_service import hash_password, create_token
from services.storage import storage_service

def run_boundaries_suite():
    print("=" * 70)
    print("BRANDFLUX ADMIN PORTAL BOUNDARIES & TWO-STEP DELETION TEST SUITE")
    print("=" * 70)

    client = TestClient(app)
    db = SessionLocal()

    suffix = uuid.uuid4().hex[:6]

    # 1. Create a Platform Admin user
    admin_user = User(
        id=str(uuid.uuid4()),
        email=f"head_admin_{suffix}@brandflux.ai",
        full_name="Lead Administrator",
        password_hash=hash_password("SuperSecretAdminPass123!"),
        role="admin",
        plan="pro",
        is_suspended=False,
        is_deleted=False,
        token_version=1
    )
    db.add(admin_user)

    # 2. Create a Secondary Admin (so lead admin isn't the only one)
    second_admin = User(
        id=str(uuid.uuid4()),
        email=f"second_admin_{suffix}@brandflux.ai",
        full_name="Second Administrator",
        password_hash=hash_password("SecondSecretPass123!"),
        role="admin",
        plan="pro",
        is_suspended=False,
        is_deleted=False,
        token_version=1
    )
    db.add(second_admin)

    # 3. Create a Customer (user role)
    customer_user = User(
        id=str(uuid.uuid4()),
        email=f"customer_{suffix}@acme.com",
        full_name="Acme Customer",
        password_hash=hash_password("CustomerPass123!"),
        role="user",
        plan="growth",
        is_suspended=False,
        is_deleted=False,
        token_version=1,
        posts_used_this_month=5
    )
    db.add(customer_user)
    db.commit()

    # Customer Brand & Data
    customer_brand = Brand(
        id=str(uuid.uuid4()),
        user_id=customer_user.id,
        business_name="Acme Botanics",
        website_url="https://acmebotanics.com",
        primary_color="#1558C9",
        secondary_color="#D4FF24",
        logo_url="http://localhost:8000/api/media/posts/acme_logo_sample.png",
        onboarding_complete=True
    )
    db.add(customer_brand)

    # Customer Generated Post
    customer_post = GeneratedPost(
        id=str(uuid.uuid4()),
        user_id=customer_user.id,
        brand_id=customer_brand.id,
        platform="instagram_post",
        caption="Acme organic launch",
        post_image_url="http://localhost:8000/api/media/posts/acme_post_image.png",
        status="published"
    )
    db.add(customer_post)

    # Customer Scheduled Post
    customer_scheduled = ScheduledPost(
        id=str(uuid.uuid4()),
        brand_id=customer_brand.id,
        platform="instagram_post",
        scheduled_at=datetime.utcnow() + timedelta(days=2),
        caption="Upcoming scheduled campaign",
        status="Scheduled"
    )
    db.add(customer_scheduled)

    # Customer Social Account (OAuth token)
    customer_oauth = SocialAccount(
        id=str(uuid.uuid4()),
        user_id=customer_user.id,
        brand_id=customer_brand.id,
        platform="instagram",
        account_id="ig_12345",
        account_name="acme_botanics",
        access_token_encrypted="secret_oauth_access_token_encrypted_12345",
        refresh_token_encrypted="secret_refresh_token_encrypted_67890"
    )
    db.add(customer_oauth)

    # Customer Usage Record
    customer_usage = Usage(
        id=str(uuid.uuid4()),
        user_id=customer_user.id,
        brand_id=customer_brand.id,
        feature="image_generation",
        model="gemini-nano-banana-2.1",
        cost=0.03,
        status="success"
    )
    db.add(customer_usage)
    db.commit()

    admin_token = create_token(admin_user.id, admin_user.token_version)
    admin_headers = {"Authorization": f"Bearer {admin_token}"}

    customer_token = create_token(customer_user.id, customer_user.token_version)
    customer_headers = {"Authorization": f"Bearer {customer_token}"}

    # =========================================================================
    # TEST 1: Role Enforcement on /admin routes
    # =========================================================================
    print("\n--- Test 1: Role Enforcement on Backend /admin Routes ---")
    resp_unauth = client.get("/admin/overview")
    assert resp_unauth.status_code == 401, f"Expected 401 for unauthenticated call, got {resp_unauth.status_code}"
    print("[PASS] Unauthenticated request to /admin rejected with HTTP 401")

    resp_customer_admin = client.get("/admin/overview", headers=customer_headers)
    assert resp_customer_admin.status_code == 403, f"Expected 403 for customer accessing /admin, got {resp_customer_admin.status_code}"
    print("[PASS] Customer account accessing /admin strictly rejected with HTTP 403 Forbidden")

    resp_admin = client.get("/admin/overview", headers=admin_headers)
    assert resp_admin.status_code == 200, f"Expected 200 for admin, got {resp_admin.status_code}"
    print("[PASS] Admin account successfully accessed /admin/overview")

    # =========================================================================
    # TEST 2: Admin Cannot Create Customer Brand Content
    # =========================================================================
    print("\n--- Test 2: Admin Cannot Generate Customer Brand Content ---")
    dummy_session = DailySession(
        id=str(uuid.uuid4()),
        user_id=admin_user.id,
        question_1="Q1",
        answer_1="A1"
    )
    db.add(dummy_session)
    db.commit()

    resp_admin_gen = client.post(
        "/sessions/generate-content",
        headers=admin_headers,
        json={
            "session_id": dummy_session.id,
            "answer_1": "Highlights",
            "answer_2": "Social updates",
            "answer_3": "Promotions",
            "target_platform": "instagram_post"
        }
    )
    assert resp_admin_gen.status_code == 403, f"Expected 403 for admin generating content, got {resp_admin_gen.status_code}"
    assert "Portal boundary enforcement" in resp_admin_gen.text
    print("[PASS] Admin role blocked from generating brand content with HTTP 403")

    # =========================================================================
    # TEST 3: Soft Deletion - Self Deletion and Last Admin Protection
    # =========================================================================
    print("\n--- Test 3: Self-Deletion and Last Admin Protection ---")
    # Admin tries to delete themselves
    resp_self_del = client.delete(
        f"/admin/users/{admin_user.id}",
        headers=admin_headers,
        params={"confirm_email": admin_user.email}
    )
    assert resp_self_del.status_code == 400, f"Expected 400 for self-deletion, got {resp_self_del.status_code}"
    assert "cannot delete your own admin account" in resp_self_del.text.lower()
    print("[PASS] Admin self-deletion blocked with HTTP 400")

    # Delete second admin first so only 1 admin remains
    client.delete(
        f"/admin/users/{second_admin.id}",
        headers=admin_headers,
        params={"confirm_email": second_admin.email}
    )
    # Attempt to delete remaining admin
    resp_last_admin = client.delete(
        f"/admin/users/{admin_user.id}",
        headers=admin_headers,
        params={"confirm_email": admin_user.email}
    )
    assert resp_last_admin.status_code == 400
    print("[PASS] Deletion of the last remaining admin blocked with HTTP 400")

    # =========================================================================
    # TEST 4: Soft Deletion - Email Confirmation Required
    # =========================================================================
    print("\n--- Test 4: Soft Deletion Requires Exact Email Confirmation ---")
    # Wrong confirmation email
    resp_wrong_email = client.delete(
        f"/admin/users/{customer_user.id}",
        headers=admin_headers,
        params={"confirm_email": "wrong_email@example.com"}
    )
    assert resp_wrong_email.status_code == 400
    assert "Confirmation mismatch" in resp_wrong_email.text
    print("[PASS] Mismatched confirmation email rejected with HTTP 400")

    # Correct confirmation email
    resp_soft_delete = client.delete(
        f"/admin/users/{customer_user.id}",
        headers=admin_headers,
        params={"confirm_email": customer_user.email}
    )
    assert resp_soft_delete.status_code == 200
    del_data = resp_soft_delete.json()
    assert del_data["is_deleted"] is True
    assert del_data["grace_period_days"] == 30

    # Verify customer in DB is marked deleted & suspended
    db.refresh(customer_user)
    assert customer_user.is_deleted is True
    assert customer_user.is_suspended is True
    assert customer_user.deleted_at is not None
    print(f"[PASS] Customer soft-deleted (deleted_at: {customer_user.deleted_at}, 30-day grace period)")

    # Verify soft-deleted customer cannot log in or make API calls
    resp_deleted_api = client.get("/auth/me", headers=customer_headers)
    assert resp_deleted_api.status_code == 401 or resp_deleted_api.status_code == 403
    print("[PASS] Soft-deleted customer blocked from API calls immediately")

    # =========================================================================
    # TEST 5: Restore User During Grace Period
    # =========================================================================
    print("\n--- Test 5: Restore Soft-Deleted User Within 30 Days ---")
    resp_restore = client.post(f"/admin/users/{customer_user.id}/restore", headers=admin_headers)
    assert resp_restore.status_code == 200
    db.refresh(customer_user)
    assert customer_user.is_deleted is False
    assert customer_user.is_suspended is False
    assert customer_user.deleted_at is None
    print("[PASS] Customer account restored successfully")

    # Re-apply soft delete for export and permanent purge tests
    client.delete(
        f"/admin/users/{customer_user.id}",
        headers=admin_headers,
        params={"confirm_email": customer_user.email}
    )

    # =========================================================================
    # TEST 6: Export User Data Bundle
    # =========================================================================
    print("\n--- Test 6: Export Complete User Data Bundle ---")
    resp_export = client.get(f"/admin/users/{customer_user.id}/export", headers=admin_headers)
    assert resp_export.status_code == 200
    export_data = resp_export.json()
    assert "user_profile" in export_data
    assert "brands" in export_data
    assert "posts" in export_data
    assert "scheduled_posts" in export_data
    assert "social_accounts" in export_data
    assert "usage_history" in export_data
    # Verify OAuth secret tokens are never exposed in export
    for sa in export_data["social_accounts"]:
        assert "access_token" not in sa
        assert "refresh_token" not in sa
    print(f"[PASS] Complete GDPR compliance export bundle produced (brands: {len(export_data['brands'])}, posts: {len(export_data['posts'])})")

    # =========================================================================
    # TEST 7: Step 2 - Permanent Purge Pipeline
    # =========================================================================
    print("\n--- Test 7: Permanent User Purge Pipeline ---")
    customer_id = customer_user.id
    customer_brand_id = customer_brand.id
    customer_usage_id = customer_usage.id
    resp_purge = client.post(f"/admin/users/{customer_id}/purge", headers=admin_headers)
    assert resp_purge.status_code == 200
    purge_data = resp_purge.json()
    assert purge_data["success"] is True

    # 1. Verify User DB record is completely deleted
    db.expire_all()
    user_in_db = db.query(User).filter(User.id == customer_id).first()
    assert user_in_db is None, "User record must be completely deleted from DB"
    print("[PASS] User record deleted from database")

    # 2. Verify Brands, Posts, Scheduled Posts, Social Accounts deleted
    brands_in_db = db.query(Brand).filter(Brand.user_id == customer_id).all()
    assert len(brands_in_db) == 0, "All brands must be deleted"
    posts_in_db = db.query(GeneratedPost).filter(GeneratedPost.user_id == customer_id).all()
    assert len(posts_in_db) == 0, "All posts must be deleted"
    scheduled_in_db = db.query(ScheduledPost).filter(ScheduledPost.brand_id == customer_brand_id).all()
    assert len(scheduled_in_db) == 0, "All scheduled posts must be deleted"
    oauth_in_db = db.query(SocialAccount).filter(SocialAccount.user_id == customer_id).all()
    assert len(oauth_in_db) == 0, "All OAuth tokens must be revoked and deleted"
    print("[PASS] Brands, posts, scheduled posts, and OAuth tokens purged")

    # 3. Verify billing records (Usage) are anonymized (user_id = None)
    anonymized_usage = db.query(Usage).filter(Usage.id == customer_usage_id).first()
    assert anonymized_usage is not None
    assert anonymized_usage.user_id is None
    print("[PASS] Billing/tax records preserved with PII anonymized")

    # 4. Verify audit log entry is preserved and anonymized
    purge_audits = db.query(AuditLog).filter(AuditLog.action == "permanent_purge_user").all()
    assert len(purge_audits) > 0
    latest_purge_audit = purge_audits[-1]
    assert latest_purge_audit.target_email == "anonymized_purged_user@brandflux.ai"
    print(f"[PASS] Permanent purge logged in audit log (Target: {latest_purge_audit.target_email})")

    print("\n" + "=" * 70)
    print("ALL ADMIN PORTAL BOUNDARIES & TWO-STEP DELETION TESTS PASSED (100%)")
    print("=" * 70)

if __name__ == "__main__":
    run_boundaries_suite()
