import { buildCors, corsHeaders } from "../lib/cors.js";
import { json, safeJson, HttpError } from "../lib/http.js";
import { str, num } from "../lib/util.js";
import { requireConfirmKey } from "../lib/guard.js";
import { verifyTurnstile } from "../lib/turnstile.js";
import { telegramNotify } from "../lib/telegram.js";

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const path = url.pathname;

    const origin = req.headers.get("Origin") || "";
    const cors = buildCors(origin, env.ALLOWED_ORIGINS);

    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(cors) });
    }

    if (origin && !cors.allowOrigin) {
      return json({ ok: false, error: "origin_not_allowed" }, 403, corsHeaders(cors));
    }

    try {
      if (req.method === "GET" && (path === "/" || path === "/health")) {
        return json({ ok: true, lock: "v2026-LOCK-01i", worker: "events" }, 200, corsHeaders(cors));
      }

      if (path === "/v1/rules/ack" && req.method === "POST") {
        const body = await safeJson(req);
        if (!body) return json({ ok: false, error: "invalid_json" }, 400, corsHeaders(cors));
        return await handleRulesAck(req, body, env, cors);
      }

      if (path === "/v1/points/threshold" && req.method === "POST") {
        const body = await safeJson(req);
        if (!body) return json({ ok: false, error: "invalid_json" }, 400, corsHeaders(cors));
        return await handlePointsThreshold(req, body, env, cors);
      }


      if (path === "/v1/sessions/payment/intent" && req.method === "POST") {
        const body = await safeJson(req);
        if (!body) return json({ ok: false, error: "invalid_json" }, 400, corsHeaders(cors));
        return await handleSessionPaymentIntent(req, body, env, cors);
      }

      if (path === "/v1/sessions/tips/summary" && req.method === "POST") {
        const body = await safeJson(req);
        if (!body) return json({ ok: false, error: "invalid_json" }, 400, corsHeaders(cors));
        return await handleTipsSummary(req, body, env, cors);
      }

      return json({ ok: false, error: "not_found" }, 404, corsHeaders(cors));
    } catch (err) {
      if (err instanceof HttpError) return json(err.body, err.status, corsHeaders(cors));
      return json({ ok: false, error: "server_error", detail: String(err?.message || err) }, 500, corsHeaders(cors));
    }
  },
};

async function handleRulesAck(req, body, env, cors) {
  requireConfirmKey(req, env);

  const type = str(body.type || "");
  const okType = type === "customer_rules_ack" || type === "rules_ack";
  if (!okType) return json({ ok: false, error: "invalid_type" }, 400, corsHeaders(cors));

  const version = str(body?.rules?.version || "");
  if (!version) return json({ ok: false, error: "missing_rules_version" }, 400, corsHeaders(cors));

  const acceptedAt = str(body.accepted_at || body.acceptedAt || "");
  if (!acceptedAt) return json({ ok: false, error: "missing_accepted_at" }, 400, corsHeaders(cors));

  const token = str(body.turnstile_token || body.tsToken || "");
  if (token && env.TURNSTILE_SECRET) {
    const ip = req.headers.get("CF-Connecting-IP") || "";
    const okTs = await verifyTurnstile(token, ip, env.TURNSTILE_SECRET);
    if (!okTs.ok) return json({ ok: false, error: "turnstile_failed", detail: okTs.detail || null }, 403, corsHeaders(cors));
  }

  const memberObj = body.member && typeof body.member === "object" ? body.member : {};
  const payload = {
    flow: "confirm", // ส่งเข้า confirm thread
    rules: { url: str(body?.rules?.url || ""), version },
    page: { href: str(body?.page?.href || ""), path: str(body?.page?.path || "") },
    member: {
      member_id: str(memberObj.member_id || memberObj.id || ""),
      email: str(memberObj.email || ""),
      name: str(memberObj.name || ""),
    },
    accepted_at: acceptedAt,
    ts: new Date().toISOString(),
  };

  const tg = await telegramNotify(payload, env);
  return json({ ok: true, mode: type, received: payload, telegram: tg }, 200, corsHeaders(cors));
}

async function handlePointsThreshold(req, body, env, cors) {
  requireConfirmKey(req, env);

  const payload = {
    flow: "points_threshold",
    source: str(body.source || ""),
    order_id: str(body.order_id || body.orderId || ""),
    ref_code: str(body.ref_code || body.refCode || ""),
    member_id: str(body.member_id || body.memberId || ""),
    telegram_user_id: str(body.telegram_user_id || body.telegramUserId || ""),
    tier: str(body.tier || ""),
    points_total: num(body.points_total ?? body.pointsTotal),
    points_threshold: num(body.points_threshold ?? body.pointsThreshold),
    page: str(body.page || ""),
    href: str(body.href || ""),
    ts: str(body.ts || new Date().toISOString()),
  };

  const tg = await telegramNotify(payload, env);
  return json({ ok: true, mode: "points_threshold", received: payload, telegram: tg }, 200, corsHeaders(cors));
}



// -----------------------------
// Payments intents (deposit/final/tips) + tips tracking
// LOCK: membership ledger is NOT handled here. This worker only computes amounts and triggers payments-worker verify.
// -----------------------------

function ceilToStep(n, step) {
  const s = step > 0 ? step : 1;
  return Math.ceil(n / s) * s;
}

function computeDepositAmount(amountThb, percent, roundStep) {
  const raw = (amountThb * percent) / 100;
  return ceilToStep(raw, roundStep);
}

async function handleSessionPaymentIntent(req, body, env, cors) {
  requireConfirmKey(req, env);

  const sessionId = str(body.session_id || body.sessionId || "");
  const stage = str(body.payment_stage || body.paymentStage || "");
  if (!sessionId) return json({ ok: false, error: "missing_session_id" }, 400, corsHeaders(cors));
  if (!stage) return json({ ok: false, error: "missing_payment_stage" }, 400, corsHeaders(cors));

  const okStage = stage === "deposit" || stage === "final" || stage === "tips";
  if (!okStage) return json({ ok: false, error: "invalid_payment_stage", allowed: ["deposit","final","tips"] }, 400, corsHeaders(cors));

  // Load session (need AMOUNT_THB)
  const session = await airtableFindSessionBySessionId(sessionId, env);
  if (!session) return json({ ok: false, error: "session_not_found" }, 404, corsHeaders(cors));

  const amountThb = Number(session.fields?.[env.AT_SESSIONS__AMOUNT_THB] ?? 0);
  if (!Number.isFinite(amountThb) || amountThb <= 0) {
    return json({ ok: false, error: "invalid_session_amount", amount_thb: amountThb }, 400, corsHeaders(cors));
  }

  const depositPercent = Number(env.DEPOSIT_PERCENT || "30");
  const roundStep = Number(env.DEPOSIT_ROUND_STEP || "500");

  const depositExpected = computeDepositAmount(amountThb, depositPercent, roundStep);

  // Sum paid deposits from Payments table (best-effort)
  let depositPaidTotal = 0;
  try {
    depositPaidTotal = await airtableSumPaidForStage(sessionId, "deposit", env);
  } catch (_) {}

  let amountToPay = 0;

  if (stage === "deposit") {
    if (depositPaidTotal >= depositExpected) {
      return json({
        ok: true,
        stage,
        session_id: sessionId,
        amount_thb: amountThb,
        deposit_expected: depositExpected,
        deposit_paid_total: depositPaidTotal,
        action: "already_paid",
      }, 200, corsHeaders(cors));
    }
    amountToPay = Math.max(0, depositExpected - depositPaidTotal);
    if (amountToPay <= 0) amountToPay = depositExpected;
  }

  if (stage === "final") {
    const balance = Math.max(0, amountThb - depositPaidTotal);
    if (balance <= 0) {
      return json({
        ok: true,
        stage,
        session_id: sessionId,
        amount_thb: amountThb,
        deposit_paid_total: depositPaidTotal,
        final_due: 0,
        action: "no_balance_due",
      }, 200, corsHeaders(cors));
    }
    amountToPay = balance;
  }

  if (stage === "tips") {
    const tipsAmount = num(body.tips_amount ?? body.amount ?? body.amount_thb ?? body.amountThb);
    if (!Number.isFinite(tipsAmount) || tipsAmount <= 0) {
      return json({ ok: false, error: "invalid_tips_amount" }, 400, corsHeaders(cors));
    }
    amountToPay = tipsAmount;
  }

  const verifyPayload = {
    session_id: sessionId,
    amount_thb: amountToPay,
    payment_stage: stage,
  };

  const verify = await callPaymentsVerify(verifyPayload, env);

  const payload = {
    flow: "payment_intent",
    session_id: sessionId,
    payment_stage: stage,
    amount_thb: amountToPay,
    amount_total_thb: amountThb,
    deposit_expected: depositExpected,
    deposit_paid_total: depositPaidTotal,
    verify,
    ts: new Date().toISOString(),
  };
  const tg = await telegramNotify(payload, env);

  return json({ ok: true, intent: verifyPayload, verify, telegram: tg }, 200, corsHeaders(cors));
}

async function handleTipsSummary(req, body, env, cors) {
  requireConfirmKey(req, env);

  const sessionId = str(body.session_id || body.sessionId || "");
  if (!sessionId) return json({ ok: false, error: "missing_session_id" }, 400, corsHeaders(cors));

  const tipsPaidTotal = await airtableSumPaidForStage(sessionId, "tips", env);
  const records = await airtableListPaidForStage(sessionId, "tips", env);

  return json({
    ok: true,
    session_id: sessionId,
    tips_paid_total: tipsPaidTotal,
    tips_payments: records.map(r => ({
      id: r.id,
      payment_ref: r.fields?.[env.AT_PAYMENTS__PAYMENT_REF] || "",
      amount: r.fields?.[env.AT_PAYMENTS__AMOUNT] ?? null,
      paid_at: r.fields?.[env.AT_PAYMENTS__PAYMENT_DATE] ?? null,
    })),
  }, 200, corsHeaders(cors));
}

async function callPaymentsVerify(payload, env) {
  const base = str(env.PAYMENTS_WORKER_BASE_URL || "");
  if (!base) throw new HttpError(500, { ok: false, error: "missing_PAYMENTS_WORKER_BASE_URL" });

  const url = base.replace(/\/+$/,"") + "/v1/pay/verify";
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Confirm-Key": str(env.CONFIRM_KEY || ""),
    },
    body: JSON.stringify(payload),
  });
  const data = await safeJson(res);
  if (!res.ok) throw new HttpError(res.status, data || { ok:false, error:"payments_verify_failed" });
  return data;
}

// -----------------------------
// Airtable helpers (safe + field-id friendly)
// -----------------------------

async function airtableFetch(path, env, init = {}) {
  const baseId = str(env.AIRTABLE_BASE_ID || "");
  const apiKey = str(env.AIRTABLE_API_KEY || "");
  if (!baseId) throw new HttpError(500, { ok: false, error: "missing_AIRTABLE_BASE_ID" });
  if (!apiKey) throw new HttpError(500, { ok: false, error: "missing_AIRTABLE_API_KEY" });

  const url = "https://api.airtable.com/v0/" + baseId + "/" + path;
  const headers = new Headers(init.headers || {});
  headers.set("Authorization", "Bearer " + apiKey);
  if (!headers.get("Content-Type")) headers.set("Content-Type", "application/json");

  const res = await fetch(url, { ...init, headers });
  const data = await safeJson(res);
  if (!res.ok) throw new HttpError(res.status, data || { ok: false, error: "airtable_error" });
  return data;
}

async function airtableFindSessionBySessionId(sessionId, env) {
  const table = str(env.AIRTABLE_TABLE_SESSIONS || "");
  if (!table) throw new HttpError(500, { ok: false, error: "missing_AIRTABLE_TABLE_SESSIONS" });

  const candidates = ["session_id", "Session ID", "SESSION_ID"];
  for (const fieldName of candidates) {
    const formula = `{${fieldName}}="${sessionId}"`;
    try {
      const q = new URLSearchParams({
        filterByFormula: formula,
        maxRecords: "1",
        returnFieldsByFieldId: "true",
      });
      const data = await airtableFetch(`${table}?${q.toString()}`, env, { method: "GET" });
      const rec = Array.isArray(data.records) && data.records.length ? data.records[0] : null;
      if (rec) return rec;
    } catch (_) {}
  }

  const q = new URLSearchParams({ maxRecords: "50", returnFieldsByFieldId: "true" });
  const data = await airtableFetch(`${table}?${q.toString()}`, env, { method: "GET" });
  const sidKey = str(env.AT_SESSIONS__SESSION_ID || "");
  const rec = (data.records || []).find(r => String(r?.fields?.[sidKey] || "") === sessionId);
  return rec || null;
}

async function airtableListPaidForStage(sessionId, stage, env) {
  const table = str(env.AIRTABLE_TABLE_PAYMENTS || "");
  if (!table) throw new HttpError(500, { ok: false, error: "missing_AIRTABLE_TABLE_PAYMENTS" });

  const records = [];
  let offset = "";
  const formulas = [
    `AND({Payment Status}="paid",{Package Code}="${stage}",FIND("${sessionId}",{Notes})>0)`,
    `AND({payment_status}="paid",{package_code}="${stage}",FIND("${sessionId}",{notes})>0)`,
  ];

  for (const formula of formulas) {
    try {
      offset = "";
      records.length = 0;
      for (let i = 0; i < 3; i++) {
        const q = new URLSearchParams({
          filterByFormula: formula,
          pageSize: "100",
          returnFieldsByFieldId: "true",
        });
        if (offset) q.set("offset", offset);
        const data = await airtableFetch(`${table}?${q.toString()}`, env, { method: "GET" });
        if (Array.isArray(data.records)) records.push(...data.records);
        offset = str(data.offset || "");
        if (!offset) break;
      }
      return records;
    } catch (_) {}
  }
  return [];
}

async function airtableSumPaidForStage(sessionId, stage, env) {
  const recs = await airtableListPaidForStage(sessionId, stage, env);
  const amountKey = str(env.AT_PAYMENTS__AMOUNT || "");
  let sum = 0;
  for (const r of recs) {
    const v = Number(r?.fields?.[amountKey] ?? 0);
    if (Number.isFinite(v)) sum += v;
  }
  return sum;
}

