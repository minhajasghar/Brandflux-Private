'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Loader2, 
  CheckCircle2, 
  ArrowRight, 
  Check, 
  Edit3, 
  Globe, 
  Search, 
  Palette, 
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
          // Fake progress bar
          const interval = setInterval(() => {
            setScanProgress(prev => {
              if (prev >= 100) {
                clearInterval(interval)
                return 100
              }
              return prev + 5
            })
          }, 300)

          const result = await scanWebsite(profile.brand.website_url)
          setBrand(result)
          setEditForm({
            business_name: result.business_name || '',
            business_type: result.business_type || ''
          })
          
          setTimeout(() => setStep(2), 1000)
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
      // Save final brand preferences
      await api.post('/brand/update-preferences', extraData)
      
      // Set the onboarding completed cookie so the middleware allows dashboard access
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
    <div className="min-h-screen bg-[#0a0a0a] text-white flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-2xl">
        
        {/* STEP 1: SCANNING */}
        <AnimatePresence mode="wait">
          {step === 1 && (
            <motion.div 
              key="step1"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="text-center"
            >
              <div className="mx-auto w-24 h-24 rounded-3xl bg-blue-600/20 flex items-center justify-center mb-8 relative">
                <Globe className="h-10 w-10 text-blue-400 animate-pulse" />
                <div className="absolute inset-0 rounded-3xl border-2 border-blue-500/20 animate-ping" />
              </div>
              
              <h1 className="text-4xl font-extrabold mb-4">Analyzing your website...</h1>
              <p className="text-gray-400 mb-12">Building your AI content engine from your URL</p>

              <div className="space-y-6 max-w-md mx-auto text-left">
                {[
                  { label: 'Reading your website', min: 20 },
                  { label: 'Extracting brand colors', min: 40 },
                  { label: 'Detecting your products', min: 70 },
                  { label: 'Understanding your brand tone', min: 90 },
                ].map((s, i) => (
                  <div key={i} className="flex items-center gap-4">
                    {scanProgress >= s.min ? (
                      <CheckCircle2 className="h-6 w-6 text-green-400" />
                    ) : (
                      <div className="h-6 w-6 rounded-full border-2 border-white/10" />
                    )}
                    <span className={scanProgress >= s.min ? 'text-white font-medium' : 'text-gray-500'}>
                      {s.label}
                    </span>
                  </div>
                ))}
              </div>

              <div className="mt-12 h-2 w-full bg-white/5 rounded-full overflow-hidden">
                <motion.div 
                  className="h-full bg-blue-500" 
                  initial={{ width: 0 }}
                  animate={{ width: `${scanProgress}%` }}
                />
              </div>
              
              {scanProgress === 100 && (
                <p className="mt-4 text-green-400 font-bold animate-bounce">Brand profile ready!</p>
              )}
            </motion.div>
          )}

          {/* STEP 2: CONFIRMATION */}
          {step === 2 && (
            <motion.div 
              key="step2"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="space-y-8"
            >
              <div className="text-center">
                <h2 className="text-3xl font-bold mb-2">Does this look right?</h2>
                <p className="text-gray-400">We extracted this from your website</p>
              </div>

              <div className="bg-white/5 border border-white/10 rounded-3xl p-8 space-y-8">
                {isEditing ? (
                  <div className="space-y-6">
                    <div>
                      <label className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2 block">Business Name</label>
                      <input 
                        type="text" 
                        value={editForm.business_name}
                        onChange={e => setEditForm({...editForm, business_name: e.target.value})}
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-blue-500 outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2 block">Business Type</label>
                      <select 
                        value={editForm.business_type}
                        onChange={e => setEditForm({...editForm, business_type: e.target.value})}
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-blue-500 outline-none"
                      >
                        <option value="Restaurant">Restaurant</option>
                        <option value="SaaS">SaaS / Software</option>
                        <option value="E-commerce">E-commerce</option>
                        <option value="Agency">Agency</option>
                        <option value="Retail">Retail Store</option>
                      </select>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-8">
                    <div className="space-y-1">
                      <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">Business Name</p>
                      <p className="text-xl font-bold">{brand?.business_name}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">Business Type</p>
                      <p className="text-xl font-bold">{brand?.business_type || 'Retail & Other'}</p>
                    </div>
                    <div className="col-span-2">
                      <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">Detected Colors</p>
                      <div className="flex gap-3">
                        {brand?.colors?.map((c, i) => (
                          <div key={i} className="h-10 w-10 rounded-full border border-white/10" style={{ backgroundColor: c }} />
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex gap-4 pt-4 border-t border-white/10">
                  <button 
                    onClick={() => setStep(3)}
                    className="flex-1 bg-white text-black font-bold py-4 rounded-2xl flex items-center justify-center gap-2 hover:bg-gray-200 transition"
                  >
                    Yes, looks good!
                    <Check className="h-5 w-5" />
                  </button>
                  <button 
                    onClick={() => setIsEditing(!isEditing)}
                    className="px-6 bg-white/5 border border-white/10 rounded-2xl hover:bg-white/10 transition"
                  >
                    <Edit3 className="h-5 w-5" />
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
              className="space-y-10"
            >
              <div className="text-center">
                <h2 className="text-3xl font-bold mb-2">Final touches</h2>
                <p className="text-gray-400">Two quick things we couldn&apos;t detect</p>
              </div>

              <div className="space-y-10">
                {/* Q1: Customers */}
                <div className="space-y-4">
                  <label className="flex items-center gap-2 text-lg font-bold">
                    <Users className="h-5 w-5 text-blue-400" />
                    Who are your main customers?
                  </label>
                  <div className="grid grid-cols-2 gap-4">
                    {['Young Adults', 'Families', 'Professionals', 'Everyone'].map(opt => (
                      <button
                        key={opt}
                        onClick={() => setExtraData({...extraData, customers: opt})}
                        className={`p-6 rounded-3xl border text-left transition-all ${
                          extraData.customers === opt 
                            ? 'bg-blue-600 border-blue-500 ring-2 ring-blue-500/50' 
                            : 'bg-white/5 border-white/10 hover:border-white/20'
                        }`}
                      >
                        <p className="font-bold">{opt}</p>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Q2: Goals */}
                <div className="space-y-4">
                  <label className="flex items-center gap-2 text-lg font-bold">
                    <Target className="h-5 w-5 text-purple-400" />
                    What&apos;s your main goal on social media?
                  </label>
                  <div className="grid grid-cols-2 gap-4">
                    {['Get more followers', 'Sell more products', 'Build brand awareness', 'All of the above'].map(opt => (
                      <button
                        key={opt}
                        onClick={() => setExtraData({...extraData, goal: opt})}
                        className={`p-6 rounded-3xl border text-left transition-all ${
                          extraData.goal === opt 
                            ? 'bg-purple-600 border-purple-500 ring-2 purple-500/50' 
                            : 'bg-white/5 border-white/10 hover:border-white/20'
                        }`}
                      >
                        <p className="font-bold">{opt}</p>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <button 
                onClick={handleStep3Submit}
                disabled={loading || !extraData.customers || !extraData.goal}
                className="w-full bg-gradient-to-r from-blue-600 to-purple-600 py-5 rounded-3xl font-bold text-xl flex items-center justify-center gap-3 shadow-2xl shadow-blue-500/20 disabled:opacity-50"
              >
                {loading ? <Loader2 className="h-6 w-6 animate-spin" /> : (
                  <>
                    Complete Setup
                    <Zap className="h-6 w-6" />
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
