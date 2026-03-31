import type {
  AirtableFetchResult,
  BudgetSignal,
  Channel,
  ClientTier,
  DealLite,
  DealStatus,
  Env,
  HistorySignal,
  UpsertAiRequest,
  UpsertAiResponse,
  UrgencyLevel,
} from "../types";

const AIRTABLE_API = "https://api.airtable.com/v0";

type AirtableRecord = {
  id: string;
  fields?: Record<string, unknown>;
  createdTime?: string;
};

type AirtableListResponse = {
  records?: AirtableRecord[];
};

type AirtableSingleResponse = AirtableRecord;

type DealFieldMap = {
  deal_id: string;
  client_id: string;
  client_name: string;
  channel: string;
  client_tier: string;
  request_summary_ai: string;
  occasion: string;
  timing_label: string;
  venue_name: string;
  budget_amount_thb: string;
  budget_signal: string;
  history_signal: string;
  high_value_client: string;
  specific_model_requested: string;
  ai_top_model: string;
  ai_reply_draft: string;
  ai_requires_per_review: string;
  deal_status: string;
  urgency_level: string;
};

function str(v: unknown): string {
  return String(v ?? "").trim();
}

function lower(v: unknown): string {
  return str(v).toLowerCase();
}

function asNumber(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v.replace(/,/g, "").trim());
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

function asBool(v: unknown): boolean | undefined {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  if (typeof v === "string") {
    const x = lower(v);
    if (["true", "1", "yes", "y"].includes(x)) return true;
    if (["false", "0", "no", "n"].includes(x)) return false;
  }
  return undefined;
}

function pickFirst(fields: Record<string, unknown>, names: string[]): unknown {
  for (const name of names) {
    if (name in fields) return fields[name];
  }
  return undefined;
}

function escapeFormulaValue(v: string): string {
  return v.replace(/"/g, '\\"');
}

function getDealsTableName(env: Env): string {
  return str(env.AIRTABLE_TABLE_DEALS || "deals");
}

function getDealFieldMap(env: Env): DealFieldMap {
  return {
    deal_id: env.AIRTABLE_DEALS_FIELD_DEAL_ID || "deal_id",
    client_id: env.AIRTABLE_DEALS_FIELD_CLIENT_ID || "client_id",
    client_name: env.AIRTABLE_DEALS_FIELD_CLIENT_NAME || "client_name",
    channel: env.AIRTABLE_DEALS_FIELD_CHANNEL || "channel",
    client_tier: env.AIRTABLE_DEALS_FIELD_CLIENT_TIER || "client_tier",
    request_summary_ai:
      env.AIRTABLE_DEALS_FIELD_REQUEST_SUMMARY_AI || "request_summary_ai",
    occasion: env.AIRTABLE_DEALS_FIELD_OCCASION || "occasion",
    timing_label: env.AIRTABLE_DEALS_FIELD_TIMING_LABEL || "timing_label",
    venue_name: env.AIRTABLE_DEALS_FIELD_VENUE_NAME || "venue_name",
    budget_amount_thb:
      env.AIRTABLE_DEALS_FIELD_BUDGET_AMOUNT_THB || "budget_amount_thb",
    budget_signal: env.AIRTABLE_DEALS_FIELD_BUDGET_SIGNAL || "budget_signal",
    history_signal: env.AIRTABLE_DEALS_FIELD_HISTORY_SIGNAL || "history_signal",
    high_value_client:
      env.AIRTABLE_DEALS_FIELD_HIGH_VALUE_CLIENT || "high_value_client",
    specific_model_requested:
      env.AIRTABLE_DEALS_FIELD_SPECIFIC_MODEL_REQUESTED ||
      "specific_model_requested",
    ai_top_model: env.AIRTABLE_DEALS_FIELD_AI_TOP_MODEL || "ai_top_model",
    ai_reply_draft:
      env.AIRTABLE_DEALS_FIELD_AI_REPLY_DRAFT || "ai_reply_draft",
    ai_requires_per_review:
      env.AIRTABLE_DEALS_FIELD_AI_REQUIRES_PER_REVIEW ||
      "ai_requires_per_review",
    deal_status: env.AIRTABLE_DEALS_FIELD_DEAL_STATUS || "deal_status",
    urgency_level: env.AIRTABLE_DEALS_FIELD_URGENCY_LEVEL || "urgency_level",
  };
}

async function airtableFetch<TData = unknown>(
  env: Env,
  path: string,
  init?: RequestInit,
): Promise<AirtableFetchResult<TData>> {
  const key = env.AIRTABLE_API_KEY;
  const base = env.AIRTABLE_BASE_ID;

  if (!key || !base) {
    return { ok: false, error: "missing_airtable_env" };
  }

  const res = await fetch(`${AIRTABLE_API}/${base}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${key}`,
      ...(init?.headers || {}),
    },
  });

  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      data,
    };
  }

  return {
    ok: true,
    data: data as TData,
  };
}

async function airtableFindOneByFormula(
  env: Env,
  tableName: string,
  filterByFormula: string,
): Promise<AirtableRecord | null> {
  const params = new URLSearchParams();
  params.set("pageSize", "1");
  params.set("filterByFormula", filterByFormula);

  const r = await airtableFetch<AirtableListResponse>(
    env,
    `/${encodeURIComponent(tableName)}?${params.toString()}`,
  );

  if (!r.ok) return null;

  return r.data.records?.[0] || null;
}

async function airtableCreateRecord(
  env: Env,
  tableName: string,
  fields: Record<string, unknown>,
): Promise<AirtableRecord | null> {
  const r = await airtableFetch<{ records?: AirtableRecord[] }>(
    env,
    `/${encodeURIComponent(tableName)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ records: [{ fields }] }),
    },
  );

  if (!r.ok) return null;
  return r.data.records?.[0] || null;
}

async function airtablePatchRecordById(
  env: Env,
  tableName: string,
  id: string,
  fields: Record<string, unknown>,
): Promise<AirtableRecord | null> {
  const r = await airtableFetch<AirtableSingleResponse>(
    env,
    `/${encodeURIComponent(tableName)}/${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fields }),
    },
  );

  if (!r.ok) return null;
  return r.data || null;
}

function normalizeChannel(v: unknown): Channel {
  const x = lower(v);
  if (x === "line" || x === "telegram" || x === "internal") return x;
  return "web";
}

function normalizeClientTier(v: unknown): ClientTier {
  const x = lower(v);
  if (x === "premium" || x === "vip" || x === "svip" || x === "blackcard") {
    return x;
  }
  return "standard";
}

function normalizeBudgetSignal(v: unknown): BudgetSignal | undefined {
  const x = lower(v);
  if (x === "low" || x === "standard" || x === "premium" || x === "high") {
    return x;
  }
  return undefined;
}

function normalizeHistorySignal(v: unknown): HistorySignal | undefined {
  const x = lower(v);
  if (x === "none" || x === "low" || x === "medium" || x === "high") {
    return x;
  }
  return undefined;
}

function normalizeDealStatus(v: unknown): DealStatus {
  const x = lower(v);
  const allowed: DealStatus[] = [
    "new_inquiry",
    "ai_processing",
    "needs_per_review",
    "awaiting_client_reply",
    "awaiting_payment",
    "payment_received",
    "ready_to_offer_model",
    "offer_sent_to_model",
    "model_accepted",
    "confirmed",
    "expired",
    "declined",
    "cancelled",
  ];

  return (allowed.find((item) => item === x) || "new_inquiry") as DealStatus;
}

function normalizeUrgency(v: unknown): UrgencyLevel | undefined {
  const x = lower(v);
  if (x === "low" || x === "normal" || x === "high" || x === "fast_lane") {
    return x;
  }
  return undefined;
}

function toDealLiteFromFields(
  fields: Record<string, unknown>,
  map: DealFieldMap,
): DealLite {
  const dealId = str(
    pickFirst(fields, [map.deal_id, "deal_id", "Deal ID", "dealId"]),
  );
  const clientName = str(
    pickFirst(fields, [map.client_name, "client_name", "Client Name", "clientName"]),
  );

  return {
    deal_id: dealId,
    client_id: str(
      pickFirst(fields, [map.client_id, "client_id", "Client ID", "clientId"]),
    ) || undefined,
    client_name: clientName || "Unknown",
    channel: normalizeChannel(
      pickFirst(fields, [map.channel, "channel", "Channel"]),
    ),
    client_tier: normalizeClientTier(
      pickFirst(fields, [map.client_tier, "client_tier", "Client Tier"]),
    ),
    request_summary_ai: str(
      pickFirst(fields, [
        map.request_summary_ai,
        "request_summary_ai",
        "Request Summary AI",
      ]),
    ) || undefined,
    occasion:
      str(pickFirst(fields, [map.occasion, "occasion", "Occasion"])) || undefined,
    timing_label:
      str(pickFirst(fields, [map.timing_label, "timing_label", "Timing Label"])) ||
      undefined,
    venue_name:
      str(pickFirst(fields, [map.venue_name, "venue_name", "Venue Name"])) ||
      undefined,
    budget_amount_thb: asNumber(
      pickFirst(fields, [
        map.budget_amount_thb,
        "budget_amount_thb",
        "Budget Amount THB",
      ]),
    ),
    budget_signal: normalizeBudgetSignal(
      pickFirst(fields, [map.budget_signal, "budget_signal", "Budget Signal"]),
    ),
    history_signal: normalizeHistorySignal(
      pickFirst(fields, [map.history_signal, "history_signal", "History Signal"]),
    ),
    high_value_client: asBool(
      pickFirst(fields, [
        map.high_value_client,
        "high_value_client",
        "High Value Client",
      ]),
    ),
    specific_model_requested: asBool(
      pickFirst(fields, [
        map.specific_model_requested,
        "specific_model_requested",
        "Specific Model Requested",
      ]),
    ),
    ai_top_model:
      str(pickFirst(fields, [map.ai_top_model, "ai_top_model", "AI Top Model"])) ||
      undefined,
    ai_reply_draft:
      str(
        pickFirst(fields, [map.ai_reply_draft, "ai_reply_draft", "AI Reply Draft"]),
      ) || undefined,
    ai_requires_per_review: asBool(
      pickFirst(fields, [
        map.ai_requires_per_review,
        "ai_requires_per_review",
        "AI Requires Per Review",
      ]),
    ),
    deal_status: normalizeDealStatus(
      pickFirst(fields, [map.deal_status, "deal_status", "Deal Status"]),
    ),
    urgency_level: normalizeUrgency(
      pickFirst(fields, [map.urgency_level, "urgency_level", "Urgency Level"]),
    ),
  };
}

function buildDealPatchFields(
  payload: UpsertAiRequest,
  map: DealFieldMap,
): Record<string, unknown> {
  const fields: Record<string, unknown> = {};

  const setStr = (fieldName: string, value?: string) => {
    const v = str(value);
    if (v) fields[fieldName] = v;
  };

  const setBool = (fieldName: string, value?: boolean) => {
    if (typeof value === "boolean") fields[fieldName] = value;
  };

  const setNum = (fieldName: string, value?: number) => {
    if (typeof value === "number" && Number.isFinite(value)) fields[fieldName] = value;
  };

  setStr(map.deal_id, payload.deal_id);
  setStr(map.client_id, payload.client_id);
  setStr(map.client_name, payload.client_name);
  setStr(map.channel, payload.channel);
  setStr(map.client_tier, payload.client_tier);
  setStr(map.request_summary_ai, payload.request_summary_ai);
  setStr(map.occasion, payload.occasion);
  setStr(map.timing_label, payload.timing_label);
  setStr(map.venue_name, payload.venue_name);
  setNum(map.budget_amount_thb, payload.budget_amount_thb);
  setStr(map.budget_signal, payload.budget_signal);
  setStr(map.history_signal, payload.history_signal);
  setBool(map.high_value_client, payload.high_value_client);
  setBool(map.specific_model_requested, payload.specific_model_requested);
  setStr(map.ai_top_model, payload.ai_top_model);
  setStr(map.ai_reply_draft, payload.ai_reply_draft);
  setBool(map.ai_requires_per_review, payload.ai_requires_per_review);
  setStr(map.deal_status, payload.deal_status);
  setStr(map.urgency_level, payload.urgency_level);

  return fields;
}

export async function listDealsLite(env: Env): Promise<DealLite[]> {
  const tableName = getDealsTableName(env);
  const map = getDealFieldMap(env);

  const params = new URLSearchParams();
  params.set("pageSize", "50");
  params.set("sort[0][field]", map.deal_id);
  params.set("sort[0][direction]", "desc");

  const r = await airtableFetch<AirtableListResponse>(
    env,
    `/${encodeURIComponent(tableName)}?${params.toString()}`,
  );

  if (!r.ok) return [];

  const records = Array.isArray(r.data.records) ? r.data.records : [];
  return records
    .map((rec) => toDealLiteFromFields(rec.fields || {}, map))
    .filter((deal) => Boolean(deal.deal_id));
}

export async function upsertDealAi(
  env: Env,
  payload: UpsertAiRequest,
): Promise<UpsertAiResponse> {
  const tableName = getDealsTableName(env);
  const map = getDealFieldMap(env);

  const dealId = str(payload.deal_id);
  if (!dealId) {
    throw new Error("deal_id is required");
  }

  const filterByFormula = `{${map.deal_id}}="${escapeFormulaValue(dealId)}"`;
  const existing = await airtableFindOneByFormula(env, tableName, filterByFormula);

  const patch = buildDealPatchFields(
    {
      ...payload,
      deal_id: dealId,
      channel: payload.channel ? normalizeChannel(payload.channel) : undefined,
      client_tier: payload.client_tier
        ? normalizeClientTier(payload.client_tier)
        : undefined,
      budget_signal: payload.budget_signal
        ? normalizeBudgetSignal(payload.budget_signal)
        : undefined,
      history_signal: payload.history_signal
        ? normalizeHistorySignal(payload.history_signal)
        : undefined,
      deal_status: payload.deal_status
        ? normalizeDealStatus(payload.deal_status)
        : undefined,
      urgency_level: payload.urgency_level
        ? normalizeUrgency(payload.urgency_level)
        : undefined,
    },
    map,
  );

  if (existing?.id) {
    const updated = await airtablePatchRecordById(env, tableName, existing.id, patch);
    if (!updated?.id) {
      throw new Error("airtable_patch_failed");
    }

    return {
      ok: true,
      deal_id: dealId,
      updated: true,
      created: false,
      airtable_record_id: updated.id,
    };
  }

  const created = await airtableCreateRecord(env, tableName, {
    [map.deal_id]: dealId,
    [map.channel]: normalizeChannel(payload.channel),
    [map.client_tier]: normalizeClientTier(payload.client_tier),
    [map.deal_status]: normalizeDealStatus(payload.deal_status),
    ...patch,
  });

  if (!created?.id) {
    throw new Error("airtable_create_failed");
  }

  return {
    ok: true,
    deal_id: dealId,
    updated: true,
    created: true,
    airtable_record_id: created.id,
  };
}
