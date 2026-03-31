import type { BindModelIdentityResponse, Env, ModelCardLite, PrepareModelRecordResponse } from "../types";

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

interface ModelBindingSnapshot {
  binding_record_id: string;
  model_record_id: string;
  binding_status?: ModelCardLite["binding_status"];
  console_access?: ModelCardLite["console_access"];
  memberstack_id?: string;
}

function airtableHeaders(env: Env): HeadersInit {
  return {
    Authorization: `Bearer ${env.AIRTABLE_API_KEY}`,
    "Content-Type": "application/json",
  };
}

function encodeFormulaValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
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
    model_record_id: record.id,
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
      headers: airtableHeaders(env),
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

  const bindingSnapshots = await listModelBindingSnapshots(env);

  return all.map((model) => {
    const binding = bindingSnapshots.get(model.model_record_id);
    return binding
      ? {
          ...model,
          binding_status: binding.binding_status || "unbound",
          console_access: binding.console_access || "pending_bind",
          binding_record_id: binding.binding_record_id,
          binding_memberstack_id: binding.memberstack_id,
        }
      : {
          ...model,
          binding_status: "unbound",
          console_access: "pending_bind",
        };
  });
}

async function listModelBindingSnapshots(
  env: Env,
): Promise<Map<string, ModelBindingSnapshot>> {
  if (!env.AIRTABLE_TABLE_MODEL_BINDINGS) {
    return new Map();
  }

  const table = env.AIRTABLE_TABLE_MODEL_BINDINGS;
  const snapshots = new Map<string, ModelBindingSnapshot>();
  let offset: string | undefined;

  do {
    const url = new URL(
      `https://api.airtable.com/v0/${encodeURIComponent(env.AIRTABLE_BASE_ID)}/${encodeURIComponent(table)}`,
    );
    url.searchParams.set("pageSize", "100");

    if (offset) {
      url.searchParams.set("offset", offset);
    }

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: airtableHeaders(env),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Airtable bindings list failed: ${response.status} ${text}`);
    }

    const data = (await response.json()) as AirtableListResponse;

    for (const record of data.records ?? []) {
      const modelRecordId = getFieldString(record.fields, "model_record_id");
      if (!modelRecordId) continue;

      snapshots.set(modelRecordId, {
        binding_record_id: record.id,
        model_record_id: modelRecordId,
        binding_status: getFieldString(record.fields, "binding_status") as ModelCardLite["binding_status"] | undefined,
        console_access: getFieldString(record.fields, "console_access") as ModelCardLite["console_access"] | undefined,
        memberstack_id: getFieldString(record.fields, "memberstack_id"),
      });
    }

    offset = data.offset;
  } while (offset);

  return snapshots;
}

async function findFirstRecordByFormula(
  env: Env,
  table: string,
  formula: string,
): Promise<AirtableRecord | null> {
  const url = new URL(
    `https://api.airtable.com/v0/${encodeURIComponent(env.AIRTABLE_BASE_ID)}/${encodeURIComponent(table)}`,
  );
  url.searchParams.set("maxRecords", "1");
  url.searchParams.set("filterByFormula", formula);

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: airtableHeaders(env),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Airtable find failed: ${response.status} ${text}`);
  }

  const data = (await response.json()) as AirtableListResponse;
  return data.records?.[0] || null;
}

async function patchRecord(
  env: Env,
  table: string,
  recordId: string,
  fields: Record<string, unknown>,
): Promise<AirtableRecord> {
  const response = await fetch(
    `https://api.airtable.com/v0/${encodeURIComponent(env.AIRTABLE_BASE_ID)}/${encodeURIComponent(table)}/${encodeURIComponent(recordId)}`,
    {
      method: "PATCH",
      headers: airtableHeaders(env),
      body: JSON.stringify({ fields }),
    },
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Airtable patch failed: ${response.status} ${text}`);
  }

  return (await response.json()) as AirtableRecord;
}

async function createRecord(
  env: Env,
  table: string,
  fields: Record<string, unknown>,
): Promise<AirtableRecord> {
  const response = await fetch(
    `https://api.airtable.com/v0/${encodeURIComponent(env.AIRTABLE_BASE_ID)}/${encodeURIComponent(table)}`,
    {
      method: "POST",
      headers: airtableHeaders(env),
      body: JSON.stringify({ fields }),
    },
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Airtable create failed: ${response.status} ${text}`);
  }

  return (await response.json()) as AirtableRecord;
}

export async function persistModelBinding(
  env: Env,
  prepared: PrepareModelRecordResponse["data"],
): Promise<BindModelIdentityResponse["data"]> {
  if (env.AIRTABLE_TABLE_MODEL_BINDINGS) {
    const table = env.AIRTABLE_TABLE_MODEL_BINDINGS;
    const formula = prepared.model_record_id
      ? `{model_record_id}='${encodeFormulaValue(prepared.model_record_id)}'`
      : `{model_id}='${encodeFormulaValue(prepared.model_id)}'`;
    const existing = await findFirstRecordByFormula(env, table, formula);
    const fields = {
      model_id: prepared.model_id,
      model_record_id: prepared.model_record_id,
      identity_id: prepared.identity_id,
      memberstack_id: prepared.memberstack_id,
      username: prepared.username,
      display_name: prepared.display_name,
      folder_name: prepared.folder_name,
      folder_slug: prepared.folder_slug,
      visibility: prepared.visibility,
      program_type: prepared.program_type,
      catalog_group: prepared.catalog_group,
      orientation: prepared.orientation,
      position_tag: prepared.position_tag,
      binding_status: prepared.binding_status,
      console_access: prepared.console_access,
      rules_version_required: prepared.rules_version_required,
      rules_ack_version: prepared.rules_ack_version,
      r2_prefix: prepared.r2_prefix,
      primary_image_key: prepared.primary_image_key,
    };
    const record = existing?.id
      ? await patchRecord(env, table, existing.id, fields)
      : await createRecord(env, table, fields);

    return {
      ...prepared,
      preview_only: false,
      persisted: true,
      persistence_target: "model_bindings_table",
      binding_record_id: record.id,
    };
  }

  if (!prepared.model_record_id) {
    throw new Error("model_record_id is required when AIRTABLE_TABLE_MODEL_BINDINGS is not configured");
  }

  const record = await patchRecord(env, env.AIRTABLE_TABLE_MODELS, prepared.model_record_id, {
    memberstack_id: prepared.memberstack_id,
    vanity_slug: prepared.username,
    working_name: prepared.display_name,
    nickname: prepared.folder_name,
  });

  return {
    ...prepared,
    preview_only: false,
    persisted: true,
    persistence_target: "models_table",
    binding_record_id: record.id,
  };
}
