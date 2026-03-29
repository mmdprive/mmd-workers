import type { Env, LiveSession, MigrationRecord } from "../types";

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

function enabled(env: Env): boolean {
  return String(env.ENABLE_AIRTABLE_SYNC || "false").toLowerCase() === "true" && Boolean(env.AIRTABLE_API_KEY);
}

function airtableUrl(env: Env): string {
  const table = encodeURIComponent(env.AIRTABLE_TABLE_LINE_INBOX);
  return `https://api.airtable.com/v0/${env.AIRTABLE_BASE_ID}/${table}`;
}

function syncTargetUrl(env: Env): string {
  const table = encodeURIComponent("MMD — Console Inbox");
  return `https://api.airtable.com/v0/${env.AIRTABLE_BASE_ID}/${table}`;
}

function headers(env: Env): HeadersInit {
  return {
    Authorization: `Bearer ${env.AIRTABLE_API_KEY}`,
    "Content-Type": "application/json",
  };
}

function getString(fields: Record<string, AirtableValue> | undefined, key: string): string | undefined {
  const value = fields?.[key];
  return typeof value === "string" ? value : undefined;
}

function getNumber(fields: Record<string, AirtableValue> | undefined, key: string): number | undefined {
  const value = fields?.[key];
  return typeof value === "number" ? value : undefined;
}

function getStringArray(fields: Record<string, AirtableValue> | undefined, key: string): string[] {
  const value = fields?.[key];
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function parseFlags(value: string | undefined, fallback: string[]): string[] {
  if (!value) return fallback;

  const flags = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  return flags.length ? Array.from(new Set(flags)) : fallback;
}

function mapRecord(record: AirtableRecord): MigrationRecord | null {
  const fields = record.fields;
  const migration_id = getString(fields, "migration_id");
  const source_user_id = getString(fields, "source_user_id");
  const source_message_id = getString(fields, "source_message_id");
  const received_at = getString(fields, "received_at");
  const raw_text = getString(fields, "raw_text");
  const migration_status = getString(fields, "migration_status");

  if (!migration_id || !source_user_id || !source_message_id || !received_at || !raw_text || !migration_status) {
    return null;
  }

  const source_channel = getString(fields, "source_channel");
  const linked_client_id = getString(fields, "linked_client_id");

  return {
    migration_id,
    source_channel: source_channel === "line" ? "line" : "line",
    source_user_id,
    source_message_id,
    received_at,
    raw_text,
    parsed_name: getString(fields, "parsed_name"),
    parsed_phone: getString(fields, "parsed_phone"),
    parsed_intent: getString(fields, "parsed_intent"),
    parsed_budget_thb: getNumber(fields, "parsed_budget_thb"),
    parsed_date: getString(fields, "parsed_date"),
    parsed_location: getString(fields, "parsed_location"),
    confidence_score: getNumber(fields, "confidence_score") ?? 0,
    dedupe_status:
      (getString(fields, "dedupe_status") as MigrationRecord["dedupe_status"] | undefined) ?? "unresolved",
    linked_client_id: linked_client_id || null,
    flags: parseFlags(getString(fields, "flags"), getStringArray(fields, "flags")),
    migration_status: migration_status as MigrationRecord["migration_status"],
  };
}

export function canReadAirtable(env: Env): boolean {
  return Boolean(env.AIRTABLE_API_KEY);
}

export async function listRecordsFromAirtable(
  env: Env,
  cursor?: string | null,
): Promise<{ records: MigrationRecord[]; next_cursor: string | null }> {
  const url = new URL(airtableUrl(env));
  url.searchParams.set("pageSize", "100");

  if (cursor) {
    url.searchParams.set("offset", cursor);
  }

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: headers(env),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Airtable list failed: ${response.status} ${text}`);
  }

  const data = (await response.json()) as AirtableListResponse;

  return {
    records: (data.records ?? []).map(mapRecord).filter((record): record is MigrationRecord => Boolean(record)),
    next_cursor: data.offset ?? null,
  };
}

function sessionsUrl(env: Env): string {
  const table = encodeURIComponent(env.AIRTABLE_TABLE_SESSIONS || "tblC98mKWbzmPuNzX");
  return `https://api.airtable.com/v0/${env.AIRTABLE_BASE_ID}/${table}`;
}

function getSessionStatus(fields: Record<string, AirtableValue> | undefined): LiveSession["status"] {
  const raw =
    getString(fields, "status") ||
    getString(fields, "fldHAlxnRfpKucnNV") ||
    "confirmed";

  const normalized = raw.toLowerCase().replace(/\s+/g, "_");

  switch (normalized) {
    case "confirmed":
    case "en_route":
    case "arrived":
    case "met":
    case "work_started":
    case "work_finished":
    case "separated":
      return normalized;
    default:
      return "confirmed";
  }
}

function mapSession(record: AirtableRecord): LiveSession | null {
  const fields = record.fields;
  const session_id =
    getString(fields, "session_id") ||
    getString(fields, "fldLTq2kZbyRv22IA");

  if (!session_id) {
    return null;
  }

  return {
    session_id,
    customer: getString(fields, "client_name") || getString(fields, "mmd_client_name") || "Client",
    model: getString(fields, "model_name") || "Model",
    status: getSessionStatus(fields),
    eta_min: 0,
    start: { x: 0, y: 0 },
    current: { x: 0, y: 0 },
    destination: { x: 0, y: 0 },
    updated_at: getString(fields, "updated_at") || getString(fields, "created_at") || getString(fields, "job_date") || new Date().toISOString(),
    raw: fields,
  };
}

export async function listSessionsFromAirtable(env: Env): Promise<LiveSession[]> {
  const url = new URL(sessionsUrl(env));
  url.searchParams.set("pageSize", "100");

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: headers(env),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Airtable sessions list failed: ${response.status} ${text}`);
  }

  const data = (await response.json()) as AirtableListResponse;
  return (data.records ?? []).map(mapSession).filter((session): session is LiveSession => Boolean(session));
}

export async function syncRecordsToAirtable(env: Env, records: MigrationRecord[]) {
  if (!enabled(env)) {
    return {
      mode: "mock" as const,
      results: records.map((record) => ({
        migration_id: record.migration_id,
        airtable_record_id: `mock_${record.migration_id}`,
        client_id: record.linked_client_id ?? null,
        migration_status: "synced_to_airtable" as const,
      })),
    };
  }

  const results: Array<{
    migration_id: string;
    airtable_record_id?: string;
    client_id?: string | null;
    migration_status: "synced_to_airtable";
  }> = [];

  for (const record of records) {
    const body = {
      fields: {
        inbox_id: record.migration_id,
        created_by: "immigrate-worker",
        source: "line",
        intent: record.parsed_intent === "booking" ? "create_session" : "note_only",
        member_name: record.parsed_name || "",
        member_phone: record.parsed_phone || "",
        line_user_id: record.source_user_id,
        line_id: record.source_message_id,
        legacy_tags: record.flags.join(", "),
        admin_note: record.raw_text,
        payload_json: JSON.stringify({
          migration_id: record.migration_id,
          source_channel: record.source_channel,
          source_user_id: record.source_user_id,
          source_message_id: record.source_message_id,
          received_at: record.received_at,
          raw_text: record.raw_text,
          parsed_name: record.parsed_name || "",
          parsed_phone: record.parsed_phone || "",
          parsed_intent: record.parsed_intent || "",
          parsed_budget_thb: record.parsed_budget_thb || 0,
          parsed_date: record.parsed_date || "",
          parsed_location: record.parsed_location || "",
          confidence_score: record.confidence_score,
          dedupe_status: record.dedupe_status,
          linked_client_id: record.linked_client_id || "",
          flags: record.flags,
          migration_status: "synced_to_airtable",
        }),
        status: "new",
      },
    };

    const response = await fetch(syncTargetUrl(env), {
      method: "POST",
      headers: headers(env),
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Airtable sync failed for ${record.migration_id}: ${response.status} ${text}`);
    }

    const json = (await response.json()) as { id?: string };
    results.push({
      migration_id: record.migration_id,
      airtable_record_id: json.id,
      client_id: record.linked_client_id ?? null,
      migration_status: "synced_to_airtable",
    });
  }

  return { mode: "airtable" as const, results };
}
