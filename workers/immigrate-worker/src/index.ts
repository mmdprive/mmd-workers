import { isAuthorized, readInternalToken } from "./lib/auth";
import { canReadAirtable, listRecordsFromAirtable, listSessionsFromAirtable, syncRecordsToAirtable } from "./lib/airtable";
import { generateInviteLink, parseInviteIdentity, verifyInviteToken } from "./lib/invite";
import { badRequest, internalError, json, makeMeta, unauthorized } from "./lib/response";
import { seedLineInboxRecords, seedLogs, seedSessions } from "./lib/seed";
import type {
  Env,
  HealthResponse,
  ImmigrationGetResponse,
  ImmigrationIntakeRequest,
  ImmigrationIntakeResponse,
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
} as const;

const CONTROL_ROOM = {
  health: "/internal/admin/control-room/health",
  list: "/internal/admin/control-room/line-inbox",
  refresh: "/internal/admin/control-room/refresh-status",
  sync: "/internal/admin/control-room/sync-airtable",
  logs: "/internal/admin/control-room/logs",
  sessions: "/internal/admin/control-room/sessions/live",
  sessionRefresh: "/internal/admin/control-room/sessions/refresh",
} as const;

const JOBS = {
  createLinks: "/internal/jobs/create-links",
  createInvite: "/internal/jobs/create-invite-link",
} as const;

const PUBLIC = {
  onboardingResolve: "/member/api/invite/resolve",
} as const;

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
};

function toInviteIdentityPayload(payload: InvitePayload) {
  return {
    username: payload.username,
    nickname: payload.nickname,
    suffix_code: payload.suffix_code,
    mmd_client_name: payload.mmd_client_name,
    client_name: payload.client_name,
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
  const payload = await request.json().catch(() => null);

  if (!payload || typeof payload !== "object") {
    return badRequest("invalid request body", meta);
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
  const invite = await generateInviteLink(env, {
    invite_id: makeInviteId(),
    username: identity.username,
    nickname: identity.nickname,
    suffix_code: identity.suffix_code,
    mmd_client_name: identity.mmd_client_name,
    email: toStr(invitePayload.email || invitePayload.gmail).toLowerCase(),
    line_user_id: toStr(invitePayload.line_user_id),
    telegram_username: toStr(invitePayload.telegram_username || invitePayload.customer_telegram_username),
    memberstack_id: toStr(invitePayload.memberstack_id),
    invite_page: toStr(invitePayload.invite_page),
    expires_in_hours: Number(invitePayload.expires_in_hours || 24 * 7),
    role,
    lane,
    model_name: toStr(invitePayload.model_name),
    model_record_id: toStr(invitePayload.model_record_id),
    rules_url: toStr(invitePayload.rules_url),
    console_url: toStr(invitePayload.console_url),
    requires_rules_ack: boolFromUnknown(invitePayload.requires_rules_ack, role === "model"),
    requires_model_binding: boolFromUnknown(invitePayload.requires_model_binding, role === "model"),
  });

  if (upstreamUrl) {
    const upstream = await fetch(upstreamUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const text = await upstream.text();
    const contentType = upstream.headers.get("content-type") || "application/json; charset=utf-8";

    if (contentType.includes("application/json")) {
      try {
        const payloadJson = JSON.parse(text) as Record<string, unknown>;
        return json({
          ...payloadJson,
          onboarding_url: invite.onboarding_url,
          customer_onboarding_url: invite.customer_onboarding_url,
          customer_username: identity.username,
          customer_invite_expires_at: invite.expires_at,
          invite_role: role,
          invite_lane: lane,
        });
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
      onboarding_url: invite.onboarding_url,
      customer_onboarding_url: invite.customer_onboarding_url,
      customer_username: identity.username,
      customer_invite_expires_at: invite.expires_at,
      invite_role: role,
      invite_lane: lane,
      meta,
    },
  );
}

async function handleCreateInvite(request: Request, env: Env): Promise<Response> {
  const meta = makeMeta(request);
  const payload = (await request.json().catch(() => null)) as InvitePayload | null;

  if (!payload || typeof payload !== "object") {
    return badRequest("invalid request body", meta);
  }

  requiredString(payload.client_name || payload.nickname, "client_name");

  const identity = parseInviteIdentity(toInviteIdentityPayload(payload));
  const role = parseInviteRole(payload.invite_role);
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

    return json({
      ok: true,
      invite_id: invite.invite_id,
      role: invite.role,
      lane: invite.lane,
      prefill,
      requirements,
      model_profile: {
        model_name: invite.model_name || "",
        model_record_id: invite.model_record_id || "",
      },
      routes: {
        rules_url: invite.rules_url || "",
        console_url: invite.console_url || "",
      },
      expires_at: new Date(invite.exp * 1000).toISOString(),
      meta,
    });
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

function isLogsRoute(pathname: string): boolean {
  return pathname === CONTROL_ROOM.logs;
}

function isSessionsRoute(pathname: string): boolean {
  return pathname === CONTROL_ROOM.sessions || pathname === CONTROL_ROOM.sessionRefresh;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const meta = makeMeta(request);

    try {
      const url = new URL(request.url);

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

      if (!isAuthorized(request, env)) {
        return unauthorized(meta);
      }

      if (request.method === "POST" && isIntakeRoute(url.pathname)) {
        return await handleIntake(request);
      }

      if (request.method === "POST" && isPromoteRoute(url.pathname)) {
        return await handlePromote(request, env);
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
