'use client'

import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import toast from 'react-hot-toast'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/react/daygrid'
import timeGridPlugin from '@fullcalendar/react/timegrid'
import interactionPlugin from '@fullcalendar/react/interaction'
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Plus,
  X,
  Upload,
  Trash2,
  Save,
  Clock,
  Sparkles,
  Image as ImageIcon
} from 'lucide-react'
import {
  getScheduledPosts,
  createScheduledPost,
  updateScheduledPost,
  deleteScheduledPost,
  uploadBrandLogo
} from '@/lib/api'

interface ScheduledPost {
  id: string
  brand_id: string
  platform: string
  caption: string | null
  media_url: string | null
  scheduled_at: string
  status: 'Draft' | 'Pending Approval' | 'Scheduled' | 'Publishing' | 'Published' | 'Failed'
  external_post_id: string | null
  error: string | null
  created_at: string
}

const PLATFORMS = [
  { id: 'instagram_post', label: 'Instagram Post', icon: '📸', color: '#E1306C' },
  { id: 'instagram_story', label: 'Instagram Story', icon: '📱', color: '#C13584' },
  { id: 'linkedin', label: 'LinkedIn', icon: '💼', color: '#0A66C2' },
  { id: 'facebook', label: 'Facebook', icon: '📘', color: '#1877F2' },
  { id: 'twitter', label: 'X / Twitter', icon: '🐦', color: '#1DA1F2' },
]

const STATUS_CONFIG: Record<
  ScheduledPost['status'],
  { label: string; bg: string; text: string; border: string; dot: string }
> = {
  Draft: {
    label: 'Draft',
    bg: 'bg-surface-secondary',
    text: 'text-muted',
    border: 'border-border',
    dot: 'bg-muted',
  },
  'Pending Approval': {
    label: 'Pending Approval',
    bg: 'bg-accent/15',
    text: 'text-accent',
    border: 'border-accent/40',
    dot: 'bg-accent',
  },
  Scheduled: {
    label: 'Scheduled',
    bg: 'bg-primary/15',
    text: 'text-primary-light',
    border: 'border-primary/40',
    dot: 'bg-primary-light',
  },
  Publishing: {
    label: 'Publishing',
    bg: 'bg-amber-500/15',
    text: 'text-amber-300',
    border: 'border-amber-500/40',
    dot: 'bg-amber-400 animate-ping',
  },
  Published: {
    label: 'Published',
    bg: 'bg-success/15',
    text: 'text-success',
    border: 'border-success/40',
    dot: 'bg-success',
  },
  Failed: {
    label: 'Failed',
    bg: 'bg-danger/15',
    text: 'text-danger',
    border: 'border-danger/40',
    dot: 'bg-danger',
  },
}

export default function CalendarPage() {
  const [posts, setPosts] = useState<ScheduledPost[]>([])
  const [loading, setLoading] = useState(true)
  const [currentView, setCurrentView] = useState<'dayGridMonth' | 'timeGridWeek'>('dayGridMonth')
  const [currentTitle, setCurrentTitle] = useState('')
  const calendarRef = useRef<any>(null)

  // Drawer State
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)
  const [selectedPost, setSelectedPost] = useState<ScheduledPost | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [savingPost, setSavingPost] = useState(false)
  const [uploadingImage, setUploadingImage] = useState(false)

  // Drawer Form State
  const [formPlatform, setFormPlatform] = useState('instagram_post')
  const [formCaption, setFormCaption] = useState('')
  const [formMediaUrl, setFormMediaUrl] = useState('')
  const [formScheduledAt, setFormScheduledAt] = useState('')
  const [formStatus, setFormStatus] = useState<ScheduledPost['status']>('Draft')

  const fileInputRef = useRef<HTMLInputElement>(null)

  // Load scheduled posts from backend
  const fetchPosts = async () => {
    try {
      setLoading(true)
      const data = await getScheduledPosts()
      setPosts(data || [])
    } catch (err) {
      console.error('Failed to load scheduled posts', err)
      toast.error('Could not load calendar posts')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchPosts()
  }, [])

  // Sync calendar title on view change / mount
  useEffect(() => {
    if (calendarRef.current) {
      const api = calendarRef.current.getApi()
      setCurrentTitle(api.view.title)
    }
  }, [posts, currentView])

  // FullCalendar Navigation Handlers
  const handlePrev = () => {
    if (calendarRef.current) {
      const api = calendarRef.current.getApi()
      api.prev()
      setCurrentTitle(api.view.title)
    }
  }

  const handleNext = () => {
    if (calendarRef.current) {
      const api = calendarRef.current.getApi()
      api.next()
      setCurrentTitle(api.view.title)
    }
  }

  const handleToday = () => {
    if (calendarRef.current) {
      const api = calendarRef.current.getApi()
      api.today()
      setCurrentTitle(api.view.title)
    }
  }

  const handleViewChange = (view: 'dayGridMonth' | 'timeGridWeek') => {
    setCurrentView(view)
    if (calendarRef.current) {
      const api = calendarRef.current.getApi()
      api.changeView(view)
      setCurrentTitle(api.view.title)
    }
  }

  // ─── Drag and Drop Rescheduling Handler ──────────────────────────────────
  const handleEventDrop = async (dropInfo: any) => {
    const post = dropInfo.event.extendedProps as ScheduledPost
    const newDate = dropInfo.event.start
    if (!newDate) return

    const isoString = newDate.toISOString()

    // Optimistic UI update
    setPosts(prev =>
      prev.map(p => (p.id === post.id ? { ...p, scheduled_at: isoString } : p))
    )

    try {
      await updateScheduledPost(post.id, {
        scheduled_at: isoString,
      })
      const formatted = new Date(isoString).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
      toast.success(`Post rescheduled to ${formatted}`)
    } catch (err) {
      console.error('Reschedule failed', err)
      toast.error('Failed to reschedule post')
      dropInfo.revert()
      fetchPosts()
    }
  }

  // ─── Drawer Open Handlers ────────────────────────────────────────────────
  const handleOpenEditDrawer = (post: ScheduledPost) => {
    setSelectedPost(post)
    setIsCreating(false)
    setFormPlatform(post.platform)
    setFormCaption(post.caption || '')
    setFormMediaUrl(post.media_url || '')
    setFormStatus(post.status)

    // Format for datetime-local input: YYYY-MM-DDTHH:mm
    const dt = new Date(post.scheduled_at)
    const localIso = new Date(dt.getTime() - dt.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16)
    setFormScheduledAt(localIso)

    setIsDrawerOpen(true)
  }

  const handleOpenCreateDrawer = () => {
    setSelectedPost(null)
    setIsCreating(true)
    setFormPlatform('instagram_post')
    setFormCaption('')
    setFormMediaUrl('')
    setFormStatus('Draft')

    // Default to tomorrow 10:00 AM
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    tomorrow.setHours(10, 0, 0, 0)
    const localIso = new Date(tomorrow.getTime() - tomorrow.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16)
    setFormScheduledAt(localIso)

    setIsDrawerOpen(true)
  }

  // ─── Drawer Save / Update / Delete ───────────────────────────────────────
  const handleSavePost = async () => {
    if (!formScheduledAt) {
      toast.error('Please select a date and time')
      return
    }

    try {
      setSavingPost(true)
      const scheduledUtc = new Date(formScheduledAt).toISOString()

      if (isCreating) {
        const created = await createScheduledPost({
          platform: formPlatform,
          caption: formCaption,
          media_url: formMediaUrl || null,
          scheduled_at: scheduledUtc,
          status: formStatus,
        })
        setPosts(prev => [...prev, created])
        toast.success('Post added to calendar schedule!')
      } else if (selectedPost) {
        const updated = await updateScheduledPost(selectedPost.id, {
          platform: formPlatform,
          caption: formCaption,
          media_url: formMediaUrl || null,
          scheduled_at: scheduledUtc,
          status: formStatus,
        })
        setPosts(prev => prev.map(p => (p.id === selectedPost.id ? updated : p)))
        toast.success('Scheduled post updated!')
      }
      setIsDrawerOpen(false)
    } catch (err: any) {
      console.error('Failed to save post', err)
      toast.error(err.response?.data?.detail || 'Failed to save post')
    } finally {
      setSavingPost(false)
    }
  }

  const handleDeletePost = async () => {
    if (!selectedPost) return
    if (!confirm('Are you sure you want to delete this scheduled post?')) return

    try {
      await deleteScheduledPost(selectedPost.id)
      setPosts(prev => prev.filter(p => p.id !== selectedPost.id))
      toast.success('Post removed from calendar')
      setIsDrawerOpen(false)
    } catch (err) {
      console.error('Failed to delete post', err)
      toast.error('Could not delete post')
    }
  }

  const handleMediaUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    try {
      setUploadingImage(true)
      const res = await uploadBrandLogo(file, 'primary')
      setFormMediaUrl(res.url)
      toast.success('Media uploaded to Cloudflare R2!')
    } catch (err: any) {
      console.error('Media upload error', err)
      toast.error('Failed to upload media')
    } finally {
      setUploadingImage(false)
    }
  }

  // ─── Convert Posts to FullCalendar Events ────────────────────────────────
  const calendarEvents = posts.map(post => {
    return {
      id: post.id,
      title: post.caption ? post.caption.slice(0, 35) : 'Scheduled Post',
      start: post.scheduled_at,
      allDay: false,
      extendedProps: post,
    }
  })

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      {/* Calendar Header Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border pb-5">
        <div>
          <h1 className="text-3xl font-extrabold text-text tracking-tight flex items-center gap-2.5">
            <CalendarIcon className="h-7 w-7 text-primary-light" />
            Content Calendar &amp; Schedule
          </h1>
          <p className="text-sm text-muted mt-1">
            Drag and drop posts to reschedule, manage platform publishing, and review status.
          </p>
        </div>

        {/* Action Button: Schedule Post */}
        <button
          onClick={handleOpenCreateDrawer}
          className="px-5 py-2.5 bg-accent hover:bg-accent-hover text-black font-extrabold text-sm rounded-xl transition duration-200 shadow-accent-glow flex items-center gap-2 active:scale-95 self-start md:self-auto"
        >
          <Plus className="h-4 w-4 text-black stroke-[3]" />
          <span>Schedule Post</span>
        </button>
      </div>

      {/* Control Ribbon: Navigation, Month/Week View Switcher, and Status Legend */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 p-4 rounded-2xl bg-surface border border-border">
        {/* Date Nav Controls */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 bg-surface-secondary border border-border rounded-xl p-1">
            <button
              onClick={handlePrev}
              className="p-1.5 rounded-lg text-muted hover:text-text hover:bg-surface transition"
              title="Previous"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={handleToday}
              className="px-3 py-1 rounded-lg text-xs font-bold text-text hover:bg-surface transition"
            >
              Today
            </button>
            <button
              onClick={handleNext}
              className="p-1.5 rounded-lg text-muted hover:text-text hover:bg-surface transition"
              title="Next"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <h2 className="text-base sm:text-lg font-extrabold text-text tracking-tight min-w-[160px]">
            {currentTitle || 'Calendar View'}
          </h2>
        </div>

        {/* View Switcher (Month / Week) & Legend */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Status Badges Legend */}
          <div className="hidden sm:flex items-center gap-2 mr-2 text-[11px] font-bold text-muted">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-primary-light" /> Scheduled
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-success" /> Published
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-muted" /> Draft
            </span>
          </div>

          {/* Month / Week View Toggle */}
          <div className="flex items-center gap-1 bg-surface-secondary border border-border rounded-xl p-1">
            <button
              onClick={() => handleViewChange('dayGridMonth')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                currentView === 'dayGridMonth'
                  ? 'bg-accent text-black font-extrabold shadow-sm'
                  : 'text-muted hover:text-text'
              }`}
            >
              Month View
            </button>
            <button
              onClick={() => handleViewChange('timeGridWeek')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                currentView === 'timeGridWeek'
                  ? 'bg-accent text-black font-extrabold shadow-sm'
                  : 'text-muted hover:text-text'
              }`}
            >
              Week View
            </button>
          </div>
        </div>
      </div>

      {/* Main FullCalendar Board */}
      <div className="p-4 sm:p-6 rounded-3xl bg-surface border border-border shadow-xl min-h-[640px]">
        {loading ? (
          <div className="space-y-4">
            <div className="h-10 rounded-xl bg-surface-secondary/70 border border-border animate-pulse" />
            <div className="h-[520px] rounded-2xl bg-surface-secondary/50 border border-border animate-pulse" />
          </div>
        ) : (
          <FullCalendar
            ref={calendarRef}
            plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
            initialView={currentView}
            headerToolbar={false} // Handled by custom header ribbon above
            editable={true}
            droppable={true}
            events={calendarEvents}
            eventDrop={handleEventDrop}
            eventClick={info => {
              const post = info.event.extendedProps as ScheduledPost
              handleOpenEditDrawer(post)
            }}
            height="auto"
            dayMaxEvents={3}
            eventContent={eventInfo => {
              const post = eventInfo.event.extendedProps as ScheduledPost
              const statusCfg = STATUS_CONFIG[post.status] || STATUS_CONFIG.Draft
              const platformCfg = PLATFORMS.find(p => p.id === post.platform) || PLATFORMS[0]

              return (
                <div className="w-full p-1.5 rounded-xl bg-surface-secondary hover:bg-surface-hover border border-border hover:border-primary/50 transition cursor-grab active:cursor-grabbing shadow-sm flex flex-col gap-1 text-left my-0.5">
                  {/* Top: Platform & Status Badge */}
                  <div className="flex items-center justify-between gap-1">
                    <span className="flex items-center gap-1 text-[11px] font-bold text-text truncate">
                      <span>{platformCfg.icon}</span>
                      <span className="truncate">{platformCfg.label}</span>
                    </span>

                    <span
                      className={`inline-flex items-center gap-1 px-1.5 py-0.2 rounded-md text-[9px] font-extrabold border ${statusCfg.bg} ${statusCfg.text} ${statusCfg.border}`}
                    >
                      <span className={`h-1.5 w-1.5 rounded-full ${statusCfg.dot}`} />
                      <span>{statusCfg.label}</span>
                    </span>
                  </div>

                  {/* Caption preview & thumbnail indicator */}
                  <div className="flex items-center justify-between gap-1 text-[10px] text-muted">
                    <p className="truncate font-medium flex-1">
                      {post.caption || 'No caption text'}
                    </p>
                    {post.media_url && (
                      <ImageIcon className="h-3 w-3 text-primary-light shrink-0" />
                    )}
                  </div>
                </div>
              )
            }}
          />
        )}
      </div>

      {/* ═════════════════════════════════════════════════════════════ */}
      {/* SIDE DRAWER: EDIT & SCHEDULE POST                             */}
      {/* ═════════════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {isDrawerOpen && (
          <div className="fixed inset-0 z-50 overflow-hidden">
            {/* Backdrop Blur */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsDrawerOpen(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />

            <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
              <motion.div
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                exit={{ x: '100%' }}
                transition={{ type: 'spring', damping: 28, stiffness: 280 }}
                className="w-screen max-w-md bg-surface border-l border-border shadow-2xl flex flex-col justify-between"
              >
                {/* Drawer Header */}
                <div className="p-6 border-b border-border flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-extrabold text-text flex items-center gap-2">
                      <Sparkles className="h-5 w-5 text-primary-light" />
                      {isCreating ? 'Schedule New Post' : 'Edit Scheduled Post'}
                    </h3>
                    <p className="text-xs text-muted mt-0.5">
                      Configure platform copy, target time, and visual media.
                    </p>
                  </div>
                  <button
                    onClick={() => setIsDrawerOpen(false)}
                    className="p-2 rounded-xl text-muted hover:text-text hover:bg-surface-secondary transition"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                {/* Drawer Body Form */}
                <div className="p-6 overflow-y-auto space-y-5 flex-1 scrollbar-thin">
                  {/* Platform Selector */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-muted uppercase tracking-wider">
                      Target Platform
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      {PLATFORMS.map(p => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => setFormPlatform(p.id)}
                          className={`p-2.5 rounded-xl border text-xs font-bold flex items-center gap-2 transition ${
                            formPlatform === p.id
                              ? 'bg-primary/20 border-primary text-primary-light'
                              : 'bg-surface-secondary border-border text-muted hover:text-text'
                          }`}
                        >
                          <span>{p.icon}</span>
                          <span className="truncate">{p.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Scheduled Date and Time */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-muted uppercase tracking-wider flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5 text-primary-light" />
                      Date &amp; Time
                    </label>
                    <input
                      type="datetime-local"
                      value={formScheduledAt}
                      onChange={e => setFormScheduledAt(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-surface-secondary border border-border text-sm font-semibold text-text focus:outline-none focus:border-primary"
                    />
                  </div>

                  {/* Status Badges Selector */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-muted uppercase tracking-wider">
                      Publishing Status
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      {(['Draft', 'Pending Approval', 'Scheduled', 'Publishing', 'Published', 'Failed'] as const).map(
                        st => {
                          const cfg = STATUS_CONFIG[st]
                          const isSelected = formStatus === st
                          return (
                            <button
                              key={st}
                              type="button"
                              onClick={() => setFormStatus(st)}
                              className={`px-3 py-1 rounded-lg text-xs font-bold border transition flex items-center gap-1.5 ${
                                isSelected
                                  ? `${cfg.bg} ${cfg.text} ${cfg.border} ring-1 ring-primary/40`
                                  : 'bg-surface-secondary border-border text-muted hover:text-text'
                              }`}
                            >
                              <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
                              <span>{cfg.label}</span>
                            </button>
                          )
                        }
                      )}
                    </div>
                  </div>

                  {/* Media / Image Preview and Uploader */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-muted uppercase tracking-wider flex items-center gap-1.5">
                        <ImageIcon className="h-3.5 w-3.5 text-primary-light" />
                        Attached Graphic / Media
                      </label>
                      {formMediaUrl && (
                        <button
                          type="button"
                          onClick={() => setFormMediaUrl('')}
                          className="text-[11px] text-danger hover:underline"
                        >
                          Remove
                        </button>
                      )}
                    </div>

                    {formMediaUrl ? (
                      <div className="relative h-40 w-full rounded-2xl bg-surface-secondary border border-border overflow-hidden flex items-center justify-center p-2">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={formMediaUrl}
                          alt="Scheduled media preview"
                          className="h-full w-full object-contain rounded-xl"
                        />
                      </div>
                    ) : (
                      <div className="h-28 w-full rounded-2xl bg-surface-secondary border border-dashed border-border flex flex-col items-center justify-center text-center p-3">
                        <Upload className="h-6 w-6 text-muted mb-1" />
                        <span className="text-xs text-muted">No media currently attached</span>
                      </div>
                    )}

                    <input
                      type="file"
                      ref={fileInputRef}
                      className="hidden"
                      accept="image/*"
                      onChange={handleMediaUpload}
                    />

                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploadingImage}
                        className="flex-1 py-2 bg-surface-secondary border border-primary text-text hover:bg-primary hover:text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 disabled:opacity-50"
                      >
                        <Upload className={`h-3.5 w-3.5 ${uploadingImage ? 'animate-bounce' : ''}`} />
                        <span>{uploadingImage ? 'Uploading to R2...' : 'Upload Media to R2'}</span>
                      </button>
                    </div>

                    <input
                      type="text"
                      placeholder="Or enter CDN image URL..."
                      value={formMediaUrl}
                      onChange={e => setFormMediaUrl(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-surface-secondary border border-border text-xs text-text focus:outline-none focus:border-primary"
                    />
                  </div>

                  {/* Caption Textarea */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-muted uppercase tracking-wider">
                        Platform Caption
                      </label>
                      <span className="text-[11px] text-muted font-mono">
                        {formCaption.length} chars
                      </span>
                    </div>
                    <textarea
                      rows={4}
                      value={formCaption}
                      onChange={e => setFormCaption(e.target.value)}
                      placeholder="Write engaging brand copy with hashtags and call to action..."
                      className="w-full p-3.5 rounded-xl bg-surface-secondary border border-border text-xs text-text leading-relaxed focus:outline-none focus:border-primary resize-none"
                    />
                  </div>
                </div>

                {/* Drawer Footer Actions */}
                <div className="p-6 border-t border-border flex items-center justify-between gap-3">
                  {!isCreating && selectedPost ? (
                    <button
                      type="button"
                      onClick={handleDeletePost}
                      className="p-2.5 rounded-xl bg-danger/10 border border-danger/30 text-danger hover:bg-danger/20 transition"
                      title="Delete post"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  ) : (
                    <div />
                  )}

                  <div className="flex items-center gap-2.5">
                    <button
                      type="button"
                      onClick={() => setIsDrawerOpen(false)}
                      className="px-4 py-2.5 rounded-xl text-xs font-bold text-muted hover:text-text hover:bg-surface-secondary transition"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleSavePost}
                      disabled={savingPost}
                      className="px-5 py-2.5 bg-accent hover:bg-accent-hover text-black font-extrabold text-xs rounded-xl transition duration-200 shadow-accent-glow flex items-center gap-1.5 disabled:opacity-50"
                    >
                      <Save className="h-3.5 w-3.5 text-black" />
                      <span>{savingPost ? 'Saving...' : isCreating ? 'Schedule Post' : 'Save Changes'}</span>
                    </button>
                  </div>
                </div>
              </motion.div>
            </div>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}
