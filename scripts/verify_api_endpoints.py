import os
import sys
import json
import urllib.request

backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'backend'))
sys.path.insert(0, backend_dir)

from database import SessionLocal
from models.models import User
from services.auth_service import create_token

db = SessionLocal()
admin_user = db.query(User).filter_by(email='admin@brandflux.ai').first()
if not admin_user:
    admin_user = db.query(User).filter_by(role='admin').first()
token = create_token(user_id=admin_user.id)
db.close()

print("--- 1. Testing /oauth/platforms-status ---")
with urllib.request.urlopen('http://localhost:8000/oauth/platforms-status') as resp:
    print("Status:", resp.status)
    print("Data:", resp.read().decode())

print("\n--- 2. Testing /admin/integrations ---")
req = urllib.request.Request('http://localhost:8000/admin/integrations', headers={'Authorization': f'Bearer {token}'})
with urllib.request.urlopen(req) as resp:
    print("Status:", resp.status)
    data = json.loads(resp.read().decode())
    for p in data.get('platforms', []):
        print(f"Platform: {p['name']} ({p['platform']})")
        print(f"  Configured in Env: {p['is_configured']}")
        print(f"  Active Accounts: {p['connected_accounts_count']}")
        print(f"  Token Health: {p['token_health']}")
        print(f"  Last Success: {p.get('last_successful_publish')}")
        print(f"  Last Error: {p.get('last_error')}")
