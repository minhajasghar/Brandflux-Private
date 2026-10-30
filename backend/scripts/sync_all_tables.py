import sqlite3
import os

db_locations = [
    os.path.abspath("brandai.db"),
    os.path.abspath("backend/brandai.db")
]

for db_path in db_locations:
    if os.path.exists(db_path):
        print(f"Checking {db_path}...")
        conn = sqlite3.connect(db_path)
        cur = conn.cursor()

        # 1. Check brands table
        cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='brands'")
        if cur.fetchone():
            cur.execute("PRAGMA table_info(brands)")
            cols = [row[1] for row in cur.fetchall()]
            print(f"  brands columns: {cols}")
            missing_brands = [
                ("name", "VARCHAR(255)", "NULL"),
                ("brand_kit", "JSON", "NULL"),
                ("is_active", "BOOLEAN", "1")
            ]
            for col_name, col_type, default_val in missing_brands:
                if col_name not in cols:
                    print(f"  -> Adding {col_name} to brands in {db_path}...")
                    cur.execute(f"ALTER TABLE brands ADD COLUMN {col_name} {col_type} DEFAULT {default_val}")
                    conn.commit()

        # 2. Check users table
        cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='users'")
        if cur.fetchone():
            cur.execute("PRAGMA table_info(users)")
            cols = [row[1] for row in cur.fetchall()]
            missing_users = [
                ("active_brand_id", "VARCHAR(36)", "NULL"),
                ("role", "VARCHAR(20)", "'user'"),
                ("is_suspended", "BOOLEAN", "0"),
                ("is_deleted", "BOOLEAN", "0"),
                ("deleted_at", "DATETIME", "NULL"),
                ("token_version", "INTEGER", "1"),
                ("last_active_at", "DATETIME", "NULL"),
            ]
            for col_name, col_type, default_val in missing_users:
                if col_name not in cols:
                    print(f"  -> Adding {col_name} to users in {db_path}...")
                    cur.execute(f"ALTER TABLE users ADD COLUMN {col_name} {col_type} DEFAULT {default_val}")
                    conn.commit()

        conn.close()
        print(f"  [OK] {db_path} synchronized.")

print("[COMPLETE] All tables and columns are 100% synchronized.")

