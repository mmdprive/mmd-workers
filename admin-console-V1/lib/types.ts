export type ClientTier = "standard" | "premium" | "vip" | "svip" | "blackcard";
export type Channel = "web" | "line" | "telegram" | "internal";
export type DealStatus =
  | "new_inquiry"
  | "ai_processing"
  | "needs_per_review"
  | "awaiting_client_reply"
  | "awaiting_payment"
  | "payment_received"
  | "ready_to_offer_model"
  | "offer_sent_to_model"
  | "model_accepted"
  | "confirmed"
  | "expired"
  | "declined"
  | "cancelled";

export interface Deal {
  deal_id: string;
  client_id?: string;
  client_name: string;
  channel: Channel;
  client_tier: ClientTier;
  request_text?: string;
  request_summary_ai?: string;
  occasion?: string;
  timing_label?: string;
  venue_name?: string;
  budget_amount_thb?: number;
  budget_signal?: "low" | "standard" | "premium" | "high";
  history_signal?: "none" | "low" | "medium" | "high";
  high_value_client?: boolean;
  specific_model_requested?: boolean;
  ai_top_model?: string;
  ai_reply_draft?: string;
  ai_requires_per_review?: boolean;
  deal_status: DealStatus;
  urgency_level?: "low" | "normal" | "high" | "fast_lane";
}

export interface DashboardSummary {
  open_deals: number;
  needs_per: number;
  pending_payments: number;
  active_models: number;
}
