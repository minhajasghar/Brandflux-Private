"""
Billing and Post Credits API Router for Brandflux.
Manages subscription plans, real-time quota status, manual upgrades, and credit packs.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from sqlalchemy.orm import Session
from datetime import datetime

from database import get_db
from models.models import User, Plan, Notification, AuditLog
from routers.auth import get_current_user
from services import credit_service
from services.plan_service import get_user_plan_limits, get_plan

router = APIRouter(prefix="/billing", tags=["billing"])


class CreditPackRequest(BaseModel):
    amount: int = 20
    pack_name: Optional[str] = "Standard Pack (20 credits)"


class UpgradeRequest(BaseModel):
    plan_id: str
    billing_cycle: Optional[str] = "monthly"  # "monthly" or "annual"
    note: Optional[str] = None


@router.get("/credits")
def get_user_credits(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Returns authoritative post credits balance and ledger status."""
    return credit_service.get_user_credit_balance(user.id, db)


@router.get("/status")
def get_billing_status(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Returns real-time user plan status, trial countdown, re-roll balance, and limits."""
    return get_user_plan_limits(db, user)


@router.get("/plans")
def list_available_plans(db: Session = Depends(get_db)):
    """Returns all active plans ordered by price."""
    plans = db.query(Plan).filter(Plan.is_active == True).order_by(Plan.price_usd.asc()).all()
    return [
        {
            "id": p.id,
            "name": p.name,
            "price_usd": p.price_usd,
            "price_annual_usd": p.price_annual_usd,
            "price_local": p.price_local,
            "credits": p.credits,
            "brands": p.brands,
            "platforms": p.platforms,
            "max_posts_per_day": p.max_posts_per_day,
            "daily_generation_cap": p.daily_generation_cap,
            "reroll_pool": p.reroll_pool,
            "x_allowed": p.x_allowed,
            "x_monthly_allowance": p.x_monthly_allowance,
            "features": p.features or []
        }
        for p in plans
    ]


@router.post("/request-upgrade")
def request_plan_upgrade(
    req: UpgradeRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Submits a manual upgrade request.
    Notifies admin and logs for manual activation flow.
    """
    target_plan = get_plan(db, req.plan_id)
    if not target_plan:
        raise HTTPException(status_code=404, detail="Requested plan does not exist.")

    user.upgrade_requested_plan = target_plan.id
    user.upgrade_requested_at = datetime.utcnow()

    # Log to audit log
    audit_entry = AuditLog(
        action="upgrade_request_submitted",
        target_type="user",
        target_id=user.id,
        admin_email=user.email,
        details={
            "requested_plan": target_plan.id,
            "billing_cycle": req.billing_cycle,
            "note": req.note,
            "current_plan": user.plan
        }
    )
    db.add(audit_entry)

    # In-app notification for the user
    notif = Notification(
        user_id=user.id,
        title="Upgrade Request Received",
        message=f"We received your request to upgrade to the {target_plan.name} ({req.billing_cycle}). Our team will activate your account shortly.",
        type="info",
        action_type="link",
        action_payload={"url": "/settings?tab=billing"}
    )
    db.add(notif)
    db.commit()

    return {
        "success": True,
        "message": f"Upgrade request for {target_plan.name} ({req.billing_cycle}) submitted successfully. Our team will activate it shortly.",
        "plan_id": target_plan.id
    }


@router.post("/credit-pack")
def purchase_credit_pack(
    req: CreditPackRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Top-up post credits pack ($14 for 20 credits, $0.70/credit).
    STRICT RULE: Available on paid plans only. Free trial users must upgrade first.
    """
    plan_clean = (user.plan or "trial").lower().strip()
    if plan_clean in ("free", "trial"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "code": "PAID_PLAN_REQUIRED",
                "message": "Credit packs are available exclusively on paid plans (Starter, Growth, Pro). Please upgrade your plan to purchase extra credits.",
                "upgrade_url": "/pricing"
            }
        )

    # Standard pack: 20 credits for $14
    pack_credits = req.amount if req.amount in (20, 40, 60) else 20

    new_balance = credit_service.grant_credit_pack(
        user_id=user.id,
        amount=pack_credits,
        reason="credit_pack_purchase",
        reference_id=f"pack_{pack_credits}cr",
        db=db
    )

    audit_entry = AuditLog(
        action="credit_pack_purchased",
        target_type="user",
        target_id=user.id,
        admin_email=user.email,
        details={"credits_added": pack_credits, "price_usd": 14 if pack_credits == 20 else (pack_credits // 20) * 14}
    )
    db.add(audit_entry)
    db.commit()

    return {
        "success": True,
        "message": f"Successfully added {pack_credits} post credits to your account!",
        "new_balance": new_balance,
        "credits_added": pack_credits
    }
