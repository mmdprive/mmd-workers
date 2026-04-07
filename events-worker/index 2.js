/* =========================================================
   MMD Privé — Events Worker (Airtable Jobs + Dispatch Flow)
   Merge: GitHub current (job create/get/event + realtime open)
          + Memory state machine (send model -> customer)

   Routes:
     - GET  /health
     - OPTIONS /*
     - POST /v1/rules/ack       (X-Confirm-Key required)
     - POST /v1/job/create      (X-Confirm-Key required)
     - POST /v1/job/get         (X-Confirm-Key required)
     - POST /v1/job/event       (X-Confirm-Key required, optional idempotency)

   Airtable:
     - AIRTABLE_BASE_ID
     - AIRTABLE_TABLE_JOBS (default "jobs")

   Optional KV (idempotency):
     - EVENTS_IDEMPOTENCY_KV (binding)
     - EVENTS_IDEMPOTENCY_TTL_DAYS (var, default 7)

   Realtime (existing behavior):
     - RT_BASE_URL
     - RT_CONFIRM_KEY (optional; default uses CONFIRM_KEY)

   Dispatch side-effects (memory):
     - TELEGRAM_WORKER_BASE_URL (optional; if set, will notify)
     - INTERNAL_TOKEN (required if TELEGRAM_WORKER_BASE_URL is set)

   Memory state machine (canonical):
     confirmed -> reminder -> en_route -> arrived -> met -> final_payment_pending
     -> work_started -> work_finished -> separated -> review -> payout

   Hard gate:
     - MUST NOT allow work_started unless final_payment_confirmed exists in events.
========================================================= */

function json(obj, status = 200, headers = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...headers },
  });
}
async function safeJson(req) {
  try { return await req.json(); } catch { return null; }
}
class HttpError extends Error {
  constructor(status, body) { super(body?.error || "HttpError"); this.status = status; this.body = body; }
}

function str(v){ return String(v ?? "").trim(); }
function num(v){ const n = Number(String(v??"").replace(/,/g,"").trim()); return Number.isFinite(n)? n:0; }
function nowIso(){ return new Date().toISOString(); }

/* -------------------------
   Event normalization
------------------------- */
function normalizeEventName(input){
  const raw = str(input);
  const lower = raw.toLowerCase();

  // Canonical mapping for: "T-15min เปิด live chat"
  const hasT15 = lower.includes("t-15") || lower.includes("t15") || lower.includes("t 15");
  const hasLiveChat =
    lower.includes("live chat") || lower.includes("livechat") || lower.includes("live") ||
    raw.includes("แชท") || raw.includes("แชต");
  if (hasT15 && hasLiveChat) return "t-15min_open_live_chat";

  return lower.trim().replace(/\s+/g, "_");
}

/* -------------------------
   Realtime worker call (existing)
------------------------- */
function rtOpenUrl(env){
  const base = str(env.RT_BASE_URL);
  if (!base) return "";
  return `${base.replace(/\/+$/,"")}/v1/rt/room/open`;
}
async function rtRoomOpen(env, payload){
  const url = rtOpenUrl(env);
  if (!url) throw new HttpError(500, { ok:false, error:"missing_rt_base_url" });

  // default: reuse CONFIRM_KEY for internal-to-internal
  const key = str(env.RT_CONFIRM_KEY || env.CONFIRM_KEY);
  if (!key) throw new HttpError(500, { ok:false, error:"missing_rt_confirm_key" });

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Confirm-Key": key,
    },
    body: JSON.stringify(payload || {}),
  });

  const data = await res.json().catch(()=>null);
  if (!res.ok) throw new HttpError(res.status, { ok:false, error:"rt_open_failed", detail:data });
  return data;
}

/* -------------------------
   CORS + Auth
------------------------- */
function buildCors(origin, allowedCsv){
  const allowed = (allowedCsv||"").split(",").map(s=>s.trim()).filter(Boolean);
  const ok = origin && (allowed.includes(origin) || allowed.includes("*"));
  return { ok, origin: ok ? origin : (allowed.includes("*") ? "*" : "") };
}
function corsHeaders(cors){
  const h = {
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Confirm-Key, Authorization",
    "Access-Control-Max-Age": "86400",
  };
  if (cors.origin) h["Access-Control-Allow-Origin"] = cors.origin;
  return h;
}
function requireConfirmKey(req, env){
  const need = String(env.CONFIRM_KEY || "").trim();
  if (!need) throw new HttpError(500, { ok:false, error:"missing_confirm_key_env" });

  const h1 = String(req.headers.get("X-Confirm-Key") || "").trim();
  const h2 = String(req.headers.get("x-confirm-key") || "").trim();
  const auth = String(req.headers.get("Authorization") || "").trim();
  const h3 = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";

  const got = h1 || h2 || h3;
  if (!got || got !== need) throw new HttpError(401, { ok:false, error:"confirm_key_required" });
}

/* -------------------------
   Airtable (jobs)
------------------------- */
function airtableUrl(env){
  const base = str(env.AIRTABLE_BASE_ID);
  const table = encodeURIComponent(str(env.AIRTABLE_TABLE_JOBS || "jobs"));
  if (!base) throw new HttpError(500, { ok:false, error:"missing_airtable_base_id" });
  return `https://api.airtable.com/v0/${base}/${table}`;
}
async function atFetch(env, pathOrUrl, opts = {}){
  const url = pathOrUrl.startsWith("http") ? pathOrUrl : `${airtableUrl(env)}${pathOrUrl}`;
  const key = str(env.AIRTABLE_API_KEY);
  if (!key) throw new HttpError(500, { ok:false, error:"missing_airtable_api_key" });

  const res = await fetch(url, {
    ...opts,
    headers: {
      "Authorization": `Bearer ${key}`,
      "Content-Type": "application/json",
      ...(opts.headers || {}),
    },
  });
  const data = await res.json().catch(()=>null);
  if (!res.ok) throw new HttpError(res.status, { ok:false, error:"airtable_error", detail:data });
  return data;
}
function makeJobId(cid){
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `JOB-${String(cid||"CID").replace(/[^A-Z0-9\-]/gi,"").slice(-10)}-${rand}`;
}
async function findJobByJobId(env, job_id){
  const formula = encodeURIComponent(`{job_id}="${job_id}"`);
  const data = await atFetch(env, `?filterByFormula=${formula}&maxRecords=1`);
  return (data.records && data.records[0]) || null;
}

/* -------------------------
   Optional Idempotency (KV)
------------------------- */
function idemTtlSeconds(env, fallbackDays = 7) {
  const days = Number(str(env.EVENTS_IDEMPOTENCY_TTL_DAYS || fallbackDays));
  const d = Number.isFinite(days) && days > 0 ? days : fallbackDays;
  return Math.floor(d * 24 * 60 * 60);
}
function hasIdemKv(env) { return Boolean(env.EVENTS_IDEMPOTENCY_KV); }
async function idemGet(env, key) {
  if (!hasIdemKv(env)) return null;
  const raw = await env.EVENTS_IDEMPOTENCY_KV.get(`idem:${key}`);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return { raw }; }
}
async function idemPut(env, key, valueObj) {
  if (!hasIdemKv(env)) return { ok:false, skipped:true, reason:"no_kv_binding" };
  const ttl = idemTtlSeconds(env, 7);
  await env.EVENTS_IDEMPOTENCY_KV.put(`idem:${key}`, JSON.stringify(valueObj || {}), { expirationTtl: ttl });
  return { ok:true, ttl_seconds: ttl };
}

/* =========================================================
   Memory dispatch rules (applied on top of job/event)
========================================================= */
const DISPATCH_STATES = [
  "confirmed",
  "reminder",
  "en_route",
  "nearby",
  "arrived",
  "met_customer",
  "final_payment_pending",
  "final_payment_confirmed",
  "work_started",
  "work_finished",
  "separated",
  "review",
  "payout",
  "closed",
];

function hasFinalPaymentConfirmed(events){
  return Array.isArray(events) && events.some(e => e?.event === "final_payment_confirmed");
}

/* -------------------------
   Telegram-worker internal notify (optional)
------------------------- */
function tgInternalSendUrl(env){
  const base = str(env.TELEGRAM_WORKER_BASE_URL);
  if (!base) return "";
  return `${base.replace(/\/+$/, "")}/telegram/internal/send`;
}
async function tgInternalSend(env, payload){
  const url = tgInternalSendUrl(env);
  if (!url) return { ok:false, skipped:true, reason:"missing_telegram_worker_base_url" };

  const token = str(env.INTERNAL_TOKEN);
  if (!token) return { ok:false, skipped:true, reason:"missing_internal_token" };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
    },
    body: JSON.stringify(payload || {}),
  });
  const data = await res.json().catch(()=>null);
  if (!res.ok) return { ok:false, error:"telegram_worker_failed", status: res.status, detail:data };
  return { ok:true, detail:data };
}

function buildDispatchPayload(event, status, jobFields, extra = {}){
  return {
    flow: "dispatch",
    event,
    status,
    job_id: str(jobFields?.job_id),
    cid: str(jobFields?.cid),
    session_id: str(jobFields?.session_id),
    model_code: str(jobFields?.model_code),
    schedule_start_at: str(jobFields?.schedule_start_at),
    meeting_point_text: str(jobFields?.meeting_point_text),
    city: str(jobFields?.city),
    ts: nowIso(),
    ...extra,
  };
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const path = url.pathname;
    const method = req.method.toUpperCase();

    const origin = str(req.headers.get("Origin"));
    const cors = buildCors(origin, env.ALLOWED_ORIGINS || "");

    if (method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(cors) });

    try {
      if (method === "GET" && (path === "/" || path === "/health")) {
        return json({ ok:true, worker:"events-worker", lock: env.LOCK || "v2026-LOCK-01" }, 200, corsHeaders(cors));
      }

      if (path.startsWith("/v1/")) requireConfirmKey(req, env);

      /* -------------------------
         rules/ack (existing)
      ------------------------- */
      if (path === "/v1/rules/ack" && method === "POST") {
        const body = await safeJson(req);
        if (!body) return json({ ok:false, error:"invalid_json" }, 400, corsHeaders(cors));

        const out = {
          ok: true,
          accepted: true,
          role: str(body.role) || null,
          rules: str(body.rules) || null,
          session_id: str(body.session_id) || null,
          accepted_at: str(body.accepted_at) || nowIso(),
        };

        const idemKey = str(body.idempotency_key);
        if (idemKey) {
          const prev = await idemGet(env, idemKey);
          if (prev?.ok) return json({ ok:true, idempotent:true, result: prev.result }, 200, corsHeaders(cors));
          await idemPut(env, idemKey, { ok:true, result: out });
        }

        return json(out, 200, corsHeaders(cors));
      }

      /* -------------------------
         job/create (existing)
      ------------------------- */
      if (path === "/v1/job/create" && method === "POST") {
        const body = await safeJson(req);
        if (!body) return json({ ok:false, error:"invalid_json" }, 400, corsHeaders(cors));

        const cid = str(body.cid);
        const session_id = str(body.session_id);
        const model_code = str(body.model_code);
        const schedule_start_at = str(body.schedule_start_at);

        if (!cid || !session_id || !model_code || !schedule_start_at) {
          return json({ ok:false, error:"missing_required", required:["cid","session_id","model_code","schedule_start_at"] }, 422, corsHeaders(cors));
        }

        const job_id = body.job_id ? str(body.job_id) : makeJobId(cid);
        const created_at = nowIso();

        const fields = {
          job_id,
          cid,
          session_id,
          model_code,
          customer_name: str(body.customer_name),
          schedule_start_at,
          meeting_point_text: str(body.meeting_point_text),
          city: str(body.city),
          duration_hr: num(body.duration_hr),
          total_thb: num(body.total_thb),
          deposit_thb: num(body.deposit_thb),
          balance_thb: num(body.balance_thb),
          transport_fee_thb: num(body.transport_fee_thb),
          status: str(body.status) || "confirmed",
          last_update_at: created_at,
          events_json: JSON.stringify([{ ts: created_at, event: "created", by: "admin", note: "job created" }]),
        };

        const created = await atFetch(env, "", {
          method: "POST",
          body: JSON.stringify({ records: [{ fields }] }),
        });

        return json({ ok:true, job_id, airtable: created.records?.[0]?.id || null }, 200, corsHeaders(cors));
      }

<<<<<<< HEAD
      /* -------------------------
         job/get (existing)
      ------------------------- */
      if (path === "/v1/job/get" && method === "POST") {
        const body = await safeJson(req);
        if (!body) return json({ ok:false, error:"invalid_json" }, 400, corsHeaders(cors));

        const job_id = str(body.job_id);
        if (!job_id) return json({ ok:false, error:"missing_job_id" }, 422, corsHeaders(cors));

        const rec = await findJobByJobId(env, job_id);
        if (!rec) return json({ ok:false, error:"job_not_found" }, 404, corsHeaders(cors));

        return json({ ok:true, job: rec.fields, airtable_id: rec.id }, 200, corsHeaders(cors));
      }

      /* -------------------------
         job/event (existing + memory dispatch)
      ------------------------- */
      if (path === "/v1/job/event" && method === "POST") {
        const body = await safeJson(req);
        if (!body) return json({ ok:false, error:"invalid_json" }, 400, corsHeaders(cors));

        const job_id = str(body.job_id);
        const event_raw = str(body.event);
        const event = normalizeEventName(event_raw);

        if (!job_id || !event) {
          return json({ ok:false, error:"missing_required", required:["job_id","event"] }, 422, corsHeaders(cors));
        }

        // idempotency
        const idemKey = str(body.idempotency_key);
        if (idemKey) {
          const prev = await idemGet(env, idemKey);
          if (prev?.ok) return json({ ok:true, idempotent:true, result: prev.result }, 200, corsHeaders(cors));
        }

        const rec = await findJobByJobId(env, job_id);
        if (!rec) return json({ ok:false, error:"job_not_found" }, 404, corsHeaders(cors));

        const ts = nowIso();
        let events = [];
        try { events = JSON.parse(rec.fields?.events_json || "[]"); } catch { events = []; }

        events.push({ ts, event, event_raw: event_raw || null, by: str(body.by) || "system", data: body.data || null });

        // status resolution (existing behavior)
        const statusFromBody = str(body.status);
        const statusAuto =
          DISPATCH_STATES.includes(event) ? event : (str(rec.fields?.status) || "confirmed");
        const status = statusFromBody || statusAuto;

        // MEMORY HARD GATE:
        // block work_started unless final_payment_confirmed exists in history
        if (status === "work_started" && !hasFinalPaymentConfirmed(events)) {
          return json({ ok:false, error:"final_payment_required_before_work_started" }, 409, corsHeaders(cors));
        }

        // Update Airtable
        const updated = await atFetch(env, "", {
          method: "PATCH",
          body: JSON.stringify({
            records: [{
              id: rec.id,
              fields: {
                status,
                last_update_at: ts,
                events_json: JSON.stringify(events),
              }
            }]
          }),
        });

        // Existing: realtime open on t-15
        let rt = null;
        if (event === "t-15min_open_live_chat") {
          const job = rec.fields || {};
          const rtPayload = {
            job_id,
            cid: str(job.cid),
            session_id: str(job.session_id),
            model_code: str(job.model_code),
            schedule_start_at: str(job.schedule_start_at),
            meeting_point_text: str(job.meeting_point_text),
            city: str(job.city),
          };
          rt = await rtRoomOpen(env, rtPayload);
        }

        // NEW (memory): dispatch side-effects via telegram-worker (optional)
        let side_effects = [];
        {
          const job = rec.fields || {};
          const tg1 = await tgInternalSend(env, buildDispatchPayload(event, status, job));
          side_effects.push({ type:"telegram_notify", ...tg1 });

          // Near arrival: request meeting point + balance QR (telegram-worker decides UI)
          if (event === "nearby" || event === "arrived") {
            const tg2 = await tgInternalSend(env, buildDispatchPayload(event, status, job, { action:"meeting_point_select_and_balance_qr" }));
            side_effects.push({ type:"meeting_point_and_qr", ...tg2 });
          }

          // Separated -> review + tips
          if (event === "separated") {
            const tg3 = await tgInternalSend(env, buildDispatchPayload(event, status, job, { action:"request_review_and_tip" }));
            side_effects.push({ type:"review_tip", ...tg3 });
          }

          // Review/Payout -> payout notice
          if (event === "review" || event === "payout") {
            const tg4 = await tgInternalSend(env, buildDispatchPayload(event, status, job, { action:"payout_notice", note:"payout target: within 30 minutes (handled by Per)" }));
            side_effects.push({ type:"payout_notice", ...tg4 });
          }
        }

        const result = { ok:true, job_id, status, updated_at: ts, airtable: updated.records?.[0]?.id || null, rt, side_effects };

        if (idemKey) await idemPut(env, idemKey, { ok:true, result });

        return json(result, 200, corsHeaders(cors));
      }

      return json({ ok:false, error:"not_found" }, 404, corsHeaders(cors));
=======

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
>>>>>>> b0304e7 (Feat: events-worker 24h reminder + 12h ack check (cron))
    } catch (err) {
      if (err instanceof HttpError) return json(err.body, err.status, corsHeaders(cors));
      return json({ ok:false, error:"server_error", detail:String(err?.message || err) }, 500, corsHeaders(cors));
    }
  },
};
<<<<<<< HEAD
=======

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

>>>>>>> b0304e7 (Feat: events-worker 24h reminder + 12h ack check (cron))
