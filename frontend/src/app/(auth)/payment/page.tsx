'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import BrandfluxLogo from '@/components/shared/BrandfluxLogo'
import { 
  Building2, 
  CreditCard, 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  Copy, 
  Upload, 
  FileText, 
  Download, 
  ArrowRight, 
  ShieldCheck, 
  Check, 
  Loader2, 
  HelpCircle,
  RefreshCw
} from 'lucide-react'
import { toast } from 'react-hot-toast'
import { 
  getBankDetails, 
  getAvailablePlans, 
  submitPaymentRequest, 
  getMyPaymentRequest,
  downloadReceiptPdf
} from '@/lib/api'

export default function PaymentPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [copiedField, setCopiedField] = useState<string | null>(null)

  // Dynamic Data
  const [bankDetails, setBankDetails] = useState<any>(null)
  const [plans, setPlans] = useState<any[]>([])
  const [existingPayment, setExistingPayment] = useState<any>(null)
  const [showResubmitForm, setShowResubmitForm] = useState(false)

  // Form State
  const [selectedPlanId, setSelectedPlanId] = useState('starter')
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'annual'>('monthly')
  const [senderAccountName, setSenderAccountName] = useState('')
  const [senderAccountNumber, setSenderAccountNumber] = useState('')
  const [transactionReference, setTransactionReference] = useState('')
  const [proofImageBase64, setProofImageBase64] = useState<string | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [notes, setNotes] = useState('')

  useEffect(() => {
    fetchInitialData()
  }, [])

  const fetchInitialData = async () => {
    setLoading(true)
    try {
      const [bankRes, plansRes, myPaymentRes] = await Promise.all([
        getBankDetails().catch(() => null),
        getAvailablePlans().catch(() => []),
        getMyPaymentRequest().catch(() => ({ has_payment: false, payment: null }))
      ])

      if (bankRes) setBankDetails(bankRes)
      if (plansRes && Array.isArray(plansRes) && plansRes.length > 0) {
        setPlans(plansRes)
        const firstPaid = plansRes.find(p => p.id !== 'trial' && p.id !== 'free')
        if (firstPaid) setSelectedPlanId(firstPaid.id)
      }
      if (myPaymentRes?.has_payment && myPaymentRes.payment) {
        setExistingPayment(myPaymentRes.payment)
      }
    } catch (err) {
      console.error('Error loading payment data:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleCopy = (text: string, field: string) => {
    navigator.clipboard.writeText(text)
    setCopiedField(field)
    toast.success(`${field} copied to clipboard!`)
    setTimeout(() => setCopiedField(null), 2500)
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (file.size > 10 * 1024 * 1024) {
      toast.error('File size must be under 10MB')
      return
    }

    setFileName(file.name)
    const reader = new FileReader()
    reader.onloadend = () => {
      setProofImageBase64(reader.result as string)
    }
    reader.readAsDataURL(file)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!senderAccountName.trim() || !transactionReference.trim()) {
      toast.error('Please enter Sender Account Name and Transaction Reference')
      return
    }

    setSubmitting(true)
    try {
      const res = await submitPaymentRequest({
        plan_id: selectedPlanId,
        billing_cycle: billingCycle,
        bank_name: bankDetails?.bank_name,
        sender_account_name: senderAccountName,
        sender_account_number: senderAccountNumber,
        transaction_reference: transactionReference,
        proof_image_url: proofImageBase64 || undefined,
        notes: notes.trim() || undefined
      })

      toast.success(res.message || 'Payment submitted! Awaiting administrator review.', { duration: 5000 })
      setShowResubmitForm(false)
      await fetchInitialData()
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to submit payment. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const [downloadingPdf, setDownloadingPdf] = useState(false)
  const handleDownloadReceipt = async () => {
    if (!existingPayment?.id) return
    try {
      setDownloadingPdf(true)
      await downloadReceiptPdf(existingPayment.id)
      toast.success('Official PDF receipt downloaded!')
    } catch (err) {
      toast.error('Failed to download PDF receipt. Please try again.')
    } finally {
      setDownloadingPdf(false)
    }
  }

  const currentSelectedPlan = plans.find(p => p.id === selectedPlanId) || {
    name: selectedPlanId.toUpperCase(),
    price_usd: 19,
    price_annual_usd: 190
  }

  const activePrice = billingCycle === 'annual'
    ? (currentSelectedPlan.price_annual_usd || currentSelectedPlan.price_usd * 10)
    : currentSelectedPlan.price_usd

  if (loading) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center">
        <Loader2 className="h-8 w-8 text-primary animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-bg text-text py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-8">
        
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 border-b border-border pb-6">
          <BrandfluxLogo />
          <div className="flex items-center gap-3 text-xs text-muted">
            <span className="flex items-center gap-1.5 bg-primary/10 text-primary border border-primary/20 px-3 py-1.5 rounded-full font-bold">
              <ShieldCheck className="h-4 w-4" /> Secure Bank Transfer
            </span>
          </div>
        </div>

        {/* Existing Payment Status Banner (Pending or Rejected or Approved) */}
        {existingPayment && !showResubmitForm && (
          <div className={`p-6 sm:p-8 rounded-3xl border shadow-xl ${
            existingPayment.status === 'approved'
              ? 'bg-success/10 border-success/30'
              : existingPayment.status === 'rejected'
              ? 'bg-rose-500/10 border-rose-500/30'
              : 'bg-primary/10 border-primary/30'
          }`}>
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
              <div className="flex items-start gap-4">
                <div className={`p-3 rounded-2xl ${
                  existingPayment.status === 'approved'
                    ? 'bg-success/20 text-success'
                    : existingPayment.status === 'rejected'
                    ? 'bg-rose-500/20 text-rose-400'
                    : 'bg-primary/20 text-primary'
                }`}>
                  {existingPayment.status === 'approved' ? (
                    <CheckCircle2 className="h-8 w-8" />
                  ) : existingPayment.status === 'rejected' ? (
                    <AlertCircle className="h-8 w-8" />
                  ) : (
                    <Clock className="h-8 w-8 animate-pulse" />
                  )}
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h2 className="text-xl font-black">
                      {existingPayment.status === 'approved'
                        ? 'Payment Approved! 🎉'
                        : existingPayment.status === 'rejected'
                        ? 'Payment Verification Issue'
                        : 'Payment Proof Submitted — Under Review ⏳'}
                    </h2>
                  </div>
                  <p className="text-sm text-muted">
                    {existingPayment.status === 'approved'
                      ? 'Your subscription is now fully active. You can start creating and publishing content immediately.'
                      : existingPayment.status === 'rejected'
                      ? (existingPayment.admin_notes || 'Your bank transfer receipt could not be verified. Please review notes and resubmit below.')
                      : 'Our administrative team is reviewing your manual bank transfer submission. Once verified, your workspace will be unlocked.'}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
                <button
                  type="button"
                  onClick={handleDownloadReceipt}
                  className="px-4 py-2.5 rounded-xl bg-surface border border-border hover:bg-surface-hover text-sm font-bold flex items-center gap-2 transition"
                >
                  <Download className="h-4 w-4" /> Download PDF Receipt
                </button>

                {existingPayment.status === 'approved' ? (
                  <button
                    type="button"
                    onClick={() => router.push('/dashboard')}
                    className="px-5 py-2.5 rounded-xl bg-primary hover:bg-primary-hover text-white text-sm font-bold flex items-center gap-2 shadow-lg shadow-primary/25 transition"
                  >
                    Go to Workspace <ArrowRight className="h-4 w-4" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowResubmitForm(true)}
                    className="px-4 py-2.5 rounded-xl bg-surface-secondary border border-border hover:bg-surface-hover text-sm font-bold flex items-center gap-2 transition"
                  >
                    <RefreshCw className="h-4 w-4" /> Update / Resubmit Proof
                  </button>
                )}
              </div>
            </div>

            {/* Submission Details Bar */}
            <div className="mt-6 pt-6 border-t border-white/10 grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
              <div>
                <span className="text-muted block">Selected Plan</span>
                <span className="font-bold text-text uppercase">{existingPayment.plan_id} ({existingPayment.billing_cycle})</span>
              </div>
              <div>
                <span className="text-muted block">Amount</span>
                <span className="font-bold text-text">{existingPayment.amount} {existingPayment.currency}</span>
              </div>
              <div>
                <span className="text-muted block">Transaction Ref</span>
                <span className="font-mono font-bold text-text">{existingPayment.transaction_reference}</span>
              </div>
              <div>
                <span className="text-muted block">Sender Account</span>
                <span className="font-bold text-text">{existingPayment.sender_account_name}</span>
              </div>
            </div>
          </div>
        )}

        {/* Payment Submission Form (when no payment, or re-submitting) */}
        {(!existingPayment || showResubmitForm) && (
          <div className="space-y-8">
            
            {/* Step 1: Plan Selection */}
            <div className="bg-surface p-6 sm:p-8 rounded-3xl border border-border shadow-xl space-y-6">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <span className="text-xs font-black uppercase tracking-wider text-primary">Step 1 of 3</span>
                  <h3 className="text-xl font-black mt-1">Select Subscription Plan</h3>
                </div>

                {/* Billing Cycle Toggle */}
                <div className="flex items-center bg-surface-secondary p-1 rounded-xl border border-border text-xs font-bold">
                  <button
                    type="button"
                    onClick={() => setBillingCycle('monthly')}
                    className={`px-3 py-1.5 rounded-lg transition ${
                      billingCycle === 'monthly' ? 'bg-primary text-white shadow' : 'text-muted hover:text-text'
                    }`}
                  >
                    Monthly
                  </button>
                  <button
                    type="button"
                    onClick={() => setBillingCycle('annual')}
                    className={`px-3 py-1.5 rounded-lg transition flex items-center gap-1.5 ${
                      billingCycle === 'annual' ? 'bg-primary text-white shadow' : 'text-muted hover:text-text'
                    }`}
                  >
                    Annual <span className="bg-emerald-500/20 text-emerald-400 text-[10px] px-1.5 py-0.5 rounded-full font-black">SAVE 20%</span>
                  </button>
                </div>
              </div>

              {/* Plans Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {plans.filter(p => p.id !== 'trial' && p.id !== 'free').map((p) => {
                  const isSelected = selectedPlanId === p.id
                  const price = billingCycle === 'annual' ? (p.price_annual_usd || p.price_usd * 10) : p.price_usd

                  return (
                    <div
                      key={p.id}
                      onClick={() => setSelectedPlanId(p.id)}
                      className={`p-5 rounded-2xl border cursor-pointer transition relative flex flex-col justify-between ${
                        isSelected
                          ? 'bg-primary/10 border-primary ring-2 ring-primary/30 shadow-lg'
                          : 'bg-surface-secondary border-border hover:border-primary/50'
                      }`}
                    >
                      {isSelected && (
                        <div className="absolute top-4 right-4 bg-primary text-white rounded-full p-1">
                          <Check className="h-3.5 w-3.5" />
                        </div>
                      )}
                      <div>
                        <h4 className="text-lg font-black">{p.name}</h4>
                        <div className="mt-2 flex items-baseline gap-1">
                          <span className="text-3xl font-black">${price}</span>
                          <span className="text-xs text-muted">/{billingCycle === 'annual' ? 'year' : 'month'}</span>
                        </div>
                        <p className="text-xs text-muted mt-2">
                          {p.credits} monthly post credits &bull; {p.platforms} connected platforms
                        </p>
                      </div>

                      <div className="mt-4 pt-4 border-t border-border/50 text-xs text-muted space-y-1">
                        <div>Max {p.max_posts_per_day} posts/day</div>
                        {p.x_allowed && <div className="text-emerald-400 font-bold">&check; Includes X (Twitter)</div>}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Step 2: Beneficiary Bank Details */}
            {bankDetails && (
              <div className="bg-surface p-6 sm:p-8 rounded-3xl border border-border shadow-xl space-y-6">
                <div>
                  <span className="text-xs font-black uppercase tracking-wider text-primary">Step 2 of 3</span>
                  <h3 className="text-xl font-black mt-1">Beneficiary Bank Transfer Details</h3>
                  <p className="text-xs text-muted mt-1">
                    Please transfer the exact amount of <strong className="text-text">${activePrice} USD</strong> to our official bank account:
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Bank Name */}
                  <div className="bg-surface-secondary p-4 rounded-2xl border border-border flex items-center justify-between">
                    <div>
                      <span className="text-[11px] text-muted block">Bank Name</span>
                      <span className="font-bold text-sm text-text">{bankDetails.bank_name}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleCopy(bankDetails.bank_name, 'Bank Name')}
                      className="p-2 hover:bg-white/10 rounded-lg text-muted hover:text-text transition"
                    >
                      {copiedField === 'Bank Name' ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
                    </button>
                  </div>

                  {/* Account Title */}
                  <div className="bg-surface-secondary p-4 rounded-2xl border border-border flex items-center justify-between">
                    <div>
                      <span className="text-[11px] text-muted block">Account Title</span>
                      <span className="font-bold text-sm text-text">{bankDetails.account_title}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleCopy(bankDetails.account_title, 'Account Title')}
                      className="p-2 hover:bg-white/10 rounded-lg text-muted hover:text-text transition"
                    >
                      {copiedField === 'Account Title' ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
                    </button>
                  </div>

                  {/* Account Number */}
                  <div className="bg-surface-secondary p-4 rounded-2xl border border-border flex items-center justify-between">
                    <div>
                      <span className="text-[11px] text-muted block">Account Number</span>
                      <span className="font-mono font-bold text-sm text-text">{bankDetails.account_number}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleCopy(bankDetails.account_number, 'Account Number')}
                      className="p-2 hover:bg-white/10 rounded-lg text-muted hover:text-text transition"
                    >
                      {copiedField === 'Account Number' ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
                    </button>
                  </div>

                  {/* IBAN */}
                  <div className="bg-surface-secondary p-4 rounded-2xl border border-border flex items-center justify-between">
                    <div>
                      <span className="text-[11px] text-muted block">IBAN / SWIFT</span>
                      <span className="font-mono font-bold text-sm text-text">{bankDetails.iban}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleCopy(bankDetails.iban, 'IBAN')}
                      className="p-2 hover:bg-white/10 rounded-lg text-muted hover:text-text transition"
                    >
                      {copiedField === 'IBAN' ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                {/* Instructions */}
                {bankDetails.instructions && (
                  <div className="bg-primary/5 border border-primary/20 rounded-2xl p-4 text-xs text-muted whitespace-pre-line leading-relaxed">
                    <strong className="text-text block mb-1">Transfer Instructions:</strong>
                    {bankDetails.instructions}
                  </div>
                )}
              </div>
            )}

            {/* Step 3: Submission Form */}
            <form onSubmit={handleSubmit} className="bg-surface p-6 sm:p-8 rounded-3xl border border-border shadow-xl space-y-6">
              <div>
                <span className="text-xs font-black uppercase tracking-wider text-primary">Step 3 of 3</span>
                <h3 className="text-xl font-black mt-1">Submit Proof of Transfer</h3>
                <p className="text-xs text-muted mt-1">
                  Enter your sender details and upload transfer receipt for instant admin verification:
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-muted block mb-1.5">
                    Sender Account Name <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={senderAccountName}
                    onChange={(e) => setSenderAccountName(e.target.value)}
                    placeholder="e.g. John Doe / Company Name"
                    className="w-full bg-surface-secondary border border-border rounded-xl px-4 py-2.5 text-sm text-text focus:outline-none focus:border-primary"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-muted block mb-1.5">
                    Transaction Reference / ID <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={transactionReference}
                    onChange={(e) => setTransactionReference(e.target.value)}
                    placeholder="e.g. TRX-987451234"
                    className="w-full bg-surface-secondary border border-border rounded-xl px-4 py-2.5 text-sm font-mono text-text focus:outline-none focus:border-primary"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-muted block mb-1.5">
                    Sender Account / IBAN (Optional)
                  </label>
                  <input
                    type="text"
                    value={senderAccountNumber}
                    onChange={(e) => setSenderAccountNumber(e.target.value)}
                    placeholder="e.g. 010203040506"
                    className="w-full bg-surface-secondary border border-border rounded-xl px-4 py-2.5 text-sm font-mono text-text focus:outline-none focus:border-primary"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-muted block mb-1.5">
                    Additional Notes (Optional)
                  </label>
                  <input
                    type="text"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="e.g. Transferred via online mobile banking"
                    className="w-full bg-surface-secondary border border-border rounded-xl px-4 py-2.5 text-sm text-text focus:outline-none focus:border-primary"
                  />
                </div>
              </div>

              {/* Receipt File Upload */}
              <div>
                <label className="text-xs font-bold text-muted block mb-1.5">
                  Transfer Receipt / Screenshot <span className="text-rose-400">*</span>
                </label>
                <div className="border-2 border-dashed border-border hover:border-primary/50 rounded-2xl p-6 text-center transition cursor-pointer bg-surface-secondary relative">
                  <input
                    type="file"
                    accept="image/*,application/pdf"
                    onChange={handleFileUpload}
                    className="absolute inset-0 opacity-0 cursor-pointer"
                  />
                  <div className="flex flex-col items-center justify-center gap-2">
                    <Upload className="h-8 w-8 text-muted" />
                    <span className="text-sm font-bold text-text">
                      {fileName || 'Click or drag receipt screenshot to upload'}
                    </span>
                    <span className="text-xs text-muted">Supports PNG, JPG, or PDF up to 10MB</span>
                  </div>
                </div>

                {proofImageBase64 && proofImageBase64.startsWith('data:image') && (
                  <div className="mt-3">
                    <span className="text-xs text-muted block mb-1">Receipt Preview:</span>
                    <img
                      src={proofImageBase64}
                      alt="Receipt Preview"
                      className="max-h-48 rounded-xl border border-border object-contain bg-black/40"
                    />
                  </div>
                )}
              </div>

              {/* Submit Button */}
              <div className="pt-4 flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-border">
                <span className="text-xs text-muted">
                  Total Payable: <strong className="text-text text-sm font-black">${activePrice} USD</strong>
                </span>

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full sm:w-auto px-8 py-3 rounded-xl bg-primary hover:bg-primary-hover text-white font-bold text-sm shadow-lg shadow-primary/25 flex items-center justify-center gap-2 transition disabled:opacity-50"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> Submitting Proof...
                    </>
                  ) : (
                    <>
                      Submit Payment for Approval <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        )}

      </div>
    </div>
  )
}

