import logging
import httpx
from typing import Dict, Any, Optional
from services.email.base import EmailProvider
from config import (
    EMAIL_API_KEY,
    EMAIL_FROM,
    EMAIL_FROM_NAME,
    EMAIL_REPLY_TO
)

logger = logging.getLogger("email.resend")

class ResendEmailProvider(EmailProvider):
    """
    Resend Provider:
    - Disabled / inactive until configured with valid EMAIL_API_KEY.
    - Sends via Resend REST API (https://api.resend.com/emails).
    - NEVER logs API keys in logs or outputs.
    """

    def __init__(self):
        self.api_key = EMAIL_API_KEY
        self.from_email = EMAIL_FROM or "notifications@brandflux.ai"
        self.from_name = EMAIL_FROM_NAME or "Brandflux"
        self.reply_to = EMAIL_REPLY_TO or "support@brandflux.ai"

    async def send(
        self,
        recipient: str,
        subject: str,
        template: str,
        full_html: str,
        plain_text: str,
        metadata: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        if not self.api_key:
            err_msg = "Resend API key is not configured. Set EMAIL_API_KEY in backend/.env"
            logger.warning(err_msg)
            return {
                "status": "failed",
                "provider": "resend",
                "external_id": None,
                "error": err_msg
            }

        payload = {
            "from": f"{self.from_name} <{self.from_email}>",
            "to": [recipient],
            "reply_to": self.reply_to,
            "subject": subject,
            "html": full_html,
            "text": plain_text
        }

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }

        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                res = await client.post("https://api.resend.com/emails", json=payload, headers=headers)
                if res.status_code in (200, 201):
                    res_json = res.json()
                    external_id = res_json.get("id")
                    logger.info(f"[EMAIL SENT (RESEND)] To: {recipient} | Template: {template} | ID: {external_id}")
                    return {
                        "status": "sent",
                        "provider": "resend",
                        "external_id": external_id,
                        "error": None
                    }
                else:
                    error_detail = res.text
                    logger.error(f"[EMAIL ERROR (RESEND)] HTTP {res.status_code}: {error_detail}")
                    return {
                        "status": "failed",
                        "provider": "resend",
                        "external_id": None,
                        "error": f"Resend HTTP {res.status_code}: {error_detail}"
                    }
        except Exception as e:
            logger.error(f"[EMAIL EXCEPTION (RESEND)] {str(e)}")
            return {
                "status": "failed",
                "provider": "resend",
                "external_id": None,
                "error": str(e)
            }

