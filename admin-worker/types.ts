export interface Env {
  INTERNAL_TOKEN: string;
  AIRTABLE_API_KEY: string;
  AIRTABLE_BASE_ID: string;
  AIRTABLE_TABLE_MODELS: string;
  AIRTABLE_TABLE_DEALS: string;
}

export type ModelTier = "standard" | "premium" | "vip" | "gws" | "ems";
export type OrientationLabel = "straight" | "gay";
export type AvailabilityStatus =
  | "available"
  | "busy"
  | "traveling"
  | "working"
  | "off-duty"
  | "vacation";

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

export interface ErrorBody {
  ok: false;
  error: {
    code: string;
    message: string;
  };
}

export interface HealthResponse {
  ok: true;
  service: "admin-worker";
  version: string;
}

export interface ModelCardLite {
  working_name: string;
  model_tier: ModelTier;
  orientation_label?: OrientationLabel;
  height_cm?: number;
  body_type?: string;
  base_area?: string;
  vibe_tags: string[];
  best_for: string[];
  languages: string[];
  available_now: boolean;
  availability_status?: AvailabilityStatus | string;
  minimum_rate_90m: number;
  ai_match_summary?: string;
  requires_per_approval: boolean;
}

export interface ModelsListLiteResponse {
  ok: true;
  models: ModelCardLite[];
  count: number;
}

export interface DealLite {
  deal_id: string;
  client_id?: string;
  client_name: string;
  channel: Channel;
  client_tier: ClientTier;
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

export interface DealsListLiteResponse {
  ok: true;
  deals: DealLite[];
  count: number;
}

export interface UpsertAiRequest {
  deal_id: string;
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
  deal_status?: DealStatus;
  urgency_level?: "low" | "normal" | "high" | "fast_lane";
}

export interface UpsertAiResponse {
  ok: true;
  deal_id: string;
  updated: boolean;
  created?: boolean;
  airtable_record_id?: string;
}
