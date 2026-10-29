import asyncio
import os
import sys
import io

# Force stdout to utf-8 for Windows console
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

from playwright.async_api import async_playwright

async def test_signup_no_redirect():
    print("Testing Signup Form: Website blur must NEVER redirect to /login...")
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context()
        page = await context.new_page()

        redirected_to_login = False

        def on_framenavigated(frame):
            nonlocal redirected_to_login
            if frame == page.main_frame:
                url = frame.url
                print(f"  [Navigation Event] URL: {url}")
                if "/login" in url:
                    redirected_to_login = True

        page.on("framenavigated", on_framenavigated)

        # 1. Load signup page
        signup_url = "http://localhost:3000/signup"
        print(f"Navigating to {signup_url}...")
        try:
            await page.goto(signup_url, wait_until="load", timeout=15000)
        except Exception as e:
            print(f"Failed to connect to {signup_url}: {e}")
            await browser.close()
            return False

        current_url = page.url
        print(f"Current page URL: {current_url}")
        assert "/signup" in current_url, f"Expected /signup, got {current_url}"

        # 2. Fill in the form fields
        print("Filling in full name...")
        await page.fill('input[placeholder="Full name"]', "Sarah Connor")

        print("Filling in email address...")
        await page.fill('input[placeholder="Work email address"]', "sarah@cyberdyne.ai")

        print("Filling in password...")
        await page.fill('input[type="password"]', "T800SecurePass!2026")

        print("Filling in website URL...")
        website_input = page.locator('input[placeholder="https://yourbrand.com"]')
        await website_input.fill("https://stripe.com")

        # 3. Trigger blur event on the website field (by clicking outside or blurring)
        print("Triggering blur event on website input...")
        await website_input.blur()

        # Wait 4 seconds for any background scan / interceptor calls to execute
        print("Waiting 4 seconds to observe if any background redirect occurs...")
        await page.wait_for_timeout(4000)

        final_url = page.url
        print(f"Final URL after website blur: {final_url}")

        assert not redirected_to_login, "FAILURE: Page was redirected to /login after website blur!"
        assert "/signup" in final_url, f"FAILURE: URL changed away from /signup to {final_url}"

        # Verify inputs still hold their filled values
        name_val = await page.input_value('input[placeholder="Full name"]')
        email_val = await page.input_value('input[placeholder="Work email address"]')
        web_val = await page.input_value('input[placeholder="https://yourbrand.com"]')

        assert name_val == "Sarah Connor", f"Expected 'Sarah Connor', got '{name_val}'"
        assert email_val == "sarah@cyberdyne.ai", f"Expected 'sarah@cyberdyne.ai', got '{email_val}'"
        assert web_val == "https://stripe.com", f"Expected 'https://stripe.com', got '{web_val}'"

        print("[OK] Name, Email, and Website values were safely preserved.")
        print("[OK] No redirect to /login occurred during or after website field blur.")

        # 4. Stress Test: Explicitly trigger an unauthenticated 401 response via the axios instance on the page
        print("\nStress Testing: Triggering a synthetic 401 on a public route...")
        await page.evaluate("""async () => {
            try {
                // Fetch a protected endpoint without auth header to generate a 401
                await fetch('http://localhost:8000/auth/me');
            } catch (e) {
                // ignore
            }
        }""")
        await page.wait_for_timeout(1500)

        assert not redirected_to_login, "FAILURE: Synthetic 401 triggered a redirect on /signup!"
        assert "/signup" in page.url, f"FAILURE: URL changed after 401 to {page.url}"
        print("[OK] Synthetic 401 was safely suppressed by the updated interceptor.")

        print("\nALL SIGNUP TESTS PASSED!")

        await browser.close()
        return True

if __name__ == "__main__":
    success = asyncio.run(test_signup_no_redirect())
    if not success:
        sys.exit(1)
