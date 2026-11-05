import logging
from datetime import datetime, timedelta, time
from typing import Dict, Any, List, Optional
from services.gemini_service import GeminiService

logger = logging.getLogger(__name__)

WEEKDAYS_MAP = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]


def compute_next_posts_preview(
    frequency: str,
    custom_weekdays: Optional[List[str]] = None,
    start_date: Optional[datetime] = None
) -> str:
    """
    Computes a plain preview text like:
    - 'Next posts: Tue, Thu'
    - 'Next posts: Mon, Tue, Wed, Thu, Fri, Sat, Sun'
    - 'Next posts: Fri, Sun, Tue'
    """
    start = start_date or datetime.utcnow()
    freq = (frequency or "daily").lower()

    if freq == "custom":
        valid_custom = [d for d in (custom_weekdays or ["Tue", "Thu"]) if d in WEEKDAYS_MAP]
        if not valid_custom:
            valid_custom = ["Tue", "Thu"]
        # Maintain calendar order Mon..Sun
        ordered = [d for d in WEEKDAYS_MAP if d in valid_custom]
        return f"Next posts: {', '.join(ordered)}"

    elif freq == "daily":
        return "Next posts: Every day (Mon – Sun)"

    elif freq == "every_2_days":
        # Calculate next 3 days
        days = []
        cur = start + timedelta(days=1)
        for _ in range(3):
            days.append(WEEKDAYS_MAP[cur.weekday()])
            cur += timedelta(days=2)
        return f"Next posts: {', '.join(days)}"

    elif freq == "every_3_days":
        days = []
        cur = start + timedelta(days=1)
        for _ in range(3):
            days.append(WEEKDAYS_MAP[cur.weekday()])
            cur += timedelta(days=3)
        return f"Next posts: {', '.join(days)}"

    elif freq == "weekly":
        next_day = start + timedelta(days=(7 - start.weekday()))
        return f"Next posts: Weekly on {WEEKDAYS_MAP[next_day.weekday()]}"

    return "Next posts: Scheduled"


class StrategyPlanner:
    """
    Plans social posts tailored to brand kit,
    frequency, custom weekdays, posting time, content pillars, and events.
    """

    def __init__(self):
        self.gemini = GeminiService()

    def determine_target_dates(
        self,
        frequency: str,
        custom_weekdays: Optional[List[str]],
        posting_time: str = "07:00",
        start_date: Optional[datetime] = None,
        days_ahead: int = 7
    ) -> List[datetime]:
        """
        Calculates upcoming schedule datetime targets based on frequency settings.
        """
        start = start_date or (datetime.utcnow() + timedelta(days=1))
        freq = (frequency or "daily").lower()

        try:
            hour, minute = map(int, posting_time.split(":"))
        except Exception:
            hour, minute = 7, 0

        target_dates = []

        if freq == "custom":
            custom_set = set(custom_weekdays or ["Tue", "Thu"])
            for i in range(days_ahead):
                d = start + timedelta(days=i)
                day_name = WEEKDAYS_MAP[d.weekday()]
                if day_name in custom_set:
                    dt = datetime(d.year, d.month, d.day, hour, minute, 0)
                    target_dates.append(dt)
            # If none matched within range (e.g. bad input), default to at least 2 days
            if not target_dates:
                for i in [1, 3]:
                    d = start + timedelta(days=i)
                    target_dates.append(datetime(d.year, d.month, d.day, hour, minute, 0))

        elif freq == "every_2_days":
            for i in range(0, days_ahead, 2):
                d = start + timedelta(days=i)
                target_dates.append(datetime(d.year, d.month, d.day, hour, minute, 0))

        elif freq == "every_3_days":
            for i in range(0, days_ahead, 3):
                d = start + timedelta(days=i)
                target_dates.append(datetime(d.year, d.month, d.day, hour, minute, 0))

        elif freq == "weekly":
            d = start
            target_dates.append(datetime(d.year, d.month, d.day, hour, minute, 0))

        else:  # daily
            for i in range(days_ahead):
                d = start + timedelta(days=i)
                target_dates.append(datetime(d.year, d.month, d.day, hour, minute, 0))

        return target_dates

    def plan_calendar(
        self,
        brand_profile: Dict[str, Any],
        metrics_analysis: Dict[str, Any],
        target_platforms: List[str],
        frequency: str = "daily",
        custom_weekdays: Optional[List[str]] = None,
        posting_time: str = "07:00",
        timezone_str: str = "Asia/Karachi",
        banned_topics: Optional[List[str]] = None,
        event_context: Optional[str] = None,
        start_date: Optional[datetime] = None,
        learning_context: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """
        Generate scheduled post blueprints mapped to calendar dates based on frequency.
        """
        target_datetimes = self.determine_target_dates(
            frequency=frequency,
            custom_weekdays=custom_weekdays,
            posting_time=posting_time,
            start_date=start_date,
            days_ahead=7
        )

        pillars = metrics_analysis.get("content_pillars") or [
            "Educational Insights", "Behind the Scenes", "Frameworks & Systems", "Industry Innovation"
        ]
        top_pillar = metrics_analysis.get("top_performing_pillar", pillars[0])
        platforms = target_platforms or ["facebook", "linkedin", "tiktok"]
        template_pool = ["quote", "stat", "checklist", "before_after", "process", "announcement"]

        num_posts = len(target_datetimes)
        learning_section = f"\n{learning_context}\n" if learning_context else ""
        event_section = f"\nUPCOMING EVENT / OFFER HIGHLIGHT (PRIORITIZE THIS):\n{event_context}\n" if event_context else ""

        topics_prompt = f"""You are a master social media content strategist for {brand_profile.get('business_name', 'Brandflux')}.
Industry: {brand_profile.get('industry', 'Technology')}
Audience: {brand_profile.get('target_audience', 'Builders, Founders, and Modern Professionals')}
Brand Tone: {brand_profile.get('brand_tone', 'Confident, Actionable, Modern')}
Content Pillars: {', '.join(pillars)}
Top Pillar: {top_pillar}
Banned Topics (NEVER USE): {', '.join(banned_topics or [])}
{event_section}
{learning_section}
Plan exactly {num_posts} distinct, high-impact post topics for the upcoming scheduled days.
Do NOT invent any specific dollar amounts or unauthorized discounts unless explicitly given in the event section.
Return a valid JSON array of {num_posts} objects strictly matching:
[
  {{
    "day_number": 1,
    "topic": "Catchy, valuable headline or core theme",
    "pillar": "Chosen pillar name",
    "suggested_format": "single_image",
    "template_style": "quote" or "stat" or "checklist" or "before_after" or "process" or "announcement",
    "target_angle": "Brief explanation of actionable takeaway"
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
                if isinstance(data, list) and len(data) >= num_posts:
                    planned_topics = data[:num_posts]
        except Exception as e:
            logger.warning(f"[Planner] Gemini topic planning failed: {e}. Using deterministic fallback.")

        # Fallback if LLM planning failed or returned fewer
        if len(planned_topics) < num_posts:
            fallback_pool = self._generate_fallback_topics(brand_profile, pillars, template_pool, event_context)
            while len(planned_topics) < num_posts:
                idx = len(planned_topics)
                planned_topics.append(fallback_pool[idx % len(fallback_pool)])

        calendar_plan = []
        for i, scheduled_at in enumerate(target_datetimes):
            item = planned_topics[i]
            day_name = WEEKDAYS_MAP[scheduled_at.weekday()]
            date_display = scheduled_at.strftime("%A, %b %d")

            # Assign platform cyclically among connected platforms
            assigned_platform = platforms[i % len(platforms)]
            fmt = item.get("suggested_format", "single_image")
            tpl = item.get("template_style", template_pool[i % len(template_pool)])

            calendar_plan.append({
                "day_index": i + 1,
                "weekday": day_name,
                "date_display": date_display,
                "date_str": scheduled_at.strftime("%Y-%m-%d"),
                "scheduled_at": scheduled_at,
                "platform": assigned_platform,
                "pillar": item.get("pillar", pillars[i % len(pillars)]),
                "topic": item.get("topic", f"Elevating {brand_profile.get('industry', 'Business')} Velocity #{i+1}"),
                "post_format": fmt,
                "template_style": tpl,
                "target_angle": item.get("target_angle", "Clear actionable value for audience"),
                "event_context": event_context
            })

        logger.info(f"[Autopilot Planner] Generated {len(calendar_plan)} posts for frequency '{frequency}'")
        return calendar_plan

    def _generate_fallback_topics(
        self,
        brand_profile: Dict[str, Any],
        pillars: List[str],
        templates: List[str],
        event_context: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        industry = brand_profile.get("industry", "Business")
        name = brand_profile.get("business_name", "Brandflux")

        event_lead = f"Special Feature: {event_context}" if event_context else f"The #1 Bottleneck Facing {industry} Today"

        return [
            {"day_number": 1, "topic": event_lead, "pillar": pillars[0], "suggested_format": "single_image", "template_style": "announcement" if event_context else "quote"},
            {"day_number": 2, "topic": f"3 Frameworks We Use at {name} to Scale Velocity", "pillar": pillars[1 % len(pillars)], "suggested_format": "single_image", "template_style": "process"},
            {"day_number": 3, "topic": f"What 100+ Hours of Industry Testing Taught Us", "pillar": pillars[0], "suggested_format": "single_image", "template_style": "stat"},
            {"day_number": 4, "topic": f"The Legacy Way vs The Modern High-Velocity Standard", "pillar": pillars[2 % len(pillars)], "suggested_format": "single_image", "template_style": "before_after"},
            {"day_number": 5, "topic": f"Actionable Checklist for Enterprise Excellence", "pillar": pillars[1 % len(pillars)], "suggested_format": "single_image", "template_style": "checklist"},
            {"day_number": 6, "topic": f"A Hard Truth Most Teams Overlook Until It Breaks", "pillar": pillars[0], "suggested_format": "single_image", "template_style": "quote"},
            {"day_number": 7, "topic": f"Strategic Blueprint: Compounding Growth for Tomorrow", "pillar": pillars[2 % len(pillars)], "suggested_format": "single_image", "template_style": "announcement"},
        ]


strategy_planner = StrategyPlanner()
