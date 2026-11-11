import os
import sys
try:
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass
import uuid
from datetime import datetime, date, timedelta

# Ensure backend root is on sys.path
backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from database import engine, SessionLocal, upgrade_database_schema, Base
import models.models as models
from services.auth_service import hash_password

def run_database_schema_and_persistence_audit():
    print("=" * 70)
    print("DATABASE SCHEMA & PERSISTENCE DEEP AUDIT")
    print("=" * 70)

    # 1. Initialize schema & upgrade checks
    print("1. Creating tables and running schema upgrades...")
    Base.metadata.create_all(bind=engine)
    upgrade_database_schema(engine)

    from sqlalchemy import inspect
    inspector = inspect(engine)
    tables = inspector.get_table_names()
    print(f"[PASS] Found {len(tables)} tables in database:")
    for t in sorted(tables):
        cols = [c["name"] for c in inspector.get_columns(t)]
        print(f"   - {t} ({len(cols)} columns): {', '.join(cols[:5])}...")

    # Assert critical tables exist
    required_tables = [
        "users", "brands", "brand_members", "posts", "platform_copies",
        "post_images", "post_versions", "post_approvals", "scheduled_posts",
        "usage", "credit_ledger", "audit_logs", "notifications", "daily_sessions",
        "smart_questions", "user_answers", "system_settings", "plans"
    ]
    for rt in required_tables:
        assert rt in tables, f"Critical table missing: {rt}"
    print("[PASS] All required database tables exist!")

    # Check user table columns
    user_cols = {c["name"]: c for c in inspector.get_columns("users")}
    assert "is_approved" in user_cols, "users.is_approved missing!"
    assert "is_non_payment" in user_cols, "users.is_non_payment missing!"
    assert "approved_at" in user_cols, "users.approved_at missing!"
    assert "approved_by_id" in user_cols, "users.approved_by_id missing!"
    print("[PASS] User approval and non-payment columns verified on 'users' table!")

    db = SessionLocal()
    test_run_id = uuid.uuid4().hex[:8]

    try:
        # ─── 2. Test User Model & Approval State ───
        print("\n2. Testing User creation & approval transitions...")
        test_user = models.User(
            id=f"test_user_{test_run_id}",
            email=f"tester_{test_run_id}@example.com",
            password_hash=hash_password("SecurePassword123!"),
            full_name="Schema Test User",
            plan="trial",
            is_approved=False,
            is_verified=False,
            is_non_payment=False,
            trial_started_at=datetime.utcnow(),
            trial_ends_at=datetime.utcnow() + timedelta(days=14)
        )
        db.add(test_user)
        db.commit()
        db.refresh(test_user)

        assert test_user.is_approved is False, "Default is_approved must be False"
        assert test_user.is_non_payment is False, "Default is_non_payment must be False"
        print("[PASS] New user successfully created with locked (is_approved=False) status")

        # Admin approves user
        test_user.is_approved = True
        test_user.approved_at = datetime.utcnow()
        test_user.is_non_payment = True
        db.commit()
        db.refresh(test_user)

        assert test_user.is_approved is True
        assert test_user.is_non_payment is True
        assert test_user.approved_at is not None
        print("[PASS] User approval and non-payment updates saved properly")

        # ─── 3. Test Brand & Brand Kit Persistence ───
        print("\n3. Testing Brand and complex JSON fields persistence...")
        test_brand = models.Brand(
            id=f"test_brand_{test_run_id}",
            user_id=test_user.id,
            name="Brandflux Test Studio",
            business_name="Brandflux Test Studio Inc",
            tagline="AI Intelligence for Brands",
            business_type="SaaS",
            industry="Software & AI",
            target_audience="Founders, creators, and marketing managers",
            products_services=["AI Post Generator", "Brand Voice Analyzer", "Social Autopilot"],
            brand_kit={
                "palette": ["#1558C9", "#D4FF24", "#0D0F16"],
                "typography": {"primary": "Plus Jakarta Sans", "secondary": "Inter"},
                "tone": "Bold, Professional, Dynamic"
            },
            colors=["#1558C9", "#D4FF24", "#0D0F16"],
            primary_color="#1558C9",
            secondary_color="#D4FF24",
            website_url="https://brandflux.ai",
            scan_status="completed",
            onboarding_complete=True,
            require_approval=True,
            approval_mode="anyone"
        )
        db.add(test_brand)
        db.commit()
        db.refresh(test_brand)

        # Retrieve and verify all fields
        queried_brand = db.query(models.Brand).filter(models.Brand.id == test_brand.id).first()
        assert queried_brand is not None
        assert queried_brand.products_services == ["AI Post Generator", "Brand Voice Analyzer", "Social Autopilot"]
        assert queried_brand.brand_kit["typography"]["primary"] == "Plus Jakarta Sans"
        assert queried_brand.require_approval is True
        print("[PASS] Brand entity and JSON data structures saved and retrieved properly")

        # ─── 4. Test BrandMember & Approver Role Persistence ───
        print("\n4. Testing BrandMember and Approver Accounts...")
        test_approver_user = models.User(
            id=f"test_appr_{test_run_id}",
            email=f"approver_{test_run_id}@clientcorp.com",
            password_hash=hash_password("ApproverSecret123!"),
            full_name="Sarah Reviewer",
            role="user",
            plan="starter",
            is_approved=True,
            is_verified=True,
            active_brand_id=test_brand.id
        )
        db.add(test_approver_user)
        db.flush()

        member_entry = models.BrandMember(
            id=f"test_mem_{test_run_id}",
            brand_id=test_brand.id,
            user_id=test_approver_user.id,
            role="approver",
            status="active",
            invited_email=test_approver_user.email,
            accepted_at=datetime.utcnow()
        )
        db.add(member_entry)
        db.commit()
        db.refresh(member_entry)

        assert member_entry.status == "active"
        assert member_entry.role == "approver"
        assert member_entry.user.email == test_approver_user.email
        print("[PASS] Approver brand membership entity and relationships saved properly")

        # ─── 5. Test Post, PlatformCopies & PostImages ───
        print("\n5. Testing Post, PlatformCopy, and PostImage parent-child graph...")
        post = models.Post(
            id=f"test_post_{test_run_id}",
            brand_id=test_brand.id,
            user_id=test_user.id,
            title="Autumn Growth Campaign",
            topic="Product Launch Announcement",
            status="in_review"
        )
        db.add(post)
        db.flush()

        # Add image variant
        img = models.PostImage(
            id=f"test_img_{test_run_id}",
            post_id=post.id,
            image_url="/processed_images/test_hero.png",
            is_selected=True
        )
        db.add(img)

        # Add platform copies
        platforms = ["instagram", "linkedin", "facebook"]
        for p_name in platforms:
            copy = models.PlatformCopy(
                id=f"test_copy_{p_name}_{test_run_id}",
                post_id=post.id,
                platform=p_name,
                caption=f"Exciting news for {p_name}! Elevate your brand today.",
                hashtags=["#Brandflux", "#Marketing", "#Growth"],
                image_url="/processed_images/test_hero.png",
                status="pending_approval"
            )
            db.add(copy)

        db.commit()
        db.refresh(post)

        assert len(post.images) == 1
        assert len(post.platform_copies) == 3
        print("[PASS] Post parent-child hierarchy with multi-platform copies and images saved properly")

        # ─── 6. Test PostVersion and PostApproval ───
        print("\n6. Testing PostVersion and PostApproval audit snapshot persistence...")
        version = models.PostVersion(
            id=f"test_ver_{test_run_id}",
            post_id=post.id,
            brand_id=test_brand.id,
            version_number=1,
            submitted_by_id=test_user.id,
            captions={"instagram": "IG Copy", "linkedin": "LI Copy"},
            hashtags={"instagram": ["#test"]},
            image_url="/processed_images/test_hero.png",
            content_hash="abc123hash_snapshot",
            status="approved",
            decision="approved",
            decision_by_id=test_approver_user.id,
            decision_at=datetime.utcnow()
        )
        db.add(version)
        db.flush()

        approval_record = models.PostApproval(
            id=f"test_appr_rec_{test_run_id}",
            post_version_id=version.id,
            approver_id=test_approver_user.id,
            decision="approved",
            notes="LGTM, signed off!"
        )
        db.add(approval_record)
        db.commit()
        db.refresh(version)

        assert len(version.approvals) == 1
        assert version.approvals[0].decision == "approved"
        print("[PASS] PostVersion and PostApproval immutable decision records saved properly")

        # ─── 7. Test ScheduledPost and PostMetric ───
        print("\n7. Testing ScheduledPost and Metric records...")
        scheduled = models.ScheduledPost(
            id=f"test_sched_{test_run_id}",
            brand_id=test_brand.id,
            post_id=post.id,
            platform="instagram",
            caption="Live scheduled autumn post",
            media_url="/processed_images/test_hero.png",
            scheduled_at=datetime.utcnow() + timedelta(days=2),
            status="Scheduled",
            likes=42,
            comments=8,
            engagement_rate=4.5
        )
        db.add(scheduled)
        db.flush()

        metric = models.PostMetric(
            id=f"test_metric_{test_run_id}",
            post_id=scheduled.id,
            brand_id=test_brand.id,
            platform="instagram",
            likes=42,
            comments=8,
            reach=500,
            engagement_rate=4.5
        )
        db.add(metric)
        db.commit()
        db.refresh(scheduled)

        assert len(scheduled.metrics) == 1
        assert scheduled.metrics[0].reach == 500
        print("[PASS] ScheduledPost and PostMetric records saved properly")

        # ─── 8. Test CreditLedger, Usage, Notification & AuditLog ───
        print("\n8. Testing CreditLedger, Usage, Notification, and AuditLog persistence...")
        ledger_entry = models.CreditLedger(
            id=f"test_led_{test_run_id}",
            user_id=test_user.id,
            delta=30.0,
            reason="monthly_grant",
            reference_id="grant_init"
        )
        db.add(ledger_entry)

        usage_entry = models.Usage(
            id=f"test_use_{test_run_id}",
            user_id=test_user.id,
            brand_id=test_brand.id,
            feature="image_generation",
            model="gemini-nano-banana-2.1",
            cost=0.03,
            credits_used=1,
            status="success"
        )
        db.add(usage_entry)

        notif = models.Notification(
            id=f"test_notif_{test_run_id}",
            user_id=test_user.id,
            brand_id=test_brand.id,
            title="Post Approved",
            message="Your post has been approved by Sarah Reviewer",
            type="info"
        )
        db.add(notif)

        audit = models.AuditLog(
            id=f"test_audit_{test_run_id}",
            admin_id=None,
            admin_email="admin@brandflux.ai",
            action="admin_approve_user",
            target_type="user",
            target_id=test_user.id,
            target_email=test_user.email,
            details={"approved_by": "admin@brandflux.ai"}
        )
        db.add(audit)
        db.commit()

        # Query and verify
        queried_notif = db.query(models.Notification).filter(models.Notification.id == notif.id).first()
        queried_audit = db.query(models.AuditLog).filter(models.AuditLog.id == audit.id).first()
        assert queried_notif is not None
        assert queried_audit is not None
        assert queried_audit.details["approved_by"] == "admin@brandflux.ai"
        print("[PASS] Ledger, Usage, Notification, and AuditLog records saved properly")

        # ─── 9. Test Cascade Delete Integrity ───
        print("\n9. Testing cascade delete and relational integrity...")
        # Deleting the brand should cascade delete BrandMembers, Posts, PlatformCopies, Versions
        post_id = post.id
        db.delete(test_brand)
        db.commit()

        post_check = db.query(models.Post).filter(models.Post.id == post_id).first()
        assert post_check is None, "Post should have been cascade deleted with Brand"

        member_check = db.query(models.BrandMember).filter(models.BrandMember.id == member_entry.id).first()
        assert member_check is None, "BrandMember should have been cascade deleted with Brand"
        print("[PASS] Cascading deletes and referential integrity working flawlessly")

        # Cleanup test users
        db.delete(test_user)
        db.delete(test_approver_user)
        db.commit()
        print("[PASS] Test entities cleanly pruned")

        print("\n" + "=" * 70)
        print("ALL DATABASE SCHEMA & PERSISTENCE CHECKS PASSED WITH 100% SUCCESS!")
        print("=" * 70)
        return True

    except Exception as e:
        db.rollback()
        print(f"\n❌ Database schema audit failed: {e}")
        import traceback
        traceback.print_exc()
        return False
    finally:
        db.close()

if __name__ == "__main__":
    success = run_database_schema_and_persistence_audit()
    sys.exit(0 if success else 1)

