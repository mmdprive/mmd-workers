export interface Env {
  INTERNAL_TOKEN: string;
  AI_WORKER_BASE_URL: string;
  ADMIN_WORKER_BASE_URL: string;
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_CHAT_ID?: string;
  TG_THREAD_CONFIRM?: string;
}

export type ClientTier = "standard" | "premium" | "vip" | "svip" | "blackcard";
export type Channel = "web" | "line" | "telegram";

export interface ErrorBody {
  ok: false;
  error: {
    code: string;
    message: string;
  };
}

export interface HealthResponse {
  ok: true;
  service: "chat-worker";
  version: string;
}

export interface ChatIncomingRequest {
  clientId: string;
  clientTier: ClientTier;
  messageText: string;
  channel: Channel;
}

export interface ExtractPreferencesResponse {
  ok: true;
  intent: "booking_inquiry" | "pricing_inquiry" | "support" | "general";
  preferences: {
    occasion?: string;
    time_label?: string;
    venue_name?: string;
    location_area?: string;
    appearance_tags: string[];
    vibe_tags: string[];
    languages: string[];
    budget_signal?: "low" | "standard" | "premium" | "high";
    budget_amount_thb?: number;
  };
  flags: {
    high_value_client: boolean;
    ask_per_before_high_tier: boolean;
    specific_model_requested: boolean;
  };
  missing_fields: string[];
}

export interface ModelCardLite {
  working_name: string;
  model_tier: "standard" | "premium" | "vip" | "gws" | "ems";
  orientation_label?: "straight" | "gay";
  height_cm?: number;
  body_type?: string;
  base_area?: string;
  vibe_tags: string[];
  best_for: string[];
  languages: string[];
  available_now: boolean;
  availability_status?: string;
  minimum_rate_90m: number;
  ai_match_summary?: string;
  requires_per_approval: boolean;
}

export interface MatchResponse {
  ok: true;
  matches: Array<{
    working_name: string;
    score: number;
    reason: string[];
    requires_per_approval: boolean;
  }>;
  flags: {
    high_value_client: boolean;
    ask_per_before_high_tier: boolean;
    any_requires_per_approval: boolean;
  };
  policy: {
    presentation_count: number;
    presentation_mode: "standard_curated" | "premium_curated" | "vip_curated";
  };
}

export interface ReplyResponse {
  ok: true;
  reply_text: string;
  tone: "luxury_concierge";
  requires_human_review: boolean;
}

export interface ModelsListLiteResponse {
  ok: true;
  models: ModelCardLite[];
}

export interface ChatIncomingResponse {
  ok: true;
  reply_text: string;
  requires_human_review: boolean;
  debug?: unknown;
}
