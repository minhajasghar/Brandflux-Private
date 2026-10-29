import os
import uuid
import logging
from datetime import datetime, timedelta
from typing import List, Optional
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel

from database import get_db
from models.models import Brand, User, SocialAccount
from middleware.auth import get_current_user
from services.encryption import encrypt_token, decrypt_token
from config import (
    META_APP_ID,
    META_APP_SECRET,
    META_REDIRECT_URI,
    LINKEDIN_CLIENT_ID,
    LINKEDIN_CLIENT_SECRET,
    LINKEDIN_REDIRECT_URI,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/oauth", tags=["oauth"])

FRONTEND_SETTINGS_URL = os.getenv("FRONTEND_URL", "http://localhost:3000") + "/settings?tab=connected"


class SocialAccountResponse(BaseModel):
    id: str
    platform: str
    account_id: str
    account_name: str
    is_active: bool
    token_expires_at: Optional[datetime] = None
    days_until_expiry: Optional[int] = None
    needs_reconnect: bool = False
    metadata_json: Optional[dict] = None

    class Config:
        from_attributes = True


# ═══════════════════════════════════════════════════════════
# 1. AUTHORIZATION URL ENDPOINTS
# ═══════════════════════════════════════════════════════════
@router.get("/{platform}/authorize")
def get_authorization_url(
    platform: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Generate OAuth authorization dialog URL for Meta (Instagram/Facebook) or LinkedIn.
    """
    plat = platform.lower()
    # Embed user ID in state for verification
    state = f"{user.id}:{plat}:{uuid.uuid4().hex[:8]}"

    if plat in ("meta", "instagram", "facebook"):
        if not META_APP_ID:
            raise HTTPException(status_code=400, detail="META_APP_ID is not configured in backend environment")
        
        scopes = [
            "pages_show_list",
            "pages_read_engagement",
            "pages_manage_posts",
            "instagram_basic",
            "instagram_content_publish"
        ]
        params = {
            "client_id": META_APP_ID,
            "redirect_uri": META_REDIRECT_URI,
            "scope": ",".join(scopes),
            "response_type": "code",
            "state": state
        }
        auth_url = f"https://www.facebook.com/v19.0/dialog/oauth?{urlencode(params)}"
        return {"authorization_url": auth_url, "state": state}

    elif plat == "linkedin":
        if not LINKEDIN_CLIENT_ID:
            raise HTTPException(status_code=400, detail="LINKEDIN_CLIENT_ID is not configured in backend environment")
        
        params = {
            "response_type": "code",
            "client_id": LINKEDIN_CLIENT_ID,
            "redirect_uri": LINKEDIN_REDIRECT_URI,
            "state": state,
            "scope": "openid profile email w_member_social"
        }
        auth_url = f"https://www.linkedin.com/oauth/v2/authorization?{urlencode(params)}"
        return {"authorization_url": auth_url, "state": state}

    else:
        raise HTTPException(status_code=400, detail=f"Unsupported platform: {platform}")


# ═══════════════════════════════════════════════════════════
# 2. OAUTH CALLBACKS (TOKEN EXCHANGE & ENCRYPTION)
# ═══════════════════════════════════════════════════════════
@router.get("/meta/callback")
async def meta_oauth_callback(
    code: str = Query(..., description="Meta authorization code"),
    state: Optional[str] = Query(None),
    db: Session = Depends(get_db)
):
    """
    Exchange Meta authorization code for 60-day long-lived access token.
    Discovers linked Instagram Business accounts and Facebook Pages, encrypts tokens, and stores them.
    """
    user_id = state.split(":")[0] if state and ":" in state else None
    if not user_id:
        return RedirectResponse(f"{FRONTEND_SETTINGS_URL}&error=invalid_state")

    brand = db.query(Brand).filter(Brand.user_id == user_id).first()
    if not brand:
        return RedirectResponse(f"{FRONTEND_SETTINGS_URL}&error=brand_not_found")

    async with httpx.AsyncClient(timeout=30.0) as client:
        # Step 1: Exchange code for short-lived token
        token_url = "https://graph.facebook.com/v19.0/oauth/access_token"
        token_res = await client.get(
            token_url,
            params={
                "client_id": META_APP_ID,
                "client_secret": META_APP_SECRET,
                "redirect_uri": META_REDIRECT_URI,
                "code": code
            }
        )
        token_data = token_res.json()
        short_token = token_data.get("access_token")
        if not short_token:
            logger.error(f"Meta token exchange error: {token_data}")
            return RedirectResponse(f"{FRONTEND_SETTINGS_URL}&error=token_exchange_failed")

        # Step 2: Exchange for long-lived (60-day) user access token
        ll_res = await client.get(
            token_url,
            params={
                "grant_type": "fb_exchange_token",
                "client_id": META_APP_ID,
                "client_secret": META_APP_SECRET,
                "fb_exchange_token": short_token
            }
        )
        ll_data = ll_res.json()
        long_token = ll_data.get("access_token") or short_token
        expires_in = ll_data.get("expires_in", 5184000)  # default 60 days in seconds
        expires_at = datetime.utcnow() + timedelta(seconds=expires_in)

        # Step 3: Fetch managed Facebook pages & linked Instagram business accounts
        pages_url = "https://graph.facebook.com/v19.0/me/accounts"
        pages_res = await client.get(
            pages_url,
            params={
                "access_token": long_token,
                "fields": "id,name,access_token,instagram_business_account{id,username,profile_picture_url}"
            }
        )
        pages_data = pages_res.json().get("data", [])

        # Store connected accounts
        for page in pages_data:
            page_id = page.get("id")
            page_name = page.get("name", "Facebook Page")
            page_token = page.get("access_token") or long_token

            # Upsert Facebook Page Account
            existing_fb = db.query(SocialAccount).filter(
                SocialAccount.brand_id == brand.id,
                SocialAccount.platform == "facebook",
                SocialAccount.account_id == page_id
            ).first()

            if not existing_fb:
                existing_fb = SocialAccount(
                    brand_id=brand.id,
                    user_id=user_id,
                    platform="facebook",
                    account_id=page_id,
                    account_name=page_name
                )
                db.add(existing_fb)

            existing_fb.access_token_encrypted = encrypt_token(page_token)
            existing_fb.token_expires_at = expires_at
            existing_fb.is_active = True
            existing_fb.metadata_json = {"type": "facebook_page", "page_name": page_name}

            # Check linked Instagram Business Account
            ig_data = page.get("instagram_business_account")
            if ig_data:
                ig_id = ig_data.get("id")
                ig_username = ig_data.get("username", f"ig_{ig_id}")

                existing_ig = db.query(SocialAccount).filter(
                    SocialAccount.brand_id == brand.id,
                    SocialAccount.platform == "instagram",
                    SocialAccount.account_id == ig_id
                ).first()

                if not existing_ig:
                    existing_ig = SocialAccount(
                        brand_id=brand.id,
                        user_id=user_id,
                        platform="instagram",
                        account_id=ig_id,
                        account_name=f"@{ig_username}"
                    )
                    db.add(existing_ig)

                existing_ig.access_token_encrypted = encrypt_token(page_token)
                existing_ig.token_expires_at = expires_at
                existing_ig.is_active = True
                existing_ig.metadata_json = {
                    "username": ig_username,
                    "profile_picture_url": ig_data.get("profile_picture_url")
                }

        db.commit()

    return RedirectResponse(f"{FRONTEND_SETTINGS_URL}&connected=meta&status=success")


@router.get("/linkedin/callback")
async def linkedin_oauth_callback(
    code: str = Query(..., description="LinkedIn authorization code"),
    state: Optional[str] = Query(None),
    db: Session = Depends(get_db)
):
    """
    Exchange LinkedIn authorization code for member access token.
    Retrieves member profile URN and persists encrypted credentials.
    """
    user_id = state.split(":")[0] if state and ":" in state else None
    if not user_id:
        return RedirectResponse(f"{FRONTEND_SETTINGS_URL}&error=invalid_state")

    brand = db.query(Brand).filter(Brand.user_id == user_id).first()
    if not brand:
        return RedirectResponse(f"{FRONTEND_SETTINGS_URL}&error=brand_not_found")

    async with httpx.AsyncClient(timeout=30.0) as client:
        # Step 1: Exchange code for access token
        token_url = "https://www.linkedin.com/oauth/v2/accessToken"
        data = {
            "grant_type": "authorization_code",
            "code": code,
            "client_id": LINKEDIN_CLIENT_ID,
            "client_secret": LINKEDIN_CLIENT_SECRET,
            "redirect_uri": LINKEDIN_REDIRECT_URI
        }
        res = await client.post(token_url, data=data)
        token_info = res.json()
        access_token = token_info.get("access_token")
        if not access_token:
            logger.error(f"LinkedIn token error: {token_info}")
            return RedirectResponse(f"{FRONTEND_SETTINGS_URL}&error=linkedin_auth_failed")

        expires_in = token_info.get("expires_in", 5184000)
        expires_at = datetime.utcnow() + timedelta(seconds=expires_in)
        refresh_token = token_info.get("refresh_token")

        # Step 2: Fetch user profile identity (OpenID userinfo)
        userinfo_url = "https://api.linkedin.com/v2/userinfo"
        userinfo_res = await client.get(
            userinfo_url,
            headers={"Authorization": f"Bearer {access_token}"}
        )
        userinfo = userinfo_res.json()
        member_sub = userinfo.get("sub") or f"li_{uuid.uuid4().hex[:8]}"
        member_name = userinfo.get("name") or "LinkedIn Member"

        # Upsert SocialAccount
        account = db.query(SocialAccount).filter(
            SocialAccount.brand_id == brand.id,
            SocialAccount.platform == "linkedin",
            SocialAccount.account_id == member_sub
        ).first()

        if not account:
            account = SocialAccount(
                brand_id=brand.id,
                user_id=user_id,
                platform="linkedin",
                account_id=member_sub,
                account_name=member_name
            )
            db.add(account)

        account.access_token_encrypted = encrypt_token(access_token)
        if refresh_token:
            account.refresh_token_encrypted = encrypt_token(refresh_token)
        account.token_expires_at = expires_at
        account.is_active = True
        account.metadata_json = {
            "name": member_name,
            "picture": userinfo.get("picture"),
            "email": userinfo.get("email")
        }

        db.commit()

    return RedirectResponse(f"{FRONTEND_SETTINGS_URL}&connected=linkedin&status=success")


# ═══════════════════════════════════════════════════════════
# 3. ACCOUNT MANAGEMENT & EXPIRY ALERTS
# ═══════════════════════════════════════════════════════════
@router.get("/accounts", response_model=List[SocialAccountResponse])
def get_connected_accounts(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    List connected social accounts with token health and expiry alerts.
    Flags accounts expiring within 7 days.
    """
    brand = db.query(Brand).filter(Brand.user_id == user.id).first()
    if not brand:
        return []

    accounts = db.query(SocialAccount).filter(
        SocialAccount.brand_id == brand.id,
        SocialAccount.is_active == True
    ).all()

    now = datetime.utcnow()
    results = []

    for acc in accounts:
        days_left = None
        needs_reconnect = False
        if acc.token_expires_at:
            delta = acc.token_expires_at - now
            days_left = delta.days
            if days_left <= 7:
                needs_reconnect = True

        results.append(
            SocialAccountResponse(
                id=acc.id,
                platform=acc.platform,
                account_id=acc.account_id,
                account_name=acc.account_name,
                is_active=acc.is_active,
                token_expires_at=acc.token_expires_at,
                days_until_expiry=days_left,
                needs_reconnect=needs_reconnect,
                metadata_json=acc.metadata_json
            )
        )

    return results


@router.delete("/accounts/{account_id}")
def disconnect_social_account(
    account_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Disconnect and revoke a social media account."""
    brand = db.query(Brand).filter(Brand.user_id == user.id).first()
    if not brand:
        raise HTTPException(status_code=404, detail="Brand not found")

    account = db.query(SocialAccount).filter(
        SocialAccount.id == account_id,
        SocialAccount.brand_id == brand.id
    ).first()

    if not account:
        raise HTTPException(status_code=404, detail="Social account not found")

    account.is_active = False
    db.commit()
    return {"status": "success", "message": f"{account.platform} account disconnected"}

