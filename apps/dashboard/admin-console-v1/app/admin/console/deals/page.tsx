import { DealsPage } from "@/components/admin/deals/deals-page";
import { getDeals } from "@/lib/admin-api";

export default async function DealsRoutePage() {
  const { deals } = await getDeals();
  return <DealsPage deals={deals} />;
}
