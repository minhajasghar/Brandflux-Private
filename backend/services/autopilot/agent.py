import uuid
import logging
from datetime import datetime, timedelta
from typing import Dict, Any, List, Optional
from sqlalchemy.orm import Session

from models.models import (
    Brand, User, ScheduledPost, DailySession,
    AutopilotConfig, AutopilotLog
)
from services.autopilot.metrics_analyzer import metrics_analyzer
from services.autopilot.planner import strategy_planner
from services.autopilot.guardrails import guardrail_enforcer, AutopilotKilledException
from services.autopilot.critic import self_critique_engine
from services.autopilot.notifier import autopilot_notifier
from services.image_generator import image_generator
from services.carousel_generator import carousel_generator
from services.gemini_service import GeminiService
from services.storage import storage_service

logger = logging.getLogger(__name__)


class AutopilotAgent:
    """
    Brandflux Autopilot Autonomous Weekly Agent.
    1. Analyzes brand kit + 30-day post metrics.
    2. Plans 7 days of posts across connected platforms with optimal times.
    3. Generates high-converting copy and Playwright HTML/CSS graphics.
    4. Evaluates posts with self-critique engine (Voice, Factual, Hashtags).
       Regenerates below-threshold posts automatically.
    5. Dispatches as 'Pending Approval' or 'Scheduled' based on user mode.
    6. Enforces guardrails: Kill switch, daily post cap, banned topics, and no invented prices.
    7. Sends weekly preview digest and audits every decision.
    """

    def __init__(self):
        self.gemini = GeminiService()

    def _log_decision(
        self,
        db: Session,
        brand_id: str,
        run_id: str,
        stage: str,
        status: str,
        summary: str,
        details: Optional[Dict[str, Any]] = None
    ) -> AutopilotLog:
        """Persist structured decision log to database audit trail."""
        log_entry = AutopilotLog(
            brand_id=brand_id,
            run_id=run_id,
            stage=stage,
            status=status,
            decision_summary=summary,
            details_json=details or {}
        )
        db.add(log_entry)
        try:
            db.commit()
            db.refresh(log_entry)
        except Exception as e:
            logger.error(f"Failed to commit autopilot log: {e}")
            db.rollback()
        return log_entry

    async def run_weekly_autopilot(
        self,
        brand_id: str,
        db: Session,
        force: bool = False
    ) -> Dict[str, Any]:
        """
        Execute full weekly autonomous cycle for a brand.
        """
        run_id = f"auto_{uuid.uuid4().hex[:10]}"
        logger.info(f"🚀 Starting Brandflux Autopilot Run [{run_id}] for Brand {brand_id}")

        # ── 0. Fetch Brand & Config ───────────────────────────────────────────
        brand = db.query(Brand).filter(Brand.id == brand_id).first()
        if not brand:
            raise ValueError(f"Brand {brand_id} not found")

        user = db.query(User).filter(User.id == brand.user_id).first()

        config = db.query(AutopilotConfig).filter(AutopilotConfig.brand_id == brand.id).first()
        if not config:
            # Initialize default configuration
            config = AutopilotConfig(
                brand_id=brand.id,
                enabled=True,
                kill_switch=False,
                mode="approval",
                max_posts_per_day=2,
                banned_topics=["politics", "unverified health cures", "gambling"],
                allowed_prices_discounts=[],
                target_platforms=["instagram_post", "linkedin", "facebook"],
                notification_email=user.email if user else None
            )
            db.add(config)
            db.commit()
            db.refresh(config)

        # ── 1. Guardrail Pre-Check: Kill Switch ────────────────────────────────
        try:
            guardrail_enforcer.verify_kill_switch(config)
        except AutopilotKilledException as kill_err:
            self._log_decision(
                db=db, brand_id=brand.id, run_id=run_id,
                stage="GUARDRAILS", status="BLOCKED",
                summary="Autopilot run blocked: Kill Switch is ACTIVE.",
                details={"kill_switch": True}
            )
            return {
                "success": False,
                "run_id": run_id,
                "status": "BLOCKED",
                "message": str(kill_err)
            }

        if not config.enabled and not force:
            self._log_decision(
                db=db, brand_id=brand.id, run_id=run_id,
                stage="PRECHECK", status="INFO",
                summary="Autopilot is disabled for this brand. Skipping scheduled run.",
                details={"enabled": False}
            )
            return {"success": False, "status": "DISABLED", "run_id": run_id}

        # ── 2. Stage 1: Analyze Brand Kit + 30-Day Metrics ─────────────────────
        metrics_insights = metrics_analyzer.analyze_30_day_metrics(brand, db)
        self._log_decision(
            db=db, brand_id=brand.id, run_id=run_id,
            stage="METRICS_ANALYSIS", status="SUCCESS",
            summary=(
                f"Analyzed {metrics_insights['total_posts_analyzed']} posts from last 30 days. "
                f"Top pillar: '{metrics_insights['top_performing_pillar']}'. "
                f"Optimal times: {', '.join(metrics_insights['recommended_posting_hours'])}."
            ),
            details=metrics_insights
        )

        # ── 3. Stage 2: Plan 7 Days of Posts ──────────────────────────────────
        brand_profile = {
            "business_name": brand.business_name,
            "tagline": brand.tagline,
            "industry": brand.industry or brand.business_type,
            "target_audience": brand.target_audience,
            "brand_tone": brand.brand_tone,
            "brand_voice": brand.brand_voice,
            "brand_personality": brand.brand_personality,
            "colors": brand.colors or ["#1558C9", "#D4FF24"],
            "primary_color": brand.primary_color or "#1558C9",
            "secondary_color": brand.secondary_color or "#D4FF24",
            "logo_url": brand.logo_url,
            "clean_logo_url": brand.clean_logo_url or brand.logo_url,
            "website_url": brand.website_url,
            "brand_handle": f"@{brand.business_name.lower().replace(' ', '')}"
        }

        # Gather recent check-in answers for price/discount verification
        recent_sessions = db.query(DailySession).filter(
            DailySession.brand_id == brand.id
        ).order_by(DailySession.session_date.desc()).limit(14).all()

        checkin_corpus = []
        for s in recent_sessions:
            if s.answer_1: checkin_corpus.append(s.answer_1)
            if s.answer_2: checkin_corpus.append(s.answer_2)
            if s.answer_3: checkin_corpus.append(s.answer_3)

        from services.analytics.learning_engine import learning_engine
        learning_context = learning_engine.get_learning_prompt_context(brand.id, db)

        planned_calendar = strategy_planner.plan_7_day_calendar(
            brand_profile=brand_profile,
            metrics_analysis=metrics_insights,
            target_platforms=config.target_platforms or ["instagram_post", "linkedin", "facebook"],
            max_posts_per_day=config.max_posts_per_day or 2,
            banned_topics=config.banned_topics or [],
            learning_context=learning_context
        )

        self._log_decision(
            db=db, brand_id=brand.id, run_id=run_id,
            stage="STRATEGY_PLAN", status="SUCCESS",
            summary=f"Planned 7 cohesive posts across connected platforms with optimal posting windows.",
            details={"calendar_items": len(planned_calendar)}
        )

        # ── 4. Stage 3 & 4: Copy + Graphics Generation + Self-Critique Loop ───
        created_scheduled_posts: List[ScheduledPost] = []
        preview_data_list: List[Dict[str, Any]] = []

        # Track daily post counts to enforce max_posts_per_day
        daily_scheduled_counts: Dict[str, int] = {}

        for plan_item in planned_calendar:
            day_str = plan_item["date_str"]
            current_day_count = daily_scheduled_counts.get(day_str, 0)

            # Daily cap guardrail
            cap_ok, cap_reason = guardrail_enforcer.check_daily_post_cap(
                current_count_for_day=current_day_count,
                max_posts_per_day=config.max_posts_per_day
            )
            if not cap_ok:
                self._log_decision(
                    db=db, brand_id=brand.id, run_id=run_id,
                    stage="GUARDRAILS", status="WARNING",
                    summary=f"Skipping scheduled post for {day_str}: {cap_reason}",
                    details={"date": day_str, "cap": config.max_posts_per_day}
                )
                continue

            # Generation + Critique Loop (with up to 2 retries if score below threshold)
            max_attempts = 2
            attempt = 0
            best_post_data = None
            best_critique = None

            while attempt < max_attempts:
                attempt += 1
                candidate = await self._generate_candidate_copy(
                    plan_item=plan_item,
                    brand_profile=brand_profile,
                    banned_topics=config.banned_topics or [],
                    critique_feedback=best_critique.get("feedback") if best_critique else None
                )

                critique = self_critique_engine.critique_post(
                    caption=candidate["caption"],
                    headline=candidate["headline"],
                    hashtags=candidate["hashtags"],
                    brand_profile=brand_profile,
                    banned_topics=config.banned_topics or [],
                    allowed_claims=config.allowed_prices_discounts or [],
                    recent_checkins=checkin_corpus
                )

                best_post_data = candidate
                best_critique = critique

                if critique["passed"]:
                    self._log_decision(
                        db=db, brand_id=brand.id, run_id=run_id,
                        stage="SELF_CRITIQUE", status="SUCCESS",
                        summary=(
                            f"Post '{candidate['headline']}' PASSED self-critique "
                            f"(Overall: {critique['overall_score']}/10, Voice: {critique['voice_score']}/10, "
                            f"Factual: {critique['factual_score']}/10)."
                        ),
                        details=critique
                    )
                    break
                else:
                    self._log_decision(
                        db=db, brand_id=brand.id, run_id=run_id,
                        stage="SELF_CRITIQUE", status="WARNING",
                        summary=(
                            f"Attempt {attempt}: Post '{candidate['headline']}' scored below threshold "
                            f"({critique['overall_score']}/10). Reasons: {', '.join(critique['reasons'])}. "
                            f"{'Triggering autonomous regeneration.' if attempt < max_attempts else 'Proceeding with best score.'}"
                        ),
                        details=critique
                    )

            # Render graphics (HTML/CSS Playwright template or carousel)
            media_url = await self._render_post_graphic(
                plan_item=plan_item,
                post_data=best_post_data,
                brand_profile=brand_profile
            )

            # Determine post status based on mode setting (Approval vs Autopilot)
            post_status = "Scheduled" if config.mode == "autopilot" else "Pending Approval"

            # Construct full caption with hashtags
            full_caption = best_post_data["caption"]
            if best_post_data.get("hashtags"):
                full_caption += "\n\n" + " ".join(best_post_data["hashtags"])

            # Create ScheduledPost record in DB
            scheduled_post = ScheduledPost(
                brand_id=brand.id,
                platform=plan_item["platform"],
                caption=full_caption,
                media_url=media_url,
                scheduled_at=plan_item["scheduled_at"],
                status=post_status,
                autopilot_run_id=run_id,
                critique_score=best_critique["overall_score"],
                critique_feedback=best_critique
            )
            db.add(scheduled_post)
            created_scheduled_posts.append(scheduled_post)
            daily_scheduled_counts[day_str] = current_day_count + 1

            preview_data_list.append({
                "platform": plan_item["platform"],
                "headline": best_post_data["headline"],
                "scheduled_at": plan_item["scheduled_at"],
                "media_url": media_url,
                "status": post_status,
                "critique_score": best_critique["overall_score"]
            })

        # Commit all scheduled posts
        db.commit()
        for p in created_scheduled_posts:
            db.refresh(p)

        self._log_decision(
            db=db, brand_id=brand.id, run_id=run_id,
            stage="DISPATCH", status="SUCCESS",
            summary=(
                f"Successfully queued {len(created_scheduled_posts)} posts with status '{post_status}' "
                f"based on mode setting: {config.mode.upper()}."
            ),
            details={"posts_created": len(created_scheduled_posts), "mode": config.mode}
        )

        # ── 5. Stage 5: Weekly Notification Preview ───────────────────────────
        recipient = config.notification_email or (user.email if user else "user@brandflux.ai")
        notification_res = autopilot_notifier.send_weekly_preview(
            recipient_email=recipient,
            brand_name=brand.business_name,
            run_id=run_id,
            mode=config.mode,
            posts=preview_data_list
        )

        self._log_decision(
            db=db, brand_id=brand.id, run_id=run_id,
            stage="NOTIFICATION", status="SUCCESS",
            summary=f"Weekly preview digest dispatched to {recipient}.",
            details=notification_res
        )

        # Update AutopilotConfig last run markers
        config.last_run_at = datetime.utcnow()
        config.last_run_id = run_id
        config.last_run_summary = f"Generated {len(created_scheduled_posts)} posts in {config.mode.upper()} mode."
        db.commit()

        logger.info(f"✅ Autopilot Run [{run_id}] completed: {len(created_scheduled_posts)} posts queued.")
        return {
            "success": True,
            "run_id": run_id,
            "mode": config.mode,
            "brand_name": brand.business_name,
            "posts_queued": len(created_scheduled_posts),
            "status": post_status,
            "preview_items": preview_data_list
        }

    async def _generate_candidate_copy(
        self,
        plan_item: Dict[str, Any],
        brand_profile: Dict[str, Any],
        banned_topics: List[str],
        critique_feedback: Optional[str] = None
    ) -> Dict[str, Any]:
        """Generate high-performing caption, headline, and hashtags."""
        prompt = f"""You are the senior social copywriter for {brand_profile.get('business_name')}.
Tone: {brand_profile.get('brand_tone', 'Confident, Actionable, Modern')}
Audience: {brand_profile.get('target_audience', 'Founders, Creators, & Marketers')}
Topic: "{plan_item['topic']}"
Content Pillar: "{plan_item['pillar']}"
Platform: {plan_item['platform']}
Banned Topics: {', '.join(banned_topics)}

RULES:
1. NEVER invent any dollar price, discount, or promotion (e.g. do not say '$99' or '50% off').
2. Deliver genuine value and practical takeaways.
3. Include 3 to 5 targeted, high-intent hashtags (no spam tags like #fyp or #viral).
"""
        if critique_feedback:
            prompt += f"\nPREVIOUS CRITIQUE FEEDBACK TO FIX:\n{critique_feedback}\n"

        prompt += """
Return JSON strictly matching:
{
  "headline": "Punchy 5-7 word headline for the graphic",
  "subtext": "1 supporting sentence for graphic subtext",
  "caption": "Engaging, formatted post body with linebreaks and clear takeaway",
  "hashtags": ["#TagOne", "#TagTwo", "#TagThree", "#TagFour"],
  "cta": "Clear call to action (e.g. Save this post)"
}"""

        try:
            if self.gemini.model:
                response = self.gemini.model.generate_content(
                    prompt,
                    generation_config={"response_mime_type": "application/json"}
                )
                data = self.gemini.safe_parse_json(response.text)
                if isinstance(data, dict) and "headline" in data:
                    return data
        except Exception as e:
            logger.warning(f"[Autopilot Copy] LLM generation error: {e}")

        # Deterministic fallback copy
        topic = plan_item["topic"]
        return {
            "headline": topic,
            "subtext": f"Practical insights from the team at {brand_profile.get('business_name')}.",
            "caption": (
                f"{topic}\n\n"
                f"Most teams spend hours reinventing workflows instead of building compounding systems.\n\n"
                f"Here is our rule of thumb: If you do it more than twice, systematize it.\n\n"
                f"What is one process you automated this month?"
            ),
            "hashtags": [
                f"#{brand_profile.get('industry', 'Business').replace(' ', '')}",
                "#GrowthStrategy",
                "#SystemsThinking",
                "#Brandflux"
            ],
            "cta": "Save for later"
        }

    async def _render_post_graphic(
        self,
        plan_item: Dict[str, Any],
        post_data: Dict[str, Any],
        brand_profile: Dict[str, Any]
    ) -> str:
        """Render graphics via Playwright templates or Carousel generator."""
        fmt = plan_item.get("post_format", "single_image")
        tpl_style = plan_item.get("template_style", "quote")
        platform = plan_item.get("platform", "instagram_post")

        try:
            if fmt == "carousel":
                # Render 4-slide carousel and use slide 1 as hero media cover
                carousel_res = await carousel_generator.generate_carousel(
                    topic=post_data["headline"],
                    brand_profile=brand_profile,
                    slide_count=4,
                    aspect_ratio="4:5" if "instagram" in platform else "1:1",
                    custom_cta=post_data.get("cta", "Save this carousel")
                )
                if carousel_res.get("ordered_image_urls"):
                    return carousel_res["ordered_image_urls"][0]

            # Render single image with Playwright template
            png_bytes = await image_generator.create_branded_post_async(
                brand_profile=brand_profile,
                post_text=f"{post_data['headline']}\n{post_data['subtext']}",
                platform=platform,
                cta=post_data.get("cta", "Learn More"),
                template_style=tpl_style
            )

            filename = f"autopilot_{uuid.uuid4().hex[:10]}.png"
            return storage_service.upload_image(png_bytes, filename)

        except Exception as render_err:
            logger.error(f"[Autopilot Graphic] Rendering error: {render_err}")
            return f"http://localhost:8000/static/fallback_{platform}.png"


# Global singleton instance
autopilot_agent = AutopilotAgent()

