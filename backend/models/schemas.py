from pydantic import BaseModel, EmailStr
from typing import List, Optional, Dict, Any
from datetime import date, datetime

# ═══════════════════════════════════════════════════════════
# AUTH SCHEMAS
# ═══════════════════════════════════════════════════════════
class SignupRequest(BaseModel):
    email: str
    password: str
    full_name: Optional[str] = None
    website_url: str  # Required — this triggers the first scan

class LoginRequest(BaseModel):
    email: str
    password: str

class AuthResponse(BaseModel):
    token: str
    user_id: str
    email: str
    full_name: Optional[str] = None
    role: Optional[str] = "user"
    is_suspended: Optional[bool] = False
    onboarding_complete: Optional[bool] = False
    is_verified: Optional[bool] = False
    is_approved: Optional[bool] = False
    is_non_payment: Optional[bool] = False
    is_approver: Optional[bool] = False
    brand_role: Optional[str] = "creator"
    dev_mode: Optional[bool] = False
    verification_token: Optional[str] = None

# ═══════════════════════════════════════════════════════════
# BRAND SCHEMAS
# ═══════════════════════════════════════════════════════════
class ScanRequest(BaseModel):
    website_url: str

class BrandProfile(BaseModel):
    id: str
    business_name: str
    tagline: Optional[str] = None
    business_type: Optional[str] = None
    industry: Optional[str] = None
    target_audience: Optional[str] = None
    products_services: Optional[List[str]] = None
    brand_tone: Optional[str] = None
    brand_personality: Optional[str] = None
    brand_voice: Optional[str] = None
    content_themes: Optional[List[str]] = None
    logo_url: Optional[str] = None
    colors: Optional[List[str]] = None
    primary_color: Optional[str] = None
    secondary_color: Optional[str] = None
    primary_font: Optional[str] = None
    secondary_font: Optional[str] = None
    website_url: Optional[str] = None
    social_links: Optional[Dict[str, str]] = None
    
    # ── Scraped Data ───────────────────────────────────────
    detected_products: Optional[List[str]] = None
    detected_services: Optional[List[str]] = None
    posting_strategy: Optional[Dict[str, Any]] = None
    brand_keywords: Optional[List[str]] = None
    
    # ── Status ─────────────────────────────────────────────
    scan_status: Optional[str] = None
    last_synced_at: Optional[datetime] = None
    last_scanned_at: Optional[datetime] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class BrandSyncResponse(BaseModel):
    message: str
    scan_id: str
    brand_id: str

class BrandKitUpdate(BaseModel):
    name: Optional[str] = None
    business_name: Optional[str] = None
    tagline: Optional[str] = None
    website_url: Optional[str] = None
    business_type: Optional[str] = None
    industry: Optional[str] = None
    target_audience: Optional[str] = None
    brand_tone: Optional[str] = None
    brand_personality: Optional[str] = None
    brand_voice: Optional[str] = None
    colors: Optional[List[str]] = None
    primary_color: Optional[str] = None
    secondary_color: Optional[str] = None
    brand_keywords: Optional[List[str]] = None
    content_themes: Optional[List[str]] = None
    products_services: Optional[List[str]] = None
    logo_url: Optional[str] = None
    clean_logo_url: Optional[str] = None
    brand_kit: Optional[Dict[str, Any]] = None

class BrandKitResponse(BaseModel):
    id: str
    name: Optional[str] = None
    business_name: Optional[str] = None
    tagline: Optional[str] = None
    business_type: Optional[str] = None
    industry: Optional[str] = None
    target_audience: Optional[str] = None
    brand_tone: Optional[str] = None
    brand_personality: Optional[str] = None
    brand_voice: Optional[str] = None
    colors: Optional[List[str]] = []
    primary_color: Optional[str] = None
    secondary_color: Optional[str] = None
    brand_keywords: Optional[List[str]] = []
    content_themes: Optional[List[str]] = []
    products_services: Optional[List[str]] = []
    logo_url: Optional[str] = None
    clean_logo_url: Optional[str] = None
    website_url: Optional[str] = None
    brand_kit: Optional[Dict[str, Any]] = None
    is_active: Optional[bool] = False
    last_scanned_at: Optional[datetime] = None
    last_synced_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class BrandCreateRequest(BaseModel):
    name: Optional[str] = None
    website_url: str
    brand_kit: Optional[Dict[str, Any]] = None

class BrandSummaryItem(BaseModel):
    id: str
    name: Optional[str] = None
    business_name: Optional[str] = None
    website_url: Optional[str] = None
    logo_url: Optional[str] = None
    primary_color: Optional[str] = None
    secondary_color: Optional[str] = None
    colors: Optional[List[str]] = []
    brand_kit: Optional[Dict[str, Any]] = None
    is_active: bool = False
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class BrandListResponse(BaseModel):
    brands: List[BrandSummaryItem]
    active_brand_id: Optional[str] = None
    plan: str
    brand_limit: int
    total_brands: int
    can_add_brand: bool

class BrandWebsiteUpdateRequest(BaseModel):
    website_url: str
    rescan: Optional[bool] = False

class ScanLogResponse(BaseModel):
    id: str
    status: str
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    error_message: Optional[str] = None

    class Config:
        from_attributes = True

# ═══════════════════════════════════════════════════════════
# SMART QUESTION SCHEMAS
# ═══════════════════════════════════════════════════════════
class SmartQuestionResponse(BaseModel):
    id: str
    question_text: str
    question_context: Optional[str] = None
    question_type: Optional[str] = None
    options: Optional[List[str]] = None
    is_answered: bool

    class Config:
        from_attributes = True

class AnswerRequest(BaseModel):
    question_id: str
    answer_text: str

class AnswerBatchRequest(BaseModel):
    answers: List[AnswerRequest]

# ═══════════════════════════════════════════════════════════
# CONTENT SCHEMAS
# ═══════════════════════════════════════════════════════════
class ContentGenerateRequest(BaseModel):
    platforms: List[str] = ["instagram_post", "instagram_story", "linkedin", "facebook"]
    topic: Optional[str] = None  # Optional specific topic override

class GeneratedPostResponse(BaseModel):
    id: str
    platform: str
    caption: Optional[str] = None
    hashtags: Optional[List[str]] = None
    call_to_action: Optional[str] = None
    posting_time_suggestion: Optional[str] = None
    content_mix_type: Optional[str] = None
    status: str
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class ContentBatchResponse(BaseModel):
    idea_id: str
    idea_title: str
    posts: List[GeneratedPostResponse]

# ═══════════════════════════════════════════════════════════
# GUIDANCE SCHEMAS
# ═══════════════════════════════════════════════════════════
class GuidanceResponse(BaseModel):
    id: str
    guidance_type: str
    title: str
    content: str
    metadata_json: Optional[Dict[str, Any]] = None
    week_of: Optional[date] = None
    is_read: bool

    class Config:
        from_attributes = True

# ═══════════════════════════════════════════════════════════
# WEBSITE SCAN SCHEMAS
# ═══════════════════════════════════════════════════════════
class WebsiteScanResponse(BaseModel):
    id: str
    website_url: str
    detected_products: Optional[List[str]] = None
    detected_colors: Optional[List[str]] = None
    detected_logo_url: Optional[str] = None
    changes_detected: bool
    scan_status: str
    scanned_at: datetime

    class Config:
        from_attributes = True

# ═══════════════════════════════════════════════════════════
# DAILY SESSION SCHEMAS
# ═══════════════════════════════════════════════════════════
class ReferenceImageItem(BaseModel):
    url: str
    mode: str = "use_photo"  # "use_photo" | "style_inspiration"
    filename: Optional[str] = None

class SessionGenerationRequest(BaseModel):
    session_id: str
    answer_1: str
    answer_2: str
    answer_3: str
    context_text: Optional[str] = None
    reference_images: Optional[List[ReferenceImageItem]] = []
    variant_count: Optional[int] = None
    target_platform: Optional[str] = "instagram_post"
    selected_platforms: Optional[List[str]] = None
    target_platforms: Optional[List[str]] = None

class SelectVariantRequest(BaseModel):
    variant_id: str
    session_id: str
    adjusted_caption: Optional[str] = None
    adjusted_hashtags: Optional[List[str]] = None
    target_platform: Optional[str] = None
    platform_copies: Optional[Dict[str, Any]] = None
    selected_platforms: Optional[List[str]] = None

class RegenerateVariantRequest(BaseModel):
    session_id: str
    variant_id: Optional[str] = None
    style_direction: Optional[str] = None
    reference_context: Optional[str] = None
    target_platform: Optional[str] = "instagram_post"

class VariantResponseItem(BaseModel):
    id: str
    variant_index: int
    variant_label: str
    style_direction: str
    image_url: str
    headline: Optional[str] = None
    caption: Optional[str] = None
    hashtags: Optional[List[str]] = None
    call_to_action: Optional[str] = None
    is_selected: bool
    status: str = "ready"
    source: str = "ai"  # "ai" or "fallback"
    error: Optional[str] = None

class MultiVariantSessionResponse(BaseModel):
    session_id: str
    session_theme: str
    caption: str
    caption_source: str = "ai"  # "ai" or "fallback"
    hashtags: List[str]
    call_to_action: str
    posting_time_suggestion: Optional[str] = None
    variants: List[VariantResponseItem]
    credits_remaining: int
    plan: str
    max_variants_allowed: int
    guidance: Optional[Dict[str, Any]] = None
    generation_status: str = "success"  # "success" | "partial" | "failed"
    generation_error: Optional[str] = None
    platform_posts: Optional[Dict[str, Any]] = None

class DailySessionResponse(BaseModel):
    id: str
    question_1: Optional[str] = None
    answer_1: Optional[str] = None
    question_2: Optional[str] = None
    answer_2: Optional[str] = None
    question_3: Optional[str] = None
    answer_3: Optional[str] = None
    session_date: date
    created_at: datetime

    class Config:
        from_attributes = True


# ═══════════════════════════════════════════════════════════
# CAROUSEL & TEMPLATE SCHEMAS
# ═══════════════════════════════════════════════════════════
class CarouselGenerateRequest(BaseModel):
    topic: str
    slide_count: Optional[int] = 5
    aspect_ratio: Optional[str] = "1:1"  # "1:1" or "4:5"
    custom_cta: Optional[str] = None

class CarouselSlideResponse(BaseModel):
    slide_number: int
    role: str
    headline: str
    subtext: Optional[str] = None
    image_url: str
    filename: Optional[str] = None

class CarouselResponse(BaseModel):
    success: bool
    carousel_id: str
    topic: str
    slide_count: int
    aspect_ratio: str
    dimensions: Dict[str, int]
    slides: List[CarouselSlideResponse]
    ordered_image_urls: List[str]

class TemplateRenderRequest(BaseModel):
    template_name: str  # "quote", "stat", "checklist", "before_after", "announcement", "process"
    aspect_ratio: Optional[str] = "1:1"  # "1:1", "4:5", "9:16"
    headline: Optional[str] = None
    subtext: Optional[str] = None
    cta: Optional[str] = None
    category: Optional[str] = None
    extra_data: Optional[Dict[str, Any]] = None

class TemplateRenderResponse(BaseModel):
    success: bool
    template_name: str
    aspect_ratio: str
    image_url: str
    dimensions: Dict[str, int]


# ═══════════════════════════════════════════════════════════
# SCHEDULED POST SCHEMAS
# ═══════════════════════════════════════════════════════════
class ScheduledPostCreate(BaseModel):
    platform: str
    caption: Optional[str] = None
    media_url: Optional[str] = None
    scheduled_at: datetime
    status: Optional[str] = "Draft"
    post_id: Optional[str] = None
    platform_copy_id: Optional[str] = None

class ScheduledPostUpdate(BaseModel):
    platform: Optional[str] = None
    caption: Optional[str] = None
    media_url: Optional[str] = None
    scheduled_at: Optional[datetime] = None
    status: Optional[str] = None
    post_id: Optional[str] = None
    platform_copy_id: Optional[str] = None

class ScheduledPostResponse(BaseModel):
    id: str
    brand_id: str
    post_id: Optional[str] = None
    platform_copy_id: Optional[str] = None
    platform: str
    caption: Optional[str] = None
    media_url: Optional[str] = None
    scheduled_at: datetime
    status: str
    external_post_id: Optional[str] = None
    permalink: Optional[str] = None
    error: Optional[str] = None
    autopilot_run_id: Optional[str] = None
    critique_score: Optional[float] = None
    likes: Optional[int] = 0
    comments: Optional[int] = 0
    shares: Optional[int] = 0
    reach: Optional[int] = 0
    impressions: Optional[int] = 0
    engagement_rate: Optional[float] = 0.0
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True
