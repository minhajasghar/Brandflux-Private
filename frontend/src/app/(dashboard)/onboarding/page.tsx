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
  Target
} from 'lucide-react'
import { getProfile, scanWebsite } from '@/lib/api'
import api from '@/lib/api'
import { Brand } from '@/lib/types'
import { toast } from 'react-hot-toast'

export default function OnboardingPage() {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [brand, setBrand] = useState<Brand | null>(null)
  const [scanProgress, setScanProgress] = useState(0)
  
  // Form States for Step 2
  const [isEditing, setIsEditing] = useState(false)
  const [editForm, setEditForm] = useState({
    business_name: '',
    business_type: ''
  })

  // Form States for Step 3
  const [extraData, setExtraData] = useState({
    customers: '',
    goal: ''
  })

  // Automatically start scan on mount
  useEffect(() => {
    const startInitialScan = async () => {
      try {
        const profile = await getProfile()
        setBrand(profile.brand)
        
        if (profile.brand?.website_url) {
          const interval = setInterval(() => {
            setScanProgress(prev => {
              if (prev >= 100) {
                clearInterval(interval)
                return 100
              }
              return prev + 5
            })
          }, 250)

          const result = await scanWebsite(profile.brand.website_url)
          setBrand(result)
          setEditForm({
            business_name: result.business_name || '',
            business_type: result.business_type || ''
          })
          
          setTimeout(() => setStep(2), 800)
        }
      } catch (err) {
        toast.error('Failed to analyze website. Please proceed manually.')
        setStep(2)
      }
    }
    startInitialScan()
  }, [])

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
    <div className="min-h-screen bg-bg text-text flex flex-col items-center justify-center p-6 selection:bg-accent selection:text-black">
      <div className="w-full max-w-2xl">
        
        {/* STEP 1: SCANNING */}
        <AnimatePresence mode="wait">
          {step === 1 && (
            <motion.div 
              key="step1"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="text-center"
            >
              <div className="mx-auto w-20 h-20 rounded-2xl bg-surface-secondary border border-border flex items-center justify-center mb-6 relative">
                <Globe className="h-8 w-8 text-accent animate-pulse" />
              </div>
              
              <h1 className="text-3xl font-extrabold mb-2 text-text">Analyzing your website...</h1>
              <p className="text-muted text-sm mb-10">Building your AI content engine from your URL</p>

              <div className="space-y-4 max-w-md mx-auto text-left">
                {[
                  { label: 'Reading your website', min: 20 },
                  { label: 'Extracting brand colors', min: 40 },
                  { label: 'Detecting your products', min: 70 },
                  { label: 'Understanding your brand tone', min: 90 },
                ].map((s, i) => (
                  <div key={i} className="flex items-center gap-3">
                    {scanProgress >= s.min ? (
                      <CheckCircle2 className="h-5 w-5 text-success" />
                    ) : (
                      <div className="h-5 w-5 rounded-full border border-border" />
                    )}
                    <span className={`text-sm ${scanProgress >= s.min ? 'text-text font-bold' : 'text-muted'}`}>
                      {s.label}
                    </span>
                  </div>
                ))}
              </div>

              <div className="mt-10 h-2 w-full bg-surface-secondary border border-border rounded-full overflow-hidden">
                <motion.div 
                  className="h-full bg-accent" 
                  initial={{ width: 0 }}
                  animate={{ width: `${scanProgress}%` }}
                />
              </div>
              
              {scanProgress === 100 && (
                <p className="mt-4 text-success text-xs font-bold">Brand profile ready!</p>
              )}
            </motion.div>
          )}

          {/* STEP 2: CONFIRMATION */}
          {step === 2 && (
            <motion.div 
              key="step2"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="space-y-6"
            >
              <div className="text-center">
                <h2 className="text-2xl md:text-3xl font-extrabold mb-1 text-text">Does this look right?</h2>
                <p className="text-muted text-sm">We extracted this from your website</p>
              </div>

              <div className="bg-surface border border-border rounded-3xl p-8 space-y-6 shadow-sm">
                {isEditing ? (
                  <div className="space-y-4">
                    <div>
                      <label className="text-xs font-bold text-muted uppercase tracking-wider mb-1.5 block">Business Name</label>
                      <input 
                        type="text" 
                        value={editForm.business_name}
                        onChange={e => setEditForm({...editForm, business_name: e.target.value})}
                        className="w-full bg-surface-secondary border border-border rounded-xl px-4 py-3 text-sm text-text focus:border-primary focus:ring-1 focus:ring-primary outline-none transition"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-muted uppercase tracking-wider mb-1.5 block">Business Type</label>
                      <select 
                        value={editForm.business_type}
                        onChange={e => setEditForm({...editForm, business_type: e.target.value})}
                        className="w-full bg-surface-secondary border border-border rounded-xl px-4 py-3 text-sm text-text focus:border-primary focus:ring-1 focus:ring-primary outline-none transition"
                      >
                        <option value="Restaurant" className="bg-surface">Restaurant</option>
                        <option value="SaaS" className="bg-surface">SaaS / Software</option>
                        <option value="E-commerce" className="bg-surface">E-commerce</option>
                        <option value="Agency" className="bg-surface">Agency</option>
                        <option value="Retail" className="bg-surface">Retail Store</option>
                      </select>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-1">
                      <p className="text-[10px] font-bold text-muted uppercase tracking-wider">Business Name</p>
                      <p className="text-lg font-bold text-text">{brand?.business_name}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[10px] font-bold text-muted uppercase tracking-wider">Business Type</p>
                      <p className="text-lg font-bold text-text">{brand?.business_type || 'Retail & Other'}</p>
                    </div>
                    <div className="col-span-2">
                      <p className="text-[10px] font-bold text-muted uppercase tracking-wider mb-2">Detected Colors</p>
                      <div className="flex gap-2">
                        {brand?.colors?.map((c, i) => (
                          <div key={i} className="h-8 w-8 rounded-full border border-border" style={{ backgroundColor: c }} />
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex gap-3 pt-4 border-t border-border">
                  <button 
                    onClick={() => setStep(3)}
                    className="flex-1 bg-accent hover:bg-accent-hover text-black font-extrabold py-3.5 rounded-xl flex items-center justify-center gap-2 active:scale-98 transition shadow-accent-glow text-sm"
                  >
                    Yes, looks good!
                    <Check className="h-4 w-4" />
                  </button>
                  <button 
                    onClick={() => setIsEditing(!isEditing)}
                    className="px-4 bg-surface-secondary border border-border rounded-xl hover:bg-surface-hover text-muted hover:text-text transition"
                    aria-label="Edit details"
                  >
                    <Edit3 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {/* STEP 3: FINAL QUESTIONS */}
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
