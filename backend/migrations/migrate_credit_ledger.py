"""
Migration script: create credit_ledger table and seed initial credit balances for users.
"""
import os
import sys
import uuid
from datetime import datetime
import sqlite3

# Adjust python path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

def run_migration():
    db_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "brandai.db")
    print(f"Applying credit_ledger migration on {db_path}...")
    
    con = sqlite3.connect(db_path)
    cur = con.cursor()
    
    cur.execute("""
    CREATE TABLE IF NOT EXISTS credit_ledger (
        id VARCHAR(36) PRIMARY KEY,
        user_id VARCHAR(36) NOT NULL,
        delta INTEGER NOT NULL,
        reason VARCHAR(100) NOT NULL,
        reference_id VARCHAR(100),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    """)
    cur.execute("CREATE INDEX IF NOT EXISTS ix_credit_ledger_user_id ON credit_ledger (user_id);")
    cur.execute("CREATE INDEX IF NOT EXISTS ix_credit_ledger_reference_id ON credit_ledger (reference_id);")
    con.commit()
    print("Table credit_ledger ensured.")
    
    # Check if users already have ledger entries
    cur.execute("SELECT id, email, plan, posts_used_this_month FROM users")
    users = cur.fetchall()
    
    PLAN_QUOTAS = {
        "free": 30,
        "starter": 30,
        "growth": 60,
        "pro": 150,
        "agency": 500
    }
    
    for uid, email, plan, used in users:
        cur.execute("SELECT COUNT(*) FROM credit_ledger WHERE user_id = ?", (uid,))
        count = cur.fetchone()[0]
        if count == 0:
            quota = PLAN_QUOTAS.get((plan or "free").lower(), 30)
            now_str = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
            # Seed monthly grant
            grant_id = str(uuid.uuid4())
            cur.execute("""
                INSERT INTO credit_ledger (id, user_id, delta, reason, reference_id, created_at)
                VALUES (?, ?, ?, 'monthly_grant', 'initial_migration_grant', ?)
            """, (grant_id, uid, quota, now_str))
            
            # If user had prior usage recorded in posts_used_this_month, record it in ledger
            used_cnt = int(used or 0)
            if used_cnt > 0:
                usage_deduction = min(used_cnt, quota - 1) if quota > 1 else used_cnt
                use_id = str(uuid.uuid4())
                cur.execute("""
                    INSERT INTO credit_ledger (id, user_id, delta, reason, reference_id, created_at)
                    VALUES (?, ?, ?, 'historical_usage', 'migration_sync', ?)
                """, (use_id, uid, -usage_deduction, now_str))
            print(f"Seeded credit ledger for user {email} (quota: {quota}, historical used: {used_cnt})")
            
    con.commit()
    con.close()
    print("Migration finished successfully.")

if __name__ == "__main__":
    run_migration()

