export interface Env {
  INTERNAL_TOKEN: string;
  ADMIN_WORKER?: Fetcher;
  BROWSER_GATE_PASSWORD?: string;
  BROWSER_GATE_USERNAME?: string;
  CONFIRM_KEY?: string;
  AIRTABLE_API_KEY?: string;
  AIRTABLE_BASE_ID: string;
  AIRTABLE_TABLE_LINE_INBOX: string;
  AIRTABLE_TABLE_CLIENTS?: string;
  AIRTABLE_TABLE_SESSIONS?: string;
  AIRTABLE_TABLE_PAYMENTS?: string;
  AIRTABLE_TABLE_POINTS_LEDGER?: string;
  ENABLE_AIRTABLE_SYNC?: string;
  JOBS_WORKER_BASE_URL?: string;
  CREATE_LINKS_URL?: string;
  REALTIME_SESSIONS_URL?: string;
  PUBLIC_WEB_BASE_URL?: string;
  PUBLIC_ALLOWED_ORIGINS?: string;
  AI_WORKER_BASE_URL?: string;
  ADMIN_WORKER_BASE_URL?: string;
  AIRTABLE_CLIENT_FIELD_CLIENT_NAME?: string;
  AIRTABLE_CLIENT_FIELD_NICKNAME?: string;
  AIRTABLE_CLIENT_FIELD_MMD_CLIENT_NAME?: string;
  AIRTABLE_CLIENT_FIELD_LINE_USER_ID?: string;
  AIRTABLE_CLIENT_FIELD_LINE_DISPLAY_NAME?: string;
  AIRTABLE_CLIENT_FIELD_EMAIL?: string;
  AIRTABLE_CLIENT_FIELD_PHONE_NUMBER?: string;
  AIRTABLE_CLIENT_FIELD_SOURCE?: string;
  AIRTABLE_CLIENT_FIELD_PRIMARY_CHANNEL?: string;
  AIRTABLE_CLIENT_FIELD_NOTES_RAW?: string;
  AIRTABLE_CLIENT_FIELD_STATUS?: string;
  AIRTABLE_CLIENT_FIELD_LINE_ID?: string;
  AIRTABLE_CLIENT_LOOKUP_FIELD_LINE_USER_ID?: string;
  AIRTABLE_CLIENT_LOOKUP_FIELD_EMAIL?: string;
  AIRTABLE_CLIENT_LOOKUP_FIELD_PHONE_NUMBER?: string;
  AIRTABLE_CLIENT_LOOKUP_FIELD_LINE_ID?: string;
  AIRTABLE_SESSION_FIELD_STATUS?: string;
  AIRTABLE_SESSION_FIELD_PAYMENT_STATUS?: string;
  AIRTABLE_SESSION_FIELD_PAYMENT_STAGE?: string;
  AIRTABLE_SESSION_FIELD_AMOUNT_THB?: string;
  AIRTABLE_SESSION_FIELD_FINAL_PRICE_THB?: string;
  AIRTABLE_SESSION_FIELD_CONFIRMATION_NOTES?: string;
  AIRTABLE_SESSION_FIELD_CUSTOMER_CONFIRMED_AT?: string;
  AIRTABLE_SESSION_FIELD_EXPIRE_AT?: string;
}

export type InviteRole = "customer" | "model";
export type InviteLane = "customer_onboarding" | "model_console";
export type DashboardAudience = "customer" | "model";
export type AssistantCore = "KENJI";
export type RouteGuide = "HITO" | "HIRO" | "HIEI" | "HIMA";
export type AccessType = "invitation_only";
export type ExperienceLane = "client" | "model";
export type ExperienceLayer = "trust_inme_underground" | "model_recruitment_gate";

export interface ExperienceContract {
  assistant_core: AssistantCore;
  route_guide: RouteGuide;
  access_type: AccessType;
  lane: ExperienceLane;
  layer: ExperienceLayer;
}

export interface ErrorBody {
  ok: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

export interface Meta {
  request_id: string;
  ts: string;
}

export type MigrationStatus =
  | "raw_inbox"
  | "parsed"
  | "needs_review"
  | "ready_to_sync"
  | "synced_to_airtable"
  | "promotion_pending"
  | "promoted_to_core"
  | "failed"
  | "cancelled";

export interface MigrationRecord {
  migration_id: string;
  source_channel: "line";
  source_user_id: string;
  source_message_id: string;
  received_at: string;
  raw_text: string;
  parsed_name?: string;
  parsed_phone?: string;
  parsed_intent?: string;
  parsed_budget_thb?: number;
  parsed_date?: string;
  parsed_location?: string;
  confidence_score: number;
  dedupe_status: "unresolved" | "linked_existing" | "create_new" | "conflict";
  linked_client_id?: string | null;
  flags: string[];
  migration_status: MigrationStatus;
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

export type PromotionStatus =
  | "received"
  | "archived_raw"
  | "identity_checked"
  | "promotion_pending"
  | "promoted"
  | "promotion_failed"
  | "needs_manual_review";

export interface ImmigrationIdentity {
  member_id?: string;
  line_id?: string;
  line_user_id?: string;
  full_name?: string;
  phone?: string;
}

export interface ImmigrationMembership {
  current_tier?: string;
  target_tier?: string;
}

export interface ImmigrationNotes {
  manual_note_raw: string;
  operator_summary?: string;
}

export interface ImmigrationIntakeRequest {
  immigration_id?: string;
  source_channel: ImmigrationSourceChannel;
  intent: ImmigrationIntent;
  identity: ImmigrationIdentity;
  membership?: ImmigrationMembership;
  notes: ImmigrationNotes;
  payload_json?: Record<string, unknown>;
}

export interface ImmigrationPromotionRecord {
  immigration_id: string;
  source_channel: ImmigrationSourceChannel;
  intent: ImmigrationIntent;
  identity: ImmigrationIdentity;
  membership?: ImmigrationMembership;
  notes: ImmigrationNotes;
  payload_json?: Record<string, unknown>;
  service_history_summary: string;
  promotion_status: PromotionStatus;
  promoted_member_id?: string;
  created_new_member?: boolean;
  archived_at: string;
  promoted_at?: string;
}

export interface ImmigrationIntakeResponse {
  ok: true;
  data: ImmigrationPromotionRecord;
  meta: Meta;
}

export interface LineClientIntakeRequest {
  immigration_id?: string;
  memberstack_id?: string;
  source_channel?: string;
  intake_source?: string;
  display_name?: string;
  nickname?: string;
  line_user_id?: string;
  line_id?: string;
  email?: string;
  phone?: string;
  member_email?: string;
  member_phone?: string;
  model_name?: string;
  model_record_id?: string;
  expires_in_hours?: number;
  telegram_chat_id?: string;
  telegram_message_thread_id?: number | string;
  notify_telegram?: boolean;
  legacy_tags?: string[] | string;
  manual_note?: string;
  operator_summary?: string;
  payload_json?: Record<string, unknown>;
  original_payload?: Record<string, unknown>;
  identity?: {
    display_name?: string;
    nickname?: string;
    line_user_id?: string;
    line_id?: string;
    email?: string;
    phone?: string;
    member_email?: string;
    member_phone?: string;
  };
  notes?: {
    manual_note?: string;
    operator_summary?: string;
  };
}

export interface MigrationTraceSummary {
  raw_legacy_tags: string[];
  inferred_base_membership: string;
  inferred_badge_tier: string;
  inferred_member_since: string;
  raw_line_id: string;
  operator_summary: string;
  manual_note: string;
}

export interface LineClientLookupStep {
  field: string;
  value: string;
}

export interface LineClientPreviewResponse {
  ok: true;
  data: {
    target_table: string;
    lookup_strategy: {
      table: string;
      steps: LineClientLookupStep[];
    };
    client_record_preview: {
      fields: Record<string, unknown>;
    };
    migration_trace: MigrationTraceSummary;
    existing_match: {
      airtable_record_id: string;
      matched_field: string;
      matched_value: string;
    } | null;
    mode: "airtable" | "mock";
  };
  meta: Meta;
}

export interface LineClientIntakeResponse {
  ok: true;
  data: {
    immigration_id: string;
    target_table: string;
    lookup_strategy: {
      table: string;
      steps: LineClientLookupStep[];
    };
    migration_trace: MigrationTraceSummary;
    mode: "airtable" | "mock";
    action: "created" | "updated";
    client: {
      airtable_record_id: string;
      fields: Record<string, unknown>;
    };
    inbox_record: {
      airtable_record_id: string;
      source: string;
      intent: string;
      status: string;
    } | null;
    promotion: {
      attempted: boolean;
      ok: boolean;
      member_id: string;
      promotion_status: string;
      created_new_member: boolean;
      error?: string;
    } | null;
    links: {
      immigration_id: string;
      expires_at: string;
      expires_in_hours: number;
      customer_token: string;
      model_token: string;
      customer_url: string;
      model_url: string;
      customer_rules_url: string;
      model_rules_url: string;
      customer_dashboard_url: string;
      model_dashboard_url: string;
      context: ImmigrationLinkContext;
    } | null;
    telegram: {
      attempted: boolean;
      ok: boolean;
      status?: number;
      error?: string;
    } | null;
  };
  meta: Meta;
}

export interface CreateJobRequest extends LineClientIntakeRequest {
  manual_note_raw?: string;
}

export interface CreateJobResponse {
  ok: true;
  data: {
    contract_version: "create_job_v1";
    immigration_id: string;
    promotion: {
      attempted: boolean;
      ok: boolean;
      member_id: string;
      promotion_status: string;
      created_new_member: boolean;
      error?: string;
    } | null;
    links: {
      immigration_id: string;
      expires_at: string;
      expires_in_hours: number;
      customer_token: string;
      model_token: string;
      customer_url: string;
      model_url: string;
      customer_rules_url: string;
      model_rules_url: string;
      customer_dashboard_url: string;
      model_dashboard_url: string;
      context: ImmigrationLinkContext;
    } | null;
    telegram: {
      attempted: boolean;
      ok: boolean;
      status?: number;
      error?: string;
    } | null;
    airtable: {
      client_record_id: string | null;
      inbox_record_id: string | null;
    };
    artifacts: {
      member_id: string;
      customer_url: string;
      model_url: string;
      customer_dashboard_url: string;
      model_dashboard_url: string;
      airtable: {
        client_record_id: string | null;
        inbox_record_id: string | null;
      };
      telegram: {
        attempted: boolean;
        ok: boolean;
        status?: number;
        error?: string;
      } | null;
    };
  };
  meta: Meta;
}

export interface ImmigrationPromoteRequest {
  immigration_id: string;
  source_channel: ImmigrationSourceChannel;
  intent: ImmigrationIntent;
  identity: ImmigrationIdentity;
  membership?: ImmigrationMembership;
  notes: ImmigrationNotes;
  payload_json?: Record<string, unknown>;
}

export interface ImmigrationPromoteResponse {
  ok: true;
  data: {
    immigration_id: string;
    member_id: string;
    promotion_status: PromotionStatus;
    created_new_member: boolean;
    service_history_summary: string;
  };
  meta: Meta;
}

export interface ImmigrationGetResponse {
  ok: true;
  data: ImmigrationPromotionRecord;
  meta: Meta;
}

export interface ImmigrationLinksRequest {
  immigration_id: string;
  display_name?: string;
  email?: string;
  line_user_id?: string;
  memberstack_id?: string;
  model_name?: string;
  model_record_id?: string;
  rules_url?: string;
  customer_rules_path?: string;
  model_rules_path?: string;
  console_url?: string;
  membership_status?: string;
  current_tier?: string;
  target_tier?: string;
  requires_rules_ack?: boolean;
  requires_model_binding?: boolean;
  customer_onboarding_path?: string;
  model_onboarding_path?: string;
  customer_dashboard_path?: string;
  model_dashboard_path?: string;
  expires_in_hours?: number;
}

export interface ImmigrationContextSession {
  session_id: string;
  service_date: string;
  expire_at: string;
  model_name: string;
  work_type: string;
  amount_total_thb: number;
  amount_paid_thb: number;
  balance_thb: number;
  payment_status: string;
  session_status: string;
  payment_ref: string;
}

export interface ImmigrationContextPointEntry {
  created_at: string;
  points_delta: number;
  entry_type: string;
}

export interface ImmigrationLinkContext {
  source: "airtable" | "mock";
  line_history: MigrationRecord[];
  service_history_summary: string;
  service_history: ImmigrationContextSession[];
  current_status: {
    active_session_id: string;
    latest_session_status: string;
    latest_payment_status: string;
  };
  points: {
    balance: number;
    total_earned: number;
    total_redeemed: number;
    entries: ImmigrationContextPointEntry[];
  };
  membership: {
    memberstack_id: string;
    status: string;
    current_tier: string;
    target_tier: string;
    expire_at: string;
    auto_signup_ready: boolean;
  };
}

export interface ImmigrationLinksResponse {
  ok: true;
  data: {
    immigration_id: string;
    expires_at: string;
    expires_in_hours: number;
    customer_token: string;
    model_token: string;
    customer_url: string;
    model_url: string;
    customer_rules_url: string;
    model_rules_url: string;
    customer_dashboard_url: string;
    model_dashboard_url: string;
    context: ImmigrationLinkContext;
  };
  meta: Meta;
}

export interface SessionLocationPoint {
  x: number;
  y: number;
}

export type LiveSessionStatus =
  | "confirmed"
  | "en_route"
  | "arrived"
  | "met"
  | "work_started"
  | "work_finished"
  | "separated";

export interface LiveSession {
  session_id: string;
  customer: string;
  model: string;
  status: LiveSessionStatus;
  eta_min: number;
  start: SessionLocationPoint;
  current: SessionLocationPoint;
  destination: SessionLocationPoint;
  updated_at: string;
  raw?: Record<string, unknown>;
}

export interface ControlRoomLog {
  log_id: string;
  scope: "immigration" | "sessions" | "sync" | "job-links";
  level: "info" | "warn" | "error";
  message: string;
  target_id?: string;
  ts: string;
}

export interface HealthResponse {
  ok: true;
  service: "immigrate-worker";
  version: string;
  airtable_sync_enabled: boolean;
  meta: Meta;
}

export interface LineInboxListResponse {
  ok: true;
  data: {
    records: MigrationRecord[];
    next_cursor: string | null;
    source: "seed" | "airtable";
  };
  meta: Meta;
}

export interface RefreshStatusRequest {
  migration_ids: string[];
}

export interface RefreshStatusResponse {
  ok: true;
  data: {
    updated: number;
    records: MigrationRecord[];
  };
  meta: Meta;
}

export interface SyncAirtableRequest {
  migration_ids: string[];
}

export interface SyncAirtableResponse {
  ok: true;
  data: {
    synced: number;
    mode: "mock" | "airtable";
    results: Array<{
      migration_id: string;
      airtable_record_id?: string;
      client_id?: string | null;
      migration_status: MigrationStatus;
    }>;
  };
  meta: Meta;
}

export interface LogsResponse {
  ok: true;
  logs: ControlRoomLog[];
  message: string;
  meta: Meta;
}

export interface SessionsResponse {
  ok: true;
  sessions: LiveSession[];
  message: string;
  meta: Meta;
}

export interface InvitePrefill {
  username: string;
  nickname: string;
  suffix_code: string;
  client_name: string;
  display_name: string;
  email: string;
  line_user_id: string;
  telegram_username: string;
  memberstack_id: string;
  model_name?: string;
  model_record_id?: string;
}

export interface InviteRequirements {
  rules_ack_required: boolean;
  model_binding_required: boolean;
}

export interface InviteResolveResponse {
  ok: true;
  invite_id: string;
  role: InviteRole;
  lane: InviteLane;
  prefill: InvitePrefill;
  requirements: InviteRequirements;
  immigration_id: string;
  model_profile: {
    model_name: string;
    model_record_id: string;
  };
  routes: {
    rules_url: string;
    console_url: string;
  };
  experience_contract: ExperienceContract;
  expires_at: string;
  meta: Meta;
}

export interface CustomerBookingConfirmRequest {
  session_id: string;
  payment_ref?: string;
  payment_type?: "deposit" | "full";
  selected_amount_thb?: number;
  note?: string;
  client_name?: string;
}

export interface CustomerBookingConfirmResponse {
  ok: true;
  data: {
    session_id: string;
    payment_ref: string;
    payment_type: "deposit" | "full";
    selected_amount_thb: number | null;
    session_status: string;
    payment_status: string;
    confirmed_at: string;
    mode: "airtable" | "mock";
  };
  meta: Meta;
}
