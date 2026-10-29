import sys
import os
import io
import uuid

# Force stdout to utf-8 for Windows console
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from fastapi.testclient import TestClient
from main import app
from database import SessionLocal
from models.models import User, Brand, AuditLog
from services.auth_service import hash_password, create_token
from services.admin_service import seed_initial_admin

def run_tests():
    print("=" * 70)
    print("RUNNING BRANDFLUX SECURED ADMIN PORTAL TEST SUITE")
    print("=" * 70)

    client = TestClient(app)
    db = SessionLocal()

    # 1. Seed & verify initial admin
    admin = seed_initial_admin(db)
    assert admin is not None, "Failed to seed admin user"
    assert admin.role == "admin", f"Expected admin role, got {admin.role}"
    print(f"[PASS] Seeded/Verified initial admin: {admin.email} (Role: {admin.role})")

    # Create a regular user for authorization and action tests
    unique_suffix = uuid.uuid4().hex[:6]
    test_user_email = f"standard_{unique_suffix}@brandflux.ai"
    test_user_pw = "Password123!"
    test_user = User(
        id=str(uuid.uuid4()),
        email=test_user_email,
        full_name="Regular Test User",
        password_hash=hash_password(test_user_pw),
        plan="starter",
        role="user",
        is_suspended=False,
        is_deleted=False,
        token_version=1,
        posts_used_this_month=45
    )
    db.add(test_user)

    # Create a secondary test admin for admin endpoint tests
    test_admin_email = f"admin_{unique_suffix}@brandflux.ai"
    test_admin = User(
        id=str(uuid.uuid4()),
        email=test_admin_email,
        full_name="Staff Admin Tester",
        password_hash=hash_password("AdminPass123!"),
        plan="pro",
        role="admin",
        is_suspended=False,
        is_deleted=False,
        token_version=1
    )
    db.add(test_admin)
    db.commit()
    db.refresh(test_user)
    db.refresh(test_admin)

    user_token = create_token(test_user.id, token_version=test_user.token_version)
    admin_token = create_token(test_admin.id, token_version=test_admin.token_version)

    user_headers = {"Authorization": f"Bearer {user_token}"}
    admin_headers = {"Authorization": f"Bearer {admin_token}"}

    try:
        # 2. Test require_admin dependency
        print("\n--- Testing Access Control (require_admin dependency) ---")
        unauth_resp = client.get("/admin/overview")
        assert unauth_resp.status_code == 401, f"Expected 401, got {unauth_resp.status_code}"
        print("[PASS] Unauthenticated request rejected with 401")

        user_resp = client.get("/admin/overview", headers=user_headers)
        assert user_resp.status_code == 403, f"Expected 403 Forbidden, got {user_resp.status_code}"
        assert "Admin privileges required" in user_resp.json()["detail"]
        print("[PASS] Regular user access rejected with 403 (Admin privileges required)")

        admin_resp = client.get("/admin/overview", headers=admin_headers)
        assert admin_resp.status_code == 200, f"Expected 200 OK, got {admin_resp.status_code}: {admin_resp.text}"
        print("[PASS] Admin user access granted with 200 OK")

        # 3. Overview Endpoint metrics
        print("\n--- Testing Admin Overview Endpoint ---")
        overview = admin_resp.json()
        required_keys = [
            "total_users", "new_signups_7d", "new_signups_30d",
            "active_users", "posts_generated", "total_ai_cost",
            "failures_count", "ai_cost_per_day"
        ]
        for key in required_keys:
            assert key in overview, f"Missing key '{key}' in overview response"
        assert isinstance(overview["ai_cost_per_day"], list)
        print(f"[PASS] Overview metrics verified. Total users: {overview['total_users']}, Posts: {overview['posts_generated']}")

        # 4. Users Listing & Search
        print("\n--- Testing Admin Users Listing & Search ---")
        users_resp = client.get("/admin/users", headers=admin_headers)
        assert users_resp.status_code == 200
        users_data = users_resp.json()
        assert "users" in users_data
        assert users_data["total"] >= 2
        print(f"[PASS] Listed {len(users_data['users'])} users (Total: {users_data['total']})")

        # Filter by email
        search_resp = client.get(f"/admin/users?q={unique_suffix}", headers=admin_headers)
        assert search_resp.status_code == 200
        search_data = search_resp.json()
        assert len(search_data["users"]) >= 1
        found_emails = [u["email"] for u in search_data["users"]]
        assert test_user_email in found_emails
        print(f"[PASS] Filter by query '{unique_suffix}' found {len(search_data['users'])} matching users")

        # 5. Sanitization Verification (Never expose password_hash or oauth tokens)
        print("\n--- Testing Security Sanitization ---")
        for u in users_data["users"]:
            assert "password_hash" not in u, "CRITICAL: password_hash leaked in users listing!"
            assert "password" not in u, "CRITICAL: password leaked in users listing!"
            assert "access_token" not in u, "CRITICAL: token leaked in users listing!"
            assert "token" not in u, "CRITICAL: token leaked in users listing!"
        print("[PASS] Verified NO password hashes or tokens exposed in users list")

        # 6. User Detail Endpoint
        print("\n--- Testing Admin User Detail Endpoint ---")
        detail_resp = client.get(f"/admin/users/{test_user.id}", headers=admin_headers)
        assert detail_resp.status_code == 200
        detail_data = detail_resp.json()
        assert "user" in detail_data
        assert detail_data["user"]["email"] == test_user_email
        assert "brands" in detail_data
        assert "password_hash" not in str(detail_data), "CRITICAL: password_hash leaked in user detail!"
        print("[PASS] User detail retrieved and verified sanitized")

        # 7. Action: Suspend User
        print("\n--- Testing User Suspension & Access Revocation ---")
        suspend_resp = client.post(
            f"/admin/users/{test_user.id}/suspend",
            headers=admin_headers,
            json={"reason": "Suspicious automated activity"}
        )
        assert suspend_resp.status_code == 200
        assert suspend_resp.json()["is_suspended"] is True
        print("[PASS] Admin suspended user successfully")

        # Verify suspended user is blocked from API calls
        blocked_api = client.get("/auth/me", headers=user_headers)
        assert blocked_api.status_code == 403, f"Expected 403 for suspended user API call, got {blocked_api.status_code}"
        assert "suspended" in blocked_api.json()["detail"].lower()
        print("[PASS] Suspended user blocked on authenticated API calls (403 Forbidden)")

        # Verify suspended user is blocked at login
        blocked_login = client.post(
            "/auth/login",
            json={"email": test_user_email, "password": test_user_pw}
        )
        assert blocked_login.status_code == 403, f"Expected 403 on login, got {blocked_login.status_code}"
        assert "suspended" in blocked_login.json()["detail"].lower()
        print("[PASS] Suspended user blocked at login (403 Forbidden)")

        # 8. Action: Reactivate User
        print("\n--- Testing User Reactivation ---")
        reactivate_resp = client.post(
            f"/admin/users/{test_user.id}/reactivate",
            headers=admin_headers,
            json={"reason": "Account verified and cleared"}
        )
        assert reactivate_resp.status_code == 200
        assert reactivate_resp.json()["is_suspended"] is False
        print("[PASS] Admin reactivated user successfully")

        # Verify reactivated user can authenticate and make API calls with fresh token
        db.refresh(test_user)
        user_token = create_token(test_user.id, token_version=test_user.token_version)
        user_headers = {"Authorization": f"Bearer {user_token}"}
        allowed_api = client.get("/auth/me", headers=user_headers)
        assert allowed_api.status_code == 200, f"Expected 200 for reactivated user, got {allowed_api.status_code}: {allowed_api.text}"
        print("[PASS] Reactivated user successfully allowed on authenticated API calls")

        # 9. Action: Change Plan (PUT method)
        print("\n--- Testing Change Plan Action ---")
        plan_resp = client.put(
            f"/admin/users/{test_user.id}/plan",
            headers=admin_headers,
            json={"plan": "pro", "reason": "Upgraded by support"}
        )
        assert plan_resp.status_code == 200
        assert plan_resp.json()["plan"] == "pro"
        print("[PASS] User plan updated to 'pro'")

        # 10. Action: Reset Usage
        print("\n--- Testing Reset Usage Action ---")
        reset_resp = client.post(
            f"/admin/users/{test_user.id}/reset-usage",
            headers=admin_headers,
            json={"reason": "Monthly billing glitch adjustment"}
        )
        assert reset_resp.status_code == 200
        assert reset_resp.json()["posts_used_this_month"] == 0
        print("[PASS] User usage reset to 0 posts this month")

        # 11. Action: Force Logout (Invalidate Tokens via token_version)
        print("\n--- Testing Force Logout Action ---")
        logout_resp = client.post(
            f"/admin/users/{test_user.id}/force-logout",
            headers=admin_headers,
            json={"reason": "Security protocol password reset required"}
        )
        assert logout_resp.status_code == 200
        print("[PASS] Force logout triggered, token_version incremented")

        # Old token must now fail with 401
        revoked_api = client.get("/auth/me", headers=user_headers)
        assert revoked_api.status_code == 401, f"Expected 401 for revoked token, got {revoked_api.status_code}"
        print("[PASS] Previous token immediately invalidated with 401 Unauthorized")

        # 12. Action: Soft Delete User
        print("\n--- Testing Soft Delete Action ---")
        delete_resp = client.delete(
            f"/admin/users/{test_user.id}?reason=GDPR+erasure+request",
            headers=admin_headers
        )
        assert delete_resp.status_code == 200
        assert delete_resp.json()["is_deleted"] is True
        print("[PASS] User soft-deleted successfully")

        # Deleted user login must be denied
        deleted_login = client.post(
            "/auth/login",
            json={"email": test_user_email, "password": test_user_pw}
        )
        assert deleted_login.status_code in [401, 403, 404]
        print(f"[PASS] Soft-deleted user login denied ({deleted_login.status_code})")

        # 13. Usage & Limits Endpoint
        print("\n--- Testing Admin Usage & Abuse Detection Endpoint ---")
        usage_resp = client.get("/admin/usage", headers=admin_headers)
        assert usage_resp.status_code == 200
        usage_data = usage_resp.json()
        assert "total_system_cost" in usage_data
        assert "total_system_generations" in usage_data
        assert "flagged_count" in usage_data
        assert "flagged_users" in usage_data
        assert "users_usage" in usage_data
        print(f"[PASS] Usage report retrieved: {len(usage_data['users_usage'])} user records, {usage_data['flagged_count']} abuse flags")

        # 14. Audit Logs Verification
        print("\n--- Testing Audit Logs Verification ---")
        audit_resp = client.get("/admin/audit-logs", headers=admin_headers)
        assert audit_resp.status_code == 200
        audit_data = audit_resp.json()
        assert "logs" in audit_data
        logs = audit_data["logs"]
        assert len(logs) >= 5, f"Expected at least 5 audit logs, found {len(logs)}"

        logged_actions = {l["action"] for l in logs}
        print(f"Logged actions found: {logged_actions}")
        expected_actions = {
            "suspend_user", "reactivate_user", "change_plan",
            "reset_usage", "force_logout", "soft_delete_user"
        }
        for act in expected_actions:
            assert act in logged_actions, f"Expected action '{act}' in audit logs"

        # Verify filter by action
        filter_resp = client.get("/admin/audit-logs?action=suspend_user", headers=admin_headers)
        assert filter_resp.status_code == 200
        filtered_logs = filter_resp.json()["logs"]
        assert all(l["action"] == "suspend_user" for l in filtered_logs)
        print(f"[PASS] Filtered audit logs by action 'suspend_user' returned {len(filtered_logs)} items")

        print("\n" + "=" * 70)
        print("[ALL ADMIN PORTAL TESTS PASSED PERFECTLY]")
        print("=" * 70)

    finally:
        # Cleanup test records
        try:
            db.query(AuditLog).filter(AuditLog.admin_id.in_([test_admin.id, admin.id])).delete(synchronize_session=False)
            db.query(User).filter(User.id.in_([test_user.id, test_admin.id])).delete(synchronize_session=False)
            db.commit()
        except Exception:
            db.rollback()
        finally:
            db.close()

if __name__ == "__main__":
    run_tests()
