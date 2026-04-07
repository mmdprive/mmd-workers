import { findDealById, mockDashboardSummary, mockDeals } from "./mock";
import type { DashboardSummary, Deal } from "./types";

export async function getDashboardSummary(): Promise<DashboardSummary> {
  return mockDashboardSummary;
}

export async function getDeals(
  params?: Record<string, string | undefined>,
): Promise<{ ok: true; deals: Deal[] }> {
  let deals = [...mockDeals];

  if (params?.tier) {
    deals = deals.filter((deal) => deal.client_tier === params.tier);
  }

  if (params?.urgency) {
    deals = deals.filter((deal) => deal.urgency_level === params.urgency);
  }

  if (params?.tab === "needs-per") {
    deals = deals.filter((deal) => deal.deal_status === "needs_per_review");
  }

  if (params?.tab === "ready") {
    deals = deals.filter((deal) => deal.deal_status === "ready_to_offer_model");
  }

  if (params?.tab === "waiting") {
    deals = deals.filter((deal) =>
      ["awaiting_client_reply", "awaiting_payment", "offer_sent_to_model"].includes(deal.deal_status),
    );
  }

  if (params?.tab === "closed") {
    deals = deals.filter((deal) =>
      ["confirmed", "expired", "declined", "cancelled"].includes(deal.deal_status),
    );
  }

  return { ok: true, deals };
}

export async function getDealById(dealId: string): Promise<Deal> {
  const deal = findDealById(dealId);
  if (!deal) throw new Error("Deal not found");
  return deal;
}
