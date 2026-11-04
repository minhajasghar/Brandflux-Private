'use client'

import { useState, useEffect } from 'react'
import { 
  Mail, 
  Search, 
  RefreshCw, 
  ExternalLink, 
  Smartphone, 
  Monitor, 
  X, 
  Check, 
  Copy, 
  AlertCircle,
  Clock,
  Send,
  Code
} from 'lucide-react'
import { getAdminCapturedEmails, getAdminCapturedEmailDetail } from '@/lib/api'
import { toast } from 'react-hot-toast'
import { motion, AnimatePresence } from 'framer-motion'

interface EmailLogItem {
  id: string
  recipient: string
  subject: string
  template: string
  status: string
  provider: string
  user_id: string | null
  created_at: string
  links_count: number
}

interface EmailDetail {
  id: string
  recipient: string
  subject: string
  template: string
  status: string
  provider: string
  user_id: string | null
  full_html: string
  plain_text: string | null
  links: Array<{ url: string; text: string }>
  metadata: any
  idempotency_key: string | null
  created_at: string
}

export default function AdminEmailsTab() {
  const [emails, setEmails] = useState<EmailLogItem[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const [recipientFilter, setRecipientFilter] = useState('')
  const [templateFilter, setTemplateFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')

  // Selected Email Modal
  const [selectedEmailId, setSelectedEmailId] = useState<string | null>(null)
  const [emailDetail, setEmailDetail] = useState<EmailDetail | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [viewMode, setViewMode] = useState<'desktop' | 'mobile'>('desktop')
  const [activeSubTab, setActiveSubTab] = useState<'html' | 'text' | 'links'>('html')
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null)

  const fetchEmails = async () => {
    setLoading(true)
    try {
      const data = await getAdminCapturedEmails({
        recipient: recipientFilter || undefined,
        template: templateFilter !== 'all' ? templateFilter : undefined,
        status: statusFilter !== 'all' ? statusFilter : undefined,
        limit: 50,
        offset: 0
      })
      setEmails(data.items || [])
      setTotalCount(data.total || 0)
    } catch (err: any) {
      toast.error('Failed to load email outbox')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchEmails()
  }, [templateFilter, statusFilter])

  const handleOpenEmail = async (id: string) => {
    setSelectedEmailId(id)
    setLoadingDetail(true)
    setEmailDetail(null)
    setActiveSubTab('html')
    setViewMode('desktop')
    try {
      const detail = await getAdminCapturedEmailDetail(id)
      setEmailDetail(detail)
    } catch (err) {
      toast.error('Failed to load email content')
    } finally {
      setLoadingDetail(false)
    }
  }

  const handleCopyLink = (url: string) => {
    navigator.clipboard.writeText(url)
    setCopiedUrl(url)
    toast.success('Link copied to clipboard!')
    setTimeout(() => setCopiedUrl(null), 2000)
  }

  const getTemplateBadgeColor = (tmpl: string) => {
    switch (tmpl) {
      case 'verify_email':
        return 'bg-blue-500/15 text-blue-400 border-blue-500/30'
      case 'welcome':
        return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
      case 'autopilot_checkin':
        return 'bg-purple-500/15 text-purple-400 border-purple-500/30'
      case 'autopilot_post_ready':
        return 'bg-amber-500/15 text-amber-400 border-amber-500/30'
      case 'autopilot_result':
        return 'bg-teal-500/15 text-teal-400 border-teal-500/30'
      case 'reconnect_needed':
        return 'bg-red-500/15 text-red-400 border-red-500/30'
      default:
        return 'bg-surface-secondary text-muted border-border'
    }
  }

  return (
    <div className="space-y-6">
      {/* ─── DEV MODE NOTICE BANNER ─── */}
      <div className="p-4 rounded-2xl bg-gradient-to-r from-blue-900/30 via-primary/10 to-transparent border border-blue-500/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-blue-500/20 text-blue-400 border border-blue-500/30 shrink-0">
            <Mail className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-text flex items-center gap-2">
              <span>Dev mode: emails are captured, not sent.</span>
              <span className="px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 font-extrabold text-[10px] uppercase">
                Active Provider: Dev Outbox
              </span>
            </h3>
            <p className="text-xs text-muted mt-0.5">
              All verification links, welcome emails, and Autopilot check-in questions are captured safely in the table below. You can preview full HTML or click action links.
            </p>
          </div>
        </div>

        <button
          onClick={fetchEmails}
          disabled={loading}
          className="px-3.5 py-2 rounded-xl bg-surface border border-border text-text hover:bg-surface-secondary text-xs font-bold transition flex items-center gap-2 shrink-0 self-end sm:self-auto"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin text-accent' : ''}`} />
          <span>Refresh Outbox</span>
        </button>
      </div>

      {/* ─── FILTERS BAR ─── */}
      <div className="p-4 rounded-2xl bg-surface border border-border flex flex-col sm:flex-row items-center justify-between gap-3 shadow-sm">
        <div className="relative flex-1 w-full sm:w-auto">
          <Search className="h-4 w-4 text-muted absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Filter by recipient email..."
            value={recipientFilter}
            onChange={(e) => setRecipientFilter(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && fetchEmails()}
            className="w-full pl-10 pr-4 py-2 bg-surface-secondary border border-border rounded-xl text-xs text-text focus:outline-none focus:border-primary"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <select
            value={templateFilter}
            onChange={(e) => setTemplateFilter(e.target.value)}
            className="px-3 py-2 bg-surface-secondary border border-border rounded-xl text-xs font-bold text-text focus:outline-none"
          >
            <option value="all">All Templates</option>
            <option value="verify_email">verify_email</option>
            <option value="welcome">welcome</option>
            <option value="autopilot_checkin">autopilot_checkin</option>
            <option value="autopilot_post_ready">autopilot_post_ready</option>
            <option value="autopilot_result">autopilot_result</option>
            <option value="autopilot_missed_run">autopilot_missed_run</option>
            <option value="password_reset">password_reset</option>
            <option value="reconnect_needed">reconnect_needed</option>
            <option value="admin_alert">admin_alert</option>
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 bg-surface-secondary border border-border rounded-xl text-xs font-bold text-text focus:outline-none"
          >
            <option value="all">All Statuses</option>
            <option value="captured (dev)">captured (dev)</option>
            <option value="sent">sent</option>
            <option value="failed">failed</option>
          </select>
        </div>
      </div>

      {/* ─── EMAILS LIST / TABLE ─── */}
      <div className="rounded-2xl bg-surface border border-border overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-surface-secondary/70 border-b border-border text-[11px] font-extrabold uppercase text-muted tracking-wider">
              <tr>
                <th className="py-3.5 px-4">Recipient</th>
                <th className="py-3.5 px-4">Subject</th>
                <th className="py-3.5 px-4">Template</th>
                <th className="py-3.5 px-4">Status</th>
                <th className="py-3.5 px-4">Captured At</th>
                <th className="py-3.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60 text-text">
              {loading && emails.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-muted">
                    <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2 text-accent" />
                    <span>Loading captured emails...</span>
                  </td>
                </tr>
              ) : emails.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-muted">
                    <Mail className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    <p className="font-semibold text-text">No captured emails found</p>
                    <p className="text-xs text-muted mt-0.5">
                      Emails generated by signup, verification, or Autopilot will appear here.
                    </p>
                  </td>
                </tr>
              ) : (
                emails.map((item) => (
                  <tr key={item.id} className="hover:bg-surface-secondary/40 transition">
                    <td className="py-3 px-4 font-semibold text-text">
                      {item.recipient}
                    </td>
                    <td className="py-3 px-4 max-w-[280px] truncate text-text font-medium" title={item.subject}>
                      {item.subject}
                    </td>
                    <td className="py-3 px-4">
                      <span className={`px-2 py-0.5 rounded-full border text-[10px] font-mono font-bold ${getTemplateBadgeColor(item.template)}`}>
                        {item.template}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-blue-500/15 text-blue-400 border border-blue-500/30 text-[10px] font-bold">
                        <span className="h-1.5 w-1.5 rounded-full bg-blue-400 animate-pulse" />
                        <span>{item.status}</span>
                      </span>
                    </td>
                    <td className="py-3 px-4 text-muted font-mono text-[11px] whitespace-nowrap">
                      {item.created_at ? new Date(item.created_at).toLocaleString() : ''}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => handleOpenEmail(item.id)}
                        className="px-3 py-1 rounded-lg bg-primary hover:bg-primary-hover text-white text-[11px] font-bold transition shadow-xs"
                      >
                        Open
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ─── EMAIL VIEWER MODAL ─── */}
      <AnimatePresence>
        {selectedEmailId && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ duration: 0.2 }}
              className="bg-surface border border-border rounded-3xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden"
            >
              {/* Modal Top Header */}
              <div className="p-4 sm:p-5 border-b border-border bg-surface-secondary/60 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-400 border border-blue-500/30 text-[10px] font-mono font-bold">
                      {emailDetail?.template || 'Email Preview'}
                    </span>
                    <span className="text-xs text-muted font-mono">
                      {emailDetail?.status || 'captured (dev)'}
                    </span>
                  </div>
                  <h3 className="text-base font-bold text-text mt-1 truncate max-w-xl">
                    {emailDetail?.subject || 'Loading email...'}
                  </h3>
                </div>

                <div className="flex items-center gap-2">
                  {/* Desktop / Mobile Toggle */}
                  <div className="flex items-center bg-surface border border-border rounded-xl p-1 text-xs">
                    <button
                      onClick={() => setViewMode('desktop')}
                      className={`px-2.5 py-1 rounded-lg font-bold flex items-center gap-1.5 transition ${
                        viewMode === 'desktop'
                          ? 'bg-primary text-white shadow-xs'
                          : 'text-muted hover:text-text'
                      }`}
                    >
                      <Monitor className="h-3.5 w-3.5" />
                      <span>Desktop (600px)</span>
                    </button>
                    <button
                      onClick={() => setViewMode('mobile')}
                      className={`px-2.5 py-1 rounded-lg font-bold flex items-center gap-1.5 transition ${
                        viewMode === 'mobile'
                          ? 'bg-primary text-white shadow-xs'
                          : 'text-muted hover:text-text'
                      }`}
                    >
                      <Smartphone className="h-3.5 w-3.5" />
                      <span>Mobile (375px)</span>
                    </button>
                  </div>

                  <button
                    onClick={() => setSelectedEmailId(null)}
                    className="p-1.5 rounded-xl text-muted hover:text-text hover:bg-surface-secondary transition"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </div>

              {/* Sub-Tabs: Rendered HTML | Plain Text | Clickable Links */}
              <div className="px-5 py-2.5 border-b border-border bg-bg/40 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setActiveSubTab('html')}
                    className={`px-3 py-1.5 rounded-xl font-bold transition ${
                      activeSubTab === 'html'
                        ? 'bg-surface text-text border border-border shadow-xs'
                        : 'text-muted hover:text-text'
                    }`}
                  >
                    Rendered Email
                  </button>
                  <button
                    onClick={() => setActiveSubTab('links')}
                    className={`px-3 py-1.5 rounded-xl font-bold transition flex items-center gap-1.5 ${
                      activeSubTab === 'links'
                        ? 'bg-surface text-text border border-border shadow-xs'
                        : 'text-muted hover:text-text'
                    }`}
                  >
                    <span>Clickable Links</span>
                    <span className="px-1.5 py-0.2 rounded-full bg-surface-secondary text-accent text-[10px] font-bold">
                      {emailDetail?.links?.length || 0}
                    </span>
                  </button>
                  <button
                    onClick={() => setActiveSubTab('text')}
                    className={`px-3 py-1.5 rounded-xl font-bold transition ${
                      activeSubTab === 'text'
                        ? 'bg-surface text-text border border-border shadow-xs'
                        : 'text-muted hover:text-text'
                    }`}
                  >
                    Plain Text
                  </button>
                </div>

                <div className="text-[11px] text-muted truncate max-w-xs">
                  To: <span className="text-text font-semibold">{emailDetail?.recipient}</span>
                </div>
              </div>

              {/* Modal Body */}
              <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-bg flex justify-center">
                {loadingDetail ? (
                  <div className="py-20 text-center text-muted">
                    <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2 text-accent" />
                    <span>Loading rendered template...</span>
                  </div>
                ) : activeSubTab === 'html' ? (
                  <div
                    className={`transition-all duration-200 border border-border/80 rounded-2xl shadow-xl overflow-hidden bg-bg ${
                      viewMode === 'mobile' ? 'w-[375px]' : 'w-[640px]'
                    }`}
                  >
                    <iframe
                      title="Rendered Email Preview"
                      srcDoc={emailDetail?.full_html || ''}
                      className="w-full h-[580px] bg-transparent border-0"
                      sandbox="allow-popups allow-popups-to-escape-sandbox allow-same-origin allow-scripts"
                    />
                  </div>
                ) : activeSubTab === 'links' ? (
                  <div className="w-full max-w-2xl space-y-3">
                    <p className="text-xs text-muted mb-2">
                      All action links extracted from this captured email. In dev mode, click any link to test the flow locally:
                    </p>
                    {(!emailDetail?.links || emailDetail.links.length === 0) ? (
                      <div className="p-8 text-center text-muted border border-border rounded-xl">
                        No links found in this email.
                      </div>
                    ) : (
                      emailDetail.links.map((link, idx) => (
                        <div
                          key={idx}
                          className="p-3.5 rounded-xl bg-surface border border-border flex items-center justify-between gap-3 shadow-xs"
                        >
                          <div className="min-w-0 flex-1">
                            <span className="text-xs font-bold text-text block">
                              {link.text || 'Action Link'}
                            </span>
                            <span className="text-[11px] font-mono text-muted truncate block mt-0.5" title={link.url}>
                              {link.url}
                            </span>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              onClick={() => handleCopyLink(link.url)}
                              className="p-2 rounded-lg bg-surface-secondary border border-border text-muted hover:text-text transition"
                              title="Copy URL"
                            >
                              {copiedUrl === link.url ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
                            </button>
                            <a
                              href={link.url}
                              target="_blank"
                              rel="noreferrer"
                              className="px-3 py-1.5 rounded-lg bg-primary hover:bg-primary-hover text-white text-xs font-bold transition flex items-center gap-1.5"
                            >
                              <span>Open</span>
                              <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                ) : (
                  <div className="w-full max-w-2xl">
                    <pre className="p-4 rounded-xl bg-surface border border-border font-mono text-xs text-text whitespace-pre-wrap leading-relaxed">
                      {emailDetail?.plain_text || 'No plain text version provided.'}
                    </pre>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}

