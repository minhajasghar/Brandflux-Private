'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  Share2,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  ChevronDown,
  Check,
  X
} from 'lucide-react'
import {
  getConnectedSocialAccounts,
  getPlatformsStatus,
  getOAuthAuthorizeUrl,
  disconnectSocialAccount,
  setActiveSocialAccount
} from '@/lib/api'
import { toast } from 'react-hot-toast'

interface SocialAccountItem {
  id: string
  platform: string
  account_id: string
  account_name: string
  is_active: boolean
  token_expires_at?: string
  days_until_expiry?: number
  needs_reconnect: boolean
  metadata_json?: any
  avatar_url?: string
}

// ─────────────────────────────────────────────────────────────────────────────
// OFFICIAL BRAND SVG ICONS
// ─────────────────────────────────────────────────────────────────────────────
import {
  FacebookIcon,
  InstagramIcon,
  LinkedInIcon,
  TikTokIcon,
  XTwitterIcon
} from '@/components/shared/SocialIcons'

// Resilient Avatar component that falls back cleanly if image load fails
function AccountAvatar({
  avatarUrl,
  name,
  fallbackBg,
  fallbackTextColor,
  fallbackText
}: {
  avatarUrl?: string
  name: string
  fallbackBg: string
  fallbackTextColor: string
  fallbackText: string
}) {
  const [imgError, setImgError] = useState(false)

  if (avatarUrl && !imgError) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        referrerPolicy="no-referrer"
        onError={() => setImgError(true)}
        className="h-10 w-10 rounded-full object-cover border border-border shrink-0 shadow-sm"
      />
    )
  }

  return (
    <div className={`h-10 w-10 rounded-full ${fallbackBg} border flex items-center justify-center text-sm font-black ${fallbackTextColor} shrink-0`}>
      {fallbackText}
    </div>
  )
}

// Friendly error translation map (replaces all technical codes with plain human language)
const FRIENDLY_ERRORS: Record<string, string> = {
  'linkedin_oauth_unauthorized_scope_error': 'LinkedIn connection was canceled or permissions were not granted. Please try connecting again and approve the requested access.',
  'missing_code': 'Sign-in was canceled or timed out. Please try again.',
  'access_denied': 'Access was denied during login. Please try again when you are ready.',
  'token_exchange_failed': 'Could not complete login with the social network. Please try again in a few moments.',
  'invalid_state': 'Connection session expired for security. Please try clicking Connect again.',
  'brand_not_found': 'Brand profile not found. Please refresh the page and try again.',
  'tiktok_auth_failed': 'TikTok authorization could not be completed. Please ensure your TikTok account is set up with posting permissions.',
  'twitter_auth_failed': 'X (Twitter) connection could not be established. Please try again.',
  'instagram_not_business': 'Your Instagram account must be a Business or Creator account connected to your Facebook Page.'
}

export default function ConnectedAccountsTab() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [accounts, setAccounts] = useState<SocialAccountItem[]>([])
  const [platformConfig, setPlatformConfig] = useState<Record<string, boolean>>({
    facebook: false,
    instagram: false,
    linkedin: false,
    tiktok: false,
    twitter: false
  })
  const [loading, setLoading] = useState(true)
  const [connectingPlatform, setConnectingPlatform] = useState<string | null>(null)
  const [actionInProgress, setActionInProgress] = useState<string | null>(null)
  const [showInstagramGuide, setShowInstagramGuide] = useState(false)
  const [bannerError, setBannerError] = useState<string | null>(null)

  // 1. Initial Load & URL Parameter Handling
  const fetchData = async () => {
    try {
      setLoading(true)
      const [accs, statuses] = await Promise.all([
        getConnectedSocialAccounts(),
        getPlatformsStatus().catch(() => ({} as Record<string, boolean>))
      ])

      setAccounts(Array.isArray(accs) ? accs : [])
      if (statuses && typeof statuses === 'object') {
        setPlatformConfig(statuses)
      }
    } catch (err) {
      console.error('Failed to load accounts:', err)
      toast.error('Unable to load connected accounts. Please try refreshing.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  // Check URL query parameters for friendly feedback
  useEffect(() => {
    const errorParam = searchParams.get('error')
    const errorDesc = searchParams.get('error_desc')
    const connectedParam = searchParams.get('connected')
    const statusParam = searchParams.get('status')

    if (errorParam) {
      const cleanMsg = FRIENDLY_ERRORS[errorParam] || errorDesc || 'Connection could not be completed. Please try again.'
      setBannerError(cleanMsg)
      toast.error(cleanMsg, { id: 'oauth-error', duration: 6000 })
      // Clean query params from URL
      router.replace('/settings?tab=connected')
    } else if (connectedParam && statusParam === 'success') {
      const platName = connectedParam === 'meta' ? 'Facebook & Instagram' : connectedParam.toUpperCase()
      toast.success(`${platName} connected successfully!`, { id: 'oauth-success' })
      setBannerError(null)
      router.replace('/settings?tab=connected')
      fetchData()
    }
  }, [searchParams])

  // 2. Connect via Platform Login Popup
  const handleConnect = async (platformKey: string) => {
    if (!platformConfig[platformKey] && platformKey !== 'meta') {
      toast('This integration is coming soon.', { icon: '⏳' })
      return
    }

    try {
      setConnectingPlatform(platformKey)
      const res = await getOAuthAuthorizeUrl(platformKey)
      const authUrl = res?.authorization_url || res?.auth_url

      if (!authUrl) {
        throw new Error('No authorization URL returned from server.')
      }

      // Open centered popup window
      const width = 600
      const height = 750
      const left = window.screenX + (window.outerWidth - width) / 2
      const top = window.screenY + (window.outerHeight - height) / 2
      const popup = window.open(
        authUrl,
        `Connect ${platformKey}`,
        `width=${width},height=${height},left=${left},top=${top},status=no,toolbar=no,menubar=no,location=yes`
      )

      // Watch for popup completion
      const checkTimer = setInterval(() => {
        if (!popup || popup.closed) {
          clearInterval(checkTimer)
          setConnectingPlatform(null)
          // Refresh accounts after popup closes
          setTimeout(() => fetchData(), 1000)
        }
      }, 800)
    } catch (err: any) {
      console.error(`Connect ${platformKey} error:`, err)
      const detail = err.response?.data?.detail
      const serverMsg = typeof detail === 'object' ? (detail?.message || detail?.code) : detail
      const friendly = (typeof detail === 'string' && FRIENDLY_ERRORS[detail]) || serverMsg || err.message || 'Failed to start connection. Please check your internet connection and try again.'
      toast.error(friendly, { duration: 5000 })
      setConnectingPlatform(null)
    }
  }

  // 3. Disconnect
  const handleDisconnect = async (accountId: string, accountName: string) => {
    if (!confirm(`Are you sure you want to disconnect ${accountName}? Scheduled posts to this account will pause.`)) {
      return
    }
    try {
      setActionInProgress(accountId)
      await disconnectSocialAccount(accountId)
      toast.success(`${accountName} disconnected.`)
      fetchData()
    } catch (err) {
      toast.error('Failed to disconnect account. Please try again.')
    } finally {
      setActionInProgress(null)
    }
  }

  // 4. Set Active Account (For Multiple Pages or Profile vs Org)
  const handleSetActive = async (accountId: string, name: string) => {
    try {
      setActionInProgress(accountId)
      await setActiveSocialAccount(accountId)
      toast.success(`${name} is now your active publishing account.`)
      fetchData()
    } catch (err) {
      toast.error('Failed to switch active account.')
    } finally {
      setActionInProgress(null)
    }
  }

  // Categorize accounts by platform
  const fbAccounts = accounts.filter(a => a.platform === 'facebook')
  const igAccounts = accounts.filter(a => a.platform === 'instagram')
  const liAccounts = accounts.filter(a => a.platform === 'linkedin')
  const ttAccounts = accounts.filter(a => a.platform === 'tiktok')
  const twAccounts = accounts.filter(a => a.platform === 'twitter' || a.platform === 'x')

  const activeFb = fbAccounts.find(a => a.is_active) || fbAccounts[0]
  const activeIg = igAccounts.find(a => a.is_active) || igAccounts[0]
  const activeLi = liAccounts.find(a => a.is_active) || liAccounts[0]
  const activeTt = ttAccounts.find(a => a.is_active) || ttAccounts[0]
  const activeTw = twAccounts.find(a => a.is_active) || twAccounts[0]

  // Check if Facebook is connected but Instagram is missing (Business/Creator check)
  const hasFbNoIg = fbAccounts.length > 0 && igAccounts.length === 0

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Friendly Error Banner if any occurred */}
      {bannerError && (
        <div className="p-4 rounded-2xl bg-danger/10 border border-danger/30 flex items-start justify-between gap-3 text-xs text-danger">
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span className="font-semibold">{bannerError}</span>
          </div>
          <button
            onClick={() => setBannerError(null)}
            className="text-danger hover:text-white p-1 rounded-lg"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Header Info */}
      <div className="p-6 rounded-2xl bg-surface border border-border flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-text flex items-center gap-2">
            <Share2 className="h-5 w-5 text-accent" />
            <span>Connected Social Accounts</span>
          </h2>
          <p className="text-xs text-muted mt-0.5">
            Connect your brand&apos;s social channels. Brandflux publishes directly to your approved accounts.
          </p>
        </div>
        <button
          onClick={fetchData}
          disabled={loading}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-surface-secondary hover:bg-surface border border-border hover:border-primary text-xs font-bold text-text transition disabled:opacity-50 self-start sm:self-auto"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Instagram Business Account Helper Banner */}
      {hasFbNoIg && (
        <div className="p-5 rounded-2xl bg-surface-secondary border border-primary/40 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <InstagramIcon className="h-7 w-7 rounded-lg shrink-0" />
              <div>
                <h4 className="text-sm font-bold text-text">Instagram Account Setup Notice</h4>
                <p className="text-xs text-muted">
                  Your Facebook Page is connected, but no linked Instagram Business or Creator account was found.
                </p>
              </div>
            </div>
            <button
              onClick={() => setShowInstagramGuide(!showInstagramGuide)}
              className="text-xs text-primary-light hover:underline font-bold flex items-center gap-1"
            >
              <span>{showInstagramGuide ? 'Hide Guide' : 'How to fix'}</span>
              <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showInstagramGuide ? 'rotate-180' : ''}`} />
            </button>
          </div>

          {showInstagramGuide && (
            <div className="p-4 rounded-xl bg-surface border border-border space-y-3 text-xs text-muted">
              <p className="font-semibold text-text">Follow these 2 quick steps to enable automatic Instagram posting:</p>
              <ol className="list-decimal list-inside space-y-1.5 pl-1 leading-relaxed">
                <li>
                  <strong className="text-text">Switch to a Professional Account:</strong> In the Instagram mobile app, go to <em>Settings → Account Type and Tools → Switch to Professional Account</em> (choose <em>Business</em> or <em>Creator</em>).
                </li>
                <li>
                  <strong className="text-text">Connect to your Facebook Page:</strong> In your Facebook Page settings, link your Instagram account so Meta grants publishing rights.
                </li>
              </ol>
              <div className="pt-2 flex items-center gap-3">
                <button
                  onClick={() => handleConnect('meta')}
                  disabled={connectingPlatform === 'meta'}
                  className="px-4 py-2 bg-accent hover:bg-accent-hover text-black font-extrabold text-xs rounded-xl shadow-accent-glow transition flex items-center gap-1.5"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${connectingPlatform === 'meta' ? 'animate-spin' : ''}`} />
                  <span>Try Again</span>
                </button>
                <span className="text-[11px] text-muted">Click Try Again once linked in Facebook Page Settings.</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Social Platforms Cards Grid */}
      <div className="grid md:grid-cols-2 gap-4">
        {/* ─────────────────────────────────────────────────────────────────
            1. FACEBOOK
           ───────────────────────────────────────────────────────────────── */}
        <div className="p-5 rounded-2xl bg-surface border border-border flex flex-col justify-between space-y-5">
          <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl overflow-hidden shrink-0 shadow-sm flex items-center justify-center">
                  <FacebookIcon className="h-10 w-10" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-text">Facebook Page</h3>
                  <p className="text-[11px] text-muted">Publish posts &amp; carousels directly to your page</p>
                </div>
              </div>
              <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider ${
                activeFb
                  ? (activeFb.needs_reconnect ? 'bg-amber-500/15 text-amber-300 border border-amber-500/40' : 'bg-success/15 text-success border border-success/40')
                  : 'bg-surface-secondary text-muted border border-border'
              }`}>
                {activeFb ? (activeFb.needs_reconnect ? 'Needs Reconnect' : 'Connected') : 'Disconnected'}
              </span>
            </div>

            {/* Account Details or Description */}
            {activeFb ? (
              <div className="space-y-3 pt-1">
                <div className="p-3 rounded-xl bg-surface-secondary border border-border flex items-center justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    <AccountAvatar
                      avatarUrl={activeFb.avatar_url}
                      name={activeFb.account_name}
                      fallbackBg="bg-blue-600/20 border-blue-500/40"
                      fallbackTextColor="text-blue-400"
                      fallbackText={activeFb.account_name ? activeFb.account_name[0].toUpperCase() : 'F'}
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="text-xs font-bold text-text truncate">
                          {activeFb.metadata_json?.username
                            ? (activeFb.metadata_json.username.startsWith('@') ? activeFb.metadata_json.username : `@${activeFb.metadata_json.username}`)
                            : activeFb.account_name}
                        </p>
                        {activeFb.metadata_json?.username && (
                          <span className="text-[10px] text-muted truncate">
                            ({activeFb.account_name})
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-muted flex items-center gap-1.5 mt-0.5">
                        <CheckCircle2 className="h-3 w-3 text-success shrink-0" />
                        <span>Active for auto-publishing</span>
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={() => handleDisconnect(activeFb.id, activeFb.account_name)}
                    disabled={actionInProgress === activeFb.id}
                    className="text-[11px] font-bold text-muted hover:text-danger px-2.5 py-1 rounded-lg transition"
                  >
                    Disconnect
                  </button>
                </div>

                {/* Multiple Facebook Pages Picker */}
                {fbAccounts.length > 1 && (
                  <div className="space-y-1.5 pt-1">
                    <label className="text-[11px] font-bold text-muted flex items-center gap-1">
                      <span>Switch Active Page:</span>
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      {fbAccounts.map(p => (
                        <button
                          key={p.id}
                          onClick={() => handleSetActive(p.id, p.account_name)}
                          className={`px-2.5 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                            p.id === activeFb.id
                              ? 'bg-primary/20 border border-primary text-primary-light'
                              : 'bg-surface-secondary border border-border text-muted hover:text-text'
                          }`}
                        >
                          {p.id === activeFb.id && <Check className="h-3 w-3 text-primary-light" />}
                          <span className="truncate max-w-[140px]">
                            {p.metadata_json?.username ? `@${p.metadata_json.username}` : p.account_name}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-xs text-muted leading-relaxed">
                Connect your business Facebook Page to publish updates, launch announcements, and verified brand posts automatically.
              </p>
            )}
          </div>

          {/* Action Button */}
          <div className="pt-2 border-t border-border">
            {platformConfig.facebook ? (
              <button
                onClick={() => handleConnect('meta')}
                disabled={connectingPlatform === 'meta'}
                className={`w-full py-2.5 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 ${
                  activeFb
                    ? 'bg-surface-secondary hover:bg-surface border border-border hover:border-primary text-text'
                    : 'bg-primary hover:bg-primary/90 text-white shadow-glow'
                }`}
              >
                <ExternalLink className="h-3.5 w-3.5" />
                <span>
                  {connectingPlatform === 'meta'
                    ? 'Connecting in popup...'
                    : activeFb
                    ? 'Reconnect Facebook'
                    : 'Connect Facebook'}
                </span>
              </button>
            ) : (
              <button
                disabled
                className="w-full py-2.5 px-3 rounded-xl text-xs font-bold bg-surface-secondary text-muted border border-border cursor-not-allowed text-center"
              >
                Coming soon
              </button>
            )}
          </div>
        </div>

        {/* ─────────────────────────────────────────────────────────────────
            2. INSTAGRAM
           ───────────────────────────────────────────────────────────────── */}
        <div className="p-5 rounded-2xl bg-surface border border-border flex flex-col justify-between space-y-5">
          <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl overflow-hidden shrink-0 shadow-sm flex items-center justify-center">
                  <InstagramIcon className="h-10 w-10" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-text">Instagram Business</h3>
                  <p className="text-[11px] text-muted">Post carousels and images to your Instagram feed</p>
                </div>
              </div>
              <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider ${
                activeIg
                  ? (activeIg.needs_reconnect ? 'bg-amber-500/15 text-amber-300 border border-amber-500/40' : 'bg-success/15 text-success border border-success/40')
                  : 'bg-surface-secondary text-muted border border-border'
              }`}>
                {activeIg ? (activeIg.needs_reconnect ? 'Needs Reconnect' : 'Connected') : 'Disconnected'}
              </span>
            </div>

            {/* Account Details or Description */}
            {activeIg ? (
              <div className="p-3 rounded-xl bg-surface-secondary border border-border flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  <AccountAvatar
                    avatarUrl={activeIg.avatar_url}
                    name={activeIg.account_name}
                    fallbackBg="bg-pink-600/20 border-pink-500/40"
                    fallbackTextColor="text-pink-400"
                    fallbackText="IG"
                  />
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-text truncate">
                      {activeIg.account_name.startsWith('@') ? activeIg.account_name : `@${activeIg.account_name}`}
                    </p>
                    <p className="text-[10px] text-muted flex items-center gap-1.5 mt-0.5">
                      <CheckCircle2 className="h-3 w-3 text-success shrink-0" />
                      <span>Professional Creator/Business Account</span>
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => handleDisconnect(activeIg.id, activeIg.account_name)}
                  disabled={actionInProgress === activeIg.id}
                  className="text-[11px] font-bold text-muted hover:text-danger px-2.5 py-1 rounded-lg transition"
                >
                  Disconnect
                </button>
              </div>
            ) : (
              <p className="text-xs text-muted leading-relaxed">
                Connect via Meta to publish high-converting brand carousels, feed imagery, and announcements directly to your Instagram profile.
              </p>
            )}
          </div>

          {/* Action Button */}
          <div className="pt-2 border-t border-border">
            {platformConfig.instagram ? (
              <button
                onClick={() => handleConnect('meta')}
                disabled={connectingPlatform === 'meta'}
                className={`w-full py-2.5 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 ${
                  activeIg
                    ? 'bg-surface-secondary hover:bg-surface border border-border hover:border-primary text-text'
                    : 'bg-primary hover:bg-primary/90 text-white shadow-glow'
                }`}
              >
                <ExternalLink className="h-3.5 w-3.5" />
                <span>
                  {connectingPlatform === 'meta'
                    ? 'Connecting in popup...'
                    : activeIg
                    ? 'Reconnect Instagram'
                    : 'Connect Instagram'}
                </span>
              </button>
            ) : (
              <button
                disabled
                className="w-full py-2.5 px-3 rounded-xl text-xs font-bold bg-surface-secondary text-muted border border-border cursor-not-allowed text-center"
              >
                Coming soon
              </button>
            )}
          </div>
        </div>

        {/* ─────────────────────────────────────────────────────────────────
            3. LINKEDIN
           ───────────────────────────────────────────────────────────────── */}
        <div className="p-5 rounded-2xl bg-surface border border-border flex flex-col justify-between space-y-5">
          <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl overflow-hidden shrink-0 shadow-sm flex items-center justify-center">
                  <LinkedInIcon className="h-10 w-10" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-text">LinkedIn</h3>
                  <p className="text-[11px] text-muted">Thought leadership posts to profile or organization page</p>
                </div>
              </div>
              <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider ${
                activeLi
                  ? (activeLi.needs_reconnect ? 'bg-amber-500/15 text-amber-300 border border-amber-500/40' : 'bg-success/15 text-success border border-success/40')
                  : 'bg-surface-secondary text-muted border border-border'
              }`}>
                {activeLi ? (activeLi.needs_reconnect ? 'Needs Reconnect' : 'Connected') : 'Disconnected'}
              </span>
            </div>

            {/* Account Details or Description */}
            {activeLi ? (
              <div className="space-y-3 pt-1">
                <div className="p-3 rounded-xl bg-surface-secondary border border-border flex items-center justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    <AccountAvatar
                      avatarUrl={activeLi.avatar_url}
                      name={activeLi.account_name}
                      fallbackBg="bg-sky-600/20 border-sky-500/40"
                      fallbackTextColor="text-sky-400"
                      fallbackText={activeLi.account_name ? activeLi.account_name[0].toUpperCase() : 'L'}
                    />
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-text truncate">{activeLi.account_name}</p>
                      <p className="text-[10px] text-muted flex items-center gap-1.5 mt-0.5">
                        <CheckCircle2 className="h-3 w-3 text-success shrink-0" />
                        <span>{activeLi.metadata_json?.is_organization ? 'Company Page' : 'Personal Profile'}</span>
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={() => handleDisconnect(activeLi.id, activeLi.account_name)}
                    disabled={actionInProgress === activeLi.id}
                    className="text-[11px] font-bold text-muted hover:text-danger px-2.5 py-1 rounded-lg transition"
                  >
                    Disconnect
                  </button>
                </div>

                {/* Profile vs Organization Picker */}
                {liAccounts.length > 1 && (
                  <div className="space-y-1.5 pt-1">
                    <label className="text-[11px] font-bold text-muted flex items-center gap-1">
                      <span>Publishing Target:</span>
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      {liAccounts.map(acc => (
                        <button
                          key={acc.id}
                          onClick={() => handleSetActive(acc.id, acc.account_name)}
                          className={`px-2.5 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                            acc.id === activeLi.id
                              ? 'bg-primary/20 border border-primary text-primary-light'
                              : 'bg-surface-secondary border border-border text-muted hover:text-text'
                          }`}
                        >
                          {acc.id === activeLi.id && <Check className="h-3 w-3 text-primary-light" />}
                          <span className="truncate max-w-[140px]">{acc.account_name}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-xs text-muted leading-relaxed">
                Publish high-converting thought leadership, product updates, and articles directly to your LinkedIn personal profile or company page.
              </p>
            )}
          </div>

          {/* Action Button */}
          <div className="pt-2 border-t border-border">
            {platformConfig.linkedin ? (
              <button
                onClick={() => handleConnect('linkedin')}
                disabled={connectingPlatform === 'linkedin'}
                className={`w-full py-2.5 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 ${
                  activeLi
                    ? 'bg-surface-secondary hover:bg-surface border border-border hover:border-primary text-text'
                    : 'bg-primary hover:bg-primary/90 text-white shadow-glow'
                }`}
              >
                <ExternalLink className="h-3.5 w-3.5" />
                <span>
                  {connectingPlatform === 'linkedin'
                    ? 'Connecting in popup...'
                    : activeLi
                    ? 'Reconnect LinkedIn'
                    : 'Connect LinkedIn'}
                </span>
              </button>
            ) : (
              <button
                disabled
                className="w-full py-2.5 px-3 rounded-xl text-xs font-bold bg-surface-secondary text-muted border border-border cursor-not-allowed text-center"
              >
                Coming soon
              </button>
            )}
          </div>
        </div>

        {/* ─────────────────────────────────────────────────────────────────
            4. TIKTOK
           ───────────────────────────────────────────────────────────────── */}
        <div className="p-5 rounded-2xl bg-surface border border-border flex flex-col justify-between space-y-5">
          <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl overflow-hidden shrink-0 shadow-sm flex items-center justify-center">
                  <TikTokIcon className="h-10 w-10" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-text">TikTok</h3>
                  <p className="text-[11px] text-muted">Post photo carousels and video content to creator profile</p>
                </div>
              </div>
              <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider ${
                activeTt
                  ? (activeTt.needs_reconnect ? 'bg-amber-500/15 text-amber-300 border border-amber-500/40' : 'bg-success/15 text-success border border-success/40')
                  : 'bg-surface-secondary text-muted border border-border'
              }`}>
                {activeTt ? (activeTt.needs_reconnect ? 'Needs Reconnect' : 'Connected') : 'Disconnected'}
              </span>
            </div>

            {/* Account Details or Description */}
            {activeTt ? (
              <div className="p-3 rounded-xl bg-surface-secondary border border-border flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  <AccountAvatar
                    avatarUrl={activeTt.avatar_url}
                    name={activeTt.account_name}
                    fallbackBg="bg-purple-600/20 border-purple-500/40"
                    fallbackTextColor="text-purple-400"
                    fallbackText="TT"
                  />
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-text truncate">
                      {activeTt.account_name.startsWith('@') ? activeTt.account_name : `@${activeTt.account_name}`}
                    </p>
                    <p className="text-[10px] text-muted flex items-center gap-1.5 mt-0.5">
                      <CheckCircle2 className="h-3 w-3 text-success shrink-0" />
                      <span>Creator Publishing Active</span>
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => handleDisconnect(activeTt.id, activeTt.account_name)}
                  disabled={actionInProgress === activeTt.id}
                  className="text-[11px] font-bold text-muted hover:text-danger px-2.5 py-1 rounded-lg transition"
                >
                  Disconnect
                </button>
              </div>
            ) : (
              <p className="text-xs text-muted leading-relaxed">
                Connect your TikTok account to publish photo stories, brand carousels, and video clips automatically.
              </p>
            )}
          </div>

          {/* Action Button */}
          <div className="pt-2 border-t border-border">
            {platformConfig.tiktok ? (
              <button
                onClick={() => handleConnect('tiktok')}
                disabled={connectingPlatform === 'tiktok'}
                className={`w-full py-2.5 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 ${
                  activeTt
                    ? 'bg-surface-secondary hover:bg-surface border border-border hover:border-primary text-text'
                    : 'bg-primary hover:bg-primary/90 text-white shadow-glow'
                }`}
              >
                <ExternalLink className="h-3.5 w-3.5" />
                <span>
                  {connectingPlatform === 'tiktok'
                    ? 'Connecting in popup...'
                    : activeTt
                    ? 'Reconnect TikTok'
                    : 'Connect TikTok'}
                </span>
              </button>
            ) : (
              <button
                disabled
                className="w-full py-2.5 px-3 rounded-xl text-xs font-bold bg-surface-secondary text-muted border border-border cursor-not-allowed text-center"
              >
                Coming soon
              </button>
            )}
          </div>
        </div>

        {/* ─────────────────────────────────────────────────────────────────
            5. X (TWITTER)
           ───────────────────────────────────────────────────────────────── */}
        <div className="p-5 rounded-2xl bg-surface border border-border flex flex-col justify-between space-y-5">
          <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl overflow-hidden shrink-0 shadow-sm flex items-center justify-center">
                  <XTwitterIcon className="h-10 w-10" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-text">X (Twitter)</h3>
                  <p className="text-[11px] text-muted">Publish short updates and announcements</p>
                </div>
              </div>
              <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider ${
                activeTw
                  ? (activeTw.needs_reconnect ? 'bg-amber-500/15 text-amber-300 border border-amber-500/40' : 'bg-success/15 text-success border border-success/40')
                  : 'bg-surface-secondary text-muted border border-border'
              }`}>
                {activeTw ? (activeTw.needs_reconnect ? 'Needs Reconnect' : 'Connected') : (platformConfig.twitter ? 'Disconnected' : 'Coming Soon')}
              </span>
            </div>

            {/* Account Details or Description */}
            {activeTw ? (
              <div className="p-3 rounded-xl bg-surface-secondary border border-border flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  <AccountAvatar
                    avatarUrl={activeTw.avatar_url}
                    name={activeTw.account_name}
                    fallbackBg="bg-neutral-800 border-neutral-700"
                    fallbackTextColor="text-white"
                    fallbackText="𝕏"
                  />
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-text truncate">
                      {activeTw.metadata_json?.username
                        ? (activeTw.metadata_json.username.startsWith('@') ? activeTw.metadata_json.username : `@${activeTw.metadata_json.username}`)
                        : (activeTw.account_name.startsWith('@') ? activeTw.account_name : `@${activeTw.account_name}`)}
                    </p>
                    <p className="text-[10px] text-muted flex items-center gap-1.5 mt-0.5">
                      <CheckCircle2 className="h-3 w-3 text-success shrink-0" />
                      <span>Connected</span>
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => handleDisconnect(activeTw.id, activeTw.account_name)}
                  disabled={actionInProgress === activeTw.id}
                  className="text-[11px] font-bold text-muted hover:text-danger px-2.5 py-1 rounded-lg transition"
                >
                  Disconnect
                </button>
              </div>
            ) : (
              <p className="text-xs text-muted leading-relaxed">
                Publish verified 280-character updates and media directly to your X profile.
              </p>
            )}
          </div>

          {/* Action Button: Coming Soon if not configured in env */}
          <div className="pt-2 border-t border-border">
            {platformConfig.twitter ? (
              <button
                onClick={() => handleConnect('twitter')}
                disabled={connectingPlatform === 'twitter'}
                className={`w-full py-2.5 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 ${
                  activeTw
                    ? 'bg-surface-secondary hover:bg-surface border border-border hover:border-primary text-text'
                    : 'bg-primary hover:bg-primary/90 text-white shadow-glow'
                }`}
              >
                <ExternalLink className="h-3.5 w-3.5" />
                <span>
                  {connectingPlatform === 'twitter'
                    ? 'Connecting in popup...'
                    : activeTw
                    ? 'Reconnect X'
                    : 'Connect X'}
                </span>
              </button>
            ) : (
              <button
                disabled
                className="w-full py-2.5 px-3 rounded-xl text-xs font-bold bg-surface-secondary text-muted border border-border cursor-not-allowed flex items-center justify-center gap-1.5"
              >
                <span>Coming soon</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
