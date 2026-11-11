import sys
import os
sys.path.append(os.path.abspath("backend"))

from database import engine
from sqlalchemy import text

def run_migration():
    print("Running Persistence Policy Migration...")
    with engine.connect() as conn:
        # 1. Modify session_variants.expires_at to NULLABLE
        print("Modifying session_variants.expires_at to NULLABLE...")
        conn.execute(text("ALTER TABLE session_variants MODIFY COLUMN expires_at DATETIME NULL DEFAULT NULL;"))
        
        # 2. Clear all existing expires_at timestamps
        print("Clearing expires_at on all session_variants...")
        res1 = conn.execute(text("UPDATE session_variants SET expires_at = NULL WHERE expires_at IS NOT NULL;"))
        
        print("Clearing expires_at on all post_images...")
        res2 = conn.execute(text("UPDATE post_images SET expires_at = NULL WHERE expires_at IS NOT NULL;"))
        
        conn.commit()
        print(f"Migration completed successfully. Updated {res1.rowcount} session_variants and {res2.rowcount} post_images.")

if __name__ == "__main__":
    run_migration()

