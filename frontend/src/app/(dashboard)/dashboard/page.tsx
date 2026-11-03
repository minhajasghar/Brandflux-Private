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
import { resolveMediaUrl } from '@/lib/media'

interface RecentGeneration {
  id: string
  session_date: string
  session_theme: string
  instagram_caption?: string
  linkedin_caption?: string
  platforms_generated: string[]
  image_url?: string | null
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
  const [recentGenerations, setRecentGenerations] = useState<RecentGeneration[]>([])
  
  const [isSessionCompletedToday, setIsSessionCompletedToday] = useState(false)
  const [changesDetected, setChangesDetected] = useState(false)
  
  const [isLoading, setIsLoading] = useState(true)
  const [isRescanning, setIsRescanning] = useState(false)

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

  const renderPlatformBadge = (platform: string) => {
    const p = platform.toLowerCase()
    if (p.includes('instagram')) {
      return (
        <span
          key={platform}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#E1306C]/10 border border-[#E1306C]/30 text-[#FF75A0] text-[10px] font-bold"
          title="Instagram"
        >
          <svg className="h-2.5 w-2.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect>
            <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path>
            <line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line>
          </svg>
          <span>Instagram</span>
        </span>
      )
    }
    if (p.includes('linkedin')) {
      return (
        <span
          key={platform}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#0077B5]/10 border border-[#0077B5]/30 text-[#4CB5F9] text-[10px] font-bold"
          title="LinkedIn"
        >
          <svg className="h-2.5 w-2.5 shrink-0 fill-current" viewBox="0 0 24 24">
            <path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.28 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.75M6.46 10.9v8.37H9.2V10.9H6.46M7.83 6.45a1.64 1.64 0 1 0 0 3.28 1.64 1.64 0 0 0 0-3.28z"/>
          </svg>
          <span>LinkedIn</span>
        </span>
      )
    }
    if (p.includes('facebook')) {
      return (
        <span
          key={platform}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#1877F2]/10 border border-[#1877F2]/30 text-[#70AEFF] text-[10px] font-bold"
          title="Facebook"
        >
          <svg className="h-2.5 w-2.5 shrink-0 fill-current" viewBox="0 0 24 24">
            <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
          </svg>
          <span>Facebook</span>
        </span>
      )
    }
    if (p.includes('twitter') || p.includes('x')) {
      return (
        <span
          key={platform}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/10 border border-white/20 text-text text-[10px] font-bold"
          title="Twitter / X"
        >
          <svg className="h-2.5 w-2.5 shrink-0 fill-current" viewBox="0 0 24 24">
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
          </svg>
          <span>Twitter / X</span>
        </span>
      )
    }
    return (
      <span
        key={platform}
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-surface-secondary border border-border text-muted text-[10px] font-bold"
      >
        <Globe className="h-2.5 w-2.5 shrink-0 text-muted" />
        <span>{platform}</span>
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

      {/* ─── SECTION 4: RECENT GENERATIONS ─── */}
      <section className="bg-surface border border-border rounded-2xl sm:rounded-3xl p-4 sm:p-6 shadow-sm space-y-4 sm:space-y-5">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5 min-w-0 pr-2">
            <h3 className="text-base sm:text-lg font-extrabold tracking-tight text-text truncate">Recent Content</h3>
            <p className="text-[11px] sm:text-xs text-muted font-medium truncate">Your latest multi-platform generations created in one tap</p>
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
            {recentGenerations.map((gen) => (
              <div 
                key={gen.id} 
                onClick={() => router.push(`/ideas?id=${gen.id}`)}
                className="flex items-center justify-between gap-3 sm:gap-4 py-3.5 sm:py-4 first:pt-0 last:pb-0 group cursor-pointer hover:bg-surface-secondary/50 rounded-xl px-2 -mx-2 transition"
              >
                <div className="flex items-center gap-3 sm:gap-4 min-w-0 flex-1">
                  {/* Visual Asset Thumbnail */}
                  <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-xl bg-surface-secondary border border-border overflow-hidden flex-shrink-0 flex items-center justify-center relative">
                    {gen.image_url ? (
                      <img 
                        src={resolveMediaUrl(gen.image_url)} 
                        alt={gen.session_theme || 'Generated visual'} 
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
                        {gen.session_theme || 'Campaign Pack'}
                      </p>
                      <span className="hidden sm:inline-block h-1 w-1 rounded-full bg-border" />
                      <span className="text-[11px] text-muted flex items-center gap-1 shrink-0">
                        <Clock className="h-3 w-3" />
                        {formatGeneratedDate(gen.created_at || gen.session_date)}
                      </span>
                    </div>

                    {/* Multi-Platform Badges */}
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {gen.platforms_generated?.map((p: string) => renderPlatformBadge(p))}
                    </div>
                    
                    <p className="text-[11px] sm:text-xs text-muted truncate pr-2 font-normal">
                      {gen.instagram_caption || gen.linkedin_caption || 'Multi-platform copy generated across all connected channels'}
                    </p>
                  </div>
                </div>

                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    router.push(`/ideas?id=${gen.id}`)
                  }}
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
