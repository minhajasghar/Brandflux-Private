import base64
import hashlib
import logging
from cryptography.fernet import Fernet
from config import ENCRYPTION_KEY, SECRET_KEY

logger = logging.getLogger(__name__)


class TokenEncryptor:
    """Fernet symmetric encryption for OAuth access and refresh tokens."""

    def __init__(self):
        key = ENCRYPTION_KEY
        if not key:
            # Deterministically derive 32-byte url-safe base64 key from SECRET_KEY
            derived = hashlib.sha256(SECRET_KEY.encode()).digest()
            key = base64.urlsafe_b64encode(derived).decode()
        
        try:
            self.fernet = Fernet(key.encode() if isinstance(key, str) else key)
        except Exception as e:
            logger.error(f"Failed to initialize Fernet with provided key: {e}. Generating fallback key.")
            self.fernet = Fernet(Fernet.generate_key())

    def encrypt(self, plain_text: str) -> str:
        """Encrypt token string into Fernet ciphertext."""
        if not plain_text:
            return ""
        return self.fernet.encrypt(plain_text.encode("utf-8")).decode("utf-8")

    def decrypt(self, cipher_text: str) -> str:
        """Decrypt Fernet ciphertext back into plaintext token string."""
        if not cipher_text:
            return ""
        try:
            return self.fernet.decrypt(cipher_text.encode("utf-8")).decode("utf-8")
        except Exception as e:
            logger.error(f"Fernet decryption error: {e}")
            raise ValueError("Failed to decrypt access token")


encryptor = TokenEncryptor()

def encrypt_token(token: str) -> str:
    return encryptor.encrypt(token)

def decrypt_token(cipher_text: str) -> str:
    return encryptor.decrypt(cipher_text)

