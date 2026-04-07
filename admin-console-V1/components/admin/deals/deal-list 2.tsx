import type { Deal } from "@/lib/types";
import { DealCard } from "./deal-card";

export function DealList({ deals }: { deals: Deal[] }) {
  return (
    <section className="border-r border-white/10 bg-[#0b0b0b] p-5">
      <div className="mb-4 flex flex-wrap gap-2">
        <input
          className="min-w-[220px] flex-1 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm outline-none placeholder:text-white/30"
          placeholder="Search client, deal ID, venue..."
        />
        <button className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/80">
          Filter
        </button>
      </div>

      <div className="mb-4 flex gap-2 overflow-auto pb-1">
        <button className="rounded-full bg-amber-500/15 px-4 py-2 text-sm text-amber-100 ring-1 ring-amber-400/20">
          Needs Per
        </button>
        <button className="rounded-full bg-white/5 px-4 py-2 text-sm text-white/70">
          Ready
        </button>
        <button className="rounded-full bg-white/5 px-4 py-2 text-sm text-white/70">
          Waiting
        </button>
        <button className="rounded-full bg-white/5 px-4 py-2 text-sm text-white/70">
          Closed
        </button>
      </div>

      <div className="space-y-3">
        {deals.map((deal) => (
          <DealCard key={deal.deal_id} deal={deal} />
        ))}
      </div>
    </section>
  );
}
