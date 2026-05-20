'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { signup } from '@/lib/api'
import api from '@/lib/api'
import { Loader2, User, Mail, Lock, Globe, Briefcase } from 'lucide-react'
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

  // ISSUE 4: Auto-detect business type from URL
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
        setFormData(prev => ({ ...prev, business_type: type }))
        setDetectedBusinessType(type)
      }
    } catch {
      // silently fail — user can still pick manually
    } finally {
      setDetectingBusiness(false)
    }
  }

  // ISSUE 1: Show success toast then redirect to /login
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
      // Redirect to /login after 2 seconds
      setTimeout(() => {
        router.push('/login')
      }, 2000)
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Something went wrong. Please try again.')
      setIsLoading(false)
    }
  }

  // ISSUE 2 & 3: Select styling — controlled value with visible placeholder color
  const selectHasValue = !!formData.business_type

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-10 px-10 shadow-xl rounded-3xl border border-gray-100">
          <div className="text-center mb-10">
            <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">Brandflux</h1>
            <p className="mt-2 text-sm text-gray-500 font-medium">Start Your Brand Journey</p>
          </div>

          <form className="space-y-5" onSubmit={handleSubmit}>
            {/* Full Name */}
            <div>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <User className="h-5 w-5 text-gray-400 group-focus-within:text-black transition-colors" />
                </div>
                <input
                  type="text"
                  required
                  className="block w-full pl-11 pr-4 py-3.5 border border-gray-200 rounded-xl leading-5 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-black focus:bg-white transition-all text-sm text-gray-900 placeholder-[#9CA3AF]"
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
                  <Mail className="h-5 w-5 text-gray-400 group-focus-within:text-black transition-colors" />
                </div>
                <input
                  type="email"
                  required
                  className="block w-full pl-11 pr-4 py-3.5 border border-gray-200 rounded-xl leading-5 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-black focus:bg-white transition-all text-sm text-gray-900 placeholder-[#9CA3AF]"
                  placeholder="Email address"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 text-gray-400 group-focus-within:text-black transition-colors" />
                </div>
                <input
                  type="password"
                  required
                  className="block w-full pl-11 pr-4 py-3.5 border border-gray-200 rounded-xl leading-5 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-black focus:bg-white transition-all text-sm text-gray-900 placeholder-[#9CA3AF]"
                  placeholder="Password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                />
              </div>
            </div>

            {/* Website URL — ISSUE 4: onBlur triggers auto-detect */}
            <div>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Globe className="h-5 w-5 text-gray-400 group-focus-within:text-black transition-colors" />
                </div>
                {detectingBusiness && (
                  <div className="absolute inset-y-0 right-0 pr-4 flex items-center pointer-events-none">
                    <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                  </div>
                )}
                <input
                  type="url"
                  required
                  className="block w-full pl-11 pr-10 py-3.5 border border-gray-200 rounded-xl leading-5 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-black focus:bg-white transition-all text-sm text-gray-900 placeholder-[#9CA3AF]"
                  placeholder="https://yourbusiness.com"
                  value={formData.website_url}
                  onChange={(e) => setFormData({ ...formData, website_url: e.target.value })}
                  onBlur={handleWebsiteBlur}
                />
              </div>
              {detectedBusinessType && (
                <p className="mt-1.5 text-xs text-green-600 font-semibold flex items-center gap-1">
                  ✓ Business type detected: {detectedBusinessType}
                </p>
              )}
              {!detectedBusinessType && (
                <p className="mt-1.5 text-[11px] text-gray-500 font-medium">
                  We&apos;ll analyze your website to set up your brand automatically.
                </p>
              )}
            </div>

            {/* Business Type — ISSUE 2 & 3: Correct color, correct value binding */}
            <div>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Briefcase className="h-5 w-5 text-gray-400 group-focus-within:text-black transition-colors" />
                </div>
                <select
                  value={formData.business_type}
                  onChange={(e) => {
                    setFormData({ ...formData, business_type: e.target.value })
                    setDetectedBusinessType(null)
                  }}
                  style={{
                    color: selectHasValue ? '#111827' : '#6B7280',
                  }}
                  className="block w-full pl-11 pr-4 py-3.5 border border-gray-200 rounded-xl leading-5 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-black focus:bg-white transition-all text-sm appearance-none cursor-pointer"
                >
                  <option value="" disabled style={{ color: '#6B7280' }}>
                    Select business type
                  </option>
                  {BUSINESS_TYPES.map((bt) => (
                    <option key={bt} value={bt} style={{ color: '#111827' }}>
                      {bt}
                    </option>
                  ))}
                </select>
                {/* Custom dropdown arrow */}
                <div className="absolute inset-y-0 right-0 pr-4 flex items-center pointer-events-none">
                  <svg className="h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>
            </div>

            {error && (
              <div className="text-red-500 text-xs font-bold text-center bg-red-50 py-2 rounded-lg">
                {error}
              </div>
            )}

            {/* ISSUE 8: Button with transition, active scale, disabled state */}
            <div>
              <button
                type="submit"
                disabled={isLoading}
                className="w-full flex justify-center items-center py-4 px-4 border border-transparent rounded-xl shadow-sm text-sm font-bold text-white bg-black hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-black disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-[150ms] ease-in-out active:scale-[0.98]"
              >
                {isLoading ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  'Create Account'
                )}
              </button>
            </div>
          </form>

          <div className="mt-8 text-center">
            <p className="text-sm text-gray-500 font-medium">
              Already have an account?{' '}
              <Link href="/login" className="text-black font-bold hover:underline">
                Sign in instead
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
