import sys
import os
sys.path.append(os.path.abspath("backend"))

from database import engine
from sqlalchemy import text

with engine.connect() as conn:
    print("=== session_variants ===")
    for r in conn.execute(text("DESCRIBE session_variants")).fetchall():
        print(f"  {r[0]}: {r[1]} null={r[2]} default={r[4]}")
    print("\n=== post_images ===")
    for r in conn.execute(text("DESCRIBE post_images")).fetchall():
        print(f"  {r[0]}: {r[1]} null={r[2]} default={r[4]}")
    print("\n=== counts ===")
    for tbl in ["posts", "platform_copies", "post_images", "session_variants", "scheduled_posts"]:
        cnt = conn.execute(text(f"SELECT COUNT(*) FROM {tbl}")).scalar()
        print(f"  {tbl}: {cnt}")

