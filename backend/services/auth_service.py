from datetime import datetime, timedelta
from typing import Optional
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy.orm import Session

from models.models import User
from config import SECRET_KEY, JWT_ALGORITHM, JWT_EXPIRATION_DAYS

# ─── Password Hashing ─────────────────────────────────────
# Using argon2 for better compatibility and security
pwd_context = CryptContext(schemes=["argon2"], deprecated="auto")

def hash_password(password: str) -> str:
    """Hash the password using passlib bcrypt."""
    return pwd_context.hash(password)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify password hash."""
    return pwd_context.verify(plain_password, hashed_password)

# ─── JWT Token ─────────────────────────────────────────────
def create_token(user_id: str) -> str:
    """Generate JWT token (expires in 7 days)."""
    expire = datetime.utcnow() + timedelta(days=JWT_EXPIRATION_DAYS)
    payload = {"sub": user_id, "exp": expire}
    return jwt.encode(payload, SECRET_KEY, algorithm=JWT_ALGORITHM)

def decode_token(token: str) -> Optional[str]:
    """Decode JWT token and return user_id."""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[JWT_ALGORITHM])
        return payload.get("sub")
    except JWTError:
        return None

def get_current_user_from_db(user_id: str, db: Session) -> Optional[User]:
    """Find user in database by ID."""
    return db.query(User).filter(User.id == user_id).first()
