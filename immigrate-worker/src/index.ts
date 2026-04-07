import { isAuthorized, readInternalToken } from "./lib/auth";
import {
  buildImmigrationLinkContext,
  canReadAirtable,
  confirmCustomerBookingToAirtable,
  listRecordsFromAirtable,
  listSessionsFromAirtable,
  syncRecordsToAirtable,
  writeLinkAuditRecord,
} from "./lib/airtable";
import { buildAbsoluteUrl, generateInviteLink, parseInviteIdentity, verifyInviteToken } from "./lib/invite";
import { badRequest, internalError, json, makeMeta, redirect, unauthorized } from "./lib/response";
import { seedLineInboxRecords, seedLogs, seedSessions } from "./lib/seed";
import type {
  CustomerBookingConfirmRequest,
  CustomerBookingConfirmResponse,
  ExperienceContract,
  Env,
  HealthResponse,
  ImmigrationGetResponse,
  ImmigrationIntakeRequest,
  ImmigrationIntakeResponse,
  ImmigrationLinksRequest,
  ImmigrationLinksResponse,
  ImmigrationPromoteRequest,
  ImmigrationPromoteResponse,
  ImmigrationPromotionRecord,
  ImmigrationSourceChannel,
  ImmigrationIntent,
  InviteLane,
  InviteRole,
  LineInboxListResponse,
  LogsResponse,
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
  health: "/v1/immigrate/health",
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

const ADMIN_JOBS = {
  createSession: "/internal/admin/jobs/create-session",
} as const;

const JOBS = {
  root: "/internal/jobs",
  createLinks: "/internal/jobs/create-links",
  createInvite: "/internal/jobs/create-invite-link",
  customerConfirm: "/internal/jobs/customer-confirm",
} as const;

const PUBLIC = {
  onboardingResolve: "/member/api/invite/resolve",
  renewalIntake: "/member/api/renewal/intake",
  customerConfirm: "/member/api/jobs/customer-confirm",
} as const;

const ADMIN_GATE_SESSION_KEY = "mmd_admin_gate_v1";
const ADMIN_GATE_TTL_MS = 8 * 60 * 60 * 1000;
const ADMIN_GATE_DEFAULT_NEXT = CONTROL_ROOM.root;
const ADMIN_GATE_ALLOWED_BASE_URLS = new Set([
  "https://mmdbkk.com",
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

type PublicRenewalBody = {
  display_name?: string;
  name?: string;
  email?: string;
  line_id?: string;
  line_user_id?: string;
  phone?: string;
  contact?: string;
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
      manual_note_raw: historyNote || operatorSummary,
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
  if (!toStr(payload.notes.manual_note_raw)) {
    return publicJson(
      request,
      env,
      {
        ok: false,
        error: { code: "INVALID_INPUT", message: "service_history_note or note is required" },
        meta,
      },
      { status: 400 },
    );
  }

  const record = buildPromotionRecord(payload, {
    promotion_status: "archived_raw",
  });
  const promotePreview = promoteRecord(record);
  const migrationRecord = buildRenewalMigrationRecord(payload, record.immigration_id);

  let sync:
    | {
        mode: "mock" | "airtable";
        results: Array<{
          migration_id: string;
          airtable_record_id?: string;
          client_id?: string | null;
          migration_status: "synced_to_airtable";
        }>;
      }
    | null = null;

  try {
    sync = await syncRecordsToAirtable(env, [migrationRecord]);
  } catch (error) {
    return publicJson(
      request,
      env,
      {
        ok: false,
        error: {
          code: "AIRTABLE_SYNC_FAILED",
          message: error instanceof Error ? error.message : "Airtable sync failed",
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
      promotion_status: record.promotion_status,
      member_id_preview: promotePreview.promoted_member_id || "",
      created_new_member_preview: Boolean(promotePreview.created_new_member),
      sync: sync
        ? {
            mode: sync.mode,
            result: sync.results[0] || null,
          }
        : null,
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
    invite_page: toStr(payload.customer_onboarding_path) || "/member/onboarding",
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
  return pathname === CANONICAL.health || pathname === CONTROL_ROOM.health;
}

function isListRoute(pathname: string): boolean {
  return pathname === CANONICAL.list || pathname === CONTROL_ROOM.list;
}

function isRefreshRoute(pathname: string): boolean {
  return pathname === CANONICAL.refresh || pathname === CONTROL_ROOM.refresh;
}

function isSyncRoute(pathname: string): boolean {
  return pathname === CANONICAL.sync || pathname === CONTROL_ROOM.sync;
}

function isPublicRenewalIntakeRoute(pathname: string): boolean {
  return pathname === PUBLIC.renewalIntake;
}

function isPublicCustomerConfirmRoute(pathname: string): boolean {
  return pathname === PUBLIC.customerConfirm || pathname === JOBS.customerConfirm;
}

function isLogsRoute(pathname: string): boolean {
  return pathname === CONTROL_ROOM.logs;
}

function isSessionsRoute(pathname: string): boolean {
  return pathname === CONTROL_ROOM.sessions || pathname === CONTROL_ROOM.sessionRefresh;
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

  const isAdminPage = pathname === CONTROL_ROOM.root || pathname.startsWith(`${CONTROL_ROOM.root}/`);
  const isJobsPage = pathname === JOBS.root || pathname.startsWith(`${JOBS.root}/`);

  if (!isAdminPage && !isJobsPage) return false;
  if (pathname === CONTROL_ROOM.login || pathname === CONTROL_ROOM.loginSession) return false;
  if (isHealthRoute(pathname)) return false;
  if (isListRoute(pathname)) return false;
  if (isRefreshRoute(pathname)) return false;
  if (isSyncRoute(pathname)) return false;
  if (isLogsRoute(pathname)) return false;
  if (isSessionsRoute(pathname)) return false;
  if (pathname === JOBS.createLinks || pathname === JOBS.createInvite) return false;

  return true;
}

function makeLoginRedirect(request: Request, pathname: string): Response {
  const url = new URL(request.url);
  const next = pathname + url.search;
  const loginUrl = new URL(CONTROL_ROOM.login, url.origin);
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

  if (url.hostname === "www.mmdbkk.com") {
    url.hostname = "mmdbkk.com";
  }

  const normalized = `https://${url.hostname}`;
  if (!ADMIN_GATE_ALLOWED_BASE_URLS.has(normalized)) {
    throw new Error("base_url_not_allowed");
  }

  return normalized;
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
  for (const candidate of collectAdminVerifyCandidates(baseUrl, request, env)) {
    try {
      const response = await fetch(`${candidate}/v1/admin/ping`, {
        method: "GET",
        headers,
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

function normalizeAdminNextPath(value: unknown): string {
  const raw = toStr(value);
  if (!raw.startsWith("/") || raw.startsWith("//")) {
    return ADMIN_GATE_DEFAULT_NEXT;
  }

  try {
    const parsed = new URL(raw, "https://mmdbkk.com");
    if (parsed.origin !== "https://mmdbkk.com") {
      return ADMIN_GATE_DEFAULT_NEXT;
    }
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return ADMIN_GATE_DEFAULT_NEXT;
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

function adminGateBootstrapScript(session: AdminGateSession, next: string): string {
  return `
<script>
(() => {
  const KEY = ${JSON.stringify(ADMIN_GATE_SESSION_KEY)};
  const TTL_MS = ${String(ADMIN_GATE_TTL_MS)};
  const LOGIN_PATH = ${JSON.stringify(CONTROL_ROOM.login)};
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
      return originalFetch(${JSON.stringify(CONTROL_ROOM.loginSession)}, { method: "DELETE", credentials: "same-origin" })
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
  const injected = html.includes("</head>")
    ? html.replace("</head>", `${adminGateBootstrapScript(session, normalizeAdminNextPath(new URL(request.url).pathname + new URL(request.url).search))}</head>`)
    : `${adminGateBootstrapScript(session, normalizeAdminNextPath(new URL(request.url).pathname + new URL(request.url).search))}${html}`;

  const headers = new Headers(response.headers);
  headers.delete("content-length");
  return new Response(injected, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function renderAdminLoginPage(request: Request): Response {
  const url = new URL(request.url);
  const next = normalizeAdminNextPath(url.searchParams.get("next"));
  let defaultBaseUrl = "https://mmdbkk.com";
  try {
    defaultBaseUrl = normalizeAdminBaseUrl(url.origin, request);
  } catch {}

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>MMD Admin Login</title>
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
          radial-gradient(circle at top, rgba(164,91,91,.18), transparent 28%),
          radial-gradient(circle at bottom right, rgba(95,127,132,.12), transparent 30%),
          linear-gradient(180deg, #110d14 0%, #09080d 52%, #060507 100%);
        font-family: Baskerville, "Iowan Old Style", Palatino, Georgia, serif;
      }
      .shell {
        width: min(100%, 720px);
        padding: 32px;
        border: 1px solid var(--line);
        border-radius: 28px;
        background: var(--panel);
        box-shadow: 0 24px 80px rgba(0,0,0,.35);
        backdrop-filter: blur(18px);
      }
      .kicker {
        margin: 0 0 12px;
        color: var(--gold);
        font: 600 .8rem/1.2 "Avenir Next Condensed", "Gill Sans", sans-serif;
        letter-spacing: .24em;
        text-transform: uppercase;
      }
      h1 {
        margin: 0;
        font-size: clamp(2.4rem, 9vw, 4.8rem);
        line-height: .9;
        letter-spacing: -.04em;
      }
      .lead {
        margin: 18px 0 0;
        color: var(--muted);
        line-height: 1.7;
        max-width: 42ch;
      }
      form {
        display: grid;
        gap: 14px;
        margin-top: 28px;
      }
      label {
        display: grid;
        gap: 8px;
        color: var(--gold);
        font: 600 .78rem/1.2 "Avenir Next Condensed", "Gill Sans", sans-serif;
        letter-spacing: .16em;
        text-transform: uppercase;
      }
      input {
        width: 100%;
        min-height: 52px;
        padding: 0 16px;
        border: 1px solid var(--line);
        border-radius: 16px;
        background: rgba(7,6,10,.72);
        color: var(--text);
        font: inherit;
      }
      .meta {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        align-items: center;
        margin-top: 6px;
        color: var(--muted);
        font-size: .92rem;
      }
      code {
        padding: 6px 10px;
        border: 1px solid var(--line);
        border-radius: 999px;
        background: rgba(255,255,255,.04);
        color: var(--text);
        font-family: SFMono-Regular, Consolas, Menlo, monospace;
        font-size: .8rem;
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
      .row {
        display: grid;
        gap: 14px;
      }
      .error {
        min-height: 1.2em;
        margin: 0;
        color: #f2b0b0;
      }
      .hint {
        margin: 0;
        color: var(--muted);
        font-size: .92rem;
      }
    </style>
  </head>
  <body>
    <main class="shell">
      <p class="kicker">Internal Admin / Login</p>
      <h1>Private control room access.</h1>
      <p class="lead">Unlock the admin area with an access code, bearer token, or confirm key. Verification runs against <code>/v1/admin/ping</code> before the browser gate session is created.</p>

      <form id="admin-login-form">
        <label>Base URL
          <input id="baseUrl" name="baseUrl" type="text" value="${escapeHtml(defaultBaseUrl)}" autocomplete="url" />
        </label>

        <div class="row">
          <label>Access Code
            <input id="accessCode" name="accessCode" type="password" autocomplete="current-password" />
          </label>
          <label>Bearer Token
            <input id="bearer" name="bearer" type="password" autocomplete="off" />
          </label>
          <label>Confirm Key
            <input id="confirmKey" name="confirmKey" type="password" autocomplete="off" />
          </label>
        </div>

        <div class="meta">
          <span>Next route</span>
          <code id="nextValue">${escapeHtml(next)}</code>
        </div>
        <p class="hint">If <code>next</code> is missing, this login defaults to <code>${escapeHtml(ADMIN_GATE_DEFAULT_NEXT)}</code>.</p>
        <p id="error" class="error" role="alert"></p>
        <button id="submit" type="submit">Unlock</button>
      </form>
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
          submit.textContent = "Verifying...";

          const payload = {
            baseUrl: document.getElementById("baseUrl").value,
            accessCode: document.getElementById("accessCode").value,
            bearer: document.getElementById("bearer").value,
            confirmKey: document.getElementById("confirmKey").value,
            next,
          };

          try {
            const response = await fetch(${JSON.stringify(CONTROL_ROOM.loginSession)}, {
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
            submit.textContent = "Unlock";
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
    ${adminGateBootstrapScript(session, next)}
  </head>
  <body>
    <main class="shell">
      <div class="topbar">
        <div>
          <p class="kicker">Internal Admin / Jobs</p>
          <h1>Create Session</h1>
          <p class="lead">Create a payment confirmation link for a session. This page sends the form to <code>/v1/admin/jobs/create-session</code> through the existing admin gate session, so no raw bearer token is exposed in the page itself.</p>
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
            const response = await fetch("/v1/admin/jobs/create-session", {
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
            setStatus("Unable to reach /v1/admin/jobs/create-session right now.", "error");
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
  const next = normalizeAdminNextPath(body?.next);
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

      if (
        request.method === "OPTIONS" &&
        (isPublicRenewalIntakeRoute(url.pathname) || isPublicCustomerConfirmRoute(url.pathname))
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

      if (request.method === "GET" && url.pathname === PUBLIC.onboardingResolve) {
        return await handleResolveInvite(request, env);
      }

      if (request.method === "POST" && isPublicRenewalIntakeRoute(url.pathname)) {
        return await handlePublicRenewalIntake(request, env);
      }

      if (request.method === "POST" && isPublicCustomerConfirmRoute(url.pathname)) {
        return await handleCustomerConfirm(request, env);
      }

      if ((request.method === "GET" || request.method === "HEAD") && url.pathname === CONTROL_ROOM.login) {
        return renderAdminLoginPage(request);
      }

      if ((request.method === "POST" || request.method === "DELETE") && url.pathname === CONTROL_ROOM.loginSession) {
        return await handleAdminLoginSession(request, env);
      }

      if (request.method === "POST" && url.pathname === CONTROL_ROOM.verifyAccessCode) {
        return await handleVerifyAccessCode(request, env);
      }

      if ((request.method === "GET" || request.method === "HEAD") && url.pathname === ADMIN_JOBS.createSession) {
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

      if ((request.method === "GET" || request.method === "HEAD") && isProtectedBrowserRoute(url.pathname)) {
        if (isAuthorized(request, env)) {
          return fetch(request);
        }

        const gateSession = getValidatedGateSession(request);
        if (!gateSession) {
          return makeLoginRedirect(request, url.pathname);
        }

        const upstream = await fetch(request);
        if (request.method === "HEAD") {
          return upstream;
        }

        return await withInjectedAdminBootstrap(request, upstream, gateSession);
      }

      if (!isAuthorized(request, env)) {
        return unauthorized(meta);
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
