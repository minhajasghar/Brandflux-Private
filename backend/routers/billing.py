"""
Billing and Post Credits API Router for Brandflux.
Manages subscription plans, real-time quota status, manual upgrades, and credit packs.
"""
from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks, Response
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from sqlalchemy.orm import Session
from datetime import datetime

from database import get_db
from models.models import User, Plan, Notification, AuditLog, PaymentRequest, SystemSetting
from routers.auth import get_current_user
from services import credit_service
from services.plan_service import get_user_plan_limits, get_plan
from services.email.email_service import send_email
from services.email.smtp_provider import get_active_smtp_config
from services.pdf_receipt_service import generate_payment_receipt_pdf

router = APIRouter(prefix="/billing", tags=["billing"])

DEFAULT_BANK_DETAILS = {
    "bank_name": "Meezan Bank Limited",
    "account_title": "TNT INNOVATIONS",
    "account_number": "0102030405060708",
    "iban": "PK36MEZN0001020304050607",
    "swift_code": "MEZNPKKA",
    "branch_code": "0102",
    "instructions": "1. Transfer the subscription amount to the bank account above.\n2. Note your Transaction Reference / ID.\n3. Take a screenshot or photo of your transfer receipt.\n4. Upload receipt and submit below. Your account will be activated by our team promptly.",
    "support_email": "info@tntinnov.com",
    "support_phone": "+92 300 1234567"
}

def get_system_bank_details(db: Session) -> dict:
    setting = db.query(SystemSetting).filter(SystemSetting.key == "bank_details").first()
    if setting and isinstance(setting.value, dict):
        merged = dict(DEFAULT_BANK_DETAILS)
        merged.update(setting.value)
        return merged
    return DEFAULT_BANK_DETAILS


class PaymentSubmissionRequest(BaseModel):
    plan_id: str
    billing_cycle: Optional[str] = "monthly"
    bank_name: Optional[str] = None
    sender_account_name: str
    sender_account_number: Optional[str] = None
    transaction_reference: str
    proof_image_url: Optional[str] = None
    notes: Optional[str] = None


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
    from services.brand_service import resolve_user_brand, get_user_brand_role
    active_b = resolve_user_brand(user, db)
    if active_b and get_user_brand_role(user, active_b.id, db) == "approver":
        raise HTTPException(status_code=403, detail="Approvers do not have access to billing or plan upgrades.")

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
        "message": "Payments are coming soon, we'll activate your plan.",
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
    from services.brand_service import resolve_user_brand, get_user_brand_role
    active_b = resolve_user_brand(user, db)
    if active_b and get_user_brand_role(user, active_b.id, db) == "approver":
        raise HTTPException(status_code=403, detail="Approvers do not have access to billing or credit top-ups.")

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

    # No instant credit grant client-side without payment gateway! Log request and alert admin
    audit_entry = AuditLog(
        action="credit_pack_requested",
        target_type="user",
        target_id=user.id,
        admin_email=user.email,
        details={"requested_credits": pack_credits, "price_usd": 14 if pack_credits == 20 else (pack_credits // 20) * 14}
    )
    db.add(audit_entry)

    # In-app notification for the user
    notif = Notification(
        user_id=user.id,
        title="Credit Pack Request Received",
        message=f"We received your request for {pack_credits} credits. Payments are coming soon, we'll activate your plan.",
        type="info",
        action_type="link",
        action_payload={"url": "/settings?tab=billing"}
    )
    db.add(notif)
    db.commit()

    return {
        "success": True,
        "message": "Payments are coming soon, we'll activate your plan.",
        "requested_credits": pack_credits
    }


# ═══════════════════════════════════════════════════════════
# MANUAL BANK TRANSFER & PAYMENT PROOF SUBMISSIONS
# ═══════════════════════════════════════════════════════════
@router.get("/bank-details")
def get_bank_details(db: Session = Depends(get_db)):
    """Public/Authenticated endpoint to fetch beneficiary bank details for payments."""
    return get_system_bank_details(db)


@router.post("/payment-request")
async def submit_payment_request(
    req: PaymentSubmissionRequest,
    background_tasks: BackgroundTasks,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Submit manual bank transfer proof for account activation.
    Stores submission, dispatches notification emails to User and Admin.
    """
    clean_plan_id = req.plan_id.lower().strip()
    plan = db.query(Plan).filter(Plan.id == clean_plan_id).first()
    if not plan:
        raise HTTPException(status_code=400, detail=f"Invalid plan selected: {req.plan_id}")

    # Determine amount based on billing cycle
    is_annual = (req.billing_cycle or "monthly").lower().strip() == "annual"
    amount = float(plan.price_annual_usd if is_annual else plan.price_usd)
    currency = "USD"

    # Create Payment Request record
    payment = PaymentRequest(
        user_id=user.id,
        user_email=user.email,
        user_name=user.full_name or "Subscriber",
        plan_id=clean_plan_id,
        amount=amount,
        currency=currency,
        billing_cycle="annual" if is_annual else "monthly",
        bank_name=req.bank_name or "Bank Transfer",
        sender_account_name=req.sender_account_name.strip(),
        sender_account_number=(req.sender_account_number or "").strip(),
        transaction_reference=req.transaction_reference.strip(),
        proof_image_url=req.proof_image_url,
        notes=req.notes,
        status="pending"
    )
    db.add(payment)
    db.commit()
    db.refresh(payment)

    # 1. Send confirmation email to User
    background_tasks.add_task(
        send_email,
        to=user.email,
        template="payment_submitted_user",
        data={
            "full_name": user.full_name or "there",
            "plan_name": plan.name,
            "amount": f"{amount:.2f}",
            "currency": currency,
            "transaction_reference": payment.transaction_reference
        },
        user_id=user.id,
        idempotency_key=f"pay_sub_user_{payment.id}"
    )

    # 2. Send alert email to Admin
    smtp_cfg = get_active_smtp_config()
    admin_email = smtp_cfg.get("admin_notification_email") or "info@tntinnov.com"
    background_tasks.add_task(
        send_email,
        to=admin_email,
        template="payment_submitted_admin",
        data={
            "user_email": user.email,
            "user_name": user.full_name or "Subscriber",
            "plan_name": plan.name,
            "amount": f"{amount:.2f}",
            "currency": currency,
            "transaction_reference": payment.transaction_reference
        },
        idempotency_key=f"pay_sub_admin_{payment.id}"
    )

    # In-app notification for the user
    notif = Notification(
        user_id=user.id,
        title="Payment Proof Submitted ⏳",
        message=f"We have received your payment proof for {plan.name}. Our administrators will review and activate your account.",
        type="info",
        action_type="link",
        action_payload={"url": "/payment"}
    )
    db.add(notif)
    db.commit()

    return {
        "success": True,
        "payment_id": payment.id,
        "status": payment.status,
        "message": "Payment proof submitted successfully! Our billing team is reviewing it."
    }


@router.get("/my-payment-request")
def get_my_latest_payment_request(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Retrieve current user's latest payment request status."""
    payment = db.query(PaymentRequest).filter(
        PaymentRequest.user_id == user.id
    ).order_by(PaymentRequest.created_at.desc()).first()

    if not payment:
        return {"has_payment": False, "payment": None}

    return {
        "has_payment": True,
        "payment": {
            "id": payment.id,
            "plan_id": payment.plan_id,
            "amount": payment.amount,
            "currency": payment.currency,
            "billing_cycle": payment.billing_cycle,
            "bank_name": payment.bank_name,
            "sender_account_name": payment.sender_account_name,
            "sender_account_number": payment.sender_account_number,
            "transaction_reference": payment.transaction_reference,
            "proof_image_url": payment.proof_image_url,
            "notes": payment.notes,
            "status": payment.status,
            "admin_notes": payment.admin_notes,
            "created_at": payment.created_at.isoformat() if payment.created_at else None,
            "reviewed_at": payment.reviewed_at.isoformat() if payment.reviewed_at else None
        }
    }


@router.get("/payment-requests/{payment_id}/receipt-pdf")
def download_payment_receipt_pdf(
    payment_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Generate and download official PDF receipt for a payment request."""
    payment = db.query(PaymentRequest).filter(PaymentRequest.id == payment_id).first()
    if not payment:
        raise HTTPException(status_code=404, detail="Payment record not found")

    # Access control: user must own payment or be admin
    if payment.user_id != user.id and user.role not in ("admin", "support_admin"):
        raise HTTPException(status_code=403, detail="Unauthorized to download this receipt")

    bank_details = get_system_bank_details(db)
    pdf_bytes = generate_payment_receipt_pdf(payment, bank_details)

    filename = f"Brandflux_Receipt_{payment_id[:8].upper()}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"'
        }
    )

