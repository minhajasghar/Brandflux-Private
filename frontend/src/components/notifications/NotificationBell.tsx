'use client'

import { useState, useEffect, useRef } from 'react'
import { 
  Bell, 
  Check, 
  CheckCheck, 
  Sparkles, 
  AlertTriangle, 
  AlertCircle, 
  CheckCircle2, 
  ExternalLink, 
  RotateCcw, 
  Send, 
  X,
  Mail,
  Loader2,
  Calendar
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  getUnreadNotificationCount, 
  getNotifications, 
  markNotificationRead, 
  markAllNotificationsRead, 
  executeNotificationAction 
} from '@/lib/api'
import { toast } from 'react-hot-toast'
import Link from 'next/link'

interface NotificationItem {
  id: string
  title: string
  message: string
  type: string
  is_read: boolean
  read_at: string | null
  action_type: string | null
  action_payload: any
  created_at: string
}

export default function NotificationBell() {
  const [isOpen, setIsOpen] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const [notifications, setNotifications] = useState<NotificationItem[]>([])
  const [loading, setLoading] = useState(false)
  const [filterUnread, setFilterUnread] = useState(false)

  // Interactive Check-in State per notification
  const [checkinChoices, setCheckinChoices] = useState<Record<string, { choice: string; specialText: string; platforms: string[] }>>({})
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({})

  const dropdownRef = useRef<HTMLDivElement>(null)

  // Fetch count
  const fetchCount = async () => {
    try {
      const data = await getUnreadNotificationCount()
      setUnreadCount(data.unread_count || 0)
    } catch {
      // Ignore auth / network errors silently
    }
  }

  // Fetch list
  const fetchList = async (unreadOnly = filterUnread) => {
    setLoading(true)
    try {
      const data = await getNotifications(unreadOnly, 30, 0)
      setNotifications(data.items || [])
      setUnreadCount(data.unread_count || 0)
    } catch (err) {
      console.error('Failed to fetch notifications:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchCount()
    const interval = setInterval(fetchCount, 20000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (isOpen) {
      fetchList(filterUnread)
    }
  }, [isOpen, filterUnread])

  // Close dropdown on outside click
  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [])

  const handleMarkAsRead = async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation()
    try {
      await markNotificationRead(id)
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n))
      setUnreadCount(prev => Math.max(0, prev - 1))
    } catch (err) {
      console.error(err)
    }
  }

  const handleMarkAllAsRead = async () => {
    try {
      await markAllNotificationsRead()
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })))
      setUnreadCount(0)
      toast.success('All marked as read')
    } catch {
      toast.error('Failed to mark all as read')
    }
  }

  const handleCheckinSubmit = async (notifId: string) => {
    const state = checkinChoices[notifId] || { choice: 'generic', specialText: '', platforms: ['Facebook'] }
    setActionLoading(prev => ({ ...prev, [notifId]: true }))
    try {
      await executeNotificationAction(notifId, {
        action: 'checkin',
        choice: state.choice,
        special_text: state.specialText,
        selected_platforms: state.platforms
      })
      toast.success(state.choice === 'skip' ? "Today's post skipped" : "Choice saved! Autopilot is working")
      handleMarkAsRead(notifId)
      fetchList()
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to submit check-in')
    } finally {
      setActionLoading(prev => ({ ...prev, [notifId]: false }))
    }
  }

  const getIcon = (type: string) => {
    switch (type) {
      case 'autopilot_checkin':
        return <Sparkles className="h-4 w-4 text-accent" />
      case 'autopilot_post_ready':
        return <Calendar className="h-4 w-4 text-primary" />
      case 'autopilot_result':
        return <CheckCircle2 className="h-4 w-4 text-success" />
      case 'failed':
        return <AlertCircle className="h-4 w-4 text-danger" />
      case 'needs_reconnect':
        return <AlertTriangle className="h-4 w-4 text-amber-500" />
      case 'welcome':
      case 'info':
        return <Mail className="h-4 w-4 text-blue-400" />
      default:
        return <Bell className="h-4 w-4 text-muted" />
    }
  }

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 rounded-xl bg-surface border border-border hover:bg-surface-secondary text-text transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-accent/40"
        aria-label="Open notifications"
      >
        <Bell className="h-4.5 w-4.5" />
        {unreadCount > 0 && (
          <motion.span
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="absolute -top-1 -right-1 flex h-4.5 min-w-[18px] items-center justify-center rounded-full bg-danger px-1 text-[10px] font-black text-white ring-2 ring-bg shadow-sm"
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </motion.span>
        )}
      </button>

      {/* Dropdown Panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="absolute right-0 mt-2 w-[340px] sm:w-[420px] max-h-[85vh] flex flex-col rounded-2xl bg-surface border border-border shadow-2xl z-50 overflow-hidden"
          >
            {/* Header */}
            <div className="p-3.5 sm:p-4 border-b border-border flex items-center justify-between bg-surface-secondary/50">
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm text-text">Notifications</span>
                {unreadCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-danger/15 text-danger font-extrabold text-[11px]">
                    {unreadCount} unread
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {unreadCount > 0 && (
                  <button
                    onClick={handleMarkAllAsRead}
                    className="text-[11px] font-semibold text-muted hover:text-text flex items-center gap-1 transition"
                  >
                    <CheckCheck className="h-3.5 w-3.5" />
                    <span>Mark all read</span>
                  </button>
                )}
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-1 rounded-lg text-muted hover:text-text hover:bg-surface-secondary transition"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Filter Tabs */}
            <div className="px-3 py-2 border-b border-border bg-bg/40 flex items-center gap-1.5 text-xs">
              <button
                onClick={() => setFilterUnread(false)}
                className={`px-2.5 py-1 rounded-lg font-semibold transition ${
                  !filterUnread ? 'bg-surface text-text border border-border shadow-xs' : 'text-muted hover:text-text'
                }`}
              >
                All
              </button>
              <button
                onClick={() => setFilterUnread(true)}
                className={`px-2.5 py-1 rounded-lg font-semibold transition ${
                  filterUnread ? 'bg-surface text-text border border-border shadow-xs' : 'text-muted hover:text-text'
                }`}
              >
                Unread only
              </button>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto divide-y divide-border/60 max-h-[500px]">
              {loading ? (
                <div className="p-8 flex flex-col items-center justify-center text-muted gap-2">
                  <Loader2 className="h-5 w-5 animate-spin text-accent" />
                  <span className="text-xs">Loading notifications...</span>
                </div>
              ) : notifications.length === 0 ? (
                <div className="p-10 text-center text-muted">
                  <Bell className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <p className="text-xs font-semibold text-text">No notifications</p>
                  <p className="text-[11px] text-muted mt-0.5">
                    {filterUnread ? 'You have no unread notifications' : 'Your notification activity will appear here'}
                  </p>
                </div>
              ) : (
                notifications.map(notif => {
                  const checkinState = checkinChoices[notif.id] || {
                    choice: 'generic',
                    specialText: '',
                    platforms: notif.action_payload?.platforms || ['Facebook', 'LinkedIn']
                  }

                  return (
                    <div
                      key={notif.id}
                      onClick={() => !notif.is_read && handleMarkAsRead(notif.id)}
                      className={`p-3.5 sm:p-4 transition-all duration-150 cursor-pointer ${
                        !notif.is_read 
                          ? 'bg-surface-secondary/40 hover:bg-surface-secondary/70' 
                          : 'bg-transparent hover:bg-surface-secondary/20'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div className="p-2 rounded-xl bg-surface border border-border shrink-0 mt-0.5">
                          {getIcon(notif.type)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <h4 className="text-xs font-bold text-text truncate">
                              {notif.title}
                            </h4>
                            {!notif.is_read && (
                              <span className="h-2 w-2 rounded-full bg-accent shrink-0" />
                            )}
                          </div>
                          <p className="text-[12px] text-muted mt-0.5 leading-relaxed">
                            {notif.message}
                          </p>

                          {/* ─── ACTIONABLE ITEMS ─── */}

                          {/* Autopilot Check-in Action UI */}
                          {notif.action_type === 'checkin' && !notif.action_payload?.answered && (
                            <div 
                              onClick={(e) => e.stopPropagation()} 
                              className="mt-3 p-3 rounded-xl bg-surface border border-border space-y-2.5"
                            >
                              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-text">
                                <span>Choose direction:</span>
                              </div>
                              <div className="grid grid-cols-3 gap-1.5 text-xs">
                                <button
                                  type="button"
                                  onClick={() => setCheckinChoices(prev => ({
                                    ...prev,
                                    [notif.id]: { ...checkinState, choice: 'generic' }
                                  }))}
                                  className={`px-2 py-1.5 rounded-lg font-bold border transition text-[11px] ${
                                    checkinState.choice === 'generic'
                                      ? 'bg-accent text-black border-accent'
                                      : 'bg-surface-secondary text-muted border-border hover:text-text'
                                  }`}
                                >
                                  🎯 Generic
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setCheckinChoices(prev => ({
                                    ...prev,
                                    [notif.id]: { ...checkinState, choice: 'special' }
                                  }))}
                                  className={`px-2 py-1.5 rounded-lg font-bold border transition text-[11px] ${
                                    checkinState.choice === 'special'
                                      ? 'bg-accent text-black border-accent'
                                      : 'bg-surface-secondary text-muted border-border hover:text-text'
                                  }`}
                                >
                                  ✨ Special
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setCheckinChoices(prev => ({
                                    ...prev,
                                    [notif.id]: { ...checkinState, choice: 'skip' }
                                  }))}
                                  className={`px-2 py-1.5 rounded-lg font-bold border transition text-[11px] ${
                                    checkinState.choice === 'skip'
                                      ? 'bg-accent text-black border-accent'
                                      : 'bg-surface-secondary text-muted border-border hover:text-text'
                                  }`}
                                >
                                  ⏸️ Skip
                                </button>
                              </div>

                              {checkinState.choice === 'special' && (
                                <input
                                  type="text"
                                  placeholder="What's special today? (offer, event, etc.)"
                                  value={checkinState.specialText}
                                  onChange={(e) => setCheckinChoices(prev => ({
                                    ...prev,
                                    [notif.id]: { ...checkinState, specialText: e.target.value }
                                  }))}
                                  className="w-full px-2.5 py-1.5 rounded-lg bg-surface-secondary border border-border text-text text-xs focus:outline-none focus:border-accent"
                                />
                              )}

                              <div className="flex items-center justify-between pt-1">
                                <span className="text-[10px] text-muted">
                                  Platforms: {checkinState.platforms.join(', ')}
                                </span>
                                <button
                                  onClick={() => handleCheckinSubmit(notif.id)}
                                  disabled={actionLoading[notif.id]}
                                  className="px-3 py-1 rounded-lg bg-primary hover:bg-primary-hover text-white text-[11px] font-bold transition flex items-center gap-1 shadow-sm disabled:opacity-50"
                                >
                                  {actionLoading[notif.id] ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <Send className="h-3 w-3" />
                                  )}
                                  <span>Submit</span>
                                </button>
                              </div>
                            </div>
                          )}

                          {/* Autopilot Check-in Answered Badge */}
                          {notif.action_type === 'checkin' && notif.action_payload?.answered && (
                            <div className="mt-2 text-[11px] font-semibold text-success flex items-center gap-1">
                              <Check className="h-3 w-3" />
                              <span>Answered: {notif.action_payload?.user_choice}</span>
                            </div>
                          )}

                          {/* Review Button */}
                          {notif.action_type === 'review' && (
                            <div className="mt-2">
                              <Link
                                href={notif.action_payload?.review_url || '/ideas'}
                                onClick={() => setIsOpen(false)}
                                className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-primary text-white text-[11px] font-bold hover:bg-primary-hover transition"
                              >
                                <span>Review & Approve Post</span>
                                <ExternalLink className="h-3 w-3" />
                              </Link>
                            </div>
                          )}

                          {/* View Post Button */}
                          {notif.action_type === 'view_post' && notif.action_payload?.permalink && (
                            <div className="mt-2">
                              <a
                                href={notif.action_payload.permalink}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-surface border border-border text-text text-[11px] font-bold hover:bg-surface-secondary transition"
                              >
                                <span>View live post on {notif.action_payload.platform}</span>
                                <ExternalLink className="h-3 w-3" />
                              </a>
                            </div>
                          )}

                          {/* Retry Button */}
                          {notif.action_type === 'retry' && (
                            <div className="mt-2">
                              <Link
                                href={notif.action_payload?.retry_url || '/ideas'}
                                onClick={() => setIsOpen(false)}
                                className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-danger/15 text-danger border border-danger/30 text-[11px] font-bold hover:bg-danger/25 transition"
                              >
                                <RotateCcw className="h-3 w-3" />
                                <span>Retry Failed Post</span>
                              </Link>
                            </div>
                          )}

                          {/* Reconnect Button */}
                          {notif.action_type === 'reconnect' && (
                            <div className="mt-2">
                              <Link
                                href={notif.action_payload?.reconnect_url || '/settings?tab=connected'}
                                onClick={() => setIsOpen(false)}
                                className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-amber-500/15 text-amber-400 border border-amber-500/30 text-[11px] font-bold hover:bg-amber-500/25 transition"
                              >
                                <span>Reconnect Account</span>
                                <ExternalLink className="h-3 w-3" />
                              </Link>
                            </div>
                          )}

                          {/* Link Button */}
                          {notif.action_type === 'link' && notif.action_payload?.url && (
                            <div className="mt-2">
                              <Link
                                href={notif.action_payload.url}
                                onClick={() => setIsOpen(false)}
                                className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-surface border border-border text-text text-[11px] font-semibold hover:bg-surface-secondary transition"
                              >
                                <span>Open</span>
                                <ExternalLink className="h-3 w-3" />
                              </Link>
                            </div>
                          )}

                          <div className="mt-2 flex items-center justify-between text-[10px] text-muted">
                            <span>
                              {notif.created_at ? new Date(notif.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                            </span>
                            {!notif.is_read && (
                              <button
                                onClick={(e) => handleMarkAsRead(notif.id, e)}
                                className="hover:text-text hover:underline transition"
                              >
                                Mark as read
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

