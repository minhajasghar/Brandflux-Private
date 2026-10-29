'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
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
  Eye 
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
  getAdminUsageReport, 
  getAdminAuditLogs 
} from '@/lib/api'

type AdminTab = 'overview' | 'users' | 'usage' | 'audit'

export default function AdminPortalPage() {
  const [activeTab, setActiveTab] = useState<AdminTab>('overview')
  const [loading, setLoading] = useState(true)
  const [accessDenied, setAccessDenied] = useState(false)

  // ─── Overview State ────────────────────────────────────────────────────────
  const [overviewData, setOverviewData] = useState<any>(null)

  // ─── Users State ───────────────────────────────────────────────────────────
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
    'suspend' | 'reactivate' | 'change_plan' | 'reset_usage' | 'force_logout' | 'delete' | null
  >(null)
  const [actionReason, setActionReason] = useState('')
  const [selectedNewPlan, setSelectedNewPlan] = useState('starter')
  const [actionSubmitting, setActionSubmitting] = useState(false)

  // ─── Usage & Abuse State ───────────────────────────────────────────────────
  const [usageReport, setUsageReport] = useState<any>(null)
  const [loadingUsage, setLoadingUsage] = useState(false)

  // ─── Audit Logs State ──────────────────────────────────────────────────────
  const [auditLogs, setAuditLogs] = useState<any[]>([])
  const [auditActionFilter, setAuditActionFilter] = useState('all')
  const [auditSearch, setAuditSearch] = useState('')
  const [totalAuditCount, setTotalAuditCount] = useState(0)
  const [loadingAudit, setLoadingAudit] = useState(false)

  // ─── Initial Load ──────────────────────────────────────────────────────────
  useEffect(() => {
    loadOverview()
  }, [])

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

  // ─── Tab-Specific Fetchers ──────────────────────────────────────────────────
  useEffect(() => {
    if (accessDenied) return
    if (activeTab === 'users') {
      fetchUsers()
    } else if (activeTab === 'usage') {
      fetchUsageReport()
    } else if (activeTab === 'audit') {
      fetchAuditLogs()
    }
  }, [activeTab, userSearch, planFilter, statusFilter, auditActionFilter, auditSearch, accessDenied])

  const fetchUsers = async () => {
    try {
      setLoadingUsers(true)
      const res = await getAdminUsers({
        search: userSearch || undefined,
        plan: planFilter !== 'all' ? planFilter : undefined,
        status: statusFilter !== 'all' ? statusFilter : undefined,
      })
      setUsers(res.users || [])
      setTotalUsersCount(res.total || 0)
    } catch (err: any) {
      toast.error('Failed to load users list')
    } finally {
      setLoadingUsers(false)
    }
  }

  const fetchUsageReport = async () => {
    try {
      setLoadingUsage(true)
      const res = await getAdminUsageReport()
      setUsageReport(res)
    } catch (err: any) {
      toast.error('Failed to load usage report')
    } finally {
      setLoadingUsage(false)
    }
  }

  const fetchAuditLogs = async () => {
    try {
      setLoadingAudit(true)
      const res = await getAdminAuditLogs({
        action: auditActionFilter !== 'all' ? auditActionFilter : undefined,
        search: auditSearch || undefined,
      })
      setAuditLogs(res.logs || [])
      setTotalAuditCount(res.total || 0)
    } catch (err: any) {
      toast.error('Failed to load audit logs')
    } finally {
      setLoadingAudit(false)
    }
  }

  const handleOpenUserDetail = async (userId: string) => {
    try {
      setLoadingDetail(true)
      const detail = await getAdminUserDetail(userId)
      setSelectedUserDetail(detail)
    } catch (err: any) {
      toast.error('Failed to load user details')
    } finally {
      setLoadingDetail(false)
    }
  }

  // ─── Action Handlers ───────────────────────────────────────────────────────
  const executeAdminAction = async () => {
    if (!actionTargetUser || !modalType) return

    try {
      setActionSubmitting(true)
      const uid = actionTargetUser.id || actionTargetUser.user_id

      if (modalType === 'suspend') {
        await adminSuspendUser(uid, actionReason)
        toast.success(`User ${actionTargetUser.email} has been suspended`)
      } else if (modalType === 'reactivate') {
        await adminReactivateUser(uid, actionReason)
        toast.success(`User ${actionTargetUser.email} has been reactivated`)
      } else if (modalType === 'change_plan') {
        await adminChangeUserPlan(uid, selectedNewPlan)
        toast.success(`User plan updated to ${selectedNewPlan.toUpperCase()}`)
      } else if (modalType === 'reset_usage') {
        await adminResetUserUsage(uid)
        toast.success(`Usage counter reset for ${actionTargetUser.email}`)
      } else if (modalType === 'force_logout') {
        await adminForceLogoutUser(uid)
        toast.success(`Forced logout for ${actionTargetUser.email}`)
      } else if (modalType === 'delete') {
        await adminDeleteUser(uid)
        toast.success(`User ${actionTargetUser.email} soft-deleted`)
      }

      closeModal()
      if (activeTab === 'users') fetchUsers()
      if (activeTab === 'usage') fetchUsageReport()
      if (activeTab === 'overview') loadOverview()
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Admin action failed')
    } finally {
      setActionSubmitting(false)
    }
  }

  const closeModal = () => {
    setModalType(null)
    setActionTargetUser(null)
    setActionReason('')
  }

  // ─── Access Denied Screen ──────────────────────────────────────────────────
  if (accessDenied) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center text-center p-6 space-y-4">
        <div className="h-16 w-16 rounded-2xl bg-danger-muted border border-danger/40 flex items-center justify-center text-danger">
          <ShieldAlert className="h-8 w-8" />
        </div>
        <h1 className="text-2xl font-black text-text">Admin Access Required</h1>
        <p className="text-sm text-muted max-w-md">
          You do not have administrative privileges to access this portal. Please contact your organization owner or system administrator.
        </p>
        <a
          href="/dashboard"
          className="px-5 py-2.5 bg-primary text-white rounded-xl text-xs font-bold hover:bg-primary-hover transition"
        >
          Return to Dashboard
        </a>
      </div>
    )
  }

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-16">
      {/* ─── Top Header ─── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-6">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="p-2 rounded-xl bg-primary/20 border border-primary/40 text-primary-light">
              <ShieldCheck className="h-5 w-5" />
            </span>
            <h1 className="text-2xl font-black text-text tracking-tight">Admin Portal</h1>
            <span className="px-2.5 py-0.5 rounded-full bg-accent/15 text-accent border border-accent/30 text-xs font-bold uppercase tracking-wider">
              Super Admin
            </span>
          </div>
          <p className="text-xs text-muted mt-1">
            System overview, user governance, AI cost telemetries, abuse detection, and immutable audit logs.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              if (activeTab === 'overview') loadOverview()
              if (activeTab === 'users') fetchUsers()
              if (activeTab === 'usage') fetchUsageReport()
              if (activeTab === 'audit') fetchAuditLogs()
            }}
            className="px-3.5 py-2 rounded-xl bg-surface border border-border hover:border-primary text-xs font-bold text-text flex items-center gap-2 transition"
          >
            <RefreshCw className="h-3.5 w-3.5 text-primary-light" />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* ─── Navigation Tabs ─── */}
      <div className="flex items-center gap-2 border-b border-border pb-1 overflow-x-auto">
        {[
          { key: 'overview', label: 'Overview', icon: Activity },
          { key: 'users', label: 'Users & Accounts', icon: Users },
          { key: 'usage', label: 'Usage & Abuse Flags', icon: Cpu },
          { key: 'audit', label: 'Audit Logs', icon: FileText },
        ].map((tab) => {
          const isActive = activeTab === tab.key
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as AdminTab)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-extrabold transition duration-150 shrink-0 ${
                isActive
                  ? 'bg-primary text-white shadow-glow border border-primary-light/40'
                  : 'bg-surface text-muted hover:text-text hover:bg-surface-secondary border border-transparent'
              }`}
            >
              <tab.icon className="h-4 w-4" />
              <span>{tab.label}</span>
            </button>
          )
        })}
      </div>

      {/* ─── TAB 1: OVERVIEW ─── */}
      {activeTab === 'overview' && overviewData && (
        <div className="space-y-8">
          {/* KPI Cards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
            <div className="p-5 rounded-2xl bg-surface border border-border space-y-2">
              <span className="text-[11px] font-bold text-muted uppercase tracking-wider flex items-center justify-between">
                Total Users
                <Users className="h-4 w-4 text-primary-light" />
              </span>
              <p className="text-2xl font-black text-text">{overviewData.total_users}</p>
              <p className="text-[11px] text-muted font-medium">Non-deleted accounts</p>
            </div>

            <div className="p-5 rounded-2xl bg-surface border border-border space-y-2">
              <span className="text-[11px] font-bold text-muted uppercase tracking-wider flex items-center justify-between">
                Signups (7d)
                <TrendingUp className="h-4 w-4 text-success" />
              </span>
              <p className="text-2xl font-black text-text">{overviewData.new_signups_7d}</p>
              <p className="text-[11px] text-muted font-medium">{overviewData.new_signups_30d} past 30 days</p>
            </div>

            <div className="p-5 rounded-2xl bg-surface border border-border space-y-2">
              <span className="text-[11px] font-bold text-muted uppercase tracking-wider flex items-center justify-between">
                Active Users (30d)
                <Activity className="h-4 w-4 text-accent" />
              </span>
              <p className="text-2xl font-black text-text">{overviewData.active_users}</p>
              <p className="text-[11px] text-muted font-medium">Active in last month</p>
            </div>

            <div className="p-5 rounded-2xl bg-surface border border-border space-y-2">
              <span className="text-[11px] font-bold text-muted uppercase tracking-wider flex items-center justify-between">
                Posts Generated
                <Layers className="h-4 w-4 text-primary-light" />
              </span>
              <p className="text-2xl font-black text-text">{overviewData.posts_generated}</p>
              <p className="text-[11px] text-muted font-medium">Platform-wide total</p>
            </div>

            <div className="p-5 rounded-2xl bg-surface border border-border space-y-2">
              <span className="text-[11px] font-bold text-muted uppercase tracking-wider flex items-center justify-between">
                Total AI Cost
                <DollarSign className="h-4 w-4 text-accent" />
              </span>
              <p className="text-2xl font-black text-accent">${overviewData.total_ai_cost.toFixed(3)}</p>
              <p className="text-[11px] text-muted font-medium">Imagen &amp; Gemini calls</p>
            </div>

            <div className="p-5 rounded-2xl bg-surface border border-border space-y-2">
              <span className="text-[11px] font-bold text-muted uppercase tracking-wider flex items-center justify-between">
                Failures
                <AlertTriangle className="h-4 w-4 text-danger" />
              </span>
              <p className="text-2xl font-black text-danger">{overviewData.failures_count}</p>
              <p className="text-[11px] text-muted font-medium">Fallback / API errors</p>
            </div>
          </div>

          {/* 14-Day AI Generation & Cost Telemetry Chart */}
          <div className="p-6 rounded-2xl bg-surface border border-border space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border pb-4">
              <div>
                <h3 className="text-base font-extrabold text-text flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-primary-light" />
                  14-Day AI Cost &amp; Generation Volume
                </h3>
                <p className="text-xs text-muted">Daily breakdown of Gemini Nano Banana generations and estimated API costs.</p>
              </div>
              <div className="flex items-center gap-4 text-xs font-bold text-muted">
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-primary" /> Cost ($)
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-accent" /> Generations
                </span>
              </div>
            </div>

            {/* Visual Bar Graph */}
            <div className="grid grid-cols-14 gap-2 h-44 items-end pt-4 border-b border-border/50">
              {overviewData.ai_cost_per_day?.map((day: any, i: number) => {
                const maxCost = Math.max(...overviewData.ai_cost_per_day.map((d: any) => d.cost), 0.1)
                const costHeight = Math.max(8, (day.cost / maxCost) * 100)

                return (
                  <div key={i} className="flex flex-col items-center gap-1.5 group h-full justify-end">
                    <div className="w-full flex items-end justify-center gap-1 h-32">
                      <div
                        style={{ height: `${costHeight}%` }}
                        className="w-full max-w-[18px] bg-primary/70 hover:bg-primary rounded-t-md transition-all group-hover:scale-105 relative cursor-pointer"
                        title={`${day.date}: $${day.cost} (${day.generations} gens)`}
                      />
                    </div>
                    <span className="text-[10px] font-bold text-muted truncate w-full text-center">
                      {day.date.split(' ')[0]}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Recent Failures Log */}
          <div className="p-6 rounded-2xl bg-surface border border-border space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-4">
              <h3 className="text-base font-extrabold text-text flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-danger" />
                Recent Generation / API Failures
              </h3>
              <span className="text-xs font-bold text-muted">Last 10 failures</span>
            </div>

            {overviewData.recent_failures?.length === 0 ? (
              <p className="text-xs text-muted py-4">No recent failures recorded. All services healthy.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="text-[11px] font-bold text-muted uppercase bg-surface-secondary/50">
                    <tr>
                      <th className="py-2.5 px-3">Time</th>
                      <th className="py-2.5 px-3">Model</th>
                      <th className="py-2.5 px-3">Aspect Ratio</th>
                      <th className="py-2.5 px-3">Error Detail</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {overviewData.recent_failures.map((f: any) => (
                      <tr key={f.id} className="hover:bg-surface-secondary/30">
                        <td className="py-2.5 px-3 text-muted">
                          {f.created_at ? new Date(f.created_at).toLocaleString() : 'N/A'}
                        </td>
                        <td className="py-2.5 px-3 font-mono font-bold text-primary-light">{f.model}</td>
                        <td className="py-2.5 px-3">{f.aspect_ratio}</td>
                        <td className="py-2.5 px-3 text-danger max-w-md truncate" title={f.error_message}>
                          {f.error_message}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── TAB 2: USERS & ACCOUNTS ─── */}
      {activeTab === 'users' && (
        <div className="space-y-6">
          {/* Controls Bar: Search & Filters */}
          <div className="p-4 rounded-2xl bg-surface border border-border flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-2 flex-1 max-w-md">
              <div className="relative w-full">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
                <input
                  type="text"
                  placeholder="Search by email or name..."
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 rounded-xl bg-surface-secondary border border-border text-xs text-text placeholder-muted focus:outline-none focus:border-primary transition"
                />
              </div>
            </div>

            <div className="flex items-center gap-3">
              <select
                value={planFilter}
                onChange={(e) => setPlanFilter(e.target.value)}
                className="px-3 py-2 rounded-xl bg-surface-secondary border border-border text-xs font-bold text-text focus:outline-none focus:border-primary"
              >
                <option value="all">All Plans</option>
                <option value="free">Free</option>
                <option value="starter">Starter</option>
                <option value="growth">Growth</option>
                <option value="pro">Pro</option>
              </select>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-3 py-2 rounded-xl bg-surface-secondary border border-border text-xs font-bold text-text focus:outline-none focus:border-primary"
              >
                <option value="all">All Statuses</option>
                <option value="active">Active</option>
                <option value="suspended">Suspended</option>
                <option value="deleted">Deleted</option>
              </select>
            </div>
          </div>

          {/* Users Table */}
          <div className="rounded-2xl bg-surface border border-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="text-[11px] font-bold text-muted uppercase bg-surface-secondary/70 border-b border-border">
                  <tr>
                    <th className="py-3 px-4">User</th>
                    <th className="py-3 px-4">Plan</th>
                    <th className="py-3 px-4">Brands</th>
                    <th className="py-3 px-4">Monthly Usage</th>
                    <th className="py-3 px-4">Last Active</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {loadingUsers ? (
                    <tr>
                      <td colSpan={7} className="text-center py-8 text-muted">
                        Loading users...
                      </td>
                    </tr>
                  ) : users.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center py-8 text-muted">
                        No users match the query.
                      </td>
                    </tr>
                  ) : (
                    users.map((u) => (
                      <tr key={u.id} className="hover:bg-surface-secondary/40 transition">
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2.5">
                            <div className="h-8 w-8 rounded-full bg-primary/20 text-primary-light flex items-center justify-center font-bold text-xs shrink-0">
                              {(u.full_name || u.email || 'U').charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <p className="font-extrabold text-text truncate max-w-xs">{u.full_name || 'No Name'}</p>
                              <p className="text-[11px] text-muted truncate">{u.email}</p>
                            </div>
                          </div>
                        </td>

                        <td className="py-3 px-4">
                          <span className="px-2 py-0.5 rounded-full bg-surface-secondary border border-border font-extrabold text-[10px] text-text">
                            {u.plan}
                          </span>
                        </td>

                        <td className="py-3 px-4 font-bold text-text">{u.brands_count}</td>

                        <td className="py-3 px-4">
                          <span className="font-bold text-text">{u.posts_used_this_month}</span>
                          <span className="text-muted text-[10px]"> posts</span>
                        </td>

                        <td className="py-3 px-4 text-muted">
                          {u.last_active_at ? new Date(u.last_active_at).toLocaleDateString() : 'Never'}
                        </td>

                        <td className="py-3 px-4">
                          {u.is_deleted ? (
                            <span className="px-2 py-0.5 rounded-full bg-neutral-800 text-neutral-400 border border-neutral-700 text-[10px] font-bold">
                              Deleted
                            </span>
                          ) : u.is_suspended ? (
                            <span className="px-2 py-0.5 rounded-full bg-danger-muted text-danger border border-danger/40 text-[10px] font-bold">
                              Suspended
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full bg-success/20 text-success border border-success/30 text-[10px] font-bold">
                              Active
                            </span>
                          )}
                        </td>

                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => handleOpenUserDetail(u.id)}
                              className="p-1.5 rounded-lg bg-surface-secondary hover:bg-primary hover:text-white transition text-muted"
                              title="View Detail"
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </button>

                            {u.is_suspended ? (
                              <button
                                onClick={() => {
                                  setActionTargetUser(u)
                                  setModalType('reactivate')
                                }}
                                className="p-1.5 rounded-lg bg-success/15 hover:bg-success text-success hover:text-black transition"
                                title="Reactivate"
                              >
                                <Check className="h-3.5 w-3.5" />
                              </button>
                            ) : (
                              <button
                                onClick={() => {
                                  setActionTargetUser(u)
                                  setModalType('suspend')
                                }}
                                className="p-1.5 rounded-lg bg-danger-muted hover:bg-danger text-danger hover:text-white transition"
                                title="Suspend User"
                              >
                                <Ban className="h-3.5 w-3.5" />
                              </button>
                            )}

                            <button
                              onClick={() => {
                                setActionTargetUser(u)
                                setSelectedNewPlan(u.plan.toLowerCase())
                                setModalType('change_plan')
                              }}
                              className="p-1.5 rounded-lg bg-surface-secondary hover:bg-surface-secondary/90 transition text-muted"
                              title="Change Plan"
                            >
                              <Sliders className="h-3.5 w-3.5" />
                            </button>

                            <button
                              onClick={() => {
                                setActionTargetUser(u)
                                setModalType('force_logout')
                              }}
                              className="p-1.5 rounded-lg bg-surface-secondary hover:bg-warning-muted text-muted hover:text-warning transition"
                              title="Force Logout"
                            >
                              <LogOut className="h-3.5 w-3.5" />
                            </button>

                            <button
                              onClick={() => {
                                setActionTargetUser(u)
                                setModalType('delete')
                              }}
                              className="p-1.5 rounded-lg bg-surface-secondary hover:bg-danger-muted text-muted hover:text-danger transition"
                              title="Soft Delete"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ─── TAB 3: USAGE & ABUSE FLAGS ─── */}
      {activeTab === 'usage' && (
        <div className="space-y-6">
          {/* Abuse Flags Banner */}
          {usageReport?.flagged_users?.length > 0 && (
            <div className="p-5 rounded-2xl bg-danger-muted/30 border border-danger/40 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-danger font-extrabold text-sm">
                  <AlertTriangle className="h-5 w-5" />
                  <span>Abuse Flags Detected ({usageReport.flagged_users.length} accounts flagged)</span>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {usageReport.flagged_users.map((fu: any) => (
                  <div key={fu.user_id} className="p-4 rounded-xl bg-surface border border-border flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-bold text-text text-xs truncate">{fu.email}</p>
                      <p className="text-[11px] text-danger font-semibold mt-0.5">
                        {fu.flags[0]?.message}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => handleOpenUserDetail(fu.user_id)}
                        className="px-2.5 py-1.5 rounded-lg bg-surface-secondary hover:bg-primary text-text hover:text-white text-[11px] font-bold transition"
                      >
                        Inspect
                      </button>
                      <button
                        onClick={() => {
                          setActionTargetUser({ id: fu.user_id, email: fu.email })
                          setModalType('suspend')
                        }}
                        className="px-2.5 py-1.5 rounded-lg bg-danger text-white text-[11px] font-bold hover:bg-danger-hover transition"
                      >
                        Suspend
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Usage Table */}
          <div className="rounded-2xl bg-surface border border-border overflow-hidden">
            <div className="p-4 border-b border-border flex items-center justify-between">
              <div>
                <h3 className="text-sm font-extrabold text-text">Per-User AI Telemetry &amp; Consumption</h3>
                <p className="text-xs text-muted">Generation calls, failure rates, and billed model expenses.</p>
              </div>
              <div className="text-xs font-bold text-muted">
                System Cost: <span className="text-accent">${usageReport?.total_system_cost?.toFixed(3) || '0.000'}</span>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="text-[11px] font-bold text-muted uppercase bg-surface-secondary/70 border-b border-border">
                  <tr>
                    <th className="py-3 px-4">User</th>
                    <th className="py-3 px-4">Plan</th>
                    <th className="py-3 px-4">Generations</th>
                    <th className="py-3 px-4">Failures</th>
                    <th className="py-3 px-4">Total Cost</th>
                    <th className="py-3 px-4">Flags</th>
                    <th className="py-3 px-4 text-right">Quick Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {loadingUsage ? (
                    <tr>
                      <td colSpan={7} className="text-center py-8 text-muted">
                        Loading usage records...
                      </td>
                    </tr>
                  ) : usageReport?.users_usage?.map((u: any) => (
                    <tr key={u.user_id} className="hover:bg-surface-secondary/40 transition">
                      <td className="py-3 px-4 font-bold text-text">{u.email}</td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded-full bg-surface-secondary border border-border text-[10px] font-bold">
                          {u.plan}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-bold text-text">{u.total_ai_generations}</td>
                      <td className="py-3 px-4 text-danger font-semibold">{u.failed_generations}</td>
                      <td className="py-3 px-4 font-mono font-bold text-accent">${u.total_cost.toFixed(3)}</td>
                      <td className="py-3 px-4">
                        {u.flags?.length > 0 ? (
                          <span className="px-2 py-0.5 rounded-full bg-danger-muted text-danger font-bold text-[10px]">
                            {u.flags.length} Flag{u.flags.length > 1 ? 's' : ''}
                          </span>
                        ) : (
                          <span className="text-muted text-[11px]">Clean</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => {
                            setActionTargetUser({ id: u.user_id, email: u.email })
                            setModalType('reset_usage')
                          }}
                          className="px-2.5 py-1 rounded-lg bg-surface-secondary hover:bg-primary text-text hover:text-white text-[11px] font-bold transition"
                        >
                          Reset Usage
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ─── TAB 4: AUDIT LOGS ─── */}
      {activeTab === 'audit' && (
        <div className="space-y-6">
          <div className="p-4 rounded-2xl bg-surface border border-border flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="relative w-full max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
              <input
                type="text"
                placeholder="Search admin or target email..."
                value={auditSearch}
                onChange={(e) => setAuditSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 rounded-xl bg-surface-secondary border border-border text-xs text-text placeholder-muted focus:outline-none focus:border-primary transition"
              />
            </div>

            <select
              value={auditActionFilter}
              onChange={(e) => setAuditActionFilter(e.target.value)}
              className="px-3 py-2 rounded-xl bg-surface-secondary border border-border text-xs font-bold text-text focus:outline-none focus:border-primary"
            >
              <option value="all">All Actions</option>
              <option value="suspend_user">suspend_user</option>
              <option value="reactivate_user">reactivate_user</option>
              <option value="change_plan">change_plan</option>
              <option value="reset_usage">reset_usage</option>
              <option value="force_logout">force_logout</option>
              <option value="soft_delete_user">soft_delete_user</option>
            </select>
          </div>

          <div className="rounded-2xl bg-surface border border-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="text-[11px] font-bold text-muted uppercase bg-surface-secondary/70 border-b border-border">
                  <tr>
                    <th className="py-3 px-4">Timestamp</th>
                    <th className="py-3 px-4">Admin</th>
                    <th className="py-3 px-4">Action</th>
                    <th className="py-3 px-4">Target</th>
                    <th className="py-3 px-4">Metadata</th>
                    <th className="py-3 px-4">IP Address</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {loadingAudit ? (
                    <tr>
                      <td colSpan={6} className="text-center py-8 text-muted">
                        Loading audit trail...
                      </td>
                    </tr>
                  ) : auditLogs.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center py-8 text-muted">
                        No audit logs recorded yet.
                      </td>
                    </tr>
                  ) : (
                    auditLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-surface-secondary/40 transition">
                        <td className="py-3 px-4 text-muted whitespace-nowrap">
                          {log.created_at ? new Date(log.created_at).toLocaleString() : 'N/A'}
                        </td>
                        <td className="py-3 px-4 font-bold text-text">{log.admin_email}</td>
                        <td className="py-3 px-4">
                          <span className="px-2 py-0.5 rounded-full bg-primary/20 text-primary-light border border-primary/30 font-mono text-[10px] font-bold">
                            {log.action}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-medium text-text">{log.target_email || log.target_id || 'System'}</td>
                        <td className="py-3 px-4 font-mono text-[10px] text-muted max-w-xs truncate" title={JSON.stringify(log.details)}>
                          {JSON.stringify(log.details)}
                        </td>
                        <td className="py-3 px-4 text-muted font-mono text-[11px]">{log.ip_address || 'internal'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ─── USER DETAIL MODAL / DRAWER ─── */}
      <AnimatePresence>
        {selectedUserDetail && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedUserDetail(null)}
              className="fixed inset-0 bg-black/80 backdrop-blur-sm"
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="relative w-full max-w-2xl rounded-2xl bg-surface border border-border p-6 shadow-2xl z-10 space-y-6 max-h-[85vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between border-b border-border pb-4">
                <div>
                  <h3 className="text-base font-black text-text">{selectedUserDetail.user.email}</h3>
                  <p className="text-xs text-muted">ID: {selectedUserDetail.user.id} • Plan: {selectedUserDetail.user.plan}</p>
                </div>
                <button
                  onClick={() => setSelectedUserDetail(null)}
                  className="p-1.5 rounded-lg text-muted hover:text-text hover:bg-surface-secondary"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* User Brands Section */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-muted uppercase tracking-wider flex items-center gap-1.5">
                  <Building2 className="h-4 w-4 text-primary-light" />
                  Associated Brands ({selectedUserDetail.brands?.length || 0})
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {selectedUserDetail.brands?.map((b: any) => (
                    <div key={b.id} className="p-3.5 rounded-xl bg-surface-secondary border border-border space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="font-extrabold text-xs text-text truncate">{b.name || b.business_name}</p>
                        {b.is_active && (
                          <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-full bg-accent/20 text-accent">
                            Active
                          </span>
                        )}
                      </div>
                      {b.website_url && (
                        <p className="text-[11px] text-muted truncate flex items-center gap-1">
                          <Globe className="h-3 w-3" />
                          {b.website_url}
                        </p>
                      )}
                      <div className="flex items-center gap-1.5 pt-1">
                        <span className="h-3.5 w-3.5 rounded-full border border-white/20" style={{ backgroundColor: b.primary_color || '#1558C9' }} />
                        <span className="h-3.5 w-3.5 rounded-full border border-white/20" style={{ backgroundColor: b.secondary_color || '#D4FF24' }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Recent Activity Posts */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-muted uppercase tracking-wider flex items-center gap-1.5">
                  <Layers className="h-4 w-4 text-accent" />
                  Recent Posts Generated
                </h4>
                <div className="space-y-2">
                  {selectedUserDetail.recent_posts?.length === 0 ? (
                    <p className="text-xs text-muted">No posts generated yet.</p>
                  ) : (
                    selectedUserDetail.recent_posts?.map((p: any) => (
                      <div key={p.id} className="p-3 rounded-xl bg-surface-secondary/70 border border-border flex items-center justify-between gap-3 text-xs">
                        <div className="min-w-0">
                          <p className="font-bold text-primary-light uppercase text-[10px]">{p.platform}</p>
                          <p className="text-muted truncate max-w-md">{p.caption}</p>
                        </div>
                        <span className="text-[10px] text-muted shrink-0">
                          {p.created_at ? new Date(p.created_at).toLocaleDateString() : ''}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ─── ACTION CONFIRMATION MODAL ─── */}
      <AnimatePresence>
        {modalType && actionTargetUser && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={closeModal}
              className="fixed inset-0 bg-black/80 backdrop-blur-sm"
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="relative w-full max-w-md rounded-2xl bg-surface border border-border p-6 shadow-2xl z-10 space-y-5"
            >
              <div className="flex items-center justify-between border-b border-border pb-3">
                <h3 className="text-base font-extrabold text-text capitalize">
                  {modalType.replace('_', ' ')}
                </h3>
                <button onClick={closeModal} className="p-1 rounded-lg text-muted hover:text-text">
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="space-y-2 text-xs text-muted">
                <p>
                  Target User: <strong className="text-text">{actionTargetUser.email}</strong>
                </p>

                {modalType === 'suspend' && (
                  <p className="text-danger font-medium">
                    This user will immediately be blocked from logging in and rejected on all subsequent API calls.
                  </p>
                )}

                {modalType === 'force_logout' && (
                  <p className="text-warning font-medium">
                    This will increment the user&apos;s token version, immediately revoking all active JWT sessions.
                  </p>
                )}

                {modalType === 'delete' && (
                  <p className="text-danger font-bold">
                    This will soft-delete the user account, blocking access immediately while preserving data for audit trails.
                  </p>
                )}
              </div>

              {/* Plan Picker for change_plan */}
              {modalType === 'change_plan' && (
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-text uppercase">Select New Plan</label>
                  <select
                    value={selectedNewPlan}
                    onChange={(e) => setSelectedNewPlan(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-surface-secondary border border-border text-xs font-bold text-text focus:outline-none focus:border-primary"
                  >
                    <option value="starter">Starter (1 Brand)</option>
                    <option value="growth">Growth (3 Brands)</option>
                    <option value="pro">Pro (10 Brands)</option>
                    <option value="agency">Agency (25 Brands)</option>
                  </select>
                </div>
              )}

              {/* Reason input for suspend/reactivate */}
              {(modalType === 'suspend' || modalType === 'reactivate') && (
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-text uppercase">Reason for action</label>
                  <input
                    type="text"
                    placeholder="E.g. Suspicious automated activity or request"
                    value={actionReason}
                    onChange={(e) => setActionReason(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-surface-secondary border border-border text-xs text-text focus:outline-none focus:border-primary"
                  />
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeModal}
                  disabled={actionSubmitting}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-muted hover:text-text bg-surface-secondary border border-border transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={executeAdminAction}
                  disabled={actionSubmitting}
                  className={`px-5 py-2 rounded-xl font-extrabold text-xs transition ${
                    modalType === 'delete' || modalType === 'suspend'
                      ? 'bg-danger text-white hover:bg-danger-hover shadow-lg'
                      : 'bg-primary text-white hover:bg-primary-hover shadow-glow'
                  }`}
                >
                  {actionSubmitting ? 'Executing...' : 'Confirm Action'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}
