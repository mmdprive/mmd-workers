// src/index.js
// =========================================================
// admin-worker — Admin API / Core Orchestrator
//
// LOCK: core-production + controlled immigration bridge
//
// SYSTEM LAYERS
// ---------------------------------------------------------
// CORE SYSTEM
//   - admin ping / stats
//   - members list / update
//   - models list / upsert
//   - telegram internal DM
//   - job creation -> payments-worker confirm link mint
//
// IMMIGRATION / MIGRATION LAYER
//   - console inbox writer
//   - payment proofs writer
//   - default-name table routes may be bridge-compatible
//
// IMPORTANT
//   - admin-worker is allowed to write Airtable
//   - chat-worker must NOT write Airtable directly
//   - immigration layer must not be confused with canonical core contracts
// ==========================================================

const LOCK = "admin-worker-v2026-03-11-full";
const AIRTABLE_API = "https://api.airtable.com/v0";

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const path = url.pathname;
    const method = req.method.toUpperCase();
    const cors = corsHeaders(req, env);

    if (method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    // ------------------------------------------------------
    // Public ping
    // ------------------------------------------------------
    if (method === "GET" && (path === "/ping" || path === "/health")) {
      return withCors(
        json({
          ok: true,
          worker: "admin-worker",
          lock: LOCK,
          ts: Date.now(),
        }),
        cors
      );
    }

    // ------------------------------------------------------
    // DEMO LINKS (internal tool + public confirm fetch)
    // ------------------------------------------------------
    if (method === "POST" && path === "/v1/demo-links/create") {
      return withCors(await demoLinksCreate(req, env), cors);
    }

    if (method === "GET" && path === "/v1/demo-links/get") {
      return withCors(await demoLinksGet(req, env), cors);
    }

    // ------------------------------------------------------
    // Admin routes
    // ------------------------------------------------------
    if (path.startsWith("/v1/admin/")) {
      if (!isAllowedOrigin(req, env)) {
        return withCors(json({ ok: false, error: "origin_not_allowed" }, 403), cors);
      }

      // ====================================================
      // IMMIGRATION / WRITER ENDPOINTS
      // STRICT: X-Confirm-Key only
      // ====================================================
      if (method === "POST" && path === "/v1/admin/console/inbox") {
        if (!isConfirmKeyAuthed(req, env)) {
          return withCors(json({ ok: false, error: "unauthorized" }, 401), cors);
        }

        const body = await safeJson(req);

        if (!env.AIRTABLE_API_KEY || !env.AIRTABLE_BASE_ID) {
          return withCors(json({ ok: false, error: "missing_airtable_env" }, 500), cors);
        }

        const fields = {
          inbox_id: str(body.inbox_id || crypto.randomUUID()),
          source: str(body.source || "admin_console"),
          intent: str(body.intent || "note_only"),

          member_name: str(body.member_name || ""),
          member_email: str(body.member_email || ""),
          member_phone: str(body.member_phone || ""),
          memberstack_id: str(body.memberstack_id || ""),
          telegram_id: str(body.telegram_id || ""),
          telegram_username: str(body.telegram_username || ""),
          line_user_id: str(body.line_user_id || ""),
          line_id: str(body.line_id || ""),
          legacy_tags: str(body.legacy_tags || ""),

          admin_note: str(body.admin_note || ""),
          payload_json: JSON.stringify(body.payload_json || body || {}),
          status: str(body.status || "new"),
          error_message: str(body.error_message || ""),
        };

        if (body.linked_member) fields.linked_member = [str(body.linked_member)];
        if (body.linked_session) fields.linked_session = [str(body.linked_session)];
        if (body.linked_payment) fields.linked_payment = [str(body.linked_payment)];

        try {
          const rec = await airtableCreate({
            baseId: env.AIRTABLE_BASE_ID,
            tableId: env.AIRTABLE_TABLE_CONSOLE_INBOX_ID || "tblFHmfpB2TTrzO2e",
            apiKey: env.AIRTABLE_API_KEY,
            fields,
          });

          return withCors(
            json({
              ok: true,
              layer: "immigration",
              record_id: rec?.id || null,
            }),
            cors
          );
        } catch (e) {
          return withCors(json({ ok: false, error: String(e?.message || e) }, 500), cors);
        }
      }

      if (method === "POST" && path === "/v1/admin/payment/proof") {
        if (!isConfirmKeyAuthed(req, env)) {
          return withCors(json({ ok: false, error: "unauthorized" }, 401), cors);
        }

        const body = await safeJson(req);

        if (!env.AIRTABLE_API_KEY || !env.AIRTABLE_BASE_ID) {
          return withCors(json({ ok: false, error: "missing_airtable_env" }, 500), cors);
        }

        const fields = {
          proof_id: str(body.proof_id || crypto.randomUUID()),
          payer_name: str(body.payer_name || ""),
          amount_thb: num(body.amount_thb || 0),
          paid_at: body.paid_at || null,
          channel: str(body.channel || "bank_transfer"),
          payment_ref: str(body.payment_ref || ""),
          slip_url: str(body.slip_url || ""),
          note: str(body.note || ""),
          status: str(body.status || "pending"),
        };

        if (body.verified_at) fields.verified_at = body.verified_at;
        if (body.verified_by) fields.verified_by = str(body.verified_by);
        if (body.member) fields.member = [str(body.member)];
        if (body.session) fields.session = [str(body.session)];
        if (body.payment) fields.payment = [str(body.payment)];

        try {
          const rec = await airtableCreate({
            baseId: env.AIRTABLE_BASE_ID,
            tableId: env.AIRTABLE_TABLE_PAYMENT_PROOFS_ID || "tblfJfM4Sqag9zrLi",
            apiKey: env.AIRTABLE_API_KEY,
            fields,
          });

          return withCors(
            json({
              ok: true,
              layer: "immigration",
              record_id: rec?.id || null,
            }),
            cors
          );
        } catch (e) {
          return withCors(json({ ok: false, error: String(e?.message || e) }, 500), cors);
        }
      }

      // ====================================================
      // CORE ADMIN AUTH
      // Bearer OR Confirm-Key
      // ====================================================
      if (!isAuthed(req, env)) {
        return withCors(json({ ok: false, error: "unauthorized" }, 401), cors);
      }

      // ----------------------------------------------------
      // Core ping
      // ----------------------------------------------------
      if (method === "GET" && path === "/v1/admin/ping") {
        return withCors(
          json({
            ok: true,
            admin: true,
            worker: "admin-worker",
            lock: LOCK,
            ts: Date.now(),
          }),
          cors
        );
      }

      // ----------------------------------------------------
      // Stats
      // ----------------------------------------------------
      if (method === "GET" && path === "/v1/admin/stats") {
        const labels = buildLastNDays(7);

        return withCors(
          json({
            ok: true,
            layer: "core",
            summary: {
              total_members: 0,
              total_models: 0,
              revenue_30d_thb: 0,
            },
            trends: {
              labels,
              members_new: labels.map(() => 0),
              revenue_thb: labels.map(() => 0),
              payments_count: labels.map(() => 0),
              points_issued: labels.map(() => 0),
            },
          }),
          cors
        );
      }

      // ----------------------------------------------------
      // Members list
      // CORE OR BRIDGE-COMPATIBLE depending on table config
      // ----------------------------------------------------
      if (method === "GET" && path === "/v1/admin/members/list") {
        const q = str(url.searchParams.get("q") || "");
        const limit = clampInt(url.searchParams.get("limit"), 1, 200, 50);

        const tableName = env.AIRTABLE_TABLE_MEMBERS || "members";

        const items = await airtableList(env, tableName, {
          q,
          limit,
          matchFields: ["name", "nickname", "memberstack_id", "telegram_username", "telegram_id", "mmd_client_name"],
        });

        return withCors(
          json({
            ok: true,
            layer: inferLayerFromTable(tableName),
            items,
          }),
          cors
        );
      }

      // ----------------------------------------------------
      // Members update
      // CORE OR BRIDGE-COMPATIBLE depending on table config
      // ----------------------------------------------------
      if (method === "POST" && path === "/v1/admin/members/update") {
        const body = await safeJson(req);
        const tableName = env.AIRTABLE_TABLE_MEMBERS || "members";

        const rawPatch = body?.patch && typeof body.patch === "object" ? body.patch : {};
        const patch = pickAllowedFields(rawPatch, getAllowedMemberPatchFields(env));

        const out = await airtableUpdateByIdOrField(
          env,
          tableName,
          { ...body, patch },
          {
            idField: "id",
            lookupField: "memberstack_id",
            patchField: "patch",
          }
        );

        return withCors(
          json({
            ok: true,
            layer: inferLayerFromTable(tableName),
            updated: out,
          }),
          cors
        );
      }

      // ----------------------------------------------------
      // Telegram DM
      // CORE
      // ----------------------------------------------------
      if (method === "POST" && path === "/v1/admin/telegram/dm") {
        const body = await safeJson(req);
        const r = await telegramInternalSend(env, body);

        return withCors(
          json(
            {
              ok: r.ok,
              layer: "core",
              telegram: r,
            },
            r.ok ? 200 : 502
          ),
          cors
        );
      }

      // ----------------------------------------------------
      // Models list
      // CORE OR BRIDGE-COMPATIBLE depending on table config
      // ----------------------------------------------------
      if (method === "GET" && path === "/v1/admin/models/list") {
        const q = str(url.searchParams.get("q") || "");
        const limit = clampInt(url.searchParams.get("limit"), 1, 200, 50);

        const tableName = env.AIRTABLE_TABLE_MODELS || "models";

        const items = await airtableList(env, tableName, {
          q,
          limit,
          matchFields: ["name", "nickname", "telegram_username", "telegram_id", "unique_key"],
        });

        return withCors(
          json({
            ok: true,
            layer: inferLayerFromTable(tableName),
            items,
          }),
          cors
        );
      }

      // ----------------------------------------------------
      // Models upsert
      // CORE OR BRIDGE-COMPATIBLE depending on table config
      // ----------------------------------------------------
      if (method === "POST" && path === "/v1/admin/models/upsert") {
        const body = await safeJson(req);
        const tableName = env.AIRTABLE_TABLE_MODELS || "models";

        const rawFields = body?.fields && typeof body.fields === "object" ? body.fields : {};
        const fields = pickAllowedFields(rawFields, getAllowedModelFields(env));

        const out = await airtableUpsertModel(env, tableName, {
          ...body,
          fields,
        });

        return withCors(
          json({
            ok: true,
            layer: inferLayerFromTable(tableName),
            model: out,
          }),
          cors
        );
      }

      // ----------------------------------------------------
      // Admin job create
      // CORE
      // ----------------------------------------------------
      if (method === "POST" && path === "/v1/admin/job/create") {
        const body = await safeJson(req);

        try {
          const out = await createAdminJob(env, body);
          return withCors(
            json({
              ok: true,
              layer: "core",
              ...out,
            }),
            cors
          );
        } catch (e) {
          return withCors(json({ ok: false, error: String(e?.message || e || "job_create_failed") }, 500), cors);
        }
      }

      return withCors(json({ ok: false, error: "not_found" }, 404), cors);
    }

    return withCors(json({ ok: false, error: "not_found" }, 404), cors);
  },
};

/* =========================
   CORS
========================= */
function getAllowedOrigins(env) {
  return String(env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function isAllowedOrigin(req, env) {
  const allow = getAllowedOrigins(env);
  const origin = req.headers.get("Origin") || "";

  if (!origin) return true;
  if (allow.length === 0) return true;
  return allow.includes(origin);
}

function corsHeaders(req, env) {
  const origin = req.headers.get("Origin") || "";
  const allow = getAllowedOrigins(env);
  const h = new Headers();

  if (!origin) {
    // server-to-server
  } else if (allow.length === 0 || allow.includes(origin)) {
    h.set("Access-Control-Allow-Origin", origin);
    h.set("Vary", "Origin");
  }

  h.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  h.set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Confirm-Key");
  h.set("Access-Control-Max-Age", "86400");
  h.set("Content-Type", "application/json");
  return h;
}

function withCors(res, cors) {
  const headers = new Headers(res.headers);
  cors.forEach((v, k) => headers.set(k, v));
  return new Response(res.body, {
    status: res.status,
    headers,
  });
}

/* =========================
   Auth
========================= */
function isAuthed(req, env) {
  const auth = req.headers.get("Authorization") || "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (env.ADMIN_BEARER && bearer && bearer === env.ADMIN_BEARER) return true;

  const ck = str(req.headers.get("X-Confirm-Key") || "");
  if (env.CONFIRM_KEY && ck && ck === env.CONFIRM_KEY) return true;

  return false;
}

function isConfirmKeyAuthed(req, env) {
  const ck = str(req.headers.get("X-Confirm-Key") || "");
  return Boolean(env.CONFIRM_KEY && ck && ck === env.CONFIRM_KEY);
}

/* =========================
   JSON / utils
========================= */
function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

async function safeJson(req) {
  try {
    return await req.json();
  } catch (_) {
    return {};
  }
}

function str(value) {
  return String(value || "").trim();
}

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

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

function absoluteUrl(value, base) {
  const raw = str(value);
  if (!raw) return base;
  if (/^https?:\/\//i.test(raw)) return raw;
  return `${base}${raw.startsWith("/") ? "" : "/"}${raw}`;
}

function escHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function strReq(value, field) {
  const v = str(value);
  if (!v) throw new Error(`missing_${field}`);
  return v;
}

function numReq(value, field) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) throw new Error(`invalid_${field}`);
  return n;
}

function inferLayerFromTable(tableName) {
  const t = str(tableName).toLowerCase();
  if (t.includes("migration") || t.includes("immigration") || t.includes("bridge")) {
    return "immigration";
  }
  return "core_or_bridge";
}

function parseCsv(value) {
  return String(value || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function pickAllowedFields(obj, allowed) {
  const out = {};
  for (const key of allowed) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      out[key] = obj[key];
    }
  }
  return out;
}

function getAllowedMemberPatchFields(env) {
  return parseCsv(
    env.ALLOWED_MEMBER_PATCH_FIELDS ||
      [
        "name",
        "nickname",
        "mmd_client_name",
        "telegram_username",
        "telegram_id",
        "line_id",
        "line_user_id",
        "memberstack_id",
        "email",
        "phone",
        "legacy_tags",
        "notes",
        "status",
      ].join(",")
  );
}

function getAllowedModelFields(env) {
  return parseCsv(
    env.ALLOWED_MODEL_FIELDS ||
      [
        "name",
        "nickname",
        "telegram_username",
        "telegram_id",
        "unique_key",
        "status",
        "notes",
        "line_id",
      ].join(",")
  );
}

function normalizeDemoState(value) {
  const v = str(value).toLowerCase();
  if (v === "pending" || v === "paid" || v === "invalid") return v;
  return "pending";
}

function normalizePaymentType(value) {
  const v = str(value).toLowerCase();
  if (v === "deposit" || v === "final" || v === "full" || v === "tips") return v;
  return "final";
}

function generateDemoId() {
  return `demo_${crypto.randomUUID().replace(/-/g, "").slice(0, 18)}`;
}

function escapeFormulaString(value) {
  return String(value || "").replace(/"/g, '\\"');
}

function getDemoMessage(demoState) {
  if (demoState === "paid") {
    return "ระบบบันทึกรายการนี้เรียบร้อย และ session นี้ได้รับการยืนยันแล้ว";
  }
  if (demoState === "invalid") {
    return "ลิงก์อาจหมดอายุหรือไม่ถูกต้อง กรุณาติดต่อ MMD เพื่อรับลิงก์ใหม่";
  }
  return "ยอดคงเหลือสำหรับ session นี้ยังไม่ได้ชำระ สามารถดำเนินการต่อได้จากหน้านี้";
}

/* =========================
   DEMO LINKS
========================= */
async function demoLinksCreate(req, env) {
  if (!isAuthed(req, env)) {
    return json({ ok: false, error: "unauthorized" }, 401);
  }

  if (!env.AIRTABLE_API_KEY || !env.AIRTABLE_BASE_ID) {
    return json({ ok: false, error: "missing_airtable_env" }, 500);
  }

  const body = await safeJson(req);
  const demo_state = normalizeDemoState(body.demo_state);
  const confirm_base_url = str(body.confirm_base_url || env.WEB_BASE_URL || "https://mmdbkk.com").replace(/\/+$/, "");
  const demo_id = generateDemoId();

  const fields = {
    demo_id,
    demo_state,
    client_name: demo_state === "invalid" ? "" : str(body.client_name),
    model_name: demo_state === "invalid" ? "" : str(body.model_name),
    job_name: demo_state === "invalid" ? "" : str(body.job_name),
    event_date: demo_state === "invalid" ? "" : str(body.event_date),
    event_time: demo_state === "invalid" ? "" : str(body.event_time),
    location_name: demo_state === "invalid" ? "" : str(body.location_name),
    amount_thb: demo_state === "invalid" ? 0 : num(body.amount_thb),
    session_id: demo_state === "invalid" ? "" : str(body.session_id),
    payment_ref: demo_state === "invalid" ? "" : str(body.payment_ref),
    payment_type: demo_state === "invalid" ? "" : normalizePaymentType(body.payment_type),
    created_by: str(body.created_by || "admin"),
    notes: str(body.notes || ""),
    confirm_base_url,
    generated_url: `${confirm_base_url}/confirm#demo_id=${encodeURIComponent(demo_id)}`,
    created_at_iso: new Date().toISOString(),
    updated_at_iso: new Date().toISOString(),
    is_active: true,
  };

  if (demo_state !== "invalid") {
    const required = [
      ["client_name", fields.client_name],
      ["model_name", fields.model_name],
      ["job_name", fields.job_name],
      ["event_date", fields.event_date],
      ["event_time", fields.event_time],
      ["location_name", fields.location_name],
    ];

    for (const [key, value] of required) {
      if (!value) {
        return json({ ok: false, error: `missing_${key}` }, 400);
      }
    }

    if (!Number.isFinite(fields.amount_thb) || fields.amount_thb <= 0) {
      return json({ ok: false, error: "invalid_amount_thb" }, 400);
    }
  }

  try {
    const rec = await airtableCreate({
      baseId: env.AIRTABLE_BASE_ID,
      tableId: env.AIRTABLE_TABLE_DEMO_LINKS || "demo_links",
      apiKey: env.AIRTABLE_API_KEY,
      fields,
    });

    return json({
      ok: true,
      demo_id,
      generated_url: fields.generated_url,
      airtable_record_id: rec?.id || null,
      data: fields,
    });
  } catch (e) {
    return json({ ok: false, error: String(e?.message || e || "demo_link_create_failed") }, 500);
  }
}

async function demoLinksGet(req, env) {
  if (!env.AIRTABLE_API_KEY || !env.AIRTABLE_BASE_ID) {
    return json({ ok: false, error: "missing_airtable_env" }, 500);
  }

  const url = new URL(req.url);
  const demo_id = str(url.searchParams.get("demo_id"));

  if (!demo_id) {
    return json({ ok: false, error: "missing_demo_id" }, 400);
  }

  try {
    const rec = await airtableFindOne(
      env,
      env.AIRTABLE_TABLE_DEMO_LINKS || "demo_links",
      `{demo_id}="${escapeFormulaString(demo_id)}"`
    );

    if (!rec) {
      return json({ ok: false, error: "not_found" }, 404);
    }

    const f = rec.fields || {};
    const demo_state = normalizeDemoState(f.demo_state);
    const amount_thb = demo_state === "invalid" ? "" : num(f.amount_thb);
    const is_paid = demo_state === "paid";

    return json({
      ok: true,
      demo_id: str(f.demo_id),
      demo_state,
      session_id: demo_state === "invalid" ? "" : str(f.session_id),
      payment_ref: demo_state === "invalid" ? "" : str(f.payment_ref),
      payment_type: demo_state === "invalid" ? "" : str(f.payment_type),
      amount_thb,
      remaining_amount_thb: demo_state === "invalid" ? "" : is_paid ? 0 : amount_thb,
      verification_status: demo_state === "invalid" ? "" : is_paid ? "Confirmed" : "Pending",
      payment_status: demo_state === "invalid" ? "" : is_paid ? "Paid" : "Unpaid",
      updated_at: str(f.updated_at_iso || f.created_at_iso),
      message: getDemoMessage(demo_state),
      client_name: demo_state === "invalid" ? "" : str(f.client_name),
      model_name: demo_state === "invalid" ? "" : str(f.model_name),
      job_name: demo_state === "invalid" ? "" : str(f.job_name),
      event_date: demo_state === "invalid" ? "" : str(f.event_date),
      event_time: demo_state === "invalid" ? "" : str(f.event_time),
      location_name: demo_state === "invalid" ? "" : str(f.location_name),
      promptpay_url: "",
      card_enabled: demo_state !== "invalid" && !is_paid,
      promptpay_enabled: demo_state !== "invalid" && !is_paid,
      is_paid,
      is_mock: true,
    });
  } catch (e) {
    return json({ ok: false, error: String(e?.message || e || "demo_link_get_failed") }, 500);
  }
}

/* =========================
   Airtable
========================= */
async function airtableFetch(env, path, init) {
  const key = env.AIRTABLE_API_KEY;
  const base = env.AIRTABLE_BASE_ID;

  if (!key || !base) {
    return { ok: false, error: "missing_airtable_env" };
  }

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
  } catch (_) {
    data = null;
  }

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
  return records.map((rec) => ({
    id: rec.id,
    fields: rec.fields || {},
    createdTime: rec.createdTime,
  }));
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
  return { ok: true, id: r.data?.id, fields: r.data?.fields || {} };
}

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

async function airtableUpsertModel(env, tableName, body) {
  if (!env.AIRTABLE_API_KEY || !env.AIRTABLE_BASE_ID) {
    return { ok: false, error: "missing_airtable_env" };
  }

  const fields = body?.fields && typeof body.fields === "object" ? body.fields : {};
  const id = body?.id || null;

  if (id) {
    return await airtablePatchById(env, tableName, id, fields);
  }

  if (body?.unique_key) {
    const safe = String(body.unique_key).replace(/"/g, '\\"');
    const found = await airtableFindOne(env, tableName, `{unique_key}="${safe}"`);

    if (found?.id) {
      return await airtablePatchById(env, tableName, found.id, fields);
    }

    const r = await airtableFetch(env, `/${encodeURIComponent(tableName)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        records: [{ fields: { ...fields, unique_key: body.unique_key } }],
      }),
    });

    if (!r.ok) return { ok: false, error: "airtable_create_failed", detail: r };
    const rec = r.data?.records?.[0];
    return { ok: true, id: rec?.id, fields: rec?.fields || {} };
  }

  const r = await airtableFetch(env, `/${encodeURIComponent(tableName)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      records: [{ fields }],
    }),
  });

  if (!r.ok) return { ok: false, error: "airtable_create_failed", detail: r };
  const rec = r.data?.records?.[0];
  return { ok: true, id: rec?.id, fields: rec?.fields || {} };
}

async function airtableCreate({ baseId, tableId, apiKey, fields }) {
  const r = await fetch(`${AIRTABLE_API}/${baseId}/${encodeURIComponent(tableId)}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      records: [{ fields }],
      typecast: true,
    }),
  });

  const t = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(JSON.stringify(t));
  return t.records?.[0];
}

/* =========================
   Telegram internal
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
  } catch (_) {
    data = null;
  }

  if (!res.ok) return { ok: false, status: res.status, data };
  return { ok: true, data };
}

/* =========================
   Job create
========================= */
async function createAdminJob(env, body) {
  const client_name = strReq(body.client_name, "client_name");
  const model_name = strReq(body.model_name, "model_name");
  const job_type = strReq(body.job_type, "job_type");
  const job_date = strReq(body.job_date, "job_date");
  const start_time = strReq(body.start_time, "start_time");
  const end_time = strReq(body.end_time, "end_time");
  const location_name = strReq(body.location_name, "location_name");

  const google_map_url = str(body.google_map_url || "");
  const note = str(body.note || body.notes || "");
  const payment_type = str(body.payment_type || "full");
  const payment_method = str(body.payment_method || "promptpay");
  const amount_thb = numReq(body.amount_thb, "amount_thb");

  const webBase = str(env.WEB_BASE_URL || "https://mmdbkk.com").replace(/\/+$/, "");
  const confirm_page = absoluteUrl(body.confirm_page || "/confirm/job-confirmation", webBase);
  const model_confirm_page = absoluteUrl(body.model_confirm_page || "/confirm/job-model", webBase);

  const payload = {
    client_name,
    model_name,
    job_type,
    job_date,
    start_time,
    end_time,
    location_name,
    google_map_url,
    amount_thb,
    payment_type,
    payment_method,
    note,
    confirm_page,
    model_confirm_page,
  };

  const minted = await callPaymentsCreateLink(env, payload);

  const session_id = minted.session_id || minted.sessionId || "";
  const payment_ref = minted.payment_ref || minted.paymentRef || "";

  const customer_confirmation_url =
    minted.customer_confirmation_url ||
    minted.confirmation_url ||
    (minted.customer_t ? `${confirm_page}?t=${encodeURIComponent(minted.customer_t)}` : "") ||
    (minted.t ? `${confirm_page}?t=${encodeURIComponent(minted.t)}` : "");

  const model_confirmation_url =
    minted.model_confirmation_url ||
    (minted.model_t ? `${model_confirm_page}?t=${encodeURIComponent(minted.model_t)}` : "") ||
    (minted.t ? `${model_confirm_page}?t=${encodeURIComponent(minted.t)}` : "");

  if (!customer_confirmation_url) throw new Error("missing_customer_confirmation_url");
  if (!model_confirmation_url) throw new Error("missing_model_confirmation_url");

  await notifyJobCreated(env, {
    session_id,
    payment_ref,
    client_name,
    model_name,
    job_type,
    job_date,
    start_time,
    end_time,
    location_name,
    amount_thb,
    customer_confirmation_url,
    model_confirmation_url,
  });

  return {
    session_id,
    payment_ref,
    customer_confirmation_url,
    model_confirmation_url,
    raw: minted,
  };
}

async function callPaymentsCreateLink(env, payload) {
  const base = str(env.PAYMENTS_WORKER_BASE_URL || "").replace(/\/+$/, "");
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
  } catch (_) {
    data = null;
  }

  if (!res.ok) {
    throw new Error(data?.error || data?.message || `payments_worker_http_${res.status}`);
  }

  return data || {};
}

async function notifyJobCreated(env, data) {
  if (!env.TELEGRAM_INTERNAL_SEND_URL || !env.INTERNAL_TOKEN) return;

  const lines = [
    "🔗 <b>JOB LINKS CREATED</b>",
    `Client: <b>${escHtml(data.client_name)}</b>`,
    `Model: <b>${escHtml(data.model_name)}</b>`,
    `Type: <b>${escHtml(data.job_type)}</b>`,
    `Date: <b>${escHtml(data.job_date)}</b>`,
    `Time: <b>${escHtml(data.start_time)} - ${escHtml(data.end_time)}</b>`,
    `Location: <b>${escHtml(data.location_name)}</b>`,
    `Amount: <b>${Number(data.amount_thb).toLocaleString("en-US")} THB</b>`,
    `Session: <code>${escHtml(data.session_id || "-")}</code>`,
    `Payment Ref: <code>${escHtml(data.payment_ref || "-")}</code>`,
    "",
    `Customer URL: ${escHtml(data.customer_confirmation_url)}`,
    `Model URL: ${escHtml(data.model_confirmation_url)}`,
  ];

  await telegramInternalSend(env, {
    chat_id: env.TELEGRAM_CHAT_ID || "-1003546439681",
    message_thread_id: env.TG_THREAD_CONFIRM || 61,
    text: lines.join("\n"),
    parse_mode: "HTML",
    disable_web_page_preview: true,
  });
}
