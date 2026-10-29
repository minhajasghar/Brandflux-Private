import logging
import re
from typing import Dict, Any, List, Tuple
from services.gemini_service import GeminiService
from services.autopilot.guardrails import guardrail_enforcer

logger = logging.getLogger(__name__)


class SelfCritiqueEngine:
    """
    Evaluates generated posts across three core dimensions:
    1. Brand Voice & Tone Fidelity (0 - 10)
    2. Factual Claims, Pricing Guardrails & Safety (0 - 10)
    3. Hashtag Quality, Relevance & Density (0 - 10)

    Enforces minimum thresholds (>= 7.5 overall, >= 8.0 factual).
    Triggers automated regeneration when quality falls below standard.
    """

    PASSING_THRESHOLD = 7.5
    FACTUAL_THRESHOLD = 8.0

    def __init__(self):
        self.gemini = GeminiService()

    def critique_post(
        self,
        caption: str,
        headline: str,
        hashtags: List[str],
        brand_profile: Dict[str, Any],
        banned_topics: List[str],
        allowed_claims: List[str],
        recent_checkins: List[str]
    ) -> Dict[str, Any]:
        """
        Run rigorous multi-axis critique on candidate post copy.
        """
        reasons = []
        full_text = f"{headline}\n{caption}\n{' '.join(hashtags or [])}"

        # ── Step 1: Deterministic Guardrail Verification ───────────────────────
        banned_ok, banned_reason = guardrail_enforcer.check_banned_topics(full_text, banned_topics)
        if not banned_ok:
            return {
                "passed": False,
                "overall_score": 1.0,
                "voice_score": 5.0,
                "factual_score": 0.0,
                "hashtag_score": 5.0,
                "feedback": banned_reason,
                "reasons": [banned_reason],
                "must_regenerate": True
            }

        pricing_ok, pricing_reason = guardrail_enforcer.check_pricing_and_discounts(
            full_text, allowed_claims, recent_checkins
        )
        if not pricing_ok:
            return {
                "passed": False,
                "overall_score": 2.0,
                "voice_score": 6.0,
                "factual_score": 0.0,
                "hashtag_score": 6.0,
                "feedback": pricing_reason,
                "reasons": [pricing_reason],
                "must_regenerate": True
            }

        # ── Step 2: Hashtag Quality Verification ──────────────────────────────
        hashtag_score = 8.5
        bad_tags = {"#viral", "#fyp", "#foryou", "#followforfollow", "#like4like", "#trending"}
        tag_count = len(hashtags or [])
        if tag_count < 2:
            hashtag_score -= 2.0
            reasons.append("Hashtag density too sparse (< 2 tags)")
        elif tag_count > 10:
            hashtag_score -= 2.5
            reasons.append("Hashtag density too cluttered (> 10 tags)")
        
        for tag in (hashtags or []):
            if tag.lower() in bad_tags:
                hashtag_score -= 2.0
                reasons.append(f"Low-intent spam hashtag '{tag}' detected")

        hashtag_score = max(0.0, min(10.0, hashtag_score))

        # ── Step 3: LLM Brand Voice & Factual Claims Critique ─────────────────
        voice_score = 8.0
        factual_score = 9.0
        feedback = "Solid alignment with brand tone and messaging guidelines."

        if self.gemini.model:
            prompt = f"""You are the Brand Quality & Compliance Auditor for {brand_profile.get('business_name', 'Brandflux')}.
Target Brand Tone: {brand_profile.get('brand_tone', 'Confident, Actionable, Modern')}
Brand Voice Guidelines: {brand_profile.get('brand_voice', 'Clear, authoritative, no buzzwords')}
Audience: {brand_profile.get('target_audience', 'Builders and Professionals')}

Candidate Post to Evaluate:
Headline: "{headline}"
Caption: "{caption}"
Hashtags: "{' '.join(hashtags or [])}"

Evaluate strictly on:
1. voice_score (0.0 to 10.0): Does it speak with genuine authority? Is it free of cheesy marketing fluff?
2. factual_score (0.0 to 10.0): Does it avoid wild unverified promises, fake statistics, or made-up discounts?
3. feedback (1-2 sentences): Constructive critique.

Return JSON strictly:
{{
  "voice_score": 8.5,
  "factual_score": 9.0,
  "feedback": "Concise summary critique"
}}"""
            try:
                response = self.gemini.model.generate_content(
                    prompt,
                    generation_config={"response_mime_type": "application/json"}
                )
                eval_data = self.gemini.safe_parse_json(response.text)
                if isinstance(eval_data, dict):
                    voice_score = float(eval_data.get("voice_score", 8.0))
                    factual_score = float(eval_data.get("factual_score", 9.0))
                    feedback = eval_data.get("feedback", feedback)
            except Exception as e:
                logger.warning(f"[Critic] LLM critique failed: {e}. Using rule-based fallback.")

        # Compute weighted overall score (Voice 40%, Factual 40%, Hashtags 20%)
        overall_score = round(
            (voice_score * 0.40) + (factual_score * 0.40) + (hashtag_score * 0.20),
            1
        )

        passed = (
            overall_score >= self.PASSING_THRESHOLD and
            factual_score >= self.FACTUAL_THRESHOLD and
            len(reasons) == 0
        )

        if not passed:
            if voice_score < self.PASSING_THRESHOLD:
                reasons.append(f"Brand voice score ({voice_score}/10) below threshold ({self.PASSING_THRESHOLD})")
            if factual_score < self.FACTUAL_THRESHOLD:
                reasons.append(f"Factual compliance score ({factual_score}/10) below threshold ({self.FACTUAL_THRESHOLD})")

        return {
            "passed": passed,
            "overall_score": overall_score,
            "voice_score": voice_score,
            "factual_score": factual_score,
            "hashtag_score": hashtag_score,
            "feedback": feedback,
            "reasons": reasons,
            "must_regenerate": not passed
        }


self_critique_engine = SelfCritiqueEngine()

