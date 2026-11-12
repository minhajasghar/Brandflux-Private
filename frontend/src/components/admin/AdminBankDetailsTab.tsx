'use client'

import React, { useState, useEffect } from 'react'
import { Building2, Save, CheckCircle2, Copy, AlertCircle, Loader2, Eye } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { getAdminBankDetails, updateAdminBankDetails } from '@/lib/api'

export default function AdminBankDetailsTab() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [formData, setFormData] = useState({
    bank_name: '',
    account_title: '',
    account_number: '',
    iban: '',
    swift_code: '',
    branch_code: '',
    instructions: '',
    support_email: '',
    support_phone: ''
  })

  useEffect(() => {
    fetchBankDetails()
  }, [])

  const fetchBankDetails = async () => {
    setLoading(true)
    try {
      const res = await getAdminBankDetails()
      if (res) {
        setFormData({
          bank_name: res.bank_name || '',
          account_title: res.account_title || '',
          account_number: res.account_number || '',
          iban: res.iban || '',
          swift_code: res.swift_code || '',
          branch_code: res.branch_code || '',
          instructions: res.instructions || '',
          support_email: res.support_email || '',
          support_phone: res.support_phone || ''
        })
      }
    } catch (err: any) {
      toast.error('Failed to load bank details')
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      const res = await updateAdminBankDetails(formData)
      toast.success(res.message || 'Bank transfer details updated live!')
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to save bank details')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="p-12 text-center text-muted flex items-center justify-center gap-2">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
        <span className="text-xs">Loading bank configuration...</span>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      
      {/* Title */}
      <div>
        <h2 className="text-xl font-black text-text">Beneficiary Bank Transfer Details</h2>
        <p className="text-xs text-muted mt-1">
          Configure the bank account details shown to newly registered subscribers on the payment page.
          Changes update live immediately.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Editor Form (2 Columns) */}
        <form onSubmit={handleSave} className="lg:col-span-2 bg-surface p-6 rounded-2xl border border-border space-y-4 shadow-lg">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold text-muted block mb-1">
                Bank Name <span className="text-rose-400">*</span>
              </label>
              <input
                type="text"
                required
                value={formData.bank_name}
                onChange={(e) => setFormData({ ...formData, bank_name: e.target.value })}
                placeholder="e.g. Meezan Bank Limited"
                className="w-full bg-surface-secondary border border-border rounded-xl px-4 py-2 text-xs text-text focus:outline-none focus:border-primary"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-muted block mb-1">
                Account Title (Beneficiary) <span className="text-rose-400">*</span>
              </label>
              <input
                type="text"
                required
                value={formData.account_title}
                onChange={(e) => setFormData({ ...formData, account_title: e.target.value })}
                placeholder="e.g. TNT INNOVATIONS"
                className="w-full bg-surface-secondary border border-border rounded-xl px-4 py-2 text-xs text-text focus:outline-none focus:border-primary"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-muted block mb-1">
                Account Number <span className="text-rose-400">*</span>
              </label>
              <input
                type="text"
                required
                value={formData.account_number}
                onChange={(e) => setFormData({ ...formData, account_number: e.target.value })}
                placeholder="e.g. 0102030405060708"
                className="w-full bg-surface-secondary border border-border rounded-xl px-4 py-2 text-xs font-mono text-text focus:outline-none focus:border-primary"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-muted block mb-1">
                IBAN <span className="text-rose-400">*</span>
              </label>
              <input
                type="text"
                required
                value={formData.iban}
                onChange={(e) => setFormData({ ...formData, iban: e.target.value })}
                placeholder="e.g. PK36MEZN0001020304050607"
                className="w-full bg-surface-secondary border border-border rounded-xl px-4 py-2 text-xs font-mono text-text focus:outline-none focus:border-primary"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-muted block mb-1">
                SWIFT / BIC Code
              </label>
              <input
                type="text"
                value={formData.swift_code}
                onChange={(e) => setFormData({ ...formData, swift_code: e.target.value })}
                placeholder="e.g. MEZNPKKA"
                className="w-full bg-surface-secondary border border-border rounded-xl px-4 py-2 text-xs font-mono text-text focus:outline-none focus:border-primary"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-muted block mb-1">
                Branch Code
              </label>
              <input
                type="text"
                value={formData.branch_code}
                onChange={(e) => setFormData({ ...formData, branch_code: e.target.value })}
                placeholder="e.g. 0102"
                className="w-full bg-surface-secondary border border-border rounded-xl px-4 py-2 text-xs font-mono text-text focus:outline-none focus:border-primary"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-muted block mb-1">
                Billing Support Email
              </label>
              <input
                type="email"
                value={formData.support_email}
                onChange={(e) => setFormData({ ...formData, support_email: e.target.value })}
                placeholder="info@tntinnov.com"
                className="w-full bg-surface-secondary border border-border rounded-xl px-4 py-2 text-xs text-text focus:outline-none focus:border-primary"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-muted block mb-1">
                Support WhatsApp / Phone
              </label>
              <input
                type="text"
                value={formData.support_phone}
                onChange={(e) => setFormData({ ...formData, support_phone: e.target.value })}
                placeholder="+92 300 1234567"
                className="w-full bg-surface-secondary border border-border rounded-xl px-4 py-2 text-xs text-text focus:outline-none focus:border-primary"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-muted block mb-1">
              Transfer Instructions &amp; Guidance for Customers
            </label>
            <textarea
              rows={4}
              value={formData.instructions}
              onChange={(e) => setFormData({ ...formData, instructions: e.target.value })}
              placeholder="1. Transfer amount via mobile banking app or ATM.&#10;2. Keep transaction receipt.&#10;3. Upload below."
              className="w-full bg-surface-secondary border border-border rounded-xl p-3 text-xs text-text focus:outline-none focus:border-primary"
            />
          </div>

          <div className="pt-2 flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2.5 rounded-xl bg-primary hover:bg-primary-hover text-white font-bold text-xs shadow-lg shadow-primary/25 flex items-center gap-2 transition"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              <span>Save Bank Details</span>
            </button>
          </div>
        </form>

        {/* Live Preview Card (1 Column) */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-xs font-bold text-muted">
            <Eye className="h-4 w-4 text-primary" /> Live Customer Preview
          </div>

          <div className="bg-surface p-5 rounded-2xl border border-primary/30 shadow-xl space-y-3">
            <div className="flex items-center gap-2 text-primary font-bold text-xs pb-2 border-b border-border">
              <Building2 className="h-4 w-4" />
              <span>{formData.bank_name || 'Bank Name'}</span>
            </div>

            <div className="space-y-2 text-xs">
              <div>
                <span className="text-[10px] text-muted block">Account Title</span>
                <span className="font-bold text-text">{formData.account_title || 'Account Title'}</span>
              </div>
              <div>
                <span className="text-[10px] text-muted block">Account Number</span>
                <span className="font-mono font-bold text-text">{formData.account_number || '000000000000'}</span>
              </div>
              <div>
                <span className="text-[10px] text-muted block">IBAN</span>
                <span className="font-mono font-bold text-text">{formData.iban || 'PK00XXXX000000000000'}</span>
              </div>
              {formData.swift_code && (
                <div>
                  <span className="text-[10px] text-muted block">SWIFT Code</span>
                  <span className="font-mono font-bold text-text">{formData.swift_code}</span>
                </div>
              )}
            </div>

            {formData.instructions && (
              <div className="pt-3 border-t border-border text-[11px] text-muted leading-relaxed whitespace-pre-line">
                <strong className="text-text block mb-0.5">Instructions:</strong>
                {formData.instructions}
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  )
}

