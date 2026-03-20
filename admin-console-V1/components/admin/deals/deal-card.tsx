import Link from "next/link";
import type { Deal } from "@/lib/types";

function Badge({
  children,
  tone = "default",
}: {
  children: React.ReactNode;
  tone?: "default" | "gold" | "red" | "green";
}) {
  const styles = {
    default: "bg-white/10 text-white/80",
    gold: "bg-amber-500/15 text-amber-100",
    red: "bg-rose-500/15 text-rose-200",
    green: "bg-emerald-500/15 text-emerald-200",
  };

  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs ${styles[tone]}`}>
      {children}
    </span>
  );
}

export function DealCard({ deal }: { deal: Deal }) {
  const isHighTier =
    deal.client_tier === "vip" ||
    deal.client_tier === "svip" ||
    deal.client_tier === "blackcard";

  return (
    <Link
      href={`/admin/console/deals/${deal.deal_id}`}
      className="block rounded-3xl border border-white/10 bg-white/5 p-4 shadow-soft hover:bg-white/[0.07]"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-base font-semibold">{deal.client_name}</div>
          <div className="mt-1 text-xs text-white/45">
            {deal.deal_id} • {deal.channel}
          </div>
        </div>
        <Badge tone={isHighTier ? "gold" : "default"}>{deal.client_tier}</Badge>
      </div>

      <div className="mt-4 text-sm text-white/90">
        {deal.occasion} • {deal.timing_label} • {deal.venue_name}
      </div>

      <div className="mt-2 text-sm text-white/60">
        {deal.budget_amount_thb?.toLocaleString() ?? "-"} THB • {deal.budget_signal}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Badge tone={deal.deal_status === "needs_per_review" ? "gold" : "green"}>
          {deal.deal_status}
        </Badge>
        {deal.urgency_level ? (
          <Badge tone={deal.urgency_level === "fast_lane" ? "red" : "default"}>
            {deal.urgency_level}
          </Badge>
        ) : null}
      </div>
    </Link>
  );
}
