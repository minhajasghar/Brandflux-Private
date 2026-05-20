from google import genai
from typing import Dict, Any, List, Optional
import json
import logging
from config import GEMINI_API_KEY

logger = logging.getLogger(__name__)

# ─── Configure Gemini (new google-genai SDK) ───────────────
client = genai.Client(api_key=GEMINI_API_KEY) if GEMINI_API_KEY else None

MODEL_ID = "gemini-2.0-flash"


def _call_gemini(prompt: str) -> str:
    """Call Gemini and return the text response."""
    if not client:
        raise RuntimeError("GEMINI_API_KEY not configured. Add it to your .env file.")
    try:
        response = client.models.generate_content(
            model=MODEL_ID,
            contents=prompt,
        )
        return response.text
    except Exception as e:
        logger.error(f"Gemini API error: {str(e)}")
        raise


def _parse_json_response(text: str) -> Any:
    """Parse JSON from Gemini response, handling markdown code blocks."""
    text = text.strip()
    # Remove markdown code fences
    if text.startswith("```"):
        lines = text.split("\n")
        lines = [l for l in lines if not l.strip().startswith("```")]
        text = "\n".join(lines)
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        # Try to find JSON object or array in the response
        # Try object first
        obj_start = text.find("{")
        obj_end = text.rfind("}") + 1
        arr_start = text.find("[")
        arr_end = text.rfind("]") + 1

        # Pick whichever comes first
        if arr_start != -1 and (obj_start == -1 or arr_start < obj_start):
            if arr_end > arr_start:
                return json.loads(text[arr_start:arr_end])
        if obj_start != -1 and obj_end > obj_start:
            return json.loads(text[obj_start:obj_end])

        raise ValueError(f"Could not parse JSON from Gemini response: {text[:200]}")


# ═══════════════════════════════════════════════════════════
# 1. ANALYZE BRAND — From scraped website data
# ═══════════════════════════════════════════════════════════
def analyze_brand(scraped_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Analyze scraped website data and return a structured brand profile.
    """
    prompt = f"""You are a brand strategist AI. Analyze this scraped website data and create a comprehensive brand profile.

WEBSITE DATA:
- URL: {scraped_data.get('url', '')}
- Title: {scraped_data.get('title', '')}
- Tagline: {scraped_data.get('tagline', '')}
- Description: {scraped_data.get('description', '')}
- Headers: {json.dumps(scraped_data.get('headers', []))}
- Text Content: {scraped_data.get('text_content', '')[:1500]}
- Navigation Items: {json.dumps(scraped_data.get('nav_items', []))}
- Schema Data: {json.dumps(scraped_data.get('schema_data', {{}}))}
- Social Links: {json.dumps(scraped_data.get('social_links', {{}}))}
- Contact Info: {json.dumps(scraped_data.get('contact_info', {{}}))}

Return a JSON object with these fields:
{{
    "business_name": "extracted or inferred business name",
    "tagline": "tagline or slogan if found",
    "business_type": "e.g. ecommerce, saas, agency, restaurant, etc.",
    "industry": "specific industry category",
    "target_audience": "detailed description of who they serve",
    "products_services": ["list", "of", "products/services"],
    "brand_tone": "one of: professional, casual, playful, bold, elegant, friendly, authoritative",
    "brand_personality": "2-3 sentence description of the brand's personality",
    "brand_voice": "How the brand speaks — formal/informal, technical/simple, etc.",
    "content_themes": ["theme1", "theme2", "theme3", "theme4", "theme5"],
    "detected_products": ["specific", "products", "found"],
    "detected_services": ["specific", "services", "found"],
    "brand_keywords": ["keyword1", "keyword2", "keyword3"],
    "posting_strategy": {
        "content_mix": {"educational": 40, "promotional": 30, "engagement": 30},
        "best_platforms": ["instagram", "linkedin"]
    }
}}

Be specific and insightful. Infer what you can from the available data.
Return ONLY the JSON, no other text."""

    response = _call_gemini(prompt)
    return _parse_json_response(response)


# ═══════════════════════════════════════════════════════════
# 2. GENERATE SMART QUESTIONS — Daily contextual questions
# ═══════════════════════════════════════════════════════════
def generate_smart_questions(
    brand_profile: Dict[str, Any],
    previous_answers: Optional[List[Dict[str, str]]] = None
) -> List[Dict[str, Any]]:
    """
    Generate 3 smart, contextual questions based on the brand profile.
    Questions adapt based on previous answers.
    """
    prev_context = ""
    if previous_answers:
        prev_context = "\n\nPREVIOUS ANSWERS (don't repeat similar questions):\n"
        for ans in previous_answers[-10:]:
            prev_context += f"Q: {ans.get('question', '')}\nA: {ans.get('answer', '')}\n"

    prompt = f"""You are a smart brand content assistant. Based on this brand profile, generate 3 insightful questions 
that will help create better, more targeted social media content today.

BRAND PROFILE:
- Business: {brand_profile.get('business_name', '')}
- Type: {brand_profile.get('business_type', '')}
- Industry: {brand_profile.get('industry', '')}
- Audience: {brand_profile.get('target_audience', '')}
- Products/Services: {json.dumps(brand_profile.get('products_services', []))}
- Tone: {brand_profile.get('brand_tone', '')}
- Themes: {json.dumps(brand_profile.get('content_themes', []))}
{prev_context}

Each question should:
1. Be specific to THIS brand (not generic)
2. Help understand what content to create TODAY
3. Cover different aspects: one about goals/promotions, one about audience, one about content preferences

Return a JSON array:
[
    {{
        "question_text": "The question to ask",
        "question_context": "Brief note on why this question matters (shown to user)",
        "question_type": "one of: goals, audience, content_pref, product, campaign, trend",
        "options": ["Suggested option 1", "Suggested option 2", "Suggested option 3", "Other"]
    }},
    ...
]

Return ONLY the JSON array, no other text."""

    response = _call_gemini(prompt)
    return _parse_json_response(response)


# ═══════════════════════════════════════════════════════════
# 3. GENERATE CONTENT — Multi-platform content from answers
# ═══════════════════════════════════════════════════════════
def generate_content(
    brand_profile: Dict[str, Any],
    answers: List[Dict[str, str]],
    platform: str,
    topic: Optional[str] = None
) -> Dict[str, Any]:
    """
    Generate platform-specific content using brand profile + user answers.
    Platforms: instagram_post, instagram_story, linkedin, facebook
    """
    platform_guidelines = {
        "instagram_post": {
            "max_caption": 2200,
            "hashtag_count": "20-30",
            "style": "Visual-first, engaging, with line breaks. Use emojis strategically. Strong hook in first line.",
            "image_ratio": "1:1 (1080x1080)"
        },
        "instagram_story": {
            "max_caption": 200,
            "hashtag_count": "3-5",
            "style": "Short, punchy, conversational. Use polls/questions. Vertical format thinking.",
            "image_ratio": "9:16 (1080x1920)"
        },
        "linkedin": {
            "max_caption": 3000,
            "hashtag_count": "3-5",
            "style": "Professional, value-driven, thought leadership. Hook + story + insight + CTA format.",
            "image_ratio": "1.91:1 (1200x627)"
        },
        "facebook": {
            "max_caption": 500,
            "hashtag_count": "1-3",
            "style": "Community-focused, conversational, shareable. Questions and stories work well.",
            "image_ratio": "1.91:1 (1200x630)"
        }
    }

    guide = platform_guidelines.get(platform, platform_guidelines["instagram_post"])

    answers_text = "\n".join([
        f"Q: {a.get('question', '')}\nA: {a.get('answer', '')}"
        for a in answers
    ]) if answers else "No specific answers provided — generate based on brand profile alone."

    topic_text = f"\nSPECIFIC TOPIC: {topic}" if topic else ""

    prompt = f"""You are an expert social media content creator. Generate a {platform.replace('_', ' ')} post.

BRAND PROFILE:
- Business: {brand_profile.get('business_name', '')}
- Industry: {brand_profile.get('industry', '')}
- Audience: {brand_profile.get('target_audience', '')}
- Tone: {brand_profile.get('brand_tone', '')}
- Voice: {brand_profile.get('brand_voice', '')}
- Products/Services: {json.dumps(brand_profile.get('products_services', []))}
- Content Themes: {json.dumps(brand_profile.get('content_themes', []))}

USER'S TODAY INPUTS:
{answers_text}
{topic_text}

PLATFORM GUIDELINES:
- Platform: {platform.replace('_', ' ').title()}
- Max caption length: {guide['max_caption']} chars
- Hashtag count: {guide['hashtag_count']}
- Style: {guide['style']}
- Image ratio: {guide['image_ratio']}

Return a JSON object:
{{
    "caption": "The full post caption/text",
    "hashtags": ["#hashtag1", "#hashtag2", ...],
    "call_to_action": "Clear CTA text",
    "content_mix_type": "one of: educational, promotional, engagement, behind_the_scenes, testimonial, trending",
    "posting_time_suggestion": "e.g. Tuesday 10:00 AM EST",
    "image_prompt": "A description for generating a matching image"
}}

Make the content genuinely excellent — not generic. Match the brand's tone perfectly.
Return ONLY the JSON, no other text."""

    response = _call_gemini(prompt)
    return _parse_json_response(response)


# ═══════════════════════════════════════════════════════════
# 4. GENERATE GUIDANCE — Posting strategy & weekly tips
# ═══════════════════════════════════════════════════════════
def generate_guidance(
    brand_profile: Dict[str, Any],
    guidance_type: str = "weekly_tip"
) -> Dict[str, Any]:
    """
    Generate content guidance: posting schedule, content mix, weekly tips.
    """
    if guidance_type == "posting_schedule":
        prompt = f"""You are a social media strategist. Create an optimal weekly posting schedule for this brand.

BRAND: {brand_profile.get('business_name', '')}
INDUSTRY: {brand_profile.get('industry', '')}
AUDIENCE: {brand_profile.get('target_audience', '')}

Return a JSON object:
{{
    "title": "Your Optimal Posting Schedule",
    "content": "Detailed explanation of when and why to post",
    "metadata_json": {{
        "schedule": [
            {{"day": "Monday", "time": "10:00 AM", "platform": "instagram", "content_type": "educational"}},
            ...
        ],
        "best_times": {{"instagram": "10 AM, 7 PM", "linkedin": "8 AM, 12 PM", "facebook": "1 PM, 4 PM"}}
    }}
}}

Return ONLY the JSON."""

    elif guidance_type == "content_mix":
        prompt = f"""You are a content strategist. Create a content mix recommendation for this brand.

BRAND: {brand_profile.get('business_name', '')}
INDUSTRY: {brand_profile.get('industry', '')}
AUDIENCE: {brand_profile.get('target_audience', '')}

Return a JSON object:
{{
    "title": "Your Content Mix Strategy",
    "content": "Explanation of the ideal content mix and why",
    "metadata_json": {{
        "mix": {{
            "educational": 30,
            "promotional": 20,
            "engagement": 25,
            "behind_the_scenes": 15,
            "trending": 10
        }},
        "tips": ["tip1", "tip2", "tip3"]
    }}
}}

Return ONLY the JSON."""

    else:  # weekly_tip
        prompt = f"""You are a social media expert. Generate a valuable weekly content tip for this brand.

BRAND: {brand_profile.get('business_name', '')}
INDUSTRY: {brand_profile.get('industry', '')}
AUDIENCE: {brand_profile.get('target_audience', '')}
TONE: {brand_profile.get('brand_tone', '')}

The tip should be specific, actionable, and relevant to their industry.

Return a JSON object:
{{
    "title": "Catchy tip title",
    "content": "Detailed, actionable tip (2-3 paragraphs)",
    "metadata_json": {{
        "category": "engagement/growth/content/branding",
        "difficulty": "easy/medium/hard",
        "expected_impact": "Description of expected results"
    }}
}}

Return ONLY the JSON."""

    response = _call_gemini(prompt)
    return _parse_json_response(response)
