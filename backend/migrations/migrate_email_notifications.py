import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text
from database import engine

def run_migration():
    print("Running migration for Email Logs and In-App Notifications...")
    with engine.connect() as conn:
        # 1. Add verification and preference columns to users table if not exist
        user_cols = [r[0] for r in conn.execute(text("DESCRIBE users")).fetchall()]
        print("Existing user columns:", user_cols)

        if "is_verified" not in user_cols:
            print("Adding is_verified to users...")
            conn.execute(text("ALTER TABLE users ADD COLUMN is_verified TINYINT(1) DEFAULT 0 NOT NULL"))
            # Existing users should be verified by default
            conn.execute(text("UPDATE users SET is_verified = 1"))
            conn.commit()

        if "verification_token" not in user_cols:
            print("Adding verification_token to users...")
            conn.execute(text("ALTER TABLE users ADD COLUMN verification_token VARCHAR(255) NULL"))
            conn.commit()

        if "verification_token_expires_at" not in user_cols:
            print("Adding verification_token_expires_at to users...")
            conn.execute(text("ALTER TABLE users ADD COLUMN verification_token_expires_at DATETIME NULL"))
            conn.commit()

        if "welcome_sent" not in user_cols:
            print("Adding welcome_sent to users...")
            conn.execute(text("ALTER TABLE users ADD COLUMN welcome_sent TINYINT(1) DEFAULT 0 NOT NULL"))
            conn.commit()

        if "notification_preferences" not in user_cols:
            print("Adding notification_preferences to users...")
            conn.execute(text("ALTER TABLE users ADD COLUMN notification_preferences JSON NULL"))
            conn.commit()

        # 2. Create email_logs table
        print("Creating email_logs table if not exists...")
        conn.execute(text("""
        CREATE TABLE IF NOT EXISTS email_logs (
            id VARCHAR(36) PRIMARY KEY,
            user_id VARCHAR(36) NULL,
            brand_id VARCHAR(36) NULL,
            recipient VARCHAR(255) NOT NULL,
            subject VARCHAR(512) NOT NULL,
            template VARCHAR(100) NOT NULL,
            status VARCHAR(50) NOT NULL DEFAULT 'captured (dev)',
            provider VARCHAR(50) NOT NULL DEFAULT 'dev',
            full_html LONGTEXT NOT NULL,
            plain_text LONGTEXT NULL,
            links_json JSON NULL,
            metadata_json JSON NULL,
            idempotency_key VARCHAR(255) NULL UNIQUE,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_email_recipient (recipient),
            INDEX idx_email_template (template),
            INDEX idx_email_status (status),
            INDEX idx_email_created (created_at),
            CONSTRAINT fk_email_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
            CONSTRAINT fk_email_brand FOREIGN KEY (brand_id) REFERENCES brands(id) ON DELETE SET NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        """))
        conn.commit()

        # 3. Create notifications table
        print("Creating notifications table if not exists...")
        conn.execute(text("""
        CREATE TABLE IF NOT EXISTS notifications (
            id VARCHAR(36) PRIMARY KEY,
            user_id VARCHAR(36) NOT NULL,
            brand_id VARCHAR(36) NULL,
            title VARCHAR(255) NOT NULL,
            message TEXT NOT NULL,
            type VARCHAR(50) NOT NULL DEFAULT 'info',
            is_read TINYINT(1) NOT NULL DEFAULT 0,
            read_at DATETIME NULL,
            action_type VARCHAR(50) NULL,
            action_payload JSON NULL,
            idempotency_key VARCHAR(255) NULL UNIQUE,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_notif_user (user_id),
            INDEX idx_notif_unread (user_id, is_read),
            INDEX idx_notif_created (created_at),
            CONSTRAINT fk_notif_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            CONSTRAINT fk_notif_brand FOREIGN KEY (brand_id) REFERENCES brands(id) ON DELETE SET NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        """))
        conn.commit()

    print("Migration finished successfully!")

if __name__ == "__main__":
    run_migration()

