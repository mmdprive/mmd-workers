import { DealDetailPanel } from "@/components/admin/deals/deal-detail-panel";
import { getDealById } from "@/lib/admin-api";

export default async function DealDetailRoutePage({
  params,
}: {
  params: Promise<{ deal_id: string }>;
}) {
  const { deal_id } = await params;
  const deal = await getDealById(deal_id);
  return <DealDetailPanel deal={deal} />;
}
