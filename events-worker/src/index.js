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
