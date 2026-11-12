'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Loader2, 
  Download,
  Globe, 
  Share2, 
  Users, 
  Layout, 
  ArrowRight, 
  RefreshCw, 
  Zap, 
  CheckCircle, 
  Megaphone, 
  ExternalLink,
  Image as ImageIcon,
  Upload,
  X,
  Sparkles,
  Sliders,
  Check,
  RotateCcw,
  Eye,
  Layers,
  Copy,
  Calendar,
  ShieldCheck,
  AlertTriangle
} from 'lucide-react'
import api, { 
  uploadReferenceImage, 
  generateSessionVariants, 
  selectSessionVariant, 
  regenerateSingleVariant,
  getUserCredits,
  submitPostForApproval
} from '@/lib/api'
import { 
  SessionResult, 
  ReferenceImageItem, 
  SessionVariantItem, 
  MultiVariantSessionResult 
} from '@/lib/types'
import { toast } from 'react-hot-toast'
import CopyButton from '@/components/ui/CopyButton'
import Skeleton from '@/components/ui/Skeleton'

// Progress stages for generating variants
const PROGRESS_STAGES = [
  { pct: 0,   label: 'Initializing session...' },
  { pct: 15,  label: 'Analyzing brand tone & references...' },
  { pct: 30,  label: 'Drafting multi-channel copy...' },
  { pct: 50,  label: 'Designing brand visual layouts...' },
  { pct: 75,  label: 'Rendering crisp HTML/CSS typography variants...' },
  { pct: 90,  label: 'Harmonizing brand logos and CTA overlays...' },
  { pct: 100, label: 'Your variants are ready! 🎉' },
]

export default function SessionPage() {
  const router = useRouter()
  const [phase, setPhase] = useState<1 | 2 | 3>(1) // 1: Form & Reference, 2: Generating, 3: Results
  const [businessName, setBusinessName] = useState('your business')
  const [sessionId, setSessionId] = useState<string>('')
  
  // Selection states
  const [specialMode, setSpecialMode] = useState<'normal' | 'special'>('normal')
  const [specialDetails, setSpecialDetails] = useState('')

  // ─── Reference Area States ────────────────────────────────────────────────
  const [referenceContext, setReferenceContext] = useState('')
  const [referenceImages, setReferenceImages] = useState<ReferenceImageItem[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ─── Target Social Platforms Selection ────────────────────────────────────
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([
    'linkedin',
    'facebook',
    'instagram',
    'twitter',
    'tiktok'
  ])

  const togglePlatform = (p: string) => {
    setSelectedPlatforms(prev => 
      prev.includes(p)
        ? prev.filter(x => x !== p)
        : [...prev, p]
    )
  }

  const toggleAllPlatforms = () => {
    if (selectedPlatforms.length > 0) {
      setSelectedPlatforms([])
    } else {
      setSelectedPlatforms(['linkedin', 'facebook', 'instagram', 'twitter', 'tiktok'])
    }
  }

  // ─── Generation & Variant Results States ──────────────────────────────────
  const [isGenerating, setIsGenerating] = useState(false)
  const [variantSessionData, setVariantSessionData] = useState<MultiVariantSessionResult | null>(null)
  const [selectedVariantId, setSelectedVariantId] = useState<string>('')
  const [selectedVariantImage, setSelectedVariantImage] = useState<string>('')
  const [imageLoadError, setImageLoadError] = useState(false)
  const [cardImageErrors, setCardImageErrors] = useState<Record<string, boolean>>({})
  const [activePlatformTab, setActivePlatformTab] = useState('instagram_post')
  const [platformCopies, setPlatformCopies] = useState<Record<string, {
    caption: string
    hashtags: string[]
    best_time?: string
    call_to_action?: string
  }>>({})

  // Helper to ensure public, stable media resolution across devices
  const resolveMediaUrl = (url?: string | null): string => {
    if (!url) return ''
    if (typeof window !== 'undefined' && window.location.hostname && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
      const currentHost = window.location.hostname
      url = url.replace(/http:\/\/localhost:8000/g, `http://${currentHost}:8000`)
               .replace(/http:\/\/127\.0\.0\.1:8000/g, `http://${currentHost}:8000`)
    }
    if (url.startsWith('http://') || url.startsWith('https://')) {
      return url
    }
    const host = typeof window !== 'undefined' && window.location.hostname && window.location.hostname !== 'localhost'
      ? window.location.hostname
      : 'localhost'
    const base = `http://${host}:8000`
    const path = url.startsWith('/') ? url : `/${url}`
    return `${base.replace(/\/+$/, '')}${path}`
  }
  
  // Editable Copy for Selected Variant
  const [captionText, setCaptionText] = useState('')
  const [hashtagsList, setHashtagsList] = useState<string[]>([])
  
  // Modal Full-Size Preview
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null)

  // Regenerating state per variant
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null)
  const [savingSelection, setSavingSelection] = useState(false)
  const [requireApproval, setRequireApproval] = useState(false)
  const [submittingApproval, setSubmittingApproval] = useState(false)
  const [savedPostId, setSavedPostId] = useState<string | null>(null)

  // Credits & Limits
  const [creditsRemaining, setCreditsRemaining] = useState<number>(60)
  const [planName, setPlanName] = useState<string>('Starter')
  const [maxVariantsAllowed, setMaxVariantsAllowed] = useState<number>(2)

  // Progress Bar State
  const [progress, setProgress] = useState(0)
  const [progressLabel, setProgressLabel] = useState('Starting...')
  const progressTimersRef = useRef<ReturnType<typeof setTimeout>[]>([])

  // Load Session and Brand on Mount
  useEffect(() => {
    const initSession = async () => {
      try {
        const brandRes = await api.get('/brand/profile').catch(() => null)
        if (brandRes?.data?.business_name) {
          setBusinessName(brandRes.data.business_name)
        }
        if (brandRes?.data?.require_approval) {
          setRequireApproval(Boolean(brandRes.data.require_approval))
        }

        const sessionRes = await api.post('/sessions/questions').catch(() => null)
        if (sessionRes?.data?.session_id) {
          setSessionId(sessionRes.data.session_id)
        }

        const credData = await getUserCredits().catch(() => null)
        if (credData && typeof credData.balance === 'number') {
          setCreditsRemaining(credData.balance)
          if (credData.plan) setPlanName(credData.plan)
        }
      } catch (err) {
        console.error('Failed to initialize session:', err)
      }
    }
    initSession()
  }, [])

  // Clear timers on unmount
  useEffect(() => {
    return () => {
      progressTimersRef.current.forEach(clearTimeout)
    }
  }, [])

  const startProgressBar = () => {
    setProgress(0)
    setProgressLabel('Analyzing brand tone & strategic focus...')
    progressTimersRef.current.forEach(clearTimeout)
    progressTimersRef.current = []

    const schedule = [
      { delay: 400,   pct: 12, label: 'Analyzing brand tone & references...' },
      { delay: 2500,  pct: 28, label: 'Drafting multi-channel copy & hashtags...' },
      { delay: 6000,  pct: 46, label: 'Formulating hero visual concepts...' },
      { delay: 11000, pct: 68, label: 'Rendering crisp HTML/CSS typography layouts...' },
      { delay: 18000, pct: 84, label: 'Harmonizing brand logos and CTA overlays...' },
      { delay: 25000, pct: 92, label: 'Polishing high-retina visual variants...' },
      { delay: 35000, pct: 96, label: 'Finalizing design files...' },
    ]

    schedule.forEach(({ delay, pct, label }) => {
      const timer = setTimeout(() => {
        setProgress(pct)
        setProgressLabel(label)
      }, delay)
      progressTimersRef.current.push(timer)
    })

    // Fail-safe timeout: after 110 seconds, alert the user rather than leaving them hanging indefinitely
    const timeoutTimer = setTimeout(() => {
      if (phase === 2) {
        toast.error('Generation took longer than expected. Please try again or simplify inputs.')
        setPhase(1)
        setIsGenerating(false)
      }
    }, 110000)
    progressTimersRef.current.push(timeoutTimer)
  }

  const completeProgressBar = () => {
    progressTimersRef.current.forEach(clearTimeout)
    setProgress(100)
    setProgressLabel('Your variants are ready! 🎉')
  }

  // ─── Reference Image File Upload Handlers ─────────────────────────────────
  const handleFilesAdded = async (files: FileList | File[]) => {
    const fileArray = Array.from(files)
    if (referenceImages.length + fileArray.length > 3) {
      toast.error('You can upload up to 3 reference images maximum.')
      return
    }

    for (const file of fileArray) {
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
        toast.error(`${file.name}: Only JPG, PNG, and WebP images are allowed.`)
        continue
      }
      if (file.size > 8 * 1024 * 1024) {
        toast.error(`${file.name} exceeds 8MB maximum size limit.`)
        continue
      }

      const tempId = Math.random().toString(36).substring(7)
      const previewUrl = URL.createObjectURL(file)

      const newItem: ReferenceImageItem = {
        id: tempId,
        file,
        preview: previewUrl,
        mode: 'use_photo',
        filename: file.name,
        uploading: true
      }

      setReferenceImages(prev => [...prev, newItem])

      // Upload in background to validate, strip EXIF, and store in private R2
      try {
        const uploadRes = await uploadReferenceImage(file, 'use_photo')
        setReferenceImages(prev => 
          prev.map(item => item.id === tempId ? {
            ...item,
            url: uploadRes.url,
            filename: uploadRes.filename,
            uploading: false
          } : item)
        )
      } catch (err: any) {
        const errMsg = err.response?.data?.detail || 'Upload failed'
        toast.error(`Error uploading ${file.name}: ${errMsg}`)
        setReferenceImages(prev => prev.filter(item => item.id !== tempId))
      }
    }
  }

  const handleModeChange = (id: string, mode: 'use_photo' | 'style_inspiration') => {
    setReferenceImages(prev =>
      prev.map(item => item.id === id ? { ...item, mode } : item)
    )
  }

  const handleRemoveImage = (id: string) => {
    setReferenceImages(prev => prev.filter(item => item.id !== id))
  }

  // ─── Generate Variants Action ─────────────────────────────────────────────
  const executeVariantGeneration = async () => {
    if (selectedPlatforms.length === 0) {
      toast.error('Please select at least one social platform.')
      return
    }

    setIsGenerating(true)
    setPhase(2)
    startProgressBar()

    try {
      const activeSessionId = sessionId || 'session_default'
      const payload = {
        session_id: activeSessionId,
        answer_1: specialMode === 'special' ? `Special highlight: ${specialDetails}` : 'Normal day brand strategy focus',
        answer_2: 'All primary channels (Instagram, LinkedIn, Facebook)',
        answer_3: specialDetails || 'Standard high-value engaging branded update',
        context_text: referenceContext.trim() || undefined,
        reference_images: referenceImages.map(img => ({
          url: img.url || img.preview,
          mode: img.mode,
          filename: img.filename
        })),
        target_platform: activePlatformTab,
        selected_platforms: selectedPlatforms,
        variant_count: 2
      }

      const res: MultiVariantSessionResult = await generateSessionVariants(payload)
      if (res) {
        completeProgressBar()
        setTimeout(() => {
          setVariantSessionData(res)
          setCreditsRemaining(res.credits_remaining)
          setPlanName(res.plan)
          setMaxVariantsAllowed(res.max_variants_allowed)

          // Multi-channel copy state initialization
          const rawPosts = res.platform_posts || {}
          const initialCopies: Record<string, any> = {
            instagram_post: {
              caption: rawPosts.instagram_post?.caption || res.caption || '',
              hashtags: rawPosts.instagram_post?.hashtags || res.hashtags || [],
              best_time: rawPosts.instagram_post?.best_time || res.posting_time_suggestion || 'Today 7:00 PM',
              call_to_action: rawPosts.instagram_post?.call_to_action || res.call_to_action
            },
            linkedin_post: {
              caption: rawPosts.linkedin_post?.caption || res.caption || '',
              hashtags: rawPosts.linkedin_post?.hashtags || (res.hashtags || []).slice(0, 5),
              best_time: rawPosts.linkedin_post?.best_time || 'Tuesday 9:00 AM',
              call_to_action: rawPosts.linkedin_post?.call_to_action || 'Share your thoughts below'
            },
            facebook_post: {
              caption: rawPosts.facebook_post?.caption || res.caption || '',
              hashtags: rawPosts.facebook_post?.hashtags || (res.hashtags || []).slice(0, 3),
              best_time: rawPosts.facebook_post?.best_time || 'Today 1:00 PM',
              call_to_action: rawPosts.facebook_post?.call_to_action || 'Comment below!'
            },
            twitter_post: {
              caption: rawPosts.twitter_post?.caption || (res.caption ? res.caption.slice(0, 240) : ''),
              hashtags: rawPosts.twitter_post?.hashtags || (res.hashtags || []).slice(0, 2),
              best_time: rawPosts.twitter_post?.best_time || 'Today 12:00 PM',
              call_to_action: rawPosts.twitter_post?.call_to_action || 'RT if you agree'
            },
            tiktok: {
              caption: rawPosts.tiktok?.caption || (res.caption ? `${res.caption.split('\n')[0]} 👀 Drop your thoughts below! 👇` : ''),
              hashtags: rawPosts.tiktok?.hashtags || ['#fyp', '#trending', '#viral', ...(res.hashtags || []).slice(0, 2)],
              best_time: rawPosts.tiktok?.best_time || 'Today 8:00 PM',
              call_to_action: rawPosts.tiktok?.call_to_action || 'Follow for daily tips'
            }
          }

          setPlatformCopies(initialCopies)
          setActivePlatformTab('instagram_post')
          setCaptionText(initialCopies.instagram_post.caption)
          setHashtagsList(initialCopies.instagram_post.hashtags)

          // Set default selected variant
          const initialSelected = res.variants?.find(v => v.is_selected) || res.variants?.[0]
          if (initialSelected) {
            setSelectedVariantId(initialSelected.id)
            setSelectedVariantImage(initialSelected.image_url)
          }

          setPhase(3)
          if (res.generation_status === 'failed' || res.variants?.every(v => v.source === 'fallback')) {
            toast.error(res.generation_error || 'AI generation failed - showing local emergency templates', { duration: 6000 })
          } else if (res.generation_status === 'partial') {
            toast('Some variants used emergency fallback templates', { icon: '⚠️', duration: 4000 })
          } else {
            toast.success('Generated tailored image variants!')
          }
        }, 600)
      }
    } catch (err: any) {
      console.error('Variant generation failed:', err)
      progressTimersRef.current.forEach(clearTimeout)
      const msg = err.response?.data?.detail || 'Failed to generate variants. Please try again.'
      toast.error(msg)
      setPhase(1)
    } finally {
      setIsGenerating(false)
    }
  }

  // ─── Select A Variant ─────────────────────────────────────────────────────
  const handleSelectVariant = async (variant: SessionVariantItem) => {
    setSelectedVariantId(variant.id)
    setSelectedVariantImage(variant.image_url)

    if (!variantSessionData) return
    setVariantSessionData(prev => prev ? ({
      ...prev,
      variants: prev.variants.map(v => ({
        ...v,
        is_selected: v.id === variant.id
      }))
    }) : null)

    try {
      setSavingSelection(true)
      await selectSessionVariant({
        variant_id: variant.id,
        session_id: variantSessionData.session_id,
        adjusted_caption: captionText,
        adjusted_hashtags: hashtagsList,
        target_platform: activePlatformTab,
        platform_copies: platformCopies,
        selected_platforms: selectedPlatforms
      })
      toast.success('Saved as active selected post for download & calendar!')
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('brandflux:credits_updated'))
      }
    } catch (err: any) {
      console.error('Failed to commit variant selection:', err)
    } finally {
      setSavingSelection(false)
    }
  }

  // ─── Multi-Platform Tabs Switching ──────────────────────────────────────────
  const switchPlatformTab = (platformKey: string) => {
    // Save current active copy into state before switching
    setPlatformCopies(prev => ({
      ...prev,
      [activePlatformTab]: {
        ...(prev[activePlatformTab] || {}),
        caption: captionText,
        hashtags: hashtagsList
      }
    }))

    setActivePlatformTab(platformKey)

    const target = platformCopies[platformKey]
    if (target) {
      setCaptionText(target.caption || '')
      setHashtagsList(target.hashtags || [])
    }
  }

  const handleCaptionChange = (val: string) => {
    setCaptionText(val)
    setPlatformCopies(prev => ({
      ...prev,
      [activePlatformTab]: {
        ...(prev[activePlatformTab] || {}),
        caption: val
      }
    }))
  }

  const handleProceedToCalendar = async () => {
    if (variantSessionData && selectedVariantId) {
      try {
        const res = await selectSessionVariant({
          variant_id: selectedVariantId,
          session_id: variantSessionData.session_id,
          adjusted_caption: captionText,
          adjusted_hashtags: hashtagsList,
          target_platform: activePlatformTab,
          platform_copies: platformCopies,
          selected_platforms: selectedPlatforms
        })
        if (res?.post_id) {
          setSavedPostId(res.post_id)
        }
      } catch (e) {
        console.error('Error committing selection before calendar:', e)
      }
    }
    router.push('/calendar')
  }

  const handleSubmitForApproval = async () => {
    if (!variantSessionData || !selectedVariantId) return
    setSubmittingApproval(true)
    try {
      const res = await selectSessionVariant({
        variant_id: selectedVariantId,
        session_id: variantSessionData.session_id,
        adjusted_caption: captionText,
        adjusted_hashtags: hashtagsList,
        target_platform: activePlatformTab,
        platform_copies: platformCopies,
        selected_platforms: selectedPlatforms
      })
      const postId = res?.post_id || res?.parent_post_id || savedPostId
      if (postId) {
        setSavedPostId(postId)
        await submitPostForApproval(postId)
        toast.success('Post submitted for approver review!')
        router.push('/approvals')
      } else {
        toast.error('Could not resolve post ID for approval.')
      }
    } catch (err: any) {
      console.error('Failed to submit post for approval:', err)
      toast.error(err.response?.data?.detail || 'Failed to submit post for approval.')
    } finally {
      setSubmittingApproval(false)
    }
  }

  // ─── Regenerate Single Variant / More Like This ────────────────────────────
  const handleRegenerateVariant = async (variant: SessionVariantItem, moreLikeThis: boolean = false) => {
    if (!variantSessionData) return
    setRegeneratingId(variant.id)
    toast.loading(moreLikeThis ? 'Creating variation inspired by this...' : 'Regenerating variant...', { id: 'regen' })

    try {
      const styleDirection = moreLikeThis 
        ? `${variant.style_direction}, refined variation with subtle compositional enhancements`
        : variant.style_direction

      const res = await regenerateSingleVariant({
        session_id: variantSessionData.session_id,
        variant_id: variant.id,
        style_direction: styleDirection,
        reference_context: referenceContext,
        target_platform: activePlatformTab,
        selected_platforms: selectedPlatforms
      })

      if (res?.variant) {
        setVariantSessionData(prev => {
          if (!prev) return prev
          const updated = prev.variants.map(v => v.id === variant.id ? { ...res.variant, id: variant.id, variant_index: v.variant_index } : v)
          return { ...prev, variants: updated }
        })
        toast.success(moreLikeThis ? 'New variation created!' : 'Variant regenerated!', { id: 'regen' })
      }
    } catch (err: any) {
      toast.error('Failed to regenerate variant', { id: 'regen' })
    } finally {
      setRegeneratingId(null)
    }
  }

  // Download Single Image
  const handleDownloadSelected = async () => {
    if (!selectedVariantImage) return
    try {
      const res = await fetch(selectedVariantImage)
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `brandflux_${activePlatformTab}_${Date.now()}.png`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      toast.success('Downloaded image! 🎉')
    } catch (e) {
      toast.error('Download failed. Right click image to save.')
    }
  }

  return (
    <div className="min-h-screen bg-bg text-text pb-24">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* PHASE 1: INPUT STEP (Check-in, Reference Area, Mode Picker)          */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        {phase === 1 && (
          <motion.div 
            initial={{ opacity: 0, y: 15 }} 
            animate={{ opacity: 1, y: 0 }} 
            className="space-y-8 py-6"
          >
            {/* Header Title & Credits Indicator */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-6">
              <div>
                <span className="px-3 py-1 rounded-full bg-primary/20 border border-primary/40 text-primary-light text-xs font-bold uppercase tracking-wider inline-flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5" />
                  Enhanced Session Studio
                </span>
                <h1 className="text-3xl md:text-4xl font-black tracking-tight mt-2 text-text">
                  Create Content for <span className="text-accent">{businessName}</span>
                </h1>
                <p className="text-muted text-sm mt-1">
                  Combine free-text direction with photo references and AI styling.
                </p>
              </div>

              {/* Credits Badge */}
              <div className="bg-surface border border-border p-3.5 rounded-2xl flex items-center gap-3 self-start sm:self-auto shadow-sm">
                <div className="h-9 w-9 rounded-xl bg-accent/15 border border-accent/30 text-accent flex items-center justify-center font-black">
                  <Zap className="h-4.5 w-4.5" />
                </div>
                <div>
                  <p className="text-[11px] font-bold text-muted uppercase tracking-wider">Post Credits</p>
                  <p className="text-sm font-black text-text">
                    <span className="text-accent">{creditsRemaining}</span> left <span className="text-muted font-normal text-xs">({planName} plan)</span>
                  </p>
                </div>
              </div>
            </div>

            {/* Smart Check-in Selection Card */}
            <div className="bg-surface border border-border rounded-3xl p-6 sm:p-8 space-y-6">
              <div className="space-y-1">
                <h2 className="text-xl font-extrabold text-text flex items-center gap-2">
                  <span>1. Today&apos;s Focus &amp; Highlights</span>
                </h2>
                <p className="text-xs text-muted">Choose your focus mode for today&apos;s content generation.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Option: Normal Day */}
                <button
                  type="button"
                  onClick={() => setSpecialMode('normal')}
                  className={`p-5 rounded-2xl border text-left transition-all duration-200 flex flex-col justify-between h-36 ${
                    specialMode === 'normal' 
                      ? 'border-accent bg-surface-secondary text-text ring-1 ring-accent shadow-accent-glow/20' 
                      : 'bg-surface-secondary/40 border-border hover:border-border-light'
                  }`}
                >
                  <div className="h-9 w-9 rounded-xl bg-surface border border-border flex items-center justify-center text-accent">
                    <Zap className="h-4.5 w-4.5" />
                  </div>
                  <div>
                    <p className="font-extrabold text-base text-text">Standard Strategic Focus</p>
                    <p className="text-xs text-muted font-medium mt-0.5">Let AI balance educational &amp; engaging brand pillars.</p>
                  </div>
                </button>

                {/* Option: Special Day */}
                <button
                  type="button"
                  onClick={() => setSpecialMode('special')}
                  className={`p-5 rounded-2xl border text-left transition-all duration-200 flex flex-col justify-between h-36 ${
                    specialMode === 'special' 
                      ? 'border-accent bg-surface-secondary text-text ring-1 ring-accent shadow-accent-glow/20' 
                      : 'bg-surface-secondary/40 border-border hover:border-border-light'
                  }`}
                >
                  <div className="h-9 w-9 rounded-xl bg-surface border border-border flex items-center justify-center text-accent">
                    <Megaphone className="h-4.5 w-4.5" />
                  </div>
                  <div>
                    <p className="font-extrabold text-base text-text">Special Event / Promotion</p>
                    <p className="text-xs text-muted font-medium mt-0.5">Sale, product launch, discount, or custom milestone.</p>
                  </div>
                </button>
              </div>

              {/* Special details input */}
              {specialMode === 'special' && (
                <motion.div 
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="space-y-2 pt-2"
                >
                  <label className="text-xs font-bold text-muted uppercase tracking-wider pl-1">
                    Special Offer or Event Details:
                  </label>
                  <textarea
                    value={specialDetails}
                    onChange={e => setSpecialDetails(e.target.value)}
                    placeholder="e.g. Flash 20% discount on summer collection with code SUMMER20, valid this weekend only..."
                    rows={2}
                    className="w-full bg-surface-secondary border border-border rounded-xl px-4 py-3 text-sm text-text focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all placeholder:text-muted"
                  />
                </motion.div>
              )}
            </div>

            {/* ─── REFERENCE AREA (Drag-Drop Images + Context Box) ───────────── */}
            <div className="bg-surface border border-border rounded-3xl p-6 sm:p-8 space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h2 className="text-xl font-extrabold text-text flex items-center gap-2">
                    <ImageIcon className="h-5 w-5 text-accent" />
                    <span>2. Reference Input (Optional)</span>
                  </h2>
                  <p className="text-xs text-muted mt-0.5">
                    Works seamlessly with: <strong>text only</strong>, <strong>image only</strong>, or <strong>image + text</strong>.
                  </p>
                </div>
                <span className="text-xs font-bold px-3 py-1 rounded-full bg-surface-secondary text-muted border border-border self-start sm:self-auto">
                  {referenceImages.length} / 3 images uploaded
                </span>
              </div>

              {/* Drag & Drop Upload Zone */}
              <div
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(e) => {
                  e.preventDefault()
                  setIsDragging(false)
                  if (e.dataTransfer.files) handleFilesAdded(e.dataTransfer.files)
                }}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-2xl p-6 sm:p-8 text-center cursor-pointer transition-all ${
                  isDragging 
                    ? 'border-accent bg-accent/10 scale-[1.01]' 
                    : 'border-border hover:border-primary hover:bg-surface-secondary/50'
                }`}
              >
                <input 
                  type="file" 
                  ref={fileInputRef}
                  onChange={(e) => { if (e.target.files) handleFilesAdded(e.target.files) }}
                  multiple
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                />
                <div className="flex flex-col items-center justify-center space-y-2">
                  <div className="h-12 w-12 rounded-2xl bg-surface-secondary border border-border flex items-center justify-center text-primary-light">
                    <Upload className="h-6 w-6" />
                  </div>
                  <p className="text-sm font-bold text-text">
                    Drag and drop up to 3 images here, or <span className="text-accent underline underline-offset-4">browse</span>
                  </p>
                  <p className="text-xs text-muted">
                    Supports JPG, PNG, WebP (max 8MB per file). EXIF data stripped for privacy.
                  </p>
                </div>
              </div>

              {/* Uploaded Images List with Mode Selector ("Use my photo" vs "Style inspiration") */}
              {referenceImages.length > 0 && (
                <div className="space-y-3">
                  <p className="text-xs font-bold uppercase tracking-wider text-muted">Configure Image Modes:</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4">
                    {referenceImages.map((item, idx) => (
                      <div 
                        key={item.id} 
                        className="p-3.5 rounded-2xl bg-surface-secondary border border-border space-y-3 relative group"
                      >
                        {/* Thumbnail & Remove button */}
                        <div className="relative rounded-xl overflow-hidden aspect-video bg-black/40 border border-border flex items-center justify-center">
                          <img 
                            src={item.preview} 
                            alt={item.filename || `Reference ${idx + 1}`} 
                            className="w-full h-full object-cover" 
                          />
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); handleRemoveImage(item.id) }}
                            className="absolute top-2 right-2 h-7 w-7 rounded-lg bg-black/75 hover:bg-danger text-white flex items-center justify-center transition"
                            title="Remove image"
                          >
                            <X className="h-4 w-4" />
                          </button>
                          {item.uploading && (
                            <div className="absolute inset-0 bg-black/60 flex items-center justify-center gap-2 text-xs font-bold text-accent">
                              <Loader2 className="h-4 w-4 animate-spin" />
                              <span>Uploading...</span>
                            </div>
                          )}
                        </div>

                        {/* Mode Selector */}
                        <div className="space-y-1.5">
                          <p className="text-[11px] font-bold text-muted">Reference Mode:</p>
                          <div className="grid grid-cols-2 gap-1.5 text-xs font-bold">
                            <button
                              type="button"
                              onClick={() => handleModeChange(item.id, 'use_photo')}
                              className={`py-1.5 px-2 rounded-lg border text-center transition ${
                                item.mode === 'use_photo'
                                  ? 'bg-primary text-white border-primary shadow-glow'
                                  : 'bg-surface text-muted border-border hover:text-text'
                              }`}
                            >
                              Use My Photo
                            </button>
                            <button
                              type="button"
                              onClick={() => handleModeChange(item.id, 'style_inspiration')}
                              className={`py-1.5 px-2 rounded-lg border text-center transition ${
                                item.mode === 'style_inspiration'
                                  ? 'bg-accent text-black border-accent font-extrabold shadow-accent-glow'
                                  : 'bg-surface text-muted border-border hover:text-text'
                              }`}
                            >
                              Style Insp.
                            </button>
                          </div>
                          <p className="text-[10px] text-muted leading-tight pt-0.5">
                            {item.mode === 'use_photo' 
                              ? 'Preserves the actual product/subject in design.'
                              : 'Matches look & mood, without copying logos/faces.'}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Free-text Context Box */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-muted uppercase tracking-wider pl-1">
                  Context / What should this post be about? (Optional)
                </label>
                <textarea
                  value={referenceContext}
                  onChange={(e) => setReferenceContext(e.target.value)}
                  placeholder="e.g. Highlight our new eco-friendly packaging, focus on sustainability benefits, showcase customer reviews, or keep it minimal and modern..."
                  rows={3}
                  className="w-full bg-surface-secondary border border-border rounded-xl px-4 py-3 text-sm text-text focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all placeholder:text-muted"
                />
              </div>
            </div>

            {/* 3. Target Social Platforms Selection */}
            <div className="bg-surface border border-border rounded-3xl p-6 sm:p-8 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border pb-4">
                <div>
                  <h2 className="text-xl font-extrabold text-text flex items-center gap-2">
                    <span>3. Target Social Platforms</span>
                  </h2>
                  <p className="text-xs text-muted">Check which platforms you want to generate copy and layout for (or select all).</p>
                </div>
                <button
                  type="button"
                  onClick={toggleAllPlatforms}
                  className="px-3.5 py-1.5 rounded-xl bg-surface-secondary hover:bg-surface-hover border border-border text-xs font-bold text-accent transition self-start sm:self-auto"
                >
                  {selectedPlatforms.length > 0 ? 'Deselect All' : 'Select All Platforms'}
                </button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                {[
                  {
                    id: 'linkedin',
                    label: 'LinkedIn',
                    sub: 'Posts & Insights',
                    icon: (
                      <svg className="w-6 h-6 shrink-0" viewBox="0 0 24 24" fill="#0A66C2">
                        <path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.28 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.75M6.88 8.56a1.68 1.68 0 0 0 1.68-1.68c0-.93-.75-1.69-1.68-1.69a1.69 1.69 0 0 0-1.69 1.69c0 .93.76 1.68 1.69 1.68m1.39 9.94v-8.37H5.5v8.37h2.77z" />
                      </svg>
                    )
                  },
                  {
                    id: 'facebook',
                    label: 'Facebook',
                    sub: 'Page Posts',
                    icon: (
                      <svg className="w-6 h-6 shrink-0" viewBox="0 0 24 24" fill="#1877F2">
                        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                      </svg>
                    )
                  },
                  {
                    id: 'instagram',
                    label: 'Instagram',
                    sub: 'Feed & Visuals',
                    icon: (
                      <svg className="w-6 h-6 shrink-0" viewBox="0 0 24 24">
                        <defs>
                          <radialGradient id="ig-grad-session" cx="20%" cy="100%" r="150%">
                            <stop offset="0%" stopColor="#fdf497" />
                            <stop offset="5%" stopColor="#fdf497" />
                            <stop offset="45%" stopColor="#fd5949" />
                            <stop offset="60%" stopColor="#d6249f" />
                            <stop offset="90%" stopColor="#285AEB" />
                          </radialGradient>
                        </defs>
                        <path fill="url(#ig-grad-session)" d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
                      </svg>
                    )
                  },
                  {
                    id: 'twitter',
                    label: 'X / Twitter',
                    sub: 'Fast Updates',
                    icon: (
                      <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 23.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                      </svg>
                    )
                  },
                  {
                    id: 'tiktok',
                    label: 'TikTok',
                    sub: 'Short Video Copy',
                    icon: (
                      <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64c.298-.002.595.042.88.13V9.4a6.33 6.33 0 0 0-1-.08A6.34 6.34 0 0 0 3 15.66a6.34 6.34 0 0 0 10.82 4.49 6.34 6.34 0 0 0 1.9-4.49V8.41a8.27 8.27 0 0 0 4.84 1.55v-3.27h-.97z" />
                      </svg>
                    )
                  },
                ].map(p => {
                  const isChecked = selectedPlatforms.includes(p.id)
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => togglePlatform(p.id)}
                      className={`p-4 rounded-2xl border text-left transition-all flex flex-col justify-between gap-3 ${
                        isChecked 
                          ? 'bg-accent/10 border-accent text-text ring-1 ring-accent/30' 
                          : 'bg-surface-secondary border-border text-muted hover:border-border-hover'
                      }`}
                    >
                      <div className="flex items-center justify-between w-full">
                        <div className="flex items-center justify-center h-7 w-7">{p.icon}</div>
                        <div className={`h-5 w-5 rounded-md flex items-center justify-center border text-xs font-bold transition ${
                          isChecked ? 'bg-accent text-black border-accent' : 'border-muted/40'
                        }`}>
                          {isChecked && '✓'}
                        </div>
                      </div>
                      <div>
                        <div className="font-extrabold text-sm text-text">{p.label}</div>
                        <div className="text-[10px] text-muted">{p.sub}</div>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Launch Generation Button & Credits Cost Indicator */}
            <div className="pt-2 space-y-2">
              <div className="flex items-center justify-between px-1 text-xs font-semibold">
                <span className="text-muted flex items-center gap-1.5">
                  <Zap className="h-3.5 w-3.5 text-accent" />
                  This uses 1 credit, <strong className="text-text">{creditsRemaining} left</strong>
                </span>
                {creditsRemaining <= 5 && creditsRemaining > 0 && (
                  <span className="text-amber-400 font-bold text-[11px]">Running low</span>
                )}
              </div>

              {creditsRemaining <= 0 ? (
                <div className="p-4 rounded-2xl bg-surface border border-accent/40 text-center space-y-2">
                  <p className="text-sm font-bold text-text">You&apos;ve used all your post credits for this billing period.</p>
                  <p className="text-xs text-muted">Upgrade your plan or add a credit pack to generate new posts.</p>
                  <button
                    type="button"
                    onClick={() => router.push('/settings?tab=billing')}
                    className="w-full bg-accent hover:bg-accent-hover text-black font-extrabold py-3 px-4 rounded-xl text-sm transition shadow-accent-glow"
                  >
                    Get More Post Credits
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={executeVariantGeneration}
                  disabled={isGenerating}
                  className="w-full bg-accent hover:bg-accent-hover text-black font-extrabold py-4 px-6 rounded-2xl text-base flex items-center justify-center gap-2 active:scale-[0.98] transition shadow-accent-glow disabled:opacity-50"
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="animate-spin h-5 w-5" />
                      <span>Generating Multiple Variants...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-5 w-5" />
                      <span>Generate Multi-Variant Posts (2 Designs)</span>
                      <ArrowRight className="h-4 w-4 ml-1" />
                    </>
                  )}
                </button>
              )}
            </div>
          </motion.div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* PHASE 2: PROGRESS BAR WITH SKELETON                                */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        {phase === 2 && (
          <div className="min-h-[70vh] flex flex-col items-center justify-center text-center space-y-8 px-4">
            <motion.div
              key={progress}
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="text-7xl sm:text-8xl font-black tabular-nums text-accent"
            >
              {progress}%
            </motion.div>

            <motion.p
              key={progressLabel}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-text font-bold text-lg max-w-md"
            >
              {progressLabel}
            </motion.p>

            <div className="w-full max-w-md h-2 bg-surface-secondary border border-border rounded-full overflow-hidden">
              <motion.div
                className="h-full rounded-full bg-accent"
                initial={{ width: '0%' }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.7, ease: 'easeInOut' }}
              />
            </div>

            <div className="flex gap-2">
              {PROGRESS_STAGES.map((s, i) => (
                <div
                  key={i}
                  className={`h-2 w-2 rounded-full transition-all duration-300 ${
                    progress >= s.pct ? 'bg-accent scale-125' : 'bg-surface-secondary border border-border'
                  }`}
                />
              ))}
            </div>

            <button
              type="button"
              onClick={() => {
                progressTimersRef.current.forEach(clearTimeout)
                setPhase(1)
                setIsGenerating(false)
                toast('Generation canceled', { icon: '↩️' })
              }}
              className="mt-4 px-4 py-2 rounded-xl text-xs font-semibold text-muted hover:text-text bg-surface-secondary/50 hover:bg-surface-secondary border border-border transition-all"
            >
              Cancel & Return to Inputs
            </button>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* PHASE 3: RESULTS UI (Variant Grid, Full Preview, Select, Regens)    */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        {phase === 3 && variantSessionData && (
          <motion.div 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            className="space-y-8 py-6"
          >
            {/* Header with Theme, Credits & Action Buttons */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-border pb-6">
              <div>
                {variantSessionData.generation_status === 'failed' || variantSessionData.variants?.every(v => v.source === 'fallback') ? (
                  <span className="text-amber-400 font-bold uppercase tracking-wider text-xs flex items-center gap-1.5">
                    <AlertTriangle className="h-4 w-4 text-amber-400" />
                    AI Generation Failed (Local Emergency Templates Shown)
                  </span>
                ) : (
                  <span className="text-success font-bold uppercase tracking-wider text-xs flex items-center gap-1.5">
                    <CheckCircle className="h-4 w-4 text-success" />
                    Variants Generated Successfully
                  </span>
                )}
                <h1 className="text-3xl font-black mt-1 tracking-tight text-text">
                  {variantSessionData.session_theme || "Today's Content"}
                </h1>
                <p className="text-muted text-sm font-medium mt-0.5">
                  Select your favorite variant below. Only the selected variant will be saved to your post history and calendar.
                </p>
              </div>

              <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 sm:gap-3 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => executeVariantGeneration()}
                  disabled={isGenerating}
                  className="flex-1 sm:flex-initial flex items-center justify-center gap-2 bg-surface-secondary border border-border hover:border-primary px-3 sm:px-4 py-2.5 rounded-xl font-bold text-xs text-text transition min-h-[40px]"
                >
                  <RotateCcw className="h-3.5 w-3.5 text-accent" />
                  <span>Regenerate All</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPhase(1)}
                  className="flex-1 sm:flex-initial flex items-center justify-center gap-2 bg-surface border border-border px-3 sm:px-4 py-2.5 rounded-xl hover:bg-surface-secondary font-bold text-xs text-text transition min-h-[40px]"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  <span>New Session</span>
                </button>
                <button
                  type="button"
                  onClick={() => router.push('/calendar')}
                  className="w-full sm:w-auto flex items-center justify-center gap-2 bg-accent hover:bg-accent-hover text-black px-4 py-2.5 rounded-xl font-extrabold text-xs transition shadow-accent-glow min-h-[40px]"
                >
                  <Calendar className="h-3.5 w-3.5" />
                  <span>View Calendar</span>
                </button>
              </div>
            </div>



            {/* ─── VARIANTS GRID WITH SKELETON LOADERS & SELECTION ─────────── */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Layers className="h-4 w-4 text-accent" />
                  <h2 className="text-lg font-black text-text">Image Variants ({variantSessionData.variants.length})</h2>
                </div>
                <span className="text-xs text-muted">
                  Click to select • Highlighting with <strong className="text-accent">lime border</strong>
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                {variantSessionData.variants.map((v) => {
                  const isSelected = v.id === selectedVariantId
                  const isRegenerating = regeneratingId === v.id

                  return (
                    <motion.div
                      key={v.id}
                      whileHover={{ scale: 1.01 }}
                      onClick={() => handleSelectVariant(v)}
                      className={`relative rounded-3xl p-4 transition-all duration-200 cursor-pointer flex flex-col justify-between border ${
                        isSelected 
                          ? 'border-accent bg-surface-secondary shadow-accent-glow ring-2 ring-accent' 
                          : 'border-border bg-surface hover:border-border-light'
                      }`}
                    >
                      {/* Active Selection Badge */}
                      {isSelected && (
                        <div className="absolute top-6 left-6 z-10 px-2.5 py-1 rounded-full bg-accent text-black font-black text-[11px] flex items-center gap-1 shadow-lg">
                          <Check className="h-3.5 w-3.5 stroke-[3]" />
                          Selected Variant
                        </div>
                      )}

                      {/* Image Preview & Full Screen Action */}
                      <div className="space-y-3">
                        <div className="relative rounded-2xl overflow-hidden aspect-square bg-surface-secondary border border-border group">
                          {isRegenerating ? (
                            <div className="w-full h-full flex flex-col items-center justify-center gap-2 bg-surface">
                              <Loader2 className="h-6 w-6 text-accent animate-spin" />
                              <span className="text-xs font-bold text-muted">Regenerating...</span>
                            </div>
                          ) : (
                            <>
                              <img 
                                src={resolveMediaUrl(v.image_url)} 
                                alt={v.variant_label} 
                                className="w-full h-full object-cover transition duration-300 group-hover:scale-105" 
                              />
                              {v.source === 'fallback' && (
                                <div 
                                  onClick={(e) => { e.stopPropagation(); handleRegenerateVariant(v, false) }}
                                  className="absolute bottom-2 left-2 right-2 z-10 p-2.5 rounded-xl bg-black/90 hover:bg-black/95 border border-amber-500/50 text-amber-300 font-bold text-[10px] shadow-xl transition cursor-pointer backdrop-blur-md space-y-1"
                                  title={v.error || "AI generation failed, tap to retry"}
                                >
                                  <div className="flex items-center gap-1.5 text-amber-400 font-extrabold">
                                    <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
                                    <span>AI Generation Failed (Tap to Retry)</span>
                                  </div>
                                  {v.error && (
                                    <p className="text-[10px] text-muted line-clamp-2 leading-tight font-mono">
                                      {v.error}
                                    </p>
                                  )}
                                </div>
                              )}
                              <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); setPreviewImageUrl(v.image_url) }}
                                  className="p-2 rounded-xl bg-surface border border-border text-text hover:bg-surface-secondary text-xs font-bold flex items-center gap-1 shadow-xl"
                                >
                                  <Eye className="h-3.5 w-3.5 text-primary-light" /> Preview
                                </button>
                              </div>
                            </>
                          )}
                        </div>

                        {/* Variant Info */}
                        <div>
                          <p className="font-extrabold text-sm text-text">{v.variant_label}</p>
                          <p className="text-[11px] text-muted line-clamp-1 mt-0.5">{v.style_direction}</p>
                        </div>
                      </div>

                      {/* Variant Actions */}
                      <div className="pt-4 border-t border-border mt-4 flex items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); handleRegenerateVariant(v, false) }}
                          disabled={isRegenerating}
                          className="px-2.5 py-1.5 rounded-lg bg-surface border border-border hover:border-primary text-[11px] font-bold text-muted hover:text-text flex items-center gap-1 transition"
                          title="Regenerate this specific variant"
                        >
                          <RotateCcw className="h-3 w-3" />
                          Regen
                        </button>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); handleRegenerateVariant(v, true) }}
                          disabled={isRegenerating}
                          className="px-2.5 py-1.5 rounded-lg bg-surface border border-border hover:border-accent text-[11px] font-bold text-accent flex items-center gap-1 transition"
                          title="Generate a new design inspired by this look"
                        >
                          <Sparkles className="h-3 w-3" />
                          More like this
                        </button>
                      </div>
                    </motion.div>
                  )
                })}
              </div>
            </div>

            {/* ─── SELECTED VARIANT DETAILS & ADJUSTABLE COPY ───────────────── */}
            <div className="bg-surface border border-border rounded-2xl sm:rounded-3xl p-4 sm:p-6 lg:p-8 space-y-5 sm:space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-4">
                <div>
                  <h3 className="text-lg sm:text-xl font-extrabold text-text flex items-center gap-2">
                    <CheckCircle className="h-5 w-5 text-accent shrink-0" />
                    <span>Selected Post Preview &amp; Copy</span>
                  </h3>
                  <p className="text-xs text-muted mt-0.5">
                    This variant is queued for your history and calendar. You can review or tweak the copy before saving.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleDownloadSelected}
                    className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-surface-secondary border border-border hover:bg-surface-hover font-bold text-xs text-text transition min-h-[40px]"
                  >
                    <Download className="h-4 w-4" />
                    Download PNG
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8 items-start">
                {/* Left: Graphic display */}
                <div className="space-y-3">
                  <div className="relative rounded-2xl overflow-hidden aspect-square border-2 border-accent bg-surface-secondary">
                    {selectedVariantImage ? (
                      <img 
                        src={resolveMediaUrl(selectedVariantImage)} 
                        alt="Selected Variant" 
                        className="w-full h-full object-cover" 
                      />
                    ) : (
                      <Skeleton width="100%" height="100%" rounded="2xl" />
                    )}
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted">
                    <span>All variants saved permanently to your library</span>
                    {variantSessionData.variants.find(v => v.id === selectedVariantId)?.source === 'fallback' ? (
                      <span className="text-amber-400 font-bold bg-amber-400/10 border border-amber-400/30 px-2 py-0.5 rounded-md flex items-center gap-1">
                        <AlertTriangle className="h-3.5 w-3.5" /> 0 Credits Deducted (Fallback)
                      </span>
                    ) : (
                      <span className="text-accent font-bold">1 Credit Deducted</span>
                    )}
                  </div>
                </div>

                {/* Right: Shared copy & schedule */}
                <div className="space-y-5">
                  {/* Multi-Platform Channel Tabs */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold uppercase tracking-wider text-muted">
                        Social Platform Copy
                      </label>
                      <span className="text-[11px] font-bold text-accent bg-accent/10 border border-accent/20 px-2.5 py-0.5 rounded-full">
                        Generated for all 5 channels
                      </span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-1.5 sm:gap-2 p-1.5 rounded-2xl bg-surface-secondary border border-border">
                      <button
                        type="button"
                        onClick={() => switchPlatformTab('instagram_post')}
                        className={`flex items-center justify-center gap-1.5 py-2 sm:py-2.5 px-2 sm:px-2.5 rounded-xl text-xs font-black transition-all min-h-[42px] ${
                          activePlatformTab === 'instagram_post'
                            ? 'bg-accent text-black shadow-md shadow-accent/20'
                            : 'text-muted hover:text-text hover:bg-surface/60'
                        }`}
                      >
                        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
                          <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
                          <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
                        </svg>
                        <span>Instagram</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => switchPlatformTab('linkedin_post')}
                        className={`flex items-center justify-center gap-1.5 py-2 sm:py-2.5 px-2 sm:px-2.5 rounded-xl text-xs font-black transition-all min-h-[42px] ${
                          activePlatformTab === 'linkedin_post'
                            ? 'bg-accent text-black shadow-md shadow-accent/20'
                            : 'text-muted hover:text-text hover:bg-surface/60'
                        }`}
                      >
                        <svg className="h-3.5 w-3.5 fill-current" viewBox="0 0 24 24">
                          <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.779-1.75-1.75s.784-1.75 1.75-1.75 1.75.779 1.75 1.75-.784 1.75-1.75 1.75zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z" />
                        </svg>
                        <span>LinkedIn</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => switchPlatformTab('facebook_post')}
                        className={`flex items-center justify-center gap-1.5 py-2 sm:py-2.5 px-2 sm:px-2.5 rounded-xl text-xs font-black transition-all min-h-[42px] ${
                          activePlatformTab === 'facebook_post'
                            ? 'bg-accent text-black shadow-md shadow-accent/20'
                            : 'text-muted hover:text-text hover:bg-surface/60'
                        }`}
                      >
                        <svg className="h-3.5 w-3.5 fill-current" viewBox="0 0 24 24">
                          <path d="M9 8h-3v4h3v12h5v-12h3.642l.358-4h-4v-1.667c0-.955.192-1.333 1.115-1.333h2.885v-5h-3.808c-3.596 0-5.192 1.583-5.192 4.615v3.385z" />
                        </svg>
                        <span>Facebook</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => switchPlatformTab('twitter_post')}
                        className={`flex items-center justify-center gap-1.5 py-2 sm:py-2.5 px-2 sm:px-2.5 rounded-xl text-xs font-black transition-all min-h-[42px] ${
                          activePlatformTab === 'twitter_post'
                            ? 'bg-accent text-black shadow-md shadow-accent/20'
                            : 'text-muted hover:text-text hover:bg-surface/60'
                        }`}
                      >
                        <svg className="h-3.5 w-3.5 fill-current" viewBox="0 0 24 24">
                          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                        </svg>
                        <span>Twitter / X</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => switchPlatformTab('tiktok')}
                        className={`flex items-center justify-center gap-1.5 py-2 sm:py-2.5 px-2 sm:px-2.5 rounded-xl text-xs font-black transition-all min-h-[42px] ${
                          activePlatformTab === 'tiktok'
                            ? 'bg-accent text-black shadow-md shadow-accent/20'
                            : 'text-muted hover:text-text hover:bg-surface/60'
                        }`}
                      >
                        <svg className="h-3.5 w-3.5 fill-current" viewBox="0 0 24 24">
                          <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64c.29 0 .58.04.85.12V9.41a6.33 6.33 0 0 0-.85-.06 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 8.78 5.86 6.34 6.34 0 0 0 3.9-5.86V9.17a8.28 8.28 0 0 0 4.84 1.55v-3.48a4.85 4.85 0 0 1-1.07-.55z"/>
                        </svg>
                        <span>TikTok</span>
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <label className="text-xs font-bold uppercase tracking-wider text-muted">
                          {activePlatformTab === 'instagram_post' && 'Instagram Caption'}
                          {activePlatformTab === 'linkedin_post' && 'LinkedIn Professional Post'}
                          {activePlatformTab === 'facebook_post' && 'Facebook Community Post'}
                          {activePlatformTab === 'twitter_post' && 'Twitter / X Tweet'}
                        </label>
                        {variantSessionData.caption_source === 'fallback' && (
                          <span className="text-[10px] bg-amber-500/15 text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
                            <AlertTriangle className="h-3 w-3" /> Fallback Copy
                          </span>
                        )}
                      </div>
                      <CopyButton text={captionText} label="Caption" />
                    </div>
                    <textarea
                      value={captionText}
                      onChange={(e) => handleCaptionChange(e.target.value)}
                      rows={5}
                      className="w-full bg-surface-secondary border border-border rounded-2xl p-4 text-sm leading-relaxed text-text focus:border-primary focus:ring-1 focus:ring-primary outline-none transition"
                    />
                  </div>

                  {/* Hashtags */}
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-muted">Hashtags</label>
                    <div className="flex flex-wrap gap-1.5">
                      {hashtagsList.map((tag, idx) => (
                        <span key={idx} className="px-3 py-1 bg-surface-secondary border border-border text-accent rounded-full text-xs font-bold">
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Schedule recommendation */}
                  <div className="p-4 rounded-2xl bg-surface-secondary border border-border flex items-center justify-between">
                    <div>
                      <p className="text-[11px] font-bold text-muted uppercase">
                        Recommended Posting Time ({activePlatformTab.replace('_post', '').toUpperCase()})
                      </p>
                      <p className="text-base font-extrabold text-text mt-0.5">
                        {platformCopies[activePlatformTab]?.best_time || variantSessionData.posting_time_suggestion || 'Today 7:00 PM'}
                      </p>
                    </div>
                    <span className="px-3 py-1 rounded-full bg-accent/15 text-accent border border-accent/30 text-xs font-bold">
                      Optimal Reach
                    </span>
                  </div>

                  <div className="pt-2 space-y-2">
                    {requireApproval ? (
                      <>
                        <div className="flex items-center gap-2 p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl text-xs text-blue-300">
                          <ShieldCheck className="h-4 w-4 shrink-0 text-blue-400" />
                          <span>Team approval is required for this brand. Submitting will notify your approver team before publishing.</span>
                        </div>
                        <button
                          type="button"
                          disabled={submittingApproval}
                          onClick={handleSubmitForApproval}
                          className="w-full py-3.5 px-4 bg-accent hover:bg-accent-hover text-black font-extrabold rounded-xl text-sm flex items-center justify-center gap-2 transition shadow-accent-glow disabled:opacity-50"
                        >
                          <ShieldCheck className="h-4 w-4" />
                          <span>{submittingApproval ? 'Submitting for Approval...' : 'Submit for Approval'}</span>
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={handleProceedToCalendar}
                        className="w-full py-3.5 px-4 bg-accent hover:bg-accent-hover text-black font-extrabold rounded-xl text-sm flex items-center justify-center gap-2 transition shadow-accent-glow"
                      >
                        <span>Proceed to Calendar &amp; Schedule</span>
                        <ArrowRight className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>

          </motion.div>
        )}

      </div>

      {/* ─── FULL-SIZE MODAL PREVIEW ───────────────────────────────────────── */}
      <AnimatePresence>
        {previewImageUrl && (
          <div 
            onClick={() => setPreviewImageUrl(null)}
            className="fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex items-center justify-center p-4 cursor-pointer"
          >
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              onClick={(e) => e.stopPropagation()}
              className="relative max-w-2xl w-full bg-surface border border-border rounded-3xl p-4 overflow-hidden shadow-2xl"
            >
              <div className="flex items-center justify-between pb-3 border-b border-border mb-3">
                <span className="text-sm font-extrabold text-text">Full-Size High-Resolution Preview</span>
                <button 
                  type="button"
                  onClick={() => setPreviewImageUrl(null)}
                  className="p-1 rounded-lg bg-surface-secondary border border-border hover:bg-surface-hover text-muted hover:text-text transition"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="relative rounded-2xl overflow-hidden aspect-square bg-black">
                <img src={resolveMediaUrl(previewImageUrl)} alt="Full Size Preview" className="w-full h-full object-contain" />
              </div>

              <div className="flex items-center justify-end gap-3 mt-4 pt-3 border-t border-border">
                <a
                  href={resolveMediaUrl(previewImageUrl)}
                  target="_blank"
                  rel="noreferrer"
                  className="px-4 py-2 rounded-xl bg-surface-secondary border border-border text-text font-bold text-xs flex items-center gap-1.5 hover:bg-surface-hover transition"
                >
                  Open in New Tab <ExternalLink className="h-3.5 w-3.5" />
                </a>
                <button
                  type="button"
                  onClick={() => setPreviewImageUrl(null)}
                  className="px-4 py-2 rounded-xl bg-accent text-black font-extrabold text-xs hover:bg-accent-hover transition shadow-accent-glow"
                >
                  Done
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}
