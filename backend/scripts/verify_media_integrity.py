import sys
import os
sys.path.append(os.path.abspath("backend"))

from database import engine
from sqlalchemy import text
from services.storage import storage_service

def verify_media():
    print("=" * 60)
    print("MEDIA INTEGRITY AUDIT (DB ROWS vs STORAGE/R2)")
    print("=" * 60)
    
    missing_records = []
    total_checked = 0
    valid_count = 0

    with engine.connect() as conn:
        # 1. PostImage
        rows = conn.execute(text("SELECT id, post_id, image_url FROM post_images")).fetchall()
        for r in rows:
            total_checked += 1
            url = r[2]
            if not url or not storage_service.verify_image_reachable(url):
                missing_records.append({"table": "post_images", "id": r[0], "ref": r[1], "url": url})
            else:
                valid_count += 1

        # 2. PlatformCopy
        rows = conn.execute(text("SELECT id, post_id, platform, image_url FROM platform_copies WHERE image_url IS NOT NULL")).fetchall()
        for r in rows:
            total_checked += 1
            url = r[3]
            if not url or not storage_service.verify_image_reachable(url):
                missing_records.append({"table": "platform_copies", "id": r[0], "ref": f"{r[1]} ({r[2]})", "url": url})
            else:
                valid_count += 1

        # 3. SessionVariant
        rows = conn.execute(text("SELECT id, session_id, variant_label, image_url FROM session_variants WHERE image_url IS NOT NULL AND image_url != ''")).fetchall()
        for r in rows:
            total_checked += 1
            url = r[3]
            if not url or not storage_service.verify_image_reachable(url):
                missing_records.append({"table": "session_variants", "id": r[0], "ref": f"{r[1]} ({r[2]})", "url": url})
            else:
                valid_count += 1

        # 4. Brand Logos
        rows = conn.execute(text("SELECT id, business_name, logo_url, clean_logo_url FROM brands")).fetchall()
        for r in rows:
            for field, url in [("logo_url", r[2]), ("clean_logo_url", r[3])]:
                if url:
                    total_checked += 1
                    if not storage_service.verify_image_reachable(url):
                        missing_records.append({"table": "brands", "id": r[0], "ref": f"{r[1]} ({field})", "url": url})
                    else:
                        valid_count += 1

    print(f"Total media records checked: {total_checked}")
    print(f"Verified reachable records:  {valid_count}")
    print(f"Missing / unverified files:  {len(missing_records)}")
    print("-" * 60)
    if missing_records:
        print("MISSING MEDIA REPORT:")
        for m in missing_records:
            print(f"  [{m['table']}] ID: {m['id']} Ref: {m['ref']}")
            print(f"    URL: {m['url']}")
    else:
        print("ALL MEDIA FILES ARE 100% REACHABLE AND VERIFIED IN STORAGE!")
    print("=" * 60)
    return len(missing_records)

if __name__ == "__main__":
    missing = verify_media()
    sys.exit(0 if missing == 0 else 1)

