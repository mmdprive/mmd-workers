// src/index.js
// =========================================================
// admin-worker — Admin API (LOCK v2026-LOCK-01)
//
// Endpoints:
//   GET  /ping
//   GET  /v1/admin/ping
//   GET  /v1/admin/stats
//   GET  /v1/admin/members/list
//   POST /v1/admin/members/update
//   POST /v1/admin/telegram/dm
//   GET  /v1/admin/models/list
//   POST /v1/admin/models/upsert
//
// + Airtable Writer (STRICT confirm-key only):
//   POST /v1/admin/console/inbox      -> writes MMD — Console Inbox (tblFHmfpB2TTrzO2e)
//   POST /v1/admin/payment/proof      -> writes MMD — Payment Proofs (tblfJfM4Sqag9zrLi)
//
// Auth (either) for /v1/admin/* in general:
//   - Authorization: Bearer <ADMIN_BEARER>
//   - X-Confirm-Key: <CONFIRM_KEY>
//
// Auth (STRICT) for writer endpoints above:
//   - X-Confirm-Key: <CONFIRM_KEY> only
//
// ENV (minimum):
//   ALLOWED_ORIGINS="https://mmdprive.com,https://mmdprive.webflow.io"
//
// Secrets:
//   ADMIN_BEARER   (wrangler secret)
//   CONFIRM_KEY    (wrangler secret)
//
// Airtable (optional but required for writer endpoints):
//   AIRTABLE_API_KEY (secret)
//   AIRTABLE_BASE_ID (var/secret)  // e.g. appsV1ILPRfIjkaYg
//
// Tables (optional overrides):
//   AIRTABLE_TABLE_MEMBERS="members" (default "members")
//   AIRTABLE_TABLE_MODELS="models"   (default "models")
//
// Table IDs (writer):
//   AIRTABLE_TABLE_CONSOLE_INBOX_ID="tblFHmfpB2TTrzO2e"   (default)
//   AIRTABLE_TABLE_PAYMENT_PROOFS_ID="tblfJfM4Sqag9zrLi"  (default)
//
// Telegram internal send (optional):
//   TELEGRAM_INTERNAL_SEND_URL="https://telegram-worker.malemodel-bkk.workers.dev/telegram/internal/send"
//   INTERNAL_TOKEN (secret)  // shared with telegram-worker
// =========================================================

import { json, safeJson } from "../lib/http.js";

const LOCK = "v2026-LOCK-01";
const AIRTABLE_API = "https://api.airtable.com/v0";

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    const path = url.pathname;
    const method = req.method.toUpperCase();

    // ---- CORS / Preflight ----
    if (method === "OPTIONS") return corsPreflight(req, env);

    // ---- Public ping ----
    if (method === "GET" && path === "/ping") {
      return withCors(
        req,
        env,
        json({ ok: true, worker: "admin-worker", lock: LOCK, ts: Date.now() })
      );
    }

    // ---- Admin routes (/v1/admin/* and /internal/admin/*) ----
    const adminPrefix = getAdminPrefix(path);
    if (adminPrefix) {
      const adminPath = path.slice(adminPrefix.length) || "/";

      // (1) Origin allowlist (recommended for browser calls)
      if (!isAllowedOrigin(req, env)) {
        return withCors(req, env, json({ ok: false, error: "origin_not_allowed" }, 403));
      }

      // (2) Writer endpoints (STRICT confirm-key only)
      if (method === "POST" && (adminPath === "/console/inbox" || adminPath === "/payment/proof")) {
        if (!isConfirmKeyAuthed(req, env)) {
          return withCors(req, env, json({ ok: false, error: "unauthorized" }, 401));
        }

        const body = await safeJson(req);

        // POST /v1/admin/console/inbox
        if (adminPath === "/console/inbox") {
          if (!env.AIRTABLE_API_KEY || !env.AIRTABLE_BASE_ID) {
            return withCors(req, env, json({ ok: false, error: "missing_airtable_env" }, 500));
          }

          const fields = {
            inbox_id: body.inbox_id || crypto.randomUUID(),
            source: body.source || "admin_console",
            intent: body.intent || "note_only",

            member_name: body.member_name || "",
            member_email: body.member_email || "",
            member_phone: body.member_phone || "",
            memberstack_id: body.memberstack_id || "",
            telegram_id: body.telegram_id || "",
            telegram_username: body.telegram_username || "",
            line_user_id: body.line_user_id || "",
            line_id: body.line_id || "",
            legacy_tags: body.legacy_tags || "",

            admin_note: body.admin_note || "",
            payload_json: body.payload_json
              ? JSON.stringify(body.payload_json)
              : JSON.stringify(body || {}),

            status: body.status || "new",
            error_message: "",
          };

          // link records if provided (record IDs)
          if (body.linked_member) fields.linked_member = [body.linked_member];
          if (body.linked_session) fields.linked_session = [body.linked_session];
          if (body.linked_payment) fields.linked_payment = [body.linked_payment];

          try {
            const rec = await airtableCreate({
              baseId: env.AIRTABLE_BASE_ID,
              tableId: env.AIRTABLE_TABLE_CONSOLE_INBOX_ID || "tblFHmfpB2TTrzO2e",
              apiKey: env.AIRTABLE_API_KEY,
              fields,
            });

            return withCors(req, env, json({ ok: true, record_id: rec.id }));
          } catch (e) {
            return withCors(req, env, json({ ok: false, error: String(e?.message || e) }, 500));
          }
        }

        // POST /v1/admin/payment/proof
        if (adminPath === "/payment/proof") {
          if (!env.AIRTABLE_API_KEY || !env.AIRTABLE_BASE_ID) {
            return withCors(req, env, json({ ok: false, error: "missing_airtable_env" }, 500));
          }

          const fields = {
            proof_id: body.proof_id || crypto.randomUUID(),
            payer_name: body.payer_name || "",
            amount_thb: Number(body.amount_thb || 0),
            paid_at: body.paid_at || null,
            channel: body.channel || "bank_transfer",
            payment_ref: body.payment_ref || "",
            slip_url: body.slip_url || "",
            note: body.note || "",
            status: body.status || "pending",
          };

          if (body.verified_at) fields.verified_at = body.verified_at;
          if (body.verified_by) fields.verified_by = body.verified_by;

          if (body.member) fields.member = [body.member];
          if (body.session) fields.session = [body.session];
          if (body.payment) fields.payment = [body.payment];

          try {
            const rec = await airtableCreate({
              baseId: env.AIRTABLE_BASE_ID,
              tableId: env.AIRTABLE_TABLE_PAYMENT_PROOFS_ID || "tblfJfM4Sqag9zrLi",
              apiKey: env.AIRTABLE_API_KEY,
              fields,
            });

            return withCors(req, env, json({ ok: true, record_id: rec.id }));
          } catch (e) {
            return withCors(req, env, json({ ok: false, error: String(e?.message || e) }, 500));
          }
        }
      }

      // (3) General admin auth (Bearer OR confirm-key)
      if (!isAuthed(req, env)) {
        return withCors(req, env, json({ ok: false, error: "unauthorized" }, 401));
      }

      // GET /{v1|internal}/admin/ping
      if (method === "GET" && adminPath === "/ping") {
        return withCors(
          req,
          env,
          json({ ok: true, admin: true, worker: "admin-worker", lock: LOCK, ts: Date.now() })
        );
      }

      // GET /{v1|internal}/admin/stats
      if (method === "GET" && adminPath === "/stats") {
        const labels = buildLastNDays(7);
        const trends = {
          labels,
          members_new: labels.map(() => 0),
          revenue_thb: labels.map(() => 0),
          payments_count: labels.map(() => 0),
          points_issued: labels.map(() => 0),
        };
        const summary = {
          total_members: 0,
          total_models: 0,
          revenue_30d_thb: 0,
        };
        return withCors(req, env, json({ ok: true, summary, trends }));
      }

      // GET /{v1|internal}/admin/members/list
      if (method === "GET" && adminPath === "/members/list") {
        const q = (url.searchParams.get("q") || "").trim();
        const limit = clampInt(url.searchParams.get("limit"), 1, 200, 50);

        const items = await airtableList(env, env.AIRTABLE_TABLE_MEMBERS || "members", {
          q,
          limit,
          matchFields: ["name", "nickname", "memberstack_id", "telegram_username", "telegram_id"],
        });

        return withCors(req, env, json({ ok: true, items }));
      }

      // POST /{v1|internal}/admin/members/update
      if (method === "POST" && adminPath === "/members/update") {
        const body = await safeJson(req);
        const out = await airtableUpdateByIdOrField(env, env.AIRTABLE_TABLE_MEMBERS || "members", body, {
          idField: "id",
          lookupField: "memberstack_id",
          patchField: "patch",
        });
        return withCors(req, env, json({ ok: true, updated: out }));
      }

      // POST /{v1|internal}/admin/telegram/dm
      if (method === "POST" && adminPath === "/telegram/dm") {
        const body = await safeJson(req);
        const r = await telegramInternalSend(env, body);
        return withCors(req, env, json({ ok: true, telegram: r }, r.ok ? 200 : 502));
      }

      // GET /{v1|internal}/admin/models/list
      if (method === "GET" && adminPath === "/models/list") {
        const q = (url.searchParams.get("q") || "").trim();
        const limit = clampInt(url.searchParams.get("limit"), 1, 200, 50);

        const items = await airtableList(env, env.AIRTABLE_TABLE_MODELS || "models", {
          q,
          limit,
          matchFields: ["name", "nickname", "telegram_username", "telegram_id", "unique_key"],
        });

        return withCors(req, env, json({ ok: true, items }));
      }

      // POST /{v1|internal}/admin/models/upsert
      if (method === "POST" && adminPath === "/models/upsert") {
        const body = await safeJson(req);
        const out = await airtableUpsertModel(env, env.AIRTABLE_TABLE_MODELS || "models", body);
        return withCors(req, env, json({ ok: true, model: out }));
      }

      // POST create-session aliases (v1 + internal)
      if (
        method === "POST" &&
        (adminPath === "/job/create" ||
          adminPath === "/jobs/create-session" ||
          adminPath === "/create-session")
      ) {
        const body = await safeJson(req);
        const out = await createAdminSession(env, body);
        const status = out.ok ? 200 : out.status || 400;
        return withCors(req, env, json(out, status));
      }

      return withCors(req, env, json({ ok: false, error: "not_found" }, 404));
    }

    return withCors(req, env, json({ ok: false, error: "not_found" }, 404));
  },
};

function getAdminPrefix(path) {
  if (path.startsWith("/v1/admin/")) return "/v1/admin";
  if (path.startsWith("/internal/admin/")) return "/internal/admin";
  return "";
}

/* =========================
   CORS
========================= */
function getAllowedOrigins(env) {
  const raw = String(env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return new Set(raw);
}

function isAllowedOrigin(req, env) {
  const allow = getAllowedOrigins(env);
  const origin = req.headers.get("Origin") || "";

  // server-to-server / curl (no Origin) => allow
  if (!origin) return true;

  // if allowlist not configured => allow
  if (allow.size === 0) return true;

  return allow.has(origin);
}

function corsHeaders(req, env) {
  const origin = req.headers.get("Origin") || "";
  const allow = getAllowedOrigins(env);
  const h = new Headers();

  if (allow.size > 0 && allow.has(origin)) {
    h.set("Access-Control-Allow-Origin", origin);
    h.set("Vary", "Origin");
  }

  h.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  h.set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Confirm-Key");
  h.set("Access-Control-Max-Age", "86400");
  return h;
}

function corsPreflight(req, env) {
  return new Response(null, { status: 204, headers: corsHeaders(req, env) });
}

function withCors(req, env, res) {
  const h = new Headers(res.headers);
  const extra = corsHeaders(req, env);
  extra.forEach((v, k) => h.set(k, v));
  return new Response(res.body, { status: res.status, headers: h });
}

/* =========================
   Auth
========================= */
function isAuthed(req, env) {
  // Bearer
  const auth = req.headers.get("Authorization") || "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (env.ADMIN_BEARER && bearer && bearer === env.ADMIN_BEARER) return true;

  // Confirm key header (system/internal)
  const ck = (req.headers.get("X-Confirm-Key") || "").trim();
  if (env.CONFIRM_KEY && ck && ck === env.CONFIRM_KEY) return true;

  return false;
}

function isConfirmKeyAuthed(req, env) {
  const ck = (req.headers.get("X-Confirm-Key") || "").trim();
  return Boolean(env.CONFIRM_KEY && ck && ck === env.CONFIRM_KEY);
}

/* =========================
   Utils
========================= */
function clampInt(v, min, max, fallback) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

function buildLastNDays(n) {
  const out = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

/* =========================
   Admin create-session
========================= */
async function createAdminSession(env, body) {
  const required = ["memberstack_id", "model_id", "amount_thb"];
  const missing = required.filter((k) => body?.[k] == null || body?.[k] === "");
  if (missing.length) {
    return { ok: false, error: "missing_required_fields", missing, status: 400 };
  }

  const amount = Number(body.amount_thb);
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, error: "invalid_amount_thb", status: 400 };
  }

  const paymentsBaseUrl = String(env.PAYMENTS_BASE_URL || env.PAYMENTS_WORKER_BASE_URL || "").trim();
  if (!paymentsBaseUrl) {
    return { ok: false, error: "missing_payments_base_url", status: 500 };
  }
  const confirmKey = String(env.CONFIRM_KEY || "").trim();
  if (!confirmKey) {
    return { ok: false, error: "missing_confirm_key", status: 500 };
  }

  const paymentRef = String(
    body.payment_ref || body.paymentRef || `admin_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  );
  const sessionId = String(body.session_id || body.sessionId || `sess_${crypto.randomUUID()}`);

  const normalized = {
    session_id: sessionId,
    memberstack_id: String(body.memberstack_id),
    model_id: String(body.model_id),
    amount_thb: amount,
    currency: String(body.currency || "THB"),
    payment_ref: paymentRef,
    return_url: body.return_url || body.success_url || null,
    cancel_url: body.cancel_url || null,
    metadata: body.metadata && typeof body.metadata === "object" ? body.metadata : {},
  };

  const paymentsBaseWithSlash = paymentsBaseUrl.endsWith("/") ? paymentsBaseUrl : `${paymentsBaseUrl}/`;
  const linkUrl = new URL("v1/confirm/link", paymentsBaseWithSlash).toString();
  const linkPayload = {
    session_id: normalized.session_id,
    payment_ref: normalized.payment_ref,
    memberstack_id: normalized.memberstack_id,
    model_id: normalized.model_id,
    amount_thb: normalized.amount_thb,
    currency: normalized.currency,
    return_url: normalized.return_url,
    cancel_url: normalized.cancel_url,
    metadata: normalized.metadata,
  };

  const res = await fetch(linkUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Confirm-Key": confirmKey,
    },
    body: JSON.stringify(linkPayload),
  });

  const confirmData = await res.json().catch(() => ({}));
  if (!res.ok) {
    return {
      ok: false,
      error: "payments_link_failed",
      status: 502,
      payment_ref: normalized.payment_ref,
      detail: confirmData,
    };
  }

  const confirmation_url =
    confirmData.confirmation_url || confirmData.confirm_url || confirmData.url || confirmData.link || null;
  const confirmation_urls = {
    confirmation_url,
    confirm_url: confirmData.confirm_url || confirmation_url,
    short_url: confirmData.short_url || null,
  };

  return {
    ok: true,
    session_id: normalized.session_id,
    payment_ref: normalized.payment_ref,
    amount_thb: normalized.amount_thb,
    memberstack_id: normalized.memberstack_id,
    model_id: normalized.model_id,
    ...confirmation_urls,
    payments_response: confirmData,
  };
}

/* =========================
   Airtable (optional)
========================= */
async function airtableFetch(env, path, init) {
  const key = env.AIRTABLE_API_KEY;
  const base = env.AIRTABLE_BASE_ID;
  if (!key || !base) return { ok: false, error: "missing_airtable_env" };

  const url = `${AIRTABLE_API}/${base}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${key}`,
      ...(init?.headers || {}),
    },
  });

  let data = null;
  try {
    data = await res.json();
  } catch (_) {}

  if (!res.ok) return { ok: false, status: res.status, data };
  return { ok: true, data };
}

async function airtableList(env, tableName, { q = "", limit = 50, matchFields = [] } = {}) {
  if (!env.AIRTABLE_API_KEY || !env.AIRTABLE_BASE_ID) return [];

  const params = new URLSearchParams();
  params.set("pageSize", String(limit));

  if (q && matchFields.length) {
    const safe = q.replace(/"/g, '\\"');
    const ors = matchFields.map((f) => `FIND("${safe}", {${f}})`).join(",");
    params.set("filterByFormula", `OR(${ors})`);
  }

  const r = await airtableFetch(env, `/${encodeURIComponent(tableName)}?${params.toString()}`);
  if (!r.ok) return [];
  const records = r.data?.records || [];
  return records.map((rec) => ({ id: rec.id, fields: rec.fields || {}, createdTime: rec.createdTime }));
}

async function airtableFindOne(env, tableName, filterByFormula) {
  const params = new URLSearchParams();
  params.set("pageSize", "1");
  params.set("filterByFormula", filterByFormula);

  const r = await airtableFetch(env, `/${encodeURIComponent(tableName)}?${params.toString()}`);
  if (!r.ok) return null;
  const rec = r.data?.records?.[0];
  if (!rec) return null;
  return { id: rec.id, fields: rec.fields || {} };
}

async function airtablePatchById(env, tableName, id, patch) {
  const r = await airtableFetch(env, `/${encodeURIComponent(tableName)}/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fields: patch || {} }),
  });
  if (!r.ok) return { ok: false, error: "airtable_patch_failed", detail: r };
  return { ok: true, id: r.data.id, fields: r.data.fields || {} };
}

// Body format:
//   { id:"recXXXX", patch:{...} }
//   OR { memberstack_id:"...", patch:{...} }
async function airtableUpdateByIdOrField(env, tableName, body, { idField, lookupField, patchField }) {
  if (!env.AIRTABLE_API_KEY || !env.AIRTABLE_BASE_ID) {
    return { ok: false, error: "missing_airtable_env" };
  }

  const patch = body?.[patchField] && typeof body[patchField] === "object" ? body[patchField] : {};
  let id = body?.[idField] || null;

  if (!id && body?.[lookupField]) {
    const safe = String(body[lookupField]).replace(/"/g, '\\"');
    const found = await airtableFindOne(env, tableName, `{${lookupField}}="${safe}"`);
    id = found?.id || null;
  }

  if (!id) return { ok: false, error: "missing_record_id" };
  return await airtablePatchById(env, tableName, id, patch);
}

// Body format:
//   { id?: "recXXXX", unique_key?: "...", fields:{...} }
async function airtableUpsertModel(env, tableName, body) {
  if (!env.AIRTABLE_API_KEY || !env.AIRTABLE_BASE_ID) {
    return { ok: false, error: "missing_airtable_env" };
  }

  const fields = body?.fields && typeof body.fields === "object" ? body.fields : {};
  const id = body?.id || null;

  if (id) return await airtablePatchById(env, tableName, id, fields);

  if (body?.unique_key) {
    const safe = String(body.unique_key).replace(/"/g, '\\"');
    const found = await airtableFindOne(env, tableName, `{unique_key}="${safe}"`);
    if (found?.id) return await airtablePatchById(env, tableName, found.id, fields);

    const r = await airtableFetch(env, `/${encodeURIComponent(tableName)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ records: [{ fields: { ...fields, unique_key: body.unique_key } }] }),
    });
    if (!r.ok) return { ok: false, error: "airtable_create_failed", detail: r };
    const rec = r.data?.records?.[0];
    return { ok: true, id: rec?.id, fields: rec?.fields || {} };
  }

  const r = await airtableFetch(env, `/${encodeURIComponent(tableName)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ records: [{ fields }] }),
  });
  if (!r.ok) return { ok: false, error: "airtable_create_failed", detail: r };
  const rec = r.data?.records?.[0];
  return { ok: true, id: rec?.id, fields: rec?.fields || {} };
}

/* =========================
   Airtable Writer helpers
========================= */
async function airtableCreate({ baseId, tableId, apiKey, fields }) {
  const r = await fetch(`${AIRTABLE_API}/${baseId}/${tableId}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ records: [{ fields }] }),
  });

  const t = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(JSON.stringify(t));
  return t.records?.[0];
}

/* =========================
   Telegram internal send (optional)
========================= */
async function telegramInternalSend(env, payload) {
  const url = env.TELEGRAM_INTERNAL_SEND_URL;
  const token = env.INTERNAL_TOKEN;
  if (!url || !token) {
    return { ok: false, error: "missing_telegram_internal_env" };
  }

  const body = {
    chat_id: payload.chat_id,
    message_thread_id: payload.message_thread_id,
    text: payload.text,
    parse_mode: payload.parse_mode || "HTML",
    disable_web_page_preview: payload.disable_web_page_preview ?? true,
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Internal-Token": token,
    },
    body: JSON.stringify(body),
  });

  let data = null;
  try {
    data = await res.json();
  } catch (_) {}

  if (!res.ok) return { ok: false, status: res.status, data };
  return { ok: true, data };
}
