import os
import sys
import uuid
import datetime
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

# Add backend directory to sys.path
backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from database import engine, SessionLocal
from models.models import Base, Post, PlatformCopy, ContentIdea, GeneratedPost, ScheduledPost, User, Brand

def run_migration():
    print("[*] Starting Multi-Platform Parent Posts & Copies Migration...")

    # 1. Ensure tables exist in database
    with engine.connect() as conn:
        # Create posts table if not exists
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS posts (
                id VARCHAR(36) PRIMARY KEY,
                brand_id VARCHAR(36) NULL,
                user_id VARCHAR(36),
                title VARCHAR(255) NOT NULL,
                topic VARCHAR(255),
                credits_used INT DEFAULT 1 NOT NULL,
                session_id VARCHAR(36),
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_posts_brand_id (brand_id),
                INDEX idx_posts_user_id (user_id),
                INDEX idx_posts_created_at (created_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        """))
        try:
            conn.execute(text("ALTER TABLE posts MODIFY brand_id VARCHAR(36) NULL;"))
        except Exception:
            pass

        # Create platform_copies table if not exists
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS platform_copies (
                id VARCHAR(36) PRIMARY KEY,
                post_id VARCHAR(36) NOT NULL,
                platform VARCHAR(50) NOT NULL,
                caption MEDIUMTEXT,
                hashtags JSON,
                image_url MEDIUMTEXT,
                aspect_ratio VARCHAR(20) DEFAULT '1:1',
                status VARCHAR(50) DEFAULT 'draft',
                scheduled_at DATETIME,
                external_post_id VARCHAR(255),
                error MEDIUMTEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_copies_post_id (post_id),
                INDEX idx_copies_platform (platform),
                INDEX idx_copies_status (status),
                FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        """))

        # Add post_id and platform_copy_id to scheduled_posts if they don't exist
        for col_def in [
            ("post_id", "VARCHAR(36) NULL"),
            ("platform_copy_id", "VARCHAR(36) NULL")
        ]:
            col_name, col_type = col_def
            check_col = conn.execute(text(f"""
                SELECT COUNT(*) FROM information_schema.COLUMNS 
                WHERE TABLE_SCHEMA = DATABASE() 
                AND TABLE_NAME = 'scheduled_posts' 
                AND COLUMN_NAME = '{col_name}';
            """)).scalar()
            if check_col == 0:
                print(f"Adding column '{col_name}' to scheduled_posts...")
                conn.execute(text(f"ALTER TABLE scheduled_posts ADD COLUMN {col_name} {col_type};"))
        conn.commit()

    db = SessionLocal()
    try:
        # Check existing parent posts
        existing_posts_count = db.query(Post).count()
        print(f"Current posts in DB before migration: {existing_posts_count}")

        # Fetch all generated_posts
        gen_posts = db.query(GeneratedPost).order_by(GeneratedPost.created_at.asc()).all()
        print(f"Found {len(gen_posts)} legacy generated_posts to group and migrate.")

        # Grouping strategy:
        # 1) Group by idea_id (primary generation grouping)
        # 2) For any without idea_id or unmatched, group by (brand_id + created_at within 5 min + similar caption/title)
        grouped_by_idea = {}
        ungrouped = []

        for p in gen_posts:
            if p.idea_id:
                grouped_by_idea.setdefault(p.idea_id, []).append(p)
            else:
                ungrouped.append(p)

        # Also group ungrouped items by brand_id + timestamp window
        additional_groups = []
        for p in ungrouped:
            matched = False
            for grp in additional_groups:
                lead = grp[0]
                if lead.brand_id == p.brand_id and p.created_at and lead.created_at:
                    diff = abs((p.created_at - lead.created_at).total_seconds())
                    if diff <= 300:  # 5 minutes
                        grp.append(p)
                        matched = True
                        break
            if not matched:
                additional_groups.append([p])

        def normalize_platform(plat: str) -> str:
            p = (plat or "").lower()
            if "instagram" in p or "story" in p:
                return "instagram"
            elif "linkedin" in p:
                return "linkedin"
            elif "facebook" in p:
                return "facebook"
            elif "twitter" in p or "x" == p:
                return "twitter"
            elif "tiktok" in p:
                return "tiktok"
            return p or "instagram"

        def normalize_status(st: str) -> str:
            s = (st or "draft").lower()
            if s in ("posted", "published"):
                return "published"
            elif s in ("scheduled", "scheduling"):
                return "scheduled"
            elif s in ("failed", "error"):
                return "failed"
            elif s in ("publishing", "pending"):
                return "publishing"
            return "draft"

        posts_created = 0
        copies_created = 0

        # Process idea-based groups
        for idea_id, posts_in_grp in grouped_by_idea.items():
            idea = db.query(ContentIdea).filter(ContentIdea.id == idea_id).first()
            lead_post = posts_in_grp[0]
            brand_id = (idea.brand_id if idea else None) or lead_post.brand_id
            user_id = (idea.user_id if idea else None) or lead_post.user_id

            # Validate user_id exists in users table
            if user_id:
                u = db.query(User).filter(User.id == user_id).first()
                if not u:
                    user_id = None
            else:
                u = None

            if not brand_id and u:
                if u.active_brand_id:
                    brand_id = u.active_brand_id
                else:
                    b = db.query(Brand).filter(Brand.user_id == u.id).first()
                    if b:
                        brand_id = b.id
            if not brand_id:
                first_brand = db.query(Brand).first()
                if first_brand:
                    brand_id = first_brand.id

            if not user_id and brand_id:
                b = db.query(Brand).filter(Brand.id == brand_id).first()
                if b and b.user_id and db.query(User).filter(User.id == b.user_id).first():
                    user_id = b.user_id

            title = (idea.idea_title if idea else None) or "Campaign Pack"
            topic = title
            created_at = (idea.created_at if idea else None) or lead_post.created_at or datetime.datetime.utcnow()

            # Check if Post already exists
            parent_post = db.query(Post).filter(Post.id == idea_id).first()
            if not parent_post:
                parent_post = Post(
                    id=idea_id,
                    brand_id=brand_id,
                    user_id=user_id,
                    title=title,
                    topic=topic,
                    credits_used=1,
                    session_id=idea_id,
                    created_at=created_at,
                    updated_at=created_at
                )
                db.add(parent_post)
                db.flush()
                posts_created += 1

            for gp in posts_in_grp:
                # Check if copy already exists
                copy_exists = db.query(PlatformCopy).filter(PlatformCopy.id == gp.id).first()
                if not copy_exists:
                    platform_norm = normalize_platform(gp.platform)
                    img_url = gp.post_image_url or gp.story_image_url or gp.banner_image_url
                    aspect = "9:16" if "story" in (gp.platform or "").lower() or platform_norm == "tiktok" else "1:1"
                    copy = PlatformCopy(
                        id=gp.id,
                        post_id=parent_post.id,
                        platform=platform_norm,
                        caption=gp.caption or "",
                        hashtags=gp.hashtags or [],
                        image_url=img_url,
                        aspect_ratio=aspect,
                        status=normalize_status(gp.status),
                        scheduled_at=None,
                        error=None,
                        created_at=gp.created_at or created_at,
                        updated_at=gp.created_at or created_at
                    )
                    db.add(copy)
                    copies_created += 1

        # Process additional timestamp-window groups
        for grp in additional_groups:
            lead_post = grp[0]
            new_post_id = str(uuid.uuid4())
            brand_id = lead_post.brand_id
            user_id = lead_post.user_id

            # Validate user_id exists in users table
            if user_id:
                u = db.query(User).filter(User.id == user_id).first()
                if not u:
                    user_id = None
            else:
                u = None

            if not brand_id and u:
                if u.active_brand_id:
                    brand_id = u.active_brand_id
                else:
                    b = db.query(Brand).filter(Brand.user_id == u.id).first()
                    if b:
                        brand_id = b.id
            if not brand_id:
                first_brand = db.query(Brand).first()
                if first_brand:
                    brand_id = first_brand.id

            if not user_id and brand_id:
                b = db.query(Brand).filter(Brand.id == brand_id).first()
                if b and b.user_id and db.query(User).filter(User.id == b.user_id).first():
                    user_id = b.user_id

            first_line = (lead_post.caption or "").strip().split("\n")[0][:60]
            title = first_line or "Multi-Channel Post"
            topic = title
            created_at = lead_post.created_at or datetime.datetime.utcnow()

            parent_post = Post(
                id=new_post_id,
                brand_id=brand_id,
                user_id=user_id,
                title=title,
                topic=topic,
                credits_used=1,
                session_id=None,
                created_at=created_at,
                updated_at=created_at
            )
            db.add(parent_post)
            db.flush()
            posts_created += 1

            for gp in grp:
                copy_exists = db.query(PlatformCopy).filter(PlatformCopy.id == gp.id).first()
                if not copy_exists:
                    platform_norm = normalize_platform(gp.platform)
                    img_url = gp.post_image_url or gp.story_image_url or gp.banner_image_url
                    aspect = "9:16" if "story" in (gp.platform or "").lower() or platform_norm == "tiktok" else "1:1"
                    copy = PlatformCopy(
                        id=gp.id,
                        post_id=parent_post.id,
                        platform=platform_norm,
                        caption=gp.caption or "",
                        hashtags=gp.hashtags or [],
                        image_url=img_url,
                        aspect_ratio=aspect,
                        status=normalize_status(gp.status),
                        scheduled_at=None,
                        error=None,
                        created_at=gp.created_at or created_at,
                        updated_at=gp.created_at or created_at
                    )
                    db.add(copy)
                    copies_created += 1

        db.commit()

        # Link scheduled_posts to parent posts / platform copies if matching
        sched_posts = db.query(ScheduledPost).all()
        sched_linked = 0
        for sp in sched_posts:
            if not sp.platform_copy_id or not sp.post_id:
                # Find matching copy by media_url or caption or brand
                matching_copy = db.query(PlatformCopy).join(Post).filter(
                    Post.brand_id == sp.brand_id,
                    PlatformCopy.platform == normalize_platform(sp.platform)
                ).order_by(PlatformCopy.created_at.desc()).first()
                if matching_copy:
                    sp.platform_copy_id = matching_copy.id
                    sp.post_id = matching_copy.post_id
                    sched_linked += 1
        db.commit()

        total_posts_now = db.query(Post).count()
        total_copies_now = db.query(PlatformCopy).count()
        print("Migration complete!")
        print(f"Created {posts_created} parent posts and {copies_created} platform copies.")
        print(f"Linked {sched_linked} scheduled_posts.")
        print(f"Total parent posts now: {total_posts_now}")
        print(f"Total platform copies now: {total_copies_now}")

    except Exception as e:
        db.rollback()
        print(f"Error during migration: {e}")
        raise
    finally:
        db.close()

if __name__ == "__main__":
    run_migration()
