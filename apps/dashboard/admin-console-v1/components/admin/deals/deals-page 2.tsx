import type { Deal } from "@/lib/types";
import { DealDetailPanel } from "./deal-detail-panel";
import { DealList } from "./deal-list";

export function DealsPage({ deals }: { deals: Deal[] }) {
  const selected = deals[0];

  return (
    <div className="grid min-h-screen grid-cols-1 xl:grid-cols-[420px_1fr]">
      <DealList deals={deals} />
      <div className="p-5">
        {selected ? (
          <DealDetailPanel deal={selected} />
        ) : (
          <div className="rounded-3xl border border-white/10 bg-white/5 p-8 text-white/50">
            No deals found
          </div>
        )}
      </div>
    </div>
  );
}
