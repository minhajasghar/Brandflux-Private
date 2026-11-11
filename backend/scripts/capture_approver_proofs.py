import asyncio
import os
import sys

from playwright.async_api import async_playwright

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from database import SessionLocal
from models.models import User
from services.auth_service import create_token

ARTIFACT_DIR = r"C:\Users\admin\.gemini\antigravity\brain\bf71d55d-1466-46d2-a507-a73605eed711"

async def capture_all():
    db = SessionLocal()
    try:
        creator = db.query(User).filter(User.email == "minhaj.asghar@tntinnov.com").first()
        approver = db.query(User).filter(User.email == "sarah.approver@brandflux.io").first()
        creator_token = create_token(creator.id)
        approver_token = create_token(approver.id)
    finally:
        db.close()

    print("Tokens retrieved. Starting Playwright browser...")

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)

        # ─────────────────────────────────────────────────────────────
        # 1. Team Settings Screen (Creator)
        # ─────────────────────────────────────────────────────────────
        print("Capturing Team Settings...")
        creator_ctx = await browser.new_context(viewport={"width": 1440, "height": 960})
        creator_page = await creator_ctx.new_page()

        # Set auth token in localStorage
        await creator_page.goto("http://localhost:3000/dashboard", wait_until="domcontentloaded")
        await creator_page.evaluate(f"""() => {{
            localStorage.setItem('brandflux_token', '{creator_token}');
            localStorage.setItem('token', '{creator_token}');
        }}""")

        # Navigate to Settings > Team
        await creator_page.goto("http://localhost:3000/settings?tab=team", wait_until="networkidle")
        await creator_page.wait_for_timeout(2500)

        # If team tab button needs clicking
        team_tab = creator_page.locator('button:has-text("Team & Approvers")')
        if await team_tab.count() > 0:
            await team_tab.click()
            await creator_page.wait_for_timeout(1500)

        team_path = os.path.join(ARTIFACT_DIR, "team_settings.png")
        await creator_page.screenshot(path=team_path, full_page=False)
        print(f"Captured: {team_path}")

        # ─────────────────────────────────────────────────────────────
        # 2. Approver Inbox Desktop (Approver)
        # ─────────────────────────────────────────────────────────────
        print("Capturing Approver Inbox Desktop...")
        approver_ctx = await browser.new_context(viewport={"width": 1440, "height": 960})
        approver_page = await approver_ctx.new_page()

        await approver_page.goto("http://localhost:3000/dashboard", wait_until="domcontentloaded")
        await approver_page.evaluate(f"""() => {{
            localStorage.setItem('brandflux_token', '{approver_token}');
            localStorage.setItem('token', '{approver_token}');
        }}""")

        await approver_page.goto("http://localhost:3000/approvals", wait_until="networkidle")
        await approver_page.wait_for_timeout(2500)

        inbox_desktop_path = os.path.join(ARTIFACT_DIR, "approver_inbox_desktop.png")
        await approver_page.screenshot(path=inbox_desktop_path, full_page=False)
        print(f"Captured: {inbox_desktop_path}")

        # ─────────────────────────────────────────────────────────────
        # 3. Review Screen Modal with Platform Copies & Image Variants
        # ─────────────────────────────────────────────────────────────
        print("Opening Review Screen Modal...")
        waiting_card = approver_page.locator('text="Q4 AI Platform Launch Announcement"').first
        if await waiting_card.count() > 0:
            await waiting_card.click()
            await approver_page.wait_for_timeout(2500)

            review_path = os.path.join(ARTIFACT_DIR, "review_screen.png")
            await approver_page.screenshot(path=review_path, full_page=False)
            print(f"Captured: {review_path}")

        # ─────────────────────────────────────────────────────────────
        # 4. Changes Requested View
        # ─────────────────────────────────────────────────────────────
        print("Capturing Changes Requested View...")
        await approver_page.goto("http://localhost:3000/approvals", wait_until="networkidle")
        await approver_page.wait_for_timeout(1000)

        changes_tab = approver_page.locator('button:has-text("Changes requested")')
        if await changes_tab.count() > 0:
            await changes_tab.click()
            await approver_page.wait_for_timeout(2000)

            # Click review on changes requested post
            changes_card = approver_page.locator('text="Sustainability Tech Showcase"').first
            if await changes_card.count() > 0:
                await changes_card.click()
                await approver_page.wait_for_timeout(2500)

            changes_path = os.path.join(ARTIFACT_DIR, "changes_requested_view.png")
            await approver_page.screenshot(path=changes_path, full_page=False)
            print(f"Captured: {changes_path}")

        # ─────────────────────────────────────────────────────────────
        # 5. Approver Inbox Mobile (375x812)
        # ─────────────────────────────────────────────────────────────
        print("Capturing Approver Inbox Mobile...")
        mobile_ctx = await browser.new_context(
            viewport={"width": 375, "height": 812},
            is_mobile=True,
            user_agent="Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1"
        )
        mobile_page = await mobile_ctx.new_page()

        await mobile_page.goto("http://localhost:3000/dashboard", wait_until="domcontentloaded")
        await mobile_page.evaluate(f"""() => {{
            localStorage.setItem('brandflux_token', '{approver_token}');
            localStorage.setItem('token', '{approver_token}');
        }}""")

        await mobile_page.goto("http://localhost:3000/approvals", wait_until="networkidle")
        await mobile_page.wait_for_timeout(2500)

        mobile_inbox_path = os.path.join(ARTIFACT_DIR, "approver_inbox_mobile.png")
        await mobile_page.screenshot(path=mobile_inbox_path, full_page=False)
        print(f"Captured: {mobile_inbox_path}")

        await browser.close()
        print("All 5 screenshots captured successfully!")

if __name__ == "__main__":
    asyncio.run(capture_all())
