import os
import sys

sys.stdout.reconfigure(encoding='utf-8')

env_file = 'backend/.env'
if os.path.exists(env_file):
    with open(env_file, 'r', encoding='utf-8') as f:
        print("=== SOCIAL CREDENTIALS IN .ENV ===")
        for line in f:
            line_s = line.strip()
            if any(k in line_s for k in ['META_', 'LINKEDIN_', 'TIKTOK_', 'TWITTER_', 'X_']):
                parts = line_s.split('=', 1)
                k = parts[0].strip()
                v = parts[1].strip() if len(parts) > 1 else ''
                print(f"  {k}: {'SET (len=' + str(len(v)) + ')' if v else 'EMPTY'}")
else:
    print(".env file not found!")

