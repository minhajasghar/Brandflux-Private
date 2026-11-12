'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Loader2, 
  CheckCircle2, 
  Check, 
  Edit3, 
  Globe, 
  Zap,
  Users,
  Target,
  Palette,
  Sparkles,
  Pipette,
  RotateCcw
} from 'lucide-react'
import { getProfile, scanWebsite, updateBrandKit } from '@/lib/api'
import api from '@/lib/api'
import { Brand, ColorPalette } from '@/lib/types'
import { toast } from 'react-hot-toast'

export default function OnboardingPage() {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [savingKit, setSavingKit] = useState(false)
  const [brand, setBrand] = useState<Brand | null>(null)
  const [scanProgress, setScanProgress] = useState(0)
  
  // Form States for Step 2: Brand Identity & Colors
  const [isEditingInfo, setIsEditingInfo] = useState(false)
  const [editForm, setEditForm] = useState({
    business_name: '',
    business_type: 'Retail & Other'
  })

  // Color Palette States
  const [primaryColor, setPrimaryColor] = useState('#1558C9')
  const [secondaryColor, setSecondaryColor] = useState('#D4FF24')
  const [accentColor, setAccentColor] = useState('#D4FF24')
  const [detectedPalette, setDetectedPalette] = useState<ColorPalette | null>(null)

  // Form States for Step 3
  const [extraData, setExtraData] = useState({
    customers: '',
    goal: ''
  })

  // Automatically start layered website scan on mount
  useEffect(() => {
    const startInitialScan = async () => {
      try {
        const profile = await getProfile()
        const isAppr = Boolean(profile.user?.is_approver || profile.brand_role === 'approver' || profile.user?.brand_role === 'approver')
        if (isAppr) {
          router.replace('/approvals')
          return
        }
        const initialBrand = profile.brand
        setBrand(initialBrand)
        
        if (initialBrand?.website_url) {
          const interval = setInterval(() => {
            setScanProgress(prev => {
              if (prev >= 95) {
                return 95
              }
              return prev + 5
            })
          }, 300)

          const result = await scanWebsite(initialBrand.website_url)
          clearInterval(interval)
          setScanProgress(100)
          setBrand(result)

          setEditForm({
            business_name: result.business_name || '',
            business_type: result.business_type || 'Retail & Other'
          })

          // Extract detected colors and confidence
          const pal = result.color_palette || {}
          setDetectedPalette(pal)

          const prim = pal.primary?.hex || result.primary_color || (result.colors && result.colors[0]) || '#1558C9'
          const sec = pal.secondary?.hex || result.secondary_color || (result.colors && result.colors[1]) || '#D4FF24'
          const acc = pal.accent?.hex || (result.colors && result.colors[2]) || sec

          setPrimaryColor(prim)
          setSecondaryColor(sec)
          setAccentColor(acc)
          
          setTimeout(() => setStep(2), 700)
        } else {
          setStep(2)
        }
      } catch (err) {
        console.error('Scan error', err)
        toast.error('Failed to analyze website. You can manually configure your brand.')
        setStep(2)
      }
    }
    startInitialScan()
  }, [])

  // Confirm and persist the confirmed Brand Kit to backend
  const handleConfirmBrandKit = async () => {
    setSavingKit(true)
    try {
      const consolidatedColors = Array.from(new Set([
        primaryColor,
        secondaryColor,
        accentColor,
        ...(detectedPalette?.neutrals?.map(n => n.hex) || []),
        ...(brand?.colors || []),
      ])).filter(Boolean)

      await updateBrandKit({
        business_name: editForm.business_name || brand?.business_name || 'My Brand',
        business_type: editForm.business_type || brand?.business_type || 'Retail & Other',
        primary_color: primaryColor,
        secondary_color: secondaryColor,
        colors: consolidatedColors,
      })

      toast.success('Brand kit saved!')
      setStep(3)
    } catch (err: any) {
      console.error('Save brand kit error', err)
      toast.error(err.response?.data?.detail || 'Failed to save brand kit')
    } finally {
      setSavingKit(false)
    }
  }

  // Reset to original detected values
  const handleResetColors = () => {
    if (detectedPalette) {
      if (detectedPalette.primary?.hex) setPrimaryColor(detectedPalette.primary.hex)
      if (detectedPalette.secondary?.hex) setSecondaryColor(detectedPalette.secondary.hex)
      if (detectedPalette.accent?.hex) setAccentColor(detectedPalette.accent.hex)
      toast.success('Colors reset to detected values')
    }
  }

  const handleStep3Submit = async () => {
    setLoading(true)
    try {
      await api.post('/brand/update-preferences', extraData)
      document.cookie = 'brandflux_onboarding_complete=true; path=/; max-age=604800;'
      toast.success('Setup complete!')
      router.push('/dashboard')
    } catch (err) {
      toast.error('Failed to save settings')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-bg text-text flex flex-col items-center justify-center p-4 sm:p-6 selection:bg-accent selection:text-black">
      <div className="w-full max-w-2xl">
        
        {/* ══════════════════════════════════════════════════════════ */}
        {/* STEP 1: LAYERED WEBSITE SCANNING PROGRESS                 */}
        {/* ══════════════════════════════════════════════════════════ */}
        <AnimatePresence mode="wait">
          {step === 1 && (
            <motion.div 
              key="step1"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="text-center"
            >
              <div className="mx-auto w-20 h-20 rounded-2xl bg-surface-secondary border border-border flex items-center justify-center mb-6 relative shadow-lg">
                <Globe className="h-8 w-8 text-accent animate-pulse" />
              </div>
              
              <h1 className="text-3xl font-extrabold mb-2 text-text tracking-tight">Analyzing your website...</h1>
              <p className="text-muted text-sm mb-10">Running multi-layer color &amp; visual brand extraction</p>

              <div className="space-y-4 max-w-md mx-auto text-left bg-surface border border-border rounded-2xl p-5 shadow-sm">
                {[
                  { label: 'Reading meta theme-color & manifest', min: 15 },
                  { label: 'Rendering DOM & CSS variables in Playwright', min: 40 },
                  { label: 'Sampling CTA buttons & heading styles', min: 65 },
                  { label: 'Extracting logo colors with ColorThief', min: 85 },
                  { label: 'Clustering & finalizing brand palette', min: 95 },
                ].map((s, i) => (
                  <div key={i} className="flex items-center gap-3">
                    {scanProgress >= s.min ? (
                      <CheckCircle2 className="h-5 w-5 text-success shrink-0" />
                    ) : (
                      <div className="h-5 w-5 rounded-full border border-border shrink-0" />
                    )}
                    <span className={`text-xs sm:text-sm ${scanProgress >= s.min ? 'text-text font-bold' : 'text-muted'}`}>
                      {s.label}
                    </span>
                  </div>
                ))}
              </div>

              <div className="mt-8 h-2.5 w-full bg-surface-secondary border border-border rounded-full overflow-hidden">
                <motion.div 
                  className="h-full bg-accent" 
                  initial={{ width: 0 }}
                  animate={{ width: `${scanProgress}%` }}
                  transition={{ duration: 0.3 }}
                />
              </div>
              
              {scanProgress === 100 && (
                <p className="mt-4 text-success text-xs font-bold animate-fade-in flex items-center justify-center gap-1.5">
                  <Check className="h-4 w-4" />
                  <span>Brand palette extracted with confidence scores!</span>
                </p>
              )}
            </motion.div>
          )}

          {/* ══════════════════════════════════════════════════════════ */}
          {/* STEP 2: CONFIRM / EDIT PALETTE & BRAND IDENTITY           */}
          {/* ══════════════════════════════════════════════════════════ */}
          {step === 2 && (
            <motion.div 
              key="step2"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="space-y-6"
            >
              <div className="text-center">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/20 border border-primary/40 text-primary-light text-xs font-bold mb-3">
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>Layered Color Extraction Complete</span>
                </div>
                <h2 className="text-2xl md:text-3xl font-extrabold mb-1.5 text-text tracking-tight">Does this look right?</h2>
                <p className="text-muted text-xs sm:text-sm">
                  We extracted this palette from your site. Click any swatch or hex code to edit.
                </p>
              </div>

              <div className="bg-surface border border-border rounded-3xl p-6 sm:p-8 space-y-6 shadow-xl">
                {/* ─── COLOR PALETTE REVIEW & EDIT CARDS ─── */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-extrabold text-muted uppercase tracking-wider flex items-center gap-1.5">
                      <Palette className="h-3.5 w-3.5 text-primary-light" />
                      Detected Brand Palette
                    </label>
                    <button
                      type="button"
                      onClick={handleResetColors}
                      className="text-xs text-muted hover:text-text flex items-center gap-1 transition"
                    >
                      <RotateCcw className="h-3 w-3" />
                      <span>Reset</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {/* Primary Color Card */}
                    <div className="p-3.5 rounded-2xl bg-surface-secondary border border-border flex flex-col justify-between space-y-3">
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-xs font-extrabold text-text">Primary</span>
                        {detectedPalette?.primary?.confidence && (
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                            {Math.round(detectedPalette.primary.confidence * 100)}% match
                          </span>
                        )}
                      </div>

                      {/* Swatch & Color Picker */}
                      <div className="flex items-center gap-2.5">
                        <label className="relative cursor-pointer shrink-0 group">
                          <div
                            className="h-10 w-10 rounded-xl border border-white/20 shadow-sm transition group-hover:scale-105 flex items-center justify-center"
                            style={{ backgroundColor: primaryColor }}
                          >
                            <Pipette className="h-4 w-4 text-white/70 drop-shadow opacity-0 group-hover:opacity-100 transition" />
                          </div>
                          <input
                            type="color"
                            value={primaryColor}
                            onChange={e => setPrimaryColor(e.target.value)}
                            className="absolute inset-0 opacity-0 cursor-pointer h-full w-full"
                          />
                        </label>

                        <input
                          type="text"
                          value={primaryColor}
                          onChange={e => setPrimaryColor(e.target.value)}
                          className="w-full bg-surface border border-border rounded-xl px-2.5 py-1.5 text-xs font-mono font-bold text-text focus:outline-none focus:border-primary uppercase"
                        />
                      </div>
                      <p className="text-[10px] text-muted">Dominant brand identity</p>
                    </div>

                    {/* Secondary Color Card */}
                    <div className="p-3.5 rounded-2xl bg-surface-secondary border border-border flex flex-col justify-between space-y-3">
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-xs font-extrabold text-text">Secondary</span>
                        {detectedPalette?.secondary?.confidence && (
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-primary/20 text-primary-light border border-primary/30">
                            {Math.round(detectedPalette.secondary.confidence * 100)}% match
                          </span>
                        )}
                      </div>

                      {/* Swatch & Color Picker */}
                      <div className="flex items-center gap-2.5">
                        <label className="relative cursor-pointer shrink-0 group">
                          <div
                            className="h-10 w-10 rounded-xl border border-white/20 shadow-sm transition group-hover:scale-105 flex items-center justify-center"
                            style={{ backgroundColor: secondaryColor }}
                          >
                            <Pipette className="h-4 w-4 text-white/70 drop-shadow opacity-0 group-hover:opacity-100 transition" />
                          </div>
                          <input
                            type="color"
                            value={secondaryColor}
                            onChange={e => setSecondaryColor(e.target.value)}
                            className="absolute inset-0 opacity-0 cursor-pointer h-full w-full"
                          />
                        </label>

                        <input
                          type="text"
                          value={secondaryColor}
                          onChange={e => setSecondaryColor(e.target.value)}
                          className="w-full bg-surface border border-border rounded-xl px-2.5 py-1.5 text-xs font-mono font-bold text-text focus:outline-none focus:border-primary uppercase"
                        />
                      </div>
                      <p className="text-[10px] text-muted">Supporting visual tone</p>
                    </div>

                    {/* Accent / CTA Color Card */}
                    <div className="p-3.5 rounded-2xl bg-surface-secondary border border-border flex flex-col justify-between space-y-3">
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-xs font-extrabold text-text">Accent / CTA</span>
                        {detectedPalette?.accent?.confidence && (
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-accent/20 text-accent border border-accent/30">
                            {Math.round(detectedPalette.accent.confidence * 100)}% match
                          </span>
                        )}
                      </div>

                      {/* Swatch & Color Picker */}
                      <div className="flex items-center gap-2.5">
                        <label className="relative cursor-pointer shrink-0 group">
                          <div
                            className="h-10 w-10 rounded-xl border border-white/20 shadow-sm transition group-hover:scale-105 flex items-center justify-center"
                            style={{ backgroundColor: accentColor }}
                          >
                            <Pipette className="h-4 w-4 text-black/70 drop-shadow opacity-0 group-hover:opacity-100 transition" />
                          </div>
                          <input
                            type="color"
                            value={accentColor}
                            onChange={e => setAccentColor(e.target.value)}
                            className="absolute inset-0 opacity-0 cursor-pointer h-full w-full"
                          />
                        </label>

                        <input
                          type="text"
                          value={accentColor}
                          onChange={e => setAccentColor(e.target.value)}
                          className="w-full bg-surface border border-border rounded-xl px-2.5 py-1.5 text-xs font-mono font-bold text-text focus:outline-none focus:border-primary uppercase"
                        />
                      </div>
                      <p className="text-[10px] text-muted">Action buttons &amp; badges</p>
                    </div>
                  </div>

                  {/* Neutrals Bar if detected */}
                  {detectedPalette?.neutrals && detectedPalette.neutrals.length > 0 && (
                    <div className="pt-2">
                      <p className="text-[10px] font-extrabold text-muted uppercase tracking-wider mb-2">Detected Neutrals</p>
                      <div className="flex flex-wrap items-center gap-2">
                        {detectedPalette.neutrals.map((n, i) => (
                          <div
                            key={i}
                            className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-surface-secondary border border-border text-[11px] font-mono font-semibold text-muted"
                          >
                            <span className="h-3 w-3 rounded-full border border-white/20" style={{ backgroundColor: n.hex }} />
                            <span>{n.hex}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* ─── BUSINESS IDENTITY FIELDS ─── */}
                <div className="pt-4 border-t border-border">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-extrabold text-muted uppercase tracking-wider">Business Identity</span>
                    <button
                      type="button"
                      onClick={() => setIsEditingInfo(!isEditingInfo)}
                      className="text-xs text-primary-light hover:underline flex items-center gap-1 font-semibold"
                    >
                      <Edit3 className="h-3 w-3" />
                      <span>{isEditingInfo ? 'Done Editing' : 'Edit Info'}</span>
                    </button>
                  </div>

                  {isEditingInfo ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs font-bold text-muted mb-1 block">Business Name</label>
                        <input 
                          type="text" 
                          value={editForm.business_name}
                          onChange={e => setEditForm({...editForm, business_name: e.target.value})}
                          className="w-full bg-surface-secondary border border-border rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-text focus:border-primary outline-none transition"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-bold text-muted mb-1 block">Business Type</label>
                        <select 
                          value={editForm.business_type}
                          onChange={e => setEditForm({...editForm, business_type: e.target.value})}
                          className="w-full bg-surface-secondary border border-border rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-text focus:border-primary outline-none transition"
                        >
                          <option value="Restaurant" className="bg-surface">Restaurant</option>
                          <option value="SaaS" className="bg-surface">SaaS / Software</option>
                          <option value="E-commerce" className="bg-surface">E-commerce</option>
                          <option value="Agency" className="bg-surface">Agency</option>
                          <option value="Retail" className="bg-surface">Retail Store</option>
                          <option value="Healthcare" className="bg-surface">Healthcare</option>
                          <option value="Gym and Fitness" className="bg-surface">Gym &amp; Fitness</option>
                          <option value="Salon and Beauty" className="bg-surface">Salon &amp; Beauty</option>
                          <option value="Retail & Other" className="bg-surface">Retail &amp; Other</option>
                        </select>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-4 p-4 rounded-2xl bg-surface-secondary border border-border">
                      <div>
                        <p className="text-[10px] font-bold text-muted uppercase">Business Name</p>
                        <p className="text-sm sm:text-base font-bold text-text truncate mt-0.5">
                          {editForm.business_name || brand?.business_name || 'My Brand'}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-muted uppercase">Business Type</p>
                        <p className="text-sm sm:text-base font-bold text-text truncate mt-0.5">
                          {editForm.business_type || brand?.business_type || 'Retail & Other'}
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                {/* ─── CONFIRMATION BUTTON ─── */}
                <div className="pt-2">
                  <button 
                    onClick={handleConfirmBrandKit}
                    disabled={savingKit}
                    className="w-full bg-accent hover:bg-accent-hover text-black font-extrabold py-3.5 rounded-xl flex items-center justify-center gap-2 active:scale-98 transition shadow-accent-glow text-sm disabled:opacity-50"
                  >
                    {savingKit ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>Saving Brand Kit...</span>
                      </>
                    ) : (
                      <>
                        <span>Yes, looks good! Save Brand Kit</span>
                        <Check className="h-4 w-4 stroke-[3]" />
                      </>
                    )}
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {/* ══════════════════════════════════════════════════════════ */}
          {/* STEP 3: FINAL QUESTIONS                                   */}
          {/* ══════════════════════════════════════════════════════════ */}
          {step === 3 && (
            <motion.div 
              key="step3"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="space-y-6"
            >
              <div className="text-center">
                <h2 className="text-2xl md:text-3xl font-extrabold mb-1 text-text">Final touches</h2>
                <p className="text-muted text-sm">Two quick context questions to align your content</p>
              </div>

              <div className="space-y-6">
                {/* Q1: Customers */}
                <div className="space-y-3">
                  <label className="flex items-center gap-2 text-base font-bold text-text">
                    <Users className="h-4.5 w-4.5 text-accent" />
                    Who are your main customers?
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    {['Young Adults', 'Families', 'Professionals', 'Everyone'].map(opt => (
                      <button
                        key={opt}
                        onClick={() => setExtraData({...extraData, customers: opt})}
                        className={`p-4 rounded-xl border text-left transition-all ${
                          extraData.customers === opt 
                            ? 'border-accent bg-surface-secondary text-text ring-1 ring-accent' 
                            : 'bg-surface border-border text-muted hover:border-border-light'
                        }`}
                      >
                        <p className="font-bold text-sm text-text">{opt}</p>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Q2: Goals */}
                <div className="space-y-3">
                  <label className="flex items-center gap-2 text-base font-bold text-text">
                    <Target className="h-4.5 w-4.5 text-accent" />
                    What&apos;s your main goal on social media?
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    {['Get more followers', 'Sell more products', 'Build brand awareness', 'All of the above'].map(opt => (
                      <button
                        key={opt}
                        onClick={() => setExtraData({...extraData, goal: opt})}
                        className={`p-4 rounded-xl border text-left transition-all ${
                          extraData.goal === opt 
                            ? 'border-accent bg-surface-secondary text-text ring-1 ring-accent' 
                            : 'bg-surface border-border text-muted hover:border-border-light'
                        }`}
                      >
                        <p className="font-bold text-sm text-text">{opt}</p>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <button 
                onClick={handleStep3Submit}
                disabled={loading || !extraData.customers || !extraData.goal}
                className="w-full bg-accent hover:bg-accent-hover text-black py-4 rounded-xl font-extrabold text-base flex items-center justify-center gap-2 shadow-accent-glow active:scale-98 transition disabled:opacity-50"
              >
                {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : (
                  <>
                    Complete Setup
                    <Zap className="h-4 w-4" />
                  </>
                )}
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
