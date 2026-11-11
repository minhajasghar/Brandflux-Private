import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from database import engine
from sqlalchemy import inspect

insp = inspect(engine)
for table in ["brands", "plans", "posts", "scheduled_posts"]:
    cols = [c["name"] for c in insp.get_columns(table)]
    print(f"{table}: {cols}")
