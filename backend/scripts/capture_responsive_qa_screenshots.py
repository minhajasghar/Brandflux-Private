"""
Capture responsive screenshots across required resolutions:
360, 390, 768, 1024, 1440
Pages: landing (/), login (/login), dashboard (/dashboard), create content (/session),
content history (/ideas), calendar (/calendar), analytics (/analytics),
settings tabs (/settings), approvals (/approvals), pricing (/pricing), admin (/admin).
"""
import os
import sys
import time
from playwright.sync_api import sync_playwright

SCREENSHOT_DIR = r"C:\Users\admin\.gemini\antigravity\brain\bf71d55d-1466-46d2-a507-a73605eed711\qa_screenshots"
os.makedirs(SCREENSHOT_DIR, exist_ok=True)

WIDTHS = [360, 390, 768, 1024, 1440]
BASE_URL = "http://localhost:3000"

def run():
    print(f"Saving responsive screenshots to {SCREENSHOT_DIR}")
    with sync_playwright() as p:
        # Launch Chromium
        browser = p.chromium.launch(headless=True)
        
        # 1. First get auth token by logging in or setting cookie/localStorage
        context = browser.new_context(viewport={"width": 1440, "height": 900})
        page = context.new_page()
        
        print("Logging in to set auth state...")
        page.goto(f"{BASE_URL}/login", wait_until="networkidle")
        page.fill('input[type="email"]', "minhaj.asghar@tntinnov.com")
        page.fill('input[type="password"]', "Minhaj123!") # or check if already saved
        page.click('button[type="submit"]')
        time.sleep(3)
        
        # Save storage state
        storage_state = context.storage_state()
        context.close()
        
        # List of pages to capture
        pages_to_capture = [
            ("landing", f"{BASE_URL}/", False),
            ("login", f"{BASE_URL}/login", False),
            ("pricing", f"{BASE_URL}/pricing", False),
            ("dashboard", f"{BASE_URL}/dashboard", True),
            ("create_content", f"{BASE_URL}/session", True),
            ("content_history", f"{BASE_URL}/ideas", True),
            ("calendar", f"{BASE_URL}/calendar", True),
            ("analytics", f"{BASE_URL}/analytics", True),
            ("settings", f"{BASE_URL}/settings", True),
            ("approvals", f"{BASE_URL}/approvals", True),
            ("admin", f"{BASE_URL}/admin", True),
        ]
        
        # Capture responsive matrix for each page
        for page_name, url, needs_auth in pages_to_capture:
            print(f"\n--- Capturing {page_name} ({url}) ---")
            for w in WIDTHS:
                h = 800 if w < 768 else 900
                ctx = browser.new_context(
                    viewport={"width": w, "height": h},
                    storage_state=storage_state if needs_auth else None
                )
                pg = ctx.new_page()
                try:
                    pg.goto(url, wait_until="networkidle", timeout=15000)
                    time.sleep(1.5)
                    
                    # Check for horizontal scroll overflow
                    scroll_width = pg.evaluate("document.documentElement.scrollWidth")
                    client_width = pg.evaluate("document.documentElement.clientWidth")
                    has_h_scroll = scroll_width > client_width
                    
                    out_path = os.path.join(SCREENSHOT_DIR, f"{page_name}_{w}px.png")
                    pg.screenshot(path=out_path, full_page=False)
                    print(f"Captured {page_name} @ {w}px -> {out_path} (H-scroll: {has_h_scroll}, sw={scroll_width}, cw={client_width})")
                except Exception as e:
                    print(f"Error capturing {page_name} @ {w}px: {e}")
                finally:
                    ctx.close()
                    
        browser.close()
    print("Done capturing responsive screenshots.")

if __name__ == "__main__":
    run()

