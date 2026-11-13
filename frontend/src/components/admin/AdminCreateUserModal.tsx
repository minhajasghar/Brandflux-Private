'use client'

import React, { useState } from 'react'
import { X, UserPlus, Loader2, ShieldCheck, Check } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { adminCreateFreeUser } from '@/lib/api'

interface AdminCreateUserModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

export default function AdminCreateUserModal({ isOpen, onClose, onSuccess }: AdminCreateUserModalProps) {
  const [submitting, setSubmitting] = useState(false)
  const [formData, setFormData] = useState({
    full_name: '',
    email: '',
    password: '',
    website_url: '',
    business_type: '',
    plan: '',
    is_non_payment: false
  })

  if (!isOpen) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.email.trim() || !formData.password.trim() || !formData.full_name.trim()) {
      toast.error('Please fill out Name, Email, and Password')
      return
    }
    if (!formData.plan) {
      toast.error('Please select a subscription plan')
      return
    }

    setSubmitting(true)
    try {
      const res = await adminCreateFreeUser({
        full_name: formData.full_name.trim(),
        email: formData.email.trim(),
        password: formData.password.trim(),
        website_url: formData.website_url.trim() || undefined,
        business_type: formData.business_type || 'Other',
        plan: formData.plan,
        is_non_payment: formData.is_non_payment
      })

      toast.success(res.message || 'Account created!')
      onSuccess()
      onClose()
      setFormData({
        full_name: '',
        email: '',
        password: '',
        website_url: '',
        business_type: '',
        plan: '',
        is_non_payment: false
      })
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to create user')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-surface max-w-lg w-full rounded-3xl border border-border shadow-2xl overflow-hidden flex flex-col">
        
        {/* Header */}
        <div className="p-5 border-b border-border flex items-center justify-between bg-surface-secondary">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-primary/20 text-primary">
              <UserPlus className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-text">Create Free / Internal Account</h3>
              <span className="text-[11px] text-muted">Bypasses all payments, pre-verified &amp; pre-approved</span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-white/10 text-muted hover:text-text transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} autoComplete="off" className="p-6 space-y-4 text-xs">
          <div>
            <label className="font-bold text-muted block mb-1">Full Name / Brand Name *</label>
            <input
              type="text"
              required
              autoComplete="off"
              value={formData.full_name}
              onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
              placeholder="Enter full name or brand name"
              className="w-full bg-surface-secondary border border-border rounded-xl px-4 py-2.5 text-xs text-text focus:outline-none focus:border-primary"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="font-bold text-muted block mb-1">User Email *</label>
              <input
                type="email"
                required
                autoComplete="off"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="Enter email address"
                className="w-full bg-surface-secondary border border-border rounded-xl px-4 py-2.5 text-xs text-text focus:outline-none focus:border-primary"
              />
            </div>

            <div>
              <label className="font-bold text-muted block mb-1">Password *</label>
              <input
                type="password"
                required
                autoComplete="new-password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                placeholder="Enter password"
                className="w-full bg-surface-secondary border border-border rounded-xl px-4 py-2.5 text-xs text-text focus:outline-none focus:border-primary"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="font-bold text-muted block mb-1">Website URL (Optional)</label>
              <input
                type="url"
                autoComplete="off"
                value={formData.website_url}
                onChange={(e) => setFormData({ ...formData, website_url: e.target.value })}
                placeholder="https://"
                className="w-full bg-surface-secondary border border-border rounded-xl px-4 py-2.5 text-xs text-text focus:outline-none focus:border-primary"
              />
            </div>

            <div>
              <label className="font-bold text-muted block mb-1">Assigned Subscription Plan *</label>
              <select
                required
                value={formData.plan}
                onChange={(e) => setFormData({ ...formData, plan: e.target.value })}
                className="w-full bg-surface-secondary border border-border rounded-xl px-3 py-2.5 text-xs text-text focus:outline-none focus:border-primary"
              >
                <option value="">Select a plan...</option>
                <option value="pro">Pro Plan (Unlimited Features + X)</option>
                <option value="growth">Growth Plan</option>
                <option value="starter">Starter Plan</option>
                <option value="free">Basic Account</option>
              </select>
            </div>
          </div>

          {/* Non-Payment VIP Checkbox */}
          <div className="p-3.5 rounded-xl bg-primary/10 border border-primary/20 space-y-1">
            <label className="flex items-center gap-2 cursor-pointer font-bold text-text">
              <input
                type="checkbox"
                checked={formData.is_non_payment}
                onChange={(e) => setFormData({ ...formData, is_non_payment: e.target.checked })}
                className="rounded border-border text-primary focus:ring-primary"
              />
              <span>Non-Payment / VIP Account (Bypass Payment Requirement)</span>
            </label>
            <p className="text-[11px] text-muted pl-5">
              Account will be immediately pre-approved and active with zero payment required. Perfect for internal brands, founders, and team members.
            </p>
          </div>

          {/* Actions */}
          <div className="pt-2 flex items-center justify-end gap-2 border-t border-border">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-surface-secondary text-muted hover:text-text font-bold text-xs transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-6 py-2 rounded-xl bg-primary hover:bg-primary-hover text-white font-bold text-xs flex items-center gap-1.5 shadow-lg shadow-primary/25 transition disabled:opacity-50"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
              <span>Create Account</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

