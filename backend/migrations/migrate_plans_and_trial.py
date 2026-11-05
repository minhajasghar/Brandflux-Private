import os
import sys
from datetime import datetime, timedelta

backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from database import engine, Base, SessionLocal
from models.models import Plan, User
from sqlalchemy import text, inspect

def run_migration():
    print("Beginning migration for plans table and trial fields...")
    inspector = inspect(engine)
    existing_tables = inspector.get_table_names()

    # 1. Create plans table if not exists
    if "plans" not in existing_tables:
        Plan.__table__.create(bind=engine)
        print("Created table: plans")
    else:
        print("Table plans already exists.")

    # 2. Add columns to users table
    user_columns = [col['name'] for col in inspector.get_columns('users')]
    new_user_cols = [
        ("trial_started_at", "DATETIME NULL"),
        ("trial_ends_at", "DATETIME NULL"),
        ("trial_credits_allocated", "INT NOT NULL DEFAULT 15"),
        ("rerolls_used_this_month", "INT NOT NULL DEFAULT 0"),
        ("x_posts_used_this_month", "INT NOT NULL DEFAULT 0"),
        ("upgrade_requested_plan", "VARCHAR(50) NULL"),
        ("upgrade_requested_at", "DATETIME NULL"),
        ("registration_ip", "VARCHAR(45) NULL"),
        ("trial_day10_email_sent", "BOOLEAN NOT NULL DEFAULT 0"),
        ("trial_day13_email_sent", "BOOLEAN NOT NULL DEFAULT 0"),
        ("trial_expired_email_sent", "BOOLEAN NOT NULL DEFAULT 0"),
    ]

    with engine.begin() as conn:
        for col_name, col_def in new_user_cols:
            if col_name not in user_columns:
                try:
                    conn.execute(text(f"ALTER TABLE users ADD COLUMN {col_name} {col_def}"))
                    print(f"Added column {col_name} to users table.")
                except Exception as e:
                    print(f"Error adding {col_name}: {e}")

    # 3. Seed default plans
    db = SessionLocal()
    default_plans = [
        {
            "id": "trial",
            "name": "14-Day Free Trial",
            "price_usd": 0,
            "price_annual_usd": 0,
            "price_local": "Free",
            "credits": 15,
            "brands": 1,
            "platforms": 2,
            "max_posts_per_day": 5,
            "daily_generation_cap": 5,
            "reroll_pool": 3,
            "x_allowed": False,
            "x_monthly_allowance": 0,
            "features": [
                "15 Post Credits (30 visuals)",
                "1 Brand Kit & Identity",
                "2 Connected Platforms (FB / IG / LinkedIn)",
                "Standard 1K AI Image Studio",
                "3 Free Image Re-rolls total",
                "Capped at 5 generations/day",
                "Full History & Download Access"
            ]
        },
        {
            "id": "starter",
            "name": "Starter Plan",
            "price_usd": 19,
            "price_annual_usd": 190,
            "price_local": "$19/mo",
            "credits": 30,
            "brands": 1,
            "platforms": 3,
            "max_posts_per_day": 2,
            "daily_generation_cap": 10,
            "reroll_pool": 15,
            "x_allowed": False,
            "x_monthly_allowance": 0,
            "features": [
                "30 Post Credits / month (60 visuals)",
                "1 Brand Kit & Voice Profile",
                "3 Connected Social Platforms",
                "15 Free Image Re-rolls / month",
                "Standard 1K High-Def Visuals",
                "Max 2 posts / day schedule",
                "Verified Social Publishing Flow"
            ]
        },
        {
            "id": "growth",
            "name": "Growth Plan",
            "price_usd": 39,
            "price_annual_usd": 390,
            "price_local": "$39/mo",
            "credits": 100,
            "brands": 3,
            "platforms": 5,
            "max_posts_per_day": 5,
            "daily_generation_cap": 25,
            "reroll_pool": 60,
            "x_allowed": False,
            "x_monthly_allowance": 0,
            "features": [
                "100 Post Credits / month (200 visuals)",
                "3 Distinct Brand Kits",
                "5 Connected Platforms",
                "60 Free Image Re-rolls / month",
                "2K Ultra-HD Visual Generations",
                "Performance Analytics Suite",
                "Autopilot Weekly Planner"
            ]
        },
        {
            "id": "pro",
            "name": "Pro Plan",
            "price_usd": 89,
            "price_annual_usd": 890,
            "price_local": "$89/mo",
            "credits": 200,
            "brands": 10,
            "platforms": 6,
            "max_posts_per_day": 999,
            "daily_generation_cap": 100,
            "reroll_pool": 100,
            "x_allowed": True,
            "x_monthly_allowance": 50,
            "features": [
                "200 Post Credits / month (400 visuals)",
                "10 Brand Kits & Multi-Brand Switcher",
                "All Platforms + X (Twitter) Publishing",
                "100 Free Image Re-rolls / month",
                "2K Ultra-HD Visual Generations",
                "Unlimited Daily Publishing",
                "Priority Rendering Queue & Team Seats"
            ]
        }
    ]

    for p_data in default_plans:
        existing = db.query(Plan).filter(Plan.id == p_data["id"]).first()
        if not existing:
            plan = Plan(
                id=p_data["id"],
                name=p_data["name"],
                price_usd=p_data["price_usd"],
                price_annual_usd=p_data["price_annual_usd"],
                price_local=p_data["price_local"],
                credits=p_data["credits"],
                brands=p_data["brands"],
                platforms=p_data["platforms"],
                max_posts_per_day=p_data["max_posts_per_day"],
                daily_generation_cap=p_data["daily_generation_cap"],
                reroll_pool=p_data["reroll_pool"],
                x_allowed=p_data["x_allowed"],
                x_monthly_allowance=p_data["x_monthly_allowance"],
                features=p_data["features"],
                is_active=True
            )
            db.add(plan)
            print(f"Seeded plan: {p_data['id']}")
        else:
            existing.name = p_data["name"]
            existing.price_usd = p_data["price_usd"]
            existing.price_annual_usd = p_data["price_annual_usd"]
            existing.credits = p_data["credits"]
            existing.brands = p_data["brands"]
            existing.platforms = p_data["platforms"]
            existing.max_posts_per_day = p_data["max_posts_per_day"]
            existing.daily_generation_cap = p_data["daily_generation_cap"]
            existing.reroll_pool = p_data["reroll_pool"]
            existing.x_allowed = p_data["x_allowed"]
            existing.x_monthly_allowance = p_data["x_monthly_allowance"]
            existing.features = p_data["features"]
            print(f"Updated existing plan: {p_data['id']}")

    db.commit()

    # 4. Initialize existing users with trial dates if they are in 'free' or 'trial' plan
    users = db.query(User).all()
    now = datetime.utcnow()
    for u in users:
        if u.plan in ("free", "trial"):
            u.plan = "trial"
            if not u.trial_started_at:
                u.trial_started_at = u.created_at or now
                u.trial_ends_at = (u.created_at or now) + timedelta(days=14)
            print(f"Synchronized trial dates for user: {u.email} (Ends: {u.trial_ends_at})")
    db.commit()
    db.close()
    print("Migration completed successfully!")

if __name__ == "__main__":
    run_migration()

