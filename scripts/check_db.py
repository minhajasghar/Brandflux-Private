import os
import sys

backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'backend'))
sys.path.insert(0, backend_dir)

from database import SessionLocal
from models.models import ScheduledPost, AutopilotLog

db = SessionLocal()
posts = db.query(ScheduledPost).order_by(ScheduledPost.id.desc()).limit(5).all()
print('LATEST SCHEDULED POSTS:')
for p in posts:
    print(f'ID {p.id}: {p.topic} | {p.status} | {p.platform} | {p.scheduled_at}')

logs = db.query(AutopilotLog).order_by(AutopilotLog.id.desc()).limit(8).all()
print('\nLATEST AUTOPILOT LOGS:')
for l in logs:
    print(f'{l.stage} [{l.status}]: {l.decision_summary}')
db.close()
