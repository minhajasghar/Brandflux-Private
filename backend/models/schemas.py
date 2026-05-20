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
    onboarding_complete: Optional[bool] = False

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
class SessionGenerationRequest(BaseModel):
    session_id: str
    answer_1: str
    answer_2: str
    answer_3: str

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
