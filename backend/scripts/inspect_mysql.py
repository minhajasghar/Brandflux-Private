import sys
sys.path.insert(0, 'backend')
from database import engine
from sqlalchemy import text

with engine.connect() as con:
    # 1. Check users columns
    res = con.execute(text("DESCRIBE users"))
    user_cols = [r[0] for r in res.fetchall()]
    print("MySQL users columns:", user_cols)

    # 2. Check if credit_ledger exists
    res = con.execute(text("SHOW TABLES LIKE 'credit_ledger'"))
    print("credit_ledger in MySQL:", res.fetchall())

    # 3. Check fake published rows in platform_copies
    res = con.execute(text("""
        SELECT id, post_id, platform, status, external_post_id, permalink 
        FROM platform_copies 
        WHERE LOWER(status) = 'published' AND (external_post_id IS NULL OR external_post_id = '')
    """))
    fake_copies = res.fetchall()
    print(f"\nFake published in platform_copies: {len(fake_copies)}")
    for r in fake_copies[:10]:
        print(r)

    # 4. Check fake published in scheduled_posts
    res = con.execute(text("""
        SELECT id, platform, status, external_post_id 
        FROM scheduled_posts 
        WHERE LOWER(status) = 'published' AND (external_post_id IS NULL OR external_post_id = '')
    """))
    fake_sched = res.fetchall()
    print(f"\nFake published in scheduled_posts: {len(fake_sched)}")
    for r in fake_sched[:10]:
        print(r)

