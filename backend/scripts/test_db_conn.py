import sys
sys.path.insert(0, 'backend')
from database import engine
from sqlalchemy import text

print('Connected engine URL:', engine.url)
try:
    with engine.connect() as con:
        print('Connected successfully!')
        if 'mysql' in str(engine.url):
            res = con.execute(text('SHOW TABLES'))
        else:
            res = con.execute(text("SELECT name FROM sqlite_master WHERE type='table'"))
        print('Tables:', [r[0] for r in res.fetchall()])
except Exception as e:
    print('Connection error:', e)

