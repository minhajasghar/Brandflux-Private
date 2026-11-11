'use client'

import { useState, useEffect } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import Cookies from 'js-cookie'
import {
  CheckCircle2,
  AlertTriangle,
  Lock,
  User,
  ArrowRight,
  Shield,
  RefreshCw
} from 'lucide-react'
import { getInviteDetails, acceptInvite } from '@/lib/api'
import toast from 'react-hot-toast'

export default function AcceptInvitePage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const token = searchParams.get('token')

  const [loading, setLoading] = useState(true)
  const [details, setDetails] = useState<any>(null)
  const [errorMsg, setErrorMsg] = useState('')

  const [fullName, setFullName] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!token) {
      setErrorMsg('No invitation token was provided in the link.')
      setLoading(false)
      return
    }

    const checkToken = async () => {
      try {
        setLoading(true)
        const data = await getInviteDetails(token)
        setDetails(data)
        if (!data.valid) {
          setErrorMsg(
            data.is_expired
              ? 'This invitation link has expired (7-day validity). Please ask the brand creator to resend your invite.'
              : 'This invitation has already been accepted or is no longer valid.'
          )
        }
      } catch (err: any) {
        setErrorMsg(err.response?.data?.detail || 'Invalid or expired invitation token.')
      } finally {
        setLoading(false)
      }
    }

    checkToken()
  }, [token])

  const handleAccept = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!token) return

    try {
      setSubmitting(true)
      const res = await acceptInvite({
        token,
        full_name: fullName.trim() || undefined,
        password: password || undefined
      })

      // Store tokens
      if (res.token) {
        Cookies.set('brandflux_token', res.token, { expires: 7 })
        Cookies.set('brandflux_onboarding_complete', 'true', { expires: 7 })
        localStorage.setItem('brandflux_token', res.token)
        sessionStorage.setItem('brandflux_token', res.token)
      }

      toast.success('Welcome! Your approver access is activated.')
      // Direct navigation to /approvals without onboarding
      router.push(res.redirect || '/approvals')
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to accept invitation.')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center p-4">
        <div className="flex items-center gap-3 text-muted text-sm">
          <RefreshCw className="h-5 w-5 animate-spin text-accent" />
          <span>Verifying invitation token...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-bg flex flex-col justify-center items-center p-4 sm:p-6">
      <div className="w-full max-w-md space-y-6">
        {/* Brand Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center h-12 w-12 rounded-2xl bg-accent text-black font-extrabold text-2xl shadow-accent-glow mb-1">
            ⚡
          </div>
          <h1 className="text-2xl font-extrabold text-text">Team Workspace Invitation</h1>
          <p className="text-xs text-muted">Brandflux Collaborative Social Suite</p>
        </div>

        {errorMsg ? (
          <div className="p-6 rounded-2xl bg-surface border border-border text-center space-y-4">
            <div className="h-12 w-12 rounded-full bg-red-500/10 text-red-400 mx-auto flex items-center justify-center">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <h2 className="text-base font-bold text-text">Invitation Unavailable</h2>
            <p className="text-xs text-muted leading-relaxed">{errorMsg}</p>
            <div className="pt-2">
              <Link
                href="/login"
                className="inline-block px-5 py-2.5 rounded-xl bg-surface-secondary border border-border text-xs font-bold text-text hover:bg-surface-hover transition"
              >
                Go to Login
              </Link>
            </div>
          </div>
        ) : (
          <div className="p-6 rounded-2xl bg-surface border border-border shadow-xl space-y-6">
            {/* Invitation Details Banner */}
            <div className="p-4 rounded-xl bg-surface-secondary border border-border/80 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted">Brand Workspace</span>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-500/15 text-blue-400 border border-blue-500/30">
                  Approver Role
                </span>
              </div>
              <div className="text-base font-bold text-text">{details.brand_name}</div>
              <p className="text-xs text-muted">
                Invited by <strong className="text-text">{details.inviter_name}</strong> for <code className="text-accent">{details.invited_email}</code>.
              </p>
            </div>

            <form onSubmit={handleAccept} className="space-y-4">
              {!details.user_exists && (
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-text">Your Full Name</label>
                  <div className="relative">
                    <User className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
                    <input
                      type="text"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Jane Doe"
                      required
                      className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-surface-secondary border border-border text-text placeholder-muted text-sm focus:outline-none focus:border-accent"
                    />
                  </div>
                </div>
              )}

              <div className="space-y-1">
                <label className="text-xs font-semibold text-text">
                  {details.user_exists ? 'Enter your account password to verify' : 'Create a secure password'}
                </label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    minLength={6}
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-surface-secondary border border-border text-text placeholder-muted text-sm focus:outline-none focus:border-accent"
                  />
                </div>
              </div>

              <div className="p-3 rounded-xl bg-surface-secondary/40 border border-border text-[11px] text-muted flex items-start gap-2">
                <Shield className="h-4 w-4 text-accent shrink-0 mt-0.5" />
                <span>
                  By accepting, you gain instant access to the Approvals review screen for {details.brand_name}. You will bypass onboarding questions.
                </span>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-3 rounded-xl bg-accent text-black font-extrabold text-sm hover:bg-accent/90 transition shadow-accent-glow flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {submitting ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    <span>Activating Access...</span>
                  </>
                ) : (
                  <>
                    <span>Accept Invitation & Open Approvals</span>
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  )
}
