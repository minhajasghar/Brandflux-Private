import os
import sys
import json
import requests
from datetime import datetime

# Add backend directory to sys.path
backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'backend'))
sys.path.insert(0, backend_dir)

from database import SessionLocal
from models.models import User, Brand, AutopilotConfig, ScheduledPost, SessionVariant, SocialAccount
from services.auth_service import create_token

def main():
    db = SessionLocal()
    u = db.query(User).filter_by(email='minhaj.asghar@tntinnov.com').first()
    if not u:
        print("User not found!")
        return
    
    brand = db.query(Brand).filter_by(user_id=u.id).first()
    print(f"Target User: {u.email} ({u.id}), Brand: {brand.name if brand else 'None'} ({brand.id if brand else 'None'})")

    token = create_token(user_id=u.id, token_version=getattr(u, 'token_version', 1))
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }
    base_url = "http://localhost:8000"

    print("\n--- STEP 1: Update Autopilot Config (Custom Tue/Thu, 07:00, Asia/Karachi) ---")
    update_payload = {
        "enabled": True,
        "mode": "weekly_plan",
        "frequency": "custom",
        "custom_weekdays": ["Tue", "Thu"],
        "posting_time": "07:00",
        "timezone": "Asia/Karachi",
        "max_posts_per_day": 2,
        "banned_topics": ["politics", "gambling"],
        "target_platforms": ["facebook", "linkedin", "tiktok"]
    }
    r = requests.put(f"{base_url}/autopilot/config", json=update_payload, headers=headers)
    print("PUT /autopilot/config status:", r.status_code)
    cfg = r.json()
    print("Config next_posts_preview:", cfg.get("next_posts_preview"))
    assert cfg.get("frequency") == "custom"
    assert "Tue" in cfg.get("custom_weekdays") and "Thu" in cfg.get("custom_weekdays")

    print("\n--- STEP 2: Event Check-in & Weekly Plan ---")
    event_details_text = "Flash launch of TNT AI Business Operating System with 30% founder discount"
    checkin_payload = {
        "has_event": True,
        "event_details": event_details_text
    }
    r = requests.post(f"{base_url}/autopilot/event-checkin", json=checkin_payload, headers=headers)
    print("POST /autopilot/event-checkin status:", r.status_code)

    r = requests.get(f"{base_url}/autopilot/weekly-plan", headers=headers)
    cards = r.json().get("cards", [])
    if len(cards) < 2:
        print("Generating weekly plan cards...")
        gen_payload = {
            "force": True,
            "event_details": event_details_text
        }
        r = requests.post(f"{base_url}/autopilot/generate-weekly-plan", json=gen_payload, headers=headers)
        print("POST /autopilot/generate-weekly-plan status:", r.status_code)
        cards = r.json().get("cards", [])
    print(f"Generated {len(cards)} plan cards:")
    for c in cards:
        print(f"  - ID {c['id']}: {c.get('weekday')} ({c.get('date_display')}) | Status: {c['status']} | Topic: {c.get('topic')} | Headline: {c.get('headline')[:40]}...")

    if len(cards) < 2:
        print("Expected at least 2 cards for Tue and Thu! Cards count:", len(cards))

    card1 = cards[0]
    card2 = cards[1] if len(cards) > 1 else cards[0]

    print(f"\n--- STEP 3: Edit Card 1 ({card1['id']}) with Prompt ---")
    edit_payload = {
        "prompt": "Make this post specifically about our Eid special discount offer and fast enterprise deployment"
    }
    r = requests.post(f"{base_url}/autopilot/cards/{card1['id']}/edit-prompt", json=edit_payload, headers=headers)
    print("POST edit-prompt status:", r.status_code)
    edited_card = r.json().get("card", {})
    print("Edited Card Headline:", edited_card.get("headline"))
    print("Edited Card Status (should be Pending Approval):", edited_card.get("status"))
    assert edited_card.get("status") == "Pending Approval"

    print(f"\n--- STEP 4: Swap Card 2 ({card2['id']}) Image from Library ---")
    # First get image library
    r = requests.get(f"{base_url}/autopilot/image-library", headers=headers)
    library_images = r.json().get("images", [])
    print(f"Fetched {len(library_images)} library images")
    
    # Pick a library image or use variant
    if library_images:
        target_img = library_images[0].get("url") or library_images[0].get("image_url")
        swap_payload = {
            "action": "library",
            "image_url": target_img
        }
    else:
        # Fallback to swapping variant
        swap_payload = {
            "action": "swap_variant"
        }
    r = requests.post(f"{base_url}/autopilot/cards/{card2['id']}/change-image", json=swap_payload, headers=headers)
    print("POST change-image status:", r.status_code)
    swapped_card = r.json().get("card", {})
    print("Swapped Card Image URL:", swapped_card.get("media_url"))
    print("Swapped Card Status (should be Pending Approval):", swapped_card.get("status"))

    print(f"\n--- STEP 5: Skip One Day (Card 1: {card1['id']}) ---")
    r = requests.post(f"{base_url}/autopilot/cards/{card1['id']}/skip", headers=headers)
    print("POST skip status:", r.status_code)
    skipped_card = r.json().get("card", {})
    print("Card 1 Status after skip:", skipped_card.get("status"))
    assert skipped_card.get("status") == "Skipped"

    print(f"\n--- STEP 6: Approve Remaining Post (Card 2: {card2['id']}) ---")
    # Toggle or approve all
    r = requests.post(f"{base_url}/autopilot/approve-all", headers=headers)
    print("POST approve-all status:", r.status_code)
    approved_count = r.json().get("approved_count")
    print(f"Approved {approved_count} cards")

    # Refresh card 2 status
    r = requests.get(f"{base_url}/autopilot/weekly-plan", headers=headers)
    latest_cards = r.json().get("cards", [])
    for lc in latest_cards:
        if lc["id"] == card2["id"]:
            print(f"Card 2 ({lc['id']}) Status:", lc["status"])
            assert lc["status"] == "Scheduled"

    print(f"\n--- STEP 7: Verified Facebook Publishing for Approved Card ({card2['id']}) ---")
    pub_payload = {
        "platform": "facebook"
    }
    r = requests.post(f"{base_url}/autopilot/cards/{card2['id']}/publish-now", json=pub_payload, headers=headers)
    print("POST publish-now status:", r.status_code)
    pub_res = r.json()
    print("Publish Response:", json.dumps(pub_res, indent=2))
    
    if pub_res.get("success"):
        print("\nSUCCESS! VERIFIED PUBLISHING RESULT:")
        print("  - Post ID:", pub_res.get("post_id"))
        print("  - Live Permalink:", pub_res.get("permalink"))
        print("  - Platform:", pub_res.get("platform"))
    else:
        print("Publishing details:", pub_res)

    db.close()

if __name__ == "__main__":
    main()
