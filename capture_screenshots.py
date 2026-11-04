import os
import sys
import time

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "backend"))

from database import SessionLocal
from models.models import User
from services.auth_service import create_token
from playwright.sync_api import sync_playwright

output_dir = r"C:\Users\admin\.gemini\antigravity\brain\bf71d55d-1466-46d2-a507-a73605eed711"

db = SessionLocal()
user = db.query(User).filter(User.email == "minhaj.asghar@tntinov.com").first()
token = create_token(user.id, user.token_version)
db.close()

print(f"Generated token for {user.email}")

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    context = browser.new_context(
        viewport={"width": 1440, "height": 960},
        device_scale_factor=1
    )
    
    # Set cookies
    context.add_cookies([
        {"name": "brandflux_token", "value": token, "domain": "localhost", "path": "/"},
        {"name": "brandflux_onboarding_complete", "value": "true", "domain": "localhost", "path": "/"},
        {"name": "brandflux_user_role", "value": "user", "domain": "localhost", "path": "/"}
    ])

    page = context.new_page()

    # Set localStorage before loading app
    page.goto("http://localhost:3000/login", wait_until="domcontentloaded")
    page.evaluate(f"""() => {{
        localStorage.setItem('brandflux_token', '{token}');
        localStorage.setItem('brandflux_user', JSON.stringify({{
            id: '{user.id}',
            email: '{user.email}',
            role: '{user.role}',
            onboarding_complete: true
        }}));
    }}""")

    # 1. Capture Dashboard
    print("Navigating to /dashboard...")
    page.goto("http://localhost:3000/dashboard", wait_until="networkidle")
    time.sleep(2)
    dash_path = os.path.join(output_dir, "after_dashboard_multiplatform.png")
    page.screenshot(path=dash_path, full_page=False)
    print(f"Saved: {dash_path}")

    # 1b. Click View on first Recent Content item to capture Drawer with Platform tabs
    row_view_btn = page.locator(".divide-y button:has-text('View')").first
    if row_view_btn.count() > 0:
        row_view_btn.click()
        time.sleep(1.5)
        drawer_path = os.path.join(output_dir, "after_dashboard_post_drawer.png")
        page.screenshot(path=drawer_path, full_page=False)
        print(f"Saved: {drawer_path}")

    # 2. Capture History
    print("Navigating to /ideas...")
    page.goto("http://localhost:3000/ideas", wait_until="networkidle")
    time.sleep(2)
    ideas_path = os.path.join(output_dir, "after_history_multiplatform.png")
    page.screenshot(path=ideas_path, full_page=False)
    print(f"Saved: {ideas_path}")

    # 3. Capture Calendar
    print("Navigating to /calendar...")
    page.goto("http://localhost:3000/calendar", wait_until="networkidle")
    time.sleep(2)
    cal_path = os.path.join(output_dir, "after_calendar_multiplatform.png")
    page.screenshot(path=cal_path, full_page=False)
    print(f"Saved: {cal_path}")

    # 4. Capture Session (showing TikTok tab)
    print("Navigating to /session...")
    page.goto("http://localhost:3000/session", wait_until="networkidle")
    time.sleep(2)
    session_path = os.path.join(output_dir, "after_session_tiktok.png")
    page.screenshot(path=session_path, full_page=False)
    print(f"Saved: {session_path}")

    browser.close()

print("All screenshots captured successfully!")
