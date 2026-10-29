'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { signup } from '@/lib/api'
import api from '@/lib/api'
import { Loader2, User, Mail, Lock, Globe, Briefcase, Zap, CheckCircle2 } from 'lucide-react'
import { toast } from 'react-hot-toast'

const BUSINESS_TYPES = [
  'Restaurant',
  'Cafe / Coffee Shop',
  'Retail Store',
  'E-commerce',
  'SaaS / Software',
  'Agency',
  'Fitness / Gym',
  'Healthcare / Clinic',
  'Real Estate',
  'Education / Coaching',
  'Beauty / Salon',
  'Construction / Trade',
  'Consulting',
  'Freelancer',
  'Other',
]

export default function SignupPage() {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [formData, setFormData] = useState({
    full_name: '',
    email: '',
    password: '',
    website_url: '',
    business_type: '',
  })

  // Auto-detect business type from URL on blur
  const [detectingBusiness, setDetectingBusiness] = useState(false)
  const [detectedBusinessType, setDetectedBusinessType] = useState<string | null>(null)

  const handleWebsiteBlur = async () => {
    const url = formData.website_url.trim()
    if (!url || url.length < 8) return
    setDetectingBusiness(true)
    setDetectedBusinessType(null)
    try {
      const res = await api.post('/brand/scan-website', { website_url: url })
      const type = res.data?.business_type
      if (type) {
        const matched = BUSINESS_TYPES.find(b => b.toLowerCase() === type.toLowerCase()) ||
          BUSINESS_TYPES.find(b => b.toLowerCase().includes(type.toLowerCase()) || type.toLowerCase().includes(b.toLowerCase())) ||
          type
        setFormData(prev => ({ ...prev, business_type: matched }))
        setDetectedBusinessType(matched)
      }
    } catch {
      // silently fail — user can still pick manually
    } finally {
      setDetectingBusiness(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)

    try {
      await signup(formData)
      // Clear token — user must log in manually
      if (typeof window !== 'undefined') {
        localStorage.removeItem('brandflux_token')
        sessionStorage.removeItem('brandflux_token')
        document.cookie = 'brandflux_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT;'
        document.cookie = 'brandflux_onboarding_complete=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT;'
      }

      toast.success('Account created successfully! Please sign in.', {
        duration: 3000,
        icon: '🎉',
      })
      setTimeout(() => {
        router.push('/login')
      }, 1500)
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Something went wrong. Please try again.')
      setIsLoading(false)
    }
  }

  const selectHasValue = !!formData.business_type

  return (
    <div className="min-h-screen bg-bg flex flex-col justify-center py-12 px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-surface py-10 px-8 sm:px-10 shadow-2xl rounded-3xl border border-border">
          <div className="text-center mb-8">
            <Link href="/" className="inline-flex items-center gap-2.5 mb-3 group">
              <div className="h-9 w-9 rounded-xl bg-primary flex items-center justify-center font-bold text-white shadow-glow group-hover:scale-105 transition-transform">
                <Zap className="h-5 w-5 text-white" />
              </div>
              <span className="text-2xl font-extrabold text-text tracking-tight">Brandflux</span>
            </Link>
            <p className="text-sm text-muted font-medium">Start your AI brand journey</p>
          </div>

          <form className="space-y-4" onSubmit={handleSubmit}>
            {/* Full Name */}
            <div>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <User className="h-4.5 w-4.5 text-muted group-focus-within:text-accent transition-colors" />
                </div>
                <input
                  type="text"
                  required
                  className="block w-full pl-11 pr-4 py-3.5 border border-border rounded-xl leading-5 bg-surface-secondary focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all text-sm text-text placeholder-muted"
                  placeholder="Full name"
                  value={formData.full_name}
                  onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                />
              </div>
            </div>

            {/* Email */}
            <div>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Mail className="h-4.5 w-4.5 text-muted group-focus-within:text-accent transition-colors" />
                </div>
                <input
                  type="email"
                  required
                  className="block w-full pl-11 pr-4 py-3.5 border border-border rounded-xl leading-5 bg-surface-secondary focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all text-sm text-text placeholder-muted"
                  placeholder="Work email address"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Lock className="h-4.5 w-4.5 text-muted group-focus-within:text-accent transition-colors" />
                </div>
                <input
                  type="password"
                  required
                  className="block w-full pl-11 pr-4 py-3.5 border border-border rounded-xl leading-5 bg-surface-secondary focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all text-sm text-text placeholder-muted"
                  placeholder="Create a strong password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                />
              </div>
            </div>

            {/* Website URL */}
            <div>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Globe className="h-4.5 w-4.5 text-muted group-focus-within:text-accent transition-colors" />
                </div>
                {detectingBusiness && (
                  <div className="absolute inset-y-0 right-0 pr-4 flex items-center pointer-events-none">
                    <Loader2 className="h-4 w-4 animate-spin text-muted" />
                  </div>
                )}
                <input
                  type="url"
                  required
                  className="block w-full pl-11 pr-10 py-3.5 border border-border rounded-xl leading-5 bg-surface-secondary focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all text-sm text-text placeholder-muted"
                  placeholder="https://yourbrand.com"
                  value={formData.website_url}
                  onChange={(e) => setFormData({ ...formData, website_url: e.target.value })}
                  onBlur={handleWebsiteBlur}
                />
              </div>
              {detectedBusinessType ? (
                <p className="mt-1.5 text-xs text-success font-semibold flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  <span>Detected type: {detectedBusinessType}</span>
                </p>
              ) : (
                <p className="mt-1.5 text-[11px] text-muted">
                  We&apos;ll analyze your website to configure your brand colors and voice.
                </p>
              )}
            </div>

            {/* Business Type */}
            <div>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Briefcase className="h-4.5 w-4.5 text-muted group-focus-within:text-accent transition-colors" />
                </div>
                <select
                  value={formData.business_type}
                  onChange={(e) => {
                    setFormData({ ...formData, business_type: e.target.value })
                    setDetectedBusinessType(null)
                  }}
                  className={`block w-full pl-11 pr-10 py-3.5 border border-border rounded-xl leading-5 bg-surface-secondary focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all text-sm appearance-none cursor-pointer ${
                    selectHasValue ? 'text-text' : 'text-muted'
                  }`}
                >
                  <option value="" disabled className="bg-surface text-muted">
                    Select business type
                  </option>
                  {BUSINESS_TYPES.map((bt) => (
                    <option key={bt} value={bt} className="bg-surface text-text">
                      {bt}
                    </option>
                  ))}
                </select>
                <div className="absolute inset-y-0 right-0 pr-4 flex items-center pointer-events-none">
                  <svg className="h-4 w-4 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>
            </div>

            {error && (
              <div className="text-danger text-xs font-semibold text-center bg-danger/10 py-2.5 px-3 rounded-xl border border-danger/20">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full mt-2 py-3.5 px-4 bg-accent hover:bg-accent-hover text-black font-extrabold text-sm rounded-xl transition-all shadow-accent-glow active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <Loader2 className="animate-spin h-4 w-4" />
                  <span>Creating your account...</span>
                </>
              ) : (
                'Create Account'
              )}
            </button>
          </form>

          <div className="mt-8 text-center text-xs text-muted">
            Already have an account?{' '}
            <Link href="/login" className="text-accent hover:underline font-bold">
              Sign in instead
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
