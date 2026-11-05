import asyncio
from playwright.async_api import async_playwright

async def run():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(viewport={"width": 1440, "height": 900})
        page = await context.new_page()

        # 1. Capture Brand Preview Page
        print("Navigating to /brand-preview...")
        await page.goto("http://localhost:3000/brand-preview", wait_until="networkidle")
        await page.screenshot(
            path="C:/Users/admin/.gemini/antigravity/brain/bf71d55d-1466-46d2-a507-a73605eed711/brand_preview_showcase.png",
            full_page=True
        )
        print("Captured brand_preview_showcase.png")

        # 2. Capture Public Pricing Page
        print("Navigating to /pricing...")
        await page.goto("http://localhost:3000/pricing", wait_until="networkidle")
        await page.screenshot(
            path="C:/Users/admin/.gemini/antigravity/brain/bf71d55d-1466-46d2-a507-a73605eed711/pricing_page_showcase.png",
            full_page=True
        )
        print("Captured pricing_page_showcase.png")

        # 3. Log in as admin and capture Admin Plans & Limits tab
        print("Setting admin authentication cookies...")
        from services.auth_service import create_token
        from database import SessionLocal
        from models.models import User
        
        db = SessionLocal()
        admin_user = db.query(User).filter(User.email == 'admin@brandflux.ai').first()
        admin_token = create_token(admin_user.id, token_version=getattr(admin_user, "token_version", 1) or 1)
        
        await context.add_cookies([
            {"name": "brandflux_token", "value": admin_token, "url": "http://localhost:3000/"},
            {"name": "brandflux_user_role", "value": "admin", "url": "http://localhost:3000/"},
            {"name": "brandflux_onboarding_complete", "value": "true", "url": "http://localhost:3000/"}
        ])

        await page.goto("http://localhost:3000/admin?tab=plans", wait_until="commit")
        await page.evaluate(f"localStorage.setItem('brandflux_token', '{admin_token}')")
        await page.goto("http://localhost:3000/admin?tab=plans", wait_until="networkidle")
        await page.wait_for_timeout(2000)
        await page.screenshot(
            path="C:/Users/admin/.gemini/antigravity/brain/bf71d55d-1466-46d2-a507-a73605eed711/admin_plans_editor.png",
            full_page=False
        )
        print("Captured admin_plans_editor.png")

        # 4. Settings Billing tab for normal user
        user = db.query(User).filter(User.email == 'minhaj.asghar@tntinnov.com').first()
        user_token = create_token(user.id, token_version=getattr(user, "token_version", 1) or 1)
        db.close()

        await context.clear_cookies()
        await context.add_cookies([
            {"name": "brandflux_token", "value": user_token, "url": "http://localhost:3000/"},
            {"name": "brandflux_user_role", "value": user.role, "url": "http://localhost:3000/"},
            {"name": "brandflux_onboarding_complete", "value": "true", "url": "http://localhost:3000/"}
        ])

        await page.goto("http://localhost:3000/settings?tab=billing", wait_until="commit")
        await page.evaluate(f"localStorage.setItem('brandflux_token', '{user_token}')")
        await page.goto("http://localhost:3000/settings?tab=billing", wait_until="networkidle")
        await page.wait_for_timeout(2000)
        await page.screenshot(
            path="C:/Users/admin/.gemini/antigravity/brain/bf71d55d-1466-46d2-a507-a73605eed711/settings_billing_updated.png",
            full_page=False
        )
        print("Captured settings_billing_updated.png")

        await browser.close()

asyncio.run(run())
