import asyncio
import os
import sys

sys.path.append(os.path.join(os.path.dirname(__file__), ".."))
from database import SessionLocal
from models.models import User
from services.auth_service import create_token
from playwright.async_api import async_playwright

ARTIFACT_DIR = r"C:\Users\admin\.gemini\antigravity\brain\bf71d55d-1466-46d2-a507-a73605eed711"

async def capture_all_proof():
    db = SessionLocal()
    admin = db.query(User).filter(User.email == "admin@brandflux.ai").first()
    admin_token = create_token(admin.id, token_version=admin.token_version or 1)

    user = db.query(User).filter(User.email == "minhaj.asghar@tntinov.com").first()
    user_token = create_token(user.id, token_version=user.token_version or 1)
    db.close()

    print("Tokens generated for admin and user.")

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)

        # ─── 1. Admin Portal > Emails Dev Outbox ───
        print("Opening Admin Portal with admin token...")
        admin_context = await browser.new_context(viewport={"width": 1400, "height": 900})
        await admin_context.add_cookies([
            {"name": "brandflux_token", "value": admin_token, "domain": "localhost", "path": "/"},
            {"name": "brandflux_user_role", "value": "admin", "domain": "localhost", "path": "/"}
        ])
        admin_page = await admin_context.new_page()
        await admin_page.add_init_script(f"""
            localStorage.setItem('brandflux_token', '{admin_token}');
            localStorage.setItem('brandflux_user_role', 'admin');
        """)

        await admin_page.goto("http://localhost:3000/admin?tab=emails", wait_until="networkidle")
        await admin_page.wait_for_timeout(2000)

        outbox_path = os.path.join(ARTIFACT_DIR, "admin_dev_outbox_list.png")
        await admin_page.screenshot(path=outbox_path, full_page=False)
        print(f"Captured: {outbox_path}")

        # ─── 2. Open Email Detail Modal (Desktop) ───
        print("Opening email modal...")
        open_btn = admin_page.locator('button:has-text("Open")').first
        if await open_btn.count() > 0:
            await open_btn.click()
            await admin_page.wait_for_timeout(2000)

            desktop_path = os.path.join(ARTIFACT_DIR, "rendered_email_desktop.png")
            await admin_page.screenshot(path=desktop_path, full_page=False)
            print(f"Captured: {desktop_path}")

            # ─── 3. Mobile Width Toggle (375px) ───
            print("Switching to Mobile (375px)...")
            mobile_btn = admin_page.locator('button:has-text("Mobile (375px)")').first
            if await mobile_btn.count() > 0:
                await mobile_btn.click()
                await admin_page.wait_for_timeout(1000)
                mobile_path = os.path.join(ARTIFACT_DIR, "rendered_email_mobile.png")
                await admin_page.screenshot(path=mobile_path, full_page=False)
                print(f"Captured: {mobile_path}")

        # ─── 4. User In-App Notification Center Bell ───
        print("Opening User Dashboard for Notification Bell...")
        user_context = await browser.new_context(viewport={"width": 1400, "height": 900})
        await user_context.add_cookies([
            {"name": "brandflux_token", "value": user_token, "domain": "localhost", "path": "/"},
            {"name": "brandflux_user_role", "value": "user", "domain": "localhost", "path": "/"},
            {"name": "brandflux_onboarding_complete", "value": "true", "domain": "localhost", "path": "/"}
        ])
        user_page = await user_context.new_page()
        await user_page.add_init_script(f"""
            localStorage.setItem('brandflux_token', '{user_token}');
            localStorage.setItem('brandflux_user_role', 'user');
            localStorage.setItem('brandflux_onboarding_complete', 'true');
        """)

        await user_page.goto("http://localhost:3000/dashboard", wait_until="networkidle")
        await user_page.wait_for_timeout(2000)

        # Click the bell icon to open notifications
        bell_button = user_page.locator('button[aria-label="Open notifications"]').first
        if await bell_button.count() > 0:
            await bell_button.click()
            await user_page.wait_for_timeout(1500)

        bell_path = os.path.join(ARTIFACT_DIR, "notification_bell_center.png")
        await user_page.screenshot(path=bell_path, full_page=False)
        print(f"Captured: {bell_path}")

        # ─── 5. Signup Dev Verify Page with 'Verify now (dev)' Button ───
        print("Opening /verify page in dev mode...")
        await user_page.goto("http://localhost:3000/verify?email=test_e4c6d366@example.com", wait_until="networkidle")
        await user_page.wait_for_timeout(1500)

        verify_path = os.path.join(ARTIFACT_DIR, "signup_dev_verify_page.png")
        await user_page.screenshot(path=verify_path, full_page=False)
        print(f"Captured: {verify_path}")

        await browser.close()
        print("\nAll proof screenshots captured successfully!")

if __name__ == "__main__":
    asyncio.run(capture_all_proof())

