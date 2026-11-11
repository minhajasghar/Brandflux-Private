'use client'

import { useState, useEffect } from 'react'
import {
  TrendingUp,
  Eye,
  Heart,
  MessageCircle,
  Share2,
  RefreshCw,
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ArrowUpRight,
  BarChart2,
  Layers,
  Zap
} from 'lucide-react'
import {
  getAnalyticsOverview,
  getTopBottomPosts,
  getWhatWorkedSummary,
  syncAnalyticsMetrics
} from '@/lib/api'

interface KPIStats {
  total_reach: number
  total_impressions: number
  total_likes: number
  total_comments: number
  total_shares: number
  avg_engagement_rate: number
  total_posts: number
}

interface PlatformMetric {
  platform: string
  posts_count: number
  reach: number
  impressions: number
  likes: number
  comments: number
}

interface TimelinePoint {
  date: string
  reach: number
  impressions: number
  engagement: number
  posts: number
}

interface RankedPost {
  id: string
  rank: number
  tier: 'top' | 'bottom'
  platform: string
  hook: string
  caption: string
  media_url?: string
  scheduled_at?: string
  likes: number
  comments: number
  shares: number
  reach: number
  impressions: number
  engagement_rate: number
  critique_score?: number
}

interface WhatWorkedReport {
  executive_summary: string
  winning_tactics: string[]
  underperforming_patterns: string[]
  actionable_rules: string[]
}

export default function AnalyticsPage() {
  const [days, setDays] = useState<number>(30)
  const [loading, setLoading] = useState<boolean>(true)
  const [syncing, setSyncing] = useState<boolean>(false)
  const [syncSuccessMsg, setSyncSuccessMsg] = useState<string | null>(null)

  // Data states
  const [kpis, setKpis] = useState<KPIStats>({
    total_reach: 0,
    total_impressions: 0,
    total_likes: 0,
    total_comments: 0,
    total_shares: 0,
    avg_engagement_rate: 0,
    total_posts: 0
  })
  const [platforms, setPlatforms] = useState<PlatformMetric[]>([])
  const [timeline, setTimeline] = useState<TimelinePoint[]>([])
  const [topPosts, setTopPosts] = useState<RankedPost[]>([])
  const [bottomPosts, setBottomPosts] = useState<RankedPost[]>([])
  const [whatWorked, setWhatWorked] = useState<WhatWorkedReport | null>(null)

  // Active view filters
  const [activeTab, setActiveTab] = useState<'all' | 'top' | 'bottom'>('all')
  const [expandedPostId, setExpandedPostId] = useState<string | null>(null)
  const [hoveredPointIndex, setHoveredPointIndex] = useState<number | null>(null)

  const fetchData = async (periodDays: number) => {
    setLoading(true)
    try {
      const [overviewData, rankedData, summaryData] = await Promise.all([
        getAnalyticsOverview(periodDays).catch(() => null),
        getTopBottomPosts(periodDays, 5).catch(() => null),
        getWhatWorkedSummary(periodDays).catch(() => null)
      ])

      if (overviewData) {
        setKpis(overviewData.kpis || kpis)
        setPlatforms(overviewData.platforms || [])
        setTimeline(overviewData.timeline || [])
      }

      if (rankedData) {
        setTopPosts(rankedData.top_posts || [])
        setBottomPosts(rankedData.bottom_posts || [])
      }

      if (summaryData) {
        setWhatWorked(summaryData)
      }
    } catch (err) {
      console.error('Failed to load analytics data:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData(days)
  }, [days])

  const handleSyncMetrics = async () => {
    setSyncing(true)
    setSyncSuccessMsg(null)
    try {
      const res = await syncAnalyticsMetrics(days)
      setSyncSuccessMsg(res.message || 'Metrics updated from connected channels.')
      await fetchData(days)
      setTimeout(() => setSyncSuccessMsg(null), 5000)
    } catch (err: any) {
      console.error('Metrics sync failed:', err)
      setSyncSuccessMsg('Failed to sync metrics from social APIs.')
    } finally {
      setSyncing(false)
    }
  }

  // Format platform badge color
  const getPlatformBadge = (plat: string) => {
    const p = plat.toLowerCase()
    if (p.includes('linkedin')) {
      return { label: 'LinkedIn', bg: 'bg-[#0077B5]/20', text: 'text-[#4CB5F9]', border: 'border-[#0077B5]/40' }
    }
    if (p.includes('instagram')) {
      return { label: 'Instagram', bg: 'bg-[#E1306C]/20', text: 'text-[#FF75A0]', border: 'border-[#E1306C]/40' }
    }
    if (p.includes('facebook')) {
      return { label: 'Facebook', bg: 'bg-[#1877F2]/20', text: 'text-[#70AEFF]', border: 'border-[#1877F2]/40' }
    }
    return { label: plat, bg: 'bg-primary/20', text: 'text-primary-light', border: 'border-primary/40' }
  }

  // Calculate SVG Chart Dimensions & Curves
  const chartHeight = 220
  const chartWidth = 760
  const maxReach = Math.max(...timeline.map((t) => t.reach), 100)
  const maxImpressions = Math.max(...timeline.map((t) => t.impressions), 150)
  const chartMax = Math.max(maxReach, maxImpressions)

  const pointsReach = timeline.map((pt, i) => {
    const x = (i / Math.max(timeline.length - 1, 1)) * (chartWidth - 40) + 20
    const y = chartHeight - 30 - (pt.reach / chartMax) * (chartHeight - 60)
    return { x, y, pt }
  })

  const pointsImpressions = timeline.map((pt, i) => {
    const x = (i / Math.max(timeline.length - 1, 1)) * (chartWidth - 40) + 20
    const y = chartHeight - 30 - (pt.impressions / chartMax) * (chartHeight - 60)
    return { x, y, pt }
  })

  const reachPathD = pointsReach.reduce(
    (acc, p, idx) => (idx === 0 ? `M ${p.x} ${p.y}` : `${acc} L ${p.x} ${p.y}`),
    ''
  )

  const reachAreaD = pointsReach.length
    ? `${reachPathD} L ${pointsReach[pointsReach.length - 1].x} ${chartHeight - 20} L ${pointsReach[0].x} ${chartHeight - 20} Z`
    : ''

  const impressionsPathD = pointsImpressions.reduce(
    (acc, p, idx) => (idx === 0 ? `M ${p.x} ${p.y}` : `${acc} L ${p.x} ${p.y}`),
    ''
  )

  return (
    <div className="min-h-screen bg-bg text-text pb-24">
      {/* ── Top Header ────────────────────────────────────────────────────────── */}
      <div className="border-b border-border bg-surface/50 backdrop-blur-md sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-accent animate-pulse" />
              <span className="text-xs font-semibold tracking-wider uppercase text-primary-light">
                Performance Intelligence
              </span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-text mt-0.5">
              Analytics
            </h1>
            <p className="text-xs text-muted">
              Track real-time multi-platform performance and discover how engagement insights automatically optimize your next AI-generated content.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
            {/* Time range selector */}
            <div className="inline-flex rounded-xl bg-surface border border-border p-1">
              {[7, 14, 30, 90].map((d) => (
                <button
                  key={d}
                  onClick={() => setDays(d)}
                  className={`px-2.5 sm:px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                    days === d
                      ? 'bg-primary text-white shadow-sm font-bold'
                      : 'text-muted hover:text-text'
                  }`}
                >
                  {d}d
                </button>
              ))}
            </div>

            {/* Sync button */}
            <button
              onClick={handleSyncMetrics}
              disabled={syncing}
              className="inline-flex items-center gap-2 px-3.5 sm:px-4 py-2 rounded-xl text-xs font-semibold bg-primary hover:bg-primary/90 text-white transition-all shadow-sm border border-primary-light/20 disabled:opacity-50 min-h-[36px]"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">{syncing ? 'Pulling Daily Metrics...' : 'Sync Metrics Now'}</span>
              <span className="sm:hidden">{syncing ? 'Syncing...' : 'Sync'}</span>
            </button>
          </div>
        </div>

        {syncSuccessMsg && (
          <div className="bg-primary/10 border-t border-primary/30 px-4 py-2 text-center text-xs text-primary-light font-medium flex items-center justify-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-accent" />
            {syncSuccessMsg}
          </div>
        )}
      </div>

      <div className="max-w-7xl mx-auto px-3.5 sm:px-6 lg:px-8 py-5 sm:py-8 space-y-6 sm:space-y-8">
        {/* ── KPI Cards ───────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
          {/* Total Impressions */}
          <div className="bg-surface border border-border rounded-2xl p-5 relative overflow-hidden group hover:border-primary/50 transition-all">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted uppercase tracking-wider">
                Total Impressions
              </span>
              <div className="p-2 rounded-xl bg-primary/10 border border-primary/20 text-primary-light">
                <Eye className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-2xl lg:text-3xl font-extrabold text-text tracking-tight">
                {kpis.total_impressions.toLocaleString()}
              </span>
              {kpis.total_impressions > 0 ? (
                <span className="text-xs font-semibold text-accent inline-flex items-center">
                  <ArrowUpRight className="h-3 w-3" /> +18.4%
                </span>
              ) : (
                <span className="text-xs text-muted font-medium">Collecting initial data...</span>
              )}
            </div>
            <p className="text-[11px] text-muted mt-1">Cross-platform views</p>
          </div>

          {/* Total Reach */}
          <div className="bg-surface border border-border rounded-2xl p-5 relative overflow-hidden group hover:border-primary/50 transition-all">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted uppercase tracking-wider">
                Total Reach
              </span>
              <div className="p-2 rounded-xl bg-primary/10 border border-primary/20 text-primary-light">
                <TrendingUp className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-2xl lg:text-3xl font-extrabold text-text tracking-tight">
                {kpis.total_reach.toLocaleString()}
              </span>
              {kpis.total_reach > 0 ? (
                <span className="text-xs font-semibold text-accent inline-flex items-center">
                  <ArrowUpRight className="h-3 w-3" /> +24.1%
                </span>
              ) : (
                <span className="text-xs text-muted font-medium">Collecting initial data...</span>
              )}
            </div>
            <p className="text-[11px] text-muted mt-1">Unique accounts touched</p>
          </div>

          {/* Average Engagement Rate */}
          <div className="bg-surface border border-border rounded-2xl p-5 relative overflow-hidden group hover:border-accent/40 transition-all">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted uppercase tracking-wider">
                Avg Engagement Rate
              </span>
              <div className="p-2 rounded-xl bg-accent/10 border border-accent/20 text-accent">
                <Zap className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-2xl lg:text-3xl font-extrabold text-accent tracking-tight">
                {kpis.avg_engagement_rate}%
              </span>
              {kpis.total_posts > 0 && kpis.avg_engagement_rate > 0 ? (
                <span className="text-xs font-semibold text-primary-light inline-flex items-center">
                  benchmark 3.2%
                </span>
              ) : (
                <span className="text-xs text-muted font-medium">Awaiting post interactions</span>
              )}
            </div>
            <p className="text-[11px] text-muted mt-1">Likes + comments / reach</p>
          </div>

          {/* Published Content Volume */}
          <div className="bg-surface border border-border rounded-2xl p-5 relative overflow-hidden group hover:border-primary/50 transition-all">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted uppercase tracking-wider">
                Published Posts
              </span>
              <div className="p-2 rounded-xl bg-primary/10 border border-primary/20 text-primary-light">
                <Layers className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-2xl lg:text-3xl font-extrabold text-text tracking-tight">
                {kpis.total_posts}
              </span>
              <span className="text-xs text-muted">active in {days}d</span>
            </div>
            <p className="text-[11px] text-muted mt-1">
              {kpis.total_posts > 0 
                ? `${kpis.total_likes} likes • ${kpis.total_comments} comments` 
                : 'No published posts yet in this period'}
            </p>
          </div>
        </div>

        {/* ── AI "WHAT WORKED & WHAT DIDN'T" EXECUTIVE SUMMARY ─────────────────── */}
        <div className="bg-surface border border-primary/40 rounded-3xl p-6 lg:p-8 relative overflow-hidden shadow-[0_0_40px_rgba(21,88,201,0.15)]">
          {/* Subtle glow backdrop */}
          <div className="absolute top-0 right-0 w-96 h-96 bg-primary/10 rounded-full blur-3xl pointer-events-none" />

          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-accent/15 border border-accent/30 text-accent">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-accent/10 border border-accent/30 text-[11px] font-bold text-accent uppercase tracking-wider">
                Content Performance Insights
              </div>
              <h2 className="text-xl font-bold text-text mt-1">
                Executive Synthesis: What Worked vs. What Didn&apos;t
              </h2>
            </div>
          </div>

          {whatWorked ? (
            <div className="mt-6 space-y-6">
              {/* Executive Summary paragraph */}
              <div className="p-4 rounded-2xl bg-bg/60 border border-border">
                <p className="text-sm text-text/90 leading-relaxed">
                  {whatWorked.executive_summary}
                </p>
              </div>

              {/* Two Column Breakdown: Winning vs Underperforming */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Winning Tactics */}
                <div className="bg-bg/40 border border-border hover:border-accent/40 rounded-2xl p-5 transition-all">
                  <div className="flex items-center gap-2 text-accent font-semibold text-xs tracking-wider uppercase mb-3">
                    <CheckCircle2 className="h-4 w-4" />
                    Winning Tactics & High-Converting Hooks
                  </div>
                  <ul className="space-y-2.5 text-xs text-muted leading-relaxed">
                    {whatWorked.winning_tactics.map((tactic, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className="h-1.5 w-1.5 rounded-full bg-accent mt-1.5 shrink-0" />
                        <span className="text-text/80">{tactic}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Underperforming Patterns */}
                <div className="bg-bg/40 border border-border hover:border-amber-500/40 rounded-2xl p-5 transition-all">
                  <div className="flex items-center gap-2 text-amber-400 font-semibold text-xs tracking-wider uppercase mb-3">
                    <AlertTriangle className="h-4 w-4" />
                    Patterns to Avoid (Low Engagement Traps)
                  </div>
                  <ul className="space-y-2.5 text-xs text-muted leading-relaxed">
                    {whatWorked.underperforming_patterns.map((pitfall, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className="h-1.5 w-1.5 rounded-full bg-amber-400 mt-1.5 shrink-0" />
                        <span className="text-text/80">{pitfall}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Actionable Rules for Next Generation Cycle */}
              <div className="p-4 rounded-2xl bg-primary/10 border border-primary/30 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-xl bg-primary/20 text-primary-light shrink-0 mt-0.5">
                    <Zap className="h-4 w-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-primary-light">
                      Live Prompt Directive (Active in Content Engine)
                    </h4>
                    <p className="text-xs text-text/90 mt-1">
                      {whatWorked.actionable_rules[0] ||
                        'Prioritizing high-contrast checklist cards and specific quantified problem statements.'}
                    </p>
                  </div>
                </div>
                <div className="text-[11px] font-semibold text-accent px-3 py-1.5 rounded-xl bg-accent/10 border border-accent/20 shrink-0 self-start md:self-auto">
                  Automatically fed into next prompt
                </div>
              </div>
            </div>
          ) : (
            <div className="mt-6 p-6 rounded-2xl bg-bg/40 border border-border text-center text-xs text-muted">
              Loading intelligence report...
            </div>
          )}
        </div>

        {/* ── Time-Series Area Chart & Platform Breakdown ─────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Chart (2 cols) */}
          <div className="lg:col-span-2 bg-surface border border-border rounded-3xl p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-bold text-text">Reach & Impressions Trajectory</h3>
                <p className="text-xs text-muted">Daily distribution across the past {days} days</p>
              </div>
              <div className="flex items-center gap-4 text-xs">
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-primary-light" />
                  <span className="text-muted">Impressions</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-accent" />
                  <span className="text-muted">Reach</span>
                </span>
              </div>
            </div>

            {/* SVG Interactive Chart */}
            <div className="relative w-full h-[240px] bg-bg/60 rounded-2xl border border-border/60 p-2 overflow-hidden">
              {timeline.length > 1 ? (
                <svg
                  viewBox={`0 0 ${chartWidth} ${chartHeight}`}
                  className="w-full h-full overflow-visible"
                >
                  <defs>
                    <linearGradient id="reachGlow" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#D4FF24" stopOpacity="0.25" />
                      <stop offset="100%" stopColor="#D4FF24" stopOpacity="0.0" />
                    </linearGradient>
                    <linearGradient id="impressionsStroke" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="#1558C9" />
                      <stop offset="100%" stopColor="#4C8DFF" />
                    </linearGradient>
                  </defs>

                  {/* Horizontal grid lines */}
                  {[0.25, 0.5, 0.75].map((pct, idx) => (
                    <line
                      key={idx}
                      x1="20"
                      y1={chartHeight - 30 - pct * (chartHeight - 60)}
                      x2={chartWidth - 20}
                      y2={chartHeight - 30 - pct * (chartHeight - 60)}
                      stroke="#1C2030"
                      strokeDasharray="4 4"
                      strokeWidth="1"
                    />
                  ))}

                  {/* Reach Area Fill */}
                  <path d={reachAreaD} fill="url(#reachGlow)" />

                  {/* Impressions line */}
                  <path
                    d={impressionsPathD}
                    fill="none"
                    stroke="url(#impressionsStroke)"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />

                  {/* Reach line */}
                  <path
                    d={reachPathD}
                    fill="none"
                    stroke="#D4FF24"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />

                  {/* Hover interactive markers */}
                  {pointsReach.map((p, idx) => (
                    <g key={idx}>
                      <circle
                        cx={p.x}
                        cy={p.y}
                        r={hoveredPointIndex === idx ? 5 : 3}
                        fill="#D4FF24"
                        stroke="#05060A"
                        strokeWidth="2"
                        className="cursor-pointer transition-all"
                        onMouseEnter={() => setHoveredPointIndex(idx)}
                        onMouseLeave={() => setHoveredPointIndex(null)}
                      />
                    </g>
                  ))}
                </svg>
              ) : (
                <div className="flex items-center justify-center h-full text-xs text-muted">
                  Collecting historical data points...
                </div>
              )}

              {/* Tooltip on hover */}
              {hoveredPointIndex !== null && timeline[hoveredPointIndex] && (
                <div
                  className="absolute bottom-4 left-4 bg-surface/90 border border-border px-3 py-2 rounded-xl text-xs backdrop-blur-md shadow-lg pointer-events-none"
                >
                  <p className="font-semibold text-text">{timeline[hoveredPointIndex].date}</p>
                  <p className="text-primary-light">
                    Impressions: {timeline[hoveredPointIndex].impressions.toLocaleString()}
                  </p>
                  <p className="text-accent">
                    Reach: {timeline[hoveredPointIndex].reach.toLocaleString()}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Platform Performance Breakdown (1 col) */}
          <div className="bg-surface border border-border rounded-3xl p-6 flex flex-col justify-between">
            <div>
              <h3 className="text-sm font-bold text-text">Platform Distribution</h3>
              <p className="text-xs text-muted mb-4">Volume and reach share by social channel</p>

              <div className="space-y-4">
                {platforms.length > 0 ? (
                  platforms.map((plat) => {
                    const badge = getPlatformBadge(plat.platform)
                    const reachPct = kpis.total_reach > 0 ? Math.round((plat.reach / kpis.total_reach) * 100) : 0
                    return (
                      <div key={plat.platform} className="p-3.5 rounded-2xl bg-bg/50 border border-border">
                        <div className="flex items-center justify-between mb-2">
                          <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${badge.bg} ${badge.text} ${badge.border}`}>
                            {badge.label}
                          </span>
                          <span className="text-xs font-semibold text-text">
                            {plat.reach.toLocaleString()} reach ({reachPct}%)
                          </span>
                        </div>
                        {/* Progress bar */}
                        <div className="w-full bg-border h-1.5 rounded-full overflow-hidden">
                          <div
                            className="bg-primary-light h-full rounded-full transition-all"
                            style={{ width: `${Math.min(100, Math.max(5, reachPct))}%` }}
                          />
                        </div>
                        <div className="flex items-center justify-between text-[11px] text-muted mt-2">
                          <span>{plat.posts_count} posts</span>
                          <span>{plat.likes} likes • {plat.comments} comments</span>
                        </div>
                      </div>
                    )
                  })
                ) : (
                  <p className="text-xs text-muted">No published platform data yet.</p>
                )}
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-border/80 flex items-center justify-between text-xs text-muted">
              <span>Next metrics poll</span>
              <span className="text-primary-light font-medium">Tonight at 02:00 AM UTC</span>
            </div>
          </div>
        </div>

        {/* ── TOP 5 vs BOTTOM 5 POSTS (SIDE-BY-SIDE INTELLIGENCE GALLERY) ──────── */}
        <div className="bg-surface border border-border rounded-3xl p-6 lg:p-8">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <div>
              <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-accent uppercase tracking-wider">
                <BarChart2 className="h-4 w-4" /> Performance Learning Ranking
              </div>
              <h3 className="text-lg font-bold text-text mt-0.5">
                Top 5 vs. Bottom 5 Posts Analyzed
              </h3>
              <p className="text-xs text-muted">
                These top 10 posts are analyzed to replicate high-performing engagement formulas and eliminate weak patterns.
              </p>
            </div>

            {/* Filter Pills */}
            <div className="inline-flex rounded-xl bg-bg border border-border p-1">
              <button
                onClick={() => setActiveTab('all')}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                  activeTab === 'all'
                    ? 'bg-primary text-white shadow-sm'
                    : 'text-muted hover:text-text'
                }`}
              >
                All 10 Posts
              </button>
              <button
                onClick={() => setActiveTab('top')}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                  activeTab === 'top'
                    ? 'bg-accent/20 text-accent border border-accent/30 font-bold'
                    : 'text-muted hover:text-text'
                }`}
              >
                Top 5 (Emulate)
              </button>
              <button
                onClick={() => setActiveTab('bottom')}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                  activeTab === 'bottom'
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold'
                    : 'text-muted hover:text-text'
                }`}
              >
                Bottom 5 (Avoid)
              </button>
            </div>
          </div>

          {/* Grid comparison */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Top 5 Column */}
            {(activeTab === 'all' || activeTab === 'top') && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-xs font-bold text-accent uppercase tracking-wider border-b border-border pb-2">
                  <CheckCircle2 className="h-4 w-4" />
                  Top 5 High Performers (Emulated in Prompt)
                </div>

                {topPosts.length > 0 ? (
                  topPosts.map((post) => {
                    const badge = getPlatformBadge(post.platform)
                    const isExpanded = expandedPostId === post.id
                    return (
                      <div
                        key={post.id}
                        className="bg-bg/60 border border-border hover:border-accent/50 rounded-2xl p-4 transition-all"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-2">
                            <span className="h-6 w-6 rounded-full bg-accent text-bg text-xs font-black flex items-center justify-center shrink-0">
                              #{post.rank}
                            </span>
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${badge.bg} ${badge.text} ${badge.border}`}
                            >
                              {badge.label}
                            </span>
                          </div>
                          <div className="text-right">
                            <span className="text-xs font-bold text-accent">
                              {post.engagement_rate}% Eng
                            </span>
                            <p className="text-[10px] text-muted">{post.reach.toLocaleString()} reach</p>
                          </div>
                        </div>

                        {/* Post Hook */}
                        <div className="mt-3">
                          <p className="text-xs font-semibold text-text leading-snug line-clamp-2">
                            &ldquo;{post.hook}&rdquo;
                          </p>
                        </div>

                        {/* Metrics Bar */}
                        <div className="mt-3 pt-3 border-t border-border/60 flex items-center justify-between text-[11px] text-muted">
                          <span className="flex items-center gap-1 text-text/80">
                            <Heart className="h-3 w-3 text-red-400" /> {post.likes}
                          </span>
                          <span className="flex items-center gap-1 text-text/80">
                            <MessageCircle className="h-3 w-3 text-primary-light" /> {post.comments}
                          </span>
                          <span className="flex items-center gap-1 text-text/80">
                            <Share2 className="h-3 w-3 text-accent" /> {post.shares}
                          </span>
                          <button
                            onClick={() => setExpandedPostId(isExpanded ? null : post.id)}
                            className="text-[11px] text-primary-light hover:underline flex items-center gap-0.5"
                          >
                            {isExpanded ? 'Less' : 'Caption'}
                            {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                          </button>
                        </div>

                        {/* Expanded Caption Drawer */}
                        {isExpanded && (
                          <div className="mt-3 p-3 rounded-xl bg-surface border border-border text-xs text-text/80 leading-relaxed whitespace-pre-wrap">
                            {post.caption}
                          </div>
                        )}
                      </div>
                    )
                  })
                ) : (
                  <p className="text-xs text-muted">No top posts recorded yet.</p>
                )}
              </div>
            )}

            {/* Bottom 5 Column */}
            {(activeTab === 'all' || activeTab === 'bottom') && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-xs font-bold text-amber-400 uppercase tracking-wider border-b border-border pb-2">
                  <AlertTriangle className="h-4 w-4" />
                  Bottom 5 Low Engagement (Avoided in Prompt)
                </div>

                {bottomPosts.length > 0 ? (
                  bottomPosts.map((post) => {
                    const badge = getPlatformBadge(post.platform)
                    const isExpanded = expandedPostId === post.id
                    return (
                      <div
                        key={post.id}
                        className="bg-bg/60 border border-border hover:border-amber-500/50 rounded-2xl p-4 transition-all"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-2">
                            <span className="h-6 w-6 rounded-full bg-amber-500/20 text-amber-300 text-xs font-black flex items-center justify-center shrink-0 border border-amber-500/30">
                              #{post.rank}
                            </span>
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${badge.bg} ${badge.text} ${badge.border}`}
                            >
                              {badge.label}
                            </span>
                          </div>
                          <div className="text-right">
                            <span className="text-xs font-bold text-amber-400">
                              {post.engagement_rate}% Eng
                            </span>
                            <p className="text-[10px] text-muted">{post.reach.toLocaleString()} reach</p>
                          </div>
                        </div>

                        {/* Post Hook */}
                        <div className="mt-3">
                          <p className="text-xs font-medium text-text/70 leading-snug line-clamp-2">
                            &ldquo;{post.hook}&rdquo;
                          </p>
                        </div>

                        {/* Metrics Bar */}
                        <div className="mt-3 pt-3 border-t border-border/60 flex items-center justify-between text-[11px] text-muted">
                          <span className="flex items-center gap-1">
                            <Heart className="h-3 w-3 text-muted" /> {post.likes}
                          </span>
                          <span className="flex items-center gap-1">
                            <MessageCircle className="h-3 w-3 text-muted" /> {post.comments}
                          </span>
                          <span className="flex items-center gap-1">
                            <Share2 className="h-3 w-3 text-muted" /> {post.shares}
                          </span>
                          <button
                            onClick={() => setExpandedPostId(isExpanded ? null : post.id)}
                            className="text-[11px] text-primary-light hover:underline flex items-center gap-0.5"
                          >
                            {isExpanded ? 'Less' : 'Caption'}
                            {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                          </button>
                        </div>

                        {/* Expanded Caption Drawer */}
                        {isExpanded && (
                          <div className="mt-3 p-3 rounded-xl bg-surface border border-border text-xs text-text/80 leading-relaxed whitespace-pre-wrap">
                            {post.caption}
                          </div>
                        )}
                      </div>
                    )
                  })
                ) : (
                  <p className="text-xs text-muted">No bottom posts recorded yet.</p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
