import { DealsPage } from "@/components/admin/deals/deals-page";
import { getDeals } from "@/lib/admin-api";

export default async function AdminDealsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const tab = typeof params.tab === "string" ? params.tab : "needs-per";
  const tier = typeof params.tier === "string" ? params.tier : undefined;
  const urgency = typeof params.urgency === "string" ? params.urgency : undefined;

  const data = await getDeals({ tab, tier, urgency });

  return <DealsPage deals={data.deals} />;
}
