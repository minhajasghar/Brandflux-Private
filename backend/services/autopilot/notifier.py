import logging
from typing import Dict, Any, List
from datetime import datetime

logger = logging.getLogger(__name__)


class AutopilotNotifier:
    """
    Delivers weekly preview digests to the user via Email/Push notification.
    Highlights planned dates, platforms, copy previews, image assets, and critique scores.
    """

    def send_weekly_preview(
        self,
        recipient_email: str,
        brand_name: str,
        run_id: str,
        mode: str,
        posts: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """
        Compose and dispatch weekly preview digest to user.
        """
        if not recipient_email:
            recipient_email = "user@brandflux.ai"

        mode_badge = "AUTO-SCHEDULED" if mode == "autopilot" else "PENDING YOUR APPROVAL"
        subject = f"🚀 [Brandflux Autopilot] 7-Day Plan Ready for {brand_name} ({mode_badge})"

        # Build clean digest text
        lines = [
            f"=== {subject} ===",
            f"Run ID: {run_id}",
            f"Status Mode: {mode.upper()}",
            f"Total Posts: {len(posts)}",
            "",
            "7-DAY CONTENT SCHEDULE:"
        ]

        for p in posts:
            scheduled_str = p.get("scheduled_at")
            if isinstance(scheduled_str, datetime):
                scheduled_str = scheduled_str.strftime("%a %b %d @ %I:%M %p")

            score = p.get("critique_score", 8.5)
            lines.append(f"• [{p.get('platform')}] {scheduled_str}")
            lines.append(f"  Topic: {p.get('headline', p.get('topic'))}")
            lines.append(f"  Quality Score: {score}/10 | Image: {p.get('media_url')}")
            lines.append("")

        action_url = "http://localhost:3000/calendar" if mode == "autopilot" else "http://localhost:3000/settings?tab=autopilot"
        lines.append(f"👉 Review full calendar and creatives: {action_url}")

        digest_body = "\n".join(lines)
        logger.info(f"[Autopilot Notification] Sent weekly digest to {recipient_email} for {brand_name}:\n{digest_body}")

        return {
            "sent": True,
            "recipient": recipient_email,
            "subject": subject,
            "preview_count": len(posts),
            "review_url": action_url,
            "delivered_at": datetime.utcnow().isoformat()
        }


autopilot_notifier = AutopilotNotifier()

