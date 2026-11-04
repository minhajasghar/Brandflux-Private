'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import toast from 'react-hot-toast'
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
  Image as ImageIcon,
  GripVertical,
  ExternalLink
} from 'lucide-react'
import Link from 'next/link'
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
  post_id?: string | null
  platform_copy_id?: string | null
}

const PLATFORMS = [
  { id: 'instagram_post', label: 'Instagram Post', icon: '📸', color: '#E1306C' },
  { id: 'instagram_story', label: 'Instagram Story', icon: '📱', color: '#C13584' },
  { id: 'linkedin', label: 'LinkedIn', icon: '💼', color: '#0A66C2' },
  { id: 'facebook', label: 'Facebook', icon: '📘', color: '#1877F2' },
  { id: 'twitter', label: 'X / Twitter', icon: '🐦', color: '#1DA1F2' },
  { id: 'tiktok', label: 'TikTok', icon: '🎵', color: '#25F4EE' },
]

const getPlatformConfig = (platform: string) => {
  const norm = (platform || '').toLowerCase().trim()
  return (
    PLATFORMS.find(
      p =>
        p.id === norm ||
        (norm === 'instagram' && p.id === 'instagram_post') ||
        (norm === 'x' && p.id === 'twitter') ||
        (norm === 'twitter' && p.id === 'twitter')
    ) || PLATFORMS[0]
  )
}

// Status styling strictly following Brandflux dark design system tokens:
// Draft: grey, Scheduled: cobalt (#1558C9 / #4C8DFF), Published: green (#10B981), Failed: red (#EF4444)
const STATUS_CONFIG: Record<
  ScheduledPost['status'],
  { label: string; bg: string; text: string; border: string; dot: string; dotHex: string; cardBorder: string }
> = {
  Draft: {
    label: 'Draft',
    bg: 'bg-surface-secondary',
    text: 'text-muted',
    border: 'border-border',
    cardBorder: 'border-border hover:border-muted',
    dot: 'bg-muted',
    dotHex: '#8A90A2',
  },
  'Pending Approval': {
    label: 'Pending Approval',
    bg: 'bg-accent/15',
    text: 'text-accent',
    border: 'border-accent/40',
    cardBorder: 'border-accent/40 hover:border-accent',
    dot: 'bg-accent',
    dotHex: '#D4FF24',
  },
  Scheduled: {
    label: 'Scheduled',
    bg: 'bg-primary/20',
    text: 'text-primary-light',
    border: 'border-primary/40',
    cardBorder: 'border-primary/50 hover:border-primary',
    dot: 'bg-primary-light',
    dotHex: '#4C8DFF',
  },
  Publishing: {
    label: 'Publishing',
    bg: 'bg-amber-500/20',
    text: 'text-amber-300',
    border: 'border-amber-500/40',
    cardBorder: 'border-amber-500/40 hover:border-amber-400',
    dot: 'bg-amber-400 animate-ping',
    dotHex: '#FBBF24',
  },
  Published: {
    label: 'Published',
    bg: 'bg-emerald-500/20',
    text: 'text-emerald-400',
    border: 'border-emerald-500/40',
    cardBorder: 'border-emerald-500/50 hover:border-emerald-400',
    dot: 'bg-emerald-400',
    dotHex: '#10B981',
  },
  Failed: {
    label: 'Failed',
    bg: 'bg-red-500/20',
    text: 'text-red-400',
    border: 'border-red-500/40',
    cardBorder: 'border-red-500/50 hover:border-red-400',
    dot: 'bg-red-400',
    dotHex: '#EF4444',
  },
}

const WEEKDAYS = [
  { short: 'Sun', full: 'Sunday' },
  { short: 'Mon', full: 'Monday' },
  { short: 'Tue', full: 'Tuesday' },
  { short: 'Wed', full: 'Wednesday' },
  { short: 'Thu', full: 'Thursday' },
  { short: 'Fri', full: 'Friday' },
  { short: 'Sat', full: 'Saturday' },
]

export default function CalendarPage() {
  const [posts, setPosts] = useState<ScheduledPost[]>([])
  const [loading, setLoading] = useState(true)
  const [currentView, setCurrentView] = useState<'dayGridMonth' | 'timeGridWeek'>('dayGridMonth')
  
  // Active calendar date anchor (used for both Month and Week views)
  const [activeDate, setActiveDate] = useState<Date>(() => new Date())

  // Drag and Drop state
  const [draggedPostId, setDraggedPostId] = useState<string | null>(null)
  const [dragOverDate, setDragOverDate] = useState<string | null>(null)

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

  // Helper date formatter: YYYY-MM-DD
  const formatYMD = (d: Date) => {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  }

  const todayStr = useMemo(() => formatYMD(new Date()), [])
  const [selectedMobileDate, setSelectedMobileDate] = useState<string>(todayStr)

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

  // Navigation Handlers
  const handlePrev = () => {
    setActiveDate(prev => {
      const copy = new Date(prev)
      if (currentView === 'dayGridMonth') {
        copy.setMonth(copy.getMonth() - 1)
      } else {
        copy.setDate(copy.getDate() - 7)
      }
      return copy
    })
  }

  const handleNext = () => {
    setActiveDate(prev => {
      const copy = new Date(prev)
      if (currentView === 'dayGridMonth') {
        copy.setMonth(copy.getMonth() + 1)
      } else {
        copy.setDate(copy.getDate() + 7)
      }
      return copy
    })
  }

  const handleToday = () => {
    const now = new Date()
    setActiveDate(now)
    setSelectedMobileDate(formatYMD(now))
  }

  const handleViewChange = (view: 'dayGridMonth' | 'timeGridWeek') => {
    setCurrentView(view)
  }

  // ─── Month View Calculations (7 columns) ──────────────────────────────────
  const monthDays = useMemo(() => {
    const year = activeDate.getFullYear()
    const month = activeDate.getMonth()
    const firstDayIndex = new Date(year, month, 1).getDay() // 0 = Sun
    const totalDays = new Date(year, month + 1, 0).getDate()

    const days: { dateStr: string; dayNum: number; fullDateLabel: string; isCurrentMonth: boolean }[] = []

    // Previous month padding
    const prevMonthTotalDays = new Date(year, month, 0).getDate()
    for (let i = firstDayIndex - 1; i >= 0; i--) {
      const d = prevMonthTotalDays - i
      const prevDate = new Date(year, month - 1, d)
      days.push({
        dateStr: formatYMD(prevDate),
        dayNum: d,
        fullDateLabel: prevDate.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }),
        isCurrentMonth: false,
      })
    }

    // Current month days
    for (let d = 1; d <= totalDays; d++) {
      const currDate = new Date(year, month, d)
      days.push({
        dateStr: formatYMD(currDate),
        dayNum: d,
        fullDateLabel: currDate.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }),
        isCurrentMonth: true,
      })
    }

    // Next month padding to fill a complete 35 or 42 grid
    const totalGridCells = days.length <= 35 ? 35 : 42
    const remaining = totalGridCells - days.length
    for (let d = 1; d <= remaining; d++) {
      const nextDate = new Date(year, month + 1, d)
      days.push({
        dateStr: formatYMD(nextDate),
        dayNum: d,
        fullDateLabel: nextDate.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }),
        isCurrentMonth: false,
      })
    }

    return days
  }, [activeDate])

  // ─── Week View Calculations (7 columns) ───────────────────────────────────
  const weekDays = useMemo(() => {
    const d = new Date(activeDate)
    const dayOfWeek = d.getDay() // 0 is Sun
    const sun = new Date(d)
    sun.setDate(d.getDate() - dayOfWeek)

    const days: { dateStr: string; dayNum: number; dayName: string; fullDateLabel: string; isToday: boolean }[] = []
    for (let i = 0; i < 7; i++) {
      const curr = new Date(sun.getFullYear(), sun.getMonth(), sun.getDate() + i)
      const dateStr = formatYMD(curr)
      days.push({
        dateStr,
        dayNum: curr.getDate(),
        dayName: WEEKDAYS[i].short,
        fullDateLabel: curr.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }),
        isToday: dateStr === todayStr,
      })
    }
    return days
  }, [activeDate, todayStr])

  // Navigation Title Display
  const currentTitle = useMemo(() => {
    if (currentView === 'dayGridMonth') {
      return activeDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
    } else {
      if (weekDays.length === 0) return ''
      const first = new Date(weekDays[0].dateStr + 'T12:00:00')
      const last = new Date(weekDays[6].dateStr + 'T12:00:00')
      const firstMonth = first.toLocaleDateString(undefined, { month: 'short' })
      const lastMonth = last.toLocaleDateString(undefined, { month: 'short' })
      if (firstMonth === lastMonth) {
        return `${firstMonth} ${first.getDate()} – ${last.getDate()}, ${last.getFullYear()}`
      }
      return `${firstMonth} ${first.getDate()} – ${lastMonth} ${last.getDate()}, ${last.getFullYear()}`
    }
  }, [currentView, activeDate, weekDays])

  // Posts grouped by YYYY-MM-DD
  const postsByDate = useMemo(() => {
    const map = new Map<string, ScheduledPost[]>()
    posts.forEach(post => {
      const dateKey = formatYMD(new Date(post.scheduled_at))
      const list = map.get(dateKey) || []
      list.push(post)
      map.set(dateKey, list)
    })
    return map
  }, [posts])

  // Posts for the selected mobile date
  const selectedDatePosts = useMemo(() => {
    return postsByDate.get(selectedMobileDate) || []
  }, [postsByDate, selectedMobileDate])

  // ─── Drag and Drop Rescheduling Handlers ──────────────────────────────────
  const handleDragStart = (post: ScheduledPost, e: React.DragEvent) => {
    e.dataTransfer.setData('text/plain', post.id)
    e.dataTransfer.effectAllowed = 'move'
    setDraggedPostId(post.id)
  }

  const handleDragOver = (dateStr: string, e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (dragOverDate !== dateStr) {
      setDragOverDate(dateStr)
    }
  }

  const handleDragLeave = (dateStr: string) => {
    if (dragOverDate === dateStr) {
      setDragOverDate(null)
    }
  }

  const handleDropOnDate = async (targetDateStr: string, e: React.DragEvent) => {
    e.preventDefault()
    setDragOverDate(null)
    const postId = draggedPostId || e.dataTransfer.getData('text/plain')
    if (!postId) return

    const post = posts.find(p => p.id === postId)
    if (!post) return

    // Preserve the original post's time, only change the target date
    const prevDate = new Date(post.scheduled_at)
    const hours = prevDate.getHours()
    const minutes = prevDate.getMinutes()
    const [tYear, tMonth, tDay] = targetDateStr.split('-').map(Number)
    const newDate = new Date(tYear, tMonth - 1, tDay, hours, minutes, 0)
    const isoString = newDate.toISOString()

    // Optimistic UI update
    setPosts(prev =>
      prev.map(p => (p.id === post.id ? { ...p, scheduled_at: isoString } : p))
    )

    try {
      await updateScheduledPost(post.id, {
        scheduled_at: isoString,
      })
      toast.success(
        `Rescheduled to ${newDate.toLocaleDateString(undefined, {
          month: 'short',
          day: 'numeric',
        })} at ${newDate.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`
      )
    } catch (err: any) {
      console.error('Failed to reschedule post', err)
      toast.error('Failed to reschedule post. Reverting...')
      fetchPosts()
    } finally {
      setDraggedPostId(null)
    }
  }

  // ─── Drawer Handlers ──────────────────────────────────────────────────────
  const handleOpenEditDrawer = (post: ScheduledPost) => {
    setSelectedPost(post)
    setIsCreating(false)
    setFormPlatform(post.platform || 'instagram_post')
    setFormCaption(post.caption || '')
    setFormMediaUrl(post.media_url || '')
    setFormStatus(post.status || 'Draft')

    const d = new Date(post.scheduled_at)
    const localIso = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16)
    setFormScheduledAt(localIso)

    setIsDrawerOpen(true)
  }

  const handleOpenCreateDrawer = (overrideDate?: string) => {
    setSelectedPost(null)
    setIsCreating(true)
    setFormPlatform('instagram_post')
    setFormCaption('')
    setFormMediaUrl('')
    setFormStatus('Draft')

    if (overrideDate) {
      setFormScheduledAt(`${overrideDate}T10:00`)
    } else {
      const tomorrow = new Date()
      tomorrow.setDate(tomorrow.getDate() + 1)
      tomorrow.setHours(10, 0, 0, 0)
      const localIso = new Date(tomorrow.getTime() - tomorrow.getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 16)
      setFormScheduledAt(localIso)
    }

    setIsDrawerOpen(true)
  }

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
      toast.success('Scheduled post removed')
      setIsDrawerOpen(false)
    } catch (err: any) {
      console.error('Failed to delete scheduled post', err)
      toast.error('Could not delete post')
    }
  }

  const handleMediaUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    try {
      setUploadingImage(true)
      const data = await uploadBrandLogo(file)
      if (data?.logo_url) {
        setFormMediaUrl(data.logo_url)
        toast.success('Media uploaded successfully!')
      }
    } catch (err: any) {
      console.error('Upload failed', err)
      toast.error('Image upload failed')
    } finally {
      setUploadingImage(false)
    }
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      {/* ═════════════════════════════════════════════════════════════ */}
      {/* CALENDAR HEADER BAR                                           */}
      {/* ═════════════════════════════════════════════════════════════ */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border pb-5">
        <div>
          <h1 className="text-3xl font-extrabold text-text tracking-tight flex items-center gap-2.5">
            <CalendarIcon className="h-7 w-7 text-primary-light" />
            Content Calendar
          </h1>
          <p className="text-sm text-muted mt-1">
            Drag and drop posts to reschedule, manage platform publishing, and review status.
          </p>
        </div>

        {/* Action Button: Schedule Post */}
        <button
          onClick={() => handleOpenCreateDrawer(selectedMobileDate)}
          className="px-5 py-2.5 bg-accent hover:bg-accent-hover text-black font-extrabold text-sm rounded-xl transition duration-200 shadow-accent-glow flex items-center gap-2 active:scale-95 self-start md:self-auto"
        >
          <Plus className="h-4 w-4 text-black stroke-[3]" />
          <span>Schedule Post</span>
        </button>
      </div>

      {/* ═════════════════════════════════════════════════════════════ */}
      {/* CONTROL RIBBON: Navigation & View Switcher                    */}
      {/* ═════════════════════════════════════════════════════════════ */}
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

        {/* View Switcher (Month / Week) */}
        <div className="flex items-center gap-3">
          {/* Month / Week View Toggle (Desktop only) */}
          <div className="hidden md:flex items-center gap-1 bg-surface-secondary border border-border rounded-xl p-1">
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

      {/* ═════════════════════════════════════════════════════════════ */}
      {/* DESKTOP CALENDAR VIEW (md:block)                              */}
      {/* Pure React, 7-column grid, no SSR crash, drag-and-drop        */}
      {/* ═════════════════════════════════════════════════════════════ */}
      <div className="hidden md:block p-4 sm:p-6 rounded-3xl bg-surface border border-border shadow-xl min-h-[640px]">
        {loading ? (
          <div className="space-y-4">
            <div className="h-10 rounded-xl bg-surface-secondary/70 border border-border animate-pulse" />
            <div className="h-[520px] rounded-2xl bg-surface-secondary/50 border border-border animate-pulse" />
          </div>
        ) : currentView === 'dayGridMonth' ? (
          /* ═════════════════════════════════════════════════════════ */
          /* 7-COLUMN MONTH GRID                                       */
          /* ═════════════════════════════════════════════════════════ */
          <div className="space-y-3">
            {/* Weekday Headers (Sun..Sat strictly visible, full sr-only) */}
            <div className="grid grid-cols-7 gap-px rounded-xl bg-surface-secondary border border-border overflow-hidden">
              {WEEKDAYS.map(day => (
                <div key={day.short} className="py-2.5 text-center">
                  <span className="sr-only">{day.full}</span>
                  <span aria-hidden="true" className="text-xs font-bold text-muted uppercase tracking-wider">
                    {day.short}
                  </span>
                </div>
              ))}
            </div>

            {/* Month Day Cells */}
            <div className="grid grid-cols-7 gap-2">
              {monthDays.map(cell => {
                const isToday = cell.dateStr === todayStr
                const isHoveredDrop = dragOverDate === cell.dateStr
                const cellPosts = postsByDate.get(cell.dateStr) || []

                return (
                  <div
                    key={cell.dateStr}
                    onDragOver={e => handleDragOver(cell.dateStr, e)}
                    onDragLeave={() => handleDragLeave(cell.dateStr)}
                    onDrop={e => handleDropOnDate(cell.dateStr, e)}
                    className={`min-h-[120px] rounded-2xl p-2.5 flex flex-col justify-between transition-all duration-150 border relative group ${
                      isHoveredDrop
                        ? 'border-primary ring-2 ring-primary/50 bg-primary/10'
                        : isToday
                        ? 'bg-surface-secondary/90 border-primary/60 ring-2 ring-primary ring-offset-2 ring-offset-surface'
                        : cell.isCurrentMonth
                        ? 'bg-surface-secondary/50 border-border hover:border-border-light'
                        : 'bg-surface/30 border-border/40 opacity-45'
                    }`}
                  >
                    {/* Date Header: Single visible number + accessible sr-only string */}
                    <div className="flex items-center justify-between">
                      <span className="sr-only">{cell.fullDateLabel}</span>
                      <span
                        className={`text-xs font-bold h-6 w-6 rounded-full flex items-center justify-center transition ${
                          isToday
                            ? 'bg-primary text-white font-extrabold shadow-sm'
                            : cell.isCurrentMonth
                            ? 'text-text'
                            : 'text-muted'
                        }`}
                      >
                        {cell.dayNum}
                      </span>

                      {/* Quick Add Button on Hover */}
                      <button
                        onClick={() => handleOpenCreateDrawer(cell.dateStr)}
                        className="opacity-0 group-hover:opacity-100 p-1 rounded-md bg-accent text-black hover:scale-110 transition active:scale-95"
                        title={`Schedule post for ${cell.dateStr}`}
                      >
                        <Plus className="h-3 w-3 stroke-[3]" />
                      </button>
                    </div>

                    {/* Post Chips or Subtle Hover Action for Empty Cells */}
                    {cellPosts.length === 0 ? (
                      <div
                        onClick={() => handleOpenCreateDrawer(cell.dateStr)}
                        className="mt-1 flex-1 flex flex-col items-center justify-center p-2 rounded-xl border border-dashed border-transparent group-hover:border-border-light/60 group-hover:bg-surface/50 transition cursor-pointer"
                        title={`Click to schedule a post on ${cell.dateStr}`}
                      >
                        <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 text-[11px] font-semibold text-muted group-hover:text-accent transition">
                          <Plus className="h-3.5 w-3.5 stroke-[2.5]" />
                          <span>Schedule</span>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-1.5 space-y-1.5 flex-1 overflow-hidden">
                        {cellPosts.slice(0, 3).map(post => {
                          const statusCfg = STATUS_CONFIG[post.status] || STATUS_CONFIG.Draft
                          const platformCfg = getPlatformConfig(post.platform)

                          return (
                            <div
                              key={post.id}
                              draggable="true"
                              onDragStart={e => handleDragStart(post, e)}
                              onClick={() => handleOpenEditDrawer(post)}
                              className={`w-full p-1.5 rounded-xl bg-surface hover:bg-surface-hover border ${statusCfg.cardBorder} transition cursor-grab active:cursor-grabbing shadow-sm flex flex-col gap-1 text-left`}
                            >
                              <div className="flex items-center justify-between gap-1">
                                <span className="flex items-center gap-1 text-[11px] font-bold text-text truncate">
                                  <GripVertical className="h-3 w-3 text-muted/60 shrink-0" />
                                  <span>{platformCfg.icon}</span>
                                  <span className="truncate">{platformCfg.label}</span>
                                </span>

                                <span
                                  className={`inline-flex items-center gap-1 px-1.5 py-0.2 rounded-md text-[9px] font-extrabold border ${statusCfg.bg} ${statusCfg.text} ${statusCfg.border} shrink-0`}
                                >
                                  <span className={`h-1.5 w-1.5 rounded-full ${statusCfg.dot}`} />
                                  <span>{statusCfg.label}</span>
                                </span>
                              </div>

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
                        })}

                        {cellPosts.length > 3 && (
                          <div
                            onClick={() => {
                              setSelectedMobileDate(cell.dateStr)
                              handleOpenCreateDrawer(cell.dateStr)
                            }}
                            className="text-center text-[10px] font-extrabold text-primary-light hover:underline cursor-pointer py-0.5"
                          >
                            +{cellPosts.length - 3} more posts
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ) : (
          /* ═════════════════════════════════════════════════════════ */
          /* 7-COLUMN WEEK VIEW                                        */
          /* ═════════════════════════════════════════════════════════ */
          <div className="space-y-3">
            {/* Week Headers */}
            <div className="grid grid-cols-7 gap-2">
              {weekDays.map(day => (
                <div
                  key={day.dateStr}
                  className={`p-3 rounded-2xl text-center border transition ${
                    day.isToday
                      ? 'bg-primary/20 border-primary ring-2 ring-primary ring-offset-2 ring-offset-surface'
                      : 'bg-surface-secondary border-border'
                  }`}
                >
                  <span className="sr-only">{day.fullDateLabel}</span>
                  <p className="text-xs font-bold text-muted uppercase tracking-wider">{day.dayName}</p>
                  <p className={`text-lg font-extrabold mt-0.5 ${day.isToday ? 'text-primary-light' : 'text-text'}`}>
                    {day.dayNum}
                  </p>
                </div>
              ))}
            </div>

            {/* Week Columns for Scheduled Posts */}
            <div className="grid grid-cols-7 gap-2 min-h-[460px]">
              {weekDays.map(day => {
                const dayPosts = postsByDate.get(day.dateStr) || []
                const isHovered = dragOverDate === day.dateStr

                return (
                  <div
                    key={day.dateStr}
                    onDragOver={e => handleDragOver(day.dateStr, e)}
                    onDragLeave={() => handleDragLeave(day.dateStr)}
                    onDrop={e => handleDropOnDate(day.dateStr, e)}
                    className={`rounded-2xl p-2.5 flex flex-col gap-2 transition-all border ${
                      isHovered
                        ? 'border-primary ring-2 ring-primary/50 bg-primary/10'
                        : 'bg-surface-secondary/40 border-border'
                    }`}
                  >
                    <div className="flex items-center justify-between pb-1 border-b border-border/50">
                      <span className="text-[11px] font-bold text-muted">
                        {dayPosts.length} post{dayPosts.length === 1 ? '' : 's'}
                      </span>
                      <button
                        onClick={() => handleOpenCreateDrawer(day.dateStr)}
                        className="p-1 rounded-md bg-accent text-black hover:scale-105 transition"
                        title={`Schedule post for ${day.dateStr}`}
                      >
                        <Plus className="h-3 w-3 stroke-[3]" />
                      </button>
                    </div>

                    {dayPosts.length === 0 ? (
                      <div 
                        onClick={() => handleOpenCreateDrawer(day.dateStr)}
                        className="flex-1 flex flex-col items-center justify-center text-center p-3 text-muted/60 hover:text-accent hover:border-accent/40 border border-dashed border-border/40 hover:bg-surface/60 rounded-xl transition cursor-pointer group"
                        title={`Click to schedule a post on ${day.dateStr}`}
                      >
                        <Plus className="h-5 w-5 mb-1 text-muted group-hover:text-accent transition stroke-[2.5]" />
                        <span className="text-[10px] font-bold group-hover:text-accent transition">Schedule post</span>
                      </div>
                    ) : (
                      dayPosts.map(post => {
                        const statusCfg = STATUS_CONFIG[post.status] || STATUS_CONFIG.Draft
                        const platformCfg = getPlatformConfig(post.platform)
                        const timeStr = new Date(post.scheduled_at).toLocaleTimeString(undefined, {
                          hour: '2-digit',
                          minute: '2-digit',
                        })

                        return (
                          <div
                            key={post.id}
                            draggable="true"
                            onDragStart={e => handleDragStart(post, e)}
                            onClick={() => handleOpenEditDrawer(post)}
                            className={`p-2.5 rounded-xl bg-surface hover:bg-surface-hover border ${statusCfg.cardBorder} transition cursor-grab active:cursor-grabbing shadow-sm space-y-1.5`}
                          >
                            <div className="flex items-center justify-between gap-1">
                              <span className="text-xs font-bold text-text flex items-center gap-1 truncate">
                                <GripVertical className="h-3 w-3 text-muted/60 shrink-0" />
                                <span>{platformCfg.icon}</span>
                                <span className="truncate">{platformCfg.label}</span>
                              </span>
                              <span
                                className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-extrabold border ${statusCfg.bg} ${statusCfg.text} ${statusCfg.border} shrink-0`}
                              >
                                <span className={`h-1.5 w-1.5 rounded-full ${statusCfg.dot}`} />
                                <span>{statusCfg.label}</span>
                              </span>
                            </div>

                            <p className="text-[11px] text-muted line-clamp-2 leading-relaxed">
                              {post.caption || 'No caption text'}
                            </p>

                            {post.media_url && (
                              <div className="h-16 w-full rounded-lg bg-surface-secondary border border-border overflow-hidden">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={post.media_url}
                                  alt="Post thumbnail"
                                  className="h-full w-full object-cover"
                                />
                              </div>
                            )}

                            <div className="flex items-center gap-1 text-[10px] font-semibold text-muted pt-0.5">
                              <Clock className="h-3 w-3 text-primary-light" />
                              <span>{timeStr}</span>
                            </div>
                          </div>
                        )
                      })
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ── Dedicated Status Legend Section ── */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-border mt-4 text-xs">
          <div className="flex items-center gap-2 text-muted font-medium">
            <span className="font-bold text-text">Status Legend:</span>
            <span>Color indicators for post publishing lifecycle</span>
          </div>
          <div className="flex items-center gap-4 text-[11px] font-bold text-muted flex-wrap">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-muted" /> Draft
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-primary-light" /> Scheduled
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-400" /> Published
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-red-400" /> Failed
            </span>
          </div>
        </div>
      </div>

      {/* ═════════════════════════════════════════════════════════════ */}
      {/* MOBILE RESPONSIVE VIEW (md:hidden)                            */}
      {/* Compact Month Grid with Status Dots + Interactive Day List    */}
      {/* ═════════════════════════════════════════════════════════════ */}
      <div className="block md:hidden space-y-5">
        {/* Compact 7-Column Month Grid Card */}
        <div className="p-4 rounded-3xl bg-surface border border-border shadow-xl">
          {/* Weekday Header Initials (Sun..Sat) */}
          <div className="grid grid-cols-7 gap-1 text-center mb-2">
            {WEEKDAYS.map(day => (
              <div key={day.short} className="text-[11px] font-bold text-muted py-1 uppercase tracking-wider">
                <span className="sr-only">{day.full}</span>
                <span aria-hidden="true">{day.short}</span>
              </div>
            ))}
          </div>

          {/* Days Grid */}
          <div className="grid grid-cols-7 gap-1.5">
            {monthDays.map(cell => {
              const isToday = cell.dateStr === todayStr
              const isSelected = cell.dateStr === selectedMobileDate
              const dayPosts = postsByDate.get(cell.dateStr) || []

              return (
                <button
                  key={cell.dateStr}
                  onClick={() => setSelectedMobileDate(cell.dateStr)}
                  className={`min-h-[52px] rounded-xl p-1 flex flex-col items-center justify-between transition relative border ${
                    isSelected
                      ? 'bg-primary/20 border-primary shadow-sm'
                      : isToday
                      ? 'bg-surface-secondary border-primary/60 ring-2 ring-primary ring-inset'
                      : cell.isCurrentMonth
                      ? 'bg-surface-secondary/70 border-border hover:border-border-light'
                      : 'bg-surface/40 border-transparent opacity-40'
                  }`}
                >
                  <span className="sr-only">{cell.fullDateLabel}</span>
                  <span
                    className={`text-xs font-bold leading-none mt-1 ${
                      isToday
                        ? 'text-primary-light font-extrabold'
                        : isSelected
                        ? 'text-text font-extrabold'
                        : 'text-muted'
                    }`}
                  >
                    {cell.dayNum}
                  </span>

                  {/* Status Indicator Dots */}
                  <div className="flex items-center gap-0.5 justify-center mt-1 flex-wrap max-w-full px-0.5">
                    {dayPosts.slice(0, 3).map((p, idx) => {
                      const cfg = STATUS_CONFIG[p.status] || STATUS_CONFIG.Draft
                      return (
                        <span
                          key={p.id || idx}
                          className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`}
                          title={`${cfg.label}: ${p.caption || 'Scheduled post'}`}
                        />
                      )
                    })}
                    {dayPosts.length > 3 && (
                      <span className="text-[9px] font-extrabold text-muted leading-none">
                        +{dayPosts.length - 3}
                      </span>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* Selected Day List Header & Items */}
        <div className="p-4 sm:p-5 rounded-3xl bg-surface border border-border shadow-xl space-y-4">
          <div className="flex items-center justify-between border-b border-border pb-3">
            <div>
              <h3 className="text-sm font-extrabold text-text">
                {new Date(selectedMobileDate + 'T12:00:00').toLocaleDateString(undefined, {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </h3>
              <p className="text-xs text-muted">
                {selectedDatePosts.length} post{selectedDatePosts.length === 1 ? '' : 's'} scheduled
              </p>
            </div>

            <button
              onClick={() => handleOpenCreateDrawer(selectedMobileDate)}
              className="px-3 py-1.5 bg-accent hover:bg-accent-hover text-black text-xs font-extrabold rounded-lg transition flex items-center gap-1 active:scale-95"
            >
              <Plus className="h-3.5 w-3.5 stroke-[3]" />
              <span>Add</span>
            </button>
          </div>

          {/* List of Posts */}
          {selectedDatePosts.length === 0 ? (
            <div className="py-8 text-center space-y-3">
              <CalendarIcon className="h-8 w-8 text-muted/50 mx-auto" />
              <p className="text-xs text-muted">No posts scheduled for this day.</p>
              <button
                onClick={() => handleOpenCreateDrawer(selectedMobileDate)}
                className="px-4 py-2 bg-surface-secondary hover:bg-surface-hover border border-border text-xs font-bold text-text rounded-xl transition"
              >
                + Schedule a Post
              </button>
            </div>
          ) : (
            <div className="space-y-2.5">
              {selectedDatePosts.map(post => {
                const statusCfg = STATUS_CONFIG[post.status] || STATUS_CONFIG.Draft
                const platformCfg = getPlatformConfig(post.platform)
                const timeStr = new Date(post.scheduled_at).toLocaleTimeString(undefined, {
                  hour: '2-digit',
                  minute: '2-digit',
                })

                return (
                  <div
                    key={post.id}
                    onClick={() => handleOpenEditDrawer(post)}
                    className={`p-3.5 rounded-2xl bg-surface-secondary border ${statusCfg.cardBorder} hover:bg-surface-hover transition cursor-pointer flex items-start gap-3`}
                  >
                    {/* Media Thumbnail or Platform Icon Box */}
                    {post.media_url ? (
                      <div className="h-14 w-14 rounded-xl bg-surface border border-border overflow-hidden shrink-0">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={post.media_url}
                          alt="Post thumbnail"
                          className="h-full w-full object-cover"
                        />
                      </div>
                    ) : (
                      <div className="h-14 w-14 rounded-xl bg-surface border border-border flex items-center justify-center text-xl shrink-0">
                        {platformCfg.icon}
                      </div>
                    )}

                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-extrabold text-text flex items-center gap-1.5">
                          <span>{platformCfg.icon}</span>
                          <span className="truncate">{platformCfg.label}</span>
                        </span>
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-extrabold border ${statusCfg.bg} ${statusCfg.text} ${statusCfg.border}`}
                        >
                          <span className={`h-1.5 w-1.5 rounded-full ${statusCfg.dot}`} />
                          <span>{statusCfg.label}</span>
                        </span>
                      </div>

                      <p className="text-xs text-muted line-clamp-2 leading-relaxed">
                        {post.caption || 'No caption text'}
                      </p>

                      <div className="flex items-center gap-1.5 text-[11px] font-semibold text-muted pt-0.5">
                        <Clock className="h-3 w-3 text-primary-light" />
                        <span>{timeStr}</span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* ═════════════════════════════════════════════════════════════ */}
      {/* SCHEDULE / EDIT POST DRAWER                                   */}
      {/* ═════════════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {isDrawerOpen && (
          <div className="fixed inset-0 z-50 overflow-hidden">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsDrawerOpen(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />

            <div className="fixed inset-y-0 right-0 max-w-full flex pl-0 sm:pl-10">
              <motion.div
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                exit={{ x: '100%' }}
                transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                className="w-screen max-w-full sm:max-w-md bg-surface border-l border-border flex flex-col justify-between shadow-2xl relative z-10"
              >
                {/* Drawer Header */}
                <div className="p-4 sm:p-6 border-b border-border flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-extrabold text-text tracking-tight flex items-center gap-2">
                      <CalendarIcon className="h-5 w-5 text-primary-light" />
                      {isCreating ? 'Schedule New Post' : 'Edit Scheduled Post'}
                    </h2>
                    <p className="text-xs text-muted mt-0.5">
                      {isCreating
                        ? 'Set up platform, timing, and creatives.'
                        : 'Update copy, timing, or publishing status.'}
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
                <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
                  {/* Linked Parent Post Banner (if created via multi-platform session) */}
                  {selectedPost?.post_id && (
                    <div className="p-3.5 rounded-2xl bg-primary/10 border border-primary/30 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-text">Multi-Platform Post</span>
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-primary/20 text-primary-light font-bold">
                            Linked
                          </span>
                        </div>
                        <p className="text-[11px] text-muted truncate mt-0.5">
                          View all channel copies &amp; sync status
                        </p>
                      </div>
                      <Link
                        href={`/ideas?id=${selectedPost.post_id}&platform=${
                          selectedPost.platform === 'instagram_post' || selectedPost.platform === 'instagram_story'
                            ? 'instagram'
                            : selectedPost.platform
                        }`}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary hover:bg-primary-hover text-white text-xs font-bold transition shrink-0 shadow-sm"
                      >
                        <span>Open Post</span>
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Link>
                    </div>
                  )}

                  {/* Platform Selection */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-muted uppercase tracking-wider">
                      Target Platform
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      {PLATFORMS.map(p => {
                        const isSelected = formPlatform === p.id
                        return (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => setFormPlatform(p.id)}
                            className={`p-2.5 rounded-xl border flex items-center gap-2 transition text-left ${
                              isSelected
                                ? 'bg-primary/20 border-primary text-text shadow-sm'
                                : 'bg-surface-secondary border-border text-muted hover:text-text hover:bg-surface-hover'
                            }`}
                          >
                            <span className="text-base">{p.icon}</span>
                            <span className="text-xs font-bold truncate">{p.label}</span>
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  {/* Scheduled Date & Time */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-muted uppercase tracking-wider">
                      Publish Date &amp; Time
                    </label>
                    <div className="relative">
                      <input
                        type="datetime-local"
                        value={formScheduledAt}
                        onChange={e => setFormScheduledAt(e.target.value)}
                        className="w-full px-3.5 py-2.5 rounded-xl bg-surface-secondary border border-border text-xs text-text focus:outline-none focus:border-primary transition"
                      />
                    </div>
                  </div>

                  {/* Status Selection */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-muted uppercase tracking-wider">
                      Publishing Status
                    </label>
                    <select
                      value={formStatus}
                      onChange={e => setFormStatus(e.target.value as ScheduledPost['status'])}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-surface-secondary border border-border text-xs text-text focus:outline-none focus:border-primary transition"
                    >
                      <option value="Draft">Draft</option>
                      <option value="Pending Approval">Pending Approval</option>
                      <option value="Scheduled">Scheduled</option>
                      <option value="Published">Published</option>
                      <option value="Failed">Failed</option>
                    </select>
                  </div>

                  {/* Media Upload / Attachment */}
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-muted uppercase tracking-wider">
                      Media Creative
                    </label>

                    {formMediaUrl ? (
                      <div className="relative h-44 w-full rounded-2xl bg-surface-secondary border border-border overflow-hidden p-2 group">
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
