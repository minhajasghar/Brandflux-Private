'use client'

import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import toast from 'react-hot-toast'
import {
  Bot,
  Power,
  Play,
  Check,
  X,
  Sliders,
  Calendar as CalendarIcon,
  Clock,
  RefreshCw,
  Sparkles,
  ArrowRight,
  Edit3,
  Layers,
  Image as ImageIcon,
  Upload,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  ChevronRight,
  ShieldCheck,
  Send,
  RotateCcw,
  SkipForward,
  Share2
} from 'lucide-react'
import {
  getAutopilotConfig,
  updateAutopilotConfig,
  toggleKillSwitch,
  getWeeklyPlan,
  generateWeeklyPlan,
  answerEventCheckin,
  editCardWithPrompt,
  updateCardCaption,
  changeCardImage,
  uploadCardImage,
  skipCard,
  rescheduleCard,
  toggleCardStatus,
  approveAllPendingPosts,
  publishCardNowVerified,
  getImageLibrary,
  getAutopilotLogs
} from '@/lib/api'
import { resolveMediaUrl } from '@/lib/media'

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export default function AutopilotTab() {
  // Config State
  const [config, setConfig] = useState<any>({
    enabled: true,
    kill_switch: false,
    mode: 'weekly_plan',
    frequency: 'custom',
    custom_weekdays: ['Tue', 'Thu'],
    posting_time: '07:00',
    timezone: 'Asia/Karachi',
    max_posts_per_day: 2,
    banned_topics: ['politics', 'unverified health cures', 'gambling'],
    target_platforms: ['facebook', 'linkedin', 'tiktok'],
    connected_platforms: ['facebook', 'linkedin', 'tiktok'],
    next_posts_preview: 'Next posts: Tue, Thu'
  })

  const [loadingConfig, setLoadingConfig] = useState(true)
  const [savingConfig, setSavingConfig] = useState(false)

  // Plan Cards State
  const [cards, setCards] = useState<any[]>([])
  const [loadingCards, setLoadingCards] = useState(false)
  const [generatingPlan, setGeneratingPlan] = useState(false)

  // Event Check-In State
  const [hasEventPrompt, setHasEventPrompt] = useState<boolean | null>(null)
  const [eventDetailsText, setEventDetailsText] = useState('')

  // Card Operations State
  const [activePlatformTab, setActivePlatformTab] = useState<Record<string, string>>({})
  const [promptInputs, setPromptInputs] = useState<Record<string, string>>({})
  const [captionInputs, setCaptionInputs] = useState<Record<string, string>>({})
  const [regeneratingCardId, setRegeneratingCardId] = useState<string | null>(null)
  const [rescheduleDateInputs, setRescheduleDateInputs] = useState<Record<string, string>>({})
  const [publishingCardId, setPublishingCardId] = useState<string | null>(null)

  // Image Library Modal State
  const [libraryModalOpen, setLibraryModalOpen] = useState(false)
  const [libraryTargetCardId, setLibraryTargetCardId] = useState<string | null>(null)
  const [libraryImages, setLibraryImages] = useState<any[]>([])
  const [loadingLibrary, setLoadingLibrary] = useState(false)

  // Audit Logs State
  const [logs, setLogs] = useState<any[]>([])
  const [loadingLogs, setLoadingLogs] = useState(false)

  // Hidden File Input
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [uploadTargetCardId, setUploadTargetCardId] = useState<string | null>(null)

  // Load Initial Data
  const fetchData = async () => {
    try {
      setLoadingConfig(true)
      const [cfg, planData, logsData] = await Promise.all([
        getAutopilotConfig().catch(() => null),
        getWeeklyPlan().catch(() => ({ cards: [] })),
        getAutopilotLogs().catch(() => [])
      ])

      if (cfg) {
        setConfig(cfg)
        if (cfg.last_event_prompt_response) {
          setHasEventPrompt(true)
          setEventDetailsText(cfg.last_event_prompt_response)
        }
      }

      if (planData?.cards) {
        setCards(planData.cards)
        // Initialize active platform tabs for cards
        const initialTabs: Record<string, string> = {}
        const initialCaptions: Record<string, string> = {}
        planData.cards.forEach((c: any) => {
          initialTabs[c.id] = c.platform || 'facebook'
          initialCaptions[c.id] = c.caption || ''
        })
        setActivePlatformTab(initialTabs)
        setCaptionInputs(initialCaptions)
      }

      if (Array.isArray(logsData)) {
        setLogs(logsData)
      }
    } catch (err) {
      console.error('Failed to load autopilot data:', err)
      toast.error('Failed to load Autopilot configuration.')
    } finally {
      setLoadingConfig(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  // ─── 1. Toggle ON / OFF & Kill Switch ─────────────────────────────────────────

  const handleToggleEnabled = async () => {
    const nextVal = !config.enabled
    try {
      const updated = await updateAutopilotConfig({ enabled: nextVal })
      setConfig(updated)
      toast.success(nextVal ? 'Autopilot turned ON!' : 'Autopilot paused.')
    } catch (err) {
      toast.error('Failed to update Autopilot status.')
    }
  }

  const handleToggleKillSwitch = async () => {
    const nextVal = !config.kill_switch
    if (nextVal && !confirm('Engage Emergency Kill Switch? All generation and auto-publishing will halt immediately.')) {
      return
    }
    try {
      const res = await toggleKillSwitch(nextVal)
      setConfig((prev: any) => ({ ...prev, kill_switch: res.kill_switch }))
      toast.success(res.message)
      fetchData()
    } catch (err) {
      toast.error('Failed to toggle kill switch.')
    }
  }

  // ─── 2. Frequency & Weekdays ──────────────────────────────────────────────────

  const handleFrequencyChange = async (freq: string) => {
    try {
      const updated = await updateAutopilotConfig({ frequency: freq })
      setConfig(updated)
      toast.success(`Frequency set to: ${freq.replace(/_/g, ' ').toUpperCase()}`)
    } catch (err) {
      toast.error('Failed to update frequency.')
    }
  }

  const handleToggleWeekday = async (day: string) => {
    const cur = config.custom_weekdays || ['Tue', 'Thu']
    const next = cur.includes(day)
      ? cur.filter((d: string) => d !== day)
      : [...cur, day]

    if (next.length === 0) {
      toast.error('Please select at least 1 weekday.')
      return
    }

    try {
      const updated = await updateAutopilotConfig({ custom_weekdays: next })
      setConfig(updated)
    } catch (err) {
      toast.error('Failed to update weekdays.')
    }
  }

  const handleSaveScheduleDetails = async () => {
    try {
      setSavingConfig(true)
      const updated = await updateAutopilotConfig({
        posting_time: config.posting_time,
        timezone: config.timezone,
        mode: config.mode,
        target_platforms: config.target_platforms
      })
      setConfig(updated)
      toast.success('Autopilot schedule saved successfully!')
    } catch (err) {
      toast.error('Failed to save settings.')
    } finally {
      setSavingConfig(false)
    }
  }

  // ─── 3. Event Check-In & Plan Generation ──────────────────────────────────────

  const handleSelectEventAnswer = (hasEv: boolean) => {
    setHasEventPrompt(hasEv)
    if (!hasEv) {
      setEventDetailsText('')
      answerEventCheckin(false, '')
      toast.success('Recorded: No special events. Ready to generate.')
    }
  }

  const handleTriggerGeneratePlan = async () => {
    if (config.kill_switch) {
      toast.error('Kill switch is active. Please disengage kill switch first.')
      return
    }
    try {
      setGeneratingPlan(true)
      toast.loading('Planning week, generating 2 image variants per card, writing platform copies...', { id: 'plan-gen' })

      const res = await generateWeeklyPlan({
        force: true,
        event_details: hasEventPrompt ? eventDetailsText : undefined
      })

      if (res?.cards) {
        setCards(res.cards)
      }
      toast.success(`Weekly Plan Ready! Generated ${res.posts_queued || res.cards?.length} cards for review.`, { id: 'plan-gen' })
      fetchData()
    } catch (err: any) {
      console.error('Plan generation failed:', err)
      toast.error(err.response?.data?.detail || 'Failed to generate weekly plan.', { id: 'plan-gen' })
    } finally {
      setGeneratingPlan(false)
    }
  }

  // ─── 4. Card Interactive Actions ──────────────────────────────────────────────

  // (a) Edit with prompt
  const handleEditWithPrompt = async (cardId: string) => {
    const promptText = promptInputs[cardId]?.trim()
    if (!promptText) {
      toast.error('Please enter an instruction prompt (e.g. "make it about our Eid offer").')
      return
    }

    try {
      setRegeneratingCardId(cardId)
      toast.loading('Regenerating card with your prompt...', { id: `regen-${cardId}` })
      const res = await editCardWithPrompt(cardId, promptText)
      if (res?.card) {
        setCards(prev => prev.map(c => c.id === cardId ? res.card : c))
      }
      toast.success('Card regenerated and reset to Pending Approval!', { id: `regen-${cardId}` })
      setPromptInputs(prev => ({ ...prev, [cardId]: '' }))
      fetchData()
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to edit card with prompt.', { id: `regen-${cardId}` })
    } finally {
      setRegeneratingCardId(null)
    }
  }

  // (b) Manual caption edit
  const handleSaveCaption = async (cardId: string) => {
    const text = captionInputs[cardId]
    const platform = activePlatformTab[cardId]
    try {
      const res = await updateCardCaption(cardId, text, platform)
      if (res?.card) {
        setCards(prev => prev.map(c => c.id === cardId ? res.card : c))
      }
      toast.success(`Caption saved for ${platform.toUpperCase()}. Status reset to Pending Approval.`)
      fetchData()
    } catch (err) {
      toast.error('Failed to update caption.')
    }
  }

  // (c) Image actions: Swap Variant or Select Both Side-by-Side
  const handleSwapVariant = async (cardId: string) => {
    try {
      const res = await changeCardImage(cardId, 'swap_variant')
      if (res?.card) {
        setCards(prev => prev.map(c => c.id === cardId ? res.card : c))
      }
      toast.success('Swapped image variant! Reset to Pending Approval.')
      fetchData()
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to swap variant.')
    }
  }

  const handleSelectBothVariants = async (cardId: string) => {
    try {
      const res = await changeCardImage(cardId, 'select_both')
      if (res?.card) {
        setCards(prev => prev.map(c => c.id === cardId ? res.card : c))
      }
      toast.success('Both variants combined side-by-side in one post! Reset to Pending Approval.')
      fetchData()
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to combine both variants.')
    }
  }

  // (c) Pick from Library
  const handleOpenLibrary = async (cardId: string) => {
    setLibraryTargetCardId(cardId)
    setLibraryModalOpen(true)
    setLoadingLibrary(true)
    try {
      const res = await getImageLibrary()
      setLibraryImages(res?.images || [])
    } catch (err) {
      toast.error('Failed to load image library.')
    } finally {
      setLoadingLibrary(false)
    }
  }

  const handleSelectLibraryImage = async (imageUrl: string) => {
    if (!libraryTargetCardId) return
    try {
      const res = await changeCardImage(libraryTargetCardId, 'library', imageUrl)
      if (res?.card) {
        setCards(prev => prev.map(c => c.id === libraryTargetCardId ? res.card : c))
      }
      toast.success('Library image selected! 7-day auto-delete cleared permanently.')
      setLibraryModalOpen(false)
      fetchData()
    } catch (err: any) {
      toast.error('Failed to assign library image.')
    }
  }

  // (c) Upload image
  const handleUploadImageTrigger = (cardId: string) => {
    setUploadTargetCardId(cardId)
    fileInputRef.current?.click()
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !uploadTargetCardId) return
    try {
      toast.loading('Uploading custom creative...', { id: 'upload-card' })
      const res = await uploadCardImage(uploadTargetCardId, file)
      if (res?.card) {
        setCards(prev => prev.map(c => c.id === uploadTargetCardId ? res.card : c))
      }
      toast.success('Custom image applied! Reset to Pending Approval.', { id: 'upload-card' })
      fetchData()
    } catch (err) {
      toast.error('Failed to upload image.', { id: 'upload-card' })
    } finally {
      if (e.target) e.target.value = ''
    }
  }

  // (d) Skip card
  const handleSkipCard = async (cardId: string) => {
    try {
      const res = await skipCard(cardId)
      if (res?.card) {
        setCards(prev => prev.map(c => c.id === cardId ? res.card : c))
      }
      toast.success('Day marked as Skipped.')
      fetchData()
    } catch (err) {
      toast.error('Failed to skip day.')
    }
  }

  // (d) Reschedule card
  const handleRescheduleCard = async (cardId: string) => {
    const dateVal = rescheduleDateInputs[cardId]
    if (!dateVal) {
      toast.error('Please pick a new date and time.')
      return
    }
    try {
      const res = await rescheduleCard(cardId, new Date(dateVal).toISOString())
      if (res?.card) {
        setCards(prev => prev.map(c => c.id === cardId ? res.card : c))
      }
      toast.success('Post rescheduled! Reset to Pending Approval.')
      fetchData()
    } catch (err) {
      toast.error('Failed to reschedule post.')
    }
  }

  // (e) Toggle single status
  const handleToggleCardStatus = async (cardId: string) => {
    try {
      const res = await toggleCardStatus(cardId)
      if (res?.card) {
        setCards(prev => prev.map(c => c.id === cardId ? res.card : c))
      }
      toast.success(`Status updated: ${res.card?.status}`)
      fetchData()
    } catch (err) {
      toast.error('Failed to toggle status.')
    }
  }

  // Top action: Approve All
  const handleApproveAll = async () => {
    try {
      const res = await approveAllPendingPosts()
      toast.success(res.message || 'All pending posts approved into Scheduled!')
      fetchData()
    } catch (err) {
      toast.error('Failed to approve all posts.')
    }
  }

  // Verified publish test
  const handlePublishNowTest = async (cardId: string, targetPlatform?: string) => {
    try {
      setPublishingCardId(cardId)
      const plat = targetPlatform || activePlatformTab[cardId]
      toast.loading(`Publishing verified post live to ${(plat || 'Social Platform').toUpperCase()}...`, { id: `pub-${cardId}` })
      const res = await publishCardNowVerified(cardId, plat)
      if (res?.success) {
        toast.success(`Published live on ${(res.platform || plat || 'Social Platform').toUpperCase()}!`, { id: `pub-${cardId}` })
      } else {
        toast.error(`Publishing failed: ${res.error || 'Check account connection'}`, { id: `pub-${cardId}` })
      }
      fetchData()
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Publishing error.', { id: `pub-${cardId}` })
    } finally {
      setPublishingCardId(null)
    }
  }

  const pendingCount = cards.filter(c => c.status === 'Pending Approval').length

  return (
    <div className="space-y-8">
      {/* Hidden File Input for Custom Creative Upload */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileUpload}
      />

      {/* ─────────────────────────────────────────────────────────────────────────
          1. SETTINGS SECTION (ONE SCREEN, ON/OFF TOGGLE)
          ───────────────────────────────────────────────────────────────────────── */}
      <div className="p-6 md:p-8 rounded-2xl bg-surface border border-border space-y-6">
        {/* Master ON/OFF Switch & Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-6">
          <div className="flex items-start gap-3.5">
            <div className={`p-3 rounded-2xl border transition-colors ${
              config.enabled ? 'bg-accent/15 border-accent text-accent' : 'bg-surface-secondary border-border text-muted'
            }`}>
              <Bot className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h2 className="text-xl font-black text-text">Autopilot Autonomous Studio</h2>
                <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-black uppercase tracking-wider border ${
                  config.kill_switch
                    ? 'bg-danger/20 text-danger border-danger/40 animate-pulse'
                    : config.enabled
                    ? 'bg-accent/20 text-accent border-accent/40'
                    : 'bg-zinc-800 text-zinc-400 border-zinc-700'
                }`}>
                  {config.kill_switch ? 'KILL SWITCH ACTIVE' : config.enabled ? 'ACTIVE & POSTING' : 'PAUSED'}
                </span>
              </div>
              <p className="text-xs text-muted mt-1">
                Your brand kit for <strong>TNT Innovations</strong> is active. Autopilot handles end-to-end planning, copywriting, graphics, and verified publishing.
              </p>
            </div>
          </div>

          {/* Toggle Switches */}
          <div className="flex items-center gap-3 self-start sm:self-center">
            <button
              type="button"
              onClick={handleToggleKillSwitch}
              className={`px-3 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
                config.kill_switch
                  ? 'bg-danger text-white border border-danger shadow-lg shadow-danger/25 animate-pulse'
                  : 'bg-surface-secondary border border-border text-muted hover:border-danger hover:text-danger'
              }`}
            >
              <Power className="h-3.5 w-3.5" />
              <span>{config.kill_switch ? 'Kill Switch Active' : 'Emergency Stop'}</span>
            </button>

            <button
              type="button"
              onClick={handleToggleEnabled}
              className={`px-4 py-2 rounded-xl text-xs font-extrabold transition flex items-center gap-2 shadow-sm ${
                config.enabled
                  ? 'bg-accent hover:bg-accent-hover text-black shadow-accent-glow'
                  : 'bg-surface-secondary hover:bg-surface-hover text-text border border-border'
              }`}
            >
              <div className={`h-2.5 w-2.5 rounded-full ${config.enabled ? 'bg-black animate-pulse' : 'bg-zinc-500'}`} />
              <span>{config.enabled ? 'Autopilot: ON' : 'Autopilot: OFF'}</span>
            </button>
          </div>
        </div>

        {/* 1) Frequency Settings */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-muted uppercase tracking-wider">
              1. Posting Frequency
            </label>
            <span className="text-xs font-mono font-bold text-accent bg-accent/10 px-3 py-1 rounded-lg border border-accent/20">
              {config.next_posts_preview || 'Next posts: Tue, Thu'}
            </span>
          </div>

          {/* Frequency Options */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
            {[
              { id: 'daily', label: 'Daily' },
              { id: 'every_2_days', label: 'Every 2 days' },
              { id: 'every_3_days', label: 'Every 3 days' },
              { id: 'weekly', label: 'Weekly' },
              { id: 'custom', label: 'Custom weekdays' }
            ].map(f => (
              <button
                key={f.id}
                type="button"
                onClick={() => handleFrequencyChange(f.id)}
                className={`p-3 rounded-xl border text-xs font-bold transition text-center ${
                  config.frequency === f.id
                    ? 'bg-primary/20 border-primary text-text shadow-glow'
                    : 'bg-surface-secondary border-border text-muted hover:text-text hover:border-border-hover'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Custom Weekday Chips (Shown when custom is selected) */}
          {config.frequency === 'custom' && (
            <div className="p-4 rounded-xl bg-surface-secondary border border-border space-y-2 mt-2">
              <span className="text-[11px] font-bold text-muted uppercase tracking-wider">
                Select Active Days (Mon – Sun):
              </span>
              <div className="flex flex-wrap gap-2 pt-1">
                {WEEKDAYS.map(day => {
                  const isChecked = (config.custom_weekdays || []).includes(day)
                  return (
                    <button
                      key={day}
                      type="button"
                      onClick={() => handleToggleWeekday(day)}
                      className={`h-9 px-4 rounded-xl font-bold text-xs transition flex items-center gap-1.5 ${
                        isChecked
                          ? 'bg-[#CCFF00] text-black shadow-lg shadow-[#CCFF00]/10'
                          : 'bg-surface border border-border text-muted hover:text-text'
                      }`}
                    >
                      {isChecked && <Check className="h-3.5 w-3.5 stroke-[3]" />}
                      <span>{day}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* 2) Posting Time & Timezone & Connected Platforms */}
        <div className="grid md:grid-cols-3 gap-4 pt-2">
          {/* Posting Time */}
          <div className="p-4 rounded-xl bg-surface-secondary border border-border space-y-2">
            <label className="text-xs font-bold text-text flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 text-accent" />
              <span>Posting Time</span>
            </label>
            <input
              type="time"
              value={config.posting_time || '07:00'}
              onChange={(e) => setConfig({ ...config, posting_time: e.target.value })}
              className="w-full bg-surface border border-border rounded-xl px-3.5 py-2 text-xs text-text font-mono font-bold focus:outline-none focus:border-accent"
            />
            <p className="text-[10px] text-muted">Posts publish at this exact minute when due.</p>
          </div>

          {/* Timezone */}
          <div className="p-4 rounded-xl bg-surface-secondary border border-border space-y-2">
            <label className="text-xs font-bold text-text flex items-center gap-1.5">
              <CalendarIcon className="h-3.5 w-3.5 text-accent" />
              <span>Timezone</span>
            </label>
            <select
              value={config.timezone || 'Asia/Karachi'}
              onChange={(e) => setConfig({ ...config, timezone: e.target.value })}
              className="w-full bg-surface border border-border rounded-xl px-3 py-2 text-xs text-text font-bold focus:outline-none focus:border-accent"
            >
              <option value="Asia/Karachi">Asia/Karachi (PKT +05:00)</option>
              <option value="Asia/Dubai">Asia/Dubai (GST +04:00)</option>
              <option value="Europe/London">Europe/London (GMT/BST)</option>
              <option value="America/New_York">America/New York (EST/EDT)</option>
              <option value="UTC">UTC (Universal Coordinated Time)</option>
            </select>
            <p className="text-[10px] text-muted">All schedule dates align to your chosen region.</p>
          </div>

          {/* Platforms (Connected Only) */}
          <div className="p-4 rounded-xl bg-surface-secondary border border-border space-y-2">
            <label className="text-xs font-bold text-text flex items-center gap-1.5">
              <Share2 className="h-3.5 w-3.5 text-accent" />
              <span>Connected Social Channels</span>
            </label>
            <div className="flex flex-wrap gap-1.5 pt-0.5">
              {(config.connected_platforms || ['facebook', 'linkedin', 'tiktok']).map((p: string) => (
                <span
                  key={p}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-[10px] font-black uppercase text-emerald-400"
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  <span>{p}</span>
                </span>
              ))}
            </div>
            <p className="text-[10px] text-muted">Posts are queued only for accounts connected via OAuth.</p>
          </div>
        </div>

        {/* 3) Mode Selector & Standing Rules */}
        <div className="grid md:grid-cols-2 gap-4 pt-2">
          {/* Mode 1: Plan My Whole Week */}
          <div
            onClick={() => setConfig({ ...config, mode: 'weekly_plan' })}
            className={`p-4 rounded-xl border cursor-pointer transition ${
              config.mode === 'weekly_plan'
                ? 'bg-primary/10 border-primary ring-1 ring-primary/40'
                : 'bg-surface-secondary border-border hover:border-border-hover'
            }`}
          >
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2">
                <span className="text-base">📅</span>
                <h4 className="text-xs font-bold text-text">Plan my whole week (Default)</h4>
              </div>
              <div className={`h-4 w-4 rounded-full border flex items-center justify-center ${
                config.mode === 'weekly_plan' ? 'border-primary bg-primary text-white' : 'border-muted'
              }`}>
                {config.mode === 'weekly_plan' && <Check className="h-2.5 w-2.5 stroke-[3]" />}
              </div>
            </div>
            <p className="text-[11px] text-muted leading-relaxed">
              Agent plans all selected days in advance, renders 2 image variants per day, and places them in the review screen for 1-click approval.
            </p>
          </div>

          {/* Mode 2: Ask me before each post */}
          <div
            onClick={() => setConfig({ ...config, mode: 'ask_before_each' })}
            className={`p-4 rounded-xl border cursor-pointer transition ${
              config.mode === 'ask_before_each'
                ? 'bg-accent/10 border-accent ring-1 ring-accent/40'
                : 'bg-surface-secondary border-border hover:border-border-hover'
            }`}
          >
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2">
                <span className="text-base">💬</span>
                <h4 className="text-xs font-bold text-text">Ask me before each post</h4>
              </div>
              <div className={`h-4 w-4 rounded-full border flex items-center justify-center ${
                config.mode === 'ask_before_each' ? 'border-accent bg-accent text-black' : 'border-muted'
              }`}>
                {config.mode === 'ask_before_each' && <Check className="h-2.5 w-2.5 stroke-[3] text-black" />}
              </div>
            </div>
            <p className="text-[11px] text-muted leading-relaxed">
              Sends an evening check-in question before each scheduled day. If unanswered, the post is skipped and never auto-published.
            </p>
          </div>
        </div>

        {/* Autonomous Policy Enforcement Rules */}
        <div className="p-4 rounded-xl bg-surface-secondary/70 border border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[11px] text-muted">
            <span className="flex items-center gap-1.5 text-zinc-300 font-medium">
              <ShieldCheck className="h-3.5 w-3.5 text-accent" />
              Never asks if already scheduled
            </span>
            <span className="flex items-center gap-1.5 text-zinc-300 font-medium">
              <ShieldCheck className="h-3.5 w-3.5 text-accent" />
              No answer = skip (never auto-publish)
            </span>
            <span className="flex items-center gap-1.5 text-zinc-300 font-medium">
              <ShieldCheck className="h-3.5 w-3.5 text-accent" />
              Max 1 question per day
            </span>
            <span className="flex items-center gap-1.5 text-zinc-300 font-medium">
              <ShieldCheck className="h-3.5 w-3.5 text-accent" />
              Check-in is evening before (never at posting time)
            </span>
          </div>

          <button
            type="button"
            onClick={handleSaveScheduleDetails}
            disabled={savingConfig}
            className="px-4 py-2 bg-primary hover:bg-primary-hover text-white font-bold text-xs rounded-xl transition shadow-glow self-end sm:self-auto min-w-[120px]"
          >
            {savingConfig ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────────────────
          2. WEEKLY CHECK-IN BANNER & PLAN GENERATION
          ───────────────────────────────────────────────────────────────────────── */}
      <div className="p-6 md:p-8 rounded-2xl bg-gradient-to-br from-surface to-surface-secondary border border-accent/30 shadow-accent-glow/5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <span className="px-2.5 py-0.5 rounded-full bg-accent/15 text-accent border border-accent/30 font-bold text-[10px] uppercase tracking-wider">
              Evening Check-in Question
            </span>
            <h3 className="text-lg font-black text-text">Any event, offer or launch next week?</h3>
            <p className="text-xs text-muted">
              Tap below to let Autopilot incorporate any special campaign, discount, or launch into the planned posts.
            </p>
          </div>

          {/* Quick Choice Buttons */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleSelectEventAnswer(false)}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition ${
                hasEventPrompt === false
                  ? 'bg-zinc-800 text-white border border-zinc-600'
                  : 'bg-surface border border-border text-muted hover:text-text'
              }`}
            >
              No, standard strategy
            </button>
            <button
              type="button"
              onClick={() => handleSelectEventAnswer(true)}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
                hasEventPrompt === true
                  ? 'bg-accent text-black font-extrabold shadow-accent-glow'
                  : 'bg-surface border border-border text-muted hover:text-accent hover:border-accent/40'
              }`}
            >
              <span>Yes + add details</span>
            </button>
          </div>
        </div>

        {/* Event Details Input (When Yes is chosen) */}
        {hasEventPrompt && (
          <div className="pt-2 space-y-2">
            <input
              type="text"
              value={eventDetailsText}
              onChange={(e) => setEventDetailsText(e.target.value)}
              placeholder="e.g. Launching our 20% Eid offer on all AI automation packages..."
              className="w-full bg-surface border border-accent/40 rounded-xl px-4 py-2.5 text-xs text-text placeholder-muted focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>
        )}

        {/* Generate Plan Button */}
        <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-border pt-4">
          <div className="text-xs text-muted">
            Frequency: <strong className="text-text">{config.next_posts_preview}</strong> · Generates 2 image variants per card.
          </div>
          <button
            type="button"
            onClick={handleTriggerGeneratePlan}
            disabled={generatingPlan || config.kill_switch}
            className="px-5 py-2.5 bg-[#CCFF00] hover:bg-[#b8e600] text-black font-black text-xs rounded-xl transition shadow-lg shadow-[#CCFF00]/15 flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-50"
          >
            {generatingPlan ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin text-black" />
                <span>Generating Week&apos;s Plan...</span>
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4 fill-black" />
                <span>Generate Week&apos;s Plan</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────────────────
          3. REVIEW SCREEN (ONE CARD PER DAY)
          ───────────────────────────────────────────────────────────────────────── */}
      <div className="space-y-6">
        {/* Review Screen Header & Batch Actions */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-4">
          <div>
            <h3 className="text-xl font-black text-text flex items-center gap-2.5">
              <span>Weekly Plan Review</span>
              <span className="px-2.5 py-0.5 rounded-full bg-surface-secondary text-text text-xs font-mono font-bold border border-border">
                {cards.length} Cards
              </span>
            </h3>
            <p className="text-xs text-muted mt-0.5">
              Review and customize each day&apos;s post before publishing. Edits before posting time reset the card to Pending Approval.
            </p>
          </div>

          <div className="flex items-center gap-2.5 self-start sm:self-auto">
            {pendingCount > 0 && (
              <button
                type="button"
                onClick={handleApproveAll}
                className="px-4 py-2 bg-primary hover:bg-primary-hover text-white font-extrabold text-xs rounded-xl transition shadow-glow flex items-center gap-1.5"
              >
                <Check className="h-3.5 w-3.5 stroke-[3]" />
                <span>Approve All ({pendingCount} Pending)</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                if (confirm(`Regenerating the whole week will replace existing pending cards. Continue?`)) {
                  handleTriggerGeneratePlan()
                }
              }}
              disabled={generatingPlan}
              className="px-4 py-2 bg-surface-secondary hover:bg-surface-hover text-text border border-border font-bold text-xs rounded-xl transition flex items-center gap-1.5"
            >
              <RotateCcw className="h-3.5 w-3.5 text-muted" />
              <span>Regenerate Whole Week</span>
            </button>
          </div>
        </div>

        {/* Cards Grid */}
        {cards.length === 0 ? (
          <div className="p-12 text-center rounded-2xl bg-surface border border-border space-y-3">
            <p className="text-sm font-bold text-text">No weekly plan generated yet.</p>
            <p className="text-xs text-muted max-w-md mx-auto">
              Select your frequency above and click <strong>Generate Week&apos;s Plan</strong> to create tailored posts for your schedule.
            </p>
            <button
              type="button"
              onClick={handleTriggerGeneratePlan}
              className="mt-2 px-4 py-2 bg-accent text-black font-extrabold text-xs rounded-xl shadow-accent-glow"
            >
              Generate First Plan Now
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {cards.map((card) => {
              const currentPlat = activePlatformTab[card.id] || card.platform || 'facebook'
              const copyData = card.platform_copies?.[currentPlat] || { caption: card.caption }
              const isApproved = card.status === 'Scheduled'
              const isPublished = card.status === 'Published'
              const isSkipped = card.status === 'Skipped'

              return (
                <div
                  key={card.id}
                  className={`p-6 rounded-2xl border transition-all flex flex-col justify-between space-y-5 ${
                    isApproved
                      ? 'bg-surface border-emerald-500/40 shadow-emerald-500/5'
                      : isPublished
                      ? 'bg-surface border-primary/50 shadow-primary/5'
                      : isSkipped
                      ? 'bg-surface-secondary/40 border-border opacity-60'
                      : 'bg-surface border-border hover:border-border-hover'
                  }`}
                >
                  {/* Top Bar: Date, Platform & Status Toggle */}
                  <div className="flex items-center justify-between gap-3 border-b border-border pb-3.5">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="font-black text-sm text-text">{card.date_display}</span>
                        <span className="font-mono text-xs text-muted">· {card.time_display}</span>
                      </div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-muted">
                        Topic: {card.topic}
                      </span>
                    </div>

                    {/* Status Pill Toggle */}
                    <button
                      type="button"
                      onClick={() => handleToggleCardStatus(card.id)}
                      className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border transition flex items-center gap-1.5 ${
                        isPublished
                          ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                          : isApproved
                          ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                          : isSkipped
                          ? 'bg-zinc-800 text-zinc-400 border-zinc-700'
                          : 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                      }`}
                      title="Click to toggle status"
                    >
                      {isApproved && <Check className="h-3 w-3 stroke-[3]" />}
                      <span>{card.status}</span>
                    </button>
                  </div>

                  {/* Headline */}
                  <div>
                    <h4 className="text-base font-extrabold text-text tracking-tight">
                      {card.headline}
                    </h4>
                  </div>

                  {/* Creative Preview & (c) Change Image Controls */}
                  <div className="space-y-2.5">
                    <div className="h-56 rounded-xl overflow-hidden border border-border bg-black/50 relative group">
                      <img
                        src={resolveMediaUrl(card.media_url)}
                        alt="Card creative"
                        className="w-full h-full object-contain"
                      />
                      {card.variant_image_url && (
                        <div className="absolute top-2 right-2 px-2 py-0.5 rounded-md bg-black/80 text-[10px] font-bold text-accent border border-accent/30 backdrop-blur-sm">
                          {(card.media_url || '').includes('sidebyside_') ? 'Both Variants (Side-by-Side)' : '2 Variants Ready'}
                        </div>
                      )}
                    </div>

                    {/* Change Image Action Bar */}
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      {card.variant_image_url && (
                        <>
                          <button
                            type="button"
                            onClick={() => handleSwapVariant(card.id)}
                            className="px-3 py-1.5 rounded-lg bg-surface-secondary border border-border hover:border-accent text-text text-[11px] font-bold transition flex items-center gap-1.5"
                            title="Switch between Variant 1 and Variant 2"
                          >
                            <RefreshCw className="h-3 w-3 text-accent" />
                            <span>Swap Variant</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSelectBothVariants(card.id)}
                            className={`px-3 py-1.5 rounded-lg border text-[11px] font-bold transition flex items-center gap-1.5 ${
                              (card.media_url || '').includes('sidebyside_')
                                ? 'bg-accent text-black border-accent font-extrabold'
                                : 'bg-surface-secondary border-border hover:border-accent text-text'
                            }`}
                            title="Combine Variant 1 & Variant 2 side-by-side in a single post"
                          >
                            <Check className="h-3 w-3" />
                            <span>Select Both (Side-by-Side)</span>
                          </button>
                        </>
                      )}

                      <button
                        type="button"
                        onClick={() => handleOpenLibrary(card.id)}
                        className="px-3 py-1.5 rounded-lg bg-surface-secondary border border-border hover:border-accent text-text text-[11px] font-bold transition flex items-center gap-1.5"
                        title="Pick from previously generated images"
                      >
                        <Layers className="h-3 w-3 text-accent" />
                        <span>Pick from Library</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleUploadImageTrigger(card.id)}
                        className="px-3 py-1.5 rounded-lg bg-surface-secondary border border-border hover:border-accent text-text text-[11px] font-bold transition flex items-center gap-1.5"
                      >
                        <Upload className="h-3 w-3 text-muted" />
                        <span>Upload</span>
                      </button>
                    </div>
                  </div>

                  {/* (b) Manual Caption Edit Per Platform */}
                  <div className="space-y-2 pt-1">
                    <div className="flex items-center justify-between flex-wrap gap-1.5">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-muted">
                        Platform Captions
                      </span>
                      {/* Platform Tabs */}
                      <div className="flex flex-wrap gap-1">
                        {['instagram', 'facebook', 'linkedin', 'twitter', 'tiktok'].map((p: string) => (
                          <button
                            key={p}
                            type="button"
                            onClick={() => {
                              setActivePlatformTab(prev => ({ ...prev, [card.id]: p }))
                              setCaptionInputs(prev => ({
                                ...prev,
                                [card.id]: card.platform_copies?.[p]?.caption || card.caption || ''
                              }))
                            }}
                            className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase transition ${
                              currentPlat === p
                                ? 'bg-primary text-white'
                                : 'bg-surface-secondary text-muted hover:text-text'
                            }`}
                          >
                            {p === 'twitter' ? 'X' : p}
                          </button>
                        ))}
                      </div>
                    </div>

                    <textarea
                      rows={3}
                      value={captionInputs[card.id] !== undefined ? captionInputs[card.id] : copyData.caption}
                      onChange={(e) => setCaptionInputs({ ...captionInputs, [card.id]: e.target.value })}
                      className="w-full bg-surface-secondary border border-border rounded-xl p-3 text-xs text-text placeholder-muted leading-relaxed focus:outline-none focus:border-primary resize-none"
                    />

                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={() => handleSaveCaption(card.id)}
                        className="px-3 py-1 rounded-lg bg-surface hover:bg-surface-secondary border border-border font-bold text-[11px] text-text transition"
                      >
                        Save Caption ({currentPlat.toUpperCase()})
                      </button>
                    </div>
                  </div>

                  {/* (a) Edit with Prompt */}
                  <div className="p-3.5 rounded-xl bg-surface-secondary border border-border space-y-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted flex items-center gap-1">
                      <Sparkles className="h-3 w-3 text-accent" />
                      Edit with Prompt
                    </span>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={promptInputs[card.id] || ''}
                        onChange={(e) => setPromptInputs({ ...promptInputs, [card.id]: e.target.value })}
                        placeholder="e.g. make it about our Eid offer..."
                        className="flex-1 bg-surface border border-border rounded-lg px-3 py-1.5 text-xs text-text placeholder-muted focus:outline-none focus:border-accent"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleEditWithPrompt(card.id)
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => handleEditWithPrompt(card.id)}
                        disabled={regeneratingCardId === card.id}
                        className="px-3 py-1.5 bg-accent hover:bg-accent-hover text-black font-extrabold text-xs rounded-lg transition disabled:opacity-50 min-w-[100px]"
                      >
                        {regeneratingCardId === card.id ? 'Regenerating...' : 'Regenerate'}
                      </button>
                    </div>
                  </div>

                  {/* (d) Skip & Reschedule Actions & Verified Live Publishing Test */}
                  <div className="pt-2 border-t border-border flex flex-wrap items-center justify-between gap-3 text-xs">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleSkipCard(card.id)}
                        className="px-2.5 py-1.5 rounded-lg text-muted hover:text-danger hover:bg-danger/10 text-xs font-bold transition flex items-center gap-1"
                      >
                        <SkipForward className="h-3 w-3" />
                        <span>Skip Day</span>
                      </button>

                      {/* Reschedule Picker */}
                      <input
                        type="datetime-local"
                        onChange={(e) => setRescheduleDateInputs({ ...rescheduleDateInputs, [card.id]: e.target.value })}
                        className="bg-surface border border-border rounded-lg px-2 py-1 text-[11px] text-text font-mono focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => handleRescheduleCard(card.id)}
                        className="px-2 py-1 bg-surface border border-border hover:border-primary rounded-lg text-[11px] font-bold text-muted hover:text-text transition"
                      >
                        Move
                      </button>
                    </div>

                    {/* Real Publishing Flow */}
                    <div>
                      {isPublished ? (
                        <div className="flex items-center gap-2">
                          <span className="text-emerald-400 font-bold text-xs flex items-center gap-1">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Published Live
                          </span>
                          {card.permalink && (
                            <a
                              href={card.permalink}
                              target="_blank"
                              rel="noreferrer"
                              className="px-2 py-1 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded-lg text-xs font-bold hover:underline flex items-center gap-1"
                            >
                              <span>View ↗</span>
                            </a>
                          )}
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handlePublishNowTest(card.id, currentPlat)}
                          disabled={publishingCardId === card.id}
                          className="px-3 py-1.5 bg-primary/20 hover:bg-primary/30 border border-primary/40 text-primary-light font-extrabold text-xs rounded-xl transition flex items-center gap-1.5 active:scale-[0.98] disabled:opacity-50"
                        >
                          <Send className="h-3 w-3" />
                          <span>{publishingCardId === card.id ? 'Publishing...' : `Publish Now (${currentPlat === 'twitter' ? 'X' : currentPlat.toUpperCase()})`}</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ─────────────────────────────────────────────────────────────────────────
          4. AGENT DECISION TIMELINE / AUDIT TRAIL
          ───────────────────────────────────────────────────────────────────────── */}
      <div className="p-6 md:p-8 rounded-2xl bg-surface border border-border space-y-4">
        <div className="flex items-center justify-between border-b border-border pb-4">
          <div>
            <h3 className="text-base font-bold text-text flex items-center gap-2">
              <Clock className="h-4 w-4 text-accent" />
              <span>Agent Decision Timeline (Audit Trail)</span>
            </h3>
            <p className="text-xs text-muted mt-0.5">
              Full transparency into every planning decision, self-critique check, and edit made to your posts.
            </p>
          </div>
          <button
            type="button"
            onClick={fetchData}
            className="p-2 rounded-xl bg-surface-secondary border border-border hover:border-primary text-muted hover:text-text transition"
            title="Refresh logs"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
          {logs.length === 0 ? (
            <div className="p-6 text-center text-xs text-muted">
              No decision logs recorded yet. Generate a plan above to view your audit trail.
            </div>
          ) : (
            logs.slice(0, 15).map(log => (
              <div
                key={log.id}
                className="p-3 rounded-xl bg-surface-secondary border border-border flex items-start justify-between gap-3 text-xs"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase bg-surface border border-border text-accent">
                      {log.stage}
                    </span>
                    <span className="text-[10px] font-bold uppercase text-muted">
                      {log.status}
                    </span>
                  </div>
                  <p className="text-text font-medium text-xs leading-relaxed">
                    {log.decision_summary}
                  </p>
                </div>
                <span className="text-[10px] text-muted font-mono whitespace-nowrap">
                  {new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────────────────
          5. IMAGE LIBRARY MODAL (Clears 7-day auto-delete tag upon picking)
          ───────────────────────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {libraryModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-3xl rounded-2xl bg-surface border border-border p-6 shadow-2xl space-y-4 max-h-[85vh] flex flex-col"
            >
              <div className="flex items-center justify-between border-b border-border pb-3">
                <div className="flex items-center gap-2">
                  <Layers className="h-5 w-5 text-accent" />
                  <h3 className="text-base font-bold text-text">Choose from Creative Library</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setLibraryModalOpen(false)}
                  className="p-1 rounded-lg text-muted hover:text-text hover:bg-surface-secondary"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <p className="text-xs text-muted">
                Selecting an image will apply it to your post card and <strong className="text-accent">permanently clear its 7-day auto-delete tag</strong>.
              </p>

              <div className="flex-1 overflow-y-auto grid grid-cols-2 sm:grid-cols-3 gap-3.5 pr-1">
                {loadingLibrary ? (
                  <div className="col-span-full py-12 text-center text-xs text-muted">Loading creatives...</div>
                ) : libraryImages.length === 0 ? (
                  <div className="col-span-full py-12 text-center text-xs text-muted">No library creatives available.</div>
                ) : (
                  libraryImages.map(img => (
                    <div
                      key={img.id}
                      onClick={() => handleSelectLibraryImage(img.url)}
                      className="group cursor-pointer rounded-xl overflow-hidden border border-border hover:border-accent transition bg-black/40 relative aspect-square"
                    >
                      <img src={resolveMediaUrl(img.url)} alt="Creative" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <span className="px-3 py-1.5 rounded-lg bg-accent text-black font-extrabold text-xs shadow-glow">
                          Select Image
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}
