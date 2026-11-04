from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Optional, Dict, Any
from models.models import SocialAccount


@dataclass
class PublishResult:
    success: bool
    status: str  # "Published", "Publishing", "Failed", "needs_reconnect"
    external_post_id: Optional[str] = None
    permalink: Optional[str] = None
    error: Optional[str] = None
    error_code: Optional[str] = None
    http_status: Optional[int] = None
    duration_ms: Optional[int] = None
    sanitized_payload: Optional[Dict[str, Any]] = None
    raw_response: Optional[Dict[str, Any]] = None


@dataclass
class MetricsResult:
    impressions: int = 0
    reach: int = 0
    engagement: int = 0
    likes: int = 0
    comments: int = 0
    shares: int = 0
    clicks: int = 0
    raw_data: Dict[str, Any] = field(default_factory=dict)


class PlatformPublisher(ABC):
    """Abstract interface defining social publishing and metrics operations."""

    @abstractmethod
    async def publish_text(self, text: str, account: SocialAccount) -> PublishResult:
        """Publish a pure text update."""
        pass

    @abstractmethod
    async def publish_image(self, image_url: str, caption: str, account: SocialAccount) -> PublishResult:
        """Publish an image with caption."""
        pass

    @abstractmethod
    async def publish_story(self, media_url: str, account: SocialAccount) -> PublishResult:
        """Publish an ephemeral vertical story."""
        pass

    @abstractmethod
    async def get_metrics(self, external_post_id: str, account: SocialAccount) -> MetricsResult:
        """Retrieve real-time post performance metrics."""
        pass

