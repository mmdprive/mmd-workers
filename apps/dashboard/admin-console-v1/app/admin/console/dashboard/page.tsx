import { OperationalSnapshot } from "@/components/admin/dashboard/operational-snapshot";
import { PaymentRenewalPreview } from "@/components/admin/payments/payment-renewal-preview";
import { mockDashboardSummary } from "@/lib/mock";

export default function DashboardPage() {
  return (
    <div className="space-y-8">
      <section className="overflow-hidden rounded-[28px] border border-amber-300/15 bg-black/30 p-6 shadow-soft backdrop-blur">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-xs uppercase tracking-[0.3em] text-amber-200/70">
              Figma Make Import
            </div>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight text-white">
              Admin Overview
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-white/65">
              This dashboard starts bringing the Figma Make system into the repo with
              the highest-overlap modules first: operations snapshot and payment flow
              preview.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <MetricChip label="Open Deals" value={mockDashboardSummary.open_deals} />
            <MetricChip label="Needs Per" value={mockDashboardSummary.needs_per} />
            <MetricChip
              label="Pending Payments"
              value={mockDashboardSummary.pending_payments}
            />
            <MetricChip label="Active Models" value={mockDashboardSummary.active_models} />
          </div>
        </div>
      </section>

      <OperationalSnapshot summary={mockDashboardSummary} />
      <PaymentRenewalPreview />
    </div>
  );
}

function MetricChip({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
      <div className="text-[11px] uppercase tracking-[0.22em] text-white/40">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-amber-200">{value}</div>
    </div>
  );
}
