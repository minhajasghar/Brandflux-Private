import os
import uuid
import logging
import hashlib
import base64
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

def get_meta_credentials():
    from dotenv import load_dotenv
    env_file = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env")
    if os.path.exists(env_file):
        load_dotenv(env_file, override=True)
    app_id = os.getenv("META_APP_ID", "").strip()
    app_secret = os.getenv("META_APP_SECRET", "").strip()
    redirect_uri = os.getenv("META_REDIRECT_URI", "http://localhost:8000/oauth/meta/callback").strip()
    return app_id, app_secret, redirect_uri

def get_linkedin_credentials():
    from dotenv import load_dotenv
    env_file = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env")
    if os.path.exists(env_file):
        load_dotenv(env_file, override=True)
    client_id = os.getenv("LINKEDIN_CLIENT_ID", "").strip()
    client_secret = os.getenv("LINKEDIN_CLIENT_SECRET", "").strip()
    redirect_uri = os.getenv("LINKEDIN_REDIRECT_URI", "http://localhost:8000/oauth/linkedin/callback").strip()
    return client_id, client_secret, redirect_uri

def get_tiktok_credentials():
    from dotenv import load_dotenv
    env_file = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env")
    if os.path.exists(env_file):
        load_dotenv(env_file, override=True)
    client_key = os.getenv("TIKTOK_CLIENT_KEY", "").strip()
    client_secret = os.getenv("TIKTOK_CLIENT_SECRET", "").strip()
    redirect_uri = os.getenv("TIKTOK_REDIRECT_URI", "https://brandflux-oauth.loca.lt/oauth/tiktok/callback").strip()
    return client_key, client_secret, redirect_uri

TWITTER_PKCE_VERIFIER = "brandflux_oauth2_pkce_challenge_secret_verifier_secure_key_12345678"
_tw_digest = hashlib.sha256(TWITTER_PKCE_VERIFIER.encode("ascii")).digest()
TWITTER_PKCE_CHALLENGE = base64.urlsafe_b64encode(_tw_digest).decode("ascii").rstrip("=")

def get_twitter_credentials():
    from dotenv import load_dotenv
    env_file = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env")
    if os.path.exists(env_file):
        load_dotenv(env_file, override=True)
    client_id = os.getenv("TWITTER_CLIENT_ID", "").strip()
    client_secret = os.getenv("TWITTER_CLIENT_SECRET", "").strip()
    base_url = (os.getenv("APP_BASE_URL") or os.getenv("BACKEND_BASE_URL") or "").rstrip("/")
    default_redirect = f"{base_url}/oauth/twitter/callback" if base_url else "http://localhost:8000/oauth/twitter/callback"
    redirect_uri = os.getenv("TWITTER_REDIRECT_URI", default_redirect).strip()
    return client_id, client_secret, redirect_uri

FRONTEND_SETTINGS_URL = os.getenv("FRONTEND_URL", os.getenv("APP_BASE_URL", "http://localhost:3000")).rstrip("/") + "/settings?tab=connected"


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
    avatar_url: Optional[str] = None

    class Config:
        from_attributes = True


@router.get("/platforms-status")
def get_platforms_status():
    """
    Returns configured status of each social platform based on environment variables.
    If a platform is not configured, users see 'Coming soon' instead of a broken Connect flow.
    """
    meta_id, meta_secret, _ = get_meta_credentials()
    li_id, li_secret, _ = get_linkedin_credentials()
    tt_key, tt_secret, _ = get_tiktok_credentials()
    tw_id, tw_secret, _ = get_twitter_credentials()

    return {
        "facebook": bool(meta_id and meta_secret),
        "instagram": bool(meta_id and meta_secret),
        "linkedin": bool(li_id and li_secret),
        "tiktok": bool(tt_key and tt_secret),
        "twitter": bool(tw_id and tw_secret),
    }


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
    from services.brand_service import resolve_user_brand, get_user_brand_role
    active_b = resolve_user_brand(user, db)
    if active_b and get_user_brand_role(user, active_b.id, db) == "approver":
        raise HTTPException(status_code=403, detail="Approvers cannot manage social connections.")

    from services.plan_service import enforce_can_connect_platform
    enforce_can_connect_platform(db, user, plat)

    # Embed user ID in state for verification
    state = f"{user.id}:{plat}:{uuid.uuid4().hex[:8]}"

    if plat in ("meta", "instagram", "facebook"):
        meta_id, meta_secret, meta_redirect = get_meta_credentials()
        if not meta_id:
            raise HTTPException(status_code=400, detail="META_APP_ID is not configured in backend/.env")
        if not meta_secret:
            raise HTTPException(status_code=400, detail="META_APP_SECRET is not configured in backend/.env. Please copy your App Secret from the Meta Developer dashboard and add it to backend/.env.")
        
        scopes = [
            "public_profile",
            "pages_show_list",
            "pages_read_engagement",
            "pages_manage_posts",
            "instagram_basic",
            "instagram_content_publish",
            "business_management"
        ]
        params = {
            "client_id": meta_id,
            "redirect_uri": meta_redirect,
            "scope": ",".join(scopes),
            "response_type": "code",
            "state": state,
            "auth_type": "rerequest"
        }
        auth_url = f"https://www.facebook.com/v19.0/dialog/oauth?{urlencode(params)}"
        return {"authorization_url": auth_url, "auth_url": auth_url, "state": state}

    elif plat == "linkedin":
        li_client_id, li_client_secret, li_redirect = get_linkedin_credentials()
        if not li_client_id:
            raise HTTPException(status_code=400, detail="LINKEDIN_CLIENT_ID is not configured in backend/.env. Please create a LinkedIn Developer App and add its credentials to backend/.env.")
        if not li_client_secret:
            raise HTTPException(status_code=400, detail="LINKEDIN_CLIENT_SECRET is not configured in backend/.env.")
        
        # Scopes: configurable via .env (e.g. for Company Page: openid profile email w_organization_social r_organization_social)
        from dotenv import load_dotenv
        env_file = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env")
        if os.path.exists(env_file):
            load_dotenv(env_file, override=True)
        default_scopes = "openid profile email w_organization_social r_organization_social"
        raw_scopes = os.getenv("LINKEDIN_SCOPES", default_scopes).strip()
        # LinkedIn requires space-separated scopes (RFC 6749)
        scopes_str = " ".join([s.strip() for s in raw_scopes.replace(",", " ").split() if s.strip()])

        params = {
            "response_type": "code",
            "client_id": li_client_id,
            "redirect_uri": li_redirect,
            "state": state,
            "scope": scopes_str
        }
        auth_url = f"https://www.linkedin.com/oauth/v2/authorization?{urlencode(params)}"
        return {"authorization_url": auth_url, "auth_url": auth_url, "state": state}

    elif plat == "tiktok":
        client_key, client_secret, redirect_uri = get_tiktok_credentials()
        if not client_key:
            raise HTTPException(status_code=400, detail="TIKTOK_CLIENT_KEY is not configured in backend/.env")
        if not client_secret:
            raise HTTPException(status_code=400, detail="TIKTOK_CLIENT_SECRET is not configured in backend/.env")

        from dotenv import load_dotenv
        env_file = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env")
        if os.path.exists(env_file):
            load_dotenv(env_file, override=True)
        raw_tt_scopes = os.getenv("TIKTOK_SCOPES", "user.info.basic,video.upload").strip()
        scopes = [s.strip() for s in raw_tt_scopes.split(",") if s.strip()]
        params = {
            "client_key": client_key,
            "scope": ",".join(scopes),
            "response_type": "code",
            "redirect_uri": redirect_uri,
            "state": state,
            "disable_auto_auth": 1
        }
        auth_url = f"https://www.tiktok.com/v2/auth/authorize/?{urlencode(params)}"
        return {"authorization_url": auth_url, "auth_url": auth_url, "state": state}

    elif plat in ("twitter", "x"):
        tw_client_id, tw_client_secret, tw_redirect = get_twitter_credentials()
        if not tw_client_id:
            raise HTTPException(status_code=400, detail="TWITTER_CLIENT_ID is not configured in backend/.env. Please create a Twitter/X Developer App and add credentials.")

        scopes = ["tweet.read", "tweet.write", "users.read", "media.write", "offline.access"]
        params = {
            "response_type": "code",
            "client_id": tw_client_id,
            "redirect_uri": tw_redirect,
            "scope": " ".join(scopes),
            "state": state,
            "code_challenge": TWITTER_PKCE_CHALLENGE,
            "code_challenge_method": "S256"
        }
        auth_url = f"https://twitter.com/i/oauth2/authorize?{urlencode(params)}"
        return {"authorization_url": auth_url, "auth_url": auth_url, "state": state}

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

    meta_id, meta_secret, meta_redirect = get_meta_credentials()

    async with httpx.AsyncClient(timeout=30.0) as client:
        # Step 1: Exchange code for short-lived token
        token_url = "https://graph.facebook.com/v19.0/oauth/access_token"
        token_res = await client.get(
            token_url,
            params={
                "client_id": meta_id,
                "client_secret": meta_secret,
                "redirect_uri": meta_redirect,
                "code": code
            }
        )
        token_data = token_res.json()
        short_token = token_data.get("access_token")
        
        debug_log_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "oauth_debug.log")
        with open(debug_log_path, "a", encoding="utf-8") as f:
            f.write(f"\n--- OAUTH CALLBACK {datetime.utcnow().isoformat()} ---\n")
            f.write(f"token_status: {token_res.status_code}\n")
            f.write(f"token_data has token: {bool(short_token)}\n")
            if not short_token:
                f.write(f"token_error: {token_data}\n")

        if not short_token:
            logger.error(f"Meta token exchange error: {token_data}")
            return RedirectResponse(f"{FRONTEND_SETTINGS_URL}&error=token_exchange_failed")

        # Step 2: Exchange for long-lived (60-day) user access token
        ll_res = await client.get(
            token_url,
            params={
                "grant_type": "fb_exchange_token",
                "client_id": meta_id,
                "client_secret": meta_secret,
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
                "fields": "id,name,username,picture{url},access_token,instagram_business_account{id,username,profile_picture_url}"
            }
        )
        pages_json = pages_res.json()
        pages_data = pages_json.get("data", [])

        # Fallback for pages owned by a Meta Business Portfolio: check businesses the user has access to
        if not pages_data:
            biz_res = await client.get(
                "https://graph.facebook.com/v19.0/me/businesses",
                params={"access_token": long_token, "fields": "id,name"}
            )
            biz_list = biz_res.json().get("data", [])
            with open(debug_log_path, "a", encoding="utf-8") as f:
                f.write(f"fallback_businesses: {biz_list}\n")
            for b in biz_list:
                b_id = b.get("id")
                for p_type in ["owned_pages", "client_pages"]:
                    bp_res = await client.get(
                        f"https://graph.facebook.com/v19.0/{b_id}/{p_type}",
                        params={
                            "access_token": long_token,
                            "fields": "id,name,access_token,instagram_business_account{id,username,profile_picture_url}"
                        }
                    )
                    bp_json = bp_res.json()
                    bp_data = bp_json.get("data", [])
                    with open(debug_log_path, "a", encoding="utf-8") as f:
                        f.write(f"business {b_id} {p_type}: {bp_json}\n")
                    pages_data.extend(bp_data)

        # Debug: check user permissions and debug_token info
        perm_res = await client.get(
            "https://graph.facebook.com/v19.0/me/permissions",
            params={"access_token": long_token}
        )
        debug_token_res = await client.get(
            "https://graph.facebook.com/v19.0/debug_token",
            params={"input_token": long_token, "access_token": f"{meta_id}|{meta_secret}"}
        )

        with open(debug_log_path, "a", encoding="utf-8") as f:
            f.write(f"pages_status: {pages_res.status_code}\n")
            f.write(f"pages_json: {pages_json}\n")
            f.write(f"permissions: {perm_res.json()}\n")
            f.write(f"debug_token: {debug_token_res.json()}\n")
            f.write(f"found {len(pages_data)} pages\n")

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
            fb_pic = page.get("picture", {}).get("data", {}).get("url") if isinstance(page.get("picture"), dict) else None
            existing_fb.metadata_json = {
                "type": "facebook_page",
                "page_name": page_name,
                "username": page.get("username"),
                "avatar_url": fb_pic
            }

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
    code: Optional[str] = Query(None, description="LinkedIn authorization code"),
    error: Optional[str] = Query(None),
    error_description: Optional[str] = Query(None),
    state: Optional[str] = Query(None),
    db: Session = Depends(get_db)
):
    """
    Exchange LinkedIn authorization code for member access token.
    Retrieves member profile URN and persists encrypted credentials.
    """
    if error:
        logger.error(f"LinkedIn OAuth error from redirect: error={error}, desc={error_description}")
        clean_msg = error_description or error
        return RedirectResponse(f"{FRONTEND_SETTINGS_URL}&error=linkedin_oauth_{error}&error_desc={clean_msg}")

    if not code:
        return RedirectResponse(f"{FRONTEND_SETTINGS_URL}&error=missing_code")
    user_id = state.split(":")[0] if state and ":" in state else None
    if not user_id:
        return RedirectResponse(f"{FRONTEND_SETTINGS_URL}&error=invalid_state")

    brand = db.query(Brand).filter(Brand.user_id == user_id).first()
    if not brand:
        return RedirectResponse(f"{FRONTEND_SETTINGS_URL}&error=brand_not_found")

    li_client_id, li_client_secret, li_redirect = get_linkedin_credentials()
    async with httpx.AsyncClient(timeout=30.0) as client:
        # Step 1: Exchange code for access token
        token_url = "https://www.linkedin.com/oauth/v2/accessToken"
        data = {
            "grant_type": "authorization_code",
            "code": code,
            "client_id": li_client_id,
            "client_secret": li_client_secret,
            "redirect_uri": li_redirect
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

        # Step 2: Fetch user profile identity (OpenID userinfo, if scope includes openid)
        userinfo = {}
        try:
            userinfo_url = "https://api.linkedin.com/v2/userinfo"
            userinfo_res = await client.get(
                userinfo_url,
                headers={"Authorization": f"Bearer {access_token}"}
            )
            if userinfo_res.status_code == 200:
                userinfo = userinfo_res.json()
        except Exception as ue:
            logger.info(f"OpenID userinfo skipped or not authorized: {ue}")
        member_sub = userinfo.get("sub") or f"li_{uuid.uuid4().hex[:8]}"
        member_name = userinfo.get("name") or "LinkedIn Admin"

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

        # Step 3: Fetch Organization Pages (if user has organization admin access)
        try:
            org_res = await client.get(
                "https://api.linkedin.com/v2/organizationalEntityAcls?q=roleAssignee",
                headers={"Authorization": f"Bearer {access_token}"}
            )
            org_json = org_res.json()
            elements = org_json.get("elements", [])
            for elem in elements:
                target = elem.get("organizationalTarget", "")
                if "organization:" in target:
                    org_id = target.split(":")[-1]
                    org_name = "TNT Innovations"
                    try:
                        detail_res = await client.get(
                            f"https://api.linkedin.com/v2/organizations/{org_id}",
                            headers={"Authorization": f"Bearer {access_token}"}
                        )
                        detail_json = detail_res.json()
                        org_name = detail_json.get("localizedName") or org_name
                    except Exception as de:
                        logger.warning(f"Error fetching org details for {org_id}: {de}")

                    org_account = db.query(SocialAccount).filter(
                        SocialAccount.brand_id == brand.id,
                        SocialAccount.platform == "linkedin",
                        SocialAccount.account_id == org_id
                    ).first()

                    if not org_account:
                        org_account = SocialAccount(
                            brand_id=brand.id,
                            user_id=user_id,
                            platform="linkedin",
                            account_id=org_id,
                            account_name=org_name
                        )
                        db.add(org_account)

                    org_account.access_token_encrypted = encrypt_token(access_token)
                    if refresh_token:
                        org_account.refresh_token_encrypted = encrypt_token(refresh_token)
                    org_account.token_expires_at = expires_at
                    org_account.is_active = True
                    org_account.metadata_json = {
                        "is_organization": True,
                        "org_urn": f"urn:li:organization:{org_id}",
                        "name": org_name,
                        "picture": userinfo.get("picture")
                    }

                    # Prioritize Company Page over Personal profile
                    if account and account.id != org_account.id:
                        account.is_active = False
        except Exception as e:
            logger.warning(f"Error checking LinkedIn organization ACLs: {e}")

        db.commit()

    return RedirectResponse(f"{FRONTEND_SETTINGS_URL}&connected=linkedin&status=success")


@router.get("/tiktok/callback")
async def tiktok_oauth_callback(
    code: Optional[str] = Query(None, description="TikTok authorization code"),
    error: Optional[str] = Query(None),
    error_description: Optional[str] = Query(None),
    state: Optional[str] = Query(None),
    db: Session = Depends(get_db)
):
    """
    Exchange TikTok authorization code for creator access token.
    Retrieves user open_id and display name, encrypts tokens, and stores them in SocialAccount.
    """
    if error:
        logger.error(f"TikTok OAuth error from redirect: error={error}, desc={error_description}")
        clean_msg = error_description or error
        return RedirectResponse(f"{FRONTEND_SETTINGS_URL}&error=tiktok_oauth_{error}&error_desc={clean_msg}")

    if not code:
        return RedirectResponse(f"{FRONTEND_SETTINGS_URL}&error=missing_code")

    user_id = state.split(":")[0] if state and ":" in state else None
    if not user_id:
        return RedirectResponse(f"{FRONTEND_SETTINGS_URL}&error=invalid_state")

    brand = db.query(Brand).filter(Brand.user_id == user_id).first()
    if not brand:
        return RedirectResponse(f"{FRONTEND_SETTINGS_URL}&error=brand_not_found")

    client_key, client_secret, redirect_uri = get_tiktok_credentials()
    async with httpx.AsyncClient(timeout=30.0) as client:
        # Step 1: Exchange code for access token
        token_url = "https://open.tiktokapis.com/v2/oauth/token/"
        data = {
            "client_key": client_key,
            "client_secret": client_secret,
            "code": code,
            "grant_type": "authorization_code",
            "redirect_uri": redirect_uri
        }
        headers = {"Content-Type": "application/x-www-form-urlencoded"}
        res = await client.post(token_url, data=data, headers=headers)
        token_info = res.json()
        logger.info(f"TikTok token response: {token_info}")

        token_data = token_info.get("data", token_info)
        access_token = token_data.get("access_token")
        if not access_token:
            err_msg = token_info.get("error", {}).get("message") or token_info.get("error_description") or "TikTok token exchange failed"
            logger.error(f"TikTok token error: {token_info}")
            return RedirectResponse(f"{FRONTEND_SETTINGS_URL}&error=tiktok_auth_failed&error_desc={err_msg}")

        open_id = token_data.get("open_id") or f"tiktok_{uuid.uuid4().hex[:8]}"
        expires_in = token_data.get("expires_in", 86400)
        expires_at = datetime.utcnow() + timedelta(seconds=expires_in)
        refresh_token = token_data.get("refresh_token")

        # Step 2: Fetch user profile (display name, avatar)
        display_name = "TikTok Creator"
        avatar_url = None
        try:
            user_url = "https://open.tiktokapis.com/v2/user/info/?fields=open_id,union_id,avatar_url,display_name"
            user_res = await client.get(user_url, headers={"Authorization": f"Bearer {access_token}"})
            user_info_resp = user_res.json()
            user_dict = user_info_resp.get("data", {}).get("user", {})
            if user_dict.get("display_name"):
                display_name = user_dict.get("display_name")
            if user_dict.get("avatar_url"):
                avatar_url = user_dict.get("avatar_url")
        except Exception as e:
            logger.warning(f"Could not fetch TikTok user info: {e}")

        # Step 3: Persist or update SocialAccount
        existing_tt = db.query(SocialAccount).filter(
            SocialAccount.brand_id == brand.id,
            SocialAccount.platform == "tiktok",
            SocialAccount.account_id == open_id
        ).first()

        clean_name = f"@{display_name}" if not display_name.startswith("@") else display_name
        if not existing_tt:
            existing_tt = SocialAccount(
                brand_id=brand.id,
                user_id=user_id,
                platform="tiktok",
                account_id=open_id,
                account_name=clean_name
            )
            db.add(existing_tt)

        existing_tt.access_token_encrypted = encrypt_token(access_token)
        if refresh_token:
            existing_tt.refresh_token_encrypted = encrypt_token(refresh_token)
        existing_tt.token_expires_at = expires_at
        existing_tt.is_active = True
        existing_tt.account_name = clean_name
        existing_tt.metadata_json = {
            "open_id": open_id,
            "display_name": display_name,
            "avatar_url": avatar_url,
            "refresh_token_encrypted": encrypt_token(refresh_token) if refresh_token else None
        }

        db.commit()

    return RedirectResponse(f"{FRONTEND_SETTINGS_URL}&connected=tiktok&status=success")


@router.get("/twitter/callback")
async def twitter_oauth_callback(
    code: Optional[str] = Query(None, description="Twitter authorization code"),
    error: Optional[str] = Query(None),
    error_description: Optional[str] = Query(None),
    state: Optional[str] = Query(None),
    db: Session = Depends(get_db)
):
    """
    Exchange Twitter/X OAuth 2.0 PKCE code for access token.
    Retrieves user profile, encrypts token, and persists SocialAccount.
    """
    if error:
        logger.error(f"Twitter OAuth error: error={error}, desc={error_description}")
        clean_msg = error_description or error
        return RedirectResponse(f"{FRONTEND_SETTINGS_URL}&error=twitter_oauth_{error}&error_desc={clean_msg}")

    if not code:
        return RedirectResponse(f"{FRONTEND_SETTINGS_URL}&error=missing_code")

    user_id = state.split(":")[0] if state and ":" in state else None
    if not user_id:
        return RedirectResponse(f"{FRONTEND_SETTINGS_URL}&error=invalid_state")

    brand = db.query(Brand).filter(Brand.user_id == user_id).first()
    if not brand:
        return RedirectResponse(f"{FRONTEND_SETTINGS_URL}&error=brand_not_found")

    client_id, client_secret, redirect_uri = get_twitter_credentials()
    async with httpx.AsyncClient(timeout=30.0) as client:
        token_url = "https://api.twitter.com/2/oauth2/token"
        data = {
            "code": code,
            "grant_type": "authorization_code",
            "client_id": client_id,
            "redirect_uri": redirect_uri,
            "code_verifier": TWITTER_PKCE_VERIFIER
        }
        headers = {"Content-Type": "application/x-www-form-urlencoded"}
        auth = (client_id, client_secret) if client_secret else None
        res = await client.post(token_url, data=data, headers=headers, auth=auth)
        token_info = res.json()
        logger.info(f"Twitter token response: {token_info}")

        access_token = token_info.get("access_token")
        if not access_token:
            err_msg = token_info.get("error_description") or token_info.get("error") or "Twitter token exchange failed"
            return RedirectResponse(f"{FRONTEND_SETTINGS_URL}&error=twitter_auth_failed&error_desc={err_msg}")

        expires_in = token_info.get("expires_in", 7200)
        expires_at = datetime.utcnow() + timedelta(seconds=expires_in)
        refresh_token = token_info.get("refresh_token")

        # Step 2: Fetch user profile
        username = "x_user"
        account_id = f"tw_{uuid.uuid4().hex[:8]}"
        try:
            me_res = await client.get(
                "https://api.twitter.com/2/users/me?user.fields=profile_image_url",
                headers={"Authorization": f"Bearer {access_token}"}
            )
            me_data = me_res.json().get("data", {})
            if me_data.get("id"):
                account_id = me_data.get("id")
            if me_data.get("username"):
                username = me_data.get("username")
        except Exception as e:
            logger.warning(f"Could not fetch Twitter profile: {e}")

        clean_name = f"@{username}" if not username.startswith("@") else username
        existing_tw = db.query(SocialAccount).filter(
            SocialAccount.brand_id == brand.id,
            SocialAccount.platform.in_(["twitter", "x"]),
            SocialAccount.account_id == account_id
        ).first()

        if not existing_tw:
            existing_tw = SocialAccount(
                brand_id=brand.id,
                user_id=user_id,
                platform="twitter",
                account_id=account_id,
                account_name=clean_name
            )
            db.add(existing_tw)

        existing_tw.access_token_encrypted = encrypt_token(access_token)
        if refresh_token:
            existing_tw.refresh_token_encrypted = encrypt_token(refresh_token)
        existing_tw.token_expires_at = expires_at
        existing_tw.is_active = True
        existing_tw.account_name = clean_name
        existing_tw.metadata_json = {
            "account_id": account_id,
            "username": username,
            "avatar_url": me_data.get("profile_image_url"),
            "refresh_token_encrypted": encrypt_token(refresh_token) if refresh_token else None
        }

        db.commit()

    return RedirectResponse(f"{FRONTEND_SETTINGS_URL}&connected=twitter&status=success")


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
        has_refresh_token = bool(acc.refresh_token_encrypted or (acc.metadata_json and acc.metadata_json.get("refresh_token_encrypted")))
        if acc.token_expires_at:
            delta = acc.token_expires_at - now
            days_left = max(0, delta.days)
            if has_refresh_token:
                # Platforms with auto-refresh tokens (Twitter, TikTok) silently refresh upon publishing and do not require manual reconnect
                needs_reconnect = False
            else:
                if delta.days <= 7:
                    needs_reconnect = True

        avatar = None
        if acc.metadata_json and isinstance(acc.metadata_json, dict):
            avatar = (
                acc.metadata_json.get("picture") or
                acc.metadata_json.get("avatar_url") or
                acc.metadata_json.get("profile_picture_url")
            )

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
                metadata_json=acc.metadata_json,
                avatar_url=avatar
            )
        )

    return results


@router.post("/accounts/{account_id}/set-active")
def set_active_social_account(
    account_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Select active publishing account when multiple pages/profiles exist for a platform.
    """
    brand = db.query(Brand).filter(Brand.user_id == user.id).first()
    if not brand:
        raise HTTPException(status_code=404, detail="Brand not found")

    target = db.query(SocialAccount).filter(
        SocialAccount.id == account_id,
        SocialAccount.brand_id == brand.id
    ).first()

    if not target:
        raise HTTPException(status_code=404, detail="Account not found")

    # Set all other accounts of same platform to inactive
    db.query(SocialAccount).filter(
        SocialAccount.brand_id == brand.id,
        SocialAccount.platform == target.platform
    ).update({"is_active": False}, synchronize_session=False)

    target.is_active = True
    db.commit()
    return {"status": "success", "message": f"{target.account_name} is now the active {target.platform} account"}


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

