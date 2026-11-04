import asyncio
import os
import sys

sys.path.append(os.path.join(os.path.dirname(__file__), ".."))
from database import SessionLocal
from models.models import User
from services.auth_service import create_token
from playwright.async_api import async_playwright

async def inspect():
    db = SessionLocal()
    admin = db.query(User).filter(User.email == "admin@brandflux.ai").first()
    token = create_token(admin.id, token_version=admin.token_version or 1)
    db.close()

    async with async_playwright() as p:
        b = await p.chromium.launch(headless=True)
        ctx = await b.new_context(viewport={"width": 1400, "height": 900})
        await ctx.add_cookies([
            {"name": "brandflux_token", "value": token, "domain": "localhost", "path": "/"},
            {"name": "brandflux_user_role", "value": "admin", "domain": "localhost", "path": "/"}
        ])
        page = await ctx.new_page()
        # Set localStorage
        await page.goto("http://localhost:3000/login")
        await page.evaluate(f"() => {{ localStorage.setItem('brandflux_token', '{token}'); localStorage.setItem('brandflux_user_role', 'admin'); }}")
        await page.goto("http://localhost:3000/admin?tab=emails", wait_until="networkidle")
        await page.wait_for_timeout(2500)
        print("Page URL:", page.url)
        print("Headings:", await page.locator("h1, h2, h3, h4").all_inner_texts())
        rows = await page.locator("tbody tr").count()
        print("Tbody rows count:", rows)
        if rows > 0:
            print("First row text:", await page.locator("tbody tr").first.inner_text())
        await b.close()

asyncio.run(inspect())

