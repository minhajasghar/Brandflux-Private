from abc import ABC, abstractmethod
from typing import Dict, Any, Optional

class EmailProvider(ABC):
    """
    Abstract Base Class for all Email Providers.
    Any provider (dev outbox, Resend, SendGrid, etc.) must implement this interface.
    """

    @abstractmethod
    async def send(
        self,
        recipient: str,
        subject: str,
        template: str,
        full_html: str,
        plain_text: str,
        metadata: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Deliver or capture the email.
        Returns a dict with at least:
        - status: "captured (dev)" | "sent" | "failed"
        - provider: str
        - external_id: Optional[str]
        - error: Optional[str]
        """
        pass

