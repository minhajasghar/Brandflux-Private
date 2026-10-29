import sys
import os

# Ensure backend directory is in sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from database import SessionLocal, engine
import models.models as models
from services.admin_service import seed_initial_admin
from sqlalchemy import inspect, text

def main():
    inspector = inspect(engine)
    existing_tables = inspector.get_table_names()
    print("Existing tables:", existing_tables)

    if "users" in existing_tables:
        cols = [c["name"] for c in inspector.get_columns("users")]
        print("Existing users columns:", cols)

        with engine.connect() as conn:
            missing_cols = [
                ("role", "VARCHAR(20)", "'user'"),
                ("is_suspended", "BOOLEAN", "0"),
                ("is_deleted", "BOOLEAN", "0"),
                ("deleted_at", "DATETIME", "NULL"),
                ("token_version", "INTEGER", "1"),
                ("last_active_at", "DATETIME", "NULL"),
            ]
            for col_name, col_type, default_val in missing_cols:
                if col_name not in cols:
                    print(f"Adding column {col_name} to users table...")
                    conn.execute(text(f"ALTER TABLE users ADD COLUMN {col_name} {col_type} DEFAULT {default_val}"))
                    conn.commit()

    models.Base.metadata.create_all(bind=engine)
    print("Database metadata created/synced successfully.")

    db = SessionLocal()
    try:
        admin = seed_initial_admin(db)
        if admin:
            print(f"[OK] Seeded/verified admin: {admin.email} (Role: {admin.role})")
        else:
            print("[WARN] Admin not seeded")
    finally:
        db.close()

if __name__ == "__main__":
    main()
