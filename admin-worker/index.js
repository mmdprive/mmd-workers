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
    // Admin routes
    // ------------------------------------------------------
    if (path.startsWith("/v1/admin/")) {
      if (!isAllowedOrigin(req, env)) {
        return withCors(json({ ok: false, error: "origin_not_allowed" }, 403), cors);
      }

      if (
        (method === "GET" || method === "HEAD") &&
        (path === "/internal/admin/jobs/create-session" || path === "/v1/admin/jobs/create-session")
      ) {
        return withCors(renderCreateSessionPage(method), cors);
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

      // ----------------------------------------------------
      // CEO Dashboard (INTERNAL_TOKEN auth)
      // ----------------------------------------------------
      if (method === "GET" && path === "/v1/admin/dashboard/ceo") {
        const auth = req.headers.get("Authorization") || "";
        if (!env.INTERNAL_TOKEN || auth !== `Bearer ${env.INTERNAL_TOKEN}`) {
          return withCors(json({ ok: false, error: "unauthorized" }, 401), cors);
        }
        try {
          const result = await getDashboardCEO(env);
          return withCors(json(result), cors);
        } catch (err) {
          return withCors(
            json({
              ok: false,
              error: "dashboard_ceo_failed",
              message: err && err.message ? err.message : String(err),
            }, 500),
            cors
          );
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
      // Admin create-session
      // ----------------------------------------------------
      if (
        method === "POST" &&
        (path === "/internal/admin/jobs/create-session" ||
          path === "/v1/admin/jobs/create-session" ||
          path === "/v1/admin/create-session")
      ) {
        const body = await safeJson(req);

        try {
          const out = await createAdminSession(env, body || {});
          return withCors(json({ ok: true, layer: "core", ...out }), cors);
        } catch (e) {
          return withCors(json({ ok: false, error: String(e?.message || e || "create_session_failed") }, 500), cors);
        }
      }

      // ----------------------------------------------------
      // Admin job create
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
      pre { overflow:auto; padding:18px; border-radius:20px; border:1px solid var(--line); background:rgba(7,6,10,.72); color:var(--text); font:.9rem/1.6 SFMono-Regular, Consolas, Menlo, monospace; }
      @media (max-width: 720px) { .grid, .summary-grid { grid-template-columns:1fr; } .topbar { align-items:flex-start; flex-direction:column; } }
    </style>
  </head>
  <body>
    <main class="shell">
      <div class="topbar">
        <div>
          <p class="kicker">Internal Admin / Jobs</p>
          <h1>สร้างเซสชัน</h1>
          <p class="lead">กรอก Bearer Token หรือ Confirm Key หนึ่งครั้ง แล้วค้นหา member/model จาก Airtable ได้ทันที ก่อนกดสร้าง confirmation link สำหรับ session ใหม่</p>
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
          <label>ค้นหา Member<input id="member_search" type="text" placeholder="ชื่อ, nickname, memberstack id, telegram" /></label>
          <label>ค้นหา Model<input id="model_search" type="text" placeholder="ชื่อ, nickname, telegram, unique key" /></label>
          <label class="grid-full">ผลการค้นหา Member<select id="member_results" size="5"></select></label>
          <label class="grid-full">ผลการค้นหา Model<select id="model_results" size="5"></select></label>
          <label>Memberstack ID<input id="memberstack_id" type="text" required /></label>
          <label>Model ID<input id="model_id" type="text" required /></label>
          <label>จำนวนเงิน THB<input id="amount_thb" type="number" min="1" step="1" required /></label>
          <label>จ่ายโมเดล THB<input id="pay_model_thb" type="number" min="0" step="1" /></label>
          <label>Currency<input id="currency" type="text" value="THB" /></label>
          <label>Payment Ref<input id="payment_ref" type="text" /></label>
          <label>Session ID<input id="session_id" type="text" /></label>
          <label>Return URL<input id="return_url" type="url" /></label>
          <label class="grid-full">Cancel URL<input id="cancel_url" type="url" /></label>
          <label class="grid-full">Metadata JSON<textarea id="metadata" placeholder='{"source":"manual_immigrate","line_user_id":"..."}'></textarea></label>
        </div>
        <p class="hint">บังคับกรอก memberstack_id, model_id และ amount_thb ส่วน metadata ไม่บังคับ แต่ถ้าใส่ต้องเป็น JSON ที่ถูกต้อง</p>
        <div class="actions">
          <button id="search_member" class="ghost" type="button">ค้นหา Member</button>
          <button id="search_model" class="ghost" type="button">ค้นหา Model</button>
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
        const searchMemberButton = document.getElementById("search_member");
        const searchModelButton = document.getElementById("search_model");
        const copyConfirmationUrlButton = document.getElementById("copy_confirmation_url");
        const memberSummary = document.getElementById("member_summary");
        const modelSummary = document.getElementById("model_summary");
        const bearer = document.getElementById("bearer");
        const confirmKey = document.getElementById("confirmKey");
        const form = document.getElementById("create-session-form");
        const memberSearch = document.getElementById("member_search");
        const modelSearch = document.getElementById("model_search");
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
          target.textContent = Array.isArray(lines) && lines.length ? lines.filter(Boolean).join("\n") : "-";
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
        function applyOptions(select, items, kind) {
          select.innerHTML = "";
          if (!Array.isArray(items) || !items.length) {
            const option = document.createElement("option");
            option.textContent = kind === "member" ? "ไม่พบ member" : "ไม่พบ model";
            option.value = "";
            select.appendChild(option);
            return;
          }
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
        async function runLookup(kind) {
          const query = (kind === "member" ? memberSearch.value : modelSearch.value).trim();
          const select = kind === "member" ? memberResults : modelResults;
          const path = kind === "member" ? "/v1/admin/members/list" : "/v1/admin/models/list";
          setStatus(kind === "member" ? "กำลังค้นหา member..." : "กำลังค้นหา model...");
          setResult("Working...");
          try {
            const params = new URLSearchParams();
            if (query) params.set("q", query);
            params.set("limit", "10");
            const response = await fetch(path + "?" + params.toString(), { method: "GET", headers: buildHeaders() });
            const data = await response.json().catch(() => null);
            if (!response.ok || !data) {
              setStatus((data && (data.error?.message || data.error)) || "ค้นหาไม่สำเร็จ", "error");
              setResult(data || { ok: false, status: response.status });
              return;
            }
            applyOptions(select, data.items || [], kind);
            setStatus(kind === "member" ? "โหลดรายการ member แล้ว" : "โหลดรายการ model แล้ว", "success");
            setResult(data);
          } catch (error) {
            setStatus(kind === "member" ? "ค้นหา member ไม่สำเร็จ" : "ค้นหา model ไม่สำเร็จ", "error");
            setResult({ ok: false, error: String(error && error.message ? error.message : error) });
          }
        }
        function readOptionalNumber(id) {
          const raw = document.getElementById(id).value.trim();
          if (!raw) return null;
          const num = Number(raw);
          return Number.isFinite(num) ? num : NaN;
        }
        loadAuth();
        bearer.addEventListener("change", saveAuth);
        confirmKey.addEventListener("change", saveAuth);
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
        searchMemberButton.addEventListener("click", () => runLookup("member"));
        searchModelButton.addEventListener("click", () => runLookup("model"));
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
          submit.disabled = true;
          submit.textContent = "กำลังสร้าง...";
          setStatus("กำลังส่งคำขอ create-session...");
          setResult("Working...");
          try {
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

async function airtableListAll(env, tableId) {
  if (!env.AIRTABLE_API_KEY || !env.AIRTABLE_BASE_ID) return [];
  const all = [];
  let offset = "";
  do {
    const params = new URLSearchParams();
    params.set("pageSize", "100");
    if (offset) params.set("offset", offset);
    const r = await airtableFetch(env, `/${encodeURIComponent(tableId)}?${params.toString()}`);
    if (!r.ok) break;
    const records = r.data?.records || [];
    for (const rec of records) {
      all.push({ id: rec.id, fields: rec.fields || {} });
    }
    offset = r.data?.offset || "";
  } while (offset);
  return all;
}

async function getDashboardCEO(env) {
  const [ledgerRecords, payoutRecords, batchRecords] = await Promise.all([
    airtableListAll(env, "tbl2hqvi2hmk3wpe0"),
    airtableListAll(env, "tblJF9dH59FK31dgA"),
    airtableListAll(env, "tblwFgl4et1TOgtNn"),
  ]);

  let revenue = 0;
  let cost = 0;
  let margin = 0;
  let outstanding = 0;
  let cashPaid = 0;

  const trendMap = new Map();
  const supplierMap = new Map();

  for (const rec of ledgerRecords) {
    const f = rec.fields || {};
    const status = String(f["fld5c5KU1zqW5azXM"] || "");
    if (status === "void") continue;

    const date = String(f["fldD8EbMb2jegXKXn"] || "undated");
    const r = Number(f["fldGUHbjodVKZQuQZ"] || 0);
    const c = Number(f["fldcic1IRo0hB0A2z"] || 0);
    const m = Number(f["fldOTobGDmTVJCKTH"] || 0);
    const owed = Number(f["fldXX85oksNP4yinL"] || 0);

    revenue += r;
    cost += c;
    margin += m;

    if (status === "open") {
      outstanding += owed;
      const supplierIds = Array.isArray(f["fldwv8SHlbizOfWgm"]) ? f["fldwv8SHlbizOfWgm"] : [];
      for (const supplierId of supplierIds) {
        if (!supplierMap.has(supplierId)) {
          supplierMap.set(supplierId, {
            supplier_id: supplierId,
            supplier_name: supplierId,
            owed: 0,
            status: "ready_to_pay",
          });
        }
        supplierMap.get(supplierId).owed += owed;
      }
    }

    if (!trendMap.has(date)) {
      trendMap.set(date, { date, revenue: 0, cost: 0, margin: 0 });
    }
    const row = trendMap.get(date);
    row.revenue += r;
    row.cost += c;
    row.margin += m;
  }

  for (const rec of payoutRecords) {
    const f = rec.fields || {};
    const status = String(f["fldgo6dkYaHg8pgSr"] || "");
    if (status === "paid") {
      cashPaid += Number(f["flddxwAqW0JQFTcUF"] || 0);
    }
  }

  const lowStockBatches = batchRecords.filter(
    (rec) => String(rec.fields["fldYtzXtBvK3HuqQa"] || "") === "Low"
  ).length;

  const depletedBatches = batchRecords.filter(
    (rec) => String(rec.fields["fldZW2m1Xq8q0ZH9Z"] || "").toLowerCase() === "depleted"
  ).length;

  return {
    ok: true,
    summary: {
      revenue,
      cost,
      margin,
      outstanding,
      cash_paid: cashPaid,
      net_after_supplier: margin - outstanding,
      low_stock_batches: lowStockBatches,
      depleted_batches: depletedBatches,
    },
    trend: Array.from(trendMap.values())
      .sort((a, b) => String(a.date).localeCompare(String(b.date)))
      .slice(-14),
    supplier_balances: Array.from(supplierMap.values()).sort((a, b) => b.owed - a.owed),
  };
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
async function createAdminSession(env, body) {
  const required = ["memberstack_id", "model_id", "amount_thb"];
  const missing = required.filter((k) => body?.[k] == null || body?.[k] === "");
  if (missing.length) throw new Error(`missing_required_fields:${missing.join(",")}`);

  const amount = Number(body.amount_thb);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("invalid_amount_thb");

  const payModelAmount = Number(body.pay_model_thb ?? body.pay_model ?? body.model_pay_thb ?? body.model_pay);
  const hasPayModelAmount = body?.pay_model_thb != null || body?.pay_model != null || body?.model_pay_thb != null || body?.model_pay != null;
  if (hasPayModelAmount && (!Number.isFinite(payModelAmount) || payModelAmount < 0)) {
    throw new Error("invalid_pay_model_thb");
  }

  const payload = {
    session_id: str(body.session_id || `sess_${crypto.randomUUID()}`),
    payment_ref: str(body.payment_ref || `admin_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`),
    memberstack_id: str(body.memberstack_id),
    model_id: str(body.model_id),
    amount_thb: amount,
    pay_model_thb: hasPayModelAmount ? payModelAmount : null,
    currency: str(body.currency || "THB"),
    return_url: body.return_url || body.success_url || null,
    cancel_url: body.cancel_url || null,
    metadata: body.metadata && typeof body.metadata === "object" ? body.metadata : {},
  };

  const confirmData = await callPaymentsCreateLink(env, payload);
  const confirmation_url = confirmData.confirmation_url || confirmData.confirm_url || confirmData.url || confirmData.link || null;

  return {
    session_id: payload.session_id,
    payment_ref: payload.payment_ref,
    amount_thb: payload.amount_thb,
    pay_model_thb: payload.pay_model_thb,
    memberstack_id: payload.memberstack_id,
    model_id: payload.model_id,
    confirmation_url,
    confirm_url: confirmData.confirm_url || confirmation_url,
    short_url: confirmData.short_url || null,
    payments_response: confirmData,
  };
}

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
