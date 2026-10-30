'use client'

import { useState, useEffect, Suspense } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useSearchParams } from 'next/navigation'
import toast from 'react-hot-toast'
import { 
  ShieldAlert, 
  Users, 
  Activity, 
  DollarSign, 
  AlertTriangle, 
  Search, 
  RefreshCw, 
  Ban, 
  LogOut, 
  Trash2, 
  Sliders, 
  Building2, 
  FileText, 
  X, 
  Check, 
  Globe, 
  TrendingUp, 
  Cpu, 
  Layers, 
  ShieldCheck, 
  Eye,
  KeyRound,
  Download,
  RotateCcw,
  Radar,
  Radio,
  Power,
  ExternalLink,
  Plus,
  Play
} from 'lucide-react'
import { 
  getAdminOverview, 
  getAdminUsers, 
  getAdminUserDetail, 
  adminSuspendUser, 
  adminReactivateUser, 
  adminChangeUserPlan, 
  adminResetUserUsage, 
  adminForceLogoutUser, 
  adminDeleteUser, 
  adminPurgeUser,
  adminAdjustUserLimits,
  adminResetPassword,
  adminRestoreUser,
  adminExportUserData,
  getAdminUsageReport, 
  getAdminAuditLogs,
  getAdminScans,
  adminTestScan,
  adminRescanUser,
  getAdminFeatureFlags,
  updateAdminFeatureFlags,
  getAdminPublishingMonitor,
  adminRetryPost,
  getAdminPlans,
  updateAdminPlans,
  getAdminSystemHealth,
  getAdminTeam,
  adminCreateAdmin,
  adminUpdateAdminRole
} from '@/lib/api'

type AdminTab = 'overview' | 'users' | 'usage' | 'scans' | 'publishing' | 'plans' | 'audit' | 'health' | 'admins'

function AdminPortalContent() {
  const searchParams = useSearchParams()
  const tabFromUrl = (searchParams.get('tab') as AdminTab) || 'overview'
  const [activeTab, setActiveTab] = useState<AdminTab>(tabFromUrl)
  const [loading, setLoading] = useState(true)
  const [accessDenied, setAccessDenied] = useState(false)

  // Sync tab with URL
  useEffect(() => {
    if (tabFromUrl) {
      setActiveTab(tabFromUrl)
    }
  }, [tabFromUrl])

  // ─── 1. Overview State ──────────────────────────────────────────────────────
  const [overviewData, setOverviewData] = useState<any>(null)

  // ─── 2. Users State ─────────────────────────────────────────────────────────
  const [users, setUsers] = useState<any[]>([])
  const [userSearch, setUserSearch] = useState('')
  const [planFilter, setPlanFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [totalUsersCount, setTotalUsersCount] = useState(0)
  const [loadingUsers, setLoadingUsers] = useState(false)

  // User Detail Modal
  const [selectedUserDetail, setSelectedUserDetail] = useState<any>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)

  // Action Modals State
  const [actionTargetUser, setActionTargetUser] = useState<any>(null)
  const [modalType, setModalType] = useState<
    'suspend' | 'reactivate' | 'change_plan' | 'adjust_limits' | 'reset_usage' | 'force_logout' | 'reset_password' | 'delete' | 'restore' | 'purge' | null
  >(null)
  const [actionReason, setActionReason] = useState('')
  const [confirmEmailInput, setConfirmEmailInput] = useState('')
  const [selectedNewPlan, setSelectedNewPlan] = useState('starter')
  const [newPostsLimit, setNewPostsLimit] = useState(0)
  const [actionSubmitting, setActionSubmitting] = useState(false)

  // ─── 3. Usage & Feature Flags State ─────────────────────────────────────────
  const [usageReport, setUsageReport] = useState<any>(null)
  const [loadingUsage, setLoadingUsage] = useState(false)
  const [featureFlags, setFeatureFlags] = useState<any>({
    global_kill_switch: false,
    image_generation: true,
    video_generation: true,
    session_generation: true,
    autopilot_posting: true,
    website_scanner: true
  })
  const [savingFlags, setSavingFlags] = useState(false)

  // ─── 4. Scan Logs State ─────────────────────────────────────────────────────
  const [scans, setScans] = useState<any[]>([])
  const [totalScans, setTotalScans] = useState(0)
  const [loadingScans, setLoadingScans] = useState(false)
  const [debugUrl, setDebugUrl] = useState('')
  const [debugResult, setDebugResult] = useState<any>(null)
  const [runningDebugScan, setRunningDebugScan] = useState(false)

  // ─── 5. Publishing Monitor State ───────────────────────────────────────────
  const [publishingData, setPublishingData] = useState<any>(null)
  const [loadingPublishing, setLoadingPublishing] = useState(false)

  // ─── 6. Plans Config State ──────────────────────────────────────────────────
  const [plansConfig, setPlansConfig] = useState<any>(null)
  const [savingPlans, setSavingPlans] = useState(false)

  // ─── 7. Audit Logs State ────────────────────────────────────────────────────
  const [auditLogs, setAuditLogs] = useState<any[]>([])
  const [auditActionFilter, setAuditActionFilter] = useState('all')
  const [auditSearch, setAuditSearch] = useState('')
  const [totalAuditCount, setTotalAuditCount] = useState(0)
  const [loadingAudit, setLoadingAudit] = useState(false)

  // ─── 8. System Health State ─────────────────────────────────────────────────
  const [systemHealth, setSystemHealth] = useState<any>(null)
  const [loadingHealth, setLoadingHealth] = useState(false)

  // ─── 9. Admin Team State ────────────────────────────────────────────────────
  const [adminTeam, setAdminTeam] = useState<any[]>([])
  const [loadingAdmins, setLoadingAdmins] = useState(false)
  const [newAdminEmail, setNewAdminEmail] = useState('')
  const [newAdminPassword, setNewAdminPassword] = useState('')
  const [newAdminName, setNewAdminName] = useState('')
  const [newAdminRole, setNewAdminRole] = useState('support_admin')
  const [creatingAdmin, setCreatingAdmin] = useState(false)

  // ─── Initial Load ──────────────────────────────────────────────────────────
  useEffect(() => {
    loadOverview()
  }, [])

  useEffect(() => {
    if (activeTab === 'users') fetchUsers()
    else if (activeTab === 'usage') { fetchUsageReport(); fetchFlags() }
    else if (activeTab === 'scans') fetchScans()
    else if (activeTab === 'publishing') fetchPublishingMonitor()
    else if (activeTab === 'plans') fetchPlans()
    else if (activeTab === 'audit') fetchAuditLogs()
    else if (activeTab === 'health') fetchHealth()
    else if (activeTab === 'admins') fetchAdmins()
  }, [activeTab])

  const loadOverview = async () => {
    try {
      setLoading(true)
      const data = await getAdminOverview()
      setOverviewData(data)
      setAccessDenied(false)
    } catch (err: any) {
      if (err.response?.status === 403 || err.response?.status === 401) {
        setAccessDenied(true)
      } else {
        toast.error('Failed to load admin overview')
      }
    } finally {
      setLoading(false)
    }
  }

  const fetchUsers = async () => {
    try {
      setLoadingUsers(true)
      const res = await getAdminUsers({
        search: userSearch || undefined,
        plan: planFilter !== 'all' ? planFilter : undefined,
        status: statusFilter !== 'all' ? statusFilter : undefined,
        limit: 50
      })
      setUsers(res.users || [])
      setTotalUsersCount(res.total || 0)
    } catch (err: any) {
      toast.error('Failed to load users table')
    } finally {
      setLoadingUsers(false)
    }
  }

  const fetchUsageReport = async () => {
    try {
      setLoadingUsage(true)
      const res = await getAdminUsageReport()
      setUsageReport(res)
    } catch (err) {
      toast.error('Failed to load usage metrics')
    } finally {
      setLoadingUsage(false)
    }
  }

  const fetchFlags = async () => {
    try {
      const res = await getAdminFeatureFlags()
      setFeatureFlags(res)
    } catch (err) {
      console.error(err)
    }
  }

  const handleToggleFlag = async (key: string) => {
    setSavingFlags(true)
    try {
      const updated = { ...featureFlags, [key]: !featureFlags[key] }
      const res = await updateAdminFeatureFlags(updated)
      setFeatureFlags(res)
      toast.success(`Updated ${key} flag`)
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to update flag')
    } finally {
      setSavingFlags(false)
    }
  }

  const fetchScans = async () => {
    try {
      setLoadingScans(true)
      const res = await getAdminScans({ limit: 50 })
      setScans(res.scans || [])
      setTotalScans(res.total || 0)
    } catch (err) {
      toast.error('Failed to load scans')
    } finally {
      setLoadingScans(false)
    }
  }

  const handleRunDebugScan = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!debugUrl.trim()) return
    setRunningDebugScan(true)
    setDebugResult(null)
    try {
      const res = await adminTestScan(debugUrl.trim())
      setDebugResult(res)
      if (res.success) toast.success('Debug scan completed!')
      else toast.error(res.error || 'Scan encountered error')
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Test scan failed')
    } finally {
      setRunningDebugScan(false)
    }
  }

  const fetchPublishingMonitor = async () => {
    try {
      setLoadingPublishing(true)
      const res = await getAdminPublishingMonitor()
      setPublishingData(res)
    } catch (err) {
      toast.error('Failed to load publishing monitor')
    } finally {
      setLoadingPublishing(false)
    }
  }

  const handleRetryPublishingPost = async (postId: string) => {
    try {
      await adminRetryPost(postId)
      toast.success('Post re-queued for publishing')
      fetchPublishingMonitor()
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to retry post')
    }
  }

  const fetchPlans = async () => {
    try {
      const res = await getAdminPlans()
      setPlansConfig(res)
    } catch (err) {
      toast.error('Failed to load plan definitions')
    }
  }

  const handleSavePlans = async () => {
    setSavingPlans(true)
    try {
      const res = await updateAdminPlans(plansConfig)
      setPlansConfig(res)
      toast.success('Plan definitions saved successfully!')
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to save plans')
    } finally {
      setSavingPlans(false)
    }
  }

  const fetchAuditLogs = async () => {
    try {
      setLoadingAudit(true)
      const res = await getAdminAuditLogs({
        action: auditActionFilter !== 'all' ? auditActionFilter : undefined,
        search: auditSearch || undefined,
        limit: 50
      })
      setAuditLogs(res.logs || [])
      setTotalAuditCount(res.total || 0)
    } catch (err) {
      toast.error('Failed to load audit logs')
    } finally {
      setLoadingAudit(false)
    }
  }

  const fetchHealth = async () => {
    try {
      setLoadingHealth(true)
      const res = await getAdminSystemHealth()
      setSystemHealth(res)
    } catch (err) {
      toast.error('Failed to load system health')
    } finally {
      setLoadingHealth(false)
    }
  }

  const fetchAdmins = async () => {
    try {
      setLoadingAdmins(true)
      const res = await getAdminTeam()
      setAdminTeam(res || [])
    } catch (err) {
      toast.error('Failed to load admin team')
    } finally {
      setLoadingAdmins(false)
    }
  }

  const handleCreateAdmin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newAdminEmail || !newAdminPassword) return
    setCreatingAdmin(true)
    try {
      await adminCreateAdmin({
        email: newAdminEmail,
        password: newAdminPassword,
        full_name: newAdminName || 'Admin Team Member',
        role: newAdminRole
      })
      toast.success('Administrator account created!')
      setNewAdminEmail('')
      setNewAdminPassword('')
      setNewAdminName('')
      fetchAdmins()
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to create admin')
    } finally {
      setCreatingAdmin(false)
    }
  }

  const handleUpdateAdminRole = async (adminId: string, role: string) => {
    try {
      await adminUpdateAdminRole(adminId, role)
      toast.success(`Role updated to ${role}`)
      fetchAdmins()
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to update role')
    }
  }

  // ─── User Detail & Export ──────────────────────────────────────────────────
  const handleOpenUserDetail = async (userId: string) => {
    setLoadingDetail(true)
    setSelectedUserDetail(null)
    try {
      const data = await getAdminUserDetail(userId)
      setSelectedUserDetail(data)
    } catch (err: any) {
      toast.error('Failed to load user details')
    } finally {
      setLoadingDetail(false)
    }
  }

  const handleExportUser = async (userId: string) => {
    try {
      const data = await adminExportUserData(userId)
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `user-export-${userId}.json`
      a.click()
      toast.success('User data exported!')
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Export failed')
    }
  }

  // ─── Modal Action Executor ─────────────────────────────────────────────────
  const executeUserAction = async () => {
    if (!actionTargetUser || !modalType) return
    setActionSubmitting(true)

    try {
      if (modalType === 'suspend') {
        await adminSuspendUser(actionTargetUser.id, actionReason)
        toast.success(`User ${actionTargetUser.email} has been suspended`)
      } else if (modalType === 'reactivate') {
        await adminReactivateUser(actionTargetUser.id, actionReason)
        toast.success(`User ${actionTargetUser.email} reactivated`)
      } else if (modalType === 'change_plan') {
        await adminChangeUserPlan(actionTargetUser.id, selectedNewPlan)
        toast.success(`Plan updated to ${selectedNewPlan}`)
      } else if (modalType === 'adjust_limits') {
        await adminAdjustUserLimits(actionTargetUser.id, {
          posts_used_this_month: newPostsLimit,
          reason: actionReason
        })
        toast.success(`Limits updated for ${actionTargetUser.email}`)
      } else if (modalType === 'reset_usage') {
        await adminResetUserUsage(actionTargetUser.id)
        toast.success(`Monthly usage reset for ${actionTargetUser.email}`)
      } else if (modalType === 'force_logout') {
        await adminForceLogoutUser(actionTargetUser.id)
        toast.success(`Active sessions revoked for ${actionTargetUser.email}`)
      } else if (modalType === 'reset_password') {
        await adminResetPassword(actionTargetUser.id)
        toast.success(`Password reset dispatched for ${actionTargetUser.email}`)
      } else if (modalType === 'delete') {
        if (confirmEmailInput.trim().toLowerCase() !== actionTargetUser.email.toLowerCase()) {
          toast.error(`Confirmation mismatch. Please type the user's exact email address (${actionTargetUser.email}).`)
          setActionSubmitting(false)
          return
        }
        await adminDeleteUser(actionTargetUser.id, confirmEmailInput, actionReason)
        toast.success(`User ${actionTargetUser.email} soft-deleted. Account blocked, restorable for 30 days.`)
      } else if (modalType === 'restore') {
        await adminRestoreUser(actionTargetUser.id)
        toast.success(`User ${actionTargetUser.email} restored successfully`)
      } else if (modalType === 'purge') {
        await adminPurgeUser(actionTargetUser.id)
        toast.success(`User ${actionTargetUser.email} permanently purged from platform`)
      }

      setModalType(null)
      setActionTargetUser(null)
      setActionReason('')
      setConfirmEmailInput('')
      fetchUsers()
      if (selectedUserDetail) handleOpenUserDetail(actionTargetUser.id)
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Action failed')
    } finally {
      setActionSubmitting(false)
    }
  }

  if (accessDenied) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center text-center p-6 space-y-4">
        <div className="h-16 w-16 rounded-3xl bg-danger/15 border border-danger/40 flex items-center justify-center text-danger">
          <ShieldAlert className="h-8 w-8 text-danger" />
        </div>
        <h2 className="text-2xl font-black text-text">Access Forbidden (403)</h2>
        <p className="text-sm text-muted max-w-md">
          You do not have administrative credentials to view the Brandflux Admin Portal.
          This environment is strictly restricted to platform managers.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-16">
      {/* ─── TAB 1: OVERVIEW ─── */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Key Metric KPI Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-5 rounded-2xl bg-surface border border-border shadow-sm">
              <span className="text-xs font-bold text-muted uppercase tracking-wider block">Total Users</span>
              <p className="text-3xl font-extrabold text-text mt-1">{overviewData?.total_users || 0}</p>
              <div className="mt-2 text-[11px] text-muted flex items-center gap-1 font-semibold">
                <span className="text-emerald-400 font-extrabold">+{overviewData?.new_signups_7d || 0}</span> in last 7 days
              </div>
            </div>

            <div className="p-5 rounded-2xl bg-surface border border-border shadow-sm">
              <span className="text-xs font-bold text-muted uppercase tracking-wider block">Active Users (30d)</span>
              <p className="text-3xl font-extrabold text-text mt-1">{overviewData?.active_users || 0}</p>
              <div className="mt-2 text-[11px] text-muted font-semibold">
                Engaged with daily sessions
              </div>
            </div>

            <div className="p-5 rounded-2xl bg-surface border border-border shadow-sm">
              <span className="text-xs font-bold text-muted uppercase tracking-wider block">Generated Posts</span>
              <p className="text-3xl font-extrabold text-primary-light mt-1">{overviewData?.posts_generated || 0}</p>
              <div className="mt-2 text-[11px] text-muted font-semibold">
                Platform-wide content created
              </div>
            </div>

            <div className="p-5 rounded-2xl bg-surface border border-border shadow-sm">
              <span className="text-xs font-bold text-muted uppercase tracking-wider block">Total AI Spend</span>
              <p className="text-3xl font-extrabold text-accent mt-1">${overviewData?.total_ai_cost || '0.00'}</p>
              <div className="mt-2 text-[11px] text-danger font-semibold flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                <span>{overviewData?.failures_count || 0} retries / fallbacks</span>
              </div>
            </div>
          </div>

          {/* 14-Day Activity & Spend Visual Bar Grid */}
          <div className="p-6 rounded-3xl bg-surface border border-border shadow-xl">
            <h3 className="text-sm font-extrabold text-text flex items-center gap-2 mb-4">
              <TrendingUp className="h-4 w-4 text-primary-light" />
              <span>14-Day Platform AI Spend &amp; Generation Volume</span>
            </h3>

            <div className="grid grid-cols-7 sm:grid-cols-14 gap-2 text-center pt-2">
              {(overviewData?.ai_cost_per_day || []).map((day: any) => (
                <div key={day.full_date} className="p-2.5 rounded-xl bg-surface-secondary border border-border flex flex-col justify-between h-28">
                  <span className="text-[10px] font-bold text-muted">{day.date}</span>
                  <div>
                    <span className="text-xs font-extrabold text-text block">{day.generations}</span>
                    <span className="text-[9px] text-muted block">gens</span>
                  </div>
                  <span className="text-[10px] font-mono font-bold text-accent">${day.cost.toFixed(2)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ─── TAB 2: USERS & ACCOUNTS ─── */}
      {activeTab === 'users' && (
        <div className="space-y-4">
          {/* Search and Filters Ribbon */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-4 rounded-2xl bg-surface border border-border">
            <div className="relative flex-1 w-full sm:w-auto">
              <Search className="h-4 w-4 text-muted absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search user by email or name..."
                value={userSearch}
                onChange={e => setUserSearch(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && fetchUsers()}
                className="w-full pl-10 pr-4 py-2 bg-surface-secondary border border-border rounded-xl text-xs text-text focus:outline-none focus:border-primary"
              />
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <select
                value={planFilter}
                onChange={e => setPlanFilter(e.target.value)}
                className="px-3 py-2 bg-surface-secondary border border-border rounded-xl text-xs font-bold text-text focus:outline-none"
              >
                <option value="all">All Plans</option>
                <option value="free">Free</option>
                <option value="starter">Starter</option>
                <option value="growth">Growth</option>
                <option value="pro">Pro</option>
              </select>

              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                className="px-3 py-2 bg-surface-secondary border border-border rounded-xl text-xs font-bold text-text focus:outline-none"
              >
                <option value="all">All Statuses</option>
                <option value="active">Active</option>
                <option value="suspended">Suspended</option>
                <option value="deleted">Deleted</option>
              </select>

              <button
                onClick={fetchUsers}
                className="p-2 bg-surface-secondary hover:bg-surface-hover border border-border rounded-xl text-text transition"
                title="Refresh users"
              >
                <RefreshCw className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Users Table */}
          <div className="p-4 sm:p-6 rounded-3xl bg-surface border border-border shadow-xl overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-border text-muted uppercase text-[10px] tracking-wider font-extrabold">
                  <th className="py-3 px-3">User</th>
                  <th className="py-3 px-3">Plan</th>
                  <th className="py-3 px-3">Brands</th>
                  <th className="py-3 px-3">Posts Used</th>
                  <th className="py-3 px-3">Status</th>
                  <th className="py-3 px-3">Last Active</th>
                  <th className="py-3 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {users.map(u => (
                  <tr key={u.id} className="hover:bg-surface-secondary/50 transition">
                    <td className="py-3 px-3">
                      <div className="font-bold text-text">{u.email}</div>
                      <div className="text-[11px] text-muted">{u.full_name || 'No name'}</div>
                    </td>
                    <td className="py-3 px-3">
                      <span className="px-2 py-0.5 rounded-md font-extrabold text-[10px] bg-primary/15 text-primary-light border border-primary/30">
                        {u.plan}
                      </span>
                    </td>
                    <td className="py-3 px-3 font-semibold text-text">{u.brands_count}</td>
                    <td className="py-3 px-3 font-semibold text-text">{u.posts_used_this_month}</td>
                    <td className="py-3 px-3">
                      {u.is_deleted ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">
                          Soft Deleted (30d Grace)
                        </span>
                      ) : u.is_suspended ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-danger/20 text-danger border border-danger/40">Suspended</span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">Active</span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-muted">
                      {u.last_active_at ? new Date(u.last_active_at).toLocaleDateString() : 'Never'}
                    </td>
                    <td className="py-3 px-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => handleOpenUserDetail(u.id)}
                          className="px-2.5 py-1 rounded-lg bg-surface-secondary hover:bg-surface-hover border border-border text-text font-bold text-[11px]"
                        >
                          View
                        </button>
                        {u.is_deleted ? (
                          <>
                            <button
                              onClick={() => { setActionTargetUser(u); setModalType('restore') }}
                              className="p-1 rounded-lg bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/25"
                              title="Restore User Account"
                            >
                              <RotateCcw className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => handleExportUser(u.id)}
                              className="p-1 rounded-lg bg-surface-secondary hover:bg-surface-hover border border-border text-muted hover:text-text"
                              title="Export User Data"
                            >
                              <Download className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => { setActionTargetUser(u); setModalType('purge') }}
                              className="p-1 rounded-lg bg-danger/15 text-danger border border-danger/40 hover:bg-danger/25"
                              title="Permanently Purge Data"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </>
                        ) : (
                          <>
                            {u.is_suspended ? (
                              <button
                                onClick={() => { setActionTargetUser(u); setModalType('reactivate') }}
                                className="p-1 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/20"
                                title="Reactivate"
                              >
                                <Check className="h-3.5 w-3.5" />
                              </button>
                            ) : (
                              <button
                                onClick={() => { setActionTargetUser(u); setModalType('suspend') }}
                                className="p-1 rounded-lg bg-danger/10 text-danger border border-danger/30 hover:bg-danger/20"
                                title="Suspend"
                              >
                                <Ban className="h-3.5 w-3.5" />
                              </button>
                            )}
                            <button
                              onClick={() => { setActionTargetUser(u); setModalType('change_plan') }}
                              className="p-1 rounded-lg bg-surface-secondary hover:bg-surface-hover border border-border text-muted hover:text-text"
                              title="Change Plan"
                            >
                              <Layers className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => { setActionTargetUser(u); setModalType('force_logout') }}
                              className="p-1 rounded-lg bg-surface-secondary hover:bg-surface-hover border border-border text-muted hover:text-text"
                              title="Force Logout"
                            >
                              <LogOut className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => handleExportUser(u.id)}
                              className="p-1 rounded-lg bg-surface-secondary hover:bg-surface-hover border border-border text-muted hover:text-text"
                              title="Export User Data"
                            >
                              <Download className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => { setActionTargetUser(u); setModalType('delete'); setConfirmEmailInput(''); }}
                              className="p-1 rounded-lg bg-danger/10 text-danger border border-danger/30 hover:bg-danger/20"
                              title="Delete (Soft-delete with 30-day grace)"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ─── TAB 3: USAGE & FEATURE FLAGS (KILL SWITCH) ─── */}
      {activeTab === 'usage' && (
        <div className="space-y-6">
          {/* Global Generation Kill Switch & Toggles Card */}
          <div className="p-6 rounded-3xl bg-surface border border-border shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-4">
              <div>
                <h3 className="text-base font-extrabold text-text flex items-center gap-2">
                  <Power className="h-5 w-5 text-danger" />
                  <span>Global Kill Switch &amp; Feature Toggles</span>
                </h3>
                <p className="text-xs text-muted mt-0.5">
                  Control generation capabilities globally or selectively toggle features off during provider incidents.
                </p>
              </div>

              <button
                onClick={() => handleToggleFlag('global_kill_switch')}
                disabled={savingFlags}
                className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition ${
                  featureFlags.global_kill_switch
                    ? 'bg-danger text-white shadow-lg shadow-danger/30'
                    : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 hover:bg-emerald-500/30'
                }`}
              >
                {featureFlags.global_kill_switch ? 'KILL SWITCH ACTIVE' : 'SYSTEM OPERATIONAL'}
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 pt-2">
              {[
                { key: 'image_generation', label: 'Image Generation' },
                { key: 'video_generation', label: 'Video Generation' },
                { key: 'session_generation', label: 'Session Assistant' },
                { key: 'autopilot_posting', label: 'Autopilot Publishing' },
                { key: 'website_scanner', label: 'Website Scanner' },
              ].map(f => (
                <button
                  key={f.key}
                  onClick={() => handleToggleFlag(f.key)}
                  disabled={savingFlags}
                  className={`p-3.5 rounded-2xl border text-left flex flex-col justify-between h-24 transition ${
                    featureFlags[f.key]
                      ? 'bg-surface-secondary border-primary/40 text-text'
                      : 'bg-danger/10 border-danger/40 text-danger opacity-70'
                  }`}
                >
                  <span className="text-xs font-bold">{f.label}</span>
                  <span className={`text-[10px] font-black uppercase ${featureFlags[f.key] ? 'text-emerald-400' : 'text-danger'}`}>
                    {featureFlags[f.key] ? 'Enabled' : 'Disabled'}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Abuse Flags Feed */}
          {usageReport?.flagged_users?.length > 0 && (
            <div className="p-6 rounded-3xl bg-danger/10 border border-danger/30 shadow-xl space-y-3">
              <h3 className="text-sm font-extrabold text-danger flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-danger" />
                <span>Abuse &amp; Anomaly Alerts ({usageReport.flagged_count})</span>
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {usageReport.flagged_users.map((fu: any) => (
                  <div key={fu.user_id} className="p-3.5 rounded-2xl bg-surface border border-danger/30 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-extrabold text-text">{fu.email}</span>
                      <span className="text-[10px] font-mono font-bold text-accent">${fu.total_cost}</span>
                    </div>
                    {fu.flags.map((fl: any, idx: number) => (
                      <p key={idx} className="text-[11px] text-danger font-medium leading-relaxed">
                        • {fl.message}
                      </p>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── TAB 4: SCAN LOGS & DEBUG TOOL ─── */}
      {activeTab === 'scans' && (
        <div className="space-y-6">
          {/* Debug Scanner Tool (Does NOT create or modify brands) */}
          <div className="p-6 rounded-3xl bg-surface border border-border shadow-xl space-y-4">
            <div>
              <h3 className="text-sm font-extrabold text-text flex items-center gap-2">
                <Radar className="h-4 w-4 text-primary-light" />
                <span>Test Scanner Debug Tool</span>
              </h3>
              <p className="text-xs text-muted mt-0.5">
                Run the layered website scraper in an isolated sandbox. Does NOT create or alter any customer brand profile.
              </p>
            </div>

            <form onSubmit={handleRunDebugScan} className="flex gap-2">
              <input
                type="text"
                placeholder="https://example.com"
                value={debugUrl}
                onChange={e => setDebugUrl(e.target.value)}
                className="flex-1 px-4 py-2.5 rounded-xl bg-surface-secondary border border-border text-xs text-text focus:outline-none focus:border-primary"
              />
              <button
                type="submit"
                disabled={runningDebugScan}
                className="px-5 py-2.5 bg-accent hover:bg-accent-hover text-black font-extrabold text-xs rounded-xl transition flex items-center gap-1.5 disabled:opacity-50"
              >
                <Play className="h-3.5 w-3.5" />
                <span>{runningDebugScan ? 'Analyzing...' : 'Test Scan'}</span>
              </button>
            </form>

            {debugResult && (
              <div className="p-4 rounded-2xl bg-surface-secondary border border-border space-y-3 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-extrabold text-text">{debugResult.website_url}</span>
                  <span className="text-muted font-mono">{debugResult.color_palette?.extraction_method}</span>
                </div>
                {debugResult.color_palette && (
                  <div className="flex items-center gap-3">
                    {debugResult.color_palette.colors?.map((c: string, idx: number) => (
                      <div key={idx} className="flex items-center gap-1.5">
                        <span className="h-4 w-4 rounded-full border border-white/20" style={{ backgroundColor: c }} />
                        <span className="font-mono text-[11px] text-muted">{c}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Cross-User Website Scans Table */}
          <div className="p-4 sm:p-6 rounded-3xl bg-surface border border-border shadow-xl overflow-x-auto space-y-3">
            <h3 className="text-sm font-extrabold text-text">All Customer Website Scans ({totalScans})</h3>
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-border text-muted uppercase text-[10px] tracking-wider font-extrabold">
                  <th className="py-3 px-3">User</th>
                  <th className="py-3 px-3">URL</th>
                  <th className="py-3 px-3">Status</th>
                  <th className="py-3 px-3">Detected Colors</th>
                  <th className="py-3 px-3">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {scans.map(s => (
                  <tr key={s.id} className="hover:bg-surface-secondary/50 transition">
                    <td className="py-3 px-3 font-bold text-text">{s.user_email}</td>
                    <td className="py-3 px-3 text-muted truncate max-w-xs">{s.website_url}</td>
                    <td className="py-3 px-3">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                        {s.scan_status}
                      </span>
                    </td>
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-1.5">
                        {(s.detected_colors || []).slice(0, 4).map((c: string, idx: number) => (
                          <span key={idx} className="h-3 w-3 rounded-full border border-white/20" style={{ backgroundColor: c }} />
                        ))}
                      </div>
                    </td>
                    <td className="py-3 px-3 text-muted">
                      {s.scanned_at ? new Date(s.scanned_at).toLocaleString() : 'N/A'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ─── TAB 5: PUBLISHING MONITOR ─── */}
      {activeTab === 'publishing' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-5 rounded-2xl bg-surface border border-border shadow-sm">
              <span className="text-xs font-bold text-muted uppercase">Queue Health</span>
              <p className="text-2xl font-black text-emerald-400 uppercase mt-1">{publishingData?.queue_health || 'Operational'}</p>
            </div>
            <div className="p-5 rounded-2xl bg-surface border border-border shadow-sm">
              <span className="text-xs font-bold text-muted uppercase">Scheduled (7d)</span>
              <p className="text-2xl font-black text-text mt-1">{publishingData?.total_scheduled_7d || 0}</p>
            </div>
            <div className="p-5 rounded-2xl bg-surface border border-border shadow-sm">
              <span className="text-xs font-bold text-muted uppercase">7-Day Failure Rate</span>
              <p className="text-2xl font-black text-danger mt-1">{publishingData?.failure_rate || '0%'}</p>
            </div>
          </div>

          {/* Failed Posts List */}
          <div className="p-6 rounded-3xl bg-surface border border-border shadow-xl space-y-4">
            <h3 className="text-sm font-extrabold text-text">Failed Scheduled Posts (Sanitized)</h3>
            {(publishingData?.failed_posts || []).length === 0 ? (
              <p className="text-xs text-muted py-4">No failed publishing jobs recorded.</p>
            ) : (
              <div className="space-y-2">
                {publishingData.failed_posts.map((fp: any) => (
                  <div key={fp.id} className="p-3.5 rounded-2xl bg-surface-secondary border border-border flex items-center justify-between text-xs">
                    <div>
                      <div className="font-bold text-text flex items-center gap-2">
                        <span>{fp.platform}</span>
                        <span className="text-muted font-normal">({fp.user_email})</span>
                      </div>
                      <p className="text-danger text-[11px] mt-0.5">{fp.error}</p>
                    </div>
                    <button
                      onClick={() => handleRetryPublishingPost(fp.id)}
                      className="px-3 py-1.5 rounded-xl bg-accent hover:bg-accent-hover text-black font-extrabold text-xs transition"
                    >
                      Retry Post
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── TAB 6: PLANS & LIMITS EDITOR ─── */}
      {activeTab === 'plans' && (
        <div className="space-y-6">
          <div className="p-6 rounded-3xl bg-surface border border-border shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-4">
              <div>
                <h3 className="text-sm font-extrabold text-text flex items-center gap-2">
                  <Layers className="h-4 w-4 text-primary-light" />
                  <span>Configurable Subscription Tiers &amp; Limits</span>
                </h3>
                <p className="text-xs text-muted mt-0.5">
                  Update customer quotas dynamically without redeploying backend code.
                </p>
              </div>

              <button
                onClick={handleSavePlans}
                disabled={savingPlans}
                className="px-5 py-2.5 bg-accent hover:bg-accent-hover text-black font-extrabold text-xs rounded-xl transition disabled:opacity-50"
              >
                {savingPlans ? 'Saving...' : 'Save Plan Changes'}
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-2">
              {plansConfig && Object.keys(plansConfig).map(planKey => {
                const plan = plansConfig[planKey]
                return (
                  <div key={planKey} className="p-4 rounded-2xl bg-surface-secondary border border-border space-y-3">
                    <span className="text-sm font-extrabold text-primary-light uppercase tracking-wider block">
                      {plan.label || planKey}
                    </span>

                    <div className="space-y-1.5 text-xs">
                      <label className="text-[10px] font-bold text-muted uppercase">Price ($/mo)</label>
                      <input
                        type="number"
                        value={plan.price}
                        onChange={e => setPlansConfig({
                          ...plansConfig,
                          [planKey]: { ...plan, price: parseInt(e.target.value) || 0 }
                        })}
                        className="w-full bg-surface border border-border rounded-xl px-3 py-1.5 text-xs font-bold text-text"
                      />
                    </div>

                    <div className="space-y-1.5 text-xs">
                      <label className="text-[10px] font-bold text-muted uppercase">Brands Limit</label>
                      <input
                        type="number"
                        value={plan.brands_limit}
                        onChange={e => setPlansConfig({
                          ...plansConfig,
                          [planKey]: { ...plan, brands_limit: parseInt(e.target.value) || 1 }
                        })}
                        className="w-full bg-surface border border-border rounded-xl px-3 py-1.5 text-xs font-bold text-text"
                      />
                    </div>

                    <div className="space-y-1.5 text-xs">
                      <label className="text-[10px] font-bold text-muted uppercase">Generations / Month</label>
                      <input
                        type="number"
                        value={plan.generations_per_month}
                        onChange={e => setPlansConfig({
                          ...plansConfig,
                          [planKey]: { ...plan, generations_per_month: parseInt(e.target.value) || 0 }
                        })}
                        className="w-full bg-surface border border-border rounded-xl px-3 py-1.5 text-xs font-bold text-text"
                      />
                    </div>

                    <div className="space-y-1.5 text-xs">
                      <label className="text-[10px] font-bold text-muted uppercase">Image Variants</label>
                      <input
                        type="number"
                        value={plan.variants_per_request}
                        onChange={e => setPlansConfig({
                          ...plansConfig,
                          [planKey]: { ...plan, variants_per_request: parseInt(e.target.value) || 2 }
                        })}
                        className="w-full bg-surface border border-border rounded-xl px-3 py-1.5 text-xs font-bold text-text"
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* ─── TAB 7: AUDIT LOGS ─── */}
      {activeTab === 'audit' && (
        <div className="p-6 rounded-3xl bg-surface border border-border shadow-xl space-y-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-b border-border pb-4">
            <div>
              <h3 className="text-sm font-extrabold text-text flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary-light" />
                <span>Administrative Audit Trail ({totalAuditCount})</span>
              </h3>
              <p className="text-xs text-muted mt-0.5">
                Immutable record of every administrative action, user suspension, and limit adjustment.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="Search admin or target..."
                value={auditSearch}
                onChange={e => setAuditSearch(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && fetchAuditLogs()}
                className="px-3 py-1.5 bg-surface-secondary border border-border rounded-xl text-xs text-text focus:outline-none"
              />
              <button
                onClick={fetchAuditLogs}
                className="p-2 bg-surface-secondary hover:bg-surface-hover border border-border rounded-xl text-text"
              >
                <RefreshCw className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-border text-muted uppercase text-[10px] tracking-wider font-extrabold">
                  <th className="py-2.5 px-3">Timestamp</th>
                  <th className="py-2.5 px-3">Admin</th>
                  <th className="py-2.5 px-3">Action</th>
                  <th className="py-2.5 px-3">Target</th>
                  <th className="py-2.5 px-3">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {auditLogs.map(l => (
                  <tr key={l.id} className="hover:bg-surface-secondary/50 transition">
                    <td className="py-2.5 px-3 text-muted font-mono">{new Date(l.created_at).toLocaleString()}</td>
                    <td className="py-2.5 px-3 font-bold text-text">{l.admin_email}</td>
                    <td className="py-2.5 px-3">
                      <span className="px-2 py-0.5 rounded font-mono font-bold text-[10px] bg-primary/20 text-primary-light border border-primary/30">
                        {l.action}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 font-semibold text-text">{l.target_email || l.target_id || '-'}</td>
                    <td className="py-2.5 px-3 text-muted font-mono text-[11px] truncate max-w-xs">
                      {JSON.stringify(l.details || {})}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ─── TAB 8: SYSTEM HEALTH ─── */}
      {activeTab === 'health' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-5 rounded-2xl bg-surface border border-border shadow-sm">
              <span className="text-xs font-bold text-muted uppercase">Overall Status</span>
              <p className={`text-2xl font-black uppercase mt-1 ${systemHealth?.status === 'healthy' ? 'text-emerald-400' : 'text-danger'}`}>
                {systemHealth?.status || 'Unknown'}
              </p>
            </div>
            <div className="p-5 rounded-2xl bg-surface border border-border shadow-sm">
              <span className="text-xs font-bold text-muted uppercase">Database Latency</span>
              <p className="text-2xl font-black text-text mt-1">{systemHealth?.database || 'OK'}</p>
            </div>
            <div className="p-5 rounded-2xl bg-surface border border-border shadow-sm">
              <span className="text-xs font-bold text-muted uppercase">Queue Length</span>
              <p className="text-2xl font-black text-primary-light mt-1">{systemHealth?.active_queue_length || 0}</p>
            </div>
            <div className="p-5 rounded-2xl bg-surface border border-border shadow-sm">
              <span className="text-xs font-bold text-muted uppercase">Storage Used</span>
              <p className="text-2xl font-black text-accent mt-1">{systemHealth?.storage_used_mb || 0} MB</p>
            </div>
          </div>
        </div>
      )}

      {/* ─── TAB 9: ADMIN TEAM ─── */}
      {activeTab === 'admins' && (
        <div className="space-y-6">
          {/* Create Admin Form */}
          <div className="p-6 rounded-3xl bg-surface border border-border shadow-xl space-y-4">
            <h3 className="text-sm font-extrabold text-text flex items-center gap-2">
              <Plus className="h-4 w-4 text-primary-light" />
              <span>Add Administrator Account</span>
            </h3>

            <form onSubmit={handleCreateAdmin} className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
              <input
                type="email"
                placeholder="Admin Email"
                required
                value={newAdminEmail}
                onChange={e => setNewAdminEmail(e.target.value)}
                className="px-3.5 py-2.5 rounded-xl bg-surface-secondary border border-border text-text"
              />
              <input
                type="password"
                placeholder="Temporary Password"
                required
                value={newAdminPassword}
                onChange={e => setNewAdminPassword(e.target.value)}
                className="px-3.5 py-2.5 rounded-xl bg-surface-secondary border border-border text-text"
              />
              <select
                value={newAdminRole}
                onChange={e => setNewAdminRole(e.target.value)}
                className="px-3.5 py-2.5 rounded-xl bg-surface-secondary border border-border text-text font-bold"
              >
                <option value="support_admin">Support Admin (Read-Only)</option>
                <option value="admin">Full Admin (Write &amp; Mutate)</option>
              </select>
              <button
                type="submit"
                disabled={creatingAdmin}
                className="px-5 py-2.5 bg-accent hover:bg-accent-hover text-black font-extrabold rounded-xl transition disabled:opacity-50"
              >
                {creatingAdmin ? 'Creating...' : 'Create Account'}
              </button>
            </form>
          </div>

          {/* Admin Team Table */}
          <div className="p-6 rounded-3xl bg-surface border border-border shadow-xl space-y-4">
            <h3 className="text-sm font-extrabold text-text">Authorized Admin Team</h3>
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-border text-muted uppercase text-[10px] tracking-wider font-extrabold">
                  <th className="py-2.5 px-3">Email</th>
                  <th className="py-2.5 px-3">Full Name</th>
                  <th className="py-2.5 px-3">Role</th>
                  <th className="py-2.5 px-3">Created</th>
                  <th className="py-2.5 px-3 text-right">Switch Role</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {adminTeam.map(a => (
                  <tr key={a.id} className="hover:bg-surface-secondary/50 transition">
                    <td className="py-2.5 px-3 font-bold text-text">{a.email}</td>
                    <td className="py-2.5 px-3 text-muted">{a.full_name}</td>
                    <td className="py-2.5 px-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                        a.role === 'admin' ? 'bg-danger/20 text-danger border border-danger/30' : 'bg-primary/20 text-primary-light border border-primary/30'
                      }`}>
                        {a.role}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-muted">{new Date(a.created_at).toLocaleDateString()}</td>
                    <td className="py-2.5 px-3 text-right">
                      <button
                        onClick={() => handleUpdateAdminRole(a.id, a.role === 'admin' ? 'support_admin' : 'admin')}
                        className="text-[11px] font-bold text-primary-light hover:underline"
                      >
                        Set as {a.role === 'admin' ? 'Support Admin' : 'Full Admin'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ═════════════════════════════════════════════════════════════ */}
      {/* USER DETAIL MODAL                                              */}
      {/* ═════════════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {selectedUserDetail && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={() => setSelectedUserDetail(null)} />
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="relative w-full max-w-3xl max-h-[85vh] bg-surface border border-border rounded-3xl p-6 sm:p-8 shadow-2xl overflow-y-auto space-y-6"
            >
              <div className="flex items-center justify-between border-b border-border pb-4">
                <div>
                  <h3 className="text-lg font-black text-text">{selectedUserDetail.user.email}</h3>
                  <p className="text-xs text-muted">User ID: {selectedUserDetail.user.id}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleExportUser(selectedUserDetail.user.id)}
                    className="px-3 py-1.5 rounded-xl bg-surface-secondary border border-border hover:bg-surface-hover text-xs font-bold text-text flex items-center gap-1.5"
                  >
                    <Download className="h-3.5 w-3.5" />
                    <span>Export Data</span>
                  </button>
                  <button onClick={() => setSelectedUserDetail(null)} className="p-2 rounded-xl text-muted hover:text-text">
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </div>

              {/* Connected Platforms (Status only, never tokens!) */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-muted uppercase">Connected Social Platforms</h4>
                {selectedUserDetail.connected_platforms?.length === 0 ? (
                  <p className="text-xs text-muted">No external platforms connected.</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {selectedUserDetail.connected_platforms?.map((cp: any) => (
                      <div key={cp.id} className="p-3 rounded-xl bg-surface-secondary border border-border text-xs">
                        <span className="font-bold text-text block capitalize">{cp.platform}</span>
                        <span className="text-[11px] text-muted">{cp.account_name || 'Active link'}</span>
                        <span className={`text-[10px] block mt-1 font-bold ${cp.is_expired ? 'text-danger' : 'text-emerald-400'}`}>
                          {cp.is_expired ? 'Token Expired' : 'Active Connection'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Brands */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-muted uppercase">Brands Owned</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {selectedUserDetail.brands?.map((b: any) => (
                    <div key={b.id} className="p-3 rounded-xl bg-surface-secondary border border-border text-xs space-y-1">
                      <div className="font-bold text-text">{b.name || b.business_name}</div>
                      <div className="text-muted text-[11px] truncate">{b.website_url || 'No URL'}</div>
                      <div className="flex items-center gap-1 mt-1">
                        {b.primary_color && <span className="h-3 w-3 rounded-full border" style={{ backgroundColor: b.primary_color }} />}
                        {b.secondary_color && <span className="h-3 w-3 rounded-full border" style={{ backgroundColor: b.secondary_color }} />}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ═════════════════════════════════════════════════════════════ */}
      {/* ACTION CONFIRMATION MODALS                                     */}
      {/* ═════════════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {modalType && actionTargetUser && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={() => setModalType(null)} />
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="relative w-full max-w-md bg-surface border border-border rounded-3xl p-6 shadow-2xl space-y-4"
            >
              <h3 className="text-base font-black text-text capitalize">
                Confirm Action: {modalType.replace('_', ' ')}
              </h3>
              <p className="text-xs text-muted">
                Target User: <span className="font-bold text-text">{actionTargetUser.email}</span>
              </p>

              {modalType === 'change_plan' && (
                <div className="space-y-1 text-xs">
                  <label className="font-bold text-muted">Select Target Plan</label>
                  <select
                    value={selectedNewPlan}
                    onChange={e => setSelectedNewPlan(e.target.value)}
                    className="w-full bg-surface-secondary border border-border rounded-xl px-3 py-2 text-xs font-bold text-text"
                  >
                    <option value="free">Free</option>
                    <option value="starter">Starter</option>
                    <option value="growth">Growth</option>
                    <option value="pro">Pro</option>
                  </select>
                </div>
              )}

              {modalType === 'adjust_limits' && (
                <div className="space-y-1 text-xs">
                  <label className="font-bold text-muted">Override Monthly Posts Used</label>
                  <input
                    type="number"
                    value={newPostsLimit}
                    onChange={e => setNewPostsLimit(parseInt(e.target.value) || 0)}
                    className="w-full bg-surface-secondary border border-border rounded-xl px-3 py-2 text-xs font-bold text-text"
                  />
                </div>
              )}

              {modalType === 'delete' && (
                <div className="space-y-3 text-xs bg-danger/10 border border-danger/30 rounded-2xl p-4">
                  <div className="flex items-start gap-2.5 text-danger">
                    <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-extrabold text-xs">Two-Step Deletion: Step 1 (Soft Delete)</p>
                      <p className="text-[11px] text-muted mt-1 leading-relaxed">
                        The account is immediately blocked, active sessions revoked, and all data hidden.
                        The account can be <strong>restored within 30 days</strong>.
                        After 30 days, the scheduled cleanup job permanently purges all assets.
                      </p>
                    </div>
                  </div>

                  <div className="pt-1">
                    <button
                      type="button"
                      onClick={() => handleExportUser(actionTargetUser.id)}
                      className="w-full py-2 px-3 rounded-xl bg-surface-secondary border border-border hover:bg-surface-hover text-text font-bold text-xs flex items-center justify-center gap-2 transition"
                    >
                      <Download className="h-3.5 w-3.5 text-accent" />
                      <span>Export User Data (Optional Backup)</span>
                    </button>
                  </div>

                  <div className="space-y-1.5 pt-1">
                    <label className="font-bold text-text text-[11px] block">
                      Type exact email <span className="font-mono text-danger font-black">{actionTargetUser.email}</span> to confirm:
                    </label>
                    <input
                      type="text"
                      placeholder={actionTargetUser.email}
                      value={confirmEmailInput}
                      onChange={e => setConfirmEmailInput(e.target.value)}
                      className="w-full bg-surface-secondary border border-border focus:border-danger rounded-xl px-3 py-2 text-xs text-text font-mono"
                    />
                  </div>
                </div>
              )}

              {modalType === 'purge' && (
                <div className="space-y-2 text-xs bg-danger/15 border border-danger/40 rounded-2xl p-4 text-danger">
                  <div className="flex items-start gap-2.5">
                    <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-extrabold text-sm">Step 2: Permanent Purge</p>
                      <p className="text-xs text-text/80 mt-1 leading-relaxed">
                        This permanently deletes all brands, posts, images in storage, and revokes OAuth tokens. Billing records are kept anonymized for financial compliance.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <div className="space-y-1 text-xs">
                <label className="font-bold text-muted">Audit Log Reason</label>
                <input
                  type="text"
                  placeholder="Reason for audit log..."
                  value={actionReason}
                  onChange={e => setActionReason(e.target.value)}
                  className="w-full bg-surface-secondary border border-border rounded-xl px-3 py-2 text-xs text-text"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModalType(null)}
                  className="flex-1 py-2 rounded-xl bg-surface-secondary border border-border text-xs font-bold text-muted hover:text-text"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={executeUserAction}
                  disabled={
                    actionSubmitting ||
                    (modalType === 'delete' && confirmEmailInput.trim().toLowerCase() !== actionTargetUser.email.toLowerCase())
                  }
                  className={`flex-1 py-2 rounded-xl font-extrabold text-xs transition disabled:opacity-50 ${
                    modalType === 'delete' || modalType === 'purge'
                      ? 'bg-danger hover:bg-danger-hover text-white'
                      : 'bg-accent hover:bg-accent-hover text-black'
                  }`}
                >
                  {actionSubmitting
                    ? 'Processing...'
                    : modalType === 'delete'
                    ? 'Soft Delete User'
                    : modalType === 'purge'
                    ? 'Permanently Purge'
                    : 'Confirm Action'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default function AdminPortalPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-muted">Loading Admin Portal...</div>}>
      <AdminPortalContent />
    </Suspense>
  )
}
