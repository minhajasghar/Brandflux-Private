import logging
import redis
from slowapi import Limiter
from slowapi.util import get_remote_address
from config import REDIS_URL

logger = logging.getLogger(__name__)


def create_limiter() -> Limiter:
    """
    Initialize slowapi Limiter using Redis backend.
    Gracefully falls back to in-memory limits if Redis is unreachable in local dev.
    """
    storage_uri = REDIS_URL
    try:
        client = redis.from_url(REDIS_URL, socket_connect_timeout=1.5)
        client.ping()
        logger.info(f"Initialized slowapi with Redis backend: {REDIS_URL}")
    except Exception as e:
        logger.warning(
            f"Redis unreachable at {REDIS_URL} ({e}). Falling back to memory storage for rate limiting."
        )
        storage_uri = "memory://"

    return Limiter(key_func=get_remote_address, storage_uri=storage_uri)


limiter = create_limiter()

