import sys
sys.path.append('backend')
from database import engine
from sqlalchemy import text

def run_migration():
    with engine.connect() as conn:
        # AutopilotConfig columns
        cols_cfg = [row[0] for row in conn.execute(text("DESCRIBE autopilot_configs")).fetchall()]
        print("Existing autopilot_configs cols:", cols_cfg)
        
        if "frequency" not in cols_cfg:
            conn.execute(text("ALTER TABLE autopilot_configs ADD COLUMN frequency VARCHAR(50) DEFAULT 'daily'"))
            print("Added frequency to autopilot_configs")
        if "custom_weekdays" not in cols_cfg:
            conn.execute(text("ALTER TABLE autopilot_configs ADD COLUMN custom_weekdays JSON NULL"))
            print("Added custom_weekdays to autopilot_configs")
        if "posting_time" not in cols_cfg:
            conn.execute(text("ALTER TABLE autopilot_configs ADD COLUMN posting_time VARCHAR(10) DEFAULT '07:00'"))
            print("Added posting_time to autopilot_configs")
        if "timezone" not in cols_cfg:
            conn.execute(text("ALTER TABLE autopilot_configs ADD COLUMN timezone VARCHAR(100) DEFAULT 'Asia/Karachi'"))
            print("Added timezone to autopilot_configs")
        if "last_event_prompt_response" not in cols_cfg:
            conn.execute(text("ALTER TABLE autopilot_configs ADD COLUMN last_event_prompt_response TEXT NULL"))
            print("Added last_event_prompt_response to autopilot_configs")

        # ScheduledPost columns
        cols_sp = [row[0] for row in conn.execute(text("DESCRIBE scheduled_posts")).fetchall()]
        print("Existing scheduled_posts cols:", cols_sp)
        if "variant_image_url" not in cols_sp:
            conn.execute(text("ALTER TABLE scheduled_posts ADD COLUMN variant_image_url TEXT NULL"))
            print("Added variant_image_url to scheduled_posts")
        if "topic" not in cols_sp:
            conn.execute(text("ALTER TABLE scheduled_posts ADD COLUMN topic TEXT NULL"))
            print("Added topic to scheduled_posts")
        if "headline" not in cols_sp:
            conn.execute(text("ALTER TABLE scheduled_posts ADD COLUMN headline TEXT NULL"))
            print("Added headline to scheduled_posts")
        if "platform_copies" not in cols_sp:
            conn.execute(text("ALTER TABLE scheduled_posts ADD COLUMN platform_copies JSON NULL"))
            print("Added platform_copies to scheduled_posts")
        if "edit_prompt" not in cols_sp:
            conn.execute(text("ALTER TABLE scheduled_posts ADD COLUMN edit_prompt TEXT NULL"))
            print("Added edit_prompt to scheduled_posts")

        conn.commit()
        print("Migration complete!")

if __name__ == "__main__":
    run_migration()
