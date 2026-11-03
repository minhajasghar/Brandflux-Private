'use client'

import { useState, useEffect, Suspense } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { 
  ShieldAlert, 
  Users, 
  Activity, 
  Layers, 
  Cpu, 
  Sliders, 
  FileText, 
  ShieldCheck, 
  LogOut, 
  Menu,
  X,
  Radar,
  Radio,
  KeyRound
} from 'lucide-react'
import Cookies from 'js-cookie'
import { getProfile } from '@/lib/api'

const adminNavItems = [
  { id: 'overview', label: 'Overview', icon: Activity, href: '/admin?tab=overview' },
  { id: 'users', label: 'Users & Accounts', icon: Users, href: '/admin?tab=users' },
  { id: 'usage', label: 'Usage & Costs', icon: Sliders, href: '/admin?tab=usage' },
  { id: 'credentials', label: 'AI & Models', icon: KeyRound, href: '/admin?tab=credentials' },
  { id: 'scans', label: 'Website Scans', icon: Radar, href: '/admin?tab=scans' },
  { id: 'publishing', label: 'Publishing Monitor', icon: Radio, href: '/admin?tab=publishing' },
  { id: 'plans', label: 'Plans & Limits', icon: Layers, href: '/admin?tab=plans' },
  { id: 'audit', label: 'Audit Log', icon: FileText, href: '/admin?tab=audit' },
  { id: 'health', label: 'System Health', icon: Cpu, href: '/admin?tab=health' },
  { id: 'admins', label: 'Admin Team', icon: ShieldCheck, href: '/admin?tab=admins' },
]

function AdminNavLinks({ onNavigate }: { onNavigate: () => void }) {
  const searchParams = useSearchParams()
  const currentTab = searchParams.get('tab') || 'overview'

  return (
    <>
      {adminNavItems.map((item) => {
        const isActive = currentTab === item.id
        return (
          <Link
            key={item.id}
            href={item.href}
            onClick={onNavigate}
            className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl transition-all duration-200 text-xs font-bold ${
              isActive 
                ? 'bg-primary/20 border border-primary text-primary-light shadow-sm' 
                : 'text-muted hover:text-text hover:bg-surface-secondary/70'
            }`}
          >
            <item.icon className={`h-4 w-4 shrink-0 ${isActive ? 'text-primary-light' : 'text-muted'}`} />
            <span className="truncate">{item.label}</span>
          </Link>
        )
      })}
    </>
  )
}

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [adminEmail, setAdminEmail] = useState('')
  const [adminRole, setAdminRole] = useState('admin')
  const [authChecked, setAuthChecked] = useState(false)

  useEffect(() => {
    const verifyAdmin = async () => {
      let token = null
      if (typeof window !== 'undefined') {
        token = localStorage.getItem('brandflux_token') || sessionStorage.getItem('brandflux_token')
      }

      if (!token) {
        router.push('/login')
        return
      }

      try {
        const profile = await getProfile()
        if (profile && profile.user) {
          const role = profile.user.role || 'user'
          if (role !== 'admin' && role !== 'support_admin') {
            // Standard customer accounts are strictly forbidden from /admin
            router.push('/dashboard')
            return
          }
          setAdminEmail(profile.user.email)
          setAdminRole(role)
          setAuthChecked(true)
        }
      } catch (err) {
        console.error('Admin layout auth error:', err)
        router.push('/login')
      }
    }

    verifyAdmin()
  }, [router])

  const handleLogout = () => {
    Cookies.remove('brandflux_token')
    Cookies.remove('brandflux_onboarding_complete')
    if (typeof window !== 'undefined') {
      localStorage.removeItem('brandflux_token')
      sessionStorage.removeItem('brandflux_token')
    }
    router.push('/login')
  }

  if (!authChecked) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 rounded-2xl bg-primary/20 border border-primary/40 flex items-center justify-center animate-pulse">
            <ShieldAlert className="h-5 w-5 text-primary-light" />
          </div>
          <span className="text-xs font-bold text-muted">Verifying administrator authorization...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen bg-bg text-text overflow-x-hidden selection:bg-accent selection:text-black">
      {/* ─── DEDICATED ADMIN SIDEBAR ─── */}
      <aside className={`w-64 border-r border-border flex flex-col fixed inset-y-0 z-50 bg-surface transition-transform duration-300 md:translate-x-0 ${
        isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
      }`}>
        {/* Admin Header Branding */}
        <div className="p-6 flex items-center justify-between border-b border-border">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-danger/20 border border-danger/40 flex items-center justify-center font-bold text-danger">
              <ShieldAlert className="h-5 w-5 text-danger" />
            </div>
            <div>
              <span className="text-lg font-black tracking-tight text-text block leading-none">
                Brandflux
              </span>
              <span className="text-[10px] font-black uppercase tracking-wider text-danger mt-1 block">
                ADMIN PORTAL
              </span>
            </div>
          </div>
          <button 
            onClick={() => setIsMobileMenuOpen(false)}
            className="md:hidden p-1.5 rounded-lg bg-surface-secondary border border-border hover:bg-surface-hover transition"
            aria-label="Close menu"
          >
            <X className="h-5 w-5 text-muted" />
          </button>
        </div>

        {/* Admin Navigation */}
        <nav className="flex-1 px-4 space-y-1.5 mt-5 overflow-y-auto">
          <Suspense fallback={<div className="p-4 text-xs text-muted">Loading navigation...</div>}>
            <AdminNavLinks onNavigate={() => setIsMobileMenuOpen(false)} />
          </Suspense>
        </nav>

        {/* Admin Sidebar Footer */}
        <div className="p-4 border-t border-border space-y-3">
          {/* Admin User Badge */}
          <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-surface-secondary border border-border">
            <div className="h-8 w-8 rounded-full bg-danger/15 border border-danger/30 flex items-center justify-center shrink-0">
              <ShieldCheck className="h-4 w-4 text-danger" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-text truncate" title={adminEmail}>
                {adminEmail}
              </p>
              <div className="mt-0.5 flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-danger" />
                <span className="text-[9px] font-black uppercase text-muted tracking-wider">
                  {adminRole.replace('_', ' ')}
                </span>
              </div>
            </div>
          </div>

          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-3 px-3 py-2 rounded-xl text-muted hover:text-danger hover:bg-danger/10 transition-all text-xs font-semibold"
          >
            <LogOut className="h-4 w-4" />
            <span>Sign Out</span>
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

      {/* ─── MAIN ADMIN CONTENT CONTAINER ─── */}
      <div className="flex-1 md:ml-64 min-h-screen flex flex-col">
        {/* Dedicated Admin Sticky Header */}
        <header className="h-16 border-b border-border flex items-center justify-between px-3.5 sm:px-6 md:px-8 sticky top-0 bg-bg/90 backdrop-blur-md z-30">
          <div className="flex items-center gap-2 sm:gap-4 min-w-0">
            <button
              onClick={() => setIsMobileMenuOpen(true)}
              className="md:hidden p-2 rounded-xl bg-surface border border-border hover:bg-surface-secondary transition shrink-0"
              aria-label="Open admin menu"
            >
              <Menu className="h-5 w-5 text-text" />
            </button>
            
            <div className="flex items-center gap-2.5">
              <span className="px-2.5 sm:px-3 py-1 rounded-full bg-danger/15 border border-danger/30 text-danger text-[10px] sm:text-[11px] font-black uppercase tracking-wider flex items-center gap-1.5 shrink-0">
                <ShieldAlert className="h-3.5 w-3.5" />
                <span>Admin Environment</span>
              </span>
              <span className="hidden lg:inline-flex items-center gap-1.5 text-[11px] font-bold text-muted bg-surface px-3 py-1 rounded-full border border-border">
                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                <span>Security Enforced</span>
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <span className="hidden md:inline-block text-xs font-bold text-muted truncate max-w-[200px]" title={adminEmail}>
              {adminEmail}
            </span>
            <button
              onClick={handleLogout}
              className="px-2.5 sm:px-3 py-1.5 rounded-xl bg-surface-secondary hover:bg-danger/15 hover:text-danger border border-border text-xs font-bold text-muted transition flex items-center gap-1.5 min-h-[36px]"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span>Sign Out</span>
            </button>
          </div>
        </header>

        {/* Admin Content Slot */}
        <main className="flex-1 p-3.5 sm:p-6 md:p-8 max-w-[1600px] w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  )
}
