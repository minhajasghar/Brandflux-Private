import asyncio
import os
import sys

from playwright.async_api import async_playwright

ARTIFACT_DIR = r"C:\Users\admin\.gemini\antigravity\brain\bf71d55d-1466-46d2-a507-a73605eed711"

async def capture_proof():
    print("Launching Playwright to capture proof screenshots...")
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(viewport={"width": 1400, "height": 900})
        page = await context.new_page()

        # ─── 1. Login as Admin ───
        print("Navigating to login page for Admin...")
        await page.goto("http://localhost:3000/login", wait_until="networkidle")
        await page.fill('input[type="email"]', "admin@brandflux.ai")
        await page.fill('input[type="password"]', "Admin123!#Brandflux")
        await page.click('button[type="submit"]')
        await page.wait_for_timeout(2500)

        # ─── 2. Navigate to Admin Emails Outbox ───
        print("Navigating to /admin?tab=emails...")
        await page.goto("http://localhost:3000/admin?tab=emails", wait_until="networkidle")
        await page.wait_for_timeout(2000)

        outbox_path = os.path.join(ARTIFACT_DIR, "admin_dev_outbox_list.png")
        await page.screenshot(path=outbox_path, full_page=False)
        print(f"Captured: {outbox_path}")

        # ─── 3. Open Email Detail Modal (Desktop) ───
        print("Opening email detail modal...")
        open_buttons = page.locator('button:has-text("Open")')
        count = await open_buttons.count()
        if count > 0:
            await open_buttons.first.click()
            await page.wait_for_timeout(2000)

            desktop_path = os.path.join(ARTIFACT_DIR, "rendered_email_desktop.png")
            await page.screenshot(path=desktop_path, full_page=False)
            print(f"Captured: {desktop_path}")

            # ─── 4. Toggle Mobile Width (375px) ───
            print("Toggling mobile width mode...")
            mobile_btn = page.locator('button:has-text("Mobile (375px)")')
            if await mobile_btn.count() > 0:
                await mobile_btn.click()
                await page.wait_for_timeout(1000)
                mobile_path = os.path.join(ARTIFACT_DIR, "rendered_email_mobile.png")
                await page.screenshot(path=mobile_path, full_page=False)
                print(f"Captured: {mobile_path}")

        # ─── 5. Login as User to capture Notification Bell ───
        print("Switching context to User for Notification Bell...")
        user_context = await browser.new_context(viewport={"width": 1400, "height": 900})
        user_page = await user_context.new_page()

        await user_page.goto("http://localhost:3000/login", wait_until="networkidle")
        await user_page.fill('input[type="email"]', "minhaj.asghar@tntinov.com")
        await user_page.fill('input[type="password"]', "Admin123!#Brandflux")
        await user_page.click('button[type="submit"]')
        await user_page.wait_for_timeout(2500)

        print("Navigating to user dashboard...")
        await user_page.goto("http://localhost:3000/dashboard", wait_until="networkidle")
        await user_page.wait_for_timeout(2000)

        # Click the bell icon to open notifications
        bell_button = user_page.locator('button[aria-label="Open notifications"]')
        if await bell_button.count() > 0:
            await bell_button.click()
            await user_page.wait_for_timeout(1500)

        bell_path = os.path.join(ARTIFACT_DIR, "notification_bell_center.png")
        await user_page.screenshot(path=bell_path, full_page=False)
        print(f"Captured: {bell_path}")

        # ─── 6. Also capture Verify Page in Dev Mode ───
        print("Navigating to /verify?email=proof_user@test.dev to capture dev verify button...")
        await user_page.goto("http://localhost:3000/verify?email=test_e4c6d366@example.com", wait_until="networkidle")
        await user_page.wait_for_timeout(1500)

        verify_path = os.path.join(ARTIFACT_DIR, "signup_dev_verify_page.png")
        await user_page.screenshot(path=verify_path, full_page=False)
        print(f"Captured: {verify_path}")

        await browser.close()
        print("All screenshots captured successfully!")

if __name__ == "__main__":
    asyncio.run(capture_proof())

