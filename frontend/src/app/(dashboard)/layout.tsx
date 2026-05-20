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
  User
} from 'lucide-react'
import Cookies from 'js-cookie'
import { getProfile } from '@/lib/api'
import BottomNav from '@/components/shared/BottomNav'

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
  
  const isOnboarding = pathname === '/onboarding'

  useEffect(() => {
    const verifyAuth = async () => {
      // 1. Check client-side storage for token
      let token = null
      if (typeof window !== 'undefined') {
        token = localStorage.getItem('brandflux_token') || sessionStorage.getItem('brandflux_token')
      }

      // If no token, clear up storage & redirect to /login
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

      // 2. Call GET /auth/me to verify token
      try {
        const profile = await getProfile()
        if (profile && profile.user) {
          setUserEmail(profile.user.email)
          setUserPlan(profile.user.plan ? profile.user.plan.toUpperCase() : 'FREE')

          // Verify onboarding complete status
          const onboardingComplete = profile.brand?.onboarding_complete
          const isCurrentlyOnboarding = pathname === '/onboarding'

          if (!onboardingComplete && !isCurrentlyOnboarding) {
            // Force onboarding complete cookie to be false
            document.cookie = 'brandflux_onboarding_complete=false; path=/;'
            router.push('/onboarding')
          } else if (onboardingComplete && isCurrentlyOnboarding) {
            // Force onboarding complete cookie to be true
            document.cookie = 'brandflux_onboarding_complete=true; path=/; max-age=604800;'
            router.push('/dashboard')
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
    { icon: Sparkles, label: 'Create Content', href: '/session', isHighlighted: true },
    { icon: Lightbulb, label: 'My Ideas', href: '/ideas' },
    { icon: Calendar, label: 'Calendar', href: '/calendar' },
    { icon: Settings, label: 'Settings', href: '/settings' },
  ]

  if (isOnboarding) return <>{children}</>

  return (
    <div className="flex min-h-screen bg-[#060608] text-white overflow-x-hidden">
      {/* ─── SIDEBAR (Desktop: Fixed 64w, Mobile: hidden drawer) ─── */}
      <aside className={`w-64 border-r border-white/5 flex flex-col fixed inset-y-0 z-50 bg-[#060608] transition-transform duration-300 md:translate-x-0 ${
        isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
      }`}>
        {/* Sidebar Header */}
        <div className="p-6 flex items-center justify-between border-b border-white/5">
          <Link href="/dashboard" className="flex items-center gap-3 group" onClick={() => setIsMobileMenuOpen(false)}>
            <div className="h-9 w-9 rounded-xl bg-gradient-to-tr from-blue-600 via-indigo-500 to-purple-600 flex items-center justify-center font-bold shadow-lg shadow-indigo-500/20 group-hover:scale-105 transition-transform duration-300">
              <Zap className="h-5 w-5 text-white" />
            </div>
            <span className="text-xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white via-gray-200 to-gray-400">
              Brandflux
            </span>
          </Link>
          <button 
            onClick={() => setIsMobileMenuOpen(false)}
            className="md:hidden p-1.5 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 transition"
          >
            <X className="h-5 w-5 text-gray-400" />
          </button>
        </div>

        {/* Navigation Section */}
        <nav className="flex-1 px-4 space-y-2.5 mt-8 overflow-y-auto">
          {navItems.map((item) => {
            const isActive = pathname === item.href
            
            if (item.isHighlighted) {
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setIsMobileMenuOpen(false)}
                  className={`flex items-center gap-3 px-4 py-3.5 rounded-2xl transition-all duration-300 group ${
                    isActive 
                      ? 'bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow-xl shadow-blue-500/25 scale-[1.02]' 
                      : 'bg-gradient-to-r from-blue-600/10 to-purple-600/10 hover:from-blue-600/20 hover:to-purple-600/20 text-blue-300 border border-blue-500/20 shadow-lg shadow-blue-500/5 hover:scale-[1.02]'
                  }`}
                >
                  <item.icon className={`h-5 w-5 animate-pulse text-indigo-300 group-hover:rotate-12 transition-transform`} />
                  <span className="font-bold tracking-wide">{item.label}</span>
                  <Sparkles className="h-3 w-3 ml-auto text-yellow-400 fill-yellow-400" />
                </Link>
              )
            }

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setIsMobileMenuOpen(false)}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group ${
                  isActive 
                    ? 'bg-white/5 text-white border border-white/10 font-bold' 
                    : 'text-gray-400 hover:text-white hover:bg-white/[0.03]'
                }`}
              >
                <item.icon className={`h-5 w-5 transition-transform group-hover:scale-110 ${
                  isActive ? 'text-blue-400' : 'text-gray-400'
                }`} />
                <span className="font-medium">{item.label}</span>
              </Link>
            )
          })}
        </nav>

        {/* Sidebar Bottom (User details + Logout) */}
        <div className="p-4 border-t border-white/5 space-y-4">
          <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/[0.02] border border-white/5">
            <div className="h-8 w-8 rounded-full bg-blue-600/20 border border-blue-500/30 flex items-center justify-center">
              <User className="h-4 w-4 text-blue-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-gray-300 truncate" title={userEmail}>
                {userEmail || 'guest@brandflux.ai'}
              </p>
              <div className="mt-1 flex items-center gap-1">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
                <span className="text-[10px] font-bold text-blue-400 tracking-wider">
                  {userPlan} PLAN
                </span>
              </div>
            </div>
          </div>

          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-3 px-4 py-3 rounded-xl text-gray-400 hover:text-red-400 hover:bg-red-400/5 transition-all duration-200"
          >
            <LogOut className="h-5 w-5" />
            <span className="font-semibold text-sm">Logout</span>
          </button>
        </div>
      </aside>

      {/* Background Drawer Overlay for Mobile */}
      {isMobileMenuOpen && (
        <div 
          onClick={() => setIsMobileMenuOpen(false)}
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 md:hidden"
        />
      )}

      {/* ─── MAIN CONTENT ─── */}
      <div className="flex-1 md:ml-64 min-h-screen flex flex-col">
        {/* Header (Top navigation bar) */}
        <header className="h-20 border-b border-white/5 flex items-center justify-between px-6 md:px-8 sticky top-0 bg-[#060608]/80 backdrop-blur-md z-30">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setIsMobileMenuOpen(true)}
              className="md:hidden p-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition"
            >
              <Menu className="h-5 w-5 text-gray-200" />
            </button>
            
            <div className="hidden md:flex items-center gap-2 text-xs font-bold text-gray-500 uppercase tracking-widest bg-white/5 px-4.5 py-2 rounded-full border border-white/5">
              <Zap className="h-3.5 w-3.5 text-blue-400 fill-blue-400" />
              Live Brand Sync Active
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="px-4 py-1.5 rounded-full bg-gradient-to-r from-blue-600/10 via-indigo-600/10 to-purple-600/10 border border-blue-500/20 text-xs font-black text-blue-400 flex items-center gap-2 shadow-lg shadow-blue-500/5 select-none">
              <Sparkles className="h-3 w-3 text-blue-400 animate-spin" />
              {userPlan} MEMBER
            </div>
          </div>
        </header>

        {/* Main Slot page */}
        <main className="flex-1 p-6 md:p-8 pb-24 md:pb-8">
          {children}
        </main>
      </div>
      
      {/* Mobile Bottom Navigation */}
      <BottomNav />
    </div>
  )
}
