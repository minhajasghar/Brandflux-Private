import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

from database import SessionLocal
from models.models import User, Brand, BrandMember, Post, GeneratedPost
from services.auth_service import hash_password
import uuid

def seed():
    db = SessionLocal()
    try:
        print("Checking users in database...")

        # 1. Admin Account: admin@brandflux.ai / AdminPassword123!
        admin = db.query(User).filter(User.email == "admin@brandflux.ai").first()
        if not admin:
            admin = User(
                id=str(uuid.uuid4()),
                email="admin@brandflux.ai",
                password_hash=hash_password("AdminPassword123!"),
                full_name="System Administrator",
                role="admin",
                is_suspended=False,
                is_deleted=False,
                is_verified=True,
                is_approved=True,
                is_non_payment=True,
                plan="pro"
            )
            db.add(admin)
            print("Created admin@brandflux.ai")
        else:
            admin.role = "admin"
            admin.is_suspended = False
            admin.is_deleted = False
            admin.is_verified = True
            admin.is_approved = True
            admin.is_non_payment = True
            admin.password_hash = hash_password("AdminPassword123!")
            print("Updated admin@brandflux.ai")

        # 2. Creator Account: creator@brandflux.ai / Creator123!
        creator = db.query(User).filter(User.email == "creator@brandflux.ai").first()
        if not creator:
            creator = User(
                id=str(uuid.uuid4()),
                email="creator@brandflux.ai",
                password_hash=hash_password("Creator123!"),
                full_name="TNT Creator",
                role="user",
                is_suspended=False,
                is_deleted=False,
                is_verified=True,
                is_approved=True,
                is_non_payment=True,
                plan="pro"
            )
            db.add(creator)
            print("Created creator@brandflux.ai")
        else:
            creator.role = "user"
            creator.is_suspended = False
            creator.is_deleted = False
            creator.is_verified = True
            creator.is_approved = True
            creator.is_non_payment = True
            creator.plan = "pro"
            creator.password_hash = hash_password("Creator123!")
            print("Updated creator@brandflux.ai")

        db.commit()

        # Find or create Brand for TNT Innovations owned by creator
        brand = db.query(Brand).filter(Brand.user_id == creator.id).first()
        if not brand:
            existing_brand = db.query(Brand).filter(Brand.name.ilike("%TNT%")).first()
            if existing_brand:
                brand = existing_brand
                brand.user_id = creator.id
                brand.onboarding_complete = True
                brand.is_active = True
                brand.require_approval = True
                print(f"Reassigned existing brand '{brand.name}' to creator")
            else:
                brand = Brand(
                    id=str(uuid.uuid4()),
                    user_id=creator.id,
                    name="TNT Innovations",
                    business_name="TNT Innovations",
                    website_url="https://tntinnov.com",
                    business_type="Technology & Retail",
                    industry="Retail and Technology",
                    target_audience="Modern shoppers and technology enthusiasts",
                    brand_tone="innovative, bold, and authoritative",
                    primary_color="#F97316",
                    secondary_color="#D4FF24",
                    is_active=True,
                    onboarding_complete=True,
                    require_approval=True
                )
                db.add(brand)
                print("Created TNT Innovations brand")
        else:
            brand.onboarding_complete = True
            brand.is_active = True
            brand.require_approval = True
            print("Updated TNT Innovations brand")

        db.commit()
        creator.active_brand_id = brand.id
        db.commit()

        # 3. Approver Account: approver@brandflux.ai / Approver123!
        approver = db.query(User).filter(User.email == "approver@brandflux.ai").first()
        if not approver:
            approver = User(
                id=str(uuid.uuid4()),
                email="approver@brandflux.ai",
                password_hash=hash_password("Approver123!"),
                full_name="Content Approver",
                role="user",
                is_suspended=False,
                is_deleted=False,
                is_verified=True,
                is_approved=True,
                is_non_payment=True,
                plan="pro",
                active_brand_id=brand.id
            )
            db.add(approver)
            print("Created approver@brandflux.ai")
        else:
            approver.is_suspended = False
            approver.is_deleted = False
            approver.is_verified = True
            approver.is_approved = True
            approver.active_brand_id = brand.id
            approver.password_hash = hash_password("Approver123!")
            print("Updated approver@brandflux.ai")

        # 4. User's specific Approver: zia.younas@tntinnov.com / approver
        zia = db.query(User).filter(User.email == "zia.younas@tntinnov.com").first()
        if not zia:
            zia = User(
                id=str(uuid.uuid4()),
                email="zia.younas@tntinnov.com",
                password_hash=hash_password("approver"),
                full_name="Zia Younas",
                role="user",
                is_suspended=False,
                is_deleted=False,
                is_verified=True,
                is_approved=True,
                is_non_payment=True,
                plan="pro",
                active_brand_id=brand.id
            )
            db.add(zia)
            print("Created zia.younas@tntinnov.com")
        else:
            zia.is_suspended = False
            zia.is_deleted = False
            zia.is_verified = True
            zia.is_approved = True
            zia.active_brand_id = brand.id
            zia.password_hash = hash_password("approver")
            print("Updated zia.younas@tntinnov.com")

        db.commit()

        # Ensure creator is in BrandMember as creator
        creator_bm = db.query(BrandMember).filter(
            BrandMember.brand_id == brand.id,
            BrandMember.user_id == creator.id
        ).first()
        if not creator_bm:
            creator_bm = BrandMember(
                id=str(uuid.uuid4()),
                brand_id=brand.id,
                user_id=creator.id,
                role="creator",
                status="active"
            )
            db.add(creator_bm)
        else:
            creator_bm.role = "creator"
            creator_bm.status = "active"

        # Link approver and zia to TNT Innovations brand as approvers with status='active'
        for app_user in [approver, zia]:
            bm = db.query(BrandMember).filter(
                BrandMember.brand_id == brand.id,
                BrandMember.user_id == app_user.id
            ).first()
            if not bm:
                bm = BrandMember(
                    id=str(uuid.uuid4()),
                    brand_id=brand.id,
                    user_id=app_user.id,
                    role="approver",
                    status="active"
                )
                db.add(bm)
                print(f"Added {app_user.email} as active approver for {brand.name}")
            else:
                bm.role = "approver"
                bm.status = "active"
                print(f"Set {app_user.email} as active approver for {brand.name}")

        db.commit()
        print("✓ All test accounts verified and seeded successfully!")

        # Print all users summary
        users = db.query(User).all()
        for u in users:
            print(f"User: email={u.email}, role={u.role}, is_approved={u.is_approved}, is_non_payment={u.is_non_payment}, active_brand={u.active_brand_id}")

    except Exception as e:
        db.rollback()
        print("Error during seed:", e)
        raise
    finally:
        db.close()

if __name__ == "__main__":
    seed()
