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
  ArrowRight 
} from 'lucide-react'
import api from '@/lib/api'
import { toast } from 'react-hot-toast'
import CopyButton from '@/components/ui/CopyButton'
import Skeleton from '@/components/ui/Skeleton'
import EmptyState from '@/components/ui/EmptyState'
import { resolveMediaUrl } from '@/lib/media'

interface HistoryItem {
  id: string
  session_date: string
  session_theme: string
  instagram_caption: string
  linkedin_caption: string
  platforms_generated: string[]
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
  const [platformFilter, setPlatformFilter] = useState<'all' | 'instagram' | 'linkedin' | 'facebook'>('all')
  const [dateFilter, setDateFilter] = useState<'all' | 'week' | 'month'>('all')

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

  // Fetch History Items
  const fetchHistory = async (resetPage = false) => {
    const targetPage = resetPage ? 1 : page
    if (resetPage) setLoadingHistory(true)
    else setLoadingMore(true)

    try {
      const res = await api.get(`/content/history?page=${targetPage}&limit=6`)
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
        const matchesPlatform = item.platforms_generated?.some(p => 
          p.toLowerCase().includes(platformFilter)
        )
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
  const openDetailDrawer = async (sessionId: string) => {
    setSelectedSessionId(sessionId)
    setLoadingDetail(true)
    try {
      const res = await api.get(`/content/history/${sessionId}`)
      if (res.data) {
        setSessionDetail(res.data)
        if (res.data.instagram_post) setActiveDetailTab('instagram_post')
        else if (res.data.linkedin_post) setActiveDetailTab('linkedin_post')
        else if (res.data.facebook_post) setActiveDetailTab('facebook_post')
        else if (res.data.instagram_story) setActiveDetailTab('instagram_story')
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
    const p = platform.toLowerCase()
    if (p.includes('instagram')) {
      return (
        <svg className="h-3.5 w-3.5 text-[#FF75A0]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect>
          <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path>
          <line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line>
        </svg>
      )
    }
    if (p.includes('linkedin')) {
      return (
        <svg className="h-3.5 w-3.5 text-[#4CB5F9] fill-current" viewBox="0 0 24 24">
          <path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.28 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.75M6.46 10.9v8.37H9.2V10.9H6.46M7.83 6.45a1.64 1.64 0 1 0 0 3.28 1.64 1.64 0 0 0 0-3.28z"/>
        </svg>
      )
    }
    if (p.includes('facebook')) {
      return (
        <svg className="h-3.5 w-3.5 text-[#70AEFF] fill-current" viewBox="0 0 24 24">
          <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
        </svg>
      )
    }
    if (p.includes('twitter') || p.includes('x')) {
      return (
        <svg className="h-3.5 w-3.5 text-text fill-current" viewBox="0 0 24 24">
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
        </svg>
      )
    }
    return <Globe className="h-3.5 w-3.5 text-muted" />
  }

  const renderPlatformBadge = (platform: string) => {
    const p = platform.toLowerCase()
    if (p.includes('instagram')) {
      return (
        <span
          key={platform}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#E1306C]/10 border border-[#E1306C]/30 text-[#FF75A0] text-[10px] font-extrabold tracking-wide shadow-sm"
          title="Instagram Post / Story"
        >
          <svg className="h-3 w-3 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#0077B5]/10 border border-[#0077B5]/30 text-[#4CB5F9] text-[10px] font-extrabold tracking-wide shadow-sm"
          title="LinkedIn Post"
        >
          <svg className="h-3 w-3 shrink-0 fill-current" viewBox="0 0 24 24">
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
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#1877F2]/10 border border-[#1877F2]/30 text-[#70AEFF] text-[10px] font-extrabold tracking-wide shadow-sm"
          title="Facebook Post"
        >
          <svg className="h-3 w-3 shrink-0 fill-current" viewBox="0 0 24 24">
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
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/10 border border-white/20 text-text text-[10px] font-extrabold tracking-wide shadow-sm"
          title="Twitter / X"
        >
          <svg className="h-3 w-3 shrink-0 fill-current" viewBox="0 0 24 24">
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
          </svg>
          <span>Twitter / X</span>
        </span>
      )
    }
    return (
      <span
        key={platform}
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-surface-secondary border border-border text-muted text-[10px] font-extrabold tracking-wide shadow-sm"
      >
        <Globe className="h-3 w-3 shrink-0 text-muted" />
        <span>{getPlatformLabel(platform)}</span>
      </span>
    )
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
          {/* ─── FILTER BAR ─── */}
          <div className="flex flex-col md:flex-row gap-4 justify-between bg-surface border border-border p-4 rounded-2xl">
            
            {/* Platform Filters */}
            <div className="flex flex-wrap gap-2">
              {[
                { id: 'all', label: 'All Platforms' },
                { id: 'instagram', label: 'Instagram' },
                { id: 'linkedin', label: 'LinkedIn' },
                { id: 'facebook', label: 'Facebook' },
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
                  <div className="flex gap-2.5 mt-6 border-t border-border pt-4">
                    <button
                      onClick={() => openDetailDrawer(item.id)}
                      className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-surface-secondary hover:bg-surface-hover border border-border text-text font-bold text-xs transition active:scale-[0.98]"
                    >
                      View Full Content
                      <ChevronRight className="h-4 w-4 text-muted" />
                    </button>
                    
                    <button
                      onClick={() => triggerSaveTemplate(item.id, item.platforms_generated[0] || 'instagram_post', item.session_theme)}
                      className="p-2.5 rounded-xl bg-surface-secondary border border-border text-muted hover:text-accent hover:border-accent/30 transition active:scale-[0.98]"
                      title="Save as Template"
                    >
                      <Bookmark className="h-4 w-4" />
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
                  <div className="flex gap-1.5 mt-6 border-b border-border overflow-x-auto scrollbar-hide">
                    {[
                      { id: 'instagram_post', label: 'Instagram Post', check: sessionDetail.instagram_post },
                      { id: 'linkedin_post', label: 'LinkedIn', check: sessionDetail.linkedin_post },
                      { id: 'facebook_post', label: 'Facebook', check: sessionDetail.facebook_post },
                      { id: 'twitter_post', label: 'Twitter / X', check: sessionDetail.twitter_post },
                      { id: 'instagram_story', label: 'Story', check: sessionDetail.instagram_story }
                    ].map(tab => {
                      if (!tab.check) return null
                      return (
                        <button
                          key={tab.id}
                          onClick={() => setActiveDetailTab(tab.id)}
                          className={`px-4 py-2.5 font-bold text-xs whitespace-nowrap transition-all border-b-2 ${
                            activeDetailTab === tab.id
                              ? 'border-accent text-accent bg-surface-secondary'
                              : 'border-transparent text-muted hover:text-text'
                          }`}
                        >
                          {tab.label}
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
                        {sessionDetail.instagram_post.hashtags && (
                          <div className="flex flex-wrap gap-1.5">
                            {sessionDetail.instagram_post.hashtags.map((tag: string) => (
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
                        {sessionDetail.linkedin_post.hashtags && (
                          <div className="flex flex-wrap gap-1.5">
                            {sessionDetail.linkedin_post.hashtags.map((tag: string) => (
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
                        {sessionDetail.twitter_post.hashtags && (
                          <div className="flex flex-wrap gap-1.5">
                            {sessionDetail.twitter_post.hashtags.map((tag: string) => (
                              <span key={tag} className="text-xs font-bold text-accent bg-surface-secondary border border-border px-3 py-1 rounded-full">
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
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
