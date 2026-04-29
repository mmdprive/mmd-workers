/**
 * =========================================================
 * MMD Privé — payments-worker (Production / Clean)
 * =========================================================
 */

import {
  ensureCommissionRowsForSession,
  mirrorCommissionSnapshot,
  normalizeCommissionSplits,
  updateCommissionEligibilityForSession,
} from "../shared/src/lib/partner-commissions/index.js";

const LOCK = "payments-production-v10-clean";
const AIRTABLE_API = "https://api.airtable.com/v0";

/* -------------------------------------------------- */
/* basic helpers */
/* -------------------------------------------------- */
function toStr(v) {
  return v == null ? "" : String(v).trim();
}

function toNum(v) {
  const n = Number(String(v ?? "").replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : null;
}

function nowIso() {
  return new Date().toISOString();
}

function esc(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function jsonResponse(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...extraHeaders,
    },
  });
}

async function readJson(req) {
  try {
    const text = await req.text();
    if (!text) return {};
    return JSON.parse(text);
  } catch {
    return {};
  }
}

function getAllowedOrigins(env) {
  return String(env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function buildCorsHeaders(req, env) {
  const origin = req.headers.get("Origin") || "";
  const allow = getAllowedOrigins(env);
  const headers = new Headers();

  if (origin && allow.includes(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Vary", "Origin");
  }

  headers.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Internal-Token");
  headers.set("Access-Control-Max-Age", "86400");
  return headers;
}

function withCors(req, env, res) {
  const headers = new Headers(res.headers);
  const cors = buildCorsHeaders(req, env);
  cors.forEach((v, k) => headers.set(k, v));
  return new Response(res.body, {
    status: res.status,
    headers,
  });
}

function isInternalAuthed(req, env) {
  const headerToken =
    toStr(req.headers.get("X-Internal-Token")) ||
    toStr(req.headers.get("Authorization")).replace(/^Bearer\s+/i, "");

  return !!env.INTERNAL_TOKEN && headerToken === env.INTERNAL_TOKEN;
}

function hasConfirmKey(req, env) {
  const key = toStr(req.headers.get("X-Confirm-Key"));
  return !!env.CONFIRM_KEY && key === env.CONFIRM_KEY;
}

function assertRequired(value, field) {
  if (!toStr(value)) throw new Error(`${field}_required`);
  return value;
}

function ensurePositiveNumber(value, field) {
  const n = toNum(value);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`${field}_must_be_positive_number`);
  }
  return n;
}

function ensureNonNegativeNumber(value, field) {
  const n = toNum(value);
  if (!Number.isFinite(n) || n < 0) {
    throw new Error(`${field}_must_be_non_negative_number`);
  }
  return n;
}

function makePaymentRef(prefix = "pay") {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${prefix}_${Date.now().toString(36)}_${hex}`;
}

function normalizeStage(value) {
  const s = toStr(value).toLowerCase();
  const allowed = ["deposit", "final", "tips", "full", "membership"];
  if (!allowed.includes(s)) throw new Error("invalid_payment_stage");
  return s;
}

function paymentStatusFromStage(stage) {
  if (stage === "deposit") return "Deposit Paid";
  if (stage === "final") return "Paid";
  if (stage === "full") return "Paid";
  if (stage === "tips") return "Tips Paid";
  if (stage === "membership") return "Paid";
  return "Paid";
}

function computePoints(env, amountThb) {
  const rate = toNum(env.POINTS_RATE) || 100;
  return Math.max(0, Math.floor(Number(amountThb || 0) / rate));
}

function stageEligibleForPoints(stage) {
  return ["deposit", "full", "membership"].includes(stage);
}

function truthy(v) {
  return v === true || v === "true" || v === 1 || v === "1";
}

function compact(obj) {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined && v !== null && v !== "")
  );
}

function paymentMethodLabel(value) {
  const method = toStr(value).toLowerCase();
  if (method === "promptpay") return "PromptPay";
  if (method === "credit_card") return "Credit Card";
  if (method === "bank_transfer") return "Bank Transfer";
  if (method === "paypal") return "PayPal";
  return value || "PromptPay";
}

function selectLabel(value) {
  const raw = toStr(value).toLowerCase();
  if (raw === "pending") return "Pending";
  if (raw === "paid") return "Paid";
  if (raw === "verified") return "Verified";
  if (raw === "success") return "Success";
  if (raw === "manual_review") return "Manual Review";
  if (raw === "manual_slip_submitted") return "Manual Slip Submitted";
  return value || "";
}

/* -------------------------------------------------- */
/* confirm link helpers */
/* -------------------------------------------------- */
function base64UrlEncode(input) {
  const bytes = new TextEncoder().encode(String(input || ""));
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function bytesToHex(buffer) {
  return [...new Uint8Array(buffer)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function hmacSha256Hex(message, secret) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(String(secret || "")),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(String(message || "")));
  return bytesToHex(sig);
}

async function sha256Hex(text) {
  const enc = new TextEncoder();
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(String(text || "")));
  return bytesToHex(digest);
}

async function signConfirmToken(payload, secret) {
  const encoded = base64UrlEncode(JSON.stringify(payload || {}));
  const signature = await hmacSha256Hex(encoded, secret);
  return `${encoded}.${signature}`;
}

async function tokenSig(token) {
  const hex = await sha256Hex(token);
  return hex.slice(0, 24);
}

function getConfirmKey(env) {
  const key = toStr(env.CONFIRM_KEY);
  if (!key) throw new Error("missing_confirm_key");
  return key;
}

function getPayKv(env) {
  if (!env.PAY_SESSIONS_KV) throw new Error("missing_pay_sessions_kv");
  return env.PAY_SESSIONS_KV;
}

function getWebBaseUrl(env) {
  return toStr(env.WEB_BASE_URL || "https://mmdbkk.com").replace(/\/+$/, "");
}

function buildAbsoluteUrl(value, fallbackBase) {
  const raw = toStr(value);
  if (!raw) return fallbackBase;
  if (/^https?:\/\//i.test(raw)) return raw;
  return `${fallbackBase}${raw.startsWith("/") ? "" : "/"}${raw}`;
}

function combineDateAndTime(dateValue, timeValue) {
  const date = toStr(dateValue);
  const time = toStr(timeValue);
  if (!date || !time) return "";
  const normalizedTime = /^\d{2}:\d{2}$/.test(time) ? `${time}:00` : time;
  const candidate = `${date}T${normalizedTime}+07:00`;
  const parsed = new Date(candidate);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString();
}

function makeSessionId(prefix = "sess") {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${prefix}_${Date.now().toString(36)}_${hex}`;
}

async function createConfirmTokenRecord(env, token, payload) {
  const kv = getPayKv(env);
  await kv.put(`sig:${await tokenSig(token)}`, JSON.stringify(payload), {
    expirationTtl: 60 * 60 * 24 * (toNum(env.PAY_SESSIONS_TTL_DAYS) || 30),
  });
}

async function createSessionIfMissing(env, payload) {
  const existing = await findSessionBySessionId(env, payload.session_id);
  const paymentRefField = sessionField(env, "AT_SESSIONS__PAYMENT_REF", "payment_ref");
  const amountThbField = sessionField(env, "AT_SESSIONS__AMOUNT_THB", "amount_thb");
  const startAt = combineDateAndTime(payload.job_date, payload.start_time);
  const endAt = combineDateAndTime(payload.job_date, payload.end_time);

  if (existing?.id) {
    await airtablePatch(env, getSessionsTable(env), existing.id, compact({
      [paymentRefField]: payload.payment_ref,
      [amountThbField]: payload.amount_thb,
      pay_model_thb: payload.pay_model_thb,
      "Pay Model": payload.pay_model_thb,
      client_name: payload.client_name,
      model_name: payload.model_name,
      job_type: payload.job_type,
      job_date: payload.job_date,
      start_time: startAt || payload.start_time,
      end_time: endAt || payload.end_time,
      location_name: payload.location_name,
      google_map_url: payload.google_map_url,
      note: payload.note,
      notes: payload.note,
      created_at: payload.created_at,
    }));
    return { ok: true, mode: "update", record_id: existing.id };
  }

  const created = await airtableCreate(env, getSessionsTable(env), compact({
    session_id: payload.session_id,
    [paymentRefField]: payload.payment_ref,
    [amountThbField]: payload.amount_thb,
    pay_model_thb: payload.pay_model_thb,
    "Pay Model": payload.pay_model_thb,
    client_name: payload.client_name,
    model_name: payload.model_name,
    job_type: payload.job_type,
    job_date: payload.job_date,
    start_time: startAt || payload.start_time,
    end_time: endAt || payload.end_time,
    location_name: payload.location_name,
    google_map_url: payload.google_map_url,
    note: payload.note,
    notes: payload.note,
    created_at: payload.created_at || nowIso(),
  }));
  return { ok: true, mode: "create", record_id: created?.id || null };
}

/* -------------------------------------------------- */
/* telegram */
/* -------------------------------------------------- */
async function telegramSend(env, text, threadId = null) {
  const token = toStr(env.TELEGRAM_BOT_TOKEN);
  const chatId = toStr(env.TELEGRAM_CHAT_ID || "-1003546439681");
  const thread = toStr(threadId || env.TG_THREAD_CONFIRM || "61");

  if (!token) {
    return { ok: false, skipped: true, reason: "missing_telegram_bot_token" };
  }

  const body = {
    chat_id: chatId,
    text: toStr(text),
    parse_mode: "HTML",
    disable_web_page_preview: true,
  };

  if (thread) body.message_thread_id = Number(thread);

  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

/* -------------------------------------------------- */
/* airtable */
/* -------------------------------------------------- */
function getAirtableBaseId(env) {
  const baseId = toStr(env.AIRTABLE_BASE_ID);
  if (!baseId) throw new Error("missing_airtable_base_id");
  return baseId;
}

function getAirtableApiKey(env) {
  const apiKey = toStr(env.AIRTABLE_API_KEY);
  if (!apiKey) throw new Error("missing_airtable_api_key");
  return apiKey;
}

function getPaymentsTable(env) {
  return toStr(env.AIRTABLE_TABLE_PAYMENTS || "payments");
}

function getSessionsTable(env) {
  return toStr(env.AIRTABLE_TABLE_SESSIONS || "sessions");
}

function getPointsLedgerTable(env) {
  return toStr(env.AIRTABLE_TABLE_POINTS_LEDGER || "points_ledger");
}

function sessionField(env, envKey, fallback) {
  return toStr(env?.[envKey] || fallback);
}

function paymentField(env, envKey, fallback) {
  return toStr(env?.[envKey] || fallback);
}

async function airtableFetch(env, path, init = {}) {
  const apiKey = getAirtableApiKey(env);
  const baseId = getAirtableBaseId(env);

  const res = await fetch(`${AIRTABLE_API}/${baseId}/${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(`airtable_error_${res.status}:${JSON.stringify(data)}`);
  }

  return data;
}

function encodeFormulaValue(v) {
  return String(v || "").replace(/'/g, "\\'");
}

async function airtableFindFirstByFormula(env, table, formula) {
  const path = `${encodeURIComponent(table)}?maxRecords=1&filterByFormula=${encodeURIComponent(formula)}`;
  const data = await airtableFetch(env, path, { method: "GET" });
  return data?.records?.[0] || null;
}

async function airtableCreate(env, table, fields) {
  const data = await airtableFetch(env, encodeURIComponent(table), {
    method: "POST",
    body: JSON.stringify({ records: [{ fields }] }),
  });
  return data?.records?.[0] || null;
}

async function airtablePatch(env, table, recordId, fields) {
  const data = await airtableFetch(env, `${encodeURIComponent(table)}/${encodeURIComponent(recordId)}`, {
    method: "PATCH",
    body: JSON.stringify({ fields }),
  });
  return data || null;
}

async function findPaymentByPaymentRef(env, paymentRef) {
  const table = getPaymentsTable(env);
  const paymentRefField = paymentField(env, "AT_PAYMENTS__PAYMENT_REF", "Payment Reference");
  const formula = `{${paymentRefField}}='${encodeFormulaValue(paymentRef)}'`;
  return airtableFindFirstByFormula(env, table, formula);
}

async function findSuccessfulPaymentBySessionAndType(env, sessionId, stage) {
  const table = getPaymentsTable(env);
  const paymentStatusField = paymentField(env, "AT_PAYMENTS__PAYMENT_STATUS", "Payment Status");
  const formula =
    `AND(` +
    `{session_id}='${encodeFormulaValue(sessionId)}',` +
    `{payment_type}='${encodeFormulaValue(stage)}',` +
    `OR({${paymentStatusField}}='success',{${paymentStatusField}}='paid',{${paymentStatusField}}='verified')` +
    `)`;
  return airtableFindFirstByFormula(env, table, formula);
}

async function findSessionBySessionId(env, sessionId) {
  const table = getSessionsTable(env);
  const sessionIdField = sessionField(env, "AT_SESSIONS__SESSION_ID", "session_id");
  const formula = `{${sessionIdField}}='${encodeFormulaValue(sessionId)}'`;
  return airtableFindFirstByFormula(env, table, formula);
}

async function findPointLedgerByPaymentRef(env, paymentRef) {
  const table = getPointsLedgerTable(env);
  const formula = `{payment_ref}='${encodeFormulaValue(paymentRef)}'`;
  return airtableFindFirstByFormula(env, table, formula);
}

/* -------------------------------------------------- */
/* core actions */
/* -------------------------------------------------- */
async function createOrUpdatePaymentIntent(env, payload) {
  const table = getPaymentsTable(env);
  const existing = await findPaymentByPaymentRef(env, payload.payment_ref);
  const paymentRefField = paymentField(env, "AT_PAYMENTS__PAYMENT_REF", "Payment Reference");
  const amountField = paymentField(env, "AT_PAYMENTS__AMOUNT", "Amount");
  const packageCodeField = paymentField(env, "AT_PAYMENTS__PACKAGE_CODE", "Package Code");
  const createdAtField = paymentField(env, "AT_PAYMENTS__CREATED_AT", "Created At");

  const fields = compact({
    [paymentRefField]: payload.payment_ref,
    session_id: payload.session_id,
    [amountField]: payload.amount,
    [packageCodeField]: payload.package_code || "",
    [createdAtField]: payload.created_at || nowIso(),
  });

  if (existing?.id) {
    await airtablePatch(env, table, existing.id, fields);
    return { ok: true, mode: "update", record_id: existing.id };
  }

  const created = await airtableCreate(env, table, fields);
  return { ok: true, mode: "create", record_id: created?.id || null };
}

async function updateSessionFromPayment(env, payload) {
  const session = await findSessionBySessionId(env, payload.session_id);
  if (!session?.id) {
    return { ok: false, skipped: true, reason: "session_not_found" };
  }

  const nextStatus = paymentStatusFromStage(payload.stage);
  const sessionStatusField = sessionField(env, "AT_SESSIONS__STATUS", "status");
  const paymentStatusField = sessionField(env, "AT_SESSIONS__PAYMENT_STATUS", "payment_status");
  const paymentRefField = sessionField(env, "AT_SESSIONS__PAYMENT_REF", "payment_ref");
  const amountThbField = sessionField(env, "AT_SESSIONS__AMOUNT_THB", "amount_thb");

  const fields = compact({
    [sessionStatusField]: nextStatus,
    "Session Status": nextStatus,
    [paymentStatusField]: nextStatus,
    [paymentRefField]: payload.payment_ref,
    last_payment_ref: payload.payment_ref,
    [amountThbField]: payload.amount_thb,
    paid_at: payload.paid_at || nowIso(),
    receipt_url: payload.receipt_url || "",
    member_email: payload.member_email || "",
    package_code: payload.package_code || "",
    deposit_paid_at: payload.stage === "deposit" ? (payload.paid_at || nowIso()) : undefined,
    final_paid_at: payload.stage === "final" || payload.stage === "full" ? (payload.paid_at || nowIso()) : undefined,
    tips_paid_at: payload.stage === "tips" ? (payload.paid_at || nowIso()) : undefined,
  });

  await airtablePatch(env, getSessionsTable(env), session.id, fields);

  return {
    ok: true,
    session_record_id: session.id,
    status: nextStatus,
  };
}

async function awardPointsIfEligible(env, payload) {
  if (!stageEligibleForPoints(payload.stage)) {
    return { ok: true, skipped: true, reason: "stage_not_eligible" };
  }

  const existing = await findPointLedgerByPaymentRef(env, payload.payment_ref);
  if (existing?.id) {
    return { ok: true, duplicate: true, awarded: false, record_id: existing.id, points: 0 };
  }

  const points = computePoints(env, payload.amount_thb);
  if (points <= 0) {
    return { ok: true, skipped: true, reason: "points_zero", awarded: false, points: 0 };
  }

  const record = await airtableCreate(env, getPointsLedgerTable(env), {
    payment_ref: payload.payment_ref,
    session_id: payload.session_id || "",
    member_email: payload.member_email || "",
    package_code: payload.package_code || "",
    amount_thb: payload.amount_thb,
    points,
    type: "earn",
    payment_type: payload.stage,
    created_at: nowIso(),
  });

  return {
    ok: true,
    awarded: true,
    record_id: record?.id || null,
    points,
  };
}

/* -------------------------------------------------- */
/* handlers */
/* -------------------------------------------------- */
async function handlePing(req, env) {
  return withCors(
    req,
    env,
    jsonResponse({
      ok: true,
      worker: "payments-worker",
      lock: LOCK,
      ts: Date.now(),
      env: {
        airtable_base_id: toStr(env.AIRTABLE_BASE_ID),
        payments_table: getPaymentsTable(env),
        sessions_table: getSessionsTable(env),
        points_ledger_table: getPointsLedgerTable(env),
        telegram_chat_id: toStr(env.TELEGRAM_CHAT_ID || "-1003546439681"),
        tg_thread_confirm: toStr(env.TG_THREAD_CONFIRM || "61"),
        tg_thread_points: toStr(env.TG_THREAD_POINTS || "17"),
      },
    })
  );
}

async function handleVerify(req, env) {
  const body = await readJson(req);

  try {
    const session_id = toStr(assertRequired(body.session_id, "session_id"));
    const payment_stage = normalizeStage(body.payment_stage || body.payment_type || "deposit");
    const amount = ensurePositiveNumber(body.amount, "amount");
    const payment_method = toStr(body.payment_method || "promptpay");
    const member_email = toStr(body.member_email || body.email);
    const package_code = toStr(body.package_code || body.package);
    const notes = toStr(body.notes || body.note);
    const receipt_url = toStr(body.receipt_url || body.slip_url);
    const paid_at = toStr(body.paid_at || nowIso());
    const payment_ref = toStr(body.payment_ref || body.transaction_ref || makePaymentRef("pay"));
    const verify_strict = truthy(env.VERIFY_STRICT);

    const duplicateByRef = await findPaymentByPaymentRef(env, payment_ref);
    if (duplicateByRef?.id) {
      return withCors(
        req,
        env,
        jsonResponse({
          ok: true,
          duplicated: true,
          idempotent: true,
          reason: "payment_ref_already_exists",
          payment_ref,
          session_id,
          existing_record_id: duplicateByRef.id,
        })
      );
    }

    const duplicateByStage = await findSuccessfulPaymentBySessionAndType(env, session_id, payment_stage);
    if (duplicateByStage?.id && verify_strict) {
      return withCors(
        req,
        env,
        jsonResponse({
          ok: true,
          duplicated: true,
          idempotent: true,
          reason: "session_id_payment_type_already_verified",
          payment_ref,
          session_id,
          existing_record_id: duplicateByStage.id,
        })
      );
    }

    const paymentWrite = await createOrUpdatePaymentIntent(env, {
      session_id,
      payment_stage,
      amount,
      payment_method,
      member_email,
      package_code,
      notes,
      receipt_url,
      paid_at,
      payment_ref,
      payment_status: "pending",
      verification_status: "pending",
      intent_status: receipt_url ? "manual_slip_submitted" : "manual_review",
      created_at: nowIso(),
    });

    try {
      await telegramSend(
        env,
        [
          "🧾 <b>PAYMENT INTENT CREATED</b>",
          `Session: <code>${esc(session_id)}</code>`,
          `Stage: <b>${esc(payment_stage)}</b>`,
          `Amount: <b>${Number(amount || 0)} THB</b>`,
          `Payment Ref: <code>${esc(payment_ref)}</code>`,
          package_code ? `Package: <b>${esc(package_code)}</b>` : "",
          member_email ? `Member: ${esc(member_email)}` : "",
        ].filter(Boolean).join("\n"),
        env.TG_THREAD_CONFIRM || "61"
      );
    } catch (_) {}

    return withCors(
      req,
      env,
      jsonResponse({
        ok: true,
        session_id,
        payment_stage,
        payment_ref,
        amount,
        payment_method,
        payment_write: paymentWrite,
        status: "pending",
        verification_status: "pending",
      })
    );
  } catch (err) {
    return withCors(
      req,
      env,
      jsonResponse({ ok: false, error: String(err?.message || err) }, 400)
    );
  }
}

async function handleNotify(req, env) {
  if (!isInternalAuthed(req, env) && !hasConfirmKey(req, env)) {
    return withCors(req, env, jsonResponse({ ok: false, error: "unauthorized" }, 401));
  }

  const body = await readJson(req);

  try {
    const payment_ref = toStr(assertRequired(body.payment_ref || body.transaction_ref, "payment_ref"));
    const stage = normalizeStage(body.stage || body.payment_stage || body.payment_type || "deposit");
    const session_id = toStr(body.session_id);
    const amount_thb = ensurePositiveNumber(body.amount_thb || body.amount, "amount_thb");
    const member_email = toStr(body.member_email || body.email);
    const package_code = toStr(body.package_code || body.package);
    const payment_method = toStr(body.payment_method || "promptpay");
    const receipt_url = toStr(body.receipt_url || body.slip_url);
    const paid_at = toStr(body.paid_at || nowIso());
    const commissionSplits = normalizeCommissionSplits(
      body.commission_splits || body.referral_splits
    );
    const hasCommissionSplits = commissionSplits.length > 0;
    const commissionSnapshot = body.commission_snapshot || {
      session_id,
      payment_ref,
      stage,
      paid_at,
      splits: commissionSplits,
    };

    const paymentWrite = await createOrUpdatePaymentIntent(env, {
      session_id,
      payment_stage: stage,
      amount: amount_thb,
      payment_method,
      member_email,
      package_code,
      receipt_url,
      paid_at,
      payment_ref,
      payment_status: "paid",
      verification_status: "verified",
      intent_status: receipt_url ? "manual_slip_submitted" : "manual_review",
      created_at: nowIso(),
    });

    const session_updated = session_id
      ? await updateSessionFromPayment(env, {
          payment_ref,
          stage,
          session_id,
          amount_thb,
          member_email,
          package_code,
          receipt_url,
          paid_at,
        })
      : { ok: false, skipped: true, reason: "missing_session_id" };

    const points_ledger = await awardPointsIfEligible(env, {
      payment_ref,
      stage,
      session_id,
      amount_thb,
      member_email,
      package_code,
    });

    const eligibilityStatus =
      stage === "final" || stage === "full" || stage === "membership"
        ? "eligible"
        : "pending_payment";

    const commission_rows =
      session_id && hasCommissionSplits
        ? await ensureCommissionRowsForSession(env, {
            session_id,
            payment_ref,
            commission_splits: commissionSplits,
            model_id: toStr(body.model_id || body.model_record_id),
            partner_snapshot: body.partner_snapshot || null,
            referral_snapshot: body.referral_snapshot || null,
            commission_snapshot: commissionSnapshot,
            commission_group_key: body.commission_group_key || session_id,
            commission_snapshot_locked: true,
            actor: toStr(body.actor || "payments-worker"),
            source: "payments.notify",
          })
        : { ok: true, skipped: true, reason: "no_commission_splits" };

    const commission_snapshots =
      session_id && (hasCommissionSplits || body.commission_snapshot)
        ? await mirrorCommissionSnapshot(env, {
            session_id,
            partner_snapshot: body.partner_snapshot || null,
            referral_snapshot: body.referral_snapshot || null,
            commission_snapshot: commissionSnapshot,
            commission_group_key: body.commission_group_key || session_id,
            commission_snapshot_locked: true,
          })
        : { ok: true, skipped: true, reason: "no_commission_snapshot" };

    const commission_eligibility = session_id
      ? await updateCommissionEligibilityForSession(env, {
          session_id,
          payment_ref,
          eligibility_status: eligibilityStatus,
          actor: toStr(body.actor || "payments-worker"),
          eligible_at: paid_at,
        })
      : { ok: true, skipped: true, reason: "missing_session_id" };

    try {
      await telegramSend(
        env,
        [
          "✅ <b>PAYMENT NOTIFIED / PAID</b>",
          `Ref: <code>${esc(payment_ref)}</code>`,
          stage ? `Stage: <b>${esc(stage)}</b>` : "",
          session_id ? `Session: <code>${esc(session_id)}</code>` : "",
          package_code ? `Package: <b>${esc(package_code)}</b>` : "",
          amount_thb ? `Amount: <b>${Number(amount_thb)} THB</b>` : "",
          member_email ? `Member: ${esc(member_email)}` : "",
          session_updated?.ok ? "Session updated: <b>yes</b>" : "Session updated: <b>no</b>",
        ].filter(Boolean).join("\n"),
        env.TG_THREAD_CONFIRM || "61"
      );
    } catch (_) {}

    if (points_ledger && points_ledger.ok && points_ledger.awarded) {
      try {
        await telegramSend(
          env,
          [
            "🎯 <b>POINTS AWARDED</b>",
            `Ref: <code>${esc(payment_ref)}</code>`,
            `Points: <b>${Number(points_ledger.points || 0)}</b>`,
            amount_thb ? `Amount: <b>${Number(amount_thb)} THB</b>` : "",
            member_email ? `Member: ${esc(member_email)}` : "",
          ].filter(Boolean).join("\n"),
          env.TG_THREAD_POINTS || "17"
        );
      } catch (_) {}
    }

    return withCors(
      req,
      env,
      jsonResponse({
        ok: true,
        payment_ref,
        stage,
        session_id,
        amount_thb,
        payment_write: paymentWrite,
        session_updated,
        points_ledger,
        commission_rows,
        commission_snapshots,
        commission_eligibility,
      })
    );
  } catch (err) {
    return withCors(
      req,
      env,
      jsonResponse({ ok: false, error: String(err?.message || err) }, 400)
    );
  }
}

async function handleConfirmLink(req, env) {
  const body = await readJson(req);

  try {
    const session_id = toStr(body.session_id || makeSessionId("sess"));
    const client_name = toStr(assertRequired(body.client_name, "client_name"));
    const model_name = toStr(assertRequired(body.model_name, "model_name"));
    const job_type = toStr(assertRequired(body.job_type, "job_type"));
    const job_date = toStr(assertRequired(body.job_date, "job_date"));
    const start_time = toStr(assertRequired(body.start_time, "start_time"));
    const end_time = toStr(assertRequired(body.end_time, "end_time"));
    const location_name = toStr(assertRequired(body.location_name, "location_name"));
    const google_map_url = toStr(body.google_map_url);
    const amount_thb = ensurePositiveNumber(body.amount_thb || body.amount, "amount_thb");
    const pay_model_thb =
      body.pay_model_thb == null &&
      body.pay_model == null &&
      body.model_pay_thb == null &&
      body.model_pay == null
        ? undefined
        : ensureNonNegativeNumber(
            body.pay_model_thb ?? body.pay_model ?? body.model_pay_thb ?? body.model_pay,
            "pay_model_thb"
          );
    const payment_type = normalizeStage(body.payment_type || body.payment_stage || "full");
    const payment_method = toStr(body.payment_method || "promptpay");
    const note = toStr(body.note || body.notes);
    const commissionSplits = normalizeCommissionSplits(
      body.commission_splits || body.referral_splits
    );
    const hasCommissionSplits = commissionSplits.length > 0;

    const payment_ref = toStr(body.payment_ref || makePaymentRef("pay"));
    const created_at = nowIso();

    const base = getWebBaseUrl(env);
    const customerConfirmPage = buildAbsoluteUrl(body.confirm_page || "/confirm/job-confirmation", base);
    const modelConfirmPage = buildAbsoluteUrl(body.model_confirm_page || "/confirm/job-model", base);

    const confirmKey = getConfirmKey(env);

    const customerPayload = {
      kind: "customer_confirm",
      role: "customer",
      session_id,
      payment_ref,
      payment_type,
    };

    const modelPayload = {
      kind: "model_confirm",
      role: "model",
      session_id,
      payment_ref,
      payment_type,
    };

    const customer_t = await signConfirmToken(customerPayload, confirmKey);
    const model_t = await signConfirmToken(modelPayload, confirmKey);

    await createConfirmTokenRecord(env, customer_t, customerPayload);
    await createConfirmTokenRecord(env, model_t, modelPayload);

    const session_write = await createSessionIfMissing(env, {
      session_id,
      payment_ref,
      payment_type,
      payment_status: "Pending",
      status: "Pending",
      amount_thb,
      pay_model_thb,
      client_name,
      model_name,
      job_type,
      job_date,
      start_time,
      end_time,
      location_name,
      google_map_url,
      note,
      created_at,
    });

    const commissionSnapshot = hasCommissionSplits
      ? body.commission_snapshot || {
          session_id,
          payment_ref,
          created_at,
          splits: commissionSplits,
        }
      : null;

    const commission_rows = hasCommissionSplits
      ? await ensureCommissionRowsForSession(env, {
          session_id,
          payment_ref,
          commission_splits: commissionSplits,
          model_id: toStr(body.model_id || body.model_record_id),
          partner_snapshot: body.partner_snapshot || null,
          referral_snapshot: body.referral_snapshot || null,
          commission_snapshot: commissionSnapshot,
          commission_group_key: body.commission_group_key || session_id,
          commission_snapshot_locked: true,
          actor: toStr(body.actor || "payments-worker"),
          source: "payments.confirm_link",
        })
      : { ok: true, skipped: true, reason: "no_commission_splits" };

    const commission_snapshots = hasCommissionSplits
      ? await mirrorCommissionSnapshot(env, {
          session_id,
          partner_snapshot: body.partner_snapshot || null,
          referral_snapshot: body.referral_snapshot || null,
          commission_snapshot: commissionSnapshot,
          commission_group_key: body.commission_group_key || session_id,
          commission_snapshot_locked: true,
        })
      : { ok: true, skipped: true, reason: "no_commission_splits" };

    const payment_write = await createOrUpdatePaymentIntent(env, {
      session_id,
      payment_ref,
      payment_stage: payment_type,
      amount: amount_thb,
      pay_model_thb,
      payment_method,
      notes: note,
      created_at,
      payment_status: "pending",
      verification_status: "pending",
      intent_status: "manual_review",
    });

    const customer_confirmation_url = `${customerConfirmPage}?t=${encodeURIComponent(customer_t)}`;
    const model_confirmation_url = `${modelConfirmPage}?t=${encodeURIComponent(model_t)}`;

    try {
      await telegramSend(
        env,
        [
          "🔗 <b>CONFIRM LINKS CREATED</b>",
          `Session: <code>${esc(session_id)}</code>`,
          `Payment Ref: <code>${esc(payment_ref)}</code>`,
          `Client: <b>${esc(client_name)}</b>`,
          `Model: <b>${esc(model_name)}</b>`,
          `Type: <b>${esc(job_type)}</b>`,
          `Amount: <b>${Number(amount_thb)} THB</b>`,
          pay_model_thb != null ? `Pay Model: <b>${Number(pay_model_thb)} THB</b>` : "",
        ].join("\n"),
        env.TG_THREAD_CONFIRM || "61"
      );
    } catch (_) {}

    return withCors(
      req,
      env,
      jsonResponse({
        ok: true,
        session_id,
        payment_ref,
        customer_t,
        model_t,
        customer_confirmation_url,
        model_confirmation_url,
        payment_write,
        session_write,
        commission_rows,
        commission_snapshots,
      })
    );
  } catch (err) {
    return withCors(
      req,
      env,
      jsonResponse({ ok: false, error: String(err?.message || err) }, 400)
    );
  }
}

async function handlePromoValidate(req, env) {
  const body = await readJson(req);

  try {
    const amount = ensurePositiveNumber(body.amount, "amount");
    const code = toStr(body.code || body.promo_code).toUpperCase();

    const catalog = {
      SONGKRAN5: { type: "percent", value: 5, active: true },
      SONGKRAN10: { type: "percent", value: 10, active: true },
      WELCOME100: { type: "fixed", value: 100, active: true },
    };

    const promo = catalog[code];
    if (!promo?.active) {
      return withCors(
        req,
        env,
        jsonResponse({
          ok: true,
          valid: false,
          code,
          amount,
          discount_amount: 0,
          discounted_amount: amount,
        })
      );
    }

    let discount = 0;
    if (promo.type === "percent") discount = Math.floor((amount * promo.value) / 100);
    if (promo.type === "fixed") discount = Math.min(amount, promo.value);

    return withCors(
      req,
      env,
      jsonResponse({
        ok: true,
        valid: true,
        code,
        amount,
        discount_amount: discount,
        discounted_amount: Math.max(0, amount - discount),
      })
    );
  } catch (err) {
    return withCors(
      req,
      env,
      jsonResponse({ ok: false, error: String(err?.message || err) }, 400)
    );
  }
}

async function handleInternalPay(req, env) {
  if (!isInternalAuthed(req, env)) {
    return withCors(req, env, jsonResponse({ ok: false, error: "unauthorized" }, 401));
  }

  const body = await readJson(req);
  const action = toStr(body.action || body.op || body.operation).toLowerCase();

  // Compatibility route for older internal callers that expected a single
  // payment endpoint instead of the split verify/notify contract.
  if (action === "verify" || action === "intent" || action === "create_intent") {
    return handleVerify(
      new Request(req.url, {
        method: req.method,
        headers: req.headers,
        body: JSON.stringify(body),
      }),
      env
    );
  }

  if (action === "notify" || action === "confirm" || action === "paid") {
    return handleNotify(
      new Request(req.url, {
        method: req.method,
        headers: req.headers,
        body: JSON.stringify(body),
      }),
      env
    );
  }

  if (body.payment_ref || body.transaction_ref) {
    return handleNotify(
      new Request(req.url, {
        method: req.method,
        headers: req.headers,
        body: JSON.stringify(body),
      }),
      env
    );
  }

  if (body.session_id && (body.amount != null || body.amount_thb != null)) {
    return handleVerify(
      new Request(req.url, {
        method: req.method,
        headers: req.headers,
        body: JSON.stringify({
          ...body,
          amount: body.amount ?? body.amount_thb,
        }),
      }),
      env
    );
  }

  return withCors(
    req,
    env,
    jsonResponse(
      {
        ok: false,
        error: "invalid_internal_payment_request",
        hint: "Set action=verify or action=notify, or include payment_ref for notify.",
      },
      400
    )
  );
}

/* -------------------------------------------------- */
/* worker */
/* -------------------------------------------------- */
export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const path = url.pathname;
    const method = req.method.toUpperCase();

    if (method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: buildCorsHeaders(req, env),
      });
    }

    if (method === "GET" && (path === "/ping" || path === "/health")) {
      return handlePing(req, env);
    }

    if (method === "POST" && path === "/promo/validate") {
      return handlePromoValidate(req, env);
    }

    if (method === "POST" && path === "/pay/internal") {
      return handleInternalPay(req, env);
    }

    if (method === "POST" && path === "/v1/confirm/link") {
      return handleConfirmLink(req, env);
    }

    if (method === "POST" && path === "/v1/pay/verify") {
      return handleVerify(req, env);
    }

    if (method === "POST" && (path === "/v1/payments/notify" || path === "/v1/pay/notify")) {
      return handleNotify(req, env);
    }

    return withCors(req, env, jsonResponse({ ok: false, error: "not_found" }, 404));
  },
};
