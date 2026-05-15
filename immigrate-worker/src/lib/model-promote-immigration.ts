import type { Env } from "../types";

type AirtableScalar = string | number | boolean | string[] | null | undefined;
type AirtableFields = Record<string, AirtableScalar>;

type AirtableRecord = {
  id: string;
  fields?: AirtableFields;
};

type AirtableListResponse = {
  records?: AirtableRecord[];
};

type AirtableSingleResponse = {
  id?: string;
  fields?: AirtableFields;
};

type PromoteModelBody = {
  draft_id?: string;
  source_record_id?: string;
  model_name?: string;
  display_name?: string;
  nickname?: string;
  phone?: string;
  line_user_id?: string;
  line_id?: string;
  telegram_username?: string;
  age?: number | string;
  consent_status?: string;
  verification_status?: string;
  source?: string;
  note?: string;
  operator_note?: string;
  promoted_by?: string;
  payload_json?: Record<string, unknown>;
};

type PromoteModelResult = {
  ok: true;
  data: {
    contract_version: "model_promote_immigration_v1";
    draft_id: string;
    model_record_id: string;
    model_name: string;
    promotion_status: "promoted";
    promoted_at: string;
    promoted_by: string;
    mode: "airtable" | "mock";
    activity_log_record_id: string | null;
  };
};

function toStr(value: unknown): string {
  return String(value ?? "").trim();
}

function toNum(value: unknown): number | undefined {
  const n = Number(String(value ?? "").replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : undefined;
}

function readJsonObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function airtableHeaders(env: Env): HeadersInit {
  return {
    Authorization: `Bearer ${env.AIRTABLE_API_KEY}`,
    "Content-Type": "application/json",
  };
}

function airtableTableUrl(env: Env, table: string): string {
  return `https://api.airtable.com/v0/${env.AIRTABLE_BASE_ID}/${encodeURIComponent(table)}`;
}

function envRecord(env: Env): Record<string, unknown> {
  return env as unknown as Record<string, unknown>;
}

function modelDraftsTable(env: Env): string {
  return toStr(envRecord(env).AIRTABLE_TABLE_MODEL_DRAFTS) || "models/draft";
}

function modelsTable(env: Env): string {
  return toStr(envRecord(env).AIRTABLE_TABLE_MODELS) || "tblcatsmzAT5nKqIn";
}

function activityLogsTable(env: Env): string {
  return toStr(envRecord(env).AIRTABLE_TABLE_ACTIVITY_LOGS) || "tblbUWRoFL6OI6QMJ";
}

function envField(env: Env, key: string, fallback: string): string {
  return toStr(envRecord(env)[key]) || fallback;
}

function escapeFormulaValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function hasAirtable(env: Env): boolean {
  return Boolean(env.AIRTABLE_API_KEY && env.AIRTABLE_BASE_ID);
}

function isAuthorizedForModelPromotion(request: Request, env: Env): boolean {
  const auth = request.headers.get("authorization") || "";
  const bearer = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  const internalToken = request.headers.get("x-internal-token") || "";
  const confirmKey = request.headers.get("x-confirm-key") || "";

  return Boolean(
    (env.INTERNAL_TOKEN && (bearer === env.INTERNAL_TOKEN || internalToken === env.INTERNAL_TOKEN)) ||
      (env.CONFIRM_KEY && confirmKey === env.CONFIRM_KEY),
  );
}

async function getAirtableRecord(env: Env, table: string, recordId: string): Promise<AirtableRecord | null> {
  if (!recordId) return null;
  const response = await fetch(`${airtableTableUrl(env, table)}/${encodeURIComponent(recordId)}`, {
    method: "GET",
    headers: airtableHeaders(env),
  });

  if (response.status === 404) return null;
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Airtable record read failed: ${response.status} ${text}`);
  }

  return (await response.json()) as AirtableRecord;
}

async function findDraftBySourceRecordId(env: Env, sourceRecordId: string): Promise<AirtableRecord | null> {
  const sourceField = envField(env, "AIRTABLE_MODEL_DRAFT_FIELD_SOURCE_RECORD_ID", "source_record_id");
  const url = new URL(airtableTableUrl(env, modelDraftsTable(env)));
  url.searchParams.set("pageSize", "1");
  url.searchParams.set("filterByFormula", `{${sourceField}}="${escapeFormulaValue(sourceRecordId)}"`);

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: airtableHeaders(env),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Airtable draft lookup failed: ${response.status} ${text}`);
  }

  const data = (await response.json()) as AirtableListResponse;
  return data.records?.[0] ?? null;
}

function firstString(...values: unknown[]): string {
  for (const value of values) {
    const s = toStr(value);
    if (s) return s;
  }
  return "";
}

function pickDraftField(fields: AirtableFields | undefined, keys: string[]): string {
  for (const key of keys) {
    const value = fields?.[key];
    const s = toStr(value);
    if (s) return s;
  }
  return "";
}

function normalizePromotionInput(body: PromoteModelBody, draft: AirtableRecord | null) {
  const fields = draft?.fields;
  const modelName = firstString(
    body.model_name,
    body.display_name,
    body.nickname,
    pickDraftField(fields, ["model_name", "Model Name", "display_name", "Display Name", "nickname"]),
  );

  if (!modelName) {
    throw new Error("missing_model_name");
  }

  const age = toNum(body.age ?? fields?.age ?? fields?.Age);
  const now = new Date().toISOString();

  return {
    draft_id: toStr(body.draft_id || draft?.id),
    source_record_id: toStr(body.source_record_id || pickDraftField(fields, ["source_record_id", "Source Record ID"])),
    model_name: modelName,
    phone: firstString(body.phone, pickDraftField(fields, ["phone", "Phone", "Phone Number"])),
    line_user_id: firstString(body.line_user_id, pickDraftField(fields, ["line_user_id", "LINE User ID", "Line User ID"])),
    line_id: firstString(body.line_id, pickDraftField(fields, ["line_id", "LINE ID", "Line ID"])),
    telegram_username: firstString(body.telegram_username, pickDraftField(fields, ["telegram_username", "Telegram Username"])),
    age,
    consent_status: firstString(body.consent_status, pickDraftField(fields, ["consent_status", "Consent Status"]), "pending_review"),
    verification_status: firstString(body.verification_status, pickDraftField(fields, ["verification_status", "Verification Status"]), "draft_promoted"),
    source: firstString(body.source, pickDraftField(fields, ["source", "Source"]), "model_immigration"),
    note: firstString(body.note, body.operator_note, pickDraftField(fields, ["note", "Notes", "operator_note"])),
    promoted_by: firstString(body.promoted_by, "admin"),
    promoted_at: now,
    payload_json: {
      ...readJsonObject(body.payload_json),
      draft_fields_snapshot: fields ?? null,
      source_record_id: toStr(body.source_record_id),
    },
  };
}

function buildModelFields(env: Env, input: ReturnType<typeof normalizePromotionInput>): AirtableFields {
  const fields: AirtableFields = {
    [envField(env, "AIRTABLE_MODEL_FIELD_MODEL_NAME", "Model Name")]: input.model_name,
  };

  const optionalMap: Array<[string, string, AirtableScalar]> = [
    ["AIRTABLE_MODEL_FIELD_PHONE", "Phone Number", input.phone],
    ["AIRTABLE_MODEL_FIELD_LINE_USER_ID", "line_user_id", input.line_user_id],
    ["AIRTABLE_MODEL_FIELD_LINE_ID", "line_id", input.line_id],
    ["AIRTABLE_MODEL_FIELD_TELEGRAM_USERNAME", "telegram_username", input.telegram_username],
    ["AIRTABLE_MODEL_FIELD_AGE", "Age", input.age],
    ["AIRTABLE_MODEL_FIELD_CONSENT_STATUS", "consent_status", input.consent_status],
    ["AIRTABLE_MODEL_FIELD_VERIFICATION_STATUS", "verification_status", input.verification_status],
    ["AIRTABLE_MODEL_FIELD_SOURCE", "source", input.source],
    ["AIRTABLE_MODEL_FIELD_NOTES_RAW", "notes_raw", JSON.stringify({
      migration_layer: "immigrate-worker",
      boundary: "Model promotion from immigration draft. Core model truth starts at promoted model record.",
      draft_id: input.draft_id,
      source_record_id: input.source_record_id,
      promoted_at: input.promoted_at,
      promoted_by: input.promoted_by,
      note: input.note,
      payload_json: input.payload_json,
    }, null, 2)],
  ];

  for (const [envKey, fallback, value] of optionalMap) {
    const fieldName = envField(env, envKey, fallback);
    if (value !== undefined && value !== null && toStr(value)) fields[fieldName] = value;
  }

  return fields;
}

async function createModelRecord(env: Env, fields: AirtableFields): Promise<AirtableSingleResponse> {
  const url = airtableTableUrl(env, modelsTable(env));
  const response = await fetch(url, {
    method: "POST",
    headers: airtableHeaders(env),
    body: JSON.stringify({ fields }),
  });

  if (response.ok) return (await response.json()) as AirtableSingleResponse;

  const text = await response.text();
  const primaryField = envField(env, "AIRTABLE_MODEL_FIELD_MODEL_NAME", "Model Name");

  if (Object.keys(fields).length > 1) {
    const retry = await fetch(url, {
      method: "POST",
      headers: airtableHeaders(env),
      body: JSON.stringify({ fields: { [primaryField]: fields[primaryField] } }),
    });

    if (retry.ok) return (await retry.json()) as AirtableSingleResponse;
    const retryText = await retry.text();
    throw new Error(`Airtable model create failed: ${response.status} ${text}; retry failed: ${retry.status} ${retryText}`);
  }

  throw new Error(`Airtable model create failed: ${response.status} ${text}`);
}

async function patchDraftPromotionStatus(
  env: Env,
  draftId: string,
  modelRecordId: string,
  promotedAt: string,
  promotedBy: string,
): Promise<void> {
  if (!draftId) return;

  const fields: AirtableFields = {
    [envField(env, "AIRTABLE_MODEL_DRAFT_FIELD_PROMOTION_STATUS", "promotion_status")]: "promoted",
    [envField(env, "AIRTABLE_MODEL_DRAFT_FIELD_PROMOTED_MODEL_ID", "promoted_model_id")]: modelRecordId,
    [envField(env, "AIRTABLE_MODEL_DRAFT_FIELD_PROMOTED_AT", "promoted_at")]: promotedAt,
    [envField(env, "AIRTABLE_MODEL_DRAFT_FIELD_PROMOTED_BY", "promoted_by")]: promotedBy,
  };

  const response = await fetch(`${airtableTableUrl(env, modelDraftsTable(env))}/${encodeURIComponent(draftId)}`, {
    method: "PATCH",
    headers: airtableHeaders(env),
    body: JSON.stringify({ fields }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Airtable model draft promotion patch failed: ${response.status} ${text}`);
  }
}

async function writeActivityLog(
  env: Env,
  input: ReturnType<typeof normalizePromotionInput>,
  modelRecordId: string,
): Promise<string | null> {
  const fields: AirtableFields = {
    [envField(env, "AIRTABLE_ACTIVITY_FIELD_TITLE", "Title")]: `Model promoted: ${input.model_name}`,
    [envField(env, "AIRTABLE_ACTIVITY_FIELD_SCOPE", "scope")]: "model_immigration",
    [envField(env, "AIRTABLE_ACTIVITY_FIELD_ACTION", "action")]: "promote_model_immigration",
    [envField(env, "AIRTABLE_ACTIVITY_FIELD_TARGET_ID", "target_id")]: modelRecordId,
    [envField(env, "AIRTABLE_ACTIVITY_FIELD_NOTES", "notes")]: JSON.stringify({
      draft_id: input.draft_id,
      source_record_id: input.source_record_id,
      model_record_id: modelRecordId,
      promoted_at: input.promoted_at,
      promoted_by: input.promoted_by,
    }, null, 2),
  };

  const response = await fetch(airtableTableUrl(env, activityLogsTable(env)), {
    method: "POST",
    headers: airtableHeaders(env),
    body: JSON.stringify({ fields }),
  });

  if (response.ok) {
    const data = (await response.json()) as AirtableSingleResponse;
    return data.id ?? null;
  }

  return null;
}

function jsonResponse(data: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(data, null, 2), {
    ...init,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...(init?.headers || {}),
    },
  });
}

export async function handleModelPromoteImmigration(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") {
    return jsonResponse({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "POST required" } }, { status: 405 });
  }

  if (!isAuthorizedForModelPromotion(request, env)) {
    return jsonResponse({ ok: false, error: { code: "UNAUTHORIZED", message: "internal token required" } }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as PromoteModelBody | null;
  if (!body || typeof body !== "object") {
    return jsonResponse({ ok: false, error: { code: "INVALID_INPUT", message: "valid JSON body required" } }, { status: 400 });
  }

  if (!hasAirtable(env)) {
    const promotedAt = new Date().toISOString();
    const mockName = firstString(body.model_name, body.display_name, body.nickname, "Model");
    return jsonResponse({
      ok: true,
      data: {
        contract_version: "model_promote_immigration_v1",
        draft_id: toStr(body.draft_id || body.source_record_id || `mock_${Date.now()}`),
        model_record_id: `mock_model_${crypto.randomUUID().slice(0, 8)}`,
        model_name: mockName,
        promotion_status: "promoted",
        promoted_at: promotedAt,
        promoted_by: firstString(body.promoted_by, "admin"),
        mode: "mock",
        activity_log_record_id: null,
      },
    } satisfies PromoteModelResult);
  }

  try {
    const draft = body.draft_id
      ? await getAirtableRecord(env, modelDraftsTable(env), body.draft_id)
      : body.source_record_id
        ? await findDraftBySourceRecordId(env, body.source_record_id)
        : null;

    const input = normalizePromotionInput(body, draft);
    const model = await createModelRecord(env, buildModelFields(env, input));
    const modelRecordId = toStr(model.id);

    if (!modelRecordId) throw new Error("missing_model_record_id");

    await patchDraftPromotionStatus(env, input.draft_id, modelRecordId, input.promoted_at, input.promoted_by);
    const activityLogRecordId = await writeActivityLog(env, input, modelRecordId);

    return jsonResponse({
      ok: true,
      data: {
        contract_version: "model_promote_immigration_v1",
        draft_id: input.draft_id,
        model_record_id: modelRecordId,
        model_name: input.model_name,
        promotion_status: "promoted",
        promoted_at: input.promoted_at,
        promoted_by: input.promoted_by,
        mode: "airtable",
        activity_log_record_id: activityLogRecordId,
      },
    } satisfies PromoteModelResult);
  } catch (error) {
    return jsonResponse(
      {
        ok: false,
        error: {
          code: "MODEL_PROMOTION_FAILED",
          message: error instanceof Error ? error.message : "model promotion failed",
        },
      },
      { status: 500 },
    );
  }
}
