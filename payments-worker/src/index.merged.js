// payments-worker/src/index.js
// =========================================================
// MMD Privé — payments-worker (LOCK v2 + Points + Membership)
// Routes:
//   GET  /ping
//   POST /v1/pay/verify
//   POST /v1/payments/notify
//
// Core LOCKS (from MMD memory):
// - Primary gateway: PromptPay manual slip
// - session_id is primary idempotency key for payment/session flow
// - /v1/pay/verify idempotency = session_id + payment_stage
//   intent_key = intent:${session_id}:${payment_stage}
// - transaction_ref is returned for the intent and reused on retries
// - /v1/payments/notify idempotent: if already paid => ok
// - member_packages ledger MUST be written ONLY when payment_stage === "membership"
// - deposit/final/tips MUST NOT touch member_packages (they update Sessions/Payments only)
// - Points policy (LOCK): 100 THB = 1 point (POINTS_RATE=100)
// - Points idempotency: points_ledger.payment_ref UNIQUE (plus pre-check)
// =========================================================

const AIRTABLE_API = "https://api.airtable.com/v0";

function nowIso() {
  return new Date().toISOString();
}

function dateOnlyIso(d = new Date()) {
  // YYYY-MM-DD
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function addDaysDateOnly(dateIso, days) {
  const d = new Date(`${dateIso}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + Number(days || 0));
  return dateOnlyIso(new Date(d.toISOString()));
}

function uuidv4() {
  // RFC4122 v4
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function parseAllowedOrigins(raw) {
  // wrangler.toml often stores: "\"https://a,https://b\""
  const s = String(raw || "").trim();
  const unquoted = s.replace(/^"+|"+$/g, "").replace(/^'+|'+$/g, "");
  return unquoted
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

function corsHeaders(env, req) {
  const origin = req.headers.get("Origin") || "";
  const allowed = parseAllowedOrigins(env.ALLOWED_ORIGINS);
  const allowOrigin = allowed.includes(origin) ? origin : allowed[0] || "*";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,Authorization,X-Confirm-Key",
    "Access-Control-Max-Age": "86400",
  };
}

function jsonResponse(env, req, status, obj) {
  return new Response(JSON.stringify(obj, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...corsHeaders(env, req),
    },
  });
}

async function readJson(req) {
  const ct = req.headers.get("Content-Type") || "";
  if (!ct.includes("application/json")) return null;
  try {
    return await req.json();
  } catch {
    return null;
  }
}

function requireConfirmKey(env, req) {
  const key = req.headers.get("X-Confirm-Key") || "";
  return key && env.CONFIRM_KEY && key === env.CONFIRM_KEY;
}

async function airtableFetch({ env, method, tableId, recordId, qs, body }) {
  if (!env.AIRTABLE_API_KEY) throw new Error("Missing AIRTABLE_API_KEY");
  if (!env.AIRTABLE_BASE_ID) throw new Error("Missing AIRTABLE_BASE_ID");
  if (!tableId) throw new Error("Missing tableId");

  let url = `${AIRTABLE_API}/${env.AIRTABLE_BASE_ID}/${tableId}`;
  if (recordId) url += `/${recordId}`;
  if (qs) url += `?${qs}`;

  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${env.AIRTABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    const msg = json && json.error ? JSON.stringify(json.error) : text;
    throw new Error(`Airtable ${method} ${url} failed: ${res.status} ${msg}`);
  }
  return json;
}

async function airtableGetRecord({ env, tableId, recordId }) {
  return airtableFetch({ env, method: "GET", tableId, recordId });
}

async function airtableUpdate({ env, tableId, recordId, fields }) {
  return airtableFetch({ env, method: "PATCH", tableId, recordId, body: { fields, typecast: true } });
}

async function airtableFindOneByFormula({ env, tableId, formula }) {
  const qs = new URLSearchParams({ maxRecords: "1", filterByFormula: formula }).toString();
  const out = await airtableFetch({ env, method: "GET", tableId, qs });
  return out && out.records && out.records[0] ? out.records[0] : null;
}

// ----------------------
// Stage helpers
// ----------------------
function extractSessionIdFromNotes(notes) {
  const m = String(notes || "").match(/session_id=([^; \n]+)/i);
  return m ? m[1] : "";
}

function normalizeStage(stage) {
  const s = String(stage || "").trim().toLowerCase();
  return s || "";
}

function isMembershipStage(stage) {
  return normalizeStage(stage) === "membership";
}

function isServiceStage(stage) {
  const s = normalizeStage(stage);
  return s === "deposit" || s === "final" || s === "tips";
}

// ----------------------
// Payments: create intent
// ----------------------
async function airtableCreatePaymentIntent({
  env,
  session_id,
  payment_stage,
  transaction_ref,
  amount,
  payment_method,
  package_code,
}) {
  const tableId = env.AIRTABLE_TABLE_PAYMENTS;
  if (!tableId) throw new Error("Missing AIRTABLE_TABLE_PAYMENTS");

  // NOTE: For Payments/Sessions we use locked Field IDs (MMD memory).
  // For any extra fields not in the minimum lock, we only set them if env var exists.
  const fields = {};
  if (env.AT_PAYMENTS__PAYMENT_REF) fields[env.AT_PAYMENTS__PAYMENT_REF] = transaction_ref;
  if (env.AT_PAYMENTS__AMOUNT) fields[env.AT_PAYMENTS__AMOUNT] = Number(amount || 0);
  // Keep consistent with existing Airtable values (you confirmed: Pending / Paid)
  if (env.AT_PAYMENTS__PAYMENT_STATUS) fields[env.AT_PAYMENTS__PAYMENT_STATUS] = "Pending";
  if (env.AT_PAYMENTS__PAYMENT_METHOD) fields[env.AT_PAYMENTS__PAYMENT_METHOD] = payment_method || "promptpay";
  // IMPORTANT: package_code must store package code (NOT payment_stage)
  if (env.AT_PAYMENTS__PACKAGE_CODE) fields[env.AT_PAYMENTS__PACKAGE_CODE] = String(package_code || "");
  if (env.AT_PAYMENTS__PAYMENT_INTENT_STATUS) fields[env.AT_PAYMENTS__PAYMENT_INTENT_STATUS] = "pending";
  if (env.AT_PAYMENTS__NOTES) {
    fields[env.AT_PAYMENTS__NOTES] = `session_id=${session_id}; stage=${payment_stage}; created_at=${nowIso()}`;
  }

  const rec = await airtableFetch({
    env,
    method: "POST",
    tableId,
    body: { fields, typecast: true },
  });

  return rec; // {id, fields, ...}
}

async function airtableFindSessionRecordId({ env, session_id }) {
  const tableId = env.AIRTABLE_TABLE_SESSIONS;
  if (!tableId) throw new Error("Missing AIRTABLE_TABLE_SESSIONS");

  const candidates = [];
  if (env.AT_SESSIONS__SESSION_ID) candidates.push(`{${env.AT_SESSIONS__SESSION_ID}}="${session_id}"`);
  candidates.push(`{session_id}="${session_id}"`);
  candidates.push(`{Session ID}="${session_id}"`);
  candidates.push(`{SESSION_ID}="${session_id}"`);

  for (const formula of candidates) {
    try {
      const qs = new URLSearchParams({ maxRecords: "1", filterByFormula: formula }).toString();
      const out = await airtableFetch({ env, method: "GET", tableId, qs });
      if (out && out.records && out.records[0] && out.records[0].id) return out.records[0].id;
    } catch {
      // try next
    }
  }
  return null;
}

// ----------------------
// Packages lookup (for membership duration)
// ----------------------
async function getPackageByCode({ env, package_code }) {
  const tableId = env.AIRTABLE_TABLE_PACKAGES || "packages";
  try {
    // Prefer {code} field name in packages table.
    const rec = await airtableFindOneByFormula({
      env,
      tableId,
      formula: `{code}="${String(package_code || "")}"`,
    });
    return rec ? rec.fields : null;
  } catch {
    return null;
  }
}

// ----------------------
// Member packages ledger (best-effort)
// ----------------------
async function createMemberPackageLedgerIfEligible({
  env,
  member_email,
  package_code,
  amount_thb,
  payment_ref,
  paid_at_date,
  provider = "promptpay",
  source = "web",
  note = "",
}) {
  const tableId = env.AIRTABLE_TABLE_MEMBER_PACKAGES || "member_packages";
  if (!member_email || !package_code || !payment_ref) {
    return { ok: true, created: false, reason: "missing_required" };
  }

  // Idempotency by payment_ref (ledger)
  try {
    const existing = await airtableFindOneByFormula({ env, tableId, formula: `{payment_ref}="${payment_ref}"` });
    if (existing) return { ok: true, created: false, reason: "already_exists", record_id: existing.id };
  } catch {
    // If search fails, still try create (best-effort)
  }

  const pkg = await getPackageByCode({ env, package_code });
  const duration_days = Number((pkg && pkg.duration_days) || 0);
  const tier = (pkg && (pkg.tier || pkg.Tier)) || "";

  const start_date = paid_at_date;
  const end_date = duration_days > 0 ? addDaysDateOnly(start_date, duration_days) : "";

  const fields = {
    member_email,
    package_code,
    amount: Number(amount_thb || 0),
    currency: "THB",
    status: "active",
    start_date,
    end_date,
    payment_ref,
    provider,
    ledger_type: "purchase",
    source,
    note: note || `created_from_payment_ref=${payment_ref}`,
  };
  // Optional tier snapshot if you keep it here
  if (tier) fields.tier = tier;

  try {
    await airtableFetch({ env, method: "POST", tableId, body: { fields, typecast: true } });
    return { ok: true, created: true, start_date, end_date };
  } catch (e) {
    return { ok: false, created: false, error: String(e && e.message ? e.message : e) };
  }
}

// ----------------------
// Points ledger (production)
// ----------------------
function calcPoints(amountThb, pointsRate = 100) {
  const amt = Number(amountThb || 0);
  if (!Number.isFinite(amt) || amt <= 0) return 0;
  return Math.floor(amt / Number(pointsRate || 100));
}

async function awardPointsIfEligible({
  env,
  member_email,
  payment_ref,
  session_id,
  amount_thb,
  source = "system",
  note = "",
}) {
  const tableId = env.AIRTABLE_TABLE_POINTS_LEDGER || "points_ledger";
  if (!payment_ref) return { ok: false, awarded: false, reason: "missing_payment_ref" };

  const points = calcPoints(amount_thb, env.POINTS_RATE || 100);
  if (points <= 0) return { ok: true, awarded: false, reason: "points=0" };

  // Idempotency by payment_ref
  try {
    const existing = await airtableFindOneByFormula({ env, tableId, formula: `{payment_ref}="${payment_ref}"` });
    if (existing) return { ok: true, awarded: false, reason: "already_awarded", record_id: existing.id };
  } catch {
    // If search fails, still attempt create; unique constraint should protect.
  }

  const fields = {
    payment_ref,
    amount_thb: Number(amount_thb || 0),
    points: Number(points),
    rate_policy: "100THB=1PT",
    source,
    note: note || `award_from_payment_ref=${payment_ref}`,
  };
  if (member_email) fields.member_email = member_email;
  if (session_id) fields.session_id = session_id;

  try {
    await airtableFetch({ env, method: "POST", tableId, body: { fields, typecast: true } });
    return { ok: true, awarded: true, points };
  } catch (e) {
    // If this fails due to unique conflict, treat as already awarded.
    const msg = String(e && e.message ? e.message : e);
    if (msg.toLowerCase().includes("duplicate") || msg.toLowerCase().includes("unique")) {
      return { ok: true, awarded: false, reason: "unique_conflict" };
    }
    return { ok: false, awarded: false, error: msg };
  }
}

// =========================================================
// Handlers
// =========================================================
async function handleVerify(req, env) {
  const body = (await readJson(req)) || {};
  const session_id = String(body.session_id || "").trim();
  const payment_stage = normalizeStage(body.payment_stage);
  const amount = Number(body.amount || 0);
  const package_code = String(body.package_code || "").trim();

  if (!session_id) return jsonResponse(env, req, 400, { ok: false, error: "missing_session_id" });
  if (!payment_stage) return jsonResponse(env, req, 400, { ok: false, error: "missing_payment_stage" });

  // Membership requires package_code
  if (isMembershipStage(payment_stage) && !package_code) {
    return jsonResponse(env, req, 400, { ok: false, error: "missing_package_code" });
  }

  const intent_key = `intent:${session_id}:${payment_stage}`;
  const ttlSeconds = Number(env.PAY_TOKEN_TTL_SECONDS || 2592000);

  // 1) idempotent intent lookup
  let transaction_ref = await env.PAY_SESSIONS_KV.get(intent_key);
  let idempotent = true;

  if (!transaction_ref) {
    idempotent = false;
    transaction_ref = uuidv4();
    await env.PAY_SESSIONS_KV.put(intent_key, transaction_ref, { expirationTtl: ttlSeconds });
  }

  // 2) Ensure there's an Airtable payment intent record (idempotent by KV mapping)
  const payrec_key = `payrec:${transaction_ref}`;
  let payment_record_id = await env.PAY_SESSIONS_KV.get(payrec_key);

  if (!payment_record_id) {
    try {
      const rec = await airtableCreatePaymentIntent({
        env,
        session_id,
        payment_stage,
        transaction_ref,
        amount,
        payment_method: body.payment_method || "promptpay",
        package_code,
      });
      payment_record_id = rec.id;
      if (payment_record_id) {
        await env.PAY_SESSIONS_KV.put(payrec_key, payment_record_id, { expirationTtl: ttlSeconds });
      }
    } catch (e) {
      // Do not break verify if Airtable fails; return transaction_ref anyway to keep UX.
      return jsonResponse(env, req, 200, {
        ok: true,
        transaction_ref,
        idempotent,
        warning: "airtable_create_failed",
        message: String(e && e.message ? e.message : e),
      });
    }
  }

  return jsonResponse(env, req, 200, {
    ok: true,
    transaction_ref,
    idempotent,
    intent_key,
    payment_stage,
    package_code: package_code || null,
    session_id,
    payment_record_id: payment_record_id || null,
  });
}

async function handleNotify(req, env) {
  if (!requireConfirmKey(env, req)) {
    return jsonResponse(env, req, 401, { ok: false, error: "unauthorized" });
  }

  const body = (await readJson(req)) || {};
  const transaction_ref = String(body.transaction_ref || body.payment_ref || body.ref || "").trim();
  if (!transaction_ref) {
    return jsonResponse(env, req, 400, { ok: false, error: "missing_transaction_ref" });
  }

  const payrec_key = `payrec:${transaction_ref}`;
  let payment_record_id = await env.PAY_SESSIONS_KV.get(payrec_key);

  let paymentRec = null;
  if (payment_record_id) {
    try {
      paymentRec = await airtableGetRecord({ env, tableId: env.AIRTABLE_TABLE_PAYMENTS, recordId: payment_record_id });
    } catch {
      paymentRec = null;
    }
  }

  const fields = (paymentRec && paymentRec.fields) || {};
  const currentStatus = env.AT_PAYMENTS__PAYMENT_STATUS ? fields[env.AT_PAYMENTS__PAYMENT_STATUS] : null;
  const pkgCodeFromPayment = env.AT_PAYMENTS__PACKAGE_CODE ? fields[env.AT_PAYMENTS__PACKAGE_CODE] : "";
  const notesFromPayment = env.AT_PAYMENTS__NOTES ? fields[env.AT_PAYMENTS__NOTES] : "";
  const payment_stage = normalizeStage(body.payment_stage || "" || "");
  // stage fallback from notes
  const stageFromNotes = (String(notesFromPayment).match(/stage=([^;\n]+)/i) || [])[1] || "";
  const stage = normalizeStage(payment_stage || stageFromNotes || (body.stage || ""));
  const session_id = String(body.session_id || extractSessionIdFromNotes(notesFromPayment) || "").trim();
  const package_code = String(body.package_code || pkgCodeFromPayment || "").trim();
  const member_email = String(body.member_email || body.email || "").trim();
  const amount_thb = Number(body.amount || body.amount_thb || (env.AT_PAYMENTS__AMOUNT ? fields[env.AT_PAYMENTS__AMOUNT] : 0) || 0);

  // Idempotent paid check
  if (String(currentStatus || "").toLowerCase() === "paid") {
    return jsonResponse(env, req, 200, {
      ok: true,
      transaction_ref,
      already_paid: true,
      ledger_written: false,
      payment_record_id: payment_record_id || null,
    });
  }

  const paid_at = body.paid_at ? String(body.paid_at) : nowIso();
  const paid_at_date = body.paid_at_date ? String(body.paid_at_date) : dateOnlyIso(new Date(paid_at));
  const provider_txn_id = String(body.provider_txn_id || body.provider_ref || "").trim();
  const receipt_photo = body.receipt_photo || body.receipt || null;

  // Update payment record as paid (best-effort)
  if (payment_record_id) {
    const upd = {};
    if (env.AT_PAYMENTS__PAYMENT_STATUS) upd[env.AT_PAYMENTS__PAYMENT_STATUS] = "Paid";
    if (env.AT_PAYMENTS__PAYMENT_DATE) upd[env.AT_PAYMENTS__PAYMENT_DATE] = paid_at;
    if (env.AT_PAYMENTS__VERIFICATION_STATUS) upd[env.AT_PAYMENTS__VERIFICATION_STATUS] = "Verified";
    if (env.AT_PAYMENTS__PAYMENT_INTENT_STATUS) upd[env.AT_PAYMENTS__PAYMENT_INTENT_STATUS] = "paid";

    if (env.AT_PAYMENTS__NOTES) {
      const extra = `; provider_txn_id=${provider_txn_id || ""}; notified_at=${nowIso()}`;
      upd[env.AT_PAYMENTS__NOTES] = String(notesFromPayment || "") + extra;
    }

    if (env.AT_PAYMENTS__RECEIPT_PHOTO && receipt_photo) {
      upd[env.AT_PAYMENTS__RECEIPT_PHOTO] = Array.isArray(receipt_photo)
        ? receipt_photo
        : [{ url: String(receipt_photo) }];
    }

    try {
      await airtableUpdate({ env, tableId: env.AIRTABLE_TABLE_PAYMENTS, recordId: payment_record_id, fields: upd });
    } catch (e) {
      return jsonResponse(env, req, 200, {
        ok: true,
        transaction_ref,
        warning: "airtable_payment_update_failed",
        message: String(e && e.message ? e.message : e),
        ledger_written: false,
      });
    }
  }

  // Service stages: update Sessions table payment_status/payment_ref (best-effort)
  let session_updated = false;
  let session_record_id = null;

  if (session_id && isServiceStage(stage)) {
    try {
      session_record_id = await airtableFindSessionRecordId({ env, session_id });
      if (session_record_id) {
        const sUpd = {};
        if (env.AT_SESSIONS__PAYMENT_REF) sUpd[env.AT_SESSIONS__PAYMENT_REF] = transaction_ref;
        if (env.AT_SESSIONS__PAYMENT_STATUS) {
          if (stage === "deposit") sUpd[env.AT_SESSIONS__PAYMENT_STATUS] = "deposit_paid";
          if (stage === "final") sUpd[env.AT_SESSIONS__PAYMENT_STATUS] = "paid";
          if (stage === "tips") sUpd[env.AT_SESSIONS__PAYMENT_STATUS] = "tips_paid";
        }
        await airtableUpdate({ env, tableId: env.AIRTABLE_TABLE_SESSIONS, recordId: session_record_id, fields: sUpd });
        session_updated = true;
      }
    } catch {
      session_updated = false;
    }
  }

  // Membership stage: write member_packages + points_ledger (best-effort)
  let membership_ledger = null;
  let points_ledger = null;

  if (isMembershipStage(stage)) {
    membership_ledger = await createMemberPackageLedgerIfEligible({
      env,
      member_email,
      package_code,
      amount_thb,
      payment_ref: transaction_ref,
      paid_at_date,
      provider: body.provider || "promptpay",
      source: body.source || "web",
      note: `membership from ${transaction_ref}`,
    });

    // Award points ONLY when payment is truly Paid+Verified (we just set it)
    points_ledger = await awardPointsIfEligible({
      env,
      member_email,
      payment_ref: transaction_ref,
      session_id,
      amount_thb,
      source: "system",
      note: `points from ${transaction_ref}`,
    });
  }

  return jsonResponse(env, req, 200, {
    ok: true,
    transaction_ref,
    stage,
    payment_record_id: payment_record_id || null,
    session_id: session_id || null,
    package_code: package_code || null,
    session_record_id,
    session_updated,
    membership_ledger,
    points_ledger,
  });
}

// =========================================================
// Router
// =========================================================
export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    let path = url.pathname;
    if (path.length > 1) path = path.replace(/\/+$/g, "");
    const method = req.method.toUpperCase();

    if (method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(env, req) });
    }

    if (method === "GET" && (path === "/ping" || path === "/v1/ping")) {
      return jsonResponse(env, req, 200, { ok: true, name: "payments-worker", ts: nowIso() });
    }

    if (method === "POST" && path === "/v1/pay/verify") {
      return handleVerify(req, env);
    }

    if (method === "POST" && path === "/v1/payments/notify") {
      return handleNotify(req, env);
    }

    return jsonResponse(env, req, 404, { ok: false, error: "not_found", path, method });
  },
};
