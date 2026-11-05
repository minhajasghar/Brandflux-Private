import sqlite3

con = sqlite3.connect('backend/brandai.db')
cur = con.cursor()

for t in ["generated_posts", "scheduled_posts"]:
    cur.execute(f"PRAGMA table_info({t})")
    cols = [c[1] for c in cur.fetchall()]
    print(f"\nTable {t} columns: {cols}")
    cur.execute(f"SELECT * FROM {t} LIMIT 3")
    rows = cur.fetchall()
    print(f"Sample row from {t}: {rows[0] if rows else 'empty'}")
