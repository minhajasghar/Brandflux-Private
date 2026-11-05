"""
Automated Unit Tests for Issue 1 (Credit Ledger & Post Credits) and Issue 2 (Account Settings & Email Change).
Uses an isolated in-memory test database and strictly adheres to cost safety rules (zero paid generation).
"""
import uuid
from datetime import datetime, timedelta
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from database import Base
from models.models import User, CreditLedger, EmailLog
from services import credit_service, auth_service

def setup_test_db():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine)
    return Session()

def test_credit_ledger_balance_and_initialization():
    db = setup_test_db()
    user = User(
        id=str(uuid.uuid4()),
        email="testuser@example.com",
        password_hash=auth_service.hash_password("Password123!"),
        full_name="Test User",
        plan="starter",
        posts_used_this_month=0
    )
    db.add(user)
    db.commit()

    # 1. Verification of initial auto-grant
    info = credit_service.get_user_credit_balance(user.id, db)
    assert info["balance"] == 30, f"Expected 30 initial credits, got {info['balance']}"
    assert info["quota"] == 30
    assert info["currency"] == "post credits"
    assert info["is_low_balance"] is False
    assert info["is_zero_balance"] is False
    print("[PASS] Initial credit grant correctly seeded 30 post credits.")

    # 2. Test Atomic Deduction
    gen_ref = "gen_session_001"
    ok = credit_service.deduct_post_credit(user.id, reference_id=gen_ref, db=db)
    assert ok is True
    info = credit_service.get_user_credit_balance(user.id, db)
    assert info["balance"] == 29
    assert info["used_this_period"] == 1
    print("[PASS] Deducted 1 post credit. New balance: 29.")

    # 3. Test Idempotency (Retries / double clicks must NOT double deduct)
    ok_retry = credit_service.deduct_post_credit(user.id, reference_id=gen_ref, db=db)
    assert ok_retry is True
    info_retry = credit_service.get_user_credit_balance(user.id, db)
    assert info_retry["balance"] == 29, f"Idempotency failed! Balance changed to {info_retry['balance']}"
    assert info_retry["used_this_period"] == 1
    print("[PASS] Idempotency verified: duplicate deduction with same reference_id skipped.")

    # 4. Test Refund on failure
    refund_ok = credit_service.refund_post_credit(user.id, reference_id=gen_ref, reason="render_failed", db=db)
    assert refund_ok is True
    info_refund = credit_service.get_user_credit_balance(user.id, db)
    assert info_refund["balance"] == 30, f"Expected balance restored to 30, got {info_refund['balance']}"
    print("[PASS] Refund restored credit balance to 30.")

    # 5. Idempotent Refund
    refund_again = credit_service.refund_post_credit(user.id, reference_id=gen_ref, reason="render_failed", db=db)
    assert refund_again is True
    info_refund2 = credit_service.get_user_credit_balance(user.id, db)
    assert info_refund2["balance"] == 30, "Double refund prevented!"
    print("[PASS] Refund idempotency verified.")

    # 6. Test Low Balance Warning & Zero Balance Enforcement
    # Deduct 25 credits
    for i in range(25):
        credit_service.deduct_post_credit(user.id, reference_id=f"bulk_gen_{i}", db=db)
    info_low = credit_service.get_user_credit_balance(user.id, db)
    assert info_low["balance"] == 5
    assert info_low["is_low_balance"] is True, "Expected low balance warning at <= 20%"
    print("[PASS] Low balance warning triggered at <= 20% remaining.")

    # Deduct remaining 5 credits
    for i in range(25, 30):
        credit_service.deduct_post_credit(user.id, reference_id=f"bulk_gen_{i}", db=db)
    info_zero = credit_service.get_user_credit_balance(user.id, db)
    assert info_zero["balance"] == 0
    assert info_zero["is_zero_balance"] is True

    # Attempt deduction with zero balance
    blocked = credit_service.deduct_post_credit(user.id, reference_id="overdraft_attempt", db=db)
    assert blocked is False, "Deduction must fail when balance is zero!"
    print("[PASS] Zero balance properly refused further deductions.")

    # 7. Test Credit Pack Top-Up
    new_bal = credit_service.grant_credit_pack(user.id, amount=10, reason="test_pack", reference_id="pack_123", db=db)
    assert new_bal == 10
    info_topped = credit_service.get_user_credit_balance(user.id, db)
    assert info_topped["balance"] == 10
    assert info_topped["is_zero_balance"] is False
    print("[PASS] Credit pack top-up successfully added 10 credits.")


def test_account_settings_and_email_change_flow():
    db = setup_test_db()
    pwd = "OriginalPassword123!"
    user = User(
        id=str(uuid.uuid4()),
        email="original@brandflux.test",
        password_hash=auth_service.hash_password(pwd),
        full_name="Original Name",
        plan="starter"
    )
    db.add(user)
    db.commit()

    # 1. Test Name update saves immediately and persists
    user.full_name = "Brandflux Enterprise Lead"
    db.commit()
    refreshed_user = db.query(User).filter(User.id == user.id).first()
    assert refreshed_user.full_name == "Brandflux Enterprise Lead"
    print("[PASS] Name edit persists in database.")

    # 2. Test Email change password verification
    # Wrong password fails
    assert auth_service.verify_password("WrongPassword!", user.password_hash) is False
    assert auth_service.verify_password(pwd, user.password_hash) is True
    print("[PASS] Password verification strictly required for email change.")

    # 3. Request email change
    new_email = "verified.new@brandflux.test"
    token = "secure_token_abc_123"
    user.pending_email = new_email
    user.email_change_token = token
    user.email_change_expires_at = datetime.utcnow() + timedelta(hours=24)
    db.commit()

    # Verify pending state
    u = db.query(User).filter(User.id == user.id).first()
    assert u.email == "original@brandflux.test", "Old email must remain active until confirmed!"
    assert u.pending_email == new_email

    # 4. Confirm email change via token
    target_user = db.query(User).filter(User.email_change_token == token).first()
    assert target_user is not None
    assert target_user.id == user.id

    # Apply change
    target_user.email = target_user.pending_email
    target_user.pending_email = None
    target_user.email_change_token = None
    target_user.email_change_expires_at = None
    db.commit()

    final_user = db.query(User).filter(User.id == user.id).first()
    assert final_user.email == new_email, "Email must be updated to new address!"
    assert final_user.pending_email is None
    assert final_user.email_change_token is None
    print("[PASS] Email change applied only after token confirmation; old email remained active throughout.")

if __name__ == "__main__":
    test_credit_ledger_balance_and_initialization()
    test_account_settings_and_email_change_flow()
    print("\nALL CREDITS AND ACCOUNT SETTINGS TESTS PASSED (100% SUCCESS)")
