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
  Lightbulb, 
  ArrowRight, 
  RefreshCw, 
  Plus, 
  Zap, 
  CheckCircle, 
  Megaphone, 
  ExternalLink 
} from 'lucide-react'
import api from '@/lib/api'
import { SessionResult } from '@/lib/types'
import { toast } from 'react-hot-toast'
import CopyButton from '@/components/ui/CopyButton'
import Skeleton from '@/components/ui/Skeleton'

// Progress stages
const PROGRESS_STAGES = [
  { pct: 0,   label: 'Starting...' },
  { pct: 15,  label: 'Analyzing your brand...' },
  { pct: 30,  label: 'Writing captions...' },
  { pct: 50,  label: 'Creating image prompt...' },
  { pct: 65,  label: 'Generating images... (this takes ~15 seconds)' },
  { pct: 85,  label: 'Adding brand elements...' },
  { pct: 95,  label: 'Almost done...' },
  { pct: 100, label: 'Your content is ready! 🎉' },
]

// Download a single image
async function downloadImage(imageUrl: string, platform: string) {
  try {
    const response = await fetch(imageUrl)
    const blob = await response.blob()
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `brandflux_${platform}_${Date.now()}.png`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  } catch (error) {
    console.error('Download failed:', error)
    toast.error('Download failed. Try right-clicking the image.')
  }
}

export default function SessionPage() {
  const router = useRouter()
  const [phase, setPhase] = useState(1) // 1: Form, 2: Generating, 3: Results
  const [businessName, setBusinessName] = useState('your business')
  
  // Selection states
  const [specialMode, setSpecialMode] = useState<'normal' | 'special' | null>(null)
  const [specialDetails, setSpecialDetails] = useState('')
  
  // Generation results states
  const [results, setResults] = useState<SessionResult | null>(null)
  const [activeTab, setActiveTab] = useState('instagram_post')
  const [isGenerating, setIsGenerating] = useState(false)

  // Progress bar state
  const [progress, setProgress] = useState(0)
  const [progressLabel, setProgressLabel] = useState('Starting...')
  const progressTimersRef = useRef<ReturnType<typeof setTimeout>[]>([])

  // AI Graphics States
  const [, setGeneratedImages] = useState<Record<string, string> | null>(null)
  const [generatingImages, setGeneratingImages] = useState(false)

  // Download All state
  const [downloadingAll, setDownloadingAll] = useState(false)
  const [downloadedAll, setDownloadedAll] = useState(false)

  const handleGenerateGraphics = async () => {
    setGeneratingImages(true)
    toast.loading('Crafting branded post graphics...', { id: 'graphics' })
    try {
      const res = await api.post('/content/generate-images', {
        prompt: `${results?.session_theme || 'professional branding'} graphic layout`,
        post_text: results?.instagram_post?.caption?.substring(0, 80) || 'Exciting update from our brand!',
        cta: results?.instagram_post?.call_to_action || 'Contact us today'
      })
      
      if (res.data && res.data.images) {
        setGeneratedImages(res.data.images)
        setResults(prev => {
          if (!prev) return prev
          return {
            ...prev,
            instagram_post: prev.instagram_post ? { ...prev.instagram_post, image_url: res.data.images.instagram_post || prev.instagram_post.image_url } : undefined,
            instagram_story: prev.instagram_story ? { ...prev.instagram_story, image_url: res.data.images.instagram_story || prev.instagram_story.image_url } : undefined,
            linkedin_post: prev.linkedin_post ? { ...prev.linkedin_post, image_url: res.data.images.linkedin_post || prev.linkedin_post.image_url } : undefined,
            facebook_post: prev.facebook_post ? { ...prev.facebook_post, image_url: res.data.images.facebook_post || prev.facebook_post.image_url } : undefined,
          }
        })
        toast.success('Graphics ready!', { id: 'graphics' })
      }
    } catch (err: any) {
      console.error('Graphics generation failed:', err)
      toast.error('Failed to generate branded graphics.', { id: 'graphics' })
    } finally {
      setGeneratingImages(false)
    }
  }

  // Download All Handler
  const handleDownloadAll = async () => {
    if (!results) return
    const imagesToDownload: { url: string; platform: string }[] = []
    if (results.instagram_post?.image_url) imagesToDownload.push({ url: results.instagram_post.image_url, platform: 'instagram_post' })
    if (results.instagram_story?.image_url) imagesToDownload.push({ url: results.instagram_story.image_url, platform: 'instagram_story' })
    if (results.linkedin_post?.image_url) imagesToDownload.push({ url: results.linkedin_post.image_url, platform: 'linkedin' })
    if (results.facebook_post?.image_url) imagesToDownload.push({ url: results.facebook_post.image_url, platform: 'facebook' })

    if (imagesToDownload.length === 0) {
      toast.error('No images available to download yet.')
      return
    }

    setDownloadingAll(true)
    for (const item of imagesToDownload) {
      await downloadImage(item.url, item.platform)
      await new Promise(r => setTimeout(r, 400))
    }
    setDownloadingAll(false)
    setDownloadedAll(true)
    toast.success(`Downloaded all ${imagesToDownload.length} images! 🎉`)
    setTimeout(() => setDownloadedAll(false), 3000)
  }

  // Clear timers on unmount
  useEffect(() => {
    return () => {
      progressTimersRef.current.forEach(clearTimeout)
    }
  }, [])

  // Start progress bar animation
  const startProgressBar = () => {
    setProgress(0)
    setProgressLabel('Starting...')
    progressTimersRef.current.forEach(clearTimeout)
    progressTimersRef.current = []

    const schedule = [
      { delay: 400,   pct: 15, label: 'Analyzing your brand...' },
      { delay: 1800,  pct: 30, label: 'Writing captions...' },
      { delay: 3500,  pct: 50, label: 'Creating image prompt...' },
      { delay: 5500,  pct: 65, label: 'Generating images... (~15s)' },
      { delay: 9000,  pct: 85, label: 'Adding brand elements...' },
      { delay: 12000, pct: 95, label: 'Almost done...' },
    ]

    schedule.forEach(({ delay, pct, label }) => {
      const timer = setTimeout(() => {
        setProgress(pct)
        setProgressLabel(label)
      }, delay)
      progressTimersRef.current.push(timer)
    })
  }

  // Complete progress bar animation
  const completeProgressBar = () => {
    progressTimersRef.current.forEach(clearTimeout)
    setProgress(100)
    setProgressLabel('Your content is ready! 🎉')
  }

  // Load business name on mount
  useEffect(() => {
    const fetchBrand = async () => {
      try {
        const res = await api.get('/brand/profile')
        if (res.data?.business_name) {
          setBusinessName(res.data.business_name)
        }
      } catch (e) {
        console.error('Failed to load brand profile', e)
      }
    }
    fetchBrand()
  }, [])

  // Dynamic greeting based on current time
  const getGreeting = () => {
    const hour = new Date().getHours()
    if (hour < 12) return { text: 'Good morning', icon: '☀️' }
    if (hour < 18) return { text: 'Good afternoon', icon: '🌤️' }
    return { text: 'Good evening', icon: '🌙' }
  }

  const greeting = getGreeting()

  // Generate Content API caller
  const executeGeneration = async (answersPayload: { answer_1: string; answer_2: string; answer_3: string }) => {
    setIsGenerating(true)
    setPhase(2)
    startProgressBar()

    try {
      const res = await api.post('/sessions/generate-all', answersPayload)
      if (res.data) {
        completeProgressBar()
        setTimeout(() => {
          setResults(res.data)
          setPhase(3)
          toast.success('Your tailored content is ready!')
        }, 600)
      }
    } catch (err: any) {
      console.error('Generation failed:', err)
      progressTimersRef.current.forEach(clearTimeout)
      toast.error('Failed to generate content. Please try again.')
      setPhase(1)
    } finally {
      setIsGenerating(false)
    }
  }

  // Handle Option B: Normal Day
  const selectNormalDay = () => {
    setSpecialMode('normal')
    executeGeneration({
      answer_1: 'Normal day, use standard brand posting strategy and current content pillars',
      answer_2: 'All supported platforms (Instagram, LinkedIn, Facebook)',
      answer_3: 'Standard high-value educational or engaging brand post'
    })
  }

  // Handle Option A: Special Day toggle
  const selectSpecialDay = () => {
    setSpecialMode('special')
  }

  // Submit Special Day details
  const submitSpecialHighlight = () => {
    if (!specialDetails.trim()) {
      toast.error('Please describe what is special today!')
      return
    }

    executeGeneration({
      answer_1: `Special feature today: ${specialDetails.trim()}`,
      answer_2: 'All active channels',
      answer_3: specialDetails.trim()
    })
  }

  return (
    <div className="min-h-screen bg-bg text-text pb-20">
      <div className="max-w-5xl mx-auto px-4 md:px-6">

        {/* PHASE 1: DAILY CHECK-IN FORM */}
        {phase === 1 && (
          <motion.div 
            initial={{ opacity: 0, y: 15 }} 
            animate={{ opacity: 1, y: 0 }} 
            className="space-y-8 py-6"
          >
            {/* Header Greeting */}
            <div className="text-center space-y-2">
              <span className="text-4xl inline-block">{greeting.icon}</span>
              <h1 className="text-3xl md:text-5xl font-extrabold tracking-tight mt-1 text-text">
                {greeting.text}! Ready to create content for <span className="text-accent">{businessName}</span>?
              </h1>
              <p className="text-muted text-base md:text-lg">
                Let&apos;s decide today&apos;s direction in just one quick click.
              </p>
            </div>

            {/* Smart Check-in Form Card */}
            <div className="bg-surface border border-border rounded-3xl p-8 md:p-10 shadow-sm relative overflow-hidden">
              <div className="space-y-8">
                
                {/* One Question */}
                <div className="space-y-2 text-center">
                  <span className="px-3 py-1 rounded-full bg-surface-secondary border border-border text-xs font-bold text-accent uppercase tracking-wider">
                    Smart Check-in
                  </span>
                  <h2 className="text-2xl md:text-3xl font-extrabold text-text mt-2">
                    Anything special today?
                  </h2>
                </div>

                {/* Option Toggle Buttons */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  
                  {/* Option A: Special Highlight */}
                  <button
                    onClick={selectSpecialDay}
                    className={`p-6 rounded-2xl border text-left transition-all duration-200 flex flex-col justify-between h-44 group ${
                      specialMode === 'special' 
                        ? 'border-accent bg-surface-secondary text-text ring-1 ring-accent' 
                        : 'bg-surface-secondary/40 border-border hover:border-border-light'
                    }`}
                  >
                    <div className="h-10 w-10 rounded-xl bg-surface border border-border flex items-center justify-center text-accent">
                      <Megaphone className="h-5 w-5" />
                    </div>
                    <div className="space-y-1">
                      <p className="font-extrabold text-lg text-text">Yes, something special</p>
                      <p className="text-xs text-muted font-medium">Holiday sale, product launch, milestone, discount...</p>
                    </div>
                  </button>

                  {/* Option B: Normal Day */}
                  <button
                    onClick={selectNormalDay}
                    className={`p-6 rounded-2xl border text-left transition-all duration-200 flex flex-col justify-between h-44 group ${
                      specialMode === 'normal' 
                        ? 'border-accent bg-surface-secondary text-text ring-1 ring-accent' 
                        : 'bg-surface-secondary/40 border-border hover:border-border-light'
                    }`}
                  >
                    <div className="h-10 w-10 rounded-xl bg-surface border border-border flex items-center justify-center text-accent">
                      <Zap className="h-5 w-5" />
                    </div>
                    <div className="space-y-1">
                      <p className="font-extrabold text-lg text-text">Normal day, let AI decide</p>
                      <p className="text-xs text-muted font-medium">Let AI analyze brand strategy for the best post.</p>
                    </div>
                  </button>
                </div>

                {/* Special Highlight Details Input Field */}
                <AnimatePresence>
                  {specialMode === 'special' && (
                    <motion.div 
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="space-y-4 pt-6 border-t border-border overflow-hidden"
                    >
                      <label className="text-xs font-bold text-muted uppercase tracking-wider pl-1">
                        Tell us what&apos;s special today:
                      </label>
                      
                      <textarea
                        value={specialDetails}
                        onChange={e => setSpecialDetails(e.target.value)}
                        placeholder="e.g. Eid sale, new product launch, customer milestone, weekend discount, or we mentioned a special offer..."
                        rows={3}
                        className="w-full bg-surface-secondary border border-border rounded-xl px-5 py-4 text-sm text-text focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all placeholder:text-muted leading-relaxed"
                      />

                      <button
                        onClick={submitSpecialHighlight}
                        disabled={isGenerating}
                        className="w-full bg-accent hover:bg-accent-hover text-black font-extrabold py-4 rounded-xl text-base flex items-center justify-center gap-2 active:scale-[0.98] transition shadow-accent-glow disabled:opacity-50"
                      >
                        {isGenerating ? (
                          <>
                            <Loader2 className="animate-spin h-5 w-5" />
                            <span>Generating...</span>
                          </>
                        ) : (
                          <>
                            <span>Generate Content</span>
                            <ArrowRight className="h-4 w-4" />
                          </>
                        )}
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>

              </div>
            </div>
          </motion.div>
        )}

        {/* PHASE 2: AI GENERATING PROGRESS BAR */}
        {phase === 2 && (
          <div className="min-h-[70vh] flex flex-col items-center justify-center text-center space-y-8 px-4">
            {/* Big percentage number */}
            <motion.div
              key={progress}
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="text-7xl sm:text-8xl font-black tabular-nums text-accent"
            >
              {progress}%
            </motion.div>

            {/* Label */}
            <motion.p
              key={progressLabel}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-text font-bold text-lg max-w-sm"
            >
              {progressLabel}
            </motion.p>

            {/* Smooth progress bar */}
            <div className="w-full max-w-md h-2 bg-surface-secondary border border-border rounded-full overflow-hidden">
              <motion.div
                className="h-full rounded-full bg-accent"
                initial={{ width: '0%' }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.7, ease: 'easeInOut' }}
              />
            </div>

            {/* Stage dots */}
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
          </div>
        )}

        {/* PHASE 3: RESULTS SCREEN */}
        {phase === 3 && results && (
          <motion.div 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            className="space-y-6 py-6"
          >
            {/* Header section */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-border pb-6">
              <div>
                <span className="text-success font-bold uppercase tracking-wider text-xs flex items-center gap-1.5">
                  <CheckCircle className="h-4 w-4 text-success" />
                  Campaign Crafted Successfully
                </span>
                <h1 className="text-3xl font-extrabold mt-1 tracking-tight text-text">{results.session_theme || 'Today\'s Content'}</h1>
                <p className="text-muted text-sm font-medium mt-0.5">Your customized copy and social strategies are ready</p>
              </div>
              <div className="flex gap-3">
                <button 
                  onClick={() => setPhase(1)}
                  className="flex items-center gap-2 bg-surface-secondary border border-border px-4 py-2.5 rounded-xl hover:bg-surface-hover font-bold text-xs text-text transition"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  New Session
                </button>
                <button
                  onClick={() => router.push('/dashboard')}
                  className="flex items-center gap-2 bg-accent hover:bg-accent-hover text-black px-4 py-2.5 rounded-xl font-extrabold text-xs transition shadow-accent-glow"
                >
                  Dashboard
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {/* Graphics Studio Top Banner */}
            <div className="bg-surface border border-border rounded-2xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-6 shadow-sm">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-text font-bold text-sm">
                  <span className="text-accent">🎨</span>
                  <span>Branded Visual Graphics Studio</span>
                </div>
                <p className="text-xs text-muted max-w-xl leading-relaxed">
                  Generate matching, visual post templates with your brand logo, primary colors, and custom typography overlayed automatically.
                </p>
              </div>
              <button
                onClick={handleGenerateGraphics}
                disabled={generatingImages}
                className="px-5 py-3 rounded-xl bg-primary hover:bg-primary-hover text-white font-bold text-xs transition disabled:opacity-50 flex items-center gap-2 self-start md:self-auto active:scale-98"
              >
                {generatingImages ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Crafting Graphics...</span>
                  </>
                ) : (
                  <span>Generate Branded Graphics</span>
                )}
              </button>
            </div>

            {/* Platform Tabs ordered (Instagram -> LinkedIn -> Facebook -> Story) */}
            <div className="bg-surface border border-border rounded-3xl overflow-hidden shadow-sm">
              <div className="flex border-b border-border overflow-x-auto scrollbar-hide">
                {[
                  { id: 'instagram_post', label: 'Instagram Post', icon: Globe },
                  { id: 'linkedin_post', label: 'LinkedIn', icon: Users },
                  { id: 'facebook_post', label: 'Facebook', icon: Layout },
                  { id: 'instagram_story', label: 'Instagram Story', icon: Share2 },
                ].map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center gap-2 px-6 py-4 font-bold whitespace-nowrap transition-all border-b-2 text-xs md:text-sm ${
                      activeTab === tab.id 
                        ? 'border-accent text-accent bg-surface-secondary' 
                        : 'border-transparent text-muted hover:text-text'
                    }`}
                  >
                    <tab.icon className="h-4 w-4" />
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Tab Contents */}
              <div className="p-6 md:p-8">
                
                {/* 1. Instagram Post Tab */}
                {activeTab === 'instagram_post' && results.instagram_post && (
                  <div className="grid md:grid-cols-2 gap-8">
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <h3 className="text-xs font-bold uppercase tracking-wider text-muted">Post Caption</h3>
                        <CopyButton text={results.instagram_post!.caption} label="Caption" />
                      </div>
                      <div className="bg-surface-secondary rounded-2xl p-5 text-sm leading-relaxed text-text border border-border whitespace-pre-wrap">
                        {results.instagram_post.caption}
                      </div>
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {results.instagram_post.hashtags.map(tag => (
                          <span key={tag} className="px-3 py-1 bg-surface-secondary border border-border text-accent rounded-full text-xs font-bold">
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-6">
                      <div className="bg-surface-secondary border border-border p-5 rounded-2xl space-y-2">
                        <div className="flex items-center gap-2 text-accent font-bold text-xs">
                          <Plus className="h-3.5 w-3.5" />
                          Optimal Post Schedule
                        </div>
                        <p className="text-2xl font-extrabold text-text">{results.instagram_post.best_time}</p>
                        <p className="text-muted text-xs">On {results.instagram_post.best_day}</p>
                      </div>
                      <div className="bg-surface-secondary border border-border p-5 rounded-2xl space-y-1">
                        <p className="text-xs font-bold uppercase tracking-wider text-muted">Primary Call to Action</p>
                        <p className="text-base font-bold text-text">{results.instagram_post.call_to_action}</p>
                      </div>

                      {generatingImages && (
                        <div className="bg-surface-secondary border border-border p-5 rounded-2xl space-y-3">
                          <p className="text-xs font-bold uppercase tracking-wider text-muted">Post Graphic</p>
                          <Skeleton width="100%" height="240px" rounded="xl" />
                        </div>
                      )}

                      {results.instagram_post?.image_url && (
                        <div className="bg-surface-secondary border border-border p-5 rounded-2xl space-y-3">
                          <p className="text-xs font-bold uppercase tracking-wider text-muted">Instagram Post Graphic</p>
                          <div className="relative rounded-xl overflow-hidden border border-border group">
                            <img src={results.instagram_post.image_url} alt="Instagram Graphic" className="w-full object-cover aspect-square" />
                            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                              <a href={results.instagram_post.image_url} target="_blank" rel="noreferrer" className="bg-surface border border-border text-text p-2.5 rounded-xl hover:bg-surface-secondary transition font-bold text-xs flex items-center gap-1.5 shadow-xl">
                                View <ExternalLink className="h-3.5 w-3.5" />
                              </a>
                              <button onClick={() => downloadImage(results.instagram_post!.image_url!, 'instagram_post')} className="bg-accent hover:bg-accent-hover text-black p-2.5 rounded-xl transition flex items-center gap-1.5 shadow-xl text-xs font-extrabold">
                                <Download className="h-3.5 w-3.5" /> Download
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* 2. LinkedIn Tab */}
                {activeTab === 'linkedin_post' && results.linkedin_post && (
                  <div className="grid md:grid-cols-2 gap-8">
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <h3 className="text-xs font-bold uppercase tracking-wider text-muted">LinkedIn Content</h3>
                        <CopyButton text={results.linkedin_post!.caption} label="Post" />
                      </div>
                      <div className="bg-surface-secondary rounded-2xl p-5 text-sm leading-relaxed text-text border border-border whitespace-pre-wrap">
                        {results.linkedin_post.caption}
                      </div>
                    </div>
                    <div className="space-y-6">
                      <div className="bg-surface-secondary border border-border p-5 rounded-2xl space-y-2">
                        <div className="flex items-center gap-2 text-accent font-bold text-xs">
                          <Plus className="h-3.5 w-3.5" />
                          Optimal Schedule
                        </div>
                        <p className="text-2xl font-extrabold text-text">{results.linkedin_post.best_day}</p>
                        <p className="text-muted text-xs">Peak Professional Hours</p>
                      </div>

                      {generatingImages && (
                        <div className="bg-surface-secondary border border-border p-5 rounded-2xl space-y-3">
                          <p className="text-xs font-bold uppercase tracking-wider text-muted">LinkedIn Graphic Card</p>
                          <Skeleton width="100%" height="180px" rounded="xl" />
                        </div>
                      )}

                      {results.linkedin_post?.image_url && (
                        <div className="bg-surface-secondary border border-border p-5 rounded-2xl space-y-3">
                          <p className="text-xs font-bold uppercase tracking-wider text-muted">LinkedIn Graphic Card</p>
                          <div className="relative rounded-xl overflow-hidden border border-border group">
                            <img src={results.linkedin_post.image_url} alt="LinkedIn Graphic" className="w-full object-cover aspect-[1200/627]" />
                            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                              <a href={results.linkedin_post.image_url} target="_blank" rel="noreferrer" className="bg-surface border border-border text-text p-2.5 rounded-xl hover:bg-surface-secondary transition font-bold text-xs flex items-center gap-1.5 shadow-xl">
                                View <ExternalLink className="h-3.5 w-3.5" />
                              </a>
                              <button onClick={() => downloadImage(results.linkedin_post!.image_url!, 'linkedin')} className="bg-accent hover:bg-accent-hover text-black p-2.5 rounded-xl transition flex items-center gap-1.5 shadow-xl text-xs font-extrabold">
                                <Download className="h-3.5 w-3.5" /> Download
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* 3. Facebook Tab */}
                {activeTab === 'facebook_post' && results.facebook_post && (
                  <div className="space-y-6 max-w-2xl">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-muted">Facebook Caption</h3>
                      <CopyButton text={results.facebook_post!.caption} label="Caption" />
                    </div>
                    <div className="bg-surface-secondary rounded-2xl p-5 text-sm leading-relaxed text-text border border-border whitespace-pre-wrap">
                      {results.facebook_post.caption}
                    </div>

                    {generatingImages && (
                      <div className="bg-surface-secondary border border-border p-5 rounded-2xl space-y-3 max-w-xl">
                        <p className="text-xs font-bold uppercase tracking-wider text-muted">Facebook Graphic Card</p>
                        <Skeleton width="100%" height="180px" rounded="xl" />
                      </div>
                    )}

                    {results.facebook_post?.image_url && (
                      <div className="bg-surface-secondary border border-border p-5 rounded-2xl space-y-3 max-w-xl">
                        <p className="text-xs font-bold uppercase tracking-wider text-muted">Facebook Graphic Card</p>
                        <div className="relative rounded-xl overflow-hidden border border-border group">
                          <img src={results.facebook_post.image_url} alt="Facebook Graphic" className="w-full object-cover aspect-[1200/630]" />
                          <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                            <a href={results.facebook_post.image_url} target="_blank" rel="noreferrer" className="bg-surface border border-border text-text p-2.5 rounded-xl hover:bg-surface-secondary transition font-bold text-xs flex items-center gap-1.5 shadow-xl">
                              View <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                            <button onClick={() => downloadImage(results.facebook_post!.image_url!, 'facebook')} className="bg-accent hover:bg-accent-hover text-black p-2.5 rounded-xl transition flex items-center gap-1.5 shadow-xl text-xs font-extrabold">
                              <Download className="h-3.5 w-3.5" /> Download
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* 4. Instagram Story Tab */}
                {activeTab === 'instagram_story' && results.instagram_story && (
                  <div className="grid md:grid-cols-2 gap-8">
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <h3 className="text-xs font-bold uppercase tracking-wider text-muted">Story Frame Text</h3>
                        <CopyButton text={results.instagram_story!.text} label="Story Text" />
                      </div>
                      <div className="bg-surface-secondary rounded-2xl p-6 text-lg font-bold text-center text-text border border-border italic">
                        &ldquo;{results.instagram_story.text}&rdquo;
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="bg-surface-secondary border border-border p-5 rounded-2xl space-y-1">
                        <p className="text-xs font-bold uppercase tracking-wider text-muted">Poll Suggestion</p>
                        <p className="font-semibold text-text text-sm leading-relaxed">{results.instagram_story.poll_question || "Ask what they think!"}</p>
                      </div>
                      <div className="bg-surface-secondary border border-border p-5 rounded-2xl space-y-1">
                        <p className="text-xs font-bold uppercase tracking-wider text-muted">CTA Prompt</p>
                        <p className="font-semibold text-text text-sm leading-relaxed">{results.instagram_story.cta || "DM to get access!"}</p>
                      </div>

                      {generatingImages && (
                        <div className="col-span-1 sm:col-span-2 bg-surface-secondary border border-border p-5 rounded-2xl space-y-3">
                          <p className="text-xs font-bold uppercase tracking-wider text-muted">Instagram Story Graphic</p>
                          <Skeleton width="220px" height="390px" rounded="xl" className="mx-auto" />
                        </div>
                      )}

                      {results.instagram_story?.image_url && (
                        <div className="col-span-1 sm:col-span-2 bg-surface-secondary border border-border p-5 rounded-2xl space-y-3">
                          <p className="text-xs font-bold uppercase tracking-wider text-muted">Instagram Story Graphic</p>
                          <div className="relative rounded-xl overflow-hidden border border-border group max-w-xs mx-auto">
                            <img src={results.instagram_story.image_url} alt="Instagram Story Graphic" className="w-full object-cover aspect-[1080/1920]" />
                            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                              <a href={results.instagram_story.image_url} target="_blank" rel="noreferrer" className="bg-surface border border-border text-text p-2.5 rounded-xl hover:bg-surface-secondary transition font-bold text-xs flex items-center gap-1.5 shadow-xl">
                                View <ExternalLink className="h-3.5 w-3.5" />
                              </a>
                              <button onClick={() => downloadImage(results.instagram_story!.image_url!, 'instagram_story')} className="bg-accent hover:bg-accent-hover text-black p-2.5 rounded-xl transition flex items-center gap-1.5 shadow-xl text-xs font-extrabold">
                                <Download className="h-3.5 w-3.5" /> Download
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

              </div>
            </div>

            {/* Download All button */}
            {(results.instagram_post?.image_url || results.instagram_story?.image_url || results.linkedin_post?.image_url || results.facebook_post?.image_url) && (
              <div className="flex justify-center">
                <button
                  onClick={handleDownloadAll}
                  disabled={downloadingAll}
                  className={`flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-xs transition-all active:scale-[0.98] ${
                    downloadedAll
                      ? 'bg-success text-white'
                      : 'bg-surface-secondary border border-border text-text hover:bg-surface-hover'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  {downloadingAll ? (
                    <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Downloading...</>
                  ) : downloadedAll ? (
                    <><CheckCircle className="h-3.5 w-3.5" /> ✓ Downloaded!</>
                  ) : (
                    <><Download className="h-3.5 w-3.5" /> Download All Images</>
                  )}
                </button>
              </div>
            )}

            {/* GUIDANCE & INSPIRATION CARDS */}
            <div className="grid md:grid-cols-3 gap-4">
              <div className="bg-surface border border-border rounded-2xl p-6 space-y-3">
                <Lightbulb className="h-6 w-6 text-accent" />
                <h4 className="font-bold text-base text-text">Tip of the Day</h4>
                <p className="text-muted text-xs leading-relaxed">{results.guidance?.tip_of_day || 'Keep captions focused on a single customer action to elevate conversion ratios.'}</p>
              </div>
              <div className="bg-surface border border-border rounded-2xl p-6 space-y-3">
                <Zap className="h-6 w-6 text-accent" />
                <h4 className="font-bold text-base text-text">This Week Focus</h4>
                <p className="text-muted text-xs leading-relaxed">{results.guidance?.this_week_suggestion || 'Post visual guides showing behind-the-scenes milestones to build authority.'}</p>
              </div>
              <div className="bg-surface border border-border rounded-2xl p-6 space-y-3">
                <Globe className="h-6 w-6 text-accent" />
                <h4 className="font-bold text-base text-text">Top Content Type</h4>
                <p className="text-muted text-xs leading-relaxed">{results.guidance?.best_performing_type || 'User case stories or discount offers generate 2.5x more active comments.'}</p>
              </div>
            </div>

          </motion.div>
        )}

      </div>
    </div>
  )
}
