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
//   MEMBERSTACK_API_KEY (secret)
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
import { dtCreateRecord, dtFindMember, membersTableId } from "../lib/memberstack_dt.js";
import { handleMemberDashboardRequest, mintMemberDashboardToken } from "./memberDashboard.js";
import { MODEL_ALIAS_CANDIDATES, MODEL_MANIFEST } from "./lib/model-manifest.generated.js";
import { getDashboardCEO } from "./lib/airtable-stock.js";
import {
  enforceSingleActiveReferral,
  updateCommissionState,
} from "../../shared/src/lib/partner-commissions/index.js";

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

    if (
      method === "GET" &&
      (path === "/api/member/dashboard" ||
        path === "/api/member/session/next" ||
        path === "/api/member/payments/summary")
    ) {
      return withCors(req, env, await handleMemberDashboardRequest(req, env));
    }

    // ---- Internal admin create-session page ----
    if (
      (method === "GET" || method === "HEAD") &&
      (path === "/internal/admin/jobs/create-session" ||
        path === "/internal/admin/create-session")
    ) {
      if (!isAllowedOrigin(req, env)) {
        return withCors(req, env, json({ ok: false, error: "origin_not_allowed" }, 403));
      }
      return withCors(req, env, renderCreateSessionPage(method));
    }

    if (
      (method === "GET" || method === "HEAD") &&
      (path === "/internal/admin/notes-hub" || path === "/internal/admin/notes")
    ) {
      if (!isAllowedOrigin(req, env)) {
        return withCors(req, env, json({ ok: false, error: "origin_not_allowed" }, 403));
      }
      return withCors(req, env, renderNotesHubPage(method));
    }

    if (
      method === "POST" &&
      (path === "/internal/admin/jobs/create-session" ||
        path === "/internal/admin/create-session")
    ) {
      if (!isAllowedOrigin(req, env)) {
        return withCors(req, env, json({ ok: false, error: "origin_not_allowed" }, 403));
      }
      if (!isAuthed(req, env)) {
        return withCors(req, env, json({ ok: false, error: "unauthorized" }, 401));
      }

      const body = await safeJson(req);
      try {
        const out = await createAdminSession(env, body || {});
        return withCors(req, env, json({ ok: true, ...out }));
      } catch (error) {
        return withCors(
          req,
          env,
          json({ ok: false, error: String(error?.message || error) }, 400)
        );
      }
    }

    // ---- Admin routes ----
    if (path.startsWith("/v1/admin/")) {
      // (1) Origin allowlist (recommended for browser calls)
      if (!isAllowedOrigin(req, env)) {
        return withCors(req, env, json({ ok: false, error: "origin_not_allowed" }, 403));
      }

      // (2) Writer endpoints (STRICT confirm-key only)
      if (method === "POST" && (path === "/v1/admin/console/inbox" || path === "/v1/admin/payment/proof")) {
        if (!isConfirmKeyAuthed(req, env)) {
          return withCors(req, env, json({ ok: false, error: "unauthorized" }, 401));
        }

        const body = await safeJson(req);

        // POST /v1/admin/console/inbox
        if (path === "/v1/admin/console/inbox") {
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
        if (path === "/v1/admin/payment/proof") {
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

      // (2.5) CEO Dashboard — INTERNAL_TOKEN auth (must be before general isAuthed)
      if (method === "GET" && path === "/v1/admin/dashboard/ceo") {
        const auth = req.headers.get("Authorization") || "";
        if (!env.INTERNAL_TOKEN || auth !== `Bearer ${env.INTERNAL_TOKEN}`) {
          return withCors(req, env, json({ ok: false, error: "unauthorized" }, 401));
        }
        try {
          const result = await getDashboardCEO(env);
          return withCors(req, env, json(result));
        } catch (err) {
          return withCors(
            req,
            env,
            json({
              ok: false,
              error: "dashboard_ceo_failed",
              message: err && err.message ? err.message : String(err),
            }, 500)
          );
        }
      }

      // (3) General admin auth (Bearer OR confirm-key)
      if (!isAuthed(req, env)) {
        return withCors(req, env, json({ ok: false, error: "unauthorized" }, 401));
      }

      // GET /v1/admin/ping
      if (method === "GET" && path === "/v1/admin/ping") {
        return withCors(
          req,
          env,
          json({ ok: true, admin: true, worker: "admin-worker", lock: LOCK, ts: Date.now() })
        );
      }

      // GET /v1/admin/stats
      if (method === "GET" && path === "/v1/admin/stats") {
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

      if (method === "POST" && path === "/v1/admin/member/dashboard-test-token") {
        const body = await safeJson(req);
        return withCors(req, env, json(await mintMemberDashboardToken(body || {}, env)));
      }

      // GET /v1/admin/members/list
      if (method === "GET" && path === "/v1/admin/members/list") {
        const q = (url.searchParams.get("q") || "").trim();
        const limit = clampInt(url.searchParams.get("limit"), 1, 200, 50);

        const items = await airtableList(env, env.AIRTABLE_TABLE_MEMBERS || "members", {
          q,
          limit,
          matchFields: ["name", "nickname", "memberstack_id", "telegram_username", "telegram_id"],
        });

        return withCors(req, env, json({ ok: true, items }));
      }

      // GET /v1/admin/clients/list
      if (method === "GET" && path === "/v1/admin/clients/list") {
        const q = (url.searchParams.get("q") || "").trim();
        const limit = clampInt(url.searchParams.get("limit"), 1, 200, 50);

        const items = await airtableList(env, env.AIRTABLE_TABLE_CLIENTS || "tblVv58TCbwh5j1fS", {
          q,
          limit,
          matchFields: ["Client Name", "nickname", "memberstack_id", "line_display_name", "email", "Phone Number", "line_user_id"],
        });

        return withCors(req, env, json({ ok: true, items }));
      }

      // POST /v1/admin/members/update
      if (method === "POST" && path === "/v1/admin/members/update") {
        const body = await safeJson(req);
        const out = await airtableUpdateByIdOrField(env, env.AIRTABLE_TABLE_MEMBERS || "members", body, {
          idField: "id",
          lookupField: "memberstack_id",
          patchField: "patch",
        });
        return withCors(req, env, json({ ok: true, updated: out }));
      }

      // POST /v1/admin/members/draft
      if (method === "POST" && path === "/v1/admin/members/draft") {
        const body = await safeJson(req);
        try {
          const record = await createDraftMember(env, body || {});
          return withCors(req, env, json({ ok: true, item: record }));
        } catch (error) {
          return withCors(
            req,
            env,
            json({ ok: false, error: String(error?.message || error) }, 400)
          );
        }
      }

      // POST /v1/admin/members/promote-immigration
      if (method === "POST" && path === "/v1/admin/members/promote-immigration") {
        const body = await safeJson(req);
        try {
          const out = await promoteImmigrationMember(env, body || {});
          return withCors(req, env, json({ ok: true, data: out }));
        } catch (error) {
          return withCors(
            req,
            env,
            json({ ok: false, error: String(error?.message || error) }, 400)
          );
        }
      }

      // POST /v1/admin/telegram/dm
      if (method === "POST" && path === "/v1/admin/telegram/dm") {
        const body = await safeJson(req);
        const r = await telegramInternalSend(env, body);
        return withCors(req, env, json({ ok: true, telegram: r }, r.ok ? 200 : 502));
      }

      // POST /v1/admin/referrals/activate
      if (method === "POST" && path === "/v1/admin/referrals/activate") {
        const body = await safeJson(req);
        try {
          const result = await enforceSingleActiveReferral(env, {
            referral_id: str(body.referral_id || body.record_id),
            model_id: str(body.model_id || body.model_record_id),
            transfer_existing: Boolean(body.transfer_existing),
            actor:
              str(body.actor || body.approved_by) ||
              str(req.headers.get("X-Admin-Actor") || "") ||
              "admin-worker",
            approved_at: body.approved_at,
          });
          return withCors(req, env, json(result));
        } catch (error) {
          return withCors(
            req,
            env,
            json({ ok: false, error: String(error?.message || error) }, 409)
          );
        }
      }

      // POST /v1/admin/commissions/state
      if (method === "POST" && path === "/v1/admin/commissions/state") {
        const body = await safeJson(req);
        try {
          const result = await updateCommissionState(env, {
            commission_key: str(body.commission_key),
            action: str(body.action),
            actor:
              str(body.actor || body.approved_by || body.paid_by) ||
              str(req.headers.get("X-Admin-Actor") || "") ||
              "admin-worker",
            approved_at: body.approved_at,
            paid_at: body.paid_at,
            payout_reference: body.payout_reference,
            held_reason: body.held_reason,
            void_reason: body.void_reason,
          });
          return withCors(req, env, json(result));
        } catch (error) {
          return withCors(
            req,
            env,
            json({ ok: false, error: String(error?.message || error) }, 400)
          );
        }
      }

      // GET /v1/admin/models/list
      if (method === "GET" && path === "/v1/admin/models/list") {
        const q = (url.searchParams.get("q") || "").trim();
        const limit = clampInt(url.searchParams.get("limit"), 1, 200, 50);

        const items = await airtableList(env, env.AIRTABLE_TABLE_MODELS || "models", {
          q,
          limit,
          matchFields: ["name", "nickname", "telegram_username", "telegram_id", "unique_key"],
        });

        return withCors(req, env, json({ ok: true, items }));
      }

      // GET /v1/admin/notes/context
      if (method === "GET" && path === "/v1/admin/notes/context") {
        const clientId = str(url.searchParams.get("client_id"));
        const modelId = str(url.searchParams.get("model_id"));
        try {
          const context = await buildNotesHubContext(env, { clientId, modelId });
          return withCors(req, env, json({ ok: true, ...context }));
        } catch (error) {
          return withCors(
            req,
            env,
            json({ ok: false, error: String(error?.message || error) }, 400)
          );
        }
      }

      // POST /v1/admin/models/draft
      if (method === "POST" && path === "/v1/admin/models/draft") {
        const body = await safeJson(req);
        try {
          const record = await createDraftModel(env, body || {});
          return withCors(req, env, json({ ok: true, item: record }));
        } catch (error) {
          return withCors(
            req,
            env,
            json({ ok: false, error: String(error?.message || error) }, 400)
          );
        }
      }

      // GET|HEAD /v1/admin/jobs/create-session
      if (method === "GET" || method === "HEAD") {
        if (path === "/v1/admin/jobs/create-session") {
          return withCors(req, env, renderCreateSessionPage(method));
        }
      }

      // POST /v1/admin/jobs/create-session
      if (
        method === "POST" &&
        (path === "/v1/admin/jobs/create-session" || path === "/v1/admin/create-session")
      ) {
        const body = await safeJson(req);
        try {
          const out = await createAdminSession(env, body || {});
          return withCors(req, env, json({ ok: true, ...out }));
        } catch (error) {
          return withCors(
            req,
            env,
            json({ ok: false, error: String(error?.message || error) }, 400)
          );
        }
      }

      // POST /v1/admin/models/upsert
      if (method === "POST" && path === "/v1/admin/models/upsert") {
        const body = await safeJson(req);
        const out = await airtableUpsertModel(env, env.AIRTABLE_TABLE_MODELS || "models", body);
        return withCors(req, env, json({ ok: true, model: out }));
      }

      return withCors(req, env, json({ ok: false, error: "not_found" }, 404));
    }

    return withCors(req, env, json({ ok: false, error: "not_found" }, 404));
  },
};

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
  const requestOrigin = new URL(req.url).origin;

  // server-to-server / curl (no Origin) => allow
  if (!origin) return true;

  // same-origin browser call => allow
  if (origin === requestOrigin) return true;

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
  if (env.INTERNAL_TOKEN && bearer && bearer === env.INTERNAL_TOKEN) return true;

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

function str(value) {
  return value == null ? "" : String(value).trim();
}

function toNum(value) {
  const n = Number(String(value ?? "").replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : null;
}

function normalizeEmail(value) {
  return str(value).toLowerCase();
}

function readObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function compactObject(value) {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => {
      if (entry == null) return false;
      if (typeof entry === "string") return entry.trim().length > 0;
      return true;
    })
  );
}

function memberRecordData(record) {
  if (!record || typeof record !== "object") return {};
  const data = record.data;
  return data && typeof data === "object" && !Array.isArray(data) ? data : record;
}

function randomPassword() {
  return `Mmd!${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}aA9`;
}

function deriveMemberstackId(parts) {
  const raw = parts.map((value) => str(value)).find(Boolean) || crypto.randomUUID();
  const normalized = raw.replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return `mem_${(normalized || crypto.randomUUID().replace(/-/g, "")).slice(0, 40)}`;
}

function slugToken(value, fallback = "draft") {
  const normalized = str(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return normalized || fallback;
}

function escapeFormulaValue(value) {
  return String(value || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function normalizeLooseToken(value) {
  return str(value)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9ก-๙]+/g, "");
}

function modelManifestKeys(entry) {
  return [
    entry.working_name,
    entry.nickname,
    entry.folder_name,
    entry.folder_slug,
    entry.username,
    entry.vanity_slug,
    entry.model_id,
  ]
    .map((value) => str(value))
    .filter(Boolean);
}

function resolveModelManifestEntry(input) {
  const query = normalizeLooseToken(input);
  if (!query) return null;

  for (const alias of MODEL_ALIAS_CANDIDATES) {
    if (normalizeLooseToken(alias.alias) === query && alias.matched_model_id) {
      const byId = MODEL_MANIFEST.find((entry) => normalizeLooseToken(entry.model_id) === normalizeLooseToken(alias.matched_model_id));
      if (byId) return byId;
    }
  }

  for (const entry of MODEL_MANIFEST) {
    const keys = modelManifestKeys(entry);
    if (keys.some((value) => normalizeLooseToken(value) === query)) {
      return entry;
    }
  }

  for (const entry of MODEL_MANIFEST) {
    const keys = modelManifestKeys(entry);
    if (keys.some((value) => normalizeLooseToken(value).includes(query) || query.includes(normalizeLooseToken(value)))) {
      return entry;
    }
  }

  return null;
}

async function findExistingModelByManifest(env, tableName, entry) {
  const clauses = [
    `{unique_key}="${escapeFormulaValue(entry.model_id || "")}"`,
    `{unique_key}="${escapeFormulaValue(entry.folder_slug || "")}"`,
    `{name}="${escapeFormulaValue(entry.working_name || "")}"`,
    `{nickname}="${escapeFormulaValue(entry.nickname || "")}"`,
  ].filter((value) => !value.includes('=""'));

  if (!clauses.length) return null;
  return await airtableFindOne(env, tableName, `OR(${clauses.join(",")})`);
}

async function ensureModelFromManifest(env, tableName, entry) {
  const existing = await findExistingModelByManifest(env, tableName, entry);
  if (existing) return existing;

  const fields = compactObject({
    name: str(entry.working_name || entry.folder_name || entry.nickname),
    nickname: str(entry.nickname || entry.working_name || entry.folder_name),
    unique_key: str(entry.model_id || entry.folder_slug || entry.username || entry.vanity_slug),
  });

  return await airtableCreateRecord(env, tableName, fields);
}

async function findPromotedMember(env, { memberstackId, email }) {
  if (memberstackId) {
    const member = await dtFindMember({ memberstack_id: memberstackId }, env);
    if (member) return member;
  }

  if (email) {
    const member = await dtFindMember({ email }, env);
    if (member) return member;
  }

  return null;
}

async function promoteImmigrationMember(env, body) {
  const identity = readObject(body.identity);
  const membership = readObject(body.membership);
  const notes = readObject(body.notes);
  const payloadJson = readObject(body.payload_json);
  const promotionPolicy = readObject(body.promotion_policy);

  const requestedMemberId =
    str(identity.member_id) ||
    str(body.member_id) ||
    str(body.memberstack_id) ||
    str(payloadJson.memberstack_id);
  const email =
    normalizeEmail(payloadJson.email) ||
    normalizeEmail(payloadJson.member_email) ||
    normalizeEmail(body.email);
  const fullName =
    str(identity.full_name) ||
    str(payloadJson.display_name) ||
    str(payloadJson.name) ||
    str(payloadJson.nickname) ||
    "LINE Client";
  const phone =
    str(identity.phone) ||
    str(payloadJson.phone) ||
    str(payloadJson.member_phone);
  const lineUserId = str(identity.line_user_id) || str(payloadJson.line_user_id);
  const lineId = str(identity.line_id) || str(payloadJson.line_id);
  const currentTier = str(membership.current_tier);
  const targetTier = str(membership.target_tier);
  const requestedStatus = str(payloadJson.membership_status || payloadJson.status);
  const immigrationId = str(body.immigration_id) || str(payloadJson.immigration_id);
  const createIfMissing = promotionPolicy.create_if_missing !== false;
  const fallbackEmailLocal = deriveMemberstackId([
    lineUserId,
    lineId,
    immigrationId,
    fullName,
  ]).slice(4);
  const signupEmail = email || `${fallbackEmailLocal}@line.mmd.invalid`;

  const existing = await findPromotedMember(env, {
    memberstackId: requestedMemberId,
    email: email || requestedMemberId,
  });

  if (existing) {
    const existingData = memberRecordData(existing);
    const memberId =
      str(existingData.id) ||
      str(existingData.memberstack_id) ||
      str(existingData.member_id) ||
      requestedMemberId;

    return {
      immigration_id: immigrationId,
      member_id: memberId,
      promotion_status: "promoted",
      created_new_member: false,
      service_history_summary: str(body.service_history_summary),
      member_record_id: str(existing.id || existingData.id),
      email,
    };
  }

  if (!createIfMissing) {
    throw new Error("member_not_found");
  }

  const memberId = requestedMemberId || deriveMemberstackId([
    lineUserId,
    lineId,
    immigrationId,
    signupEmail,
    fullName,
  ]);

  const record = await dtCreateRecord(
    env,
    membersTableId(env),
    compactObject({
      email: signupEmail,
      password: randomPassword(),
      name: fullName,
      full_name: fullName,
      phone,
      line_user_id: lineUserId,
      line_id: lineId,
      source: "line",
      primary_channel: "line",
      status: requestedStatus || "active",
      tier: targetTier || currentTier || "premium",
      immigration_id: immigrationId,
      requested_memberstack_id: memberId,
      operator_summary: str(notes.operator_summary),
      notes_raw: str(notes.manual_note_raw),
    })
  );

  const createdData = memberRecordData(record);
  const createdMemberId =
    str(createdData.id) ||
    str(createdData.memberstack_id) ||
    str(createdData.member_id) ||
    memberId;

  return {
    immigration_id: immigrationId,
    member_id: createdMemberId,
    promotion_status: "promoted",
    created_new_member: true,
    service_history_summary: str(body.service_history_summary),
    member_record_id: str(createdData.id || record?.id),
    email: signupEmail,
  };
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderCreateSessionPage(method) {
  if (method === "HEAD") {
    return new Response(null, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  }

  const html = `<!doctype html>
<html lang="th">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>MMD Admin สร้างเซสชัน</title>
    <style>
      :root {
        color-scheme: dark;
        --bg: #08070a;
        --panel: rgba(19,15,24,.82);
        --line: rgba(247,240,232,.14);
        --text: #f7f0e8;
        --muted: #c4b3a7;
        --gold: #d1a66a;
        --success: #9ad7b2;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        padding: 24px;
        color: var(--text);
        background: radial-gradient(circle at top, rgba(164,91,91,.18), transparent 28%), radial-gradient(circle at bottom right, rgba(95,127,132,.12), transparent 30%), linear-gradient(180deg, #110d14 0%, #09080d 52%, #060507 100%);
        font-family: Baskerville, "Iowan Old Style", Palatino, Georgia, serif;
      }
      .shell {
        width: min(100%, 1040px);
        margin: 0 auto;
        padding: 32px;
        border: 1px solid var(--line);
        border-radius: 28px;
        background: var(--panel);
        box-shadow: 0 24px 80px rgba(0,0,0,.35);
        backdrop-filter: blur(18px);
      }
      .topbar { display:flex; justify-content:space-between; gap:16px; align-items:center; margin-bottom:24px; }
      .kicker { margin:0 0 10px; color:var(--gold); font:600 .8rem/1.2 "Avenir Next Condensed", "Gill Sans", sans-serif; letter-spacing:.24em; text-transform:uppercase; }
      h1 { margin:0; font-size:clamp(2.1rem,7vw,4rem); line-height:.95; letter-spacing:-.04em; }
      .lead { margin:16px 0 0; color:var(--muted); line-height:1.7; max-width:60ch; }
      form { display:grid; gap:18px; margin-top:28px; }
      .grid { display:grid; gap:16px; grid-template-columns:repeat(2, minmax(0,1fr)); }
      .grid-full { grid-column:1 / -1; }
      label { display:grid; gap:8px; color:var(--gold); font:600 .78rem/1.2 "Avenir Next Condensed", "Gill Sans", sans-serif; letter-spacing:.16em; text-transform:uppercase; }
      input, textarea, select { width:100%; min-height:52px; padding:14px 16px; border:1px solid var(--line); border-radius:16px; background:rgba(7,6,10,.72); color:var(--text); font:inherit; }
      textarea { min-height:110px; resize:vertical; }
      select { min-height:148px; padding:10px 12px; }
      .actions { display:flex; gap:12px; align-items:center; flex-wrap:wrap; }
      button { min-height:48px; padding:0 18px; border-radius:999px; border:1px solid rgba(209,166,106,.36); background:linear-gradient(135deg, rgba(209,166,106,.24), rgba(164,91,91,.28)); color:var(--text); font:600 .92rem/1 "Avenir Next Condensed", "Gill Sans", sans-serif; letter-spacing:.12em; text-transform:uppercase; cursor:pointer; }
      .ghost { background:transparent; }
      .status { min-height:1.2em; margin:0; color:var(--muted); }
      .status.error { color:#f2b0b0; }
      .status.success { color:var(--success); }
      .hint { margin:0; color:var(--muted); font-size:.92rem; }
      .summary-grid { display:grid; gap:14px; grid-template-columns:repeat(2, minmax(0,1fr)); margin-top:18px; }
      .summary-card { padding:16px 18px; border:1px solid var(--line); border-radius:18px; background:rgba(255,255,255,.03); }
      .summary-label { margin:0 0 8px; color:var(--gold); font:600 .74rem/1.2 "Avenir Next Condensed", "Gill Sans", sans-serif; letter-spacing:.14em; text-transform:uppercase; }
      .summary-value { margin:0; color:var(--text); line-height:1.6; white-space:pre-wrap; word-break:break-word; }
      .quick-grid { display:grid; gap:16px; grid-template-columns:minmax(0,1fr); }
      .result-block[hidden] { display:none; }
      details.advanced { margin-top:8px; border:1px solid var(--line); border-radius:20px; background:rgba(255,255,255,.02); padding:8px 16px 16px; }
      details.advanced > summary { cursor:pointer; color:var(--gold); font:600 .78rem/1.2 "Avenir Next Condensed", "Gill Sans", sans-serif; letter-spacing:.16em; text-transform:uppercase; padding:10px 0; }
      pre { overflow:auto; padding:18px; border-radius:20px; border:1px solid var(--line); background:rgba(7,6,10,.72); color:var(--text); font:.9rem/1.6 SFMono-Regular, Consolas, Menlo, monospace; }
      @media (max-width: 720px) { .grid, .summary-grid, .quick-grid { grid-template-columns:1fr; } .topbar { align-items:flex-start; flex-direction:column; } }
    </style>
  </head>
  <body>
    <main class="shell">
      <div class="topbar">
        <div>
          <p class="kicker">Internal Admin / Jobs</p>
          <h1>สร้างเซสชัน</h1>
          <p class="lead">ใส่ auth ครั้งเดียว จากนั้นพิมพ์ชื่อลูกค้า พิมพ์ชื่อโมเดล ใส่ราคา แล้วกดสร้างเซสชันได้เลย ถ้ายังไม่มี record ระบบจะสร้าง draft ให้เอง</p>
        </div>
        <button id="clearAuth" class="ghost" type="button">ล้าง Auth</button>
      </div>

      <form id="auth-form">
        <div class="grid">
          <label>Bearer Token<input id="bearer" type="password" autocomplete="off" /></label>
          <label>Confirm Key<input id="confirmKey" type="password" autocomplete="off" /></label>
        </div>
        <p class="hint">ใส่อย่างใดอย่างหนึ่งก็พอ และค่าจะถูกเก็บไว้เฉพาะ browser session นี้เท่านั้น</p>
      </form>

      <form id="create-session-form">
        <div class="grid">
          <label>ลูกค้า<input id="member_search" type="text" placeholder="ชื่อลูกค้า, nickname, memberstack id, telegram" /></label>
          <label>โมเดล<input id="model_search" type="text" placeholder="ชื่อโมเดล, nickname, telegram, unique key" /></label>
          <label id="member_results_block" class="grid-full result-block" hidden>ผลการค้นหา Member<select id="member_results" size="5"></select></label>
          <label id="model_results_block" class="grid-full result-block" hidden>ผลการค้นหา Model<select id="model_results" size="5"></select></label>
        </div>

        <div class="quick-grid">
          <label>จำนวนเงิน THB<input id="amount_thb" type="number" min="1" step="1" required /></label>
        </div>

        <input id="memberstack_id" type="hidden" />
        <input id="model_id" type="hidden" />

        <details class="advanced">
          <summary>ตัวเลือกเพิ่มเติม</summary>
          <div class="grid">
            <label>จ่ายโมเดล THB<input id="pay_model_thb" type="number" min="0" step="1" /></label>
            <label>Currency<input id="currency" type="text" value="THB" /></label>
            <label>Payment Ref<input id="payment_ref" type="text" /></label>
            <label>Session ID<input id="session_id" type="text" /></label>
            <label>Return URL<input id="return_url" type="url" /></label>
            <label>Cancel URL<input id="cancel_url" type="url" /></label>
            <label class="grid-full">Metadata JSON<textarea id="metadata" placeholder='{"source":"manual_immigrate","line_user_id":"..."}'></textarea></label>
          </div>
        </details>

        <p class="hint">ใช้งานหลักมีแค่ 3 อย่าง: พิมพ์ชื่อลูกค้า, พิมพ์ชื่อโมเดล, ใส่ราคา ถ้ายังไม่มี record ระบบจะช่วยสร้าง draft ให้เอง</p>
        <div class="actions">
          <button id="submit" type="submit">สร้างเซสชัน</button>
          <button id="copy_confirmation_url" class="ghost" type="button" disabled>คัดลอก confirmation_url</button>
          <p id="status" class="status" role="status"></p>
        </div>
      </form>

      <div class="summary-grid">
        <div class="summary-card"><p class="summary-label">Member ที่เลือก</p><p id="member_summary" class="summary-value">ยังไม่ได้เลือก member</p></div>
        <div class="summary-card"><p class="summary-label">Model ที่เลือก</p><p id="model_summary" class="summary-value">ยังไม่ได้เลือก model</p></div>
      </div>

      <pre id="result">${escapeHtml("รอการส่งข้อมูล...")}</pre>
    </main>

    <script>
      (() => {
        const KEY = "mmd_admin_create_session_auth_v1";
        const submit = document.getElementById("submit");
        const status = document.getElementById("status");
        const result = document.getElementById("result");
        const clearAuth = document.getElementById("clearAuth");
        const copyConfirmationUrlButton = document.getElementById("copy_confirmation_url");
        const memberSummary = document.getElementById("member_summary");
        const modelSummary = document.getElementById("model_summary");
        const bearer = document.getElementById("bearer");
        const confirmKey = document.getElementById("confirmKey");
        const form = document.getElementById("create-session-form");
        const memberSearch = document.getElementById("member_search");
        const modelSearch = document.getElementById("model_search");
        const memberResultsBlock = document.getElementById("member_results_block");
        const modelResultsBlock = document.getElementById("model_results_block");
        const memberResults = document.getElementById("member_results");
        const modelResults = document.getElementById("model_results");

        function setStatus(message, kind) {
          status.textContent = message || "";
          status.className = "status" + (kind ? " " + kind : "");
        }
        function setResult(payload) {
          result.textContent = typeof payload === "string" ? payload : JSON.stringify(payload, null, 2);
        }
        function setSelectionSummary(target, lines) {
          target.textContent = Array.isArray(lines) && lines.length ? lines.filter(Boolean).join("\\n") : "-";
        }
        function updateCopyButton(payload) {
          const confirmationUrl = payload && (payload.confirmation_url || payload.confirm_url || "");
          copyConfirmationUrlButton.disabled = !confirmationUrl;
          copyConfirmationUrlButton.dataset.url = confirmationUrl || "";
        }
        function loadAuth() {
          try {
            const saved = JSON.parse(sessionStorage.getItem(KEY) || "null");
            if (saved && typeof saved === "object") {
              bearer.value = saved.bearer || "";
              confirmKey.value = saved.confirmKey || "";
            }
          } catch {}
        }
        function saveAuth() {
          sessionStorage.setItem(KEY, JSON.stringify({ bearer: bearer.value.trim(), confirmKey: confirmKey.value.trim() }));
        }
        function buildHeaders() {
          const headers = { "Content-Type": "application/json" };
          const bearerValue = bearer.value.trim();
          const confirmKeyValue = confirmKey.value.trim();
          if (bearerValue) headers.Authorization = "Bearer " + bearerValue;
          if (confirmKeyValue) headers["X-Confirm-Key"] = confirmKeyValue;
          return headers;
        }
        function setResultsVisibility(kind, visible) {
          const block = kind === "member" ? memberResultsBlock : modelResultsBlock;
          block.hidden = !visible;
        }
        function applyOptions(select, items, kind) {
          select.innerHTML = "";
          if (!Array.isArray(items) || !items.length) {
            setResultsVisibility(kind, false);
            const option = document.createElement("option");
            option.textContent = kind === "member" ? "ไม่พบ member" : "ไม่พบ model";
            option.value = "";
            select.appendChild(option);
            return;
          }
          setResultsVisibility(kind, true);
          for (const item of items) {
            const fields = item && item.fields ? item.fields : {};
            const label = kind === "member"
              ? [fields.name || fields.Name || fields.nickname || "Member", fields.memberstack_id || "", fields.telegram_username || fields.telegram_id || ""].filter(Boolean).join(" | ")
              : [fields.name || fields.Name || fields.nickname || "Model", fields.unique_key || "", fields.telegram_username || fields.telegram_id || ""].filter(Boolean).join(" | ");
            const option = document.createElement("option");
            option.value = kind === "member" ? String(fields.memberstack_id || "") : String(item.id || fields.id || "");
            option.textContent = label;
            option.dataset.recordId = String(item.id || "");
            option.dataset.summary = JSON.stringify({
              kind,
              recordId: String(item.id || ""),
              name: String(fields.name || fields.Name || fields.nickname || ""),
              memberstackId: String(fields.memberstack_id || ""),
              uniqueKey: String(fields.unique_key || ""),
              telegram: String(fields.telegram_username || fields.telegram_id || ""),
            });
            select.appendChild(option);
          }
        }
        function selectFirstOption(select) {
          if (!select.options.length) return;
          select.selectedIndex = 0;
          select.dispatchEvent(new Event("change"));
        }
        function resetResolvedEntity(kind) {
          const isMember = kind === "member";
          document.getElementById(isMember ? "memberstack_id" : "model_id").value = "";
          if (isMember) {
            setSelectionSummary(memberSummary, ["ยังไม่ได้เลือก member"]);
          } else {
            setSelectionSummary(modelSummary, ["ยังไม่ได้เลือก model"]);
          }
        }
        async function runLookup(kind) {
          const query = (kind === "member" ? memberSearch.value : modelSearch.value).trim();
          const select = kind === "member" ? memberResults : modelResults;
          const path = kind === "member" ? "/v1/admin/members/list" : "/v1/admin/models/list";
          try {
            const params = new URLSearchParams();
            if (query) params.set("q", query);
            params.set("limit", "10");
            const response = await fetch(path + "?" + params.toString(), { method: "GET", headers: buildHeaders() });
            const data = await response.json().catch(() => null);
            if (!response.ok || !data) {
              throw new Error((data && (data.error?.message || data.error)) || "lookup_failed");
            }
            applyOptions(select, data.items || [], kind);
            return data.items || [];
          } catch (error) {
            throw error;
          }
        }
        async function createDraft(kind) {
          const isMember = kind === "member";
          const queryInput = isMember ? memberSearch : modelSearch;
          const query = queryInput.value.trim();
          const name = query || (isMember ? document.getElementById("memberstack_id").value.trim() : document.getElementById("model_id").value.trim());
          if (!name) {
            setStatus(isMember ? "พิมพ์ชื่อหรือ memberstack id ก่อนสร้าง draft member" : "พิมพ์ชื่อหรือ unique key ก่อนสร้าง draft model", "error");
            return;
          }
          const path = isMember ? "/v1/admin/members/draft" : "/v1/admin/models/draft";
          const payload = isMember
            ? {
                query,
                name,
                nickname: query,
                memberstack_id: document.getElementById("memberstack_id").value.trim(),
              }
            : {
                query,
                name,
                nickname: query,
                unique_key: query,
                record_id_hint: document.getElementById("model_id").value.trim(),
              };
          const select = isMember ? memberResults : modelResults;
          try {
            const response = await fetch(path, { method: "POST", headers: buildHeaders(), body: JSON.stringify(payload) });
            const data = await response.json().catch(() => null);
            if (!response.ok || !data || !data.item) {
              throw new Error((data && (data.error?.message || data.error)) || "draft_failed");
            }
            applyOptions(select, [data.item], kind);
            selectFirstOption(select);
            return data.item;
          } catch (error) {
            throw error;
          }
        }
        async function ensureEntity(kind, options) {
          const isMember = kind === "member";
          const queryInput = isMember ? memberSearch : modelSearch;
          const idInput = document.getElementById(isMember ? "memberstack_id" : "model_id");
          const select = isMember ? memberResults : modelResults;
          const idleStatus = options && options.quiet;
          const actionLabel = isMember ? "member" : "model";
          const query = queryInput.value.trim();
          const currentId = idInput.value.trim();
          if (!query && currentId) {
            return currentId;
          }

          if (!idleStatus) {
            setStatus(isMember ? "กำลังหา / สร้าง member..." : "กำลังหา / สร้าง model...");
            setResult("Working...");
          }
          try {
            const items = await runLookup(kind);
            if (items.length) {
              selectFirstOption(select);
              if (!idleStatus) {
                setStatus(isMember ? "เจอ member แล้ว" : "เจอ model แล้ว", "success");
                setResult({ ok: true, source: "lookup", items });
              }
              return idInput.value.trim();
            }

            const draft = await createDraft(kind);
            if (!idleStatus) {
              setStatus(isMember ? "สร้าง draft member แล้ว" : "สร้าง draft model แล้ว", "success");
              setResult({ ok: true, source: "draft", item: draft });
            }
            return idInput.value.trim();
          } catch (error) {
            if (!idleStatus) {
              setStatus(isMember ? "หา / สร้าง member ไม่สำเร็จ" : "หา / สร้าง model ไม่สำเร็จ", "error");
              setResult({ ok: false, error: String(error && error.message ? error.message : error), entity: actionLabel });
            }
            throw error;
          }
        }
        function readOptionalNumber(id) {
          const raw = document.getElementById(id).value.trim();
          if (!raw) return null;
          const num = Number(raw);
          return Number.isFinite(num) ? num : NaN;
        }
        loadAuth();
        setResultsVisibility("member", false);
        setResultsVisibility("model", false);
        bearer.addEventListener("change", saveAuth);
        confirmKey.addEventListener("change", saveAuth);
        memberSearch.addEventListener("input", () => {
          resetResolvedEntity("member");
          setResultsVisibility("member", false);
        });
        modelSearch.addEventListener("input", () => {
          resetResolvedEntity("model");
          setResultsVisibility("model", false);
        });
        memberSearch.addEventListener("keydown", (event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            ensureEntity("member");
          }
        });
        modelSearch.addEventListener("keydown", (event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            ensureEntity("model");
          }
        });
        clearAuth.addEventListener("click", () => {
          sessionStorage.removeItem(KEY);
          bearer.value = "";
          confirmKey.value = "";
          setStatus("ล้าง auth ที่บันทึกไว้แล้ว", "success");
        });
        copyConfirmationUrlButton.addEventListener("click", async () => {
          const url = copyConfirmationUrlButton.dataset.url || "";
          if (!url) return;
          try {
            await navigator.clipboard.writeText(url);
            setStatus("คัดลอก confirmation_url แล้ว", "success");
          } catch {
            setStatus("คัดลอก confirmation_url ไม่สำเร็จ", "error");
          }
        });
        memberResults.addEventListener("change", () => {
          const option = memberResults.options[memberResults.selectedIndex];
          if (option && option.value) {
            document.getElementById("memberstack_id").value = option.value;
            try {
              const info = JSON.parse(option.dataset.summary || "{}");
              setSelectionSummary(memberSummary, [info.name || "Member", info.memberstackId ? "memberstack_id: " + info.memberstackId : "", info.telegram ? "telegram: " + info.telegram : ""]);
            } catch {}
            setStatus("เลือก member แล้ว", "success");
          }
        });
        modelResults.addEventListener("change", () => {
          const option = modelResults.options[modelResults.selectedIndex];
          if (option && option.value) {
            document.getElementById("model_id").value = option.dataset.recordId || option.value;
            try {
              const info = JSON.parse(option.dataset.summary || "{}");
              setSelectionSummary(modelSummary, [info.name || "Model", info.recordId ? "record_id: " + info.recordId : "", info.uniqueKey ? "unique_key: " + info.uniqueKey : "", info.telegram ? "telegram: " + info.telegram : ""]);
            } catch {}
            setStatus("เลือก model แล้ว", "success");
          }
        });
        form.addEventListener("submit", async (event) => {
          event.preventDefault();
          setStatus("");
          saveAuth();
          if (!bearer.value.trim() && !confirmKey.value.trim()) {
            setStatus("กรอก Bearer Token หรือ Confirm Key ก่อน", "error");
            return;
          }
          if (!memberSearch.value.trim() && !document.getElementById("memberstack_id").value.trim()) {
            setStatus("พิมพ์ชื่อลูกค้าหรือ memberstack id ก่อน", "error");
            return;
          }
          if (!modelSearch.value.trim() && !document.getElementById("model_id").value.trim()) {
            setStatus("พิมพ์ชื่อโมเดลหรือ model id ก่อน", "error");
            return;
          }
          let metadata = {};
          const metadataRaw = document.getElementById("metadata").value.trim();
          if (metadataRaw) {
            try {
              metadata = JSON.parse(metadataRaw);
            } catch {
              setStatus("Metadata JSON ไม่ถูกต้อง", "error");
              return;
            }
          }
          const payModelThb = readOptionalNumber("pay_model_thb");
          if (Number.isNaN(payModelThb)) {
            setStatus("จ่ายโมเดล THB ต้องเป็นตัวเลขที่ถูกต้อง", "error");
            return;
          }
          submit.disabled = true;
          submit.textContent = "กำลังสร้าง...";
          setStatus("กำลังส่งคำขอ create-session...");
          setResult("Working...");
          try {
            await ensureEntity("member", { quiet: true });
            await ensureEntity("model", { quiet: true });
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
            const response = await fetch("/internal/admin/jobs/create-session", { method: "POST", headers: buildHeaders(), body: JSON.stringify(payload) });
            const data = await response.json().catch(() => null);
            if (!response.ok || !data) {
              updateCopyButton(null);
              setStatus((data && (data.error?.message || data.error)) || "สร้างเซสชันไม่สำเร็จ", "error");
              setResult(data || { ok: false, status: response.status });
              return;
            }
            updateCopyButton(data);
            setStatus("สร้างเซสชันสำเร็จ", "success");
            setResult(data);
          } catch (error) {
            updateCopyButton(null);
            setStatus("ยังเชื่อม create-session ไม่ได้ตอนนี้", "error");
            setResult({ ok: false, error: String(error && error.message ? error.message : error) });
          } finally {
            submit.disabled = false;
            submit.textContent = "สร้างเซสชัน";
          }
        });
      })();
    </script>
  </body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function renderNotesHubPage(method) {
  if (method === "HEAD") {
    return new Response(null, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  }

  const html = `<!doctype html>
<html lang="th">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>MMD Admin Notes Hub</title>
    <style>
      :root {
        color-scheme: dark;
        --bg: #08070a;
        --panel: rgba(19,15,24,.82);
        --line: rgba(247,240,232,.14);
        --text: #f7f0e8;
        --muted: #c4b3a7;
        --gold: #d1a66a;
        --success: #9ad7b2;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        padding: 24px;
        color: var(--text);
        background: radial-gradient(circle at top, rgba(164,91,91,.18), transparent 28%), radial-gradient(circle at bottom right, rgba(95,127,132,.12), transparent 30%), linear-gradient(180deg, #110d14 0%, #09080d 52%, #060507 100%);
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
      .topbar { display:flex; justify-content:space-between; gap:16px; align-items:center; margin-bottom:24px; }
      .kicker { margin:0 0 10px; color:var(--gold); font:600 .8rem/1.2 "Avenir Next Condensed", "Gill Sans", sans-serif; letter-spacing:.24em; text-transform:uppercase; }
      h1 { margin:0; font-size:clamp(2.1rem,7vw,4rem); line-height:.95; letter-spacing:-.04em; }
      .lead { margin:16px 0 0; color:var(--muted); line-height:1.7; max-width:70ch; }
      form { display:grid; gap:18px; margin-top:28px; }
      .grid { display:grid; gap:16px; grid-template-columns:repeat(2, minmax(0,1fr)); }
      .grid-full { grid-column:1 / -1; }
      label { display:grid; gap:8px; color:var(--gold); font:600 .78rem/1.2 "Avenir Next Condensed", "Gill Sans", sans-serif; letter-spacing:.16em; text-transform:uppercase; }
      input, select { width:100%; min-height:52px; padding:14px 16px; border:1px solid var(--line); border-radius:16px; background:rgba(7,6,10,.72); color:var(--text); font:inherit; }
      select { min-height:148px; padding:10px 12px; }
      .actions { display:flex; gap:12px; align-items:center; flex-wrap:wrap; }
      button { min-height:48px; padding:0 18px; border-radius:999px; border:1px solid rgba(209,166,106,.36); background:linear-gradient(135deg, rgba(209,166,106,.24), rgba(164,91,91,.28)); color:var(--text); font:600 .92rem/1 "Avenir Next Condensed", "Gill Sans", sans-serif; letter-spacing:.12em; text-transform:uppercase; cursor:pointer; }
      .ghost { background:transparent; }
      .status { min-height:1.2em; margin:0; color:var(--muted); }
      .status.error { color:#f2b0b0; }
      .status.success { color:var(--success); }
      .hint { margin:0; color:var(--muted); font-size:.92rem; }
      .summary-grid { display:grid; gap:14px; grid-template-columns:repeat(2, minmax(0,1fr)); margin-top:18px; }
      .summary-card { padding:16px 18px; border:1px solid var(--line); border-radius:18px; background:rgba(255,255,255,.03); }
      .summary-label { margin:0 0 8px; color:var(--gold); font:600 .74rem/1.2 "Avenir Next Condensed", "Gill Sans", sans-serif; letter-spacing:.14em; text-transform:uppercase; }
      .summary-value { margin:0; color:var(--text); line-height:1.6; white-space:pre-wrap; word-break:break-word; }
      .result-block[hidden] { display:none; }
      .columns { display:grid; gap:16px; grid-template-columns:repeat(2, minmax(0,1fr)); margin-top:20px; }
      .note-panel { border:1px solid var(--line); border-radius:22px; background:rgba(255,255,255,.03); padding:18px; min-height:220px; }
      .note-list { display:grid; gap:12px; }
      .note-card { padding:14px 16px; border-radius:16px; border:1px solid var(--line); background:rgba(7,6,10,.58); }
      .note-card h3 { margin:0 0 8px; font-size:1rem; }
      .meta { margin:0 0 8px; color:var(--muted); font-size:.88rem; }
      .content { margin:0; color:var(--text); white-space:pre-wrap; line-height:1.55; }
      pre { overflow:auto; padding:18px; border-radius:20px; border:1px solid var(--line); background:rgba(7,6,10,.72); color:var(--text); font:.9rem/1.6 SFMono-Regular, Consolas, Menlo, monospace; }
      @media (max-width: 860px) { .grid, .summary-grid, .columns { grid-template-columns:1fr; } .topbar { align-items:flex-start; flex-direction:column; } }
    </style>
  </head>
  <body>
    <main class="shell">
      <div class="topbar">
        <div>
          <p class="kicker">Internal Admin / Notes</p>
          <h1>Notes Hub</h1>
          <p class="lead">ค้นหา client กับ model แล้วดู Internal Notes ของทั้งสองฝั่งในหน้าจอเดียวได้เลย เหมาะสำหรับเช็ก immigrate note, private profile, และ context ก่อนทำงานต่อ</p>
        </div>
        <button id="clearAuth" class="ghost" type="button">ล้าง Auth</button>
      </div>

      <form id="auth-form">
        <div class="grid">
          <label>Bearer Token<input id="bearer" type="password" autocomplete="off" /></label>
          <label>Confirm Key<input id="confirmKey" type="password" autocomplete="off" /></label>
        </div>
        <p class="hint">ใส่อย่างใดอย่างหนึ่งก็พอ และค่าจะถูกเก็บไว้เฉพาะ browser session นี้เท่านั้น</p>
      </form>

      <form id="notes-form">
        <div class="grid">
          <label>Client<input id="client_search" type="text" placeholder="Client Name, nickname, line, phone, email" /></label>
          <label>Model<input id="model_search" type="text" placeholder="working_name, nickname, unique key, phone" /></label>
          <label id="client_results_block" class="grid-full result-block" hidden>ผลการค้นหา Client<select id="client_results" size="5"></select></label>
          <label id="model_results_block" class="grid-full result-block" hidden>ผลการค้นหา Model<select id="model_results" size="5"></select></label>
        </div>
        <input id="client_id" type="hidden" />
        <input id="model_id" type="hidden" />
        <div class="actions">
          <button id="load_notes" type="submit">โหลด Notes</button>
          <p id="status" class="status" role="status"></p>
        </div>
      </form>

      <div class="summary-grid">
        <div class="summary-card"><p class="summary-label">Client ที่เลือก</p><p id="client_summary" class="summary-value">ยังไม่ได้เลือก client</p></div>
        <div class="summary-card"><p class="summary-label">Model ที่เลือก</p><p id="model_summary" class="summary-value">ยังไม่ได้เลือก model</p></div>
      </div>

      <div class="columns">
        <section class="note-panel">
          <p class="summary-label">Client Notes</p>
          <div id="client_notes" class="note-list"><p class="hint">ยังไม่มีข้อมูล</p></div>
        </section>
        <section class="note-panel">
          <p class="summary-label">Model Notes</p>
          <div id="model_notes" class="note-list"><p class="hint">ยังไม่มีข้อมูล</p></div>
        </section>
      </div>

      <section class="note-panel" style="margin-top:16px;">
        <p class="summary-label">Merged Notes</p>
        <div id="merged_notes" class="note-list"><p class="hint">ยังไม่มีข้อมูล</p></div>
      </section>

      <pre id="result">${escapeHtml("รอการโหลด notes...")}</pre>
    </main>

    <script>
      (() => {
        const KEY = "mmd_admin_notes_hub_auth_v1";
        const status = document.getElementById("status");
        const result = document.getElementById("result");
        const clearAuth = document.getElementById("clearAuth");
        const bearer = document.getElementById("bearer");
        const confirmKey = document.getElementById("confirmKey");
        const form = document.getElementById("notes-form");
        const clientSearch = document.getElementById("client_search");
        const modelSearch = document.getElementById("model_search");
        const clientResults = document.getElementById("client_results");
        const modelResults = document.getElementById("model_results");
        const clientResultsBlock = document.getElementById("client_results_block");
        const modelResultsBlock = document.getElementById("model_results_block");
        const clientSummary = document.getElementById("client_summary");
        const modelSummary = document.getElementById("model_summary");
        const clientNotes = document.getElementById("client_notes");
        const modelNotes = document.getElementById("model_notes");
        const mergedNotes = document.getElementById("merged_notes");

        function setStatus(message, kind) {
          status.textContent = message || "";
          status.className = "status" + (kind ? " " + kind : "");
        }
        function setResult(payload) {
          result.textContent = typeof payload === "string" ? payload : JSON.stringify(payload, null, 2);
        }
        function loadAuth() {
          try {
            const saved = JSON.parse(sessionStorage.getItem(KEY) || "null");
            if (saved && typeof saved === "object") {
              bearer.value = saved.bearer || "";
              confirmKey.value = saved.confirmKey || "";
            }
          } catch {}
        }
        function saveAuth() {
          sessionStorage.setItem(KEY, JSON.stringify({ bearer: bearer.value.trim(), confirmKey: confirmKey.value.trim() }));
        }
        function buildHeaders() {
          const headers = {};
          const bearerValue = bearer.value.trim();
          const confirmKeyValue = confirmKey.value.trim();
          if (bearerValue) headers.Authorization = "Bearer " + bearerValue;
          if (confirmKeyValue) headers["X-Confirm-Key"] = confirmKeyValue;
          return headers;
        }
        function showResults(kind, visible) {
          (kind === "client" ? clientResultsBlock : modelResultsBlock).hidden = !visible;
        }
        function setSummary(target, lines) {
          target.textContent = Array.isArray(lines) && lines.length ? lines.filter(Boolean).join("\\n") : "-";
        }
        function renderNoteList(target, notes) {
          target.innerHTML = "";
          if (!Array.isArray(notes) || !notes.length) {
            target.innerHTML = '<p class="hint">ยังไม่มีข้อมูล</p>';
            return;
          }
          for (const note of notes) {
            const article = document.createElement("article");
            article.className = "note-card";
            const title = document.createElement("h3");
            title.textContent = note.title || "Untitled Note";
            const meta = document.createElement("p");
            meta.className = "meta";
            meta.textContent = [note.created_date || "", note.author || "", Array.isArray(note.scopes) ? note.scopes.join(", ") : ""].filter(Boolean).join(" | ");
            const content = document.createElement("p");
            content.className = "content";
            content.textContent = note.content || "";
            article.appendChild(title);
            article.appendChild(meta);
            article.appendChild(content);
            target.appendChild(article);
          }
        }
        function applyOptions(select, items, kind) {
          select.innerHTML = "";
          if (!Array.isArray(items) || !items.length) {
            showResults(kind, false);
            return;
          }
          showResults(kind, true);
          for (const item of items) {
            const fields = item && item.fields ? item.fields : {};
            const label = kind === "client"
              ? [fields["Client Name"] || fields.nickname || "Client", fields.memberstack_id || "", fields.line_display_name || fields.email || fields["Phone Number"] || ""].filter(Boolean).join(" | ")
              : [fields.working_name || fields.nickname || "Model", fields.unique_key || "", fields.phone || fields.line_id || ""].filter(Boolean).join(" | ");
            const option = document.createElement("option");
            option.value = String(item.id || "");
            option.textContent = label;
            option.dataset.summary = JSON.stringify({
              id: String(item.id || ""),
              name: String(fields["Client Name"] || fields.working_name || fields.nickname || ""),
              nickname: String(fields.nickname || ""),
              meta: kind === "client"
                ? [fields.memberstack_id || "", fields.line_display_name || "", fields.email || fields["Phone Number"] || ""].filter(Boolean)
                : [fields.unique_key || "", fields.phone || "", fields.line_id || ""].filter(Boolean),
            });
            select.appendChild(option);
          }
        }
        async function runLookup(kind) {
          const query = (kind === "client" ? clientSearch.value : modelSearch.value).trim();
          const path = kind === "client" ? "/v1/admin/clients/list" : "/v1/admin/models/list";
          const params = new URLSearchParams();
          if (query) params.set("q", query);
          params.set("limit", "10");
          const response = await fetch(path + "?" + params.toString(), { method: "GET", headers: buildHeaders() });
          const data = await response.json().catch(() => null);
          if (!response.ok || !data) throw new Error((data && (data.error?.message || data.error)) || "lookup_failed");
          applyOptions(kind === "client" ? clientResults : modelResults, data.items || [], kind);
          return data.items || [];
        }
        function applySelection(kind) {
          const select = kind === "client" ? clientResults : modelResults;
          const targetId = document.getElementById(kind + "_id");
          const option = select.options[select.selectedIndex];
          if (!option || !option.value) return;
          targetId.value = option.value;
          try {
            const info = JSON.parse(option.dataset.summary || "{}");
            setSummary(kind === "client" ? clientSummary : modelSummary, [
              info.name || (kind === "client" ? "Client" : "Model"),
              info.nickname ? "nickname: " + info.nickname : "",
              ...(Array.isArray(info.meta) ? info.meta : []),
            ]);
          } catch {}
        }
        async function loadContext() {
          const clientId = document.getElementById("client_id").value.trim();
          const modelId = document.getElementById("model_id").value.trim();
          const params = new URLSearchParams();
          if (clientId) params.set("client_id", clientId);
          if (modelId) params.set("model_id", modelId);
          const response = await fetch("/v1/admin/notes/context?" + params.toString(), { method: "GET", headers: buildHeaders() });
          const data = await response.json().catch(() => null);
          if (!response.ok || !data) throw new Error((data && (data.error?.message || data.error)) || "notes_context_failed");
          renderNoteList(clientNotes, data.client_notes || []);
          renderNoteList(modelNotes, data.model_notes || []);
          renderNoteList(mergedNotes, data.merged_notes || []);
          setResult(data);
          return data;
        }
        loadAuth();
        saveAuth();
        showResults("client", false);
        showResults("model", false);
        bearer.addEventListener("change", saveAuth);
        confirmKey.addEventListener("change", saveAuth);
        clearAuth.addEventListener("click", () => {
          sessionStorage.removeItem(KEY);
          bearer.value = "";
          confirmKey.value = "";
          setStatus("ล้าง auth ที่บันทึกไว้แล้ว", "success");
        });
        clientSearch.addEventListener("keydown", async (event) => {
          if (event.key !== "Enter") return;
          event.preventDefault();
          try {
            setStatus("กำลังค้นหา client...");
            const items = await runLookup("client");
            if (items.length) {
              clientResults.selectedIndex = 0;
              applySelection("client");
              setStatus("เจอ client แล้ว", "success");
            } else {
              setStatus("ไม่พบ client", "error");
            }
          } catch (error) {
            setStatus("ค้นหา client ไม่สำเร็จ", "error");
            setResult({ ok: false, error: String(error && error.message ? error.message : error) });
          }
        });
        modelSearch.addEventListener("keydown", async (event) => {
          if (event.key !== "Enter") return;
          event.preventDefault();
          try {
            setStatus("กำลังค้นหา model...");
            const items = await runLookup("model");
            if (items.length) {
              modelResults.selectedIndex = 0;
              applySelection("model");
              setStatus("เจอ model แล้ว", "success");
            } else {
              setStatus("ไม่พบ model", "error");
            }
          } catch (error) {
            setStatus("ค้นหา model ไม่สำเร็จ", "error");
            setResult({ ok: false, error: String(error && error.message ? error.message : error) });
          }
        });
        clientResults.addEventListener("change", () => applySelection("client"));
        modelResults.addEventListener("change", () => applySelection("model"));
        form.addEventListener("submit", async (event) => {
          event.preventDefault();
          saveAuth();
          if (!bearer.value.trim() && !confirmKey.value.trim()) {
            setStatus("กรอก Bearer Token หรือ Confirm Key ก่อน", "error");
            return;
          }
          try {
            setStatus("กำลังโหลด notes...");
            if (!document.getElementById("client_id").value.trim() && clientSearch.value.trim()) {
              const items = await runLookup("client");
              if (items.length) {
                clientResults.selectedIndex = 0;
                applySelection("client");
              }
            }
            if (!document.getElementById("model_id").value.trim() && modelSearch.value.trim()) {
              const items = await runLookup("model");
              if (items.length) {
                modelResults.selectedIndex = 0;
                applySelection("model");
              }
            }
            const data = await loadContext();
            setStatus("โหลด notes แล้ว", "success");
            setResult(data);
          } catch (error) {
            setStatus("โหลด notes ไม่สำเร็จ", "error");
            setResult({ ok: false, error: String(error && error.message ? error.message : error) });
          }
        });
      })();
    </script>
  </body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
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

async function airtableGetById(env, tableName, id) {
  if (!id) return null;
  const r = await airtableFetch(env, `/${encodeURIComponent(tableName)}/${encodeURIComponent(id)}`);
  if (!r.ok) return null;
  return { id: r.data?.id || id, fields: r.data?.fields || {}, createdTime: r.data?.createdTime || "" };
}

async function airtableListByRecordIds(env, tableName, ids) {
  const safeIds = [...new Set((Array.isArray(ids) ? ids : []).map((value) => str(value)).filter(Boolean))];
  if (!safeIds.length) return [];
  const formula = `OR(${safeIds.map((id) => `RECORD_ID()="${escapeFormulaValue(id)}"`).join(",")})`;
  const params = new URLSearchParams();
  params.set("pageSize", String(Math.min(safeIds.length, 100)));
  params.set("filterByFormula", formula);
  const r = await airtableFetch(env, `/${encodeURIComponent(tableName)}?${params.toString()}`);
  if (!r.ok) return [];
  const records = r.data?.records || [];
  return records.map((rec) => ({ id: rec.id, fields: rec.fields || {}, createdTime: rec.createdTime || "" }));
}

function extractLinkedRecordIds(value) {
  return Array.isArray(value) ? value.map((item) => str(item)).filter(Boolean) : [];
}

function normalizeInternalNote(record, scopes = []) {
  const fields = record?.fields || {};
  return {
    id: str(record?.id),
    title: str(fields["Note Title"]),
    content: str(fields["Note Content"]),
    created_date: str(fields["Created Date"]),
    author: str(fields.Author),
    confidentiality: str(fields["Confidentiality Level"]),
    visibility: str(fields.Visibility),
    scopes,
  };
}

function sortNotesByDate(a, b) {
  const left = str(b.created_date);
  const right = str(a.created_date);
  if (left !== right) return left.localeCompare(right);
  return str(a.title).localeCompare(str(b.title));
}

async function buildNotesHubContext(env, { clientId = "", modelId = "" } = {}) {
  const clientsTable = env.AIRTABLE_TABLE_CLIENTS || "tblVv58TCbwh5j1fS";
  const modelsTable = env.AIRTABLE_TABLE_MODELS || "tblI4B0bI446vp9GX";
  const notesTable = env.AIRTABLE_TABLE_INTERNAL_NOTES || "tbl1Tt1IXDc9k0zxK";

  const client = clientId ? await airtableGetById(env, clientsTable, clientId) : null;
  const model = modelId ? await airtableGetById(env, modelsTable, modelId) : null;

  const clientNoteIds = extractLinkedRecordIds(client?.fields?.["Internal Notes"]);
  const modelNoteIds = extractLinkedRecordIds(model?.fields?.["Internal Notes"]);
  const allNoteIds = [...new Set([...clientNoteIds, ...modelNoteIds])];
  const noteRecords = await airtableListByRecordIds(env, notesTable, allNoteIds);
  const noteMap = new Map(noteRecords.map((record) => [record.id, record]));

  const clientNotes = clientNoteIds
    .map((id) => noteMap.get(id))
    .filter(Boolean)
    .map((record) => normalizeInternalNote(record, ["client"]))
    .sort(sortNotesByDate);

  const modelNotes = modelNoteIds
    .map((id) => noteMap.get(id))
    .filter(Boolean)
    .map((record) => normalizeInternalNote(record, ["model"]))
    .sort(sortNotesByDate);

  const mergedNotes = allNoteIds
    .map((id) => {
      const record = noteMap.get(id);
      if (!record) return null;
      const scopes = [];
      if (clientNoteIds.includes(id)) scopes.push("client");
      if (modelNoteIds.includes(id)) scopes.push("model");
      return normalizeInternalNote(record, scopes);
    })
    .filter(Boolean)
    .sort(sortNotesByDate);

  return {
    client: client
      ? {
          id: client.id,
          fields: client.fields,
          note_count: clientNotes.length,
        }
      : null,
    model: model
      ? {
          id: model.id,
          fields: model.fields,
          note_count: modelNotes.length,
        }
      : null,
    client_notes: clientNotes,
    model_notes: modelNotes,
    merged_notes: mergedNotes,
  };
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

async function airtableCreateRecord(env, tableName, fields) {
  if (!env.AIRTABLE_API_KEY || !env.AIRTABLE_BASE_ID) {
    throw new Error("missing_airtable_env");
  }

  const r = await airtableFetch(env, `/${encodeURIComponent(tableName)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ records: [{ fields }], typecast: true }),
  });

  if (!r.ok) {
    throw new Error(r?.data ? JSON.stringify(r.data) : "airtable_create_failed");
  }

  const rec = r.data?.records?.[0];
  return { id: rec?.id || "", fields: rec?.fields || {} };
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

async function createDraftMember(env, body) {
  const tableName = env.AIRTABLE_TABLE_MEMBERS || "members";
  const seed = str(body.query || body.name || body.nickname || body.memberstack_id || body.telegram_username);
  const memberstackId = str(body.memberstack_id) || deriveMemberstackId([seed, body.telegram_username, body.telegram_id]);

  const existing = await airtableFindOne(
    env,
    tableName,
    `{memberstack_id}="${escapeFormulaValue(memberstackId)}"`
  );
  if (existing) return existing;

  const name = str(body.name || seed || memberstackId);
  const nickname = str(body.nickname || seed || name);
  const fields = compactObject({
    name,
    nickname,
    memberstack_id: memberstackId,
    telegram_username: str(body.telegram_username),
    telegram_id: str(body.telegram_id),
  });

  return await airtableCreateRecord(env, tableName, fields);
}

async function createDraftModel(env, body) {
  const tableName = env.AIRTABLE_TABLE_MODELS || "models";
  const seed = str(body.query || body.name || body.nickname || body.unique_key || body.telegram_username);
  const manifestEntry = resolveModelManifestEntry(
    seed || body.folder_name || body.model_name || body.username
  );
  if (manifestEntry) {
    return await ensureModelFromManifest(env, tableName, manifestEntry);
  }

  const uniqueKey = str(body.unique_key) || `draft_${slugToken(seed, "model")}`;

  const existing = await airtableFindOne(
    env,
    tableName,
    `{unique_key}="${escapeFormulaValue(uniqueKey)}"`
  );
  if (existing) return existing;

  const name = str(body.name || seed || uniqueKey);
  const nickname = str(body.nickname || seed || name);
  const fields = compactObject({
    name,
    nickname,
    unique_key: uniqueKey,
    telegram_username: str(body.telegram_username),
    telegram_id: str(body.telegram_id),
  });

  return await airtableCreateRecord(env, tableName, fields);
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

async function createAdminSession(env, body) {
  const amount = toNum(body?.amount_thb ?? body?.amount);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("invalid_amount_thb");

  const payModelAmount = Number(
    body.pay_model_thb ?? body.pay_model ?? body.model_pay_thb ?? body.model_pay
  );
  const hasPayModelAmount =
    body?.pay_model_thb != null ||
    body?.pay_model != null ||
    body?.model_pay_thb != null ||
    body?.model_pay != null;
  if (hasPayModelAmount && (!Number.isFinite(payModelAmount) || payModelAmount < 0)) {
    throw new Error("invalid_pay_model_thb");
  }

  const payload = {
    session_id: str(body.session_id || body.sessionId || `sess_${crypto.randomUUID()}`),
    payment_ref: str(
      body.payment_ref ||
        body.paymentRef ||
        `admin_${Date.now().toString(36)}_${crypto.randomUUID().slice(0, 8)}`
    ),
    client_name: str(body.client_name || body.member_name || body.customer_name),
    model_name: str(body.model_name || body.talent_name),
    memberstack_id: str(body.memberstack_id || body.member_id || body.member_ref),
    model_id: str(body.model_id || body.model_ref),
    job_type: str(body.job_type || body.session_type || "session"),
    job_date: str(body.job_date || body.service_date || body.date),
    start_time: str(body.start_time || body.time_start),
    end_time: str(body.end_time || body.time_end),
    location_name: str(body.location_name || body.location || body.venue_name),
    google_map_url: str(body.google_map_url || body.google_maps_url || body.maps_url),
    note: str(body.note || body.notes),
    amount_thb: amount,
    pay_model_thb: hasPayModelAmount ? payModelAmount : null,
    currency: str(body.currency || "THB"),
    payment_type: str(body.payment_type || body.payment_stage || "full"),
    payment_method: str(body.payment_method || "promptpay"),
    confirm_page: body.confirm_page || null,
    model_confirm_page: body.model_confirm_page || null,
    return_url: body.return_url || body.success_url || null,
    cancel_url: body.cancel_url || null,
    partner_snapshot: body.partner_snapshot || null,
    referral_snapshot: body.referral_snapshot || null,
    commission_splits: Array.isArray(body.commission_splits) ? body.commission_splits : [],
    commission_snapshot: body.commission_snapshot || null,
    commission_group_key: str(body.commission_group_key || ""),
    commission_snapshot_locked:
      body.commission_snapshot_locked == null ? true : Boolean(body.commission_snapshot_locked),
    metadata: body.metadata && typeof body.metadata === "object" ? body.metadata : {},
  };

  const missing = [];
  if (!payload.client_name && !payload.memberstack_id) missing.push("client_name");
  if (!payload.model_name && !payload.model_id) missing.push("model_name");
  if (!payload.job_date) missing.push("job_date");
  if (!payload.start_time) missing.push("start_time");
  if (!payload.end_time) missing.push("end_time");
  if (!payload.location_name) missing.push("location_name");
  if (missing.length) throw new Error(`missing_required_fields:${missing.join(",")}`);

  let confirmData = {};
  try {
    confirmData = await callPaymentsCreateLink(env, payload);
  } catch (error) {
    if (!isMissingConfirmRoute(error)) throw error;
    confirmData = await mintLocalConfirmLinks(env, payload);
  }

  const confirmation_url =
    confirmData.confirmation_url ||
    confirmData.customer_confirmation_url ||
    confirmData.confirm_url ||
    confirmData.url ||
    confirmData.link ||
    null;

  return {
    mode: confirmData.mode || "payments_worker",
    session_id: payload.session_id,
    payment_ref: payload.payment_ref,
    amount_thb: payload.amount_thb,
    pay_model_thb: payload.pay_model_thb,
    memberstack_id: payload.memberstack_id,
    model_id: payload.model_id,
    client_name: payload.client_name,
    model_name: payload.model_name,
    confirmation_url,
    confirm_url: confirmData.confirm_url || confirmation_url,
    customer_confirmation_url: confirmData.customer_confirmation_url || confirmation_url,
    model_confirmation_url: confirmData.model_confirmation_url || null,
    short_url: confirmData.short_url || null,
    payments_response: confirmData,
  };
}

async function callPaymentsCreateLink(env, payload) {
  const base = str(env.PAYMENTS_WORKER_BASE_URL || env.PAYMENTS_BASE_URL || "").replace(/\/+$/, "");
  if (!base) throw new Error("missing_PAYMENTS_WORKER_BASE_URL");

  const res = await fetch(`${base}/v1/confirm/link`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(env.CONFIRM_KEY ? { "X-Confirm-Key": env.CONFIRM_KEY } : {}),
    },
    body: JSON.stringify(payload),
  });

  let data = null;
  try {
    data = await res.json();
  } catch (_) {}

  if (!res.ok) {
    const error = new Error(data?.error || data?.message || `payments_worker_http_${res.status}`);
    error.status = 502;
    error.upstreamStatus = res.status;
    error.response = data;
    throw error;
  }

  return data || {};
}

function isMissingConfirmRoute(error) {
  const message = str(error?.message).toLowerCase();
  const responseError = str(error?.response?.error).toLowerCase();
  const responseMessage = str(error?.response?.message).toLowerCase();
  return (
    Number(error?.upstreamStatus) === 404 ||
    message.includes("not_found") ||
    message.includes("route not found") ||
    responseError === "not_found" ||
    responseMessage.includes("route not found")
  );
}

function getWebBaseUrl(env) {
  return str(env.WEB_BASE_URL || "https://mmdbkk.com").replace(/\/+$/, "");
}

function buildAbsoluteUrl(value, fallbackBase) {
  const raw = str(value);
  if (!raw) return fallbackBase;
  if (/^https?:\/\//i.test(raw)) return raw;
  return `${fallbackBase}${raw.startsWith("/") ? "" : "/"}${raw}`;
}

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

async function signConfirmToken(payload, secret) {
  const encoded = base64UrlEncode(JSON.stringify(payload || {}));
  const signature = await hmacSha256Hex(encoded, secret);
  return `${encoded}.${signature}`;
}

async function mintLocalConfirmLinks(env, payload) {
  const confirmKey = str(env.CONFIRM_KEY);
  if (!confirmKey) throw new Error("missing_confirm_key");

  const session_id = str(payload.session_id) || `sess_${crypto.randomUUID()}`;
  const payment_ref = str(payload.payment_ref) || `pay_${Date.now().toString(36)}_${crypto.randomUUID().slice(0, 8)}`;
  const payment_type = str(payload.payment_type || payload.payment_stage || "full") || "full";
  const base = getWebBaseUrl(env);
  const customerConfirmPage = buildAbsoluteUrl(
    payload.confirm_page || "/confirm/job-confirmation",
    base
  );
  const modelConfirmPage = buildAbsoluteUrl(
    payload.model_confirm_page || "/confirm/job-model",
    base
  );

  const customer_t = await signConfirmToken(
    {
      kind: "customer_confirm",
      role: "customer",
      session_id,
      payment_ref,
      payment_type,
    },
    confirmKey
  );
  const model_t = await signConfirmToken(
    {
      kind: "model_confirm",
      role: "model",
      session_id,
      payment_ref,
      payment_type,
    },
    confirmKey
  );

  return {
    mode: "local_fallback",
    session_id,
    payment_ref,
    customer_t,
    model_t,
    customer_confirmation_url: `${customerConfirmPage}?t=${encodeURIComponent(customer_t)}`,
    model_confirmation_url: `${modelConfirmPage}?t=${encodeURIComponent(model_t)}`,
    confirmation_url: `${customerConfirmPage}?t=${encodeURIComponent(customer_t)}`,
    confirm_url: `${customerConfirmPage}?t=${encodeURIComponent(customer_t)}`,
  };
}

/* =========================
   Telegram internal send (optional)
========================= */
async function telegramInternalSend(env, payload) {
  const url = env.TELEGRAM_INTERNAL_SEND_URL;
  const token = env.INTERNAL_TOKEN;
  if ((!url && !env.TELEGRAM_WORKER) || !token) {
    return { ok: false, error: "missing_telegram_internal_env" };
  }

  const body = {
    chat_id: payload.chat_id,
    message_thread_id: payload.message_thread_id,
    text: payload.text,
    parse_mode: payload.parse_mode || "HTML",
    disable_web_page_preview: payload.disable_web_page_preview ?? true,
  };

  const requestInit = {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Internal-Token": token,
    },
    body: JSON.stringify(body),
  };
  const res = env.TELEGRAM_WORKER
    ? await env.TELEGRAM_WORKER.fetch(
        new Request("https://telegram-worker.internal/telegram/internal/send", requestInit),
      )
    : await fetch(url, requestInit);

  let data = null;
  try {
    data = await res.json();
  } catch (_) {}

  if (!res.ok) return { ok: false, status: res.status, data };
  return { ok: true, data };
}
