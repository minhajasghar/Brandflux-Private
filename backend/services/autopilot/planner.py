import logging
from datetime import datetime, timedelta, time
from typing import Dict, Any, List
from services.gemini_service import GeminiService

logger = logging.getLogger(__name__)


class StrategyPlanner:
    """
    Plans a high-retention 7-day social calendar tailored to brand kit,
    historical metrics, content pillars, and peak engagement times.
    """

    def __init__(self):
        self.gemini = GeminiService()

    def plan_7_day_calendar(
        self,
        brand_profile: Dict[str, Any],
        metrics_analysis: Dict[str, Any],
        target_platforms: List[str],
        max_posts_per_day: int = 2,
        banned_topics: List[str] = None,
        start_date: datetime = None,
        learning_context: str = None
    ) -> List[Dict[str, Any]]:
        """
        Generate 7 scheduled post blueprints mapped to calendar dates and optimal posting hours.
        """
        start = start_date or (datetime.utcnow() + timedelta(days=1))
        # Zero out time to midnight of start date
        base_date = datetime(start.year, start.month, start.day)

        pillars = metrics_analysis.get("content_pillars") or [
            "Educational Insights", "Behind the Scenes", "Frameworks", "Industry Analysis"
        ]
        top_pillar = metrics_analysis.get("top_performing_pillar", pillars[0])
        optimal_hours = metrics_analysis.get("recommended_posting_hours") or ["09:00", "13:30", "18:00"]
        
        platforms = target_platforms or ["instagram_post", "linkedin", "facebook"]
        template_pool = ["quote", "stat", "checklist", "before_after", "process", "announcement"]

        learning_section = f"\n{learning_context}\n" if learning_context else ""

        # Ask Gemini to generate 7 cohesive topics aligned with pillars
        topics_prompt = f"""You are a master social media content strategist for {brand_profile.get('business_name', 'Brandflux')}.
Industry: {brand_profile.get('industry', 'Technology')}
Audience: {brand_profile.get('target_audience', 'Builders and Professionals')}
Brand Tone: {brand_profile.get('brand_tone', 'Confident, Actionable, Modern')}
Content Pillars: {', '.join(pillars)}
Top Pillar from Metrics: {top_pillar}
Banned Topics (NEVER USE): {', '.join(banned_topics or [])}
{learning_section}
Plan exactly 7 distinct, viral, high-value post topics for the upcoming 7 days (Monday through Sunday).
Do NOT include any pricing, discounts, or dollar amounts.
Return a valid JSON array of 7 objects strictly:
[
  {{
    "day_number": 1,
    "topic": "Catchy post title or core question",
    "pillar": "Chosen pillar name",
    "suggested_format": "single_image" or "carousel",
    "template_style": "quote" or "stat" or "checklist" or "before_after" or "process" or "announcement",
    "target_angle": "Brief explanation of value"
  }}
]"""

        planned_topics = []
        try:
            if self.gemini.model:
                response = self.gemini.model.generate_content(
                    topics_prompt,
                    generation_config={"response_mime_type": "application/json"}
                )
                data = self.gemini.safe_parse_json(response.text)
                if isinstance(data, list) and len(data) >= 7:
                    planned_topics = data[:7]
        except Exception as e:
            logger.warning(f"[Planner] Gemini topic planning failed: {e}. Using deterministic fallback.")

        # Fallback if LLM planning failed
        if len(planned_topics) < 7:
            planned_topics = self._generate_fallback_topics(brand_profile, pillars, template_pool)

        # Build 7-day schedule with timestamps
        calendar_plan = []
        for i, item in enumerate(planned_topics[:7]):
            post_day = base_date + timedelta(days=i)
            # Pick optimal time of day
            time_str = optimal_hours[i % len(optimal_hours)]
            hour, minute = map(int, time_str.split(":"))
            scheduled_at = post_day.replace(hour=hour, minute=minute, second=0)

            platform = platforms[i % len(platforms)]
            fmt = item.get("suggested_format", "carousel" if i in (1, 4) else "single_image")
            tpl = item.get("template_style", template_pool[i % len(template_pool)])

            calendar_plan.append({
                "day_index": i + 1,
                "date_str": scheduled_at.strftime("%Y-%m-%d"),
                "scheduled_at": scheduled_at,
                "platform": platform,
                "pillar": item.get("pillar", pillars[i % len(pillars)]),
                "topic": item.get("topic", f"Mastering {brand_profile.get('industry', 'Growth')} Rule #{i+1}"),
                "post_format": fmt,
                "template_style": tpl,
                "target_angle": item.get("target_angle", "Actionable value for audience")
            })

        logger.info(f"[Autopilot Planner] Generated 7-day calendar ({len(calendar_plan)} posts planned)")
        return calendar_plan

    def _generate_fallback_topics(
        self,
        brand_profile: Dict[str, Any],
        pillars: List[str],
        templates: List[str]
    ) -> List[Dict[str, Any]]:
        industry = brand_profile.get("industry", "Business")
        name = brand_profile.get("business_name", "Brandflux")

        fallbacks = [
            {"day_number": 1, "topic": f"The #1 Mistake Teams Make in {industry}", "pillar": pillars[0], "suggested_format": "single_image", "template_style": "quote"},
            {"day_number": 2, "topic": f"3 Systems We Use at {name} to Move Faster", "pillar": pillars[1 % len(pillars)], "suggested_format": "carousel", "template_style": "process"},
            {"day_number": 3, "topic": f"Data Point: What 100+ Hours in {industry} Taught Us", "pillar": pillars[0], "suggested_format": "single_image", "template_style": "stat"},
            {"day_number": 4, "topic": f"The Outdated Approach vs The Modern Standard", "pillar": pillars[2 % len(pillars)], "suggested_format": "single_image", "template_style": "before_after"},
            {"day_number": 5, "topic": f"Essential 4-Step Checklist for {industry} Leaders", "pillar": pillars[1 % len(pillars)], "suggested_format": "carousel", "template_style": "checklist"},
            {"day_number": 6, "topic": f"A Hard Truth Most People Won't Say in Public", "pillar": pillars[0], "suggested_format": "single_image", "template_style": "quote"},
            {"day_number": 7, "topic": f"Weekly Roadmap & Blueprint for Tomorrow", "pillar": pillars[2 % len(pillars)], "suggested_format": "single_image", "template_style": "announcement"},
        ]
        return fallbacks


strategy_planner = StrategyPlanner()

