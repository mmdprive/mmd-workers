"use client";

import { useEffect, useState } from "react";

import type { Deal } from "@/lib/types";

function formatCurrency(value?: number | null) {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value.toLocaleString()} THB`;
}

export function ActionBar({ deal }: { deal: Deal }) {
  const [payModelThb, setPayModelThb] = useState<string>(
    deal.pay_model_thb != null ? String(deal.pay_model_thb) : "",
  );

  useEffect(() => {
    setPayModelThb(deal.pay_model_thb != null ? String(deal.pay_model_thb) : "");
  }, [deal.deal_id, deal.pay_model_thb]);

  const budget = deal.budget_amount_thb;
  const payModelValue = Number(payModelThb);
  const hasPayModelValue = payModelThb.trim() !== "" && Number.isFinite(payModelValue) && payModelValue >= 0;
  const marginValue = budget != null && hasPayModelValue ? budget - payModelValue : null;

  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
      <div className="mb-4 text-lg font-semibold">Actions</div>
      <div className="mb-4 rounded-2xl border border-white/10 bg-black/25 p-4">
        <div className="text-sm font-medium text-white">Payment Builder</div>
        <div className="mt-3 space-y-3">
          <label className="block text-sm text-white/70">
            <span className="mb-2 block text-xs uppercase tracking-[0.2em] text-white/40">
              Pay Model
            </span>
            <input
              type="number"
              min="0"
              step="100"
              value={payModelThb}
              onChange={(event) => setPayModelThb(event.target.value)}
              placeholder="Enter model payout"
              className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition focus:border-amber-300/60 focus:bg-white/10"
            />
          </label>
          <div className="grid gap-3 text-sm text-white/70 md:grid-cols-2">
            <div className="rounded-2xl bg-white/5 p-3">
              <div className="text-white/40">Client Budget</div>
              <div className="mt-1 font-semibold text-white">{formatCurrency(budget)}</div>
            </div>
            <div className="rounded-2xl bg-white/5 p-3">
              <div className="text-white/40">Estimated Margin</div>
              <div className="mt-1 font-semibold text-white">{formatCurrency(marginValue)}</div>
            </div>
          </div>
        </div>
      </div>
      <div className="grid gap-3">
        <button className="rounded-2xl bg-amber-400 px-4 py-3 text-sm font-semibold text-black">
          Approve AI
        </button>
        <button className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/85">
          Override Model
        </button>
        <button className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/85">
          Ask More
        </button>
        <button className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/85">
          Send Payment{hasPayModelValue ? ` • ${formatCurrency(payModelValue)}` : ""}
        </button>
        <button className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/85">
          Hold
        </button>
        <button className="rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          Close Deal
        </button>
      </div>
      <div className="mt-4 text-xs text-white/35">Deal: {deal.deal_id}</div>
    </div>
  );
}
