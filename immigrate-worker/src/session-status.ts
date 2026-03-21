import type { Env } from "./index";

type ModelType =
  | "public"
  | "standard"
  | "premium"
  | "vip"
  | "svip"
  | "blackcard";

type PriceMode = "fixed" | "approval";

type FlowLayer = "core" | "immigration";

type SessionStatusValue = "Pending" | "Confirmed";

type AirtableRecord = {
  id: string;
  createdTime?: string;
  fields?: Record<string, unknown>;
};

type AirtableListResponse = {
  records?: AirtableRecord[];
  offset?: string;
};

const FIELD_SESSION_ID = "session_id";
const FIELD_SESSION_STATUS = "Session Status";

const SESSION_STATUS = {
  PENDING: "Pending" as SessionStatusValue,
  CONFIRMED: "Confirmed" as SessionStatusValue,
};

function json(data: unknown, status = 200, requestId?: string): Response {
  return new Response(
    JSON.stringify(
      requestId ? { ...((data as Record<string, unknown>) || {}), request_id: requestId } : data,
      null,
      2
    ),
    {
      status,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
      },
    }
  );
}

function encodePath(value: string): string {
  return encodeURIComponent(value);
}

function escapeFormulaValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function normalizeModelType(value: unknown): ModelType | null {
  const v = String(value || "").trim().toLowerCase();
  const allowed = ["public", "standard", "premium", "vip", "svip", "blackcard"];
  return allowed.includes(v) ? (v as ModelType) : null;
}

function normalizePriceMode(value: unknown): PriceMode | null {
  const v = String(value || "").trim().toLowerCase();
  const allowed = ["fixed", "approval"];
  return allowed.includes(v) ? (v as PriceMode) : null;
}

function normalizeFlowLayer(value: unknown): FlowLayer {
  const v = String(value || "immigration").trim().toLowerCase();
  return v === "core" ? "core" : "immigration";
}

function decideSessionStatus(input: {
  modelType: ModelType;
  priceMode: PriceMode;
  flowLayer: FlowLayer;
}): SessionStatusValue {
  const { modelType, priceMode, flowLayer } = input;

  const isStandardOrPublic = modelType === "standard" || modelType === "public";
  const isPremiumPlus =
    modelType === "premium" ||
    modelType === "vip" ||
    modelType === "svip" ||
    modelType === "blackcard";

  if (flowLayer === "core") {
    if (isStandardOrPublic && priceMode === "fixed") {
      return SESSION_STATUS.CONFIRMED;
    }
    return SESSION_STATUS.PENDING;
  }

  if (isStandardOrPublic && priceMode === "fixed") {
    return SESSION_STATUS.CONFIRMED;
  }

  if (isPremiumPlus || priceMode !== "fixed") {
    return SESSION_STATUS.PENDING;
  }

  return SESSION_STATUS.PENDING;
}

async function airtableGet(url: string, env: Env): Promise<AirtableListResponse> {
  const res = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${env.AIRTABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
  });

  const data = (await res.json()) as AirtableListResponse | Record<string, unknown>;

  if (!res.ok) {
    throw new Error(`Airtable GET failed: ${JSON.stringify(data)}`);
  }

  return data as AirtableListResponse;
}

async function airtablePatch(
  url: string,
  env: Env,
  payload: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const res = await fetch(url, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${env.AIRTABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = (await res.json()) as Record<string, unknown>;

  if (!res.ok) {
    throw new Error(`Airtable PATCH failed: ${JSON.stringify(data)}`);
  }

  return data;
}

async function findSessionBySessionId(env: Env, sessionId: string): Promise<AirtableListResponse> {
  const formula = encodeURIComponent(`{${FIELD_SESSION_ID}}="${escapeFormulaValue(sessionId)}"`);
  const url = `https://api.airtable.com/v0/${env.AIRTABLE_BASE_ID}/${encodePath(
    env.AIRTABLE_TABLE_SESSIONS
  )}?filterByFormula=${formula}`;

  return airtableGet(url, env);
}

async function getFirstSessionRecords(env: Env, maxRecords = 5): Promise<AirtableListResponse> {
  const url = `https://api.airtable.com/v0/${env.AIRTABLE_BASE_ID}/${encodePath(
    env.AIRTABLE_TABLE_SESSIONS
  )}?maxRecords=${maxRecords}`;

  return airtableGet(url, env);
}

async function updateSessionStatus(
  env: Env,
  recordId: string,
  sessionStatus: SessionStatusValue
): Promise<Record<string, unknown>> {
  const url = `https://api.airtable.com/v0/${env.AIRTABLE_BASE_ID}/${encodePath(
    env.AIRTABLE_TABLE_SESSIONS
  )}/${recordId}`;

  return airtablePatch(url, env, {
    fields: {
      [FIELD_SESSION_STATUS]: sessionStatus,
    },
  });
}

export async function handleSessionStatus(
  request: Request,
  env: Env,
  requestId?: string
): Promise<Response> {
  try {
    const body = (await request.json()) as {
      session_id?: string;
      model_type?: string;
      price_mode?: string;
      flow_layer?: string;
    };

    const sessionId = String(body.session_id || "").trim();
    const modelType = normalizeModelType(body.model_type);
    const priceMode = normalizePriceMode(body.price_mode);
    const flowLayer = normalizeFlowLayer(body.flow_layer);

    if (!sessionId) {
      return json(
        {
          ok: false,
          error: "session_id is required",
        },
        400,
        requestId
      );
    }

    if (!modelType) {
      return json(
        {
          ok: false,
          error: "model_type must be one of: public, standard, premium, vip, svip, blackcard",
        },
        400,
        requestId
      );
    }

    if (!priceMode) {
      return json(
        {
          ok: false,
          error: "price_mode must be one of: fixed, approval",
        },
        400,
        requestId
      );
    }

    const sessionLookup = await findSessionBySessionId(env, sessionId);

    if (!sessionLookup.records || sessionLookup.records.length === 0) {
      const debugRecords = await getFirstSessionRecords(env, 5);

      return json(
        {
          ok: false,
          error: `session_id not found: ${sessionId}`,
          data: {
            key_used: FIELD_SESSION_ID,
            status_field_used: FIELD_SESSION_STATUS,
            debug_note: "Showing first 5 session records for troubleshooting",
            first_records: debugRecords.records || [],
          },
        },
        404,
        requestId
      );
    }

    const record = sessionLookup.records[0];
    const recordId = record.id;

    const nextStatus = decideSessionStatus({
      modelType,
      priceMode,
      flowLayer,
    });

    const updated = await updateSessionStatus(env, recordId, nextStatus);

    return json(
      {
        ok: true,
        data: {
          session_id: sessionId,
          record_id: recordId,
          flow_layer: flowLayer,
          model_type: modelType,
          price_mode: priceMode,
          key_used: FIELD_SESSION_ID,
          status_field_used: FIELD_SESSION_STATUS,
          session_status: nextStatus,
          airtable: updated,
        },
      },
      200,
      requestId
    );
  } catch (error) {
    return json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      500,
      requestId
    );
  }
}