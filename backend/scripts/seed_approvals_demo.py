import sys
import os
import uuid
from datetime import datetime, timedelta

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database import SessionLocal
from models.models import (
    User, Brand, BrandMember, Post, PostVersion, PlatformCopy, ScheduledPost, PostImage
)
from services.approval_service import compute_content_hash
from services.auth_service import hash_password, create_token

def seed():
    db = SessionLocal()
    try:
        # 1. Creator User
        creator = db.query(User).filter(User.email == "minhaj.asghar@tntinnov.com").first()
        if not creator:
            creator = User(
                id=str(uuid.uuid4()),
                email="minhaj.asghar@tntinnov.com",
                password_hash=hash_password("Password123!"),
                full_name="Minhaj Asghar",
                plan="pro",
                is_verified=True,
                role="user"
            )
            db.add(creator)
            db.flush()

        # 2. Creator's Brand
        brand = db.query(Brand).filter(Brand.user_id == creator.id).first()
        if not brand:
            brand = Brand(
                id=str(uuid.uuid4()),
                user_id=creator.id,
                business_name="TNT Innovations",
                industry="Artificial Intelligence & Software",
                require_approval=True,
                approval_mode="anyone",
                approval_autopilot_routing="approvers",
                approval_deadline_hours=24,
                approval_reminder_hours=6,
                created_at=datetime.utcnow()
            )
            db.add(brand)
            db.flush()
        else:
            brand.require_approval = True
            brand.approval_mode = "anyone"
            brand.approval_autopilot_routing = "approvers"
            brand.approval_deadline_hours = 24
            brand.approval_reminder_hours = 6

        creator.active_brand_id = brand.id

        # Creator Member
        cm = db.query(BrandMember).filter(BrandMember.brand_id == brand.id, BrandMember.user_id == creator.id).first()
        if not cm:
            cm = BrandMember(
                id=str(uuid.uuid4()),
                brand_id=brand.id,
                user_id=creator.id,
                role="creator",
                status="active",
                created_at=datetime.utcnow()
            )
            db.add(cm)

        # 3. Approver User
        approver = db.query(User).filter(User.email == "sarah.approver@brandflux.io").first()
        if not approver:
            approver = User(
                id=str(uuid.uuid4()),
                email="sarah.approver@brandflux.io",
                password_hash=hash_password("Approver123!"),
                full_name="Sarah Approver",
                plan="free",
                is_verified=True,
                active_brand_id=brand.id,
                role="user"
            )
            db.add(approver)
            db.flush()
        else:
            approver.active_brand_id = brand.id

        # Active Approver Member
        am = db.query(BrandMember).filter(BrandMember.brand_id == brand.id, BrandMember.user_id == approver.id).first()
        if not am:
            am = BrandMember(
                id=str(uuid.uuid4()),
                brand_id=brand.id,
                user_id=approver.id,
                role="approver",
                status="active",
                invited_email=approver.email,
                accepted_at=datetime.utcnow(),
                created_at=datetime.utcnow()
            )
            db.add(am)

        # Invited Member
        im = db.query(BrandMember).filter(BrandMember.brand_id == brand.id, BrandMember.invited_email == "alex.director@brandflux.io").first()
        if not im:
            im = BrandMember(
                id=str(uuid.uuid4()),
                brand_id=brand.id,
                user_id=None,
                role="approver",
                status="invited",
                invited_email="alex.director@brandflux.io",
                invitation_token=str(uuid.uuid4()),
                invitation_expires_at=datetime.utcnow() + timedelta(days=7),
                created_at=datetime.utcnow()
            )
            db.add(im)

        # 4. Posts for Approvals Inbox
        sample_img1 = "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&auto=format&fit=crop&q=80"
        sample_img2 = "https://images.unsplash.com/photo-1620641788421-7a1c342ea42e?w=800&auto=format&fit=crop&q=80"
        sample_img3 = "https://images.unsplash.com/photo-1634017839464-5c339ebe3cb4?w=800&auto=format&fit=crop&q=80"

        # Post A: Waiting (In Review)
        p_waiting = db.query(Post).filter(Post.brand_id == brand.id, Post.title == "Q4 AI Platform Launch Announcement").first()
        if not p_waiting:
            p_waiting = Post(
                id=str(uuid.uuid4()),
                brand_id=brand.id,
                user_id=creator.id,
                title="Q4 AI Platform Launch Announcement",
                topic="AI Platform Next-Gen Architecture",
                status="in_review",
                created_at=datetime.utcnow() - timedelta(hours=2)
            )
            db.add(p_waiting)
            db.flush()

            # Copies
            db.add(PlatformCopy(
                id=str(uuid.uuid4()),
                post_id=p_waiting.id,
                platform="instagram",
                caption="Unveiling the future of enterprise intelligence. Our Q4 release features real-time contextual adaptation and multi-modal autonomous workflows. Designed to scale seamlessly with modern engineering teams.",
                hashtags=["#TNTInnovations", "#AIPlatform", "#NextGenTech", "#EnterpriseAI"],
                image_url=sample_img1,
                created_at=datetime.utcnow()
            ))
            db.add(PlatformCopy(
                id=str(uuid.uuid4()),
                post_id=p_waiting.id,
                platform="linkedin",
                caption="Today, TNT Innovations is thrilled to announce our Q4 Platform Architecture. With breakthrough latency optimizations and verified publishing controls, we are redefining what enterprise AI delivery looks like.",
                hashtags=["#ArtificialIntelligence", "#ProductLaunch", "#EngineeringExcellence", "#SaaS"],
                image_url=sample_img1,
                created_at=datetime.utcnow()
            ))
            db.add(PlatformCopy(
                id=str(uuid.uuid4()),
                post_id=p_waiting.id,
                platform="twitter",
                caption="Breaking: Next-gen AI platform is officially rolling out to early access partners today. 🚀 Faster, safer, and built for scale.",
                hashtags=["#AI", "#TechNews", "#TNTInnovations"],
                image_url=sample_img1,
                created_at=datetime.utcnow()
            ))

            # Image Variants
            db.add(PostImage(id=str(uuid.uuid4()), post_id=p_waiting.id, image_url=sample_img1, is_selected=True))
            db.add(PostImage(id=str(uuid.uuid4()), post_id=p_waiting.id, image_url=sample_img2, is_selected=False))
            db.add(PostImage(id=str(uuid.uuid4()), post_id=p_waiting.id, image_url=sample_img3, is_selected=False))

            sched_time = datetime.utcnow() + timedelta(days=1, hours=4)
            db.add(ScheduledPost(
                id=str(uuid.uuid4()),
                post_id=p_waiting.id,
                brand_id=brand.id,
                platform="instagram",
                caption="Unveiling the future of enterprise intelligence.",
                media_url=sample_img1,
                status="Pending Approval",
                scheduled_at=sched_time,
                created_at=datetime.utcnow()
            ))

            h = compute_content_hash(
                {"instagram": "Unveiling the future of enterprise intelligence."},
                {"instagram": ["#TNTInnovations"]},
                sample_img1,
                sched_time
            )
            db.add(PostVersion(
                id=str(uuid.uuid4()),
                post_id=p_waiting.id,
                brand_id=brand.id,
                version_number=1,
                submitted_by_id=creator.id,
                captions={"instagram": "Unveiling the future of enterprise intelligence."},
                hashtags={"instagram": ["#TNTInnovations"]},
                image_url=sample_img1,
                scheduled_time=sched_time,
                content_hash=h,
                status="in_review",
                created_at=datetime.utcnow() - timedelta(hours=2)
            ))

        # Post B: Changes Requested
        p_changes = db.query(Post).filter(Post.brand_id == brand.id, Post.title == "Sustainability Tech Showcase").first()
        if not p_changes:
            p_changes = Post(
                id=str(uuid.uuid4()),
                brand_id=brand.id,
                user_id=creator.id,
                title="Sustainability Tech Showcase",
                topic="Green Cloud Computing",
                status="changes_requested",
                created_at=datetime.utcnow() - timedelta(hours=5)
            )
            db.add(p_changes)
            db.flush()

            db.add(PlatformCopy(
                id=str(uuid.uuid4()),
                post_id=p_changes.id,
                platform="instagram",
                caption="Pioneering carbon-neutral AI computing. Our data pipeline optimizations reduce idle GPU compute by up to 38%.",
                hashtags=["#GreenTech", "#CleanCloud", "#Sustainability"],
                image_url=sample_img2,
                created_at=datetime.utcnow()
            ))
            db.add(PostImage(id=str(uuid.uuid4()), post_id=p_changes.id, image_url=sample_img2, is_selected=True))
            db.add(PostImage(id=str(uuid.uuid4()), post_id=p_changes.id, image_url=sample_img3, is_selected=False))

            sched_time2 = datetime.utcnow() + timedelta(days=2)
            h2 = compute_content_hash(
                {"instagram": "Pioneering carbon-neutral AI computing."},
                {"instagram": ["#GreenTech"]},
                sample_img2,
                sched_time2
            )
            db.add(PostVersion(
                id=str(uuid.uuid4()),
                post_id=p_changes.id,
                brand_id=brand.id,
                version_number=1,
                submitted_by_id=creator.id,
                captions={"instagram": "Pioneering carbon-neutral AI computing."},
                hashtags={"instagram": ["#GreenTech"]},
                image_url=sample_img2,
                scheduled_time=sched_time2,
                content_hash=h2,
                status="changes_requested",
                decision="changes_requested",
                decision_by_id=approver.id,
                decision_notes="Please sharpen the hook in line 1 and switch to the high-contrast variant.",
                changes_requested_chips=["image", "caption"],
                created_at=datetime.utcnow() - timedelta(hours=5)
            ))

        db.commit()
        creator_jwt = create_token(creator.id)
        approver_jwt = create_token(approver.id)

        print("DEMO SEEDED SUCCESSFULLY!")
        print(f"Creator Token: {creator_jwt}")
        print(f"Approver Token: {approver_jwt}")
        print(f"Waiting Post ID: {p_waiting.id}")
        print(f"Changes Post ID: {p_changes.id}")

    finally:
        db.close()

if __name__ == "__main__":
    seed()
