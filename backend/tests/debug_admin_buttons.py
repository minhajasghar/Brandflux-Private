import asyncio
from playwright.async_api import async_playwright

async def check():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        page = await b.new_page()
        await page.goto('http://localhost:3000/login', wait_until='networkidle')
        await page.fill('input[type="email"]', 'admin@brandflux.ai')
        await page.fill('input[type="password"]', 'Admin123!#Brandflux')
        await page.click('button[type="submit"]')
        await page.wait_for_timeout(2000)
        await page.goto('http://localhost:3000/admin?tab=emails', wait_until='networkidle')
        await page.wait_for_timeout(2000)
        btns = await page.locator('button').all_inner_texts()
        print('Buttons on page:', btns)
        await b.close()

asyncio.run(check())

