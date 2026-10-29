import EmptyState from '@/components/ui/EmptyState'

export default function PricingPage() {
  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-extrabold text-text tracking-tight">Subscription & Billing</h1>
        <p className="text-sm text-muted">Manage your plan tiers, limits, and billing details.</p>
      </div>

      <div className="bg-surface border border-border rounded-3xl p-8">
        <EmptyState
          emoji="💳"
          title="Stripe Customer Portal"
          subtitle="Upgrade your account or manage payment methods directly."
        />
      </div>
    </div>
  )
}
