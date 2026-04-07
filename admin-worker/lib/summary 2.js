const AIRTABLE_API = "https://api.airtable.com/v0";

function toStr(v) {
  return v == null ? "" : String(v);
}

function safeInt(v) {
  const n = Number(v || 0);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

function atVal(obj, ...keys) {
  for (const k of keys) {
    if (!k) continue;
    if (obj && Object.prototype.hasOwnProperty.call(obj, k)) return obj[k];
  }
  return "";
}

function yearFrom(v) {
  if (!v) return "";
  return String(v).slice(0, 4);
}

function yearOf(v) {
  if (!v) return "";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "";
  return String(d.getUTCFullYear());
}

function nowIso() {
  return new Date().toISOString();
}

function toIsoOrBlank(v) {
  if (!v) return "";
  try {
    return new Date(v).toISOString();
  } catch {
    return "";
  }
}

function isoDate(v) {
  if (!v) return "";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString();
}

function dateOnly(v) {
  const iso = isoDate(v);
  return iso ? iso.slice(0, 10) : "";
}

function sortByDateDesc(arr, getDate) {
  return [...arr].sort((a, b) => {
    const da = new Date(getDate(a) || 0).getTime();
    const db = new Date(getDate(b) || 0).getTime();
    return db - da;
  });
}

function byDateDesc(arr, getDate) {
  return sortByDateDesc(arr, getDate);
}

function maskEmail(email) {
  const e = toStr(email);
  if (!e.includes("@")) return "";
  const [name, domain] = e.split("@");
  if (name.length <= 2) return `${name[0] || "*"}***@${domain}`;
  return `${name.slice(0, 2)}***@${domain}`;
}

function encodeFormulaValue(v) {
  return String(v || "").replace(/'/g, "\\'");
}

function averageTicket(payments) {
  const paid = payments.filter((p) =>
    ["paid", "success", "verified"].includes(toStr(p.payment_status).toLowerCase())
  );
  if (!paid.length) return 0;
  const total = paid.reduce((sum, p) => sum + Number(p.amount_thb || 0), 0);
  return Math.round(total / paid.length);
}

function uniqueStrings(values) {
  return [...new Set(values.filter(Boolean))];
}

function buildInternalAnalytics(sessions, payments) {
  const currentYear = String(new Date().getUTCFullYear());

  const models_used_all_time = uniqueStrings(sessions.map((s) => s.model_name));
  const models_used_this_year = uniqueStrings(
    sessions.filter((s) => yearFrom(s.service_date) === currentYear).map((s) => s.model_name)
  );

  const work_types_all_time = uniqueStrings(sessions.map((s) => s.work_type));
  const work_types_this_year = uniqueStrings(
    sessions.filter((s) => yearFrom(s.service_date) === currentYear).map((s) => s.work_type)
  );

  const service_years = uniqueStrings(sessions.map((s) => yearFrom(s.service_date))).map((y) => Number(y));

  const freq = {};
  for (const s of sessions) {
    if (!s.model_name) continue;
    freq[s.model_name] = (freq[s.model_name] || 0) + 1;
  }

  let favorite_model = null;
  let favorite_model_count = 0;
  for (const [name, count] of Object.entries(freq)) {
    if (count > favorite_model_count) {
      favorite_model = name;
      favorite_model_count = count;
    }
  }

  const sortedSessions = sortByDateDesc(sessions, (s) => s.service_date || "");
  const first_service_at = sortedSessions.length ? sortedSessions[sortedSessions.length - 1].service_date || "" : "";
  const last_service_at = sortedSessions.length ? sortedSessions[0].service_date || "" : "";

  return {
    models_used_all_time,
    models_used_this_year,
    favorite_model,
    favorite_model_count,
    work_types_all_time,
    work_types_this_year,
    service_years,
    lifetime_service_count: sessions.length,
    service_count_this_year: sessions.filter((s) => yearFrom(s.service_date) === currentYear).length,
    first_service_at,
    last_service_at,
    average_ticket_thb: averageTicket(payments),
  };
}

function getAirtableBaseId(env) {
  return env.AIRTABLE_BASE_ID;
}

function getAirtableApiKey(env) {
  return env.AIRTABLE_API_KEY;
}

function getSessionsTable(env) {
  return env.AIRTABLE_TABLE_SESSIONS_ID || env.AIRTABLE_TABLE_SESSIONS || "Sessions";
}

function getPaymentsTable(env) {
  return env.AIRTABLE_TABLE_PAYMENTS_ID || env.AIRTABLE_TABLE_PAYMENTS || "payments";
}

function getPointsLedgerTable(env) {
  return env.AIRTABLE_TABLE_POINTS_LEDGER_ID || env.AIRTABLE_TABLE_POINTS_LEDGER || "points_ledger";
}

function airtableHeaders(env) {
  return {
    Authorization: `Bearer ${getAirtableApiKey(env)}`,
    "Content-Type": "application/json",
  };
}

async function airtableList(env, tableId, { formula = "", maxRecords = 100 } = {}) {
  const params = new URLSearchParams();
  params.set("maxRecords", String(maxRecords || 100));
  if (formula) params.set("filterByFormula", formula);

  const url = `${AIRTABLE_API}/${getAirtableBaseId(env)}/${encodeURIComponent(tableId)}?${params.toString()}`;
  const res = await fetch(url, {
    method: "GET",
    headers: airtableHeaders(env),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`airtable_list_error_${res.status}:${JSON.stringify(data)}`);
  }
  return Array.isArray(data?.records) ? data.records : [];
}

function shapeSession(record, env) {
  const f = record?.fields || {};

  const session_id = toStr(atVal(
    f,
    env.AT_SESSIONS__SESSION_ID,
    "session_id",
    "Session ID"
  ));

  const service_date = toStr(atVal(
    f,
    "service_date",
    "job_date",
    "Date",
    "Service Date"
  ));

  const model_name = toStr(atVal(
    f,
    "model_name",
    "Model Name"
  ));

  const work_type = toStr(atVal(
    f,
    "work_type",
    "job_type",
    "Work Type",
    "Job Type",
    env.AT_SESSIONS__PACKAGE_CODE,
    "package_code",
    "Package Code"
  ));

  const amount_total_thb = safeInt(atVal(
    f,
    "amount_total_thb",
    "amount_thb",
    env.AT_SESSIONS__AMOUNT_THB,
    "Amount THB"
  ));

  const amount_paid_thb = safeInt(atVal(
    f,
    "amount_paid_thb",
    "paid_amount_thb",
    "Amount Paid THB"
  ));

  const payment_status = toStr(atVal(
    f,
    env.AT_SESSIONS__PAYMENT_STATUS,
    "payment_status",
    "Payment Status"
  )).toLowerCase();

  const session_status = toStr(atVal(
    f,
    env.AT_SESSIONS__STATUS,
    "status",
    "Session Status"
  )).toLowerCase();

  const payment_ref = toStr(atVal(
    f,
    env.AT_SESSIONS__PAYMENT_REF,
    "payment_ref",
    "Payment Ref"
  ));

  const memberstack_id = toStr(atVal(
    f,
    env.AT_SESSIONS__MEMBERSTACK_ID,
    "memberstack_id",
    "Memberstack ID"
  ));

  const customer_key = toStr(atVal(
    f,
    "customer_key",
    "Customer Key"
  ));

  const member_email = toStr(atVal(
    f,
    "member_email",
    "Member Email",
    "email",
    "Email"
  ));

  return {
    record_id: record?.id || "",
    session_id,
    service_date: dateOnly(service_date),
    model_name,
    work_type,
    amount_total_thb,
    amount_paid_thb,
    balance_thb: Math.max(0, amount_total_thb - amount_paid_thb),
    payment_status: payment_status || "pending",
    session_status: session_status || "",
    payment_ref,
    memberstack_id,
    customer_key,
    member_email,
  };
}

function shapePayment(record, env) {
  const f = record?.fields || {};

  const payment_ref = toStr(atVal(
    f,
    env.AT_PAYMENTS__PAYMENT_REF,
    "payment_ref",
    "Payment Reference"
  ));

  const amount_thb = safeInt(atVal(
    f,
    env.AT_PAYMENTS__AMOUNT,
    "amount_thb",
    "Amount"
  ));

  const payment_status = toStr(atVal(
    f,
    env.AT_PAYMENTS__PAYMENT_STATUS,
    "payment_status",
    "Payment Status"
  )).toLowerCase();

  const payment_method = toStr(atVal(
    f,
    env.AT_PAYMENTS__PAYMENT_METHOD,
    "payment_method",
    "Payment Method"
  ));

  const paid_at = isoDate(atVal(
    f,
    env.AT_PAYMENTS__PAYMENT_DATE,
    env.AT_PAYMENTS__CREATED_AT,
    "paid_at",
    "Payment Date",
    "Created At"
  ));

  const stage = toStr(atVal(
    f,
    env.AT_PAYMENTS__PACKAGE_CODE,
    "payment_stage",
    "payment_type",
    "package_code",
    "Package Code"
  )).toLowerCase();

  const session_id = toStr(atVal(
    f,
    env.AT_PAYMENTS__SESSION_ID,
    "session_id",
    "Session ID"
  ));

  const member_email = toStr(atVal(
    f,
    "member_email",
    "Member Email",
    "email",
    "Email"
  ));

  const customer_key = toStr(atVal(
    f,
    "customer_key",
    "Customer Key"
  ));

  const verification_status = toStr(atVal(
    f,
    env.AT_PAYMENTS__VERIFICATION_STATUS,
    "verification_status",
    "Verification Status"
  )).toLowerCase();

  return {
    record_id: record?.id || "",
    payment_ref,
    amount_thb,
    payment_status,
    payment_method,
    paid_at,
    stage,
    session_id,
    member_email,
    customer_key,
    verification_status,
  };
}

function shapePoint(record) {
  const f = record?.fields || {};
  return {
    record_id: record?.id || "",
    customer_key: toStr(atVal(f, "customer_key", "Customer Key")),
    member_email: toStr(atVal(f, "member_email", "Member Email")),
    points_delta: safeInt(atVal(f, "points", "Points")),
    entry_type: toStr(atVal(f, "type", "Type")).toLowerCase() || "earn",
    created_at: isoDate(atVal(f, "created_at", "Created At")),
    expires_at: isoDate(atVal(f, "expires_at", "Expires At")),
  };
}

async function findSessionBySessionId(env, sessionId) {
  if (!sessionId) return null;
  const rows = await airtableList(env, getSessionsTable(env), {
    formula: `{${env.AT_SESSIONS__SESSION_ID || "session_id"}}='${encodeFormulaValue(sessionId)}'`,
    maxRecords: 1,
  });
  return rows[0] || null;
}

async function resolveSummaryContext(env, tokenPayload) {
  const ctx = {
    token: tokenPayload || {},
    session_id: toStr(tokenPayload?.session_id),
    customer_key: toStr(tokenPayload?.customer_key),
    member_email: toStr(tokenPayload?.member_email || tokenPayload?.email),
    memberstack_id: toStr(tokenPayload?.memberstack_id),
    display_name: toStr(
      tokenPayload?.display_name ||
      tokenPayload?.client_name ||
      tokenPayload?.customer_name ||
      tokenPayload?.name
    ),
    base_tier: toStr(tokenPayload?.base_tier || tokenPayload?.tier || "Premium"),
    membership_status: toStr(tokenPayload?.membership_status || "active"),
    membership_expires_at: toStr(tokenPayload?.membership_expires_at || ""),
    current_session: null,
  };

  if (ctx.session_id) {
    const rec = await findSessionBySessionId(env, ctx.session_id);
    if (rec?.id) {
      const s = shapeSession(rec, env);
      ctx.current_session = s;
      ctx.customer_key = ctx.customer_key || s.customer_key;
      ctx.member_email = ctx.member_email || s.member_email;
      ctx.memberstack_id = ctx.memberstack_id || s.memberstack_id;
    }
  }

  return ctx;
}

async function fetchSummaryCollectionsJoined(env, ctx) {
  const sessionsTable = getSessionsTable(env);
  const paymentsTable = getPaymentsTable(env);
  const pointsTable = getPointsLedgerTable(env);

  let sessionRows = [];
  let paymentRows = [];
  let pointRows = [];

  if (ctx.customer_key) {
    sessionRows = await airtableList(env, sessionsTable, {
      formula: `{customer_key}='${encodeFormulaValue(ctx.customer_key)}'`,
      maxRecords: 100,
    });

    paymentRows = await airtableList(env, paymentsTable, {
      formula: `{customer_key}='${encodeFormulaValue(ctx.customer_key)}'`,
      maxRecords: 100,
    });

    pointRows = await airtableList(env, pointsTable, {
      formula: `{customer_key}='${encodeFormulaValue(ctx.customer_key)}'`,
      maxRecords: 100,
    });
  }

  if (!sessionRows.length && !paymentRows.length && ctx.member_email) {
    sessionRows = await airtableList(env, sessionsTable, {
      formula: `{member_email}='${encodeFormulaValue(ctx.member_email)}'`,
      maxRecords: 100,
    });

    paymentRows = await airtableList(env, paymentsTable, {
      formula: `{member_email}='${encodeFormulaValue(ctx.member_email)}'`,
      maxRecords: 100,
    });

    pointRows = await airtableList(env, pointsTable, {
      formula: `{member_email}='${encodeFormulaValue(ctx.member_email)}'`,
      maxRecords: 100,
    });
  }

  if (!sessionRows.length && ctx.memberstack_id) {
    sessionRows = await airtableList(env, sessionsTable, {
      formula: `{${env.AT_SESSIONS__MEMBERSTACK_ID || "memberstack_id"}}='${encodeFormulaValue(ctx.memberstack_id)}'`,
      maxRecords: 100,
    });
  }

  if (!sessionRows.length && ctx.current_session?.session_id) {
    sessionRows = [{
      id: ctx.current_session.record_id,
      fields: {},
      _shaped: ctx.current_session,
    }];
  }

  const sessions = sessionRows.map((r) => r._shaped || shapeSession(r, env));
  const payments = paymentRows.map((r) => shapePayment(r, env));
  const points = pointRows.map((r) => shapePoint(r));

  const sessionMap = new Map();
  for (const s of sessions) {
    if (s.session_id) sessionMap.set(s.session_id, s);
  }

  const paymentsJoined = payments.map((p) => ({
    ...p,
    session: p.session_id ? sessionMap.get(p.session_id) || null : null,
    model_name: p.session_id ? sessionMap.get(p.session_id)?.model_name || "" : "",
    work_type: p.session_id ? sessionMap.get(p.session_id)?.work_type || "" : "",
    service_date: p.session_id ? sessionMap.get(p.session_id)?.service_date || "" : "",
  }));

  return {
    sessions,
    payments,
    paymentsJoined,
    points,
  };
}

function computePointTotals(points) {
  const now = Date.now();
  let lifetime_points = 0;
  let active_points = 0;

  for (const p of points) {
    const delta = Number(p.points_delta || 0);
    const type = toStr(p.entry_type).toLowerCase();

    if (type === "earn" && delta > 0) {
      lifetime_points += delta;
      if (!p.expires_at) {
        active_points += delta;
      } else {
        const expiry = new Date(p.expires_at).getTime();
        if (!Number.isNaN(expiry) && expiry >= now) active_points += delta;
      }
      continue;
    }

    active_points += delta;
  }

  return {
    lifetime_points: Math.max(0, lifetime_points),
    active_points: Math.max(0, active_points),
  };
}

function buildYearlySummaryJoined(paymentsJoined, sessions) {
  const out = {};
  const sessionIdsPerYear = {};

  for (const p of paymentsJoined) {
    if (!["paid", "success", "verified"].includes(toStr(p.payment_status).toLowerCase())) continue;
    const y = yearOf(p.paid_at || p.service_date);
    if (!y) continue;
    out[y] ||= { spent_thb: 0, service_count: 0 };
    out[y].spent_thb += Number(p.amount_thb || 0);
  }

  for (const s of sessions) {
    const y = yearOf(s.service_date);
    if (!y) continue;
    sessionIdsPerYear[y] ||= new Set();
    if (s.session_id) sessionIdsPerYear[y].add(s.session_id);
  }

  for (const [year, ids] of Object.entries(sessionIdsPerYear)) {
    out[year] ||= { spent_thb: 0, service_count: 0 };
    out[year].service_count = ids.size;
  }

  return out;
}

function buildPublicSummaryJoined(ctx, collections) {
  const sessions = collections.sessions || [];
  const paymentsJoined = collections.paymentsJoined || [];
  const points = collections.points || [];

  const paid = paymentsJoined.filter((p) =>
    ["paid", "success", "verified"].includes(toStr(p.payment_status).toLowerCase())
  );

  const currentYear = String(new Date().getUTCFullYear());
  const spent_lifetime_thb = paid.reduce((sum, p) => sum + Number(p.amount_thb || 0), 0);
  const spent_this_year_thb = paid
    .filter((p) => yearOf(p.paid_at || p.service_date) === currentYear)
    .reduce((sum, p) => sum + Number(p.amount_thb || 0), 0);

  const service_count_lifetime = new Set(sessions.map((s) => s.session_id).filter(Boolean)).size;
  const service_count_this_year = new Set(
    sessions.filter((s) => yearOf(s.service_date) === currentYear).map((s) => s.session_id).filter(Boolean)
  ).size;

  const pointTotals = computePointTotals(points);

  const sortedSessions = byDateDesc(sessions, (s) => s.service_date || "");
  let current = null;

  if (ctx.session_id) {
    current = sortedSessions.find((s) => s.session_id === ctx.session_id) || ctx.current_session || null;
  } else {
    current = sortedSessions[0] || null;
  }

  if (current?.session_id) {
    const paidForCurrent = paid
      .filter((p) => p.session_id === current.session_id)
      .reduce((sum, p) => sum + Number(p.amount_thb || 0), 0);

    current = {
      ...current,
      amount_paid_thb: paidForCurrent,
      balance_thb: Math.max(0, Number(current.amount_total_thb || 0) - paidForCurrent),
      payment_status:
        paidForCurrent <= 0
          ? "pending"
          : paidForCurrent < Number(current.amount_total_thb || 0)
          ? "partial_paid"
          : "paid",
    };
  }

  const recent_services = sortedSessions.slice(0, 5).map((s) => {
    const paidAmt = paid
      .filter((p) => p.session_id === s.session_id)
      .reduce((sum, p) => sum + Number(p.amount_thb || 0), 0);

    const total = Number(s.amount_total_thb || 0);
    return {
      session_id: s.session_id || "",
      service_date: s.service_date || "",
      job_name: s.work_type || "",
      work_type: s.work_type || "",
      model_name: s.model_name || "",
      amount_total_thb: total,
      amount_paid_thb: paidAmt,
      balance_thb: Math.max(0, total - paidAmt),
      payment_status: paidAmt <= 0 ? "pending" : paidAmt < total ? "partial_paid" : "paid",
    };
  });

  return {
    ok: true,
    member: {
      customer_key: ctx.customer_key || "",
      display_name: ctx.display_name || "MMD Member",
      email_masked: maskEmail(ctx.member_email),
      base_tier: ctx.base_tier || "Premium",
      membership_status: ctx.membership_status || "active",
      membership_expires_at: isoDate(ctx.membership_expires_at),
    },
    summary: {
      spent_lifetime_thb,
      spent_this_year_thb,
      service_count_lifetime,
      service_count_this_year,
      active_points: pointTotals.active_points || 0,
    },
    current_session: current
      ? {
          session_id: current.session_id || "",
          model_name: current.model_name || "",
          service_date: current.service_date || "",
          amount_total_thb: Number(current.amount_total_thb || 0),
          amount_paid_thb: Number(current.amount_paid_thb || 0),
          balance_thb: Number(current.balance_thb || 0),
          payment_status: current.payment_status || "pending",
        }
      : null,
    recent_services,
    yearly_summary: buildYearlySummaryJoined(paid, sessions),
    meta: {
      generated_at: nowIso(),
    },
  };
}

function buildInternalSummary(ctx, collections) {
  const payments = Array.isArray(collections?.payments) ? collections.payments : [];
  const sessions = Array.isArray(collections?.sessions) ? collections.sessions : [];
  const points = Array.isArray(collections?.points) ? collections.points : [];

  const publicSummary = buildPublicSummaryJoined(ctx, collections);
  const pointTotals = computePointTotals(points);

  const paidPayments = payments.filter((p) =>
    ["paid", "success", "verified"].includes(toStr(p.payment_status).toLowerCase())
  );

  const spent_lifetime_thb = paidPayments.reduce((sum, p) => sum + Number(p.amount_thb || 0), 0);
  const currentYear = String(new Date().getUTCFullYear());
  const spent_this_year_thb = paidPayments
    .filter((p) => yearFrom(p.paid_at) === currentYear)
    .reduce((sum, p) => sum + Number(p.amount_thb || 0), 0);

  const outstanding_balance_thb = sessions.reduce(
    (sum, s) => sum + Number(s.balance_thb || 0),
    0
  );

  const analytics = buildInternalAnalytics(sessions, payments);

  const anomalies = [];
  const seenRefs = new Set();
  for (const p of payments) {
    if (p.payment_ref && seenRefs.has(p.payment_ref)) {
      anomalies.push({
        type: "duplicate_payment_ref",
        payment_ref: p.payment_ref,
      });
    }
    if (p.payment_ref) seenRefs.add(p.payment_ref);

    if (!p.session_id) {
      anomalies.push({
        type: "missing_session_id",
        payment_ref: p.payment_ref || "",
      });
    }
  }

  return {
    ok: true,
    member_operational_internal: {
      identity: {
        customer_key: ctx.customer_key || "",
        memberstack_id: ctx.memberstack_id || "",
        display_name: ctx.display_name || "MMD Member",
        email: ctx.member_email || "",
      },
      membership: {
        base_tier: ctx.base_tier || "Premium",
        membership_status: ctx.membership_status || "active",
        membership_expires_at: toIsoOrBlank(ctx.membership_expires_at),
      },
      points: {
        lifetime_points: pointTotals.lifetime_points || 0,
        active_points: pointTotals.active_points || 0,
      },
      finance: {
        spent_lifetime_thb,
        spent_this_year_thb,
        payments_count_lifetime: payments.length,
        payments_count_this_year: payments.filter((p) => yearFrom(p.paid_at) === currentYear).length,
        outstanding_balance_thb,
        average_ticket_thb: analytics.average_ticket_thb || 0,
      },
      sessions: sortByDateDesc(sessions, (s) => s.service_date || ""),
      payments: sortByDateDesc(payments, (p) => p.paid_at || ""),
      analytics,
      ops: {
        anomalies,
        risk_flags: [],
        internal_notes: [],
      },
      meta: {
        generated_at: nowIso(),
        public_summary_snapshot: publicSummary.summary,
      },
    },
  };
}

export async function buildSummary(env, tokenPayload, mode = "internal") {
  const ctx = await resolveSummaryContext(env, tokenPayload);
  const collections = await fetchSummaryCollectionsJoined(env, ctx);

  if (mode === "public") {
    return buildPublicSummaryJoined(ctx, collections);
  }

  return buildInternalSummary(ctx, {
    payments: collections.payments,
    sessions: collections.sessions,
    points: collections.points,
    paymentsJoined: collections.paymentsJoined,
  });
}