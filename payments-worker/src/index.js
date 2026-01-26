/* =========================================================
   MMD Privé — Payments Worker
   LOCK: v2026-LOCK-01p (+pay-token KV)

   Base: https://payments-worker.malemodel-bkk.workers.dev

   Routes:
     - OPTIONS /*                 (CORS preflight)
     - GET     /                  (health)
     - GET     /health            (health)
     - POST    /v1/pay/token      (internal-only) ✅ NEW
     - POST    /v1/pay/verify     (KV-first, fallback to signature) ✅ UPDATED
     - POST    /v1/payments/notify
     - POST    /v1/rules/ack

   KV (binding):
     - PAY_SESSIONS_KV            (token→payload mapping)

   ENV (vars):
     - ALLOWED_ORIGINS            "https://mmdprive.webflow.io,https://mmdprive.com,https://cot-satin-91787057.figma.site"
     - WEB_BASE_URL               "https://mmdprive.webflow.io" (optional)
     - PAY_SESSIONS_TTL_DAYS      "30" (optional; 7–30 recommended)
     - TELEGRAM_CHAT_ID           "-1003546439681"
     - TG_THREAD_CONFIRM          "61"
     - POINTS_RATE                "1000"
     - AIRTABLE_BASE_ID           "app..."
     - AIRTABLE_TABLE_PAYMENTS    "payments"
     - AIRTABLE_TABLE_POINTS_LEDGER "points_ledger" (optional)

   SECRETS:
     - CONFIRM_KEY
     - AIRTABLE_API_KEY
     - TURNSTILE_SECRET (optional)
     - TELEGRAM_BOT_TOKEN (optional)

   Token format:
     token = "v1." + base64url(JSON(payload)) + "." + base64url(HMAC_SHA256(payloadB64, CONFIRM_KEY))
========================================================= */

import { json, safeJson, HttpError } from "../lib/http.js";
import { buildCors, corsHeaders } from "../lib/cors.js";
import { requireConfirmKey } from "../lib/confirmKey.js";

// Optional: Telegram notify helper (if exists)
let telegramNotify = null;
try {
  const mod = await import("../lib/telegram.js");
  telegramNotify = mod.telegramNotify || null;
} catch (_) {
  telegramNotify = null;
}

// Optional: Turnstile helper (if exists)
let verifyTurnstile = null;
try {
  const mod = await import("../lib/turnstile.js");
  verifyTurnstile = mod.verifyTurnstile || null; // expect verifyTurnstile(token, ip, env)
} catch (_) {
  verifyTurnstile = null;
}

/* -------------------------
   Utils
-------------------------- */
function normalizeOrigin(origin) {
  return String(origin || "").trim();
}
function pickIp(req) {
  return (
    req.headers.get("CF-Connecting-IP") ||
    (req.headers.get("X-Forwarded-For") || "").split(",")[0].trim() ||
    ""
  );
}
function toStr(v) {
  return String(v ?? "").trim();
}
function toNum(v) {
  const n = Number(String(v ?? "").replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : null;
}
function wantsConfirmKey(req) {
  const key = req.headers.get("X-Confirm-Key");
  return !!(key && String(key).trim());
}

/* -------------------------
   Token helpers (v1.payload.sig)
-------------------------- */
function base64urlToUint8(b64url) {
  const b64 = String(b64url).replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4 ? "=".repeat(4 - (b64.length % 4)) : "";
  const bin = atob(b64 + pad);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}
function uint8ToBase64url(bytes) {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
async function hmacSha256Base64url(messageStr, secretStr) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secretStr),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(messageStr));
  return uint8ToBase64url(new Uint8Array(sig));
}
async function signPayloadToToken(payload, env) {
  const secret = toStr(env.CONFIRM_KEY);
  if (!secret) throw new HttpError(500, { ok: false, error: "missing_confirm_key_env" });

  const payloadJson = JSON.stringify(payload);
  const payloadB64 = uint8ToBase64url(new TextEncoder().encode(payloadJson));
  const sigB64 = await hmacSha256Base64url(payloadB64, secret);
  return `v1.${payloadB64}.${sigB64}`;
}
async function verifyTokenAndGetPayload(token, env) {
  const raw = toStr(token);
  if (!raw) return { ok: false, error: "missing_token" };

  const parts = raw.split(".");
  if (parts.length !== 3 || parts[0] !== "v1") {
    return { ok: false, error: "invalid_token_format" };
  }

  const payloadB64 = parts[1];
  const sigB64 = parts[2];

  const secret = toStr(env.CONFIRM_KEY);
  if (!secret) return { ok: false, error: "missing_confirm_key_env" };

  const expectedSig = await hmacSha256Base64url(payloadB64, secret);
  if (expectedSig !== sigB64) return { ok: false, error: "invalid_signature" };

  let payload = null;
  try {
    payload = JSON.parse(new TextDecoder().decode(base64urlToUint8(payloadB64)));
  } catch (_) {
    return { ok: false, error: "invalid_payload_json" };
  }

  // Expiry check (optional)
  const now = Date.now();
  const expMs =
    payload?.exp_ms != null ? Number(payload.exp_ms) :
    payload?.exp != null ? Number(payload.exp) * 1000 :
    null;

  if (expMs && Number.isFinite(expMs) && now > expMs) {
    return { ok: false, error: "token_expired" };
  }

  return { ok: true, payload };
}

/* -------------------------
   KV helpers (PAY_SESSIONS_KV)
-------------------------- */
function ttlSeconds(env, fallbackDays = 30) {
  const days = Number(toStr(env.PAY_SESSIONS_TTL_DAYS || fallbackDays));
  const d = Number.isFinite(days) && days > 0 ? days : fallbackDays;
  return Math.floor(d * 24 * 60 * 60);
}
function assertKv(env) {
  if (!env.PAY_SESSIONS_KV) throw new HttpError(500, { ok: false, error: "missing_kv_binding", detail: "PAY_SESSIONS_KV" });
}
async function kvPutTokenPayload(token, payload, env) {
  assertKv(env);
  const ttl = ttlSeconds(env, 30);
  const v = JSON.stringify(payload);
  await env.PAY_SESSIONS_KV.put(`tok:${token}`, v, { expirationTtl: ttl });
  if (payload?.session_id) {
    await env.PAY_SESSIONS_KV.put(`sid:${payload.session_id}`, token, { expirationTtl: ttl });
  }
  return { ok: true, ttl_seconds: ttl };
}
async function kvGetPayloadByToken(token, env) {
  if (!env.PAY_SESSIONS_KV) return null;
  const raw = await env.PAY_SESSIONS_KV.get(`tok:${toStr(token)}`);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

/* -------------------------
   Session ID
-------------------------- */
function makeSessionId(prefix = "INV") {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  const a = new Uint8Array(3); // 6 hex
  crypto.getRandomValues(a);
  const hex = [...a].map(b => b.toString(16).padStart(2, "0")).join("").toUpperCase();
  return `${prefix}-${y}${m}${day}-${hex}`;
}

/* -------------------------
   Airtable helper
-------------------------- */
async function airtableCreate({ table, fields }, env) {
  const apiKey = toStr(env.AIRTABLE_API_KEY);
  const baseId = toStr(env.AIRTABLE_BASE_ID);
  if (!apiKey || !baseId) return { ok: false, skipped: true, reason: "missing_airtable_env" };
  if (!table) return { ok: false, error: "missing_table" };

  const url = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ fields }),
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) return { ok: false, status: res.status, error: data || null };
  return { ok: true, id: data?.id || null };
}

/* =========================================================
   Worker
========================================================= */
export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    const path = url.pathname;
    const method = req.method.toUpperCase();

    // ---- CORS ----
    const origin = normalizeOrigin(req.headers.get("Origin"));
    const cors = buildCors(origin, env.ALLOWED_ORIGINS || "");
    if (method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(cors) });
    }

    try {
      // ---- Health ----
      if (method === "GET" && (path === "/" || path === "/health")) {
        return json({ ok: true, worker: "payments-worker", lock: "v2026-LOCK-01p" }, 200, corsHeaders(cors));
      }

      // =========================================================
      // 0) PAY TOKEN — /v1/pay/token (internal-only)
      // =========================================================
      if (path === "/v1/pay/token" && method === "POST") {
        // internal-only
        requireConfirmKey(req, env);

        const body = await safeJson(req);
        if (!body) return json({ ok: false, error: "invalid_json" }, 400, corsHeaders(cors));

        const session_id = toStr(body.session_id) || makeSessionId("INV");

        // exp ตาม TTL (ช่วยให้ token เช็คได้)
        const ttl = ttlSeconds(env, 30);
        const exp_ms = Date.now() + ttl * 1000;

        // payload จาก invoice (ยืดหยุ่น)
        const payload = {
          ...body,
          session_id,
          created_at: new Date().toISOString(),
          exp_ms,
        };

        const token = await signPayloadToToken(payload, env);

        // สำคัญ: mapping token→payload (KV)
        const kv = await kvPutTokenPayload(token, payload, env);

        const webBase = toStr(env.WEB_BASE_URL) || "https://mmdprive.webflow.io";
        const confirm_payment_url = `${webBase}/confirm/payment-confirmation?token=${encodeURIComponent(token)}`;

        return json({
          ok: true,
          session_id,
          token,
          confirm_payment_url,
          rules_customer_url: payload.rules_customer_url ?? null,
          model_confirm_url: payload.model_confirm_url ?? null,
          kv,
        }, 200, corsHeaders(cors));
      }

      // =========================================================
      // 1) PAY VERIFY — /v1/pay/verify (KV-first)
      // =========================================================
      if (path === "/v1/pay/verify" && method === "POST") {
        const body = await safeJson(req);
        if (!body) return json({ ok: false, error: "invalid_json" }, 400, corsHeaders(cors));

        const token = toStr(body.token);

        // 1) KV-first
        const mapped = await kvGetPayloadByToken(token, env);
        if (mapped) {
          return json({
            ok: true,
            token,
            session_id: mapped.session_id ?? null,
            amount_thb: mapped.amount_thb ?? mapped.amount_total_thb ?? null,
            package_code: mapped.package_code ?? null,
            customer_display: mapped.customer_display ?? null,
            rules_customer_url: mapped.rules_customer_url ?? null,
            model_confirm_url: mapped.model_confirm_url ?? null,
            booking: mapped.booking ?? null,
          }, 200, corsHeaders(cors));
        }

        // 2) fallback: signature verify (รองรับ token เก่า)
        const v = await verifyTokenAndGetPayload(token, env);
        if (!v.ok) return json({ ok: false, error: v.error }, 401, corsHeaders(cors));

        const p = v.payload || {};
        return json({
          ok: true,
          token,
          session_id: p.session_id ?? null,
          amount_thb: p.amount_thb ?? null,
          package_code: p.package_code ?? null,
          customer_display: p.customer_display ?? null,
          rules_customer_url: p.rules_customer_url ?? null,
          model_confirm_url: p.model_confirm_url ?? null,
          booking: p.booking ?? null,
        }, 200, corsHeaders(cors));
      }

      // =========================================================
      // 2) RULES ACK — /v1/rules/ack
      // =========================================================
      if (path === "/v1/rules/ack" && method === "POST") {
        const body = await safeJson(req);
        if (!body) return json({ ok: false, error: "invalid_json" }, 400, corsHeaders(cors));

        if (wantsConfirmKey(req)) requireConfirmKey(req, env);

        const at = await airtableCreate({
          table: env.AIRTABLE_TABLE_PAYMENTS || "payments",
          fields: {
            "Payment Reference": body.session_id ?? body.event_id ?? `rules:${crypto.randomUUID()}`,
            "Payment Date": new Date().toISOString(),
            "Verification Status": "verified",
            "Payment Intent Status": "Confirmed",
            "Event ID": body.event_id ?? null,
            "Page": body.page ?? null,
            "Notes": `rules_ack role=${body.role ?? ""} rules=${body.rules ?? ""}`,
          },
        }, env);

        return json({
          ok: true,
          accepted: true,
          role: body.role ?? null,
          rules: body.rules ?? null,
          session_id: body.session_id ?? null,
          airtable: at,
        }, 200, corsHeaders(cors));
      }

      // =========================================================
      // 3) PAYMENTS NOTIFY — /v1/payments/notify
      // =========================================================
      if (path === "/v1/payments/notify" && method === "POST") {
        const body = await safeJson(req);
        if (!body) return json({ ok: false, error: "invalid_json" }, 400, corsHeaders(cors));

        if (wantsConfirmKey(req)) requireConfirmKey(req, env);

        // Optional Turnstile
        if (toStr(env.TURNSTILE_SECRET) && verifyTurnstile && toStr(body.turnstile_token)) {
          const ip = pickIp(req);
          const ok = await verifyTurnstile(toStr(body.turnstile_token), ip, env);
          if (!ok?.ok) return json({ ok: false, error: "turnstile_failed", detail: ok }, 403, corsHeaders(cors));
        }

        const flow = toStr(body.flow).toLowerCase() || "confirm";
        const session_id = body.session_id ?? null;
        const token = body.token ?? null;

        const amount_thb = toNum(body.amount_thb ?? body.amount ?? null);
        const payment_method = toStr(body.payment_method ?? body.method ?? "");
        const ref = toStr(body.ref ?? "");
        const page = toStr(body.page ?? "");
        const event_id = body.event_id ?? null;

        const booking = body.booking ?? null;
        const ip = pickIp(req);
        const ts = body.ts || new Date().toISOString();

        const atPayments = await airtableCreate({
          table: env.AIRTABLE_TABLE_PAYMENTS || "payments",
          fields: {
            "Payment Reference": ref || session_id || event_id || `pay:${crypto.randomUUID()}`,
            "Payment Date": new Date().toISOString(),
            "Amount": amount_thb ?? 0,
            "Currency": "THB",
            "Payment Method": payment_method || "Other",
            "Payment Status": "Full Payment",
            "Verification Status": "notified",
            "Event ID": event_id ?? null,
            "Page": page || null,
            "Package Code": body.package_code ?? null,
            "Member Email": body.email ?? null,
            "Notes": JSON.stringify({
              flow, session_id, token_present: !!token, booking, ip, ts
            }),
          },
        }, env);

        let tg = { ok: false, skipped: true, reason: "telegram_disabled" };
        if (telegramNotify) {
          try {
            tg = await telegramNotify({
              ...body,
              flow,
              session_id,
              amount_thb,
              payment_method,
              ref,
              page,
              ts,
            }, env);
          } catch (e) {
            tg = { ok: false, error: "telegram_error", detail: String(e?.message || e) };
          }
        }

        return json({
          ok: true,
          received: true,
          airtable: { payments: atPayments },
          telegram: tg,
        }, 200, corsHeaders(cors));
      }

      return json({ ok: false, error: "not_found" }, 404, corsHeaders(cors));
    } catch (err) {
      if (err instanceof HttpError) return json(err.body, err.status, corsHeaders(cors));
      return json({ ok: false, error: "server_error", detail: String(err?.message || err) }, 500, corsHeaders(cors));
    }
  },
};
