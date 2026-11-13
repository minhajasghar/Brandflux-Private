'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Globe, 
  History, 
  Clock, 
  ExternalLink,
  ChevronRight, 
  X, 
  Plus, 
  Loader2, 
  Bookmark, 
  ArrowRight,
  RotateCcw,
  ShieldCheck
} from 'lucide-react'
import api, { submitPostForApproval } from '@/lib/api'
import { toast } from 'react-hot-toast'
import CopyButton from '@/components/ui/CopyButton'
import Skeleton from '@/components/ui/Skeleton'
import EmptyState from '@/components/ui/EmptyState'
import { resolveMediaUrl } from '@/lib/media'
import { SocialIcon } from '@/components/shared/SocialIcons'

interface HistoryItem {
  id: string
  session_date: string
  session_theme: string
  title?: string
  caption?: string
  instagram_caption?: string
  linkedin_caption?: string
  platforms_generated: string[]
  platform_statuses?: Record<string, string>
  copies?: any[]
  copies_count?: number
  image_url?: string | null
  created_at: string
}

interface SavedTemplate {
  id: string
  content_id: string
  platform: string
  custom_name: string
  caption: string
  hashtags: string[]
  created_at: string
}

const safeHashtags = (raw: any): string[] => {
  if (!raw) return []
  if (Array.isArray(raw)) return raw.filter(Boolean)
  if (typeof raw === 'string') {
    try {
      const p = JSON.parse(raw)
      if (Array.isArray(p)) return p.filter(Boolean)
    } catch {}
    return raw.split(/\s+/).filter(Boolean)
  }
  return []
}

export default function IdeasPage() {
  const router = useRouter()
  
  // Navigation Tabs
  const [activeTab, setActiveTab] = useState<'history' | 'templates'>('history')
  
  // History State
  const [historyItems, setHistoryItems] = useState<HistoryItem[]>([])
  const [loadingHistory, setLoadingHistory] = useState(true)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  
  // Filters State
  const [platformFilter, setPlatformFilter] = useState<'all' | 'instagram' | 'linkedin' | 'facebook' | 'twitter' | 'tiktok'>('all')
  const [statusFilter, setStatusFilter] = useState<'all' | 'not_posted' | 'scheduled' | 'published'>('all')
  const [dateFilter, setDateFilter] = useState<'all' | 'week' | 'month'>('all')
  const [isPublishing, setIsPublishing] = useState<string | null>(null)
  const [schedulingCopyId, setSchedulingCopyId] = useState<string | null>(null)
  const [scheduledDateTime, setScheduledDateTime] = useState<string>('')
  const [selectedCopyIdsToPublish, setSelectedCopyIdsToPublish] = useState<string[]>([])
  const [isBatchPublishing, setIsBatchPublishing] = useState(false)
  const [isDeletingUnused, setIsDeletingUnused] = useState(false)

  // Templates State
  const [templates, setTemplates] = useState<SavedTemplate[]>([])
  const [loadingTemplates, setLoadingTemplates] = useState(false)

  // Drawer Detail State
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)
  const [sessionDetail, setSessionDetail] = useState<any | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [activeDetailTab, setActiveDetailTab] = useState('instagram_post')

  // Save Template Dialog State
  const [savingPost, setSavingPost] = useState<{ content_id: string; platform: string; default_title: string } | null>(null)
  const [templateName, setTemplateName] = useState('')
  const [isSavingTemplate, setIsSavingTemplate] = useState(false)
  const [isSubmittingApproval, setIsSubmittingApproval] = useState(false)

  // Fetch History Items
  const fetchHistory = async (resetPage = false, currentStatus = statusFilter) => {
    const targetPage = resetPage ? 1 : page
    if (resetPage) setLoadingHistory(true)
    else setLoadingMore(true)

    try {
      const res = await api.get(`/content/history?page=${targetPage}&limit=6&status=${currentStatus}`)
      if (res.data) {
        if (resetPage) {
          setHistoryItems(res.data.items || [])
        } else {
          setHistoryItems(prev => [...prev, ...(res.data.items || [])])
        }
        setHasMore(res.data.has_more || false)
        setPage(targetPage + 1)
      }
    } catch (err) {
      console.error('Failed to fetch content history:', err)
      toast.error('Could not load history archives.')
    } finally {
      setLoadingHistory(false)
      setLoadingMore(false)
    }
  }

  // Fetch Templates
  const fetchTemplates = async () => {
    setLoadingTemplates(true)
    try {
      const res = await api.get('/content/templates')
      if (res.data) {
        setTemplates(res.data || [])
      }
    } catch (err) {
      console.error('Failed to fetch templates:', err)
      toast.error('Could not load saved templates.')
    } finally {
      setLoadingTemplates(false)
    }
  }

  useEffect(() => {
    fetchHistory(true)
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      const targetId = params.get('id')
      const targetPlatform = params.get('platform')
      if (targetId) {
        openDetailDrawer(targetId, targetPlatform)
      }
    }
  }, [])

  // Switch tabs
  const handleTabChange = (tab: 'history' | 'templates') => {
    setActiveTab(tab)
    if (tab === 'templates' && templates.length === 0) {
      fetchTemplates()
    }
  }

  // Filter history client-side
  const getFilteredItems = () => {
    return historyItems.filter(item => {
      // Platform filter
      if (platformFilter !== 'all') {
        const matchesPlatform = item.platforms_generated?.some(p => {
          const lp = p.toLowerCase()
          if (platformFilter === 'twitter') return lp.includes('twitter') || lp === 'x'
          return lp.includes(platformFilter)
        })
        if (!matchesPlatform) return false
      }

      // Date filter
      if (dateFilter !== 'all') {
        const itemDate = new Date(item.session_date || item.created_at)
        const now = new Date()
        if (dateFilter === 'week') {
          const sevenDaysAgo = new Date(now)
          sevenDaysAgo.setDate(now.getDate() - 7)
          if (itemDate < sevenDaysAgo) return false
        } else if (dateFilter === 'month') {
          const thirtyDaysAgo = new Date(now)
          thirtyDaysAgo.setDate(now.getDate() - 30)
          if (itemDate < thirtyDaysAgo) return false
        }
      }

      return true
    })
  }

  // Open full session detail drawer
  const openDetailDrawer = async (sessionId: string, initialPlatform?: string | null) => {
    setSelectedSessionId(sessionId)
    setLoadingDetail(true)
    try {
      const res = await api.get(`/content/history/${sessionId}`)
      if (res.data) {
        setSessionDetail(res.data)
        if (res.data.copies && Array.isArray(res.data.copies)) {
          // Select only unposted, proven platforms by default (published rows are never checked)
          const selectable = res.data.copies.filter((c: any) => {
            const p = (c.platform || '').toLowerCase();
            const s = (c.status || 'draft').toLowerCase();
            const isProven = p === 'facebook' || p === 'linkedin' || p === 'instagram';
            return isProven && s !== 'published' && s !== 'publishing' && s !== 'needs_reconnect' && s !== 'scheduled';
          }).map((c: any) => c.id || c.copy_id).filter(Boolean);
          setSelectedCopyIdsToPublish(selectable);
        }
        if (initialPlatform) {
          const norm = initialPlatform.toLowerCase()
          if (norm.includes('facebook') && res.data.facebook_post) setActiveDetailTab('facebook_post')
          else if (norm.includes('linkedin') && res.data.linkedin_post) setActiveDetailTab('linkedin_post')
          else if (norm.includes('instagram') && res.data.instagram_post) setActiveDetailTab('instagram_post')
          else if ((norm.includes('twitter') || norm.includes('x')) && res.data.twitter_post) setActiveDetailTab('twitter_post')
          else if (norm.includes('tiktok') && res.data.tiktok) setActiveDetailTab('tiktok')
          else if (norm.includes('story') && res.data.instagram_story) setActiveDetailTab('instagram_story')
          else if (res.data.facebook_post) setActiveDetailTab('facebook_post')
        } else {
          // Prioritize connected Facebook over disconnected platforms
          if (res.data.facebook_post) setActiveDetailTab('facebook_post')
          else if (res.data.linkedin_post) setActiveDetailTab('linkedin_post')
          else if (res.data.instagram_post) setActiveDetailTab('instagram_post')
          else if (res.data.twitter_post) setActiveDetailTab('twitter_post')
          else if (res.data.tiktok) setActiveDetailTab('tiktok')
          else if (res.data.instagram_story) setActiveDetailTab('instagram_story')
        }
      }
    } catch (err) {
      console.error('Failed to fetch session detail:', err)
      toast.error('Could not open session detail view.')
      setSelectedSessionId(null)
    } finally {
      setLoadingDetail(false)
    }
  }

  // Open save template modal
  const triggerSaveTemplate = (contentId: string, platform: string, defaultTitle: string) => {
    setSavingPost({ content_id: contentId, platform, default_title: defaultTitle })
    setTemplateName(defaultTitle || 'My Content Template')
  }

  // Save template submit
  const handleSaveTemplateSubmit = async () => {
    if (!savingPost) return
    setIsSavingTemplate(true)
    try {
      await api.post('/content/templates', {
        content_id: savingPost.content_id,
        platform: savingPost.platform,
        custom_name: templateName.trim() || savingPost.default_title || 'Untitled Template'
      })
      toast.success('Template saved to your collection!')
      setSavingPost(null)
      if (activeTab === 'templates') {
        fetchTemplates()
      }
    } catch (err) {
      console.error('Failed to save template:', err)
      toast.error('Could not save template.')
    } finally {
      setIsSavingTemplate(false)
    }
  }

  // Manual Delete of Unused Image Variants
  const handleDeleteUnusedImages = async () => {
    if (!selectedSessionId) return
    if (!confirm('Are you sure you want to delete all unused image variants for this post? The active image will be preserved.')) return
    try {
      setIsDeletingUnused(true)
      const res = await api.delete(`/content/posts/${selectedSessionId}/unused-images`)
      toast.success(res.data.message || 'Deleted unused images.')
      const updated = await api.get(`/content/history/${selectedSessionId}`)
      setSessionDetail(updated.data)
      fetchHistory(true)
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to delete unused images.')
    } finally {
      setIsDeletingUnused(false)
    }
  }

  const formatDateLabel = (dateStr: string) => {
    if (!dateStr) return ''
    const d = new Date(dateStr)
    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(today.getDate() - 1)

    if (d.toDateString() === today.toDateString()) return 'Today'
    if (d.toDateString() === yesterday.toDateString()) return 'Yesterday'
    
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  const getPlatformIcon = (platform: string) => {
    return <SocialIcon platform={platform} className="h-3.5 w-3.5 shrink-0 inline-block" />
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
        title={`${platformName} • ${statusLabel}`}
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

  const renderPlatformBadge = (platform: string) => {
    return renderPlatformChip(platform, 'draft')
  }

  const getPlatformLabel = (platform: string) => {
    return platform.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())
  }

  const filteredHistory = getFilteredItems()

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-16 relative">
      
      {/* ─── PAGE HEADER ─── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-extrabold text-text tracking-tight">Content History</h1>
          <p className="text-muted text-sm font-medium">All your generated social media assets &amp; custom saved templates</p>
        </div>

        {/* Tab Selector */}
        <div className="flex bg-surface border border-border p-1 rounded-xl self-start md:self-auto">
          <button
            onClick={() => handleTabChange('history')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-bold text-xs transition-all ${
              activeTab === 'history'
                ? 'bg-accent text-black shadow-accent-glow'
                : 'text-muted hover:text-text'
            }`}
          >
            <History className="h-3.5 w-3.5" />
            History Log
          </button>
          <button
            onClick={() => handleTabChange('templates')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-bold text-xs transition-all ${
              activeTab === 'templates'
                ? 'bg-accent text-black shadow-accent-glow'
                : 'text-muted hover:text-text'
            }`}
          >
            <Bookmark className="h-3.5 w-3.5" />
            My Templates
          </button>
        </div>
      </div>

      {activeTab === 'history' ? (
        <>
          {/* ─── STATUS FILTER TABS (All / Not posted yet / Scheduled / Published) ─── */}
          <div className="flex flex-wrap items-center gap-2 border-b border-border pb-3">
            {[
              { id: 'all', label: 'All Posts' },
              { id: 'not_posted', label: 'Not posted yet' },
              { id: 'scheduled', label: 'Scheduled' },
              { id: 'published', label: 'Published' },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => {
                  const s = tab.id as 'all' | 'not_posted' | 'scheduled' | 'published'
                  setStatusFilter(s)
                  fetchHistory(true, s)
                }}
                className={`px-4 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-2 border ${
                  statusFilter === tab.id
                    ? 'bg-accent text-black border-accent shadow-sm'
                    : 'bg-surface-secondary border-border text-muted hover:text-text hover:bg-surface-hover'
                }`}
              >
                <span>{tab.label}</span>
                {tab.id === 'not_posted' && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-black/20 text-current font-extrabold">
                    Drafts
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* ─── FILTER BAR ─── */}
          <div className="flex flex-col md:flex-row gap-4 justify-between bg-surface border border-border p-4 rounded-2xl">
            
            {/* Platform Filters */}
            <div className="flex flex-wrap gap-2">
              {[
                { id: 'all', label: 'All Platforms' },
                { id: 'instagram', label: 'Instagram' },
                { id: 'linkedin', label: 'LinkedIn' },
                { id: 'facebook', label: 'Facebook' },
                { id: 'twitter', label: 'X / Twitter' },
                { id: 'tiktok', label: 'TikTok' },
              ].map(opt => (
                <button
                  key={opt.id}
                  onClick={() => setPlatformFilter(opt.id as any)}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition ${
                    platformFilter === opt.id
                      ? 'bg-accent text-black shadow-sm'
                      : 'bg-surface-secondary border border-border text-muted hover:text-text'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {/* Date Filters */}
            <div className="flex gap-2">
              {[
                { id: 'all', label: 'All Time' },
                { id: 'week', label: 'This Week' },
                { id: 'month', label: 'This Month' },
              ].map(opt => (
                <button
                  key={opt.id}
                  onClick={() => setDateFilter(opt.id as any)}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition ${
                    dateFilter === opt.id
                      ? 'bg-accent text-black shadow-sm'
                      : 'bg-surface-secondary border border-border text-muted hover:text-text'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

          </div>

          {/* ─── HISTORY ITEMS GRID ─── */}
          {loadingHistory ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="bg-surface border border-border p-4 sm:p-6 rounded-2xl sm:rounded-3xl space-y-4">
                  <div className="flex justify-between items-center">
                    <Skeleton width="30%" height="20px" rounded="md" />
                    <Skeleton width="20%" height="20px" rounded="md" />
                  </div>
                  <Skeleton width="70%" height="28px" rounded="md" />
                  <Skeleton width="100%" height="50px" rounded="md" />
                  <Skeleton width="100%" height="40px" rounded="xl" />
                </div>
              ))}
            </div>
          ) : filteredHistory.length === 0 ? (
            <EmptyState
              emoji="📜"
              title="No content found"
              subtitle="No daily session assets match your active filters. Try adjusting your platform or date selection."
              buttonText="Reset Filters"
              onButtonClick={() => {
                setPlatformFilter('all')
                setDateFilter('all')
              }}
            />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
              {filteredHistory.map(item => (
                <motion.div
                  key={item.id}
                  className="bg-surface border border-border p-4 sm:p-6 rounded-2xl sm:rounded-3xl flex flex-col justify-between hover:border-border-light transition-all group shadow-sm"
                >
                  <div className="space-y-4">
                    {/* Card Top: Date & Platform Badges */}
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-muted">
                        <Clock className="h-3.5 w-3.5" />
                        <span>{formatDateLabel(item.session_date || item.created_at)}</span>
                      </div>

                      <div className="flex items-center gap-1.5 flex-wrap justify-end">
                        {item.platforms_generated?.map(p => renderPlatformBadge(p))}
                      </div>
                    </div>

                    {/* Creative Visual Thumbnail (if image saved in DB) */}
                    {item.image_url ? (
                      <div className="relative rounded-2xl overflow-hidden aspect-video bg-black/40 border border-border group/img">
                        <img 
                          src={resolveMediaUrl(item.image_url)} 
                          alt={item.session_theme} 
                          className="w-full h-full object-cover transition duration-300 group-hover/img:scale-105"
                          onError={(e) => {
                            (e.target as HTMLElement).style.display = 'none'
                          }}
                        />
                        {(item.image_url?.includes('test_') || (item as any).source === 'fallback') && (
                          <span className="absolute top-2 left-2 px-2 py-0.5 rounded-md bg-amber-500/90 text-black text-[9px] font-black uppercase tracking-wider shadow">
                            Fallback / Test Graphic
                          </span>
                        )}
                      </div>
                    ) : null}

                    {/* Theme / Description */}
                    <div className="space-y-1">
                      <h3 className="text-lg font-bold text-text leading-snug tracking-tight group-hover:text-accent transition-colors">
                        {item.session_theme}
                      </h3>
                      <p className="text-xs text-muted leading-relaxed line-clamp-2">
                        {item.instagram_caption || item.linkedin_caption || "Click below to review multi-platform text, optimal schedules, and strategies."}
                      </p>
                    </div>
                  </div>

                  {/* Actions Bar */}
                  <div className="flex flex-wrap items-center gap-2 mt-6 border-t border-border pt-4">
                    <button
                      onClick={() => openDetailDrawer(item.id)}
                      className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-surface-secondary hover:bg-surface-hover border border-border text-text font-bold text-xs transition active:scale-[0.98]"
                    >
                      <span>Edit / View</span>
                      <ChevronRight className="h-3.5 w-3.5 text-muted" />
                    </button>

                    <button
                      onClick={() => openDetailDrawer(item.id)}
                      className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-accent/15 hover:bg-accent/25 border border-accent/40 text-accent font-extrabold text-xs transition active:scale-[0.98]"
                      title="Post Now"
                    >
                      <ArrowRight className="h-3.5 w-3.5" />
                      <span>Post now</span>
                    </button>

                    <button
                      onClick={() => openDetailDrawer(item.id)}
                      className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 text-blue-400 font-bold text-xs transition active:scale-[0.98]"
                      title="Schedule"
                    >
                      <Clock className="h-3.5 w-3.5" />
                      <span>Schedule</span>
                    </button>
                    
                    <button
                      onClick={() => triggerSaveTemplate(item.id, item.platforms_generated[0] || 'instagram_post', item.session_theme)}
                      className="p-2 rounded-xl bg-surface-secondary border border-border text-muted hover:text-accent hover:border-accent/30 transition active:scale-[0.98]"
                      title="Save as Template"
                    >
                      <Bookmark className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </motion.div>
              ))}
            </div>
          )}

          {/* Load More Trigger */}
          {hasMore && (
            <div className="mt-8 flex justify-center">
              <button
                onClick={() => fetchHistory()}
                disabled={loadingMore}
                className="flex items-center gap-2 px-6 py-3 rounded-xl bg-surface border border-border hover:bg-surface-secondary text-text font-bold text-xs transition active:scale-[0.98]"
              >
                {loadingMore ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin text-accent" />
                    <span>Loading Archives...</span>
                  </>
                ) : (
                  <>
                    <span>Load More Content</span>
                    <Plus className="h-4 w-4" />
                  </>
                )}
              </button>
            </div>
          )}
        </>
      ) : (
        /* ─── TEMPLATES TAB ─── */
        <>
          {loadingTemplates ? (
            <div className="grid sm:grid-cols-2 gap-6">
              {Array.from({ length: 2 }).map((_, i) => (
                <div key={i} className="bg-surface border border-border p-6 rounded-3xl space-y-4">
                  <Skeleton width="40%" height="20px" rounded="md" />
                  <Skeleton width="100%" height="60px" rounded="md" />
                </div>
              ))}
            </div>
          ) : templates.length === 0 ? (
            <EmptyState
              emoji="🔖"
              title="No templates saved"
              subtitle="You haven't bookmarked any captions yet. Click the bookmark icon on any history post to save it here for quick copying!"
              buttonText="View History"
              onButtonClick={() => handleTabChange('history')}
            />
          ) : (
            <div className="grid sm:grid-cols-2 gap-6">
              {templates.map(tpl => (
                <motion.div
                  key={tpl.id}
                  className="bg-surface border border-border p-6 rounded-3xl flex flex-col justify-between hover:border-border-light transition-all group shadow-sm"
                >
                  <div className="space-y-4">
                    {/* Header: Platform + Date */}
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-2 px-3 py-1 rounded-lg bg-surface-secondary border border-border text-[10px] font-bold uppercase text-text">
                        {getPlatformIcon(tpl.platform)}
                        <span>{getPlatformLabel(tpl.platform)}</span>
                      </div>
                      <span className="text-[10px] text-muted font-bold">
                        {formatDateLabel(tpl.created_at)}
                      </span>
                    </div>

                    {/* Custom Title */}
                    <div className="space-y-2">
                      <h4 className="font-bold text-base text-text tracking-tight leading-snug">
                        {tpl.custom_name}
                      </h4>
                      <div className="bg-surface-secondary border border-border rounded-2xl p-4 text-xs text-text leading-relaxed whitespace-pre-wrap max-h-40 overflow-y-auto scrollbar-thin">
                        {tpl.caption}
                      </div>
                      
                      {tpl.hashtags && tpl.hashtags.length > 0 && (
                        <div className="flex flex-wrap gap-1 pt-1">
                          {tpl.hashtags.map(tag => (
                            <span key={tag} className="text-[10px] font-bold text-accent bg-surface-secondary border border-border px-2 py-0.5 rounded-md">
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Actions: Copy and View Source */}
                  <div className="flex justify-between items-center gap-3 border-t border-border pt-4 mt-6">
                    <CopyButton text={tpl.caption} label="Caption" />
                    
                    <button
                      onClick={async () => {
                        try {
                          await api.get(`/content/history/${tpl.content_id}`)
                          openDetailDrawer(tpl.content_id)
                        } catch {
                          toast.error('Original generation calendar item not found.')
                        }
                      }}
                      className="text-xs font-bold text-muted hover:text-text flex items-center gap-1 bg-surface-secondary px-3 py-1.5 rounded-xl border border-border transition"
                    >
                      View Source
                      <ExternalLink className="h-3 w-3" />
                    </button>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ─── SLIDE DRAWER MODAL ─── */}
      <AnimatePresence>
        {selectedSessionId && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.7 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedSessionId(null)}
              className="fixed inset-0 bg-black z-50 backdrop-blur-sm"
            />
            
            {/* Drawer */}
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed top-0 right-0 bottom-0 w-full max-w-full sm:max-w-2xl bg-surface border-l border-border z-50 flex flex-col justify-between shadow-2xl p-4 sm:p-6 md:p-8"
            >
              {loadingDetail ? (
                <div className="flex h-full flex-col items-center justify-center gap-3">
                  <Loader2 className="h-8 w-8 animate-spin text-accent" />
                  <p className="text-muted text-xs font-semibold">Retrieving session copy assets...</p>
                </div>
              ) : sessionDetail ? (
                <div className="flex flex-col h-full justify-between overflow-y-auto scrollbar-hide pr-1 -mr-1">
                  
                  {/* Drawer Header */}
                  <div className="flex justify-between items-start border-b border-border pb-5">
                    <div className="space-y-1 pr-6">
                      <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-surface-secondary border border-border text-[10px] font-bold uppercase text-accent">
                        <span>●</span>
                        AI Generation Suite
                      </div>
                      <h2 className="text-xl font-extrabold text-text tracking-tight leading-snug">{sessionDetail.session_theme}</h2>
                    </div>
                    <button
                      onClick={() => setSelectedSessionId(null)}
                      className="p-2 rounded-xl bg-surface-secondary hover:bg-surface-hover transition border border-border"
                    >
                      <X className="h-4 w-4 text-muted hover:text-text" />
                    </button>
                  </div>

                  {/* Drawer Navigation Tabs */}
                  <div className="flex gap-2 mt-6 border-b border-border overflow-x-auto scrollbar-hide pb-2">
                    {[
                      { id: 'facebook_post', plat: 'facebook', label: '📘 Facebook', data: sessionDetail.facebook_post || sessionDetail.copies?.find((c: any) => c.platform.toLowerCase() === 'facebook') },
                      { id: 'instagram_post', plat: 'instagram', label: '📸 Instagram', data: sessionDetail.instagram_post || sessionDetail.copies?.find((c: any) => c.platform.toLowerCase() === 'instagram') },
                      { id: 'linkedin_post', plat: 'linkedin', label: '💼 LinkedIn', data: sessionDetail.linkedin_post || sessionDetail.copies?.find((c: any) => c.platform.toLowerCase() === 'linkedin') },
                      { id: 'twitter_post', plat: 'twitter', label: '✖️ X / Twitter', data: sessionDetail.twitter_post || sessionDetail.copies?.find((c: any) => c.platform.toLowerCase() === 'twitter' || c.platform.toLowerCase() === 'x') },
                      { id: 'tiktok', plat: 'tiktok', label: '🎵 TikTok', data: sessionDetail.tiktok || sessionDetail.copies?.find((c: any) => c.platform.toLowerCase() === 'tiktok') }
                    ].map(tab => {
                      if (!tab.data) return null
                      const isActive = activeDetailTab === tab.id || activeDetailTab === tab.plat
                      return (
                        <button
                          key={tab.id}
                          onClick={() => setActiveDetailTab(tab.id)}
                          className={`px-3.5 py-2 rounded-xl font-black text-xs whitespace-nowrap transition-all flex items-center gap-1.5 border ${
                            isActive
                              ? 'border-accent bg-accent/15 text-accent shadow-sm'
                              : 'border-border bg-surface-secondary text-muted hover:text-text hover:bg-surface-hover'
                          }`}
                        >
                          <span>{tab.label}</span>
                          <span className={`text-[9px] px-1.5 py-0.2 rounded font-black uppercase ${
                            tab.data.status === 'published' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-muted/20 text-muted'
                          }`}>
                            {tab.data.status || 'Draft'}
                          </span>
                        </button>
                      )
                    })}
                  </div>

                  {/* Creative Asset Visual Banner */}
                  {(sessionDetail[activeDetailTab]?.image_url || sessionDetail.image_url) && (
                    <div className="relative rounded-2xl overflow-hidden aspect-video bg-black/60 border border-border mt-5 group">
                      <img 
                        src={resolveMediaUrl(sessionDetail[activeDetailTab]?.image_url || sessionDetail.image_url)} 
                        alt={sessionDetail.session_theme} 
                        className="w-full h-full object-contain" 
                      />
                      {((sessionDetail[activeDetailTab]?.image_url || sessionDetail.image_url)?.includes('test_') || sessionDetail.source === 'fallback') && (
                        <span className="absolute top-2.5 left-2.5 px-2.5 py-1 rounded-md bg-amber-500/90 text-black text-[10px] font-black uppercase tracking-wider shadow">
                          Fallback / Test Graphic
                        </span>
                      )}
                      <div className="absolute bottom-2.5 right-2.5 flex items-center gap-2">
                        <a
                          href={resolveMediaUrl(sessionDetail[activeDetailTab]?.image_url || sessionDetail.image_url)}
                          target="_blank"
                          rel="noreferrer"
                          className="px-3 py-1.5 rounded-xl bg-black/80 hover:bg-black text-white font-bold text-xs flex items-center gap-1.5 backdrop-blur-md border border-border shadow-lg transition"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                          <span>View Full Image</span>
                        </a>
                      </div>
                    </div>
                  )}

                  {/* Image Variants Gallery & Unused Image Manager */}
                  {sessionDetail.image_variants && sessionDetail.image_variants.length > 0 && (
                    <div className="bg-surface-secondary border border-border rounded-2xl p-4 space-y-3 mt-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-black uppercase tracking-wider text-text">
                            Artwork Variants ({sessionDetail.image_variants.length})
                          </span>
                          <span className="text-[10px] text-muted">
                            Saved permanently
                          </span>
                        </div>

                        {sessionDetail.image_variants.some((v: any) => v.is_unused) && (
                          <button
                            type="button"
                            onClick={handleDeleteUnusedImages}
                            disabled={isDeletingUnused}
                            className="px-2.5 py-1 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-400 font-bold text-[11px] transition flex items-center gap-1"
                          >
                            {isDeletingUnused ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                            <span>Delete unused images</span>
                          </button>
                        )}
                      </div>

                      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5">
                        {sessionDetail.image_variants.map((v: any, idx: number) => (
                          <div 
                            key={v.id || idx}
                            className={`relative rounded-xl overflow-hidden aspect-square border ${
                              v.is_selected 
                                ? 'border-accent ring-2 ring-accent' 
                                : 'border-border opacity-70 hover:opacity-100'
                            }`}
                          >
                            <img 
                              src={resolveMediaUrl(v.image_url)} 
                              alt={`Variant ${idx + 1}`}
                              className="w-full h-full object-cover" 
                            />
                            <div className="absolute top-1 left-1">
                              {v.is_selected ? (
                                <span className="px-1.5 py-0.5 rounded bg-accent text-black font-black text-[9px]">
                                  Selected
                                </span>
                              ) : (
                                <span className="px-1.5 py-0.5 rounded bg-black/70 text-zinc-300 font-bold text-[9px]">
                                  Unused
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Drawer Tab Content */}
                  <div className="flex-1 py-6 space-y-6">
                    {/* Render Instagram Post */}
                    {activeDetailTab === 'instagram_post' && sessionDetail.instagram_post && (
                      <div className="space-y-5">
                        <div className="flex justify-between items-center">
                          <h4 className="text-xs font-bold uppercase tracking-wider text-muted">Instagram Caption</h4>
                          <CopyButton text={sessionDetail.instagram_post.caption} label="Caption" />
                        </div>
                        <div className="bg-surface-secondary border border-border p-5 rounded-2xl text-sm text-text leading-relaxed whitespace-pre-wrap">
                          {sessionDetail.instagram_post.caption}
                        </div>
                        {safeHashtags(sessionDetail.instagram_post.hashtags).length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {safeHashtags(sessionDetail.instagram_post.hashtags).map((tag: string) => (
                              <span key={tag} className="text-xs font-bold text-accent bg-surface-secondary border border-border px-3 py-1 rounded-full">
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
                        <div className="grid grid-cols-2 gap-4 bg-surface-secondary border border-border p-4 rounded-2xl">
                          <div>
                            <p className="text-[10px] font-bold uppercase text-muted">Optimal Day</p>
                            <p className="text-sm font-bold text-text mt-0.5">{sessionDetail.instagram_post.best_day || 'Wednesday'}</p>
                          </div>
                          <div>
                            <p className="text-[10px] font-bold uppercase text-muted">Optimal Time</p>
                            <p className="text-sm font-bold text-text mt-0.5">{sessionDetail.instagram_post.best_time || '10:00 AM'}</p>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Render LinkedIn Post */}
                    {activeDetailTab === 'linkedin_post' && sessionDetail.linkedin_post && (
                      <div className="space-y-5">
                        <div className="flex justify-between items-center">
                          <h4 className="text-xs font-bold uppercase tracking-wider text-muted">LinkedIn Content</h4>
                          <CopyButton text={sessionDetail.linkedin_post.caption} label="Post" />
                        </div>
                        <div className="bg-surface-secondary border border-border p-5 rounded-2xl text-sm text-text leading-relaxed whitespace-pre-wrap">
                          {sessionDetail.linkedin_post.caption}
                        </div>
                        {safeHashtags(sessionDetail.linkedin_post.hashtags).length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {safeHashtags(sessionDetail.linkedin_post.hashtags).map((tag: string) => (
                              <span key={tag} className="text-xs font-bold text-accent bg-surface-secondary border border-border px-3 py-1 rounded-full">
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Render Facebook Post */}
                    {activeDetailTab === 'facebook_post' && sessionDetail.facebook_post && (
                      <div className="space-y-5">
                        <div className="flex justify-between items-center">
                          <h4 className="text-xs font-bold uppercase tracking-wider text-muted">Facebook Caption</h4>
                          <CopyButton text={sessionDetail.facebook_post.caption} label="Caption" />
                        </div>
                        <div className="bg-surface-secondary border border-border p-5 rounded-2xl text-sm text-text leading-relaxed whitespace-pre-wrap">
                          {sessionDetail.facebook_post.caption}
                        </div>
                      </div>
                    )}

                    {/* Render Twitter Post */}
                    {activeDetailTab === 'twitter_post' && sessionDetail.twitter_post && (
                      <div className="space-y-5">
                        <div className="flex justify-between items-center">
                          <h4 className="text-xs font-bold uppercase tracking-wider text-muted">Twitter / X Post</h4>
                          <CopyButton text={sessionDetail.twitter_post.caption} label="Tweet" />
                        </div>
                        <div className="bg-surface-secondary border border-border p-5 rounded-2xl text-sm text-text leading-relaxed whitespace-pre-wrap">
                          {sessionDetail.twitter_post.caption}
                        </div>
                        {safeHashtags(sessionDetail.twitter_post.hashtags).length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {safeHashtags(sessionDetail.twitter_post.hashtags).map((tag: string) => (
                              <span key={tag} className="text-xs font-bold text-accent bg-surface-secondary border border-border px-3 py-1 rounded-full">
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Render TikTok Post */}
                    {activeDetailTab === 'tiktok' && sessionDetail.tiktok && (
                      <div className="space-y-5">
                        <div className="flex justify-between items-center">
                          <h4 className="text-xs font-bold uppercase tracking-wider text-muted">TikTok Hook &amp; Caption</h4>
                          <CopyButton text={sessionDetail.tiktok.caption} label="Caption" />
                        </div>
                        <div className="bg-surface-secondary border border-border p-5 rounded-2xl text-sm text-text leading-relaxed whitespace-pre-wrap">
                          {sessionDetail.tiktok.caption}
                        </div>
                        {safeHashtags(sessionDetail.tiktok.hashtags).length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {safeHashtags(sessionDetail.tiktok.hashtags).map((tag: string) => (
                              <span key={tag} className="text-xs font-bold text-accent bg-surface-secondary border border-border px-3 py-1 rounded-full">
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
                        <div className="grid grid-cols-2 gap-4 bg-surface-secondary border border-border p-4 rounded-2xl">
                          <div>
                            <p className="text-[10px] font-bold uppercase text-muted">Aspect Ratio</p>
                            <p className="text-sm font-bold text-text mt-0.5">9:16 Vertical Video</p>
                          </div>
                          <div>
                            <p className="text-[10px] font-bold uppercase text-muted">Optimal Time</p>
                            <p className="text-sm font-bold text-text mt-0.5">{sessionDetail.tiktok.best_time || '8:00 PM'}</p>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Render Instagram Story */}
                    {activeDetailTab === 'instagram_story' && sessionDetail.instagram_story && (
                      <div className="space-y-5">
                        <div className="flex justify-between items-center">
                          <h4 className="text-xs font-bold uppercase tracking-wider text-muted">Story Copy</h4>
                          <CopyButton text={sessionDetail.instagram_story.text} label="Story Text" />
                        </div>
                        <div className="bg-surface-secondary border border-border p-6 rounded-2xl text-center italic text-base text-text font-bold">
                          &ldquo;{sessionDetail.instagram_story.text}&rdquo;
                        </div>
                        <div className="bg-surface-secondary border border-border p-5 rounded-2xl space-y-3">
                          <div>
                            <p className="text-[10px] font-bold uppercase text-muted">Suggested CTA Swipe / Reply</p>
                            <p className="text-sm font-bold text-text mt-1">{sessionDetail.instagram_story.cta || 'DM to access!'}</p>
                          </div>
                          <div>
                            <p className="text-[10px] font-bold uppercase text-muted">Interactive Poll Question</p>
                            <p className="text-sm font-bold text-text mt-1">{sessionDetail.instagram_story.poll_question || 'Ask what they think!'}</p>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Guidance Card */}
                    <div className="bg-surface-secondary border-l-2 border-accent p-4 rounded-r-2xl space-y-1">
                      <p className="text-[10px] font-bold uppercase text-accent">Content Strategy Angle</p>
                      <p className="text-xs text-muted leading-relaxed">{sessionDetail.guidance?.tip_of_day || 'Align this post theme with your main products to elevate conversion ratios.'}</p>
                    </div>

                    {/* Destination Platforms Selector (Where to post / where not to post) */}
                    {sessionDetail.copies && sessionDetail.copies.length > 0 && (
                      <div className="bg-surface-secondary border border-border p-5 rounded-2xl space-y-4">
                        <div className="flex items-center justify-between border-b border-border pb-3">
                          <div>
                            <h4 className="text-xs font-black uppercase tracking-wider text-text flex items-center gap-1.5">
                              <Globe className="h-3.5 w-3.5 text-accent" />
                              Choose Where to Publish
                            </h4>
                            <p className="text-[11px] text-muted">Select unposted channels to publish this generation.</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              const selectableIds = sessionDetail.copies
                                .filter((c: any) => {
                                  const s = (c.status || 'draft').toLowerCase();
                                  return s !== 'published' && s !== 'publishing' && s !== 'needs_reconnect' && s !== 'scheduled';
                                })
                                .map((c: any) => c.id || c.copy_id)
                                .filter(Boolean);

                              setSelectedCopyIdsToPublish(prev => prev.length === selectableIds.length ? [] : selectableIds);
                            }}
                            className="text-[10px] font-bold text-accent hover:underline"
                          >
                            {selectedCopyIdsToPublish.length > 0 ? 'Deselect All' : 'Select All Ready'}
                          </button>
                        </div>

                        <div className="space-y-2">
                          {sessionDetail.copies.map((c: any) => {
                            const cId = c.id || c.copy_id;
                            const plat = (c.platform || '').toLowerCase().trim();
                            const isChecked = selectedCopyIdsToPublish.includes(cId);
                            const statusLower = (c.status || 'draft').toLowerCase();
                            
                            // Platform naming rule: "X", not "Twitter" / "X/Twitter"
                            const platName = plat === 'twitter' || plat === 'x' 
                              ? 'X' 
                              : plat === 'linkedin' 
                              ? 'LinkedIn' 
                              : plat === 'facebook' 
                              ? 'Facebook' 
                              : plat === 'instagram' 
                              ? 'Instagram' 
                              : plat === 'tiktok' 
                              ? 'TikTok' 
                              : plat.charAt(0).toUpperCase() + plat.slice(1);
                              
                            const icon = plat.includes('linkedin') ? '💼' : plat.includes('facebook') ? '📘' : plat.includes('instagram') ? '📸' : plat.includes('twitter') || plat.includes('x') ? '✖️' : '🎵';
                            const isPublished = statusLower === 'published';
                            const isScheduled = statusLower === 'scheduled';
                            const isNeedsReconnect = statusLower === 'needs_reconnect';
                            const isFailed = statusLower === 'failed';
                            const isSelectable = !isPublished && !isNeedsReconnect && !isScheduled;

                            return (
                              <label
                                key={cId}
                                onClick={() => {
                                  const tabMap: Record<string, string> = {
                                    facebook: 'facebook_post',
                                    linkedin: 'linkedin_post',
                                    instagram: 'instagram_post',
                                    twitter: 'twitter_post',
                                    x: 'twitter_post',
                                    tiktok: 'tiktok'
                                  };
                                  const targetTab = tabMap[plat] || 'facebook_post';
                                  if (sessionDetail[targetTab]) {
                                    setActiveDetailTab(targetTab);
                                  }
                                }}
                                className={`flex items-center justify-between p-3 rounded-xl border transition ${
                                  isPublished
                                    ? 'bg-emerald-500/5 border-emerald-500/20 text-text opacity-90 cursor-default'
                                    : isChecked
                                    ? 'bg-surface border-accent/60 text-text ring-1 ring-accent/20 cursor-pointer'
                                    : 'bg-surface/50 border-border text-muted hover:border-border-hover cursor-pointer'
                                }`}
                              >
                                <div className="flex items-center gap-3">
                                  <input
                                    type="checkbox"
                                    checked={isPublished ? false : isChecked}
                                    disabled={!isSelectable}
                                    onChange={() => {
                                      if (!isSelectable) return;
                                      const nextIds = selectedCopyIdsToPublish.includes(cId)
                                        ? selectedCopyIdsToPublish.filter(x => x !== cId)
                                        : [...selectedCopyIdsToPublish, cId];
                                      setSelectedCopyIdsToPublish(nextIds);

                                      // Automatically switch detail tab to this platform
                                      const tabMap: Record<string, string> = {
                                        facebook: 'facebook_post',
                                        linkedin: 'linkedin_post',
                                        instagram: 'instagram_post',
                                        twitter: 'twitter_post',
                                        x: 'twitter_post',
                                        tiktok: 'tiktok'
                                      };
                                      const targetTab = tabMap[plat] || 'facebook_post';
                                      if (sessionDetail[targetTab]) {
                                        setActiveDetailTab(targetTab);
                                      }
                                    }}
                                    className={`h-4 w-4 rounded accent-accent ${isSelectable ? 'cursor-pointer' : 'cursor-not-allowed opacity-40'}`}
                                  />
                                  <div>
                                    <div className="flex items-center gap-1.5">
                                      <span className="text-sm">{icon}</span>
                                      <span className="text-xs font-extrabold text-text">{platName}</span>
                                    </div>
                                    <span className="text-[10px] text-muted block truncate max-w-[200px]">
                                      {c.caption ? c.caption.slice(0, 44) + '...' : 'Ready to post'}
                                    </span>
                                  </div>
                                </div>

                                {/* Plain words status badge */}
                                <div>
                                  {isPublished ? (
                                    <div className="flex items-center gap-2">
                                      <span className="text-[10px] font-black uppercase px-2.5 py-0.5 rounded border bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
                                        Published
                                      </span>
                                      {c.permalink && (
                                        <a
                                          href={c.permalink}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          onClick={(e) => e.stopPropagation()}
                                          className="text-[10px] font-bold text-accent hover:underline flex items-center gap-0.5"
                                        >
                                          View post ↗
                                        </a>
                                      )}
                                    </div>
                                  ) : isScheduled ? (
                                    <span className="text-[10px] font-bold px-2.5 py-0.5 rounded border bg-blue-500/20 text-blue-400 border-blue-500/30">
                                      Scheduled {c.scheduled_at ? new Date(c.scheduled_at).toLocaleDateString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' }) : ''}
                                    </span>
                                  ) : isNeedsReconnect ? (
                                    <span className="text-[10px] font-bold px-2.5 py-0.5 rounded border bg-amber-500/20 text-amber-400 border-amber-500/30">
                                      Reconnect needed
                                    </span>
                                  ) : isFailed ? (
                                    <div className="flex items-center gap-1.5">
                                      <span className="text-[10px] font-bold px-2 py-0.5 rounded border bg-rose-500/20 text-rose-400 border-rose-500/30 truncate max-w-[130px]" title={c.error || 'Failed'}>
                                        Failed: {c.error ? c.error.slice(0, 20) + '...' : 'Error'}
                                      </span>
                                      <button
                                        type="button"
                                        onClick={async (e) => {
                                          e.preventDefault();
                                          e.stopPropagation();
                                          try {
                                            await api.post(`/content/copy/${cId}/retry`);
                                            toast.success('Retrying platform publish...');
                                            const res = await api.get(`/content/history/${selectedSessionId}`);
                                            setSessionDetail(res.data);
                                            fetchHistory(true);
                                          } catch (err: any) {
                                            toast.error('Retry failed.');
                                          }
                                        }}
                                        className="text-[10px] font-bold text-accent hover:underline px-1 py-0.5"
                                      >
                                        Retry
                                      </button>
                                    </div>
                                  ) : (
                                    <span className="text-[10px] font-bold px-2.5 py-0.5 rounded border bg-surface border-border text-muted">
                                      Not posted yet
                                    </span>
                                  )}
                                </div>
                              </label>
                            );
                          })}
                        </div>

                        {/* Dynamic Main Action Button */}
                        {(() => {
                          const selectedCopies = (sessionDetail.copies || []).filter((c: any) => 
                            selectedCopyIdsToPublish.includes(c.id || c.copy_id)
                          );
                          const selectedPlatNames = selectedCopies.map((c: any) => {
                            const p = (c.platform || '').toLowerCase().trim();
                            return p === 'twitter' || p === 'x' ? 'X' : p === 'linkedin' ? 'LinkedIn' : p === 'facebook' ? 'Facebook' : p === 'instagram' ? 'Instagram' : p;
                          });

                          let buttonLabel = 'Select a platform to publish';
                          if (selectedCopies.length === 1) {
                            buttonLabel = `Publish to ${selectedPlatNames[0]}`;
                          } else if (selectedCopies.length > 1) {
                            buttonLabel = `Publish to ${selectedCopies.length} platforms`;
                          }

                          return (
                            <div className="space-y-1.5 pt-1">
                              <button
                                type="button"
                                onClick={async () => {
                                  if (selectedCopyIdsToPublish.length === 0) return toast.error('Check at least one platform to publish.');
                                  setIsBatchPublishing(true);
                                  try {
                                    const res = await api.post('/content/publish-batch', { copy_ids: selectedCopyIdsToPublish, force: true });
                                    const publishedPlats: string[] = res.data?.published_platforms || [];
                                    const disconnectedPlats: string[] = res.data?.skipped_disconnected || [];

                                    if (publishedPlats.length > 0) {
                                      toast.success(`Published to ${publishedPlats.join(', ')}! 🎉`);
                                    }
                                    if (disconnectedPlats.length > 0) {
                                      toast(`${disconnectedPlats.join(', ')} not connected. Skipped and left in draft.`, {
                                        icon: 'ℹ️',
                                        duration: 5000
                                      });
                                    }
                                    if (publishedPlats.length === 0 && disconnectedPlats.length === 0 && res.data?.errors?.length > 0) {
                                      const relevantErrors = res.data.errors.filter((e: any) => selectedCopyIdsToPublish.includes(e.copy_id));
                                      const errMsg = relevantErrors[0]?.message || 'Publishing failed.';
                                      toast.error(typeof errMsg === 'string' ? errMsg : JSON.stringify(errMsg));
                                    }
                                    const refreshed = await api.get(`/content/history/${selectedSessionId}`);
                                    setSessionDetail(refreshed.data);
                                    fetchHistory(true);
                                  } catch (err: any) {
                                    const errMsg = err.response?.data?.detail?.message || err.response?.data?.detail || 'Publish failed.';
                                    toast.error(typeof errMsg === 'string' ? errMsg : JSON.stringify(errMsg));
                                  } finally {
                                    setIsBatchPublishing(false);
                                  }
                                }}
                                disabled={isBatchPublishing || selectedCopyIdsToPublish.length === 0}
                                className="w-full py-3.5 px-4 rounded-xl bg-accent hover:bg-accent-hover text-black font-black text-xs sm:text-sm flex items-center justify-center gap-2 transition disabled:opacity-40 disabled:hover:bg-accent shadow-accent-glow"
                              >
                                {isBatchPublishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Globe className="h-4 w-4" />}
                                <span>{buttonLabel}</span>
                              </button>
                              <p className="text-[11px] text-muted text-center font-medium">
                                Platforms already published are skipped.
                              </p>

                              <button
                                type="button"
                                onClick={async () => {
                                  const targetPostId = sessionDetail?.id || sessionDetail?.parent_post_id || selectedSessionId;
                                  if (!targetPostId) return toast.error('Could not identify post ID.');
                                  setIsSubmittingApproval(true);
                                  try {
                                    await submitPostForApproval(targetPostId);
                                    toast.success('Post submitted to Approvals review queue! 🛡️');
                                    fetchHistory(true);
                                  } catch (e: any) {
                                    toast.error(e.response?.data?.detail || 'Failed to submit for approval.');
                                  } finally {
                                    setIsSubmittingApproval(false);
                                  }
                                }}
                                disabled={isSubmittingApproval}
                                className="w-full py-2.5 px-4 rounded-xl bg-surface-secondary hover:bg-surface-hover border border-border text-text font-bold text-xs flex items-center justify-center gap-2 transition"
                              >
                                {isSubmittingApproval ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5 text-primary-light" />}
                                <span>Submit Post for Team Approval</span>
                              </button>
                            </div>
                          );
                        })()}
                      </div>
                    )}

                    {/* Per-Platform Live Publishing & Scheduling Controls */}
                    {(() => {
                      const activeData = sessionDetail[activeDetailTab] || sessionDetail.copies?.find((c: any) => c.platform.toLowerCase() === activeDetailTab.toLowerCase().replace('_post', ''));
                      const copyId = activeData?.id || activeData?.copy_id;
                      if (!copyId) return null;

                      const statusLower = (activeData.status || 'draft').toLowerCase();
                      const platName = (activeData.platform || activeDetailTab.replace('_post', '')).charAt(0).toUpperCase() + (activeData.platform || activeDetailTab.replace('_post', '')).slice(1);

                      return (
                        <div className="bg-surface-secondary border border-border p-4 rounded-2xl space-y-3">
                          <div className="flex flex-wrap gap-1.5 pb-2 border-b border-border/60">
                            {[
                              { id: 'facebook_post', plat: 'facebook', label: 'Facebook' },
                              { id: 'instagram_post', plat: 'instagram', label: 'Instagram' },
                              { id: 'linkedin_post', plat: 'linkedin', label: 'LinkedIn' },
                              { id: 'twitter_post', plat: 'twitter', label: 'X' },
                              { id: 'tiktok', plat: 'tiktok', label: 'TikTok' },
                            ].map(t => {
                              const hasCopy = sessionDetail[t.id] || sessionDetail.copies?.some((c: any) => (c.platform || '').toLowerCase() === t.plat || (t.plat === 'twitter' && (c.platform || '').toLowerCase() === 'x'));
                              if (!hasCopy) return null;
                              const isCurrent = activeDetailTab === t.id || activeDetailTab === t.plat;
                              return (
                                <button
                                  key={t.id}
                                  type="button"
                                  onClick={() => setActiveDetailTab(t.id)}
                                  className={`px-2.5 py-1 rounded-lg text-[10px] font-black transition border ${
                                    isCurrent
                                      ? 'bg-accent text-black border-accent'
                                      : 'bg-surface border-border text-muted hover:text-text'
                                  }`}
                                >
                                  {t.label}
                                </button>
                              );
                            })}
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-muted">
                              Active Inspector: <strong className="text-text">{platName}</strong>
                            </span>
                            <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold uppercase border ${
                              statusLower === 'published'
                                ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                                : statusLower === 'publishing'
                                ? 'bg-blue-500/20 text-blue-400 border-blue-500/30 animate-pulse'
                                : statusLower === 'needs_reconnect'
                                ? 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                                : statusLower === 'failed'
                                ? 'bg-rose-500/20 text-rose-400 border-rose-500/30'
                                : 'bg-surface border-border text-muted'
                            }`}>
                              {activeData.status || 'Draft'}
                            </span>
                          </div>

                          {/* Rule 1: Verified Published banner with direct permalink & Post Again testing option */}
                          {statusLower === 'published' && (
                            <div className="space-y-3">
                              <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl flex items-center justify-between gap-3">
                                <div className="space-y-0.5">
                                  <p className="text-xs font-black text-emerald-400 flex items-center gap-1.5">
                                    <span>✓</span> Live on {platName}
                                  </p>
                                  <p className="text-[10px] text-zinc-400">Post verified and live on official API.</p>
                                </div>
                                {activeData.permalink && (
                                  <a
                                    href={activeData.permalink}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black font-extrabold text-xs flex items-center gap-1 transition shadow-sm shrink-0"
                                  >
                                    <span>View on {platName}</span>
                                    <ExternalLink className="h-3 w-3" />
                                  </a>
                                )}
                              </div>

                              <div className="flex items-center justify-between p-3 rounded-xl bg-surface border border-border">
                                <div>
                                  <p className="text-xs font-bold text-text">Post again</p>
                                  <p className="text-[10px] text-muted">Publish an additional live post to {platName}.</p>
                                </div>
                                <button
                                  type="button"
                                  onClick={async () => {
                                    const ok = window.confirm(`This will create a second post on ${platName}. Continue?`);
                                    if (!ok) return;
                                    setIsPublishing(copyId);
                                    try {
                                      await api.post(`/content/copy/${copyId}/publish?force=true`);
                                      toast.success(`Published live to ${platName} again! 🎉`);
                                      const res = await api.get(`/content/history/${selectedSessionId}`);
                                      setSessionDetail(res.data);
                                      fetchHistory(true);
                                    } catch (err: any) {
                                      const errMsg = err.response?.data?.detail?.message || err.response?.data?.detail || 'Republish failed.';
                                      toast.error(typeof errMsg === 'string' ? errMsg : JSON.stringify(errMsg));
                                    } finally {
                                      setIsPublishing(null);
                                    }
                                  }}
                                  disabled={isPublishing === copyId}
                                  className="px-3.5 py-1.5 rounded-xl bg-surface-secondary border border-border hover:border-accent text-text hover:text-accent font-bold text-xs transition flex items-center gap-1.5 shadow-sm"
                                >
                                  {isPublishing === copyId ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                                  <span>Post again</span>
                                </button>
                              </div>
                            </div>
                          )}

                          {/* Rule 4: needs_reconnect state with reconnect button */}
                          {statusLower === 'needs_reconnect' && (
                            <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl space-y-2">
                              <div className="flex items-center gap-1.5 text-amber-400 font-bold text-xs">
                                <span>⚠️</span>
                                <span>Account Needs Reconnect</span>
                              </div>
                              <p className="text-[11px] text-amber-200/80 leading-relaxed">
                                {activeData.error || `No active ${platName} account connected or the authentication token has expired.`}
                              </p>
                              <div className="flex gap-2 pt-1">
                                <button
                                  type="button"
                                  onClick={() => router.push('/settings')}
                                  className="px-3 py-1.5 rounded-lg bg-amber-400 hover:bg-amber-300 text-black font-black text-xs transition"
                                >
                                  Reconnect in Settings
                                </button>
                                <button
                                  type="button"
                                  onClick={async () => {
                                    try {
                                      await api.post(`/content/copy/${copyId}/retry`);
                                      toast.success('Reset to draft.');
                                      const res = await api.get(`/content/history/${selectedSessionId}`);
                                      setSessionDetail(res.data);
                                      fetchHistory(true);
                                    } catch (err) {}
                                  }}
                                  className="px-2.5 py-1.5 rounded-lg bg-surface border border-border text-muted hover:text-text text-xs font-bold transition"
                                >
                                  Reset to Draft
                                </button>
                              </div>
                            </div>
                          )}

                          {/* Rule 6: Failed state showing error & retry button */}
                          {statusLower === 'failed' && (
                            <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl space-y-2">
                              <div className="flex items-center gap-1.5 text-rose-400 font-bold text-xs">
                                <span>✕</span>
                                <span>Publishing Failed</span>
                              </div>
                              <p className="text-[11px] text-rose-200/80 leading-relaxed break-words">
                                {activeData.error || 'Live platform API rejected the update.'}
                              </p>
                              <div className="flex gap-2 pt-1">
                                <button
                                  type="button"
                                  onClick={async () => {
                                    setIsPublishing(copyId);
                                    try {
                                      await api.post(`/content/copy/${copyId}/publish?force=true`);
                                      toast.success(`Published live to ${platName}! 🎉`);
                                      const res = await api.get(`/content/history/${selectedSessionId}`);
                                      setSessionDetail(res.data);
                                      fetchHistory(true);
                                    } catch (err: any) {
                                      const errMsg = err.response?.data?.detail?.message || err.response?.data?.detail || 'Retry failed.';
                                      toast.error(typeof errMsg === 'string' ? errMsg : JSON.stringify(errMsg));
                                      const res = await api.get(`/content/history/${selectedSessionId}`);
                                      setSessionDetail(res.data);
                                    } finally {
                                      setIsPublishing(null);
                                    }
                                  }}
                                  disabled={isPublishing === copyId}
                                  className="px-3 py-1.5 rounded-lg bg-rose-500 hover:bg-rose-400 text-white font-black text-xs transition flex items-center gap-1.5"
                                >
                                  {isPublishing === copyId ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                                  <span>Retry Publishing</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={async () => {
                                    try {
                                      await api.post(`/content/copy/${copyId}/retry`);
                                      toast.success('Reset to draft.');
                                      const res = await api.get(`/content/history/${selectedSessionId}`);
                                      setSessionDetail(res.data);
                                      fetchHistory(true);
                                    } catch (err) {}
                                  }}
                                  className="px-2.5 py-1.5 rounded-lg bg-surface border border-border text-muted hover:text-text text-xs font-bold transition"
                                >
                                  Reset to Draft
                                </button>
                              </div>
                            </div>
                          )}

                          {schedulingCopyId === copyId ? (
                            <div className="space-y-2">
                              <label className="text-xs font-bold text-text">Select Date &amp; Time:</label>
                              <input
                                type="datetime-local"
                                value={scheduledDateTime}
                                onChange={(e) => setScheduledDateTime(e.target.value)}
                                className="w-full px-3 py-2 rounded-lg bg-surface border border-border text-xs text-text outline-none focus:border-accent"
                              />
                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  onClick={async () => {
                                    if (!scheduledDateTime) return toast.error('Pick a date and time.');
                                    try {
                                      await api.post(`/content/copy/${copyId}/schedule`, { scheduled_at: new Date(scheduledDateTime).toISOString() });
                                      toast.success('Scheduled successfully!');
                                      setSchedulingCopyId(null);
                                      const res = await api.get(`/content/history/${selectedSessionId}`);
                                      setSessionDetail(res.data);
                                      fetchHistory(true);
                                    } catch (err: any) {
                                      toast.error(err.response?.data?.detail || 'Schedule failed.');
                                    }
                                  }}
                                  className="px-3 py-1.5 rounded-lg bg-accent text-black font-extrabold text-xs"
                                >
                                  Confirm Schedule
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setSchedulingCopyId(null)}
                                  className="px-3 py-1.5 rounded-lg bg-surface text-muted text-xs font-bold"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="grid grid-cols-3 gap-2">
                              <button
                                type="button"
                                onClick={async () => {
                                  setIsPublishing(copyId);
                                  try {
                                    await api.post(`/content/copy/${copyId}/publish`);
                                    toast.success(`Published live to ${platName}! 🎉`);
                                    const res = await api.get(`/content/history/${selectedSessionId}`);
                                    setSessionDetail(res.data);
                                    fetchHistory(true);
                                  } catch (err: any) {
                                    const detail = err.response?.data?.detail;
                                    const isNeedsReconnect = detail?.status === 'needs_reconnect' || (typeof detail?.message === 'string' && detail.message.toLowerCase().includes('not connected'));
                                    if (isNeedsReconnect) {
                                      toast(`${platName} is not connected. Connect in Brand Studio Settings.`, { icon: 'ℹ️', duration: 4000 });
                                    } else {
                                      const errMsg = detail?.message || detail || 'Publish failed.';
                                      toast.error(typeof errMsg === 'string' ? errMsg : JSON.stringify(errMsg));
                                    }
                                    const res = await api.get(`/content/history/${selectedSessionId}`);
                                    setSessionDetail(res.data);
                                    fetchHistory(true);
                                  } finally {
                                    setIsPublishing(null);
                                  }
                                }}
                                disabled={isPublishing === copyId || statusLower === 'published'}
                                className="py-2 px-2.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs font-extrabold flex items-center justify-center gap-1.5 transition disabled:opacity-50"
                              >
                                {isPublishing === copyId ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                                <span>{statusLower === 'published' ? 'Published' : 'Publish Now'}</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => {
                                  setSchedulingCopyId(copyId);
                                  const d = new Date();
                                  d.setHours(d.getHours() + 2);
                                  setScheduledDateTime(d.toISOString().slice(0, 16));
                                }}
                                className="py-2 px-2.5 rounded-xl bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/30 text-xs font-extrabold flex items-center justify-center gap-1.5 transition"
                              >
                                <span>Schedule</span>
                              </button>

                              {!activeData.external_post_id && (statusLower === 'failed' || statusLower === 'scheduled') && (
                                <button
                                  type="button"
                                  onClick={async () => {
                                    try {
                                      await api.post(`/content/copy/${copyId}/retry`);
                                      toast.success(statusLower === 'scheduled' ? 'Schedule canceled. Back to not posted.' : 'Status back to not posted.');
                                      const res = await api.get(`/content/history/${selectedSessionId}`);
                                      setSessionDetail(res.data);
                                      fetchHistory(true);
                                    } catch (err: any) {
                                      toast.error(err.response?.data?.detail || 'Reset failed.');
                                    }
                                  }}
                                  className="py-2 px-2.5 rounded-xl bg-surface hover:bg-surface-secondary text-zinc-300 border border-border text-xs font-extrabold flex items-center justify-center gap-1.5 transition"
                                >
                                  <span>{statusLower === 'scheduled' ? 'Cancel Schedule' : 'Back to not posted'}</span>
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>

                  {/* Drawer Footer actions */}
                  <div className="border-t border-border pt-4 flex gap-3">
                    <button
                      onClick={() => {
                        toast.success('Strategy context loaded! Head into session...')
                        router.push('/session')
                      }}
                      className="flex-1 flex items-center justify-center gap-2 bg-accent hover:bg-accent-hover text-black font-extrabold px-5 py-3 rounded-xl text-xs transition shadow-accent-glow active:scale-[0.98]"
                    >
                      Regenerate Similar Content
                      <ArrowRight className="h-4 w-4" />
                    </button>
                    
                    <button
                      onClick={() => {
                        const contentId = selectedSessionId
                        const platform = activeDetailTab
                        triggerSaveTemplate(contentId!, platform, sessionDetail.session_theme)
                      }}
                      className="px-4 py-3 rounded-xl border border-border bg-surface-secondary text-text hover:text-accent hover:border-accent/30 font-bold text-xs transition"
                    >
                      Bookmark
                    </button>
                  </div>

                </div>
              ) : null}
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ─── SAVE TEMPLATE MODAL ─── */}
      <AnimatePresence>
        {savingPost && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.7 }}
              exit={{ opacity: 0 }}
              onClick={() => setSavingPost(null)}
              className="fixed inset-0 bg-black z-50 backdrop-blur-sm"
            />
            
            {/* Dialog */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="fixed inset-0 m-auto max-h-[280px] w-[90%] max-w-md bg-surface border border-border rounded-3xl z-50 flex flex-col justify-between shadow-2xl p-6"
            >
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="text-base font-bold text-text tracking-tight">Save as Template</h3>
                  <button
                    onClick={() => setSavingPost(null)}
                    className="p-1 rounded-lg bg-surface-secondary hover:bg-surface-hover transition border border-border"
                  >
                    <X className="h-4 w-4 text-muted" />
                  </button>
                </div>
                
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-muted">Template Custom Name</label>
                  <input
                    type="text"
                    value={templateName}
                    onChange={(e) => setTemplateName(e.target.value)}
                    placeholder="Enter template name..."
                    className="w-full bg-surface-secondary border border-border rounded-xl px-4 py-2.5 text-sm text-text placeholder-muted focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2.5 pt-4 border-t border-border mt-3">
                <button
                  onClick={() => setSavingPost(null)}
                  className="px-4 py-2 rounded-xl bg-surface-secondary hover:bg-surface-hover border border-border text-muted hover:text-text font-bold text-xs transition"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveTemplateSubmit}
                  disabled={isSavingTemplate || !templateName.trim()}
                  className="px-5 py-2 rounded-xl bg-accent hover:bg-accent-hover text-black font-extrabold text-xs transition shadow-accent-glow disabled:opacity-50"
                >
                  {isSavingTemplate ? 'Saving...' : 'Save Template'}
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

    </div>
  )
}
