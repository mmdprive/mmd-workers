import { getDashboardSummary } from "@/lib/admin-api";

export default async function DashboardPage() {
  const summary = await getDashboardSummary();

  return (
    <div className="p-6">
      <div className="text-3xl font-semibold">Dashboard</div>
      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
          <div className="text-sm text-white/50">Open Deals</div>
          <div className="mt-2 text-3xl font-semibold">{summary.open_deals}</div>
        </div>
        <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
          <div className="text-sm text-white/50">Needs Per</div>
          <div className="mt-2 text-3xl font-semibold">{summary.needs_per}</div>
        </div>
        <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
          <div className="text-sm text-white/50">Pending Payments</div>
          <div className="mt-2 text-3xl font-semibold">{summary.pending_payments}</div>
        </div>
        <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
          <div className="text-sm text-white/50">Active Models</div>
          <div className="mt-2 text-3xl font-semibold">{summary.active_models}</div>
        </div>
      </div>
    </div>
  );
}
