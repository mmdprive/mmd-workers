import type {
  Env,
  PromoteImmigrationRequest,
  PromoteImmigrationResponse,
} from "../types";

const AIRTABLE_API = "https://api.airtable.com/v0";

type AirtableRecord = {
  id: string;
  fields?: Record<string, unknown>;
};

type AirtableListResponse = {
  records?: AirtableRecord[];
};

function str(value: unknown): string {
  return String(value ?? "").trim();
}

function normalizePhone(value: unknown): string {
  return str(value).replace(/[^\d+]/g, "");
}

function airtableHeaders(env: Env): HeadersInit {
  return {
    Authorization: `Bearer ${env.AIRTABLE_API_KEY}`,
    "Content-Type": "application/json",
  };
}

function tableUrl(env: Env, tableName: string): string {
  return `${AIRTABLE_API}/${encodeURIComponent(env.AIRTABLE_BASE_ID)}/${encodeURIComponent(tableName)}`;
}

function escapeFormulaValue(value: string): string {
  return value.replace(/"/g, '\\"');
}

async function airtableListByFormula(
  env: Env,
  tableName: string,
  filterByFormula: string,
): Promise<AirtableRecord[]> {
  const params = new URLSearchParams();
  params.set("pageSize", "10");
  params.set("filterByFormula", filterByFormula);

  const response = await fetch(`${tableUrl(env, tableName)}?${params.toString()}`, {
    method: "GET",
    headers: airtableHeaders(env),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`airtable_list_failed: ${response.status} ${text}`);
  }

  const data = (await response.json()) as AirtableListResponse;
  return Array.isArray(data.records) ? data.records : [];
}

async function airtableCreateRecord(
  env: Env,
  tableName: string,
  fields: Record<string, unknown>,
): Promise<AirtableRecord> {
  const response = await fetch(tableUrl(env, tableName), {
    method: "POST",
    headers: airtableHeaders(env),
    body: JSON.stringify({ fields }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`airtable_create_failed: ${response.status} ${text}`);
  }

  return (await response.json()) as AirtableRecord;
}

async function airtablePatchRecord(
  env: Env,
  tableName: string,
  recordId: string,
  fields: Record<string, unknown>,
): Promise<AirtableRecord> {
  const response = await fetch(`${tableUrl(env, tableName)}/${encodeURIComponent(recordId)}`, {
    method: "PATCH",
    headers: airtableHeaders(env),
    body: JSON.stringify({ fields }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`airtable_patch_failed: ${response.status} ${text}`);
  }

  return (await response.json()) as AirtableRecord;
}

function deriveMemberId(payload: PromoteImmigrationRequest): string {
  const seed =
    payload.identity.member_id ||
    payload.identity.line_user_id ||
    payload.identity.line_id ||
    payload.immigration_id;

  return `mem_${seed.replace(/[^a-zA-Z0-9]+/g, "_").slice(0, 32)}`;
}

function buildMemberFields(
  payload: PromoteImmigrationRequest,
  memberId: string,
): Record<string, unknown> {
  return {
    member_id: memberId,
    line_id: str(payload.identity.line_id) || undefined,
    line_user_id: str(payload.identity.line_user_id) || undefined,
    full_name: str(payload.identity.full_name) || undefined,
    phone: normalizePhone(payload.identity.phone) || undefined,
    tier:
      str(payload.membership?.target_tier || payload.membership?.current_tier) ||
      undefined,
    membership_status: "active",
    service_history_summary: payload.service_history_summary,
    source_of_first_truth: "immigration_manual_notes",
    created_from_immigration_id: payload.immigration_id,
  };
}

async function findMatchingMembers(
  env: Env,
  tableName: string,
  payload: PromoteImmigrationRequest,
): Promise<AirtableRecord[]> {
  const formulas: string[] = [];

  if (str(payload.identity.member_id)) {
    formulas.push(`{member_id}="${escapeFormulaValue(str(payload.identity.member_id))}"`);
  }
  if (str(payload.identity.line_user_id)) {
    formulas.push(`{line_user_id}="${escapeFormulaValue(str(payload.identity.line_user_id))}"`);
  }
  if (str(payload.identity.line_id)) {
    formulas.push(`{line_id}="${escapeFormulaValue(str(payload.identity.line_id))}"`);
  }
  if (normalizePhone(payload.identity.phone)) {
    formulas.push(`{phone}="${escapeFormulaValue(normalizePhone(payload.identity.phone))}"`);
  }

  const allMatches = new Map<string, AirtableRecord>();
  for (const formula of formulas) {
    const records = await airtableListByFormula(env, tableName, formula);
    for (const record of records) {
      allMatches.set(record.id, record);
    }
  }

  return [...allMatches.values()];
}

export async function promoteImmigrationToMember(
  env: Env,
  payload: PromoteImmigrationRequest,
): Promise<PromoteImmigrationResponse> {
  const clientsTable = str(env.AIRTABLE_TABLE_CLIENTS);
  const notesTable = str(env.AIRTABLE_TABLE_MEMBER_NOTES);
  const archiveRawNotes = payload.promotion_policy?.archive_raw_notes !== false;
  const createIfMissing = payload.promotion_policy?.create_if_missing !== false;

  if (!clientsTable || !env.AIRTABLE_API_KEY || !env.AIRTABLE_BASE_ID) {
    return {
      ok: true,
      data: {
        immigration_id: payload.immigration_id,
        member_id: deriveMemberId(payload),
        created_new_member: true,
        matched_existing_member: false,
        promotion_status: "promoted",
        archive_note_created: false,
        service_history_written: true,
      },
    };
  }

  const matches = await findMatchingMembers(env, clientsTable, payload);
  if (matches.length > 1) {
    throw new Error("IDENTITY_CONFLICT");
  }

  let memberId = deriveMemberId(payload);
  let createdNewMember = false;
  let matchedExistingMember = false;
  let targetRecordId = "";

  if (matches.length === 1) {
    const existing = matches[0];
    targetRecordId = existing.id;
    memberId = str(existing.fields?.member_id) || memberId;
    matchedExistingMember = true;

    await airtablePatchRecord(env, clientsTable, existing.id, {
      service_history_summary: payload.service_history_summary,
      tier:
        str(payload.membership?.target_tier || payload.membership?.current_tier) ||
        undefined,
    });
  } else {
    if (!createIfMissing) {
      return {
        ok: true,
        data: {
          immigration_id: payload.immigration_id,
          member_id: "",
          created_new_member: false,
          matched_existing_member: false,
          promotion_status: "needs_manual_review",
          archive_note_created: false,
          service_history_written: false,
        },
      };
    }

    const created = await airtableCreateRecord(
      env,
      clientsTable,
      buildMemberFields(payload, memberId),
    );
    targetRecordId = created.id;
    createdNewMember = true;
  }

  let archiveNoteCreated = false;
  if (archiveRawNotes && notesTable && targetRecordId) {
    await airtableCreateRecord(env, notesTable, {
      member_id: memberId,
      immigration_id: payload.immigration_id,
      note_type: "immigration_manual_note",
      raw_note: payload.notes.manual_note_raw,
      operator_summary: str(payload.notes.operator_summary) || undefined,
      source_channel: payload.source_channel,
      payload_json: JSON.stringify(payload.payload_json || {}),
    });
    archiveNoteCreated = true;
  }

  return {
    ok: true,
    data: {
      immigration_id: payload.immigration_id,
      member_id: memberId,
      created_new_member: createdNewMember,
      matched_existing_member: matchedExistingMember,
      promotion_status: "promoted",
      archive_note_created: archiveNoteCreated,
      service_history_written: true,
    },
  };
}
