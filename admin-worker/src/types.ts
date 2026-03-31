export interface Env {
  INTERNAL_TOKEN: string;
  AIRTABLE_API_KEY: string;
  AIRTABLE_BASE_ID: string;
  AIRTABLE_TABLE_MODELS: string;
  AIRTABLE_TABLE_MEMBERS?: string;
  AIRTABLE_TABLE_MODEL_BINDINGS?: string;
  AIRTABLE_TABLE_DEALS: string;
  AIRTABLE_TABLE_CLIENTS?: string;
  AIRTABLE_TABLE_MEMBER_NOTES?: string;
  AIRTABLE_TABLE_SESSIONS?: string;
  AIRTABLE_TABLE_PAYMENTS?: string;
  AIRTABLE_TABLE_ACTIVITY_LOGS?: string;
  AIRTABLE_TABLE_POINTS_LEDGER?: string;

  ADMIN_BEARER?: string;
  CONFIRM_KEY?: string;
  PAYMENTS_WORKER_ORIGIN?: string;
  PAYMENTS_WORKER_BASE_URL?: string;
  JOBS_WORKER_BASE_URL?: string;
  CREATE_LINKS_URL?: string;
  WEB_BASE_URL?: string;

  AIRTABLE_DEALS_FIELD_DEAL_ID?: string;
  AIRTABLE_DEALS_FIELD_CLIENT_ID?: string;
  AIRTABLE_DEALS_FIELD_CLIENT_NAME?: string;
  AIRTABLE_DEALS_FIELD_CHANNEL?: string;
  AIRTABLE_DEALS_FIELD_CLIENT_TIER?: string;
  AIRTABLE_DEALS_FIELD_REQUEST_SUMMARY_AI?: string;
  AIRTABLE_DEALS_FIELD_OCCASION?: string;
  AIRTABLE_DEALS_FIELD_TIMING_LABEL?: string;
  AIRTABLE_DEALS_FIELD_VENUE_NAME?: string;
  AIRTABLE_DEALS_FIELD_BUDGET_AMOUNT_THB?: string;
  AIRTABLE_DEALS_FIELD_BUDGET_SIGNAL?: string;
  AIRTABLE_DEALS_FIELD_HISTORY_SIGNAL?: string;
  AIRTABLE_DEALS_FIELD_HIGH_VALUE_CLIENT?: string;
  AIRTABLE_DEALS_FIELD_SPECIFIC_MODEL_REQUESTED?: string;
  AIRTABLE_DEALS_FIELD_AI_TOP_MODEL?: string;
  AIRTABLE_DEALS_FIELD_AI_REPLY_DRAFT?: string;
  AIRTABLE_DEALS_FIELD_AI_REQUIRES_PER_REVIEW?: string;
  AIRTABLE_DEALS_FIELD_DEAL_STATUS?: string;
  AIRTABLE_DEALS_FIELD_URGENCY_LEVEL?: string;
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
export type BudgetSignal = "low" | "standard" | "premium" | "high";
export type HistorySignal = "none" | "low" | "medium" | "high";
export type UrgencyLevel = "low" | "normal" | "high" | "fast_lane";

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
  model_record_id: string;
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
  binding_status?: ModelBindingStatus;
  console_access?: ModelConsoleAccess;
  binding_record_id?: string;
  binding_memberstack_id?: string;
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
  request_summary_ai?: string;
  occasion?: string;
  timing_label?: string;
  venue_name?: string;
  budget_amount_thb?: number;
  budget_signal?: BudgetSignal;
  history_signal?: HistorySignal;
  high_value_client?: boolean;
  specific_model_requested?: boolean;
  ai_top_model?: string;
  ai_reply_draft?: string;
  ai_requires_per_review?: boolean;
  deal_status: DealStatus;
  urgency_level?: UrgencyLevel;
}

export interface DealsListLiteResponse {
  ok: true;
  deals: DealLite[];
  count: number;
}

export interface UpsertAiRequest {
  deal_id: string;
  client_id?: string;
  client_name?: string;
  channel?: Channel;
  client_tier?: ClientTier;
  request_summary_ai?: string;
  occasion?: string;
  timing_label?: string;
  venue_name?: string;
  budget_amount_thb?: number;
  budget_signal?: BudgetSignal;
  history_signal?: HistorySignal;
  high_value_client?: boolean;
  specific_model_requested?: boolean;
  ai_top_model?: string;
  ai_reply_draft?: string;
  ai_requires_per_review?: boolean;
  deal_status?: DealStatus;
  urgency_level?: UrgencyLevel;
}

export interface UpsertAiResponse {
  ok: true;
  deal_id: string;
  updated: boolean;
  created?: boolean;
  airtable_record_id?: string;
}

export type ModelProgramType = "standard" | "premium" | "extreme" | "travel";
export type ModelCatalogGroup = "pn" | "vip" | "variety" | "compcard" | "general";
export type ModelVisibility = "public" | "private";
export type ModelPositionTag = "top" | "bottom_flexible" | "unknown";
export type ModelBindingStatus = "unbound" | "bound" | "needs_review";
export type ModelConsoleAccess = "pending_bind" | "pending_rules" | "ready";

export interface PrepareModelRecordRequest {
  folder_name: string;
  display_name?: string;
  username?: string;
  model_id?: string;
  model_record_id?: string;
  identity_id?: string;
  memberstack_id?: string;
  visibility?: ModelVisibility;
  program_type?: ModelProgramType;
  catalog_group?: ModelCatalogGroup;
  orientation?: string;
  position_tag?: ModelPositionTag;
  rules_version_required?: string;
  rules_ack_version?: string;
}

export interface PrepareModelRecordResponse {
  ok: true;
  data: {
    model_id: string;
    username: string;
    display_name: string;
    folder_name: string;
    folder_slug: string;
    model_record_id: string;
    identity_id: string;
    memberstack_id: string;
    visibility: ModelVisibility;
    program_type: ModelProgramType;
    catalog_group: ModelCatalogGroup;
    orientation: string;
    position_tag: ModelPositionTag;
    binding_status: ModelBindingStatus;
    console_access: ModelConsoleAccess;
    rules_version_required: string;
    rules_ack_version: string;
    r2_prefix: string;
    primary_image_key: string;
    preview_only: boolean;
  };
}

export interface BindModelIdentityRequest extends PrepareModelRecordRequest {}

export interface BindModelIdentityResponse {
  ok: true;
  data: PrepareModelRecordResponse["data"] & {
    persisted: boolean;
    persistence_target: "model_bindings_table" | "models_table";
    binding_record_id: string;
  };
}

export type ImmigrationSourceChannel =
  | "line"
  | "renewal"
  | "signup"
  | "upgrade"
  | "import"
  | "operator";

export type ImmigrationIntent =
  | "renewal"
  | "signup"
  | "upgrade"
  | "contact_import"
  | "service_history_import"
  | "general";

export interface PromoteImmigrationRequest {
  immigration_id: string;
  source_channel: ImmigrationSourceChannel;
  intent: ImmigrationIntent;
  identity: {
    member_id?: string;
    line_id?: string;
    line_user_id?: string;
    full_name?: string;
    phone?: string;
  };
  membership?: {
    current_tier?: string;
    target_tier?: string;
  };
  notes: {
    manual_note_raw: string;
    operator_summary?: string;
  };
  service_history_summary: string;
  payload_json?: Record<string, unknown>;
  promotion_policy?: {
    create_if_missing?: boolean;
    overwrite_if_exists?: boolean;
    archive_raw_notes?: boolean;
  };
}

export interface PromoteImmigrationResponse {
  ok: true;
  data: {
    immigration_id: string;
    member_id: string;
    created_new_member: boolean;
    matched_existing_member: boolean;
    promotion_status: "promoted" | "needs_manual_review";
    archive_note_created: boolean;
    service_history_written: boolean;
  };
}

export interface AirtableListRecord<TFields = Record<string, unknown>> {
  id: string;
  fields: TFields;
  createdTime?: string;
}

export interface AirtableFetchOk<TData = unknown> {
  ok: true;
  data: TData;
}

export interface AirtableFetchErr {
  ok: false;
  error?: string;
  status?: number;
  data?: unknown;
}

export type AirtableFetchResult<TData = unknown> =
  | AirtableFetchOk<TData>
  | AirtableFetchErr;
