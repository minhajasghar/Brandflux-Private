'use client'

import React, { useState, useEffect } from 'react'
import { 
  CreditCard, 
  Search, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  Eye, 
  Download, 
  AlertCircle, 
  Loader2, 
  RefreshCw,
  ExternalLink,
  FileText,
  X
} from 'lucide-react'
import { toast } from 'react-hot-toast'
import { 
  getAdminPaymentRequests, 
  adminApprovePayment, 
  adminRejectPayment,
  downloadReceiptPdf
} from '@/lib/api'

export default function AdminPaymentApprovalsTab() {
  const [loading, setLoading] = useState(true)
  const [payments, setPayments] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [statusFilter, setStatusFilter] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')

  // View Proof Modal
  const [viewingProof, setViewingProof] = useState<any | null>(null)

  // Approve / Reject Modals
  const [actionModal, setActionModal] = useState<{
    type: 'approve' | 'reject'
    payment: any
  } | null>(null)
  const [actionReason, setActionReason] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    fetchPayments()
  }, [statusFilter])

  const fetchPayments = async () => {
    setLoading(true)
    try {
      const res = await getAdminPaymentRequests(statusFilter, searchQuery)
      setPayments(res.items || [])
      setTotal(res.total || 0)
    } catch (err: any) {
      toast.error('Failed to load payment requests')
    } finally {
      setLoading(false)
    }
  }

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    fetchPayments()
  }

  const handleApprove = async () => {
    if (!actionModal?.payment?.id) return
    setIsSubmitting(true)
    try {
      const res = await adminApprovePayment(actionModal.payment.id, actionReason)
      toast.success(res.message || 'Payment approved and account activated!')
      setActionModal(null)
      setActionReason('')
      fetchPayments()
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Approval failed')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleReject = async () => {
    if (!actionModal?.payment?.id) return
    if (!actionReason.trim()) {
      toast.error('Please specify a rejection reason for the user.')
      return
    }
    setIsSubmitting(true)
    try {
      const res = await adminRejectPayment(actionModal.payment.id, actionReason)
      toast.success(res.message || 'Payment rejected.')
      setActionModal(null)
      setActionReason('')
      fetchPayments()
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Rejection failed')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDownloadReceipt = async (id: string) => {
    try {
      toast.loading('Generating receipt...', { id: 'pdf-toast' })
      await downloadReceiptPdf(id)
      toast.success('Official PDF receipt downloaded!', { id: 'pdf-toast' })
    } catch (err) {
      toast.error('Failed to download PDF receipt.', { id: 'pdf-toast' })
    }
  }

  const pendingCount = payments.filter(p => p.status === 'pending').length

  return (
    <div className="space-y-6">
      
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-black text-text">Manual Payment Approvals</h2>
            {pendingCount > 0 && (
              <span className="bg-amber-500/20 text-amber-400 border border-amber-500/30 text-xs px-2.5 py-0.5 rounded-full font-black animate-pulse">
                {pendingCount} Pending
              </span>
            )}
          </div>
          <p className="text-xs text-muted mt-1">
            Review manual bank transfer receipts, verify transaction IDs, and activate user subscriptions.
          </p>
        </div>

        <button
          onClick={fetchPayments}
          disabled={loading}
          className="p-2.5 rounded-xl bg-surface border border-border hover:bg-surface-hover text-muted hover:text-text transition"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Filter & Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-surface p-4 rounded-2xl border border-border">
        {/* Status Filters */}
        <div className="flex items-center gap-1.5 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
          {[
            { id: 'all', label: 'All Requests' },
            { id: 'pending', label: 'Pending Review' },
            { id: 'approved', label: 'Approved' },
            { id: 'rejected', label: 'Rejected' },
          ].map(f => (
            <button
              key={f.id}
              onClick={() => setStatusFilter(f.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition whitespace-nowrap ${
                statusFilter === f.id
                  ? 'bg-primary text-white shadow-sm'
                  : 'text-muted hover:text-text hover:bg-surface-secondary'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Search */}
        <form onSubmit={handleSearchSubmit} className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search email, name, TxID..."
            className="w-full bg-surface-secondary border border-border rounded-xl pl-9 pr-4 py-2 text-xs text-text focus:outline-none focus:border-primary"
          />
        </form>
      </div>

      {/* Payments Table */}
      <div className="bg-surface rounded-2xl border border-border overflow-hidden shadow-lg">
        {loading ? (
          <div className="p-12 text-center text-muted flex items-center justify-center gap-2">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <span className="text-xs">Loading payment submissions...</span>
          </div>
        ) : payments.length === 0 ? (
          <div className="p-12 text-center text-muted">
            <CreditCard className="h-8 w-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm font-bold">No payment requests found</p>
            <p className="text-xs text-muted mt-1">Users who submit manual bank transfer receipts will appear here.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-surface-secondary text-muted font-bold uppercase tracking-wider border-b border-border">
                <tr>
                  <th className="py-3 px-4">User</th>
                  <th className="py-3 px-4">Plan &amp; Amount</th>
                  <th className="py-3 px-4">Transaction Details</th>
                  <th className="py-3 px-4">Receipt Proof</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {payments.map((p) => {
                  return (
                    <tr key={p.id} className="hover:bg-surface-secondary/40 transition">
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-text">{p.user_name || 'Subscriber'}</div>
                        <div className="text-muted text-[11px] font-mono">{p.user_email}</div>
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="font-black text-text uppercase">{p.plan_id}</div>
                        <div className="text-primary font-bold">
                          ${p.amount} {p.currency} <span className="text-muted font-normal">({p.billing_cycle})</span>
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="font-mono text-text font-bold">{p.transaction_reference || 'N/A'}</div>
                        <div className="text-muted text-[11px]">
                          From: {p.sender_account_name} {p.sender_account_number ? `(${p.sender_account_number})` : ''}
                        </div>
                        {p.notes && <div className="text-muted text-[10px] italic mt-0.5">Note: "{p.notes}"</div>}
                      </td>

                      <td className="py-3.5 px-4">
                        {p.proof_image_url ? (
                          <button
                            type="button"
                            onClick={() => setViewingProof(p)}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-surface-secondary border border-border hover:bg-surface-hover text-text font-bold text-[11px] transition"
                          >
                            <Eye className="h-3.5 w-3.5 text-primary" /> View Proof
                          </button>
                        ) : (
                          <span className="text-muted text-[11px]">No file attached</span>
                        )}
                      </td>

                      <td className="py-3.5 px-4">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
                          p.status === 'approved'
                            ? 'bg-success/15 text-success border border-success/30'
                            : p.status === 'rejected'
                            ? 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                            : 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                        }`}>
                          {p.status === 'approved' && <CheckCircle2 className="h-3 w-3" />}
                          {p.status === 'rejected' && <XCircle className="h-3 w-3" />}
                          {p.status === 'pending' && <Clock className="h-3 w-3 animate-spin" />}
                          <span>{p.status}</span>
                        </span>
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            title="Download PDF Receipt"
                            onClick={() => handleDownloadReceipt(p.id)}
                            className="p-1.5 rounded-lg bg-surface-secondary hover:bg-surface-hover text-muted hover:text-text transition"
                          >
                            <Download className="h-4 w-4" />
                          </button>

                          {p.status === 'pending' && (
                            <>
                              <button
                                type="button"
                                onClick={() => setActionModal({ type: 'approve', payment: p })}
                                className="px-3 py-1.5 rounded-lg bg-success/20 text-success hover:bg-success hover:text-black font-bold text-xs transition"
                              >
                                Approve
                              </button>
                              <button
                                type="button"
                                onClick={() => setActionModal({ type: 'reject', payment: p })}
                                className="px-3 py-1.5 rounded-lg bg-rose-500/20 text-rose-400 hover:bg-rose-500 hover:text-white font-bold text-xs transition"
                              >
                                Reject
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Proof Preview Modal */}
      {viewingProof && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-surface max-w-2xl w-full rounded-3xl border border-border shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 border-b border-border flex items-center justify-between bg-surface-secondary">
              <div>
                <h3 className="font-bold text-sm text-text">Payment Proof Receipt</h3>
                <span className="text-xs text-muted">{viewingProof.user_email} &bull; Ref: {viewingProof.transaction_reference}</span>
              </div>
              <button
                onClick={() => setViewingProof(null)}
                className="p-1.5 rounded-xl hover:bg-white/10 text-muted hover:text-text transition"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex-1 flex items-center justify-center bg-black/40">
              {viewingProof.proof_image_url?.startsWith('data:application/pdf') ? (
                <div className="text-center p-8">
                  <FileText className="h-16 w-16 text-primary mx-auto mb-3" />
                  <p className="text-sm font-bold text-text mb-4">PDF Document Uploaded</p>
                  <a
                    href={viewingProof.proof_image_url}
                    download="payment_proof.pdf"
                    className="px-4 py-2 rounded-xl bg-primary text-white font-bold text-xs inline-flex items-center gap-2"
                  >
                    <Download className="h-4 w-4" /> Download PDF Proof
                  </a>
                </div>
              ) : (
                <img
                  src={viewingProof.proof_image_url}
                  alt="Transfer Receipt Proof"
                  className="max-h-[70vh] rounded-xl border border-border object-contain shadow-lg"
                />
              )}
            </div>

            <div className="p-4 border-t border-border bg-surface-secondary flex items-center justify-between text-xs">
              <span className="text-muted">
                Amount: <strong className="text-text">${viewingProof.amount} {viewingProof.currency}</strong>
              </span>
              <button
                onClick={() => setViewingProof(null)}
                className="px-4 py-1.5 rounded-xl bg-surface border border-border text-text font-bold hover:bg-surface-hover"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Action Confirmation Modal (Approve / Reject) */}
      {actionModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-surface max-w-md w-full rounded-3xl border border-border p-6 shadow-2xl space-y-4">
            <h3 className="text-lg font-black text-text">
              {actionModal.type === 'approve' ? 'Approve Payment & Activate Plan' : 'Reject Payment Request'}
            </h3>
            <p className="text-xs text-muted">
              {actionModal.type === 'approve'
                ? `You are about to approve the payment of $${actionModal.payment.amount} for ${actionModal.payment.user_email}. Their account will be unlocked with the ${actionModal.payment.plan_id.toUpperCase()} plan.`
                : `You are about to reject the payment for ${actionModal.payment.user_email}. Please provide a clear reason that will be emailed to the user.`}
            </p>

            <div>
              <label className="text-xs font-bold text-muted block mb-1">
                {actionModal.type === 'approve' ? 'Admin Internal Notes (Optional)' : 'Rejection Reason (Emailed to user) *'}
              </label>
              <textarea
                rows={3}
                required={actionModal.type === 'reject'}
                value={actionReason}
                onChange={(e) => setActionReason(e.target.value)}
                placeholder={
                  actionModal.type === 'approve'
                    ? 'Enter internal approval notes (optional)'
                    : 'Enter clear rejection reason for the user'
                }
                className="w-full bg-surface-secondary border border-border rounded-xl p-3 text-xs text-text focus:outline-none focus:border-primary"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => { setActionModal(null); setActionReason('') }}
                className="px-4 py-2 rounded-xl bg-surface-secondary text-muted hover:text-text text-xs font-bold transition"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={actionModal.type === 'approve' ? handleApprove : handleReject}
                className={`px-5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition ${
                  actionModal.type === 'approve'
                    ? 'bg-success text-black hover:bg-success/90 font-black'
                    : 'bg-rose-500 text-white hover:bg-rose-600'
                }`}
              >
                {isSubmitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                <span>{actionModal.type === 'approve' ? 'Confirm Approval' : 'Confirm Rejection'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}

