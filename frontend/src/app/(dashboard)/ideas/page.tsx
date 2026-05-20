'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Globe, 
  Users, 
  Layout, 
  Share2, 
  BookMarked, 
  History, 
  Calendar, 
  Clock, 
  ExternalLink,
  ChevronRight, 
  X, 
  Check, 
  Copy, 
  Plus, 
  Loader2, 
  Bookmark,
  Sparkles,
  ArrowRight,
  Flame,
  FileText
} from 'lucide-react'
import api from '@/lib/api'
import { toast } from 'react-hot-toast'
import CopyButton from '@/components/ui/CopyButton'
import Skeleton from '@/components/ui/Skeleton'
import EmptyState from '@/components/ui/EmptyState'

interface HistoryItem {
  id: string
  session_date: string
  session_theme: string
  instagram_caption: string
  linkedin_caption: string
  platforms_generated: string[]
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
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [loadingHistory, setLoadingHistory] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  
  // Filters
  const [platformFilter, setPlatformFilter] = useState<'all' | 'instagram' | 'linkedin' | 'facebook'>('all')
  const [dateFilter, setDateFilter] = useState<'all' | 'week' | 'month'>('all')
  
  // Templates State
  const [templates, setTemplates] = useState<SavedTemplate[]>([])
  const [loadingTemplates, setLoadingTemplates] = useState(false)
  
  // Drawer / Detail State
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)
  const [sessionDetail, setSessionDetail] = useState<any | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [activeDetailTab, setActiveDetailTab] = useState<string>('instagram_post')
  
  // Save Template Modal State
  const [savingPost, setSavingPost] = useState<{ id: string; platform: string } | null>(null)
  const [templateName, setTemplateName] = useState('')
  const [isSavingTemplate, setIsSavingTemplate] = useState(false)

  // Fetch History List
  const fetchHistory = async (resetPage = false) => {
    const targetPage = resetPage ? 1 : page
    if (resetPage) {
      setLoadingHistory(true)
    } else {
      setLoadingMore(true)
    }
    
    try {
      const res = await api.get(`/content/history?page=${targetPage}&limit=10`)
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
      console.error('Failed to fetch history:', err)
      toast.error('Failed to load content history.')
    } finally {
      setLoadingHistory(false)
      setLoadingMore(false)
    }
  }

  // Fetch Saved Templates
  const fetchTemplates = async () => {
    setLoadingTemplates(true)
    try {
      const res = await api.get('/content/templates')
      if (res.data) {
        setTemplates(res.data)
      }
    } catch (err) {
      console.error('Failed to fetch templates:', err)
      toast.error('Failed to load templates.')
    } finally {
      setLoadingTemplates(false)
    }
  }

  useEffect(() => {
    fetchHistory(true)
    fetchTemplates()
  }, [])

  // Refetch list on tab swap
  const handleTabChange = (tab: 'history' | 'templates') => {
    setActiveTab(tab)
    if (tab === 'history') {
      fetchHistory(true)
    } else {
      fetchTemplates()
    }
  }

  // Open Drawer Session Detail
  const openDetailDrawer = async (sessionId: string) => {
    setSelectedSessionId(sessionId)
    setLoadingDetail(true)
    try {
      const res = await api.get(`/content/history/${sessionId}`)
      if (res.data) {
        setSessionDetail(res.data)
        
        // Auto select first non-null platform tab
        const order = ['instagram_post', 'linkedin_post', 'facebook_post', 'instagram_story']
        const available = order.find(key => res.data[key] !== null)
        if (available) {
          setActiveDetailTab(available)
        }
      }
    } catch (err) {
      console.error('Failed to fetch detail:', err)
      toast.error('Failed to load session details.')
      setSelectedSessionId(null)
    } finally {
      setLoadingDetail(false)
    }
  }

  // Handle Save Template Trigger
  const triggerSaveTemplate = (contentId: string, platform: string, defaultName: string) => {
    setSavingPost({ id: contentId, platform })
    setTemplateName(`${defaultName} - ${platform.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())}`)
  }

  // Submit Save Template
  const handleSaveTemplateSubmit = async () => {
    if (!savingPost || !templateName.trim()) return
    setIsSavingTemplate(true)
    
    try {
      const res = await api.post('/content/save-template', {
        content_id: savingPost.id,
        platform: savingPost.platform,
        custom_name: templateName.trim()
      })
      if (res.data.success) {
        toast.success('Template saved to bookmarks!')
        fetchTemplates()
        setSavingPost(null)
        setTemplateName('')
      }
    } catch (err) {
      console.error('Failed to save template:', err)
      toast.error('Failed to save template.')
    } finally {
      setIsSavingTemplate(false)
    }
  }

  // Filter Logic client-side
  const getFilteredItems = () => {
    return historyItems.filter(item => {
      // 1. Platform Filter
      if (platformFilter !== 'all') {
        const hasPlatform = item.platforms_generated.some(p => p.includes(platformFilter))
        if (!hasPlatform) return false
      }
      
      // 2. Date Filter
      if (dateFilter !== 'all') {
        const itemDate = new Date(item.created_at)
        const today = new Date()
        
        if (dateFilter === 'week') {
          const oneWeekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000)
          if (itemDate < oneWeekAgo) return false
        } else if (dateFilter === 'month') {
          const oneMonthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000)
          if (itemDate < oneMonthAgo) return false
        }
      }
      
      return true
    })
  }

  // Helper date formatting
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
    switch (platform) {
      case 'instagram':
      case 'instagram_post':
        return <Share2 className="h-4 w-4 text-pink-400" />
      case 'instagram_story':
        return <Share2 className="h-4 w-4 text-purple-400" />
      case 'linkedin':
      case 'linkedin_post':
        return <Users className="h-4 w-4 text-blue-400" />
      case 'facebook':
      case 'facebook_post':
        return <Layout className="h-4 w-4 text-blue-500" />
      default:
        return <Globe className="h-4 w-4 text-gray-400" />
    }
  }

  const getPlatformLabel = (platform: string) => {
    return platform.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())
  }

  const filteredHistory = getFilteredItems()

  return (
    <div className="space-y-8 max-w-6xl mx-auto pb-16 relative">
      
      {/* ─── PAGE HEADER ─── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1.5">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-[10px] font-black uppercase tracking-widest text-indigo-400">
            <History className="h-3 w-3" />
            Archive Lounge
          </div>
          <h1 className="text-3xl font-black text-white tracking-tight">Content History</h1>
          <p className="text-gray-400 text-sm font-medium">All your generated social media assets & custom saved templates</p>
        </div>

        {/* Tab Selector */}
        <div className="flex bg-white/5 border border-white/10 p-1.5 rounded-2xl self-start md:self-auto">
          <button
            onClick={() => handleTabChange('history')}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-xs transition-all ${
              activeTab === 'history'
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/25'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            <History className="h-3.5 w-3.5" />
            History Log
          </button>
          <button
            onClick={() => handleTabChange('templates')}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-xs transition-all ${
              activeTab === 'templates'
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/25'
                : 'text-gray-400 hover:text-gray-200'
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
          <div className="flex flex-col md:flex-row gap-4 justify-between bg-white/[0.02] border border-white/5 p-4 rounded-2xl backdrop-blur-md">
            
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
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition ${
                    platformFilter === opt.id
                      ? 'bg-blue-500/10 border border-blue-500/20 text-blue-400'
                      : 'bg-white/5 border border-white/5 text-gray-400 hover:text-gray-200'
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
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition ${
                    dateFilter === opt.id
                      ? 'bg-purple-500/10 border border-purple-500/20 text-purple-400'
                      : 'bg-white/5 border border-white/5 text-gray-400 hover:text-gray-200'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

          </div>

          {/* ─── HISTORY ITEMS GRID ─── */}
          {loadingHistory ? (
            <div className="grid sm:grid-cols-2 gap-6">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="bg-white/[0.02] border border-white/5 p-6 rounded-3xl space-y-4">
                  <Skeleton width="30%" height="16px" rounded="md" />
                  <Skeleton width="80%" height="24px" rounded="md" />
                  <Skeleton width="100%" height="40px" rounded="md" />
                </div>
              ))}
            </div>
          ) : filteredHistory.length === 0 ? (
            <EmptyState
              emoji="✨"
              title="No history found"
              subtitle="No generated sessions match your filters. Launch a new creative content session now!"
              buttonText="Create Content"
              onButtonClick={() => router.push('/session')}
            />
          ) : (
            <div className="grid sm:grid-cols-2 gap-6">
              {filteredHistory.map((item) => (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-white/[0.01] hover:bg-white/[0.02] border border-white/5 p-6 rounded-3xl relative overflow-hidden flex flex-col justify-between hover:border-white/10 transition-all duration-300 shadow-xl group"
                >
                  <div className="space-y-4">
                    {/* Header: Date + Platforms */}
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-2 text-xs font-extrabold text-indigo-400/80 bg-indigo-500/5 px-3 py-1.5 rounded-xl border border-indigo-500/10">
                        <Calendar className="h-3.5 w-3.5" />
                        <span>{formatDateLabel(item.session_date)}</span>
                      </div>
                      
                      {/* Platform Bubbles */}
                      <div className="flex gap-1">
                        {item.platforms_generated.map(p => (
                          <div 
                            key={p} 
                            className="h-7 w-7 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center"
                            title={getPlatformLabel(p)}
                          >
                            {getPlatformIcon(p)}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Theme / Description */}
                    <div className="space-y-1">
                      <h3 className="text-lg font-black text-white leading-snug tracking-tight group-hover:text-blue-400 transition-colors">
                        {item.session_theme}
                      </h3>
                      <p className="text-xs text-gray-400 leading-relaxed line-clamp-2">
                        {item.instagram_caption || item.linkedin_caption || "Click below to review multi-platform text, optimal schedules, and strategies."}
                      </p>
                    </div>
                  </div>

                  {/* Actions Bar */}
                  <div className="flex gap-2.5 mt-6 border-t border-white/5 pt-4">
                    <button
                      onClick={() => openDetailDrawer(item.id)}
                      className="flex-1 flex items-center justify-center gap-1.5 px-4.5 py-3 rounded-xl bg-blue-600 text-white font-extrabold text-xs hover:bg-blue-500 transition shadow-lg shadow-blue-500/10 active:scale-[0.98]"
                    >
                      View Full Content
                      <ChevronRight className="h-4 w-4" />
                    </button>
                    
                    <button
                      onClick={() => triggerSaveTemplate(item.id, item.platforms_generated[0] || 'instagram_post', item.session_theme)}
                      className="p-3 rounded-xl bg-white/5 border border-white/10 text-gray-400 hover:text-yellow-400 hover:border-yellow-500/20 transition active:scale-[0.98]"
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
                className="flex items-center gap-2 px-8 py-3.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white font-extrabold text-xs transition active:scale-[0.98]"
              >
                {loadingMore ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin text-blue-400" />
                    Loading Archives...
                  </>
                ) : (
                  <>
                    Load More Content
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
                <div key={i} className="bg-white/[0.02] border border-white/5 p-6 rounded-3xl space-y-4">
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
                  className="bg-white/[0.01] hover:bg-white/[0.02] border border-white/5 p-6 rounded-3xl flex flex-col justify-between hover:border-white/10 transition-all duration-300 relative group overflow-hidden shadow-xl"
                >
                  <div className="space-y-4">
                    {/* Header: Platform + Date */}
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 text-[10px] font-black uppercase text-gray-300">
                        {getPlatformIcon(tpl.platform)}
                        <span>{getPlatformLabel(tpl.platform)}</span>
                      </div>
                      <span className="text-[10px] text-gray-500 font-bold">
                        {formatDateLabel(tpl.created_at)}
                      </span>
                    </div>

                    {/* Custom Title */}
                    <div className="space-y-2">
                      <h4 className="font-extrabold text-base text-white tracking-tight leading-snug">
                        {tpl.custom_name}
                      </h4>
                      <div className="bg-white/[0.005] border border-white/5 rounded-2xl p-4 text-xs text-gray-300 leading-relaxed whitespace-pre-wrap max-h-40 overflow-y-auto scrollbar-thin">
                        {tpl.caption}
                      </div>
                      
                      {tpl.hashtags && tpl.hashtags.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          {tpl.hashtags.map(tag => (
                            <span key={tag} className="text-[10px] font-bold text-blue-400 bg-blue-500/5 px-2 py-0.5 rounded-md">
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Actions: Copy Copy Copy */}
                  <div className="flex justify-between items-center gap-3 border-t border-white/5 pt-4 mt-6">
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
                      className="text-xs font-bold text-gray-400 hover:text-white flex items-center gap-1 bg-white/5 px-3 py-2 rounded-xl transition"
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
              animate={{ opacity: 0.6 }}
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
              className="fixed top-0 right-0 bottom-0 w-full max-w-2xl bg-[#08080a] border-l border-white/5 z-50 flex flex-col justify-between shadow-2xl p-6 md:p-8"
            >
              {loadingDetail ? (
                <div className="flex h-full flex-col items-center justify-center gap-3">
                  <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
                  <p className="text-gray-400 text-xs font-semibold">Retrieving session copy assets...</p>
                </div>
              ) : sessionDetail ? (
                <div className="flex flex-col h-full justify-between overflow-y-auto scrollbar-hide pr-1 -mr-1">
                  
                  {/* Drawer Header */}
                  <div className="flex justify-between items-start border-b border-white/5 pb-5">
                    <div className="space-y-1 pr-6">
                      <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-[10px] font-black uppercase text-blue-400">
                        <Sparkles className="h-3 w-3" />
                        AI Generation Suite
                      </div>
                      <h2 className="text-xl font-black text-white tracking-tight leading-snug">{sessionDetail.session_theme}</h2>
                    </div>
                    <button
                      onClick={() => setSelectedSessionId(null)}
                      className="p-2 rounded-xl bg-white/5 hover:bg-white/10 transition border border-white/10"
                    >
                      <X className="h-4 w-4 text-gray-400 hover:text-white" />
                    </button>
                  </div>

                  {/* Drawer Navigation Tabs */}
                  <div className="flex gap-1.5 mt-6 border-b border-white/5 overflow-x-auto scrollbar-hide">
                    {[
                      { id: 'instagram_post', label: 'Instagram Post', check: sessionDetail.instagram_post },
                      { id: 'linkedin_post', label: 'LinkedIn', check: sessionDetail.linkedin_post },
                      { id: 'facebook_post', label: 'Facebook', check: sessionDetail.facebook_post },
                      { id: 'instagram_story', label: 'Story', check: sessionDetail.instagram_story }
                    ].map(tab => {
                      if (!tab.check) return null
                      return (
                        <button
                          key={tab.id}
                          onClick={() => setActiveDetailTab(tab.id)}
                          className={`px-5 py-3 font-bold text-xs whitespace-nowrap transition-all border-b-2 ${
                            activeDetailTab === tab.id
                              ? 'border-blue-500 text-blue-400 bg-blue-500/5'
                              : 'border-transparent text-gray-500 hover:text-gray-300'
                          }`}
                        >
                          {tab.label}
                        </button>
                      )
                    })}
                  </div>

                  {/* Drawer Tab Content */}
                  <div className="flex-1 py-6 space-y-6">
                    {/* Render Instagram Post */}
                    {activeDetailTab === 'instagram_post' && sessionDetail.instagram_post && (
                      <div className="space-y-6">
                        <div className="flex justify-between items-center">
                          <h4 className="text-xs font-black uppercase tracking-widest text-gray-500">Instagram Caption</h4>
                          <CopyButton text={sessionDetail.instagram_post.caption} label="Caption" />
                        </div>
                        <div className="bg-white/[0.01] border border-white/5 p-6 rounded-3xl text-sm text-gray-200 leading-relaxed whitespace-pre-wrap">
                          {sessionDetail.instagram_post.caption}
                        </div>
                        {sessionDetail.instagram_post.hashtags && (
                          <div className="flex flex-wrap gap-2">
                            {sessionDetail.instagram_post.hashtags.map((tag: string) => (
                              <span key={tag} className="text-xs font-bold text-blue-400 bg-blue-500/10 px-3 py-1 rounded-full">
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
                        <div className="grid grid-cols-2 gap-4 bg-white/[0.01] border border-white/5 p-5 rounded-3xl">
                          <div>
                            <p className="text-[10px] font-black uppercase text-gray-500">Optimal Day</p>
                            <p className="text-sm font-bold text-white mt-0.5">{sessionDetail.instagram_post.best_day || 'Wednesday'}</p>
                          </div>
                          <div>
                            <p className="text-[10px] font-black uppercase text-gray-500">Optimal Time</p>
                            <p className="text-sm font-bold text-white mt-0.5">{sessionDetail.instagram_post.best_time || '10:00 AM'}</p>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Render LinkedIn Post */}
                    {activeDetailTab === 'linkedin_post' && sessionDetail.linkedin_post && (
                      <div className="space-y-6">
                        <div className="flex justify-between items-center">
                          <h4 className="text-xs font-black uppercase tracking-widest text-gray-500">LinkedIn Content</h4>
                          <CopyButton text={sessionDetail.linkedin_post.caption} label="Post" />
                        </div>
                        <div className="bg-white/[0.01] border border-white/5 p-6 rounded-3xl text-sm text-gray-200 leading-relaxed whitespace-pre-wrap">
                          {sessionDetail.linkedin_post.caption}
                        </div>
                        {sessionDetail.linkedin_post.hashtags && (
                          <div className="flex flex-wrap gap-2">
                            {sessionDetail.linkedin_post.hashtags.map((tag: string) => (
                              <span key={tag} className="text-xs font-bold text-blue-400 bg-blue-500/10 px-3 py-1 rounded-full">
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Render Facebook Post */}
                    {activeDetailTab === 'facebook_post' && sessionDetail.facebook_post && (
                      <div className="space-y-6">
                        <div className="flex justify-between items-center">
                          <h4 className="text-xs font-black uppercase tracking-widest text-gray-500">Facebook Caption</h4>
                          <CopyButton text={sessionDetail.facebook_post.caption} label="Caption" />
                        </div>
                        <div className="bg-white/[0.01] border border-white/5 p-6 rounded-3xl text-sm text-gray-200 leading-relaxed whitespace-pre-wrap">
                          {sessionDetail.facebook_post.caption}
                        </div>
                      </div>
                    )}

                    {/* Render Instagram Story */}
                    {activeDetailTab === 'instagram_story' && sessionDetail.instagram_story && (
                      <div className="space-y-6">
                        <div className="flex justify-between items-center">
                          <h4 className="text-xs font-black uppercase tracking-widest text-gray-500">Story Copy</h4>
                          <CopyButton text={sessionDetail.instagram_story.text} label="Story Text" />
                        </div>
                        <div className="bg-white/[0.01] border border-white/5 p-8 rounded-3xl text-center italic text-lg text-white font-extrabold">
                          &ldquo;{sessionDetail.instagram_story.text}&rdquo;
                        </div>
                        <div className="bg-white/[0.01] border border-white/5 p-6 rounded-3xl space-y-4">
                          <div>
                            <p className="text-[10px] font-black uppercase text-gray-500">Suggested CTA Swipe / Reply</p>
                            <p className="text-sm font-bold text-white mt-1">{sessionDetail.instagram_story.cta || 'DM to access!'}</p>
                          </div>
                          <div>
                            <p className="text-[10px] font-black uppercase text-gray-500">Interactive Poll Question</p>
                            <p className="text-sm font-bold text-white mt-1">{sessionDetail.instagram_story.poll_question || 'Ask what they think!'}</p>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Guidance Card */}
                    <div className="bg-gradient-to-r from-blue-600/5 to-transparent border-l-2 border-blue-500 p-5 rounded-r-3xl space-y-1">
                      <p className="text-[10px] font-black uppercase text-blue-400">Content Angle Strategy</p>
                      <p className="text-xs text-gray-400 leading-relaxed">{sessionDetail.guidance?.tip_of_day || 'Align this post theme with your main products to elevate conversion ratios.'}</p>
                    </div>
                  </div>

                  {/* Drawer Footer actions */}
                  <div className="border-t border-white/5 pt-5 flex gap-3">
                    <button
                      onClick={() => {
                        toast.success('Strategy context loaded! Head into session...')
                        router.push('/session')
                      }}
                      className="flex-1 flex items-center justify-center gap-2 bg-gradient-to-r from-blue-600 to-purple-600 text-white font-black px-6 py-4 rounded-xl text-xs hover:opacity-95 transition shadow-lg shadow-blue-500/10 active:scale-[0.98]"
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
                      className="px-5 rounded-xl border border-white/10 bg-white/5 text-gray-300 hover:text-yellow-400 hover:border-yellow-500/20 font-bold text-xs transition"
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
              animate={{ opacity: 0.6 }}
              exit={{ opacity: 0 }}
              onClick={() => setSavingPost(null)}
              className="fixed inset-0 bg-black z-50 backdrop-blur-sm"
            />
            
            {/* Dialog */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="fixed inset-0 m-auto max-h-[300px] w-[90%] max-w-md bg-[#0e0e11] border border-white/10 rounded-[2.5rem] z-50 flex flex-col justify-between shadow-2xl p-6 md:p-8"
            >
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="text-lg font-black text-white tracking-tight">Save as Template</h3>
                  <button
                    onClick={() => setSavingPost(null)}
                    className="p-1 rounded-lg bg-white/5 hover:bg-white/10 transition border border-white/10"
                  >
                    <X className="h-4 w-4 text-gray-400" />
                  </button>
                </div>
                
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-gray-500">Template Custom Name</label>
                  <input
                    type="text"
                    value={templateName}
                    onChange={(e) => setTemplateName(e.target.value)}
                    placeholder="Enter template name..."
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-white/5 mt-4">
                <button
                  onClick={() => setSavingPost(null)}
                  className="px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 font-bold text-xs transition"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveTemplateSubmit}
                  disabled={isSavingTemplate || !templateName.trim()}
                  className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-black text-xs transition shadow-lg shadow-blue-500/25 disabled:opacity-50"
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
