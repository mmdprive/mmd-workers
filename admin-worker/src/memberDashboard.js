import { json } from "../lib/http.js";
import { dtFindMember } from "../lib/memberstack_dt.js";

const AIRTABLE_API = "https://api.airtable.com/v0";
const VERIFIED_PAYMENT_STATUSES = new Set(["paid", "success", "verified"]);
const VERIFIED_VERIFICATION_STATUSES = new Set(["verified", "approved", "success"]);
const UPCOMING_SESSION_EMPTY_STATE = {
  date_label: "No upcoming session",
  name: "No active session",
  meta: "Private route available when a new session is created",
  payment_badge: "No Payment Yet",
  reminder_badge: "No Reminder Scheduled",
};

export async function handleMemberDashboardRequest(req, env) {
  const url = new URL(req.url);
  const path = url.pathname;

  const tokenResult = await readDashboardToken(url, env);
  if (!tokenResult.ok) {
    return dashboardErrorResponse(tokenResult.error);
  }

  try {
    const context = await resolveMemberContext(env, tokenResult.token_payload);
    const collections = await fetchDashboardCollections(env, context);

    if (path === "/api/member/dashboard") {
      return json(buildDashboardPayload(context, collections, tokenResult.meta));
    }

    if (path === "/api/member/session/next") {
      return json(buildNextSessionPayload(collections, tokenResult.meta));
    }

    if (path === "/api/member/payments/summary") {
      return json(buildPaymentSummaryPayload(collections, tokenResult.meta));
    }

    return dashboardErrorResponse(makeDashboardError("not_found", "Route not found.", 404, false));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error || "internal_error");
    const code = message.includes("missing_airtable_env") ? "upstream_unavailable" : "internal_error";
    const status = code === "upstream_unavailable" ? 503 : 500;
    return dashboardErrorResponse(makeDashboardError(code, message, status, code === "upstream_unavailable"));
  }
}

export async function mintMemberDashboardToken(body, env) {
  const payload = {
    kind: "customer_invite",
    role: "customer",
    lane: "customer_onboarding",
    invite_id: `dash_${crypto.randomUUID().replace(/-/g, "")}`,
    username: slugify(firstNonEmpty(body?.username, body?.display_name, "member")),
    mmd_client_name: firstNonEmpty(body?.display_name, body?.full_name, "Member Dashboard"),
    nickname: slugify(firstNonEmpty(body?.nickname, body?.display_name, "member")),
    suffix_code: slugify(firstNonEmpty(body?.suffix_code, "qa")).slice(0, 2) || "qa",
    email: toStr(body?.email).toLowerCase(),
    line_user_id: toStr(body?.line_user_id),
    telegram_username: toStr(body?.telegram_username),
    memberstack_id: firstNonEmpty(body?.memberstack_id, body?.member_id),
    model_name: toStr(body?.model_name),
    model_record_id: toStr(body?.model_record_id),
    rules_url: toStr(body?.rules_url),
    console_url: toStr(body?.console_url),
    requires_rules_ack: false,
    requires_model_binding: false,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + Math.max(300, safeInt(body?.expires_in_seconds || 3600)),
  };

  const secret = getDashboardSecret(env);
  const token = await signTwoPartToken(payload, secret);

  return {
    ok: true,
    token,
    expires_at: new Date(payload.exp * 1000).toISOString(),
    payload,
    urls: {
      dashboard: `/api/member/dashboard?t=${encodeURIComponent(token)}`,
      next_session: `/api/member/session/next?t=${encodeURIComponent(token)}`,
      payments_summary: `/api/member/payments/summary?t=${encodeURIComponent(token)}`,
    },
  };
}

async function readDashboardToken(url, env) {
  const requestId = newRequestId();
  const meta = buildMeta(requestId);
  const token = toStr(url.searchParams.get("t"));
  if (!token) {
    return {
      ok: false,
      error: makeDashboardError("token_missing", "Missing dashboard token.", 400, false, meta),
    };
  }

  const twoPartToken = await tryReadSignedToken(token, env);
  if (twoPartToken.ok) {
    return {
      ok: true,
      token_payload: twoPartToken.token_payload,
      meta,
    };
  }
  if (twoPartToken.expired) {
    return {
      ok: false,
      error: makeDashboardError("token_expired", "This dashboard link has expired.", 410, false, meta),
    };
  }

  const kv = env.PAY_SESSIONS_KV || env.PAYMENTS_KV || env.KV;
  if (!kv) {
    return {
      ok: false,
      error: makeDashboardError("token_invalid", "This dashboard link is invalid.", 401, false, meta),
    };
  }

  const tokenPayload = await readTokenFromKV(kv, token);
  const expiryMs = tokenExpiryMs(tokenPayload, token);
  if (expiryMs && expiryMs <= Date.now()) {
    return {
      ok: false,
      error: makeDashboardError("token_expired", "This dashboard link has expired.", 410, false, meta),
    };
  }

  if (!tokenPayload) {
    return {
      ok: false,
      error: makeDashboardError("token_invalid", "This dashboard link is invalid.", 401, false, meta),
    };
  }

  return {
    ok: true,
    token_payload: tokenPayload,
    meta,
  };
}

async function readTokenFromKV(kv, token) {
  const parts = String(token).split(".");
  const sig = parts.length === 3 ? parts[2] : null;
  if (!sig) return null;

  const raw = await kv.get(`tok:${sig}`);
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function resolveMemberContext(env, tokenPayload) {
  const token = tokenPayload && typeof tokenPayload === "object" ? tokenPayload : {};
  const memberRecord = await findMemberRecord(env, token);

  const memberstackId =
    firstNonEmpty(
      memberRecord?.id,
      memberRecord?.memberstack_id,
      memberRecord?.member_id,
      token.memberstack_id,
      token.member_id,
    ) || "";
  const email = firstNonEmpty(memberRecord?.email, token.member_email, token.email) || "";
  const displayName =
    firstNonEmpty(
      memberRecord?.display_name,
      memberRecord?.name,
      memberRecord?.full_name,
      memberRecord?.customFields?.display_name,
      memberRecord?.customFields?.name,
      token.mmd_client_name,
      token.display_name,
      token.client_name,
      token.customer_name,
      token.name,
    ) || "MMD Member";
  const fullName =
    firstNonEmpty(
      memberRecord?.full_name,
      memberRecord?.name,
      memberRecord?.customFields?.full_name,
      token.mmd_client_name,
      token.full_name,
      token.display_name,
      displayName,
    ) || displayName;
  const username = normalizeUsername(
    firstNonEmpty(
      memberRecord?.username,
      memberRecord?.telegram_username,
      memberRecord?.customFields?.username,
      memberRecord?.customFields?.telegram_username,
      token.username,
      token.telegram_username,
    ),
  );

  return {
    token,
    memberRecord,
    memberstack_id: memberstackId,
    customer_key: firstNonEmpty(
      memberRecord?.customer_key,
      memberRecord?.customFields?.customer_key,
      token.customer_key,
    ) || "",
    member_email: email,
    display_name: displayName,
    full_name: fullName,
    username,
    tier:
      firstNonEmpty(
        memberRecord?.current_tier,
        memberRecord?.tier,
        memberRecord?.customFields?.current_tier,
        memberRecord?.customFields?.tier,
        token.base_tier,
        token.tier,
      ) || "STANDARD",
    status:
      firstNonEmpty(
        memberRecord?.membership_status,
        memberRecord?.status,
        memberRecord?.customFields?.membership_status,
        memberRecord?.customFields?.status,
        token.membership_status,
        token.status,
      ) || "ACTIVE",
    kenji_mode: firstNonEmpty(token.kenji_mode, token.kenji?.mode, memberRecord?.customFields?.kenji_mode) || "demo",
  };
}

async function findMemberRecord(env, token) {
  if (!toStr(env.MEMBERSTACK_API_KEY)) {
    return null;
  }

  const memberstackId = firstNonEmpty(token.memberstack_id, token.member_id);
  const email = firstNonEmpty(token.member_email, token.email);

  if (memberstackId) {
    const member = await dtFindMember({ memberstack_id: memberstackId }, env);
    if (member) return normalizeMemberRecord(member);
  }

  if (email) {
    const member = await dtFindMember({ email }, env);
    if (member) return normalizeMemberRecord(member);
  }

  return null;
}

function normalizeMemberRecord(record) {
  if (!record || typeof record !== "object") return null;
  const customFields = record.customFields && typeof record.customFields === "object" ? record.customFields : {};
  return { ...customFields, ...record, customFields };
}

async function fetchDashboardCollections(env, context) {
  const sessions = await fetchSessions(env, context);
  const payments = await fetchPayments(env, context);
  const points = await fetchPoints(env, context);

  return {
    sessions,
    payments,
    points,
  };
}

async function fetchSessions(env, context) {
  const identifiers = buildSessionIdentifiers(env, context);
  for (const identifier of identifiers) {
    const rows = await tryAirtableListByField(env, getSessionsTable(env), identifier.field, identifier.value, 100);
    if (rows.length) {
      return rows.map((row) => shapeSession(row, env)).filter((row) => row.session_id || row.date_ms);
    }
  }
  return [];
}

async function fetchPayments(env, context) {
  const identifiers = buildPaymentIdentifiers(context);
  for (const identifier of identifiers) {
    const rows = await tryAirtableListByField(env, getPaymentsTable(env), identifier.field, identifier.value, 100);
    if (rows.length) {
      return rows.map((row) => shapePayment(row, env));
    }
  }
  return [];
}

async function fetchPoints(env, context) {
  const identifiers = buildPointIdentifiers(context);
  for (const identifier of identifiers) {
    const rows = await tryAirtableListByField(env, getPointsTable(env), identifier.field, identifier.value, 100);
    if (rows.length) {
      return rows.map((row) => shapePoint(row));
    }
  }
  return [];
}

function buildIdentifiers(context) {
  const seen = new Set();
  const out = [];
  const push = (field, value) => {
    const clean = toStr(value);
    if (!field || !clean) return;
    const key = `${field}:${clean.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ field, value: clean });
  };

  push("customer_key", context.customer_key);
  push("member_email", context.member_email);
  push("email", context.member_email);
  push("memberstack_id", context.memberstack_id);
  return out;
}

function buildSessionIdentifiers(env, context) {
  const identifiers = buildIdentifiers(context);
  const memberstackField = toStr(env.AT_SESSIONS__MEMBERSTACK_ID);
  return identifiers.map((identifier) => {
    if (identifier.field === "memberstack_id" && memberstackField) {
      return { ...identifier, field: memberstackField };
    }
    return identifier;
  });
}

function buildPaymentIdentifiers(context) {
  return buildIdentifiers(context).filter((identifier) => identifier.field !== "memberstack_id");
}

function buildPointIdentifiers(context) {
  return buildIdentifiers(context).filter((identifier) => identifier.field !== "memberstack_id");
}

function buildDashboardPayload(context, collections, meta) {
  const points = computePoints(collections.points);
  const totalSessions = uniqueCount(collections.sessions.map((session) => session.session_id));
  const memberId = context.memberstack_id || firstNonEmpty(context.token.member_id, context.token.memberstack_id) || "";
  const username = context.username || "";
  const identity = [memberId, username].filter(Boolean).join(" · ") || memberId || context.display_name;
  const avatarLetter = firstLetter(context.display_name);

  return {
    ok: true,
    member: {
      member_id: memberId,
      display_name: context.display_name,
      full_name: context.full_name,
      username,
      identity,
      tier: uppercaseLabel(context.tier || "STANDARD"),
      status: uppercaseLabel(context.status || "ACTIVE"),
      points: points.active_points,
      avatar_letter: avatarLetter,
      total_sessions: totalSessions,
      landing_status: "Landingpage active",
      dashboard_status: "Dashboard verified",
      concierge_status: context.kenji_mode === "live" ? "Kenji AI live" : "Kenji AI ready",
    },
    kenji: {
      mode: context.kenji_mode,
    },
    meta,
  };
}

function buildNextSessionPayload(collections, meta) {
  const nextSession = findNextUpcomingSession(collections.sessions, collections.payments);
  return {
    ok: true,
    session: nextSession ? mapNextSession(nextSession) : { ...UPCOMING_SESSION_EMPTY_STATE },
    meta,
  };
}

function buildPaymentSummaryPayload(collections, meta) {
  const summary = summarizePayments(collections.sessions, collections.payments);
  return {
    ok: true,
    payments: summary,
    meta,
  };
}

function findNextUpcomingSession(sessions, payments) {
  const now = Date.now();
  const upcoming = sessions
    .filter((session) => session.date_ms && session.date_ms >= now)
    .sort((a, b) => a.date_ms - b.date_ms);

  if (!upcoming.length) return null;

  const next = upcoming[0];
  const relatedPayments = payments.filter((payment) => payment.session_id && payment.session_id === next.session_id);
  const paymentStatus = summarizeSessionPaymentStatus(relatedPayments, next.amount_total_thb);

  return {
    ...next,
    payment_status: paymentStatus.status,
    payment_badge: paymentStatus.badge,
    toast_payment: paymentStatus.toast,
    reminder_status: "pending",
    reminder_badge: "Awaiting Reminder",
    toast_reminder: "Reminder will be sent automatically.",
  };
}

function mapNextSession(session) {
  const dateIso = session.date || "";
  const date = dateIso || "";
  return {
    session_id: session.session_id || "",
    date,
    date_label: session.date_label || formatDateLabel(date),
    name: session.name || "Private Session",
    location: session.location || "Bangkok",
    venue: session.venue || "Private Venue",
    time: session.time || formatTime(date),
    meta: session.meta || buildSessionMeta(session),
    payment_status: session.payment_status || "pending",
    payment_badge: session.payment_badge || "No Payment Yet",
    reminder_status: session.reminder_status || "pending",
    reminder_badge: session.reminder_badge || "Awaiting Reminder",
    toast_payment: session.toast_payment || "Payment is pending verification.",
    toast_reminder: session.toast_reminder || "Reminder will be sent automatically.",
  };
}

function summarizePayments(sessions, payments) {
  const verifiedPayments = payments.filter(isVerifiedPayment);
  const paidAmount = verifiedPayments.reduce((sum, payment) => sum + payment.amount_thb, 0);
  const totalAmountFromSessions = sessions.reduce((sum, session) => sum + session.amount_total_thb, 0);
  const totalAmount = totalAmountFromSessions > 0 ? totalAmountFromSessions : paidAmount;
  const balanceAmount = Math.max(0, totalAmount - paidAmount);

  return {
    total_amount: totalAmount,
    paid_amount: paidAmount,
    balance_amount: balanceAmount,
    verified_payments_count: verifiedPayments.length,
    currency: "THB",
  };
}

function computePoints(points) {
  const now = Date.now();
  let active = 0;

  for (const point of points) {
    const expiry = point.expires_at ? Date.parse(point.expires_at) : 0;
    if (expiry && Number.isFinite(expiry) && expiry < now) continue;
    active += point.points_delta;
  }

  return {
    active_points: Math.max(0, active),
  };
}

function summarizeSessionPaymentStatus(payments, sessionTotal) {
  const paidAmount = payments.filter(isVerifiedPayment).reduce((sum, payment) => sum + payment.amount_thb, 0);

  if (paidAmount <= 0) {
    return {
      status: "pending",
      badge: "No Payment Yet",
      toast: "Payment is pending verification.",
    };
  }

  if (sessionTotal > 0 && paidAmount < sessionTotal) {
    return {
      status: "partial_verified",
      badge: "Deposit Verified",
      toast: "Deposit verified successfully.",
    };
  }

  return {
    status: "verified",
    badge: "Deposit Verified",
    toast: "Deposit verified successfully.",
  };
}

function isVerifiedPayment(payment) {
  return (
    VERIFIED_PAYMENT_STATUSES.has(payment.payment_status) ||
    VERIFIED_VERIFICATION_STATUSES.has(payment.verification_status)
  );
}

function shapeSession(record, env) {
  const fields = record?.fields || {};
  const rawDate = firstNonEmpty(
    atVal(fields, env.AT_SESSIONS__SERVICE_DATE),
    atVal(fields, "service_date"),
    atVal(fields, "job_date"),
    atVal(fields, "Date"),
    atVal(fields, "Service Date"),
  );
  const date = normalizeDate(rawDate);
  return {
    session_id: firstNonEmpty(
      atVal(fields, env.AT_SESSIONS__SESSION_ID),
      atVal(fields, "session_id"),
      atVal(fields, "Session ID"),
      record?.id,
    ) || "",
    date,
    date_ms: date ? Date.parse(date) : 0,
    date_label: formatDateLabel(date),
    name: firstNonEmpty(
      atVal(fields, "session_name"),
      atVal(fields, "job_name"),
      atVal(fields, "name"),
      atVal(fields, "Work Type"),
      atVal(fields, "work_type"),
      atVal(fields, env.AT_SESSIONS__PACKAGE_CODE),
      atVal(fields, "package_code"),
    ) || "Private Session",
    location: firstNonEmpty(atVal(fields, "location"), atVal(fields, "city")) || "Bangkok",
    venue: firstNonEmpty(atVal(fields, "venue"), atVal(fields, "hotel"), atVal(fields, "place")) || "Private Venue",
    time: formatTime(date),
    meta: "",
    work_type: firstNonEmpty(
      atVal(fields, "work_type"),
      atVal(fields, "job_type"),
      atVal(fields, "Work Type"),
      atVal(fields, "Job Type"),
      atVal(fields, env.AT_SESSIONS__PACKAGE_CODE),
      atVal(fields, "package_code"),
    ),
    model_name: firstNonEmpty(atVal(fields, "model_name"), atVal(fields, "Model Name")) || "",
    amount_total_thb: safeInt(
      firstNonEmpty(
        atVal(fields, "amount_total_thb"),
        atVal(fields, "amount_thb"),
        atVal(fields, env.AT_SESSIONS__AMOUNT_THB),
        atVal(fields, "Amount THB"),
      ),
    ),
  };
}

function shapePayment(record, env) {
  const fields = record?.fields || {};
  return {
    payment_ref: firstNonEmpty(
      atVal(fields, env.AT_PAYMENTS__PAYMENT_REF),
      atVal(fields, "payment_ref"),
      atVal(fields, "Payment Reference"),
    ) || "",
    amount_thb: safeInt(
      firstNonEmpty(
        atVal(fields, env.AT_PAYMENTS__AMOUNT),
        atVal(fields, "amount_thb"),
        atVal(fields, "Amount"),
      ),
    ),
    payment_status: toStr(
      firstNonEmpty(
        atVal(fields, env.AT_PAYMENTS__PAYMENT_STATUS),
        atVal(fields, "payment_status"),
        atVal(fields, "Payment Status"),
      ),
    ).toLowerCase(),
    verification_status: toStr(
      firstNonEmpty(
        atVal(fields, env.AT_PAYMENTS__VERIFICATION_STATUS),
        atVal(fields, "verification_status"),
        atVal(fields, "Verification Status"),
      ),
    ).toLowerCase(),
    session_id: firstNonEmpty(
      atVal(fields, env.AT_PAYMENTS__SESSION_ID),
      atVal(fields, "session_id"),
      atVal(fields, "Session ID"),
    ) || "",
  };
}

function shapePoint(record) {
  const fields = record?.fields || {};
  return {
    points_delta: safeInt(firstNonEmpty(atVal(fields, "points"), atVal(fields, "Points"))),
    expires_at: normalizeDate(firstNonEmpty(atVal(fields, "expires_at"), atVal(fields, "Expires At"))),
  };
}

async function airtableListByField(env, tableName, fieldName, fieldValue, maxRecords) {
  if (!env.AIRTABLE_API_KEY || !env.AIRTABLE_BASE_ID) {
    throw new Error("missing_airtable_env");
  }

  const params = new URLSearchParams();
  params.set("maxRecords", String(maxRecords || 100));
  params.set("filterByFormula", `{${fieldName}}='${encodeFormulaValue(fieldValue)}'`);

  const res = await fetch(
    `${AIRTABLE_API}/${env.AIRTABLE_BASE_ID}/${encodeURIComponent(tableName)}?${params.toString()}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${env.AIRTABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
    },
  );

  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`airtable_list_error_${res.status}:${JSON.stringify(payload)}`);
  }

  return Array.isArray(payload?.records) ? payload.records : [];
}

async function tryAirtableListByField(env, tableName, fieldName, fieldValue, maxRecords) {
  try {
    return await airtableListByField(env, tableName, fieldName, fieldValue, maxRecords);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error || "");
    if (
      message.includes("INVALID_FILTER_BY_FORMULA") ||
      message.includes("Unknown field names") ||
      message.includes("INVALID_PERMISSIONS_OR_MODEL_NOT_FOUND")
    ) {
      return [];
    }
    throw error;
  }
}

async function tryReadSignedToken(token, env) {
  const secret = getDashboardSecret(env);
  if (!secret) return { ok: false, expired: false };

  const parts = String(token).split(".");
  if (parts.length !== 2) return { ok: false, expired: false };

  try {
    const payload = await verifyTwoPartToken(token, secret);
    return { ok: true, token_payload: payload, expired: false };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error || "");
    if (message === "expired_invite_token") {
      return { ok: false, expired: true };
    }
    return { ok: false, expired: false };
  }
}

function getSessionsTable(env) {
  return env.AIRTABLE_TABLE_SESSIONS_ID || env.AIRTABLE_TABLE_SESSIONS || "Sessions";
}

function getPaymentsTable(env) {
  return env.AIRTABLE_TABLE_PAYMENTS_ID || env.AIRTABLE_TABLE_PAYMENTS || "payments";
}

function getPointsTable(env) {
  return env.AIRTABLE_TABLE_POINTS_LEDGER_ID || env.AIRTABLE_TABLE_POINTS_LEDGER || "points_ledger";
}

function tokenExpiryMs(tokenPayload, token) {
  const payload = tokenPayload && typeof tokenPayload === "object" ? tokenPayload : {};
  const exp = payload.exp;
  if (Number.isFinite(exp)) return Number(exp) * 1000;

  const expiresAt = firstNonEmpty(payload.expires_at, payload.customer_invite_expires_at, payload.membership_expires_at);
  if (expiresAt) {
    const expiresMs = Date.parse(expiresAt);
    if (Number.isFinite(expiresMs)) return expiresMs;
  }

  return decodeJwtExp(token);
}

function decodeJwtExp(token) {
  const parts = String(token).split(".");
  if (parts.length !== 3) return 0;

  try {
    const payload = JSON.parse(base64UrlDecode(parts[1]));
    if (Number.isFinite(payload?.exp)) return Number(payload.exp) * 1000;
  } catch {
    return 0;
  }

  return 0;
}

async function verifyTwoPartToken(token, secret) {
  const parts = String(token).split(".");
  if (parts.length !== 2) throw new Error("invalid_token_format");

  const [encodedPayload, signature] = parts;
  const expected = await signValue(encodedPayload, secret);
  if (signature !== expected) throw new Error("invalid_token_signature");

  const payload = JSON.parse(base64UrlDecode(encodedPayload));
  const now = Math.floor(Date.now() / 1000);
  if (Number(payload?.exp || 0) > 0 && Number(payload.exp) <= now) {
    throw new Error("expired_invite_token");
  }
  return payload;
}

async function signTwoPartToken(payload, secret) {
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = await signValue(encodedPayload, secret);
  return `${encodedPayload}.${signature}`;
}

async function signValue(value, secret) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function base64UrlEncode(value) {
  const bytes = new TextEncoder().encode(String(value || ""));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(input) {
  const normalized = String(input).replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  return atob(padded);
}

function getDashboardSecret(env) {
  return toStr(env.CONFIRM_KEY || env.INTERNAL_TOKEN);
}

function makeDashboardError(code, message, status, retryable, meta = buildMeta(newRequestId())) {
  return {
    ok: false,
    error: {
      code,
      message,
      status,
      retryable,
    },
    meta,
  };
}

function dashboardErrorResponse(body) {
  return json(body, body?.error?.status || 500);
}

function buildMeta(requestId) {
  return {
    request_id: requestId,
    ts: new Date().toISOString(),
  };
}

function newRequestId() {
  return `req_${crypto.randomUUID().replace(/-/g, "")}`;
}

function buildSessionMeta(session) {
  return [session.location || "Bangkok", session.venue || "Private Venue", session.time || ""]
    .filter(Boolean)
    .join(" · ");
}

function normalizeDate(value) {
  const raw = toStr(value);
  if (!raw) return "";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString();
}

function formatDateLabel(date) {
  if (!date) return "";
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Bangkok",
  })
    .format(parsed)
    .toUpperCase();
}

function formatTime(date) {
  if (!date) return "";
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Bangkok",
  }).format(parsed);
}

function uppercaseLabel(value) {
  return toStr(value).replace(/_/g, " ").trim().toUpperCase();
}

function normalizeUsername(value) {
  const raw = toStr(value);
  if (!raw) return "";
  return raw.startsWith("@") ? raw : `@${raw}`;
}

function firstLetter(value) {
  const raw = toStr(value);
  return raw ? raw[0].toUpperCase() : "M";
}

function slugify(value) {
  return toStr(value)
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");
}

function uniqueCount(values) {
  return new Set(values.filter(Boolean)).size;
}

function safeInt(value) {
  const num = Number(value || 0);
  return Number.isFinite(num) ? Math.round(num) : 0;
}

function atVal(obj, key) {
  if (!obj || !key) return "";
  return Object.prototype.hasOwnProperty.call(obj, key) ? obj[key] : "";
}

function firstNonEmpty(...values) {
  for (const value of values) {
    const clean = toStr(value);
    if (clean) return clean;
  }
  return "";
}

function toStr(value) {
  return value == null ? "" : String(value).trim();
}

function encodeFormulaValue(value) {
  return String(value || "").replace(/'/g, "\\'");
}
