import logging
from typing import Dict, Any, Optional
from services.email.base import EmailProvider

logger = logging.getLogger("email.dev")

class DevEmailProvider(EmailProvider):
    """
    Dev Mode Email Provider:
    - Does NOT send real network traffic or use real credentials.
    - Captures each email in the database outbox (status='captured (dev)').
    - Logs a concise one-line trace to backend console.
    """

    async def send(
        self,
        recipient: str,
        subject: str,
        template: str,
        full_html: str,
        plain_text: str,
        metadata: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        # Log concise line to console
        print(f"\n[EMAIL CAPTURED (DEV)] To: {recipient} | Template: {template} | Subject: '{subject}'")
        logger.info(f"[EMAIL CAPTURED (DEV)] To: {recipient} | Template: {template} | Subject: '{subject}'")

        return {
            "status": "captured (dev)",
            "provider": "dev",
            "external_id": None,
            "error": None
        }

