export interface Env {
  INTERNAL_TOKEN: string;
  OPENAI_API_KEY?: string;
  ADMIN_WORKER_BASE_URL?: string;
}

export type ClientTier = "standard" | "premium" | "vip" | "svip" | "blackcard";
export type ModelTier = "standard" | "premium" | "vip" | "gws" | "ems";
export type OrientationLabel = "straight" | "gay";
export type AvailabilityStatus =
  | "available"
  | "busy"
  | "traveling"
  | "working"
  | "off-duty"
  | "vacation";

export interface ErrorBody {
  ok: false;
  error: {
    code: string;
    message: string;
  };
}

export interface HealthResponse {
  ok: true;
  service: "ai-worker";
  version: string;
}

export interface ClientContext {
  tier?: ClientTier;
  history_signal?: "none" | "low" | "medium" | "high";
  budget_signal?: "low" | "standard" | "premium" | "high";
  selection_mode?: "mmd_suggestion" | "self_select";
}

export interface ExtractPreferencesRequest {
  text: string;
  channel?: "web" | "line" | "telegram" | "internal";
  client?: ClientContext;
}

export interface ExtractedPreferences {
  occasion?: string;
  time_label?: string;
  venue_name?: string;
  location_area?: string;
  appearance_tags: string[];
  vibe_tags: string[];
  languages: string[];
  budget_signal?: "low" | "standard" | "premium" | "high";
  budget_amount_thb?: number;
}

export interface ExtractPreferencesResponse {
  ok: true;
  intent: "booking_inquiry" | "pricing_inquiry" | "support" | "general";
  preferences: ExtractedPreferences;
  flags: {
    high_value_client: boolean;
    ask_per_before_high_tier: boolean;
    specific_model_requested: boolean;
  };
  missing_fields: string[];
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
  availability_status?: AvailabilityStatus;
  minimum_rate_90m: number;
  ai_match_summary?: string;
  requires_per_approval: boolean;
}

export interface ClientRequestLite {
  occasion?: string;
  time_label?: string;
  venue_name?: string;
  location_area?: string;
  preferences: {
    appearance_tags?: string[];
    vibe_tags?: string[];
    languages?: string[];
  };
}

export interface MatchConstraints {
  require_available_now?: boolean;
  respect_minimum_rate?: boolean;
  max_results?: number;
  budget_amount_thb?: number;
}

export interface MatchRequest {
  client?: ClientContext;
  request: ClientRequestLite;
  constraints?: MatchConstraints;
  models: ModelCardLite[];
}

export interface MatchResult {
  working_name: string;
  score: number;
  reason: string[];
  requires_per_approval: boolean;
}

export interface MatchResponse {
  ok: true;
  matches: MatchResult[];
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

export interface ReplyRequest {
  client?: ClientContext;
  request: {
    occasion?: string;
    time_label?: string;
    venue_name?: string;
  };
  matches: MatchResult[];
  flags?: {
    ask_per_before_high_tier?: boolean;
  };
  reply_mode?: "client-facing" | "internal";
}

export interface ReplyResponse {
  ok: true;
  reply_text: string;
  tone: "luxury_concierge";
  requires_human_review: boolean;
}
