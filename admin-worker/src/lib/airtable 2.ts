import type { Env, ModelCardLite } from "../types";

const MODEL_FIELDS = [
  "working_name",
  "model_tier",
  "orientation_label",
  "height_cm",
  "body_type",
  "base_area",
  "vibe_tags",
  "best_for",
  "languages",
  "available_now",
  "availability_status",
  "minimum_rate_90m",
  "ai_match_summary",
  "requires_per_approval",
] as const;

type AirtableValue =
  | string
  | number
  | boolean
  | string[]
  | null
  | undefined;

interface AirtableRecord {
  id: string;
  fields?: Record<string, AirtableValue>;
}

interface AirtableListResponse {
  records?: AirtableRecord[];
  offset?: string;
}

function getFieldString(
  fields: Record<string, AirtableValue> | undefined,
  key: string,
): string | undefined {
  const value = fields?.[key];
  return typeof value === "string" ? value : undefined;
}

function getFieldNumber(
  fields: Record<string, AirtableValue> | undefined,
  key: string,
): number | undefined {
  const value = fields?.[key];
  return typeof value === "number" ? value : undefined;
}

function getFieldBoolean(
  fields: Record<string, AirtableValue> | undefined,
  key: string,
): boolean {
  return fields?.[key] === true;
}

function getFieldStringArray(
  fields: Record<string, AirtableValue> | undefined,
  key: string,
): string[] {
  const value = fields?.[key];
  return Array.isArray(value) ? value.filter((x): x is string => typeof x === "string") : [];
}

function mapRecordToLite(record: AirtableRecord): ModelCardLite | null {
  const fields = record.fields;
  const working_name = getFieldString(fields, "working_name");
  const model_tier = getFieldString(fields, "model_tier");

  if (!working_name || !model_tier) {
    return null;
  }

  return {
    working_name,
    model_tier: model_tier as ModelCardLite["model_tier"],
    orientation_label: getFieldString(fields, "orientation_label") as ModelCardLite["orientation_label"] | undefined,
    height_cm: getFieldNumber(fields, "height_cm"),
    body_type: getFieldString(fields, "body_type"),
    base_area: getFieldString(fields, "base_area"),
    vibe_tags: getFieldStringArray(fields, "vibe_tags"),
    best_for: getFieldStringArray(fields, "best_for"),
    languages: getFieldStringArray(fields, "languages"),
    available_now: getFieldBoolean(fields, "available_now"),
    availability_status: getFieldString(fields, "availability_status"),
    minimum_rate_90m: getFieldNumber(fields, "minimum_rate_90m") ?? 0,
    ai_match_summary: getFieldString(fields, "ai_match_summary"),
    requires_per_approval: getFieldBoolean(fields, "requires_per_approval"),
  };
}

export async function listModelCardsLite(env: Env): Promise<ModelCardLite[]> {
  const all: ModelCardLite[] = [];
  let offset: string | undefined;

  do {
    const url = new URL(
      `https://api.airtable.com/v0/${encodeURIComponent(env.AIRTABLE_BASE_ID)}/${encodeURIComponent(env.AIRTABLE_TABLE_MODELS)}`,
    );

    for (const field of MODEL_FIELDS) {
      url.searchParams.append("fields[]", field);
    }

    url.searchParams.set("pageSize", "100");

    if (offset) {
      url.searchParams.set("offset", offset);
    }

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        Authorization: `Bearer ${env.AIRTABLE_API_KEY}`,
      },
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Airtable list failed: ${response.status} ${text}`);
    }

    const data = (await response.json()) as AirtableListResponse;

    for (const record of data.records ?? []) {
      const mapped = mapRecordToLite(record);
      if (mapped) {
        all.push(mapped);
      }
    }

    offset = data.offset;
  } while (offset);

  return all;
}
