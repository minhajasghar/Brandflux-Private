'use client'

import { useState, useEffect } from 'react'
import {
  Users,
  UserPlus,
  Mail,
  Shield,
  CheckCircle2,
  AlertTriangle,
  Trash2,
  RefreshCw,
  Clock,
  Sparkles,
  ArrowUpRight,
  Info,
  Check,
  X
} from 'lucide-react'
import {
  getBrandTeam,
  inviteTeamApprover,
  resendApproverInvite,
  removeTeamMember,
  updateTeamSettings
} from '@/lib/api'
import toast from 'react-hot-toast'
import Link from 'next/link'

interface TeamMember {
  id: string
  user_id?: string
  email: string
  name: string
  role: 'creator' | 'approver'
  status: 'invited' | 'active' | 'removed'
  invitation_expires_at?: string
  accepted_at?: string
  created_at?: string
}

interface TeamData {
  brand_id: string
  brand_name: string
  plan: string
  plan_limit: number
  active_approvers_count: number
  require_approval: boolean
  approval_mode: string
  approval_autopilot_routing: string
  approval_deadline_hours: number
  approval_reminder_hours: number
  members: TeamMember[]
}

export default function TeamTab({ brandId }: { brandId?: string }) {
  const [loading, setLoading] = useState(true)
  const [teamData, setTeamData] = useState<TeamData | null>(null)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviting, setInviting] = useState(false)
  const [savingSettings, setSavingSettings] = useState(false)

  // Local settings state
  const [requireApproval, setRequireApproval] = useState(false)
  const [approvalMode, setApprovalMode] = useState('anyone')
  const [autopilotRouting, setAutopilotRouting] = useState('approvers')
  const [reminderHours, setReminderHours] = useState(6)
  const [deadlineHours, setDeadlineHours] = useState(24)

  const fetchTeam = async () => {
    try {
      setLoading(true)
      const targetId = brandId || 'active'
      const data = await getBrandTeam(targetId)
      setTeamData(data)
      setRequireApproval(Boolean(data.require_approval))
      setApprovalMode(data.approval_mode || 'anyone')
      setAutopilotRouting(data.approval_autopilot_routing || 'approvers')
      setReminderHours(data.approval_reminder_hours || 6)
      setDeadlineHours(data.approval_deadline_hours || 24)
    } catch (err: any) {
      console.error('Failed to load team:', err)
      toast.error(err.response?.data?.detail || 'Failed to load team data.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchTeam()
  }, [brandId])

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!inviteEmail || !teamData) return

    try {
      setInviting(true)
      await inviteTeamApprover(teamData.brand_id, inviteEmail.trim())
      toast.success(`Invitation sent to ${inviteEmail}`)
      setInviteEmail('')
      fetchTeam()
    } catch (err: any) {
      const msg = err.response?.data?.detail || 'Failed to send invitation.'
      toast.error(msg)
    } finally {
      setInviting(false)
    }
  }

  const handleResend = async (memberId: string, email: string) => {
    if (!teamData) return
    try {
      await resendApproverInvite(teamData.brand_id, memberId)
      toast.success(`Invitation resent to ${email}`)
      fetchTeam()
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to resend invite.')
    }
  }

  const handleRemove = async (memberId: string, email: string) => {
    if (!teamData) return
    if (!confirm(`Are you sure you want to remove ${email} from your team?`)) return

    try {
      await removeTeamMember(teamData.brand_id, memberId)
      toast.success('Team member removed.')
      fetchTeam()
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to remove member.')
    }
  }

  const handleSaveSettings = async () => {
    if (!teamData) return

    // Pre-check: If turning ON require approval, check active approvers
    if (requireApproval && teamData.active_approvers_count < 1) {
      toast.error('You need at least 1 active approver before enabling "Require approval". Please wait for your invited approver to accept their invite.')
      return
    }

    try {
      setSavingSettings(true)
      await updateTeamSettings(teamData.brand_id, {
        require_approval: requireApproval,
        approval_mode: approvalMode,
        approval_autopilot_routing: autopilotRouting,
        approval_reminder_hours: reminderHours,
        approval_deadline_hours: deadlineHours
      })
      toast.success('Approval settings saved successfully.')
      fetchTeam()
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to save settings.')
    } finally {
      setSavingSettings(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-16">
        <RefreshCw className="h-6 w-6 animate-spin text-accent" />
        <span className="ml-3 text-muted text-sm">Loading team settings...</span>
      </div>
    )
  }

  if (!teamData) {
    return (
      <div className="p-8 text-center text-muted">
        Failed to load team data. Please refresh the page.
      </div>
    )
  }

  const activeApproversCount = teamData.active_approvers_count
  const approversList = teamData.members.filter((m) => m.role === 'approver' && m.status !== 'removed')
  const creator = teamData.members.find((m) => m.role === 'creator')
  const isLimitReached = approversList.length >= teamData.plan_limit

  return (
    <div className="space-y-8 max-w-4xl">
      {/* ─── Header & Plan Allocation ─── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-6 rounded-2xl bg-surface border border-border">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Users className="h-5 w-5 text-accent" />
            <h2 className="text-lg font-bold text-text">Team & Approver Workflow</h2>
          </div>
          <p className="text-sm text-muted">
            Manage who can review, edit, and approve social posts before they go live on {teamData.brand_name}.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="px-3.5 py-2 rounded-xl bg-surface-secondary border border-border text-right">
            <div className="text-xs text-muted">Approver Seats</div>
            <div className="text-sm font-bold text-text">
              <span className="text-accent">{approversList.length}</span> / {teamData.plan_limit} Used
            </div>
          </div>
          {isLimitReached && (
            <Link
              href="/pricing"
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-xl bg-accent text-black hover:bg-accent/90 transition shadow-sm"
            >
              <span>Upgrade</span>
              <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          )}
        </div>
      </div>

      {/* ─── Invite Approver ─── */}
      <div className="p-6 rounded-2xl bg-surface border border-border space-y-4">
        <div className="flex items-center gap-2">
          <UserPlus className="h-4.5 w-4.5 text-accent" />
          <h3 className="text-base font-bold text-text">Invite Approver</h3>
        </div>
        <p className="text-xs text-muted">
          Invite team members or clients to review drafts. Approvers can preview platform copy, pick visual variants, and request revisions. They have no access to billing, credits, or account connections.
        </p>

        <form onSubmit={handleInvite} className="flex flex-col sm:flex-row gap-3 pt-1">
          <div className="relative flex-1">
            <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
            <input
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="colleague@company.com"
              disabled={isLimitReached || inviting}
              required
              className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-surface-secondary border border-border text-text placeholder-muted text-sm focus:outline-none focus:border-accent transition disabled:opacity-50"
            />
          </div>
          <button
            type="submit"
            disabled={isLimitReached || inviting || !inviteEmail}
            className="px-5 py-2.5 rounded-xl bg-accent text-black font-bold text-sm hover:bg-accent/90 transition disabled:opacity-50 flex items-center justify-center gap-2 shrink-0 shadow-sm"
          >
            {inviting ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin" />
                <span>Sending...</span>
              </>
            ) : (
              <>
                <UserPlus className="h-4 w-4" />
                <span>Send Invite</span>
              </>
            )}
          </button>
        </form>

        {isLimitReached && (
          <div className="flex items-center gap-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>
              You have reached the maximum approver limit ({teamData.plan_limit}) for the {teamData.plan.toUpperCase()} plan. Upgrade to Growth or Pro to invite more approvers.
            </span>
          </div>
        )}
      </div>

      {/* ─── Team Members Roster ─── */}
      <div className="p-6 rounded-2xl bg-surface border border-border space-y-4">
        <h3 className="text-base font-bold text-text">Brand Members</h3>

        <div className="divide-y divide-border/60">
          {/* Creator / Owner */}
          {creator && (
            <div className="flex items-center justify-between py-3.5">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-full bg-accent/15 border border-accent/30 flex items-center justify-center font-bold text-accent text-sm">
                  {(creator.name || creator.email)[0].toUpperCase()}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-text">{creator.name}</span>
                    <span className="px-2 py-0.5 rounded-md bg-accent/20 border border-accent/40 text-[10px] font-bold text-accent uppercase tracking-wider">
                      Creator (Owner)
                    </span>
                  </div>
                  <div className="text-xs text-muted">{creator.email}</div>
                </div>
              </div>
              <div className="text-xs text-muted font-medium">Full Workspace Access</div>
            </div>
          )}

          {/* Approvers */}
          {approversList.map((m) => {
            const isInvited = m.status === 'invited'
            return (
              <div key={m.id} className="flex flex-col sm:flex-row sm:items-center justify-between py-3.5 gap-2">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-full bg-surface-secondary border border-border flex items-center justify-center font-bold text-muted text-sm">
                    {(m.name || m.email)[0].toUpperCase()}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-text">{m.name}</span>
                      <span className="px-2 py-0.5 rounded-md bg-blue-500/15 border border-blue-500/30 text-[10px] font-bold text-blue-400 uppercase tracking-wider">
                        Approver
                      </span>
                      {isInvited ? (
                        <span className="px-2 py-0.5 rounded-md bg-amber-500/15 border border-amber-500/30 text-[10px] font-bold text-amber-400">
                          Invite Sent (Pending)
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-md bg-emerald-500/15 border border-emerald-500/30 text-[10px] font-bold text-emerald-400 flex items-center gap-1">
                          <Check className="h-3 w-3" />
                          <span>Active</span>
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted">{m.email}</div>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-auto">
                  {isInvited && (
                    <button
                      onClick={() => handleResend(m.id, m.email)}
                      className="px-3 py-1.5 rounded-lg bg-surface-secondary border border-border text-xs text-muted hover:text-text hover:bg-surface-hover transition flex items-center gap-1.5"
                    >
                      <RefreshCw className="h-3 w-3" />
                      <span>Resend</span>
                    </button>
                  )}
                  <button
                    onClick={() => handleRemove(m.id, m.email)}
                    title="Remove member"
                    className="p-1.5 rounded-lg text-muted hover:text-red-400 hover:bg-red-500/10 transition"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )
          })}

          {approversList.length === 0 && (
            <div className="py-6 text-center text-xs text-muted">
              No approvers added yet. Invite an approver above to enable collaborative sign-offs.
            </div>
          )}
        </div>
      </div>

      {/* ─── Approval Rules & Governance Settings ─── */}
      <div className="p-6 rounded-2xl bg-surface border border-border space-y-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Shield className="h-4.5 w-4.5 text-accent" />
            <h3 className="text-base font-bold text-text">Workflow & Safety Governance</h3>
          </div>
          <p className="text-xs text-muted">
            Configure how review sign-offs are enforced before publishing.
          </p>
        </div>

        {/* 1. Toggle: Require Approval */}
        <div className="flex items-start justify-between p-4 rounded-xl bg-surface-secondary/70 border border-border">
          <div className="space-y-1 pr-4">
            <div className="text-sm font-bold text-text flex items-center gap-2">
              <span>Require Approval Before Publishing</span>
              {requireApproval && (
                <span className="px-2 py-0.5 rounded text-[10px] bg-accent/20 text-accent font-bold">
                  ENFORCED
                </span>
              )}
            </div>
            <p className="text-xs text-muted leading-relaxed">
              When enabled, posts created by you or Autopilot cannot be published to social networks until approved by a designated team approver. Self-approval by the creator is blocked.
            </p>
            {activeApproversCount < 1 && (
              <p className="text-xs text-amber-400 flex items-center gap-1.5 pt-1">
                <Info className="h-3.5 w-3.5 shrink-0" />
                <span>Requires at least 1 active approver. (Currently: {activeApproversCount} active)</span>
              </p>
            )}
          </div>

          <label className="relative inline-flex items-center cursor-pointer shrink-0 mt-1">
            <input
              type="checkbox"
              checked={requireApproval}
              disabled={activeApproversCount < 1}
              onChange={(e) => {
                if (e.target.checked && activeApproversCount < 1) {
                  toast.error('You need at least 1 active approver to turn this on.')
                  return
                }
                setRequireApproval(e.target.checked)
              }}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-border peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-accent peer-checked:after:bg-black"></div>
          </label>
        </div>

        {/* 2. Approval Mode */}
        <div className="space-y-3">
          <label className="text-xs font-bold uppercase tracking-wider text-muted">
            Approval Sign-off Mode
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setApprovalMode('anyone')}
              className={`p-4 rounded-xl border text-left transition ${
                approvalMode === 'anyone'
                  ? 'bg-surface-secondary border-accent/50 ring-1 ring-accent/30'
                  : 'bg-surface-secondary/40 border-border hover:bg-surface-secondary'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-bold text-text">Any One Approver (Default)</span>
                {approvalMode === 'anyone' && <CheckCircle2 className="h-4 w-4 text-accent" />}
              </div>
              <p className="text-xs text-muted">
                The first approval from any active team approver unlocks the post for automated scheduled publishing.
              </p>
            </button>

            <button
              type="button"
              onClick={() => setApprovalMode('all')}
              className={`p-4 rounded-xl border text-left transition ${
                approvalMode === 'all'
                  ? 'bg-surface-secondary border-accent/50 ring-1 ring-accent/30'
                  : 'bg-surface-secondary/40 border-border hover:bg-surface-secondary'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-bold text-text">All Approvers Required</span>
                {approvalMode === 'all' && <CheckCircle2 className="h-4 w-4 text-accent" />}
              </div>
              <p className="text-xs text-muted">
                Every active team approver must independently review and approve the content before it can publish.
              </p>
            </button>
          </div>
        </div>

        {/* 3. Autopilot Drafts Routing */}
        <div className="space-y-3">
          <label className="text-xs font-bold uppercase tracking-wider text-muted">
            Autopilot Routing Policy
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setAutopilotRouting('approvers')}
              className={`p-4 rounded-xl border text-left transition ${
                autopilotRouting === 'approvers'
                  ? 'bg-surface-secondary border-accent/50 ring-1 ring-accent/30'
                  : 'bg-surface-secondary/40 border-border hover:bg-surface-secondary'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-bold text-text">Go to Approvers directly (Default)</span>
                {autopilotRouting === 'approvers' && <CheckCircle2 className="h-4 w-4 text-accent" />}
              </div>
              <p className="text-xs text-muted">
                Autopilot weekly plans queue directly into the approvers&apos; inbox for review and sign-off.
              </p>
            </button>

            <button
              type="button"
              onClick={() => setAutopilotRouting('creator')}
              className={`p-4 rounded-xl border text-left transition ${
                autopilotRouting === 'creator'
                  ? 'bg-surface-secondary border-accent/50 ring-1 ring-accent/30'
                  : 'bg-surface-secondary/40 border-border hover:bg-surface-secondary'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-bold text-text">Send to Creator first</span>
                {autopilotRouting === 'creator' && <CheckCircle2 className="h-4 w-4 text-accent" />}
              </div>
              <p className="text-xs text-muted">
                Autopilot posts land in your private drafts. You review first, then click &quot;Submit for Approval&quot;.
              </p>
            </button>
          </div>
        </div>

        {/* 4. Reminder & Deadline Policy */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
          <div className="p-4 rounded-xl bg-surface-secondary/40 border border-border space-y-2">
            <label className="text-xs font-bold text-text flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 text-accent" />
              <span>Reminder Notification</span>
            </label>
            <p className="text-xs text-muted">
              Hours before scheduled post to alert approvers if still pending:
            </p>
            <select
              value={reminderHours}
              onChange={(e) => setReminderHours(Number(e.target.value))}
              className="w-full px-3 py-2 rounded-lg bg-surface border border-border text-text text-sm focus:outline-none focus:border-accent"
            >
              <option value={2}>2 Hours Before</option>
              <option value={6}>6 Hours Before (Recommended)</option>
              <option value={12}>12 Hours Before</option>
              <option value={24}>24 Hours Before</option>
            </select>
          </div>

          <div className="p-4 rounded-xl bg-surface-secondary/40 border border-border space-y-2">
            <label className="text-xs font-bold text-text flex items-center gap-1.5">
              <Shield className="h-3.5 w-3.5 text-accent" />
              <span>Strict Deadline Enforcement</span>
            </label>
            <p className="text-xs text-muted leading-relaxed">
              <strong className="text-text">Safety Guarantee:</strong> If a post reaches its target time without approval, it is <strong className="text-amber-400">automatically skipped</strong>. Brandflux will <strong className="text-amber-400">never auto-publish unapproved content</strong>.
            </p>
          </div>
        </div>

        {/* Save Button */}
        <div className="flex justify-end pt-2">
          <button
            type="button"
            onClick={handleSaveSettings}
            disabled={savingSettings}
            className="px-6 py-2.5 rounded-xl bg-accent text-black font-bold text-sm hover:bg-accent/90 transition shadow-sm flex items-center gap-2 disabled:opacity-50"
          >
            {savingSettings ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin" />
                <span>Saving...</span>
              </>
            ) : (
              <>
                <Check className="h-4 w-4" />
                <span>Save Approval Settings</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
