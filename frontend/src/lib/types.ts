export interface User {
  id: string
  email: string
  full_name?: string
  plan: string
  created_at: string
}

export interface ColorDetail {
  hex: string
  confidence?: number
  source?: string
}

export interface ColorPalette {
  primary?: ColorDetail
  secondary?: ColorDetail
  accent?: ColorDetail
  neutrals?: ColorDetail[]
  colors?: string[]
  extraction_method?: string
}

export interface Brand {
  id: string
  business_name: string
  website_url?: string
  logo_url?: string
  primary_color?: string
  secondary_color?: string
  accent_color?: string
  onboarding_complete: boolean
  scan_status: 'pending' | 'scanning' | 'completed' | 'failed'
  business_type?: string
  colors?: string[]
  color_palette?: ColorPalette
  brand_kit?: any
}

export interface AuthResponse {
  token: string
  user_id: string
  email: string
  full_name?: string
  onboarding_complete: boolean
}

export interface SmartQuestion {
  question_id: string
  question: string
  type: 'focus' | 'platform' | 'special'
  options: string[]
  placeholder?: string
}

export interface SessionResult {
  session_theme: string
  instagram_post?: {
    caption: string
    hashtags: string[]
    call_to_action: string
    best_time: string
    best_day: string
    image_url?: string
    image_status?: string
  }
  instagram_story?: {
    text: string
    cta: string
    poll_question?: string
    image_url?: string
  }
  linkedin?: {
    caption: string
    image_url?: string
  }
  linkedin_post?: {
    caption: string
    hashtags: string[]
    best_time: string
    best_day: string
    image_url?: string
  }
  facebook?: {
    caption: string
    image_url?: string
  }
  facebook_post?: {
    caption: string
    hashtags: string[]
    image_url?: string
  }
  guidance?: {
    tip_of_day: string
    content_mix_feedback: string
    this_week_suggestion: string
    best_performing_type: string
  }
}

export interface ReferenceImageItem {
  id: string
  file?: File
  preview: string
  url?: string
  mode: 'use_photo' | 'style_inspiration'
  filename?: string
  uploading?: boolean
  error?: string
}

export interface SessionVariantItem {
  id: string
  variant_index: number
  variant_label: string
  style_direction: string
  image_url: string
  headline?: string
  caption?: string
  hashtags?: string[]
  call_to_action?: string
  is_selected: boolean
  status: 'ready' | 'fallback' | 'failed' | 'generating'
  source?: 'ai' | 'fallback'
  error?: string
}

export interface MultiVariantSessionResult {
  session_id: string
  session_theme: string
  caption: string
  caption_source?: 'ai' | 'fallback'
  hashtags: string[]
  call_to_action: string
  posting_time_suggestion?: string
  variants: SessionVariantItem[]
  credits_remaining: number
  plan: string
  max_variants_allowed: number
  guidance?: any
  generation_status?: 'success' | 'partial' | 'failed' | 'fallback'
  generation_error?: string
}
