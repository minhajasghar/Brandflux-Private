import os
import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from database import SessionLocal
from models.models import User
from services.auth_service import create_token
import requests

def test_account_persistence():
    db = SessionLocal()
    user = db.query(User).filter(User.email == 'minhaj.asghar@tntinnov.com').first()
    original_name = user.full_name
    print(f"Original user name in DB: {original_name}")

    token = create_token(str(user.id), getattr(user, 'token_version', 1))
    headers = {"Authorization": f"Bearer {token}"}

    # 1. Update name
    new_name = "Minhaj Asghar (Verified)"
    res = requests.put("http://localhost:8000/auth/profile", json={"full_name": new_name}, headers=headers)
    assert res.status_code == 200, res.text
    data = res.json()
    new_token = data["token"]
    assert data["user"]["full_name"] == new_name
    print(f"[OK] PUT /auth/profile returned new name: {new_name}")

    # 2. Verify with GET /auth/me using the refreshed token
    res_me = requests.get("http://localhost:8000/auth/me", headers={"Authorization": f"Bearer {new_token}"})
    assert res_me.status_code == 200, res_me.text
    fetched_name = res_me.json()["user"]["full_name"]
    print(f"[OK] GET /auth/me confirmed persisted name: {fetched_name}")
    assert fetched_name == new_name

    # 3. Restore original name
    res_restore = requests.put("http://localhost:8000/auth/profile", json={"full_name": original_name}, headers={"Authorization": f"Bearer {new_token}"})
    assert res_restore.status_code == 200
    print(f"[OK] Restored name back to: {original_name}")

    db.close()
    print("ALL ACCOUNT PERSISTENCE TESTS PASSED!")

if __name__ == "__main__":
    test_account_persistence()

