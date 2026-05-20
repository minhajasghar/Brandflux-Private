'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Loader2, 
  Sparkles, 
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
import api, { generateContent } from '@/lib/api'
import { SessionResult } from '@/lib/types'
import { toast } from 'react-hot-toast'
import CopyButton from '@/components/ui/CopyButton'
import Skeleton from '@/components/ui/Skeleton'

// ── Issue 5: Progress stages ──
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

// ── Issue 6: Download a single image ──
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
  const [phase, setPhase] = useState(1) // 1: Daily Check-in Form, 2: AI Generating, 3: Generation Results
  const [businessName, setBusinessName] = useState('your business')
  
  // Selection states
  const [specialMode, setSpecialMode] = useState<'normal' | 'special' | null>(null)
  const [specialDetails, setSpecialDetails] = useState('')
  
  // Generation results states
  const [results, setResults] = useState<SessionResult | null>(null)
  const [activeTab, setActiveTab] = useState('instagram_post')
  const [copiedField, setCopiedField] = useState<string | null>(null)
  const [sessionId, setSessionId] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)

  // Issue 5: Progress bar state
  const [progress, setProgress] = useState(0)
  const [progressLabel, setProgressLabel] = useState('Starting...')
  const progressTimersRef = useRef<ReturnType<typeof setTimeout>[]>([])

  // AI Graphics States
  const [generatedImages, setGeneratedImages] = useState<Record<string, string> | null>(null)
  const [generatingImages, setGeneratingImages] = useState(false)

  // Issue 6: Download All state
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
        toast.success('Graphics crafted successfully for all platforms!', { id: 'graphics' })
      }
    } catch (err) {
      console.error('Graphics generation failed:', err)
      toast.error('Failed to craft graphics.', { id: 'graphics' })
    } finally {
      setGeneratingImages(false)
    }
  }

  // 1. Fetch brand profile name & initialize today's session in database
  useEffect(() => {
    const fetchSessionAndBrand = async () => {
      try {
        // Fetch brand details
        const brandRes = await api.get('/brand/profile')
        if (brandRes.data && brandRes.data.business_name) {
          setBusinessName(brandRes.data.business_name)
        }

        // Retrieve or auto-create today's session record to get a valid database session ID
        const sessionRes = await api.get('/sessions/today')
        if (sessionRes.data && sessionRes.data.id) {
          setSessionId(sessionRes.data.id)
        }
      } catch (err) {
        console.error('Failed to initialize session details:', err)
        toast.error('Failed to start daily content session.')
      }
    }
    fetchSessionAndBrand()
  }, [])

  // Helper for greeting message by time of day
  const getGreetingData = () => {
    const hour = new Date().getHours()
    if (hour < 12) {
      return { text: 'Good morning', icon: '☀️' }
    }
    if (hour < 17) {
      return { text: 'Good afternoon', icon: '🌤️' }
    }
    return { text: 'Good evening', icon: '🌙' }
  }

  // Detect which platform user mentioned in their message
  const detectPlatformFromMessage = (msg: string): string => {
    const lower = msg.toLowerCase()
    if (lower.includes('linkedin')) return 'linkedin_post'
    if (lower.includes('instagram') || lower.includes('insta') || lower.includes('ig')) return 'instagram_post'
    if (lower.includes('facebook') || lower.includes('fb')) return 'facebook_post'
    if (lower.includes('story') || lower.includes('stories')) return 'instagram_story'
    return 'instagram_post' // Default
  }

  // 2. Launch content generation call
  const handleGenerate = async (mode: 'normal' | 'special', details: string) => {
    setIsGenerating(true)
    setPhase(2)
    setProgress(0)
    setProgressLabel('Starting...')
    setDownloadedAll(false)

    // Clear any old timers
    progressTimersRef.current.forEach(clearTimeout)
    progressTimersRef.current = []

    // Issue 5: Schedule progress stages with delays
    const delays = [0, 1500, 4000, 7000, 11000, 18000, 23000]
    PROGRESS_STAGES.slice(0, 7).forEach((stage, i) => {
      const t = setTimeout(() => {
        setProgress(stage.pct)
        setProgressLabel(stage.label)
      }, delays[i])
      progressTimersRef.current.push(t)
    })

    const answer_1 = mode === 'special' ? 'Yes, something special today!' : 'Normal day, let AI decide'
    const answer_2 = mode === 'special' ? details : 'Please make the best regular daily post that perfectly aligns with my brand strategy.'
    const answer_3 = 'Auto strategy'

    try {
      const result = await generateContent({
        session_id: sessionId,
        answer_1,
        answer_2,
        answer_3
      })

      // Complete progress
      progressTimersRef.current.forEach(clearTimeout)
      setProgress(100)
      setProgressLabel('Your content is ready! 🎉')

      // Normalize backend keys: linkedin -> linkedin_post, facebook -> facebook_post
      const normalized: SessionResult = {
        ...result,
        linkedin_post: result.linkedin_post || result.linkedin,
        facebook_post: result.facebook_post || result.facebook,
      }
      setResults(normalized)

      if (mode === 'special' && details) {
        setActiveTab(detectPlatformFromMessage(details))
      } else {
        setActiveTab('instagram_post')
      }

      setTimeout(() => {
        setPhase(3)
        setIsGenerating(false)
      }, 900)

    } catch (err) {
      progressTimersRef.current.forEach(clearTimeout)
      toast.error('Content generation failed')
      setPhase(1)
      setIsGenerating(false)
    }
  }

  // Issue 6: Download All
  const handleDownloadAll = async () => {
    if (!results) return
    setDownloadingAll(true)
    const platforms: Array<{ key: string; url?: string }> = [
      { key: 'instagram_post', url: results.instagram_post?.image_url },
      { key: 'instagram_story', url: results.instagram_story?.image_url },
      { key: 'linkedin', url: results.linkedin_post?.image_url },
      { key: 'facebook', url: results.facebook_post?.image_url },
    ]
    for (const p of platforms) {
      if (p.url) {
        await downloadImage(p.url, p.key)
        await new Promise(r => setTimeout(r, 500))
      }
    }
    setDownloadingAll(false)
    setDownloadedAll(true)
    toast.success('All images downloaded!')
  }

  // Handles normal check-in select
  const selectNormalDay = () => {
    setSpecialMode('normal')
    handleGenerate('normal', '')
  }

  // Handles trigger for special highlight
  const selectSpecialDay = () => {
    setSpecialMode('special')
  }

  // Handles submit special form
  const submitSpecialHighlight = () => {
    if (!specialDetails.trim()) {
      toast.error('Please enter details about what is special today.')
      return
    }
    handleGenerate('special', specialDetails)
  }

  // Copy helpers
  const copyToClipboard = (text: string, fieldId: string) => {
    navigator.clipboard.writeText(text)
    setCopiedField(fieldId)
    setTimeout(() => setCopiedField(null), 2000)
    toast.success('Copied to clipboard!')
  }

  const greeting = getGreetingData()

  return (
    <div className="min-h-screen bg-[#060608] text-white p-6 md:p-12">
      <div className="max-w-4xl mx-auto">
        
        {/* PHASE 1: SMART CHECK-IN */}
        {phase === 1 && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }} 
            animate={{ opacity: 1, y: 0 }} 
            className="space-y-10 py-6"
          >
            {/* Header Greeting */}
            <div className="text-center space-y-2">
              <span className="text-4xl inline-block animate-bounce">{greeting.icon}</span>
              <h1 className="text-3xl md:text-5xl font-black tracking-tight mt-2">
                {greeting.text}! Ready to create content for <span className="bg-clip-text text-transparent bg-gradient-to-r from-blue-400 via-indigo-300 to-purple-400">{businessName}</span>?
              </h1>
              <p className="text-gray-400 text-base md:text-lg">
                Let&apos;s decide today&apos;s direction in just one quick click.
              </p>
            </div>

            {/* Smart Check-in Form Card */}
            <div className="bg-white/[0.02] border border-white/5 rounded-[2.5rem] p-8 md:p-12 shadow-2xl relative overflow-hidden backdrop-blur-md">
              <div className="absolute top-0 right-0 h-44 w-44 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none" />
              
              <div className="space-y-10">
                
                {/* One Question */}
                <div className="space-y-3 text-center">
                  <span className="px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-xs font-black text-blue-400 uppercase tracking-widest">
                    Smart Check-in
                  </span>
                  <h2 className="text-2xl md:text-3xl font-black leading-tight text-white mt-3">
                    Anything special today?
                  </h2>
                </div>

                {/* Option Toggle Buttons */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  
                  {/* Option A: Special Highlight */}
                  <button
                    onClick={selectSpecialDay}
                    className={`p-8 rounded-[2rem] border text-left transition-all duration-300 flex flex-col justify-between h-48 relative overflow-hidden group hover:scale-[1.02] ${
                      specialMode === 'special' 
                        ? 'bg-gradient-to-br from-blue-600/30 to-purple-600/30 border-blue-500 ring-2 ring-blue-500/50' 
                        : 'bg-white/[0.02] border-white/5 hover:border-white/20'
                    }`}
                  >
                    <div className="absolute top-0 right-0 h-24 w-24 bg-blue-500/5 rounded-full blur-2xl group-hover:scale-125 transition-transform" />
                    <div className="h-10 w-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
                      <Megaphone className="h-5 w-5" />
                    </div>
                    <div className="space-y-1 z-10">
                      <p className="font-black text-xl text-white">✨ Yes, something special</p>
                      <p className="text-xs text-gray-400 font-medium">Holiday sale, product launch, customer milestone...</p>
                    </div>
                  </button>

                  {/* Option B: Normal Day */}
                  <button
                    onClick={selectNormalDay}
                    className={`p-8 rounded-[2rem] border text-left transition-all duration-300 flex flex-col justify-between h-48 relative overflow-hidden group hover:scale-[1.02] ${
                      specialMode === 'normal' 
                        ? 'bg-gradient-to-br from-emerald-600/30 to-green-600/30 border-green-500 ring-2 ring-green-500/50' 
                        : 'bg-white/[0.02] border-white/5 hover:border-white/20'
                    }`}
                  >
                    <div className="absolute top-0 right-0 h-24 w-24 bg-green-500/5 rounded-full blur-2xl group-hover:scale-125 transition-transform" />
                    <div className="h-10 w-10 rounded-xl bg-green-500/10 border border-green-500/20 flex items-center justify-center text-green-400">
                      <Zap className="h-5 w-5" />
                    </div>
                    <div className="space-y-1 z-10">
                      <p className="font-black text-xl text-white">📅 Normal day, let AI decide</p>
                      <p className="text-xs text-gray-400 font-medium">Let AI analyze brand strategy for the best post.</p>
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
                      className="space-y-4 pt-6 border-t border-white/5 overflow-hidden"
                    >
                      <label className="text-xs font-bold text-gray-400 uppercase tracking-widest pl-1">
                        Tell us what&apos;s special today:
                      </label>
                      
                      <textarea
                        value={specialDetails}
                        onChange={e => setSpecialDetails(e.target.value)}
                        placeholder="e.g. Eid sale, new product launch, customer milestone, weekend discount, or we mentioned a LinkedIn offer..."
                        rows={3}
                        className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-5 text-base focus:ring-2 focus:ring-blue-500 outline-none transition-all placeholder:text-gray-500 leading-relaxed"
                      />

                      <button
                        onClick={submitSpecialHighlight}
                        className="w-full bg-gradient-to-r from-blue-600 to-purple-600 text-white font-black py-5 rounded-2xl text-lg flex items-center justify-center gap-2 hover:opacity-90 active:scale-[0.98] transition shadow-lg shadow-indigo-500/20"
                      >
                        Generate Content
                        <Sparkles className="h-5 w-5" />
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>

              </div>
            </div>
          </motion.div>
        )}

        {/* PHASE 2: AI GENERATING — Issue 5 animated progress bar */}
        {phase === 2 && (
          <div className="min-h-[70vh] flex flex-col items-center justify-center text-center space-y-10 px-4">
            {/* Big percentage number */}
            <motion.div
              key={progress}
              initial={{ scale: 0.85, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="text-8xl font-black tabular-nums bg-clip-text text-transparent bg-gradient-to-r from-blue-400 via-indigo-300 to-purple-400"
            >
              {progress}%
            </motion.div>

            {/* Label */}
            <motion.p
              key={progressLabel}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-gray-300 font-semibold text-lg max-w-sm"
            >
              {progressLabel}
            </motion.p>

            {/* Smooth progress bar */}
            <div className="w-full max-w-md h-2.5 bg-white/10 rounded-full overflow-hidden">
              <motion.div
                className="h-full rounded-full bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500"
                initial={{ width: '0%' }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.8, ease: 'easeInOut' }}
              />
            </div>

            {/* Stage dots */}
            <div className="flex gap-2">
              {PROGRESS_STAGES.map((s, i) => (
                <div
                  key={i}
                  className={`h-2 w-2 rounded-full transition-all duration-500 ${
                    progress >= s.pct ? 'bg-blue-400 scale-125' : 'bg-white/10'
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
            className="space-y-8 py-6"
          >
            {/* Header section */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-white/5 pb-8">
              <div>
                <span className="text-blue-400 font-bold uppercase tracking-widest text-xs flex items-center gap-1.5">
                  <CheckCircle className="h-4 w-4 text-green-400" />
                  Campaign Crafted Successfully
                </span>
                <h1 className="text-3xl font-black mt-2 tracking-tight text-white">{results.session_theme || 'Today\'s Content'}</h1>
                <p className="text-gray-400 text-sm font-medium mt-1">Your customized copy and social strategies are ready</p>
              </div>
              <div className="flex gap-3">
                <button 
                  onClick={() => setPhase(1)}
                  className="flex items-center gap-2 bg-white/5 border border-white/10 px-5 py-3 rounded-xl hover:bg-white/10 font-bold text-xs transition"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  New Session
                </button>
                <button
                  onClick={() => router.push('/dashboard')}
                  className="flex items-center gap-2 bg-blue-600 px-5 py-3 rounded-xl font-bold text-xs hover:bg-blue-700 transition shadow-lg shadow-blue-500/20"
                >
                  Dashboard
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {/* Graphics Studio Top Banner */}
            <div className="bg-gradient-to-r from-indigo-950/40 via-purple-950/20 to-indigo-950/40 border border-indigo-500/20 rounded-[2rem] p-6 flex flex-col md:flex-row md:items-center justify-between gap-6 shadow-xl relative overflow-hidden">
              <div className="absolute top-0 right-0 h-32 w-32 bg-purple-500/5 rounded-full blur-2xl pointer-events-none" />
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 text-purple-400 font-extrabold text-sm">
                  <Sparkles className="h-4 w-4 text-purple-400" />
                  🎨 AI Post Graphics Studio
                </div>
                <p className="text-xs text-gray-400 max-w-xl leading-relaxed">
                  Generate matching, highly engaging visual graphics with your brand logo, primary colors, and custom typography overlayed automatically!
                </p>
              </div>
              <button
                onClick={handleGenerateGraphics}
                disabled={generatingImages}
                className="px-6 py-3.5 rounded-xl bg-purple-600 text-white font-black text-xs hover:bg-purple-500 transition shadow-lg shadow-purple-500/25 disabled:opacity-50 flex items-center gap-2 self-start md:self-auto"
              >
                {generatingImages ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Crafting Graphics...
                  </>
                ) : (
                  <>
                    Generate Branded Graphics
                    <Sparkles className="h-3.5 w-3.5" />
                  </>
                )}
              </button>
            </div>

            {/* Platform Tabs ordered (Instagram -> LinkedIn -> Facebook -> Story) */}
            <div className="bg-white/[0.02] border border-white/5 rounded-[2.5rem] overflow-hidden shadow-xl backdrop-blur-md">
              <div className="flex border-b border-white/5 overflow-x-auto scrollbar-hide">
                {[
                  { id: 'instagram_post', label: 'Instagram Post', icon: Globe },
                  { id: 'linkedin_post', label: 'LinkedIn', icon: Users },
                  { id: 'facebook_post', label: 'Facebook', icon: Layout },
                  { id: 'instagram_story', label: 'Instagram Story', icon: Share2 },
                ].map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center gap-2 px-8 py-5.5 font-bold whitespace-nowrap transition-all border-b-2 text-sm ${
                      activeTab === tab.id 
                        ? 'border-blue-500 text-blue-400 bg-blue-500/5' 
                        : 'border-transparent text-gray-500 hover:text-gray-300'
                    }`}
                  >
                    <tab.icon className="h-4.5 w-4.5" />
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Tab Contents */}
              <div className="p-8 md:p-12">
                
                {/* 1. Instagram Post Tab */}
                {activeTab === 'instagram_post' && results.instagram_post && (
                  <div className="grid md:grid-cols-2 gap-12">
                    <div className="space-y-6">
                      <div className="flex items-center justify-between">
                        <h3 className="text-xs font-black uppercase tracking-widest text-gray-500">Post Caption</h3>
                        <CopyButton text={results.instagram_post!.caption} label="Caption" />
                      </div>
                      <div className="bg-white/[0.01] rounded-3xl p-6 text-base leading-relaxed text-gray-200 border border-white/5 whitespace-pre-wrap">
                        {results.instagram_post.caption}
                      </div>
                      <div className="flex flex-wrap gap-2 pt-2">
                        {results.instagram_post.hashtags.map(tag => (
                          <span key={tag} className="px-3.5 py-1.5 bg-blue-500/10 text-blue-400 rounded-full text-xs font-bold">
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-8">
                      <div className="bg-blue-500/5 border border-blue-500/15 p-6 rounded-3xl space-y-3">
                        <div className="flex items-center gap-2 text-blue-400 font-bold text-sm">
                          <Plus className="h-4 w-4" />
                          Optimal Post Schedule
                        </div>
                        <p className="text-3xl font-black text-white">{results.instagram_post.best_time}</p>
                        <p className="text-blue-300/60 font-medium text-xs">On {results.instagram_post.best_day}</p>
                      </div>
                      <div className="bg-white/[0.01] border border-white/5 p-6 rounded-3xl space-y-2">
                        <p className="text-xs font-black uppercase tracking-widest text-gray-500">Primary Call to Action</p>
                        <p className="text-lg font-bold text-white">{results.instagram_post.call_to_action}</p>
                      </div>

                      {generatingImages && (
                        <div className="bg-white/[0.01] border border-white/5 p-6 rounded-3xl space-y-3">
                          <p className="text-xs font-black uppercase tracking-widest text-purple-400">🎨 Post Graphic</p>
                          <Skeleton width="100%" height="240px" rounded="2xl" />
                        </div>
                      )}

                      {/* Issue 6: Show generated image with download button */}
                      {results.instagram_post?.image_url && (
                        <div className="bg-white/[0.01] border border-white/5 p-6 rounded-3xl space-y-3">
                          <p className="text-xs font-black uppercase tracking-widest text-purple-400">🎨 Instagram Post Graphic</p>
                          <div className="relative rounded-2xl overflow-hidden border border-white/10 group">
                            <img src={results.instagram_post.image_url} alt="Instagram Graphic" className="w-full object-cover aspect-square" />
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                              <a href={results.instagram_post.image_url} target="_blank" rel="noreferrer" className="bg-white text-black p-3 rounded-full hover:scale-105 transition font-black text-xs flex items-center gap-1.5 shadow-xl">
                                View <ExternalLink className="h-3.5 w-3.5" />
                              </a>
                              <button onClick={() => downloadImage(results.instagram_post!.image_url!, 'instagram_post')} className="bg-blue-600 text-white p-3 rounded-full hover:scale-105 transition flex items-center gap-1.5 shadow-xl text-xs font-black">
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
                  <div className="grid md:grid-cols-2 gap-12">
                    <div className="space-y-6">
                      <div className="flex items-center justify-between">
                        <h3 className="text-xs font-black uppercase tracking-widest text-gray-500">LinkedIn Content</h3>
                        <CopyButton text={results.linkedin_post!.caption} label="Post" />
                      </div>
                      <div className="bg-white/[0.01] rounded-3xl p-6 text-base leading-relaxed text-gray-200 border border-white/5 whitespace-pre-wrap">
                        {results.linkedin_post.caption}
                      </div>
                    </div>
                    <div className="space-y-8">
                      <div className="bg-blue-500/5 border border-blue-500/15 p-6 rounded-3xl space-y-3">
                        <div className="flex items-center gap-2 text-blue-400 font-bold text-sm">
                          <Plus className="h-4 w-4" />
                          Optimal Schedule
                        </div>
                        <p className="text-3xl font-black text-white">{results.linkedin_post.best_day}</p>
                        <p className="text-blue-300/60 font-medium text-xs">Peak Professional Hours</p>
                      </div>

                      {generatingImages && (
                        <div className="bg-white/[0.01] border border-white/5 p-6 rounded-3xl space-y-3">
                          <p className="text-xs font-black uppercase tracking-widest text-purple-400">🎨 LinkedIn Graphic Card</p>
                          <Skeleton width="100%" height="180px" rounded="2xl" />
                        </div>
                      )}

                      {results.linkedin_post?.image_url && (
                        <div className="bg-white/[0.01] border border-white/5 p-6 rounded-3xl space-y-3">
                          <p className="text-xs font-black uppercase tracking-widest text-purple-400">🎨 LinkedIn Graphic Card</p>
                          <div className="relative rounded-2xl overflow-hidden border border-white/10 group">
                            <img src={results.linkedin_post.image_url} alt="LinkedIn Graphic" className="w-full object-cover aspect-[1200/627]" />
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                              <a href={results.linkedin_post.image_url} target="_blank" rel="noreferrer" className="bg-white text-black p-3 rounded-full hover:scale-105 transition font-black text-xs flex items-center gap-1.5 shadow-xl">
                                View <ExternalLink className="h-3.5 w-3.5" />
                              </a>
                              <button onClick={() => downloadImage(results.linkedin_post!.image_url!, 'linkedin')} className="bg-blue-600 text-white p-3 rounded-full hover:scale-105 transition flex items-center gap-1.5 shadow-xl text-xs font-black">
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
                      <h3 className="text-xs font-black uppercase tracking-widest text-gray-500">Facebook Caption</h3>
                      <CopyButton text={results.facebook_post!.caption} label="Caption" />
                    </div>
                    <div className="bg-white/[0.01] rounded-3xl p-6 text-base leading-relaxed text-gray-200 border border-white/5 whitespace-pre-wrap">
                      {results.facebook_post.caption}
                    </div>

                    {generatingImages && (
                      <div className="bg-white/[0.01] border border-white/5 p-6 rounded-3xl space-y-3 max-w-xl">
                        <p className="text-xs font-black uppercase tracking-widest text-purple-400">🎨 Facebook Graphic Card</p>
                        <Skeleton width="100%" height="180px" rounded="2xl" />
                      </div>
                    )}

                    {results.facebook_post?.image_url && (
                      <div className="bg-white/[0.01] border border-white/5 p-6 rounded-3xl space-y-3 max-w-xl">
                        <p className="text-xs font-black uppercase tracking-widest text-purple-400">🎨 Facebook Graphic Card</p>
                        <div className="relative rounded-2xl overflow-hidden border border-white/10 group">
                          <img src={results.facebook_post.image_url} alt="Facebook Graphic" className="w-full object-cover aspect-[1200/630]" />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                            <a href={results.facebook_post.image_url} target="_blank" rel="noreferrer" className="bg-white text-black p-3 rounded-full hover:scale-105 transition font-black text-xs flex items-center gap-1.5 shadow-xl">
                              View <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                            <button onClick={() => downloadImage(results.facebook_post!.image_url!, 'facebook')} className="bg-blue-600 text-white p-3 rounded-full hover:scale-105 transition flex items-center gap-1.5 shadow-xl text-xs font-black">
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
                  <div className="grid md:grid-cols-2 gap-12">
                    <div className="space-y-6">
                      <div className="flex items-center justify-between">
                        <h3 className="text-xs font-black uppercase tracking-widest text-gray-500">Story Frame Text</h3>
                        <CopyButton text={results.instagram_story!.text} label="Story Text" />
                      </div>
                      <div className="bg-white/[0.01] rounded-3xl p-8 text-xl font-extrabold text-center text-white border border-white/5 italic">
                        &ldquo;{results.instagram_story.text}&rdquo;
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                      <div className="bg-white/[0.01] border border-white/5 p-6 rounded-3xl space-y-2">
                        <p className="text-xs font-black uppercase tracking-widest text-gray-500">Poll Question Suggestion</p>
                        <p className="font-bold text-white text-sm leading-relaxed">{results.instagram_story.poll_question || "Ask what they think!"}</p>
                      </div>
                      <div className="bg-white/[0.01] border border-white/5 p-6 rounded-3xl space-y-2">
                        <p className="text-xs font-black uppercase tracking-widest text-gray-500">Swipe-Up / Reply CTA</p>
                        <p className="font-bold text-white text-sm leading-relaxed">{results.instagram_story.cta || "DM to get access!"}</p>
                      </div>

                      {generatingImages && (
                        <div className="col-span-1 sm:col-span-2 bg-white/[0.01] border border-white/5 p-6 rounded-3xl space-y-3">
                          <p className="text-xs font-black uppercase tracking-widest text-purple-400">🎨 Instagram Story Graphic</p>
                          <Skeleton width="240px" height="426px" rounded="2xl" className="mx-auto" />
                        </div>
                      )}

                      {results.instagram_story?.image_url && (
                        <div className="col-span-1 sm:col-span-2 bg-white/[0.01] border border-white/5 p-6 rounded-3xl space-y-3">
                          <p className="text-xs font-black uppercase tracking-widest text-purple-400">🎨 Instagram Story Graphic</p>
                          <div className="relative rounded-2xl overflow-hidden border border-white/10 group max-w-xs mx-auto">
                            <img src={results.instagram_story.image_url} alt="Instagram Story Graphic" className="w-full object-cover aspect-[1080/1920]" />
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                              <a href={results.instagram_story.image_url} target="_blank" rel="noreferrer" className="bg-white text-black p-3 rounded-full hover:scale-105 transition font-black text-xs flex items-center gap-1.5 shadow-xl">
                                View <ExternalLink className="h-3.5 w-3.5" />
                              </a>
                              <button onClick={() => downloadImage(results.instagram_story!.image_url!, 'instagram_story')} className="bg-blue-600 text-white p-3 rounded-full hover:scale-105 transition flex items-center gap-1.5 shadow-xl text-xs font-black">
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

            {/* Issue 6: Download All button */}
            {(results.instagram_post?.image_url || results.instagram_story?.image_url || results.linkedin_post?.image_url || results.facebook_post?.image_url) && (
              <div className="flex justify-center">
                <button
                  onClick={handleDownloadAll}
                  disabled={downloadingAll}
                  className={`flex items-center gap-2.5 px-8 py-4 rounded-2xl font-bold text-sm transition-all duration-150 active:scale-[0.98] shadow-lg ${
                    downloadedAll
                      ? 'bg-green-600 text-white shadow-green-500/25'
                      : 'bg-white/10 border border-white/15 text-white hover:bg-white/15'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  {downloadingAll ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> Downloading...</>
                  ) : downloadedAll ? (
                    <><CheckCircle className="h-4 w-4" /> ✓ Downloaded!</>
                  ) : (
                    <><Download className="h-4 w-4" /> Download All Images</>
                  )}
                </button>
              </div>
            )}

            {/* GUIDANCE & INSPIRATION CARDS */}
            <div className="grid md:grid-cols-3 gap-6">
              <div className="bg-white/[0.02] border border-white/5 rounded-3xl p-8 space-y-4 hover:bg-white/[0.04] transition-colors duration-200">
                <Lightbulb className="h-8 w-8 text-yellow-400 fill-yellow-400/10" />
                <h4 className="font-bold text-lg text-white">Tip of the Day</h4>
                <p className="text-gray-400 text-sm leading-relaxed">{results.guidance?.tip_of_day || 'Keep captions focused on a single customer action to elevate conversion ratios.'}</p>
              </div>
              <div className="bg-white/[0.02] border border-white/5 rounded-3xl p-8 space-y-4 hover:bg-white/[0.04] transition-colors duration-200">
                <Sparkles className="h-8 w-8 text-purple-400" />
                <h4 className="font-bold text-lg text-white">This Week Focus</h4>
                <p className="text-gray-400 text-sm leading-relaxed">{results.guidance?.this_week_suggestion || 'Post visual guides showing behind-the-scenes milestones to build deep authority.'}</p>
              </div>
              <div className="bg-white/[0.02] border border-white/5 rounded-3xl p-8 space-y-4 hover:bg-white/[0.04] transition-colors duration-200">
                <Zap className="h-8 w-8 text-green-400" />
                <h4 className="font-bold text-lg text-white">Top Content Type</h4>
                <p className="text-gray-400 text-sm leading-relaxed">{results.guidance?.best_performing_type || 'User case stories or discount offers generate 2.5x more active comments.'}</p>
              </div>
            </div>

          </motion.div>
        )}

      </div>
    </div>
  )
}
