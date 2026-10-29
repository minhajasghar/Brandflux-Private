from typing import Optional
from datetime import datetime, timedelta
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session

from database import get_db
from services.auth_service import decode_token, decode_token_payload, get_current_user_from_db
from models.models import User

security = HTTPBearer()
optional_security = HTTPBearer(auto_error=False)

def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db)
) -> User:
    """
    Middleware dependency for FastAPI.
    Reads Bearer token from header, decodes payload, validates session version,
    checks suspension & deletion status, and updates last_active_at.
    Throws 401 if missing, invalid, expired or revoked.
    Throws 403 if suspended.
    """
    token = credentials.credentials
    payload = decode_token_payload(token)
    
    if not payload or not payload.get("sub"):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user_id = payload.get("sub")
    token_version = payload.get("token_version", 1)
        
    user = get_current_user_from_db(user_id, db)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # 1. Block soft-deleted users
    if getattr(user, "is_deleted", False):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Account has been deleted or deactivated.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # 2. Block suspended users on every API call
    if getattr(user, "is_suspended", False):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your account has been suspended by an administrator. Please contact support.",
        )

    # 3. Force logout / session invalidation check
    current_token_version = getattr(user, "token_version", 1) or 1
    if token_version < current_token_version:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session has been terminated by an administrator. Please log in again.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # 4. Update last_active_at timestamp (throttled to avoid redundant writes)
    now = datetime.utcnow()
    last_active = getattr(user, "last_active_at", None)
    if not last_active or (now - last_active) > timedelta(minutes=5):
        user.last_active_at = now
        try:
            db.commit()
        except Exception:
            db.rollback()

    return user


def require_admin(
    user: User = Depends(get_current_user)
) -> User:
    """
    Dependency for all /admin routes.
    Ensures the user has the 'admin' role.
    """
    if getattr(user, "role", "user") != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin privileges required to access this endpoint."
        )
    return user


def get_optional_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(optional_security),
    db: Session = Depends(get_db)
) -> Optional[User]:
    """
    Optional authentication dependency for endpoints that work for both
    public visitors and authenticated users.
    Returns User if valid Bearer token provided; None otherwise.
    """
    if not credentials or not credentials.credentials:
        return None
    token = credentials.credentials
    payload = decode_token_payload(token)
    if not payload or not payload.get("sub"):
        return None

    user = get_current_user_from_db(payload.get("sub"), db)
    if not user or getattr(user, "is_deleted", False) or getattr(user, "is_suspended", False):
        return None
    return user

