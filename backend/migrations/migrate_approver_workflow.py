import os
import sys
from datetime import datetime

backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from database import engine, SessionLocal
from models.models import Brand, User, Plan, BrandMember, PostVersion, PostApproval
from sqlalchemy import text, inspect

def run_migration():
    print("Beginning migration for Creator/Approver workflow...")
    inspector = inspect(engine)
    existing_tables = inspector.get_table_names()

    # 1. Create brand_members if not exists
    if "brand_members" not in existing_tables:
        BrandMember.__table__.create(bind=engine)
        print("Created table: brand_members")
    else:
        print("Table brand_members already exists.")

    # 2. Create post_versions if not exists
    if "post_versions" not in existing_tables:
        PostVersion.__table__.create(bind=engine)
        print("Created table: post_versions")
    else:
        print("Table post_versions already exists.")

    # 3. Create post_approvals if not exists
    if "post_approvals" not in existing_tables:
        PostApproval.__table__.create(bind=engine)
        print("Created table: post_approvals")
    else:
        print("Table post_approvals already exists.")

    # Re-inspect columns for alterations
    inspector = inspect(engine)
    brand_cols = [c['name'] for c in inspector.get_columns('brands')]
    plan_cols = [c['name'] for c in inspector.get_columns('plans')]
    post_cols = [c['name'] for c in inspector.get_columns('posts')]
    sched_cols = [c['name'] for c in inspector.get_columns('scheduled_posts')]

    with engine.begin() as conn:
        # Brands columns
        brand_additions = [
            ("require_approval", "BOOLEAN NOT NULL DEFAULT 0"),
            ("approval_mode", "VARCHAR(20) NOT NULL DEFAULT 'anyone'"),
            ("approval_autopilot_routing", "VARCHAR(20) NOT NULL DEFAULT 'approvers'"),
            ("approval_deadline_hours", "INT NOT NULL DEFAULT 24"),
            ("approval_reminder_hours", "INT NOT NULL DEFAULT 6"),
        ]
        for col_name, col_def in brand_additions:
            if col_name not in brand_cols:
                try:
                    conn.execute(text(f"ALTER TABLE brands ADD COLUMN {col_name} {col_def}"))
                    print(f"Added column {col_name} to brands.")
                except Exception as e:
                    print(f"Error adding {col_name} to brands: {e}")

        # Plans columns
        if "max_approvers" not in plan_cols:
            try:
                conn.execute(text("ALTER TABLE plans ADD COLUMN max_approvers INT NOT NULL DEFAULT 1"))
                print("Added column max_approvers to plans.")
            except Exception as e:
                print(f"Error adding max_approvers to plans: {e}")

        # Posts columns
        if "status" not in post_cols:
            try:
                conn.execute(text("ALTER TABLE posts ADD COLUMN status VARCHAR(50) NOT NULL DEFAULT 'draft'"))
                print("Added column status to posts.")
            except Exception as e:
                print(f"Error adding status to posts: {e}")

        if "approved_version_hash" not in post_cols:
            try:
                conn.execute(text("ALTER TABLE posts ADD COLUMN approved_version_hash VARCHAR(64) NULL"))
                print("Added column approved_version_hash to posts.")
            except Exception as e:
                print(f"Error adding approved_version_hash to posts: {e}")

        # Scheduled Posts columns
        if "approved_version_hash" not in sched_cols:
            try:
                conn.execute(text("ALTER TABLE scheduled_posts ADD COLUMN approved_version_hash VARCHAR(64) NULL"))
                print("Added column approved_version_hash to scheduled_posts.")
            except Exception as e:
                print(f"Error adding approved_version_hash to scheduled_posts: {e}")

    # Seed plan limits & backfill brand owners
    db = SessionLocal()
    try:
        plan_limits = {
            "trial": 1,
            "starter": 1,
            "growth": 3,
            "pro": 10
        }
        for pid, limit in plan_limits.items():
            plan_obj = db.query(Plan).filter(Plan.id == pid).first()
            if plan_obj:
                plan_obj.max_approvers = limit
        db.commit()
        print("Updated max_approvers in plans table (Trial 1, Starter 1, Growth 3, Pro 10).")

        # Backfill brand creators into brand_members
        brands = db.query(Brand).all()
        created_count = 0
        for b in brands:
            if not b.user_id:
                continue
            existing_creator = db.query(BrandMember).filter(
                BrandMember.brand_id == b.id,
                BrandMember.role == "creator"
            ).first()
            if not existing_creator:
                member = BrandMember(
                    brand_id=b.id,
                    user_id=b.user_id,
                    role="creator",
                    status="active"
                )
                db.add(member)
                created_count += 1
        db.commit()
        print(f"Backfilled {created_count} brand creators into brand_members.")
    finally:
        db.close()

    print("Approver workflow migration completed successfully!")

if __name__ == "__main__":
    run_migration()
