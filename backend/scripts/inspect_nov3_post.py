import sys
sys.path.insert(0, 'backend')
from database import engine
from sqlalchemy import text

with engine.connect() as con:
    post_id = '1d606863-bbe2-4030-9481-b29a500d8dc7'
    session_id = '7c402efb-a21c-4e89-a67c-0d20f5d994e5'

    # Check platform_copies
    res = con.execute(text(f"SELECT id, platform, status, image_url, external_post_id FROM platform_copies WHERE post_id = '{post_id}'"))
    print("Platform copies:")
    for r in res.fetchall():
        print(r)

    # Check post_images
    res = con.execute(text(f"SELECT * FROM post_images WHERE post_id = '{post_id}'"))
    print("\nPost images:")
    for r in res.fetchall():
        print(r)

    # Check session_variants for this session
    res = con.execute(text(f"SELECT * FROM session_variants WHERE session_id = '{session_id}'"))
    print("\nSession variants:")
    for r in res.fetchall():
        print(r)
