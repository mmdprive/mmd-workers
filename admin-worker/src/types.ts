export interface Env {
  INTERNAL_TOKEN: string;
  AIRTABLE_API_KEY: string;
  AIRTABLE_BASE_ID: string;
  AIRTABLE_TABLE_MODELS: string;
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
