import os
import time
import traceback
import google.generativeai as genai
import json
import logging
from typing import Dict, Any, List, Optional
from config import GEMINI_API_KEY, GEMINI_MODEL

logger = logging.getLogger(__name__)

class GeminiService:
    def __init__(self, db=None):
        self.api_key = ""
        self.model_name = "models/gemini-2.5-flash"
        self.model = None
        self.last_error_message = None
        self.reload_credentials(db)

    def reload_credentials(self, db=None):
        """Load API key and model dynamically from DB, falling back to environment."""
        try:
            from services.admin_service import get_ai_credentials
            creds = get_ai_credentials(db)
            self.api_key = creds.get("gemini_api_key") or os.getenv("GEMINI_API_KEY", GEMINI_API_KEY or "")
            self.model_name = creds.get("gemini_model") or os.getenv("GEMINI_MODEL", GEMINI_MODEL or "models/gemini-2.5-flash")
        except Exception as e:
            logger.warning(f"Could not load AI credentials from DB: {e}")
            self.api_key = os.getenv("GEMINI_API_KEY", GEMINI_API_KEY or "")
            self.model_name = os.getenv("GEMINI_MODEL", GEMINI_MODEL or "models/gemini-2.5-flash")

        self.last_error_message = None
        if self.api_key:
            try:
                genai.configure(api_key=self.api_key)
                logger.info(f"Selected Gemini model: {self.model_name}")
                self.model = genai.GenerativeModel(
                    model_name=self.model_name,
                    system_instruction=(
                        "You are an expert social media strategist and brand consultant. "
                        "Always respond with valid JSON only. No markdown, no explanation, just pure JSON."
                    )
                )
            except Exception as e:
                logger.error(f"[Gemini Init Failed] {e}\n{traceback.format_exc()}")
                self.model = None
                self.last_error_message = str(e)
        else:
            logger.warning("[Gemini Init] No GEMINI_API_KEY provided")
            self.model = None

    def ensure_configured(self):
        """Lazy load or re-check credentials if not currently initialized or if key updated."""
        try:
            from services.admin_service import get_ai_credentials
            creds = get_ai_credentials()
            db_key = creds.get("gemini_api_key") or os.getenv("GEMINI_API_KEY", "")
            db_model = creds.get("gemini_model") or os.getenv("GEMINI_MODEL", "models/gemini-2.5-flash")
            if not self.model or self.api_key != db_key or self.model_name != db_model:
                self.reload_credentials()
        except Exception:
            if not self.model or not self.api_key:
                self.reload_credentials()
        return self.model is not None

    def decide_content_strategy(
        self, brand_profile: Dict[str, Any], 
        special_message: str, 
        is_special_day: bool, 
        last_posts_history: List[Dict[str, Any]],
        learning_context: Optional[str] = None
    ) -> Dict[str, Any]:
        """Decide today's content strategy based on brand profile, history, and learning context."""
        self.ensure_configured()
        if not self.model:
            return {}

        if is_special_day:
            # Skip strategy decision, go straight to special message highlight
            return {
                "decided_focus": "Special Highlight",
                "decided_theme": special_message,
                "priority_platform": "all",
                "reasoning": "Direct special event highlight as requested by the user.",
                "content_angle": special_message
            }

        learning_section = f"\n{learning_context}\n" if learning_context else ""

        prompt = f"""You are a social media strategist.
Based on this SAVED BRAND KIT, decide the best content strategy for today.

SAVED BRAND KIT:
- Business: {brand_profile.get('business_name')}
- Tagline: {brand_profile.get('tagline') or 'N/A'}
- Industry: {brand_profile.get('industry') or brand_profile.get('business_type')}
- Target Audience: {brand_profile.get('target_audience') or 'General customers and prospects'}
- Tone: {brand_profile.get('brand_tone')}
- Voice & Personality: {brand_profile.get('brand_voice') or brand_profile.get('brand_personality') or 'Professional, distinct'}
- Brand Keywords: {json.dumps(brand_profile.get('brand_keywords') or [])}
- Content Pillars / Themes: {json.dumps(brand_profile.get('content_themes') or [])}
- Products & Services: {json.dumps(brand_profile.get('products_services') or brand_profile.get('detected_products') or [])}
Recent content history: {json.dumps(last_posts_history)}
(avoid repeating recent content types and themes)
{learning_section}
Decide:
1. What type of content to create today based on what's missing from recent history (e.g., educational, promotional, testimonial, behind-the-scenes)
2. What angle/theme works best today
3. Which platform to prioritize

Return valid JSON strictly matching this structure:
{{
  "decided_focus": "what to post today",
  "decided_theme": "specific angle/theme",
  "priority_platform": "instagram|linkedin|facebook",
  "reasoning": "why this content today",
  "content_angle": "specific creative direction"
}}"""

        try:
            response = self.model.generate_content(
                prompt,
                generation_config={"response_mime_type": "application/json"}
            )
            return self.safe_parse_json(response.text)
        except Exception as e:
            logger.error(f"Gemini decide strategy error: {str(e)}")
            # Safe operational fallback strategy
            return {
                "decided_focus": "Educational Insight",
                "decided_theme": "Tips and helpful tutorials related to products",
                "priority_platform": "instagram",
                "reasoning": "Fallback default strategy due to API timeout.",
                "content_angle": f"Give one crucial value-adding tip related to {brand_profile.get('business_name')}"
            }

    def generate_multi_platform_content(
        self, brand_profile: Dict[str, Any], 
        session_answers: Dict[str, str], 
        website_data: str,
        last_posts_history: List[Dict[str, Any]],
        decided_strategy: Dict[str, Any],
        learning_context: Optional[str] = None
    ) -> Dict[str, Any]:
        """Generate complete content for all platforms based on brand, session, strategy, and learning context."""
        self.ensure_configured()
        if not self.model:
            return {}

        learning_section = f"\n{learning_context}\n" if learning_context else ""

        prompt = f"""Create high-converting social media content for multiple platforms based on this SAVED BRAND KIT, check-in answers, and decided content strategy.
Strictly adhere to the brand kit's tone, voice, target audience, and core content pillars.

SAVED BRAND KIT:
- Business: {brand_profile.get('business_name')}
- Tagline: {brand_profile.get('tagline') or 'N/A'}
- Industry / Type: {brand_profile.get('industry') or brand_profile.get('business_type')}
- Target Audience: {brand_profile.get('target_audience') or 'Target audience & community'}
- Brand Tone: {brand_profile.get('brand_tone')}
- Brand Voice & Personality: {brand_profile.get('brand_voice') or brand_profile.get('brand_personality') or 'Professional, distinct'}
- Voice Keywords: {', '.join(brand_profile.get('brand_keywords') or [])}
- Content Pillars / Themes: {json.dumps(brand_profile.get('content_themes') or [])}
- Products & Services: {json.dumps(brand_profile.get('products_services') or brand_profile.get('detected_products') or [])}

Content Strategy Decided:
- Focus: {decided_strategy.get('decided_focus')}
- Theme: {decided_strategy.get('decided_theme')}  
- Angle: {decided_strategy.get('content_angle')}
- Reasoning: {decided_strategy.get('reasoning')}
- Priority Platform: {decided_strategy.get('priority_platform')}

IMPORTANT: Do NOT repeat these recent content types and themes: {json.dumps(last_posts_history)}
Create something fresh, distinct, and creative!
{learning_section}
Today's Session Answers:
- Q1: {session_answers.get('answer_1')}
- Q2: {session_answers.get('answer_2')}  
- Q3: {session_answers.get('answer_3')}

Generate JSON strictly matching this structure:
{{
  "session_theme": "Theme of the post",
  "instagram_post": {{ "caption": "...", "hashtags": [], "best_time": "...", "best_day": "...", "call_to_action": "..." }},
  "instagram_story": {{ "text": "...", "cta": "...", "poll_question": "..." }},
  "linkedin_post": {{ "caption": "...", "hashtags": [], "best_day": "...", "best_time": "...", "call_to_action": "..." }},
  "facebook_post": {{ "caption": "...", "hashtags": [], "best_day": "...", "best_time": "...", "call_to_action": "..." }},
  "twitter_post": {{ "caption": "...", "hashtags": [], "best_day": "...", "best_time": "...", "call_to_action": "..." }},
  "tiktok": {{ "caption": "...", "hashtags": [], "best_day": "...", "best_time": "...", "call_to_action": "..." }},
  "guidance": {{ "tip_of_day": "...", "this_week_suggestion": "...", "best_performing_type": "..." }}
}}"""

        try:
            t0 = time.time()
            response = self.model.generate_content(
                prompt,
                generation_config={"response_mime_type": "application/json"}
            )
            result = self.safe_parse_json(response.text)
            ensured = self._ensure_all_platforms(result)
            if ensured:
                ensured["_source"] = "ai"
            elapsed = time.time() - t0
            logger.info(f"✓ [Gemini Text Generated] Generated multi-platform copy in {elapsed:.2f}s")
            return ensured
        except Exception as e:
            err_str = str(e)
            if "401" in err_str or "UNAUTHENTICATED" in err_str or "API key not valid" in err_str:
                self.last_error_message = "Google Gemini API key invalid or unauthenticated (HTTP 401). Please check GEMINI_API_KEY in backend/.env."
            elif "429" in err_str or "RESOURCE_EXHAUSTED" in err_str or "quota" in err_str.lower():
                self.last_error_message = "Google Gemini quota limit exceeded (HTTP 429). Please wait a moment or check your AI Studio quota."
            else:
                self.last_error_message = f"Gemini text generation failed: {err_str[:120]}"
            logger.error(f"❌ [Gemini Text Generation Error] {e}\n{traceback.format_exc()}")
            return {"_source": "fallback", "_error": self.last_error_message}

    def _ensure_all_platforms(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Guarantee all 4 platform keys exist; synthesize fallbacks from instagram_post."""
        if not data:
            return data

        ig_post = data.get("instagram_post") or {}
        base_caption = ig_post.get("caption", "")
        base_hashtags = ig_post.get("hashtags", [])

        # --- instagram_story fallback ---
        if not data.get("instagram_story"):
            data["instagram_story"] = {
                "text": base_caption[:120] if base_caption else "Stay tuned for more!",
                "cta": ig_post.get("call_to_action", "DM us for more!"),
                "poll_question": "Would you like to know more?"
            }

        # --- linkedin_post fallback ---
        if not data.get("linkedin_post"):
            linkedin_caption = (
                f"Excited to share an update with our professional network!\n\n{base_caption}"
                if base_caption else "Sharing insights from our brand journey."
            )
            data["linkedin_post"] = {
                "caption": linkedin_caption,
                "hashtags": [h for h in base_hashtags if h][:5],
                "best_day": "Tuesday",
                "best_time": "9:00 AM"
            }

        # --- facebook_post fallback ---
        if not data.get("facebook_post"):
            facebook_caption = (
                f"Hey friends! 👋\n\n{base_caption}"
                if base_caption else "We have something exciting to share with our community!"
            )
            data["facebook_post"] = {
                "caption": facebook_caption,
                "hashtags": [h for h in base_hashtags if h][:3],
                "best_day": "Today",
                "best_time": "1:00 PM",
                "call_to_action": "Let us know your thoughts in the comments!"
            }

        # --- twitter_post fallback ---
        if not data.get("twitter_post"):
            twitter_caption = base_caption[:240] if base_caption else "Fresh updates from our team. Stay tuned!"
            data["twitter_post"] = {
                "caption": twitter_caption,
                "hashtags": [h for h in base_hashtags if h][:2],
                "best_day": "Today",
                "best_time": "12:00 PM",
                "call_to_action": "RT & share if you agree!"
            }

        # --- tiktok fallback ---
        if not data.get("tiktok"):
            first_line = (base_caption.split('\n')[0] if base_caption else "Fresh brand perspectives").strip()
            tiktok_caption = f"{first_line} 👀 Drop your thoughts below! 👇"
            data["tiktok"] = {
                "caption": tiktok_caption,
                "hashtags": ["#fyp", "#trending", "#viral", "#growth"] + [h for h in base_hashtags if h][:2],
                "best_day": "Today",
                "best_time": "8:00 PM",
                "call_to_action": "Follow for daily tips!"
            }

        # --- instagram_post fallback (shouldn't happen but guard anyway) ---
        if not data.get("instagram_post"):
            data["instagram_post"] = {
                "caption": base_caption or "Exciting content coming your way! Stay tuned.",
                "hashtags": base_hashtags,
                "best_time": "7:00 PM",
                "best_day": "Wednesday",
                "call_to_action": "Follow for more!"
            }

        return data

    def generate_image_prompt(
        self, brand_profile: Dict[str, Any], content_theme: str,
        platform: str, special_message: str
    ) -> Dict[str, Any]:
        """
        Create an image generation prompt for a social media post using Gemini.
        """
        if not self.model:
            return {}

        colors = brand_profile.get("colors") or []
        primary_color = colors[0] if colors else (brand_profile.get("primary_color") or "slate-900")

        prompt = f"""You are an expert at writing image generation prompts.

Create an image generation prompt for a social media post.

Brand Details:
- Business: {brand_profile.get('business_name', 'My Brand')}
- Type: {brand_profile.get('business_type', 'Startup')}  
- Colors: {colors}
- Style: {brand_profile.get('logo_style', 'modern')}
- Tone: {brand_profile.get('brand_tone', 'professional')}

Post Details:
- Theme: {content_theme}
- Platform: {platform}
- Special context: {special_message}

Rules for the prompt:
1. NO text, typography, or words in the image (text will be added separately by graphic overlay)
2. Brand colors & dynamic contrast: Harmoniously incorporate brand colors ({primary_color}) as luminous lighting accents, subtle ambient glows, or key focal elements, while maintaining high contrast with deep rich shadows or clean modern tech environments (e.g. sleek futuristic glass, modern architectural tech, isometric 3D concepts, cinematic studio lighting). Do NOT make the image flat or monochromatic.
3. Match brand tone:
   Fun → vibrant, colorful, dynamic energy
   Professional → sleek, high-tech, minimal, authoritative
   Inspiring → dramatic cinematic lighting, deep shadows, bold focal points
   Friendly → warm, accessible, natural depth
4. Platform specific framing:
   Instagram → bold, visually captivating, high-contrast aesthetic
   LinkedIn → sophisticated industry innovation, cutting-edge technology, modern leadership
   Facebook → engaging, relatable, premium clarity
   Story → immersive full-frame vertical atmosphere (9:16)

Return JSON strictly matching this structure:
{{
  "main_prompt": "detailed image prompt, max 100 words, very descriptive",
  "style": "digital art|photography|illustration|minimalist",
  "mood": "energetic|calm|professional|warm|inspiring",
  "avoid": "things to avoid in image"
}}"""

        try:
            response = self.model.generate_content(
                prompt,
                generation_config={"response_mime_type": "application/json"}
            )
            return self.safe_parse_json(response.text)
        except Exception as e:
            logger.error(f"Gemini image prompt generation failed: {str(e)}")
            # Safe default fallback
            return {
                "main_prompt": f"A clean aesthetic backdrop representing {content_theme} with professional branding visual cues, minimalist style.",
                "style": "digital art",
                "mood": "professional",
                "avoid": "text, bad proportions, watermark"
            }

    def generate_post_text_overlay(
        self, caption: str, platform: str
    ) -> Dict[str, Any]:
        """
        Extract the most important SHORT text to show ON the image (not full caption).
        """
        if not self.model:
            return {}

        prompt = f"""From this caption, extract the most impactful 5-10 words to show as text overlay on a social media image.

Caption: {caption}
Platform: {platform}

Return JSON strictly matching this structure:
{{
  "headline": "max 6 words, powerful",
  "subtext": "max 8 words, supporting",
  "cta": "max 4 words, action oriented"
}}"""

        try:
            response = self.model.generate_content(
                prompt,
                generation_config={"response_mime_type": "application/json"}
            )
            return self.safe_parse_json(response.text)
        except Exception as e:
            logger.error(f"Gemini text overlay extraction failed: {str(e)}")
            # Safe default fallback
            return {
                "headline": "Grow Your Business",
                "subtext": "Smart strategies for everyday success",
                "cta": "Learn More"
            }

    def generate_carousel_content(
        self,
        topic: str,
        brand_profile: Dict[str, Any],
        slide_count: int = 5,
        custom_cta: Optional[str] = None,
        learning_context: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """
        Generate structured carousel slides (Hook, Points, CTA) given a topic and brand profile.
        Produces exactly slide_count slides: 1 hook slide, (slide_count - 2) point slides, 1 CTA slide.
        """
        slide_count = max(3, min(7, slide_count))
        num_points = slide_count - 2

        if not self.model:
            # Fallback structured slides
            return self._build_fallback_carousel(topic, brand_profile, slide_count, custom_cta)

        learning_section = f"\n{learning_context}\n" if learning_context else ""

        prompt = f"""You are a master social media content strategist specializing in viral, high-retention carousels for Instagram and LinkedIn.

Brand Profile:
- Name: {brand_profile.get('business_name', 'Brandflux')}
- Tagline: {brand_profile.get('tagline', '')}
- Industry: {brand_profile.get('industry', 'Business & Technology')}
- Target Audience: {brand_profile.get('target_audience', 'Founders, Creators, & Marketers')}
- Tone: {brand_profile.get('brand_tone', 'Confident, Authoritative, Actionable')}

Topic: "{topic}"
Requested Total Slides: {slide_count} (1 Hook slide, {num_points} Points slides, 1 CTA slide).
Custom CTA Preference: {custom_cta or 'Save this post for later'}
{learning_section}
Generate an ordered array of exactly {slide_count} slides in valid JSON:
[
  {{
    "role": "hook",
    "topic_tag": "SHORT 2-WORD TAG",
    "headline": "Catchy curiosity-gap hook title (max 8 words)",
    "subtext": "Why this matters in 1 sentence. Builds anticipation."
  }},
  // Exactly {num_points} point slides:
  {{
    "role": "point",
    "point_index": 1,
    "headline": "Bold Point Title (max 6 words)",
    "subtext": "Clear actionable explanation (1-2 sentences).",
    "takeaway": "Key rule or insight in 1 punchy sentence."
  }},
  {{
    "role": "cta",
    "headline": "High-Impact Summary or Question (max 6 words)",
    "subtext": "Call to action prompt inviting followers to save, comment, or visit.",
    "cta_text": "{custom_cta or 'Save For Later'}"
  }}
]
"""

        try:
            response = self.model.generate_content(
                prompt,
                generation_config={"response_mime_type": "application/json"}
            )
            data = self.safe_parse_json(response.text)
            if isinstance(data, list) and len(data) >= 3:
                return data[:slide_count]
            elif isinstance(data, dict) and "slides" in data and isinstance(data["slides"], list):
                return data["slides"][:slide_count]
        except Exception as e:
            logger.error(f"Gemini carousel generation failed: {e}")

        return self._build_fallback_carousel(topic, brand_profile, slide_count, custom_cta)

    def _build_fallback_carousel(
        self,
        topic: str,
        brand_profile: Dict[str, Any],
        slide_count: int,
        custom_cta: Optional[str]
    ) -> List[Dict[str, Any]]:
        """Safe fallback carousel outline if LLM is unavailable."""
        brand_name = brand_profile.get("business_name", "Brandflux")
        num_points = slide_count - 2
        
        slides = [
            {
                "role": "hook",
                "topic_tag": "GROWTH GUIDE",
                "headline": f"How to Master {topic}",
                "subtext": "A step-by-step framework to elevate your brand presence."
            }
        ]

        generic_points = [
            ("Define Clear Foundations", "Audit your current approach and remove low-impact friction.", "Simplicity scales faster than complexity."),
            ("Automate Repetitive Workflows", "Use modern tools to schedule, publish, and analyze consistently.", "Consistency creates compounding momentum."),
            ("Double Down on What Works", "Identify top 20% high-performing formats and replicate their angle.", "Data informs creative decisions."),
            ("Build Systems, Not Just Tasks", "Create reusable templates to reduce cognitive load daily.", "Systems deliver freedom."),
            ("Engage and Iterate", "Respond to feedback in real time and refine the message.", "Audience connection breeds loyalty.")
        ]

        for i in range(num_points):
            title, desc, takeaway = generic_points[i % len(generic_points)]
            slides.append({
                "role": "point",
                "point_index": i + 1,
                "headline": title,
                "subtext": desc,
                "takeaway": takeaway
            })

        slides.append({
            "role": "cta",
            "headline": f"Ready to Scale with {brand_name}?",
            "subtext": "Found this helpful? Save this carousel to your bookmarks and share it with your network.",
            "cta_text": custom_cta or "Save Post"
        })

        return slides

    def safe_parse_json(self, response_text: str) -> Any:
        try:
            text = response_text.strip()
            if text.startswith("```"):
                text = text.split("```")[1]
                if text.startswith("json"):
                    text = text[4:]
            return json.loads(text)
        except Exception as e:
            logger.error(f"JSON parsing failed: {str(e)}")
            return {}
