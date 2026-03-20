import { DealDetailPanel } from "@/components/admin/deals/deal-detail-panel";
import { getDealById } from "@/lib/admin-api";

export default async function DealDetailPage({
  params,
}: {
  params: Promise<{ deal_id: string }>;
}) {
  const { deal_id } = await params;
  const deal = await getDealById(deal_id);

  return (
    <div className="p-6">
      <DealDetailPanel deal={deal} />
    </div>
  );
}
