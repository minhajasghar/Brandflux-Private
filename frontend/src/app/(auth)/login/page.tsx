'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { login } from '@/lib/api'
import BrandfluxLogo from '@/components/shared/BrandfluxLogo'
import { Loader2, Mail, Lock, Zap } from 'lucide-react'

export default function LoginPage() {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [formData, setFormData] = useState({
    email: '',
    password: ''
  })

  const [rememberMe, setRememberMe] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)

    try {
      const data = await login(formData, rememberMe)
      if (!data.is_approved && data.role !== 'admin') {
        window.location.href = '/payment'
        return
      }
      const target = data.role === 'admin' 
        ? '/admin' 
        : data.onboarding_complete 
        ? '/dashboard' 
        : '/onboarding'
      window.location.href = target
    } catch (err: any) {
      const msg = err.code === 'ECONNABORTED'
        ? 'Connection timed out. Please check that the server is reachable.'
        : err.response?.data?.detail || err.message || 'Invalid email or password'
      setError(msg)
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-bg flex flex-col justify-center py-8 sm:py-12 px-4 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-surface py-8 sm:py-10 px-5 sm:px-10 shadow-2xl rounded-2xl sm:rounded-3xl border border-border">
          <div className="text-center mb-8">
            <Link href="/" className="inline-flex items-center gap-2.5 mb-3 group">
              <BrandfluxLogo size={36} />
              <span className="text-2xl font-extrabold text-text tracking-tight">Brandflux</span>
            </Link>
            <p className="text-sm text-muted font-medium">Welcome back! Sign in to your account.</p>
          </div>

          <form className="space-y-5" onSubmit={handleSubmit}>
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
                  <Lock className="h-4.5 w-4.5 text-muted group-focus-within:text-accent transition-colors" />
                </div>
                <input
                  type="password"
                  required
                  className="block w-full pl-11 pr-4 py-3.5 border border-border rounded-xl leading-5 bg-surface-secondary focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all text-sm text-text placeholder-muted"
                  placeholder="Password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                />
              </div>
            </div>

            {/* Remember Me Checkbox */}
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <input
                  id="remember-me"
                  name="remember-me"
                  type="checkbox"
                  className="h-4 w-4 rounded border-border bg-surface-secondary text-accent focus:ring-accent cursor-pointer accent-[#D4FF24]"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                />
                <label htmlFor="remember-me" className="ml-2.5 block text-xs text-muted font-medium cursor-pointer select-none">
                  Remember Me
                </label>
              </div>
            </div>

            {error && (
              <div className={`text-xs font-semibold p-3.5 rounded-xl border ${
                error.toLowerCase().includes('pending') || error.toLowerCase().includes('approval') || error.toLowerCase().includes('locked')
                  ? 'bg-amber-500/10 border-amber-500/30 text-amber-300 text-left space-y-1'
                  : 'bg-danger/10 border-danger/20 text-danger text-center py-2.5 px-3'
              }`}>
                {error.toLowerCase().includes('pending') || error.toLowerCase().includes('approval') || error.toLowerCase().includes('locked') ? (
                  <>
                    <p className="font-extrabold text-amber-200 flex items-center gap-1.5">
                      <span>🔒 Account Pending Admin Approval</span>
                    </p>
                    <p className="text-[11px] font-medium text-amber-300/90 leading-relaxed">
                      {error}
                    </p>
                  </>
                ) : (
                  error
                )}
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3.5 px-4 bg-accent hover:bg-accent-hover text-black font-extrabold text-sm rounded-xl transition-all shadow-accent-glow active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <Loader2 className="animate-spin h-4 w-4" />
                  <span>Signing in...</span>
                </>
              ) : (
                'Sign In'
              )}
            </button>
          </form>

          <div className="mt-8 text-center text-xs text-muted">
            Don&apos;t have an account?{' '}
            <Link href="/signup" className="text-accent hover:underline font-bold">
              Sign up
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
