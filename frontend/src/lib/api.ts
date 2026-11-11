import axios from 'axios'

const getInitialBaseUrl = () => {
  if (typeof window !== 'undefined' && window.location.hostname) {
    const host = window.location.hostname
    if (host.includes('brandflux') || host.includes('tntinnov')) {
      // In production domain, all backend endpoints are routed by Apache to port 8010
      return ''
    }
    if (host !== 'localhost' && host !== '127.0.0.1') {
      // Use Next.js internal proxy rewrite for LAN clients
      return '/api/py'
    }
  }
  return process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000'
}

const api = axios.create({
  baseURL: getInitialBaseUrl(),
  timeout: 60000, // 60-second default base timeout
  headers: {
    'Content-Type': 'application/json',
  },
})

// Interceptor for tokens & dynamic LAN routing
api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const host = window.location.hostname
    if (host && (host.includes('brandflux') || host.includes('tntinnov'))) {
      config.baseURL = ''
    } else if (host && host !== 'localhost' && host !== '127.0.0.1') {
      config.baseURL = '/api/py'
    }
    const token = localStorage.getItem('brandflux_token') || sessionStorage.getItem('brandflux_token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
  }
  return config
})

// Handle responses: translate localhost URLs to current host & handle 401 Unauthorized globally
api.interceptors.response.use(
  (response) => {
    if (typeof window !== 'undefined' && window.location.hostname && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
      const isProd = window.location.hostname.includes('brandflux') || window.location.hostname.includes('tntinnov')
      const targetPrefix = isProd ? '' : '/api/py'
      const rewriteHost = (data: any): any => {
        if (!data) return data
        if (typeof data === 'string') {
          return data
            .replace(/http:\/\/localhost:8000/g, targetPrefix)
            .replace(/http:\/\/127\.0\.0\.1:8000/g, targetPrefix)
        }
        if (Array.isArray(data)) {
          return data.map(rewriteHost)
        }
        if (typeof data === 'object') {
          const res: any = {}
          for (const key of Object.keys(data)) {
            res[key] = rewriteHost(data[key])
          }
          return res
        }
        return data
      }
      response.data = rewriteHost(response.data)
    }
    return response
  },
  (error) => {
    if (error.response?.status === 401) {
      if (typeof window !== 'undefined') {
        const currentPath = window.location.pathname || ''
        const publicPages = ['/', '/login', '/signup', '/pricing']
        const isPublicPage = publicPages.includes(currentPath)

        const requestUrl = error.config?.url || ''
        const authOrPublicEndpoints = [
          '/auth/login',
          '/auth/signup',
          '/brand/scan-website',
          '/brand/detect-business-type'
        ]
        const isAuthOrPublicEndpoint = authOrPublicEndpoints.some((endpoint) =>
          requestUrl.includes(endpoint)
        )

        // Only redirect to /login if a protected page was accessing a protected endpoint
        if (!isPublicPage && !isAuthOrPublicEndpoint) {
          localStorage.removeItem('brandflux_token')
          sessionStorage.removeItem('brandflux_token')
          document.cookie = 'brandflux_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT;'
          document.cookie = 'brandflux_onboarding_complete=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT;'
          window.location.href = '/login'
        }
      }
    }
    return Promise.reject(error)
  }
)

export async function signup(data: any) {
  const response = await api.post('/auth/signup', data)
  const { token, onboarding_complete, role } = response.data
  if (typeof window !== 'undefined') {
    localStorage.setItem('brandflux_token', token)
    // Default signup behavior is persistent login
    document.cookie = `brandflux_token=${token}; path=/; max-age=604800;`
    document.cookie = `brandflux_onboarding_complete=${onboarding_complete ? 'true' : 'false'}; path=/; max-age=604800;`
    document.cookie = `brandflux_user_role=${role || 'user'}; path=/; max-age=604800;`
  }
  return response.data
}

export async function login(data: any, rememberMe: boolean = false) {
  const response = await api.post('/auth/login', data)
  const { token, onboarding_complete, role } = response.data
  const userRole = role || 'user'
  if (typeof window !== 'undefined') {
    if (rememberMe) {
      localStorage.setItem('brandflux_token', token)
      sessionStorage.removeItem('brandflux_token')
      document.cookie = `brandflux_token=${token}; path=/; max-age=604800;`
      document.cookie = `brandflux_onboarding_complete=${onboarding_complete ? 'true' : 'false'}; path=/; max-age=604800;`
      document.cookie = `brandflux_user_role=${userRole}; path=/; max-age=604800;`
    } else {
      sessionStorage.setItem('brandflux_token', token)
      localStorage.removeItem('brandflux_token')
      // Session-only cookie (no max-age/expires)
      document.cookie = `brandflux_token=${token}; path=/;`
      document.cookie = `brandflux_onboarding_complete=${onboarding_complete ? 'true' : 'false'}; path=/;`
      document.cookie = `brandflux_user_role=${userRole}; path=/;`
    }
  }
  return response.data
}

export async function getProfile() {
  const response = await api.get('/auth/me')
  if (typeof window !== 'undefined' && response.data?.user?.role) {
    const role = response.data.user.role
    document.cookie = `brandflux_user_role=${role}; path=/; max-age=604800;`
  }
  return response.data
}

export async function updateUserProfile(data: { full_name?: string; email?: string }) {
  const response = await api.put('/auth/profile', data)
  if (response.data?.token && typeof window !== 'undefined') {
    localStorage.setItem('brandflux_token', response.data.token)
  }
  return response.data
}

export async function requestEmailChange(data: { new_email: string; current_password: string }) {
  const response = await api.post('/auth/request-email-change', data)
  return response.data
}

export async function confirmEmailChange(token: string) {
  const response = await api.post('/auth/confirm-email-change', { token })
  if (response.data?.token && typeof window !== 'undefined') {
    localStorage.setItem('brandflux_token', response.data.token)
  }
  return response.data
}

export async function scanWebsite(url: string) {
  const response = await api.post('/brand/scan-website', { website_url: url })
  return response.data
}

export async function detectBusinessType(url: string) {
  const response = await api.post('/brand/detect-business-type', { website_url: url })
  return response.data
}

export async function getDailyQuestions() {
  const response = await api.post('/sessions/questions')
  return response.data
}

export async function generateContent(data: any) {
  const response = await api.post('/sessions/generate-content', data)
  return response.data
}

export async function getBrandKit(brandId?: string) {
  const response = await api.get('/brand/kit', { params: brandId ? { brand_id: brandId } : {} })
  return response.data
}

export async function updateBrandKit(data: any, brandId?: string) {
  const response = await api.put('/brand/kit', data, { params: brandId ? { brand_id: brandId } : {} })
  return response.data
}

export async function getUserBrands() {
  const response = await api.get('/brand/list')
  return response.data
}

export async function addNewBrand(data: { name?: string; website_url: string; brand_kit?: any }) {
  const response = await api.post('/brand/add', data)
  return response.data
}

export async function switchActiveBrand(brandId: string) {
  const response = await api.post(`/brand/switch/${brandId}`)
  return response.data
}

export async function updateBrandWebsite(data: { website_url: string; rescan?: boolean }, brandId?: string) {
  const response = await api.put(brandId ? `/brand/${brandId}/website` : '/brand/website', data)
  return response.data
}

export async function rescanBrandWebsite(brandId?: string) {
  const response = await api.post('/brand/rescan', null, { params: brandId ? { brand_id: brandId } : {} })
  return response.data
}

export async function uploadBrandLogo(file: File, logoType: 'primary' | 'alt' = 'primary') {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('logo_type', logoType)
  const response = await api.post('/brand/upload-logo', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return response.data
}

export async function rescanBrand() {
  const response = await api.post('/brand/rescan')
  return response.data
}

export async function getScheduledPosts(params?: Record<string, any>) {
  const response = await api.get('/calendar/posts', { params })
  return response.data
}

export async function createScheduledPost(data: any) {
  const response = await api.post('/calendar/posts', data)
  return response.data
}

export async function updateScheduledPost(id: string, data: any) {
  const response = await api.put(`/calendar/posts/${id}`, data)
  return response.data
}

export async function deleteScheduledPost(id: string) {
  const response = await api.delete(`/calendar/posts/${id}`)
  return response.data
}

export async function getConnectedSocialAccounts() {
  const response = await api.get('/oauth/accounts')
  return response.data
}

export async function getPlatformsStatus(): Promise<Record<string, boolean>> {
  const response = await api.get('/oauth/platforms-status')
  return response.data
}

export async function setActiveSocialAccount(id: string) {
  const response = await api.post(`/oauth/accounts/${id}/set-active`)
  return response.data
}

export async function getOAuthAuthorizeUrl(platform: string) {
  const response = await api.get(`/oauth/${platform}/authorize`)
  return response.data
}

export async function disconnectSocialAccount(id: string) {
  const response = await api.delete(`/oauth/accounts/${id}`)
  return response.data
}

export async function getAdminIntegrations() {
  const response = await api.get('/admin/integrations')
  return response.data
}

export async function pollPostStatus(postId: string) {
  const response = await api.get(`/webhooks/posts/${postId}/poll-status`)
  return response.data
}

export async function generateCarousel(data: {
  topic: string
  slide_count?: number
  aspect_ratio?: '1:1' | '4:5'
  custom_cta?: string
}) {
  const response = await api.post('/content/carousel', data)
  return response.data
}

export async function getTemplates() {
  const response = await api.get('/content/templates')
  return response.data
}

export async function renderTemplate(data: {
  template_name: string
  aspect_ratio?: '1:1' | '4:5' | '9:16'
  headline?: string
  subtext?: string
  cta?: string
  category?: string
  extra_data?: Record<string, any>
}) {
  const response = await api.post('/content/templates/render', data)
  return response.data
}

// ─── Autopilot API ──────────────────────────────────────────────────────────
export async function getAutopilotConfig() {
  const response = await api.get('/autopilot/config')
  return response.data
}

export async function updateAutopilotConfig(data: any) {
  const response = await api.put('/autopilot/config', data)
  return response.data
}

export async function toggleKillSwitch(kill_switch: boolean, reason: string = 'Manual operator toggle') {
  const response = await api.post('/autopilot/kill-switch', { kill_switch, reason })
  return response.data
}

export async function triggerAutopilotNow(force: boolean = false) {
  const response = await api.post('/autopilot/run-now', null, { params: { force } })
  return response.data
}

export async function getAutopilotLogs(params?: Record<string, any>) {
  const response = await api.get('/autopilot/logs', { params })
  return response.data
}

export async function getWeeklyPlan() {
  const response = await api.get('/autopilot/weekly-plan')
  return response.data
}

export async function generateWeeklyPlan(data?: { force?: boolean; event_details?: string }) {
  const response = await api.post('/autopilot/generate-weekly-plan', data, { timeout: 120000 })
  return response.data
}

export async function answerEventCheckin(has_event: boolean, event_details?: string) {
  const response = await api.post('/autopilot/event-checkin', { has_event, event_details })
  return response.data
}

export async function editCardWithPrompt(cardId: string, prompt: string) {
  const response = await api.post(`/autopilot/cards/${cardId}/edit-prompt`, { prompt }, { timeout: 90000 })
  return response.data
}

export async function updateCardCaption(cardId: string, caption: string, platform?: string) {
  const response = await api.put(`/autopilot/cards/${cardId}/copy`, { caption, platform })
  return response.data
}

export async function changeCardImage(cardId: string, change_type: string, image_url?: string) {
  const response = await api.post(`/autopilot/cards/${cardId}/change-image`, { change_type, image_url })
  return response.data
}

export async function uploadCardImage(cardId: string, file: File) {
  const formData = new FormData()
  formData.append('file', file)
  const response = await api.post(`/autopilot/cards/${cardId}/upload-image`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  })
  return response.data
}

export async function skipCard(cardId: string) {
  const response = await api.post(`/autopilot/cards/${cardId}/skip`)
  return response.data
}

export async function rescheduleCard(cardId: string, scheduled_at: string) {
  const response = await api.post(`/autopilot/cards/${cardId}/reschedule`, { scheduled_at })
  return response.data
}

export async function toggleCardStatus(cardId: string) {
  const response = await api.post(`/autopilot/cards/${cardId}/toggle-status`)
  return response.data
}

export async function publishCardNowVerified(cardId: string) {
  const response = await api.post(`/autopilot/cards/${cardId}/publish-now`, null, { timeout: 60000 })
  return response.data
}

export async function getImageLibrary() {
  const response = await api.get('/autopilot/image-library')
  return response.data
}

export async function getPendingApprovalPosts() {
  const response = await api.get('/autopilot/weekly-plan')
  return response.data
}

export async function approveAllPendingPosts() {
  const response = await api.post('/autopilot/approve-all')
  return response.data
}

export async function approveSinglePost(postId: string) {
  const response = await api.post(`/autopilot/cards/${postId}/toggle-status`)
  return response.data
}

export async function rejectSinglePost(postId: string, reason?: string) {
  const response = await api.post(`/autopilot/cards/${postId}/skip`)
  return response.data
}

// ─── Analytics API ──────────────────────────────────────────────────────────

export async function getAnalyticsOverview(days: number = 30) {
  const response = await api.get('/analytics/overview', { params: { days } })
  return response.data
}

export async function getTopBottomPosts(days: number = 30, limit: number = 5) {
  const response = await api.get('/analytics/top-bottom', { params: { days, limit } })
  return response.data
}

export async function getWhatWorkedSummary(days: number = 30) {
  const response = await api.get('/analytics/what-worked', { params: { days } })
  return response.data
}

export async function syncAnalyticsMetrics(days: number = 30) {
  const response = await api.post('/analytics/sync', null, { params: { days } })
  return response.data
}

// ─── Admin Portal API ────────────────────────────────────────────────────────

export async function getAdminOverview() {
  const response = await api.get('/admin/overview')
  return response.data
}

export async function getAdminUsers(params?: { search?: string; plan?: string; status?: string; skip?: number; limit?: number }) {
  const response = await api.get('/admin/users', { params })
  return response.data
}

export async function getAdminUserDetail(userId: string) {
  const response = await api.get(`/admin/users/${userId}`)
  return response.data
}

export async function adminSuspendUser(userId: string, reason?: string) {
  const response = await api.post(`/admin/users/${userId}/suspend`, { reason })
  return response.data
}

export async function adminReactivateUser(userId: string, reason?: string) {
  const response = await api.post(`/admin/users/${userId}/reactivate`, { reason })
  return response.data
}

export async function adminChangeUserPlan(userId: string, plan: string) {
  const response = await api.put(`/admin/users/${userId}/plan`, { plan })
  return response.data
}

export async function adminResetUserUsage(userId: string) {
  const response = await api.post(`/admin/users/${userId}/reset-usage`)
  return response.data
}

export async function adminForceLogoutUser(userId: string) {
  const response = await api.post(`/admin/users/${userId}/force-logout`)
  return response.data
}

export async function adminDeleteUser(userId: string, confirmEmail?: string, reason?: string) {
  const response = await api.delete(`/admin/users/${userId}`, {
    params: confirmEmail ? { confirm_email: confirmEmail } : {},
    data: { confirm_email: confirmEmail, reason }
  })
  return response.data
}

export async function adminPurgeUser(userId: string) {
  const response = await api.post(`/admin/users/${userId}/purge`)
  return response.data
}

export async function getAdminUsageReport(params?: { skip?: number; limit?: number }) {
  const response = await api.get('/admin/usage', { params })
  return response.data
}

export async function getAdminAuditLogs(params?: { action?: string; search?: string; skip?: number; limit?: number }) {
  const response = await api.get('/admin/audit-logs', { params })
  return response.data
}

export async function adminAdjustUserLimits(userId: string, data: { posts_used_this_month?: number; plan?: string; reason?: string }) {
  const response = await api.put(`/admin/users/${userId}/limits`, data)
  return response.data
}

export async function adminResetPassword(userId: string) {
  const response = await api.post(`/admin/users/${userId}/reset-password`)
  return response.data
}

export async function adminRestoreUser(userId: string) {
  const response = await api.post(`/admin/users/${userId}/restore`)
  return response.data
}

export async function adminExportUserData(userId: string) {
  const response = await api.get(`/admin/users/${userId}/export`)
  return response.data
}

export async function getAdminScans(params?: { skip?: number; limit?: number; status?: string }) {
  const response = await api.get('/admin/scans', { params })
  return response.data
}

export async function adminTestScan(websiteUrl: string) {
  const response = await api.post('/admin/scans/test', { website_url: websiteUrl })
  return response.data
}

export async function adminRescanUser(userId: string, websiteUrl?: string) {
  const response = await api.post('/admin/scans/rescan-user', { user_id: userId, website_url: websiteUrl })
  return response.data
}

export async function getAdminFeatureFlags() {
  const response = await api.get('/admin/feature-flags')
  return response.data
}

export async function updateAdminFeatureFlags(flags: any) {
  const response = await api.put('/admin/feature-flags', flags)
  return response.data
}

export async function getAdminAICredentials() {
  const response = await api.get('/admin/ai-credentials')
  return response.data
}

export async function updateAdminAICredentials(data: {
  gemini_api_key?: string
  gemini_model?: string
  image_model?: string
}) {
  const response = await api.put('/admin/ai-credentials', data)
  return response.data
}

export async function testAdminAICredentials(data: {
  gemini_api_key?: string
  gemini_model?: string
  image_model?: string
}) {
  const response = await api.post('/admin/ai-credentials/test', data)
  return response.data
}

export async function getAdminPublishingMonitor() {
  const response = await api.get('/admin/publishing/monitor')
  return response.data
}

export async function adminRetryPost(postId: string) {
  const response = await api.post(`/admin/publishing/retry/${postId}`)
  return response.data
}

export async function getAdminPlans() {
  const response = await api.get('/admin/plans')
  return response.data
}

export async function updateAdminPlans(plans: any) {
  const response = await api.put('/admin/plans', plans)
  return response.data
}

export async function getAdminSystemHealth() {
  const response = await api.get('/admin/system-health')
  return response.data
}

export async function getAdminTeam() {
  const response = await api.get('/admin/admins')
  return response.data
}

export async function adminCreateAdmin(data: { email: string; password: string; full_name?: string; role: string }) {
  const response = await api.post('/admin/admins', data)
  return response.data
}

export async function adminUpdateAdminRole(adminId: string, role: string) {
  const response = await api.put(`/admin/admins/${adminId}/role`, { role })
  return response.data
}

// ─── Reference Images & Multi-Variant Sessions ──────────────────────────────

export async function uploadReferenceImage(file: File, mode: 'use_photo' | 'style_inspiration') {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('mode', mode)

  const response = await api.post('/sessions/upload-reference', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  })
  return response.data
}

export async function generateSessionVariants(payload: {
  session_id: string
  answer_1: string
  answer_2: string
  answer_3: string
  context_text?: string
  reference_images?: Array<{ url: string; mode: string; filename?: string }>
  variant_count?: number
  target_platform?: string
}) {
  const response = await api.post('/sessions/generate-variants', payload, {
    timeout: 120000 // 120s timeout for multi-variant generation
  })
  return response.data
}

export async function selectSessionVariant(payload: {
  variant_id: string
  session_id: string
  adjusted_caption?: string
  adjusted_hashtags?: string[]
  target_platform?: string
  platform_copies?: Record<string, any>
  selected_platforms?: string[]
}) {
  const response = await api.post('/sessions/select-variant', payload)
  return response.data
}

export async function regenerateSingleVariant(payload: {
  session_id: string
  variant_id?: string
  style_direction?: string
  reference_context?: string
  target_platform?: string
  selected_platforms?: string[]
}) {
  const response = await api.post('/sessions/regenerate-variant', payload, {
    timeout: 90000 // 90s timeout for single variant regeneration
  })
  return response.data
}

// ─── Notification Center (In-App) ───────────────────────────
export async function getUnreadNotificationCount() {
  const response = await api.get('/notifications/unread-count')
  return response.data
}

export async function getNotifications(unreadOnly = false, limit = 30, offset = 0) {
  const response = await api.get(`/notifications?unread_only=${unreadOnly}&limit=${limit}&offset=${offset}`)
  return response.data
}

export async function markNotificationRead(id: string) {
  const response = await api.post(`/notifications/${id}/read`)
  return response.data
}

export async function markAllNotificationsRead() {
  const response = await api.post('/notifications/mark-all-read')
  return response.data
}

export async function executeNotificationAction(
  id: string,
  payload: {
    action: string
    choice?: string
    special_text?: string
    selected_platforms?: string[]
  }
) {
  const response = await api.post(`/notifications/${id}/action`, payload)
  return response.data
}

// ─── Admin Dev Emails Outbox ────────────────────────────────
export async function getAdminCapturedEmails(filters?: {
  recipient?: string
  template?: string
  status?: string
  limit?: number
  offset?: number
}) {
  const params = new URLSearchParams()
  if (filters?.recipient) params.append('recipient', filters.recipient)
  if (filters?.template && filters.template !== 'all') params.append('template', filters.template)
  if (filters?.status && filters.status !== 'all') params.append('status_filter', filters.status)
  if (filters?.limit) params.append('limit', String(filters.limit))
  if (filters?.offset) params.append('offset', String(filters.offset))

  const response = await api.get(`/admin/emails?${params.toString()}`)
  return response.data
}

export async function getAdminCapturedEmailDetail(id: string) {
  const response = await api.get(`/admin/emails/${id}`)
  return response.data
}

// ─── Email Verification & Auth ──────────────────────────────
export async function verifyEmail(token: string) {
  const response = await api.post('/auth/verify-email', { token })
  return response.data
}

export async function getVerifyInfo(email: string) {
  const response = await api.get(`/auth/verify-info?email=${encodeURIComponent(email)}`)
  return response.data
}

export async function resendVerification(email: string) {
  const response = await api.post('/auth/resend-verification', { email })
  return response.data
}

// ─── Credits & Billing ──────────────────────────────────────
export async function getUserCredits() {
  const response = await api.get('/billing/credits')
  return response.data
}

export async function getBillingStatus() {
  const response = await api.get('/billing/status')
  return response.data
}

export async function getPublicPlans() {
  const response = await api.get('/billing/plans')
  return response.data
}

export async function requestPlanUpgrade(planId: string, billingCycle: string = 'monthly', note?: string) {
  const response = await api.post('/billing/request-upgrade', { plan_id: planId, billing_cycle: billingCycle, note })
  return response.data
}

export async function purchaseCreditPack(amount: number = 20, packName: string = 'Standard Pack (20 credits)') {
  const response = await api.post('/billing/credit-pack', { amount, pack_name: packName })
  return response.data
}

// ─── Team & Approver Workflow ───────────────────────────────
export async function getBrandTeam(brandId: string) {
  const response = await api.get(`/brand/${brandId}/team`)
  return response.data
}

export async function inviteTeamApprover(brandId: string, email: string) {
  const response = await api.post(`/brand/${brandId}/team/invite`, { email })
  return response.data
}

export async function resendApproverInvite(brandId: string, memberId: string) {
  const response = await api.post(`/brand/${brandId}/team/resend-invite/${memberId}`)
  return response.data
}

export async function removeTeamMember(brandId: string, memberId: string) {
  const response = await api.delete(`/brand/${brandId}/team/members/${memberId}`)
  return response.data
}

export async function updateTeamSettings(
  brandId: string,
  settings: {
    require_approval?: boolean
    approval_mode?: string
    approval_autopilot_routing?: string
    approval_deadline_hours?: number
    approval_reminder_hours?: number
  }
) {
  const response = await api.put(`/brand/${brandId}/team/settings`, settings)
  return response.data
}

export async function getInviteDetails(token: string) {
  const response = await api.get(`/brand/invite/details?token=${encodeURIComponent(token)}`)
  return response.data
}

export async function acceptInvite(data: { token: string; password?: string; full_name?: string }) {
  const response = await api.post('/brand/invite/accept', data)
  return response.data
}

export async function getApprovalsInbox(status: string = 'waiting', brandId?: string) {
  const params = new URLSearchParams({ status })
  if (brandId) params.append('brand_id', brandId)
  const response = await api.get(`/approvals/inbox?${params.toString()}`)
  return response.data
}

export async function getApprovalPostDetail(postId: string) {
  const response = await api.get(`/approvals/${postId}`)
  return response.data
}

export async function submitPostForApproval(postId: string) {
  const response = await api.post(`/approvals/${postId}/submit`)
  return response.data
}

export async function approvePost(postId: string, notes?: string) {
  const response = await api.post(`/approvals/${postId}/approve`, { notes })
  return response.data
}

export async function editAndApprovePost(
  postId: string,
  payload: {
    captions: Record<string, string>
    hashtags?: Record<string, any>
    image_url?: string
    scheduled_time?: string
    notes?: string
  }
) {
  const response = await api.post(`/approvals/${postId}/edit-and-approve`, payload)
  return response.data
}

export async function requestPostChanges(postId: string, comment: string, chips: string[] = []) {
  const response = await api.post(`/approvals/${postId}/request-changes`, { comment, chips })
  return response.data
}

export async function rejectPost(postId: string, reason: string) {
  const response = await api.post(`/approvals/${postId}/reject`, { reason })
  return response.data
}

export async function resubmitPost(
  postId: string,
  payload: {
    captions?: Record<string, string>
    hashtags?: Record<string, any>
    image_url?: string
    scheduled_time?: string
    note?: string
  }
) {
  const response = await api.post(`/approvals/${postId}/resubmit`, payload)
  return response.data
}

export { api }
export default api
