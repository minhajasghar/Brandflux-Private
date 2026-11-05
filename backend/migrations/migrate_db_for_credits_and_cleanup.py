"""
Comprehensive Database Migration & Data Cleanup Script.
Handles both MySQL and SQLite based on the active engine.
1. Ensures credit_ledger table exists and is seeded with monthly allowances.
2. Ensures users table has pending_email, email_change_token, email_change_expires_at.
3. Finds every platform copy with status 'published' but without external_post_id/permalink,
   resets them to 'not posted yet' (draft), and logs the audit event.
"""
import os
import sys
import uuid
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database import engine, SessionLocal
from models.models import User, CreditLedger, PlatformCopy, ScheduledPost, AuditLog
from sqlalchemy import text, inspect

def run_migration():
    print(f"Connecting to database via engine: {engine.url}")
    inspector = inspect(engine)
    existing_tables = inspector.get_table_names()
    
    with engine.connect() as con:
        # 1. Ensure credit_ledger table exists
        if "credit_ledger" not in existing_tables:
            print("Creating table credit_ledger...")
            CreditLedger.__table__.create(bind=engine, checkfirst=True)
            print("credit_ledger table created.")
        else:
            print("credit_ledger table already exists.")

        # 2. Ensure columns in users table
        user_cols = [c["name"] for c in inspector.get_columns("users")]
        for col_name, col_type in [
            ("pending_email", "VARCHAR(255)"),
            ("email_change_token", "VARCHAR(255)"),
            ("email_change_expires_at", "DATETIME")
        ]:
            if col_name not in user_cols:
                print(f"Adding column {col_name} to users table...")
                try:
                    con.execute(text(f"ALTER TABLE users ADD COLUMN {col_name} {col_type}"))
                    con.commit()
                    print(f"Added {col_name}.")
                except Exception as e:
                    print(f"Could not add {col_name}: {e}")

    # 3. Seed initial credit_ledger entries for active users if not present
    db = SessionLocal()
    try:
        users = db.query(User).all()
        PLAN_QUOTAS = {
            "free": 30,
            "starter": 30,
            "growth": 60,
            "pro": 150,
            "agency": 500
        }
        for u in users:
            ledger_count = db.query(CreditLedger).filter(CreditLedger.user_id == u.id).count()
            if ledger_count == 0:
                quota = PLAN_QUOTAS.get((u.plan or "starter").lower(), 30)
                used = int(u.posts_used_this_month or 0)
                # Seed monthly grant
                grant = CreditLedger(
                    id=str(uuid.uuid4()),
                    user_id=u.id,
                    delta=quota,
                    reason="monthly_grant",
                    reference_id="initial_grant",
                    created_at=datetime.utcnow()
                )
                db.add(grant)
                if used > 0:
                    deduct = min(used, quota - 1) if quota > 1 else used
                    hist = CreditLedger(
                        id=str(uuid.uuid4()),
                        user_id=u.id,
                        delta=-deduct,
                        reason="historical_usage",
                        reference_id="migration_sync",
                        created_at=datetime.utcnow()
                    )
                    db.add(hist)
                print(f"Seeded credit ledger for {u.email} (quota: {quota}, historical used: {used})")
        db.commit()

        # 4. Issue 4: DATA CLEANUP MIGRATION
        # Find every platform copy with status published but with no external_post_id / permalink
        fake_copies = db.query(PlatformCopy).filter(
            PlatformCopy.status.in_(["published", "Published", "PUBLISHED"]),
            (PlatformCopy.external_post_id == None) | (PlatformCopy.external_post_id == "")
        ).all()

        fake_sched = db.query(ScheduledPost).filter(
            ScheduledPost.status.in_(["published", "Published", "PUBLISHED"]),
            (ScheduledPost.external_post_id == None) | (ScheduledPost.external_post_id == "")
        ).all()

        total_cleaned = len(fake_copies) + len(fake_sched)
        print(f"\nFound {len(fake_copies)} fake published platform copies and {len(fake_sched)} fake scheduled posts.")

        cleaned_ids = []
        for copy in fake_copies:
            print(f"Resetting platform_copy {copy.id} ({copy.platform}) from '{copy.status}' to 'not posted yet'")
            copy.status = "draft"  # 'draft' maps to 'Not posted yet' in UI
            cleaned_ids.append(copy.id)

        for sched in fake_sched:
            print(f"Resetting scheduled_post {sched.id} ({sched.platform}) from '{sched.status}' to 'not posted yet'")
            sched.status = "draft"
            cleaned_ids.append(sched.id)

        # Record audit log
        audit = AuditLog(
            id=str(uuid.uuid4()),
            admin_id=None,
            admin_email="system@brandflux.ai",
            action="DATA_CLEANUP_FAKE_PUBLISHED",
            target_type="platform_copies",
            target_id=None,
            target_email=None,
            details={"cleaned_count": total_cleaned, "cleaned_ids": cleaned_ids},
            created_at=datetime.utcnow()
        )
        db.add(audit)
        db.commit()
        print(f"Audit log recorded. Total rows affected: {total_cleaned}")

    finally:
        db.close()

if __name__ == "__main__":
    run_migration()
