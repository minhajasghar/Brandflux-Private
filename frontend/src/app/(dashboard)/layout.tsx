'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { 
  LayoutDashboard, 
  Lightbulb, 
  Calendar, 
  Settings, 
  LogOut, 
  Sparkles,
  Zap,
  Menu,
  X,
  User,
  BarChart3,
  ShieldAlert
} from 'lucide-react'
import Cookies from 'js-cookie'
import { getProfile, getUserCredits } from '@/lib/api'
import BottomNav from '@/components/shared/BottomNav'
import BrandSwitcher from '@/components/layout/BrandSwitcher'
import NotificationBell from '@/components/notifications/NotificationBell'
import BrandfluxLogo from '@/components/shared/BrandfluxLogo'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const router = useRouter()
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [userEmail, setUserEmail] = useState('')
  const [userPlan, setUserPlan] = useState('FREE')
  const [userRole, setUserRole] = useState('user')
  const [creditBalance, setCreditBalance] = useState<number | null>(null)
  const [isLowBalance, setIsLowBalance] = useState(false)
  
  const isOnboarding = pathname === '/onboarding'

  useEffect(() => {
    const verifyAuth = async () => {
      let token = null
      if (typeof window !== 'undefined') {
        token = localStorage.getItem('brandflux_token') || sessionStorage.getItem('brandflux_token')
      }

      if (!token) {
        Cookies.remove('brandflux_token')
        Cookies.remove('brandflux_onboarding_complete')
        if (typeof window !== 'undefined') {
          localStorage.removeItem('brandflux_token')
          sessionStorage.removeItem('brandflux_token')
        }
        router.push('/login')
        return
      }

      try {
        const profile = await getProfile()
        if (profile && profile.user) {
          const userRole = profile.user.role || 'user'
          setUserEmail(profile.user.email)
          setUserPlan(profile.user.plan ? profile.user.plan.toUpperCase() : 'FREE')
          setUserRole(userRole)

          // Admin users must never open user routes - redirect immediately to /admin
          if (userRole === 'admin' || userRole === 'support_admin') {
            document.cookie = `brandflux_user_role=${userRole}; path=/; max-age=604800;`
            router.replace('/admin')
            return
          }

          document.cookie = `brandflux_user_role=${userRole}; path=/; max-age=604800;`

          const onboardingComplete = Boolean(profile.brand?.onboarding_complete)
          const isCurrentlyOnboarding = pathname === '/onboarding'

          if (!onboardingComplete && !isCurrentlyOnboarding) {
            document.cookie = 'brandflux_onboarding_complete=false; path=/;'
            router.push('/onboarding')
          } else if (onboardingComplete && isCurrentlyOnboarding) {
            document.cookie = 'brandflux_onboarding_complete=true; path=/; max-age=604800;'
            router.push('/dashboard')
          }

          // Fetch authoritative credit ledger balance
          try {
            const credData = await getUserCredits()
            if (credData && typeof credData.balance === 'number') {
              setCreditBalance(credData.balance)
              setIsLowBalance(Boolean(credData.is_low_balance))
            }
          } catch (credErr) {
            console.error('Failed to load credit balance:', credErr)
          }
        }
      } catch (err: any) {
        console.error('Auth verification failed in layout:', err)
        if (typeof window !== 'undefined') {
          localStorage.removeItem('brandflux_token')
          sessionStorage.removeItem('brandflux_token')
        }
        Cookies.remove('brandflux_token')
        Cookies.remove('brandflux_onboarding_complete')
        router.push('/login')
      }
    }

    verifyAuth()

    const handleCreditsEvent = () => {
      getUserCredits().then((c) => {
        if (c && typeof c.balance === 'number') {
          setCreditBalance(c.balance)
          setIsLowBalance(Boolean(c.is_low_balance))
        }
      }).catch(() => {})
    }
    window.addEventListener('brandflux:credits_updated', handleCreditsEvent)
    return () => {
      window.removeEventListener('brandflux:credits_updated', handleCreditsEvent)
    }
  }, [pathname, router])

  const handleLogout = () => {
    Cookies.remove('brandflux_token')
    Cookies.remove('brandflux_onboarding_complete')
    if (typeof window !== 'undefined') {
      localStorage.removeItem('brandflux_token')
      sessionStorage.removeItem('brandflux_token')
    }
    router.push('/login')
  }

  const navItems = [
    { icon: LayoutDashboard, label: 'Dashboard', href: '/dashboard' },
    { icon: Sparkles, label: 'Create Content', href: '/session' },
    { icon: Lightbulb, label: 'Content History', href: '/ideas' },
    { icon: Calendar, label: 'Content Calendar', href: '/calendar' },
    { icon: BarChart3, label: 'Analytics', href: '/analytics' },
    { icon: Settings, label: 'Brand Studio Settings', href: '/settings' },
  ]

  if (isOnboarding) return <>{children}</>

  return (
    <div className="flex min-h-screen bg-bg text-text overflow-x-hidden">
      {/* ─── SIDEBAR ─── */}
      <aside className={`w-64 border-r border-border flex flex-col fixed inset-y-0 z-50 bg-surface transition-transform duration-300 md:translate-x-0 ${
        isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
      }`}>
        {/* Sidebar Header */}
        <div className="p-6 flex items-center justify-between border-b border-border">
          <Link href="/dashboard" className="flex items-center gap-3 group" onClick={() => setIsMobileMenuOpen(false)}>
            <div className="h-9 w-9 rounded-xl bg-primary flex items-center justify-center font-bold text-white shadow-glow group-hover:scale-105 transition-transform duration-200">
              <Zap className="h-5 w-5 text-white" />
            </div>
            <span className="text-xl font-extrabold tracking-tight text-text">
            <BrandfluxLogo size={36} />
            <span className="text-xl font-extrabold tracking-tight text-text group-hover:text-white transition-colors">
              Brandflux
            </span>
          </Link>
          <button 
            onClick={() => setIsMobileMenuOpen(false)}
            className="md:hidden p-1.5 rounded-lg bg-surface-secondary border border-border hover:bg-surface-hover transition"
            aria-label="Close menu"
          >
            <X className="h-5 w-5 text-muted" />
          </button>
        </div>

        {/* Navigation Section */}
        <nav className="flex-1 px-4 space-y-1.5 mt-6 overflow-y-auto">
          {navItems.map((item) => {
            const isActive = pathname === item.href

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setIsMobileMenuOpen(false)}
                className={`flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all duration-200 text-sm group ${
                  isActive 
                    ? 'bg-surface-secondary text-text border border-border font-bold shadow-sm' 
                    : 'text-muted hover:text-text hover:bg-surface-secondary/70 font-medium'
                }`}
              >
                <item.icon className={`h-4.5 w-4.5 transition-colors ${isActive ? 'text-accent' : 'text-muted group-hover:text-text'}`} />
                <span>{item.label}</span>
              </Link>
            )
          })}
        </nav>

        {/* Sidebar Bottom (User details + Logout) */}
        <div className="p-4 border-t border-border space-y-3">
          <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-surface-secondary border border-border">
            <div className="h-8 w-8 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center">
              <User className="h-4 w-4 text-text" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-text truncate" title={userEmail}>
                {userEmail || 'guest@brandflux.ai'}
              </p>
              <div className="mt-0.5 flex items-center gap-1.5">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-success" />
                <span className="text-[10px] font-bold text-muted tracking-wider">
                  {userPlan} PLAN
                </span>
              </div>
            </div>
          </div>

          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-3 px-3 py-2 rounded-xl text-muted hover:text-danger hover:bg-danger-muted transition-all duration-200 text-xs font-semibold"
          >
            <LogOut className="h-4 w-4" />
            <span>Logout</span>
          </button>
        </div>
      </aside>

      {/* Mobile Drawer Overlay */}
      {isMobileMenuOpen && (
        <div 
          onClick={() => setIsMobileMenuOpen(false)}
          className="fixed inset-0 bg-black/70 backdrop-blur-sm z-40 md:hidden"
        />
      )}

      {/* ─── MAIN CONTENT ─── */}
      <div className="flex-1 md:ml-64 min-h-screen flex flex-col">
        {/* Sticky Header */}
        <header className="h-16 border-b border-border flex items-center justify-between px-3.5 sm:px-6 md:px-8 sticky top-0 bg-bg/85 backdrop-blur-md z-30">
          <div className="flex items-center gap-2 sm:gap-4 min-w-0">
            <button
              onClick={() => setIsMobileMenuOpen(true)}
              className="md:hidden p-2 rounded-xl bg-surface border border-border hover:bg-surface-secondary transition shrink-0"
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5 text-text" />
            </button>
            
            {/* Top-Bar Brand Switcher */}
            <BrandSwitcher />

            <div className="hidden xl:flex items-center gap-2 text-[11px] font-bold text-muted uppercase tracking-wider bg-surface px-3 py-1.5 rounded-full border border-border">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
              Live Brand Sync Active
            </div>
          </div>
          
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {/* Post Credits Pill */}
            <Link
              href="/settings?tab=billing"
              className={`px-2.5 sm:px-3 py-1 rounded-full border text-[11px] sm:text-xs font-bold flex items-center gap-1.5 transition ${
                creditBalance !== null && creditBalance <= 0
                  ? 'bg-danger/10 border-danger/30 text-danger hover:bg-danger/20'
                  : isLowBalance
                  ? 'bg-amber-500/10 border-amber-500/30 text-amber-400 hover:bg-amber-500/20'
                  : 'bg-surface-secondary border-border text-text hover:border-accent/40'
              }`}
              title="Your remaining post credits"
            >
              <Zap className={`h-3 w-3 ${creditBalance !== null && creditBalance <= 0 ? 'text-danger' : isLowBalance ? 'text-amber-400' : 'text-accent'}`} />
              <span>{creditBalance !== null ? `${creditBalance} post credits` : '...'}</span>
            </Link>

            {/* In-App Notification Center Bell */}
            <NotificationBell />

            <div className="px-2.5 sm:px-3 py-1 rounded-full bg-surface-secondary border border-border text-[11px] sm:text-xs font-bold text-text flex items-center gap-1.5 sm:gap-2">
              <span className="text-accent">●</span>
              <span>{userPlan}</span>
            </div>
          </div>
        </header>

        {/* Main Slot page */}
        <main className="flex-1 p-3.5 sm:p-6 lg:p-8 pb-24 md:pb-8 max-w-[1600px] w-full mx-auto">
          {children}
        </main>
      </div>
      
      {/* Mobile Bottom Navigation */}
      <BottomNav />
    </div>
  )
}
