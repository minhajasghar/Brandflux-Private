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
  EyeOff,
  Sparkles,
  Lock,
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
  getAdminAICredentials,
  updateAdminAICredentials,
  testAdminAICredentials,
  getAdminPublishingMonitor,
  adminRetryPost,
  getAdminPlans,
  updateAdminPlans,
  getAdminSystemHealth,
  getAdminTeam,
  adminCreateAdmin,
  adminUpdateAdminRole,
  api
} from '@/lib/api'
import AdminEmailsTab from '@/components/admin/AdminEmailsTab'
import AdminIntegrationsTab from '@/components/admin/AdminIntegrationsTab'

type AdminTab = 'overview' | 'integrations' | 'users' | 'emails' | 'usage' | 'credentials' | 'scans' | 'publishing' | 'plans' | 'audit' | 'health' | 'admins'

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
    'suspend' | 'reactivate' | 'change_plan' | 'grant_credits' | 'extend_trial' | 'adjust_limits' | 'reset_usage' | 'force_logout' | 'reset_password' | 'delete' | 'restore' | 'purge' | null
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

  // ─── 3b. AI Credentials State ───────────────────────────────────────────────
  const [aiCreds, setAiCreds] = useState<any>(null)
  const [loadingAiCreds, setLoadingAiCreds] = useState(false)
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [showApiKey, setShowApiKey] = useState(false)
  const [selectedGeminiModel, setSelectedGeminiModel] = useState('models/gemini-2.5-flash')
  const [customGeminiModel, setCustomGeminiModel] = useState('')
  const [selectedImageModel, setSelectedImageModel] = useState('models/gemini-nano-banana-2.1')
  const [customImageModel, setCustomImageModel] = useState('')
  const [savingAiCreds, setSavingAiCreds] = useState(false)
  const [testingAiCreds, setTestingAiCreds] = useState(false)
  const [aiTestResult, setAiTestResult] = useState<any>(null)

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
    else if (activeTab === 'credentials') fetchAICredentials()
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

  // ─── AI Credentials Handlers ────────────────────────────────────────────────
  const fetchAICredentials = async () => {
    try {
      setLoadingAiCreds(true)
      const data = await getAdminAICredentials()
      setAiCreds(data)
      if (data.gemini_model) {
        setSelectedGeminiModel(data.gemini_model)
      }
      if (data.image_model) {
        setSelectedImageModel(data.image_model)
      }
      setApiKeyInput('')
      setAiTestResult(null)
    } catch (err: any) {
      toast.error('Failed to load AI credentials configuration')
    } finally {
      setLoadingAiCreds(false)
    }
  }

  const handleSaveAICredentials = async () => {
    try {
      setSavingAiCreds(true)
      const textModelToSave = selectedGeminiModel === 'custom' ? customGeminiModel.trim() : selectedGeminiModel
      const imageModelToSave = selectedImageModel === 'custom' ? customImageModel.trim() : selectedImageModel

      if (!textModelToSave) {
        toast.error('Please choose or enter a valid text generation model')
        setSavingAiCreds(false)
        return
      }
      if (!imageModelToSave) {
        toast.error('Please choose or enter a valid image generation model')
        setSavingAiCreds(false)
        return
      }

      const payload: any = {
        gemini_model: textModelToSave,
        image_model: imageModelToSave
      }

      if (apiKeyInput.trim()) {
        payload.gemini_api_key = apiKeyInput.trim()
      }

      const updated = await updateAdminAICredentials(payload)
      setAiCreds(updated)
      setApiKeyInput('')
      toast.success('AI credentials and model settings saved in database!')
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to update AI credentials')
    } finally {
      setSavingAiCreds(false)
    }
  }

  const handleTestAICredentials = async () => {
    try {
      setTestingAiCreds(true)
      setAiTestResult(null)
      const textModelToTest = selectedGeminiModel === 'custom' ? customGeminiModel.trim() : selectedGeminiModel
      const imageModelToTest = selectedImageModel === 'custom' ? customImageModel.trim() : selectedImageModel

      const payload: any = {
        gemini_model: textModelToTest,
        image_model: imageModelToTest
      }

      if (apiKeyInput.trim()) {
        payload.gemini_api_key = apiKeyInput.trim()
      }

      const res = await testAdminAICredentials(payload)
      setAiTestResult(res)
      if (res.status === 'pass') {
        toast.success('AI credentials verified successfully!')
      } else {
        toast.error(res.message || 'Connection test failed')
      }
    } catch (err: any) {
      const msg = err.response?.data?.detail || 'Failed to run test connection'
      setAiTestResult({
        status: 'fail',
        message: msg,
        text_model: { status: 'fail', error: msg },
        image_model: { status: 'fail', error: msg }
      })
      toast.error(msg)
    } finally {
      setTestingAiCreds(false)
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
        await api.post(`/admin/users/${actionTargetUser.id}/activate-plan`, {
          plan_id: selectedNewPlan,
          reason: actionReason || 'Plan activated by admin'
        })
        toast.success(`Plan updated to ${selectedNewPlan}`)
      } else if (modalType === 'grant_credits') {
        await api.post(`/admin/users/${actionTargetUser.id}/grant-credits`, {
          amount: newPostsLimit || 20,
          reason: actionReason || 'Manual grant by admin'
        })
        toast.success(`Granted credits to ${actionTargetUser.email}`)
      } else if (modalType === 'extend_trial') {
        await api.post(`/admin/users/${actionTargetUser.id}/extend-trial`, {
          days: newPostsLimit || 14,
          reason: actionReason || 'Trial extended by admin'
        })
        toast.success(`Extended trial for ${actionTargetUser.email}`)
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

      {/* ─── TAB: PLATFORM INTEGRATIONS ─── */}
      {activeTab === 'integrations' && <AdminIntegrationsTab />}

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
                  <th className="py-3 px-3">Credits</th>
                  <th className="py-3 px-3">Cost to Us</th>
                  <th className="py-3 px-3">Margin</th>
                  <th className="py-3 px-3">Abuse Flags</th>
                  <th className="py-3 px-3">Status</th>
                  <th className="py-3 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {users.map(u => (
                  <tr key={u.id} className="hover:bg-surface-secondary/50 transition">
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-text">{u.email}</span>
                        {u.upgrade_requested_plan && (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase bg-accent text-black animate-pulse">
                            Req: {u.upgrade_requested_plan}
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-muted">{u.full_name || 'No name'} &bull; {u.brands_count} brand(s)</div>
                    </td>
                    <td className="py-3 px-3">
                      <div className="flex flex-col gap-0.5">
                        <span className="px-2 py-0.5 rounded-md font-extrabold text-[10px] bg-primary/15 text-primary-light border border-primary/30 w-fit">
                          {u.plan}
                        </span>
                        {u.trial_days_left !== null && u.trial_days_left !== undefined && (
                          <span className="text-[9px] text-amber-400 font-bold">
                            {u.trial_days_left}d trial left
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-3 font-semibold text-text">
                      <div className="text-xs font-bold text-text">{u.credits_balance ?? 0} left</div>
                      <div className="text-[10px] text-muted">{u.credits_used ?? u.posts_used_this_month ?? 0} used</div>
                    </td>
                    <td className="py-3 px-3 font-mono font-bold text-text">
                      ${u.cost_to_us?.toFixed(2) ?? '0.00'}
                    </td>
                    <td className="py-3 px-3 font-mono font-bold">
                      <span className={u.margin_pct >= 55 ? 'text-emerald-400' : u.margin_pct > 0 ? 'text-amber-400' : 'text-muted'}>
                        {u.margin_pct !== undefined ? `${u.margin_pct}%` : '—'}
                      </span>
                    </td>
                    <td className="py-3 px-3">
                      {u.abuse_flags && u.abuse_flags.length > 0 ? (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-danger/20 text-danger border border-danger/40">
                          {u.abuse_flags.length} Flag(s)
                        </span>
                      ) : (
                        <span className="text-[10px] text-emerald-400 font-bold">✓ Clean</span>
                      )}
                    </td>
                    <td className="py-3 px-3">
                      {u.is_deleted ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">
                          Soft Deleted
                        </span>
                      ) : u.is_suspended ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-danger/20 text-danger border border-danger/40">Suspended</span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">Active</span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => handleOpenUserDetail(u.id)}
                          className="px-2 py-1 rounded-lg bg-surface-secondary hover:bg-surface-hover border border-border text-text font-bold text-[10px]"
                        >
                          View
                        </button>
                        <button
                          onClick={() => {
                            setActionTargetUser(u)
                            setSelectedNewPlan(u.plan?.toLowerCase() || 'starter')
                            setModalType('change_plan')
                          }}
                          className="px-2 py-1 rounded-lg bg-accent/15 text-accent border border-accent/30 hover:bg-accent/25 font-bold text-[10px]"
                          title="Activate / Change Plan"
                        >
                          Plan
                        </button>
                        <button
                          onClick={() => {
                            setActionTargetUser(u)
                            setNewPostsLimit(20)
                            setModalType('grant_credits')
                          }}
                          className="px-2 py-1 rounded-lg bg-surface-secondary hover:bg-surface-hover border border-border text-primary-light font-bold text-[10px]"
                          title="Grant Credits"
                        >
                          +Credits
                        </button>
                        {u.trial_days_left !== null && (
                          <button
                            onClick={() => {
                              setActionTargetUser(u)
                              setNewPostsLimit(14)
                              setModalType('extend_trial')
                            }}
                            className="px-2 py-1 rounded-lg bg-surface-secondary hover:bg-surface-hover border border-border text-amber-400 font-bold text-[10px]"
                            title="Extend Trial"
                          >
                            +Trial
                          </button>
                        )}
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

      {/* ─── TAB: DEV EMAILS OUTBOX ─── */}
      {activeTab === 'emails' && (
        <AdminEmailsTab />
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

      {/* ─── TAB 3b: AI CREDENTIALS & MODELS ─── */}
      {activeTab === 'credentials' && (
        <div className="space-y-6">
          {/* Header Card */}
          <div className="p-6 rounded-3xl bg-surface border border-border shadow-xl space-y-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-xl bg-primary/20 border border-primary/40 flex items-center justify-center text-primary-light">
                    <KeyRound className="h-4 w-4" />
                  </div>
                  <h2 className="text-lg font-extrabold text-text">AI Credentials &amp; Model Engine</h2>
                </div>
                <p className="text-xs text-muted max-w-2xl leading-relaxed">
                  Manage your Google Gemini API key and AI models safely. Stored in the encrypted platform database
                  (<code className="font-mono text-primary-light">SystemSetting</code>) so credentials persist reliably across server restarts and updates.
                </p>
              </div>

              {/* Status Badge */}
              <div className="flex items-center gap-2">
                {loadingAiCreds ? (
                  <span className="text-xs text-muted flex items-center gap-1.5">
                    <RefreshCw className="h-3 w-3 animate-spin text-muted" /> Loading...
                  </span>
                ) : aiCreds?.has_api_key ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                    <Check className="h-3.5 w-3.5" />
                    Key Active ({aiCreds.source === 'database' ? 'Database-backed' : 'Environment fallback'})
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-danger/10 border border-danger/30 text-danger">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    No API Key Set
                  </span>
                )}
              </div>
            </div>

            {aiCreds?.updated_at && (
              <div className="text-[11px] text-muted flex items-center gap-2 border-t border-border pt-3">
                <Lock className="h-3.5 w-3.5 text-muted" />
                <span>Last updated by <strong className="text-text">{aiCreds.updated_by || 'Admin'}</strong> on {new Date(aiCreds.updated_at).toLocaleString()}</span>
              </div>
            )}
          </div>

          {/* Form Card */}
          <div className="p-6 rounded-3xl bg-surface border border-border shadow-xl space-y-6">
            {/* 1. API Key Input */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-text uppercase tracking-wider flex items-center justify-between">
                <span>Google Gemini API Key</span>
                {aiCreds?.gemini_api_key_masked && (
                  <span className="text-[11px] font-mono text-muted lowercase tracking-normal">
                    Current Active: <span className="text-primary-light font-bold">{aiCreds.gemini_api_key_masked}</span>
                  </span>
                )}
              </label>
              <div className="relative">
                <input
                  type={showApiKey ? 'text' : 'password'}
                  value={apiKeyInput}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                  placeholder={
                    aiCreds?.gemini_api_key_masked
                      ? `Saved key: ${aiCreds.gemini_api_key_masked} (Type new key to change)`
                      : 'Paste your Gemini API key (AIzaSy...)'
                  }
                  className="w-full bg-background border border-border rounded-xl px-4 py-3 text-xs font-mono text-text placeholder:text-muted/60 focus:outline-none focus:border-primary pr-12 transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey(!showApiKey)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted hover:text-text p-1 transition-colors"
                  title={showApiKey ? 'Hide API Key' : 'Show API Key'}
                >
                  {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <p className="text-[11px] text-muted leading-relaxed">
                To retain your existing saved key, leave this field blank. Entering a new key will overwrite the saved key in the database and immediately activate across all workers.
              </p>
            </div>

            {/* 2. Text Model Selector */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-text uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-primary-light" />
                <span>Text Strategy &amp; Copywriting Model (Gemini)</span>
              </label>
              <select
                value={
                  ['models/gemini-2.5-flash', 'models/gemini-2.0-flash', 'models/gemini-1.5-flash', 'models/gemini-2.5-pro'].includes(selectedGeminiModel)
                    ? selectedGeminiModel
                    : 'custom'
                }
                onChange={(e) => {
                  const val = e.target.value
                  if (val === 'custom') {
                    setCustomGeminiModel(selectedGeminiModel)
                    setSelectedGeminiModel('custom')
                  } else {
                    setSelectedGeminiModel(val)
                  }
                }}
                className="w-full bg-background border border-border rounded-xl px-4 py-3 text-xs font-bold text-text focus:outline-none focus:border-primary transition-all"
              >
                <option value="models/gemini-2.5-flash">models/gemini-2.5-flash — Gemini 2.5 Flash (Recommended: Ultra-fast, high intelligence)</option>
                <option value="models/gemini-2.0-flash">models/gemini-2.0-flash — Gemini 2.0 Flash (Next-gen multimodal)</option>
                <option value="models/gemini-1.5-flash">models/gemini-1.5-flash — Gemini 1.5 Flash (Legacy standard)</option>
                <option value="models/gemini-2.5-pro">models/gemini-2.5-pro — Gemini 2.5 Pro (Complex reasoning &amp; strategy)</option>
                <option value="custom">Custom text model ID...</option>
              </select>

              {selectedGeminiModel === 'custom' && (
                <input
                  type="text"
                  value={customGeminiModel}
                  onChange={(e) => setCustomGeminiModel(e.target.value)}
                  placeholder="e.g. models/gemini-2.5-flash or custom tuned model"
                  className="w-full bg-background border border-border rounded-xl px-4 py-2.5 text-xs font-mono text-text placeholder:text-muted/60 focus:outline-none focus:border-primary mt-2"
                />
              )}
            </div>

            {/* 3. Image Model Selector */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-text uppercase tracking-wider flex items-center gap-1.5">
                <Radar className="h-3.5 w-3.5 text-primary-light" />
                <span>Visual / Background Generation Model (Nano Banana / Imagen)</span>
              </label>
              <select
                value={
                  ['models/gemini-nano-banana-2.1', 'gemini-nano-banana-2.1', 'models/imagen-3.0-generate-002'].includes(selectedImageModel)
                    ? selectedImageModel
                    : 'custom'
                }
                onChange={(e) => {
                  const val = e.target.value
                  if (val === 'custom') {
                    setCustomImageModel(selectedImageModel)
                    setSelectedImageModel('custom')
                  } else {
                    setSelectedImageModel(val)
                  }
                }}
                className="w-full bg-background border border-border rounded-xl px-4 py-3 text-xs font-bold text-text focus:outline-none focus:border-primary transition-all"
              >
                <option value="models/gemini-nano-banana-2.1">models/gemini-nano-banana-2.1 — Nano Banana 2.1 (Recommended: Native Brandflux backgrounds)</option>
                <option value="gemini-nano-banana-2.1">gemini-nano-banana-2.1 — Nano Banana 2.1 (Shorthand alias)</option>
                <option value="models/imagen-3.0-generate-002">models/imagen-3.0-generate-002 — Google Imagen 3 (High quality photorealism)</option>
                <option value="custom">Custom image model ID...</option>
              </select>

              {selectedImageModel === 'custom' && (
                <input
                  type="text"
                  value={customImageModel}
                  onChange={(e) => setCustomImageModel(e.target.value)}
                  placeholder="e.g. models/gemini-nano-banana-2.1"
                  className="w-full bg-background border border-border rounded-xl px-4 py-2.5 text-xs font-mono text-text placeholder:text-muted/60 focus:outline-none focus:border-primary mt-2"
                />
              )}
            </div>

            {/* Test Connection Results Card */}
            {aiTestResult && (
              <div
                className={`p-4 rounded-2xl border transition-all ${
                  aiTestResult.status === 'pass'
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                    : 'bg-danger/10 border-danger/30 text-danger'
                }`}
              >
                <div className="flex items-center gap-2 mb-2">
                  {aiTestResult.status === 'pass' ? (
                    <Check className="h-4 w-4 text-emerald-400 shrink-0" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 text-danger shrink-0" />
                  )}
                  <span className="text-xs font-extrabold uppercase tracking-wide">
                    {aiTestResult.status === 'pass' ? 'Live Validation Succeeded' : 'Live Validation Failed'}
                  </span>
                </div>
                <p className="text-xs leading-relaxed mb-3">
                  {aiTestResult.message}
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs border-t border-border/40 pt-3">
                  <div className="p-2.5 rounded-xl bg-background/50 border border-border/40">
                    <span className="text-[10px] font-bold uppercase text-muted block">Text Model Check</span>
                    <div className="flex items-center justify-between mt-1">
                      <span className="font-mono text-text">{aiTestResult.text_model?.model || 'Gemini'}</span>
                      <span
                        className={`text-[10px] font-extrabold px-2 py-0.5 rounded ${
                          aiTestResult.text_model?.status === 'pass'
                            ? 'bg-emerald-500/20 text-emerald-400'
                            : 'bg-danger/20 text-danger'
                        }`}
                      >
                        {aiTestResult.text_model?.status === 'pass'
                          ? `PASS (${aiTestResult.text_model.latency_ms}ms)`
                          : 'FAIL'}
                      </span>
                    </div>
                    {aiTestResult.text_model?.error && (
                      <p className="text-[10px] text-danger mt-1 leading-snug">{aiTestResult.text_model.error}</p>
                    )}
                  </div>

                  <div className="p-2.5 rounded-xl bg-background/50 border border-border/40">
                    <span className="text-[10px] font-bold uppercase text-muted block">Image Model Check</span>
                    <div className="flex items-center justify-between mt-1">
                      <span className="font-mono text-text">{aiTestResult.image_model?.model || 'Nano Banana'}</span>
                      <span
                        className={`text-[10px] font-extrabold px-2 py-0.5 rounded ${
                          aiTestResult.image_model?.status === 'pass'
                            ? 'bg-emerald-500/20 text-emerald-400'
                            : 'bg-danger/20 text-danger'
                        }`}
                      >
                        {aiTestResult.image_model?.status === 'pass'
                          ? `PASS (${aiTestResult.image_model.latency_ms}ms)`
                          : 'FAIL'}
                      </span>
                    </div>
                    {aiTestResult.image_model?.error && (
                      <p className="text-[10px] text-danger mt-1 leading-snug">{aiTestResult.image_model.error}</p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Buttons Bar */}
            <div className="flex flex-col sm:flex-row items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={handleTestAICredentials}
                disabled={testingAiCreds || savingAiCreds}
                className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-surface-secondary border border-border text-xs font-bold text-text hover:bg-surface-secondary/80 flex items-center justify-center gap-2 transition-all disabled:opacity-50"
              >
                {testingAiCreds ? (
                  <>
                    <RefreshCw className="h-3.5 w-3.5 animate-spin text-primary-light" />
                    <span>Testing Connection...</span>
                  </>
                ) : (
                  <>
                    <Play className="h-3.5 w-3.5 text-primary-light" />
                    <span>Test Connection</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleSaveAICredentials}
                disabled={savingAiCreds || testingAiCreds}
                className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-primary text-black font-extrabold text-xs hover:bg-primary-light flex items-center justify-center gap-2 transition-all shadow-md shadow-primary/20 disabled:opacity-50"
              >
                {savingAiCreds ? (
                  <>
                    <RefreshCw className="h-3.5 w-3.5 animate-spin text-black" />
                    <span>Saving to Database...</span>
                  </>
                ) : (
                  <>
                    <Check className="h-3.5 w-3.5 text-black" />
                    <span>Save Configuration</span>
                  </>
                )}
              </button>
            </div>
          </div>
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
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-extrabold text-primary-light uppercase tracking-wider block">
                        {plan.label || plan.name || planKey}
                      </span>
                      {plan.x_allowed && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-bold uppercase">
                          X Enabled
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="space-y-1">
                        <label className="text-[9px] font-bold text-muted uppercase">Price ($/mo)</label>
                        <input
                          type="number"
                          value={plan.price ?? plan.price_usd ?? 0}
                          onChange={e => setPlansConfig({
                            ...plansConfig,
                            [planKey]: { ...plan, price: parseInt(e.target.value) || 0, price_usd: parseInt(e.target.value) || 0 }
                          })}
                          className="w-full bg-surface border border-border rounded-xl px-2.5 py-1.5 text-xs font-bold text-text"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-[9px] font-bold text-muted uppercase">Annual ($/yr)</label>
                        <input
                          type="number"
                          value={plan.price_annual_usd ?? 0}
                          onChange={e => setPlansConfig({
                            ...plansConfig,
                            [planKey]: { ...plan, price_annual_usd: parseInt(e.target.value) || 0 }
                          })}
                          className="w-full bg-surface border border-border rounded-xl px-2.5 py-1.5 text-xs font-bold text-text"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="space-y-1">
                        <label className="text-[9px] font-bold text-muted uppercase">Post Credits</label>
                        <input
                          type="number"
                          value={plan.credits ?? 30}
                          onChange={e => setPlansConfig({
                            ...plansConfig,
                            [planKey]: { ...plan, credits: parseInt(e.target.value) || 0 }
                          })}
                          className="w-full bg-surface border border-border rounded-xl px-2.5 py-1.5 text-xs font-bold text-text"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-[9px] font-bold text-muted uppercase">Re-roll Pool</label>
                        <input
                          type="number"
                          value={plan.reroll_pool ?? 15}
                          onChange={e => setPlansConfig({
                            ...plansConfig,
                            [planKey]: { ...plan, reroll_pool: parseInt(e.target.value) || 0 }
                          })}
                          className="w-full bg-surface border border-border rounded-xl px-2.5 py-1.5 text-xs font-bold text-text"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="space-y-1">
                        <label className="text-[9px] font-bold text-muted uppercase">Brands Limit</label>
                        <input
                          type="number"
                          value={plan.brands_limit ?? 1}
                          onChange={e => setPlansConfig({
                            ...plansConfig,
                            [planKey]: { ...plan, brands_limit: parseInt(e.target.value) || 1 }
                          })}
                          className="w-full bg-surface border border-border rounded-xl px-2.5 py-1.5 text-xs font-bold text-text"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-[9px] font-bold text-muted uppercase">Platforms Limit</label>
                        <input
                          type="number"
                          value={plan.platforms_limit ?? 3}
                          onChange={e => setPlansConfig({
                            ...plansConfig,
                            [planKey]: { ...plan, platforms_limit: parseInt(e.target.value) || 1 }
                          })}
                          className="w-full bg-surface border border-border rounded-xl px-2.5 py-1.5 text-xs font-bold text-text"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="space-y-1">
                        <label className="text-[9px] font-bold text-muted uppercase">Daily Cap</label>
                        <input
                          type="number"
                          value={plan.daily_generation_cap ?? 10}
                          onChange={e => setPlansConfig({
                            ...plansConfig,
                            [planKey]: { ...plan, daily_generation_cap: parseInt(e.target.value) || 1 }
                          })}
                          className="w-full bg-surface border border-border rounded-xl px-2.5 py-1.5 text-xs font-bold text-text"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-[9px] font-bold text-muted uppercase">Max Posts / Day</label>
                        <input
                          type="number"
                          value={plan.max_posts_per_day ?? 2}
                          onChange={e => setPlansConfig({
                            ...plansConfig,
                            [planKey]: { ...plan, max_posts_per_day: parseInt(e.target.value) || 1 }
                          })}
                          className="w-full bg-surface border border-border rounded-xl px-2.5 py-1.5 text-xs font-bold text-text"
                        />
                      </div>
                    </div>

                    <div className="pt-2 border-t border-border flex items-center justify-between text-xs">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={Boolean(plan.x_allowed)}
                          onChange={e => setPlansConfig({
                            ...plansConfig,
                            [planKey]: { ...plan, x_allowed: e.target.checked }
                          })}
                          className="h-3.5 w-3.5 rounded accent-accent"
                        />
                        <span className="text-[10px] font-bold text-text">Allow X (Twitter)</span>
                      </label>
                      {plan.x_allowed && (
                        <input
                          type="number"
                          placeholder="Monthly X"
                          value={plan.x_monthly_allowance ?? 50}
                          onChange={e => setPlansConfig({
                            ...plansConfig,
                            [planKey]: { ...plan, x_monthly_allowance: parseInt(e.target.value) || 0 }
                          })}
                          className="w-16 bg-surface border border-border rounded-lg px-2 py-1 text-[10px] font-bold text-text text-right"
                          title="Monthly X posts allowance"
                        />
                      )}
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
          {/* Header & Controls */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-6 rounded-3xl bg-surface border border-border shadow-xl">
            <div className="space-y-1">
              <h2 className="text-lg font-extrabold text-text flex items-center gap-2">
                <Cpu className="h-5 w-5 text-primary-light" />
                <span>Platform System Health &amp; Telemetry</span>
              </h2>
              <p className="text-xs text-muted max-w-2xl leading-relaxed">
                Live monitoring of database connectivity, background job queue, storage footprint, and AI generation error rates over rolling 24-hour windows.
              </p>
            </div>

            <div className="flex items-center gap-3">
              {systemHealth?.checked_at && (
                <span className="text-[11px] text-muted font-mono hidden sm:inline-block">
                  Checked {new Date(systemHealth.checked_at).toLocaleTimeString()}
                </span>
              )}
              <button
                type="button"
                onClick={fetchHealth}
                disabled={loadingHealth}
                className="px-4 py-2 rounded-xl bg-surface-secondary border border-border text-xs font-bold text-text hover:bg-surface-secondary/80 flex items-center gap-1.5 transition"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${loadingHealth ? 'animate-spin text-primary-light' : 'text-muted'}`} />
                <span>Refresh Metrics</span>
              </button>
            </div>
          </div>

          {/* Diagnostic Alert Box when DEGRADED */}
          {systemHealth?.status === 'degraded' && (
            <div className="p-5 rounded-3xl bg-danger/10 border border-danger/30 text-text space-y-2">
              <div className="flex items-center gap-2 text-danger font-extrabold text-xs uppercase tracking-wide">
                <AlertTriangle className="h-4 w-4 text-danger shrink-0" />
                <span>Why is Status Marked as &ldquo;DEGRADED&rdquo;?</span>
              </div>
              <p className="text-xs text-muted leading-relaxed">
                The platform monitors AI generation success vs failure rates across all users over the last 24 hours.
                Because the Google API key encountered <strong className="text-danger">401 Unauthenticated errors</strong> earlier today,
                the rolling 24-hour error rate is currently at <strong className="text-danger font-mono">{systemHealth.generation_error_rate_24h}</strong> (threshold is &lt;25%).
              </p>
              <p className="text-[11px] text-muted">
                ✅ <strong>Next Step:</strong> Once you update and save a valid API key in the <strong className="text-primary-light">AI &amp; Models</strong> tab and run generations, successful calls will lower this failure rate and status will automatically switch back to <strong className="text-emerald-400">HEALTHY</strong>.
              </p>
            </div>
          )}

          {/* KPI Metrics Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-5 rounded-2xl bg-surface border border-border shadow-sm">
              <span className="text-xs font-bold text-muted uppercase">Overall Status</span>
              <p className={`text-2xl font-black uppercase mt-1 ${systemHealth?.status === 'healthy' ? 'text-emerald-400' : 'text-danger'}`}>
                {systemHealth?.status || 'Unknown'}
              </p>
              <span className="text-[11px] text-muted mt-1 block">
                {systemHealth?.status === 'healthy' ? 'All systems nominal' : 'High 24h AI error rate'}
              </span>
            </div>

            <div className="p-5 rounded-2xl bg-surface border border-border shadow-sm">
              <span className="text-xs font-bold text-muted uppercase">Database Latency</span>
              <p className="text-2xl font-black text-emerald-400 mt-1 capitalize">{systemHealth?.database || 'OK'}</p>
              <span className="text-[11px] text-muted mt-1 block">SQLite connection active</span>
            </div>

            <div className="p-5 rounded-2xl bg-surface border border-border shadow-sm">
              <span className="text-xs font-bold text-muted uppercase">Queue Length</span>
              <p className="text-2xl font-black text-primary-light mt-1">{systemHealth?.active_queue_length || 0}</p>
              <span className="text-[11px] text-muted mt-1 block">Pending scheduled posts</span>
            </div>

            <div className="p-5 rounded-2xl bg-surface border border-border shadow-sm">
              <span className="text-xs font-bold text-muted uppercase">Storage Used</span>
              <p className="text-2xl font-black text-accent mt-1">{systemHealth?.storage_used_mb || 0} MB</p>
              <span className="text-[11px] text-muted mt-1 block">Rendered images &amp; assets</span>
            </div>

            <div className="p-5 rounded-2xl bg-surface border border-border shadow-sm">
              <span className="text-xs font-bold text-muted uppercase">AI Error Rate (24h)</span>
              <p className={`text-2xl font-black font-mono mt-1 ${parseFloat(systemHealth?.generation_error_rate_24h || '0') > 25 ? 'text-danger' : 'text-emerald-400'}`}>
                {systemHealth?.generation_error_rate_24h || '0.0%'}
              </p>
              <span className="text-[11px] text-muted mt-1 block">Failed / total generation requests</span>
            </div>

            <div className="p-5 rounded-2xl bg-surface border border-border shadow-sm">
              <span className="text-xs font-bold text-muted uppercase">Failed Jobs (24h)</span>
              <p className="text-2xl font-black text-text mt-1">{systemHealth?.failed_jobs_24h || 0}</p>
              <span className="text-[11px] text-muted mt-1 block">Scheduler publishing errors</span>
            </div>

            <div className="p-5 rounded-2xl bg-surface border border-border shadow-sm">
              <span className="text-xs font-bold text-muted uppercase">Scheduler Engine</span>
              <p className="text-2xl font-black text-emerald-400 mt-1 capitalize">{systemHealth?.scheduler_status || 'Running'}</p>
              <span className="text-[11px] text-muted mt-1 block">APScheduler background daemon</span>
            </div>

            <div className="p-5 rounded-2xl bg-surface border border-border shadow-sm">
              <span className="text-xs font-bold text-muted uppercase">Gemini AI Key</span>
              <p className="text-2xl font-black text-primary-light mt-1">
                {systemHealth?.gemini_api_configured ? 'Configured' : 'Missing'}
              </p>
              <span className="text-[11px] text-muted mt-1 block">Managed via database</span>
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
                    <option value="trial">14-Day Free Trial</option>
                    <option value="starter">Starter Plan ($19/mo)</option>
                    <option value="growth">Growth Plan ($39/mo)</option>
                    <option value="pro">Pro Plan ($89/mo)</option>
                  </select>
                </div>
              )}

              {modalType === 'grant_credits' && (
                <div className="space-y-1 text-xs">
                  <label className="font-bold text-muted">Credits to Grant</label>
                  <input
                    type="number"
                    value={newPostsLimit}
                    onChange={e => setNewPostsLimit(parseInt(e.target.value) || 0)}
                    placeholder="e.g. 20"
                    className="w-full bg-surface-secondary border border-border rounded-xl px-3 py-2 text-xs font-bold text-text"
                  />
                </div>
              )}

              {modalType === 'extend_trial' && (
                <div className="space-y-1 text-xs">
                  <label className="font-bold text-muted">Days to Extend Trial</label>
                  <input
                    type="number"
                    value={newPostsLimit}
                    onChange={e => setNewPostsLimit(parseInt(e.target.value) || 0)}
                    placeholder="e.g. 14"
                    className="w-full bg-surface-secondary border border-border rounded-xl px-3 py-2 text-xs font-bold text-text"
                  />
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
