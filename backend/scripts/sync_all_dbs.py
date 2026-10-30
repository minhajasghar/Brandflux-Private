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
        cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='users'")
        if cur.fetchone():
            cur.execute("PRAGMA table_info(users)")
            cols = [row[1] for row in cur.fetchall()]
            print(f"  Existing columns: {cols}")

            missing = [
                ("active_brand_id", "VARCHAR(36)", "NULL"),
                ("role", "VARCHAR(20)", "'user'"),
                ("is_suspended", "BOOLEAN", "0"),
                ("is_deleted", "BOOLEAN", "0"),
                ("deleted_at", "DATETIME", "NULL"),
                ("token_version", "INTEGER", "1"),
                ("last_active_at", "DATETIME", "NULL"),
            ]
            for col_name, col_type, default_val in missing:
                if col_name not in cols:
                    print(f"  -> Adding {col_name} to {db_path}...")
                    cur.execute(f"ALTER TABLE users ADD COLUMN {col_name} {col_type} DEFAULT {default_val}")
                    conn.commit()
            print(f"  [OK] {db_path} fully synced.")
        conn.close()
    else:
        print(f"File not found: {db_path}")

print("All database files updated successfully.")
