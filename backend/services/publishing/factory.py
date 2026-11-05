from config import USE_SOCIAL_AGGREGATOR
from services.publishing.base import PlatformPublisher
from services.publishing.meta_adapter import MetaPublisher
from services.publishing.linkedin_adapter import LinkedInPublisher
from services.publishing.tiktok_adapter import TikTokPublisher
from services.publishing.x_adapter import XPublisher
from services.publishing.aggregator_adapter import AyrshareAggregatorPublisher


def get_publisher(platform: str) -> PlatformPublisher:
    """
    Factory function resolving publisher adapter based on target platform and feature flags.
    Swaps in Ayrshare aggregator if USE_SOCIAL_AGGREGATOR=true.
    """
    if USE_SOCIAL_AGGREGATOR:
        return AyrshareAggregatorPublisher()

    plat = platform.lower()
    if "linkedin" in plat:
        return LinkedInPublisher()
    
    if "tiktok" in plat:
        return TikTokPublisher()

    if plat in ("twitter", "x"):
        return XPublisher()

    # Meta covers Instagram and Facebook
    return MetaPublisher()

