from config import USE_SOCIAL_AGGREGATOR
from services.publishing.base import PlatformPublisher
from services.publishing.meta_adapter import MetaPublisher
from services.publishing.linkedin_adapter import LinkedInPublisher
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
    
    # Meta covers Instagram and Facebook
    return MetaPublisher()

