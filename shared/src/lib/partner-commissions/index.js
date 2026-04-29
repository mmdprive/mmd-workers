const AIRTABLE_API = "https://api.airtable.com/v0";

const FIELD_ALIASES = {
  partnerCommissions: {
    commissionKey: ["commission_key", "Commission Key"],
    sessionId: ["session_id", "Session ID"],
    jobId: ["job_id", "Job ID"],
    paymentRef: ["payment_ref", "Payment Ref"],
    partnerId: ["partner_id", "Partner ID"],
    referralId: ["referral_id", "Referral ID"],
    modelId: ["model_id", "Model ID"],
    eligibilityStatus: ["eligibility_status", "Eligibility Status"],
    approvalStatus: ["approval_status", "Approval Status"],
    payoutStatus: ["payout_status", "Payout Status"],
    splitIndex: ["split_index", "Split Index"],
    splitPercent: ["split_percent", "Split Percent"],
    commissionGroupKey: ["commission_group_key", "Commission Group Key"],
    auditJson: ["audit_json", "Audit JSON"],
    partnerSnapshotJson: ["partner_snapshot_json", "Partner Snapshot JSON"],
    referralSnapshotJson: ["referral_snapshot_json", "Referral Snapshot JSON"],
    commissionSnapshotJson: ["commission_snapshot_json", "Commission Snapshot JSON"],
    commissionSnapshotLocked: ["commission_snapshot_locked", "Commission Snapshot Locked"],
    eligibilityPaymentRef: ["eligibility_payment_ref", "Eligibility Payment Ref"],
    eligibleAt: ["eligible_at", "Eligible At"],
    approvedBy: ["approved_by", "Approved By"],
    approvedAt: ["approved_at", "Approved At"],
    paidAt: ["paid_at", "Paid At"],
    heldReason: ["held_reason", "Held Reason"],
    voidReason: ["void_reason", "Void Reason"],
    payoutReference: ["payout_reference", "Payout Reference"],
    earnedAt: ["earned_at", "Earned At"],
    commissionAmount: ["commission_amount", "Commission Amount"],
    commissionBasisAmount: ["commission_basis_amount", "Commission Basis Amount"],
    commissionRateSnapshot: ["commission_rate_snapshot", "Commission Rate Snapshot"],
    commissionTypeSnapshot: ["commission_type_snapshot", "Commission Type Snapshot"],
    currency: ["currency", "Currency"],
  },
  sessions: {
    sessionId: ["session_id", "Session ID"],
    partnerSnapshotJson: ["partner_snapshot_json", "Partner Snapshot JSON"],
    referralSnapshotJson: ["referral_snapshot_json", "Referral Snapshot JSON"],
    commissionSnapshotJson: ["commission_snapshot_json", "Commission Snapshot JSON"],
    commissionGroupKey: ["commission_group_key", "Commission Group Key"],
    commissionSnapshotLocked: ["commission_snapshot_locked", "Commission Snapshot Locked"],
    commissionEligibilityStatus: ["commission_eligibility_status", "Commission Eligibility Status"],
    commissionLastPaymentRef: ["commission_last_payment_ref", "Commission Last Payment Ref"],
    commissionEligibleAt: ["commission_eligible_at", "Commission Eligible At"],
    partnerIdSnapshot: ["partner_id_snapshot", "Partner ID Snapshot"],
    partnerReferralIdSnapshot: ["partner_referral_id_snapshot", "Partner Referral ID Snapshot"],
    partnerCommissionState: ["partner_commission_state", "Partner Commission State"],
    commissionEligible: ["commission_eligible", "Commission Eligible"],
  },
  jobs: {
    jobId: ["job_id", "Job ID"],
    sessionId: ["session_id", "Session ID"],
    partnerSnapshotJson: ["partner_snapshot_json", "Partner Snapshot JSON"],
    referralSnapshotJson: ["referral_snapshot_json", "Referral Snapshot JSON"],
    commissionSnapshotJson: ["commission_snapshot_json", "Commission Snapshot JSON"],
    commissionGroupKey: ["commission_group_key", "Commission Group Key"],
    commissionSnapshotLocked: ["commission_snapshot_locked", "Commission Snapshot Locked"],
    commissionEligibilityStatus: ["commission_eligibility_status", "Commission Eligibility Status"],
    commissionLastPaymentRef: ["commission_last_payment_ref", "Commission Last Payment Ref"],
    commissionEligibleAt: ["commission_eligible_at", "Commission Eligible At"],
    partnerIdSnapshot: ["partner_id_snapshot", "Partner ID Snapshot"],
    partnerReferralIdSnapshot: ["partner_referral_id_snapshot", "Partner Referral ID Snapshot"],
    commissionState: ["commission_state", "Commission State"],
    commissionEligible: ["commission_eligible", "Commission Eligible"],
    partnerCommissionId: ["partner_commission_id", "Partner Commission ID"],
    commissionSnapshotLockedAt: ["commission_snapshot_locked_at", "Commission Snapshot Locked At"],
  },
  modelReferrals: {
    modelId: ["model_id", "Model ID", "Model"],
    ownershipStatus: ["ownership_status", "Ownership Status"],
    notes: ["notes", "Notes"],
    approvedAt: ["approved_at", "Approved At"],
    approvedBy: ["approved_by", "Approved By"],
  },
};

export function toStr(value) {
  return value == null ? "" : String(value).trim();
}

export function toNum(value) {
  const n = Number(String(value ?? "").replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : null;
}

export function nowIso() {
  return new Date().toISOString();
}

export function compactObject(value) {
  return Object.fromEntries(
    Object.entries(value || {}).filter(([, entry]) => {
      if (entry == null) return false;
      if (typeof entry === "string") return entry.trim().length > 0;
      return true;
    })
  );
}

function envFieldOverrideName(scopeKey, fieldKey) {
  return `AT_${scopeKey.toUpperCase()}__${fieldKey
    .replace(/([A-Z])/g, "_$1")
    .toUpperCase()}`;
}

function fieldCandidates(env, scopeKey, fieldKey) {
  const override = toStr(env?.[envFieldOverrideName(scopeKey, fieldKey)]);
  const aliases = FIELD_ALIASES?.[scopeKey]?.[fieldKey] || [];
  return [override, ...aliases].filter(Boolean);
}

function fieldName(env, scopeKey, fieldKey) {
  const [first] = fieldCandidates(env, scopeKey, fieldKey);
  if (!first) throw new Error(`missing_field_alias:${scopeKey}.${fieldKey}`);
  return first;
}

function findFieldValue(fields = {}, env, scopeKey, fieldKey) {
  for (const key of fieldCandidates(env, scopeKey, fieldKey)) {
    if (Object.prototype.hasOwnProperty.call(fields, key)) return fields[key];
  }
  return undefined;
}

function mapFields(env, scopeKey, entries) {
  const out = {};
  for (const [fieldKey, value] of Object.entries(entries)) {
    if (value === undefined) continue;
    out[fieldName(env, scopeKey, fieldKey)] = value;
  }
  return out;
}

function getBaseId(env) {
  const baseId = toStr(env.AIRTABLE_BASE_ID);
  if (!baseId) throw new Error("missing_airtable_base_id");
  return baseId;
}

function getApiKey(env) {
  const apiKey = toStr(env.AIRTABLE_API_KEY);
  if (!apiKey) throw new Error("missing_airtable_api_key");
  return apiKey;
}

export function getPartnerCommissionsTable(env) {
  return toStr(env.AIRTABLE_TABLE_PARTNER_COMMISSIONS || "tblbq4M1bhpwU2BGW");
}

export function getModelReferralsTable(env) {
  return toStr(env.AIRTABLE_TABLE_MODEL_REFERRALS || "tblrmSsCZxJSCQR9n");
}

export function getSessionsTable(env) {
  return toStr(env.AIRTABLE_TABLE_SESSIONS || "tblC98mKWbzmPuNzX");
}

export function getJobsTable(env) {
  return toStr(env.AIRTABLE_TABLE_JOBS || "tbl0jxIjN8QYwGABX");
}

export async function airtableFetch(env, path, init = {}) {
  const res = await fetch(`${AIRTABLE_API}/${getBaseId(env)}/${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${getApiKey(env)}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`airtable_error_${res.status}:${JSON.stringify(data)}`);
  }
  return data;
}

function encodeFormulaValue(value) {
  return String(value ?? "").replace(/'/g, "\\'");
}

export async function airtableFindFirstByFormula(env, table, formula) {
  const path = `${encodeURIComponent(table)}?maxRecords=1&filterByFormula=${encodeURIComponent(formula)}`;
  const data = await airtableFetch(env, path, { method: "GET" });
  return data?.records?.[0] || null;
}

export async function airtableListByFormula(env, table, formula, maxRecords = 100) {
  const path = `${encodeURIComponent(table)}?maxRecords=${maxRecords}&filterByFormula=${encodeURIComponent(formula)}`;
  const data = await airtableFetch(env, path, { method: "GET" });
  return Array.isArray(data?.records) ? data.records : [];
}

export async function airtableCreate(env, table, fields) {
  const data = await airtableFetch(env, encodeURIComponent(table), {
    method: "POST",
    body: JSON.stringify({ records: [{ fields }] }),
  });
  return data?.records?.[0] || null;
}

export async function airtablePatch(env, table, recordId, fields) {
  return airtableFetch(env, `${encodeURIComponent(table)}/${encodeURIComponent(recordId)}`, {
    method: "PATCH",
    body: JSON.stringify({ fields }),
  });
}

export async function findSessionBySessionId(env, sessionId) {
  return airtableFindFirstByFormula(
    env,
    getSessionsTable(env),
    `{${fieldName(env, "sessions", "sessionId")}}='${encodeFormulaValue(sessionId)}'`
  );
}

export async function findJobByJobId(env, jobId) {
  return airtableFindFirstByFormula(
    env,
    getJobsTable(env),
    `{${fieldName(env, "jobs", "jobId")}}='${encodeFormulaValue(jobId)}'`
  );
}

export async function findJobBySessionId(env, sessionId) {
  return airtableFindFirstByFormula(
    env,
    getJobsTable(env),
    `{${fieldName(env, "jobs", "sessionId")}}='${encodeFormulaValue(sessionId)}'`
  );
}

function toIntegerOrNull(value) {
  const n = Number(value);
  return Number.isInteger(n) ? n : null;
}

export function buildCommissionKey(sessionId, referralId, splitIndex) {
  return `${toStr(sessionId)}:${toStr(referralId)}:${toStr(splitIndex)}`;
}

export function normalizeCommissionSplits(rawValue) {
  const source =
    typeof rawValue === "string"
      ? (() => {
          try {
            return JSON.parse(rawValue);
          } catch {
            return [];
          }
        })()
      : Array.isArray(rawValue)
        ? rawValue
        : [];

  return source.map((entry, index) => {
    const splitIndex = toIntegerOrNull(
      entry?.split_index ?? entry?.splitIndex ?? entry?.index ?? index
    );
    const splitPercent = toNum(entry?.split_percent ?? entry?.splitPercent ?? entry?.percent);

    return {
      partner_id: toStr(entry?.partner_id ?? entry?.partner ?? entry?.partner_record_id),
      referral_id: toStr(entry?.referral_id ?? entry?.referral ?? entry?.referral_record_id),
      model_id: toStr(entry?.model_id ?? entry?.model ?? entry?.model_record_id),
      split_index: splitIndex == null ? index : splitIndex,
      split_percent: splitPercent == null ? null : splitPercent,
      commission_amount: toNum(entry?.commission_amount ?? entry?.amount),
      commission_basis_amount: toNum(
        entry?.commission_basis_amount ?? entry?.basis_amount ?? entry?.base_amount
      ),
      commission_rate: toNum(entry?.commission_rate ?? entry?.rate),
      commission_type: toStr(entry?.commission_type ?? entry?.type),
      currency: toStr(entry?.currency || "THB"),
      partner_snapshot: entry?.partner_snapshot || null,
      referral_snapshot: entry?.referral_snapshot || null,
      extra: entry && typeof entry === "object" ? entry : {},
    };
  });
}

export function validateCommissionSplits(splits) {
  if (!Array.isArray(splits) || splits.length === 0) {
    throw new Error("commission_splits_required");
  }

  const indexSet = new Set();
  let totalPercent = 0;

  for (const split of splits) {
    if (!toStr(split.partner_id)) throw new Error("commission_partner_id_required");
    if (!toStr(split.referral_id)) throw new Error("commission_referral_id_required");
    if (split.split_index == null || !Number.isInteger(Number(split.split_index))) {
      throw new Error("commission_split_index_invalid");
    }
    if (indexSet.has(Number(split.split_index))) {
      throw new Error("commission_split_index_duplicate");
    }
    indexSet.add(Number(split.split_index));

    if (!Number.isFinite(split.split_percent) || split.split_percent <= 0) {
      throw new Error("commission_split_percent_invalid");
    }
    totalPercent += Number(split.split_percent);
  }

  if (Math.abs(totalPercent - 100) > 0.0001) {
    throw new Error("commission_split_percent_sum_must_equal_100");
  }
}

function parseAuditJson(value) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed;
    if (parsed && typeof parsed === "object") return [parsed];
  } catch {}
  return [];
}

export function appendAuditJson(existingValue, entry) {
  const next = [...parseAuditJson(existingValue), entry];
  return JSON.stringify(next);
}

function buildSnapshotJson(value) {
  if (value == null) return undefined;
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

function commissionAuditEntry(action, actor, detail = {}) {
  return compactObject({
    ts: nowIso(),
    action,
    actor: toStr(actor) || "system",
    ...detail,
  });
}

export async function ensureCommissionRowsForSession(env, payload) {
  const sessionId = toStr(payload?.session_id);
  if (!sessionId) throw new Error("session_id_required");

  const splits = normalizeCommissionSplits(payload?.commission_splits);
  validateCommissionSplits(splits);

  const table = getPartnerCommissionsTable(env);
  const actor = toStr(payload?.actor || payload?.source || "events-worker");
  const commissionGroupKey = toStr(payload?.commission_group_key || sessionId);
  const commissionSnapshot = payload?.commission_snapshot || {
    session_id: sessionId,
    splits,
  };

  const results = [];
  for (const split of splits) {
    const commissionKey = buildCommissionKey(sessionId, split.referral_id, split.split_index);
    const existing = await airtableFindFirstByFormula(
      env,
      table,
      `{${fieldName(env, "partnerCommissions", "commissionKey")}}='${encodeFormulaValue(commissionKey)}'`
    );

    const auditJson = appendAuditJson(
      findFieldValue(existing?.fields, env, "partnerCommissions", "auditJson"),
      commissionAuditEntry(existing?.id ? "commission_upserted" : "commission_created", actor, {
        commission_key: commissionKey,
        source: payload?.source || "session",
      })
    );

    const fields = compactObject(
      mapFields(env, "partnerCommissions", {
        commissionKey,
        sessionId,
        jobId: toStr(payload?.job_id),
        paymentRef: toStr(payload?.payment_ref),
        partnerId: split.partner_id,
        referralId: split.referral_id,
        modelId: toStr(payload?.model_id || split.model_id),
        eligibilityStatus:
          findFieldValue(existing?.fields, env, "partnerCommissions", "eligibilityStatus") ||
          "pending_payment",
        approvalStatus:
          findFieldValue(existing?.fields, env, "partnerCommissions", "approvalStatus") ||
          "pending",
        payoutStatus:
          findFieldValue(existing?.fields, env, "partnerCommissions", "payoutStatus") || "unpaid",
        splitIndex: Number(split.split_index),
        splitPercent: Number(split.split_percent),
        commissionGroupKey,
        commissionAmount: split.commission_amount,
        commissionBasisAmount: split.commission_basis_amount,
        commissionRateSnapshot: split.commission_rate,
        commissionTypeSnapshot: split.commission_type,
        currency: split.currency || "THB",
        auditJson,
        partnerSnapshotJson: buildSnapshotJson(split.partner_snapshot || payload?.partner_snapshot),
        referralSnapshotJson: buildSnapshotJson(split.referral_snapshot || payload?.referral_snapshot),
        commissionSnapshotJson: buildSnapshotJson(commissionSnapshot),
        commissionSnapshotLocked:
          payload?.commission_snapshot_locked == null
            ? true
            : Boolean(payload.commission_snapshot_locked),
        earnedAt: toStr(payload?.earned_at),
      })
    );

    const record = existing?.id
      ? await airtablePatch(env, table, existing.id, fields)
      : await airtableCreate(env, table, fields);

    results.push({
      commission_key: commissionKey,
      record_id: existing?.id || record?.id || null,
      mode: existing?.id ? "update" : "create",
    });
  }

  return {
    ok: true,
    session_id: sessionId,
    commission_group_key: commissionGroupKey,
    count: results.length,
    results,
  };
}

export async function mirrorCommissionSnapshot(env, payload) {
  const sessionId = toStr(payload?.session_id);
  if (!sessionId) throw new Error("session_id_required");

  const session = await findSessionBySessionId(env, sessionId);
  const job =
    payload?.job_id
      ? await findJobByJobId(env, payload.job_id)
      : await findJobBySessionId(env, sessionId);

  const snapshotFields = compactObject(
    mapFields(env, "sessions", {
      partnerSnapshotJson: buildSnapshotJson(payload?.partner_snapshot),
      referralSnapshotJson: buildSnapshotJson(payload?.referral_snapshot),
      commissionSnapshotJson: buildSnapshotJson(payload?.commission_snapshot),
      commissionGroupKey: toStr(payload?.commission_group_key || sessionId),
      commissionSnapshotLocked:
        payload?.commission_snapshot_locked == null
          ? true
          : Boolean(payload?.commission_snapshot_locked),
      partnerIdSnapshot: toStr(payload?.partner_id_snapshot),
      partnerReferralIdSnapshot: toStr(payload?.partner_referral_id_snapshot),
      partnerCommissionState: toStr(payload?.partner_commission_state),
      commissionEligible: payload?.commission_eligible,
    })
  );

  const writes = [];
  if (session?.id) {
    writes.push(
      airtablePatch(env, getSessionsTable(env), session.id, snapshotFields).then(() => ({
        target: "session",
        record_id: session.id,
      }))
    );
  }
  if (job?.id) {
    writes.push(
      airtablePatch(
        env,
        getJobsTable(env),
        job.id,
        compactObject({
          ...snapshotFields,
          ...mapFields(env, "jobs", {
            partnerIdSnapshot: toStr(payload?.partner_id_snapshot),
            partnerReferralIdSnapshot: toStr(payload?.partner_referral_id_snapshot),
            commissionState: toStr(payload?.partner_commission_state),
            commissionEligible: payload?.commission_eligible,
            commissionSnapshotLockedAt:
              payload?.commission_snapshot_locked === false ? undefined : nowIso(),
            partnerCommissionId: toStr(payload?.partner_commission_id),
          }),
        })
      ).then(() => ({
        target: "job",
        record_id: job.id,
      }))
    );
  }

  return {
    ok: true,
    session_found: Boolean(session?.id),
    job_found: Boolean(job?.id),
    writes: await Promise.all(writes),
  };
}

export async function updateCommissionEligibilityForSession(env, payload) {
  const sessionId = toStr(payload?.session_id);
  if (!sessionId) throw new Error("session_id_required");

  const eligibilityStatus = toStr(payload?.eligibility_status || "eligible");
  const paymentRef = toStr(payload?.payment_ref);
  const actor = toStr(payload?.actor || "payments-worker");
  const table = getPartnerCommissionsTable(env);
  const rows = await airtableListByFormula(
    env,
    table,
    `{${fieldName(env, "partnerCommissions", "sessionId")}}='${encodeFormulaValue(sessionId)}'`
  );

  const touched = [];
  for (const row of rows) {
    const nextFields = compactObject({
      ...mapFields(env, "partnerCommissions", {
        eligibilityStatus,
        eligibilityPaymentRef: paymentRef,
        eligibleAt:
          eligibilityStatus === "eligible" ? toStr(payload?.eligible_at || nowIso()) : undefined,
      }),
      [fieldName(env, "partnerCommissions", "auditJson")]: appendAuditJson(
        findFieldValue(row?.fields, env, "partnerCommissions", "auditJson"),
        commissionAuditEntry("eligibility_updated", actor, {
          eligibility_status: eligibilityStatus,
          payment_ref: paymentRef,
        })
      ),
    });

    await airtablePatch(env, table, row.id, nextFields);
    touched.push({
      record_id: row.id,
      commission_key: findFieldValue(row?.fields, env, "partnerCommissions", "commissionKey") || "",
    });
  }

  const mirrorFields = compactObject(
    mapFields(env, "sessions", {
      commissionEligibilityStatus: eligibilityStatus,
      commissionLastPaymentRef: paymentRef,
      commissionSnapshotLocked: true,
      commissionEligibleAt:
        eligibilityStatus === "eligible" ? toStr(payload?.eligible_at || nowIso()) : undefined,
      partnerCommissionState:
        eligibilityStatus === "eligible" ? "eligible" : "pending_payment",
      commissionEligible: eligibilityStatus === "eligible",
    })
  );

  const session = await findSessionBySessionId(env, sessionId);
  if (session?.id) {
    await airtablePatch(env, getSessionsTable(env), session.id, mirrorFields);
  }

  const job = await findJobBySessionId(env, sessionId);
  if (job?.id) {
    await airtablePatch(
      env,
      getJobsTable(env),
      job.id,
      compactObject({
        ...mapFields(env, "jobs", {
          commissionEligibilityStatus: eligibilityStatus,
          commissionLastPaymentRef: paymentRef,
          commissionSnapshotLocked: true,
          commissionEligibleAt:
            eligibilityStatus === "eligible" ? toStr(payload?.eligible_at || nowIso()) : undefined,
          commissionState: eligibilityStatus === "eligible" ? "eligible" : "pending_payment",
          commissionEligible: eligibilityStatus === "eligible",
        }),
      })
    );
  }

  return {
    ok: true,
    session_id: sessionId,
    eligibility_status: eligibilityStatus,
    count: touched.length,
    rows: touched,
  };
}

export async function updateCommissionState(env, payload) {
  const action = toStr(payload?.action).toLowerCase();
  if (!action) throw new Error("action_required");

  const commissionKey = toStr(payload?.commission_key);
  let row = null;
  if (commissionKey) {
    row = await airtableFindFirstByFormula(
      env,
      getPartnerCommissionsTable(env),
      `{${fieldName(env, "partnerCommissions", "commissionKey")}}='${encodeFormulaValue(commissionKey)}'`
    );
  }

  if (!row?.id) throw new Error("commission_row_not_found");

  const actor = toStr(payload?.actor || payload?.approved_by || payload?.paid_by || "admin-worker");
  const fields = {};

  if (action === "approve") {
    Object.assign(fields, mapFields(env, "partnerCommissions", {
      approvalStatus: "approved",
      approvedAt: toStr(payload?.approved_at || nowIso()),
      approvedBy: actor,
    }));
  } else if (action === "hold") {
    Object.assign(fields, mapFields(env, "partnerCommissions", {
      approvalStatus: "held",
      heldReason: toStr(payload?.held_reason || payload?.reason),
    }));
  } else if (action === "void") {
    Object.assign(fields, mapFields(env, "partnerCommissions", {
      approvalStatus: "void",
      payoutStatus: "void",
      voidReason: toStr(payload?.void_reason || payload?.reason),
    }));
  } else if (action === "paid") {
    Object.assign(fields, mapFields(env, "partnerCommissions", {
      payoutStatus: "paid",
      paidAt: toStr(payload?.paid_at || nowIso()),
      payoutReference: toStr(payload?.payout_reference),
    }));
  } else {
    throw new Error("unsupported_commission_action");
  }

  fields[fieldName(env, "partnerCommissions", "auditJson")] = appendAuditJson(
    findFieldValue(row?.fields, env, "partnerCommissions", "auditJson"),
    commissionAuditEntry(`commission_${action}`, actor, compactObject({
      held_reason: findFieldValue(fields, env, "partnerCommissions", "heldReason"),
      void_reason: findFieldValue(fields, env, "partnerCommissions", "voidReason"),
      payout_reference: findFieldValue(fields, env, "partnerCommissions", "payoutReference"),
    }))
  );

  await airtablePatch(env, getPartnerCommissionsTable(env), row.id, compactObject(fields));

  return {
    ok: true,
    action,
    record_id: row.id,
    commission_key: findFieldValue(row?.fields, env, "partnerCommissions", "commissionKey") || commissionKey,
    fields: compactObject(fields),
  };
}

export async function enforceSingleActiveReferral(env, payload) {
  const referralId = toStr(payload?.referral_id);
  const modelId = toStr(payload?.model_id);
  if (!referralId) throw new Error("referral_id_required");
  if (!modelId) throw new Error("model_id_required");

  const table = getModelReferralsTable(env);
  const activeRows = await airtableListByFormula(
    env,
    table,
    `AND({${fieldName(env, "modelReferrals", "modelId")}}='${encodeFormulaValue(modelId)}',{${fieldName(env, "modelReferrals", "ownershipStatus")}}='active')`
  );

  const conflicting = activeRows.filter((row) => row.id !== referralId);
  if (conflicting.length && !payload?.transfer_existing) {
    throw new Error("single_active_referral_rule_violation");
  }

  const actor = toStr(payload?.actor || "admin-worker");
  for (const row of conflicting) {
    const nextNotes = [toStr(row?.fields?.notes), `Transferred by ${actor} at ${nowIso()}`]
      .filter(Boolean)
      .join("\n");
    await airtablePatch(env, table, row.id, mapFields(env, "modelReferrals", {
      ownershipStatus: "transferred",
      notes: nextNotes,
    }));
  }

  const target = await airtablePatch(env, table, referralId, compactObject(mapFields(env, "modelReferrals", {
    ownershipStatus: "active",
    approvedAt: toStr(payload?.approved_at || nowIso()),
    approvedBy: actor,
  })));

  return {
    ok: true,
    referral_id: referralId,
    model_id: modelId,
    transferred_count: conflicting.length,
    target,
  };
}
