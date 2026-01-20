import { buildCors, corsHeaders } from "../../lib/cors.js";
import { json, safeJson, HttpError } from "../../lib/http.js";
import { str, num, toMs, toISODate, normalizeTier } from "../../lib/util.js";
import { requireConfirmKey } from "../../lib/guard.js";
import { verifyTurnstile } from "../../lib/turnstile.js";
import { telegramNotify } from "../../lib/telegram.js";
import {
  dtFindMember,
  dtCreateRecord,
  dtUpdateRecord,
  dtFindPackageByCodeOrTier,
  membersTableId,
  memberPackagesTableId,
} from "../../lib/memberstack_dt.js";

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
        return json({ ok: true, lock: "v2026-LOCK-01i", worker: "payments" }, 200, corsHeaders(cors));
      }

      if (path === "/v1/payments/notify" && req.method === "POST") {
        const body = await safeJson(req);
        if (!body) return json({ ok: false, error: "invalid_json" }, 400, corsHeaders(cors));
        return await handlePaymentsNotify(req, body, env, cors);
      }

      return json({ ok: false, error: "not_found" }, 404, corsHeaders(cors));
    } catch (err) {
      if (err instanceof HttpError) return json(err.body, err.status, corsHeaders(cors));
      return json({ ok: false, error: "server_error", detail: String(err?.message || err) }, 500, corsHeaders(cors));
    }
  },
};

function normalizePayload(body, pagePath) {
  const src = String(body?.source || "").toLowerCase().trim();
  const p = String(pagePath || "").toLowerCase().trim();

  const isConfirm =
    src === "confirm" ||
    p.startsWith("/confirm/") ||
    p.includes("payment-confirmation") ||
    p.includes("/v1/payments/confirm");

  const flow = isConfirm ? "confirm" : "membership";
  return { ...body, flow };
}

async function handlePaymentsNotify(req, body, env, cors) {
  const page = str(body.page || "");
  const normalized = normalizePayload(body, page);

  // membership requires turnstile
  if (normalized.flow === "membership") {
    const token = str(body.turnstile_token);
    if (!token) return json({ ok: false, error: "missing_turnstile_token" }, 400, corsHeaders(cors));
    if (!env.TURNSTILE_SECRET) return json({ ok: false, error: "missing_env_turnstile_secret" }, 500, corsHeaders(cors));

    const ip = req.headers.get("CF-Connecting-IP") || "";
    const okTs = await verifyTurnstile(token, ip, env.TURNSTILE_SECRET);
    if (!okTs.ok) return json({ ok: false, error: "turnstile_failed", detail: okTs.detail || null }, 403, corsHeaders(cors));

    const amount = num(body.amount_thb);
    if (!amount || amount <= 0) return json({ ok: false, error: "invalid_amount_thb" }, 400, corsHeaders(cors));

    const payload = {
      flow: "membership",
      page: str(body.page || ""),
      lang: str(body.lang || "th"),
      tier: str(body.package || ""),
      amount_thb: amount,
      currency: str(body.currency || "THB"),
      payment_method: "promptpay",
      promptpay_url: str(body.promptpay_url || ""),
      promo_code: str(body.promo_code || ""),
      ref: str(body.ref || ""),
      customer: {
        name: str(body.customer_name || ""),
        email: str(body.customer_email || ""),
        member_id: str(body.member_id || ""),
      },
      anomaly_flags: Array.isArray(body.anomaly_flags) ? body.anomaly_flags.slice(0, 20) : [],
      ts: new Date().toISOString(),
    };

    const tg = await telegramNotify(payload, env);
    return json({ ok: true, mode: "membership", received: payload, telegram: tg }, 200, corsHeaders(cors));
  }

  // confirm requires confirm key
  requireConfirmKey(req, env);

  const amount = num(body.amount ?? body.amount_thb);
  if (!amount || amount <= 0) return json({ ok: false, error: "invalid_amount" }, 400, corsHeaders(cors));

  const method = str(body.payment_method || body.paymentMethod);
  if (!method) return json({ ok: false, error: "missing_payment_method" }, 400, corsHeaders(cors));

  const memberObj = body.member && typeof body.member === "object" ? body.member : {};

  const payload = {
    flow: "confirm",
    page: str(body.page || ""),
    lang: str(body.lang || "th"),
    tier: str(body.tier || body.user_role || body.userRole || ""),
    amount_thb: amount,
    currency: str(body.currency || "THB"),
    payment_method: method,
    deposit_thb: num(body.deposit),
    balance_thb: num(body.balance),
    model: str(body.model || body.model_code || body.modelCode || ""),
    intent: str(body.intent || ""),
    ref: str(body.ref || ""),
    order_id: str(body.order_id || body.orderId || ""),
    ref_code: str(body.ref_code || body.refCode || ""),
    ts: str(body.ts || new Date().toISOString()),
    member: {
      member_id: str(memberObj.member_id || body.member_id || ""),
      email: str(memberObj.email || body.customer_email || ""),
      phone: str(memberObj.phone || ""),
      name: str(memberObj.name || ""),
    },
  };

  const tg = await telegramNotify(payload, env);

  const sync = await syncConfirmToTables(payload, env).catch((e) => ({
    ok: false,
    error: "sync_failed",
    detail: String(e?.message || e),
  }));

  return json({ ok: true, mode: "confirm", received: payload, telegram: tg, sync }, 200, corsHeaders(cors));
}

async function syncConfirmToTables(p, env) {
  const msid = str(p.member?.member_id || p.member_id || "").trim();
  const email = str(p.member?.email || "").toLowerCase().trim();
  if (!msid && !email) return { ok: false, skipped: true, reason: "missing_member_identifier" };

  let memRec = await dtFindMember({ email, memberstack_id: msid }, env);

  if (!memRec?.id) {
    memRec = await dtCreateRecord(env, membersTableId(env), {
      email: email || "",
      nickname: "",
      memberstack_id: msid || "",
      tier: "guest",
      status: "active",
      source: "confirm",
      telegram_id: "",
      notes_internal: "",
      expire_at: null,
      last_payment_at: null,
      points_total: 0,
      points_365: 0,
    });
  }

  const memData = memRec.data || memRec;

  const incomingTier = normalizeTier(p.tier || "");
  const pkg = incomingTier ? await dtFindPackageByCodeOrTier(incomingTier, env) : null;

  const now = Date.now();
  const durationDays = pkg ? num((pkg.data || pkg).duration_days) : 0;

  const existingExpireMs = toMs(memData.expire_at);
  const baseMs = Math.max(now, existingExpireMs || 0);
  const newExpireMs = durationDays > 0 ? baseMs + durationDays * 86400000 : 0;

  const rate = num(env.POINTS_RATE || 1000);
  const amount = num(p.amount_thb);
  const addPts = amount > 0 ? Math.floor(amount / rate) : 0;

  const prevTotal = num(memData.points_total);
  const prev365 = num(memData.points_365);
  const nextTotal = prevTotal + addPts;
  const next365 = prev365 + addPts;

  const patch = {
    last_payment_at: toISODate(p.ts || new Date()),
    points_total: nextTotal,
    points_365: next365,
  };

  // NO VIP/SVIP/Blackcard auto-approve
  if (incomingTier && !["vip", "svip", "blackcard"].includes(incomingTier)) {
    patch.tier = incomingTier;
  }
  if (durationDays > 0) patch.expire_at = new Date(newExpireMs).toISOString();

  const updated = await dtUpdateRecord(memRec.id, patch, env);

  // optional member_packages relation (best-effort)
  if (env.MEMBER_PACKAGES_TABLE_ID && pkg?.id && msid) {
    const fMember = str(env.MEMBER_PACKAGES_FIELD_MEMBER || "member");
    const fPackage = str(env.MEMBER_PACKAGES_FIELD_PACKAGE || "package");
    await dtCreateRecord(env, memberPackagesTableId(env), {
      [fMember]: msid,
      [fPackage]: pkg.id,
    }).catch(() => null);
  }

  // threshold alert only
  if (addPts > 0 && next365 >= 120) {
    const threshold = next365 >= 250 ? 250 : 120;
    await telegramNotify(
      {
        flow: "points_threshold",
        tier: (patch.tier || memData.tier || ""),
        member_id: msid || memData.memberstack_id || "",
        points_total: nextTotal,
        points_threshold: threshold,
        source: "confirm",
        page: "/confirm/payment-confirmation",
        ts: new Date().toISOString(),
      },
      env
    ).catch(() => null);
  }

  return {
    ok: true,
    member_record_id: memRec.id,
    package_record_id: pkg?.id || null,
    updated_fields: Object.keys(patch),
    record: updated,
  };
}
