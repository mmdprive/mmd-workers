import { isAuthorized, readInternalToken } from "./lib/auth";
import { handleInternalRoutes } from "./internal-routes";
import {
  buildImmigrationLinkContext,
  canReadAirtable,
  confirmCustomerBookingToAirtable,
  intakeLineClientUpsert,
  listRecordsFromAirtable,
  listSessionsFromAirtable,
  patchClientMemberstackId,
  previewLineClientUpsert,
  syncRecordsToAirtable,
  writeLinkAuditRecord,
} from "./lib/airtable";
import { buildAbsoluteUrl, generateInviteLink, parseInviteIdentity, verifyInviteToken } from "./lib/invite";
import { badRequest, internalError, json, makeMeta, redirect, unauthorized } from "./lib/response";
import { seedLineInboxRecords, seedLogs, seedSessions } from "./lib/seed";
import type {
  CreateJobRequest,
  CreateJobResponse,
  CustomerBookingConfirmRequest,
  CustomerBookingConfirmResponse,
  ExperienceContract,
  Env,
  HealthResponse,
  ImmigrationLinkContext,
  ImmigrationGetResponse,
  ImmigrationIntakeRequest,
  ImmigrationIntakeResponse,
  ImmigrationLinksRequest,
  ImmigrationLinksResponse,
  LineClientIntakeRequest,
  LineClientIntakeResponse,
  LineClientPreviewResponse,
  ImmigrationPromoteRequest,
  ImmigrationPromoteResponse,
  ImmigrationPromotionRecord,
  ImmigrationSourceChannel,
  ImmigrationIntent,
  InviteLane,
  InviteRole,
  LineInboxListResponse,
  LogsResponse,
  Meta,
  MigrationRecord,
  InviteResolveResponse,
  InvitePrefill,
  InviteRequirements,
  RefreshStatusRequest,
  RefreshStatusResponse,
  SessionsResponse,
  SyncAirtableRequest,
  SyncAirtableResponse,
} from "./types";

const VERSION = "v0-mvp";
const CANONICAL = {
  ping: "/ping",
  health: "/v1/immigrate/health",
  linePreview: "/v1/immigrate/line/preview",
  lineIntake: "/v1/immigrate/line/intake",
  createJob: "/v1/admin/create-job",
  list: "/v1/immigrate/line-inbox",
  refresh: "/v1/immigrate/line-inbox/refresh-status",
  sync: "/v1/immigrate/line-inbox/sync-airtable",
  intake: "/v1/immigration/intake",
  promote: "/v1/immigration/promote",
  links: "/v1/immigration/links",
} as const;

const CONTROL_ROOM = {
  adminRoot: "/internal/admin",
  login: "/internal/admin/login",
  loginSession: "/internal/admin/login/session",
  verifyAccessCode: "/internal/admin/verify-access-code",
  root: "/internal/admin/control-room",
  health: "/internal/admin/control-room/health",
  list: "/internal/admin/control-room/line-inbox",
  refresh: "/internal/admin/control-room/refresh-status",
  sync: "/internal/admin/control-room/sync-airtable",
  logs: "/internal/admin/control-room/logs",
  sessions: "/internal/admin/control-room/sessions/live",
  sessionRefresh: "/internal/admin/control-room/sessions/refresh",
} as const;

const SIGIL = {
  root: "/sigil",
  adminRoot: "/sigil/admin",
  login: "/sigil/admin/login",
  loginSession: "/sigil/admin/login/session",
  verifyAccessCode: "/sigil/admin/verify-access-code",
  controlRoom: "/sigil/admin/control-room",
  controlRoomHealth: "/sigil/admin/control-room/health",
  controlRoomList: "/sigil/admin/control-room/line-inbox",
  controlRoomRefresh: "/sigil/admin/control-room/refresh-status",
  controlRoomSync: "/sigil/admin/control-room/sync-airtable",
  controlRoomLogs: "/sigil/admin/control-room/logs",
  controlRoomSessions: "/sigil/admin/control-room/sessions/live",
  controlRoomSessionRefresh: "/sigil/admin/control-room/sessions/refresh",
  createSession: "/sigil/admin/jobs/create-session",
  createJob: "/sigil/admin/jobs/create-job",
  inviteResolve: "/sigil/api/invite/resolve",
  renewalStatus: "/sigil/api/renewal/status",
  renewalIntake: "/sigil/api/renewal/intake",
  customerConfirm: "/sigil/api/jobs/customer-confirm",
} as const;

const ADMIN_JOBS = {
  createSession: "/internal/admin/create-session",
  createSessionLegacy: "/internal/admin/jobs/create-session",
} as const;

const JOBS = {
  root: "/internal/jobs",
  createJob: "/internal/jobs/create-job",
  modelHistoryBatch: "/internal/jobs/model-history-batch",
  modelHistoryImport: "/internal/jobs/model-history-import",
  privateProfileImport: "/internal/jobs/private-profile-import",
  bookingImport: "/internal/jobs/booking-import",
  importAll: "/internal/jobs/import-all",
  importLogs: "/internal/jobs/import-logs",
  createLinks: "/internal/jobs/create-links",
  createInvite: "/internal/jobs/create-invite-link",
  customerConfirm: "/internal/jobs/customer-confirm",
} as const;

const PUBLIC = {
  onboardingResolve: "/member/api/invite/resolve",
  renewalStatus: "/member/api/renewal/status",
  renewalIntake: "/member/api/renewal/intake",
  customerConfirm: "/member/api/jobs/customer-confirm",
} as const;

const ADMIN_GATE_SESSION_KEY = "mmd_admin_gate_v1";
const ADMIN_GATE_TTL_MS = 8 * 60 * 60 * 1000;
const ADMIN_GATE_DEFAULT_NEXT = CONTROL_ROOM.root;
const ADMIN_GATE_ALLOWED_BASE_URLS = new Set([
  "https://mmdbkk.com",
  "https://www.mmdbkk.com",
  "https://admin-worker.malemodel-bkk.workers.dev",
  "https://immigrate-worker.malemodel-bkk.workers.dev",
  "https://mmdprive.webflow.io",
  "https://mmdprive.com",
]);

type AdminGateSession = {
  ok: true;
  at: number;
  baseUrl: string;
  bearer?: string;
  confirmKey?: string;
};

function readSeedRecords(): MigrationRecord[] {
  return seedLineInboxRecords.map((record) => ({ ...record, flags: [...record.flags] }));
}

function applyFilters(records: MigrationRecord[], url: URL): MigrationRecord[] {
  const status = url.searchParams.get("status");
  const search = (url.searchParams.get("search") || "").trim().toLowerCase();
  let filtered = records;

  if (status) {
    filtered = filtered.filter((record) => record.migration_status === status);
  }

  if (search) {
    filtered = filtered.filter((record) => {
      return [
        record.migration_id,
        record.raw_text,
        record.parsed_name || "",
        record.parsed_location || "",
        record.parsed_intent || "",
      ]
        .join(" ")
        .toLowerCase()
        .includes(search);
    });
  }

  return filtered;
}

function refreshRecord(record: MigrationRecord): MigrationRecord {
  const refreshedFlags = [...record.flags];
  if (!record.parsed_name && !refreshedFlags.includes("missing_name")) refreshedFlags.push("missing_name");
  if (!record.parsed_budget_thb && !refreshedFlags.includes("missing_budget")) refreshedFlags.push("missing_budget");
  if (!record.parsed_date && !refreshedFlags.includes("missing_date")) refreshedFlags.push("missing_date");

  let nextStatus = record.migration_status;
  if (record.parsed_name && record.parsed_intent === "booking") {
    nextStatus = record.parsed_budget_thb ? "ready_to_sync" : "needs_review";
  } else if (record.parsed_intent) {
    nextStatus = "parsed";
  }

  return {
    ...record,
    confidence_score: Math.min(0.99, Number((record.confidence_score + 0.03).toFixed(2))),
    flags: Array.from(new Set(refreshedFlags)),
    migration_status: nextStatus,
  };
}

function toStr(value: unknown): string {
  return String(value ?? "").trim();
}

function toNum(value: unknown): number | null {
  const n = Number(String(value ?? "").replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : null;
}

function requiredString(value: unknown, field: string): string {
  const s = toStr(value);
  if (!s) throw new Error(`missing_${field}`);
  return s;
}

function makeInviteId(): string {
  return `invite_${crypto.randomUUID().slice(0, 8)}_${Date.now().toString(36)}`;
}

function makeImmigrationId(): string {
  return `img_${crypto.randomUUID().slice(0, 8)}_${Date.now().toString(36)}`;
}

function parseSourceChannel(value: unknown): ImmigrationSourceChannel {
  const raw = toStr(value).toLowerCase();
  if (
    raw === "renewal" ||
    raw === "signup" ||
    raw === "upgrade" ||
    raw === "import" ||
    raw === "operator"
  ) {
    return raw;
  }
  return "line";
}

function parseImmigrationIntent(value: unknown): ImmigrationIntent {
  const raw = toStr(value).toLowerCase();
  if (
    raw === "renewal" ||
    raw === "signup" ||
    raw === "upgrade" ||
    raw === "contact_import" ||
    raw === "service_history_import"
  ) {
    return raw;
  }
  return "general";
}

function buildServiceHistorySummary(
  notes: { manual_note_raw: string; operator_summary?: string },
  identity?: { full_name?: string },
): string {
  const summaryParts = [
    identity?.full_name ? `Client: ${identity.full_name}` : "",
    notes.operator_summary ? `Operator summary: ${notes.operator_summary}` : "",
    notes.manual_note_raw ? `Manual notes: ${notes.manual_note_raw}` : "",
  ].filter(Boolean);

  return summaryParts.join(" | ").slice(0, 1000);
}

function buildPromotionRecord(
  payload: ImmigrationIntakeRequest | ImmigrationPromoteRequest,
  overrides?: Partial<ImmigrationPromotionRecord>,
): ImmigrationPromotionRecord {
  const archivedAt = new Date().toISOString();
  return {
    immigration_id: toStr(payload.immigration_id) || makeImmigrationId(),
    source_channel: parseSourceChannel(payload.source_channel),
    intent: parseImmigrationIntent(payload.intent),
    identity: {
      member_id: toStr(payload.identity?.member_id) || undefined,
      line_id: toStr(payload.identity?.line_id) || undefined,
      line_user_id: toStr(payload.identity?.line_user_id) || undefined,
      full_name: toStr(payload.identity?.full_name) || undefined,
      phone: toStr(payload.identity?.phone) || undefined,
    },
    membership: payload.membership
      ? {
          current_tier: toStr(payload.membership.current_tier) || undefined,
          target_tier: toStr(payload.membership.target_tier) || undefined,
        }
      : undefined,
    notes: {
      manual_note_raw: toStr(payload.notes.manual_note_raw),
      operator_summary: toStr(payload.notes.operator_summary) || undefined,
    },
    payload_json: payload.payload_json,
    service_history_summary: buildServiceHistorySummary(payload.notes, payload.identity),
    promotion_status: "archived_raw",
    archived_at: archivedAt,
    ...overrides,
  };
}

function promoteRecord(record: ImmigrationPromotionRecord): ImmigrationPromotionRecord {
  const existingMemberId = toStr(record.identity.member_id);
  const derivedMemberId =
    existingMemberId ||
    `mem_${(record.identity.line_user_id || record.identity.line_id || record.immigration_id).replace(/[^a-zA-Z0-9]+/g, "_").slice(0, 32)}`;

  return {
    ...record,
    promoted_member_id: derivedMemberId,
    created_new_member: !existingMemberId,
    promotion_status: derivedMemberId ? "promoted" : "needs_manual_review",
    promoted_at: new Date().toISOString(),
  };
}

function isIntakeRoute(pathname: string): boolean {
  return pathname === CANONICAL.intake;
}

function isLinePreviewRoute(pathname: string): boolean {
  return pathname === CANONICAL.linePreview;
}

function isLineIntakeRoute(pathname: string): boolean {
  return pathname === CANONICAL.lineIntake;
}

function isCreateJobRoute(pathname: string): boolean {
  return pathname === CANONICAL.createJob;
}

function isPromoteRoute(pathname: string): boolean {
  return pathname === CANONICAL.promote;
}

function isLinksRoute(pathname: string): boolean {
  return pathname === CANONICAL.links;
}

function getImmigrationIdFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/v1\/immigration\/([^/]+)$/);
  return match ? decodeURIComponent(match[1]) : null;
}

type InvitePayload = {
  username?: string;
  nickname?: string;
  suffix_code?: string;
  mmd_client_name?: string;
  client_name?: string;
  folder_name?: string;
  line_user_id?: string;
  telegram_username?: string;
  customer_telegram_username?: string;
  memberstack_id?: string;
  email?: string;
  gmail?: string;
  invite_page?: string;
  expires_in_hours?: number;
  invite_role?: InviteRole;
  invite_lane?: InviteLane;
  model_name?: string;
  model_record_id?: string;
  rules_url?: string;
  console_url?: string;
  requires_rules_ack?: boolean;
  requires_model_binding?: boolean;
  session_id?: string;
  payment_ref?: string;
  job_type?: string;
  job_date?: string;
  start_time?: string;
  end_time?: string;
  location_name?: string;
  google_map_url?: string;
  amount_thb?: number | string;
  amount?: number | string;
  payment_type?: string;
  payment_stage?: string;
  payment_method?: string;
  note?: string;
  notes?: string;
  confirm_page?: string;
  model_confirm_page?: string;
};

function toInviteIdentityPayload(payload: InvitePayload) {
  return {
    username: payload.username,
    nickname: payload.nickname,
    suffix_code: payload.suffix_code,
    mmd_client_name: payload.mmd_client_name,
    client_name: payload.client_name,
    folder_name: payload.folder_name || payload.model_name,
    line_user_id: payload.line_user_id,
    telegram_username: payload.telegram_username || payload.customer_telegram_username,
    memberstack_id: payload.memberstack_id,
    email: payload.email,
    gmail: payload.gmail,
  };
}

function parseInviteRole(value: unknown): InviteRole {
  return String(value || "").trim().toLowerCase() === "model" ? "model" : "customer";
}

function parseInviteLane(value: unknown, role: InviteRole): InviteLane {
  const lane = String(value || "").trim().toLowerCase();
  if (lane === "model_console") return "model_console";
  if (lane === "customer_onboarding") return "customer_onboarding";
  return role === "model" ? "model_console" : "customer_onboarding";
}

function boolFromUnknown(value: unknown, fallback: boolean): boolean {
  if (value == null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  const raw = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "y"].includes(raw)) return true;
  if (["0", "false", "no", "n"].includes(raw)) return false;
  return fallback;
}

function hasCreateLinksUpstream(env: Env): boolean {
  return Boolean(toStr(env.CREATE_LINKS_URL) || toStr(env.JOBS_WORKER_BASE_URL));
}

function isPaymentsConfirmLinkMode(env: Env): boolean {
  return Boolean(toStr(env.CREATE_LINKS_URL)) && !toStr(env.JOBS_WORKER_BASE_URL);
}

function buildDefaultBookingNote(payload: InvitePayload): string {
  return [
    toStr(payload.job_type) || "job",
    toStr(payload.job_date),
    toStr(payload.start_time) && toStr(payload.end_time)
      ? `${toStr(payload.start_time)}-${toStr(payload.end_time)}`
      : "",
    toStr(payload.location_name),
  ]
    .filter(Boolean)
    .join(" | ");
}

function normalizeCreateLinksPayload(
  payload: InvitePayload,
  env: Env,
): Record<string, unknown> {
  const normalized: Record<string, unknown> = { ...payload };

  if (!isPaymentsConfirmLinkMode(env)) {
    return normalized;
  }

  const requiredFields = [
    "client_name",
    "model_name",
    "job_type",
    "job_date",
    "start_time",
    "end_time",
    "location_name",
  ] as const;

  for (const field of requiredFields) {
    requiredString(payload[field], field);
    normalized[field] = toStr(payload[field]);
  }

  const amountThb = toNum(payload.amount_thb ?? payload.amount);
  if (!amountThb || amountThb <= 0) {
    throw new Error("missing_amount_thb");
  }

  normalized.amount_thb = amountThb;
  normalized.payment_type = toStr(payload.payment_type || payload.payment_stage || "deposit");
  normalized.payment_method = toStr(payload.payment_method || "promptpay");
  normalized.google_map_url = toStr(payload.google_map_url);
  normalized.note = toStr(payload.note || payload.notes) || buildDefaultBookingNote(payload);

  return normalized;
}

function buildExperienceContract(role: InviteRole, lane: InviteLane): ExperienceContract {
  if (role === "model" || lane === "model_console") {
    return {
      assistant_core: "KENJI",
      route_guide: "HIMA",
      access_type: "invitation_only",
      lane: "model",
      layer: "model_recruitment_gate",
    };
  }

  return {
    assistant_core: "KENJI",
    route_guide: "HITO",
    access_type: "invitation_only",
    lane: "client",
    layer: "trust_inme_underground",
  };
}

function getPublicAllowedOrigins(env: Env): string[] {
  return String(
    env.PUBLIC_ALLOWED_ORIGINS ||
      "https://mmdbkk.com,https://www.mmdbkk.com,https://mmdprive.com,https://www.mmdprive.com,https://mmdprive.webflow.io",
  )
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function buildCorsHeaders(request: Request, env: Env): Headers {
  const headers = new Headers();
  const origin = request.headers.get("origin") || "";
  const allowed = getPublicAllowedOrigins(env);

  if (origin && allowed.includes(origin)) {
    headers.set("access-control-allow-origin", origin);
    headers.set("vary", "origin");
  }

  headers.set("access-control-allow-methods", "POST,OPTIONS");
  headers.set("access-control-allow-headers", "content-type, authorization, x-internal-token");
  headers.set("access-control-max-age", "86400");
  return headers;
}

function withCors(request: Request, env: Env, response: Response): Response {
  const headers = new Headers(response.headers);
  const cors = buildCorsHeaders(request, env);
  cors.forEach((value, key) => headers.set(key, value));
  return new Response(response.body, {
    status: response.status,
    headers,
  });
}

function publicJson(request: Request, env: Env, data: unknown, init?: ResponseInit): Response {
  return withCors(request, env, json(data, init));
}

type PublicRenewalStatusRequest = {
  email?: string;
  email_primary?: string;
  email_secondary?: string;
  nickname?: string;
  display_name?: string;
  line_user_id?: string;
  line_display_name?: string;
  memberstack_id?: string;
  include_context?: boolean;
  source_page?: string;
  search_priority?: string;
};

type PublicRenewalStatusResponse = {
  ok: true;
  data: {
    found: boolean;
    email: string;
    member_id: string;
    memberstack_id: string;
    display_name: string;
    membership_status: string;
    current_tier: string;
    expire_at: string;
    total_sessions: number;
    total_spend_thb: number;
    points_balance: number;
    points_total_earned: number;
    points_total_redeemed: number;
    service_history_summary: string;
    promotion_status: string;
    pricing_decision_thb: number;
    pricing_reason: string;
    line_context_found: boolean;
    context?: ImmigrationLinkContext;
  };
  meta: Meta;
};

type RenewalStatusProjection = PublicRenewalStatusResponse["data"];

function sumTotalSpendFromContext(context: ImmigrationLinkContext): number {
  return (context.service_history || []).reduce((sum, row) => {
    const amount = Number(row.amount_total_thb || 0);
    return sum + (Number.isFinite(amount) ? amount : 0);
  }, 0);
}

function deriveMembershipStatus(input: {
  current_status_latest_session_status: string;
  membership_status: string;
  expire_at?: string;
  found: boolean;
}): string {
  if (!input.found) return "not_found";
  const raw = toStr(input.membership_status).toLowerCase();
  if (raw) return raw;

  const expireAt = toStr(input.expire_at);
  if (expireAt) {
    const t = new Date(expireAt).getTime();
    if (Number.isFinite(t)) {
      return t >= Date.now() ? "active" : "expired";
    }
  }

  const latest = toStr(input.current_status_latest_session_status).toLowerCase();
  if (["confirmed", "en_route", "arrived", "met", "work_started"].includes(latest)) {
    return "active";
  }

  return "found";
}

function derivePricingDecision(
  totalSpendTHB: number,
  currentTier: string,
  intentHint?: string,
): { pricing_decision_thb: number; pricing_reason: string } {
  const tier = toStr(currentTier).toLowerCase();
  const intent = toStr(intentHint).toLowerCase();

  if (totalSpendTHB >= 100000) {
    return { pricing_decision_thb: 0, pricing_reason: "service_spend_gte_100000" };
  }

  if (totalSpendTHB >= 15000) {
    return {
      pricing_decision_thb: 2000,
      pricing_reason: "service_spend_between_15000_and_99999",
    };
  }

  if (intent === "upgrade") {
    return { pricing_decision_thb: 2000, pricing_reason: "upgrade_default" };
  }

  if (["premium", "vip", "svip", "blackcard"].includes(tier)) {
    return {
      pricing_decision_thb: 2000,
      pricing_reason: "existing_paid_tier_but_below_free_threshold",
    };
  }

  return { pricing_decision_thb: 2500, pricing_reason: "gap_or_new_or_low_history" };
}

async function buildRenewalStatusProjection(
  env: Env,
  input: {
    email?: string;
    display_name?: string;
    line_user_id?: string;
    memberstack_id?: string;
    current_tier?: string;
    target_tier?: string;
    membership_status?: string;
    expire_at?: string;
    intent_hint?: string;
  },
): Promise<{ projection: RenewalStatusProjection; context: ImmigrationLinkContext }> {
  const context = await buildImmigrationLinkContext(env, {
    line_user_id: input.line_user_id,
    memberstack_id: input.memberstack_id,
    email: input.email,
    display_name: input.display_name,
    current_tier: input.current_tier,
    target_tier: input.target_tier,
    membership_status: input.membership_status,
  });

  const totalSpendTHB = sumTotalSpendFromContext(context);
  const totalSessions = Array.isArray(context.service_history) ? context.service_history.length : 0;
  const lineContextFound = Array.isArray(context.line_history) && context.line_history.length > 0;
  const memberstackId = toStr(context.membership?.memberstack_id || input.memberstack_id);
  const found = Boolean(memberstackId || totalSessions > 0 || lineContextFound);
  const membershipExpireAt = toStr(context.membership?.expire_at || input.expire_at);
  const membershipStatus = deriveMembershipStatus({
    current_status_latest_session_status: context.current_status?.latest_session_status || "",
    membership_status: toStr(context.membership?.status || input.membership_status),
    expire_at: membershipExpireAt,
    found,
  });
  const currentTier = toStr(context.membership?.current_tier || input.current_tier);
  const pricing = derivePricingDecision(totalSpendTHB, currentTier, input.intent_hint);
  const normalizedContext: ImmigrationLinkContext = {
    ...context,
    membership: {
      ...context.membership,
      status: found ? membershipStatus : "not_found",
      expire_at: membershipExpireAt,
    },
  };

  return {
    projection: {
      found,
      email: toStr(input.email).toLowerCase(),
      member_id: memberstackId,
      memberstack_id: memberstackId,
      display_name: toStr(input.display_name),
      membership_status: found ? membershipStatus : "not_found",
      current_tier: currentTier,
      expire_at: membershipExpireAt,
      total_sessions: totalSessions,
      total_spend_thb: totalSpendTHB,
      points_balance: Number(context.points?.balance || 0),
      points_total_earned: Number(context.points?.total_earned || 0),
      points_total_redeemed: Number(context.points?.total_redeemed || 0),
      service_history_summary: toStr(context.service_history_summary),
      promotion_status: lineContextFound ? "identity_checked" : "",
      pricing_decision_thb: pricing.pricing_decision_thb,
      pricing_reason: pricing.pricing_reason,
      line_context_found: lineContextFound,
      context: normalizedContext,
    },
    context: normalizedContext,
  };
}

async function handlePublicRenewalStatus(request: Request, env: Env): Promise<Response> {
  const meta = makeMeta(request);
  const body = (await request.json().catch(() => null)) as PublicRenewalStatusRequest | null;

  if (!body || typeof body !== "object") {
    return publicJson(
      request,
      env,
      { ok: false, error: { code: "INVALID_INPUT", message: "valid renewal status payload is required" }, meta },
      { status: 400 },
    );
  }

  const emailPrimary = toStr(body.email_primary || body.email).toLowerCase();
  const emailSecondary = toStr(body.email_secondary).toLowerCase();
  const email = emailPrimary || emailSecondary;

  if (!email) {
    return publicJson(
      request,
      env,
      { ok: false, error: { code: "INVALID_INPUT", message: "email or email_primary is required" }, meta },
      { status: 400 },
    );
  }

  if (!isValidEmailAddress(email)) {
    return publicJson(
      request,
      env,
      { ok: false, error: { code: "INVALID_INPUT", message: "email format is invalid" }, meta },
      { status: 400 },
    );
  }

  const displayName = toStr(body.display_name || body.nickname || body.line_display_name);
  const { projection, context } = await buildRenewalStatusProjection(env, {
    email,
    display_name: displayName,
    line_user_id: toStr(body.line_user_id),
    memberstack_id: toStr(body.memberstack_id),
    intent_hint: toStr(body.search_priority) === "upgrade" ? "upgrade" : "renewal",
  });

  return publicJson(request, env, {
    ok: true,
    data: body.include_context ? projection : { ...projection, context: undefined },
    meta,
  } satisfies PublicRenewalStatusResponse);
}

type PublicRenewalBody = {
  display_name?: string;
  name?: string;
  nickname?: string;
  email?: string;
  email_primary?: string;
  email_secondary?: string;
  line_id?: string;
  line_user_id?: string;
  phone?: string;
  contact?: string;
  telegram?: string;
  telegram_username?: string;
  member_ref?: string;
  member_id?: string;
  memberstack_id?: string;
  current_tier_hint?: string;
  target_tier?: string;
  package?: string;
  package_code?: string;
  package_label?: string;
  total?: number | string;
  payment_method?: string;
  flow?: string;
  page?: string;
  source_page?: string;
  admin_context?: string;
  service_history_note?: string;
  note?: string;
  manual_note?: string;
  raw_json?: string;
  model_name?: string;
  model_record_id?: string;
  telegram_chat_id?: string;
  telegram_message_thread_id?: string | number;
  notify_telegram?: boolean | string;
  [key: string]: unknown;
};

function buildPublicRenewalPayload(body: PublicRenewalBody): ImmigrationIntakeRequest {
  const displayName = toStr(body.display_name || body.name);
  const currentTier = toStr(body.current_tier_hint);
  const targetTier = toStr(body.target_tier || body.package_label || body.package_code || body.package);
  const paymentMethod = toStr(body.payment_method || "bank_transfer");
  const historyNote = toStr(body.service_history_note || body.manual_note || body.note);
  const amount = toNum(body.total);
  const lineUserId = toStr(body.line_user_id);
  const lineId = toStr(body.line_id);

  const sourceChannel = lineUserId || lineId ? "line" : "renewal";
  const intent = toStr(body.flow).toLowerCase() === "upgrade" ? "upgrade" : "renewal";
  const operatorSummary = [
    "renewal_web_intake",
    targetTier ? `target:${targetTier}` : "",
    currentTier ? `current:${currentTier}` : "",
    paymentMethod ? `payment:${paymentMethod}` : "",
    Number.isFinite(amount) ? `amount:${amount}` : "",
  ]
    .filter(Boolean)
    .join(" | ");

  return {
    source_channel: sourceChannel,
    intent,
    identity: {
      member_id: toStr(body.member_id || body.memberstack_id || body.member_ref) || undefined,
      line_id: lineId || undefined,
      line_user_id: lineUserId || undefined,
      full_name: displayName || undefined,
      phone: toStr(body.phone || body.contact) || undefined,
    },
    membership: {
      current_tier: currentTier || undefined,
      target_tier: targetTier || undefined,
    },
    notes: {
      manual_note_raw: historyNote || "",
      operator_summary: operatorSummary || undefined,
    },
    payload_json: {
      email: toStr(body.email),
      package: toStr(body.package),
      package_code: toStr(body.package_code),
      package_label: toStr(body.package_label),
      amount_thb: amount ?? undefined,
      payment_method: paymentMethod,
      page: toStr(body.page),
      source_page: toStr(body.source_page),
      admin_context: toStr(body.admin_context),
      raw_json: toStr(body.raw_json),
    },
  };
}

function isValidEmailAddress(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function buildRenewalLineIntakePayload(
  body: PublicRenewalBody,
  payload: ImmigrationIntakeRequest,
  immigrationId: string,
): LineClientIntakeRequest {
  const emailPrimary = toStr(body.email_primary || body.email);
  const emailSecondary = toStr(body.email_secondary);
  const emailCandidates = [emailPrimary, emailSecondary].filter(Boolean);
  const phone = toStr(body.phone || body.contact);
  const telegramUsername = toStr(body.telegram_username || body.telegram);
  const nickname = toStr(body.nickname || body.display_name || body.name);
  const messageThreadId = toStr(body.telegram_message_thread_id) || "61";

  return {
    immigration_id: immigrationId,
    memberstack_id: toStr(body.memberstack_id || body.member_id || body.member_ref),
    source_channel: payload.source_channel,
    intake_source: payload.source_channel === "renewal" ? "renewal_web" : "line",
    display_name: toStr(payload.identity.full_name),
    nickname: nickname || toStr(payload.identity.full_name),
    line_user_id: toStr(body.line_user_id),
    line_id: toStr(body.line_id),
    email: emailPrimary || toStr(payload.payload_json?.email),
    member_email: emailPrimary || toStr(payload.payload_json?.email),
    phone,
    member_phone: phone,
    model_name: toStr(body.model_name),
    model_record_id: toStr(body.model_record_id),
    telegram_chat_id: toStr(body.telegram_chat_id),
    telegram_message_thread_id: messageThreadId,
    notify_telegram: body.notify_telegram !== false && toStr(body.notify_telegram).toLowerCase() !== "false",
    manual_note: toStr(payload.notes.manual_note_raw),
    operator_summary: toStr(payload.notes.operator_summary),
    payload_json: {
      ...(payload.payload_json && typeof payload.payload_json === "object" ? payload.payload_json : {}),
      source_channel: payload.source_channel,
      intake_source: payload.source_channel === "renewal" ? "renewal_web" : "line",
      email_primary: emailPrimary,
      email_secondary: emailSecondary,
      email_candidates: emailCandidates,
      telegram_username: telegramUsername,
      renewal_flow: toStr(body.flow),
      renewal_source_page: toStr(body.source_page || body.page),
      requested_goal: toStr(body.desired_goal),
      payment_method_label: toStr(body.payment_method_label),
      legacy_membership_proof_name: toStr(body.legacy_membership_proof_name),
      legacy_membership_proof_present: Boolean(body.legacy_membership_proof_present),
      confirmation_mode: toStr(body.confirmation_mode),
    },
    original_payload: Object.fromEntries(Object.entries(body)),
  };
}

function buildRenewalMigrationRecord(
  payload: ImmigrationIntakeRequest,
  immigrationId: string,
): MigrationRecord {
  const rawText = [
    payload.notes.manual_note_raw,
    payload.notes.operator_summary || "",
    payload.identity.full_name ? `Client: ${payload.identity.full_name}` : "",
    payload.membership?.current_tier ? `Current tier: ${payload.membership.current_tier}` : "",
    payload.membership?.target_tier ? `Target tier: ${payload.membership.target_tier}` : "",
  ]
    .filter(Boolean)
    .join(" | ");

  return {
    migration_id: immigrationId,
    source_channel: "line",
    source_user_id: payload.identity.line_user_id || payload.identity.line_id || payload.identity.member_id || immigrationId,
    source_message_id: `renewal_${Date.now().toString(36)}`,
    received_at: new Date().toISOString(),
    raw_text: rawText,
    parsed_name: payload.identity.full_name,
    parsed_phone: payload.identity.phone,
    parsed_intent: payload.intent,
    parsed_budget_thb: toNum(payload.payload_json?.amount_thb) ?? undefined,
    parsed_date: undefined,
    parsed_location: "renewal_web",
    confidence_score: 0.99,
    dedupe_status: "unresolved",
    linked_client_id: null,
    flags: ["renewal_web", "manual_history_seed"],
    migration_status: "ready_to_sync",
  };
}

async function handlePublicRenewalIntake(request: Request, env: Env): Promise<Response> {
  const meta = makeMeta(request);
  const rawBody = (await request.json().catch(() => null)) as PublicRenewalBody | null;

  if (!rawBody || typeof rawBody !== "object") {
    return publicJson(
      request,
      env,
      {
        ok: false,
        error: { code: "INVALID_INPUT", message: "valid renewal payload is required" },
        meta,
      },
      { status: 400 },
    );
  }

  const payload = buildPublicRenewalPayload(rawBody);
  const validationErrors: string[] = [];
  const fullName = toStr(payload.identity.full_name);
  const email = toStr(payload.payload_json?.email).toLowerCase();
  const historyNote = toStr(payload.notes.manual_note_raw);

  if (!fullName) validationErrors.push("display_name or name is required");
  if (!email) validationErrors.push("email is required");
  else if (!isValidEmailAddress(email)) validationErrors.push("email format is invalid");
  if (!historyNote) validationErrors.push("service_history_note or note is required");

  if (validationErrors.length) {
    return publicJson(
      request,
      env,
      {
        ok: false,
        error: { code: "INVALID_INPUT", message: validationErrors.join("; ") },
        meta,
      },
      { status: 400 },
    );
  }

  const record = buildPromotionRecord(payload, {
    promotion_status: "archived_raw",
  });
  const promotePreview = promoteRecord(record);
  const renewalLinePayload = buildRenewalLineIntakePayload(rawBody, payload, record.immigration_id);

  let intakeResult: Awaited<ReturnType<typeof intakeLineClientUpsert>> | null = null;
  let promotion:
    | {
        attempted: boolean;
        ok: boolean;
        member_id: string;
        promotion_status: string;
        created_new_member: boolean;
        error?: string;
      }
    | null = null;
  let links: Awaited<ReturnType<typeof createLineLinksAfterPromotion>> | null = null;
  let telegram:
    | {
        attempted: boolean;
        ok: boolean;
        status?: number;
        error?: string;
      }
    | null = null;

  try {
    intakeResult = await intakeLineClientUpsert(env, renewalLinePayload);
    promotion = await promoteLineClientAfterIntake(env, renewalLinePayload, intakeResult);
    links = await createLineLinksAfterPromotion(env, renewalLinePayload, intakeResult, promotion);
    telegram = await notifyTelegramForLineIntake(env, renewalLinePayload, promotion, links);
  } catch (error) {
    return publicJson(
      request,
      env,
      {
        ok: false,
        error: {
          code: "RENEWAL_INTAKE_PIPELINE_FAILED",
          message: error instanceof Error ? error.message : "Renewal intake pipeline failed",
        },
        meta,
      },
      { status: 502 },
    );
  }

  return publicJson(request, env, {
    ok: true,
    data: {
      immigration_id: record.immigration_id,
      service_history_summary: record.service_history_summary,
      promotion_status: promotion?.promotion_status || record.promotion_status,
      member_id_preview: promotion?.member_id || promotePreview.promoted_member_id || "",
      created_new_member_preview: promotion?.created_new_member ?? Boolean(promotePreview.created_new_member),
      sync: intakeResult
        ? {
            mode: intakeResult.mode,
            result: {
              migration_id: intakeResult.immigration_id,
              airtable_record_id: intakeResult.inbox_record?.airtable_record_id || "",
              client_id: intakeResult.client?.airtable_record_id || null,
              migration_status: "synced_to_airtable" as const,
            },
          }
        : null,
      airtable: intakeResult
        ? {
            action: intakeResult.action,
            target_table: intakeResult.target_table,
            existing_match: intakeResult.existing_match,
            client: intakeResult.client,
            inbox_record: intakeResult.inbox_record,
          }
        : null,
      promotion: promotion || null,
      links: links || null,
      telegram: telegram || null,
    },
    meta,
  });
}

async function handleList(request: Request, env: Env): Promise<Response> {
  const meta = makeMeta(request);
  const url = new URL(request.url);
  const cursor = url.searchParams.get("cursor");

  let records = readSeedRecords();
  let next_cursor: string | null = null;
  let source: "seed" | "airtable" = "seed";

  if (canReadAirtable(env)) {
    try {
      const airtable = await listRecordsFromAirtable(env, cursor);
      records = airtable.records;
      next_cursor = airtable.next_cursor;
      source = "airtable";
    } catch (error) {
      console.warn("immigrate-worker list fallback to seed", error);
    }
  }

  records = applyFilters(records, url);

  const body: LineInboxListResponse = {
    ok: true,
    data: {
      records,
      next_cursor,
      source,
    },
    meta,
  };

  return json(body);
}

async function handleRefresh(request: Request): Promise<Response> {
  const meta = makeMeta(request);
  const payload = (await request.json()) as Partial<RefreshStatusRequest>;
  const migrationIds = Array.isArray(payload.migration_ids) ? payload.migration_ids : [];

  if (!migrationIds.length) {
    return badRequest("migration_ids is required", meta, { field: "migration_ids" });
  }

  const refreshed = readSeedRecords()
    .filter((record) => migrationIds.includes(record.migration_id))
    .map(refreshRecord);

  const body: RefreshStatusResponse = {
    ok: true,
    data: {
      updated: refreshed.length,
      records: refreshed,
    },
    meta,
  };

  return json(body);
}

async function handleSync(request: Request, env: Env): Promise<Response> {
  const meta = makeMeta(request);
  const payload = (await request.json()) as Partial<SyncAirtableRequest>;
  const migrationIds = Array.isArray(payload.migration_ids) ? payload.migration_ids : [];

  if (!migrationIds.length) {
    return badRequest("migration_ids is required", meta, { field: "migration_ids" });
  }

  const records = readSeedRecords()
    .filter((record) => migrationIds.includes(record.migration_id))
    .map((record) => ({ ...record, migration_status: "synced_to_airtable" as const }));

  const result = await syncRecordsToAirtable(env, records);

  const body: SyncAirtableResponse = {
    ok: true,
    data: {
      synced: result.results.length,
      mode: result.mode,
      results: result.results,
    },
    meta,
  };

  return json(body);
}

async function handleIntake(request: Request): Promise<Response> {
  const meta = makeMeta(request);
  const payload = (await request.json().catch(() => null)) as ImmigrationIntakeRequest | null;

  if (!payload || typeof payload !== "object") {
    return badRequest("valid intake payload is required", meta);
  }

  if (!toStr(payload.notes?.manual_note_raw)) {
    return badRequest("notes.manual_note_raw is required", meta, {
      field: "notes.manual_note_raw",
    });
  }

  const record = buildPromotionRecord(payload, {
    promotion_status: "archived_raw",
  });

  const body: ImmigrationIntakeResponse = {
    ok: true,
    data: record,
    meta,
  };

  return json(body);
}

async function handleLinePreview(request: Request, env: Env): Promise<Response> {
  const meta = makeMeta(request);
  const payload = (await request.json().catch(() => null)) as LineClientIntakeRequest | null;

  if (!payload || typeof payload !== "object") {
    return badRequest("valid LINE preview payload is required", meta);
  }

  const preview = await previewLineClientUpsert(env, payload);
  const body: LineClientPreviewResponse = {
    ok: true,
    data: preview,
    meta,
  };

  return json(body);
}

async function promoteLineClientAfterIntake(
  env: Env,
  payload: LineClientIntakeRequest,
  intakeResult: Awaited<ReturnType<typeof intakeLineClientUpsert>>,
) {
  if (!env.ADMIN_WORKER_BASE_URL) {
    return {
      attempted: false,
      ok: false,
      member_id: "",
      promotion_status: "needs_manual_review",
      created_new_member: false,
      error: "missing_ADMIN_WORKER_BASE_URL",
    };
  }

  const promotionPayload = {
    immigration_id: intakeResult.immigration_id,
    source_channel: "line",
    intent: "contact_import",
    identity: {
      member_id: toStr(payload.memberstack_id),
      line_id: toStr(payload.line_id || payload.identity?.line_id),
      line_user_id: toStr(payload.line_user_id || payload.identity?.line_user_id),
      full_name: toStr(payload.display_name || payload.identity?.display_name || payload.nickname),
      phone: toStr(payload.member_phone || payload.phone || payload.identity?.member_phone || payload.identity?.phone),
    },
    membership: {
      current_tier: "",
      target_tier: "",
    },
    notes: {
      manual_note_raw: toStr(payload.manual_note || payload.notes?.manual_note || "LINE legacy identity intake"),
      operator_summary: toStr(payload.operator_summary || payload.notes?.operator_summary),
    },
    payload_json: {
      ...(payload.payload_json && typeof payload.payload_json === "object" ? payload.payload_json : {}),
      ...(payload.original_payload && typeof payload.original_payload === "object" ? payload.original_payload : {}),
      email: toStr(payload.member_email || payload.email || payload.identity?.member_email || payload.identity?.email),
      member_email: toStr(payload.member_email || payload.email || payload.identity?.member_email || payload.identity?.email),
      phone: toStr(payload.member_phone || payload.phone || payload.identity?.member_phone || payload.identity?.phone),
      member_phone: toStr(payload.member_phone || payload.phone || payload.identity?.member_phone || payload.identity?.phone),
      display_name: toStr(payload.display_name || payload.identity?.display_name),
      nickname: toStr(payload.nickname || payload.identity?.nickname),
      line_user_id: toStr(payload.line_user_id || payload.identity?.line_user_id),
      line_id: toStr(payload.line_id || payload.identity?.line_id),
      immigration_id: intakeResult.immigration_id,
    },
    service_history_summary: "",
    promotion_policy: {
      create_if_missing: true,
      overwrite_if_exists: false,
      archive_raw_notes: true,
    },
  };

  const promotePath = "/v1/admin/members/promote-immigration";
  const promoteUrl = env.ADMIN_WORKER_BASE_URL
    ? `${env.ADMIN_WORKER_BASE_URL.replace(/\/+$/, "")}${promotePath}`
    : promotePath;
  const requestInit: RequestInit = {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${env.INTERNAL_TOKEN}`,
    },
    body: JSON.stringify(promotionPayload),
  };
  const response = env.ADMIN_WORKER
    ? await env.ADMIN_WORKER.fetch(
        new Request(`https://admin-worker.internal${promotePath}`, requestInit),
      )
    : await fetch(promoteUrl, requestInit);

  const responseText = await response.text();
  const responseJson = (() => {
    try {
      return JSON.parse(responseText) as
        | { data?: { member_id?: string; promotion_status?: string; created_new_member?: boolean }; error?: unknown }
        | null;
    } catch {
      return null;
    }
  })() as
    | { data?: { member_id?: string; promotion_status?: string; created_new_member?: boolean }; error?: unknown }
    | null;

  if (!response.ok) {
    const responseSnippet = toStr(responseText).slice(0, 240);
    return {
      attempted: true,
      ok: false,
      member_id: "",
      promotion_status: "promotion_failed",
      created_new_member: false,
      error:
        toStr((responseJson as { error?: { message?: string } } | null)?.error?.message) ||
        toStr((responseJson as { error?: string } | null)?.error) ||
        `promotion_http_${response.status} via ${promoteUrl}${responseSnippet ? ` :: ${responseSnippet}` : ""}`,
    };
  }

  const promotedMemberId = toStr(responseJson?.data?.member_id);
  if (promotedMemberId && intakeResult.client.airtable_record_id) {
    const patchedClient = await patchClientMemberstackId(
      env,
      intakeResult.client.airtable_record_id,
      promotedMemberId,
    );

    intakeResult.client.fields = {
      ...intakeResult.client.fields,
      ...(patchedClient.fields || {}),
    };
  }

  return {
    attempted: true,
    ok: true,
    member_id: promotedMemberId,
    promotion_status: toStr(responseJson?.data?.promotion_status) || "promoted",
    created_new_member: Boolean(responseJson?.data?.created_new_member),
  };
}

async function createLineLinksAfterPromotion(
  env: Env,
  payload: LineClientIntakeRequest,
  intakeResult: Awaited<ReturnType<typeof intakeLineClientUpsert>>,
  promotion: {
    attempted: boolean;
    ok: boolean;
    member_id: string;
  } | null,
) {
  if (!promotion?.ok || !toStr(promotion.member_id)) {
    return null;
  }

  return await buildLinksBundle(env, {
    immigration_id: intakeResult.immigration_id,
    display_name: toStr(payload.display_name || payload.identity?.display_name || payload.nickname),
    email: toStr(payload.member_email || payload.email || payload.identity?.member_email || payload.identity?.email).toLowerCase(),
    line_user_id: toStr(payload.line_user_id || payload.identity?.line_user_id),
    memberstack_id: toStr(promotion.member_id),
    model_name: toStr(payload.model_name),
    model_record_id: toStr(payload.model_record_id),
    expires_in_hours: Number(payload.expires_in_hours || 24 * 7),
  });
}

async function createConfirmLinksAfterCreateJob(
  env: Env,
  payload: CreateJobRequest,
  intakeResult: Awaited<ReturnType<typeof intakeLineClientUpsert>>,
): Promise<{
  attempted: boolean;
  ok: boolean;
  session_id?: string;
  payment_ref?: string;
  customer_confirmation_url?: string;
  model_confirmation_url?: string;
  error?: string;
}> {
  const upstreamUrl = toStr(env.CREATE_LINKS_URL);
  if (!upstreamUrl) {
    return {
      attempted: false,
      ok: false,
      error: "missing_CREATE_LINKS_URL",
    };
  }

  const clientName =
    toStr(payload.display_name || payload.identity?.display_name || payload.nickname) ||
    toStr(payload.email) ||
    toStr(payload.line_user_id) ||
    intakeResult.immigration_id;
  const modelName = toStr(payload.model_name);
  const jobType = toStr(payload.job_type || payload.payload_json?.job_type);
  const jobDate = toStr(payload.job_date || payload.payload_json?.job_date);
  const startTime = toStr(payload.start_time || payload.payload_json?.start_time);
  const endTime = toStr(payload.end_time || payload.payload_json?.end_time);
  const locationName = toStr(payload.location_name || payload.payload_json?.location_name);
  const amountThb = toNum(payload.amount_thb ?? payload.payload_json?.amount_thb);

  if (!clientName || !modelName || !jobType || !jobDate || !startTime || !endTime || !locationName || !amountThb || amountThb <= 0) {
    return {
      attempted: false,
      ok: false,
      error: "missing_booking_fields",
    };
  }

  const requestBody = {
    session_id: toStr(payload.session_id) || intakeResult.immigration_id,
    payment_ref: toStr(payload.payment_ref),
    client_name: clientName,
    model_name: modelName,
    job_type: jobType,
    job_date: jobDate,
    start_time: startTime,
    end_time: endTime,
    location_name: locationName,
    google_map_url: toStr(payload.google_map_url || payload.payload_json?.google_map_url),
    amount_thb: amountThb,
    pay_model_thb: toNum(payload.pay_model_thb ?? payload.payload_json?.pay_model_thb) ?? undefined,
    payment_type: toStr(payload.payment_type || payload.payload_json?.payment_type || "deposit"),
    payment_method: toStr(payload.payment_method || payload.payload_json?.payment_method || "promptpay"),
    note:
      toStr(payload.booking_note) ||
      toStr(payload.payload_json?.booking_note) ||
      toStr(payload.manual_note_raw) ||
      toStr(payload.manual_note) ||
      toStr(payload.notes?.manual_note),
  };

  try {
    const response = await fetch(upstreamUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    const text = await response.text();
    const responseJson = (() => {
      try {
        return JSON.parse(text) as Record<string, unknown>;
      } catch {
        return null;
      }
    })();

    if (!response.ok) {
      return {
        attempted: true,
        ok: false,
        error:
          toStr(responseJson?.error) ||
          `confirm_links_http_${response.status}`,
      };
    }

    return {
      attempted: true,
      ok: Boolean(
        toStr(responseJson?.customer_confirmation_url) &&
        toStr(responseJson?.model_confirmation_url),
      ),
      session_id: toStr(responseJson?.session_id) || requestBody.session_id,
      payment_ref: toStr(responseJson?.payment_ref) || requestBody.payment_ref,
      customer_confirmation_url: toStr(responseJson?.customer_confirmation_url),
      model_confirmation_url: toStr(responseJson?.model_confirmation_url),
      error:
        toStr(responseJson?.customer_confirmation_url) &&
        toStr(responseJson?.model_confirmation_url)
          ? undefined
          : "missing_confirmation_urls",
    };
  } catch (error) {
    return {
      attempted: true,
      ok: false,
      error: error instanceof Error ? error.message : "confirm_links_failed",
    };
  }
}

async function notifyTelegramForLineIntake(
  env: Env,
  payload: LineClientIntakeRequest,
  promotion: {
    attempted: boolean;
    ok: boolean;
    member_id: string;
  } | null,
  links: Awaited<ReturnType<typeof buildLinksBundle>> | null,
) {
  if (payload.notify_telegram === false) {
    return {
      attempted: false,
      ok: false,
      error: "telegram_disabled_by_payload",
    };
  }

  if (!promotion?.ok || !links) {
    return {
      attempted: false,
      ok: false,
      error: "missing_promotion_or_links",
    };
  }

  if (!env.ADMIN_WORKER_BASE_URL && !env.ADMIN_WORKER) {
    return {
      attempted: false,
      ok: false,
      error: "missing_admin_worker_binding",
    };
  }

  const lineUserId = toStr(payload.line_user_id || payload.identity?.line_user_id);
  const displayName = toStr(payload.display_name || payload.identity?.display_name || payload.nickname) || "Client";
  const modelName = toStr(payload.model_name) || `model_${links.immigration_id.slice(-6)}`;
  const intakeSource = toStr(payload.payload_json?.source_channel || payload.payload_json?.intake_source).toLowerCase();
  const isRenewalIntake = intakeSource === "renewal" || intakeSource === "renewal_web"
    || Boolean(toStr(payload.payload_json?.renewal_source_page));
  const lines = [
    isRenewalIntake ? "<b>RENEWAL INTAKE PROMOTED</b>" : "<b>LINE INTAKE PROMOTED</b>",
    `Client: <b>${escapeHtml(displayName)}</b>`,
    `Model: <b>${escapeHtml(modelName)}</b>`,
    `Member ID: <code>${escapeHtml(toStr(promotion.member_id))}</code>`,
    !isRenewalIntake && lineUserId ? `LINE User ID: <code>${escapeHtml(lineUserId)}</code>` : "",
    `Immigration ID: <code>${escapeHtml(links.immigration_id)}</code>`,
    "",
    `Member Link: ${escapeHtml(links.customer_url)}`,
    `Model Link: ${escapeHtml(links.model_url)}`,
    "",
    `Member Dashboard: ${escapeHtml(links.customer_dashboard_url)}`,
    `Model Dashboard: ${escapeHtml(links.model_dashboard_url)}`,
  ].filter(Boolean);

  const telegramPayload = {
    chat_id: toStr(payload.telegram_chat_id),
    message_thread_id: toStr(payload.telegram_message_thread_id),
    text: lines.join("\n"),
    parse_mode: "HTML",
    disable_web_page_preview: true,
  };

  const telegramPath = "/v1/admin/telegram/dm";
  const telegramUrl = env.ADMIN_WORKER_BASE_URL
    ? `${env.ADMIN_WORKER_BASE_URL.replace(/\/+$/, "")}${telegramPath}`
    : telegramPath;
  const requestInit: RequestInit = {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${env.INTERNAL_TOKEN}`,
    },
    body: JSON.stringify(telegramPayload),
  };

  const response = env.ADMIN_WORKER
    ? await env.ADMIN_WORKER.fetch(
        new Request(`https://admin-worker.internal${telegramPath}`, requestInit),
      )
    : await fetch(telegramUrl, requestInit);
  const responseText = await response.text();
  const responseJson = (() => {
    try {
      return JSON.parse(responseText) as
        | { telegram?: { ok?: boolean; status?: number; error?: string; data?: unknown } }
        | { error?: string }
        | null;
    } catch {
      return null;
    }
  })();

  if (!response.ok) {
    return {
      attempted: true,
      ok: false,
      status: response.status,
      error:
        toStr((responseJson as { error?: string } | null)?.error) ||
        `telegram_http_${response.status}`,
    };
  }

  const telegramResult = (responseJson as { telegram?: { ok?: boolean; status?: number; error?: string } } | null)?.telegram;
  return {
    attempted: true,
    ok: Boolean(telegramResult?.ok),
    status: telegramResult?.status,
    error: telegramResult?.ok ? undefined : toStr(telegramResult?.error) || "telegram_send_failed",
  };
}

async function handleLineIntake(request: Request, env: Env): Promise<Response> {
  const meta = makeMeta(request);
  const payload = (await request.json().catch(() => null)) as LineClientIntakeRequest | null;

  if (!payload || typeof payload !== "object") {
    return badRequest("valid LINE intake payload is required", meta);
  }

  try {
    const result = await intakeLineClientUpsert(env, payload);
    const promotion = await promoteLineClientAfterIntake(env, payload, result);
    const links = await createLineLinksAfterPromotion(env, payload, result, promotion);
    const telegram = await notifyTelegramForLineIntake(env, payload, promotion, links);
    const body: LineClientIntakeResponse = {
      ok: true,
      data: {
        ...result,
        promotion,
        links,
        telegram,
      },
      meta,
    };

    return json(body);
  } catch (error) {
    return json(
      {
        ok: false,
        error: {
          code: "LINE_INTAKE_FAILED",
          message: error instanceof Error ? error.message : "LINE intake failed",
        },
        meta,
      },
      { status: 502 },
    );
  }
}

async function handleAdminCreateSessionProxy(
  request: Request,
  env: Env,
  meta: Meta,
): Promise<Response> {
  if (!env.ADMIN_WORKER_BASE_URL && !env.ADMIN_WORKER) {
    return json(
      {
        ok: false,
        error: {
          code: "MISSING_ADMIN_WORKER_TARGET",
          message: "missing_ADMIN_WORKER_BASE_URL",
        },
        meta,
      },
      { status: 500 },
    );
  }

  const gateSession = getValidatedGateSession(request);
  if (!gateSession && !isAuthorized(request, env)) {
    return unauthorized(meta);
  }

  const upstreamPath = ADMIN_JOBS.createSessionLegacy;
  const upstreamUrl = env.ADMIN_WORKER_BASE_URL
    ? `${env.ADMIN_WORKER_BASE_URL.replace(/\/+$/, "")}${upstreamPath}`
    : upstreamPath;
  const bodyText = await request.text();
  const headers = new Headers({
    accept: "application/json",
    "content-type": request.headers.get("content-type") || "application/json",
  });

  const requestBearer = toStr(request.headers.get("authorization")).replace(/^Bearer\s+/i, "").trim();
  const bearer = gateSession?.bearer || readInternalToken(request) || requestBearer || env.INTERNAL_TOKEN;
  const confirmKey = gateSession?.confirmKey || toStr(request.headers.get("x-confirm-key")) || env.CONFIRM_KEY;

  if (bearer) headers.set("authorization", `Bearer ${bearer}`);
  if (confirmKey) headers.set("x-confirm-key", confirmKey);

  const requestInit: RequestInit = {
    method: "POST",
    headers,
    body: bodyText,
  };

  const upstreamResponse = env.ADMIN_WORKER
    ? await env.ADMIN_WORKER.fetch(
        new Request(`https://admin-worker.internal${upstreamPath}`, requestInit),
      )
    : await fetch(upstreamUrl, requestInit);

  return new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    headers: upstreamResponse.headers,
  });
}

async function handleCreateJob(request: Request, env: Env): Promise<Response> {
  const meta = makeMeta(request);
  const payload = (await request.json().catch(() => null)) as CreateJobRequest | null;

  if (!payload || typeof payload !== "object") {
    return badRequest("valid create-job payload is required", meta);
  }

  const normalizedPayload: LineClientIntakeRequest = {
    ...payload,
    manual_note:
      toStr(payload.manual_note) ||
      toStr(payload.notes?.manual_note) ||
      toStr(payload.manual_note_raw),
    payload_json: {
      ...(payload.payload_json && typeof payload.payload_json === "object" ? payload.payload_json : {}),
      ...(payload.model_history_note ? { model_history_note: payload.model_history_note } : {}),
      ...(payload.model_history_source ? { model_history_source: payload.model_history_source } : {}),
      ...(payload.model_history_status ? { model_history_status: payload.model_history_status } : {}),
      ...(payload.model_history_payload_json && typeof payload.model_history_payload_json === "object"
        ? { model_history_payload_json: payload.model_history_payload_json }
        : {}),
    },
  };

  try {
    const result = await intakeLineClientUpsert(env, normalizedPayload);
    const promotion = await promoteLineClientAfterIntake(env, normalizedPayload, result);
    const links = await createLineLinksAfterPromotion(env, normalizedPayload, result, promotion);
    const confirmLinks = await createConfirmLinksAfterCreateJob(env, payload, result);
    const modelHistory = buildModelHistoryArtifact(payload);
    const telegram = await notifyTelegramForLineIntake(env, normalizedPayload, promotion, links);
    const airtable = {
      client_record_id: toStr(result.client?.airtable_record_id) || null,
      inbox_record_id: toStr(result.inbox_record?.airtable_record_id) || null,
    };

    const body: CreateJobResponse = {
      ok: true,
      data: {
        contract_version: "create_job_v1",
        immigration_id: result.immigration_id,
        promotion,
        links,
        confirm_links: confirmLinks,
        model_history: modelHistory,
        telegram,
        airtable,
        artifacts: {
          member_id: toStr(promotion?.member_id),
          customer_url: toStr(links?.customer_url),
          model_url: toStr(links?.model_url),
          customer_dashboard_url: toStr(links?.customer_dashboard_url),
          model_dashboard_url: toStr(links?.model_dashboard_url),
          customer_confirmation_url: toStr(confirmLinks?.customer_confirmation_url),
          model_confirmation_url: toStr(confirmLinks?.model_confirmation_url),
          model_history_status: modelHistory.status,
          model_history_source: modelHistory.source,
          airtable,
          telegram,
        },
      },
      meta,
    };

    return json(body);
  } catch (error) {
    return json(
      {
        ok: false,
        error: {
          code: "CREATE_JOB_FAILED",
          message: error instanceof Error ? error.message : "create job failed",
        },
        meta,
      },
      { status: 502 },
    );
  }
}

async function handleModelHistoryBatch(request: Request): Promise<Response> {
  const meta = makeMeta(request);
  const payload = (await request.json().catch(() => null)) as CreateJobRequest | null;

  if (!payload || typeof payload !== "object") {
    return badRequest("valid model-history payload is required", meta);
  }

  return json({
    ...buildModelHistoryBatchPreview(payload),
    meta,
  });
}

async function handleModelHistoryImport(request: Request, env: Env): Promise<Response> {
  const meta = makeMeta(request);
  const route = new URL(request.url).pathname;
  const body = (await request.json().catch(() => null)) as
    | { payload?: CreateJobRequest; apply?: boolean }
    | CreateJobRequest
    | null;

  const payload =
    body && typeof body === "object" && "payload" in body
      ? (body.payload as CreateJobRequest | undefined) || null
      : (body as CreateJobRequest | null);
  const apply =
    body && typeof body === "object" && "apply" in body
      ? Boolean((body as { apply?: boolean }).apply)
      : false;

  if (!payload || typeof payload !== "object") {
    return badRequest("valid model-history import payload is required", meta);
  }

  if (!env.AIRTABLE_API_KEY) {
    return json(
      {
        ok: false,
        error: {
          code: "MISSING_AIRTABLE_API_KEY",
          message: "Airtable import is not configured on this worker",
        },
        meta,
      },
      { status: 500 },
    );
  }

  const result = {
    ...(await performModelHistoryImport(env, payload, apply)),
    meta,
  };
  await writeImportLogToAirtable(env, {
    label: "Model History Import",
    route,
    import_type: "model_history",
    mode: result.mode,
    status: "ok",
    payload,
    request: body && typeof body === "object" && "payload" in body ? body : { payload, apply },
    summary: result.summary,
    counts: result.counts,
  });
  return json(result);
}

async function handlePrivateProfileImport(request: Request, env: Env): Promise<Response> {
  const meta = makeMeta(request);
  const route = new URL(request.url).pathname;
  const body = (await request.json().catch(() => null)) as
    | { payload?: CreateJobRequest; apply?: boolean }
    | CreateJobRequest
    | null;

  const payload =
    body && typeof body === "object" && "payload" in body
      ? (body.payload as CreateJobRequest | undefined) || null
      : (body as CreateJobRequest | null);
  const apply =
    body && typeof body === "object" && "apply" in body
      ? Boolean((body as { apply?: boolean }).apply)
      : false;

  if (!payload || typeof payload !== "object") {
    return badRequest("valid private-profile import payload is required", meta);
  }

  if (!env.AIRTABLE_API_KEY) {
    return json(
      {
        ok: false,
        error: {
          code: "MISSING_AIRTABLE_API_KEY",
          message: "Airtable import is not configured on this worker",
        },
        meta,
      },
      { status: 500 },
    );
  }

  const result = {
    ...(await performPrivateProfileImport(env, payload, apply)),
    meta,
  };
  await writeImportLogToAirtable(env, {
    label: "Private Profile Import",
    route,
    import_type: "private_profile",
    mode: result.mode,
    status: "ok",
    payload,
    request: body && typeof body === "object" && "payload" in body ? body : { payload, apply },
    summary: result.summary,
    counts: result.counts,
  });
  return json(result);
}

async function performBookingImport(env: Env, payload: CreateJobRequest, apply: boolean) {
  const preview = buildBookingImportPreview(payload);

  const clients = await processModelHistoryImportEntity(
    env,
    preview.rows.clients,
    {
      tableId: env.AIRTABLE_TABLE_CLIENTS || "tblVv58TCbwh5j1fS",
      lookupForRow: modelHistoryClientLookup,
      mapFields: normalizeImportClientFields,
    },
    apply,
  );
  const sessions = await processModelHistoryImportEntity(
    env,
    preview.rows.sessions,
    {
      tableId: env.AIRTABLE_TABLE_SESSIONS || "tblC98mKWbzmPuNzX",
      lookupForRow: (row) => ({ field: "session_id", value: toStr(row.session_id) }),
      mapFields: normalizeImportSessionFields,
    },
    apply,
  );
  const payments = await processModelHistoryImportEntity(
    env,
    preview.rows.payments,
    {
      tableId: env.AIRTABLE_TABLE_PAYMENTS || "tblWGGJJOx5eBvBZJ",
      lookupForRow: (row) => ({ field: "Payment Reference", value: toStr(row.payment_ref) }),
      mapFields: normalizeImportPaymentFields,
    },
    apply,
  );

  return {
    ok: true,
    mode: apply ? "apply" : "dry_run",
    import_type: "booking" as const,
    counts: preview.counts,
    summary: { clients, sessions, payments },
  };
}

async function handleBookingImport(request: Request, env: Env): Promise<Response> {
  const meta = makeMeta(request);
  const route = new URL(request.url).pathname;
  const body = (await request.json().catch(() => null)) as
    | { payload?: CreateJobRequest; apply?: boolean }
    | CreateJobRequest
    | null;

  const payload =
    body && typeof body === "object" && "payload" in body
      ? (body.payload as CreateJobRequest | undefined) || null
      : (body as CreateJobRequest | null);
  const apply =
    body && typeof body === "object" && "apply" in body
      ? Boolean((body as { apply?: boolean }).apply)
      : false;

  if (!payload || typeof payload !== "object") {
    return badRequest("valid booking import payload is required", meta);
  }

  if (!env.AIRTABLE_API_KEY) {
    return json(
      {
        ok: false,
        error: {
          code: "MISSING_AIRTABLE_API_KEY",
          message: "Airtable import is not configured on this worker",
        },
        meta,
      },
      { status: 500 },
    );
  }

  const result = {
    ...(await performBookingImport(env, payload, apply)),
    meta,
  };
  await writeImportLogToAirtable(env, {
    label: "Booking Import",
    route,
    import_type: "booking",
    mode: result.mode,
    status: "ok",
    payload,
    request: body && typeof body === "object" && "payload" in body ? body : { payload, apply },
    summary: result.summary,
    counts: result.counts,
  });
  return json(result);
}

async function performModelHistoryImport(env: Env, payload: CreateJobRequest, apply: boolean) {
  const preview = buildModelHistoryBatchPreview(payload) as {
    files: Record<string, string>;
    counts: { clients: number; sessions: number; payments: number; private_profiles?: number };
    model_history: { status: string; source: string; note: string; has_payload: boolean };
    rows: {
      clients: Array<Record<string, unknown>>;
      sessions: Array<Record<string, unknown>>;
      payments: Array<Record<string, unknown>>;
      private_profiles?: Array<Record<string, unknown>>;
    };
  };
  const clientRows = preview.rows.clients;
  const sessionRows = preview.rows.sessions;
  const paymentRows = preview.rows.payments;
  const privateProfileRows = Array.isArray(preview.rows.private_profiles) ? preview.rows.private_profiles : [];

  const clients = await processModelHistoryImportEntity(
    env,
    clientRows,
    {
      tableId: env.AIRTABLE_TABLE_CLIENTS || "tblVv58TCbwh5j1fS",
      lookupForRow: modelHistoryClientLookup,
      mapFields: normalizeImportClientFields,
    },
    apply,
  );
  const sessions = await processModelHistoryImportEntity(
    env,
    sessionRows,
    {
      tableId: env.AIRTABLE_TABLE_SESSIONS || "tblC98mKWbzmPuNzX",
      lookupForRow: (row) => ({ field: "session_id", value: toStr(row.session_id) }),
      mapFields: normalizeImportSessionFields,
    },
    apply,
  );
  const payments = await processModelHistoryImportEntity(
    env,
    paymentRows,
    {
      tableId: env.AIRTABLE_TABLE_PAYMENTS || "tblWGGJJOx5eBvBZJ",
      lookupForRow: (row) => ({ field: "Payment Reference", value: toStr(row.payment_ref) }),
      mapFields: normalizeImportPaymentFields,
    },
    apply,
  );
  const private_profiles = env.AIRTABLE_TABLE_PRIVATE_PROFILE_NOTES
    ? await processModelHistoryImportEntity(
        env,
        privateProfileRows,
        {
          tableId: env.AIRTABLE_TABLE_PRIVATE_PROFILE_NOTES,
          lookupForRow: privateProfileLookup,
          mapFields: normalizePrivateProfileFields,
          allowUpdate: true,
          afterWrite: async (row, result) => {
            await attachPrivateProfileContext(env, row, result);
          },
        },
        apply,
      )
    : privateProfileRows.map((row) => ({
        source_key: toStr(row.profile_key || row.model_id || row.display_name),
        action: "skipped_unconfigured",
        lookup_field: "profile_key",
        fields: normalizePrivateProfileFields(row),
      }));

  return {
    ok: true,
    mode: apply ? "apply" : "dry_run",
    import_type: "model_history" as const,
    model_history: preview.model_history,
    counts: preview.counts,
    summary: { clients, sessions, payments, private_profiles },
  };
}

async function performPrivateProfileImport(env: Env, payload: CreateJobRequest, apply: boolean) {
  const preview = buildPrivateProfilePreview(payload);
  const rows = preview.row ? [preview.row] : [];
  const private_profiles = env.AIRTABLE_TABLE_PRIVATE_PROFILE_NOTES
    ? await processModelHistoryImportEntity(
        env,
        rows,
        {
          tableId: env.AIRTABLE_TABLE_PRIVATE_PROFILE_NOTES,
          lookupForRow: privateProfileLookup,
          mapFields: normalizePrivateProfileFields,
          allowUpdate: true,
          afterWrite: async (row, result) => {
            await attachPrivateProfileContext(env, row, result);
          },
        },
        apply,
      )
    : rows.map((row) => ({
        source_key: toStr(row.profile_key || row.model_id || row.display_name),
        action: "skipped_unconfigured",
        lookup_field: "profile_key",
        fields: normalizePrivateProfileFields(row),
      }));

  return {
    ok: true,
    mode: apply ? "apply" : "dry_run",
    import_type: "private_profile" as const,
    counts: {
      private_profiles: rows.length,
    },
    summary: {
      private_profiles,
    },
  };
}

async function handleImportAll(request: Request, env: Env): Promise<Response> {
  const meta = makeMeta(request);
  const route = new URL(request.url).pathname;
  const body = (await request.json().catch(() => null)) as
    | { payload?: CreateJobRequest; booking_apply?: boolean; model_history_apply?: boolean }
    | CreateJobRequest
    | null;

  const payload =
    body && typeof body === "object" && "payload" in body
      ? (body.payload as CreateJobRequest | undefined) || null
      : (body as CreateJobRequest | null);
  const bookingApply =
    body && typeof body === "object" && "booking_apply" in body
      ? Boolean((body as { booking_apply?: boolean }).booking_apply)
      : false;
  const modelHistoryApply =
    body && typeof body === "object" && "model_history_apply" in body
      ? Boolean((body as { model_history_apply?: boolean }).model_history_apply)
      : false;

  if (!payload || typeof payload !== "object") {
    return badRequest("valid import-all payload is required", meta);
  }

  if (!env.AIRTABLE_API_KEY) {
    return json(
      {
        ok: false,
        error: {
          code: "MISSING_AIRTABLE_API_KEY",
          message: "Airtable import is not configured on this worker",
        },
        meta,
      },
      { status: 500 },
    );
  }

  const booking = await performBookingImport(env, payload, bookingApply);
  const model_history = await performModelHistoryImport(env, payload, modelHistoryApply);

  const result = {
    ok: true,
    import_type: "all",
    mode:
      booking.mode === "apply" || model_history.mode === "apply"
        ? "mixed"
        : "dry_run",
    booking,
    model_history,
    counts: {
      clients: (booking.counts.clients || 0) + (model_history.counts.clients || 0),
      sessions: (booking.counts.sessions || 0) + (model_history.counts.sessions || 0),
      payments: (booking.counts.payments || 0) + (model_history.counts.payments || 0),
      private_profiles: (model_history.counts.private_profiles || 0),
    },
    summary: {
      clients: [...booking.summary.clients, ...model_history.summary.clients],
      sessions: [...booking.summary.sessions, ...model_history.summary.sessions],
      payments: [...booking.summary.payments, ...model_history.summary.payments],
      private_profiles: [...((model_history.summary as { private_profiles?: Array<Record<string, unknown>> }).private_profiles || [])],
    },
    meta,
  };
  await writeImportLogToAirtable(env, {
    label: "Import All",
    route,
    import_type: "all",
    mode: result.mode,
    status: "ok",
    payload,
    request:
      body && typeof body === "object" && "payload" in body
        ? body
        : { payload, booking_apply: bookingApply, model_history_apply: modelHistoryApply },
    summary: result.summary,
    counts: result.counts,
  });
  return json(result);
}

async function handleImportLogs(request: Request, env: Env): Promise<Response> {
  const meta = makeMeta(request);
  if (!env.AIRTABLE_API_KEY) {
    return json(
      {
        ok: false,
        error: {
          code: "MISSING_AIRTABLE_API_KEY",
          message: "Airtable import logs are not configured on this worker",
        },
        meta,
      },
      { status: 500 },
    );
  }

  const url = new URL(request.url);
  const limitRaw = Number(url.searchParams.get("limit") || "30");
  try {
    const entries = await readImportLogsFromAirtable(env, limitRaw);
    return json({
      ok: true,
      source: "airtable",
      count: entries.length,
      entries,
      meta,
    });
  } catch (error) {
    return json(
      {
        ok: false,
        error: {
          code: "IMPORT_LOGS_READ_FAILED",
          message: error instanceof Error ? error.message : "unable to read import logs",
        },
        meta,
      },
      { status: 502 },
    );
  }
}

async function handlePromote(request: Request, env: Env): Promise<Response> {
  const meta = makeMeta(request);
  const payload = (await request.json().catch(() => null)) as ImmigrationPromoteRequest | null;

  if (!payload || typeof payload !== "object") {
    return badRequest("valid promotion payload is required", meta);
  }

  if (!toStr(payload.immigration_id)) {
    return badRequest("immigration_id is required", meta, { field: "immigration_id" });
  }

  if (!toStr(payload.notes?.manual_note_raw)) {
    return badRequest("notes.manual_note_raw is required", meta, {
      field: "notes.manual_note_raw",
    });
  }

  const promoted = promoteRecord(
    buildPromotionRecord(payload, {
      promotion_status: "promotion_pending",
    }),
  );

  if (env.ADMIN_WORKER_BASE_URL) {
    const response = await fetch(
      `${env.ADMIN_WORKER_BASE_URL.replace(/\/+$/, "")}/v1/admin/members/promote-immigration`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${env.INTERNAL_TOKEN}`,
        },
        body: JSON.stringify({
          immigration_id: promoted.immigration_id,
          source_channel: promoted.source_channel,
          intent: promoted.intent,
          identity: promoted.identity,
          membership: promoted.membership,
          notes: promoted.notes,
          service_history_summary: promoted.service_history_summary,
          payload_json: promoted.payload_json,
          promotion_policy: {
            create_if_missing: true,
            overwrite_if_exists: false,
            archive_raw_notes: true,
          },
        }),
      },
    );

    const responseJson = await response.json().catch(() => null);
    if (!response.ok) {
      return json(
        {
          ok: false,
          error: {
            code: "PROMOTION_UPSTREAM_FAILED",
            message: "admin-worker promotion failed",
            details: responseJson ?? {},
          },
          meta,
        },
        { status: 502 },
      );
    }

    const data = (responseJson as { data?: Record<string, unknown> } | null)?.data || {};
    const body: ImmigrationPromoteResponse = {
      ok: true,
      data: {
        immigration_id: promoted.immigration_id,
        member_id: toStr(data.member_id) || promoted.promoted_member_id || "",
        promotion_status:
          toStr(data.promotion_status) === "needs_manual_review"
            ? "needs_manual_review"
            : "promoted",
        created_new_member: Boolean(data.created_new_member),
        service_history_summary: promoted.service_history_summary,
      },
      meta,
    };

    return json(body);
  }

  const body: ImmigrationPromoteResponse = {
    ok: true,
    data: {
      immigration_id: promoted.immigration_id,
      member_id: promoted.promoted_member_id || "",
      promotion_status: promoted.promotion_status,
      created_new_member: Boolean(promoted.created_new_member),
      service_history_summary: promoted.service_history_summary,
    },
    meta,
  };

  return json(body);
}

async function handleGetImmigration(request: Request, immigrationId: string, env: Env): Promise<Response> {
  const meta = makeMeta(request);

  let record = readSeedRecords().find((item) => item.migration_id === immigrationId) || null;

  if (!record && canReadAirtable(env)) {
    try {
      const airtable = await listRecordsFromAirtable(env);
      record = airtable.records.find((item) => item.migration_id === immigrationId) || null;
    } catch (error) {
      console.warn("immigrate-worker get fallback to seed", error);
    }
  }

  if (!record) {
    return json(
      {
        ok: false,
        error: {
          code: "NOT_FOUND",
          message: "Immigration record not found",
        },
        meta,
      },
      { status: 404 },
    );
  }

  const projected = buildPromotionRecord(
    {
      immigration_id: record.migration_id,
      source_channel: "line",
      intent: parseImmigrationIntent(record.parsed_intent),
      identity: {
        line_user_id: record.source_user_id,
        full_name: record.parsed_name,
        phone: record.parsed_phone,
      },
      notes: {
        manual_note_raw: record.raw_text,
      },
      payload_json: {
        source_message_id: record.source_message_id,
        parsed_budget_thb: record.parsed_budget_thb,
        parsed_date: record.parsed_date,
        parsed_location: record.parsed_location,
        dedupe_status: record.dedupe_status,
        flags: record.flags,
      },
    },
    {
      promotion_status:
        record.migration_status === "promoted_to_core"
          ? "promoted"
          : record.migration_status === "failed"
            ? "promotion_failed"
            : "archived_raw",
      promoted_member_id: record.linked_client_id || undefined,
      created_new_member: record.dedupe_status === "create_new",
      archived_at: record.received_at,
      promoted_at:
        record.migration_status === "promoted_to_core"
          ? record.received_at
          : undefined,
    },
  );

  const body: ImmigrationGetResponse = {
    ok: true,
    data: projected,
    meta,
  };

  return json(body);
}

function clampExpiryHours(value: unknown): number {
  const fallback = 24 * 3;
  const raw = Number(value);
  if (!Number.isFinite(raw)) return fallback;
  return Math.max(1, Math.min(24 * 14, Math.round(raw)));
}

function defaultPublicBaseUrl(env: Env): string {
  return toStr(env.PUBLIC_WEB_BASE_URL) || "https://www.mmdbkk.com";
}

function buildModelHistoryArtifact(payload: CreateJobRequest): {
  status: "missing" | "pending_import" | "attached" | "imported";
  source: string;
  note: string;
  has_payload: boolean;
} {
  const note =
    toStr(payload.model_history_note) ||
    toStr(payload.payload_json?.model_history_note) ||
    toStr(payload.payload_json?.legacy_model_history_note);
  const source =
    toStr(payload.model_history_source) ||
    toStr(payload.payload_json?.model_history_source) ||
    "line_group_note";
  const explicitStatus = toStr(payload.model_history_status || payload.payload_json?.model_history_status).toLowerCase();
  const hasPayload = Boolean(
    payload.model_history_payload_json &&
      typeof payload.model_history_payload_json === "object" &&
      Object.keys(payload.model_history_payload_json).length,
  );

  if (explicitStatus === "imported") {
    return { status: "imported", source, note, has_payload: hasPayload };
  }

  if (explicitStatus === "attached") {
    return { status: "attached", source, note, has_payload: hasPayload };
  }

  if (note || hasPayload) {
    return { status: "pending_import", source, note, has_payload: hasPayload };
  }

  return { status: "missing", source: "", note: "", has_payload: false };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => toStr(item)).filter(Boolean);
  }
  const raw = toStr(value);
  return raw ? [raw] : [];
}

function toMaybeNumber(value: unknown): number | null {
  const raw = toStr(value).replace(/,/g, "");
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function buildPrivateProfilePreview(payload: CreateJobRequest) {
  const root = asRecord(payload as unknown);
  const historyPayload = asRecord(payload.model_history_payload_json);
  const clientNote = asRecord(root.client_note_json);
  const personalNote = asRecord(historyPayload.personal_note_json);
  const personalProfile = asRecord(historyPayload.personal_profile);
  const source = Object.keys(clientNote).length
    ? clientNote
    : Object.keys(personalNote).length
      ? personalNote
      : personalProfile;

  const modelId =
    toStr(source.model_id) ||
    toStr(historyPayload.model_id) ||
    toStr(payload.payload_json?.model_id) ||
    toStr(payload.model_record_id);
  const modelName =
    toStr(source.model_name) ||
    toStr(historyPayload.model_name) ||
    toStr(payload.model_name) ||
    toStr(payload.display_name);
  const displayName =
    toStr(source.line_display_name) ||
    toStr(personalProfile.display_name) ||
    toStr(payload.display_name) ||
    modelName;
  const nickname =
    toStr(source.nickname) ||
    toStr(personalProfile.real_nickname_th) ||
    toStr(payload.nickname) ||
    modelName;
  const lineContactId =
    toStr(personalProfile.line_contact_id) ||
    toStr(source.line_contact_id) ||
    toStr(source.line_id) ||
    toStr(personalNote.line_id);
  const phone =
    toStr(source.phone) ||
    toStr(personalProfile.phone) ||
    toStr(payload.phone);
  const ig =
    toStr(personalProfile.ig) ||
    toStr(source.ig);
  const rawNote =
    toStr(source.raw_note) ||
    toStr(payload.model_history_note);
  const noteSummary =
    toStr(source.notes_summary) ||
    (rawNote ? rawNote.replace(/\s+/g, " ").slice(0, 180) : "");
  const sourceFacts = asStringArray(source.source_facts);
  const tags = asStringArray(source.tags);
  const warnings = asStringArray(source.warnings);
  const privacyLevel =
    toStr(source.privacy_level) ||
    toStr(personalProfile.privacy_level) ||
    (warnings.length || rawNote ? "sensitive" : "");
  const bankAccountNumber =
    toStr(personalProfile.bank_account_number) ||
    toStr(source.bank_account_number);
  const bankAccountLast4 =
    toStr(source.bank_account_last4) ||
    (bankAccountNumber ? bankAccountNumber.replace(/\D/g, "").slice(-4) : "");
  const profileKey = slugifyValue(
    modelId || lineContactId || phone || displayName || modelName,
    "private_profile",
  );
  const payloadJson = {
    source_note_json: source,
    personal_profile: personalProfile,
    model_history_payload_json: historyPayload,
    original_payload: payload.payload_json || {},
  };

  const hasMeaningfulData = Boolean(
    modelId ||
    modelName ||
    lineContactId ||
    phone ||
    ig ||
    rawNote ||
    Object.keys(personalProfile).length,
  );

  const row = hasMeaningfulData
    ? {
        profile_key: profileKey,
        note_title: `Private Profile — ${modelName || displayName || profileKey}`,
        note_content: rawNote,
        author: "immigrate-worker",
        model_id: modelId,
        model_name: modelName,
        display_name: displayName,
        nickname,
        alias: toStr(personalProfile.alias_th) || toStr(source.alias),
        gender: toStr(personalProfile.gender) || toStr(source.gender),
        phone,
        line_contact_id: lineContactId,
        ig,
        origin_country: toStr(personalProfile.origin_country) || toStr(source.origin_country),
        location_area: toStr(personalProfile.location_area) || toStr(source.location_area),
        bangkok_area: toStr(personalProfile.bangkok_area) || toStr(source.bangkok_area),
        availability: toStr(personalProfile.availability) || toStr(source.availability),
        tattoo_area: toStr(personalProfile.tattoo_area) || toStr(source.tattoo_area),
        lgbt_experience: toStr(personalProfile.lgbt_experience) || toStr(source.lgbt_experience),
        age: toMaybeNumber(personalProfile.age ?? source.age),
        height_cm: toMaybeNumber(personalProfile.height_cm ?? source.height_cm),
        weight_kg: toMaybeNumber(personalProfile.weight_kg ?? source.weight_kg),
        minimum_rate_thb: toMaybeNumber(personalProfile.minimum_rate_thb ?? source.minimum_rate_thb),
        bank_name: toStr(personalProfile.bank_name) || toStr(source.bank_name),
        bank_account_name: toStr(personalProfile.bank_account_name) || toStr(source.bank_account_name),
        bank_account_last4: bankAccountLast4,
        privacy_level: privacyLevel,
        note_summary: noteSummary,
        raw_note: rawNote,
        source_facts: sourceFacts.join("|"),
        tags: tags.join("|"),
        warnings: warnings.join(" | "),
        payload_json: JSON.stringify(payloadJson),
        import_source: "model_history_private_profile",
        updated_at: new Date().toISOString(),
      }
    : null;

  return {
    has_private_profile: Boolean(row),
    row,
  };
}

function slugifyValue(value: unknown, fallback: string): string {
  const normalized = toStr(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9ก-๙]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");
  return normalized || fallback;
}

function csvEscape(value: unknown): string {
  const stringValue = String(value == null ? "" : value);
  if (stringValue.includes(",") || stringValue.includes('"') || stringValue.includes("\n")) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
}

function toCsv(columns: string[], rows: Array<Record<string, unknown>>): string {
  return [
    columns.join(","),
    ...rows.map((row) => columns.map((column) => csvEscape(row[column])).join(",")),
  ].join("\n") + "\n";
}

function buildModelHistoryBatchPreview(payload: CreateJobRequest) {
  const modelHistory = buildModelHistoryArtifact(payload);
  const privateProfile = buildPrivateProfilePreview(payload);
  const historyPayload =
    payload.model_history_payload_json && typeof payload.model_history_payload_json === "object"
      ? payload.model_history_payload_json
      : {};
  const clientKey = slugifyValue(
    toStr((historyPayload as Record<string, unknown>).client_key) ||
      toStr(payload.line_user_id) ||
      toStr(payload.display_name) ||
      toStr(payload.email),
    "client_history",
  );
  const clientRow = {
    unique_key: clientKey,
    "Client Name": toStr(payload.display_name || payload.nickname) || "unknown",
    nickname: toStr(payload.nickname || payload.display_name) || "unknown",
    line_user_id: toStr(payload.line_user_id) || "unknown",
    line_display_name: toStr(payload.display_name) || "unknown",
    phone: toStr(payload.phone) || "unknown",
    email: toStr(payload.email).toLowerCase() || "unknown",
    telegram_username: "unknown",
    preferred_language: "th",
    notes_summary: modelHistory.note ? modelHistory.note.slice(0, 180) : "",
    vip_level: "unknown",
    verification_status: "unknown",
    client_status: "repeat",
    risk_level: "unknown",
    privacy_level: "unknown",
    first_contact_at: "unknown",
    last_booking_count: "unknown",
    total_paid_estimate: "unknown",
    confidence: "0.6",
    raw_note: modelHistory.note,
    source_facts: [modelHistory.source ? `model_history_source:${modelHistory.source}` : "", payload.model_name ? `model_name:${payload.model_name}` : ""]
      .filter(Boolean)
      .join("|"),
    tags: "",
    safety_flags: "",
    automations: "",
    legacy_tags: modelHistory.status,
    notes: "",
  };

  const sessions = Array.isArray((historyPayload as Record<string, unknown>).sessions)
    ? ((historyPayload as Record<string, unknown>).sessions as Array<Record<string, unknown>>)
    : [];
  const payments = Array.isArray((historyPayload as Record<string, unknown>).payments)
    ? ((historyPayload as Record<string, unknown>).payments as Array<Record<string, unknown>>)
    : [];

  const sessionRows = sessions.map((session, index) => ({
    session_id: toStr(session.session_id) || `sess_${clientKey}_${String(index + 1).padStart(2, "0")}`,
    client_key: clientKey,
    job_type: toStr(session.job_type || session.work_type || "legacy_history"),
    model_name: toStr(session.model_name || payload.model_name),
    job_date: toStr(session.job_date || session.service_date),
    start_time: toStr(session.start_time),
    end_time: toStr(session.end_time),
    location_name: toStr(session.location_name || session.location || "legacy_note"),
    google_map_url: toStr(session.google_map_url),
    amount_thb: toStr(session.amount_thb || session.amount_total_thb),
  }));

  const paymentRows = payments.map((payment, index) => ({
    payment_ref:
      toStr(payment.payment_ref) ||
      `pay_${slugifyValue(payment.session_id || sessionRows[index]?.session_id || "legacy", "legacy")}_${index + 1}`,
    session_id: toStr(payment.session_id || sessionRows[index]?.session_id),
    amount: toStr(payment.amount || payment.amount_thb),
    payment_type: toStr(payment.payment_type || "full"),
    payment_date: toStr(payment.payment_date),
    receipt_photo: toStr(payment.receipt_photo),
  }));

  const files = {
    "clients.csv": toCsv(
      ["unique_key", "Client Name", "nickname", "line_user_id", "line_display_name", "phone", "email", "telegram_username", "preferred_language", "notes_summary", "vip_level", "verification_status", "client_status", "risk_level", "privacy_level", "first_contact_at", "last_booking_count", "total_paid_estimate", "confidence", "raw_note", "source_facts", "tags", "safety_flags", "automations", "legacy_tags", "notes"],
      [clientRow],
    ),
    "sessions.csv": toCsv(
      ["session_id", "client_key", "job_type", "model_name", "job_date", "start_time", "end_time", "location_name", "google_map_url", "amount_thb"],
      sessionRows,
    ),
    "payments.csv": toCsv(
      ["payment_ref", "session_id", "amount", "payment_type", "payment_date", "receipt_photo"],
      paymentRows,
    ),
    "private-profile.json": privateProfile.row ? `${JSON.stringify(privateProfile.row, null, 2)}\n` : "",
  };

  return {
    ok: true,
    batch_type: "model_history_import",
    model_history: modelHistory,
    counts: {
      clients: 1,
      sessions: sessionRows.length,
      payments: paymentRows.length,
      private_profiles: privateProfile.row ? 1 : 0,
    },
    rows: {
      clients: [clientRow],
      sessions: sessionRows,
      payments: paymentRows,
      private_profiles: privateProfile.row ? [privateProfile.row] : [],
    },
    files,
    import_payload: {
      batch_type: "model_history_import",
      generated_at: new Date().toISOString(),
      source_model_name: toStr(payload.model_name),
      source_model_record_id: toStr(payload.model_record_id),
      model_history_status: modelHistory.status,
      notes: [
        "clients.csv is always generated from model_history_note",
        "sessions.csv and payments.csv only include rows from model_history_payload_json",
        "private-profile.json is included when a sensitive personal note/profile payload exists",
        "review before import",
      ],
    },
  };
}

function buildBookingImportPreview(payload: CreateJobRequest) {
  const clientKey = slugifyValue(
    toStr(payload.line_user_id) || toStr(payload.email) || toStr(payload.display_name) || toStr(payload.nickname),
    "client_booking",
  );
  const sessionId = toStr(payload.session_id) || `sess_${slugifyValue(payload.display_name || payload.model_name, "booking")}`;
  const paymentRef = toStr(payload.payment_ref) || `pay_${slugifyValue(sessionId, "booking")}`;
  const amountThb = toStr(payload.amount_thb);
  const payModelThb = toStr(payload.pay_model_thb);

  const clientRow = {
    unique_key: clientKey,
    "Client Name": toStr(payload.display_name || payload.nickname) || "unknown",
    nickname: toStr(payload.nickname || payload.display_name) || "unknown",
    line_user_id: toStr(payload.line_user_id) || "unknown",
    line_display_name: toStr(payload.display_name) || "unknown",
    phone: toStr(payload.phone) || "unknown",
    email: toStr(payload.email).toLowerCase() || "unknown",
    telegram_username: "unknown",
    preferred_language: "th",
    notes_summary: toStr(payload.booking_note || payload.manual_note_raw).slice(0, 180),
    vip_level: "unknown",
    verification_status: "unknown",
    client_status: "active",
    risk_level: "unknown",
    privacy_level: "unknown",
    first_contact_at: payload.job_date || "unknown",
    last_booking_count: "unknown",
    total_paid_estimate: amountThb || "unknown",
    confidence: "0.8",
    raw_note: toStr(payload.booking_note || payload.manual_note_raw),
    source_facts: [
      payload.model_name ? `model_name:${payload.model_name}` : "",
      payload.job_type ? `job_type:${payload.job_type}` : "",
      payload.location_name ? `location_name:${payload.location_name}` : "",
    ].filter(Boolean).join("|"),
    tags: "",
    safety_flags: "",
    automations: "",
    legacy_tags: "booking_import",
    notes: "",
  };

  const sessionRow = {
    session_id: sessionId,
    client_key: clientKey,
    job_type: toStr(payload.job_type || "booking"),
    model_name: toStr(payload.model_name),
    job_date: toStr(payload.job_date),
    start_time: toStr(payload.start_time),
    end_time: toStr(payload.end_time),
    location_name: toStr(payload.location_name),
    google_map_url: toStr(payload.google_map_url),
    amount_thb: amountThb,
    payment_ref: paymentRef,
    payment_type: toStr(payload.payment_type || "deposit"),
    payment_status: "pending",
    pay_model_thb: payModelThb,
    note: toStr(payload.booking_note || payload.manual_note_raw),
  };

  const paymentRow = {
    payment_ref: paymentRef,
    session_id: sessionId,
    amount: amountThb,
    payment_type: toStr(payload.payment_type || "deposit"),
    payment_date: toStr(payload.job_date),
    receipt_photo: "",
    payment_method: toStr(payload.payment_method || "promptpay"),
    payment_status: "pending",
    verification_status: "pending",
    notes: toStr(payload.booking_note || payload.manual_note_raw),
    pay_model_thb: payModelThb,
  };

  return {
    ok: true,
    batch_type: "booking_import",
    counts: {
      clients: 1,
      sessions: toStr(payload.model_name) && toStr(payload.job_date) ? 1 : 0,
      payments: amountThb ? 1 : 0,
    },
    rows: {
      clients: [clientRow],
      sessions: toStr(payload.model_name) && toStr(payload.job_date) ? [sessionRow] : [],
      payments: amountThb ? [paymentRow] : [],
    },
  };
}

function compactFields(fields: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(fields).filter(([, value]) => value !== "" && value !== null && value !== undefined),
  );
}

function encodeFormulaValue(value: string): string {
  return String(value || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function modelHistoryClientLookup(row: Record<string, unknown>) {
  const lineUserId = toStr(row.line_user_id);
  if (lineUserId && lineUserId !== "unknown") return { field: "line_user_id", value: lineUserId };
  const email = toStr(row.email).toLowerCase();
  if (email && email !== "unknown") return { field: "email", value: email };
  return { field: "Client Name", value: toStr(row["Client Name"]) };
}

function normalizeImportClientFields(row: Record<string, unknown>) {
  return compactFields({
    "Client Name": row["Client Name"],
    nickname: row.nickname,
    line_user_id: row.line_user_id,
    line_display_name: row.line_display_name,
    phone: row.phone,
    email: row.email,
    telegram_username: row.telegram_username,
    preferred_language: row.preferred_language,
    notes_summary: row.notes_summary,
    vip_level: row.vip_level,
    verification_status: row.verification_status,
    client_status: row.client_status,
    risk_level: row.risk_level,
    privacy_level: row.privacy_level,
    first_contact_at: row.first_contact_at,
    last_booking_count: toStr(row.last_booking_count) && toStr(row.last_booking_count) !== "unknown" ? Number(row.last_booking_count) : "",
    total_paid_estimate: toStr(row.total_paid_estimate) && toStr(row.total_paid_estimate) !== "unknown" ? Number(row.total_paid_estimate) : "",
    confidence: toStr(row.confidence) && toStr(row.confidence) !== "unknown" ? Number(row.confidence) : "",
    raw_note: row.raw_note,
    source_facts: row.source_facts,
    tags: row.tags,
    safety_flags: row.safety_flags,
    automations: row.automations,
  });
}

function normalizeImportSessionFields(row: Record<string, unknown>) {
  return compactFields({
    session_id: row.session_id,
    job_type: row.job_type,
    model_name: row.model_name,
    job_date: row.job_date,
    start_time: row.start_time,
    end_time: row.end_time,
    location_name: row.location_name,
    google_map_url: row.google_map_url,
    amount_thb: toStr(row.amount_thb) ? Number(row.amount_thb) : "",
    payment_ref: row.payment_ref,
    payment_type: row.payment_type,
    pay_model_thb: toStr(row.pay_model_thb) ? Number(row.pay_model_thb) : "",
    "Pay Model": toStr(row.pay_model_thb) ? Number(row.pay_model_thb) : "",
    "Payment Status": row.payment_status,
    status: row.payment_status || "pending",
    "Session Status": row.payment_status || "pending",
    note: row.note,
    notes: row.note,
  });
}

function normalizeImportPaymentFields(row: Record<string, unknown>) {
  return compactFields({
    "Payment Reference": row.payment_ref,
    session_id: row.session_id,
    Amount: toStr(row.amount) ? Number(row.amount) : "",
    amount_thb: toStr(row.amount) ? Number(row.amount) : "",
    payment_type: row.payment_type,
    payment_date: row.payment_date,
    receipt_photo: row.receipt_photo,
    "Payment Method": row.payment_method,
    "Payment Status": row.payment_status,
    "Verification Status": row.verification_status,
    notes: row.notes,
    pay_model_thb: toStr(row.pay_model_thb) ? Number(row.pay_model_thb) : "",
    "Pay Model": toStr(row.pay_model_thb) ? Number(row.pay_model_thb) : "",
  });
}

function privateProfileLookup(row: Record<string, unknown>) {
  const noteTitle = toStr(row.note_title);
  if (noteTitle) return { field: "Note Title", value: noteTitle };
  const modelId = toStr(row.model_id);
  if (modelId) return { field: "model_id", value: modelId };
  const lineContactId = toStr(row.line_contact_id);
  if (lineContactId) return { field: "line_contact_id", value: lineContactId };
  const phone = toStr(row.phone);
  if (phone && phone !== "unknown") return { field: "phone", value: phone };
  return { field: "profile_key", value: toStr(row.profile_key) };
}

function normalizePrivateProfileFields(row: Record<string, unknown>) {
  const createdDate = toStr(row.updated_at).split("T")[0];
  return compactFields({
    "Note Title": row.note_title,
    "Note Content": row.note_content,
    "Created Date": createdDate,
    Author: row.author,
    profile_key: row.profile_key,
    model_id: row.model_id,
    model_name: row.model_name,
    display_name: row.display_name,
    nickname: row.nickname,
    alias: row.alias,
    gender: row.gender,
    phone: row.phone,
    line_contact_id: row.line_contact_id,
    ig: row.ig,
    origin_country: row.origin_country,
    location_area: row.location_area,
    bangkok_area: row.bangkok_area,
    availability: row.availability,
    tattoo_area: row.tattoo_area,
    lgbt_experience: row.lgbt_experience,
    age: toMaybeNumber(row.age),
    height_cm: toMaybeNumber(row.height_cm),
    weight_kg: toMaybeNumber(row.weight_kg),
    minimum_rate_thb: toMaybeNumber(row.minimum_rate_thb),
    bank_name: row.bank_name,
    bank_account_name: row.bank_account_name,
    bank_account_last4: row.bank_account_last4,
    privacy_level: row.privacy_level,
    note_summary: row.note_summary,
    raw_note: row.raw_note,
    source_facts: row.source_facts,
    tags: row.tags,
    warnings: row.warnings,
    payload_json: row.payload_json,
    import_source: row.import_source,
    updated_at: row.updated_at,
  });
}

const AIRTABLE_MODELS_TABLE_DEFAULT = "tblI4B0bI446vp9GX";
const AIRTABLE_MODELS_INTERNAL_NOTES_LINK_FIELD = "Internal Notes";

async function getAirtableImportRecord(
  env: Env,
  tableId: string,
  recordId: string,
) {
  return await airtableImportRequest(env, `${tableId}/${encodeURIComponent(recordId)}`);
}

async function findModelRecordForPrivateProfile(env: Env, row: Record<string, unknown>) {
  const modelName = toStr(row.model_name);
  const nickname = toStr(row.nickname);
  const phone = toStr(row.phone);
  const modelsTableId = env.AIRTABLE_TABLE_MODELS || AIRTABLE_MODELS_TABLE_DEFAULT;

  if (modelName) {
    const records = await findAirtableImportRecords(env, modelsTableId, "working_name", modelName);
    if (records.length) return records[0] as Record<string, unknown>;
  }
  if (nickname) {
    const records = await findAirtableImportRecords(env, modelsTableId, "nickname", nickname);
    if (records.length) return records[0] as Record<string, unknown>;
  }
  if (phone && phone !== "unknown") {
    const records = await findAirtableImportRecords(env, modelsTableId, "phone", phone);
    if (records.length) return records[0] as Record<string, unknown>;
  }
  return null;
}

async function attachPrivateProfileContext(
  env: Env,
  row: Record<string, unknown>,
  result: Record<string, unknown>,
) {
  const noteRecordId = toStr(result.record_id);
  if (!noteRecordId || !env.AIRTABLE_TABLE_PRIVATE_PROFILE_NOTES) return;

  const modelName = toStr(row.model_name);
  const displayName = toStr(row.display_name);

  let relatedClientId = "";
  if (modelName) {
    const clientMatch = await findAirtableImportRecords(
      env,
      env.AIRTABLE_TABLE_CLIENTS || "tblVv58TCbwh5j1fS",
      "Client Name",
      modelName,
    );
    relatedClientId = toStr((clientMatch[0] as { id?: string } | undefined)?.id);
  }
  if (!relatedClientId && displayName) {
    const clientMatch = await findAirtableImportRecords(
      env,
      env.AIRTABLE_TABLE_CLIENTS || "tblVv58TCbwh5j1fS",
      "Client Name",
      displayName,
    );
    relatedClientId = toStr((clientMatch[0] as { id?: string } | undefined)?.id);
  }
  if (relatedClientId) {
    await patchAirtableImportRecordWithFallbacks(env, env.AIRTABLE_TABLE_PRIVATE_PROFILE_NOTES, noteRecordId, {
      "Related Client": [relatedClientId],
    });
  }

  const modelRecord = await findModelRecordForPrivateProfile(env, row);
  const modelRecordId = toStr((modelRecord as { id?: string } | null)?.id);
  if (!modelRecordId) return;

  const modelsTableId = env.AIRTABLE_TABLE_MODELS || AIRTABLE_MODELS_TABLE_DEFAULT;
  const current = await getAirtableImportRecord(env, modelsTableId, modelRecordId);
  const currentFields = current?.fields && typeof current.fields === "object"
    ? current.fields as Record<string, unknown>
    : {};
  const linkedNoteIds = Array.isArray(currentFields[AIRTABLE_MODELS_INTERNAL_NOTES_LINK_FIELD])
    ? currentFields[AIRTABLE_MODELS_INTERNAL_NOTES_LINK_FIELD].map((value) => toStr(value)).filter(Boolean)
    : [];
  const nextLinkedNoteIds = Array.from(new Set([...linkedNoteIds, noteRecordId]));
  const now = new Date().toISOString().slice(0, 10);
  const noteTitle = toStr(row.note_title);
  const summary = toStr(row.note_summary);
  const snippet = `[${now}] ${noteTitle}${summary ? ` :: ${summary}` : ""}`;
  const existingInternal = toStr(currentFields.internal_notes);

  const patchFields: Record<string, unknown> = {};
  if (!linkedNoteIds.includes(noteRecordId)) {
    patchFields[AIRTABLE_MODELS_INTERNAL_NOTES_LINK_FIELD] = nextLinkedNoteIds;
  }
  if (noteTitle && !existingInternal.includes(noteTitle)) {
    patchFields.internal_notes = [existingInternal, snippet].filter(Boolean).join("\n\n");
  }
  if (Object.keys(patchFields).length) {
    await patchAirtableImportRecordWithFallbacks(env, modelsTableId, modelRecordId, patchFields);
  }
}

async function airtableImportRequest(
  env: Env,
  tableId: string,
  init?: {
    method?: string;
    query?: Record<string, string>;
    body?: Record<string, unknown>;
  },
) {
  const url = new URL(`https://api.airtable.com/v0/${env.AIRTABLE_BASE_ID}/${tableId}`);
  if (init?.query) {
    Object.entries(init.query).forEach(([key, value]) => url.searchParams.set(key, value));
  }

  const response = await fetch(url.toString(), {
    method: init?.method || "GET",
    headers: {
      Authorization: `Bearer ${env.AIRTABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: init?.body ? JSON.stringify(init.body) : undefined,
  });

  const text = await response.text();
  const data = (() => {
    try {
      return JSON.parse(text) as Record<string, unknown>;
    } catch {
      return { raw: text };
    }
  })();

  if (!response.ok) {
    throw new Error(`Airtable ${response.status}: ${JSON.stringify(data)}`);
  }

  return data;
}

async function findAirtableImportRecords(env: Env, tableId: string, fieldName: string, fieldValue: string) {
  const formula = `{${fieldName}}="${encodeFormulaValue(fieldValue)}"`;
  const data = await airtableImportRequest(env, tableId, {
    query: { filterByFormula: formula },
  });
  return Array.isArray(data.records) ? data.records : [];
}

async function createAirtableImportRecord(env: Env, tableId: string, fields: Record<string, unknown>) {
  return await airtableImportRequest(env, tableId, {
    method: "POST",
    body: { fields },
  });
}

async function patchAirtableImportRecord(
  env: Env,
  tableId: string,
  recordId: string,
  fields: Record<string, unknown>,
) {
  return await airtableImportRequest(env, `${tableId}/${encodeURIComponent(recordId)}`, {
    method: "PATCH",
    body: { fields },
  });
}

function parseUnknownFieldName(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const match =
    message.match(/Unknown field name:\s+\\"([^"]+)\\"/) ||
    message.match(/Unknown field name:\s+"([^"]+)"/);
  return match?.[1] || "";
}

async function createAirtableImportRecordWithFallbacks(
  env: Env,
  tableId: string,
  fields: Record<string, unknown>,
) {
  const candidate = { ...fields };
  while (true) {
    try {
      return await createAirtableImportRecord(env, tableId, candidate);
    } catch (error) {
      const fieldName = parseUnknownFieldName(error);
      if (!fieldName) throw error;
      delete candidate[fieldName];
      if (!Object.keys(candidate).length) throw error;
    }
  }
}

async function patchAirtableImportRecordWithFallbacks(
  env: Env,
  tableId: string,
  recordId: string,
  fields: Record<string, unknown>,
) {
  const candidate = { ...fields };
  while (true) {
    try {
      return await patchAirtableImportRecord(env, tableId, recordId, candidate);
    } catch (error) {
      const fieldName = parseUnknownFieldName(error);
      if (!fieldName) throw error;
      delete candidate[fieldName];
      if (!Object.keys(candidate).length) throw error;
    }
  }
}

function importLogsTable(env: Env): string {
  return env.AIRTABLE_TABLE_IMPORT_LOGS || "MMD Import Logs";
}

async function writeImportLogToAirtable(
  env: Env,
  input: {
    label: string;
    route: string;
    import_type: string;
    mode: string;
    status: string;
    payload: unknown;
    request?: unknown;
    summary: unknown;
    counts?: unknown;
    error?: string;
  },
) {
  if (!env.AIRTABLE_API_KEY || !env.AIRTABLE_BASE_ID) return;
  try {
    await createAirtableImportRecord(env, importLogsTable(env), compactFields({
      log_id: `import_${Date.now().toString(36)}_${crypto.randomUUID().slice(0, 8)}`,
      label: input.label,
      route: input.route,
      import_type: input.import_type,
      mode: input.mode,
      status: input.status,
      error: input.error || "",
      created_at: new Date().toISOString(),
      payload_json: JSON.stringify(input.payload || {}),
      request_json: JSON.stringify(input.request || {}),
      summary_json: JSON.stringify(input.summary || {}),
      counts_json: JSON.stringify(input.counts || {}),
    }));
  } catch (error) {
    console.warn("import log airtable write failed", error);
  }
}

function parseImportLogJson(value: unknown) {
  const raw = toStr(value).trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Record<string, unknown> | Array<unknown>;
  } catch {
    return null;
  }
}

function buildImportLogRequest(fields: Record<string, unknown>) {
  const request = parseImportLogJson(fields.request_json);
  if (request && typeof request === "object" && !Array.isArray(request)) {
    return request as Record<string, unknown>;
  }

  const payload = parseImportLogJson(fields.payload_json);
  const importType = toStr(fields.import_type);
  const mode = toStr(fields.mode);
  const route = toStr(fields.route);
  const apply = mode === "apply";

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { route };
  }

  if (importType === "all") {
    return {
      payload,
      booking_apply: mode === "apply" || mode === "mixed",
      model_history_apply: mode === "apply" || mode === "mixed",
    };
  }

  return {
    payload,
    apply,
  };
}

async function readImportLogsFromAirtable(env: Env, limit: number) {
  const safeLimit = Number.isFinite(limit) ? Math.min(Math.max(Math.trunc(limit), 1), 100) : 30;
  const data = await airtableImportRequest(env, importLogsTable(env), {
    query: {
      maxRecords: String(safeLimit),
      "sort[0][field]": "created_at",
      "sort[0][direction]": "desc",
    },
  });
  const records = Array.isArray(data.records) ? data.records : [];
  return records.map((record) => {
    const normalized = (record && typeof record === "object") ? record as Record<string, unknown> : {};
    const fields = normalized.fields && typeof normalized.fields === "object"
      ? normalized.fields as Record<string, unknown>
      : {};
    return {
      id: toStr(normalized.id) || toStr(fields.log_id),
      log_id: toStr(fields.log_id),
      label: toStr(fields.label) || "Import",
      route: toStr(fields.route),
      import_type: toStr(fields.import_type),
      mode: toStr(fields.mode) || "dry_run",
      status: toStr(fields.status) || "ok",
      error: toStr(fields.error),
      at: toStr(fields.created_at),
      source: "airtable",
      payload: parseImportLogJson(fields.payload_json),
      request: buildImportLogRequest(fields),
      summary: parseImportLogJson(fields.summary_json) || {},
      counts: parseImportLogJson(fields.counts_json) || {},
    };
  });
}

async function processModelHistoryImportEntity(
  env: Env,
  rows: Array<Record<string, unknown>>,
  config: {
    tableId: string;
    lookupForRow: (row: Record<string, unknown>) => { field: string; value: string };
    mapFields: (row: Record<string, unknown>) => Record<string, unknown>;
    allowUpdate?: boolean;
    afterWrite?: (
      row: Record<string, unknown>,
      result: Record<string, unknown>,
    ) => Promise<void>;
  },
  apply: boolean,
) {
  const results: Array<Record<string, unknown>> = [];
  for (const row of rows) {
    const lookup = config.lookupForRow(row);
    const fields = config.mapFields(row);
    if (!lookup.value) {
      results.push({
        source_key: "",
        action: "skipped_missing_lookup",
        lookup_field: lookup.field,
        fields,
      });
      continue;
    }

    const existing = await findAirtableImportRecords(env, config.tableId, lookup.field, lookup.value);
    if (existing.length) {
      const existingRecordIds = existing.map((record) => (record as { id?: string }).id).filter(Boolean);
      if (config.allowUpdate) {
        if (!apply) {
          results.push({
            source_key: lookup.value,
            action: "would_update",
            lookup_field: lookup.field,
            existing_record_ids: existingRecordIds,
            fields,
          });
          continue;
        }
        const recordId = toStr(existingRecordIds[0]);
        const updated = await patchAirtableImportRecordWithFallbacks(env, config.tableId, recordId, fields);
        results.push({
          source_key: lookup.value,
          action: "updated",
          lookup_field: lookup.field,
          existing_record_ids: existingRecordIds,
          record_id: toStr(updated.id) || recordId,
          fields,
        });
        if (config.afterWrite) {
          await config.afterWrite(row, results[results.length - 1] as Record<string, unknown>);
        }
        continue;
      }
      results.push({
        source_key: lookup.value,
        action: "skipped_existing",
        lookup_field: lookup.field,
        existing_record_ids: existingRecordIds,
        fields,
      });
      continue;
    }

    if (!apply) {
      results.push({
        source_key: lookup.value,
        action: "would_create",
        lookup_field: lookup.field,
        fields,
      });
      continue;
    }

    const created = await createAirtableImportRecordWithFallbacks(env, config.tableId, fields);
    results.push({
      source_key: lookup.value,
      action: "created",
      lookup_field: lookup.field,
      record_id: toStr(created.id),
      fields,
    });
    if (config.afterWrite) {
      await config.afterWrite(row, results[results.length - 1] as Record<string, unknown>);
    }
  }
  return results;
}

function buildRulesUrl(baseUrl: string, directUrl: string, pathOverride: string | undefined, fallbackPath: string): string {
  if (toStr(directUrl)) {
    return buildAbsoluteUrl(baseUrl, directUrl, fallbackPath);
  }
  return buildAbsoluteUrl(baseUrl, pathOverride, fallbackPath);
}

async function buildLinksBundle(
  env: Env,
  payload: {
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
  },
) {
  const baseUrl = defaultPublicBaseUrl(env);
  const immigrationId = requiredString(payload.immigration_id, "immigration_id");
  const expiresInHours = clampExpiryHours(payload.expires_in_hours);
  const displayName = toStr(payload.display_name) || immigrationId;
  const modelName = toStr(payload.model_name) || `model_${immigrationId.slice(-6)}`;

  const customerIdentity = parseInviteIdentity({
    client_name: displayName,
    nickname: displayName,
    email: toStr(payload.email).toLowerCase(),
    line_user_id: toStr(payload.line_user_id),
    memberstack_id: toStr(payload.memberstack_id),
  });

  const modelIdentity = parseInviteIdentity({
    folder_name: modelName,
    nickname: modelName,
  });

  const customerRulesUrl = buildRulesUrl(
    baseUrl,
    toStr(payload.rules_url),
    payload.customer_rules_path,
    "/rules/customer",
  );
  const modelRulesUrl = buildRulesUrl(
    baseUrl,
    "",
    payload.model_rules_path,
    "/rules/private-model-work",
  );

  const customerInvite = await generateInviteLink(env, {
    invite_id: makeInviteId(),
    immigration_id: immigrationId,
    username: customerIdentity.username,
    nickname: customerIdentity.nickname,
    suffix_code: customerIdentity.suffix_code,
    mmd_client_name: customerIdentity.mmd_client_name,
    email: toStr(payload.email).toLowerCase(),
    line_user_id: toStr(payload.line_user_id),
    memberstack_id: toStr(payload.memberstack_id),
    invite_page: toStr(payload.customer_onboarding_path) || "/sigil/onboarding",
    expires_in_hours: expiresInHours,
    role: "customer",
    lane: "customer_onboarding",
    model_name: modelName,
    model_record_id: toStr(payload.model_record_id),
    rules_url: customerRulesUrl,
    console_url: toStr(payload.console_url),
    requires_rules_ack: boolFromUnknown(payload.requires_rules_ack, false),
    requires_model_binding: boolFromUnknown(payload.requires_model_binding, false),
  });

  const modelInvite = await generateInviteLink(env, {
    invite_id: makeInviteId(),
    immigration_id: immigrationId,
    username: modelIdentity.username,
    nickname: modelIdentity.nickname,
    suffix_code: modelIdentity.suffix_code,
    mmd_client_name: modelIdentity.mmd_client_name,
    invite_page: toStr(payload.model_onboarding_path) || "/model/onboarding",
    expires_in_hours: expiresInHours,
    role: "model",
    lane: "model_console",
    model_name: modelName,
    model_record_id: toStr(payload.model_record_id),
    rules_url: modelRulesUrl,
    console_url: toStr(payload.console_url),
    requires_rules_ack: boolFromUnknown(payload.requires_rules_ack, true),
    requires_model_binding: boolFromUnknown(payload.requires_model_binding, true),
  });

  const customerDashboardUrl = `${buildAbsoluteUrl(
    baseUrl,
    toStr(payload.customer_dashboard_path) || "/member/dashboard",
    "/member/dashboard",
  )}?t=${encodeURIComponent(customerInvite.customer_invite_t)}`;

  const modelDashboardUrl = `${buildAbsoluteUrl(
    baseUrl,
    toStr(payload.model_dashboard_path) || "/model/dashboard",
    "/model/dashboard",
  )}?t=${encodeURIComponent(modelInvite.customer_invite_t)}`;

  const context = await buildImmigrationLinkContext(env, {
    immigration_id: immigrationId,
    line_user_id: toStr(payload.line_user_id),
    memberstack_id: toStr(payload.memberstack_id),
    email: toStr(payload.email).toLowerCase(),
    display_name: displayName,
    membership_status: toStr(payload.membership_status),
    current_tier: toStr(payload.current_tier),
    target_tier: toStr(payload.target_tier),
  });

  return {
    immigration_id: immigrationId,
    expires_at: customerInvite.expires_at,
    expires_in_hours: expiresInHours,
    customer_token: customerInvite.customer_invite_t,
    model_token: modelInvite.customer_invite_t,
    customer_url: customerInvite.customer_onboarding_url,
    model_url: modelInvite.customer_onboarding_url,
    customer_rules_url: customerRulesUrl,
    model_rules_url: modelRulesUrl,
    customer_dashboard_url: customerDashboardUrl,
    model_dashboard_url: modelDashboardUrl,
    context,
  };
}

async function handleCreateImmigrationLinks(request: Request, env: Env): Promise<Response> {
  const meta = makeMeta(request);
  const payload = (await request.json().catch(() => null)) as ImmigrationLinksRequest | null;

  if (!payload || typeof payload !== "object") {
    return badRequest("valid links payload is required", meta);
  }

  const data = await buildLinksBundle(env, payload);

  const body: ImmigrationLinksResponse = {
    ok: true,
    data,
    meta,
  };

  writeLinkAuditRecord(env, {
    immigration_id: data.immigration_id,
    display_name: payload.display_name,
    line_user_id: payload.line_user_id,
    memberstack_id: payload.memberstack_id,
    customer_url: data.customer_url,
    model_url: data.model_url,
    customer_rules_url: data.customer_rules_url,
    model_rules_url: data.model_rules_url,
    customer_dashboard_url: data.customer_dashboard_url,
    model_dashboard_url: data.model_dashboard_url,
    context: data.context,
  }).catch((error) => {
    console.warn("immigrate-worker create-links audit failed", error);
  });

  return json(body);
}

async function handleLogs(request: Request): Promise<Response> {
  const meta = makeMeta(request);
  const scope = new URL(request.url).searchParams.get("scope");
  const logs = scope ? seedLogs.filter((log) => log.scope === scope) : seedLogs;

  const body: LogsResponse = {
    ok: true,
    logs,
    message: "Mock logs loaded from immigrate-worker.",
    meta,
  };

  return json(body);
}

async function handleSessions(request: Request, env: Env): Promise<Response> {
  const meta = makeMeta(request);
  const status = new URL(request.url).searchParams.get("status");

  if (env.REALTIME_SESSIONS_URL) {
    const response = await fetch(env.REALTIME_SESSIONS_URL + (status ? `?status=${encodeURIComponent(status)}` : ""), {
      headers: {
        "X-Internal-Token": readInternalToken(request) || env.INTERNAL_TOKEN,
      },
    });

    if (response.ok) {
      const payload = (await response.json()) as { sessions?: unknown[]; message?: string };
      return json({
        ok: true,
        sessions: Array.isArray(payload.sessions) ? payload.sessions : [],
        message: payload.message || "Loaded sessions from realtime upstream.",
        meta,
      });
    }
  }

  if (canReadAirtable(env)) {
    try {
      const sessions = await listSessionsFromAirtable(env);
      const filtered = status ? sessions.filter((session) => session.status === status) : sessions;

      return json({
        ok: true,
        sessions: filtered,
        message: `Loaded ${filtered.length} sessions from Airtable.`,
        meta,
      });
    } catch (error) {
      console.warn("immigrate-worker sessions fallback to seed", error);
    }
  }

  const sessions = status ? seedSessions.filter((session) => session.status === status) : seedSessions;

  const body: SessionsResponse = {
    ok: true,
    sessions,
    message: `Loaded ${sessions.length} sessions from immigrate-worker placeholder feed.`,
    meta,
  };

  return json(body);
}

async function handleCreateLinks(request: Request, env: Env): Promise<Response> {
  const meta = makeMeta(request);
  const payload = (await request.json().catch(() => null)) as InvitePayload | null;

  if (!payload || typeof payload !== "object") {
    return badRequest("invalid request body", meta);
  }

  if (!hasCreateLinksUpstream(env)) {
    return badRequest("create-links upstream is not configured", meta, {
      field: "CREATE_LINKS_URL",
    });
  }

  const upstreamUrl = env.CREATE_LINKS_URL
    ? env.CREATE_LINKS_URL
    : env.JOBS_WORKER_BASE_URL
      ? `${env.JOBS_WORKER_BASE_URL.replace(/\/+$/, "")}/v1/jobs/create-links`
      : "";

  const invitePayload = payload as InvitePayload;
  const identity = parseInviteIdentity(toInviteIdentityPayload(invitePayload));
  const role = parseInviteRole(invitePayload.invite_role);
  const lane = parseInviteLane(invitePayload.invite_lane, role);
  let upstreamPayload: Record<string, unknown>;

  try {
    upstreamPayload = normalizeCreateLinksPayload(invitePayload, env);
  } catch (error) {
    const message = error instanceof Error ? error.message : "invalid_create_links_payload";
    return badRequest(message, meta);
  }

  const linkBundle = await buildLinksBundle(env, {
    immigration_id: toStr(invitePayload.session_id || invitePayload.payment_ref || `job_${Date.now().toString(36)}`),
    display_name: toStr(invitePayload.client_name || invitePayload.mmd_client_name),
    email: toStr(invitePayload.email || invitePayload.gmail).toLowerCase(),
    line_user_id: toStr(invitePayload.line_user_id),
    memberstack_id: toStr(invitePayload.memberstack_id),
    model_name: toStr(invitePayload.model_name),
    model_record_id: toStr(invitePayload.model_record_id),
    rules_url: toStr(invitePayload.rules_url),
    customer_rules_path: undefined,
    model_rules_path: undefined,
    console_url: toStr(invitePayload.console_url),
    requires_rules_ack: boolFromUnknown(invitePayload.requires_rules_ack, role === "model"),
    requires_model_binding: boolFromUnknown(invitePayload.requires_model_binding, role === "model"),
    customer_onboarding_path: role === "customer" ? toStr(invitePayload.invite_page) : undefined,
    model_onboarding_path: role === "model" ? toStr(invitePayload.invite_page) : undefined,
    expires_in_hours: Number(invitePayload.expires_in_hours || 24 * 7),
  });

  if (upstreamUrl) {
      const upstream = await fetch(upstreamUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(upstreamPayload),
      });

    const text = await upstream.text();
    const contentType = upstream.headers.get("content-type") || "application/json; charset=utf-8";

    if (contentType.includes("application/json")) {
      try {
        const payloadJson = JSON.parse(text) as Record<string, unknown>;
        const merged = {
          ...payloadJson,
          onboarding_url: role === "model" ? linkBundle.model_url : linkBundle.customer_url,
          customer_onboarding_url: linkBundle.customer_url,
          model_onboarding_url: linkBundle.model_url,
          customer_rules_url: linkBundle.customer_rules_url,
          model_rules_url: linkBundle.model_rules_url,
          customer_dashboard_url: linkBundle.customer_dashboard_url,
          model_dashboard_url: linkBundle.model_dashboard_url,
          link_context: linkBundle.context,
          customer_username: identity.username,
          customer_invite_expires_at: linkBundle.expires_at,
          invite_role: role,
          invite_lane: lane,
        };

        writeLinkAuditRecord(env, {
          immigration_id: linkBundle.immigration_id,
          display_name: toStr(invitePayload.client_name || invitePayload.mmd_client_name),
          line_user_id: toStr(invitePayload.line_user_id),
          memberstack_id: toStr(invitePayload.memberstack_id),
          customer_url: linkBundle.customer_url,
          model_url: linkBundle.model_url,
          customer_rules_url: linkBundle.customer_rules_url,
          model_rules_url: linkBundle.model_rules_url,
          customer_dashboard_url: linkBundle.customer_dashboard_url,
          model_dashboard_url: linkBundle.model_dashboard_url,
          context: linkBundle.context,
        }).catch((error) => {
          console.warn("immigrate-worker internal create-links audit failed", error);
        });

        return json(merged);
      } catch (error) {
        console.warn("immigrate-worker create-links upstream json parse failed", error);
      }
    }

    return new Response(text, {
      status: upstream.status,
      headers: {
        "content-type": contentType,
      },
    });
  }

  return json(
    {
      ok: true,
      url: `/jobs/mock/${String((payload as Record<string, unknown>).client || "client").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "client"}-${String((payload as Record<string, unknown>).package || "session").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "session"}`,
      message: "Mock job link created from immigrate-worker compatibility route.",
      onboarding_url: role === "model" ? linkBundle.model_url : linkBundle.customer_url,
      customer_onboarding_url: linkBundle.customer_url,
      model_onboarding_url: linkBundle.model_url,
      customer_rules_url: linkBundle.customer_rules_url,
      model_rules_url: linkBundle.model_rules_url,
      customer_dashboard_url: linkBundle.customer_dashboard_url,
      model_dashboard_url: linkBundle.model_dashboard_url,
      link_context: linkBundle.context,
      customer_username: identity.username,
      customer_invite_expires_at: linkBundle.expires_at,
      invite_role: role,
      invite_lane: lane,
      meta,
    },
  );
}

async function handleCustomerConfirm(request: Request, env: Env): Promise<Response> {
  const meta = makeMeta(request);
  const payload = (await request.json().catch(() => null)) as CustomerBookingConfirmRequest | null;

  if (!payload || typeof payload !== "object") {
    return badRequest("invalid request body", meta);
  }

  const sessionId = toStr(payload.session_id);
  if (!sessionId) {
    return badRequest("missing_session_id", meta);
  }

  const paymentType = toStr(payload.payment_type).toLowerCase() === "full" ? "full" : "deposit";
  const selectedAmountRaw =
    payload.selected_amount_thb == null ? null : Number(payload.selected_amount_thb);
  const selectedAmount =
    selectedAmountRaw != null && Number.isFinite(selectedAmountRaw) ? selectedAmountRaw : null;

  try {
    const result = await confirmCustomerBookingToAirtable(env, {
      session_id: sessionId,
      payment_ref: toStr(payload.payment_ref),
      payment_type: paymentType,
      selected_amount_thb: selectedAmount ?? undefined,
      note: toStr(payload.note),
      client_name: toStr(payload.client_name),
    });

    const body: CustomerBookingConfirmResponse = {
      ok: true,
      data: {
        session_id: sessionId,
        payment_ref: result.payment_ref,
        payment_type: result.payment_type === "full" ? "full" : "deposit",
        selected_amount_thb: result.selected_amount_thb,
        session_status: result.session_status,
        payment_status: result.payment_status,
        confirmed_at: result.confirmed_at,
        mode: result.mode,
      },
      meta,
    };

    return publicJson(request, env, body);
  } catch (error) {
    const message = error instanceof Error ? error.message : "customer_confirm_failed";
    const status = message === "session_not_found" ? 404 : 400;
    return publicJson(
      request,
      env,
      {
        ok: false,
        error: {
          code: status === 404 ? "SESSION_NOT_FOUND" : "INVALID_INPUT",
          message,
        },
        meta,
      },
      { status },
    );
  }
}

async function handleCreateInvite(request: Request, env: Env): Promise<Response> {
  const meta = makeMeta(request);
  const payload = (await request.json().catch(() => null)) as InvitePayload | null;

  if (!payload || typeof payload !== "object") {
    return badRequest("invalid request body", meta);
  }

  const role = parseInviteRole(payload.invite_role);
  const identitySource =
    role === "model"
      ? payload.folder_name || payload.model_name || payload.client_name || payload.nickname
      : payload.client_name || payload.nickname;
  requiredString(identitySource, role === "model" ? "folder_name" : "client_name");

  const identity = parseInviteIdentity(toInviteIdentityPayload(payload));
  const lane = parseInviteLane(payload.invite_lane, role);
  const invite = await generateInviteLink(env, {
    invite_id: makeInviteId(),
    username: identity.username,
    nickname: identity.nickname,
    suffix_code: identity.suffix_code,
    mmd_client_name: identity.mmd_client_name,
    email: toStr(payload.email || payload.gmail).toLowerCase(),
    line_user_id: toStr(payload.line_user_id),
    telegram_username: toStr(payload.telegram_username || payload.customer_telegram_username),
    memberstack_id: toStr(payload.memberstack_id),
    invite_page: toStr(payload.invite_page),
    expires_in_hours: Number(payload.expires_in_hours || 24 * 7),
    role,
    lane,
    model_name: toStr(payload.model_name),
    model_record_id: toStr(payload.model_record_id),
    rules_url: toStr(payload.rules_url),
    console_url: toStr(payload.console_url),
    requires_rules_ack: boolFromUnknown(payload.requires_rules_ack, role === "model"),
    requires_model_binding: boolFromUnknown(payload.requires_model_binding, role === "model"),
  });

  return json({
    ok: true,
    username: identity.username,
    nickname: identity.nickname,
    suffix_code: identity.suffix_code,
    mmd_client_name: identity.mmd_client_name,
    onboarding_url: invite.onboarding_url,
    customer_onboarding_url: invite.customer_onboarding_url,
    invite_role: role,
    invite_lane: lane,
    expires_at: invite.expires_at,
    meta,
  });
}

async function handleResolveInvite(request: Request, env: Env): Promise<Response> {
  const meta = makeMeta(request);
  try {
    const token = requiredString(new URL(request.url).searchParams.get("t"), "t");
    const invite = await verifyInviteToken(token, String(env.CONFIRM_KEY || env.INTERNAL_TOKEN || ""));
    const prefill: InvitePrefill = {
      username: invite.username,
      nickname: invite.nickname,
      suffix_code: invite.suffix_code,
      client_name: invite.mmd_client_name,
      display_name: invite.mmd_client_name,
      email: invite.email || "",
      line_user_id: invite.line_user_id || "",
      telegram_username: invite.telegram_username || "",
      memberstack_id: invite.memberstack_id || "",
      model_name: invite.model_name || "",
      model_record_id: invite.model_record_id || "",
    };
    const requirements: InviteRequirements = {
      rules_ack_required: Boolean(invite.requires_rules_ack),
      model_binding_required: Boolean(invite.requires_model_binding),
    };
    const experienceContract = buildExperienceContract(invite.role, invite.lane);

    const body: InviteResolveResponse = {
      ok: true,
      invite_id: invite.invite_id,
      role: invite.role,
      lane: invite.lane,
      prefill,
      requirements,
      immigration_id: invite.immigration_id || "",
      model_profile: {
        model_name: invite.model_name || "",
        model_record_id: invite.model_record_id || "",
      },
      routes: {
        rules_url: invite.rules_url || "",
        console_url: invite.console_url || "",
      },
      experience_contract: experienceContract,
      expires_at: new Date(invite.exp * 1000).toISOString(),
      meta,
    };

    return json(body);
  } catch (error) {
    const message = error instanceof Error ? error.message : "invalid_invite_token";
    const status = message === "expired_invite_token" ? 410 : 400;
    return json(
      {
        ok: false,
        error: {
          code: status === 410 ? "INVITE_EXPIRED" : "INVALID_INVITE",
          message,
        },
        meta,
      },
      { status },
    );
  }
}

function isHealthRoute(pathname: string): boolean {
  return (
    pathname === CANONICAL.ping ||
    pathname === CANONICAL.health ||
    pathname === CONTROL_ROOM.health ||
    pathname === SIGIL.controlRoomHealth
  );
}

function isListRoute(pathname: string): boolean {
  return pathname === CANONICAL.list || pathname === CONTROL_ROOM.list || pathname === SIGIL.controlRoomList;
}

function isRefreshRoute(pathname: string): boolean {
  return pathname === CANONICAL.refresh || pathname === CONTROL_ROOM.refresh || pathname === SIGIL.controlRoomRefresh;
}

function isSyncRoute(pathname: string): boolean {
  return pathname === CANONICAL.sync || pathname === CONTROL_ROOM.sync || pathname === SIGIL.controlRoomSync;
}

function isPublicRenewalIntakeRoute(pathname: string): boolean {
  return pathname === PUBLIC.renewalIntake || pathname === SIGIL.renewalIntake;
}

function isPublicRenewalStatusRoute(pathname: string): boolean {
  return pathname === PUBLIC.renewalStatus || pathname === SIGIL.renewalStatus;
}

function isPublicCustomerConfirmRoute(pathname: string): boolean {
  return pathname === PUBLIC.customerConfirm || pathname === JOBS.customerConfirm || pathname === SIGIL.customerConfirm;
}

function isLogsRoute(pathname: string): boolean {
  return pathname === CONTROL_ROOM.logs || pathname === SIGIL.controlRoomLogs;
}

function isSessionsRoute(pathname: string): boolean {
  return (
    pathname === CONTROL_ROOM.sessions ||
    pathname === CONTROL_ROOM.sessionRefresh ||
    pathname === SIGIL.controlRoomSessions ||
    pathname === SIGIL.controlRoomSessionRefresh
  );
}

function parseCookieMap(request: Request): Map<string, string> {
  const raw = request.headers.get("cookie") || "";
  const map = new Map<string, string>();

  for (const part of raw.split(";")) {
    const [name, ...rest] = part.split("=");
    const key = name.trim();
    if (!key) continue;
    map.set(key, rest.join("=").trim());
  }

  return map;
}

function isProtectedBrowserRoute(pathname: string): boolean {
  // This worker only gates the immigration control-room surface, not the separate admin console.
  if (pathname === "/internal/admin/console" || pathname.startsWith("/internal/admin/console/")) {
    return false;
  }

  const isAdminPage =
    pathname === CONTROL_ROOM.root ||
    pathname.startsWith(`${CONTROL_ROOM.root}/`) ||
    pathname === SIGIL.controlRoom ||
    pathname.startsWith(`${SIGIL.controlRoom}/`) ||
    pathname === SIGIL.createSession ||
    pathname === SIGIL.createJob;
  const isJobsPage = pathname === JOBS.root || pathname.startsWith(`${JOBS.root}/`);

  if (!isAdminPage && !isJobsPage) return false;
  if (
    pathname === CONTROL_ROOM.login ||
    pathname === CONTROL_ROOM.loginSession ||
    pathname === SIGIL.login ||
    pathname === SIGIL.loginSession
  ) return false;
  if (isHealthRoute(pathname)) return false;
  if (isListRoute(pathname)) return false;
  if (isRefreshRoute(pathname)) return false;
  if (isSyncRoute(pathname)) return false;
  if (isLogsRoute(pathname)) return false;
  if (isSessionsRoute(pathname)) return false;
  if (pathname === JOBS.createLinks || pathname === JOBS.createInvite) return false;

  return true;
}

function isSigilPath(pathname: string): boolean {
  return pathname === SIGIL.root || pathname.startsWith(`${SIGIL.root}/`);
}

function selectAdminLoginPath(pathname: string): string {
  return isSigilPath(pathname) ? SIGIL.login : CONTROL_ROOM.login;
}

function selectAdminDefaultNext(pathname: string): string {
  return isSigilPath(pathname) ? SIGIL.controlRoom : ADMIN_GATE_DEFAULT_NEXT;
}

function getLegacyAdminPath(pathname: string): string {
  switch (pathname) {
    case SIGIL.login:
      return CONTROL_ROOM.login;
    case SIGIL.loginSession:
      return CONTROL_ROOM.loginSession;
    case SIGIL.verifyAccessCode:
      return CONTROL_ROOM.verifyAccessCode;
    case SIGIL.controlRoom:
      return CONTROL_ROOM.root;
    case SIGIL.controlRoomHealth:
      return CONTROL_ROOM.health;
    case SIGIL.controlRoomList:
      return CONTROL_ROOM.list;
    case SIGIL.controlRoomRefresh:
      return CONTROL_ROOM.refresh;
    case SIGIL.controlRoomSync:
      return CONTROL_ROOM.sync;
    case SIGIL.controlRoomLogs:
      return CONTROL_ROOM.logs;
    case SIGIL.controlRoomSessions:
      return CONTROL_ROOM.sessions;
    case SIGIL.controlRoomSessionRefresh:
      return CONTROL_ROOM.sessionRefresh;
    case SIGIL.createSession:
      return ADMIN_JOBS.createSessionLegacy;
    case SIGIL.createJob:
      return JOBS.createJob;
    case SIGIL.inviteResolve:
      return PUBLIC.onboardingResolve;
    case SIGIL.renewalStatus:
      return PUBLIC.renewalStatus;
    case SIGIL.renewalIntake:
      return PUBLIC.renewalIntake;
    case SIGIL.customerConfirm:
      return PUBLIC.customerConfirm;
    default:
      return pathname;
  }
}

function makeLoginRedirect(request: Request, pathname: string): Response {
  const url = new URL(request.url);
  const next = pathname + url.search;
  const loginUrl = new URL(selectAdminLoginPath(pathname), url.origin);
  loginUrl.searchParams.set("next", next);
  return redirect(loginUrl.toString(), 302);
}

function encodeGateSession(session: AdminGateSession): string {
  return btoa(JSON.stringify(session));
}

function decodeGateSession(value: string): AdminGateSession | null {
  try {
    const parsed = JSON.parse(atob(value)) as AdminGateSession;
    return parsed && parsed.ok === true ? parsed : null;
  } catch {
    return null;
  }
}

function normalizeAdminBaseUrl(value: unknown, request: Request): string {
  const rawInput = toStr(value) || new URL(request.url).origin;
  const withProtocol = /^https?:\/\//i.test(rawInput) ? rawInput : `https://${rawInput}`;

  let url: URL;
  try {
    url = new URL(withProtocol);
  } catch {
    throw new Error("invalid_base_url");
  }

  const normalized = `https://${url.hostname.replace(/\/+$/, "")}`;
  if (!ADMIN_GATE_ALLOWED_BASE_URLS.has(normalized)) {
    throw new Error("base_url_not_allowed");
  }

  return normalized;
}

function defaultAdminGateBaseUrl(env: Env): string {
  const configured = toStr(env.ADMIN_WORKER_BASE_URL).replace(/\/+$/, "");
  if (configured.startsWith("https://")) return configured;
  return "https://admin-worker.malemodel-bkk.workers.dev";
}

function collectAdminVerifyCandidates(baseUrl: string, request: Request, env: Env): string[] {
  const candidates = new Set<string>();
  candidates.add(baseUrl);

  const adminWorkerBaseUrl = toStr(env.ADMIN_WORKER_BASE_URL).replace(/\/+$/, "");
  if (adminWorkerBaseUrl.startsWith("https://")) {
    candidates.add(adminWorkerBaseUrl);
  }

  const requestOrigin = new URL(request.url).origin.replace(/\/+$/, "");
  if (requestOrigin.startsWith("https://")) {
    candidates.add(requestOrigin);
  }

  if (baseUrl === "https://mmdbkk.com") {
    candidates.add("https://www.mmdbkk.com");
  } else if (baseUrl === "https://www.mmdbkk.com") {
    candidates.add("https://mmdbkk.com");
  }

  return [...candidates].filter(Boolean);
}

async function verifyAdminAuthority(
  baseUrl: string,
  request: Request,
  env: Env,
  headers: Headers,
): Promise<boolean> {
  if (env.ADMIN_WORKER) {
    try {
      const serviceRequest = new Request("https://admin-worker.internal/v1/admin/ping", {
        method: "GET",
        headers: new Headers(headers),
      });
      const serviceResponse = await env.ADMIN_WORKER.fetch(serviceRequest);
      if (serviceResponse.ok) return true;
    } catch (error) {
      console.warn("admin ping verify failed via service binding", error);
    }
  }

  for (const candidate of collectAdminVerifyCandidates(baseUrl, request, env)) {
    try {
      const response = await fetch(`${candidate}/v1/admin/ping`, {
        method: "GET",
        headers: new Headers(headers),
      });
      if (response.ok) return true;
    } catch (error) {
      console.warn("admin ping verify failed", candidate, error);
    }
  }

  return false;
}

function makeGateSessionCookie(request: Request, session: AdminGateSession): string {
  const isSecure = new URL(request.url).protocol === "https:";
  const parts = [
    `${ADMIN_GATE_SESSION_KEY}=${encodeURIComponent(encodeGateSession(session))}`,
    "Path=/",
    "SameSite=Lax",
    `Max-Age=${Math.floor(ADMIN_GATE_TTL_MS / 1000)}`,
  ];

  if (isSecure) parts.push("Secure");
  return parts.join("; ");
}

function clearGateSessionCookie(request: Request): string {
  const isSecure = new URL(request.url).protocol === "https:";
  const parts = [
    `${ADMIN_GATE_SESSION_KEY}=`,
    "Path=/",
    "SameSite=Lax",
    "Max-Age=0",
  ];

  if (isSecure) parts.push("Secure");
  return parts.join("; ");
}

function normalizeAdminNextPath(value: unknown, fallback: string = ADMIN_GATE_DEFAULT_NEXT): string {
  const raw = toStr(value);
  if (!raw.startsWith("/") || raw.startsWith("//")) {
    return fallback;
  }

  try {
    const parsed = new URL(raw, "https://mmdbkk.com");
    if (parsed.origin !== "https://mmdbkk.com") {
      return fallback;
    }
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}

function readGateSession(request: Request): AdminGateSession | null {
  const cookieValue = parseCookieMap(request).get(ADMIN_GATE_SESSION_KEY);
  if (!cookieValue) return null;
  return decodeGateSession(decodeURIComponent(cookieValue));
}

function isGateSessionValid(session: AdminGateSession | null): session is AdminGateSession {
  if (!session || session.ok !== true) return false;
  if (!session.baseUrl || !ADMIN_GATE_ALLOWED_BASE_URLS.has(session.baseUrl)) return false;
  if (!session.bearer && !session.confirmKey) return false;
  if (!Number.isFinite(session.at)) return false;
  if (Date.now() - session.at > ADMIN_GATE_TTL_MS) return false;
  return true;
}

function getValidatedGateSession(request: Request): AdminGateSession | null {
  const session = readGateSession(request);
  return isGateSessionValid(session) ? session : null;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function adminGateBootstrapScript(session: AdminGateSession, next: string, loginPath: string): string {
  return `
<script>
(() => {
  const KEY = ${JSON.stringify(ADMIN_GATE_SESSION_KEY)};
  const TTL_MS = ${String(ADMIN_GATE_TTL_MS)};
  const LOGIN_PATH = ${JSON.stringify(loginPath)};
  const serverSession = ${JSON.stringify(session)};
  const defaultNext = ${JSON.stringify(next)};

  function isValid(value) {
    return !!value &&
      value.ok === true &&
      typeof value.at === "number" &&
      Date.now() - value.at <= TTL_MS &&
      typeof value.baseUrl === "string" &&
      value.baseUrl.length > 0 &&
      (value.bearer || value.confirmKey);
  }

  function getNextUrl() {
    return location.pathname + location.search + location.hash;
  }

  function redirectToLogin() {
    try { sessionStorage.removeItem(KEY); } catch {}
    location.replace(LOGIN_PATH + "?next=" + encodeURIComponent(getNextUrl() || defaultNext));
  }

  let session = null;
  try {
    session = JSON.parse(sessionStorage.getItem(KEY) || "null");
  } catch {
    session = null;
  }

  if (!isValid(session) && isValid(serverSession)) {
    session = serverSession;
    try { sessionStorage.setItem(KEY, JSON.stringify(session)); } catch {}
  }

  if (!isValid(session)) {
    redirectToLogin();
    return;
  }

  const originalFetch = window.fetch.bind(window);
  window.__MMD_ADMIN_GATE__ = {
    key: KEY,
    session,
    getSession() {
      return session;
    },
    buildHeaders(extraHeaders) {
      const headers = new Headers(extraHeaders || {});
      if (session.bearer) headers.set("Authorization", "Bearer " + session.bearer);
      if (session.confirmKey) headers.set("X-Confirm-Key", session.confirmKey);
      return headers;
    },
    logout() {
      try { sessionStorage.removeItem(KEY); } catch {}
      return originalFetch(${JSON.stringify(loginPath === SIGIL.login ? SIGIL.loginSession : CONTROL_ROOM.loginSession)}, { method: "DELETE", credentials: "same-origin" })
        .finally(() => location.replace(LOGIN_PATH + "?next=" + encodeURIComponent(defaultNext)));
    }
  };

  window.fetch = function(input, init) {
    const raw = typeof input === "string" || input instanceof URL ? String(input) : "";
    if (!raw) return originalFetch(input, init);

    const url = new URL(raw, location.origin);
    if (!url.pathname.startsWith("/v1/admin/")) {
      return originalFetch(input, init);
    }

    const target = session.baseUrl.replace(/\\/+$/, "") + url.pathname + url.search + url.hash;
    const headers = window.__MMD_ADMIN_GATE__.buildHeaders(init && init.headers);
    return originalFetch(target, { ...init, headers });
  };
})();
</script>`;
}

async function withInjectedAdminBootstrap(
  request: Request,
  response: Response,
  session: AdminGateSession,
): Promise<Response> {
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.toLowerCase().includes("text/html")) {
    return response;
  }

  const html = await response.text();
  const requestUrl = new URL(request.url);
  const next = normalizeAdminNextPath(
    requestUrl.pathname + requestUrl.search,
    selectAdminDefaultNext(requestUrl.pathname),
  );
  const loginPath = selectAdminLoginPath(requestUrl.pathname);
  const injected = html.includes("</head>")
    ? html.replace("</head>", `${adminGateBootstrapScript(session, next, loginPath)}</head>`)
    : `${adminGateBootstrapScript(session, next, loginPath)}${html}`;

  const headers = new Headers(response.headers);
  headers.delete("content-length");
  return new Response(injected, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function renderAdminLoginPage(request: Request, env: Env): Response {
  const url = new URL(request.url);
  const fallbackNext = selectAdminDefaultNext(url.pathname);
  const next = normalizeAdminNextPath(url.searchParams.get("next"), fallbackNext);
  const defaultBaseUrl = defaultAdminGateBaseUrl(env);
  const loginSessionPath = url.pathname === SIGIL.login ? SIGIL.loginSession : CONTROL_ROOM.loginSession;

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>MMD Admin Login</title>
    <style>
      :root {
        color-scheme: dark;
        --bg: #050506;
        --panel: rgba(14,13,15,.88);
        --panel-strong: rgba(6,6,7,.74);
        --line: rgba(247,240,232,.14);
        --line-strong: rgba(197,151,44,.34);
        --text: #f7f0e8;
        --muted: rgba(216,205,194,.74);
        --gold: #c5972c;
        --gold-soft: rgba(197,151,44,.16);
        --danger: #f2b0b0;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        padding: 24px;
        color: var(--text);
        background:
          radial-gradient(circle at 14% 18%, rgba(197,151,44,.13), transparent 24%),
          radial-gradient(circle at 88% 10%, rgba(116,124,120,.10), transparent 25%),
          linear-gradient(180deg, #0d0c0d 0%, #050506 56%, #020202 100%);
        font-family: Inter, "Avenir Next", "Segoe UI", "Noto Sans Thai", Arial, sans-serif;
      }
      .mmd-login {
        position: relative;
        width: min(100%, 1180px);
        min-height: min(820px, calc(100vh - 48px));
        overflow: hidden;
        border: 1px solid var(--line);
        border-radius: 22px;
        background: #070707;
        box-shadow: 0 28px 90px rgba(0,0,0,.48);
        isolation: isolate;
      }
      .mmd-login__bg,
      .mmd-login__overlay {
        position: absolute;
        inset: 0;
        pointer-events: none;
      }
      .mmd-login__bg {
        inset: -48px;
        background:
          radial-gradient(ellipse at 52% 24%, rgba(232,210,171,.24) 0 5%, transparent 5.6%),
          radial-gradient(ellipse at 52% 38%, rgba(34,32,34,.88) 0 16%, transparent 16.8%),
          radial-gradient(ellipse at 51% 54%, rgba(12,12,13,.84) 0 26%, transparent 27%),
          linear-gradient(120deg, rgba(0,0,0,.86) 0%, rgba(12,12,13,.58) 48%, rgba(0,0,0,.94) 100%),
          linear-gradient(180deg, #171513 0%, #070707 100%);
        background-size: cover;
        background-position: center 58%;
        opacity: .88;
        filter: saturate(.84) contrast(1.08);
      }
      .mmd-login__overlay {
        z-index: 1;
        background:
          linear-gradient(90deg, rgba(0,0,0,.70) 0%, rgba(0,0,0,.50) 46%, rgba(0,0,0,.76) 100%),
          linear-gradient(180deg, rgba(0,0,0,.34) 0%, rgba(0,0,0,.70) 100%);
      }
      .mmd-login__shell {
        position: relative;
        z-index: 2;
        min-height: inherit;
        display: grid;
        grid-template-columns: minmax(0, 1.1fr) minmax(360px, .76fr);
        gap: 34px;
        align-items: center;
        padding: clamp(28px, 5vw, 56px);
      }
      .mmd-login__hero,
      .mmd-login__heroInner {
        min-width: 0;
      }
      .mmd-login__heroInner {
        display: flex;
        flex-direction: column;
        gap: 18px;
      }
      .mmd-login__pill {
        display: inline-flex;
        flex-direction: column;
        gap: 4px;
        width: fit-content;
        max-width: 100%;
        padding: 10px 14px;
        border: 1px solid var(--line-strong);
        border-radius: 999px;
        background: rgba(7,7,8,.58);
        color: var(--gold);
        font-size: .72rem;
        font-weight: 700;
        letter-spacing: .12em;
        line-height: 1.35;
        text-transform: uppercase;
      }
      .mmd-login__pill span:last-child {
        color: rgba(247,240,232,.78);
        font-size: .7rem;
        letter-spacing: .06em;
        text-transform: none;
      }
      .mmd-login__title {
        margin: 0;
        font-family: Baskerville, "Iowan Old Style", Palatino, Georgia, "Noto Serif Thai", serif;
        font-size: clamp(54px, 8vw, 104px);
        line-height: .9;
        font-weight: 600;
      }
      .mmd-login__titleTop {
        font-size: .72em;
      }
      .mmd-login__copy {
        margin: 0;
        color: rgba(247,240,232,.92);
        font-size: clamp(18px, 2.2vw, 28px);
        line-height: 1.28;
        font-weight: 650;
      }
      .mmd-login__copy span,
      .mmd-login__subcopy span,
      .mmd-login__foot span,
      .mmd-login__panelSub span,
      .mmd-label span,
      .mmd-hint span,
      .mmd-login__note span,
      .mmd-login__remember span span {
        display: block;
      }
      .mmd-login__copy span:last-child,
      .mmd-login__subcopy span:last-child,
      .mmd-login__foot span:last-child,
      .mmd-login__panelSub span:last-child,
      .mmd-label span,
      .mmd-hint span:last-child,
      .mmd-login__note span:last-child,
      .mmd-login__remember span span {
        color: var(--muted);
      }
      .mmd-login__subcopy,
      .mmd-login__foot {
        margin: 0;
        color: var(--muted);
        font-size: .94rem;
        line-height: 1.7;
      }
      .mmd-login__meta {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 10px;
        width: min(100%, 720px);
        margin-top: 8px;
      }
      .mmd-login__metaCard {
        min-height: 84px;
        padding: 14px;
        border: 1px solid rgba(247,240,232,.12);
        border-radius: 8px;
        background: rgba(0,0,0,.34);
      }
      .mmd-login__metaCard span {
        display: block;
        color: var(--muted);
        font-size: .72rem;
        line-height: 1.45;
      }
      .mmd-login__metaCard strong {
        display: block;
        margin-top: 8px;
        color: var(--text);
        font-size: .94rem;
        line-height: 1.25;
      }
      .mmd-login__panel {
        display: grid;
        gap: 16px;
        min-width: 0;
        margin: 0;
        padding: clamp(22px, 3vw, 30px);
        border: 1px solid rgba(247,240,232,.15);
        border-radius: 14px;
        background:
          linear-gradient(180deg, rgba(18,17,18,.92), rgba(8,8,9,.88)),
          var(--panel);
        box-shadow: 0 24px 70px rgba(0,0,0,.42);
        backdrop-filter: blur(20px);
      }
      .mmd-login__panelTop {
        display: flex;
        flex-direction: column;
        gap: 8px;
        padding-bottom: 4px;
      }
      .mmd-login__panelTitle {
        margin: 0;
        font-size: clamp(1.55rem, 2vw, 2.05rem);
        line-height: 1.08;
        font-weight: 750;
      }
      .mmd-login__panelTitle span {
        display: block;
        color: var(--gold);
        font-size: .76em;
        margin-top: 4px;
      }
      .mmd-login__panelSub {
        margin: 0;
        color: var(--muted);
        line-height: 1.55;
      }
      .mmd-field {
        display: grid;
        gap: 8px;
      }
      .mmd-label {
        display: block;
        color: var(--gold);
        font-size: .78rem;
        font-weight: 750;
        letter-spacing: .08em;
        line-height: 1.35;
        text-transform: uppercase;
      }
      .mmd-label span {
        margin-top: 2px;
        font-size: .74rem;
        letter-spacing: 0;
        text-transform: none;
      }
      .mmd-field input[type="text"],
      .mmd-field input[type="password"] {
        width: 100%;
        min-height: 48px;
        padding: 0 14px;
        border: 1px solid rgba(247,240,232,.16);
        border-radius: 8px;
        outline: none;
        background: rgba(0,0,0,.42);
        color: var(--text);
        font: inherit;
      }
      .mmd-field input:focus {
        border-color: rgba(197,151,44,.64);
        box-shadow: 0 0 0 3px rgba(197,151,44,.12);
      }
      .mmd-hint {
        margin: 0;
        color: rgba(216,205,194,.70);
        font-size: .82rem;
        line-height: 1.5;
      }
      .mmd-login__routePreview {
        display: flex;
        flex-direction: column;
        gap: 6px;
        padding: 12px 14px;
        border: 1px solid rgba(247,240,232,.12);
        border-radius: 8px;
        background: rgba(255,255,255,.035);
      }
      .mmd-login__routeLabel {
        color: var(--gold);
        font-size: .76rem;
        font-weight: 750;
        letter-spacing: .08em;
        line-height: 1.35;
        text-transform: uppercase;
      }
      .mmd-login__routeLabel span {
        display: block;
        color: var(--muted);
        font-size: .72rem;
        font-weight: 650;
        letter-spacing: 0;
        text-transform: none;
      }
      .mmd-login__routeValue {
        color: var(--text);
        font-family: SFMono-Regular, Consolas, Menlo, monospace;
        font-size: .82rem;
        line-height: 1.45;
        overflow-wrap: anywhere;
      }
      .mmd-login__note {
        margin: 0;
        color: var(--muted);
        font-size: .86rem;
        line-height: 1.55;
      }
      .mmd-login__remember {
        display: grid;
        grid-template-columns: 18px minmax(0, 1fr);
        gap: 10px;
        align-items: start;
        color: var(--text);
        font-size: .88rem;
        line-height: 1.45;
      }
      .mmd-login__remember input {
        width: 18px;
        height: 18px;
        margin: 1px 0 0;
        accent-color: var(--gold);
      }
      .mmd-login__error {
        min-height: 1.2em;
        margin: 0;
        color: var(--danger);
        font-size: .9rem;
        line-height: 1.45;
      }
      .mmd-login__button {
        justify-self: center;
        min-height: 48px;
        min-width: min(100%, 230px);
        padding: 0 20px;
        border: 1px solid rgba(197,151,44,.58);
        border-radius: 999px;
        background:
          linear-gradient(135deg, rgba(197,151,44,.30), rgba(247,240,232,.09)),
          rgba(0,0,0,.42);
        color: var(--text);
        font: 800 .82rem/1 "Avenir Next", "Segoe UI", sans-serif;
        letter-spacing: .08em;
        text-transform: uppercase;
        cursor: pointer;
      }
      .mmd-login__button:disabled {
        cursor: wait;
        opacity: .68;
      }

      /* MMD Admin Login — TH+EN left alignment refinement */
      .mmd-login,
      .mmd-login * {
        text-wrap: pretty;
      }

      .mmd-login__hero,
      .mmd-login__heroInner,
      .mmd-login__title,
      .mmd-login__copy,
      .mmd-login__subcopy,
      .mmd-login__foot,
      .mmd-login__panel,
      .mmd-login__panelTop,
      .mmd-field,
      .mmd-label,
      .mmd-hint,
      .mmd-login__note,
      .mmd-login__routePreview {
        text-align: left !important;
      }

      .mmd-login__heroInner {
        align-items: flex-start !important;
        justify-content: center;
        max-width: 820px;
        margin-left: 0 !important;
        margin-right: auto !important;
      }

      .mmd-login__title {
        max-width: 820px;
        margin-left: 0 !important;
        margin-right: auto !important;
      }

      .mmd-login__titleTop,
      .mmd-login__titleMain {
        display: block;
        text-align: left !important;
      }

      .mmd-login__titleTop {
        color: rgba(197, 151, 44, .86);
      }

      .mmd-login__copy,
      .mmd-login__subcopy {
        max-width: 720px;
        margin-left: 0 !important;
        margin-right: auto !important;
      }

      .mmd-login__meta {
        justify-items: stretch;
      }

      .mmd-login__metaCard {
        text-align: left !important;
      }

      .mmd-login__panelTop {
        align-items: flex-start;
      }

      .mmd-login__panelTitle,
      .mmd-login__panelSub {
        text-align: left !important;
      }

      .mmd-login__routePreview {
        align-items: flex-start;
      }

      .mmd-login__routeLabel,
      .mmd-login__routeValue {
        text-align: left !important;
      }

      /* Lower the hero background portrait */
      .mmd-login__bg {
        background-position: center 64% !important;
        transform: translateY(34px) scale(1.035);
        transform-origin: center center;
      }

      /* Keep overlay dark enough after lowering background */
      .mmd-login__overlay {
        background:
          linear-gradient(90deg, rgba(0,0,0,.72) 0%, rgba(0,0,0,.54) 46%, rgba(0,0,0,.78) 100%),
          linear-gradient(180deg, rgba(0,0,0,.36) 0%, rgba(0,0,0,.72) 100%) !important;
      }

      /* Mobile: reduce over-sized hero and keep left alignment */
      @media (max-width: 767px) {
        body {
          padding: 14px;
        }

        .mmd-login {
          min-height: calc(100vh - 28px);
          border-radius: 16px;
        }

        .mmd-login__shell {
          grid-template-columns: 1fr !important;
          gap: 24px;
          padding: 20px;
        }

        .mmd-login__heroInner {
          padding-top: 24px;
        }

        .mmd-login__title {
          font-size: clamp(42px, 13vw, 72px) !important;
          line-height: .94;
        }

        .mmd-login__copy {
          font-size: 14px;
          line-height: 1.65;
        }

        .mmd-login__meta {
          grid-template-columns: 1fr;
        }

        .mmd-login__panel {
          padding: 18px;
        }

        .mmd-login__bg {
          background-position: center 70% !important;
          transform: translateY(46px) scale(1.05);
        }
      }
    </style>
  </head>
  <body>
    <main class="mmd-login">
      <div class="mmd-login__bg" aria-hidden="true"></div>
      <div class="mmd-login__overlay" aria-hidden="true"></div>
      <div class="mmd-login__shell">
        <section class="mmd-login__hero" aria-label="MMD admin login">
          <div class="mmd-login__heroInner">
            <div class="mmd-login__pill">
              <span>ADMIN CONSOLE · OPERATOR SURFACE</span>
              <span>คอนโซลภายใน · สำหรับผู้ปฏิบัติงาน</span>
            </div>
            <h1 class="mmd-login__title">
              <span class="mmd-login__titleTop">Unlock Control Room</span>
              <span class="mmd-login__titleMain">เข้าสู่ห้องควบคุม</span>
            </h1>
            <p class="mmd-login__copy">
              <span>Authority Black · Secure Access</span>
              <span>สิทธิ์ภายใน · เข้าถึงแบบปลอดภัย</span>
            </p>
            <p class="mmd-login__subcopy">
              <span>Verify the admin environment, then authorize this browser session before entering the console.</span>
              <span>ตรวจสอบระบบปลายทางก่อน แล้วจึงยืนยันสิทธิ์ของ browser session นี้เพื่อเข้าสู่ Admin Console</span>
            </p>
            <p class="mmd-login__subcopy">
              <span>Session-first login · Low-noise operator UI · Backend-verified access</span>
              <span>เข้าสู่ระบบแบบ session-first · ลดข้อมูลรบกวน · ตรวจสิทธิ์ผ่าน backend</span>
            </p>
            <div class="mmd-login__meta" aria-label="Admin login metadata">
              <div class="mmd-login__metaCard">
                <span>Surface / พื้นที่ใช้งาน</span>
                <strong>Admin Console</strong>
              </div>
              <div class="mmd-login__metaCard">
                <span>Theme / ธีม</span>
                <strong>Authority Black</strong>
              </div>
              <div class="mmd-login__metaCard">
                <span>Primary Auth / วิธีตรวจสิทธิ์</span>
                <strong>Confirm Key / Bearer</strong>
              </div>
              <div class="mmd-login__metaCard">
                <span>Mode / โหมด</span>
                <strong>Secure Browser Session</strong>
              </div>
            </div>
            <p class="mmd-login__foot">
              <span>Access is checked against /v1/admin/ping before redirect.</span>
              <span>ระบบจะตรวจสิทธิ์ผ่าน /v1/admin/ping ก่อนพาไปหน้าถัดไป</span>
            </p>
          </div>
        </section>

        <form id="admin-login-form" class="mmd-login__panel">
          <div class="mmd-login__panelTop">
            <h2 class="mmd-login__panelTitle">
              Operator Access
              <span>ยืนยันสิทธิ์ผู้ปฏิบัติงาน</span>
            </h2>
            <p class="mmd-login__panelSub">
              <span>Authorize current browser session</span>
              <span>อนุญาต browser session ปัจจุบันก่อนเข้าสู่ระบบ</span>
            </p>
          </div>

          <label class="mmd-field" for="baseUrl">
            <span class="mmd-label">Base URL<span>โดเมนระบบ</span></span>
            <input id="baseUrl" name="baseUrl" type="text" value="${escapeHtml(defaultBaseUrl)}" autocomplete="url" />
            <span class="mmd-hint">
              <span>Browser will call this domain for /v1/admin/* requests.</span>
              <span>browser จะเรียกโดเมนนี้สำหรับ /v1/admin/*</span>
            </span>
          </label>

          <input id="accessCode" name="accessCode" type="hidden" value="" autocomplete="off" />

          <label class="mmd-field" for="confirmKey">
            <span class="mmd-label">Access Code<span>รหัสยืนยันภายใน</span></span>
            <input id="confirmKey" name="confirmKey" type="password" autocomplete="current-password" />
            <span class="mmd-hint">
              <span>Sent as X-Confirm-Key header.</span>
              <span>ส่งเป็น header X-Confirm-Key</span>
            </span>
          </label>

          <label class="mmd-field" for="bearer">
            <span class="mmd-label">Admin Bearer Token<span>โทเคนผู้ดูแลระบบ</span></span>
            <input id="bearer" name="bearer" type="password" autocomplete="off" />
            <span class="mmd-hint">
              <span>Sent as Authorization: Bearer ... header.</span>
              <span>ส่งเป็น header Authorization: Bearer ...</span>
            </span>
          </label>

          <div class="mmd-login__routePreview">
            <span class="mmd-login__routeLabel">Next Route<span>เส้นทางถัดไป</span></span>
            <span id="nextValue" class="mmd-login__routeValue">${escapeHtml(next)}</span>
          </div>

          <p class="mmd-login__note">
            <span>Session context is stored only after verification succeeds.</span>
            <span>ระบบจะบันทึก session context หลังตรวจสิทธิ์สำเร็จเท่านั้น</span>
          </p>

          <label class="mmd-login__remember" for="rememberBaseUrl">
            <input id="rememberBaseUrl" name="rememberBaseUrl" type="checkbox" checked />
            <span>
              Remember base URL on this device
              <span>จำ Base URL บนอุปกรณ์นี้</span>
            </span>
          </label>

          <p id="error" class="mmd-login__error" role="alert"></p>
          <button id="submit" class="mmd-login__button" type="submit">Unlock Admin · เข้าสู่ Admin Console</button>
        </form>
      </div>
    </main>

    <script>
      (() => {
        const KEY = ${JSON.stringify(ADMIN_GATE_SESSION_KEY)};
        const next = ${JSON.stringify(next)};
        const form = document.getElementById("admin-login-form");
        const error = document.getElementById("error");
        const submit = document.getElementById("submit");

        function setError(message) {
          error.textContent = message || "";
        }

        function storeSession(session) {
          sessionStorage.setItem(KEY, JSON.stringify(session));
        }

        form.addEventListener("submit", async (event) => {
          event.preventDefault();
          setError("");
          submit.disabled = true;
          submit.textContent = "Verifying... · กำลังตรวจสิทธิ์...";

          const payload = {
            baseUrl: document.getElementById("baseUrl").value,
            accessCode: document.getElementById("accessCode").value,
            bearer: document.getElementById("bearer").value,
            confirmKey: document.getElementById("confirmKey").value,
            next,
          };

          try {
            const response = await fetch(${JSON.stringify(loginSessionPath)}, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            });
            const data = await response.json().catch(() => null);
            if (!response.ok || !data || !data.ok) {
              setError(data && data.error && data.error.message ? data.error.message : "Unable to unlock admin.");
              return;
            }

            if (data.data && data.data.session) {
              storeSession(data.data.session);
            }
            location.replace(data.data && data.data.redirect_to ? data.data.redirect_to : next);
          } catch (err) {
            setError("Unable to verify admin access right now.");
          } finally {
            submit.disabled = false;
            submit.textContent = "Unlock Admin · เข้าสู่ Admin Console";
          }
        });
      })();
    </script>
  </body>
</html>`;

  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function renderCreateSessionPage(request: Request, session: AdminGateSession): Response {
  const next = normalizeAdminNextPath(new URL(request.url).pathname + new URL(request.url).search);
  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>MMD Admin Create Session</title>
    <style>
      :root {
        color-scheme: dark;
        --bg: #08070a;
        --panel: rgba(19,15,24,.82);
        --line: rgba(247,240,232,.14);
        --text: #f7f0e8;
        --muted: #c4b3a7;
        --gold: #d1a66a;
        --rose: #a45b5b;
        --success: #9ad7b2;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        padding: 24px;
        color: var(--text);
        background:
          radial-gradient(circle at top, rgba(164,91,91,.18), transparent 28%),
          radial-gradient(circle at bottom right, rgba(95,127,132,.12), transparent 30%),
          linear-gradient(180deg, #110d14 0%, #09080d 52%, #060507 100%);
        font-family: Baskerville, "Iowan Old Style", Palatino, Georgia, serif;
      }
      .shell {
        width: min(100%, 980px);
        margin: 0 auto;
        padding: 32px;
        border: 1px solid var(--line);
        border-radius: 28px;
        background: var(--panel);
        box-shadow: 0 24px 80px rgba(0,0,0,.35);
        backdrop-filter: blur(18px);
      }
      .topbar {
        display: flex;
        justify-content: space-between;
        gap: 16px;
        align-items: center;
        margin-bottom: 24px;
      }
      .kicker {
        margin: 0 0 10px;
        color: var(--gold);
        font: 600 .8rem/1.2 "Avenir Next Condensed", "Gill Sans", sans-serif;
        letter-spacing: .24em;
        text-transform: uppercase;
      }
      h1 {
        margin: 0;
        font-size: clamp(2.1rem, 7vw, 4rem);
        line-height: .95;
        letter-spacing: -.04em;
      }
      .lead {
        margin: 16px 0 0;
        color: var(--muted);
        line-height: 1.7;
        max-width: 60ch;
      }
      form {
        display: grid;
        gap: 18px;
        margin-top: 28px;
      }
      .grid {
        display: grid;
        gap: 16px;
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
      .grid-full {
        grid-column: 1 / -1;
      }
      label {
        display: grid;
        gap: 8px;
        color: var(--gold);
        font: 600 .78rem/1.2 "Avenir Next Condensed", "Gill Sans", sans-serif;
        letter-spacing: .16em;
        text-transform: uppercase;
      }
      input, textarea {
        width: 100%;
        min-height: 52px;
        padding: 14px 16px;
        border: 1px solid var(--line);
        border-radius: 16px;
        background: rgba(7,6,10,.72);
        color: var(--text);
        font: inherit;
      }
      textarea {
        min-height: 124px;
        resize: vertical;
      }
      .actions {
        display: flex;
        gap: 12px;
        align-items: center;
        flex-wrap: wrap;
      }
      button {
        min-height: 48px;
        padding: 0 18px;
        border-radius: 999px;
        border: 1px solid rgba(209,166,106,.36);
        background: linear-gradient(135deg, rgba(209,166,106,.24), rgba(164,91,91,.28));
        color: var(--text);
        font: 600 .92rem/1 "Avenir Next Condensed", "Gill Sans", sans-serif;
        letter-spacing: .12em;
        text-transform: uppercase;
        cursor: pointer;
      }
      .ghost {
        background: transparent;
      }
      .status {
        min-height: 1.2em;
        margin: 0;
        color: var(--muted);
      }
      .status.error { color: #f2b0b0; }
      .status.success { color: var(--success); }
      pre {
        overflow: auto;
        padding: 18px;
        border-radius: 20px;
        border: 1px solid var(--line);
        background: rgba(7,6,10,.72);
        color: var(--text);
        font: .9rem/1.6 SFMono-Regular, Consolas, Menlo, monospace;
      }
      .hint {
        margin: 0;
        color: var(--muted);
        font-size: .92rem;
      }
      @media (max-width: 720px) {
        .grid { grid-template-columns: 1fr; }
        .topbar { align-items: flex-start; flex-direction: column; }
      }
    </style>
    ${adminGateBootstrapScript(session, next, selectAdminLoginPath(new URL(request.url).pathname))}
  </head>
  <body>
    <main class="shell">
      <div class="topbar">
        <div>
          <p class="kicker">Internal Admin / Jobs</p>
          <h1>Create Session</h1>
          <p class="lead">Create a payment confirmation link for a session. This page sends the form to <code>/v1/admin/create-session</code> through the existing admin gate session, so no raw bearer token is exposed in the page itself.</p>
        </div>
        <button id="logout" class="ghost" type="button">Logout</button>
      </div>

      <form id="create-session-form">
        <div class="grid">
          <label>
            Memberstack ID
            <input id="memberstack_id" name="memberstack_id" type="text" required />
          </label>
          <label>
            Model ID
            <input id="model_id" name="model_id" type="text" required />
          </label>
          <label>
            Amount THB
            <input id="amount_thb" name="amount_thb" type="number" min="1" step="1" required />
          </label>
          <label>
            Pay Model THB
            <input id="pay_model_thb" name="pay_model_thb" type="number" min="0" step="1" />
          </label>
          <label>
            Currency
            <input id="currency" name="currency" type="text" value="THB" />
          </label>
          <label>
            Payment Ref
            <input id="payment_ref" name="payment_ref" type="text" />
          </label>
          <label>
            Session ID
            <input id="session_id" name="session_id" type="text" />
          </label>
          <label>
            Return URL
            <input id="return_url" name="return_url" type="url" />
          </label>
          <label class="grid-full">
            Cancel URL
            <input id="cancel_url" name="cancel_url" type="url" />
          </label>
          <label class="grid-full">
            Metadata JSON
            <textarea id="metadata" name="metadata" placeholder='{"source":"manual_immigrate","line_user_id":"..."}'></textarea>
          </label>
        </div>

        <p class="hint">Required fields are <code>memberstack_id</code>, <code>model_id</code>, and <code>amount_thb</code>. Metadata is optional but must be valid JSON if provided.</p>

        <div class="actions">
          <button id="submit" type="submit">Create Session</button>
          <p id="status" class="status" role="status"></p>
        </div>
      </form>

      <pre id="result">Waiting for submission…</pre>
    </main>

    <script>
      (() => {
        const form = document.getElementById("create-session-form");
        const submit = document.getElementById("submit");
        const status = document.getElementById("status");
        const result = document.getElementById("result");
        const logout = document.getElementById("logout");

        function setStatus(message, kind) {
          status.textContent = message || "";
          status.className = "status" + (kind ? " " + kind : "");
        }

        function setResult(payload) {
          result.textContent = typeof payload === "string" ? payload : JSON.stringify(payload, null, 2);
        }

        function readOptionalNumber(id) {
          const raw = document.getElementById(id).value.trim();
          if (!raw) return null;
          const num = Number(raw);
          return Number.isFinite(num) ? num : NaN;
        }

        logout.addEventListener("click", () => {
          if (window.__MMD_ADMIN_GATE__) {
            window.__MMD_ADMIN_GATE__.logout();
          }
        });

        form.addEventListener("submit", async (event) => {
          event.preventDefault();
          setStatus("");

          let metadata = {};
          const metadataRaw = document.getElementById("metadata").value.trim();
          if (metadataRaw) {
            try {
              metadata = JSON.parse(metadataRaw);
            } catch {
              setStatus("Metadata JSON is invalid.", "error");
              return;
            }
          }

          const payModelThb = readOptionalNumber("pay_model_thb");
          if (Number.isNaN(payModelThb)) {
            setStatus("Pay Model THB must be a valid number.", "error");
            return;
          }

          const payload = {
            memberstack_id: document.getElementById("memberstack_id").value.trim(),
            model_id: document.getElementById("model_id").value.trim(),
            amount_thb: Number(document.getElementById("amount_thb").value),
            currency: document.getElementById("currency").value.trim() || "THB",
            payment_ref: document.getElementById("payment_ref").value.trim(),
            session_id: document.getElementById("session_id").value.trim(),
            return_url: document.getElementById("return_url").value.trim(),
            cancel_url: document.getElementById("cancel_url").value.trim(),
            metadata,
          };

          if (payModelThb != null) payload.pay_model_thb = payModelThb;

          submit.disabled = true;
          submit.textContent = "Creating...";
          setStatus("Submitting create-session request…");
          setResult("Working…");

          try {
            const response = await fetch(${JSON.stringify(ADMIN_JOBS.createSession)}, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            });
            const data = await response.json().catch(() => null);
            if (!response.ok || !data) {
              setStatus((data && (data.error?.message || data.error)) || "Create session failed.", "error");
              setResult(data || { ok: false, status: response.status });
              return;
            }

            setStatus("Session created successfully.", "success");
            setResult(data);
          } catch (error) {
            setStatus("Unable to reach the create-session endpoint right now.", "error");
            setResult({ ok: false, error: String(error && error.message ? error.message : error) });
          } finally {
            submit.disabled = false;
            submit.textContent = "Create Session";
          }
        });
      })();
    </script>
  </body>
</html>`;

  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function renderCreateJobPage(request: Request, session: AdminGateSession): Response {
  const next = normalizeAdminNextPath(new URL(request.url).pathname + new URL(request.url).search);
  const lineTemplate = `ส่งบรีฟตามนี้ได้เลยค่ะ

1. ชื่อเล่น:
2. วันที่ต้องการใช้บริการ:
3. เวลาที่ต้องการ:
4. สถานที่ / เขต:
5. รูปแบบงาน:
6. งบประมาณ:
7. โมเดลที่สนใจ / สไตล์ที่ต้องการ:
8. เบอร์ติดต่อ:
9. อีเมล:
10. รายละเอียดเพิ่มเติม:`;
  const adminTemplate = `สรุปบรีฟสำหรับสร้าง job
- ชื่อลูกค้า:
- LINE user id:
- เบอร์:
- อีเมล:
- รูปแบบงาน:
- วันที่/เวลา:
- โลเคชัน:
- โมเดล:
- งบ/มัดจำ:
- หมายเหตุสำคัญ:`;
  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>MMD Admin Create Job</title>
    <style>
      :root {
        color-scheme: dark;
        --bg: #08070a;
        --panel: rgba(19,15,24,.82);
        --line: rgba(247,240,232,.14);
        --text: #f7f0e8;
        --muted: #c4b3a7;
        --gold: #d1a66a;
        --rose: #a45b5b;
        --success: #9ad7b2;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        padding: 24px;
        color: var(--text);
        background:
          radial-gradient(circle at top, rgba(164,91,91,.18), transparent 28%),
          radial-gradient(circle at bottom right, rgba(95,127,132,.12), transparent 30%),
          linear-gradient(180deg, #110d14 0%, #09080d 52%, #060507 100%);
        font-family: Baskerville, "Iowan Old Style", Palatino, Georgia, serif;
      }
      .shell {
        width: min(100%, 1180px);
        margin: 0 auto;
        padding: 32px;
        border: 1px solid var(--line);
        border-radius: 28px;
        background: var(--panel);
        box-shadow: 0 24px 80px rgba(0,0,0,.35);
        backdrop-filter: blur(18px);
      }
      .topbar {
        display: flex;
        justify-content: space-between;
        gap: 16px;
        align-items: center;
        margin-bottom: 24px;
      }
      .kicker {
        margin: 0 0 10px;
        color: var(--gold);
        font: 600 .8rem/1.2 "Avenir Next Condensed", "Gill Sans", sans-serif;
        letter-spacing: .24em;
        text-transform: uppercase;
      }
      h1 {
        margin: 0;
        font-size: clamp(2.1rem, 7vw, 4rem);
        line-height: .95;
        letter-spacing: -.04em;
      }
      .lead {
        margin: 16px 0 0;
        color: var(--muted);
        line-height: 1.7;
        max-width: 70ch;
      }
      .layout {
        display: grid;
        gap: 24px;
        grid-template-columns: minmax(0, 1.2fr) minmax(280px, .8fr);
      }
      form {
        display: grid;
        gap: 18px;
        margin-top: 28px;
      }
      .section-title {
        margin: 8px 0 0;
        color: var(--gold);
        font: 600 .82rem/1.2 "Avenir Next Condensed", "Gill Sans", sans-serif;
        letter-spacing: .22em;
        text-transform: uppercase;
      }
      .grid {
        display: grid;
        gap: 16px;
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
      .grid-full {
        grid-column: 1 / -1;
      }
      label {
        display: grid;
        gap: 8px;
        color: var(--gold);
        font: 600 .78rem/1.2 "Avenir Next Condensed", "Gill Sans", sans-serif;
        letter-spacing: .16em;
        text-transform: uppercase;
      }
      input, textarea, select {
        width: 100%;
        min-height: 52px;
        padding: 14px 16px;
        border: 1px solid var(--line);
        border-radius: 16px;
        background: rgba(7,6,10,.72);
        color: var(--text);
        font: inherit;
      }
      textarea { min-height: 124px; resize: vertical; }
      select {
        appearance: none;
      }
      .panel {
        padding: 20px;
        border: 1px solid var(--line);
        border-radius: 24px;
        background: rgba(7,6,10,.46);
      }
      .panel h2 {
        margin: 0 0 10px;
        font-size: 1.1rem;
        letter-spacing: .02em;
      }
      .panel p, .hint {
        margin: 0;
        color: var(--muted);
        line-height: 1.6;
      }
      .actions {
        display: flex;
        gap: 12px;
        align-items: center;
        flex-wrap: wrap;
      }
      button {
        min-height: 48px;
        padding: 0 18px;
        border-radius: 999px;
        border: 1px solid rgba(209,166,106,.36);
        background: linear-gradient(135deg, rgba(209,166,106,.24), rgba(164,91,91,.28));
        color: var(--text);
        font: 600 .92rem/1 "Avenir Next Condensed", "Gill Sans", sans-serif;
        letter-spacing: .12em;
        text-transform: uppercase;
        cursor: pointer;
      }
      .ghost { background: transparent; }
      .status { min-height: 1.2em; margin: 0; color: var(--muted); }
      .status.error { color: #f2b0b0; }
      .status.success { color: var(--success); }
      pre {
        overflow: auto;
        padding: 18px;
        border-radius: 20px;
        border: 1px solid var(--line);
        background: rgba(7,6,10,.72);
        color: var(--text);
        font: .88rem/1.6 SFMono-Regular, Consolas, Menlo, monospace;
        white-space: pre-wrap;
      }
      .copy {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 12px;
        margin-bottom: 12px;
      }
      .summary-grid {
        display: grid;
        gap: 14px;
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
      .metric {
        padding: 16px;
        border-radius: 18px;
        border: 1px solid var(--line);
        background: rgba(247,240,232,.03);
      }
      .metric .eyebrow {
        margin: 0 0 8px;
        color: var(--muted);
        font: 600 .72rem/1.2 "Avenir Next Condensed", "Gill Sans", sans-serif;
        letter-spacing: .18em;
        text-transform: uppercase;
      }
      .metric strong {
        display: block;
        font-size: 1rem;
        line-height: 1.45;
      }
      .result-list {
        display: grid;
        gap: 10px;
        margin-top: 14px;
      }
      .result-row {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 12px;
        padding: 14px 16px;
        border-radius: 16px;
        border: 1px solid var(--line);
        background: rgba(247,240,232,.03);
      }
      .result-row strong,
      .result-row span {
        display: block;
      }
      .result-row span {
        margin-top: 6px;
        color: var(--muted);
        line-height: 1.55;
        word-break: break-word;
      }
      .result-row a {
        color: var(--text);
        text-decoration: none;
      }
      .result-row a:hover {
        text-decoration: underline;
      }
      .mini {
        min-height: 38px;
        padding: 0 14px;
        font-size: .74rem;
      }
      .pill {
        display: inline-flex;
        align-items: center;
        min-height: 32px;
        padding: 0 12px;
        border-radius: 999px;
        border: 1px solid rgba(209,166,106,.28);
        background: rgba(209,166,106,.12);
        color: var(--text);
        font: 600 .72rem/1 "Avenir Next Condensed", "Gill Sans", sans-serif;
        letter-spacing: .14em;
        text-transform: uppercase;
      }
      .note {
        margin-top: 10px;
        color: var(--muted);
        line-height: 1.6;
      }
      .history-list {
        display: grid;
        gap: 10px;
      }
      .history-item {
        padding: 14px 16px;
        border-radius: 16px;
        border: 1px solid var(--line);
        background: rgba(247,240,232,.03);
      }
      .history-item p {
        margin: 0;
      }
      .history-head {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        align-items: center;
      }
      .history-actions {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
        margin-top: 10px;
      }
      .toolbar {
        display: grid;
        gap: 10px;
        grid-template-columns: 1.4fr .8fr .8fr;
        margin-top: 14px;
      }
      .toolbar input,
      .toolbar select {
        width: 100%;
        min-height: 42px;
        padding: 10px 12px;
        border-radius: 12px;
        border: 1px solid var(--line);
        background: rgba(7,6,10,.72);
        color: var(--text);
        font: inherit;
      }
      .toolbar-actions {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
        margin-top: 10px;
      }
      .check {
        display: flex;
        gap: 10px;
        align-items: center;
        color: var(--muted);
        font-size: .92rem;
      }
      .check input {
        min-height: 18px;
        width: 18px;
        padding: 0;
      }
      @media (max-width: 920px) {
        .layout { grid-template-columns: 1fr; }
      }
      @media (max-width: 720px) {
        .grid { grid-template-columns: 1fr; }
        .summary-grid { grid-template-columns: 1fr; }
        .result-row { flex-direction: column; }
        .toolbar { grid-template-columns: 1fr; }
        .topbar { align-items: flex-start; flex-direction: column; }
      }
    </style>
    ${adminGateBootstrapScript(session, next, selectAdminLoginPath(new URL(request.url).pathname))}
  </head>
  <body>
    <main class="shell">
      <div class="topbar">
        <div>
          <p class="kicker">Internal Admin / Jobs</p>
          <h1>Create Job</h1>
          <p class="lead">Use this page when we receive a brief from LINE or collect the brief manually. When booking fields are filled, one submit creates Airtable intake, member promotion, customer/model onboarding links, customer/model confirm links, and ready-to-use dashboard links in one response.</p>
        </div>
        <button id="logout" class="ghost" type="button">Logout</button>
      </div>

      <div class="layout">
        <section>
          <form id="create-job-form">
            <p class="section-title">Client Identity</p>
            <div class="grid">
              <label>
                Display Name
                <input id="display_name" name="display_name" type="text" required />
              </label>
              <label>
                Nickname
                <input id="nickname" name="nickname" type="text" />
              </label>
              <label>
                LINE User ID
                <input id="line_user_id" name="line_user_id" type="text" />
              </label>
              <label>
                LINE ID
                <input id="line_id" name="line_id" type="text" />
              </label>
              <label>
                Email
                <input id="email" name="email" type="email" />
              </label>
              <label>
                Phone
                <input id="phone" name="phone" type="text" />
              </label>
            </div>

            <p class="section-title">Booking Details</p>
            <div class="grid">
              <label>
                Session ID
                <input id="session_id" name="session_id" type="text" placeholder="optional - auto generated if blank" />
              </label>
              <label>
                Payment Ref
                <input id="payment_ref" name="payment_ref" type="text" placeholder="optional - auto generated if blank" />
              </label>
              <label>
                Job Type
                <input id="job_type" name="job_type" type="text" placeholder="private_vip / dinner / event" />
              </label>
              <label>
                Job Date
                <input id="job_date" name="job_date" type="date" />
              </label>
              <label>
                Start Time
                <input id="start_time" name="start_time" type="time" />
              </label>
              <label>
                End Time
                <input id="end_time" name="end_time" type="time" />
              </label>
              <label>
                Location Name
                <input id="location_name" name="location_name" type="text" placeholder="Hotel / เขต / venue" />
              </label>
              <label>
                Google Map URL
                <input id="google_map_url" name="google_map_url" type="url" placeholder="https://maps.google.com/..." />
              </label>
              <label>
                Amount THB
                <input id="amount_thb" name="amount_thb" type="number" min="0" step="1" placeholder="6500" />
              </label>
              <label>
                Pay Model THB
                <input id="pay_model_thb" name="pay_model_thb" type="number" min="0" step="1" placeholder="2500" />
              </label>
              <label>
                Payment Type
                <select id="payment_type" name="payment_type">
                  <option value="deposit">Deposit</option>
                  <option value="full">Full</option>
                </select>
              </label>
              <label>
                Payment Method
                <input id="payment_method" name="payment_method" type="text" value="promptpay" />
              </label>
              <label class="grid-full">
                Booking Note
                <textarea id="booking_note" name="booking_note" placeholder="รายละเอียดที่ลูกค้าและโมเดลต้องเห็นตอนกด confirm"></textarea>
              </label>
            </div>

            <p class="section-title">Model / Membership</p>
            <div class="grid">
              <label>
                Model Name
                <input id="model_name" name="model_name" type="text" required />
              </label>
              <label>
                Model Record ID
                <input id="model_record_id" name="model_record_id" type="text" />
              </label>
              <label>
                Current Tier
                <input id="current_tier" name="current_tier" type="text" placeholder="standard" />
              </label>
              <label>
                Target Tier
                <input id="target_tier" name="target_tier" type="text" placeholder="premium" />
              </label>
              <label>
                Expires In Hours
                <input id="expires_in_hours" name="expires_in_hours" type="number" min="1" step="1" value="168" />
              </label>
              <label>
                Telegram Thread ID
                <input id="telegram_message_thread_id" name="telegram_message_thread_id" type="number" min="0" step="1" value="61" />
              </label>
              <label class="grid-full">
                Model History Note
                <textarea id="model_history_note" name="model_history_note" placeholder="วางโน้ตสรุปจาก LINE group ของโมเดล หรือสรุปประวัติงานย้อนหลังที่มีอยู่"></textarea>
              </label>
              <label>
                Model History Source
                <input id="model_history_source" name="model_history_source" type="text" value="line_group_note" />
              </label>
              <label>
                Model History Status
                <select id="model_history_status" name="model_history_status">
                  <option value="pending_import">Pending Import</option>
                  <option value="attached">Attached</option>
                  <option value="imported">Imported</option>
                </select>
              </label>
              <label class="grid-full">
                Manual Note Raw
                <textarea id="manual_note_raw" name="manual_note_raw" required placeholder="สรุปบรีฟลูกค้า / รายละเอียดที่ตกลงกัน"></textarea>
              </label>
              <label class="grid-full">
                Model History Payload JSON
                <textarea id="model_history_payload_json" name="model_history_payload_json" placeholder='{"line_group_id":"...","last_summary_at":"2026-04-23","worked_with_clients":["..."]}'></textarea>
              </label>
              <label class="grid-full">
                Operator Summary
                <textarea id="operator_summary" name="operator_summary" placeholder="summary สั้นสำหรับทีม"></textarea>
              </label>
              <label class="grid-full">
                Payload JSON
                <textarea id="payload_json" name="payload_json" placeholder='{"source":"line_brief","job_type":"private_vip","brief":"..."}'></textarea>
              </label>
            </div>

            <label class="check">
              <input id="notify_telegram" name="notify_telegram" type="checkbox" checked />
              <span>Send Telegram notification after create-job</span>
            </label>

            <div class="actions">
              <button id="submit" type="submit">Create Job</button>
              <button id="import-all-airtable" type="button" class="ghost">Import All</button>
              <button id="retry-last-import" type="button" class="ghost">Retry Last Import</button>
              <button id="import-booking-airtable" type="button" class="ghost">Import Booking To Airtable</button>
              <button id="export-model-history-json" type="button" class="ghost">Export JSON</button>
              <button id="generate-model-history-batch" type="button" class="ghost">Generate Batch</button>
              <button id="import-model-history-airtable" type="button" class="ghost">Import To Airtable</button>
              <p id="status" class="status" role="status"></p>
            </div>
            <label class="check">
              <input id="apply-booking-import" name="apply_booking_import" type="checkbox" />
              <span>Apply booking import now to Airtable (unticked = dry run only)</span>
            </label>
            <label class="check">
              <input id="apply-model-history-import" name="apply_model_history_import" type="checkbox" />
              <span>Apply now to Airtable (unticked = dry run only)</span>
            </label>
          </form>

          <section id="result-summary" class="panel" style="margin-top:18px;">
            <div class="copy">
              <h2>Launch Bundle</h2>
              <span class="pill" id="result-pill">waiting</span>
            </div>
            <div id="summary-metrics" class="summary-grid"></div>
            <div id="summary-links" class="result-list"></div>
            <div id="summary-meta" class="result-list"></div>
            <p class="note">Model work history from legacy LINE group notes is not auto-hydrated yet. This flow is ready for Airtable/member signup now, and we can plug the history import in next as a dedicated migration step.</p>
          </section>

          <pre id="result">Waiting for submission…</pre>
        </section>

        <aside class="panel-stack" style="display:grid;gap:18px;">
          <section class="panel">
            <div class="copy">
              <h2>LINE Brief Template</h2>
              <button type="button" data-copy="line-template">Copy</button>
            </div>
            <p class="hint">Send this to the customer when you want them to fill in the brief themselves.</p>
            <pre id="line-template">${escapeHtml(lineTemplate)}</pre>
          </section>

          <section class="panel">
            <div class="copy">
              <h2>Admin Summary Template</h2>
              <button type="button" data-copy="admin-template">Copy</button>
            </div>
            <p class="hint">Use this when the team already talked to the customer and only needs to summarize the brief before creating the job.</p>
            <pre id="admin-template">${escapeHtml(adminTemplate)}</pre>
          </section>

          <section class="panel">
            <h2>What Happens</h2>
            <p>1. Upsert Airtable client and inbox record</p>
            <p>2. Promote or create member</p>
            <p>3. Generate customer/model onboarding + dashboard links</p>
            <p>4. Generate customer/model confirmation links when booking fields are filled</p>
            <p>5. Attach model-history note/payload for later migration</p>
            <p>6. Send Telegram notification and return <code>create_job_v1</code> response</p>
          </section>

          <section class="panel">
            <div class="copy">
              <h2>History Console</h2>
              <div style="display:flex;gap:8px;flex-wrap:wrap;">
                <button id="refresh-shared-import-history" type="button">Refresh Shared Logs</button>
                <button id="export-import-history" type="button">Export</button>
                <button id="import-import-history" type="button">Import</button>
                <button id="clear-import-history" type="button">Clear</button>
              </div>
            </div>
            <p class="hint">You can review this browser's recent imports or pull shared import logs back from Airtable for the whole team.</p>
            <div class="toolbar">
              <select id="history-source">
                <option value="local">Local Only</option>
                <option value="airtable">Shared Airtable</option>
                <option value="merged">Merged</option>
              </select>
              <input id="history-search" type="search" placeholder="Search label, route, mode, or payload..." />
              <select id="history-filter-type">
                <option value="">All Types</option>
                <option value="Import All">Import All</option>
                <option value="Booking Import">Booking Import</option>
                <option value="Model History Import">Model History Import</option>
              </select>
              <select id="history-filter-mode">
                <option value="">All Modes</option>
                <option value="dry_run">Dry Run</option>
                <option value="apply">Apply</option>
                <option value="mixed">Mixed</option>
              </select>
              <select id="history-filter-outcome">
                <option value="">All Outcomes</option>
                <option value="failed">Failed Only</option>
                <option value="skipped">Skipped Only</option>
                <option value="created">Created Only</option>
                <option value="ready">Ready Only</option>
              </select>
            </div>
            <div class="toolbar-actions">
              <button id="reset-history-filters" type="button" class="ghost mini">Reset Filters</button>
              <button id="retry-visible-history" type="button" class="ghost mini">Retry Visible</button>
              <span id="history-count" class="hint"></span>
            </div>
            <div id="import-history-list" class="history-list" style="margin-top:14px;"></div>
            <input id="import-history-file" type="file" accept="application/json" style="display:none;" />
          </section>
        </aside>
      </div>
    </main>

    <script>
      (() => {
        const form = document.getElementById("create-job-form");
        const submit = document.getElementById("submit");
        const status = document.getElementById("status");
        const result = document.getElementById("result");
        const resultPill = document.getElementById("result-pill");
        const summaryMetrics = document.getElementById("summary-metrics");
        const summaryLinks = document.getElementById("summary-links");
        const summaryMeta = document.getElementById("summary-meta");
        const resultSummary = document.getElementById("result-summary");
        const logout = document.getElementById("logout");
        const importAllAirtable = document.getElementById("import-all-airtable");
        const retryLastImport = document.getElementById("retry-last-import");
        const importBookingAirtable = document.getElementById("import-booking-airtable");
        const applyBookingImport = document.getElementById("apply-booking-import");
        const exportModelHistoryJson = document.getElementById("export-model-history-json");
        const generateModelHistoryBatch = document.getElementById("generate-model-history-batch");
        const importModelHistoryAirtable = document.getElementById("import-model-history-airtable");
        const applyModelHistoryImport = document.getElementById("apply-model-history-import");
        const importHistoryList = document.getElementById("import-history-list");
        const refreshSharedImportHistory = document.getElementById("refresh-shared-import-history");
        const clearImportHistory = document.getElementById("clear-import-history");
        const exportImportHistory = document.getElementById("export-import-history");
        const importImportHistory = document.getElementById("import-import-history");
        const importHistoryFile = document.getElementById("import-history-file");
        const historySource = document.getElementById("history-source");
        const historySearch = document.getElementById("history-search");
        const historyFilterType = document.getElementById("history-filter-type");
        const historyFilterMode = document.getElementById("history-filter-mode");
        const historyFilterOutcome = document.getElementById("history-filter-outcome");
        const resetHistoryFilters = document.getElementById("reset-history-filters");
        const retryVisibleHistory = document.getElementById("retry-visible-history");
        const historyCount = document.getElementById("history-count");
        const IMPORT_HISTORY_KEY = "mmd_import_history_v1";
        let lastArtifacts = null;
        let sharedImportHistory = [];

        function setStatus(message, kind) {
          status.textContent = message || "";
          status.className = "status" + (kind ? " " + kind : "");
        }

        function escapeHtml(value) {
          return String(value || "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
        }

        function linkRow(label, value) {
          if (!value) return "";
          const safe = escapeHtml(value);
          return '<div class="result-row"><div><strong>' + escapeHtml(label) + '</strong><span><a href="' + safe + '" target="_blank" rel="noreferrer">' + safe + '</a></span></div><button type="button" class="ghost mini" data-copy-link="' + safe + '">Copy</button></div>';
        }

        function metaRow(label, value) {
          if (!value && value !== 0) return "";
          return '<div class="result-row"><div><strong>' + escapeHtml(label) + '</strong><span>' + escapeHtml(String(value)) + '</span></div></div>';
        }

        function metricCard(label, value) {
          return '<div class="metric"><p class="eyebrow">' + escapeHtml(label) + '</p><strong>' + escapeHtml(value || "-") + '</strong></div>';
        }

        function summarizeImportRows(rows) {
          const list = Array.isArray(rows) ? rows : [];
          return list.reduce((acc, row) => {
            const action = row && row.action ? String(row.action) : "unknown";
            acc[action] = (acc[action] || 0) + 1;
            return acc;
          }, {});
        }

        function importActionLabel(summary) {
          const parts = [];
          if (summary.created) parts.push(summary.created + " created");
          if (summary.would_create) parts.push(summary.would_create + " ready");
          if (summary.skipped_existing) parts.push(summary.skipped_existing + " existing");
          if (summary.skipped_missing_lookup) parts.push(summary.skipped_missing_lookup + " missing lookup");
          return parts.join(" / ") || "no rows";
        }

        function setResult(payload) {
          const artifacts = payload && typeof payload === "object" ? payload.data?.artifacts || null : null;
          const data = payload && typeof payload === "object" ? payload.data || null : null;
          const links = data?.links || null;
          const confirmLinks = data?.confirm_links || null;
          const membership = links?.context?.membership || null;
          const importSummary = payload && typeof payload === "object" ? payload.summary || null : null;
          const importCounts = payload && typeof payload === "object" ? payload.counts || null : null;
          const importType = payload && typeof payload === "object" ? payload.import_type || "" : "";
          const importAllBooking = payload && typeof payload === "object" ? payload.booking || null : null;
          const importAllModelHistory = payload && typeof payload === "object" ? payload.model_history || null : null;
          const effectiveImportSummary = importSummary || (importType === "all"
            ? {
                clients: [
                  ...((importAllBooking && importAllBooking.summary && Array.isArray(importAllBooking.summary.clients)) ? importAllBooking.summary.clients : []),
                  ...((importAllModelHistory && importAllModelHistory.summary && Array.isArray(importAllModelHistory.summary.clients)) ? importAllModelHistory.summary.clients : []),
                ],
                sessions: [
                  ...((importAllBooking && importAllBooking.summary && Array.isArray(importAllBooking.summary.sessions)) ? importAllBooking.summary.sessions : []),
                  ...((importAllModelHistory && importAllModelHistory.summary && Array.isArray(importAllModelHistory.summary.sessions)) ? importAllModelHistory.summary.sessions : []),
                ],
                payments: [
                  ...((importAllBooking && importAllBooking.summary && Array.isArray(importAllBooking.summary.payments)) ? importAllBooking.summary.payments : []),
                  ...((importAllModelHistory && importAllModelHistory.summary && Array.isArray(importAllModelHistory.summary.payments)) ? importAllModelHistory.summary.payments : []),
                ],
              }
            : null);
          const clientImportSummary = summarizeImportRows(effectiveImportSummary?.clients);
          const sessionImportSummary = summarizeImportRows(effectiveImportSummary?.sessions);
          const paymentImportSummary = summarizeImportRows(effectiveImportSummary?.payments);
          const importMode = payload && typeof payload === "object" ? payload.mode || "" : "";
          lastArtifacts = artifacts;
          result.textContent = typeof payload === "string" ? payload : JSON.stringify(payload, null, 2);
          resultPill.textContent = payload && payload.ok ? "ready" : "waiting";
          resultPill.style.opacity = payload && payload.ok ? "1" : ".6";
          summaryMetrics.innerHTML = [
            metricCard("Member ID", artifacts?.member_id || "pending"),
            metricCard("Promotion", data?.promotion?.promotion_status || "pending"),
            metricCard("Airtable Client", data?.airtable?.client_record_id || "pending"),
            metricCard("Confirm Links", confirmLinks?.ok ? "generated" : (confirmLinks?.attempted ? "blocked" : "not requested")),
            metricCard("Model History", data?.model_history?.status || "missing"),
            metricCard("Import Type", importType ? String(importType).replace(/_/g, " ") : "idle"),
            metricCard("Import Mode", importMode ? String(importMode).replace(/_/g, " ") : "idle"),
            metricCard("Client Import", effectiveImportSummary ? importActionLabel(clientImportSummary) : "idle"),
            metricCard("Session Import", effectiveImportSummary ? importActionLabel(sessionImportSummary) : "idle"),
            metricCard("Payment Import", effectiveImportSummary ? importActionLabel(paymentImportSummary) : "idle"),
            metricCard("Customer Signup", membership?.auto_signup_ready ? "pending member create" : "ready"),
            metricCard("Telegram", data?.telegram?.ok ? "sent" : (data?.telegram?.attempted ? "failed" : "skipped")),
          ].join("");
          summaryLinks.innerHTML = [
            linkRow("Customer Confirm Link", artifacts?.customer_confirmation_url),
            linkRow("Model Confirm Link", artifacts?.model_confirmation_url),
            linkRow("Customer Onboarding", artifacts?.customer_url),
            linkRow("Model Onboarding", artifacts?.model_url),
            linkRow("Customer Dashboard", artifacts?.customer_dashboard_url),
            linkRow("Model Dashboard", artifacts?.model_dashboard_url),
          ].join("") || '<div class="result-row"><div><strong>Links</strong><span>No links yet.</span></div></div>';
          summaryMeta.innerHTML = [
            metaRow("Immigration ID", data?.immigration_id),
            metaRow("Session ID", confirmLinks?.session_id),
            metaRow("Payment Ref", confirmLinks?.payment_ref),
            metaRow("Current Tier", membership?.current_tier),
            metaRow("Target Tier", membership?.target_tier),
            metaRow("Model History Source", data?.model_history?.source),
            metaRow("Model History Note", data?.model_history?.note),
            metaRow("Import Clients", importCounts?.clients),
            metaRow("Import Sessions", importCounts?.sessions),
            metaRow("Import Payments", importCounts?.payments),
            metaRow("Booking Import Mode", importAllBooking?.mode),
            metaRow("History Import Mode", importAllModelHistory?.mode),
            metaRow("Confirm Link Error", confirmLinks?.ok ? "" : confirmLinks?.error),
          ].join("");
          resultSummary.style.display = "block";
        }

        async function copyFrom(id) {
          const value = document.getElementById(id).textContent || "";
          await navigator.clipboard.writeText(value);
        }

        function downloadText(filename, text, type) {
          const blob = new Blob([text], { type: type || "text/plain;charset=utf-8" });
          const url = URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.href = url;
          link.download = filename;
          document.body.appendChild(link);
          link.click();
          link.remove();
          URL.revokeObjectURL(url);
        }

        function getImportHistory() {
          try {
            const raw = window.localStorage.getItem(IMPORT_HISTORY_KEY);
            const parsed = raw ? JSON.parse(raw) : [];
            return Array.isArray(parsed) ? parsed : [];
          } catch {
            return [];
          }
        }

        function setImportHistory(entries) {
          window.localStorage.setItem(IMPORT_HISTORY_KEY, JSON.stringify(entries.slice(0, 12)));
        }

        function getHistorySourceEntries() {
          const source = String(historySource.value || "local");
          const localEntries = getImportHistory().map((entry, index) => ({
            ...entry,
            __source: "local",
            __index: index,
            source: entry.source || "local",
          }));
          const sharedEntries = sharedImportHistory.map((entry, index) => ({
            ...entry,
            __source: "airtable",
            __index: index,
            source: entry.source || "airtable",
          }));
          if (source === "airtable") return sharedEntries;
          if (source === "merged") {
            return [...sharedEntries, ...localEntries]
              .sort((left, right) => new Date(right.at || 0).getTime() - new Date(left.at || 0).getTime());
          }
          return localEntries;
        }

        function summarizeCounts(summary) {
          const clients = importActionLabel(summarizeImportRows(summary?.clients));
          const sessions = importActionLabel(summarizeImportRows(summary?.sessions));
          const payments = importActionLabel(summarizeImportRows(summary?.payments));
          return "C: " + clients + " | S: " + sessions + " | P: " + payments;
        }

        function entryMatchesOutcome(entry, outcome) {
          if (!outcome) return true;
          if (outcome === "failed") {
            return entry.status === "failed";
          }
          const summary = entry.summary || {};
          const clients = summarizeImportRows(summary.clients);
          const sessions = summarizeImportRows(summary.sessions);
          const payments = summarizeImportRows(summary.payments);
          if (outcome === "skipped") {
            return !!(clients.skipped_existing || clients.skipped_missing_lookup || sessions.skipped_existing || sessions.skipped_missing_lookup || payments.skipped_existing || payments.skipped_missing_lookup);
          }
          if (outcome === "created") {
            return !!(clients.created || sessions.created || payments.created);
          }
          if (outcome === "ready") {
            return !!(clients.would_create || sessions.would_create || payments.would_create);
          }
          return true;
        }

        function getFilteredImportHistory() {
          const entries = getHistorySourceEntries();
          const search = String(historySearch.value || "").trim().toLowerCase();
          const type = String(historyFilterType.value || "").trim();
          const mode = String(historyFilterMode.value || "").trim();
          const outcome = String(historyFilterOutcome.value || "").trim();
          return entries.filter((entry) => {
            const haystack = [
              entry.label,
              entry.mode,
              entry.route,
              entry.status,
              JSON.stringify(entry.payload || {}),
            ].join(" ").toLowerCase();
            if (search && !haystack.includes(search)) return false;
            if (type && String(entry.label || "") !== type) return false;
            if (mode && String(entry.mode || "") !== mode) return false;
            if (!entryMatchesOutcome(entry, outcome)) return false;
            return true;
          });
        }

        function renderImportHistory() {
          const entries = getHistorySourceEntries();
          const filtered = getFilteredImportHistory();
          historyCount.textContent = filtered.length + " / " + entries.length + " items";
          if (!filtered.length) {
            importHistoryList.innerHTML = '<div class="history-item"><p class="hint">' + (entries.length ? "No matching history items." : "No imports yet.") + '</p></div>';
            return;
          }
          importHistoryList.innerHTML = filtered.map((entry) => {
            return '<div class="history-item">' +
              '<div class="history-head">' +
              '<p><strong>' + escapeHtml(entry.label || "Import") + '</strong></p>' +
              '<span class="pill">' + escapeHtml(entry.mode || "dry_run") + ' / ' + escapeHtml(entry.source || "local") + '</span>' +
              '</div>' +
              '<p class="hint" style="margin-top:8px;">' + escapeHtml(entry.at || "") + '</p>' +
              (entry.error ? '<p class="hint" style="margin-top:8px;color:#b91c1c;">' + escapeHtml(entry.error) + '</p>' : '') +
              '<p class="hint" style="margin-top:8px;">' + escapeHtml(summarizeCounts(entry.summary || {})) + '</p>' +
              '<div class="history-actions">' +
              '<button type="button" class="ghost mini" data-history-retry-source="' + escapeHtml(entry.__source || "local") + '" data-history-retry="' + escapeHtml(String(entry.__index || 0)) + '">Retry</button>' +
              '<button type="button" class="ghost mini" data-history-load-source="' + escapeHtml(entry.__source || "local") + '" data-history-load="' + escapeHtml(String(entry.__index || 0)) + '">Load Payload</button>' +
              '</div>' +
              '</div>';
          }).join("");
        }

        function pushImportHistory(entry) {
          const current = getImportHistory();
          current.unshift(entry);
          setImportHistory(current);
          renderImportHistory();
        }

        function fillFormFromPayload(payload) {
          const set = (id, value) => {
            const element = document.getElementById(id);
            if (!element) return;
            if (element.type === "checkbox") {
              element.checked = !!value;
              return;
            }
            element.value = value == null ? "" : String(value);
          };

          set("display_name", payload.display_name);
          set("nickname", payload.nickname);
          set("line_user_id", payload.line_user_id);
          set("line_id", payload.line_id);
          set("email", payload.email);
          set("phone", payload.phone);
          set("session_id", payload.session_id);
          set("payment_ref", payload.payment_ref);
          set("job_type", payload.job_type);
          set("job_date", payload.job_date);
          set("start_time", payload.start_time);
          set("end_time", payload.end_time);
          set("location_name", payload.location_name);
          set("google_map_url", payload.google_map_url);
          set("amount_thb", payload.amount_thb);
          set("pay_model_thb", payload.pay_model_thb);
          set("payment_type", payload.payment_type);
          set("payment_method", payload.payment_method);
          set("booking_note", payload.booking_note);
          set("model_name", payload.model_name);
          set("model_record_id", payload.model_record_id);
          set("model_history_note", payload.model_history_note);
          set("model_history_source", payload.model_history_source);
          set("model_history_status", payload.model_history_status);
          set("current_tier", payload.current_tier);
          set("target_tier", payload.target_tier);
          set("manual_note_raw", payload.manual_note_raw);
          set("operator_summary", payload.operator_summary);
          set("payload_json", payload.payload_json ? JSON.stringify(payload.payload_json, null, 2) : "");
          set("model_history_payload_json", payload.model_history_payload_json ? JSON.stringify(payload.model_history_payload_json, null, 2) : "");
          set("expires_in_hours", payload.expires_in_hours);
          set("telegram_message_thread_id", payload.telegram_message_thread_id);
          set("notify_telegram", payload.notify_telegram !== false);
        }

        function getHistoryEntryFromDataset(kind, index) {
          const targetIndex = Number(index);
          if (!Number.isFinite(targetIndex)) return null;
          if (kind === "airtable") {
            return sharedImportHistory[targetIndex] || null;
          }
          return getImportHistory()[targetIndex] || null;
        }

        async function refreshSharedHistory() {
          const headers = window.__MMD_ADMIN_GATE__
            ? window.__MMD_ADMIN_GATE__.buildHeaders()
            : new Headers();
          const response = await fetch(${JSON.stringify(JOBS.importLogs)} + "?limit=50", {
            method: "GET",
            headers,
          });
          const data = await response.json().catch(() => null);
          if (!response.ok || !data || !Array.isArray(data.entries)) {
            throw new Error((data && data.error && data.error.message) || "Unable to load shared logs");
          }
          sharedImportHistory = data.entries;
          renderImportHistory();
          return data.entries;
        }

        async function runImportRequest(label, url, requestBody) {
          const headers = window.__MMD_ADMIN_GATE__
            ? window.__MMD_ADMIN_GATE__.buildHeaders({ "Content-Type": "application/json" })
            : new Headers({ "Content-Type": "application/json" });
          const response = await fetch(url, {
            method: "POST",
            headers,
            body: JSON.stringify(requestBody),
          });
          const data = await response.json().catch(() => null);
          if (!response.ok || !data) {
            pushImportHistory({
              label,
              at: new Date().toLocaleString(),
              mode: data?.mode || (requestBody.apply ? "apply" : "dry_run"),
              status: "failed",
              summary: data?.summary || {},
              payload: requestBody.payload || requestBody,
              request: requestBody,
              route: url,
            });
            setStatus("Unable to run " + label.toLowerCase() + ".", "error");
            setResult(data || { ok: false, status: response.status });
            return null;
          }
          pushImportHistory({
            label,
            at: new Date().toLocaleString(),
            mode: data.mode || (requestBody.apply ? "apply" : "dry_run"),
            status: "ok",
            summary: data.summary || {
              clients: data.booking?.summary?.clients || data.model_history?.summary?.clients || [],
              sessions: data.booking?.summary?.sessions || data.model_history?.summary?.sessions || [],
              payments: data.booking?.summary?.payments || data.model_history?.summary?.payments || [],
            },
            payload: requestBody.payload || requestBody,
            request: requestBody,
            route: url,
          });
          setResult(data);
          return data;
        }

        function collectPayload() {
          let payloadJson = {};
          let modelHistoryPayloadJson = {};
          const payloadRaw = document.getElementById("payload_json").value.trim();
          if (payloadRaw) {
            payloadJson = JSON.parse(payloadRaw);
          }
          const modelHistoryPayloadRaw = document.getElementById("model_history_payload_json").value.trim();
          if (modelHistoryPayloadRaw) {
            modelHistoryPayloadJson = JSON.parse(modelHistoryPayloadRaw);
          }

          const payload = {
            display_name: document.getElementById("display_name").value.trim(),
            nickname: document.getElementById("nickname").value.trim(),
            line_user_id: document.getElementById("line_user_id").value.trim(),
            line_id: document.getElementById("line_id").value.trim(),
            email: document.getElementById("email").value.trim(),
            phone: document.getElementById("phone").value.trim(),
            session_id: document.getElementById("session_id").value.trim(),
            payment_ref: document.getElementById("payment_ref").value.trim(),
            job_type: document.getElementById("job_type").value.trim(),
            job_date: document.getElementById("job_date").value.trim(),
            start_time: document.getElementById("start_time").value.trim(),
            end_time: document.getElementById("end_time").value.trim(),
            location_name: document.getElementById("location_name").value.trim(),
            google_map_url: document.getElementById("google_map_url").value.trim(),
            amount_thb: document.getElementById("amount_thb").value.trim(),
            pay_model_thb: document.getElementById("pay_model_thb").value.trim(),
            payment_type: document.getElementById("payment_type").value.trim(),
            payment_method: document.getElementById("payment_method").value.trim(),
            booking_note: document.getElementById("booking_note").value.trim(),
            model_name: document.getElementById("model_name").value.trim(),
            model_record_id: document.getElementById("model_record_id").value.trim(),
            model_history_note: document.getElementById("model_history_note").value.trim(),
            model_history_source: document.getElementById("model_history_source").value.trim(),
            model_history_status: document.getElementById("model_history_status").value.trim(),
            model_history_payload_json: modelHistoryPayloadJson,
            current_tier: document.getElementById("current_tier").value.trim(),
            target_tier: document.getElementById("target_tier").value.trim(),
            manual_note_raw: document.getElementById("manual_note_raw").value.trim(),
            operator_summary: document.getElementById("operator_summary").value.trim(),
            payload_json: payloadJson,
            notify_telegram: document.getElementById("notify_telegram").checked,
          };

          const hoursRaw = document.getElementById("expires_in_hours").value.trim();
          const threadRaw = document.getElementById("telegram_message_thread_id").value.trim();
          if (hoursRaw) payload.expires_in_hours = Number(hoursRaw);
          if (threadRaw) payload.telegram_message_thread_id = Number(threadRaw);
          if (payload.amount_thb) payload.amount_thb = Number(payload.amount_thb);
          if (!payload.amount_thb) delete payload.amount_thb;
          if (payload.pay_model_thb) payload.pay_model_thb = Number(payload.pay_model_thb);
          if (!payload.pay_model_thb && payload.pay_model_thb !== 0) delete payload.pay_model_thb;

          return payload;
        }

        document.querySelectorAll("[data-copy]").forEach((button) => {
          button.addEventListener("click", async () => {
            try {
              await copyFrom(button.getAttribute("data-copy"));
              setStatus("Copied to clipboard.", "success");
            } catch {
              setStatus("Unable to copy right now.", "error");
            }
          });
        });

        resultSummary.addEventListener("click", async (event) => {
          const target = event.target.closest("[data-copy-link]");
          if (!target) return;
          try {
            await navigator.clipboard.writeText(target.getAttribute("data-copy-link") || "");
            setStatus("Link copied.", "success");
          } catch {
            setStatus("Unable to copy right now.", "error");
          }
        });

        importHistoryList.addEventListener("click", async (event) => {
          const retryButton = event.target.closest("[data-history-retry]");
          const loadButton = event.target.closest("[data-history-load]");

          if (retryButton) {
            const index = Number(retryButton.getAttribute("data-history-retry"));
            const source = retryButton.getAttribute("data-history-retry-source") || "local";
            const entry = getHistoryEntryFromDataset(source, index);
            if (!entry) return;
            try {
              fillFormFromPayload(entry.payload || {});
              const data = await runImportRequest(entry.label || "Import", entry.route, entry.request || { payload: entry.payload || {} });
              if (data) setStatus((entry.label || "Import") + " retried.", "success");
            } catch {
              setStatus("Unable to retry selected import.", "error");
            }
            return;
          }

          if (loadButton) {
            const index = Number(loadButton.getAttribute("data-history-load"));
            const source = loadButton.getAttribute("data-history-load-source") || "local";
            const entry = getHistoryEntryFromDataset(source, index);
            if (!entry) return;
            fillFormFromPayload(entry.payload || {});
            setStatus("Payload loaded from history.", "success");
          }
        });

        logout.addEventListener("click", () => {
          if (window.__MMD_ADMIN_GATE__) {
            window.__MMD_ADMIN_GATE__.logout();
          }
        });

        clearImportHistory.addEventListener("click", () => {
          setImportHistory([]);
          renderImportHistory();
          setStatus("Import history cleared.", "success");
        });

        exportImportHistory.addEventListener("click", () => {
          const history = getHistorySourceEntries().map(({ __index, __source, ...entry }) => entry);
          downloadText(
            "mmd-import-history.json",
            JSON.stringify({ exported_at: new Date().toISOString(), entries: history }, null, 2),
            "application/json;charset=utf-8",
          );
          setStatus("Import history exported.", "success");
        });

        importImportHistory.addEventListener("click", () => {
          importHistoryFile.click();
        });

        refreshSharedImportHistory.addEventListener("click", async () => {
          try {
            const entries = await refreshSharedHistory();
            setStatus("Shared Airtable logs refreshed (" + entries.length + ").", "success");
          } catch (error) {
            setStatus(error && error.message ? error.message : "Unable to load shared logs.", "error");
          }
        });

        importHistoryFile.addEventListener("change", async () => {
          const file = importHistoryFile.files && importHistoryFile.files[0];
          if (!file) return;
          try {
            const text = await file.text();
            const parsed = JSON.parse(text);
            const entries = Array.isArray(parsed) ? parsed : Array.isArray(parsed.entries) ? parsed.entries : [];
            if (!Array.isArray(entries)) throw new Error("invalid_import_history_file");
            setImportHistory(entries);
            renderImportHistory();
            setStatus("Import history loaded.", "success");
          } catch {
            setStatus("Unable to import history file.", "error");
          } finally {
            importHistoryFile.value = "";
          }
        });

        [historySource, historySearch, historyFilterType, historyFilterMode].forEach((element) => {
          element.addEventListener("input", renderImportHistory);
          element.addEventListener("change", renderImportHistory);
        });
        historyFilterOutcome.addEventListener("input", renderImportHistory);
        historyFilterOutcome.addEventListener("change", renderImportHistory);

        resetHistoryFilters.addEventListener("click", () => {
          historySearch.value = "";
          historyFilterType.value = "";
          historyFilterMode.value = "";
          historyFilterOutcome.value = "";
          renderImportHistory();
          setStatus("History filters reset.", "success");
        });

        retryVisibleHistory.addEventListener("click", async () => {
          const entries = getFilteredImportHistory();
          if (!entries.length) {
            setStatus("No visible history items to retry.", "error");
            return;
          }
          let completed = 0;
          for (const entry of entries) {
            const data = await runImportRequest(entry.label || "Import", entry.route, entry.request);
            if (data) completed += 1;
          }
          setStatus("Retried " + completed + " visible history item(s).", "success");
        });

        importAllAirtable.addEventListener("click", async () => {
          try {
            const payload = collectPayload();
            const data = await runImportRequest(
              "Import All",
              ${JSON.stringify(JOBS.importAll)},
              {
                payload,
                booking_apply: !!applyBookingImport.checked,
                model_history_apply: !!applyModelHistoryImport.checked,
              },
            );
            if (!data) return;
            setStatus("Import all completed. Review result below.", "success");
          } catch {
            setStatus("Unable to run import all right now.", "error");
          }
        });

        importBookingAirtable.addEventListener("click", async () => {
          try {
            const payload = collectPayload();
            const apply = !!applyBookingImport.checked;
            const data = await runImportRequest("Booking Import", ${JSON.stringify(JOBS.bookingImport)}, { payload, apply });
            if (!data) return;
            setStatus(apply ? "Booking imported to Airtable." : "Booking dry run complete. Review result below.", "success");
          } catch {
            setStatus("Unable to import booking right now.", "error");
          }
        });

        exportModelHistoryJson.addEventListener("click", () => {
          try {
            const payload = collectPayload();
            downloadText(
              (payload.model_name || "model-history") + ".json",
              JSON.stringify(payload, null, 2),
              "application/json;charset=utf-8",
            );
            setStatus("Model history JSON exported.", "success");
          } catch {
            setStatus("Unable to export JSON. Check payload fields first.", "error");
          }
        });

        generateModelHistoryBatch.addEventListener("click", async () => {
          try {
            const payload = collectPayload();
            const headers = window.__MMD_ADMIN_GATE__
              ? window.__MMD_ADMIN_GATE__.buildHeaders({ "Content-Type": "application/json" })
              : new Headers({ "Content-Type": "application/json" });
            const response = await fetch(${JSON.stringify(JOBS.modelHistoryBatch)}, {
              method: "POST",
              headers,
              body: JSON.stringify(payload),
            });
            const data = await response.json().catch(() => null);
            if (!response.ok || !data) {
              setStatus("Unable to generate model history batch.", "error");
              return;
            }
            const base = (payload.model_name || payload.display_name || "model-history").replace(/[^a-z0-9_-]+/gi, "-").toLowerCase();
            downloadText(base + "-clients.csv", data.files["clients.csv"] || "", "text/csv;charset=utf-8");
            downloadText(base + "-sessions.csv", data.files["sessions.csv"] || "", "text/csv;charset=utf-8");
            downloadText(base + "-payments.csv", data.files["payments.csv"] || "", "text/csv;charset=utf-8");
            downloadText(base + "-import-payload.json", JSON.stringify(data.import_payload || {}, null, 2), "application/json;charset=utf-8");
            setStatus("Model history batch generated.", "success");
          } catch {
            setStatus("Unable to generate model history batch right now.", "error");
          }
        });

        importModelHistoryAirtable.addEventListener("click", async () => {
          try {
            const payload = collectPayload();
            const apply = !!applyModelHistoryImport.checked;
            const data = await runImportRequest("Model History Import", ${JSON.stringify(JOBS.modelHistoryImport)}, { payload, apply });
            if (!data) return;
            setStatus(apply ? "Model history imported to Airtable." : "Dry run complete. Review result below.", "success");
          } catch {
            setStatus("Unable to import model history right now.", "error");
          }
        });

        form.addEventListener("submit", async (event) => {
          event.preventDefault();
          setStatus("");
          let payload;
          try {
            payload = collectPayload();
          } catch {
            setStatus("Payload JSON is invalid.", "error");
            return;
          }

          submit.disabled = true;
          submit.textContent = "Creating...";
          setStatus("Submitting create-job request…");
          setResult("Working…");

          try {
            const headers = window.__MMD_ADMIN_GATE__
              ? window.__MMD_ADMIN_GATE__.buildHeaders({ "Content-Type": "application/json" })
              : new Headers({ "Content-Type": "application/json" });
            const response = await fetch(${JSON.stringify(JOBS.createJob)}, {
              method: "POST",
              headers,
              body: JSON.stringify(payload),
            });
            const data = await response.json().catch(() => null);
            if (!response.ok || !data) {
              setStatus((data && (data.error?.message || data.error)) || "Create job failed.", "error");
              setResult(data || { ok: false, status: response.status });
              return;
            }

            setStatus("Job created successfully.", "success");
            setResult(data);
          } catch (error) {
            setStatus("Unable to reach create-job right now.", "error");
            setResult({ ok: false, error: String(error && error.message ? error.message : error) });
          } finally {
            submit.disabled = false;
            submit.textContent = "Create Job";
          }
        });

        retryLastImport.addEventListener("click", async () => {
          const entry = getImportHistory()[0];
          if (!entry) {
            setStatus("No recent import to retry.", "error");
            return;
          }
          try {
            fillFormFromPayload(entry.payload || {});
            const data = await runImportRequest(entry.label || "Import", entry.route, entry.request);
            if (!data) return;
            setStatus("Last import retried.", "success");
          } catch {
            setStatus("Unable to retry last import.", "error");
          }
        });

        renderImportHistory();
      })();
    </script>
  </body>
</html>`;

  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

async function handleAdminLoginSession(request: Request, env: Env): Promise<Response> {
  const meta = makeMeta(request);

  if (request.method === "DELETE") {
    return json(
      { ok: true, data: { cleared: true, redirect_to: CONTROL_ROOM.login }, meta },
      { headers: { "set-cookie": clearGateSessionCookie(request) } },
    );
  }

  const body = (await request.json().catch(() => null)) as {
    baseUrl?: string;
    accessCode?: string;
    bearer?: string;
    confirmKey?: string;
    next?: string;
  } | null;
  const accessCode = toStr(body?.accessCode);
  const bearer = toStr(body?.bearer) || accessCode;
  const confirmKey = toStr(body?.confirmKey);
  const next = normalizeAdminNextPath(body?.next, selectAdminDefaultNext(new URL(request.url).pathname));
  let baseUrl = "";

  try {
    baseUrl = normalizeAdminBaseUrl(body?.baseUrl, request);
  } catch (error) {
    const message = error instanceof Error ? error.message : "invalid_base_url";
    return badRequest(message, meta, { field: "baseUrl" });
  }

  if (!bearer && !confirmKey) {
    return badRequest("accessCode, bearer, or confirmKey is required", meta, {
      field: "accessCode",
    });
  }

  const headers = new Headers();
  if (bearer) headers.set("Authorization", `Bearer ${bearer}`);
  if (confirmKey) headers.set("X-Confirm-Key", confirmKey);

  const verified = await verifyAdminAuthority(baseUrl, request, env, headers);

  if (!verified) {
    return json(
      {
        ok: false,
        error: { code: "ADMIN_VERIFY_FAILED", message: "Admin verification failed" },
        meta,
      },
      { status: 401 },
    );
  }

  const session: AdminGateSession = {
    ok: true,
    at: Date.now(),
    baseUrl,
    ...(bearer ? { bearer } : {}),
    ...(confirmKey ? { confirmKey } : {}),
  };

  return json(
    { ok: true, data: { unlocked: true, redirect_to: next, session }, meta },
    { headers: { "set-cookie": makeGateSessionCookie(request, session) } },
  );
}

async function handleVerifyAccessCode(request: Request, env: Env): Promise<Response> {
  const meta = makeMeta(request);

  if (!isAuthorized(request, env)) {
    return unauthorized(meta);
  }

  const body = (await request.json().catch(() => null)) as { accessCode?: string } | null;
  const accessCode = toStr(body?.accessCode);
  const expectedPassword = String(env.BROWSER_GATE_PASSWORD || env.INTERNAL_TOKEN || "").trim();

  if (!accessCode) {
    return badRequest("accessCode is required", meta, { field: "accessCode" });
  }

  if (!expectedPassword || accessCode !== expectedPassword) {
    return json(
      {
        ok: false,
        error: { code: "ACCESS_CODE_INVALID", message: "Access code invalid" },
        meta,
      },
      { status: 401 },
    );
  }

  return json({ ok: true, data: { verified: true }, meta });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const meta = makeMeta(request);

    try {
      const url = new URL(request.url);

      const internalRouteRes = await handleInternalRoutes(request, env);
      if (internalRouteRes) return internalRouteRes;

      if (
        request.method === "OPTIONS" &&
        (
          isPublicRenewalStatusRoute(url.pathname)
          || isPublicRenewalIntakeRoute(url.pathname)
          || isPublicCustomerConfirmRoute(url.pathname)
        )
      ) {
        return withCors(request, env, new Response(null, { status: 204 }));
      }

      if (request.method === "GET" && isHealthRoute(url.pathname)) {
        const body: HealthResponse = {
          ok: true,
          service: "immigrate-worker",
          version: VERSION,
          airtable_sync_enabled: String(env.ENABLE_AIRTABLE_SYNC || "false").toLowerCase() === "true",
          meta,
        };
        return json(body);
      }

      if (request.method === "GET" && (url.pathname === PUBLIC.onboardingResolve || url.pathname === SIGIL.inviteResolve)) {
        return await handleResolveInvite(request, env);
      }

      if (request.method === "POST" && isPublicRenewalStatusRoute(url.pathname)) {
        return await handlePublicRenewalStatus(request, env);
      }

      if (request.method === "POST" && isPublicRenewalIntakeRoute(url.pathname)) {
        return await handlePublicRenewalIntake(request, env);
      }

      if (request.method === "POST" && isPublicCustomerConfirmRoute(url.pathname)) {
        return await handleCustomerConfirm(request, env);
      }

      if (
        (request.method === "GET" || request.method === "HEAD") &&
        (url.pathname === CONTROL_ROOM.login || url.pathname === SIGIL.login)
      ) {
        return renderAdminLoginPage(request, env);
      }

      if (
        (request.method === "POST" || request.method === "DELETE") &&
        (url.pathname === CONTROL_ROOM.loginSession || url.pathname === SIGIL.loginSession)
      ) {
        return await handleAdminLoginSession(request, env);
      }

      if (
        request.method === "POST" &&
        (url.pathname === CONTROL_ROOM.verifyAccessCode || url.pathname === SIGIL.verifyAccessCode)
      ) {
        return await handleVerifyAccessCode(request, env);
      }

      if (
        (request.method === "GET" || request.method === "HEAD") &&
        (url.pathname === ADMIN_JOBS.createSession ||
          url.pathname === ADMIN_JOBS.createSessionLegacy ||
          url.pathname === SIGIL.createSession)
      ) {
        if (request.method === "HEAD") {
          return new Response(null, {
            status: 200,
            headers: {
              "content-type": "text/html; charset=utf-8",
              "cache-control": "no-store",
            },
          });
        }

        const gateSession = getValidatedGateSession(request);
        if (!gateSession && !isAuthorized(request, env)) {
          return makeLoginRedirect(request, url.pathname);
        }

        const session =
          gateSession ||
          ({
            ok: true,
            at: Date.now(),
            baseUrl: new URL(request.url).origin,
            bearer: readInternalToken(request) || env.INTERNAL_TOKEN,
          } satisfies AdminGateSession);

        return renderCreateSessionPage(request, session);
      }

      if (
        request.method === "POST" &&
        (url.pathname === ADMIN_JOBS.createSession ||
          url.pathname === ADMIN_JOBS.createSessionLegacy ||
          url.pathname === SIGIL.createSession)
      ) {
        return await handleAdminCreateSessionProxy(request, env, meta);
      }

      if ((request.method === "GET" || request.method === "HEAD") && (url.pathname === JOBS.createJob || url.pathname === SIGIL.createJob)) {
        if (request.method === "HEAD") {
          return new Response(null, {
            status: 200,
            headers: {
              "content-type": "text/html; charset=utf-8",
              "cache-control": "no-store",
            },
          });
        }

        const gateSession = getValidatedGateSession(request);
        if (!gateSession && !isAuthorized(request, env)) {
          return makeLoginRedirect(request, url.pathname);
        }

        const session =
          gateSession ||
          ({
            ok: true,
            at: Date.now(),
            baseUrl: new URL(request.url).origin,
            bearer: readInternalToken(request) || env.INTERNAL_TOKEN,
          } satisfies AdminGateSession);

        return renderCreateJobPage(request, session);
      }

      if ((request.method === "GET" || request.method === "HEAD") && isProtectedBrowserRoute(url.pathname)) {
        const legacyPath = getLegacyAdminPath(url.pathname);
        const upstreamUrl = new URL(request.url);
        upstreamUrl.pathname = legacyPath;
        const upstreamRequest = legacyPath === url.pathname ? request : new Request(upstreamUrl.toString(), request);

        if (isAuthorized(request, env)) {
          return fetch(upstreamRequest);
        }

        const gateSession = getValidatedGateSession(request);
        if (!gateSession) {
          return makeLoginRedirect(request, url.pathname);
        }

        const upstream = await fetch(upstreamRequest);
        if (request.method === "HEAD") {
          return upstream;
        }

        return await withInjectedAdminBootstrap(request, upstream, gateSession);
      }

      if (!isAuthorized(request, env)) {
        return unauthorized(meta);
      }

      if (request.method === "POST" && isLinePreviewRoute(url.pathname)) {
        return await handleLinePreview(request, env);
      }

      if (request.method === "POST" && isLineIntakeRoute(url.pathname)) {
        return await handleLineIntake(request, env);
      }

      if (request.method === "POST" && isCreateJobRoute(url.pathname)) {
        return await handleCreateJob(request, env);
      }

      if (request.method === "POST" && (url.pathname === JOBS.createJob || url.pathname === SIGIL.createJob)) {
        return await handleCreateJob(request, env);
      }

      if (request.method === "POST" && url.pathname === JOBS.modelHistoryBatch) {
        return await handleModelHistoryBatch(request);
      }

      if (request.method === "POST" && url.pathname === JOBS.modelHistoryImport) {
        return await handleModelHistoryImport(request, env);
      }

      if (request.method === "POST" && url.pathname === JOBS.privateProfileImport) {
        return await handlePrivateProfileImport(request, env);
      }

      if (request.method === "POST" && url.pathname === JOBS.bookingImport) {
        return await handleBookingImport(request, env);
      }

      if (request.method === "POST" && url.pathname === JOBS.importAll) {
        return await handleImportAll(request, env);
      }

      if (request.method === "GET" && url.pathname === JOBS.importLogs) {
        return await handleImportLogs(request, env);
      }

      if (request.method === "POST" && isIntakeRoute(url.pathname)) {
        return await handleIntake(request);
      }

      if (request.method === "POST" && isPromoteRoute(url.pathname)) {
        return await handlePromote(request, env);
      }

      if (request.method === "POST" && isLinksRoute(url.pathname)) {
        return await handleCreateImmigrationLinks(request, env);
      }

      const immigrationId = getImmigrationIdFromPath(url.pathname);
      if (request.method === "GET" && immigrationId) {
        return await handleGetImmigration(request, immigrationId, env);
      }

      if (request.method === "GET" && isListRoute(url.pathname)) {
        return await handleList(request, env);
      }

      if (request.method === "POST" && isRefreshRoute(url.pathname)) {
        return await handleRefresh(request);
      }

      if (request.method === "POST" && isSyncRoute(url.pathname)) {
        return await handleSync(request, env);
      }

      if (request.method === "GET" && isLogsRoute(url.pathname)) {
        return await handleLogs(request);
      }

      if ((request.method === "GET" || request.method === "POST") && isSessionsRoute(url.pathname)) {
        return await handleSessions(request, env);
      }

      if (request.method === "POST" && url.pathname === JOBS.createLinks) {
        return await handleCreateLinks(request, env);
      }

      if (request.method === "POST" && url.pathname === JOBS.createInvite) {
        return await handleCreateInvite(request, env);
      }

      return json(
        {
          ok: false,
          error: {
            code: "NOT_FOUND",
            message: "Route not found",
          },
          meta,
        },
        { status: 404 },
      );
    } catch (error) {
      console.error("immigrate-worker error", error);
      return internalError(meta, error instanceof Error ? error.message : "Internal Server Error");
    }
  },
};
