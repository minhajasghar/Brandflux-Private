import sqlite3
import pymysql
import os
import json

def migrate():
    sqlite_path = os.path.join(os.path.dirname(__file__), "brandai.db")
    if not os.path.exists(sqlite_path):
        print(f"SQLite file not found at {sqlite_path}")
        return

    s_conn = sqlite3.connect(sqlite_path)
    s_conn.row_factory = sqlite3.Row
    s_cur = s_conn.cursor()

    m_conn = pymysql.connect(
        host='127.0.0.1',
        port=3306,
        user='root',
        password='',
        database='brandflux',
        charset='utf8mb4'
    )
    m_cur = m_conn.cursor()

    tables = [
        'users', 'brands', 'brand_scan_logs', 'website_scans',
        'daily_sessions', 'content_ideas', 'generated_posts',
        'session_variants', 'autopilot_configs', 'usage', 'audit_logs', 'system_settings'
    ]

    m_cur.execute('SET FOREIGN_KEY_CHECKS = 0;')
    for t in tables:
        try:
            s_cur.execute(f"SELECT * FROM {t}")
            rows = s_cur.fetchall()
            if not rows:
                print(f"Table {t}: 0 rows (skipped)")
                continue
            cols = rows[0].keys()
            cols_str = ', '.join([f"`{c}`" for c in cols])
            placeholders = ', '.join(['%s'] * len(cols))
            sql = f"REPLACE INTO `{t}` ({cols_str}) VALUES ({placeholders})"
            data = [tuple(r) for r in rows]
            m_cur.executemany(sql, data)
            print(f"[OK] Migrated {len(data)} rows for table {t}")
        except Exception as e:
            print(f"[ERROR] Error migrating {t}: {e}")

    m_cur.execute('SET FOREIGN_KEY_CHECKS = 1;')
    m_conn.commit()
    m_conn.close()
    s_conn.close()
    print("[SUCCESS] Full data migration to XAMPP MySQL finished successfully!")

if __name__ == "__main__":
    migrate()
