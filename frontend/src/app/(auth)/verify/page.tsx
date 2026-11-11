'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { 
  CheckCircle2, 
  Mail, 
  AlertCircle, 
  Loader2, 
  ArrowRight, 
  Sparkles, 
  Zap, 
  RefreshCw 
} from 'lucide-react'
import { verifyEmail, getVerifyInfo, resendVerification } from '@/lib/api'
import { toast } from 'react-hot-toast'
import Cookies from 'js-cookie'

function VerifyContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const tokenFromUrl = searchParams.get('token')
  const emailFromUrl = searchParams.get('email')

  const [token, setToken] = useState(tokenFromUrl || '')
  const [email, setEmail] = useState(emailFromUrl || '')
  const [isVerifying, setIsVerifying] = useState(false)
  const [verifiedSuccess, setVerifiedSuccess] = useState(false)
  const [isApproved, setIsApproved] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  
  // Dev mode helper state
  const [isDevMode, setIsDevMode] = useState(false)
  const [devToken, setDevToken] = useState<string | null>(null)
  const [isResending, setIsResending] = useState(false)

  // 1. Auto-verify if token is present in URL
  useEffect(() => {
    if (tokenFromUrl) {
      handleVerify(tokenFromUrl)
    } else if (emailFromUrl) {
      fetchDevInfo(emailFromUrl)
    }
  }, [tokenFromUrl, emailFromUrl])

  const fetchDevInfo = async (userEmail: string) => {
    try {
      const info = await getVerifyInfo(userEmail)
      if (info.dev_mode) {
        setIsDevMode(true)
        if (info.verification_token) {
          setDevToken(info.verification_token)
        }
      }
      if (info.is_verified) {
        setVerifiedSuccess(true)
      }
    } catch {
      // Ignore
    }
  }

  const handleVerify = async (tokenToUse: string) => {
    setIsVerifying(true)
    setErrorMessage(null)
    try {
      const res = await verifyEmail(tokenToUse)
      setVerifiedSuccess(true)
      const approved = Boolean(res.is_approved || res.role === 'admin')
      setIsApproved(approved)

      if (approved) {
        toast.success('Email verified! 🎉')
        if (res.token) {
          localStorage.setItem('brandflux_token', res.token)
          sessionStorage.setItem('brandflux_token', res.token)
          Cookies.set('brandflux_token', res.token, { expires: 7 })
          Cookies.set('brandflux_user_role', res.role || 'user', { expires: 7 })
          Cookies.set('brandflux_onboarding_complete', String(Boolean(res.onboarding_complete)), { expires: 7 })
        }
        setTimeout(() => {
          if (res.role === 'admin') {
            router.push('/admin')
          } else if (!res.onboarding_complete) {
            router.push('/onboarding')
          } else {
            router.push('/dashboard')
          }
        }, 2000)
      } else {
        toast.success('Email verified! Awaiting administrator approval.', { duration: 5000 })
      }
    } catch (err: any) {
      setErrorMessage(err.response?.data?.detail || 'Invalid or expired verification link.')
    } finally {
      setIsVerifying(false)
    }
  }

  const handleResend = async () => {
    if (!email) {
      toast.error('Email is required to resend verification.')
      return
    }
    setIsResending(true)
    try {
      await resendVerification(email)
      toast.success('A new verification email has been captured!')
      fetchDevInfo(email)
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to resend verification.')
    } finally {
      setIsResending(false)
    }
  }

  return (
    <div className="min-h-screen bg-bg flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-surface py-10 px-6 sm:px-10 shadow-2xl rounded-3xl border border-border text-center">
          
          {/* Top Logo / Icon */}
          <div className="flex justify-center mb-6">
            {verifiedSuccess ? (
              <div className="h-16 w-16 rounded-3xl bg-success/15 border border-success/30 flex items-center justify-center text-success animate-bounce">
                <CheckCircle2 className="h-8 w-8" />
              </div>
            ) : isVerifying ? (
              <div className="h-16 w-16 rounded-3xl bg-primary/15 border border-primary/30 flex items-center justify-center text-primary-light">
                <Loader2 className="h-8 w-8 animate-spin" />
              </div>
            ) : errorMessage ? (
              <div className="h-16 w-16 rounded-3xl bg-danger/15 border border-danger/30 flex items-center justify-center text-danger">
                <AlertCircle className="h-8 w-8" />
              </div>
            ) : (
              <div className="h-16 w-16 rounded-3xl bg-primary/15 border border-primary/30 flex items-center justify-center text-primary-light">
                <Mail className="h-8 w-8" />
              </div>
            )}
          </div>

          {/* Title & Body */}
          {verifiedSuccess ? (
            <div className="space-y-3">
              <h2 className="text-2xl font-black text-text">
                {isApproved ? 'Email Verified!' : 'Email Verified — Pending Approval'}
              </h2>
              <p className="text-sm text-muted">
                {isApproved 
                  ? 'Your account is activated. Redirecting you to your workspace...'
                  : 'Your email has been confirmed! New accounts remain locked until reviewed and approved by an administrator. You will gain access as soon as your account is approved.'}
              </p>
              <div className="pt-4 flex justify-center">
                <Link
                  href={isApproved ? '/dashboard' : '/login'}
                  className="px-6 py-2.5 rounded-xl bg-primary hover:bg-primary-hover text-white text-xs font-bold transition flex items-center gap-2"
                >
                  <span>{isApproved ? 'Continue to Brandflux' : 'Return to Login'}</span>
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
          ) : isVerifying ? (
            <div className="space-y-3">
              <h2 className="text-2xl font-black text-text">Verifying Email...</h2>
              <p className="text-sm text-muted">
                Confirming your token with the server. Please wait a moment.
              </p>
            </div>
          ) : errorMessage ? (
            <div className="space-y-4">
              <h2 className="text-xl font-black text-text">Verification Issue</h2>
              <div className="p-3.5 rounded-xl bg-danger/10 border border-danger/25 text-danger text-xs font-medium">
                {errorMessage}
              </div>
              <p className="text-xs text-muted">
                The link may have expired (24h limit) or was already used.
              </p>
              <div className="pt-2 flex flex-col gap-2">
                {email && (
                  <button
                    onClick={handleResend}
                    disabled={isResending}
                    className="w-full py-2.5 rounded-xl bg-primary hover:bg-primary-hover text-white text-xs font-bold transition flex items-center justify-center gap-2"
                  >
                    {isResending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                    <span>Resend Verification Link</span>
                  </button>
                )}
                <Link
                  href="/login"
                  className="text-xs font-semibold text-muted hover:text-text transition"
                >
                  Return to Sign In
                </Link>
              </div>
            </div>
          ) : (
            <div className="space-y-4 text-left">
              <h2 className="text-2xl font-black text-text text-center">Check Your Email</h2>
              <p className="text-xs text-muted text-center leading-relaxed">
                We sent a verification link to <strong className="text-text">{email || 'your email'}</strong>. Click the link in the message to activate your account.
              </p>

              {/* Dev Mode Callout Banner */}
              {isDevMode && (
                <div className="p-4 rounded-2xl bg-blue-500/10 border border-blue-500/30 space-y-3 mt-4">
                  <div className="flex items-center gap-2 text-blue-400 font-bold text-xs">
                    <Sparkles className="h-4 w-4" />
                    <span>Dev Mode Active (No real emails sent)</span>
                  </div>
                  <p className="text-[11px] text-muted leading-relaxed">
                    This verification email was captured in your admin <strong className="text-text">Emails (Dev Outbox)</strong>. You can verify immediately below:
                  </p>

                  {devToken ? (
                    <button
                      onClick={() => handleVerify(devToken)}
                      className="w-full py-2.5 rounded-xl bg-accent hover:bg-accent-hover text-black font-extrabold text-xs transition shadow-sm flex items-center justify-center gap-2"
                    >
                      <Zap className="h-4 w-4" />
                      <span>Verify now (dev)</span>
                    </button>
                  ) : (
                    <div className="text-[11px] text-muted font-mono">
                      Awaiting token capture...
                    </div>
                  )}
                </div>
              )}

              <div className="pt-4 border-t border-border flex items-center justify-between text-xs">
                <button
                  onClick={handleResend}
                  disabled={isResending}
                  className="text-muted hover:text-text font-semibold flex items-center gap-1.5 transition"
                >
                  {isResending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  <span>Resend email</span>
                </button>

                <Link
                  href="/login"
                  className="text-primary-light hover:underline font-bold"
                >
                  Sign In instead
                </Link>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}

export default function VerifyPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-bg flex items-center justify-center text-muted">
        <Loader2 className="h-6 w-6 animate-spin text-accent" />
      </div>
    }>
      <VerifyContent />
    </Suspense>
  )
}

