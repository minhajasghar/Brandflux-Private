import os
import sys
import time

backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'backend'))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from database import SessionLocal
from models.models import User
from services.auth_service import create_token
from playwright.sync_api import sync_playwright

artifact_dir = r"C:\Users\admin\.gemini\antigravity\brain\bf71d55d-1466-46d2-a507-a73605eed711"
os.makedirs(artifact_dir, exist_ok=True)

db = SessionLocal()
user = db.query(User).filter(User.email == 'minhaj.asghar@tntinnov.com').first()
if not user:
    print("User not found!")
    sys.exit(1)

token = create_token(str(user.id), getattr(user, 'token_version', 1))
print(f"Logged in user: {user.email} ({user.id})")
db.close()

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    context = browser.new_context(
        viewport={"width": 1440, "height": 900},
        device_scale_factor=1
    )
    context.add_cookies([
        {"name": "brandflux_token", "value": token, "domain": "localhost", "path": "/"},
        {"name": "brandflux_onboarding_complete", "value": "true", "domain": "localhost", "path": "/"},
        {"name": "brandflux_user_role", "value": "user", "domain": "localhost", "path": "/"}
    ])
    context.add_init_script(f"localStorage.setItem('brandflux_token', '{token}');")
    page = context.new_page()

    # Proof 1: Dashboard
    print("Capturing Proof 1: Dashboard Credits...")
    page.goto("http://localhost:3000/dashboard", wait_until="networkidle")
    page.wait_for_timeout(2000)
    dash_path = os.path.join(artifact_dir, "proof_issue1_dashboard_credits.png")
    page.screenshot(path=dash_path, full_page=True)
    print(f"Saved: {dash_path}")

    # Proof 1b: Create Content (/session)
    print("Capturing Proof 1: Create Content (/session)...")
    page.goto("http://localhost:3000/session", wait_until="networkidle")
    page.wait_for_timeout(2000)
    session_path = os.path.join(artifact_dir, "proof_issue1_create_content_credits.png")
    page.screenshot(path=session_path, full_page=True)
    print(f"Saved: {session_path}")

    # Proof 1c: Settings > Billing
    print("Capturing Proof 1: Settings > Billing...")
    page.goto("http://localhost:3000/settings?tab=billing", wait_until="networkidle")
    page.wait_for_timeout(2500)
    billing_path = os.path.join(artifact_dir, "proof_issue1_settings_billing.png")
    page.screenshot(path=billing_path, full_page=True)
    print(f"Saved: {billing_path}")

    # Proof 2: Settings > Account
    print("Capturing Proof 2: Settings > Account...")
    page.goto("http://localhost:3000/settings?tab=account", wait_until="networkidle")
    page.wait_for_timeout(2500)
    account_path = os.path.join(artifact_dir, "proof_issue2_account_settings.png")
    page.screenshot(path=account_path, full_page=True)
    print(f"Saved: {account_path}")

    # Proof 3 & 5: Content History (/ideas) & Post Drawer
    print("Capturing Proof 5: Content History Overview...")
    page.goto("http://localhost:3000/ideas", wait_until="networkidle")
    page.wait_for_timeout(2500)
    history_overview_path = os.path.join(artifact_dir, "proof_issue5_history_overview.png")
    page.screenshot(path=history_overview_path, full_page=True)
    print(f"Saved: {history_overview_path}")

    # Open first post's detail drawer
    print("Opening detail drawer for Proof 3...")
    view_button = page.locator("button:has-text('View Full Content')").first
    if view_button.count() > 0:
        view_button.click()
        page.wait_for_timeout(2500)
        drawer_path = os.path.join(artifact_dir, "proof_issue3_publish_panel_drawer.png")
        page.screenshot(path=drawer_path, full_page=True)
        print(f"Saved: {drawer_path}")

        # Scroll the drawer down to capture dynamic button and actions
        page.evaluate("""() => {
            const drawerScroll = document.querySelector('.fixed.top-0.right-0 div.overflow-y-auto') || document.querySelector('.overflow-y-auto');
            if (drawerScroll) {
                drawerScroll.scrollTop = 900;
            }
        }""")
        page.wait_for_timeout(1000)
        drawer_bottom_path = os.path.join(artifact_dir, "proof_issue3_publish_panel_bottom.png")
        page.screenshot(path=drawer_bottom_path)
        print(f"Saved: {drawer_bottom_path}")
    else:
        print("View Full Content button not found!")

    browser.close()
    print("All proofs captured successfully!")
