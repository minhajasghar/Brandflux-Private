import sys
sys.path.insert(0, 'backend')
from database import engine
from sqlalchemy import text

with engine.connect() as con:
    res = con.execute(text("SELECT status, count(*) FROM platform_copies GROUP BY status"))
    print("Platform copies status counts:")
    for r in res.fetchall():
        print(r)

    res = con.execute(text("SELECT status, count(*) FROM scheduled_posts GROUP BY status"))
    print("\nScheduled posts status counts:")
    for r in res.fetchall():
        print(r)

    res = con.execute(text("""
        SELECT id, platform, status, external_post_id, permalink 
        FROM platform_copies 
        WHERE (external_post_id IS NULL OR external_post_id = '') 
          AND LOWER(status) NOT IN ('draft', 'not posted yet', 'failed')
    """))
    print("\nOther unexpected statuses without external_post_id in platform_copies:")
    for r in res.fetchall():
        print(r)

