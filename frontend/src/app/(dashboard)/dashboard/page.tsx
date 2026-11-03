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
  Layers 
} from 'lucide-react'
import api from '@/lib/api'
import { toast } from 'react-hot-toast'
import Skeleton from '@/components/ui/Skeleton'
import StreakWidget from '@/components/dashboard/StreakWidget'
import EmptyState from '@/components/ui/EmptyState'

interface GeneratedPost {
  id: string
  platform: string
  caption?: string
  hashtags?: string[]
  status: string
  created_at: string
}

interface BrandStats {
  posts_created_this_month: number
  sessions_completed_this_week: number
  most_used_platform: string
  streak_days: number
}

export default function DashboardPage() {
  const router = useRouter()
  
  // State variables
  const [brand, setBrand] = useState<any | null>(null)
  const [stats, setStats] = useState<BrandStats | null>(null)
  const [recentPosts, setRecentPosts] = useState<GeneratedPost[]>([])
  
  const [isSessionCompletedToday, setIsSessionCompletedToday] = useState(false)
  const [changesDetected, setChangesDetected] = useState(false)
  
  const [isLoading, setIsLoading] = useState(true)
  const [isRescanning, setIsRescanning] = useState(false)

  // Fetch all dashboard data
  const fetchDashboardData = async () => {
    try {
      const [brandRes, sessionRes, statsRes, postsRes] = await Promise.all([
        api.get('/brand/profile'),
        api.get('/sessions/today'),
        api.get('/brand/stats'),
        api.get('/content/posts?limit=5')
      ])

      setBrand(brandRes.data)
      
      // Check if session has answers filled in (daily session complete)
      if (sessionRes.data && sessionRes.data.answer_1 && sessionRes.data.answer_2 && sessionRes.data.answer_3) {
        setIsSessionCompletedToday(true)
      } else {
        setIsSessionCompletedToday(false)
      }

      setStats(statsRes.data)
      setRecentPosts(postsRes.data || [])

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

  // Format date nicely
  const getCurrentFormattedDate = () => {
    const today = new Date()
    return today.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
  }

  // Platform icons
  const getPlatformIcon = (platform: string) => {
    const cleanPlatform = platform.toLowerCase()
    if (cleanPlatform.includes('instagram')) {
      return (
        <svg className="h-5 w-5 text-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
          <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
          <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
        </svg>
      )
    }
    if (cleanPlatform.includes('linkedin')) {
      return (
        <svg className="h-5 w-5 text-primary fill-current" viewBox="0 0 24 24">
          <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.779-1.75-1.75s.784-1.75 1.75-1.75 1.75.779 1.75 1.75-.784 1.75-1.75 1.75zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z" />
        </svg>
      )
    }
    if (cleanPlatform.includes('facebook')) {
      return (
        <svg className="h-5 w-5 text-primary fill-current" viewBox="0 0 24 24">
          <path d="M9 8h-3v4h3v12h5v-12h3.642l.358-4h-4v-1.667c0-.955.192-1.333 1.115-1.333h2.885v-5h-3.808c-3.596 0-5.192 1.583-5.192 4.615v3.385z" />
        </svg>
      )
    }
    return <Globe className="h-5 w-5 text-muted" />
  }

  // Get platform label
  const getPlatformLabel = (platform: string) => {
    const cleanPlatform = platform.toLowerCase()
    if (cleanPlatform === 'instagram_post') return 'Instagram Post'
    if (cleanPlatform === 'instagram_story') return 'Instagram Story'
    if (cleanPlatform === 'linkedin_post') return 'LinkedIn Post'
    if (cleanPlatform === 'facebook_post') return 'Facebook Post'
    return platform.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())
  }

  // Format date generated
  const formatGeneratedDate = (dateString: string) => {
    if (!dateString) return 'Just now'
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
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
          <span className="text-[10px] sm:text-[11px] font-medium text-muted">posts generated</span>
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
          <p className="text-lg sm:text-xl font-extrabold text-text truncate tracking-tight mt-2 mb-1" title={stats?.most_used_platform}>
            {stats?.most_used_platform || 'Instagram'}
          </p>
          <span className="text-[10px] sm:text-[11px] font-medium text-muted">active channel</span>
        </div>

        {/* Stat Card 4 - Streak Widget */}
        <div className="col-span-2 lg:col-span-1">
          <StreakWidget />
        </div>

      </section>

      {/* ─── SECTION 4: RECENT CONTENT ─── */}
      <section className="bg-surface border border-border rounded-2xl sm:rounded-3xl p-4 sm:p-6 shadow-sm space-y-4 sm:space-y-5">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5 min-w-0 pr-2">
            <h3 className="text-base sm:text-lg font-extrabold tracking-tight text-text truncate">Recent Content</h3>
            <p className="text-[11px] sm:text-xs text-muted font-medium truncate">Your last 5 generated social posts across all channels</p>
          </div>
          
          <button 
            onClick={() => router.push('/session')} 
            className="text-xs font-bold text-accent hover:underline flex items-center gap-1 shrink-0"
          >
            Create More
            <ArrowRight className="h-3 w-3" />
          </button>
        </div>

        {recentPosts.length === 0 ? (
          <EmptyState
            emoji="✨"
            title="No content yet"
            subtitle="Complete your first session to see generated posts here."
            buttonText="Create Now"
            onButtonClick={() => router.push('/session')}
          />
        ) : (
          <div className="divide-y divide-border">
            {recentPosts.map((post) => (
              <div 
                key={post.id} 
                className="flex items-center justify-between gap-3 sm:gap-4 py-3.5 sm:py-4 first:pt-0 last:pb-0 group"
              >
                <div className="flex items-center gap-3 sm:gap-4 min-w-0 flex-1">
                  <div className="h-9 w-9 sm:h-10 sm:w-10 rounded-xl bg-surface-secondary border border-border flex items-center justify-center flex-shrink-0">
                    {getPlatformIcon(post.platform)}
                  </div>
                  
                  <div className="min-w-0 flex-1 space-y-0.5 sm:space-y-1">
                    <div className="flex items-center gap-2">
                      <p className="text-xs sm:text-sm font-bold text-text truncate">
                        {getPlatformLabel(post.platform)}
                      </p>
                      <span className="hidden sm:inline-block h-1 w-1 rounded-full bg-border" />
                      <span className="hidden sm:flex text-[11px] text-muted items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatGeneratedDate(post.created_at)}
                      </span>
                    </div>
                    
                    <p className="text-[11px] sm:text-xs text-muted truncate pr-2 font-normal">
                      {post.caption ? post.caption.replace(/<[^>]*>/g, '') : 'No caption content generated'}
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => router.push('/session')}
                  className="px-3 sm:px-3.5 py-1.5 rounded-xl bg-surface-secondary hover:bg-surface-hover border border-border font-bold text-xs text-text transition-all active:scale-[0.98] shrink-0 min-h-[36px]"
                >
                  View
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
      
    </div>
  )
}
