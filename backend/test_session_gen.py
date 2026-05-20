import sys
import traceback
import json
from sqlalchemy.orm import Session
from database import SessionLocal
from models.models import Brand, User, DailySession, WebsiteScan, ContentIdea
from services.gemini_service import GeminiService

def run_test():
    db = SessionLocal()
    try:
        print("1. Fetching first user...")
        user = db.query(User).first()
        if not user:
            print("Error: No users found.")
            return
            
        print("2. Fetching brand profile...")
        brand = db.query(Brand).filter(Brand.user_id == user.id).first()
        if not brand:
            print("Error: No brand profile found.")
            return
            
        print("3. Fetching latest website scan...")
        scan = db.query(WebsiteScan).filter(WebsiteScan.brand_id == brand.id).order_by(WebsiteScan.scanned_at.desc()).first()
        if not scan:
            scan = db.query(WebsiteScan).filter(WebsiteScan.user_id == user.id).order_by(WebsiteScan.scanned_at.desc()).first()
            
        website_data = (scan.raw_text if scan and scan.raw_text else "No recent scan data available.")
        
        print("4. Fetching last 7 posts history...")
        recent_ideas = db.query(ContentIdea).filter(ContentIdea.user_id == user.id).order_by(ContentIdea.created_at.desc()).limit(7).all()
        last_posts_history = [
            {"content_type": idea.content_type, "theme": idea.idea_title}
            for idea in recent_ideas
        ]
        print(f"History retrieved: {last_posts_history}")
        
        print("5. Initializing Gemini service...")
        gemini = GeminiService()
        
        print("6. Calling decide_content_strategy (Normal Day)...")
        brand_profile = {
            "business_name": brand.business_name,
            "business_type": brand.business_type,
            "brand_tone": brand.brand_tone,
            "detected_products": brand.detected_products
        }
        
        decided_strategy = gemini.decide_content_strategy(
            brand_profile=brand_profile,
            special_message="",
            is_special_day=False,
            last_posts_history=last_posts_history
        )
        print("Decided Strategy:")
        print(json.dumps(decided_strategy, indent=2))
        
        print("7. Generating multi-platform content with strategy...")
        brand_profile_full = {
            "business_name": brand.business_name,
            "business_type": brand.business_type,
            "brand_tone": brand.brand_tone,
            "brand_personality": brand.brand_personality,
            "brand_voice": brand.brand_voice,
            "detected_products": brand.detected_products,
            "colors": brand.colors,
            "brand_keywords": brand.brand_keywords
        }
        
        answers = {
            "answer_1": "Normal day, let AI decide",
            "answer_2": "Please make the best regular daily post that perfectly aligns with my brand strategy.",
            "answer_3": "Auto strategy"
        }
        
        content_data = gemini.generate_multi_platform_content(
            brand_profile=brand_profile_full,
            session_answers=answers,
            website_data=website_data,
            last_posts_history=last_posts_history,
            decided_strategy=decided_strategy
        )
        
        if not content_data:
            print("Error: content_data returned empty!")
        else:
            print("SUCCESS! Content generated with smart strategy:")
            print(f"Theme: {content_data.get('session_theme')}")
            print(f"Tip of Day: {content_data.get('guidance', {}).get('tip_of_day')}")
            
    except Exception as e:
        print("An error occurred:")
        traceback.print_exc()
    finally:
        db.close()

if __name__ == "__main__":
    run_test()
