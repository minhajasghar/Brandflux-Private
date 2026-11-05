import os
import logging
from datetime import datetime, timedelta, timezone
from typing import Dict, Any, Optional, List
from sqlalchemy.orm import Session
from sqlalchemy import func
from fastapi import HTTPException, status

from models.models import User, Brand, Plan, SocialAccount, Usage, DailySession, ScheduledPost
from services.credit_service import get_user_credit_balance, deduct_post_credit

logger = logging.getLogger(__name__)

DEFAULT_PLANS: Dict[str, Dict[str, Any]] = {
    "trial": {
        "id": "trial",
        "name": "14-Day Free Trial",
        "price_usd": 0,
        "price_annual_usd": 0,
        "credits": 15,
        "brands": 1,
        "platforms": 2,
        "max_posts_per_day": 5,
        "daily_generation_cap": 5,
        "reroll_pool": 3,
        "x_allowed": False,
        "x_monthly_allowance": 0
    },
    "starter": {
        "id": "starter",
        "name": "Starter Plan",
        "price_usd": 19,
        "price_annual_usd": 190,
        "credits": 30,
        "brands": 1,
        "platforms": 3,
        "max_posts_per_day": 2,
        "daily_generation_cap": 10,
        "reroll_pool": 15,
        "x_allowed": False,
        "x_monthly_allowance": 0
    },
    "growth": {
        "id": "growth",
        "name": "Growth Plan",
        "price_usd": 39,
        "price_annual_usd": 390,
        "credits": 100,
        "brands": 3,
        "platforms": 5,
        "max_posts_per_day": 5,
        "daily_generation_cap": 25,
        "reroll_pool": 60,
        "x_allowed": False,
        "x_monthly_allowance": 0
    },
    "pro": {
        "id": "pro",
        "name": "Pro Plan",
        "price_usd": 89,
        "price_annual_usd": 890,
        "credits": 200,
        "brands": 10,
        "platforms": 6,
        "max_posts_per_day": 999,
        "daily_generation_cap": 100,
        "reroll_pool": 100,
        "x_allowed": True,
        "x_monthly_allowance": 50
    }
}


def get_plan(db: Session, plan_id: str) -> Plan:
    """Retrieve plan by id with database fallback."""
    clean_id = (plan_id or "trial").lower().strip()
    if clean_id == "free":
        clean_id = "trial"

    plan = db.query(Plan).filter(Plan.id == clean_id).first()
    if not plan:
        defaults = DEFAULT_PLANS.get(clean_id, DEFAULT_PLANS["trial"])
        plan = Plan(
            id=clean_id,
            name=defaults["name"],
            price_usd=defaults["price_usd"],
            price_annual_usd=defaults["price_annual_usd"],
            credits=defaults["credits"],
            brands=defaults["brands"],
            platforms=defaults["platforms"],
            max_posts_per_day=defaults["max_posts_per_day"],
            daily_generation_cap=defaults["daily_generation_cap"],
            reroll_pool=defaults["reroll_pool"],
            x_allowed=defaults["x_allowed"],
            x_monthly_allowance=defaults["x_monthly_allowance"],
            is_active=True
        )
        try:
            db.add(plan)
            db.commit()
            db.refresh(plan)
        except Exception:
            db.rollback()
    return plan


def get_user_plan_limits(db: Session, user: User) -> Dict[str, Any]:
    """Calculate real-time plan status, trial expiration, and quota usage for a user."""
    plan_id = (user.plan or "trial").lower().strip()
    if plan_id == "free":
        plan_id = "trial"

    plan = get_plan(db, plan_id)
    credits_info = get_user_credit_balance(user.id, db)
    credits_balance = credits_info.get("balance", 0)

    # Trial calculation
    now = datetime.utcnow()
    is_trial = plan_id == "trial"
    trial_days_left = 0
    trial_is_expired = False

    if is_trial:
        if user.trial_ends_at:
            delta = user.trial_ends_at - now
            trial_days_left = max(0, delta.days if delta.total_seconds() > 0 else 0)
            if delta.total_seconds() <= 0 or credits_balance <= 0:
                trial_is_expired = True
        else:
            trial_days_left = 14

    # Daily generations count
    start_of_day = now.replace(hour=0, minute=0, second=0, microsecond=0)
    generations_today = db.query(DailySession).filter(
        DailySession.user_id == user.id,
        DailySession.created_at >= start_of_day
    ).count()

    # Re-rolls remaining in monthly pool
    rerolls_pool = getattr(plan, "reroll_pool", 3)
    rerolls_used = getattr(user, "rerolls_used_this_month", 0) or 0
    free_rerolls_left = max(0, rerolls_pool - rerolls_used)

    # Connected platforms and brands count
    brands_count = db.query(Brand).filter(Brand.user_id == user.id).count()
    connected_platforms_count = db.query(SocialAccount).filter(
        SocialAccount.user_id == user.id,
        SocialAccount.is_active == True
    ).count()

    return {
        "plan_id": plan.id,
        "plan_name": plan.name,
        "price_usd": plan.price_usd,
        "price_annual_usd": plan.price_annual_usd,
        "credits_remaining": credits_balance,
        "is_trial": is_trial,
        "trial_days_left": trial_days_left,
        "trial_is_expired": trial_is_expired,
        "trial_ends_at": user.trial_ends_at.isoformat() if user.trial_ends_at else None,
        "free_rerolls_left": free_rerolls_left,
        "rerolls_pool": rerolls_pool,
        "rerolls_used": rerolls_used,
        "generations_today": generations_today,
        "daily_generation_cap": plan.daily_generation_cap,
        "max_posts_per_day": plan.max_posts_per_day,
        "brands_used": brands_count,
        "brands_limit": plan.brands,
        "platforms_used": connected_platforms_count,
        "platforms_limit": plan.platforms,
        "x_allowed": plan.x_allowed,
        "x_monthly_allowance": plan.x_monthly_allowance,
        "x_posts_used": getattr(user, "x_posts_used_this_month", 0) or 0,
        "upgrade_requested_plan": user.upgrade_requested_plan
    }


def enforce_can_generate_post(db: Session, user: User) -> None:
    """Server-side check: refuses post generation if trial expired, daily cap reached, or 0 credits."""
    limits = get_user_plan_limits(db, user)

    # 1. Trial Expiry check
    if limits["is_trial"] and limits["trial_is_expired"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "code": "TRIAL_EXPIRED",
                "message": "Your 14-day free trial has concluded or credits have been fully used. Upgrade to continue generating and publishing content.",
                "upgrade_url": "/pricing"
            }
        )

    # 2. Daily generation cap check
    if limits["generations_today"] >= limits["daily_generation_cap"]:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={
                "code": "DAILY_CAP_REACHED",
                "message": f"You have reached your daily generation limit of {limits['daily_generation_cap']} posts for the {limits['plan_name']}. Limits reset at midnight UTC.",
                "upgrade_url": "/pricing"
            }
        )

    # 3. Credits balance check
    if limits["credits_remaining"] < 1:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail={
                "code": "INSUFFICIENT_CREDITS",
                "message": "You have 0 post credits remaining. Please upgrade or top up with a credit pack.",
                "upgrade_url": "/pricing"
            }
        )


def enforce_can_add_brand(db: Session, user: User) -> None:
    """Server-side check: enforces brand limit per plan."""
    limits = get_user_plan_limits(db, user)
    if limits["brands_used"] >= limits["brands_limit"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "code": "BRAND_LIMIT_REACHED",
                "message": f"Your {limits['plan_name']} allows up to {limits['brands_limit']} brand kit(s). Please upgrade to Growth or Pro to manage multiple brands.",
                "upgrade_url": "/pricing"
            }
        )


def enforce_can_connect_platform(db: Session, user: User, platform: str) -> None:
    """Server-side check: enforces platforms count and X-only-on-Pro restriction."""
    limits = get_user_plan_limits(db, user)
    plat_clean = platform.lower().strip()

    # Rule: X posting only on Pro
    if plat_clean in ("x", "twitter"):
        if not limits["x_allowed"]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "code": "X_REQUIRES_PRO",
                    "message": "Publishing to X (Twitter) is exclusively available on the Pro Plan. Upgrade to connect and publish to X.",
                    "upgrade_url": "/pricing"
                }
            )

    # Rule: Platforms limit check
    if limits["platforms_used"] >= limits["platforms_limit"]:
        # Check if this platform is already connected (reconnect is allowed)
        existing = db.query(SocialAccount).filter(
            SocialAccount.user_id == user.id,
            SocialAccount.platform == plat_clean,
            SocialAccount.is_active == True
        ).first()
        if not existing:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "code": "PLATFORM_LIMIT_REACHED",
                    "message": f"Your {limits['plan_name']} allows up to {limits['platforms_limit']} connected platform(s). Upgrade your plan to connect more channels.",
                    "upgrade_url": "/pricing"
                }
            )


def consume_reroll_allowance(db: Session, user: User, reference_id: str) -> Dict[str, Any]:
    """
    Consumes 1 re-roll:
    - Free if user has remaining re-rolls in their monthly pool.
    - If pool is exhausted: costs 0.5 post credits.
    """
    limits = get_user_plan_limits(db, user)
    pool = limits["rerolls_pool"]
    used = limits["rerolls_used"]

    if used < pool:
        user.rerolls_used_this_month = used + 1
        db.commit()
        return {
            "charged_credits": 0,
            "free_rerolls_remaining": max(0, pool - (used + 1)),
            "reason": "monthly_reroll_pool"
        }
    else:
        # Deduct 0.5 credit
        deduct_post_credit(
            user_id=user.id,
            reference_id=reference_id,
            db=db,
            reason="reroll_beyond_pool",
            amount=0.5
        )
        new_balance = get_user_credit_balance(user.id, db)["balance"]
        return {
            "charged_credits": 0.5,
            "credits_remaining": new_balance,
            "free_rerolls_remaining": 0,
            "reason": "credit_deduction"
        }


def charge_x_publishing_credit(db: Session, user: User, has_link: bool, reference_id: str) -> None:
    """
    Enforces X publishing rules on Pro:
    - X posting allowed on Pro only.
    - If post includes a link, costs +1 extra credit.
    - Meters user's monthly X posts.
    """
    limits = get_user_plan_limits(db, user)
    if not limits["x_allowed"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "code": "X_REQUIRES_PRO",
                "message": "X publishing is restricted to the Pro Plan.",
                "upgrade_url": "/pricing"
            }
        )

    if has_link:
        # Link posts cost +1 extra credit
        deduct_post_credit(
            user_id=user.id,
            reference_id=reference_id,
            db=db,
            reason="x_link_post_surcharge",
            amount=1.0
        )

    user.x_posts_used_this_month = (user.x_posts_used_this_month or 0) + 1
    db.commit()
