import type { Deal } from "@/lib/types";
import { ActionBar } from "./action-bar";

function Badge({
  children,
  tone = "default",
}: {
  children: React.ReactNode;
  tone?: "default" | "gold" | "red" | "green";
}) {
  const styles = {
    default: "bg-white/10 text-white/80 border-white/10",
    gold: "bg-amber-500/15 text-amber-100 border-amber-400/20",
    red: "bg-rose-500/15 text-rose-200 border-rose-400/20",
    green: "bg-emerald-500/15 text-emerald-200 border-emerald-400/20",
  };

  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs ${styles[tone]}`}>
      {children}
    </span>
  );
}

export function DealDetailPanel({ deal }: { deal: Deal }) {
  return (
    <div className="space-y-5">
      <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-[0.22em] text-white/40">
              Deal Detail
            </div>
            <div className="mt-2 text-3xl font-semibold">{deal.deal_id}</div>
            <div className="mt-2 text-white/80">
              {deal.client_name} • {deal.occasion} • {deal.venue_name}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge tone="gold">{deal.client_tier}</Badge>
            {deal.urgency_level ? (
              <Badge tone={deal.urgency_level === "fast_lane" ? "red" : "default"}>
                {deal.urgency_level}
              </Badge>
            ) : null}
            <Badge tone="gold">{deal.deal_status}</Badge>
          </div>
        </div>
      </div>

      <div className="grid gap-5 2xl:grid-cols-[1.2fr_0.9fr]">
        <div className="space-y-5">
          <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
            <div className="mb-4 text-lg font-semibold">Client Request</div>
            <div className="rounded-2xl bg-black/30 p-4 text-sm leading-6 text-white/85">
              {deal.request_text}
            </div>
            <div className="mt-4 text-sm text-white/60">
              {deal.request_summary_ai}
            </div>
            <div className="mt-4 grid gap-3 text-sm text-white/75 md:grid-cols-2">
              <div>Occasion: {deal.occasion ?? "-"}</div>
              <div>Time: {deal.timing_label ?? "-"}</div>
              <div>Venue: {deal.venue_name ?? "-"}</div>
              <div>Specific Model: {deal.specific_model_requested ? "Yes" : "No"}</div>
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
            <div className="mb-4 text-lg font-semibold">AI Recommendation</div>
            <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-base font-semibold">
                    Top match: {deal.ai_top_model ?? "-"}
                  </div>
                  <div className="mt-2 text-sm text-white/65">
                    {deal.ai_reply_draft ?? "-"}
                  </div>
                </div>
                {deal.ai_requires_per_review ? (
                  <Badge tone="gold">Requires Per Approval</Badge>
                ) : (
                  <Badge tone="green">Safe</Badge>
                )}
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
            <div className="mb-4 text-lg font-semibold">Payment & Offer State</div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl bg-black/25 p-4">
                <div className="text-sm font-medium">Payment</div>
                <div className="mt-3 space-y-2 text-sm text-white/70">
                  <div>Status: Not Sent</div>
                  <div>Deposit: —</div>
                  <div>Pay Model: {deal.pay_model_thb?.toLocaleString() ?? "—"} THB</div>
                  <div>Link Sent: No</div>
                </div>
              </div>
              <div className="rounded-2xl bg-black/25 p-4">
                <div className="text-sm font-medium">Model Offer</div>
                <div className="mt-3 space-y-2 text-sm text-white/70">
                  <div>Status: Not Sent</div>
                  <div>Assigned Model: —</div>
                  <div>Offer Mode: Curated</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-5">
          <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
            <div className="mb-4 text-lg font-semibold">Client Intelligence</div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-2xl bg-black/25 p-4">
                <div className="text-white/40">Budget</div>
                <div className="mt-2 text-2xl font-semibold">
                  {deal.budget_amount_thb?.toLocaleString() ?? "-"}
                </div>
              </div>
              <div className="rounded-2xl bg-black/25 p-4">
                <div className="text-white/40">Pay Model</div>
                <div className="mt-2 text-2xl font-semibold">
                  {deal.pay_model_thb?.toLocaleString() ?? "-"}
                </div>
              </div>
              <div className="rounded-2xl bg-black/25 p-4">
                <div className="text-white/40">Signal</div>
                <div className="mt-2 text-2xl font-semibold">
                  {deal.budget_signal ?? "-"}
                </div>
              </div>
              <div className="rounded-2xl bg-black/25 p-4">
                <div className="text-white/40">History</div>
                <div className="mt-2 text-2xl font-semibold">
                  {deal.history_signal ?? "-"}
                </div>
              </div>
              <div className="rounded-2xl bg-black/25 p-4">
                <div className="text-white/40">High Value</div>
                <div className="mt-2 text-2xl font-semibold">
                  {deal.high_value_client ? "Yes" : "No"}
                </div>
              </div>
            </div>
          </div>

          <ActionBar deal={deal} />
        </div>
      </div>
    </div>
  );
}
