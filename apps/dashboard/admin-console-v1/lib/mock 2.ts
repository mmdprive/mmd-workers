import type { DashboardSummary, Deal } from "./types";

export const mockDashboardSummary: DashboardSummary = {
  open_deals: 12,
  needs_per: 4,
  pending_payments: 3,
  active_models: 28,
};

export const mockDeals: Deal[] = [
  {
    deal_id: "DL-000128",
    client_id: "CL-000031",
    client_name: "John D.",
    channel: "line",
    client_tier: "premium",
    request_text:
      "Tonight at Four Seasons. Looking for someone tall, confident, and comfortable for dinner. Good English preferred. Budget around 40k.",
    request_summary_ai:
      "Dinner request, premium tone, English-speaking preference, tonight at Four Seasons.",
    occasion: "dinner",
    timing_label: "tonight",
    venue_name: "Four Seasons",
    budget_amount_thb: 40000,
    pay_model_thb: 18000,
    budget_signal: "high",
    history_signal: "medium",
    high_value_client: true,
    specific_model_requested: false,
    ai_top_model: "Hito",
    ai_reply_draft:
      "We have someone who would suit your request very well for tonight at Four Seasons.",
    ai_requires_per_review: true,
    deal_status: "needs_per_review",
    urgency_level: "fast_lane",
  },
  {
    deal_id: "DL-000129",
    client_id: "CL-000032",
    client_name: "Alex M.",
    channel: "web",
    client_tier: "standard",
    request_text: "Tomorrow afternoon in Sukhumvit. Looking for someone friendly and fit.",
    request_summary_ai: "Travel-style request tomorrow, standard budget, likely self-select fit.",
    occasion: "travel",
    timing_label: "tomorrow",
    venue_name: "Sukhumvit",
    budget_amount_thb: 18000,
    pay_model_thb: 9000,
    budget_signal: "standard",
    history_signal: "low",
    high_value_client: false,
    specific_model_requested: false,
    ai_top_model: "Tart",
    ai_reply_draft: "We have a suitable match for tomorrow in Sukhumvit.",
    ai_requires_per_review: false,
    deal_status: "ready_to_offer_model",
    urgency_level: "normal",
  },
  {
    deal_id: "DL-000130",
    client_id: "CL-000033",
    client_name: "K.",
    channel: "telegram",
    client_tier: "vip",
    request_text: "Specific model tonight. Need privacy and quick confirmation.",
    request_summary_ai: "Specific model request with VIP handling. Needs Per review.",
    occasion: "private",
    timing_label: "tonight",
    venue_name: "Private Venue",
    budget_amount_thb: 50000,
    pay_model_thb: 25000,
    budget_signal: "high",
    history_signal: "high",
    high_value_client: true,
    specific_model_requested: true,
    ai_top_model: "Kenji",
    ai_reply_draft: "I have a strong match in mind. Let me review this personally.",
    ai_requires_per_review: true,
    deal_status: "needs_per_review",
    urgency_level: "high",
  },
];

export function findDealById(dealId: string): Deal | undefined {
  return mockDeals.find((deal) => deal.deal_id === dealId);
}
