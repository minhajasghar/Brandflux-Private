import google.generativeai as genai
import json
import logging
from typing import Dict, Any, List, Optional
from config import GEMINI_API_KEY

logger = logging.getLogger(__name__)

class GeminiService:
    def __init__(self):
        self.api_key = GEMINI_API_KEY
        self.model_name = "models/gemini-2.5-flash"  # Default known stable model
        if self.api_key:
            try:
                genai.configure(api_key=self.api_key)
                
                # Auto-detect available models
                try:
                    available_models = [m.name for m in genai.list_models() if 'generateContent' in m.supported_generation_methods]
                    logger.info(f"Available Gemini models: {available_models}")
                    
                    priorities = [
                        "models/gemini-2.5-flash",
                        "models/gemini-2.0-flash",
                        "models/gemini-flash-latest",
                        "models/gemini-pro-latest",
                        "models/gemini-1.5-flash",
                        "models/gemini-1.5-pro",
                        "models/gemini-pro"
                    ]
                    for p in priorities:
                        if p in available_models:
                            self.model_name = p
                            break
                    else:
                        if available_models:
                            self.model_name = available_models[0]
                except Exception as list_err:
                    logger.warning(f"Failed to auto-detect Gemini models, falling back to priority list: {str(list_err)}")
                
                logger.info(f"Selected Gemini model: {self.model_name}")
                self.model = genai.GenerativeModel(
                    model_name=self.model_name,
                    system_instruction=(
                        "You are an expert social media strategist and brand consultant. "
                        "Always respond with valid JSON only. No markdown, no explanation, just pure JSON."
                    )
                )
            except Exception as e:
                logger.error(f"Gemini initialization failed: {str(e)}")
                self.model = None
        else:
            self.model = None

    def decide_content_strategy(
        self, brand_profile: Dict[str, Any], 
        special_message: str, 
        is_special_day: bool, 
        last_posts_history: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """Decide today's content strategy based on brand profile and history."""
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

        prompt = f"""You are a social media strategist.
Based on this brand profile, decide the best content strategy for today.

Brand: {brand_profile.get('business_name')} ({brand_profile.get('business_type')})
Tone: {brand_profile.get('brand_tone')}
Products: {brand_profile.get('detected_products')}
Recent content history: {json.dumps(last_posts_history)}
(avoid repeating recent content types and themes)

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
        decided_strategy: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Generate complete content for all platforms based on brand, session, and decided strategy."""
        if not self.model:
            return {}

        prompt = f"""Create high-converting social media content for multiple platforms based on this brand profile, check-in answers, and decided content strategy.

Brand Profile:
- Business: {brand_profile.get('business_name')}
- Type: {brand_profile.get('business_type')}
- Tone: {brand_profile.get('brand_tone')}
- Products/Services: {brand_profile.get('detected_products')}

Content Strategy Decided:
- Focus: {decided_strategy.get('decided_focus')}
- Theme: {decided_strategy.get('decided_theme')}  
- Angle: {decided_strategy.get('content_angle')}
- Reasoning: {decided_strategy.get('reasoning')}
- Priority Platform: {decided_strategy.get('priority_platform')}

IMPORTANT: Do NOT repeat these recent content types and themes: {json.dumps(last_posts_history)}
Create something fresh, distinct, and creative!

Today's Session Answers:
- Q1: {session_answers.get('answer_1')}
- Q2: {session_answers.get('answer_2')}  
- Q3: {session_answers.get('answer_3')}

Website Data Snippet: {(website_data or "")[:2000]}

Generate JSON strictly matching this structure:
{{
  "session_theme": "Theme of the post",
  "instagram_post": {{ "caption": "...", "hashtags": [], "best_time": "...", "best_day": "...", "call_to_action": "..." }},
  "instagram_story": {{ "text": "...", "cta": "...", "poll_question": "..." }},
  "linkedin_post": {{ "caption": "...", "hashtags": [], "best_day": "...", "best_time": "..." }},
  "facebook_post": {{ "caption": "...", "hashtags": [] }},
  "guidance": {{ "tip_of_day": "...", "this_week_suggestion": "...", "best_performing_type": "..." }}
}}"""

        try:
            response = self.model.generate_content(
                prompt,
                generation_config={"response_mime_type": "application/json"}
            )
            result = self.safe_parse_json(response.text)
            return self._ensure_all_platforms(result)
        except Exception as e:
            logger.error(f"Gemini generation error: {str(e)}")
            return {}

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
                "hashtags": [h for h in base_hashtags if h][:3]
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
1. NO text or words in the image (text will be added separately)
2. Match the brand colors: {primary_color}
3. Match brand tone:
   Fun → bright, colorful, energetic
   Professional → clean, minimal, corporate
   Inspiring → dramatic lighting, powerful
   Friendly → warm, soft, approachable
4. Platform specific:
   Instagram → visually stunning, lifestyle feel
   LinkedIn → professional setting, office/business context
   Facebook → relatable, everyday feel
   Story → full frame, immersive

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
