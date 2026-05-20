'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Sparkles, 
  ArrowRight, 
  CheckCircle2, 
  Clock, 
  Palette,
  Globe,
  Loader2,
  RefreshCcw,
  AlertTriangle,
  FileText,
  Calendar,
  Activity,
  Layers,
  Flame,
  Share2
} from 'lucide-react'
import api from '@/lib/api'
import { Brand } from '@/lib/types'
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
      
      // Update local brand state if new data is scanned
      if (res.data && res.data.brand_data) {
        setBrand((prev: any) => prev ? {
          ...prev,
          business_name: res.data.brand_data.business_name,
          detected_products: res.data.brand_data.products_services,
          colors: res.data.brand_data.colors,
          last_scanned_at: new Date().toISOString()
        } : null)
      }

      if (res.data.changes_detected) {
        setChangesDetected(true)
        toast.success('Website changes detected! Content recommendations updated.', { id: 'rescan' })
      } else {
        toast.success('Scan complete. No website changes detected.', { id: 'rescan' })
      }
      
      // Refresh stats in case
      const statsRes = await api.get('/brand/stats')
      setStats(statsRes.data)
    } catch (err: any) {
      console.error('Rescan failed:', err)
      toast.error(err.response?.data?.detail || 'Failed to rescan website.', { id: 'rescan' })
    } finally {
      setIsRescanning(false)
    }
  }

  // Get current date string
  const getCurrentFormattedDate = () => {
    const options: Intl.DateTimeFormatOptions = { weekday: 'long', month: 'short', day: 'numeric' }
    return new Date().toLocaleDateString('en-US', options)
  }

  // Get platform icon based on platform name
  const getPlatformIcon = (platform: string) => {
    const cleanPlatform = platform.toLowerCase()
    if (cleanPlatform.includes('instagram_story') || cleanPlatform.includes('story')) {
      return <Share2 className="h-5 w-5 text-pink-400" />
    }
    if (cleanPlatform.includes('instagram')) {
      return (
        <svg className="h-5 w-5 text-pink-500 fill-current" viewBox="0 0 24 24">
          <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.051.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
        </svg>
      )
    }
    if (cleanPlatform.includes('linkedin')) {
      return (
        <svg className="h-5 w-5 text-blue-500 fill-current" viewBox="0 0 24 24">
          <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.779-1.75-1.75s.784-1.75 1.75-1.75 1.75.779 1.75 1.75-.784 1.75-1.75 1.75zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z" />
        </svg>
      )
    }
    if (cleanPlatform.includes('facebook')) {
      return (
        <svg className="h-5 w-5 text-blue-600 fill-current" viewBox="0 0 24 24">
          <path d="M9 8h-3v4h3v12h5v-12h3.642l.358-4h-4v-1.667c0-.955.192-1.333 1.115-1.333h2.885v-5h-3.808c-3.596 0-5.192 1.583-5.192 4.615v3.385z" />
        </svg>
      )
    }
    return <Globe className="h-5 w-5 text-indigo-400" />
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
      <div className="space-y-8 max-w-6xl mx-auto">
        {/* Brand Profile Skeleton */}
        <div className="bg-white/[0.02] border border-white/5 rounded-3xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-center gap-6 flex-1">
            <Skeleton width="56px" height="56px" rounded="2xl" />
            <div className="space-y-2 flex-1 max-w-md">
              <Skeleton width="40%" height="24px" rounded="md" />
              <Skeleton width="60%" height="16px" rounded="md" />
            </div>
          </div>
          <div className="flex gap-2">
            <Skeleton width="32px" height="32px" rounded="full" />
            <Skeleton width="32px" height="32px" rounded="full" />
            <Skeleton width="32px" height="32px" rounded="full" />
          </div>
        </div>

        {/* Daily Prompt Skeleton */}
        <div className="bg-white/[0.02] border border-white/5 rounded-[2rem] p-8 space-y-4">
          <Skeleton width="20%" height="20px" rounded="full" />
          <Skeleton width="50%" height="32px" rounded="md" />
          <Skeleton width="70%" height="16px" rounded="md" />
        </div>

        {/* Stats Row Skeleton */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-white/[0.02] border border-white/5 rounded-2xl p-5 space-y-3">
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
    <div className="space-y-8 max-w-6xl mx-auto">
      
      {/* ─── DYNAMIC BANNER: WEBSITE CHANGES DETECTED ─── */}
      <AnimatePresence>
        {changesDetected && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="flex items-start gap-4 p-4 rounded-2xl bg-gradient-to-r from-amber-500/10 to-yellow-500/10 border border-amber-500/30 text-amber-300 shadow-lg shadow-amber-500/5"
          >
            <AlertTriangle className="h-6 w-6 text-amber-400 flex-shrink-0 animate-bounce" />
            <div className="flex-1">
              <h4 className="font-extrabold text-sm text-white">Your website has changes!</h4>
              <p className="text-xs text-amber-300/80 mt-0.5 leading-relaxed">
                We detected updates on your website. New brand insights and updated content recommendations are now ready for you!
              </p>
            </div>
            <button 
              onClick={() => setChangesDetected(false)}
              className="text-xs font-bold px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 transition text-amber-200"
            >
              Dismiss
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── SECTION 1: BRAND STATUS BAR ─── */}
      <section className="bg-white/[0.02] border border-white/5 rounded-3xl p-6 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-6 relative overflow-hidden backdrop-blur-md">
        <div className="absolute top-0 right-0 h-40 w-40 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none" />
        
        <div className="flex flex-wrap items-center gap-6 z-10">
          {/* Logo or Globe */}
          <div className="h-14 w-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center shadow-inner">
            {brand?.logo_url ? (
              <img 
                src={brand.logo_url} 
                className="h-10 w-10 object-contain rounded-lg" 
                alt="Brand Logo" 
                onError={(e) => {
                  (e.target as HTMLElement).style.display = 'none'
                }}
              />
            ) : (
              <Globe className="h-7 w-7 text-indigo-400" />
            )}
          </div>
          
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <h2 className="text-2xl font-black tracking-tight">{brand?.business_name || 'My Brand'}</h2>
              <span className="px-2.5 py-0.5 rounded-md bg-indigo-500/10 border border-indigo-500/20 text-[10px] font-bold text-indigo-300 uppercase tracking-wider">
                {brand?.business_type || 'Business'}
              </span>
            </div>
            
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-400">
              <a 
                href={brand?.website_url || '#'} 
                target="_blank" 
                rel="noreferrer" 
                className="hover:underline flex items-center gap-1.5 text-blue-400"
              >
                <Globe className="h-3.5 w-3.5" />
                {brand?.website_url || 'No URL scanned'}
              </a>
              <span className="text-white/10 hidden sm:inline">|</span>
              <div className="flex items-center gap-1.5 text-gray-500">
                <Clock className="h-3.5 w-3.5" />
                <span>
                  Last Scanned: {brand?.last_scanned_at ? formatGeneratedDate(brand.last_scanned_at) : 'Not scanned yet'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* 5 Palette Color Dots & Rescan Button */}
        <div className="flex items-center justify-between md:justify-end gap-6 z-10 border-t border-white/5 md:border-t-0 pt-4 md:pt-0">
          <div className="space-y-1.5">
            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest text-left md:text-right">Brand Colors</p>
            <div className="flex gap-1.5">
              {brand?.colors && brand.colors.length > 0 ? (
                brand.colors.slice(0, 5).map((color: string, i: number) => (
                  <div 
                    key={i} 
                    className="h-6 w-6 rounded-full border border-white/15 shadow-sm hover:scale-110 transition-transform duration-200 cursor-pointer"
                    style={{ backgroundColor: color }}
                    title={color}
                  />
                ))
              ) : (
                // Safe design default color dots
                ['#3B82F6', '#8B5CF6', '#EC4899', '#10B981', '#F59E0B'].map((color: string, i: number) => (
                  <div 
                    key={i} 
                    className="h-6 w-6 rounded-full border border-white/15"
                    style={{ backgroundColor: color }}
                  />
                ))
              )}
              {/* Padding dots if brand palette is under 5 colors */}
              {brand?.colors && brand.colors.length > 0 && brand.colors.length < 5 && (
                Array.from({ length: 5 - brand.colors.length }).map((_, i: number) => (
                  <div 
                    key={i} 
                    className="h-6 w-6 rounded-full border border-dashed border-white/20 bg-white/5"
                  />
                ))
              )}
            </div>
          </div>

          <button
            onClick={handleRescanWebsite}
            disabled={isRescanning}
            className="flex items-center gap-2 px-5 py-3 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 font-bold text-sm transition-all active:scale-[0.98] disabled:opacity-50"
          >
            {isRescanning ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin text-indigo-400" />
                Rescanning...
              </>
            ) : (
              <>
                <RefreshCcw className="h-4 w-4 text-gray-400" />
                Rescan Website
              </>
            )}
          </button>
        </div>
      </section>

      {/* ─── SECTION 2: DAILY PROMPT CARD ─── */}
      <section>
        {isSessionCompletedToday ? (
          /* GREEN CARD: SESSION COMPLETED */
          <motion.div 
            initial={{ scale: 0.98, opacity: 0.9 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-gradient-to-br from-emerald-900/40 via-green-950/20 to-emerald-950/40 border border-emerald-500/20 rounded-[2rem] p-8 text-center md:text-left flex flex-col md:flex-row md:items-center justify-between gap-6 shadow-xl shadow-emerald-950/10 relative overflow-hidden"
          >
            <div className="absolute -top-12 -right-12 h-44 w-44 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />
            <div className="space-y-3">
              <div className="flex flex-col md:flex-row items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center">
                  <CheckCircle2 className="h-6 w-6 text-emerald-400 animate-pulse" />
                </div>
                <h3 className="text-2xl font-black text-white">Content created today</h3>
              </div>
              <p className="text-gray-400 text-sm max-w-xl">
                Awesome! You completed your smart questions for today, {getCurrentFormattedDate()}. Your custom captions, hashtags, story prompts, and LinkedIn posts are generated and ready for review.
              </p>
            </div>
            <button
              onClick={() => router.push('/session')}
              className="px-6 py-4 rounded-xl bg-emerald-500 text-black font-extrabold text-sm hover:bg-emerald-400 transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/10 active:scale-[0.98]"
            >
              View Generated Content
              <ArrowRight className="h-4 w-4" />
            </button>
          </motion.div>
        ) : (
          /* HIGHLIGHTED CREATION PROMPT CARD */
          <div className="bg-gradient-to-tr from-blue-600/90 via-indigo-600/80 to-purple-600/90 border border-blue-500/30 rounded-[2rem] p-8 text-center md:text-left flex flex-col md:flex-row md:items-center justify-between gap-8 shadow-2xl shadow-indigo-600/15 relative overflow-hidden group">
            {/* Dynamic visual overlay */}
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_bottom_left,rgba(255,255,255,0.08),transparent)] pointer-events-none" />
            <div className="absolute top-1/2 -right-12 h-64 w-64 bg-white/5 rounded-full blur-3xl pointer-events-none group-hover:scale-110 transition-transform duration-1000" />
            
            <div className="space-y-2 z-10">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 backdrop-blur-md text-[10px] font-black uppercase tracking-widest text-white/95 select-none">
                <Sparkles className="h-3 w-3 text-yellow-300 fill-yellow-300 animate-bounce" />
                Today's Opportunity
              </div>
              
              <h3 className="text-3xl font-black text-white tracking-tight">Ready to create today's content?</h3>
              <p className="text-blue-100/80 text-sm max-w-lg leading-relaxed font-medium">
                Answer three tailored, smart questions about your day to instantly craft high-converting, custom posts for all your platforms on <span className="underline decoration-yellow-400 decoration-2">{getCurrentFormattedDate()}</span>.
              </p>
            </div>
            
            <button
              onClick={() => router.push('/session')}
              className="z-10 px-8 py-5 rounded-2xl bg-white text-black font-black text-lg hover:bg-gray-100 transition-all flex items-center justify-center gap-3 shadow-2xl active:scale-[0.98] group/btn whitespace-nowrap self-center md:self-auto"
            >
              Start Today's Session
              <ArrowRight className="h-5 w-5 group-hover/btn:translate-x-1.5 transition-transform duration-200" />
            </button>
          </div>
        )}
      </section>

      {/* ─── SECTION 3: STATS ROW ─── */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* Stat Card 1 */}
        <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-5 hover:bg-white/[0.04] transition-colors relative overflow-hidden">
          <div className="h-8 w-8 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 mb-4">
            <FileText className="h-4 w-4" />
          </div>
          <p className="text-2xs font-extrabold text-gray-500 uppercase tracking-widest">Created This Month</p>
          <p className="text-3xl font-black tracking-tight mt-1">
            {stats?.posts_created_this_month || 0}
          </p>
          <span className="text-[10px] font-semibold text-gray-400">posts generated</span>
        </div>

        {/* Stat Card 2 */}
        <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-5 hover:bg-white/[0.04] transition-colors relative overflow-hidden">
          <div className="h-8 w-8 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400 mb-4">
            <Activity className="h-4 w-4" />
          </div>
          <p className="text-2xs font-extrabold text-gray-500 uppercase tracking-widest">Sessions Completed</p>
          <p className="text-3xl font-black tracking-tight mt-1">
            {stats?.sessions_completed_this_week || 0}
          </p>
          <span className="text-[10px] font-semibold text-gray-400">this week</span>
        </div>

        {/* Stat Card 3 */}
        <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-5 hover:bg-white/[0.04] transition-colors relative overflow-hidden">
          <div className="h-8 w-8 rounded-xl bg-pink-500/10 border border-pink-500/20 flex items-center justify-center text-pink-400 mb-4">
            <Layers className="h-4 w-4" />
          </div>
          <p className="text-2xs font-extrabold text-gray-500 uppercase tracking-widest">Most Used Platform</p>
          <p className="text-xl font-extrabold truncate tracking-tight mt-2.5 mb-1.5" title={stats?.most_used_platform}>
            {stats?.most_used_platform || 'Instagram'}
          </p>
          <span className="text-[10px] font-semibold text-gray-400">active channels</span>
        </div>

        {/* Stat Card 4 - Streak Widget */}
        <div className="col-span-2 lg:col-span-1">
          <StreakWidget />
        </div>

      </section>

      {/* ─── SECTION 4: RECENT CONTENT ─── */}
      <section className="bg-white/[0.02] border border-white/5 rounded-3xl p-6 shadow-xl space-y-6 relative overflow-hidden backdrop-blur-md">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <h3 className="text-lg font-black tracking-tight">Recent Content</h3>
            <p className="text-xs text-gray-500 font-medium">Your last 5 generated social posts across all channels</p>
          </div>
          
          <button 
            onClick={() => router.push('/session')} 
            className="text-xs font-bold text-blue-400 hover:text-blue-300 transition flex items-center gap-1 bg-blue-500/5 hover:bg-blue-500/10 border border-blue-500/10 px-3.5 py-2 rounded-xl"
          >
            Create More
            <ArrowRight className="h-3 w-3" />
          </button>
        </div>

        {recentPosts.length === 0 ? (
          <EmptyState
            emoji="✨"
            title="No content yet"
            subtitle="Create your first content to see it here"
            buttonText="Create Now"
            onButtonClick={() => router.push('/session')}
          />
        ) : (
          <div className="divide-y divide-white/5">
            {recentPosts.map((post) => (
              <div 
                key={post.id} 
                className="flex items-center justify-between gap-4 py-4.5 first:pt-0 last:pb-0 group hover:bg-white/[0.01] px-2 -mx-2 rounded-xl transition-colors duration-150"
              >
                <div className="flex items-center gap-4 min-w-0 flex-1">
                  {/* Platform Icon container */}
                  <div className="h-10 w-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center shadow-inner flex-shrink-0 group-hover:scale-105 transition-transform duration-200">
                    {getPlatformIcon(post.platform)}
                  </div>
                  
                  {/* Content details */}
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-2.5">
                      <p className="text-sm font-bold text-white tracking-wide truncate">
                        {getPlatformLabel(post.platform)}
                      </p>
                      <span className="hidden sm:inline-block h-1 w-1 rounded-full bg-white/20" />
                      <span className="text-[10px] text-gray-500 font-semibold flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatGeneratedDate(post.created_at)}
                      </span>
                    </div>
                    
                    <p className="text-xs text-gray-400 truncate pr-4 leading-relaxed font-medium">
                      {post.caption ? post.caption.replace(/<[^>]*>/g, '') : 'No caption content generated'}
                    </p>
                  </div>
                </div>

                {/* View Button */}
                <button
                  onClick={() => router.push('/session')}
                  className="px-4 py-2 rounded-xl bg-white/5 hover:bg-blue-600 hover:text-white hover:border-blue-500 border border-white/10 font-bold text-xs text-gray-300 transition-all flex items-center gap-1 shadow-sm active:scale-[0.98]"
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
