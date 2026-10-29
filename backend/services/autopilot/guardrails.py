import re
import logging
from typing import List, Dict, Any, Tuple, Optional
from models.models import AutopilotConfig

logger = logging.getLogger(__name__)


class AutopilotKilledException(Exception):
    """Raised when the master kill switch is active."""
    pass


class GuardrailEnforcer:
    """
    Enforces Brandflux Autopilot safety guardrails:
    1. Master Kill Switch (emergency stop on all automated generation & scheduling).
    2. Banned Topics List (rejection of restricted subject matter).
    3. Factual Claim Verification: Strictly prohibits inventing prices or discounts not given in daily check-in.
    4. Daily Post Rate Cap: Never exceeds max_posts_per_day.
    """

    PRICE_DISCOUNT_REGEX = re.compile(
        r"(\$\s?\d+(?:,\d{3})*(?:\.\d{2})?|\b\d+%\s*(?:off|discount)\b|\bcoupon\b|\bpromo\s*code\b|\bfree\s*gift\b)",
        re.IGNORECASE
    )

    def verify_kill_switch(self, config: AutopilotConfig):
        """Verify master emergency kill switch is not engaged."""
        if config.kill_switch:
            logger.warning(f"[Guardrail] Autopilot run aborted: Kill Switch is ACTIVE for brand {config.brand_id}")
            raise AutopilotKilledException("Autopilot run aborted: Master Kill Switch is currently active.")

    def check_banned_topics(self, text: str, banned_topics: List[str]) -> Tuple[bool, Optional[str]]:
        """
        Check if post copy mentions any prohibited topics.
        """
        if not banned_topics or not text:
            return True, None

        text_lower = text.lower()
        for topic in banned_topics:
            clean_topic = topic.strip().lower()
            if not clean_topic:
                continue
            # Word boundary search or substring match
            pattern = rf"\b{re.escape(clean_topic)}\b"
            if re.search(pattern, text_lower) or clean_topic in text_lower:
                reason = f"Contains banned topic '{topic}'"
                logger.warning(f"[Guardrail] Post rejected: {reason}")
                return False, reason

        return True, None

    def check_pricing_and_discounts(
        self,
        text: str,
        allowed_claims: List[str],
        recent_checkin_answers: List[str]
    ) -> Tuple[bool, Optional[str]]:
        """
        Guardrail: Never invent prices or discounts not given in daily check-in.
        Scans text for dollar amounts or % discount claims. If found, ensures it was
        explicitly stated in recent daily check-in answers or verified allowed claims.
        """
        if not text:
            return True, None

        matches = self.PRICE_DISCOUNT_REGEX.findall(text)
        if not matches:
            return True, None

        # Build corpus of verified truths from daily check-ins
        verified_corpus = " ".join((allowed_claims or []) + (recent_checkin_answers or [])).lower()

        for match in matches:
            clean_match = match.strip().lower().replace(" ", "")
            # Look for match in corpus
            corpus_normalized = verified_corpus.replace(" ", "")
            if clean_match not in corpus_normalized and match.lower() not in verified_corpus:
                reason = f"Unverified pricing/discount claim '{match}' detected. Not provided in daily check-in."
                logger.warning(f"[Guardrail] Price hallucination blocked: {reason}")
                return False, reason

        return True, None

    def check_daily_post_cap(
        self,
        current_count_for_day: int,
        max_posts_per_day: int = 2
    ) -> Tuple[bool, Optional[str]]:
        """
        Ensure scheduled volume does not breach max posts/day limit.
        """
        if current_count_for_day >= max_posts_per_day:
            reason = f"Daily posting cap reached ({current_count_for_day}/{max_posts_per_day} posts)"
            return False, reason
        return True, None


guardrail_enforcer = GuardrailEnforcer()

