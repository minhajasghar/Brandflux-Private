'use client'

import { useState, useEffect } from 'react'
import {
  Share2,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  ExternalLink,
  ShieldAlert,
  Key,
  Layers,
  Sparkles
} from 'lucide-react'
import { getAdminIntegrations } from '@/lib/api'
import { toast } from 'react-hot-toast'

interface PlatformIntegration {
  platform: string
  name: string
  category: string
  is_configured: boolean
  env_keys: string[]
  connected_accounts_count: number
  token_health: 'HEALTHY' | 'EXPIRING_SOON' | 'EXPIRED' | 'NOT_CONNECTED'
  last_successful_publish: {
    timestamp: string | null
    post_id: string | null
  } | null
  last_error: {
    timestamp: string | null
    error: string | null
    http_status: number | null
  } | null
}

const PLATFORM_ICONS: Record<string, string> = {
  facebook: '📘',
  instagram: '📸',
  linkedin: '💼',
  tiktok: '🎵',
  twitter: '𝕏'
}

export default function AdminIntegrationsTab() {
  const [platforms, setPlatforms] = useState<PlatformIntegration[]>([])
  const [loading, setLoading] = useState(true)

  const fetchIntegrations = async () => {
    try {
      setLoading(true)
      const data = await getAdminIntegrations()
      if (data?.platforms) {
        setPlatforms(data.platforms)
      }
    } catch (err: any) {
      console.error('Failed to load integrations:', err)
      toast.error('Failed to fetch platform integrations health.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchIntegrations()
  }, [])

  const configuredCount = platforms.filter(p => p.is_configured).length
  const totalAccounts = platforms.reduce((acc, p) => acc + p.connected_accounts_count, 0)
  const healthyCount = platforms.filter(p => p.token_health === 'HEALTHY').length

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <div className="p-6 rounded-2xl bg-surface border border-border flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-text flex items-center gap-2">
            <Share2 className="h-5 w-5 text-primary-light" />
            <span>Developer Platform Integrations</span>
          </h2>
          <p className="text-xs text-muted mt-1 max-w-2xl">
            Live health monitor for all social API integrations. Credentials must be stored only in server environment variables. Platforms without valid credentials display &apos;Coming soon&apos; to end users.
          </p>
        </div>
        <button
          onClick={fetchIntegrations}
          disabled={loading}
          className="inline-flex items-center gap-2 px-4 py-2 bg-surface-secondary hover:bg-surface border border-border hover:border-primary text-xs font-bold text-text rounded-xl transition disabled:opacity-50 self-start sm:self-auto"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh Status</span>
        </button>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl bg-surface border border-border space-y-1">
          <p className="text-xs text-muted font-bold uppercase tracking-wider">Total Supported</p>
          <p className="text-2xl font-black text-text">{platforms.length}</p>
          <p className="text-[11px] text-muted">Platforms in adapter registry</p>
        </div>
        <div className="p-4 rounded-xl bg-surface border border-border space-y-1">
          <p className="text-xs text-muted font-bold uppercase tracking-wider">Configured in Env</p>
          <p className="text-2xl font-black text-accent">{configuredCount} / {platforms.length}</p>
          <p className="text-[11px] text-muted">Ready for client authentication</p>
        </div>
        <div className="p-4 rounded-xl bg-surface border border-border space-y-1">
          <p className="text-xs text-muted font-bold uppercase tracking-wider">Active Connections</p>
          <p className="text-2xl font-black text-primary-light">{totalAccounts}</p>
          <p className="text-[11px] text-muted">Total linked brand accounts</p>
        </div>
        <div className="p-4 rounded-xl bg-surface border border-border space-y-1">
          <p className="text-xs text-muted font-bold uppercase tracking-wider">Healthy Tokens</p>
          <p className="text-2xl font-black text-success">{healthyCount}</p>
          <p className="text-[11px] text-muted">Tokens with &gt; 7 days validity</p>
        </div>
      </div>

      {/* Platform Health Cards */}
      <div className="grid gap-4">
        {platforms.map(p => {
          const icon = PLATFORM_ICONS[p.platform] || '🌐'

          return (
            <div
              key={p.platform}
              className={`p-5 rounded-2xl border transition ${
                p.is_configured
                  ? 'bg-surface border-border'
                  : 'bg-surface/50 border-border/60 opacity-80'
              }`}
            >
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-border">
                {/* Platform Name & Category */}
                <div className="flex items-center gap-3.5">
                  <span className="text-3xl">{icon}</span>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-bold text-text">{p.name}</h3>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider ${
                        p.is_configured
                          ? 'bg-success/15 border border-success/40 text-success'
                          : 'bg-surface-secondary border border-border text-muted'
                      }`}>
                        {p.is_configured ? 'CONFIGURED' : 'COMING SOON (NO ENV)'}
                      </span>
                    </div>
                    <p className="text-xs text-muted font-mono mt-0.5">{p.category}</p>
                  </div>
                </div>

                {/* Token Health Badge & Accounts Count */}
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <p className="text-xs font-bold text-text">
                      {p.connected_accounts_count} {p.connected_accounts_count === 1 ? 'Account' : 'Accounts'}
                    </p>
                    <p className="text-[10px] text-muted">Active in DB</p>
                  </div>

                  <span className={`px-2.5 py-1 rounded-xl text-xs font-bold uppercase border flex items-center gap-1.5 ${
                    p.token_health === 'HEALTHY'
                      ? 'bg-success/15 border-success/40 text-success'
                      : p.token_health === 'EXPIRING_SOON'
                      ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                      : p.token_health === 'EXPIRED'
                      ? 'bg-danger/15 border-danger/40 text-danger'
                      : 'bg-surface-secondary border-border text-muted'
                  }`}>
                    {p.token_health === 'HEALTHY' && <CheckCircle2 className="h-3.5 w-3.5" />}
                    {p.token_health === 'EXPIRING_SOON' && <AlertTriangle className="h-3.5 w-3.5" />}
                    {p.token_health === 'EXPIRED' && <XCircle className="h-3.5 w-3.5" />}
                    {p.token_health === 'NOT_CONNECTED' && <Clock className="h-3.5 w-3.5" />}
                    <span>{p.token_health.replace('_', ' ')}</span>
                  </span>
                </div>
              </div>

              {/* Details Grid */}
              <div className="grid md:grid-cols-3 gap-4 pt-4 text-xs">
                {/* 1. Environment Config */}
                <div className="space-y-1.5">
                  <p className="font-bold text-muted uppercase text-[10px] flex items-center gap-1.5">
                    <Key className="h-3 w-3 text-primary-light" />
                    <span>Required Env Variables</span>
                  </p>
                  <div className="space-y-1">
                    {p.env_keys.map(k => (
                      <div key={k} className="flex items-center justify-between text-[11px] font-mono bg-surface-secondary px-2 py-1 rounded-lg border border-border">
                        <span className="text-text">{k}</span>
                        <span className={`text-[10px] font-bold ${p.is_configured ? 'text-success' : 'text-danger'}`}>
                          {p.is_configured ? 'SET' : 'MISSING'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 2. Last Successful Publish */}
                <div className="space-y-1.5">
                  <p className="font-bold text-muted uppercase text-[10px] flex items-center gap-1.5">
                    <CheckCircle2 className="h-3 w-3 text-success" />
                    <span>Last Successful Publish</span>
                  </p>
                  {p.last_successful_publish?.timestamp ? (
                    <div className="p-2.5 rounded-xl bg-surface-secondary border border-border space-y-1">
                      <p className="text-text font-bold text-xs">
                        {new Date(p.last_successful_publish.timestamp).toLocaleString()}
                      </p>
                      {p.last_successful_publish.post_id && (
                        <p className="text-[10px] text-muted font-mono truncate">
                          Post ID: {p.last_successful_publish.post_id}
                        </p>
                      )}
                      <span className="inline-block px-1.5 py-0.5 rounded bg-success/15 text-success text-[10px] font-bold">
                        VERIFIED LIVE
                      </span>
                    </div>
                  ) : (
                    <div className="p-2.5 rounded-xl bg-surface-secondary border border-border text-muted text-[11px]">
                      No recorded publishing events yet.
                    </div>
                  )}
                </div>

                {/* 3. Last Error Log */}
                <div className="space-y-1.5">
                  <p className="font-bold text-muted uppercase text-[10px] flex items-center gap-1.5">
                    <AlertTriangle className="h-3 w-3 text-amber-400" />
                    <span>Last Recorded Issue</span>
                  </p>
                  {p.last_error?.timestamp ? (
                    <div className="p-2.5 rounded-xl bg-surface-secondary border border-border space-y-1">
                      <div className="flex items-center justify-between">
                        <p className="text-[10px] text-muted">
                          {new Date(p.last_error.timestamp).toLocaleString()}
                        </p>
                        {p.last_error.http_status && (
                          <span className="px-1.5 py-0.5 rounded bg-danger/15 text-danger font-mono text-[9px] font-bold">
                            HTTP {p.last_error.http_status}
                          </span>
                        )}
                      </div>
                      <p className="text-danger font-medium text-[11px] leading-tight line-clamp-2">
                        {p.last_error.error || 'Unknown error'}
                      </p>
                    </div>
                  ) : (
                    <div className="p-2.5 rounded-xl bg-surface-secondary border border-border text-success text-[11px] flex items-center gap-1.5">
                      <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                      <span>Zero errors recorded</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

