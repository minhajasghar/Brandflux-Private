from sqlalchemy import Column, String, Integer, Boolean, Text, ForeignKey, Date, DateTime, JSON, Float
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
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
    created_at = Column(DateTime, default=func.now())

    # Relationships
    brands = relationship("Brand", back_populates="user", cascade="all, delete-orphan")
    answers = relationship("UserAnswer", back_populates="user", cascade="all, delete-orphan")

# ═══════════════════════════════════════════════════════════
# BRAND — Auto-populated from website scraping + AI analysis
# ═══════════════════════════════════════════════════════════
class Brand(Base):
    __tablename__ = "brands"
    
    id = Column(String(36), primary_key=True, default=generate_uuid)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"))
    
    # ── Core Info ──────────────────────────────────────────
    business_name = Column(String(255), nullable=False)
    tagline = Column(String(512))
    business_type = Column(String(255))
    industry = Column(String(255))
    target_audience = Column(Text)
    products_services = Column(JSON)  # ["product1", "product2", ...]
    
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

    # Relationships
    user = relationship("User", back_populates="brands")
    scan_logs = relationship("BrandScanLog", back_populates="brand", cascade="all, delete-orphan")
    content_ideas = relationship("ContentIdea", back_populates="brand", cascade="all, delete-orphan")
    website_scans = relationship("WebsiteScan", back_populates="brand", cascade="all, delete-orphan")
    daily_sessions = relationship("DailySession", back_populates="brand", cascade="all, delete-orphan")

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
