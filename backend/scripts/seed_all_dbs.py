import sqlite3
import os
import sys

# Ensure backend root is on sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from services.auth_service import hash_password
from config import ADMIN_EMAIL, ADMIN_PASSWORD

admin_pw_hash = hash_password(ADMIN_PASSWORD)

db_paths = [
    os.path.abspath("brandai.db"),
    os.path.abspath("backend/brandai.db")
]

for p in db_paths:
    if os.path.exists(p):
        conn = sqlite3.connect(p)
        cur = conn.cursor()
        # Delete old admin if exists to ensure clean state
        cur.execute("DELETE FROM users WHERE email = ?", (ADMIN_EMAIL,))
        # Insert admin
        cur.execute("""
            INSERT INTO users (
                id, email, password_hash, full_name, plan,
                posts_used_this_month, active_brand_id, role,
                is_suspended, is_deleted, token_version
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            "admin-root-001", ADMIN_EMAIL, admin_pw_hash, "System Administrator",
            "pro", 0, None, "admin", 0, 0, 1
        ))
        conn.commit()
        cur.execute("SELECT id, email, role FROM users WHERE email = ?", (ADMIN_EMAIL,))
        print(f"Verified in {p}: {cur.fetchone()}")
        conn.close()

print("[DONE] Admin inserted and verified in all database files!")

