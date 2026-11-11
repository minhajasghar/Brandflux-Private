'use client'

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Check, Zap, Sparkles, Shield, ArrowRight, HelpCircle, Layers, Star, Building2, Flame } from 'lucide-react'
import api from '@/lib/api'
import toast, { Toaster } from 'react-hot-toast'

export default function PricingPage() {
  const router = useRouter()
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'annual'>('monthly')
  const [plans, setPlans] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [userStatus, setUserStatus] = useState<any>(null)
  const [requestingPlan, setRequestingPlan] = useState<string | null>(null)
  const [selectedPlanModal, setSelectedPlanModal] = useState<any>(null)
  const [upgradeNote, setUpgradeNote] = useState('')
  const [submittingUpgrade, setSubmittingUpgrade] = useState(false)

  useEffect(() => {
    loadPricingData()
  }, [])

  const loadPricingData = async () => {
    try {
      setLoading(true)
      const res = await api.get('/billing/plans')
      if (Array.isArray(res.data) && res.data.length > 0) {
        setPlans(res.data)
      } else {
        // Fallback default plans
        setPlans([
          {
            id: 'trial',
            name: '14-Day Free Trial',
            price_usd: 0,
            price_annual_usd: 0,
            credits: 15,
            brands: 1,
            platforms: 2,
            max_posts_per_day: 5,
            reroll_pool: 3,
            x_allowed: false,
            features: [
              '15 Post Credits (30 visuals)',
              '1 Brand Kit & Identity',
              '2 Connected Platforms (FB / IG / LinkedIn)',
              'Standard 1K AI Image Studio',
              '3 Free Image Re-rolls total',
              'Capped at 5 generations/day',
              'Full History & Asset Download'
            ]
          },
          {
            id: 'starter',
            name: 'Starter Plan',
            price_usd: 19,
            price_annual_usd: 190,
            credits: 30,
            brands: 1,
            platforms: 3,
            max_posts_per_day: 2,
            reroll_pool: 15,
            x_allowed: false,
            features: [
              '30 Post Credits / month (60 visuals)',
              '1 Brand Kit & Voice Profile',
              '3 Connected Social Platforms',
              '15 Free Image Re-rolls / month',
              'Standard 1K High-Def Visuals',
              'Max 2 posts / day schedule',
              'Verified Social Publishing Flow'
            ]
          },
          {
            id: 'growth',
            name: 'Growth Plan',
            price_usd: 39,
            price_annual_usd: 390,
            credits: 100,
            brands: 3,
            platforms: 5,
            max_posts_per_day: 5,
            reroll_pool: 60,
            x_allowed: false,
            features: [
              '100 Post Credits / month (200 visuals)',
              '3 Distinct Brand Kits',
              '5 Connected Platforms',
              '60 Free Image Re-rolls / month',
              '2K Ultra-HD Visual Generations',
              'Performance Analytics Suite',
              'Autopilot Weekly Planner'
            ]
          },
          {
            id: 'pro',
            name: 'Pro Plan',
            price_usd: 89,
            price_annual_usd: 890,
            credits: 200,
            brands: 10,
            platforms: 6,
            max_posts_per_day: 999,
            reroll_pool: 100,
            x_allowed: true,
            features: [
              '200 Post Credits / month (400 visuals)',
              '10 Brand Kits & Multi-Brand Switcher',
              'All Platforms + X (Twitter) Publishing',
              '100 Free Image Re-rolls / month',
              '2K Ultra-HD Visual Generations',
              'Unlimited Daily Publishing',
              'Priority Rendering Queue & Team Seats'
            ]
          }
        ])
      }

      // Check if logged in to fetch user plan status
      try {
        const statusRes = await api.get('/billing/status')
        setUserStatus(statusRes.data)
      } catch {
        // Guest user
        setUserStatus(null)
      }
    } catch (err) {
      console.error('Failed to load pricing:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleSelectPlan = (plan: any) => {
    if (!userStatus) {
      // Redirect guest to signup
      router.push('/signup')
      return
    }

    if (plan.id === 'trial') {
      toast.success('You have active access to the trial!')
      router.push('/dashboard')
      return
    }

    setSelectedPlanModal(plan)
  }

  const handleConfirmUpgradeRequest = async () => {
    if (!selectedPlanModal) return
    try {
      setSubmittingUpgrade(true)
      const res = await api.post('/billing/request-upgrade', {
        plan_id: selectedPlanModal.id,
        billing_cycle: billingCycle,
        note: upgradeNote
      })
      toast.success(res.data.message || 'Upgrade request submitted successfully!')
      setSelectedPlanModal(null)
      setUpgradeNote('')
      loadPricingData()
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to submit upgrade request.')
    } finally {
      setSubmittingUpgrade(false)
    }
  }

  const handleBuyCreditPack = async () => {
    if (!userStatus) {
      router.push('/signup')
      return
    }
    if (userStatus.is_trial) {
      toast.error('Credit packs are reserved for paid plans. Please upgrade to Starter, Growth, or Pro first.')
      return
    }
    try {
      const res = await api.post('/billing/credit-pack', { amount: 20, pack_name: 'Standard 20 Pack' })
      toast.success(res.data.message || 'Purchased 20 post credits!')
      loadPricingData()
    } catch (err: any) {
      const msg = err.response?.data?.detail?.message || err.response?.data?.detail || 'Failed to purchase pack.'
      toast.error(typeof msg === 'string' ? msg : JSON.stringify(msg))
    }
  }

  return (
    <div className="min-h-screen bg-[#05060A] text-[#F4F5F7] selection:bg-[#D4FF24] selection:text-black">
      <Toaster position="top-right" />

      {/* Navigation Header */}
      <nav className="border-b border-[#0D0F16] bg-[#05060A]/90 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-xl bg-[#1558C9] flex items-center justify-center shadow-lg shadow-[#1558C9]/20">
              <span className="text-white font-black text-sm tracking-tighter">BF</span>
            </div>
            <span className="font-extrabold text-base tracking-tight text-white">Brandflux</span>
          </Link>

          <div className="flex items-center gap-4">
            {userStatus ? (
              <Link
                href="/dashboard"
                className="px-4 py-2 rounded-xl bg-[#1558C9] hover:bg-[#4C8DFF] text-white font-bold text-xs transition"
              >
                Go to Dashboard &rarr;
              </Link>
            ) : (
              <>
                <Link
                  href="/login"
                  className="px-4 py-2 text-xs font-bold text-[#A0A5B5] hover:text-white transition"
                >
                  Log In
                </Link>
                <Link
                  href="/signup"
                  className="px-4 py-2 rounded-xl bg-[#D4FF24] hover:bg-[#bfe61f] text-black font-extrabold text-xs transition shadow-md shadow-[#D4FF24]/10"
                >
                  Start Free Trial
                </Link>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-16 pb-12 px-6 text-center max-w-4xl mx-auto">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#1558C9]/15 border border-[#1558C9]/30 text-[#4C8DFF] text-xs font-extrabold uppercase tracking-wider mb-4">
          <Sparkles className="h-3.5 w-3.5" />
          Transparent &amp; Predictable AI Pricing
        </div>
        <h1 className="text-4xl sm:text-5xl font-black tracking-tight text-white leading-tight">
          One Currency: <span className="text-[#D4FF24]">Post Credits</span>
        </h1>
        <p className="mt-4 text-base sm:text-lg text-[#A0A5B5] max-w-2xl mx-auto leading-relaxed">
          1 post credit delivers 2 distinct AI visual concepts, complete multi-channel copy, and verified publishing. Zero hidden rendering fees.
        </p>

        {userStatus?.plan_id === 'non_payment' && (
          <div className="mt-6 max-w-xl mx-auto p-4 rounded-2xl bg-purple-500/15 border border-purple-500/30 text-purple-200 text-xs text-center space-y-1">
            <p className="font-extrabold text-sm text-purple-100 flex items-center justify-center gap-1.5">
              <span>✨ Admin-Declared Non-Payment Account</span>
            </p>
            <p className="text-purple-300/90">
              Your account has unrestricted VIP access with zero billing tier limits or post credit restrictions.
            </p>
          </div>
        )}

        {/* Billing Cycle Toggle */}
        <div className="mt-8 inline-flex items-center gap-3 p-1.5 rounded-2xl bg-[#0D0F16] border border-white/10">
          <button
            type="button"
            onClick={() => setBillingCycle('monthly')}
            className={`px-5 py-2 rounded-xl text-xs font-black transition ${
              billingCycle === 'monthly'
                ? 'bg-[#1558C9] text-white shadow-md'
                : 'text-[#A0A5B5] hover:text-white'
            }`}
          >
            Monthly Billing
          </button>
          <button
            type="button"
            onClick={() => setBillingCycle('annual')}
            className={`px-5 py-2 rounded-xl text-xs font-black transition flex items-center gap-2 ${
              billingCycle === 'annual'
                ? 'bg-[#1558C9] text-white shadow-md'
                : 'text-[#A0A5B5] hover:text-white'
            }`}
          >
            <span>Annual Billing</span>
            <span className="px-2 py-0.5 rounded-full bg-[#D4FF24] text-black text-[10px] font-black uppercase">
              2 Months Free
            </span>
          </button>
        </div>
      </section>

      {/* Pricing Cards Grid */}
      <section className="max-w-7xl mx-auto px-6 pb-20">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {plans.map((p) => {
            const isTrial = p.id === 'trial'
            const isPopular = p.id === 'growth'
            const isPro = p.id === 'pro'
            const isCurrent = userStatus?.plan_id === p.id

            const displayPrice = billingCycle === 'annual'
              ? (p.price_annual_usd ? Math.round(p.price_annual_usd / 12) : 0)
              : p.price_usd

            return (
              <div
                key={p.id}
                className={`relative rounded-3xl p-6 flex flex-col justify-between transition-all duration-300 border ${
                  isPopular
                    ? 'bg-[#0D0F16] border-[#D4FF24] shadow-2xl shadow-[#D4FF24]/10 ring-1 ring-[#D4FF24]/30'
                    : 'bg-[#0D0F16]/60 border-white/10 hover:border-white/20'
                }`}
              >
                {isPopular && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-[#D4FF24] text-black text-[10px] font-black uppercase tracking-wider flex items-center gap-1 shadow-md">
                    <Flame className="h-3 w-3 fill-current" />
                    Most Popular
                  </div>
                )}

                <div>
                  <div className="flex items-center justify-between">
                    <h3 className="text-base font-extrabold text-white tracking-tight">{p.name}</h3>
                    {isCurrent && (
                      <span className="px-2 py-0.5 rounded-full bg-[#1558C9]/20 text-[#4C8DFF] border border-[#1558C9]/40 text-[9px] font-black uppercase">
                        Current
                      </span>
                    )}
                  </div>

                  <div className="mt-5 flex items-baseline gap-1.5">
                    <span className="text-4xl font-black text-white">${displayPrice}</span>
                    <span className="text-xs text-[#A0A5B5] font-bold">
                      {isTrial ? 'for 14 days' : billingCycle === 'annual' ? '/mo (billed annually)' : '/month'}
                    </span>
                  </div>

                  <p className="mt-3 text-xs text-[#A0A5B5] leading-relaxed">
                    {isTrial
                      ? 'Experience full multi-platform generation with no card required.'
                      : `${p.credits} post credits / month with verified publishing.`}
                  </p>

                  <div className="my-6 border-t border-white/10" />

                  {/* Feature list */}
                  <div className="space-y-3">
                    <div className="text-[10px] font-black uppercase tracking-wider text-[#A0A5B5]">Included Benefits</div>
                    <ul className="space-y-2.5 text-xs">
                      {(p.features || []).map((feat: string, idx: number) => (
                        <li key={idx} className="flex items-start gap-2.5 text-[#F4F5F7]">
                          <Check className="h-4 w-4 text-[#D4FF24] shrink-0 mt-0.5" />
                          <span className="leading-tight">{feat}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                <div className="mt-8 pt-4">
                  <button
                    type="button"
                    onClick={() => handleSelectPlan(p)}
                    className={`w-full py-3 px-4 rounded-xl font-extrabold text-xs transition flex items-center justify-center gap-1.5 ${
                      isPopular
                        ? 'bg-[#D4FF24] hover:bg-[#bfe61f] text-black shadow-lg shadow-[#D4FF24]/20'
                        : isCurrent
                        ? 'bg-white/10 text-white cursor-default'
                        : 'bg-[#1558C9] hover:bg-[#4C8DFF] text-white shadow-md'
                    }`}
                  >
                    <span>{isCurrent ? 'Active Plan' : isTrial ? 'Start 14-Day Trial' : `Upgrade to ${p.name}`}</span>
                    {!isCurrent && <ArrowRight className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* Credit Pack Section */}
      <section className="max-w-4xl mx-auto px-6 pb-20">
        <div className="p-8 rounded-3xl bg-gradient-to-r from-[#0D0F16] to-[#1558C9]/20 border border-white/10 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="space-y-2 text-center md:text-left">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#D4FF24]/10 border border-[#D4FF24]/30 text-[#D4FF24] text-[10px] font-black uppercase">
              Instant Top-up
            </div>
            <h3 className="text-xl font-black text-white">Need extra credits this month?</h3>
            <p className="text-xs text-[#A0A5B5] max-w-md leading-relaxed">
              Purchase an on-demand credit pack: <strong>20 Post Credits for $14</strong> ($0.70/credit). Exclusively available on active paid subscriptions.
            </p>
          </div>
          <button
            type="button"
            onClick={handleBuyCreditPack}
            className="px-6 py-3 rounded-xl bg-white hover:bg-zinc-200 text-black font-extrabold text-xs transition whitespace-nowrap shadow-xl"
          >
            Buy 20 Credits ($14)
          </button>
        </div>
      </section>

      {/* Feature Comparison Table */}
      <section className="max-w-6xl mx-auto px-6 pb-24">
        <div className="text-center mb-10">
          <h2 className="text-2xl sm:text-3xl font-black text-white">Feature Comparison</h2>
          <p className="text-xs text-[#A0A5B5] mt-2">Every plan limit is enforced server-side with zero artificial throttling.</p>
        </div>

        <div className="overflow-x-auto rounded-3xl border border-white/10 bg-[#0D0F16]/50">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-white/10 bg-[#0D0F16]">
                <th className="p-4 font-black text-[#A0A5B5] uppercase text-[10px]">Capabilities</th>
                <th className="p-4 font-black text-white text-center">Trial (14d)</th>
                <th className="p-4 font-black text-white text-center">Starter ($19)</th>
                <th className="p-4 font-black text-[#D4FF24] text-center">Growth ($39)</th>
                <th className="p-4 font-black text-white text-center">Pro ($89)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              <tr>
                <td className="p-4 font-bold text-white">Monthly Post Credits</td>
                <td className="p-4 text-center text-[#A0A5B5]">15 total</td>
                <td className="p-4 text-center font-bold text-white">30 / mo</td>
                <td className="p-4 text-center font-bold text-[#D4FF24]">100 / mo</td>
                <td className="p-4 text-center font-bold text-white">200 / mo</td>
              </tr>
              <tr>
                <td className="p-4 font-bold text-white">Brand Kits &amp; Voices</td>
                <td className="p-4 text-center text-[#A0A5B5]">1 Brand</td>
                <td className="p-4 text-center text-[#A0A5B5]">1 Brand</td>
                <td className="p-4 text-center font-bold text-[#D4FF24]">3 Brands</td>
                <td className="p-4 text-center font-bold text-white">10 Brands</td>
              </tr>
              <tr>
                <td className="p-4 font-bold text-white">Connected Platforms</td>
                <td className="p-4 text-center text-[#A0A5B5]">2 Platforms</td>
                <td className="p-4 text-center text-[#A0A5B5]">3 Platforms</td>
                <td className="p-4 text-center font-bold text-[#D4FF24]">5 Platforms</td>
                <td className="p-4 text-center font-bold text-white">All Channels</td>
              </tr>
              <tr>
                <td className="p-4 font-bold text-white">AI Visual Quality</td>
                <td className="p-4 text-center text-[#A0A5B5]">Standard 1K</td>
                <td className="p-4 text-center text-[#A0A5B5]">Standard 1K</td>
                <td className="p-4 text-center font-bold text-[#D4FF24]">2K Ultra-HD</td>
                <td className="p-4 text-center font-bold text-white">2K Ultra-HD</td>
              </tr>
              <tr>
                <td className="p-4 font-bold text-white">Monthly Free Re-roll Pool</td>
                <td className="p-4 text-center text-[#A0A5B5]">3 total</td>
                <td className="p-4 text-center font-bold text-white">15 free / mo</td>
                <td className="p-4 text-center font-bold text-[#D4FF24]">60 free / mo</td>
                <td className="p-4 text-center font-bold text-white">100 free / mo</td>
              </tr>
              <tr>
                <td className="p-4 font-bold text-white">Daily Generation Cap</td>
                <td className="p-4 text-center text-[#A0A5B5]">5 / day</td>
                <td className="p-4 text-center text-[#A0A5B5]">10 / day</td>
                <td className="p-4 text-center font-bold text-[#D4FF24]">25 / day</td>
                <td className="p-4 text-center font-bold text-white">100 / day</td>
              </tr>
              <tr>
                <td className="p-4 font-bold text-white">X (Twitter) Publishing</td>
                <td className="p-4 text-center text-rose-400 font-bold">Excluded</td>
                <td className="p-4 text-center text-rose-400 font-bold">Excluded</td>
                <td className="p-4 text-center text-rose-400 font-bold">Excluded</td>
                <td className="p-4 text-center text-emerald-400 font-bold">Included (Official API)</td>
              </tr>
              <tr>
                <td className="p-4 font-bold text-white">Autopilot Weekly Planner</td>
                <td className="p-4 text-center text-[#A0A5B5]">—</td>
                <td className="p-4 text-center text-emerald-400 font-bold">✓</td>
                <td className="p-4 text-center text-emerald-400 font-bold">✓</td>
                <td className="p-4 text-center text-emerald-400 font-bold">✓ (Priority)</td>
              </tr>
              <tr>
                <td className="p-4 font-bold text-white">Asset Retention After Expiry</td>
                <td className="p-4 text-center text-[#A0A5B5]">60 Days</td>
                <td className="p-4 text-center text-[#A0A5B5]">Active</td>
                <td className="p-4 text-center text-[#A0A5B5]">Active</td>
                <td className="p-4 text-center text-[#A0A5B5]">Active</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* Upgrade Request Modal */}
      {selectedPlanModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-[#0D0F16] border border-white/10 rounded-3xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h3 className="text-base font-extrabold text-white">
                Request Upgrade to {selectedPlanModal.name}
              </h3>
              <button
                type="button"
                onClick={() => setSelectedPlanModal(null)}
                className="text-xs text-[#A0A5B5] hover:text-white"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-[#A0A5B5] leading-relaxed">
              We currently use manual activation. When you confirm, our administrators receive an alert to provision your new limits and allocate your post credits immediately.
            </p>

            <div className="p-3 rounded-xl bg-white/5 border border-white/10 text-xs space-y-1">
              <div className="flex justify-between text-[#A0A5B5]">
                <span>Selected Plan:</span>
                <strong className="text-white">{selectedPlanModal.name}</strong>
              </div>
              <div className="flex justify-between text-[#A0A5B5]">
                <span>Billing Frequency:</span>
                <strong className="text-white capitalize">{billingCycle}</strong>
              </div>
              <div className="flex justify-between text-[#A0A5B5]">
                <span>Price:</span>
                <strong className="text-[#D4FF24]">
                  ${billingCycle === 'annual' ? selectedPlanModal.price_annual_usd : selectedPlanModal.price_usd}
                </strong>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold text-[#A0A5B5] uppercase">Optional Note to Administrator</label>
              <textarea
                value={upgradeNote}
                onChange={(e) => setUpgradeNote(e.target.value)}
                placeholder="e.g. Please activate Starter for TNT Innovations"
                rows={2}
                className="w-full bg-[#05060A] border border-white/10 rounded-xl p-2.5 text-xs text-white placeholder:text-zinc-600 focus:outline-none focus:border-[#1558C9]"
              />
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => setSelectedPlanModal(null)}
                className="flex-1 py-2.5 rounded-xl border border-white/10 hover:bg-white/5 text-xs font-bold text-white transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmUpgradeRequest}
                disabled={submittingUpgrade}
                className="flex-1 py-2.5 rounded-xl bg-[#D4FF24] hover:bg-[#bfe61f] text-black text-xs font-black transition disabled:opacity-50"
              >
                {submittingUpgrade ? 'Submitting...' : 'Confirm Request'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

