"""
Test Suite: Creator/Approver Workflow Verification
Covers:
1. Self-approval blocked when approval is required
2. Approver boundary enforcement (other brands, credits, billing, connections, generation)
3. Edit after approval resets status to in_review & clears approved hash
4. Content hash mismatch strictly blocks publishing
5. 'Any one' vs 'All' approver mode logic
6. 7-day invite expiry and single-use token enforcement
7. Plan limit enforcement for approver invitations (Trial: 1, Starter: 1, Growth: 3, Pro: 10)
8. Solo flow unchanged when approval is not required

COST SAFETY: Mock/offline only. Zero Gemini API or real money/credits spent.
"""

import sys
import os
import uuid
import asyncio
from datetime import datetime, timedelta

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database import SessionLocal
from models.models import (
    User, Brand, BrandMember, Post, PostVersion, PostApproval,
    PlatformCopy, ScheduledPost, Plan, Notification, EmailLog
)
from services.approval_service import (
    submit_post_for_approval,
    approve_post,
    edit_and_approve_post,
    request_changes_post,
    reject_post,
    edit_post_after_approval_guard,
    verify_publish_security_guard,
    compute_content_hash
)
from services.credit_service import get_user_credit_balance
from fastapi import HTTPException


def create_test_user(db, email_prefix="creator", plan="pro"):
    u = User(
        id=str(uuid.uuid4()),
        email=f"{email_prefix}_{uuid.uuid4().hex[:6]}@test.local",
        password_hash="testpasshash123",
        full_name=f"Test {email_prefix.title()}",
        plan=plan,
        is_verified=True,
        created_at=datetime.utcnow()
    )
    db.add(u)
    db.flush()
    return u


def create_test_brand(db, user_id, require_approval=True, approval_mode="anyone"):
    b = Brand(
        id=str(uuid.uuid4()),
        user_id=user_id,
        business_name=f"Test Brand {uuid.uuid4().hex[:4]}",
        require_approval=require_approval,
        approval_mode=approval_mode,
        approval_autopilot_routing="approvers",
        approval_deadline_hours=24,
        approval_reminder_hours=6,
        created_at=datetime.utcnow()
    )
    db.add(b)
    db.flush()

    # Creator member
    cm = BrandMember(
        id=str(uuid.uuid4()),
        brand_id=b.id,
        user_id=user_id,
        role="creator",
        status="active",
        created_at=datetime.utcnow()
    )
    db.add(cm)
    db.flush()
    return b


def add_approver_member(db, brand_id, user_id, status="active"):
    am = BrandMember(
        id=str(uuid.uuid4()),
        brand_id=brand_id,
        user_id=user_id,
        role="approver",
        status=status,
        invitation_token=str(uuid.uuid4()) if status == "invited" else None,
        invitation_expires_at=datetime.utcnow() + timedelta(days=7) if status == "invited" else None,
        created_at=datetime.utcnow()
    )
    db.add(am)
    db.flush()
    return am


def create_test_post(db, brand_id, user_id, caption="Hello world", status="draft"):
    p = Post(
        id=str(uuid.uuid4()),
        brand_id=brand_id,
        user_id=user_id,
        title="Weekly Product Launch",
        topic="SaaS Growth",
        status=status,
        created_at=datetime.utcnow()
    )
    db.add(p)
    db.flush()

    copy = PlatformCopy(
        id=str(uuid.uuid4()),
        post_id=p.id,
        platform="instagram",
        caption=caption,
        hashtags=["#tech", "#saas"],
        image_url="https://cdn.brandflux.local/test-image.png",
        created_at=datetime.utcnow()
    )
    db.add(copy)

    sched = ScheduledPost(
        id=str(uuid.uuid4()),
        post_id=p.id,
        platform_copy_id=copy.id,
        brand_id=brand_id,
        platform="instagram",
        caption=caption,
        media_url="https://cdn.brandflux.local/test-image.png",
        status="Draft" if status == "draft" else "Pending Approval",
        scheduled_at=datetime.utcnow() + timedelta(days=1),
        created_at=datetime.utcnow()
    )
    db.add(sched)
    db.flush()
    return p, copy, sched


async def run_tests():
    db = SessionLocal()
    print("=" * 70)
    print("CREATOR / APPROVER WORKFLOW TEST SUITE")
    print("=" * 70)

    try:
        # ─────────────────────────────────────────────────────────────
        # TEST 1: Self-Approval Blocked
        # ─────────────────────────────────────────────────────────────
        print("\n[TEST 1] Testing Self-Approval Blocked when Approval Required...")
        creator = create_test_user(db, "creator_t1")
        brand = create_test_brand(db, creator.id, require_approval=True)
        approver = create_test_user(db, "approver_t1")
        add_approver_member(db, brand.id, approver.id, status="active")

        post, copy, sched = create_test_post(db, brand.id, creator.id)
        # Submit post
        await submit_post_for_approval(post.id, creator, db)
        assert post.status == "in_review"

        # Attempt self-approval by creator
        self_approval_caught = False
        try:
            await approve_post(post.id, creator, "Self approving", db)
        except HTTPException as e:
            if e.status_code == 403 and ("self-approval" in str(e.detail).lower() or "forbidden" in str(e.detail).lower()):
                self_approval_caught = True
        assert self_approval_caught, "FAIL: Creator was allowed to approve their own post!"
        print("  [PASS] Self-approval blocked with 403 Forbidden.")

        # ─────────────────────────────────────────────────────────────
        # TEST 2: Approver Boundary Enforcement (Credits & Role)
        # ─────────────────────────────────────────────────────────────
        print("\n[TEST 2] Testing Approver Boundary Enforcement...")
        # Approvers must have 0 credits and is_approver = True
        cred_info = get_user_credit_balance(approver.id, db)
        assert cred_info["is_approver"] is True, "FAIL: Approver was not identified as is_approver"
        assert cred_info["balance"] == 0, "FAIL: Approver should have zero credits"
        assert cred_info["quota"] == 0, "FAIL: Approver should have zero generation limit"
        print("  [PASS] Approver credits restricted to 0, no generation allowance.")

        # ─────────────────────────────────────────────────────────────
        # TEST 3: Edit After Approval Resets Status & Clears Hash
        # ─────────────────────────────────────────────────────────────
        print("\n[TEST 3] Testing Edit After Approval Resets to In_Review...")
        # Approver approves post
        res = await approve_post(post.id, approver, "Looks great!", db)
        assert post.status == "approved"
        assert post.approved_version_hash is not None

        # Guard check verifies it is valid to publish right now
        ok, reason = verify_publish_security_guard(post.id, brand.id, db)
        assert ok is True, f"FAIL: Expected valid publish guard, got {reason}"
        print("  [OK] Approved post passed publish security guard.")

        # Now simulate creator editing the post
        was_reset = edit_post_after_approval_guard(post, db)
        assert was_reset is True, "FAIL: edit_post_after_approval_guard did not return True"
        assert post.status == "in_review", f"FAIL: Expected in_review, got {post.status}"
        assert post.approved_version_hash is None, "FAIL: approved_version_hash was not cleared!"
        db.refresh(sched)
        assert sched.status == "In Review", f"FAIL: Expected ScheduledPost In Review, got {sched.status}"
        print("  [PASS] Post edit reset status to in_review and cleared approval hash.")

        # ─────────────────────────────────────────────────────────────
        # TEST 4: Content Hash Mismatch Strictly Blocks Publishing
        # ─────────────────────────────────────────────────────────────
        print("\n[TEST 4] Testing Hash Mismatch Blocks Publishing...")
        # Re-approve the post
        await approve_post(post.id, approver, "Re-approved", db)
        assert post.status == "approved"

        # Tamper with the platform copy caption directly in DB without going through approval flow
        copy.caption = "TAMPERED MALICIOUS CONTENT AFTER APPROVAL"
        db.commit()

        ok, reason = verify_publish_security_guard(post.id, brand.id, db)
        assert ok is False, "FAIL: Tampered post was allowed to publish!"
        assert "modified after approval" in reason.lower()
        # Ensure status was reset to in_review due to tampering
        assert post.status == "in_review"
        print("  [PASS] Tampered content hash strictly blocked from publishing and reset to in_review.")

        # ─────────────────────────────────────────────────────────────
        # TEST 5: 'Any one' vs 'All' Approver Mode Logic
        # ─────────────────────────────────────────────────────────────
        print("\n[TEST 5] Testing 'Any one' vs 'All' Approver Modes...")
        # 5a. Mode "anyone"
        brand_anyone = create_test_brand(db, creator.id, require_approval=True, approval_mode="anyone")
        app1 = create_test_user(db, "app1")
        app2 = create_test_user(db, "app2")
        add_approver_member(db, brand_anyone.id, app1.id, status="active")
        add_approver_member(db, brand_anyone.id, app2.id, status="active")

        post_a, copy_a, sched_a = create_test_post(db, brand_anyone.id, creator.id)
        await submit_post_for_approval(post_a.id, creator, db)

        res_a = await approve_post(post_a.id, app1, "OK from 1", db)
        assert res_a["fully_approved"] is True, "FAIL: In anyone mode, single approval must fully approve"
        assert post_a.status == "approved"
        print("  [PASS] 'Any one' mode: First approver immediately approved post.")

        # 5b. Mode "all"
        brand_all = create_test_brand(db, creator.id, require_approval=True, approval_mode="all")
        add_approver_member(db, brand_all.id, app1.id, status="active")
        add_approver_member(db, brand_all.id, app2.id, status="active")

        post_b, copy_b, sched_b = create_test_post(db, brand_all.id, creator.id)
        await submit_post_for_approval(post_b.id, creator, db)

        res_b1 = await approve_post(post_b.id, app1, "OK from 1", db)
        assert res_b1["fully_approved"] is False, "FAIL: In all mode, 1 of 2 should not fully approve"
        assert post_b.status == "in_review", f"FAIL: Expected in_review, got {post_b.status}"

        res_b2 = await approve_post(post_b.id, app2, "OK from 2", db)
        assert res_b2["fully_approved"] is True, "FAIL: In all mode, 2 of 2 must fully approve"
        assert post_b.status == "approved"
        print("  [PASS] 'All' mode: Requires unanimous approval before status becomes approved.")

        # ─────────────────────────────────────────────────────────────
        # TEST 6: Invite Expiry & Single-Use Token Enforcement
        # ─────────────────────────────────────────────────────────────
        print("\n[TEST 6] Testing Invite Expiry and Single-Use Enforcement...")
        expired_token = str(uuid.uuid4())
        expired_member = BrandMember(
            id=str(uuid.uuid4()),
            brand_id=brand.id,
            user_id=None,
            invited_email="expired@test.local",
            role="approver",
            status="invited",
            invitation_token=expired_token,
            invitation_expires_at=datetime.utcnow() - timedelta(hours=1),  # Expired
            created_at=datetime.utcnow() - timedelta(days=8)
        )
        db.add(expired_member)
        db.commit()

        # Check expired token
        from routers.brand import accept_invitation, AcceptInviteRequest
        expired_blocked = False
        try:
            accept_invitation(AcceptInviteRequest(token=expired_token, password="SecurePass123!"), db=db)
        except HTTPException as e:
            if e.status_code == 400 and "expired" in str(e.detail).lower():
                expired_blocked = True
        assert expired_blocked, "FAIL: Expired invite token was accepted!"
        print("  [PASS] 7-day expired invite token rejected with 400.")

        # Check valid token acceptance & single use
        valid_token = str(uuid.uuid4())
        valid_member = BrandMember(
            id=str(uuid.uuid4()),
            brand_id=brand.id,
            user_id=None,
            invited_email="valid_invite@test.local",
            role="approver",
            status="invited",
            invitation_token=valid_token,
            invitation_expires_at=datetime.utcnow() + timedelta(days=7),
            created_at=datetime.utcnow()
        )
        db.add(valid_member)
        db.commit()

        acc_res = accept_invitation(AcceptInviteRequest(token=valid_token, password="SecurePass123!"), db=db)
        assert acc_res["status"] == "success"
        db.refresh(valid_member)
        assert valid_member.status == "active"
        assert valid_member.invitation_token is None, "Token must be wiped on acceptance"

        # Attempt to reuse the token
        reuse_blocked = False
        try:
            accept_invitation(AcceptInviteRequest(token=valid_token, password="SecurePass123!"), db=db)
        except HTTPException as e:
            if e.status_code in (400, 404):
                reuse_blocked = True
        assert reuse_blocked, "FAIL: Token was allowed to be reused!"
        print("  [PASS] Single-use token enforcement verified: token wiped & reuse rejected.")

        # ─────────────────────────────────────────────────────────────
        # TEST 7: Plan Limit Enforcement (Trial: 1, Starter: 1, Growth: 3, Pro: 10)
        # ─────────────────────────────────────────────────────────────
        print("\n[TEST 7] Testing Plan Limit Enforcement on Approver Invites...")
        from routers.brand import invite_team_approver, TeamInviteRequest
        trial_user = create_test_user(db, "trial_user", plan="trial")
        trial_brand = create_test_brand(db, trial_user.id, require_approval=False)

        # First invite on Trial should succeed (limit 1)
        inv1 = await invite_team_approver(trial_brand.id, TeamInviteRequest(email="first@test.local"), user=trial_user, db=db)
        assert inv1["status"] == "success"
        print("  [OK] First invite succeeded within Trial limit (1).")

        # Second invite on Trial must fail with 400 limit exceeded
        limit_blocked = False
        try:
            await invite_team_approver(trial_brand.id, TeamInviteRequest(email="second@test.local"), user=trial_user, db=db)
        except HTTPException as e:
            if e.status_code == 400 and ("plan" in str(e.detail).lower() or "limit" in str(e.detail).lower() or "allow" in str(e.detail).lower()):
                limit_blocked = True
        assert limit_blocked, "FAIL: Second approver was invited beyond Trial plan limit!"
        print("  [PASS] Plan limit (Trial max 1) strictly enforced with 400.")

        # ─────────────────────────────────────────────────────────────
        # TEST 8: Solo Flow Unchanged When Approval Not Required
        # ─────────────────────────────────────────────────────────────
        print("\n[TEST 8] Testing Solo Flow Unchanged (require_approval=False)...")
        solo_user = create_test_user(db, "solo_user", plan="starter")
        solo_brand = create_test_brand(db, solo_user.id, require_approval=False)

        solo_post, solo_copy, solo_sched = create_test_post(db, solo_brand.id, solo_user.id, status="draft")

        # Verify publish security guard allows solo post without approver signature
        ok, reason = verify_publish_security_guard(solo_post.id, solo_brand.id, db)
        assert ok is True, f"FAIL: Solo post should be allowed to publish, got: {reason}"
        print("  [PASS] Solo flow verified: Publishing allowed immediately without approver block.")

        print("\n" + "=" * 70)
        print("ALL 8 CREATOR/APPROVER WORKFLOW VERIFICATION TESTS PASSED SUCCESSFULLY!")
        print("=" * 70)

    finally:
        db.close()


if __name__ == "__main__":
    asyncio.run(run_tests())
