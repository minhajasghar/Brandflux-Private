from sqlalchemy import Column, String, Integer, Boolean, Text, ForeignKey, Date, DateTime, JSON, Float
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship, backref
from database import Base
import uuid

def generate_uuid():
    return str(uuid.uuid4())

# ═══════════════════════════════════════════════════════════
# USER
# ═══════════════════════════════════════════════════════════
class User(Base):
    __tablename__ = "users"
    
    id = Column(String(36), primary_key=True, default=generate_uuid)
    email = Column(String(255), unique=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    full_name = Column(String(255))
    plan = Column(String(50), default="free")
    posts_used_this_month = Column(Integer, default=0)
    active_brand_id = Column(String(36), nullable=True)
    role = Column(String(50), default="user", nullable=False)  # "user" or "admin"
    is_suspended = Column(Boolean, default=False, nullable=False)
    is_deleted = Column(Boolean, default=False, nullable=False)
    deleted_at = Column(DateTime, nullable=True)
    token_version = Column(Integer, default=1, nullable=False)
    last_active_at = Column(DateTime, nullable=True)
    is_verified = Column(Boolean, default=False, nullable=False)
    verification_token = Column(String(255), nullable=True, index=True)
    verification_token_expires_at = Column(DateTime, nullable=True)
    welcome_sent = Column(Boolean, default=False, nullable=False)
    pending_email = Column(String(255), nullable=True)
    email_change_token = Column(String(255), nullable=True, index=True)
    email_change_expires_at = Column(DateTime, nullable=True)
    notification_preferences = Column(JSON, nullable=True)
    
    # Trial & Quota Limits
    trial_started_at = Column(DateTime, nullable=True)
    trial_ends_at = Column(DateTime, nullable=True)
    trial_credits_allocated = Column(Integer, default=15, nullable=False)
    rerolls_used_this_month = Column(Integer, default=0, nullable=False)
    x_posts_used_this_month = Column(Integer, default=0, nullable=False)
    upgrade_requested_plan = Column(String(50), nullable=True)
    upgrade_requested_at = Column(DateTime, nullable=True)
    registration_ip = Column(String(45), nullable=True)
    trial_day10_email_sent = Column(Boolean, default=False, nullable=False)
    trial_day13_email_sent = Column(Boolean, default=False, nullable=False)
    trial_expired_email_sent = Column(Boolean, default=False, nullable=False)
    
    created_at = Column(DateTime, default=func.now())

    # Relationships
    brands = relationship("Brand", back_populates="user", cascade="all, delete-orphan")
    answers = relationship("UserAnswer", back_populates="user", cascade="all, delete-orphan")
    social_accounts = relationship("SocialAccount", back_populates="user", cascade="all, delete-orphan")
    usages = relationship("Usage", back_populates="user", cascade="all, delete-orphan")
    posts = relationship("Post", back_populates="user", cascade="all, delete-orphan")
    notifications = relationship("Notification", back_populates="user", cascade="all, delete-orphan")

# ═══════════════════════════════════════════════════════════
# BRAND — Auto-populated from website scraping + AI analysis
# ═══════════════════════════════════════════════════════════
class Brand(Base):
    __tablename__ = "brands"
    
    id = Column(String(36), primary_key=True, default=generate_uuid)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"))
    
    # ── Core Info ──────────────────────────────────────────
    name = Column(String(255), nullable=True)  # Brand display name
    business_name = Column(String(255), nullable=True)
    tagline = Column(String(512))
    business_type = Column(String(255))
    industry = Column(String(255))
    target_audience = Column(Text)
    products_services = Column(JSON)  # ["product1", "product2", ...]
    brand_kit = Column(JSON, nullable=True)  # Structured Brand Kit JSON
    is_active = Column(Boolean, default=False)
    
    # ── Brand Identity ─────────────────────────────────────
    brand_tone = Column(String(100))
    brand_personality = Column(Text)
    brand_voice = Column(Text)
    content_themes = Column(JSON)  # ["theme1", "theme2", ...]
    
    # ── Visual Identity ────────────────────────────────────
    logo_url = Column(Text)
    clean_logo_url = Column(Text)
    colors = Column(JSON)  # ["#hex1", "#hex2", ...]
    primary_color = Column(String(7))
    secondary_color = Column(String(7))
    logo_style = Column(String(100))
    primary_font = Column(String(100))
    secondary_font = Column(String(100))
    
    # ── Social & Web ───────────────────────────────────────
    website_url = Column(Text)  # URL from signup
    social_links = Column(JSON)  # {"instagram": "...", "linkedin": "...", ...}
    
    # ── Scraped Data ───────────────────────────────────────
    detected_products = Column(JSON)   # products found from website
    detected_services = Column(JSON)   # services found from website
    posting_strategy = Column(JSON)    # content mix plan
    brand_keywords = Column(JSON)      # key words for brand
    
    # ── Status ─────────────────────────────────────────────
    scan_status = Column(String(50), default="pending")  # pending, scanning, completed, failed
    onboarding_complete = Column(Boolean, default=False)
    last_synced_at = Column(DateTime)
    last_scanned_at = Column(DateTime)  # last website scan time
    created_at = Column(DateTime, default=func.now())

    # ── Approval Workflow Settings ─────────────────────────
    require_approval = Column(Boolean, default=False, nullable=False)
    approval_mode = Column(String(20), default="anyone", nullable=False)  # "anyone" | "all"
    approval_autopilot_routing = Column(String(20), default="approvers", nullable=False)  # "approvers" | "creator"
    approval_deadline_hours = Column(Integer, default=24, nullable=False)
    approval_reminder_hours = Column(Integer, default=6, nullable=False)

    # Relationships
    user = relationship("User", back_populates="brands")
    scan_logs = relationship("BrandScanLog", back_populates="brand", cascade="all, delete-orphan")
    content_ideas = relationship("ContentIdea", back_populates="brand", cascade="all, delete-orphan")
    website_scans = relationship("WebsiteScan", back_populates="brand", cascade="all, delete-orphan")
    daily_sessions = relationship("DailySession", back_populates="brand", cascade="all, delete-orphan")
    scheduled_posts = relationship("ScheduledPost", back_populates="brand", cascade="all, delete-orphan")
    generated_posts = relationship("GeneratedPost", back_populates="brand", cascade="all, delete-orphan")
    social_accounts = relationship("SocialAccount", back_populates="brand", cascade="all, delete-orphan")
    autopilot_config = relationship("AutopilotConfig", back_populates="brand", uselist=False, cascade="all, delete-orphan")
    autopilot_logs = relationship("AutopilotLog", back_populates="brand", cascade="all, delete-orphan")
    post_metrics = relationship("PostMetric", back_populates="brand", cascade="all, delete-orphan")
    usages = relationship("Usage", back_populates="brand", cascade="all, delete-orphan")
    posts = relationship("Post", back_populates="brand", cascade="all, delete-orphan")

# ═══════════════════════════════════════════════════════════
# BRAND SCAN LOG — History of every website scan
# ═══════════════════════════════════════════════════════════
class BrandScanLog(Base):
    __tablename__ = "brand_scan_logs"
    
    id = Column(String(36), primary_key=True, default=generate_uuid)
    brand_id = Column(String(36), ForeignKey("brands.id", ondelete="CASCADE"))
    
    status = Column(String(50), default="started")  # started, completed, failed
    scraped_data = Column(JSON)  # Raw scraped data snapshot
    ai_analysis = Column(JSON)   # AI-generated brand analysis
    error_message = Column(Text)
    
    started_at = Column(DateTime, default=func.now())
    completed_at = Column(DateTime)

    # Relationships
    brand = relationship("Brand", back_populates="scan_logs")

# ═══════════════════════════════════════════════════════════
# SMART QUESTIONS — Daily AI-generated questions
# ═══════════════════════════════════════════════════════════
class SmartQuestion(Base):
    __tablename__ = "smart_questions"
    
    id = Column(String(36), primary_key=True, default=generate_uuid)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"))
    brand_id = Column(String(36), ForeignKey("brands.id", ondelete="CASCADE"))
    
    question_text = Column(Text, nullable=False)
    question_context = Column(Text)  # Why this question matters
    question_type = Column(String(100))  # audience, goals, content_pref, product, campaign
    options = Column(JSON)  # Optional suggested answers ["option1", "option2"]
    
    date_for = Column(Date, nullable=False)  # The date these questions are for
    is_answered = Column(Boolean, default=False)
    created_at = Column(DateTime, default=func.now())

    # Relationships
    answers = relationship("UserAnswer", back_populates="question", cascade="all, delete-orphan")

# ═══════════════════════════════════════════════════════════
# USER ANSWERS — Responses to smart questions
# ═══════════════════════════════════════════════════════════
class UserAnswer(Base):
    __tablename__ = "user_answers"
    
    id = Column(String(36), primary_key=True, default=generate_uuid)
    question_id = Column(String(36), ForeignKey("smart_questions.id", ondelete="CASCADE"))
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"))
    
    answer_text = Column(Text, nullable=False)
    created_at = Column(DateTime, default=func.now())

    # Relationships
    question = relationship("SmartQuestion", back_populates="answers")
    user = relationship("User", back_populates="answers")

# ═══════════════════════════════════════════════════════════
# CONTENT IDEA — Generated content suggestions
# ═══════════════════════════════════════════════════════════
class ContentIdea(Base):
    __tablename__ = "content_ideas"
    
    id = Column(String(36), primary_key=True, default=generate_uuid)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"))
    brand_id = Column(String(36), ForeignKey("brands.id", ondelete="CASCADE"))
    
    idea_title = Column(String(255), nullable=False)
    idea_description = Column(Text, nullable=False)
    content_type = Column(String(100), nullable=False)  # educational, promotional, engagement, behind_the_scenes
    template_type = Column(String(100), nullable=False)
    best_day = Column(String(50))
    week_of = Column(Date)
    status = Column(String(50), default="pending")  # pending, generating, generated, posted
    is_custom = Column(Boolean, default=False)
    created_at = Column(DateTime, default=func.now())

    # Relationships
    brand = relationship("Brand", back_populates="content_ideas")
    generated_posts = relationship("GeneratedPost", back_populates="idea", cascade="all, delete-orphan")

# ═══════════════════════════════════════════════════════════
# GENERATED POST — Multi-platform content output
# ═══════════════════════════════════════════════════════════
class GeneratedPost(Base):
    __tablename__ = "generated_posts"
    
    id = Column(String(36), primary_key=True, default=generate_uuid)
    brand_id = Column(String(36), ForeignKey("brands.id", ondelete="CASCADE"), nullable=True)
    idea_id = Column(String(36), ForeignKey("content_ideas.id", ondelete="CASCADE"))
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"))
    
    # ── Platform ───────────────────────────────────────────
    platform = Column(String(50), nullable=False)  # instagram_post, instagram_story, linkedin, facebook
    
    # ── Content ────────────────────────────────────────────
    caption = Column(Text)
    hashtags = Column(JSON)  # ["#tag1", "#tag2", ...]
    call_to_action = Column(Text)
    
    # ── Images ─────────────────────────────────────────────
    post_image_url = Column(Text)
    story_image_url = Column(Text)
    banner_image_url = Column(Text)
    
    # ── Guidance ───────────────────────────────────────────
    posting_time_suggestion = Column(String(100))  # "Tuesday 10:00 AM"
    content_mix_type = Column(String(100))  # educational, promotional, engagement
    
    # ── Status ─────────────────────────────────────────────
    scheduled_date = Column(Date)
    status = Column(String(50), default="draft")  # draft, scheduled, posted
    created_at = Column(DateTime, default=func.now())

    # Relationships
    idea = relationship("ContentIdea", back_populates="generated_posts")
    brand = relationship("Brand", back_populates="generated_posts")

# ═══════════════════════════════════════════════════════════
# POST — Multi-Platform Parent Generation
# ═══════════════════════════════════════════════════════════
class Post(Base):
    __tablename__ = "posts"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    brand_id = Column(String(36), ForeignKey("brands.id", ondelete="CASCADE"), nullable=True)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=True)
    title = Column(String(255), nullable=False)
    topic = Column(String(255), nullable=True)
    source = Column(String(50), default="manual")  # manual | autopilot
    credits_used = Column(Integer, default=1, nullable=False)
    session_id = Column(String(36), nullable=True)
    status = Column(String(50), default="draft", nullable=False)  # draft | in_review | approved | changes_requested | rejected | published
    approved_version_hash = Column(String(64), nullable=True)
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())

    # Relationships
    brand = relationship("Brand", back_populates="posts")
    user = relationship("User", back_populates="posts")
    images = relationship("PostImage", back_populates="post", cascade="all, delete-orphan", order_by="PostImage.created_at.asc()")
    platform_copies = relationship("PlatformCopy", back_populates="post", cascade="all, delete-orphan", order_by="PlatformCopy.created_at.asc()")
    scheduled_posts = relationship("ScheduledPost", back_populates="parent_post")

# ═══════════════════════════════════════════════════════════
# POST IMAGE — AI Visual Variant for a Generation
# ═══════════════════════════════════════════════════════════
class PostImage(Base):
    __tablename__ = "post_images"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    post_id = Column(String(36), ForeignKey("posts.id", ondelete="CASCADE"), nullable=False)
    image_url = Column(Text, nullable=False)
    is_selected = Column(Boolean, default=False)
    expires_at = Column(DateTime, nullable=True, default=None)  # Never auto-deleted; saved permanently
    created_at = Column(DateTime, default=func.now())

    # Relationships
    post = relationship("Post", back_populates="images")

# ═══════════════════════════════════════════════════════════
# PLATFORM COPY — Channel-specific Child Copy of a Generation
# ═══════════════════════════════════════════════════════════
class PlatformCopy(Base):
    __tablename__ = "platform_copies"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    post_id = Column(String(36), ForeignKey("posts.id", ondelete="CASCADE"), nullable=False)
    platform = Column(String(50), nullable=False)  # instagram, linkedin, facebook, twitter, tiktok
    account_id = Column(String(255), nullable=True)  # which page/profile ID
    caption = Column(Text, nullable=True)
    hashtags = Column(JSON, nullable=True)
    image_url = Column(Text, nullable=True)
    selected_image_id = Column(String(36), nullable=True)
    aspect_ratio = Column(String(20), default="1:1")
    status = Column(String(50), default="not_posted")  # not_posted, scheduled, publishing, posted, failed, needs_reconnect, pending_approval
    scheduled_at = Column(DateTime, nullable=True)
    posted_at = Column(DateTime, nullable=True)
    external_post_id = Column(String(255), nullable=True)
    permalink = Column(Text, nullable=True)
    error = Column(Text, nullable=True)
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())

    # Relationships
    post = relationship("Post", back_populates="platform_copies")
    scheduled_posts = relationship("ScheduledPost", back_populates="platform_copy")

# ═══════════════════════════════════════════════════════════
# CONTENT GUIDANCE — Weekly tips & posting strategy
# ═══════════════════════════════════════════════════════════
class ContentGuidance(Base):
    __tablename__ = "content_guidance"
    
    id = Column(String(36), primary_key=True, default=generate_uuid)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"))
    brand_id = Column(String(36), ForeignKey("brands.id", ondelete="CASCADE"))
    
    guidance_type = Column(String(100), nullable=False)  # posting_schedule, content_mix, weekly_tip, trend_alert
    title = Column(String(255), nullable=False)
    content = Column(Text, nullable=False)
    metadata_json = Column(JSON)  # Extra structured data (times, percentages, etc.)
    
    week_of = Column(Date)
    is_read = Column(Boolean, default=False)
    created_at = Column(DateTime, default=func.now())

# ═══════════════════════════════════════════════════════════
# WEBSITE SCAN — Stores each website scrape result
# ═══════════════════════════════════════════════════════════
class WebsiteScan(Base):
    __tablename__ = "website_scans"
    
    id = Column(String(36), primary_key=True, default=generate_uuid)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"))
    brand_id = Column(String(36), ForeignKey("brands.id", ondelete="CASCADE"))
    
    website_url = Column(Text)              # the URL scanned
    raw_text = Column(Text)                 # scraped text content
    detected_products = Column(JSON)        # products/services found
    detected_colors = Column(JSON)          # colors from website
    detected_logo_url = Column(Text)        # logo found on site
    changes_detected = Column(Boolean, default=False)
    scan_status = Column(String(50), default="pending")  # pending, complete, failed
    scanned_at = Column(DateTime, default=func.now())

    # Relationships
    brand = relationship("Brand", back_populates="website_scans")

# ═══════════════════════════════════════════════════════════
# DAILY SESSION — User's daily answers to 3 smart questions
# ═══════════════════════════════════════════════════════════
class DailySession(Base):
    __tablename__ = "daily_sessions"
    
    id = Column(String(36), primary_key=True, default=generate_uuid)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"))
    brand_id = Column(String(36), ForeignKey("brands.id", ondelete="CASCADE"))
    
    question_1 = Column(Text)   # what focus today
    answer_1 = Column(Text)     # user's answer
    question_2 = Column(Text)   # which platform
    answer_2 = Column(Text)     # user's answer
    question_3 = Column(Text)   # any special message
    answer_3 = Column(Text)     # user's answer
    
    session_date = Column(Date, default=func.current_date())
    created_at = Column(DateTime, default=func.now())

    # Relationships
    brand = relationship("Brand", back_populates="daily_sessions")

# ═══════════════════════════════════════════════════════════
# SAVED TEMPLATE — User's saved captions for future reuse
# ═══════════════════════════════════════════════════════════
class SavedTemplate(Base):
    __tablename__ = "saved_templates"
    
    id = Column(String(36), primary_key=True, default=generate_uuid)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"))
    content_id = Column(String(36), nullable=False)
    platform = Column(String(50), nullable=False)
    custom_name = Column(String(255), nullable=False)
    caption = Column(Text, nullable=False)
    hashtags = Column(JSON)
    created_at = Column(DateTime, default=func.now())

# ═══════════════════════════════════════════════════════════
# SCHEDULED POST — Calendar scheduling & status tracking
# ═══════════════════════════════════════════════════════════
class ScheduledPost(Base):
    __tablename__ = "scheduled_posts"
    
    id = Column(String(36), primary_key=True, default=generate_uuid)
    brand_id = Column(String(36), ForeignKey("brands.id", ondelete="CASCADE"), nullable=False)
    post_id = Column(String(36), ForeignKey("posts.id", ondelete="SET NULL"), nullable=True)
    platform_copy_id = Column(String(36), ForeignKey("platform_copies.id", ondelete="SET NULL"), nullable=True)
    
    platform = Column(String(50), nullable=False)  # instagram, linkedin, facebook, twitter, tiktok
    caption = Column(Text, nullable=True)
    media_url = Column(Text, nullable=True)
    variant_image_url = Column(Text, nullable=True)  # Alternate image variant for fast swapping
    topic = Column(Text, nullable=True)
    headline = Column(Text, nullable=True)
    platform_copies = Column(JSON, nullable=True)  # Dict of per-platform captions & hashtags
    edit_prompt = Column(Text, nullable=True)
    scheduled_at = Column(DateTime, nullable=False)
    status = Column(String(50), default="Draft")  # Draft, Pending Approval, In Review, Approved, Changes Requested, Rejected, Scheduled, Publishing, Published, Failed, Skipped
    approved_version_hash = Column(String(64), nullable=True)
    external_post_id = Column(String(255), nullable=True)
    permalink = Column(Text, nullable=True)
    error = Column(Text, nullable=True)
    autopilot_run_id = Column(String(36), nullable=True)
    critique_score = Column(Float, nullable=True)
    critique_feedback = Column(JSON, nullable=True)

    # ── Performance Metrics ────────────────────────────────
    likes = Column(Integer, default=0)
    comments = Column(Integer, default=0)
    shares = Column(Integer, default=0)
    reach = Column(Integer, default=0)
    impressions = Column(Integer, default=0)
    engagement_rate = Column(Float, default=0.0)
    metrics_updated_at = Column(DateTime, nullable=True)
    
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())

    # Relationships
    brand = relationship("Brand", back_populates="scheduled_posts")
    metrics = relationship("PostMetric", back_populates="post", cascade="all, delete-orphan")
    parent_post = relationship("Post", back_populates="scheduled_posts")
    platform_copy = relationship("PlatformCopy", back_populates="scheduled_posts")

# ═══════════════════════════════════════════════════════════
# SOCIAL ACCOUNT — OAuth connections & encrypted credentials
# ═══════════════════════════════════════════════════════════
class SocialAccount(Base):
    __tablename__ = "social_accounts"
    
    id = Column(String(36), primary_key=True, default=generate_uuid)
    brand_id = Column(String(36), ForeignKey("brands.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    
    platform = Column(String(50), nullable=False)  # meta, instagram, facebook, linkedin
    account_id = Column(String(255), nullable=False)  # Page ID, IG ID, or Person URN
    account_name = Column(String(255), nullable=False)  # @handle or Page Name
    
    # Fernet encrypted credentials
    access_token_encrypted = Column(Text, nullable=False)
    refresh_token_encrypted = Column(Text, nullable=True)
    token_expires_at = Column(DateTime, nullable=True)
    
    is_active = Column(Boolean, default=True)
    scopes = Column(JSON, nullable=True)
    metadata_json = Column(JSON, nullable=True)  # profile pic, category, etc.
    
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())

    # Relationships
    brand = relationship("Brand", back_populates="social_accounts")
    user = relationship("User", back_populates="social_accounts")


# ═══════════════════════════════════════════════════════════
# AUTOPILOT CONFIG — Per-brand autonomous scheduler & settings
# ═══════════════════════════════════════════════════════════
class AutopilotConfig(Base):
    __tablename__ = "autopilot_configs"
    
    id = Column(String(36), primary_key=True, default=generate_uuid)
    brand_id = Column(String(36), ForeignKey("brands.id", ondelete="CASCADE"), unique=True, nullable=False)
    
    enabled = Column(Boolean, default=True)
    kill_switch = Column(Boolean, default=False)  # Master emergency stop
    mode = Column(String(50), default="weekly_plan")  # "weekly_plan" (Plan my whole week) or "ask_before_each" (Ask me before each post)
    frequency = Column(String(50), default="daily")  # "daily", "every_2_days", "every_3_days", "weekly", "custom"
    custom_weekdays = Column(JSON, default=lambda: ["Tue", "Thu"])  # ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    posting_time = Column(String(10), default="07:00")
    timezone = Column(String(100), default="Asia/Karachi")
    max_posts_per_day = Column(Integer, default=2)
    
    banned_topics = Column(JSON, default=list)  # e.g. ["politics", "unverified medical claims", "gambling"]
    allowed_prices_discounts = Column(JSON, default=list)  # Verified prices/discounts from daily check-ins
    target_platforms = Column(JSON, default=lambda: ["facebook", "linkedin", "tiktok"])
    posting_times = Column(JSON, default=lambda: {"morning": "07:00"})
    notification_email = Column(String(255), nullable=True)
    
    last_event_prompt_response = Column(Text, nullable=True)
    last_run_at = Column(DateTime, nullable=True)
    last_run_id = Column(String(36), nullable=True)
    last_run_summary = Column(Text, nullable=True)
    
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())

    # Relationships
    brand = relationship("Brand", back_populates="autopilot_config")


# ═══════════════════════════════════════════════════════════
# AUTOPILOT DECISION LOG — Detailed audit trail of every stage
# ═══════════════════════════════════════════════════════════
class AutopilotLog(Base):
    __tablename__ = "autopilot_logs"
    
    id = Column(String(36), primary_key=True, default=generate_uuid)
    brand_id = Column(String(36), ForeignKey("brands.id", ondelete="CASCADE"), nullable=False)
    run_id = Column(String(36), nullable=False)
    
    stage = Column(String(50), nullable=False)  # METRICS_ANALYSIS, STRATEGY_PLAN, GENERATION, SELF_CRITIQUE, GUARDRAILS, DISPATCH, NOTIFICATION
    status = Column(String(20), nullable=False)  # INFO, SUCCESS, WARNING, REJECTED, BLOCKED, ERROR
    decision_summary = Column(Text, nullable=False)
    details_json = Column(JSON, nullable=True)
    
    created_at = Column(DateTime, default=func.now())

    # Relationships
    brand = relationship("Brand", back_populates="autopilot_logs")


# ═══════════════════════════════════════════════════════════
# POST METRIC — Snapshot of post metrics over time
# ═══════════════════════════════════════════════════════════
class PostMetric(Base):
    __tablename__ = "post_metrics"
    
    id = Column(String(36), primary_key=True, default=generate_uuid)
    post_id = Column(String(36), ForeignKey("scheduled_posts.id", ondelete="CASCADE"), nullable=False)
    brand_id = Column(String(36), ForeignKey("brands.id", ondelete="CASCADE"), nullable=False)
    
    platform = Column(String(50), nullable=False)
    likes = Column(Integer, default=0)
    comments = Column(Integer, default=0)
    shares = Column(Integer, default=0)
    reach = Column(Integer, default=0)
    impressions = Column(Integer, default=0)
    engagement_rate = Column(Float, default=0.0)
    
    recorded_at = Column(DateTime, default=func.now())

    # Relationships
    post = relationship("ScheduledPost", back_populates="metrics")
    brand = relationship("Brand", back_populates="post_metrics")


# ═══════════════════════════════════════════════════════════
# USAGE — Per-generation cost, model and token/credit logging
# ═══════════════════════════════════════════════════════════
class Usage(Base):
    __tablename__ = "usage"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    brand_id = Column(String(36), ForeignKey("brands.id", ondelete="SET NULL"), nullable=True)

    feature = Column(String(100), default="image_generation")
    model = Column(String(100), default="gemini-nano-banana-2.1")
    prompt = Column(Text, nullable=True)
    aspect_ratio = Column(String(20), default="1:1")
    media_url = Column(Text, nullable=True)
    cost = Column(Float, default=0.03)  # USD cost estimate (e.g. $0.030 per image)
    credits_used = Column(Integer, default=1)
    status = Column(String(50), default="success")  # success, fallback, failed
    error_message = Column(Text, nullable=True)
    duration_ms = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=func.now())

    # Relationships
    user = relationship("User", back_populates="usages")
    brand = relationship("Brand", back_populates="usages")


# ═══════════════════════════════════════════════════════════
# CREDIT LEDGER — Authoritative post credits ledger
# ═══════════════════════════════════════════════════════════
class CreditLedger(Base):
    __tablename__ = "credit_ledger"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    delta = Column(Float, nullable=False)  # positive for grants/refunds, negative for usage
    reason = Column(String(100), nullable=False)  # "monthly_grant", "post_generation", "generation_refund", "credit_pack", "admin_adjustment"
    reference_id = Column(String(100), nullable=True, index=True)  # session_id, parent_post_id, idempotency key
    created_at = Column(DateTime, default=func.now(), nullable=False)

    # Relationships
    user = relationship("User", backref=backref("credit_ledger_entries", cascade="all, delete-orphan", lazy="dynamic"))


# ═══════════════════════════════════════════════════════════
# AUDIT LOG — Tracking admin actions and system events
# ═══════════════════════════════════════════════════════════
class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    admin_id = Column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    admin_email = Column(String(255), nullable=False)
    action = Column(String(100), nullable=False)  # suspend_user, reactivate_user, change_plan, reset_usage, force_logout, soft_delete_user
    target_type = Column(String(50), default="user")
    target_id = Column(String(36), nullable=True)
    target_email = Column(String(255), nullable=True)
    details = Column(JSON, nullable=True)
    ip_address = Column(String(100), nullable=True)
    created_at = Column(DateTime, default=func.now())

    # Relationships
    admin = relationship("User", foreign_keys=[admin_id])


# ═══════════════════════════════════════════════════════════
# SESSION VARIANTS — Temporary and selected image variants
# ═══════════════════════════════════════════════════════════
class SessionVariant(Base):
    __tablename__ = "session_variants"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    session_id = Column(String(36), ForeignKey("daily_sessions.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    brand_id = Column(String(36), ForeignKey("brands.id", ondelete="CASCADE"), nullable=False)
    platform = Column(String(50), nullable=False, default="instagram_post")

    variant_index = Column(Integer, default=0)
    variant_label = Column(String(100), default="Variant")
    style_direction = Column(String(255), nullable=True)

    image_url = Column(Text, nullable=False)
    background_url = Column(Text, nullable=True)
    headline = Column(Text, nullable=True)
    caption = Column(Text, nullable=True)
    hashtags = Column(JSON, nullable=True)
    call_to_action = Column(Text, nullable=True)

    is_selected = Column(Boolean, default=False)
    source = Column(String(20), default="ai")  # "ai" or "fallback"
    expires_at = Column(DateTime, nullable=True, default=None)  # Never auto-deleted; saved permanently
    created_at = Column(DateTime, default=func.now())


# ═══════════════════════════════════════════════════════════
# SYSTEM SETTINGS — Dynamic Platform Plans & Feature Flags
# ═══════════════════════════════════════════════════════════
class SystemSetting(Base):
    __tablename__ = "system_settings"

    key = Column(String(100), primary_key=True)
    value = Column(JSON, nullable=False)
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())
    updated_by = Column(String(255), nullable=True)


# ═══════════════════════════════════════════════════════════
# PUBLISH ATTEMPT — Immutable Audit Log of Every API Action
# ═══════════════════════════════════════════════════════════
class PublishAttempt(Base):
    __tablename__ = "publish_attempts"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    brand_id = Column(String(36), ForeignKey("brands.id", ondelete="CASCADE"), nullable=True)
    platform_copy_id = Column(String(36), ForeignKey("platform_copies.id", ondelete="SET NULL"), nullable=True)
    scheduled_post_id = Column(String(36), ForeignKey("scheduled_posts.id", ondelete="SET NULL"), nullable=True)
    
    platform = Column(String(50), nullable=False)  # facebook, instagram, linkedin, twitter, tiktok
    account_id = Column(String(255), nullable=True)
    status = Column(String(50), nullable=False)    # success, failed, needs_reconnect
    http_status = Column(Integer, nullable=True)
    
    # Sanitized request (tokens stripped)
    request_payload_sanitized = Column(JSON, nullable=True)
    response_body = Column(Text, nullable=True)
    error_code = Column(String(100), nullable=True)
    error_message = Column(Text, nullable=True)
    duration_ms = Column(Integer, nullable=True)
    external_post_id = Column(String(255), nullable=True)
    permalink = Column(Text, nullable=True)
    
    created_at = Column(DateTime, default=func.now())


# ═══════════════════════════════════════════════════════════
# EMAIL LOG — Captured Outbox in Dev Mode & Delivery Audit
# ═══════════════════════════════════════════════════════════
class EmailLog(Base):
    __tablename__ = "email_logs"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    brand_id = Column(String(36), ForeignKey("brands.id", ondelete="SET NULL"), nullable=True)
    recipient = Column(String(255), nullable=False, index=True)
    subject = Column(String(512), nullable=False)
    template = Column(String(100), nullable=False, index=True)
    status = Column(String(50), nullable=False, default="captured (dev)")  # 'captured (dev)', 'sent', 'failed'
    provider = Column(String(50), nullable=False, default="dev")
    full_html = Column(Text, nullable=False)
    plain_text = Column(Text, nullable=True)
    links_json = Column(JSON, nullable=True)
    metadata_json = Column(JSON, nullable=True)
    idempotency_key = Column(String(255), nullable=True, unique=True, index=True)
    created_at = Column(DateTime, default=func.now(), index=True)

    user = relationship("User", foreign_keys=[user_id])
    brand = relationship("Brand", foreign_keys=[brand_id])


# ═══════════════════════════════════════════════════════════
# IN-APP NOTIFICATION — The Single Source of Truth
# ═══════════════════════════════════════════════════════════
class Notification(Base):
    __tablename__ = "notifications"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    brand_id = Column(String(36), ForeignKey("brands.id", ondelete="SET NULL"), nullable=True)
    title = Column(String(255), nullable=False)
    message = Column(Text, nullable=False)
    type = Column(String(50), nullable=False, default="info")  # autopilot_checkin, autopilot_post_ready, autopilot_result, failed, needs_reconnect, welcome, info, alert
    is_read = Column(Boolean, default=False, nullable=False, index=True)
    read_at = Column(DateTime, nullable=True)
    action_type = Column(String(50), nullable=True)  # checkin, review, view_post, retry, reconnect, link
    action_payload = Column(JSON, nullable=True)
    idempotency_key = Column(String(255), nullable=True, unique=True, index=True)
    created_at = Column(DateTime, default=func.now(), index=True)

    user = relationship("User", back_populates="notifications")


# ═══════════════════════════════════════════════════════════
# PLANS — Database-backed dynamic subscription plans & limits
# ═══════════════════════════════════════════════════════════
class Plan(Base):
    __tablename__ = "plans"

    id = Column(String(50), primary_key=True)  # trial, starter, growth, pro
    name = Column(String(100), nullable=False)
    price_usd = Column(Integer, default=0, nullable=False)
    price_annual_usd = Column(Integer, default=0, nullable=False)
    price_local = Column(String(50), nullable=True)
    credits = Column(Integer, default=15, nullable=False)
    brands = Column(Integer, default=1, nullable=False)
    platforms = Column(Integer, default=2, nullable=False)
    max_posts_per_day = Column(Integer, default=5, nullable=False)
    daily_generation_cap = Column(Integer, default=5, nullable=False)
    reroll_pool = Column(Integer, default=3, nullable=False)  # Monthly re-roll allowance
    x_allowed = Column(Boolean, default=False, nullable=False)
    x_monthly_allowance = Column(Integer, default=0, nullable=False)
    max_approvers = Column(Integer, default=1, nullable=False)  # Approvers per brand limit (Trial 1, Starter 1, Growth 3, Pro 10)
    features = Column(JSON, nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())


# ═══════════════════════════════════════════════════════════
# BRAND MEMBER — Team Members & Role (Creator / Approver)
# ═══════════════════════════════════════════════════════════
class BrandMember(Base):
    __tablename__ = "brand_members"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    brand_id = Column(String(36), ForeignKey("brands.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True)
    role = Column(String(50), nullable=False, default="approver")  # "creator" | "approver"
    status = Column(String(50), nullable=False, default="invited")  # "invited" | "active" | "removed"
    invited_email = Column(String(255), nullable=True, index=True)
    invitation_token = Column(String(255), nullable=True, unique=True, index=True)
    invitation_expires_at = Column(DateTime, nullable=True)
    invited_by_user_id = Column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    accepted_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())

    # Relationships
    brand = relationship("Brand", backref=backref("members", cascade="all, delete-orphan"))
    user = relationship("User", foreign_keys=[user_id], backref=backref("brand_memberships", cascade="all, delete-orphan"))
    invited_by = relationship("User", foreign_keys=[invited_by_user_id])


# ═══════════════════════════════════════════════════════════
# POST VERSION — Immutable Content Snapshot for Approval
# ═══════════════════════════════════════════════════════════
class PostVersion(Base):
    __tablename__ = "post_versions"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    post_id = Column(String(36), ForeignKey("posts.id", ondelete="CASCADE"), nullable=True, index=True)
    scheduled_post_id = Column(String(36), ForeignKey("scheduled_posts.id", ondelete="CASCADE"), nullable=True, index=True)
    brand_id = Column(String(36), ForeignKey("brands.id", ondelete="CASCADE"), nullable=False, index=True)
    version_number = Column(Integer, default=1, nullable=False)
    submitted_by_id = Column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    
    captions = Column(JSON, nullable=True)  # Dict of per-platform captions: {"instagram": "...", "linkedin": "..."}
    hashtags = Column(JSON, nullable=True)  # Dict of per-platform hashtags: {"instagram": ["#tnt"], ...}
    image_url = Column(Text, nullable=True)
    scheduled_time = Column(DateTime, nullable=True)
    content_hash = Column(String(64), nullable=False, index=True)
    
    status = Column(String(50), default="in_review", nullable=False)  # in_review | approved | changes_requested | rejected
    decision = Column(String(50), nullable=True)
    decision_by_id = Column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    decision_at = Column(DateTime, nullable=True)
    decision_notes = Column(Text, nullable=True)
    changes_requested_chips = Column(JSON, nullable=True)  # ["image", "caption", "time", "hashtags"]
    
    created_at = Column(DateTime, default=func.now())

    # Relationships
    post = relationship("Post", backref=backref("versions", cascade="all, delete-orphan", order_by="PostVersion.version_number.desc()"))
    scheduled_post = relationship("ScheduledPost", backref=backref("versions", cascade="all, delete-orphan", order_by="PostVersion.version_number.desc()"))
    submitted_by = relationship("User", foreign_keys=[submitted_by_id])
    decision_by = relationship("User", foreign_keys=[decision_by_id])
    approvals = relationship("PostApproval", back_populates="version", cascade="all, delete-orphan")


# ═══════════════════════════════════════════════════════════
# POST APPROVAL — Per-Approver Decision Record ("All" Mode)
# ═══════════════════════════════════════════════════════════
class PostApproval(Base):
    __tablename__ = "post_approvals"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    post_version_id = Column(String(36), ForeignKey("post_versions.id", ondelete="CASCADE"), nullable=False, index=True)
    approver_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    decision = Column(String(50), nullable=False)  # approved | changes_requested | rejected
    notes = Column(Text, nullable=True)
    chips = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=func.now())

    version = relationship("PostVersion", back_populates="approvals")
    approver = relationship("User", foreign_keys=[approver_id])


