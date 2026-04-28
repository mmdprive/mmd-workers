import { safeJson } from "./lib/http.js";
import { buildSummary } from "./lib/summary.js";

const AIRTABLE_API = "https://api.airtable.com/v0";

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const path = url.pathname;
    const method = req.method.toUpperCase();

    if (method === "OPTIONS") {
      return corsPreflight(req, env);
    }

    if (method === "GET" && path === "/ping") {
      return withCors(
        req,
        env,
        jsonResponse({
          ok: true,
          worker: "summary-worker",
          ts: Date.now(),
        })
      );
    }

    if (method === "GET" && path === "/pay/summary") {
      return handlePaySummary(req, env);
    }

    if (method === "POST" && path === "/member/api/renewal/intake") {
      if (!isAllowedOrigin(req, env)) {
        return withCors(
          req,
          env,
          jsonResponse(
            {
              ok: false,
              error: { code: "origin_not_allowed", message: "Origin not allowed" },
            },
            403
          )
        );
      }

      return handleRenewalIntake(req, env);
    }

    const adminPrefix = getAdminPrefix(path);
    if (adminPrefix) {
      const adminPath = path.slice(adminPrefix.length) || "/";

      if (!isAllowedOrigin(req, env)) {
        return withCors(
          req,
          env,
          jsonResponse(
            {
              ok: false,
              error: { code: "origin_not_allowed", message: "Origin not allowed" },
            },
            403
          )
        );
      }

      if (
        (method === "GET" || method === "HEAD") &&
        (adminPath === "/jobs/create-session" || adminPath === "/create-session")
      ) {
        return withCors(req, env, renderCreateSessionPage(method));
      }

      if (!isAuthed(req, env)) {
        return withCors(
          req,
          env,
          jsonResponse(
            {
              ok: false,
              error: { code: "unauthorized", message: "Unauthorized" },
            },
            401
          )
        );
      }

      if (
        method === "POST" &&
        (adminPath === "/job/create" ||
          adminPath === "/jobs/create-session" ||
          adminPath === "/create-session")
      ) {
        const body = await safeJson(req);
        const out = await createAdminSession(env, body || {});
        const status = out.ok ? 200 : out.status || 400;
        return withCors(req, env, jsonResponse(out, status));
      }
    }

    if (method === "GET" && path === "/v1/admin/member/summary") {
      if (!isAuthed(req, env)) {
        return withCors(
          req,
          env,
          jsonResponse(
            {
              ok: false,
              error: { code: "unauthorized", message: "Unauthorized" },
            },
            401
          )
        );
      }

      const t = toStr(url.searchParams.get("t"));
      if (!t) {
        return withCors(
          req,
          env,
          jsonResponse(
            {
              ok: false,
              error: { code: "missing_token", message: "Missing token" },
            },
            400
          )
        );
      }

      try {
        const tokenPayload = await readTokenFromKV(env, t);
        if (!tokenPayload) {
          return withCors(
            req,
            env,
            jsonResponse(
              {
                ok: false,
                error: { code: "invalid_token", message: "Invalid or expired token" },
              },
              401
            )
          );
        }

        const result = await buildSummary(env, tokenPayload, "internal");
        return withCors(req, env, jsonResponse(result));
      } catch (err) {
        return withCors(
          req,
          env,
          jsonResponse(
            {
              ok: false,
              error: {
                code: "internal_summary_failed",
                message: String(err?.message || err || "internal_summary_failed"),
              },
            },
            500
          )
        );
      }
    }

    return withCors(
      req,
      env,
      jsonResponse(
        {
          ok: false,
          error: { code: "not_found", message: "Not found" },
        },
        404
      )
    );
  },
};

async function handlePaySummary(req, env) {
  const url = new URL(req.url);
  const t = toStr(url.searchParams.get("t"));

  if (!t) {
    return withCors(
      req,
      env,
      jsonResponse(
        {
          ok: false,
          error: { code: "missing_token", message: "Missing token" },
        },
        400
      )
    );
  }

  try {
    const tokenPayload = await readTokenFromKV(env, t);
    if (!tokenPayload) {
      return withCors(
        req,
        env,
        jsonResponse(
          {
            ok: false,
            error: { code: "invalid_token", message: "Invalid or expired token" },
          },
          401
        )
      );
    }

    const summary = await buildSummary(env, tokenPayload, "public");
    return withCors(req, env, jsonResponse(summary));
  } catch (err) {
    return withCors(
      req,
      env,
      jsonResponse(
        {
          ok: false,
          error: {
            code: "summary_failed",
            message: String(err?.message || err || "summary_failed"),
          },
        },
        500
      )
    );
  }
}

async function handleRenewalIntake(req, env) {
  const body = await safeJson(req);
  if (!body || typeof body !== "object") {
    return withCors(
      req,
      env,
      jsonResponse(
        {
          ok: false,
          error: { code: "invalid_input", message: "Valid renewal payload is required" },
        },
        400
      )
    );
  }

  const displayName = toStr(body.display_name || body.name).trim();
  const email = toStr(body.email).trim();
  const paymentMethod = toStr(body.payment_method || "promptpay").trim() || "promptpay";
  const packageCode = toStr(body.package_code || body.package).trim();
  const packageLabel = toStr(body.package_label || body.target_tier || packageCode).trim();
  const currentTier = toStr(body.current_tier_hint).trim();
  const serviceHistoryNote = toStr(body.service_history_note || body.manual_note || body.note).trim();
  const total = toNum(body.total);

  if (!displayName) {
    return withCors(
      req,
      env,
      jsonResponse(
        {
          ok: false,
          error: { code: "missing_name", message: "display_name or name is required" },
        },
        400
      )
    );
  }

  if (!email) {
    return withCors(
      req,
      env,
      jsonResponse(
        {
          ok: false,
          error: { code: "missing_email", message: "email is required" },
        },
        400
      )
    );
  }

  if (!serviceHistoryNote) {
    return withCors(
      req,
      env,
      jsonResponse(
        {
          ok: false,
          error: { code: "missing_note", message: "service_history_note or note is required" },
        },
        400
      )
    );
  }

  if (!Number.isFinite(total) || total < 0) {
    return withCors(
      req,
      env,
      jsonResponse(
        {
          ok: false,
          error: { code: "invalid_total", message: "total must be a valid number" },
        },
        400
      )
    );
  }

  if (!env.AIRTABLE_API_KEY || !env.AIRTABLE_BASE_ID) {
    return withCors(
      req,
      env,
      jsonResponse(
        {
          ok: false,
          error: { code: "missing_airtable_env", message: "Airtable env is not configured" },
        },
        500
      )
    );
  }

  const intakeId = `renewal_${Date.now().toString(36)}_${crypto.randomUUID().slice(0, 8)}`;
  const fields = {
    inbox_id: intakeId,
    source: "web",
    intent: "note_only",
    member_name: displayName,
    member_email: email,
    member_phone: toStr(body.phone || body.contact).trim(),
    memberstack_id: toStr(body.member_id || body.memberstack_id || body.member_ref).trim(),
    telegram_id: "",
    telegram_username: "",
    line_user_id: toStr(body.line_user_id).trim(),
    line_id: toStr(body.line_id).trim(),
    legacy_tags: [packageLabel, paymentMethod, "renewal_web"]
      .filter(Boolean)
      .join(", "),
    admin_note: [
      serviceHistoryNote,
      currentTier ? `current_tier:${currentTier}` : "",
      packageLabel ? `target_tier:${packageLabel}` : "",
      Number.isFinite(total) ? `amount_thb:${total}` : "",
      paymentMethod ? `payment_method:${paymentMethod}` : "",
      toStr(body.page).trim() ? `page:${toStr(body.page).trim()}` : "",
    ]
      .filter(Boolean)
      .join(" | "),
    payload_json: JSON.stringify({
      ...body,
      total,
      intake_id: intakeId,
      received_at: new Date().toISOString(),
    }),
    status: "new",
    error_message: "",
  };

  try {
    const rec = await airtableCreate({
      baseId: env.AIRTABLE_BASE_ID,
      tableId: env.AIRTABLE_TABLE_CONSOLE_INBOX_ID || "tblFHmfpB2TTrzO2e",
      apiKey: env.AIRTABLE_API_KEY,
      fields,
    });

    return withCors(
      req,
      env,
      jsonResponse({
        ok: true,
        data: {
          intake_id: intakeId,
          record_id: rec?.id || null,
          mode: "admin_worker_console_inbox",
        },
      })
    );
  } catch (error) {
    return withCors(
      req,
      env,
      jsonResponse(
        {
          ok: false,
          error: {
            code: "airtable_create_failed",
            message: String(error?.message || error || "Airtable create failed"),
          },
        },
        502
      )
    );
  }
}

function isAuthed(req, env) {
  const auth = req.headers.get("Authorization") || "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (env.ADMIN_BEARER && bearer && bearer === env.ADMIN_BEARER) return true;

  const ck = (req.headers.get("X-Confirm-Key") || "").trim();
  if (env.CONFIRM_KEY && ck && ck === env.CONFIRM_KEY) return true;

  return false;
}

async function readTokenFromKV(env, token) {
  const rawToken = toStr(token).trim();
  if (!rawToken) return null;

  const signedPayload = await readSignedConfirmToken(env, rawToken);
  if (signedPayload) return signedPayload;

  const kv = env.PAY_SESSIONS_KV || env.PAYMENTS_KV || env.KV;
  if (!kv) return null;

  const parts = rawToken.split(".");
  const legacySig = parts.length === 3 ? parts[2] : null;
  if (legacySig) {
    const legacyRaw = await kv.get(`tok:${legacySig}`);
    if (legacyRaw) {
      try {
        return JSON.parse(legacyRaw);
      } catch {
        return null;
      }
    }
  }

  const localRaw = await kv.get(`sig:${await tokenSig(rawToken)}`);
  if (!localRaw) return null;

  try {
    return JSON.parse(localRaw);
  } catch {
    return null;
  }
}

function getAllowedOrigins(env) {
  return new Set(
    String(env.ALLOWED_ORIGINS || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  );
}

function isAllowedOrigin(req, env) {
  const allow = getAllowedOrigins(env);
  const origin = req.headers.get("Origin") || "";
  if (!origin) return true;
  if (allow.size === 0) return true;
  return allow.has(origin);
}

function getAdminPrefix(path) {
  if (path.startsWith("/v1/admin/")) return "/v1/admin";
  if (path.startsWith("/internal/admin/")) return "/internal/admin";
  return "";
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
  return new Response(null, {
    status: 204,
    headers: corsHeaders(req, env),
  });
}

function withCors(req, env, res) {
  const h = new Headers(res.headers);
  const extra = corsHeaders(req, env);
  extra.forEach((v, k) => h.set(k, v));
  return new Response(res.body, {
    status: res.status,
    headers: h,
  });
}

function jsonResponse(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function airtableCreate({ baseId, tableId, apiKey, fields }) {
  const res = await fetch(`${AIRTABLE_API}/${baseId}/${tableId}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ records: [{ fields }] }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data.records?.[0] || null;
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
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>MMD Admin · สร้างเซสชัน</title>
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;1,300;1,400&family=Montserrat:wght@300;400;500;600&display=swap');

      :root {
        color-scheme: dark;
        --bg: #030204;
        --panel: rgba(10,8,13,.94);
        --panel-alt: rgba(14,11,18,.96);
        --line: rgba(196,164,110,.18);
        --line-bright: rgba(196,164,110,.42);
        --text: #f0e8dc;
        --muted: #9a8a7c;
        --gold: #c4a46e;
        --gold-bright: #e2c48a;
        --gold-dim: rgba(196,164,110,.55);
        --rose: #8a4040;
        --success: #6ab88a;
        --card-bg: linear-gradient(135deg, #0c0a10 0%, #100d16 50%, #090708 100%);
      }

      * { box-sizing: border-box; margin: 0; padding: 0; }

      body {
        min-height: 100vh;
        color: var(--text);
        background:
          radial-gradient(ellipse 60% 40% at 20% -10%, rgba(196,164,110,.07) 0%, transparent 60%),
          radial-gradient(ellipse 50% 50% at 80% 110%, rgba(196,164,110,.05) 0%, transparent 55%),
          #030204;
        font-family: 'Montserrat', "Avenir Next", "Helvetica Neue", sans-serif;
        font-size: 14px;
        letter-spacing: .01em;
      }

      /* ── PAGE LAYOUT ── */
      .page {
        width: min(100%, 1020px);
        margin: 0 auto;
        padding: 40px 24px 80px;
      }

      /* ── HEADER CARD ── */
      .header-card {
        position: relative;
        overflow: hidden;
        border: 1px solid var(--line);
        border-radius: 24px;
        background: var(--card-bg);
        padding: 36px 40px 32px;
        margin-bottom: 28px;
        box-shadow:
          0 0 0 1px rgba(196,164,110,.06) inset,
          0 32px 64px rgba(0,0,0,.6),
          0 0 80px rgba(196,164,110,.03);
      }
      .header-card::before {
        content: '';
        position: absolute;
        inset: 0;
        background:
          radial-gradient(ellipse 70% 120% at 100% 50%, rgba(196,164,110,.06) 0%, transparent 60%);
        pointer-events: none;
      }
      .header-card::after {
        content: '';
        position: absolute;
        top: 0; left: 0; right: 0;
        height: 1px;
        background: linear-gradient(90deg, transparent, rgba(196,164,110,.5) 40%, rgba(226,196,138,.8) 60%, transparent);
      }

      .header-top {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 20px;
      }

      /* logo / emblem */
      .emblem {
        display: flex;
        align-items: center;
        gap: 10px;
        margin-bottom: 20px;
      }
      .emblem-icon {
        width: 38px; height: 26px;
        background: linear-gradient(135deg, #1a1620, #0e0c12);
        border: 1px solid var(--line-bright);
        border-radius: 5px;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        box-shadow: 0 2px 8px rgba(0,0,0,.5), 0 0 0 1px rgba(196,164,110,.1) inset;
        position: relative;
        overflow: hidden;
      }
      .emblem-icon::after {
        content: '';
        position: absolute;
        top: 0; left: 0; right: 0;
        height: 50%;
        background: linear-gradient(180deg, rgba(196,164,110,.14), transparent);
        border-radius: 4px 4px 0 0;
      }
      .emblem-chip {
        width: 10px; height: 8px;
        background: linear-gradient(135deg, #c4a46e 0%, #8a6e42 100%);
        border-radius: 2px;
        box-shadow: 0 1px 3px rgba(0,0,0,.4);
        z-index: 1;
      }
      .emblem-text {
        font-family: 'Montserrat', sans-serif;
        font-size: .62rem;
        font-weight: 600;
        letter-spacing: .28em;
        text-transform: uppercase;
        color: var(--gold);
      }
      .emblem-dot {
        width: 3px; height: 3px;
        border-radius: 50%;
        background: var(--gold-dim);
        margin: 0 2px;
      }

      .header-info { flex: 1; min-width: 0; }

      .kicker {
        font-family: 'Montserrat', sans-serif;
        font-size: .65rem;
        font-weight: 500;
        letter-spacing: .3em;
        text-transform: uppercase;
        color: var(--gold-dim);
        margin-bottom: 10px;
      }
      h1 {
        font-family: 'Cormorant Garamond', Baskerville, Georgia, serif;
        font-size: clamp(2.4rem, 6vw, 4rem);
        font-weight: 300;
        letter-spacing: -.02em;
        line-height: .95;
        color: var(--text);
      }
      h1 em {
        font-style: italic;
        color: var(--gold-bright);
      }
      .lead {
        margin-top: 14px;
        color: var(--muted);
        font-size: .82rem;
        line-height: 1.75;
        max-width: 58ch;
        font-weight: 300;
      }

      /* ── DIVIDER ── */
      .divider {
        height: 1px;
        background: linear-gradient(90deg, transparent, var(--line) 30%, var(--line) 70%, transparent);
        margin: 24px 0;
      }

      /* ── SECTION ── */
      .section {
        border: 1px solid var(--line);
        border-radius: 20px;
        background: var(--panel);
        overflow: hidden;
        margin-bottom: 20px;
        box-shadow: 0 8px 32px rgba(0,0,0,.35);
      }
      .section-header {
        padding: 18px 24px 16px;
        background: rgba(196,164,110,.03);
        border-bottom: 1px solid var(--line);
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .section-dot {
        width: 6px; height: 6px;
        border-radius: 50%;
        background: var(--gold);
        box-shadow: 0 0 6px rgba(196,164,110,.6);
        flex-shrink: 0;
      }
      .section-title {
        font-family: 'Montserrat', sans-serif;
        font-size: .65rem;
        font-weight: 600;
        letter-spacing: .28em;
        text-transform: uppercase;
        color: var(--gold);
      }
      .section-body {
        padding: 24px;
      }

      /* ── FORM GRID ── */
      .grid {
        display: grid;
        gap: 16px;
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
      .grid-full { grid-column: 1 / -1; }

      /* ── LABELS & INPUTS ── */
      label {
        display: grid;
        gap: 7px;
        font-family: 'Montserrat', sans-serif;
        font-size: .62rem;
        font-weight: 600;
        letter-spacing: .22em;
        text-transform: uppercase;
        color: var(--gold-dim);
      }
      input, textarea, select {
        width: 100%;
        padding: 13px 16px;
        border: 1px solid rgba(196,164,110,.15);
        border-radius: 12px;
        background: rgba(5,4,8,.8);
        color: var(--text);
        font-family: 'Montserrat', sans-serif;
        font-size: .88rem;
        font-weight: 300;
        transition: border-color .2s, box-shadow .2s;
        outline: none;
        appearance: none;
      }
      input:focus, textarea:focus, select:focus {
        border-color: rgba(196,164,110,.5);
        box-shadow: 0 0 0 3px rgba(196,164,110,.07), 0 0 20px rgba(196,164,110,.04);
      }
      input::placeholder { color: rgba(154,138,124,.4); }
      textarea {
        min-height: 110px;
        resize: vertical;
        line-height: 1.6;
      }
      select {
        min-height: 110px;
        cursor: pointer;
      }
      select option {
        background: #0c0a10;
        padding: 6px 8px;
      }

      /* ── ACTIONS ── */
      .actions {
        display: flex;
        gap: 10px;
        align-items: center;
        flex-wrap: wrap;
        padding-top: 8px;
      }

      button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 7px;
        min-height: 44px;
        padding: 0 22px;
        border-radius: 999px;
        border: 1px solid var(--line-bright);
        background: linear-gradient(135deg, rgba(196,164,110,.18) 0%, rgba(196,164,110,.08) 100%);
        color: var(--gold-bright);
        font-family: 'Montserrat', sans-serif;
        font-size: .68rem;
        font-weight: 600;
        letter-spacing: .22em;
        text-transform: uppercase;
        cursor: pointer;
        transition: background .2s, border-color .2s, box-shadow .2s, opacity .2s;
        white-space: nowrap;
      }
      button:hover {
        background: linear-gradient(135deg, rgba(196,164,110,.28) 0%, rgba(196,164,110,.14) 100%);
        border-color: var(--gold);
        box-shadow: 0 0 20px rgba(196,164,110,.12);
      }
      button:disabled {
        opacity: .45;
        cursor: not-allowed;
      }

      button.primary {
        background: linear-gradient(135deg, #c4a46e 0%, #a07840 100%);
        border-color: #c4a46e;
        color: #0c0a10;
        font-weight: 700;
        box-shadow: 0 4px 20px rgba(196,164,110,.28);
      }
      button.primary:hover:not(:disabled) {
        background: linear-gradient(135deg, #d4b47e 0%, #b08850 100%);
        box-shadow: 0 6px 28px rgba(196,164,110,.40);
      }

      button.ghost {
        background: transparent;
        border-color: rgba(196,164,110,.2);
        color: var(--muted);
        font-size: .62rem;
      }
      button.ghost:hover { border-color: var(--line-bright); color: var(--gold-bright); }

      /* ── STATUS ── */
      .status {
        font-size: .8rem;
        font-weight: 400;
        color: var(--muted);
        min-height: 1.2em;
        padding: 2px 0;
      }
      .status.error { color: #e08080; }
      .status.success { color: var(--success); }

      /* ── HINT ── */
      .hint {
        font-size: .78rem;
        font-weight: 300;
        color: var(--muted);
        line-height: 1.65;
        padding: 2px 0;
      }
      .hint code {
        font-family: SFMono-Regular, Consolas, Menlo, monospace;
        font-size: .82em;
        color: var(--gold-dim);
        background: rgba(196,164,110,.08);
        padding: 1px 5px;
        border-radius: 4px;
      }

      /* ── RESULT PRE ── */
      .result-wrap { margin-top: 20px; }
      pre {
        overflow: auto;
        padding: 20px 24px;
        border-radius: 16px;
        border: 1px solid var(--line);
        background: rgba(3,2,4,.85);
        color: var(--text);
        font-family: SFMono-Regular, Consolas, Menlo, monospace;
        font-size: .82rem;
        line-height: 1.7;
        box-shadow: 0 4px 24px rgba(0,0,0,.4);
      }

      /* ── CLEAR AUTH BUTTON (top-right) ── */
      .header-actions { flex-shrink: 0; padding-top: 4px; }

      /* ── RESPONSIVE ── */
      @media (max-width: 640px) {
        .page { padding: 20px 16px 60px; }
        .header-card { padding: 24px 20px 22px; }
        .grid { grid-template-columns: 1fr; }
        .header-top { flex-direction: column; }
        .section-body { padding: 18px 16px; }
      }
    </style>
  </head>
  <body>
    <div class="page">

      <!-- ── HEADER CARD ── -->
      <div class="header-card">
        <div class="header-top">
          <div class="header-info">
            <div class="emblem">
              <div class="emblem-icon"><div class="emblem-chip"></div></div>
              <span class="emblem-text">Blackcard</span>
              <span class="emblem-dot"></span>
              <span class="emblem-text" style="color:var(--muted);letter-spacing:.18em">Exclusive</span>
            </div>
            <p class="kicker">Internal Admin &nbsp;/&nbsp; Jobs</p>
            <h1>สร้าง<em>เซสชัน</em></h1>
            <p class="lead">เปิดหน้านี้ในเบราว์เซอร์ ใส่ Bearer Token หรือ Confirm Key หนึ่งครั้ง แล้วค่อยสร้างเซสชันได้เลย หน้าเดียวกันนี้จะยิงกลับมาที่ path เดิมพร้อม auth ที่เก็บไว้ใน browser session.</p>
          </div>
          <div class="header-actions">
            <button id="clearAuth" class="ghost" type="button">ล้าง Auth</button>
          </div>
        </div>
      </div>

      <!-- ── AUTH SECTION ── -->
      <div class="section">
        <div class="section-header">
          <span class="section-dot"></span>
          <span class="section-title">Authentication</span>
        </div>
        <div class="section-body">
          <form id="auth-form" style="display:contents">
            <div class="grid" style="margin-bottom:14px">
              <label>
                Bearer Token
                <input id="bearer" name="bearer" type="password" autocomplete="off" placeholder="••••••••••••" />
              </label>
              <label>
                Confirm Key
                <input id="confirmKey" name="confirmKey" type="password" autocomplete="off" placeholder="••••••••••••" />
              </label>
            </div>
            <p class="hint">ใส่อย่างใดอย่างหนึ่งก็พอ — ค่าจะถูกเก็บเฉพาะ <code>sessionStorage</code> ของ browser นี้เท่านั้น</p>
          </form>
        </div>
      </div>

      <!-- ── CREATE SESSION SECTION ── -->
      <div class="section">
        <div class="section-header">
          <span class="section-dot"></span>
          <span class="section-title">Create Session</span>
        </div>
        <div class="section-body">
          <form id="create-session-form">
            <div class="grid">
              <label>
                ค้นหา Member
                <input id="member_search" name="member_search" type="text" placeholder="ชื่อ, nickname, memberstack id, telegram" />
              </label>
              <label>
                ค้นหา Model
                <input id="model_search" name="model_search" type="text" placeholder="ชื่อ, nickname, telegram, unique key" />
              </label>
              <label class="grid-full">
                ผลการค้นหา Member
                <select id="member_results" size="5"></select>
              </label>
              <label class="grid-full">
                ผลการค้นหา Model
                <select id="model_results" size="5"></select>
              </label>
              <label>
                Memberstack ID
                <input id="memberstack_id" name="memberstack_id" type="text" required />
              </label>
              <label>
                Model ID
                <input id="model_id" name="model_id" type="text" required />
              </label>
              <label>
                จำนวนเงิน THB
                <input id="amount_thb" name="amount_thb" type="number" min="1" step="1" required />
              </label>
              <label>
                จ่ายโมเดล THB
                <input id="pay_model_thb" name="pay_model_thb" type="number" min="0" step="1" />
              </label>
              <label>
                Currency
                <input id="currency" name="currency" type="text" value="THB" />
              </label>
              <label>
                Payment Ref
                <input id="payment_ref" name="payment_ref" type="text" />
              </label>
              <label>
                Session ID
                <input id="session_id" name="session_id" type="text" />
              </label>
              <label>
                Return URL
                <input id="return_url" name="return_url" type="url" />
              </label>
              <label class="grid-full">
                Cancel URL
                <input id="cancel_url" name="cancel_url" type="url" />
              </label>
              <label class="grid-full">
                Metadata JSON
                <textarea id="metadata" name="metadata" placeholder='{"source":"manual_immigrate","line_user_id":"..."}'></textarea>
              </label>
            </div>

            <p class="hint" style="margin-top:4px">บังคับกรอก <code>memberstack_id</code>, <code>model_id</code>, และ <code>amount_thb</code> — metadata ไม่บังคับ แต่ถ้าใส่ต้องเป็น JSON ที่ถูกต้อง</p>

            <div class="actions" style="margin-top:20px">
              <button id="search_member" type="button">ค้นหา Member</button>
              <button id="search_model" type="button">ค้นหา Model</button>
              <button id="submit" class="primary" type="submit">สร้างเซสชัน</button>
              <p id="status" class="status" role="status"></p>
            </div>
          </form>
        </div>
      </div>

      <!-- ── RESULT ── -->
      <div class="result-wrap">
        <pre id="result">${escapeHtml("รอการส่งข้อมูล...")}</pre>
      </div>

    </div><!-- /.page -->

    <script>
      (() => {
        const KEY = "mmd_admin_create_session_auth_v1";
        const submit = document.getElementById("submit");
        const status = document.getElementById("status");
        const result = document.getElementById("result");
        const clearAuth = document.getElementById("clearAuth");
        const searchMemberButton = document.getElementById("search_member");
        const searchModelButton = document.getElementById("search_model");
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
          sessionStorage.setItem(KEY, JSON.stringify({
            bearer: bearer.value.trim(),
            confirmKey: confirmKey.value.trim(),
          }));
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
              ? [
                  fields.name || fields.Name || fields.nickname || "Member",
                  fields.memberstack_id || "",
                  fields.telegram_username || fields.telegram_id || "",
                ].filter(Boolean).join(" | ")
              : [
                  fields.name || fields.Name || fields.nickname || "Model",
                  fields.unique_key || "",
                  fields.telegram_username || fields.telegram_id || "",
                ].filter(Boolean).join(" | ");
            const option = document.createElement("option");
            option.value = kind === "member"
              ? String(fields.memberstack_id || "")
              : String(item.id || fields.id || "");
            option.textContent = label;
            option.dataset.recordId = String(item.id || "");
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
            const response = await fetch(path + "?" + params.toString(), {
              method: "GET",
              headers: buildHeaders(),
            });
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

        searchMemberButton.addEventListener("click", () => runLookup("member"));
        searchModelButton.addEventListener("click", () => runLookup("model"));

        memberResults.addEventListener("change", () => {
          const option = memberResults.options[memberResults.selectedIndex];
          if (option && option.value) {
            document.getElementById("memberstack_id").value = option.value;
            setStatus("เลือก member แล้ว", "success");
          }
        });

        modelResults.addEventListener("change", () => {
          const option = modelResults.options[modelResults.selectedIndex];
          if (option && option.value) {
            document.getElementById("model_id").value = option.dataset.recordId || option.value;
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
            const response = await fetch(location.pathname, {
              method: "POST",
              headers: buildHeaders(),
              body: JSON.stringify(payload),
            });
            const data = await response.json().catch(() => null);
            if (!response.ok || !data) {
              setStatus((data && (data.error?.message || data.error)) || "สร้างเซสชันไม่สำเร็จ", "error");
              setResult(data || { ok: false, status: response.status });
              return;
            }

            setStatus("สร้างเซสชันสำเร็จ", "success");
            setResult(data);
          } catch (error) {
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

function toStr(v) {
  return v == null ? "" : String(v);
}

function toNum(v) {
  const n = Number(String(v ?? "").replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : null;
}

function isMissingConfirmRoute(err) {
  const message = toStr(err?.message).toLowerCase();
  const responseError = toStr(err?.response?.error).toLowerCase();
  const responseMessage = toStr(err?.response?.message).toLowerCase();
  return (
    Number(err?.upstreamStatus) === 404 ||
    message.includes("not_found") ||
    message.includes("route not found") ||
    responseError === "not_found" ||
    responseMessage.includes("route not found")
  );
}

async function callPaymentsCreateLink(env, payload) {
  const confirmKey = toStr(env.CONFIRM_KEY).trim();
  if (!confirmKey) {
    const err = new Error("missing_CONFIRM_KEY");
    err.status = 500;
    throw err;
  }

  const paymentsBaseUrl = toStr(env.PAYMENTS_BASE_URL || env.PAYMENTS_WORKER_BASE_URL).trim();
  if (!paymentsBaseUrl) {
    const err = new Error("missing_PAYMENTS_BASE_URL");
    err.status = 500;
    throw err;
  }

  const paymentsBaseWithSlash = paymentsBaseUrl.endsWith("/") ? paymentsBaseUrl : `${paymentsBaseUrl}/`;
  const linkUrl = new URL("v1/confirm/link", paymentsBaseWithSlash);

  const res = await fetch(linkUrl.toString(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-Confirm-Key": confirmKey,
    },
    body: JSON.stringify(payload),
  });

  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  if (!res.ok) {
    const err = new Error(data?.error || data?.message || `payments_worker_http_${res.status}`);
    err.status = 502;
    err.upstreamStatus = res.status;
    err.response = data;
    throw err;
  }

  return data || {};
}

function base64UrlEncode(input) {
  const bytes = new TextEncoder().encode(String(input || ""));
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(input) {
  const raw = toStr(input).replace(/-/g, "+").replace(/_/g, "/");
  if (!raw) return "";
  const padded = raw.padEnd(raw.length + ((4 - (raw.length % 4)) % 4), "=");
  return atob(padded);
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

async function readSignedConfirmToken(env, token) {
  const rawToken = toStr(token).trim();
  const parts = rawToken.split(".");
  if (parts.length !== 2) return null;

  const [encoded, signature] = parts;
  const confirmKey = toStr(env.CONFIRM_KEY).trim();
  if (!confirmKey || !encoded || !signature) return null;

  const expected = await hmacSha256Hex(encoded, confirmKey);
  if (expected !== signature) return null;

  try {
    return JSON.parse(base64UrlDecode(encoded));
  } catch {
    return null;
  }
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

function getWebBaseUrl(env) {
  return toStr(env.WEB_BASE_URL || "https://mmdbkk.com").replace(/\/+$/, "");
}

function buildAbsoluteUrl(value, fallbackBase) {
  const raw = toStr(value);
  if (!raw) return fallbackBase;
  if (/^https?:\/\//i.test(raw)) return raw;
  return `${fallbackBase}${raw.startsWith("/") ? "" : "/"}${raw}`;
}

async function createConfirmTokenRecord(env, token, payload) {
  const kv = env.PAY_SESSIONS_KV || env.PAYMENTS_KV || env.KV;
  if (!kv) return;
  await kv.put(`sig:${await tokenSig(token)}`, JSON.stringify(payload), {
    expirationTtl: 60 * 60 * 24 * (toNum(env.PAY_SESSIONS_TTL_DAYS) || 30),
  });
}

async function mintLocalConfirmLinks(env, payload) {
  const session_id = toStr(payload.session_id) || `sess_${crypto.randomUUID()}`;
  const payment_ref = toStr(payload.payment_ref) || `pay_${Date.now().toString(36)}_${crypto.randomUUID().slice(0, 8)}`;
  const payment_type = toStr(payload.payment_type || payload.payment_stage || "full") || "full";

  const base = getWebBaseUrl(env);
  const customerConfirmPage = buildAbsoluteUrl(payload.confirm_page || "/confirm/job-confirmation", base);
  const modelConfirmPage = buildAbsoluteUrl(payload.model_confirm_page || "/confirm/job-model", base);
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

async function createAdminSession(env, body) {
  const amount = toNum(body?.amount_thb ?? body?.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, error: "invalid_amount_thb", status: 400 };
  }

  const payModelAmount = toNum(
    body?.pay_model_thb ?? body?.pay_model ?? body?.model_pay_thb ?? body?.model_pay
  );
  if (payModelAmount != null && (!Number.isFinite(payModelAmount) || payModelAmount < 0)) {
    return { ok: false, error: "invalid_pay_model_thb", status: 400 };
  }

  const normalized = {
    session_id: toStr(body?.session_id || body?.sessionId) || `sess_${crypto.randomUUID()}`,
    payment_ref:
      toStr(body?.payment_ref || body?.paymentRef) ||
      `admin_${Date.now().toString(36)}_${crypto.randomUUID().slice(0, 8)}`,
    client_name: toStr(body?.client_name || body?.member_name || body?.customer_name),
    model_name: toStr(body?.model_name || body?.talent_name),
    memberstack_id: toStr(body?.memberstack_id || body?.member_id || body?.member_ref),
    model_id: toStr(body?.model_id || body?.model_ref),
    job_type: toStr(body?.job_type || body?.session_type || "session"),
    job_date: toStr(body?.job_date || body?.service_date || body?.date),
    start_time: toStr(body?.start_time || body?.time_start),
    end_time: toStr(body?.end_time || body?.time_end),
    location_name: toStr(body?.location_name || body?.location || body?.venue_name),
    google_map_url: toStr(body?.google_map_url || body?.google_maps_url || body?.maps_url),
    note: toStr(body?.note || body?.notes),
    amount_thb: amount,
    pay_model_thb: payModelAmount ?? null,
    currency: toStr(body?.currency || "THB") || "THB",
    payment_type: toStr(body?.payment_type || body?.payment_stage || "full") || "full",
    payment_method: toStr(body?.payment_method || "promptpay") || "promptpay",
    confirm_page: body?.confirm_page || null,
    model_confirm_page: body?.model_confirm_page || null,
    return_url: body?.return_url || body?.success_url || null,
    cancel_url: body?.cancel_url || null,
    metadata: body?.metadata && typeof body.metadata === "object" ? body.metadata : {},
  };

  const missing = [];
  if (!normalized.client_name && !normalized.memberstack_id) missing.push("client_name");
  if (!normalized.model_name && !normalized.model_id) missing.push("model_name");
  if (!normalized.job_date) missing.push("job_date");
  if (!normalized.start_time) missing.push("start_time");
  if (!normalized.end_time) missing.push("end_time");
  if (!normalized.location_name) missing.push("location_name");

  if (missing.length) {
    return { ok: false, error: "missing_required_fields", missing, status: 400 };
  }

  const linkPayload = {
    session_id: normalized.session_id,
    payment_ref: normalized.payment_ref,
    client_name: normalized.client_name,
    model_name: normalized.model_name,
    memberstack_id: normalized.memberstack_id,
    model_id: normalized.model_id,
    job_type: normalized.job_type,
    job_date: normalized.job_date,
    start_time: normalized.start_time,
    end_time: normalized.end_time,
    location_name: normalized.location_name,
    google_map_url: normalized.google_map_url,
    note: normalized.note,
    amount_thb: normalized.amount_thb,
    amount: normalized.amount_thb,
    pay_model_thb: normalized.pay_model_thb,
    currency: normalized.currency,
    payment_type: normalized.payment_type,
    payment_method: normalized.payment_method,
    confirm_page: normalized.confirm_page,
    model_confirm_page: normalized.model_confirm_page,
    return_url: normalized.return_url,
    cancel_url: normalized.cancel_url,
    metadata: normalized.metadata,
  };

  let confirmData = {};
  try {
    confirmData = await callPaymentsCreateLink(env, linkPayload);
  } catch (err) {
    if (!isMissingConfirmRoute(err)) {
      return {
        ok: false,
        error: "payments_link_failed",
        status: err?.status || 502,
        payment_ref: normalized.payment_ref,
        detail: {
          message: err?.message || "unknown_error",
          response: err?.response || null,
        },
      };
    }

    try {
      confirmData = await mintLocalConfirmLinks(env, linkPayload);
    } catch (fallbackErr) {
      return {
        ok: false,
        error: "payments_link_failed",
        status: 502,
        payment_ref: normalized.payment_ref,
        detail: {
          message: fallbackErr?.message || "local_fallback_failed",
          response: err?.response || null,
          fallback: true,
        },
      };
    }
  }

  const confirmation_url =
    confirmData.confirmation_url ||
    confirmData.customer_confirmation_url ||
    confirmData.confirm_url ||
    confirmData.url ||
    confirmData.link ||
    null;

  return {
    ok: true,
    mode: confirmData.mode || "payments_worker",
    session_id: normalized.session_id,
    payment_ref: normalized.payment_ref,
    amount_thb: normalized.amount_thb,
    pay_model_thb: normalized.pay_model_thb,
    memberstack_id: normalized.memberstack_id,
    model_id: normalized.model_id,
    client_name: normalized.client_name,
    model_name: normalized.model_name,
    confirmation_url,
    confirm_url: confirmData.confirm_url || confirmation_url,
    customer_confirmation_url: confirmData.customer_confirmation_url || confirmation_url,
    model_confirmation_url: confirmData.model_confirmation_url || null,
    short_url: confirmData.short_url || null,
    payments_response: confirmData,
  };
}
