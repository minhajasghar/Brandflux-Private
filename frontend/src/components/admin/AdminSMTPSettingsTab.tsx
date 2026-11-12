'use client'

import React, { useState, useEffect } from 'react'
import { 
  Mail, 
  Send, 
  Save, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  ShieldCheck, 
  Server, 
  Eye, 
  EyeOff,
  ExternalLink 
} from 'lucide-react'
import { toast } from 'react-hot-toast'
import { 
  getAdminSMTPSettings, 
  updateAdminSMTPSettings, 
  testAdminSMTPEmail 
} from '@/lib/api'

export default function AdminSMTPSettingsTab({ onNavigateToEmails }: { onNavigateToEmails?: () => void }) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  const [formData, setFormData] = useState({
    provider: 'smtp',
    host: '',
    port: 587,
    user: '',
    password: '',
    from_email: '',
    from_name: '',
    use_tls: true,
    use_ssl: false,
    admin_notification_email: ''
  })

  const [testRecipient, setTestRecipient] = useState('')
  const [testResult, setTestResult] = useState<any>(null)

  useEffect(() => {
    fetchSettings()
  }, [])

  const fetchSettings = async () => {
    setLoading(true)
    try {
      const res = await getAdminSMTPSettings()
      if (res) {
        setFormData({
          provider: res.provider || 'smtp',
          host: res.host || '',
          port: res.port || 587,
          user: res.user || '',
          password: res.password || '',
          from_email: res.from_email || '',
          from_name: res.from_name || '',
          use_tls: res.use_tls !== undefined ? res.use_tls : true,
          use_ssl: Boolean(res.use_ssl),
          admin_notification_email: res.admin_notification_email || ''
        })
        if (res.admin_notification_email) {
          setTestRecipient(res.admin_notification_email)
        }
      }
    } catch (err: any) {
      toast.error('Failed to load SMTP settings')
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      const res = await updateAdminSMTPSettings(formData)
      toast.success(res.message || 'SMTP settings saved successfully!')
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to save SMTP settings')
    } finally {
      setSaving(false)
    }
  }

  const handleSendTest = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!testRecipient.trim()) {
      toast.error('Please enter a recipient email address for testing')
      return
    }

    setTesting(true)
    setTestResult(null)
    try {
      const res = await testAdminSMTPEmail(testRecipient.trim())
      setTestResult(res)
      toast.success(res.message || 'Test email dispatched successfully!')
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'SMTP test delivery failed')
      setTestResult({ error: err.response?.data?.detail || err.message })
    } finally {
      setTesting(false)
    }
  }

  if (loading) {
    return (
      <div className="p-12 text-center text-muted flex items-center justify-center gap-2">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
        <span className="text-xs">Loading SMTP settings...</span>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-black text-text">SMTP Email Server &amp; Delivery</h2>
          <p className="text-xs text-muted mt-1">
            Configure outgoing transactional email server (SMTP), test live inbox delivery, and set admin notification destination.
          </p>
        </div>

        {onNavigateToEmails && (
          <button
            type="button"
            onClick={onNavigateToEmails}
            className="px-4 py-2 rounded-xl bg-surface border border-border hover:bg-surface-hover text-xs font-bold text-text flex items-center gap-2 transition"
          >
            <Mail className="h-4 w-4 text-primary" />
            <span>View Sent Email Logs</span>
            <ExternalLink className="h-3.5 w-3.5 text-muted" />
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Main SMTP Config Form */}
        <form onSubmit={handleSave} className="lg:col-span-2 bg-surface p-6 rounded-2xl border border-border shadow-lg space-y-5">
          
          {/* Provider Selection */}
          <div>
            <label className="text-xs font-bold text-muted block mb-1.5">
              Active Email Provider
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'smtp', label: 'SMTP (Recommended)', sub: 'Custom mail server' },
                { id: 'resend', label: 'Resend API', sub: 'Cloud REST API' },
                { id: 'dev', label: 'Dev Mode (Capture)', sub: 'Log only, no sends' },
              ].map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setFormData({ ...formData, provider: p.id })}
                  className={`p-3 rounded-xl border text-left transition ${
                    formData.provider === p.id
                      ? 'bg-primary/10 border-primary text-text shadow-sm'
                      : 'bg-surface-secondary border-border text-muted hover:text-text'
                  }`}
                >
                  <div className="text-xs font-bold">{p.label}</div>
                  <div className="text-[10px] text-muted mt-0.5">{p.sub}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold text-muted block mb-1">
                SMTP Host <span className="text-rose-400">*</span>
              </label>
              <input
                type="text"
                required
                value={formData.host}
                onChange={(e) => setFormData({ ...formData, host: e.target.value })}
                placeholder="e.g. mail.tntinnov.com / smtp.gmail.com"
                className="w-full bg-surface-secondary border border-border rounded-xl px-4 py-2 text-xs font-mono text-text focus:outline-none focus:border-primary"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-muted block mb-1">
                SMTP Port <span className="text-rose-400">*</span>
              </label>
              <input
                type="number"
                required
                value={formData.port}
                onChange={(e) => setFormData({ ...formData, port: parseInt(e.target.value) || 587 })}
                placeholder="587 / 465 / 25"
                className="w-full bg-surface-secondary border border-border rounded-xl px-4 py-2 text-xs font-mono text-text focus:outline-none focus:border-primary"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-muted block mb-1">
                SMTP Username
              </label>
              <input
                type="text"
                value={formData.user}
                onChange={(e) => setFormData({ ...formData, user: e.target.value })}
                placeholder="notifications@tntinnov.com"
                className="w-full bg-surface-secondary border border-border rounded-xl px-4 py-2 text-xs text-text focus:outline-none focus:border-primary"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-muted block mb-1">
                SMTP Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  placeholder="••••••••••••"
                  className="w-full bg-surface-secondary border border-border rounded-xl pl-4 pr-10 py-2 text-xs font-mono text-text focus:outline-none focus:border-primary"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-2 text-muted hover:text-text transition"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-muted block mb-1">
                From Email Address <span className="text-rose-400">*</span>
              </label>
              <input
                type="email"
                required
                value={formData.from_email}
                onChange={(e) => setFormData({ ...formData, from_email: e.target.value })}
                placeholder="notifications@brandflux.ai"
                className="w-full bg-surface-secondary border border-border rounded-xl px-4 py-2 text-xs text-text focus:outline-none focus:border-primary"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-muted block mb-1">
                From Sender Name
              </label>
              <input
                type="text"
                value={formData.from_name}
                onChange={(e) => setFormData({ ...formData, from_name: e.target.value })}
                placeholder="Brandflux"
                className="w-full bg-surface-secondary border border-border rounded-xl px-4 py-2 text-xs text-text focus:outline-none focus:border-primary"
              />
            </div>
          </div>

          {/* Admin Notification Destination */}
          <div className="pt-2 border-t border-border">
            <label className="text-xs font-bold text-muted block mb-1">
              Admin Notification Destination Email <span className="text-rose-400">*</span>
            </label>
            <p className="text-[11px] text-muted mb-2">
              Alerts for new manual bank payment submissions and system notices are sent to this address:
            </p>
            <input
              type="email"
              required
              value={formData.admin_notification_email}
              onChange={(e) => setFormData({ ...formData, admin_notification_email: e.target.value })}
              placeholder="info@tntinnov.com"
              className="w-full bg-surface-secondary border border-border rounded-xl px-4 py-2 text-xs text-text focus:outline-none focus:border-primary"
            />
          </div>

          {/* Security & Encryption Checkboxes */}
          <div className="flex flex-wrap items-center gap-6 pt-2 text-xs">
            <label className="flex items-center gap-2 cursor-pointer text-muted hover:text-text">
              <input
                type="checkbox"
                checked={formData.use_tls}
                onChange={(e) => setFormData({ ...formData, use_tls: e.target.checked })}
                className="rounded border-border bg-surface-secondary text-primary focus:ring-primary"
              />
              <span className="font-bold">Use STARTTLS (Port 587)</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer text-muted hover:text-text">
              <input
                type="checkbox"
                checked={formData.use_ssl}
                onChange={(e) => setFormData({ ...formData, use_ssl: e.target.checked })}
                className="rounded border-border bg-surface-secondary text-primary focus:ring-primary"
              />
              <span className="font-bold">Use SSL (Port 465)</span>
            </label>
          </div>

          <div className="pt-4 border-t border-border flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2.5 rounded-xl bg-primary hover:bg-primary-hover text-white font-bold text-xs shadow-lg shadow-primary/25 flex items-center gap-2 transition"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              <span>Save SMTP Settings</span>
            </button>
          </div>
        </form>

        {/* Test Email Section */}
        <div className="space-y-4">
          <form onSubmit={handleSendTest} className="bg-surface p-6 rounded-2xl border border-border shadow-lg space-y-4">
            <div className="flex items-center gap-2 text-xs font-bold text-primary">
              <Send className="h-4 w-4" />
              <span>Test Live Outgoing SMTP</span>
            </div>

            <p className="text-xs text-muted leading-relaxed">
              Dispatch a live test email through your active SMTP server to verify credentials and inbox deliverability.
            </p>

            <div>
              <label className="text-xs font-bold text-muted block mb-1">
                Recipient Email
              </label>
              <input
                type="email"
                required
                value={testRecipient}
                onChange={(e) => setTestRecipient(e.target.value)}
                placeholder="your-email@example.com"
                className="w-full bg-surface-secondary border border-border rounded-xl px-4 py-2 text-xs text-text focus:outline-none focus:border-primary"
              />
            </div>

            <button
              type="submit"
              disabled={testing}
              className="w-full py-2.5 rounded-xl bg-surface-secondary border border-border hover:bg-surface-hover text-text font-bold text-xs flex items-center justify-center gap-2 transition"
            >
              {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4 text-primary" />}
              <span>{testing ? 'Sending Test Email...' : 'Send Test Email Now'}</span>
            </button>

            {testResult && (
              <div className={`p-3 rounded-xl border text-xs ${
                testResult.error
                  ? 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                  : 'bg-success/10 border-success/30 text-success'
              }`}>
                {testResult.error ? (
                  <div>
                    <strong className="block mb-0.5">Test Delivery Failed:</strong>
                    <span className="font-mono text-[11px]">{testResult.error}</span>
                  </div>
                ) : (
                  <div>
                    <strong className="block mb-0.5">&check; Delivery Verified!</strong>
                    <span>Check your inbox at {testRecipient}. Log recorded in Email Logs.</span>
                  </div>
                )}
              </div>
            )}
          </form>

          {/* Quick Notice Card */}
          <div className="p-4 rounded-2xl bg-primary/5 border border-primary/20 text-xs text-muted space-y-2">
            <div className="flex items-center gap-1.5 font-bold text-text">
              <ShieldCheck className="h-4 w-4 text-primary" /> Delivery Logs
            </div>
            <p className="text-[11px] leading-relaxed">
              Every verification email, welcome message, and admin payment notification sent via this SMTP server is automatically recorded with full HTML and timestamps in the <strong>Email Logs</strong> tab.
            </p>
          </div>
        </div>

      </div>
    </div>
  )
}

