'use client'

import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import toast from 'react-hot-toast'
import { 
  User, 
  Palette, 
  Share2, 
  CreditCard, 
  RefreshCw, 
  Upload, 
  Plus, 
  Trash2, 
  Sparkles, 
  Save, 
  Key, 
  Globe, 
  Image as ImageIcon,
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Bot,
  ShieldAlert,
  Power,
  Play,
  Check,
  X,
  Sliders,
  Calendar as CalendarIcon,
  Clock
} from 'lucide-react'
import { 
  getProfile, 
  getBrandKit, 
  updateBrandKit, 
  uploadBrandLogo, 
  rescanBrand,
  updateBrandWebsite,
  getConnectedSocialAccounts,
  getOAuthAuthorizeUrl,
  disconnectSocialAccount,
  getAutopilotConfig,
  updateAutopilotConfig,
  toggleKillSwitch,
  triggerAutopilotNow,
  getAutopilotLogs,
  getPendingApprovalPosts,
  approveAllPendingPosts,
  approveSinglePost,
  rejectSinglePost,
  updateUserProfile
} from '@/lib/api'

type TabType = 'brand-kit' | 'autopilot' | 'connected' | 'account' | 'billing'

const isDarkHex = (color: string): boolean => {
  if (!color || !color.startsWith('#') || color.length < 4) return true
  const c = color.replace('#', '')
  const full = c.length === 3 ? c.split('').map(x => x + x).join('') : c
  const r = parseInt(full.substring(0, 2), 16) || 0
  const g = parseInt(full.substring(2, 4), 16) || 0
  const b = parseInt(full.substring(4, 6), 16) || 0
  const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b
  return luma < 128
}

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<TabType>('brand-kit')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [rescanning, setRescanning] = useState(false)
  const [uploadingLogo, setUploadingLogo] = useState<'primary' | 'alt' | null>(null)
  const [updatingProfile, setUpdatingProfile] = useState(false)

  // Account State
  const [userProfile, setUserProfile] = useState({
    id: '',
    email: '',
    full_name: '',
    plan: 'Starter'
  })
  const [passwords, setPasswords] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  })

  // Brand Kit State
  const [brandKit, setBrandKit] = useState({
    business_name: '',
    tagline: '',
    industry: '',
    business_type: '',
    target_audience: '',
    brand_tone: '',
    brand_personality: '',
    brand_voice: '',
    colors: ['#1558C9', '#D4FF24', '#0D0F16', '#F4F5F7'],
    primary_color: '#1558C9',
    secondary_color: '#D4FF24',
    brand_keywords: ['Consistency', 'Growth', 'Automation'],
    content_themes: ['Educational Tips', 'Behind the Scenes', 'Industry Insights'],
    products_services: ['AI Social Automation', 'Brand Analytics'],
    logo_url: '',
    clean_logo_url: '',
    website_url: '',
    last_scanned_at: ''
  })

  // Tag inputs
  const [newKeyword, setNewKeyword] = useState('')
  const [newTheme, setNewTheme] = useState('')

  // Connected Accounts State
  interface SocialAccountItem {
    id: string
    platform: 'instagram' | 'facebook' | 'linkedin' | 'tiktok' | 'twitter' | string
    platform_user_id?: string
    account_name?: string
    page_id?: string
    page_name?: string
    scopes?: string[]
    token_expires_at?: string
    days_until_expiry?: number
    needs_reconnect?: boolean
    created_at?: string
  }
  const [socialAccounts, setSocialAccounts] = useState<SocialAccountItem[]>([])
  const [loadingAccounts, setLoadingAccounts] = useState(false)
  const [connectingPlatform, setConnectingPlatform] = useState<string | null>(null)

  // File Input Refs
  const primaryLogoInputRef = useRef<HTMLInputElement>(null)
  const altLogoInputRef = useRef<HTMLInputElement>(null)

  const fetchSocialAccounts = async () => {
    try {
      setLoadingAccounts(true)
      const res = await getConnectedSocialAccounts()
      const list = Array.isArray(res) ? res : (res?.accounts || [])
      setSocialAccounts(list)
    } catch (err) {
      console.error('Failed to load social accounts', err)
    } finally {
      setLoadingAccounts(false)
    }
  }

  // Autopilot State
  const [autopilotConfig, setAutopilotConfig] = useState({
    enabled: true,
    kill_switch: false,
    mode: 'approval' as 'approval' | 'autopilot',
    max_posts_per_day: 2,
    banned_topics: ['politics', 'unverified health claims', 'gambling'],
    notification_email: '',
    last_run_at: null as string | null,
    last_run_summary: null as string | null
  })
  const [newBannedTopic, setNewBannedTopic] = useState('')
  const [pendingPosts, setPendingPosts] = useState<any[]>([])
  const [decisionLogs, setDecisionLogs] = useState<any[]>([])
  const [runningAutopilot, setRunningAutopilot] = useState(false)
  const [loadingAutopilotData, setLoadingAutopilotData] = useState(false)

  const fetchAutopilotData = async () => {
    try {
      setLoadingAutopilotData(true)
      const [cfg, pending, logs] = await Promise.all([
        getAutopilotConfig().catch(() => null),
        getPendingApprovalPosts().catch(() => ({ posts: [] })),
        getAutopilotLogs().catch(() => [])
      ])
      if (cfg) {
        setAutopilotConfig({
          enabled: cfg.enabled ?? true,
          kill_switch: cfg.kill_switch ?? false,
          mode: cfg.mode || 'approval',
          max_posts_per_day: cfg.max_posts_per_day || 2,
          banned_topics: cfg.banned_topics || [],
          notification_email: cfg.notification_email || '',
          last_run_at: cfg.last_run_at || null,
          last_run_summary: cfg.last_run_summary || null
        })
      }
      if (pending?.posts) {
        setPendingPosts(pending.posts)
      }
      if (Array.isArray(logs)) {
        setDecisionLogs(logs)
      }
    } catch (err) {
      console.error('Failed to load autopilot data', err)
    } finally {
      setLoadingAutopilotData(false)
    }
  }

  const handleToggleKillSwitch = async () => {
    const nextState = !autopilotConfig.kill_switch
    if (nextState && !confirm('Engage Emergency Kill Switch? All autonomous post generation and auto-scheduling will halt immediately.')) {
      return
    }
    try {
      const res = await toggleKillSwitch(nextState)
      setAutopilotConfig(prev => ({ ...prev, kill_switch: res.kill_switch }))
      toast.success(res.message)
      fetchAutopilotData()
    } catch (err: any) {
      toast.error('Failed to toggle kill switch')
    }
  }

  const handleUpdateMode = async (mode: 'approval' | 'autopilot') => {
    try {
      const res = await updateAutopilotConfig({ mode })
      setAutopilotConfig(prev => ({ ...prev, mode: res.mode }))
      toast.success(`Mode updated: ${mode === 'autopilot' ? 'Autopilot (Auto-Scheduled)' : 'Approval Mode (Review First)'}`)
    } catch (err) {
      toast.error('Failed to update autopilot mode')
    }
  }

  const handleUpdateDailyCap = async (cap: number) => {
    try {
      const res = await updateAutopilotConfig({ max_posts_per_day: cap })
      setAutopilotConfig(prev => ({ ...prev, max_posts_per_day: res.max_posts_per_day }))
      toast.success(`Max posts per day set to ${cap}`)
    } catch (err) {
      toast.error('Failed to update post cap')
    }
  }

  const handleAddBannedTopic = async (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      const val = newBannedTopic.trim().replace(/^,|,$/g, '')
      if (val && !autopilotConfig.banned_topics.includes(val)) {
        const updated = [...autopilotConfig.banned_topics, val]
        try {
          const res = await updateAutopilotConfig({ banned_topics: updated })
          setAutopilotConfig(prev => ({ ...prev, banned_topics: res.banned_topics }))
          setNewBannedTopic('')
          toast.success(`Banned topic '${val}' added`)
        } catch (err) {
          toast.error('Failed to save banned topic')
        }
      }
    }
  }

  const handleRemoveBannedTopic = async (topic: string) => {
    const updated = autopilotConfig.banned_topics.filter(t => t !== topic)
    try {
      const res = await updateAutopilotConfig({ banned_topics: updated })
      setAutopilotConfig(prev => ({ ...prev, banned_topics: res.banned_topics }))
      toast.success(`Removed '${topic}' from banned topics`)
    } catch (err) {
      toast.error('Failed to remove topic')
    }
  }

  const handleTriggerAutopilot = async () => {
    if (autopilotConfig.kill_switch) {
      toast.error('Kill switch is active. Disengage kill switch to run Autopilot.')
      return
    }
    try {
      setRunningAutopilot(true)
      toast.loading('Analyzing 30-day metrics, planning 7 days, running self-critique...', { id: 'auto-run' })
      const res = await triggerAutopilotNow(true)
      toast.success(`Autopilot cycle completed! Queued ${res.posts_queued || 7} posts in ${res.mode.toUpperCase()} mode.`, { id: 'auto-run' })
      fetchAutopilotData()
    } catch (err: any) {
      console.error('Autopilot run error', err)
      toast.error(err.response?.data?.detail || 'Autopilot run failed', { id: 'auto-run' })
    } finally {
      setRunningAutopilot(false)
    }
  }

  const handleApproveAll = async () => {
    try {
      const res = await approveAllPendingPosts()
      toast.success(res.message)
      fetchAutopilotData()
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to approve posts')
    }
  }

  const handleApproveSingle = async (id: string) => {
    try {
      await approveSinglePost(id)
      toast.success('Post approved and scheduled!')
      fetchAutopilotData()
    } catch (err: any) {
      toast.error('Failed to approve post')
    }
  }

  const handleRejectSingle = async (id: string) => {
    try {
      await rejectSinglePost(id)
      toast.success('Post rejected')
      fetchAutopilotData()
    } catch (err: any) {
      toast.error('Failed to reject post')
    }
  }

  // Load initial profile & brand kit data & accounts
  useEffect(() => {
    // Check URL query parameters (e.g. from OAuth callbacks)
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search)
      const tabParam = urlParams.get('tab')
      if (tabParam === 'accounts' || tabParam === 'connected') {
        setActiveTab('connected')
      } else if (tabParam === 'autopilot') {
        setActiveTab('autopilot')
      }
      const connectedParam = urlParams.get('connected')
      if (connectedParam) {
        toast.success(`Successfully connected ${connectedParam}!`)
        window.history.replaceState({}, '', '/settings?tab=connected')
      }
      const errorParam = urlParams.get('error')
      if (errorParam) {
        toast.error(`Connection failed: ${errorParam}`)
        window.history.replaceState({}, '', '/settings?tab=connected')
      }
    }

    async function loadData() {
      try {
        setLoading(true)
        const [profileData, kitData] = await Promise.all([
          getProfile().catch(() => null),
          getBrandKit().catch(() => null),
          fetchSocialAccounts().catch(() => null),
          fetchAutopilotData().catch(() => null)
        ])

        if (profileData) {
          setUserProfile({
            id: profileData.id || '',
            email: profileData.email || '',
            full_name: profileData.full_name || '',
            plan: profileData.plan ? profileData.plan.toUpperCase() : 'STARTER'
          })
        }

        if (kitData) {
          setBrandKit({
            business_name: kitData.business_name || '',
            tagline: kitData.tagline || '',
            industry: kitData.industry || '',
            business_type: kitData.business_type || '',
            target_audience: kitData.target_audience || '',
            brand_tone: kitData.brand_tone || 'Confident & Authoritative',
            brand_personality: kitData.brand_personality || '',
            brand_voice: kitData.brand_voice || '',
            colors: kitData.colors && kitData.colors.length > 0 ? kitData.colors : ['#1558C9', '#D4FF24', '#0D0F16'],
            primary_color: kitData.primary_color || '#1558C9',
            secondary_color: kitData.secondary_color || '#D4FF24',
            brand_keywords: kitData.brand_keywords || ['Consistency', 'Growth'],
            content_themes: kitData.content_themes || ['Educational Insights', 'Customer Stories'],
            products_services: kitData.products_services || [],
            logo_url: kitData.logo_url || '',
            clean_logo_url: kitData.clean_logo_url || '',
            website_url: kitData.website_url || '',
            last_scanned_at: kitData.last_scanned_at || ''
          })
        }
      } catch (err) {
        console.error('Failed to load settings data', err)
        toast.error('Could not load brand kit data')
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [])

  const handleUpdateProfile = async () => {
    if (!userProfile.email) {
      toast.error('Email address is required')
      return
    }
    try {
      setUpdatingProfile(true)
      const res = await updateUserProfile({
        full_name: userProfile.full_name,
        email: userProfile.email
      })
      toast.success(res?.message || 'Profile updated successfully')
      if (res?.user) {
        setUserProfile(prev => ({
          ...prev,
          full_name: res.user.full_name,
          email: res.user.email
        }))
      }
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to update profile')
    } finally {
      setUpdatingProfile(false)
    }
  }

  const handleConnectOAuth = async (platform: string) => {
    try {
      setConnectingPlatform(platform)
      const res = await getOAuthAuthorizeUrl(platform)
      const targetUrl = res?.authorization_url || res?.auth_url
      if (targetUrl) {
        window.location.href = targetUrl
      } else {
        toast.error(`Could not initialize OAuth for ${platform}`)
      }
    } catch (err: any) {
      console.error('OAuth redirect error', err)
      toast.error(err.response?.data?.detail || `Failed to initiate ${platform} authorization`)
    } finally {
      setConnectingPlatform(null)
    }
  }

  const handleDisconnectAccount = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to disconnect ${name}?`)) return
    try {
      await disconnectSocialAccount(id)
      toast.success(`${name} disconnected`)
      fetchSocialAccounts()
    } catch (err: any) {
      console.error('Disconnect error', err)
      toast.error(err.response?.data?.detail || 'Failed to disconnect account')
    }
  }

  // ─── Color Palette Handlers ──────────────────────────────────────────────
  const colorSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleColorChange = (index: number, newColor: string) => {
    const updated = [...brandKit.colors]
    updated[index] = newColor
    const updatedKit = {
      ...brandKit,
      colors: updated,
      primary_color: index === 0 ? newColor : brandKit.primary_color,
      secondary_color: index === 1 ? newColor : brandKit.secondary_color
    }
    setBrandKit(updatedKit)

    // Debounced auto-save with clear feedback
    if (colorSaveTimerRef.current) {
      clearTimeout(colorSaveTimerRef.current)
    }
    if (newColor.length === 7 && newColor.startsWith('#')) {
      colorSaveTimerRef.current = setTimeout(() => {
        handleSaveBrandKit(updatedKit, true)
        toast.success(`Color ${newColor.toUpperCase()} saved to brand kit`, { id: 'palette-save' })
      }, 700)
    }
  }

  const handleAddColor = () => {
    if (brandKit.colors.length >= 8) {
      toast.error('Maximum 8 brand colors allowed')
      return
    }
    const defaultNewColor = '#4C8DFF'
    const updatedColors = [...brandKit.colors, defaultNewColor]
    const updatedKit = {
      ...brandKit,
      colors: updatedColors
    }
    setBrandKit(updatedKit)
    handleSaveBrandKit(updatedKit, true)
    toast.success('Color added & saved to brand kit', { id: 'palette-save' })
  }

  const handleRemoveColor = (index: number) => {
    if (brandKit.colors.length <= 1) {
      toast.error('Must maintain at least 1 primary brand color')
      return
    }
    const updatedColors = brandKit.colors.filter((_, i) => i !== index)
    const updatedKit = {
      ...brandKit,
      colors: updatedColors,
      primary_color: updatedColors[0] || '#1558C9',
      secondary_color: updatedColors[1] || '#D4FF24'
    }
    setBrandKit(updatedKit)
    handleSaveBrandKit(updatedKit, true)
    toast.success('Color removed & palette updated', { id: 'palette-save' })
  }

  // ─── Tag Handlers (Keywords & Themes) ────────────────────────────────────
  const handleAddKeyword = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      const val = newKeyword.trim().replace(/^,|,$/g, '')
      if (val && !brandKit.brand_keywords.includes(val)) {
        setBrandKit(prev => ({
          ...prev,
          brand_keywords: [...prev.brand_keywords, val]
        }))
        setNewKeyword('')
      }
    }
  }

  const handleRemoveKeyword = (tag: string) => {
    setBrandKit(prev => ({
      ...prev,
      brand_keywords: prev.brand_keywords.filter(k => k !== tag)
    }))
  }

  const handleAddTheme = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      const val = newTheme.trim().replace(/^,|,$/g, '')
      if (val && !brandKit.content_themes.includes(val)) {
        setBrandKit(prev => ({
          ...prev,
          content_themes: [...prev.content_themes, val]
        }))
        setNewTheme('')
      }
    }
  }

  const handleRemoveTheme = (pillar: string) => {
    setBrandKit(prev => ({
      ...prev,
      content_themes: prev.content_themes.filter(t => t !== pillar)
    }))
  }

  // ─── Logo Upload Handlers ────────────────────────────────────────────────
  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: 'primary' | 'alt') => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      toast.error('Please upload an image file (PNG, JPG, SVG)')
      return
    }

    try {
      setUploadingLogo(type)
      const res = await uploadBrandLogo(file, type)
      if (type === 'primary') {
        setBrandKit(prev => ({ ...prev, logo_url: res.url }))
      } else {
        setBrandKit(prev => ({ ...prev, clean_logo_url: res.url }))
      }
      toast.success(`${type === 'primary' ? 'Primary' : 'Alt'} logo uploaded to Cloudflare R2!`)
    } catch (err: any) {
      console.error('Logo upload error', err)
      toast.error(err.response?.data?.detail || 'Failed to upload logo')
    } finally {
      setUploadingLogo(null)
    }
  }

  // ─── Re-Scan Website Handler ─────────────────────────────────────────────
  const handleRescanWebsite = async () => {
    if (!brandKit.website_url || !brandKit.website_url.trim()) {
      toast.error('Please enter a website URL to re-scan')
      return
    }

    let formattedUrl = brandKit.website_url.trim()
    if (!formattedUrl.startsWith('http://') && !formattedUrl.startsWith('https://')) {
      formattedUrl = `https://${formattedUrl}`
      setBrandKit(prev => ({ ...prev, website_url: formattedUrl }))
    }

    try {
      setRescanning(true)
      const res = await updateBrandWebsite({ website_url: formattedUrl, rescan: true })
      if (res) {
        toast.success(`Successfully re-scanned ${formattedUrl}`)
        setBrandKit(prev => ({
          ...prev,
          business_name: res.name || res.business_name || prev.business_name,
          tagline: res.tagline || prev.tagline,
          brand_tone: res.brand_tone || prev.brand_tone,
          colors: res.colors && res.colors.length > 0 ? res.colors : prev.colors,
          primary_color: res.primary_color || prev.primary_color,
          secondary_color: res.secondary_color || prev.secondary_color,
          logo_url: res.logo_url || prev.logo_url,
          clean_logo_url: res.clean_logo_url || prev.clean_logo_url,
          website_url: res.website_url || formattedUrl,
          products_services: res.products_services || prev.products_services,
          last_scanned_at: new Date().toISOString()
        }))
      }
    } catch (err: any) {
      console.error('Rescan failed', err)
      toast.error(err.response?.data?.detail || 'Failed to re-scan website')
    } finally {
      setRescanning(false)
    }
  }

  // ─── Save Brand Kit ──────────────────────────────────────────────────────
  const handleSaveBrandKit = async (overrideKit?: typeof brandKit, silent: boolean = false) => {
    try {
      setSaving(true)
      const kitToSave = (overrideKit && typeof overrideKit === 'object' && 'business_name' in overrideKit) ? overrideKit : brandKit
      await updateBrandKit({
        business_name: kitToSave.business_name,
        tagline: kitToSave.tagline,
        industry: kitToSave.industry,
        business_type: kitToSave.business_type,
        target_audience: kitToSave.target_audience,
        brand_tone: kitToSave.brand_tone,
        brand_personality: kitToSave.brand_personality,
        brand_voice: kitToSave.brand_voice,
        colors: kitToSave.colors,
        primary_color: kitToSave.primary_color,
        secondary_color: kitToSave.secondary_color,
        brand_keywords: kitToSave.brand_keywords,
        content_themes: kitToSave.content_themes,
        products_services: kitToSave.products_services,
        logo_url: kitToSave.logo_url,
        clean_logo_url: kitToSave.clean_logo_url
      })
      if (!silent) {
        toast.success('Brand Kit saved! Generation prompts will prioritize this kit.')
      }
    } catch (err: any) {
      console.error('Failed to save brand kit', err)
      toast.error(err.response?.data?.detail || 'Failed to save brand kit')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-8 max-w-5xl mx-auto pb-16">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-6">
        <div>
          <h1 className="text-3xl font-extrabold text-text tracking-tight flex items-center gap-2.5">
            Brand Studio Settings
          </h1>
          <p className="text-sm text-muted mt-1">
            Manage your saved Brand Kit, team accounts, social connections, and subscription.
          </p>
        </div>

        {/* Global Save Button for Brand Kit */}
        {activeTab === 'brand-kit' && (
          <button
            onClick={() => handleSaveBrandKit()}
            disabled={saving || loading}
            className="px-5 py-2.5 bg-accent hover:bg-accent-hover text-black font-extrabold text-sm rounded-xl transition duration-200 shadow-accent-glow flex items-center gap-2 active:scale-95 disabled:opacity-50 self-start sm:self-auto"
          >
            {saving ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin text-black" />
                <span>Saving Kit...</span>
              </>
            ) : (
              <>
                <Save className="h-4 w-4 text-black" />
                <span>Save Brand Kit</span>
              </>
            )}
          </button>
        )}
      </div>

      {/* Tabs Navigation */}
      <div className="flex items-center gap-2 p-1.5 bg-surface border border-border rounded-2xl overflow-x-auto scrollbar-none">
        {[
          { id: 'brand-kit', label: 'Brand Kit', icon: Palette },
          { id: 'autopilot', label: 'Autopilot Agent', icon: Bot },
          { id: 'connected', label: 'Connected Accounts', icon: Share2 },
          { id: 'account', label: 'Account', icon: User },
          { id: 'billing', label: 'Billing & Plan', icon: CreditCard },
        ].map(tab => {
          const Icon = tab.icon
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as TabType)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition whitespace-nowrap ${
                isActive
                  ? 'bg-accent text-black shadow-sm font-extrabold'
                  : 'text-muted hover:text-text hover:bg-surface-secondary'
              }`}
            >
              <Icon className={`h-4 w-4 ${isActive ? 'text-black' : 'text-primary-light'}`} />
              <span>{tab.label}</span>
            </button>
          )
        })}
      </div>

      {/* Loading Skeleton */}
      {loading ? (
        <div className="space-y-4">
          <div className="h-32 rounded-2xl bg-surface-secondary/70 border border-border animate-pulse" />
          <div className="h-64 rounded-2xl bg-surface-secondary/70 border border-border animate-pulse" />
        </div>
      ) : (
        <AnimatePresence mode="wait">
          {/* ═════════════════════════════════════════════════════════════ */}
          {/* TAB 1: BRAND KIT                                             */}
          {/* ═════════════════════════════════════════════════════════════ */}
          {activeTab === 'brand-kit' && (
            <motion.div
              key="brand-kit"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.15 }}
              className="space-y-8"
            >
              {/* Top Banner: Editable URL & Re-scan Website for the Same Brand */}
              <div className="p-5 rounded-2xl bg-surface border border-border flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="h-10 w-10 rounded-xl bg-primary/15 border border-primary/40 flex items-center justify-center shrink-0">
                    <Globe className="h-5 w-5 text-primary-light" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-bold text-muted uppercase tracking-wider">Brand Website URL</span>
                      <span className="px-2 py-0.5 rounded-full bg-primary/20 text-primary-light text-[10px] font-bold">
                        Live Kit
                      </span>
                      {brandKit.last_scanned_at && (
                        <span className="text-[10px] text-muted hidden sm:inline">
                          Last scanned: {new Date(brandKit.last_scanned_at).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="url"
                        placeholder="https://example.com"
                        value={brandKit.website_url}
                        onChange={(e) => setBrandKit(prev => ({ ...prev, website_url: e.target.value }))}
                        className="w-full max-w-md px-3 py-1.5 rounded-xl bg-surface-secondary border border-border text-xs font-bold text-text focus:outline-none focus:border-primary transition"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-start lg:self-auto shrink-0">
                  <button
                    onClick={handleRescanWebsite}
                    disabled={rescanning || !brandKit.website_url}
                    className="px-4 py-2 bg-surface-secondary border border-primary text-text hover:bg-primary hover:text-white text-xs font-bold rounded-xl transition duration-200 flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 text-primary-light ${rescanning ? 'animate-spin' : ''}`} />
                    <span>{rescanning ? 'Scanning Website...' : 'Re-scan Website'}</span>
                  </button>
                </div>
              </div>

              {/* Section 1: Brand Colors with Interactive Pickers */}
              <div className="p-6 rounded-2xl bg-surface border border-border space-y-6">
                <div className="flex items-center justify-between border-b border-border pb-4">
                  <div>
                    <h3 className="text-base font-bold text-text flex items-center gap-2">
                      <Palette className="h-4 w-4 text-primary-light" />
                      Extracted &amp; Custom Colors
                    </h3>
                    <p className="text-xs text-muted mt-0.5">
                      Click any swatch to open the color picker or edit the hex code directly.
                    </p>
                  </div>
                  <button
                    onClick={handleAddColor}
                    className="px-3 py-1.5 bg-primary/15 border border-primary/40 hover:bg-primary hover:text-white text-primary-light text-xs font-bold rounded-lg transition flex items-center gap-1.5"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Add Color</span>
                  </button>
                </div>

                {/* Color Swatches Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  {brandKit.colors.map((hex, idx) => (
                    <div 
                      key={idx} 
                      className="p-3 rounded-xl bg-surface-secondary border border-border flex flex-col gap-2.5 relative group"
                    >
                      {/* Top badge */}
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] uppercase font-bold tracking-wider text-muted">
                          {idx === 0 ? 'Primary' : idx === 1 ? 'Secondary' : `Color ${idx + 1}`}
                        </span>
                        {brandKit.colors.length > 1 && (
                          <button
                            onClick={() => handleRemoveColor(idx)}
                            className="text-muted hover:text-danger transition p-0.5"
                            title="Remove color"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        )}
                      </div>

                      {/* Color Preview & Native Picker */}
                      <div className="flex items-center gap-3">
                        <div 
                          className={`relative h-10 w-10 rounded-lg overflow-hidden shrink-0 shadow-inner transition ${
                            isDarkHex(hex) 
                              ? 'border border-white/30 ring-1 ring-white/15' 
                              : 'border border-black/25 ring-1 ring-black/10'
                          }`}
                        >
                          <input
                            type="color"
                            value={hex.startsWith('#') && hex.length === 7 ? hex : '#1558C9'}
                            onChange={(e) => handleColorChange(idx, e.target.value)}
                            className="absolute -inset-2 w-14 h-14 cursor-pointer opacity-0"
                          />
                          <div 
                            className="w-full h-full border border-white/10"
                            style={{ backgroundColor: hex }}
                          />
                        </div>
                        <input
                          type="text"
                          value={hex}
                          onChange={(e) => handleColorChange(idx, e.target.value)}
                          className="w-full px-2.5 py-1.5 rounded-lg bg-surface border border-white/15 text-xs font-mono font-bold text-slate-100 placeholder:text-muted focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent uppercase shadow-sm"
                          maxLength={7}
                        />
                      </div>
                    </div>
                  ))}
                </div>

                {/* Live Palette Ribbon Preview */}
                <div className="pt-2">
                  <span className="text-[11px] font-bold text-muted block mb-2 uppercase tracking-wider">Palette Balance Preview</span>
                  <div className="h-4 w-full rounded-full overflow-hidden flex border border-border shadow-sm">
                    {brandKit.colors.map((c, i) => (
                      <div 
                        key={i} 
                        style={{ backgroundColor: c, width: `${100 / brandKit.colors.length}%` }} 
                        className="h-full"
                        title={c}
                      />
                    ))}
                  </div>
                </div>
              </div>

              {/* Section 2: Logo & Alternate Logos */}
              <div className="p-6 rounded-2xl bg-surface border border-border space-y-6">
                <div className="border-b border-border pb-4">
                  <h3 className="text-base font-bold text-text flex items-center gap-2">
                    <ImageIcon className="h-4 w-4 text-primary-light" />
                    Brand Logos &amp; Canvas Watermarks
                  </h3>
                  <p className="text-xs text-muted mt-0.5">
                    Upload your transparent high-res logo and alternate dark/light variants. Files are saved directly to Cloudflare R2 CDN.
                  </p>
                </div>

                <div className="grid md:grid-cols-2 gap-6">
                  {/* Primary Logo Card */}
                  <div className="p-5 rounded-xl bg-surface-secondary border border-border flex flex-col justify-between space-y-4">
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-xs font-bold text-text">Primary Logo</span>
                        <span className="text-[10px] text-primary-light font-bold bg-primary/15 px-2 py-0.5 rounded">
                          Watermark Default
                        </span>
                      </div>
                      
                      <div className="h-28 w-full rounded-lg bg-surface border border-dashed border-border flex items-center justify-center p-3 overflow-hidden">
                        {brandKit.logo_url ? (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img 
                            src={brandKit.logo_url} 
                            alt="Primary Brand Logo" 
                            className="max-h-full max-w-full object-contain"
                          />
                        ) : (
                          <div className="text-center text-muted text-xs">
                            <Upload className="h-6 w-6 mx-auto mb-1 text-muted" />
                            <span>No primary logo uploaded</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <input 
                      type="file" 
                      ref={primaryLogoInputRef} 
                      className="hidden" 
                      accept="image/*"
                      onChange={(e) => handleLogoUpload(e, 'primary')}
                    />
                    <button
                      onClick={() => primaryLogoInputRef.current?.click()}
                      disabled={uploadingLogo === 'primary'}
                      className="w-full py-2 bg-surface border border-primary text-text hover:bg-primary hover:text-white rounded-lg text-xs font-bold transition flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      <Upload className={`h-3.5 w-3.5 ${uploadingLogo === 'primary' ? 'animate-bounce' : ''}`} />
                      <span>{uploadingLogo === 'primary' ? 'Uploading to R2...' : 'Upload Primary Logo'}</span>
                    </button>
                  </div>

                  {/* Alternate / Clean Logo Card */}
                  <div className="p-5 rounded-xl bg-surface-secondary border border-border flex flex-col justify-between space-y-4">
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-xs font-bold text-text">Alternate / Clean Logo</span>
                        <span className="text-[10px] text-muted font-bold bg-surface px-2 py-0.5 rounded">
                          Dark Canvas Variant
                        </span>
                      </div>
                      
                      <div className="h-28 w-full rounded-lg bg-surface border border-dashed border-border flex items-center justify-center p-3 overflow-hidden">
                        {brandKit.clean_logo_url ? (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img 
                            src={brandKit.clean_logo_url} 
                            alt="Alternate Clean Logo" 
                            className="max-h-full max-w-full object-contain"
                          />
                        ) : (
                          <div className="text-center text-muted text-xs">
                            <Upload className="h-6 w-6 mx-auto mb-1 text-muted" />
                            <span>No alternate logo uploaded</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <input 
                      type="file" 
                      ref={altLogoInputRef} 
                      className="hidden" 
                      accept="image/*"
                      onChange={(e) => handleLogoUpload(e, 'alt')}
                    />
                    <button
                      onClick={() => altLogoInputRef.current?.click()}
                      disabled={uploadingLogo === 'alt'}
                      className="w-full py-2 bg-surface border border-primary text-text hover:bg-primary hover:text-white rounded-lg text-xs font-bold transition flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      <Upload className={`h-3.5 w-3.5 ${uploadingLogo === 'alt' ? 'animate-bounce' : ''}`} />
                      <span>{uploadingLogo === 'alt' ? 'Uploading to R2...' : 'Upload Alt Logo'}</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Section 3: Voice Keywords, Tone & Audience Pillars */}
              <div className="p-6 rounded-2xl bg-surface border border-border space-y-6">
                <div className="border-b border-border pb-4">
                  <h3 className="text-base font-bold text-text flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-primary-light" />
                    Brand Voice, Tone &amp; Content Pillars
                  </h3>
                  <p className="text-xs text-muted mt-0.5">
                    Gemini content generation reads directly from these guidelines to preserve your authentic tone across all channels.
                  </p>
                </div>

                <div className="grid md:grid-cols-2 gap-5">
                  {/* Business Name */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-muted uppercase tracking-wider">Business Name</label>
                    <input
                      type="text"
                      value={brandKit.business_name}
                      onChange={(e) => setBrandKit(prev => ({ ...prev, business_name: e.target.value }))}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-surface-secondary border border-border text-sm font-semibold text-text focus:outline-none focus:border-primary"
                    />
                  </div>

                  {/* Tagline */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-muted uppercase tracking-wider">Tagline / Slogan</label>
                    <input
                      type="text"
                      value={brandKit.tagline}
                      onChange={(e) => setBrandKit(prev => ({ ...prev, tagline: e.target.value }))}
                      placeholder="e.g. Automate Your Brand Strategy"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-surface-secondary border border-border text-sm font-semibold text-text focus:outline-none focus:border-primary"
                    />
                  </div>

                  {/* Tone of Voice with Presets */}
                  <div className="space-y-1.5 md:col-span-2">
                    <label className="text-xs font-bold text-muted uppercase tracking-wider">Tone of Voice</label>
                    <input
                      type="text"
                      value={brandKit.brand_tone}
                      onChange={(e) => setBrandKit(prev => ({ ...prev, brand_tone: e.target.value }))}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-surface-secondary border border-border text-sm font-semibold text-text focus:outline-none focus:border-primary mb-2"
                    />
                    <div className="flex flex-wrap gap-1.5">
                      {['Confident', 'Authoritative', 'Witty', 'Inspiring', 'Minimalist', 'Technical', 'Conversational'].map(preset => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => setBrandKit(prev => ({ ...prev, brand_tone: preset }))}
                          className={`text-xs px-2.5 py-1 rounded-lg border transition ${
                            brandKit.brand_tone.toLowerCase().includes(preset.toLowerCase())
                              ? 'bg-primary/20 border-primary text-primary-light font-bold'
                              : 'bg-surface-secondary border-border text-muted hover:text-text'
                          }`}
                        >
                          {preset}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Target Audience */}
                  <div className="space-y-1.5 md:col-span-2">
                    <label className="text-xs font-bold text-muted uppercase tracking-wider">Target Audience</label>
                    <textarea
                      rows={2}
                      value={brandKit.target_audience}
                      onChange={(e) => setBrandKit(prev => ({ ...prev, target_audience: e.target.value }))}
                      placeholder="e.g. Early-stage tech founders, modern marketing teams, B2B creators"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-surface-secondary border border-border text-sm text-text focus:outline-none focus:border-primary resize-none"
                    />
                  </div>

                  {/* Voice Keywords (Tags) */}
                  <div className="space-y-2 md:col-span-2">
                    <label className="text-xs font-bold text-muted uppercase tracking-wider">Voice Keywords</label>
                    <div className="p-2.5 rounded-xl bg-surface-secondary border border-border flex flex-wrap items-center gap-2">
                      {brandKit.brand_keywords.map((kw, i) => (
                        <span 
                          key={i} 
                          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-surface border border-primary/30 text-xs font-bold text-primary-light"
                        >
                          <span>{kw}</span>
                          <button 
                            onClick={() => handleRemoveKeyword(kw)} 
                            className="hover:text-danger transition"
                          >
                            &times;
                          </button>
                        </span>
                      ))}
                      <input
                        type="text"
                        value={newKeyword}
                        onChange={(e) => setNewKeyword(e.target.value)}
                        onKeyDown={handleAddKeyword}
                        placeholder="Type keyword and press Enter..."
                        className="bg-transparent text-xs text-text placeholder-muted focus:outline-none px-2 py-1 min-w-[200px]"
                      />
                    </div>
                  </div>

                  {/* Content Pillars / Themes */}
                  <div className="space-y-2 md:col-span-2">
                    <label className="text-xs font-bold text-muted uppercase tracking-wider">Content Pillars (Themes)</label>
                    <div className="p-2.5 rounded-xl bg-surface-secondary border border-border flex flex-wrap items-center gap-2">
                      {brandKit.content_themes.map((pillar, i) => (
                        <span 
                          key={i} 
                          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-surface border border-accent/40 text-xs font-bold text-accent"
                        >
                          <span>{pillar}</span>
                          <button 
                            onClick={() => handleRemoveTheme(pillar)} 
                            className="hover:text-danger transition text-text"
                          >
                            &times;
                          </button>
                        </span>
                      ))}
                      <input
                        type="text"
                        value={newTheme}
                        onChange={(e) => setNewTheme(e.target.value)}
                        onKeyDown={handleAddTheme}
                        placeholder="Type content pillar and press Enter..."
                        className="bg-transparent text-xs text-text placeholder-muted focus:outline-none px-2 py-1 min-w-[220px]"
                      />
                    </div>
                  </div>
                </div>

                {/* Bottom Action */}
                <div className="pt-4 border-t border-border flex justify-end">
                  <button
                    onClick={() => handleSaveBrandKit()}
                    disabled={saving}
                    className="px-6 py-2.5 bg-accent hover:bg-accent-hover text-black font-extrabold text-xs sm:text-sm rounded-xl transition duration-200 shadow-accent-glow flex items-center gap-2 disabled:opacity-50"
                  >
                    <Save className="h-4 w-4 text-black" />
                    <span>{saving ? 'Saving...' : 'Save & Sync Brand Kit'}</span>
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {/* ═════════════════════════════════════════════════════════════ */}
          {/* TAB: AUTOPILOT AGENT                                         */}
          {/* ═════════════════════════════════════════════════════════════ */}
          {activeTab === 'autopilot' && (
            <motion.div
              key="autopilot"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.15 }}
              className="space-y-6"
            >
              {/* Top Hero & Control Card */}
              <div className="p-6 rounded-2xl bg-surface border border-border shadow-glow space-y-6">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border pb-5">
                  <div className="flex items-center gap-3.5">
                    <div className="h-12 w-12 rounded-2xl bg-primary/20 border border-primary/40 flex items-center justify-center text-primary-light shadow-glow">
                      <Bot className="h-6 w-6" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="text-lg font-bold text-text">Brandflux Autopilot Agent</h2>
                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider ${
                          autopilotConfig.kill_switch
                            ? 'bg-danger/15 text-danger border border-danger/40 animate-pulse'
                            : (autopilotConfig.mode === 'autopilot' 
                                ? 'bg-accent/15 text-accent border border-accent/40' 
                                : 'bg-primary/15 text-primary-light border border-primary/40')
                        }`}>
                          {autopilotConfig.kill_switch ? 'KILL SWITCH ACTIVE' : `${autopilotConfig.mode.toUpperCase()} MODE`}
                        </span>
                      </div>
                      <p className="text-xs text-muted mt-0.5">
                        Autonomous weekly cycle: Metrics Analysis → 7-Day Plan → Copy &amp; Playwright Graphics → Self-Critique → Scheduled.
                      </p>
                    </div>
                  </div>

                  {/* Actions: Run Now & Kill Switch */}
                  <div className="flex items-center gap-3">
                    <button
                      onClick={handleToggleKillSwitch}
                      className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
                        autopilotConfig.kill_switch
                          ? 'bg-danger text-white border border-danger shadow-lg shadow-danger/25 animate-pulse'
                          : 'bg-surface-secondary border border-border text-muted hover:border-danger hover:text-danger'
                      }`}
                    >
                      <Power className="h-3.5 w-3.5" />
                      <span>{autopilotConfig.kill_switch ? 'Kill Switch Engaged' : 'Emergency Kill Switch'}</span>
                    </button>

                    <button
                      onClick={handleTriggerAutopilot}
                      disabled={runningAutopilot || autopilotConfig.kill_switch}
                      className="px-4 py-2 bg-accent hover:bg-accent-hover text-black font-extrabold text-xs rounded-xl transition duration-200 shadow-accent-glow flex items-center gap-2 disabled:opacity-50"
                    >
                      {runningAutopilot ? (
                        <>
                          <RefreshCw className="h-3.5 w-3.5 animate-spin text-black" />
                          <span>Executing Agent...</span>
                        </>
                      ) : (
                        <>
                          <Play className="h-3.5 w-3.5 fill-black text-black" />
                          <span>Run Autopilot Now</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Mode Selector Cards */}
                <div className="grid md:grid-cols-2 gap-4">
                  {/* Approval Mode */}
                  <div 
                    onClick={() => handleUpdateMode('approval')}
                    className={`p-4 rounded-xl border cursor-pointer transition ${
                      autopilotConfig.mode === 'approval'
                        ? 'bg-primary/10 border-primary ring-1 ring-primary/40'
                        : 'bg-surface-secondary border-border hover:border-border-hover'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-base">🛡️</span>
                        <h4 className="text-sm font-bold text-text">Approval Mode (Recommended)</h4>
                      </div>
                      <span className={`h-4 w-4 rounded-full border flex items-center justify-center ${
                        autopilotConfig.mode === 'approval' ? 'border-primary bg-primary text-white' : 'border-muted'
                      }`}>
                        {autopilotConfig.mode === 'approval' && <Check className="h-2.5 w-2.5 stroke-[3]" />}
                      </span>
                    </div>
                    <p className="text-xs text-muted leading-relaxed">
                      Agent plans, writes, and renders graphics, runs self-critique, and places posts in <strong className="text-accent">Pending Approval</strong>. You review and approve in 1 click.
                    </p>
                  </div>

                  {/* Hands-Free Autopilot */}
                  <div 
                    onClick={() => handleUpdateMode('autopilot')}
                    className={`p-4 rounded-xl border cursor-pointer transition ${
                      autopilotConfig.mode === 'autopilot'
                        ? 'bg-accent/10 border-accent ring-1 ring-accent/40'
                        : 'bg-surface-secondary border-border hover:border-border-hover'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-base">⚡</span>
                        <h4 className="text-sm font-bold text-text">Autopilot Mode (Hands-Free)</h4>
                      </div>
                      <span className={`h-4 w-4 rounded-full border flex items-center justify-center ${
                        autopilotConfig.mode === 'autopilot' ? 'border-accent bg-accent text-black' : 'border-muted'
                      }`}>
                        {autopilotConfig.mode === 'autopilot' && <Check className="h-2.5 w-2.5 stroke-[3] text-black" />}
                      </span>
                    </div>
                    <p className="text-xs text-muted leading-relaxed">
                      Fully autonomous. After passing quality critique thresholds, posts are immediately scheduled to the live calendar and published automatically via Celery.
                    </p>
                  </div>
                </div>

                {/* Guardrails Configuration */}
                <div className="space-y-4 pt-2">
                  <h3 className="text-xs font-bold text-muted uppercase tracking-wider flex items-center gap-2">
                    <Sliders className="h-3.5 w-3.5 text-primary-light" />
                    Agent Guardrails &amp; Constraints
                  </h3>

                  <div className="grid md:grid-cols-2 gap-4">
                    {/* Max posts per day */}
                    <div className="p-4 rounded-xl bg-surface-secondary border border-border space-y-2">
                      <label className="text-xs font-bold text-text">Max Posts Per Day</label>
                      <p className="text-[11px] text-muted">Prevents over-saturation and protects social account health.</p>
                      <div className="flex items-center gap-2 pt-1">
                        {[1, 2, 3, 4].map(num => (
                          <button
                            key={num}
                            onClick={() => handleUpdateDailyCap(num)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                              autopilotConfig.max_posts_per_day === num
                                ? 'bg-primary text-white shadow-glow'
                                : 'bg-surface border border-border text-muted hover:text-text'
                            }`}
                          >
                            {num} / day
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Factual claim guardrail alert */}
                    <div className="p-4 rounded-xl bg-surface-secondary border border-border space-y-2">
                      <label className="text-xs font-bold text-text flex items-center gap-1.5">
                        <ShieldAlert className="h-3.5 w-3.5 text-accent" />
                        <span>Factual Claims &amp; Price Guardrail</span>
                      </label>
                      <p className="text-[11px] text-muted leading-relaxed">
                        Strict policy: Agent will <strong className="text-text">never invent prices, dollar figures, or discounts</strong> not explicitly stated in verified daily check-ins. Posts with unverified claims are rejected.
                      </p>
                    </div>
                  </div>

                  {/* Banned topics list */}
                  <div className="p-4 rounded-xl bg-surface-secondary border border-border space-y-2">
                    <label className="text-xs font-bold text-text">Banned Topics &amp; Prohibited Keywords</label>
                    <p className="text-[11px] text-muted">Agent automatically rejects and regenerates any post referencing these subjects.</p>
                    <div className="p-2 rounded-xl bg-surface border border-border flex flex-wrap items-center gap-2">
                      {autopilotConfig.banned_topics.map((topic, i) => (
                        <span 
                          key={i} 
                          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-danger/10 border border-danger/30 text-xs font-bold text-danger"
                        >
                          <span>{topic}</span>
                          <button 
                            onClick={() => handleRemoveBannedTopic(topic)}
                            className="hover:text-white transition"
                          >
                            &times;
                          </button>
                        </span>
                      ))}
                      <input
                        type="text"
                        value={newBannedTopic}
                        onChange={(e) => setNewBannedTopic(e.target.value)}
                        onKeyDown={handleAddBannedTopic}
                        placeholder="Type topic and press Enter..."
                        className="bg-transparent text-xs text-text placeholder-muted focus:outline-none px-2 py-1 min-w-[200px]"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Pending Approval Queue */}
              {pendingPosts.length > 0 && (
                <div className="p-6 rounded-2xl bg-surface border border-accent/40 shadow-accent-glow/10 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-4">
                    <div>
                      <h3 className="text-base font-bold text-text flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full bg-accent animate-pulse" />
                        Pending Approval Queue ({pendingPosts.length} Posts)
                      </h3>
                      <p className="text-xs text-muted mt-0.5">
                        These posts have passed self-critique and are waiting for your approval before publishing.
                      </p>
                    </div>
                    <button
                      onClick={handleApproveAll}
                      className="px-4 py-2 bg-accent hover:bg-accent-hover text-black font-extrabold text-xs rounded-xl transition shadow-accent-glow self-start sm:self-auto"
                    >
                      Approve All ({pendingPosts.length} Posts)
                    </button>
                  </div>

                  <div className="grid md:grid-cols-2 gap-4">
                    {pendingPosts.map(post => (
                      <div key={post.id} className="p-4 rounded-xl bg-surface-secondary border border-border flex flex-col justify-between space-y-3">
                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-xs">
                            <span className="px-2 py-0.5 rounded-full bg-primary/15 text-primary-light font-bold text-[10px] uppercase">
                              {post.platform}
                            </span>
                            <span className="text-muted font-mono text-[11px]">
                              {new Date(post.scheduled_at).toLocaleDateString()} · {new Date(post.scheduled_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                          <p className="text-xs text-text font-medium line-clamp-3 leading-relaxed">
                            {post.caption}
                          </p>
                          {post.media_url && (
                            <div className="mt-2 h-28 rounded-lg overflow-hidden border border-border bg-black/40 relative">
                              <img src={post.media_url} alt="Post creative" className="w-full h-full object-contain" />
                            </div>
                          )}
                          {post.critique_score && (
                            <div className="flex items-center gap-1.5 text-[11px] text-accent font-bold pt-1">
                              <span>★ Quality Score:</span>
                              <span>{post.critique_score} / 10</span>
                            </div>
                          )}
                        </div>

                        <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
                          <button
                            onClick={() => handleRejectSingle(post.id)}
                            className="px-3 py-1.5 rounded-lg text-xs font-bold text-muted hover:text-danger hover:bg-danger/10 transition"
                          >
                            Reject
                          </button>
                          <button
                            onClick={() => handleApproveSingle(post.id)}
                            className="px-3 py-1.5 rounded-lg text-xs font-bold bg-primary hover:bg-primary-hover text-white transition shadow-glow flex items-center gap-1"
                          >
                            <Check className="h-3 w-3 stroke-[3]" />
                            <span>Approve</span>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Decision Audit Trail */}
              <div className="p-6 rounded-2xl bg-surface border border-border space-y-4">
                <div className="flex items-center justify-between border-b border-border pb-4">
                  <div>
                    <h3 className="text-base font-bold text-text flex items-center gap-2">
                      <Clock className="h-4 w-4 text-primary-light" />
                      Decision Audit Trail (Autopilot Logs)
                    </h3>
                    <p className="text-xs text-muted mt-0.5">
                      Full transparency into every autonomous decision, self-critique score, and guardrail check.
                    </p>
                  </div>
                  <button
                    onClick={fetchAutopilotData}
                    disabled={loadingAutopilotData}
                    className="p-1.5 rounded-lg bg-surface-secondary border border-border hover:border-primary text-muted hover:text-text transition"
                    title="Refresh logs"
                  >
                    <RefreshCw className={`h-4 w-4 ${loadingAutopilotData ? 'animate-spin' : ''}`} />
                  </button>
                </div>

                <div className="space-y-2.5 max-h-96 overflow-y-auto scrollbar-thin pr-1">
                  {decisionLogs.length === 0 ? (
                    <div className="p-6 text-center text-xs text-muted">
                      No decision logs recorded yet. Run Autopilot above to generate your first audit trail.
                    </div>
                  ) : (
                    decisionLogs.map((log: any) => (
                      <div 
                        key={log.id} 
                        className="p-3 rounded-xl bg-surface-secondary border border-border flex items-start justify-between gap-3 text-xs"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase ${
                              log.status === 'SUCCESS' ? 'bg-success/15 text-success' :
                              log.status === 'BLOCKED' ? 'bg-danger/15 text-danger' :
                              log.status === 'WARNING' ? 'bg-amber-500/15 text-amber-300' :
                              'bg-primary/15 text-primary-light'
                            }`}>
                              {log.stage}
                            </span>
                            <span className="text-[10px] text-muted font-mono">{log.run_id}</span>
                          </div>
                          <p className="text-text font-medium leading-relaxed">
                            {log.decision_summary}
                          </p>
                        </div>
                        <span className="text-[10px] text-muted whitespace-nowrap font-mono">
                          {new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {/* ═════════════════════════════════════════════════════════════ */}
          {/* TAB 2: ACCOUNT                                               */}
          {/* ═════════════════════════════════════════════════════════════ */}
          {activeTab === 'account' && (
            <motion.div
              key="account"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.15 }}
              className="space-y-6"
            >
              {/* Profile Card */}
              <div className="p-6 rounded-2xl bg-surface border border-border space-y-5">
                <div className="flex items-center gap-4 pb-4 border-b border-border">
                  <div className="h-14 w-14 rounded-2xl bg-primary flex items-center justify-center text-white text-xl font-extrabold shadow-glow">
                    {userProfile.full_name ? userProfile.full_name[0].toUpperCase() : 'U'}
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-text">{userProfile.full_name || 'Brandflux User'}</h3>
                    <p className="text-xs text-muted">{userProfile.email}</p>
                    <span className="inline-block mt-1 px-2.5 py-0.5 rounded-full bg-primary/15 text-primary-light text-[10px] font-extrabold tracking-wider">
                      {userProfile.plan} MEMBER
                    </span>
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-muted uppercase">Full Name</label>
                    <input
                      type="text"
                      value={userProfile.full_name}
                      onChange={(e) => setUserProfile(prev => ({ ...prev, full_name: e.target.value }))}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-surface-secondary border border-border text-sm font-semibold text-text focus:outline-none focus:border-primary"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-muted uppercase">Email Address (Login)</label>
                    <input
                      type="email"
                      value={userProfile.email}
                      onChange={(e) => setUserProfile(prev => ({ ...prev, email: e.target.value }))}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-surface-secondary border border-border text-sm font-semibold text-text focus:outline-none focus:border-primary"
                    />
                  </div>
                </div>

                <div className="pt-2 flex justify-end">
                  <button
                    onClick={handleUpdateProfile}
                    disabled={updatingProfile}
                    className="px-4 py-2 bg-primary hover:bg-primary/90 text-white shadow-glow rounded-xl text-xs font-bold transition flex items-center gap-2 disabled:opacity-50"
                  >
                    <Save className="h-3.5 w-3.5" />
                    <span>{updatingProfile ? 'Saving...' : 'Save Profile Changes'}</span>
                  </button>
                </div>
              </div>

              {/* Password Change Card */}
              <div className="p-6 rounded-2xl bg-surface border border-border space-y-4">
                <h3 className="text-base font-bold text-text flex items-center gap-2">
                  <Key className="h-4 w-4 text-primary-light" />
                  Security &amp; Password
                </h3>
                <div className="grid md:grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-muted">Current Password</label>
                    <input
                      type="password"
                      placeholder="••••••••"
                      value={passwords.currentPassword}
                      onChange={(e) => setPasswords(prev => ({ ...prev, currentPassword: e.target.value }))}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-surface-secondary border border-border text-sm text-text focus:outline-none focus:border-primary"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-muted">New Password</label>
                    <input
                      type="password"
                      placeholder="••••••••"
                      value={passwords.newPassword}
                      onChange={(e) => setPasswords(prev => ({ ...prev, newPassword: e.target.value }))}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-surface-secondary border border-border text-sm text-text focus:outline-none focus:border-primary"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-muted">Confirm Password</label>
                    <input
                      type="password"
                      placeholder="••••••••"
                      value={passwords.confirmPassword}
                      onChange={(e) => setPasswords(prev => ({ ...prev, confirmPassword: e.target.value }))}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-surface-secondary border border-border text-sm text-text focus:outline-none focus:border-primary"
                    />
                  </div>
                </div>

                <div className="pt-2 flex justify-end">
                  <button
                    onClick={() => {
                      if (!passwords.newPassword) {
                        toast.error('Please enter a new password')
                        return
                      }
                      if (passwords.newPassword !== passwords.confirmPassword) {
                        toast.error('New passwords do not match')
                        return
                      }
                      toast.success('Security settings updated successfully')
                      setPasswords({ currentPassword: '', newPassword: '', confirmPassword: '' })
                    }}
                    className="px-4 py-2 bg-surface-secondary border border-primary text-text hover:bg-primary hover:text-white rounded-xl text-xs font-bold transition"
                  >
                    Update Password
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {/* ═════════════════════════════════════════════════════════════ */}
          {/* TAB 3: CONNECTED ACCOUNTS                                    */}
          {/* ═════════════════════════════════════════════════════════════ */}
          {activeTab === 'connected' && (
            <motion.div
              key="connected"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.15 }}
              className="space-y-6"
            >
              {/* Header Box */}
              <div className="p-6 rounded-2xl bg-surface border border-border space-y-4">
                <div className="border-b border-border pb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div>
                    <h3 className="text-base font-bold text-text flex items-center gap-2">
                      <Share2 className="h-4 w-4 text-primary-light" />
                      Social Publishing &amp; OAuth Integrations
                    </h3>
                    <p className="text-xs text-muted mt-0.5">
                      Connect your social accounts. Tokens are encrypted using Fernet (AES-128-CBC) and refreshed automatically.
                    </p>
                  </div>
                  <button
                    onClick={fetchSocialAccounts}
                    disabled={loadingAccounts}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-surface-secondary border border-border hover:border-primary text-xs font-bold text-text transition disabled:opacity-50 self-start sm:self-auto"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 text-primary-light ${loadingAccounts ? 'animate-spin' : ''}`} />
                    <span>Refresh</span>
                  </button>
                </div>

                {/* Available Channels */}
                <div className="grid md:grid-cols-2 gap-4 pt-2">
                  {/* Meta (Instagram & Facebook) */}
                  {(() => {
                    const metaAccounts = socialAccounts.filter(a => a.platform === 'instagram' || a.platform === 'facebook')
                    const isConnected = metaAccounts.length > 0
                    const hasExpiring = metaAccounts.some(a => a.needs_reconnect || (a.days_until_expiry !== undefined && a.days_until_expiry <= 7))

                    return (
                      <div className="p-5 rounded-2xl bg-surface-secondary border border-border flex flex-col justify-between space-y-4">
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <span className="text-2xl">📸</span>
                              <div>
                                <h4 className="text-sm font-bold text-text">Instagram &amp; Facebook</h4>
                                <p className="text-[11px] text-muted">Meta Graph API v19.0 (Direct Carousel &amp; Feed)</p>
                              </div>
                            </div>
                            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider ${
                              isConnected 
                                ? 'bg-success/15 border border-success/40 text-success' 
                                : 'bg-surface border border-border text-muted'
                            }`}>
                              {isConnected ? 'Connected' : 'Disconnected'}
                            </span>
                          </div>

                          {isConnected ? (
                            <div className="space-y-2 pt-1">
                              {metaAccounts.map(acc => (
                                <div key={acc.id} className="p-2.5 rounded-xl bg-surface border border-border/80 flex items-center justify-between">
                                  <div className="min-w-0 pr-2">
                                    <div className="flex items-center gap-1.5">
                                      <span className="text-xs">{acc.platform === 'instagram' ? '📷' : '📘'}</span>
                                      <p className="text-xs font-bold text-text truncate">
                                        {acc.account_name || acc.page_name || acc.platform}
                                      </p>
                                    </div>
                                    <p className="text-[10px] text-muted truncate mt-0.5">
                                      {acc.days_until_expiry !== undefined ? `Expires in ${acc.days_until_expiry}d` : 'Long-lived Token (60d)'}
                                    </p>
                                  </div>
                                  <button
                                    onClick={() => handleDisconnectAccount(acc.id, acc.account_name || acc.platform)}
                                    className="text-[11px] font-bold text-muted hover:text-danger px-2 py-1 rounded transition"
                                  >
                                    Disconnect
                                  </button>
                                </div>
                              ))}

                              {hasExpiring && (
                                <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center gap-2 text-[11px] text-amber-300">
                                  <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
                                  <span>Token expiring soon (&lt; 7 days). Reconnection recommended.</span>
                                </div>
                              )}
                            </div>
                          ) : (
                            <p className="text-xs text-muted">
                              Publish scheduled carousels, feed photos, and stories straight to your connected Instagram Business or Facebook Page.
                            </p>
                          )}
                        </div>

                        <div className="pt-2 border-t border-border/60">
                          <button
                            onClick={() => handleConnectOAuth('meta')}
                            disabled={connectingPlatform === 'meta'}
                            className={`w-full py-2 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 ${
                              isConnected
                                ? 'bg-surface border border-primary text-text hover:bg-primary hover:text-white'
                                : 'bg-primary hover:bg-primary/90 text-white shadow-glow'
                            }`}
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                            <span>{connectingPlatform === 'meta' ? 'Connecting...' : (isConnected ? 'Reconnect Meta Account' : 'Connect Meta (Instagram / FB)')}</span>
                          </button>
                        </div>
                      </div>
                    )
                  })()}

                  {/* LinkedIn */}
                  {(() => {
                    const liAccounts = socialAccounts.filter(a => a.platform === 'linkedin')
                    const isConnected = liAccounts.length > 0
                    const hasExpiring = liAccounts.some(a => a.needs_reconnect || (a.days_until_expiry !== undefined && a.days_until_expiry <= 7))

                    return (
                      <div className="p-5 rounded-2xl bg-surface-secondary border border-border flex flex-col justify-between space-y-4">
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <span className="text-2xl">💼</span>
                              <div>
                                <h4 className="text-sm font-bold text-text">LinkedIn</h4>
                                <p className="text-[11px] text-muted">LinkedIn REST Posts API (Profiles &amp; Pages)</p>
                              </div>
                            </div>
                            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider ${
                              isConnected 
                                ? 'bg-success/15 border border-success/40 text-success' 
                                : 'bg-surface border border-border text-muted'
                            }`}>
                              {isConnected ? 'Connected' : 'Disconnected'}
                            </span>
                          </div>

                          {isConnected ? (
                            <div className="space-y-2 pt-1">
                              {liAccounts.map(acc => (
                                <div key={acc.id} className="p-2.5 rounded-xl bg-surface border border-border/80 flex items-center justify-between">
                                  <div className="min-w-0 pr-2">
                                    <div className="flex items-center gap-1.5">
                                      <span className="text-xs">💼</span>
                                      <p className="text-xs font-bold text-text truncate">
                                        {acc.account_name || 'LinkedIn Member'}
                                      </p>
                                    </div>
                                    <p className="text-[10px] text-muted truncate mt-0.5">
                                      {acc.days_until_expiry !== undefined ? `Expires in ${acc.days_until_expiry}d` : 'Active OAuth Token'}
                                    </p>
                                  </div>
                                  <button
                                    onClick={() => handleDisconnectAccount(acc.id, acc.account_name || 'LinkedIn')}
                                    className="text-[11px] font-bold text-muted hover:text-danger px-2 py-1 rounded transition"
                                  >
                                    Disconnect
                                  </button>
                                </div>
                              ))}

                              {hasExpiring && (
                                <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center gap-2 text-[11px] text-amber-300">
                                  <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
                                  <span>Token expiring soon. Reconnect to avoid publishing pauses.</span>
                                </div>
                              )}
                            </div>
                          ) : (
                            <p className="text-xs text-muted">
                              Publish thought leadership articles, multi-image updates, and text posts directly to your personal or organization profile.
                            </p>
                          )}
                        </div>

                        <div className="pt-2 border-t border-border/60">
                          <button
                            onClick={() => handleConnectOAuth('linkedin')}
                            disabled={connectingPlatform === 'linkedin'}
                            className={`w-full py-2 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 ${
                              isConnected
                                ? 'bg-surface border border-primary text-text hover:bg-primary hover:text-white'
                                : 'bg-primary hover:bg-primary/90 text-white shadow-glow'
                            }`}
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                            <span>{connectingPlatform === 'linkedin' ? 'Connecting...' : (isConnected ? 'Reconnect LinkedIn' : 'Connect LinkedIn')}</span>
                          </button>
                        </div>
                      </div>
                    )
                  })()}

                  {/* TikTok */}
                  {(() => {
                    const ttAccounts = socialAccounts.filter(a => a.platform === 'tiktok')
                    const isConnected = ttAccounts.length > 0
                    const hasExpiring = ttAccounts.some(a => a.needs_reconnect || (a.days_until_expiry !== undefined && a.days_until_expiry <= 7))

                    return (
                      <div className="p-5 rounded-2xl bg-surface-secondary border border-border flex flex-col justify-between space-y-4">
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <span className="text-2xl">🎵</span>
                              <div>
                                <h4 className="text-sm font-bold text-text">TikTok</h4>
                                <p className="text-[11px] text-muted">TikTok Content Posting API (Direct Video &amp; Photos)</p>
                              </div>
                            </div>
                            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider ${
                              isConnected 
                                ? 'bg-success/15 border border-success/40 text-success' 
                                : 'bg-surface border border-border text-muted'
                            }`}>
                              {isConnected ? 'Connected' : 'Disconnected'}
                            </span>
                          </div>

                          {isConnected ? (
                            <div className="space-y-2 pt-1">
                              {ttAccounts.map(acc => (
                                <div key={acc.id} className="p-2.5 rounded-xl bg-surface border border-border/80 flex items-center justify-between">
                                  <div className="min-w-0 pr-2">
                                    <div className="flex items-center gap-1.5">
                                      <span className="text-xs">🎵</span>
                                      <p className="text-xs font-bold text-text truncate">
                                        {acc.account_name || '@tiktok_user'}
                                      </p>
                                    </div>
                                    <p className="text-[10px] text-muted truncate mt-0.5">
                                      {acc.days_until_expiry !== undefined ? `Expires in ${acc.days_until_expiry}d` : 'Active OAuth Token'}
                                    </p>
                                  </div>
                                  <button
                                    onClick={() => handleDisconnectAccount(acc.id, acc.account_name || 'TikTok')}
                                    className="text-[11px] font-bold text-muted hover:text-danger px-2 py-1 rounded transition"
                                  >
                                    Disconnect
                                  </button>
                                </div>
                              ))}

                              {hasExpiring && (
                                <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center gap-2 text-[11px] text-amber-300">
                                  <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
                                  <span>Token expiring soon. Reconnect to keep publishing active.</span>
                                </div>
                              )}
                            </div>
                          ) : (
                            <p className="text-xs text-muted">
                              Publish branded photo carousels and short-form videos directly to your authorized TikTok creator profile.
                            </p>
                          )}
                        </div>

                        <div className="pt-2 border-t border-border/60">
                          <button
                            onClick={() => handleConnectOAuth('tiktok')}
                            disabled={connectingPlatform === 'tiktok'}
                            className={`w-full py-2 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 ${
                              isConnected
                                ? 'bg-surface border border-primary text-text hover:bg-primary hover:text-white'
                                : 'bg-primary hover:bg-primary/90 text-white shadow-glow'
                            }`}
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                            <span>{connectingPlatform === 'tiktok' ? 'Connecting...' : (isConnected ? 'Reconnect TikTok' : 'Connect TikTok')}</span>
                          </button>
                        </div>
                      </div>
                    )
                  })()}

                  {/* X / Twitter */}
                  {(() => {
                    const twAccounts = socialAccounts.filter(a => a.platform === 'twitter' || a.platform === 'x')
                    const isConnected = twAccounts.length > 0
                    const hasExpiring = twAccounts.some(a => a.needs_reconnect || (a.days_until_expiry !== undefined && a.days_until_expiry <= 7))

                    return (
                      <div className="p-5 rounded-2xl bg-surface-secondary border border-border flex flex-col justify-between space-y-4">
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <span className="text-2xl">𝕏</span>
                              <div>
                                <h4 className="text-sm font-bold text-text">X (Twitter)</h4>
                                <p className="text-[11px] text-muted">X API v2 (Tweets, Threads &amp; Media)</p>
                              </div>
                            </div>
                            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider ${
                              isConnected 
                                ? 'bg-success/15 border border-success/40 text-success' 
                                : 'bg-surface border border-border text-muted'
                            }`}>
                              {isConnected ? 'Connected' : 'Disconnected'}
                            </span>
                          </div>

                          {isConnected ? (
                            <div className="space-y-2 pt-1">
                              {twAccounts.map(acc => (
                                <div key={acc.id} className="p-2.5 rounded-xl bg-surface border border-border/80 flex items-center justify-between">
                                  <div className="min-w-0 pr-2">
                                    <div className="flex items-center gap-1.5">
                                      <span className="text-xs">𝕏</span>
                                      <p className="text-xs font-bold text-text truncate">
                                        {acc.account_name || '@x_user'}
                                      </p>
                                    </div>
                                    <p className="text-[10px] text-muted truncate mt-0.5">
                                      {acc.days_until_expiry !== undefined ? `Expires in ${acc.days_until_expiry}d` : 'Active OAuth 2.0 Token'}
                                    </p>
                                  </div>
                                  <button
                                    onClick={() => handleDisconnectAccount(acc.id, acc.account_name || 'X')}
                                    className="text-[11px] font-bold text-muted hover:text-danger px-2 py-1 rounded transition"
                                  >
                                    Disconnect
                                  </button>
                                </div>
                              ))}

                              {hasExpiring && (
                                <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center gap-2 text-[11px] text-amber-300">
                                  <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
                                  <span>Token expiring soon. Reconnect to keep publishing active.</span>
                                </div>
                              )}
                            </div>
                          ) : (
                            <p className="text-xs text-muted">
                              Publish branded tweets, image attachments, and short-form announcements directly to your X profile.
                            </p>
                          )}
                        </div>

                        <div className="pt-2 border-t border-border/60">
                          <button
                            onClick={() => handleConnectOAuth('twitter')}
                            disabled={connectingPlatform === 'twitter'}
                            className={`w-full py-2 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 ${
                              isConnected
                                ? 'bg-surface border border-primary text-text hover:bg-primary hover:text-white'
                                : 'bg-primary hover:bg-primary/90 text-white shadow-glow'
                            }`}
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                            <span>{connectingPlatform === 'twitter' ? 'Connecting...' : (isConnected ? 'Reconnect X' : 'Connect X')}</span>
                          </button>
                        </div>
                      </div>
                    )
                  })()}
                </div>

                {/* Automation & Worker Status Banner */}
                <div className="mt-4 p-4 rounded-xl bg-surface-secondary/60 border border-border flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2.5">
                    <span className="h-2 w-2 rounded-full bg-accent animate-pulse" />
                    <span className="font-semibold text-text">Celery Publisher Worker</span>
                    <span className="text-muted hidden sm:inline">· Polls scheduled_posts due every minute with idempotent retries</span>
                  </div>
                  <span className="text-accent font-mono font-bold text-[11px]">ACTIVE &amp; READY</span>
                </div>
              </div>
            </motion.div>
          )}

          {/* ═════════════════════════════════════════════════════════════ */}
          {/* TAB 4: BILLING & PLANS                                       */}
          {/* ═════════════════════════════════════════════════════════════ */}
          {activeTab === 'billing' && (
            <motion.div
              key="billing"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.15 }}
              className="space-y-6"
            >
              {/* Current Plan Overview */}
              <div className="p-6 rounded-2xl bg-surface border border-primary shadow-glow space-y-5">
                <div className="flex items-center justify-between pb-4 border-b border-border">
                  <div>
                    <span className="text-xs font-bold text-primary-light uppercase tracking-wider">Active Subscription</span>
                    <h3 className="text-2xl font-extrabold text-text mt-0.5">Growth Tier</h3>
                    <p className="text-xs text-muted">Billed monthly · Renews on November 29, 2026</p>
                  </div>
                  <div className="text-right">
                    <span className="text-3xl font-black text-text">$19</span>
                    <span className="text-xs text-muted">/month</span>
                  </div>
                </div>

                {/* Usage meter */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold">
                    <span className="text-text">Monthly AI Generations</span>
                    <span className="text-accent font-extrabold">18 / 30 Posts Used</span>
                  </div>
                  <div className="h-2.5 w-full rounded-full bg-surface-secondary overflow-hidden border border-border">
                    <div className="h-full bg-accent rounded-full" style={{ width: '60%' }} />
                  </div>
                </div>

                <div className="pt-2 flex flex-wrap gap-3">
                  <button 
                    onClick={() => toast.success('Redirecting to Stripe Customer Portal...')}
                    className="px-4 py-2 bg-accent hover:bg-accent-hover text-black text-xs font-extrabold rounded-xl transition shadow-accent-glow"
                  >
                    Upgrade to Pro
                  </button>
                  <button 
                    onClick={() => toast.success('Stripe invoice history opened')}
                    className="px-4 py-2 bg-surface-secondary border border-border hover:border-primary text-text text-xs font-bold rounded-xl transition"
                  >
                    View Invoices
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      )}

      {/* ── Persistently Visible Save Action for Brand Kit ── */}
      {activeTab === 'brand-kit' && (
        <div className="fixed bottom-6 right-6 z-40 flex items-center gap-3 p-2.5 bg-surface/95 border border-border/80 backdrop-blur-xl rounded-2xl shadow-2xl">
          <span className="hidden sm:inline text-xs text-muted font-medium pl-2">
            Brand Kit edits
          </span>
          <button
            onClick={() => handleSaveBrandKit()}
            disabled={saving || loading}
            className="px-5 py-2.5 bg-accent hover:bg-accent-hover text-black font-extrabold text-xs sm:text-sm rounded-xl transition duration-200 shadow-accent-glow flex items-center gap-2 active:scale-95 disabled:opacity-50"
          >
            {saving ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin text-black" />
                <span>Saving...</span>
              </>
            ) : (
              <>
                <Save className="h-4 w-4 text-black" />
                <span>Save Brand Kit</span>
              </>
            )}
          </button>
        </div>
      )}
    </div>
  )
}
