import type { DealLite, Env, UpsertAiRequest, UpsertAiResponse } from "../types";

const DEAL_FIELDS = [
  "deal_id",
  "client_id",
  "client_name",
  "channel",
  "client_tier",
  "occasion",
  "timing_label",
  "venue_name",
  "budget_amount_thb",
  "budget_signal",
  "history_signal",
  "high_value_client",
  "specific_model_requested",
  "ai_top_model",
  "ai_reply_draft",
  "ai_requires_per_review",
  "deal_status",
  "urgency_level",
] as const;

type AirtableValue = string | number | boolean | string[] | null | undefined;

interface AirtableRecord {
  id: string;
  fields?: Record<string, AirtableValue>;
}

interface AirtableListResponse {
  records?: AirtableRecord[];
  offset?: string;
}

interface AirtableCreateUpdateResponse {
  id: string;
  fields?: Record<string, AirtableValue>;
}

function getString(fields: Record<string, AirtableValue> | undefined, key: string): string | undefined {
  const value = fields?.[key];
  return typeof value === "string" ? value : undefined;
}

function getNumber(fields: Record<string, AirtableValue> | undefined, key: string): number | undefined {
  const value = fields?.[key];
  return typeof value === "number" ? value : undefined;
}

function getBoolean(fields: Record<string, AirtableValue> | undefined, key: string): boolean {
  return fields?.[key] === true;
}

function mapRecord(record: AirtableRecord): DealLite | null {
  const f = record.fields;
  const deal_id = getString(f, "deal_id");
  const client_name = getString(f, "client_name");
  const channel = getString(f, "channel");
  const client_tier = getString(f, "client_tier");
  const deal_status = getString(f, "deal_status");

  if (!deal_id || !client_name || !channel || !client_tier || !deal_status) {
    return null;
  }

  return {
    deal_id,
    client_id: getString(f, "client_id"),
    client_name,
    channel: channel as DealLite["channel"],
    client_tier: client_tier as DealLite["client_tier"],
    occasion: getString(f, "occasion"),
    timing_label: getString(f, "timing_label"),
    venue_name: getString(f, "venue_name"),
    budget_amount_thb: getNumber(f, "budget_amount_thb"),
    budget_signal: getString(f, "budget_signal") as DealLite["budget_signal"],
    history_signal: getString(f, "history_signal") as DealLite["history_signal"],
    high_value_client: getBoolean(f, "high_value_client"),
    specific_model_requested: getBoolean(f, "specific_model_requested"),
    ai_top_model: getString(f, "ai_top_model"),
    ai_reply_draft: getString(f, "ai_reply_draft"),
    ai_requires_per_review: getBoolean(f, "ai_requires_per_review"),
    deal_status: deal_status as DealLite["deal_status"],
    urgency_level: getString(f, "urgency_level") as DealLite["urgency_level"],
  };
}

function baseUrl(env: Env): string {
  return `https://api.airtable.com/v0/${encodeURIComponent(env.AIRTABLE_BASE_ID)}/${encodeURIComponent(env.AIRTABLE_TABLE_DEALS)}`;
}

function authHeader(env: Env): HeadersInit {
  return { Authorization: `Bearer ${env.AIRTABLE_API_KEY}` };
}

export async function listDealsLite(env: Env): Promise<DealLite[]> {
  const all: DealLite[] = [];
  let offset: string | undefined;

  do {
    const url = new URL(baseUrl(env));
    for (const field of DEAL_FIELDS) url.searchParams.append("fields[]", field);
    url.searchParams.set("pageSize", "100");
    if (offset) url.searchParams.set("offset", offset);

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: authHeader(env),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Airtable deals list failed: ${response.status} ${text}`);
    }

    const data = (await response.json()) as AirtableListResponse;
    for (const record of data.records ?? []) {
      const mapped = mapRecord(record);
      if (mapped) all.push(mapped);
    }
    offset = data.offset;
  } while (offset);

  return all;
}

async function findRecordIdByDealId(env: Env, dealId: string): Promise<string | null> {
  const url = new URL(baseUrl(env));
  url.searchParams.set("maxRecords", "1");
  url.searchParams.set("filterByFormula", `{deal_id}='${dealId.replaceAll("'", "\\'")}'`);

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: authHeader(env),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Airtable deal lookup failed: ${response.status} ${text}`);
  }

  const data = (await response.json()) as AirtableListResponse;
  return data.records?.[0]?.id ?? null;
}

function buildAiFields(payload: UpsertAiRequest): Record<string, AirtableValue> {
  const fields: Record<string, AirtableValue> = { deal_id: payload.deal_id };
  const keys: Array<keyof UpsertAiRequest> = [
    "request_summary_ai",
    "occasion",
    "timing_label",
    "venue_name",
    "budget_amount_thb",
    "budget_signal",
    "history_signal",
    "high_value_client",
    "specific_model_requested",
    "ai_top_model",
    "ai_reply_draft",
    "ai_requires_per_review",
    "deal_status",
    "urgency_level",
  ];

  for (const key of keys) {
    const value = payload[key];
    if (value !== undefined) fields[key] = value as AirtableValue;
  }
  return fields;
}

export async function upsertDealAi(env: Env, payload: UpsertAiRequest): Promise<UpsertAiResponse> {
  const recordId = await findRecordIdByDealId(env, payload.deal_id);
  const fields = buildAiFields(payload);

  if (recordId) {
    const response = await fetch(`${baseUrl(env)}/${recordId}`, {
      method: "PATCH",
      headers: { ...authHeader(env), "content-type": "application/json" },
      body: JSON.stringify({ fields }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Airtable deal update failed: ${response.status} ${text}`);
    }

    const data = (await response.json()) as AirtableCreateUpdateResponse;
    return {
      ok: true,
      deal_id: payload.deal_id,
      updated: true,
      created: false,
      airtable_record_id: data.id,
    };
  }

  const response = await fetch(baseUrl(env), {
    method: "POST",
    headers: { ...authHeader(env), "content-type": "application/json" },
    body: JSON.stringify({ fields }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Airtable deal create failed: ${response.status} ${text}`);
  }

  const data = (await response.json()) as AirtableCreateUpdateResponse;
  return {
    ok: true,
    deal_id: payload.deal_id,
    updated: true,
    created: true,
    airtable_record_id: data.id,
  };
}
