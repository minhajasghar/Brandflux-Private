import sys
sys.path.insert(0, 'backend')
from database import engine
from sqlalchemy import text

with engine.connect() as con:
    res = con.execute(text("SELECT id, platform, status, external_post_id, permalink FROM platform_copies WHERE LOWER(status) = 'published'"))
    print("Published platform_copies:")
    for r in res.fetchall():
        print(r)

    res = con.execute(text("SELECT id, platform, status, external_post_id FROM scheduled_posts WHERE LOWER(status) = 'published'"))
    print("\nPublished scheduled_posts:")
    for r in res.fetchall():
        print(r)

