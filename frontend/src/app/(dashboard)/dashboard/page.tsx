'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  ArrowRight, 
  CheckCircle2, 
  Clock, 
  Globe, 
  Loader2, 
  RefreshCcw, 
  AlertTriangle, 
  FileText, 
  Activity, 
  Layers,
  Calendar,
  Check,
  Send,
  Copy,
  X,
  RotateCcw,
  ExternalLink,
  Sparkles
} from 'lucide-react'
import api from '@/lib/api'
import { toast } from 'react-hot-toast'
import Skeleton from '@/components/ui/Skeleton'
import StreakWidget from '@/components/dashboard/StreakWidget'
import EmptyState from '@/components/ui/EmptyState'
import { resolveMediaUrl } from '@/lib/media'

interface PlatformCopyItem {
  id: string
  platform: string
  caption: string
  hashtags?: string[]
  image_url?: string | null
  status: string
  aspect_ratio?: string
  scheduled_at?: string | null
  error?: string | null
}

interface RecentGeneration {
  id: string
  session_date: string
  session_theme: string
  title?: string
  caption?: string
  instagram_caption?: string
  linkedin_caption?: string
  platforms_generated: string[]
  platform_statuses?: Record<string, string>
  copies?: PlatformCopyItem[]
  copies_count?: number
  image_url?: string | null
  created_at: string
}

interface BrandStats {
  posts_created_this_month: number
  total_platform_copies_this_month?: number
  sessions_completed_this_week: number
  top_platform?: string
  most_used_platform: string
  streak_days: number
}

export default function DashboardPage() {
  const router = useRouter()
  
  // State variables
  const [brand, setBrand] = useState<any | null>(null)
  const [stats, setStats] = useState<BrandStats | null>(null)
  const [recentGenerations, setRecentGenerations] = useState<RecentGeneration[]>([])
  
  const [isSessionCompletedToday, setIsSessionCompletedToday] = useState(false)
  const [changesDetected, setChangesDetected] = useState(false)
  
  const [isLoading, setIsLoading] = useState(true)
  const [isRescanning, setIsRescanning] = useState(false)

  // Post detail drawer state
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null)
  const [postDetail, setPostDetail] = useState<any | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [activePlatformTab, setActivePlatformTab] = useState<string>('instagram')
  const [isPublishing, setIsPublishing] = useState<string | null>(null)
  const [schedulingCopyId, setSchedulingCopyId] = useState<string | null>(null)
  const [scheduledDateTime, setScheduledDateTime] = useState<string>('')

  // Fetch all dashboard data
  const fetchDashboardData = async () => {
    try {
      const [brandRes, sessionRes, statsRes, historyRes] = await Promise.all([
        api.get('/brand/profile'),
        api.get('/sessions/today'),
        api.get('/brand/stats'),
        api.get('/content/history?page=1&limit=5')
      ])

      setBrand(brandRes.data)
      
      // Check if session has answers filled in (daily session complete)
      if (sessionRes.data && sessionRes.data.answer_1 && sessionRes.data.answer_2 && sessionRes.data.answer_3) {
        setIsSessionCompletedToday(true)
      } else {
        setIsSessionCompletedToday(false)
      }

      setStats(statsRes.data)
      setRecentGenerations(historyRes.data?.items || [])

    } catch (error) {
      console.error('Failed to fetch dashboard data:', error)
      toast.error('Failed to update dashboard data.')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchDashboardData()
  }, [])

  // Handle website rescan
  const handleRescanWebsite = async () => {
    setIsRescanning(true)
    toast.loading('Scanning your website for updates...', { id: 'rescan' })
    try {
      const res = await api.post('/brand/rescan')
      if (res.data) {
        setBrand(res.data.brand || res.data)
        if (res.data.changes_detected) {
          setChangesDetected(true)
        }
        toast.success('Website scanned successfully!', { id: 'rescan' })
      }
    } catch (err: any) {
      console.error('Rescan failed:', err)
      toast.error('Website rescan failed. Check your URL.', { id: 'rescan' })
    } finally {
      setIsRescanning(false)
    }
  }

  // Open Post Detail
  const openPostDetail = async (postId: string) => {
    setSelectedPostId(postId)
    setLoadingDetail(true)
    try {
      const res = await api.get(`/content/history/${postId}`)
      if (res.data) {
        setPostDetail(res.data)
        const plats = res.data.copies?.map((c: any) => c.platform) || Object.keys(res.data.platforms || {})
        if (plats.length > 0) {
          setActivePlatformTab(plats[0])
        }
      }
    } catch (e) {
      console.error('Failed to load post detail:', e)
      toast.error('Failed to load post details.')
    } finally {
      setLoadingDetail(false)
    }
  }

  const handlePublishCopy = async (copyId: string, platform: string) => {
    setIsPublishing(copyId)
    try {
      await api.post(`/content/copy/${copyId}/publish`)
      toast.success(`Published to ${platform.toUpperCase()}!`)
      if (selectedPostId) {
        const res = await api.get(`/content/history/${selectedPostId}`)
        setPostDetail(res.data)
      }
      fetchDashboardData()
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to publish.')
    } finally {
      setIsPublishing(null)
    }
  }

  const handleScheduleCopy = async (copyId: string, platform: string) => {
    if (!scheduledDateTime) {
      toast.error('Please pick a date and time to schedule.')
      return
    }
    try {
      await api.post(`/content/copy/${copyId}/schedule`, { scheduled_at: new Date(scheduledDateTime).toISOString() })
      toast.success(`Scheduled for ${platform.toUpperCase()}!`)
      setSchedulingCopyId(null)
      if (selectedPostId) {
        const res = await api.get(`/content/history/${selectedPostId}`)
        setPostDetail(res.data)
      }
      fetchDashboardData()
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to schedule.')
    }
  }

  const handleRetryCopy = async (copyId: string, platform: string) => {
    try {
      await api.post(`/content/copy/${copyId}/retry`)
      toast.success(`Reset status for ${platform.toUpperCase()}.`)
      if (selectedPostId) {
        const res = await api.get(`/content/history/${selectedPostId}`)
        setPostDetail(res.data)
      }
      fetchDashboardData()
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to retry.')
    }
  }

  // Format date nicely
  const getCurrentFormattedDate = () => {
    const today = new Date()
    return today.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
  }

  // Format date generated
  const formatGeneratedDate = (dateString: string) => {
    if (!dateString) return 'Just now'
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  const renderPlatformChip = (platform: string, status: string = 'draft') => {
    const p = platform.toLowerCase()
    const s = (status || 'draft').toLowerCase()

    let statusBadgeBg = 'bg-zinc-800/60 text-zinc-300 border-zinc-700/60'
    let dotColor = 'bg-zinc-400'
    let statusLabel = 'Draft'

    if (s === 'published') {
      statusBadgeBg = 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
      dotColor = 'bg-emerald-400'
      statusLabel = 'Published'
    } else if (s === 'scheduled') {
      statusBadgeBg = 'bg-blue-500/10 text-blue-400 border-blue-500/30'
      dotColor = 'bg-blue-400'
      statusLabel = 'Scheduled'
    } else if (s === 'publishing') {
      statusBadgeBg = 'bg-amber-500/10 text-amber-400 border-amber-500/30'
      dotColor = 'bg-amber-400 animate-pulse'
      statusLabel = 'Publishing'
    } else if (s === 'failed') {
      statusBadgeBg = 'bg-rose-500/10 text-rose-400 border-rose-500/30'
      dotColor = 'bg-rose-400'
      statusLabel = 'Failed'
    }

    let platformName = platform
    let brandColorClass = 'text-zinc-300'
    let icon = <Globe className="h-2.5 w-2.5" />

    if (p.includes('instagram')) {
      platformName = 'Instagram'
      brandColorClass = 'text-[#FF75A0]'
      icon = (
        <svg className="h-2.5 w-2.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect>
          <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path>
          <line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line>
        </svg>
      )
    } else if (p.includes('linkedin')) {
      platformName = 'LinkedIn'
      brandColorClass = 'text-[#4CB5F9]'
      icon = (
        <svg className="h-2.5 w-2.5 shrink-0 fill-current" viewBox="0 0 24 24">
          <path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.28 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.75M6.46 10.9v8.37H9.2V10.9H6.46M7.83 6.45a1.64 1.64 0 1 0 0 3.28 1.64 1.64 0 0 0 0-3.28z"/>
        </svg>
      )
    } else if (p.includes('facebook')) {
      platformName = 'Facebook'
      brandColorClass = 'text-[#70AEFF]'
      icon = (
        <svg className="h-2.5 w-2.5 shrink-0 fill-current" viewBox="0 0 24 24">
          <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
        </svg>
      )
    } else if (p.includes('twitter') || p.includes('x')) {
      platformName = 'X / Twitter'
      brandColorClass = 'text-white'
      icon = (
        <svg className="h-2.5 w-2.5 shrink-0 fill-current" viewBox="0 0 24 24">
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
        </svg>
      )
    } else if (p.includes('tiktok')) {
      platformName = 'TikTok'
      brandColorClass = 'text-[#25F4EE]'
      icon = (
        <svg className="h-2.5 w-2.5 shrink-0 fill-current" viewBox="0 0 24 24">
          <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64c.29 0 .58.04.85.12V9.41a6.33 6.33 0 0 0-.85-.06 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 8.78 5.86 6.34 6.34 0 0 0 3.9-5.86V9.17a8.28 8.28 0 0 0 4.84 1.55v-3.48a4.85 4.85 0 0 1-1.07-.55z"/>
        </svg>
      )
    }

    return (
      <span
        key={platform}
        className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border text-[10px] font-bold ${statusBadgeBg}`}
      >
        <span className={brandColorClass}>{icon}</span>
        <span className="text-text">{platformName}</span>
        <span className="opacity-40">•</span>
        <span className="inline-flex items-center gap-1 text-[9px] uppercase tracking-wider font-extrabold">
          <span className={`h-1.5 w-1.5 rounded-full ${dotColor}`} />
          <span>{statusLabel}</span>
        </span>
      </span>
    )
  }

  if (isLoading) {
    return (
      <div className="space-y-6 max-w-6xl mx-auto">
        {/* Brand Profile Skeleton */}
        <div className="bg-surface border border-border rounded-3xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-center gap-6 flex-1">
            <Skeleton width="56px" height="56px" rounded="2xl" />
            <div className="space-y-2 flex-1 max-w-md">
              <Skeleton width="40%" height="24px" rounded="md" />
              <Skeleton width="60%" height="16px" rounded="md" />
            </div>
          </div>
          <div className="flex gap-2">
            <Skeleton width="28px" height="28px" rounded="full" />
            <Skeleton width="28px" height="28px" rounded="full" />
            <Skeleton width="28px" height="28px" rounded="full" />
          </div>
        </div>

        {/* Daily Prompt Skeleton */}
        <div className="bg-surface border border-border rounded-3xl p-8 space-y-4">
          <Skeleton width="20%" height="20px" rounded="full" />
          <Skeleton width="50%" height="32px" rounded="md" />
          <Skeleton width="70%" height="16px" rounded="md" />
        </div>

        {/* Stats Row Skeleton */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-surface border border-border rounded-2xl p-5 space-y-3">
              <Skeleton width="32px" height="32px" rounded="xl" />
              <Skeleton width="50%" height="12px" rounded="md" />
              <Skeleton width="40%" height="28px" rounded="md" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (!brand && !isLoading) {
    return (
      <div className="py-12">
        <EmptyState
          emoji="🎨"
          title="Brand not set up"
          subtitle="Complete onboarding first to create content and scan your website."
          buttonText="Set Up Brand"
          onButtonClick={() => router.push('/onboarding')}
        />
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      
      {/* ─── DYNAMIC BANNER: WEBSITE CHANGES DETECTED ─── */}
      <AnimatePresence>
        {changesDetected && (
          <motion.div 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="flex items-start gap-4 p-4 rounded-2xl bg-surface border border-accent/40 text-text shadow-sm"
          >
            <AlertTriangle className="h-5 w-5 text-accent flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h4 className="font-bold text-sm text-text">Your website has changes!</h4>
              <p className="text-xs text-muted mt-0.5 leading-relaxed">
                We detected updates on your website. New brand insights and updated content recommendations are ready.
              </p>
            </div>
            <button 
              onClick={() => setChangesDetected(false)}
              className="text-xs font-bold px-3 py-1.5 rounded-lg bg-surface-secondary hover:bg-surface-hover transition text-muted hover:text-text border border-border"
            >
              Dismiss
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── SECTION 1: BRAND STATUS BAR ─── */}
      <section className="bg-surface border border-border rounded-2xl sm:rounded-3xl p-4 sm:p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-5 sm:gap-6">
        <div className="flex flex-wrap items-center gap-4 sm:gap-5">
          {/* Logo or Globe */}
          <div className="h-12 w-12 sm:h-14 sm:w-14 rounded-2xl bg-surface-secondary border border-border flex items-center justify-center flex-shrink-0">
            {brand?.logo_url ? (
              <img 
                src={brand.logo_url} 
                className="h-9 w-9 sm:h-10 sm:w-10 object-contain rounded-lg" 
                alt="Brand Logo" 
                onError={(e) => {
                  (e.target as HTMLElement).style.display = 'none'
                }}
              />
            ) : (
              <Globe className="h-5 w-5 sm:h-6 sm:w-6 text-muted" />
            )}
          </div>
          
          <div className="space-y-1 min-w-0">
            <div className="flex items-center gap-2.5 sm:gap-3 flex-wrap">
              <h2 className="text-xl sm:text-2xl font-extrabold tracking-tight text-text truncate max-w-[200px] sm:max-w-none">{brand?.business_name || 'My Brand'}</h2>
              <span className="px-2 sm:px-2.5 py-0.5 rounded-md bg-surface-secondary border border-border text-[9px] sm:text-[10px] font-bold text-muted uppercase tracking-wider">
                {brand?.business_type || 'Business'}
              </span>
            </div>
            
            <div className="flex flex-wrap items-center gap-x-3 sm:gap-x-4 gap-y-1 text-xs text-muted">
              <a 
                href={brand?.website_url || '#'} 
                target="_blank" 
                rel="noreferrer" 
                className="hover:underline flex items-center gap-1.5 text-accent truncate max-w-[180px] sm:max-w-none"
              >
                <Globe className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{brand?.website_url || 'No URL scanned'}</span>
              </a>
              <span className="text-border hidden sm:inline">|</span>
              <div className="flex items-center gap-1.5 text-muted">
                <Clock className="h-3.5 w-3.5 shrink-0" />
                <span>
                  Last Scanned: {brand?.last_scanned_at ? formatGeneratedDate(brand.last_scanned_at) : 'Not scanned yet'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Brand Colors & Rescan Button */}
        <div className="flex flex-wrap items-center justify-between md:justify-end gap-3 sm:gap-6 border-t border-border md:border-t-0 pt-4 md:pt-0 w-full md:w-auto">
          <div className="space-y-1.5">
            <p className="text-[10px] font-bold text-muted uppercase tracking-wider text-left md:text-right">Brand Colors</p>
            <div className="flex gap-1.5">
              {brand?.colors && brand.colors.length > 0 ? (
                brand.colors.slice(0, 5).map((color: string, i: number) => (
                  <div 
                    key={i} 
                    className="h-5 w-5 sm:h-6 sm:w-6 rounded-full border border-border hover:scale-110 transition-transform cursor-pointer"
                    style={{ backgroundColor: color }}
                    title={color}
                  />
                ))
              ) : (
                ['#1558C9', '#D4FF24', '#0D0F16', '#10B981', '#EF4444'].map((color: string, i: number) => (
                  <div 
                    key={i} 
                    className="h-5 w-5 sm:h-6 sm:w-6 rounded-full border border-border"
                    style={{ backgroundColor: color }}
                  />
                ))
              )}
            </div>
          </div>

          <button
            onClick={handleRescanWebsite}
            disabled={isRescanning}
            className="flex items-center justify-center gap-2 px-3.5 sm:px-4 py-2 sm:py-2.5 rounded-xl bg-surface-secondary hover:bg-surface-hover border border-border font-bold text-xs text-text transition-all active:scale-[0.98] disabled:opacity-50 min-h-[40px]"
          >
            {isRescanning ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" />
                <span>Rescanning...</span>
              </>
            ) : (
              <>
                <RefreshCcw className="h-3.5 w-3.5 text-muted" />
                <span>Rescan Website</span>
              </>
            )}
          </button>
        </div>
      </section>

      {/* ─── SECTION 2: DAILY PROMPT CARD ─── */}
      <section>
        {isSessionCompletedToday ? (
          /* SESSION COMPLETED */
          <div className="bg-surface border border-border rounded-2xl sm:rounded-3xl p-5 sm:p-8 text-center md:text-left flex flex-col md:flex-row md:items-center justify-between gap-5 sm:gap-6 shadow-sm">
            <div className="space-y-2">
              <div className="flex flex-col md:flex-row items-center gap-2.5 sm:gap-3">
                <div className="h-9 w-9 rounded-full bg-success-muted border border-success/30 flex items-center justify-center shrink-0">
                  <CheckCircle2 className="h-5 w-5 text-success" />
                </div>
                <h3 className="text-xl sm:text-2xl font-extrabold text-text tracking-tight">Today&apos;s Content is Ready</h3>
              </div>
              <p className="text-muted text-xs sm:text-sm max-w-xl">
                You completed your daily check-in for {getCurrentFormattedDate()}. Your custom captions, hashtags, and branded graphics are ready to review.
              </p>
            </div>
            <button
              onClick={() => router.push('/session')}
              className="w-full sm:w-auto px-6 py-3.5 rounded-xl bg-surface-secondary hover:bg-surface-hover border border-border text-text font-bold text-sm transition-all flex items-center justify-center gap-2 active:scale-[0.98] min-h-[44px]"
            >
              View Generated Content
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        ) : (
          /* CREATION PROMPT CARD */
          <div className="bg-surface border border-border rounded-2xl sm:rounded-3xl p-5 sm:p-8 text-center md:text-left flex flex-col md:flex-row md:items-center justify-between gap-5 sm:gap-6 shadow-sm">
            <div className="space-y-2.5 sm:space-y-3">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-surface-secondary border border-border text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-accent select-none">
                <span className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse" />
                Today&apos;s Opportunity
              </div>
              
              <h3 className="text-xl sm:text-3xl font-extrabold text-text tracking-tight">Ready to create today&apos;s content?</h3>
              <p className="text-muted text-xs sm:text-sm max-w-lg leading-relaxed font-medium">
                Answer three quick context questions to craft high-converting, tailored posts for Instagram, LinkedIn, and Facebook for <span className="text-text font-bold">{getCurrentFormattedDate()}</span>.
              </p>
            </div>
            
            <button
              onClick={() => router.push('/session')}
              className="w-full sm:w-auto px-6 sm:px-8 py-3.5 sm:py-4 rounded-xl bg-accent hover:bg-accent-hover text-black font-extrabold text-sm sm:text-base transition-all flex items-center justify-center gap-2 shadow-accent-glow active:scale-[0.98] whitespace-nowrap min-h-[48px]"
            >
              Start Today&apos;s Session
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </section>

      {/* ─── SECTION 3: STATS ROW ─── */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        
        {/* Stat Card 1 */}
        <div className="bg-surface border border-border rounded-2xl p-4 sm:p-5 hover:border-border-light transition-colors">
          <div className="h-7 w-7 sm:h-8 sm:w-8 rounded-xl bg-surface-secondary border border-border flex items-center justify-center text-accent mb-3 sm:mb-4">
            <FileText className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
          </div>
          <p className="text-[9px] sm:text-[10px] font-bold text-muted uppercase tracking-wider">Created This Month</p>
          <p className="text-2xl sm:text-3xl font-extrabold text-text tracking-tight mt-1">
            {stats?.posts_created_this_month || 0}
          </p>
          <span className="text-[10px] sm:text-[11px] font-medium text-muted">
            across {stats?.total_platform_copies_this_month || ((stats?.posts_created_this_month || 0) * 4)} platform copies
          </span>
        </div>

        {/* Stat Card 2 */}
        <div className="bg-surface border border-border rounded-2xl p-4 sm:p-5 hover:border-border-light transition-colors">
          <div className="h-7 w-7 sm:h-8 sm:w-8 rounded-xl bg-surface-secondary border border-border flex items-center justify-center text-accent mb-3 sm:mb-4">
            <Activity className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
          </div>
          <p className="text-[9px] sm:text-[10px] font-bold text-muted uppercase tracking-wider">Sessions Completed</p>
          <p className="text-2xl sm:text-3xl font-extrabold text-text tracking-tight mt-1">
            {stats?.sessions_completed_this_week || 0}
          </p>
          <span className="text-[10px] sm:text-[11px] font-medium text-muted">this week</span>
        </div>

        {/* Stat Card 3 */}
        <div className="bg-surface border border-border rounded-2xl p-4 sm:p-5 hover:border-border-light transition-colors">
          <div className="h-7 w-7 sm:h-8 sm:w-8 rounded-xl bg-surface-secondary border border-border flex items-center justify-center text-accent mb-3 sm:mb-4">
            <Layers className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
          </div>
          <p className="text-[9px] sm:text-[10px] font-bold text-muted uppercase tracking-wider">Top Platform</p>
          <p className="text-lg sm:text-xl font-extrabold text-text truncate tracking-tight mt-2 mb-1" title={stats?.top_platform || stats?.most_used_platform || '-'}>
            {stats?.top_platform || stats?.most_used_platform || '-'}
          </p>
          <span className="text-[10px] sm:text-[11px] font-medium text-muted">
            {(stats?.top_platform && stats.top_platform !== '-') ? 'most published channel' : 'no posts published yet'}
          </span>
        </div>

        {/* Stat Card 4 - Streak Widget */}
        <div className="col-span-2 lg:col-span-1">
          <StreakWidget />
        </div>

      </section>

      {/* ─── SECTION 4: RECENT GENERATIONS ─── */}
      <section className="bg-surface border border-border rounded-2xl sm:rounded-3xl p-4 sm:p-6 shadow-sm space-y-4 sm:space-y-5">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5 min-w-0 pr-2">
            <h3 className="text-base sm:text-lg font-extrabold tracking-tight text-text truncate">Recent Content</h3>
            <p className="text-[11px] sm:text-xs text-muted font-medium truncate">One parent post per generation with platform-specific copies</p>
          </div>
          
          <button 
            onClick={() => router.push('/ideas')} 
            className="text-xs font-bold text-accent hover:underline flex items-center gap-1 shrink-0"
          >
            View All History
            <ArrowRight className="h-3 w-3" />
          </button>
        </div>

        {recentGenerations.length === 0 ? (
          <EmptyState
            emoji="✨"
            title="No generations yet"
            subtitle="Complete your first check-in session to generate multi-channel content."
            buttonText="Create Now"
            onButtonClick={() => router.push('/session')}
          />
        ) : (
          <div className="divide-y divide-border">
            {recentGenerations.map((gen) => {
              const firstLineCaption = gen.caption || gen.instagram_caption || gen.linkedin_caption || gen.title || 'Draft copy ready for scheduling';
              return (
                <div 
                  key={gen.id} 
                  onClick={() => openPostDetail(gen.id)}
                  className="flex items-center justify-between gap-3 sm:gap-4 py-3.5 sm:py-4 first:pt-0 last:pb-0 group cursor-pointer hover:bg-surface-secondary/50 rounded-xl px-2 -mx-2 transition"
                >
                  <div className="flex items-center gap-3 sm:gap-4 min-w-0 flex-1">
                    {/* Visual Asset Thumbnail */}
                    <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-xl bg-surface-secondary border border-border overflow-hidden flex-shrink-0 flex items-center justify-center relative">
                      {gen.image_url ? (
                        <img 
                          src={resolveMediaUrl(gen.image_url)} 
                          alt={gen.title || gen.session_theme || 'Generated visual'} 
                          className="w-full h-full object-cover group-hover:scale-105 transition duration-200"
                          onError={(e) => {
                            (e.target as HTMLElement).style.display = 'none'
                          }}
                        />
                      ) : (
                        <Layers className="h-5 w-5 text-accent" />
                      )}
                    </div>
                    
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-xs sm:text-sm font-bold text-text truncate group-hover:text-accent transition-colors">
                          {gen.title || gen.session_theme || 'Campaign Pack'}
                        </p>
                        <span className="hidden sm:inline-block h-1 w-1 rounded-full bg-border" />
                        <span className="text-[11px] text-muted flex items-center gap-1 shrink-0">
                          <Clock className="h-3 w-3" />
                          {formatGeneratedDate(gen.created_at || gen.session_date)}
                        </span>
                      </div>

                      {/* Multi-Platform Status Chips */}
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {gen.platforms_generated?.map((p: string) => renderPlatformChip(p, gen.platform_statuses?.[p]))}
                      </div>
                      
                      {/* Real first line of caption */}
                      <p className="text-[11px] sm:text-xs text-muted truncate pr-2 font-normal">
                        {firstLineCaption}
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      openPostDetail(gen.id)
                    }}
                    className="px-3 sm:px-3.5 py-1.5 rounded-xl bg-surface-secondary hover:bg-surface-hover border border-border font-bold text-xs text-text transition-all active:scale-[0.98] shrink-0 min-h-[36px]"
                  >
                    View
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ─── POST DETAIL DRAWER / MODAL ─── */}
      <AnimatePresence>
        {selectedPostId && (
          <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedPostId(null)}
              className="absolute inset-0"
            />

            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 300 }}
              className="relative w-full max-w-xl h-full bg-surface border-l border-border shadow-2xl flex flex-col z-10 overflow-hidden"
            >
              {/* Drawer Header */}
              <div className="p-5 border-b border-border flex items-center justify-between gap-3 bg-surface">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded-md bg-accent/10 border border-accent/20 text-accent text-[10px] font-black uppercase">
                      Post Generation
                    </span>
                    <span className="text-xs text-muted">1 Credit Consumed</span>
                  </div>
                  <h2 className="text-lg font-black text-text truncate mt-1">
                    {postDetail?.title || postDetail?.session_theme || 'Campaign Pack'}
                  </h2>
                  <p className="text-xs text-muted">
                    {formatGeneratedDate(postDetail?.created_at || '')}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => router.push(`/ideas?id=${selectedPostId}`)}
                    className="p-2 rounded-xl bg-surface-secondary hover:bg-surface-hover border border-border text-muted hover:text-text transition"
                    title="Open in full Content History"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setSelectedPostId(null)}
                    className="p-2 rounded-xl bg-surface-secondary hover:bg-surface-hover border border-border text-muted hover:text-text transition"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {loadingDetail ? (
                <div className="flex-1 flex flex-col items-center justify-center p-8 space-y-3">
                  <Loader2 className="h-8 w-8 text-accent animate-spin" />
                  <p className="text-xs font-bold text-muted">Loading post details &amp; platform copies...</p>
                </div>
              ) : postDetail ? (
                <div className="flex-1 overflow-y-auto p-5 space-y-5">
                  {/* Platform Tabs */}
                  {(() => {
                    const copies: PlatformCopyItem[] = postDetail.copies && postDetail.copies.length > 0 
                      ? postDetail.copies 
                      : Object.entries(postDetail.platforms || {}).map(([p, data]: [string, any]) => ({
                          id: data?.id || data?.copy_id || p,
                          platform: p,
                          caption: data?.caption || '',
                          hashtags: data?.hashtags || [],
                          image_url: data?.image_url || postDetail.image_url,
                          status: data?.status || 'draft'
                        }));

                    const activeCopy = copies.find(c => c.platform.toLowerCase().includes(activePlatformTab.toLowerCase())) || copies[0];

                    return (
                      <div className="space-y-4">
                        {/* Tabs Bar */}
                        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
                          {copies.map((c) => {
                            const isTabActive = activeCopy && activeCopy.platform.toLowerCase() === c.platform.toLowerCase();
                            const p = c.platform.toLowerCase();
                            let label = c.platform;
                            if (p.includes('instagram')) label = 'Instagram';
                            else if (p.includes('linkedin')) label = 'LinkedIn';
                            else if (p.includes('facebook')) label = 'Facebook';
                            else if (p.includes('twitter') || p.includes('x')) label = 'X / Twitter';
                            else if (p.includes('tiktok')) label = 'TikTok';

                            return (
                              <button
                                key={c.id || c.platform}
                                type="button"
                                onClick={() => setActivePlatformTab(c.platform)}
                                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shrink-0 border ${
                                  isTabActive
                                    ? 'bg-accent text-black border-accent shadow-sm'
                                    : 'bg-surface-secondary text-muted hover:text-text border-border'
                                }`}
                              >
                                <span>{label}</span>
                                <span className={`h-1.5 w-1.5 rounded-full ${
                                  c.status === 'published' ? 'bg-emerald-400' :
                                  c.status === 'scheduled' ? 'bg-blue-400' :
                                  c.status === 'failed' ? 'bg-rose-400' : 'bg-zinc-400'
                                }`} />
                              </button>
                            );
                          })}
                        </div>

                        {activeCopy && (
                          <div className="space-y-5 bg-surface-secondary/40 border border-border rounded-2xl p-4 sm:p-5">
                            {/* Copy Header: Status & Quick Actions */}
                            <div className="flex items-center justify-between gap-2 border-b border-border pb-3">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-black uppercase text-text tracking-wide">
                                  {activeCopy.platform.toUpperCase()} COPY
                                </span>
                                <span className={`px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase border ${
                                  activeCopy.status === 'published' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' :
                                  activeCopy.status === 'scheduled' ? 'bg-blue-500/10 text-blue-400 border-blue-500/30' :
                                  activeCopy.status === 'failed' ? 'bg-rose-500/10 text-rose-400 border-rose-500/30' :
                                  'bg-zinc-500/10 text-zinc-300 border-zinc-700/60'
                                }`}>
                                  {activeCopy.status || 'Draft'}
                                </span>
                              </div>

                              <button
                                type="button"
                                onClick={() => {
                                  navigator.clipboard.writeText(activeCopy.caption || '');
                                  toast.success('Caption copied!');
                                }}
                                className="px-2.5 py-1 rounded-lg bg-surface border border-border hover:bg-surface-secondary text-xs font-bold text-text flex items-center gap-1"
                              >
                                <Copy className="h-3 w-3 text-accent" />
                                <span>Copy Text</span>
                              </button>
                            </div>

                            {/* Image Preview */}
                            {(activeCopy.image_url || postDetail.image_url) && (
                              <div className="rounded-xl overflow-hidden aspect-video max-h-56 bg-surface border border-border relative">
                                <img
                                  src={resolveMediaUrl(activeCopy.image_url || postDetail.image_url)}
                                  alt={activeCopy.platform}
                                  className="w-full h-full object-cover"
                                />
                                <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded bg-black/80 backdrop-blur-sm text-[10px] font-mono text-zinc-300">
                                  {activeCopy.aspect_ratio || '1:1'}
                                </div>
                              </div>
                            )}

                            {/* Caption Text Box */}
                            <div className="space-y-1.5">
                              <label className="text-[10px] font-bold uppercase tracking-wider text-muted">
                                Real Caption
                              </label>
                              <div className="p-3.5 rounded-xl bg-surface border border-border text-xs sm:text-sm text-text leading-relaxed whitespace-pre-wrap font-sans">
                                {activeCopy.caption || 'No caption text for this platform.'}
                              </div>
                            </div>

                            {/* Hashtags */}
                            {(() => {
                              const raw = activeCopy.hashtags
                              let tags: string[] = []
                              if (Array.isArray(raw)) tags = raw
                              else if (typeof raw === 'string') {
                                try {
                                  const p = JSON.parse(raw)
                                  tags = Array.isArray(p) ? p : raw.split(/\s+/)
                                } catch {
                                  tags = raw.split(/\s+/)
                                }
                              }
                              tags = tags.filter(Boolean)
                              if (tags.length === 0) return null
                              return (
                                <div className="space-y-1.5">
                                  <label className="text-[10px] font-bold uppercase tracking-wider text-muted">
                                    Hashtags
                                  </label>
                                  <div className="flex flex-wrap gap-1.5">
                                    {tags.map((h, i) => (
                                      <span key={i} className="px-2 py-0.5 rounded-md bg-accent/10 text-accent border border-accent/20 text-[11px] font-medium">
                                        {h.startsWith('#') ? h : `#${h}`}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              )
                            })()}

                            {/* Actions Toolbar: Publish / Schedule / Retry */}
                            <div className="pt-2 border-t border-border space-y-3">
                              <label className="text-[10px] font-bold uppercase tracking-wider text-muted">
                                Platform Actions
                              </label>

                              {schedulingCopyId === activeCopy.id ? (
                                <div className="p-3 rounded-xl bg-surface border border-border space-y-2">
                                  <label className="text-xs font-bold text-text">Choose Date &amp; Time:</label>
                                  <input
                                    type="datetime-local"
                                    value={scheduledDateTime}
                                    onChange={(e) => setScheduledDateTime(e.target.value)}
                                    className="w-full px-3 py-2 rounded-lg bg-surface-secondary border border-border text-xs text-text outline-none focus:border-accent"
                                  />
                                  <div className="flex items-center gap-2 pt-1">
                                    <button
                                      type="button"
                                      onClick={() => handleScheduleCopy(activeCopy.id, activeCopy.platform)}
                                      className="px-3 py-1.5 rounded-lg bg-accent text-black font-extrabold text-xs"
                                    >
                                      Confirm Schedule
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setSchedulingCopyId(null)}
                                      className="px-3 py-1.5 rounded-lg bg-surface-secondary text-muted text-xs font-bold"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <div className="grid grid-cols-3 gap-2">
                                  <button
                                    type="button"
                                    onClick={() => handlePublishCopy(activeCopy.id, activeCopy.platform)}
                                    disabled={isPublishing === activeCopy.id}
                                    className="py-2.5 px-3 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs font-extrabold flex items-center justify-center gap-1.5 transition active:scale-98 disabled:opacity-50"
                                  >
                                    {isPublishing === activeCopy.id ? (
                                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    ) : (
                                      <Send className="h-3.5 w-3.5" />
                                    )}
                                    <span>Publish Now</span>
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => {
                                      setSchedulingCopyId(activeCopy.id);
                                      const d = new Date();
                                      d.setHours(d.getHours() + 2);
                                      setScheduledDateTime(d.toISOString().slice(0, 16));
                                    }}
                                    className="py-2.5 px-3 rounded-xl bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/30 text-xs font-extrabold flex items-center justify-center gap-1.5 transition active:scale-98"
                                  >
                                    <Calendar className="h-3.5 w-3.5" />
                                    <span>Schedule</span>
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => handleRetryCopy(activeCopy.id, activeCopy.platform)}
                                    className="py-2.5 px-3 rounded-xl bg-surface hover:bg-surface-hover text-zinc-300 border border-border text-xs font-extrabold flex items-center justify-center gap-1.5 transition active:scale-98"
                                  >
                                    <RotateCcw className="h-3.5 w-3.5" />
                                    <span>Retry / Reset</span>
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              ) : null}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      
    </div>
  )
}
