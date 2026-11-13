"""
Authoritative Credit Ledger Service for Brandflux.
Currency: "post credits" (1 credit = one new post with 2 image variants and all platform captions).
Atomic, idempotent credit deduction and refunding.
"""
import uuid
import logging
from datetime import datetime
from typing import Dict, Any, Optional, List
from sqlalchemy.orm import Session
from sqlalchemy import func
from models.models import User, CreditLedger

from models.models import User, CreditLedger, Plan

logger = logging.getLogger("credit_service")

def get_plan_quota(plan_name: str, db: Session) -> int:
    clean = (plan_name or "trial").lower().strip()
    if clean == "free":
        clean = "trial"
    p = db.query(Plan).filter(Plan.id == clean).first()
    if p:
        return p.credits
    defaults = {"trial": 15, "starter": 30, "growth": 100, "pro": 200}
    return defaults.get(clean, 30)

def get_current_period_start() -> datetime:
    """Returns the start of the current calendar month in UTC."""
    now = datetime.utcnow()
    return datetime(now.year, now.month, 1)

def ensure_user_ledger_initialized(user: User, db: Session):
    """Ensures user has at least an initial grant in the ledger."""
    count = db.query(CreditLedger).filter(CreditLedger.user_id == user.id).count()
    if count == 0:
        quota = get_plan_quota(user.plan, db)
        entry = CreditLedger(
            id=str(uuid.uuid4()),
            user_id=user.id,
            delta=quota,
            reason="monthly_grant",
            reference_id="auto_init",
            created_at=datetime.utcnow()
        )
        db.add(entry)
        db.commit()


def sync_ledger_for_plan_upgrade(user: User, new_plan_id: str, reference_id: str, db: Session):
    """Ensures user receives full credit quota upon plan approval or upgrade."""
    ensure_user_ledger_initialized(user, db)
    target_quota = get_plan_quota(new_plan_id, db)
    current_balance = db.query(func.coalesce(func.sum(CreditLedger.delta), 0)).filter(
        CreditLedger.user_id == user.id
    ).scalar() or 0
    if current_balance < target_quota:
        diff = target_quota - current_balance
        entry = CreditLedger(
            id=str(uuid.uuid4()),
            user_id=user.id,
            delta=diff,
            reason="plan_activation",
            reference_id=reference_id,
            created_at=datetime.utcnow()
        )
        db.add(entry)
        db.commit()

def get_user_credit_balance(user_id: str, db: Session) -> Dict[str, Any]:
    """
    Computes post credits balance from credit_ledger.
    Balance = sum of all delta entries in current period (plus lifetime bonus grants).
    """
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        return {
            "balance": 0,
            "quota": 30,
            "used_this_period": 0,
            "percentage_remaining": 0.0,
            "is_low_balance": False,
            "is_zero_balance": True,
            "currency": "post credits",
            "history": []
        }

    # Non-payment VIP users have unlimited credits
    if getattr(user, "is_non_payment", False):
        return {
            "balance": 999999,
            "quota": 999999,
            "used_this_period": 0,
            "percentage_remaining": 100.0,
            "is_low_balance": False,
            "is_zero_balance": False,
            "is_non_payment": True,
            "currency": "post credits",
            "plan": "Non-Payment (VIP)",
            "history": []
        }

    # Approvers have no credits, billing or generation quota
    from models.models import BrandMember
    membership = None
    if user.active_brand_id:
        membership = db.query(BrandMember).filter(
            BrandMember.brand_id == user.active_brand_id,
            BrandMember.user_id == user.id,
            BrandMember.status == "active"
        ).first()
    if not membership:
        membership = db.query(BrandMember).filter(
            BrandMember.user_id == user.id,
            BrandMember.status == "active",
            BrandMember.role == "approver"
        ).first()
    if membership and membership.role == "approver":
            return {
                "balance": 0,
                "quota": 0,
                "used_this_period": 0,
                "percentage_remaining": 0.0,
                "is_low_balance": False,
                "is_zero_balance": True,
                "is_approver": True,
                "currency": "post credits",
                "history": []
            }

    ensure_user_ledger_initialized(user, db)

    # Sum all ledger deltas for user
    total_balance = db.query(func.coalesce(func.sum(CreditLedger.delta), 0)).filter(
        CreditLedger.user_id == user_id
    ).scalar() or 0

    quota = get_plan_quota(user.plan, db)

    period_start = get_current_period_start()

    # Deductions in current period
    used_this_period = db.query(func.coalesce(func.sum(CreditLedger.delta), 0)).filter(
        CreditLedger.user_id == user_id,
        CreditLedger.delta < 0,
        CreditLedger.created_at >= period_start
    ).scalar() or 0
    used_this_period = abs(used_this_period)

    percentage_remaining = round((total_balance / quota * 100) if quota > 0 else 0.0, 1)
    is_low_balance = (percentage_remaining <= 20.0 and total_balance > 0) or (total_balance == 1 and quota > 1)
    is_zero_balance = total_balance <= 0

    # Fetch recent ledger history (latest 20 entries)
    history_entries = db.query(CreditLedger).filter(
        CreditLedger.user_id == user_id
    ).order_by(CreditLedger.created_at.desc()).limit(20).all()

    history: List[Dict[str, Any]] = [
        {
            "id": entry.id,
            "delta": entry.delta,
            "reason": entry.reason,
            "reference_id": entry.reference_id,
            "created_at": entry.created_at.isoformat() if entry.created_at else None
        }
        for entry in history_entries
    ]

    computed_balance = float(total_balance)
    return {
        "balance": int(computed_balance) if computed_balance.is_integer() else round(computed_balance, 2),
        "quota": int(quota),
        "used_this_period": round(float(used_this_period), 2) if isinstance(used_this_period, float) and not float(used_this_period).is_integer() else int(used_this_period),
        "percentage_remaining": percentage_remaining,
        "is_low_balance": is_low_balance,
        "is_zero_balance": is_zero_balance,
        "currency": "post credits",
        "plan": (user.plan or "starter").capitalize(),
        "history": history
    }

def deduct_post_credit(user_id: str, reference_id: str, db: Session, reason: str = "post_generation", amount: float = 1.0) -> bool:
    """
    Atomic & Idempotent deduction of post credits (default 1.0, or 0.5 for re-rolls).
    - If reference_id has already been deducted, returns True immediately (idempotency).
    - If user has balance <= 0, returns False.
    - Otherwise inserts negative delta entry and updates user.posts_used_this_month.
    """
    user_obj = db.query(User).filter(User.id == user_id).first()
    if user_obj and (getattr(user_obj, "is_non_payment", False) or getattr(user_obj, "role", "user") in ("admin", "support_admin")):
        return True

    if reference_id:
        existing = db.query(CreditLedger).filter(
            CreditLedger.user_id == user_id,
            CreditLedger.reference_id == reference_id,
            CreditLedger.reason == reason
        ).first()
        if existing:
            logger.info(f"Credit already deducted for ref {reference_id}, skipping double deduction.")
            return True

    balance_info = get_user_credit_balance(user_id, db)
    if balance_info["balance"] < amount:
        logger.warning(f"User {user_id} has insufficient credits ({balance_info['balance']} < {amount})")
        return False

    entry = CreditLedger(
        id=str(uuid.uuid4()),
        user_id=user_id,
        delta=-float(amount),
        reason=reason,
        reference_id=reference_id,
        created_at=datetime.utcnow()
    )
    db.add(entry)

    # Sync user.posts_used_this_month
    user = db.query(User).filter(User.id == user_id).first()
    if user:
        user.posts_used_this_month = (user.posts_used_this_month or 0) + 1

    db.commit()
    logger.info(f"Deducted 1 post credit for user {user_id}, reference_id {reference_id}. New balance: {balance_info['balance'] - 1}")
    return True

def refund_post_credit(user_id: str, reference_id: str, reason: str, db: Session) -> bool:
    """
    Atomic & Idempotent refund of 1 post credit.
    - If a refund for this reference_id already exists, does nothing and returns True.
    - If no deduction existed, returns False.
    - Otherwise inserts positive delta entry and decrements user.posts_used_this_month.
    """
    refund_reason = f"generation_refund:{reason}"
    existing_refund = db.query(CreditLedger).filter(
        CreditLedger.user_id == user_id,
        CreditLedger.reference_id == reference_id,
        CreditLedger.reason == refund_reason
    ).first()
    if existing_refund:
        logger.info(f"Refund already applied for ref {reference_id}, skipping.")
        return True

    deduction = db.query(CreditLedger).filter(
        CreditLedger.user_id == user_id,
        CreditLedger.reference_id == reference_id,
        CreditLedger.delta < 0
    ).first()
    if not deduction:
        logger.warning(f"No deduction found to refund for ref {reference_id}")
        return False

    refund_entry = CreditLedger(
        id=str(uuid.uuid4()),
        user_id=user_id,
        delta=1,
        reason=refund_reason,
        reference_id=reference_id,
        created_at=datetime.utcnow()
    )
    db.add(refund_entry)

    user = db.query(User).filter(User.id == user_id).first()
    if user and user.posts_used_this_month:
        user.posts_used_this_month = max(0, user.posts_used_this_month - 1)

    db.commit()
    logger.info(f"Refunded 1 post credit for user {user_id}, reference_id {reference_id}")
    return True

def grant_credit_pack(user_id: str, amount: int, reason: str, reference_id: Optional[str], db: Session) -> int:
    """Adds bonus or purchased post credits to user's ledger."""
    entry = CreditLedger(
        id=str(uuid.uuid4()),
        user_id=user_id,
        delta=amount,
        reason=reason,
        reference_id=reference_id or f"pack_{uuid.uuid4().hex[:8]}",
        created_at=datetime.utcnow()
    )
    db.add(entry)
    db.commit()
    balance_info = get_user_credit_balance(user_id, db)
    return balance_info["balance"]

