import sys
import os
import io
import uuid

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from fastapi.testclient import TestClient
from main import app
from database import SessionLocal
from models.models import User, AuditLog
from services.auth_service import hash_password, create_token

def test_portal_security_suite():
    print("=" * 70)
    print("STARTING STRICT PORTAL SECURITY & RBAC ENFORCEMENT SUITE")
    print("=" * 70)

    client = TestClient(app)
    db = SessionLocal()

    suffix = uuid.uuid4().hex[:6]

    # Create normal customer user
    normal_user = User(
        id=str(uuid.uuid4()),
        email=f"customer_{suffix}@test.com",
        full_name="Regular Customer",
        password_hash=hash_password("Customer123!"),
        plan="starter",
        role="user",
        is_suspended=False,
        is_deleted=False,
        token_version=1
    )

    # Create support admin (read-only)
    support_admin = User(
        id=str(uuid.uuid4()),
        email=f"support_{suffix}@brandflux.ai",
        full_name="Support Analyst",
        password_hash=hash_password("Support123!"),
        plan="pro",
        role="support_admin",
        is_suspended=False,
        is_deleted=False,
        token_version=1
    )

    # Create full admin (read-write)
    full_admin = User(
        id=str(uuid.uuid4()),
        email=f"superadmin_{suffix}@brandflux.ai",
        full_name="Super Admin",
        password_hash=hash_password("SuperAdmin123!"),
        plan="pro",
        role="admin",
        is_suspended=False,
        is_deleted=False,
        token_version=1
    )

    db.add_all([normal_user, support_admin, full_admin])
    db.commit()
    db.refresh(normal_user)
    db.refresh(support_admin)
    db.refresh(full_admin)

    user_token = create_token(normal_user.id, token_version=normal_user.token_version)
    support_token = create_token(support_admin.id, token_version=support_admin.token_version)
    admin_token = create_token(full_admin.id, token_version=full_admin.token_version)

    user_headers = {"Authorization": f"Bearer {user_token}"}
    support_headers = {"Authorization": f"Bearer {support_token}"}
    admin_headers = {"Authorization": f"Bearer {admin_token}"}

    try:
        # TEST 1: Customer (role="user") is strictly BLOCKED from ALL admin endpoints
        print("\n[TEST 1] Verifying Customer role is blocked with 403 on all /admin endpoints")
        admin_endpoints_to_test = [
            ("GET", "/admin/overview"),
            ("GET", "/admin/users"),
            ("GET", f"/admin/users/{normal_user.id}"),
            ("GET", "/admin/usage"),
            ("GET", "/admin/audit-logs"),
            ("GET", "/admin/scans"),
            ("GET", "/admin/feature-flags"),
            ("GET", "/admin/publishing/monitor"),
            ("GET", "/admin/plans"),
            ("GET", "/admin/system-health"),
            ("GET", "/admin/admins"),
            ("POST", f"/admin/users/{normal_user.id}/suspend"),
            ("PUT", f"/admin/users/{normal_user.id}/plan"),
            ("PUT", "/admin/feature-flags"),
        ]

        for method, endpoint in admin_endpoints_to_test:
            if method == "GET":
                resp = client.get(endpoint, headers=user_headers)
            elif method == "POST":
                resp = client.post(endpoint, headers=user_headers, json={})
            elif method == "PUT":
                resp = client.put(endpoint, headers=user_headers, json={})
            assert resp.status_code == 403, f"Expected 403 for {method} {endpoint}, got {resp.status_code}: {resp.text}"
            assert "Admin privileges required" in resp.json().get("detail", "")
        print("  -> PASS: All 13 admin endpoints blocked customer with 403 Forbidden.")

        # TEST 2: Support Admin read-only capabilities vs mutation blocks
        print("\n[TEST 2] Verifying Support Admin (read-only) RBAC boundaries")
        # Read endpoints must succeed
        read_endpoints = [
            "/admin/overview",
            "/admin/users",
            f"/admin/users/{normal_user.id}",
            "/admin/usage",
            "/admin/audit-logs",
            "/admin/scans",
            "/admin/feature-flags",
            "/admin/publishing/monitor",
            "/admin/plans",
            "/admin/system-health",
            "/admin/admins"
        ]
        for ep in read_endpoints:
            r = client.get(ep, headers=support_headers)
            assert r.status_code == 200, f"Expected 200 for support_admin on {ep}, got {r.status_code}"
        print("  -> PASS: Support Admin successfully accessed all 11 read endpoints.")

        # Mutation endpoints must be blocked with 403 Forbidden (require_admin_write)
        write_endpoints = [
            ("POST", f"/admin/users/{normal_user.id}/suspend", {"reason": "test"}),
            ("POST", f"/admin/users/{normal_user.id}/reactivate", {"reason": "test"}),
            ("PUT", f"/admin/users/{normal_user.id}/plan", {"plan": "growth"}),
            ("PUT", f"/admin/users/{normal_user.id}/limits", {"posts_used_this_month": 0}),
            ("POST", f"/admin/users/{normal_user.id}/reset-usage", {}),
            ("POST", f"/admin/users/{normal_user.id}/force-logout", {}),
            ("POST", f"/admin/users/{normal_user.id}/reset-password", {}),
            ("DELETE", f"/admin/users/{normal_user.id}", None),
            ("PUT", "/admin/feature-flags", {"emergency_kill_switch": False}),
            ("PUT", "/admin/plans", {"plans": {}}),
            ("POST", "/admin/admins", {"email": "newadmin@brandflux.ai", "full_name": "New", "password": "Pass", "role": "support_admin"})
        ]
        for meth, ep, payload in write_endpoints:
            if meth == "POST":
                r = client.post(ep, headers=support_headers, json=payload or {})
            elif meth == "PUT":
                r = client.put(ep, headers=support_headers, json=payload or {})
            elif meth == "DELETE":
                r = client.delete(ep, headers=support_headers)
            assert r.status_code == 403, f"Expected 403 on write for support_admin on {meth} {ep}, got {r.status_code}"
            assert "Write privileges required" in r.json().get("detail", "")
        print("  -> PASS: Support Admin strictly rejected with 403 on all 11 mutation endpoints.")

        # TEST 3: Suspended User is blocked everywhere (at login and all APIs)
        print("\n[TEST 3] Verifying Suspended User is blocked across login and API")
        # Suspend the customer using full admin
        sus_resp = client.post(
            f"/admin/users/{normal_user.id}/suspend",
            headers=admin_headers,
            json={"reason": "Terms violation"}
        )
        assert sus_resp.status_code == 200

        # Attempt login with suspended user
        login_resp = client.post(
            "/auth/login",
            json={"email": normal_user.email, "password": "Customer123!"}
        )
        assert login_resp.status_code == 403
        assert "suspended" in login_resp.json().get("detail", "").lower()
        print("  -> PASS: Suspended user denied at /auth/login with 403 Forbidden.")

        # Attempt API access with suspended user
        api_resp = client.get("/auth/me", headers=user_headers)
        assert api_resp.status_code == 403
        assert "suspended" in api_resp.json().get("detail", "").lower()
        print("  -> PASS: Suspended user denied at /auth/me with 403 Forbidden.")

        # Reactivate user
        react_resp = client.post(
            f"/admin/users/{normal_user.id}/reactivate",
            headers=admin_headers,
            json={"reason": "Resolved"}
        )
        assert react_resp.status_code == 200

        # TEST 4: Sanitization - No secrets, tokens, or password hashes in any responses
        print("\n[TEST 4] Verifying Zero Exposure of sensitive credentials across all admin responses")
        endpoints_to_audit = [
            f"/admin/users/{normal_user.id}",
            "/admin/users",
            "/admin/admins",
            "/admin/usage",
            "/admin/audit-logs"
        ]
        forbidden_substrings = ["password_hash", "$2b$", "access_token", "refresh_token"]

        for ep in endpoints_to_audit:
            r = client.get(ep, headers=admin_headers)
            assert r.status_code == 200
            text_body = r.text.lower()
            for secret in forbidden_substrings:
                assert secret not in text_body, f"CRITICAL LEAK: '{secret}' found in response from {ep}!"
        print("  -> PASS: Absolute zero credential leakage verified in all responses.")

        print("\n" + "=" * 70)
        print("ALL PORTAL SECURITY & RBAC TESTS COMPLETED SUCCESSFULLY!")
        print("=" * 70)

    finally:
        try:
            db.query(AuditLog).filter(AuditLog.admin_id.in_([full_admin.id, support_admin.id])).delete(synchronize_session=False)
            db.query(User).filter(User.id.in_([normal_user.id, support_admin.id, full_admin.id])).delete(synchronize_session=False)
            db.commit()
        except Exception:
            db.rollback()
        finally:
            db.close()

if __name__ == "__main__":
    test_portal_security_suite()
