import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "backend"))

from playwright.sync_api import sync_playwright
from database import SessionLocal
from models.models import User
from services.auth_service import create_token

db = SessionLocal()
u = db.query(User).filter(User.email == "minhaj.asghar@tntinov.com").first()
token = create_token(u.id, u.token_version)
db.close()

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    context = browser.new_context()
    context.add_cookies([
        {"name": "brandflux_token", "value": token, "domain": "localhost", "path": "/"},
        {"name": "brandflux_onboarding_complete", "value": "true", "domain": "localhost", "path": "/"}
    ])
    page = context.new_page()
    page.goto("http://localhost:3000/login", wait_until="domcontentloaded")
    page.evaluate(f"() => {{ localStorage.setItem('brandflux_token', '{token}'); }}")
    
    page.on("console", lambda msg: print("CONSOLE:", msg.text.encode('ascii', 'ignore').decode()))
    def handle_resp(resp):
        if "oauth/meta/authorize" in resp.url:
            print("RESP STATUS:", resp.status)
            print("RESP TEXT:", resp.text())
    page.on("response", handle_resp)

    print("Navigating to settings...")
    page.goto("http://localhost:3000/settings?tab=connected", wait_until="networkidle")
    
    btn = page.wait_for_selector("button:has-text('Connect Meta')", timeout=10000)
    print("Found button!")
    btn.click()
    page.wait_for_timeout(3000)
    print("URL after click:", page.url)
    
    browser.close()
