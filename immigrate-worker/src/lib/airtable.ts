import type {
  CustomerBookingConfirmRequest,
  Env,
  ImmigrationLinkContext,
  LiveSession,
  MigrationRecord,
} from "../types";

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

interface AirtableSingleResponse {
  id?: string;
  fields?: Record<string, AirtableValue>;
}

type AirtableFields = Record<string, AirtableValue>;

function toStr(value: AirtableValue | unknown): string {
  return value == null ? "" : String(value).trim();
}

function toNum(value: AirtableValue | unknown): number {
  const num = Number(value ?? 0);
  return Number.isFinite(num) ? num : 0;
}

function pickString(fields: AirtableFields | undefined, keys: string[]): string {
  for (const key of keys) {
    const value = fields?.[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function encodeFormulaValue(value: string): string {
  return String(value || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
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

function sessionField(
  env: Env,
  key:
    | "AIRTABLE_SESSION_FIELD_STATUS"
    | "AIRTABLE_SESSION_FIELD_PAYMENT_STATUS"
    | "AIRTABLE_SESSION_FIELD_PAYMENT_STAGE"
    | "AIRTABLE_SESSION_FIELD_AMOUNT_THB"
    | "AIRTABLE_SESSION_FIELD_FINAL_PRICE_THB"
    | "AIRTABLE_SESSION_FIELD_CONFIRMATION_NOTES"
    | "AIRTABLE_SESSION_FIELD_CUSTOMER_CONFIRMED_AT",
  fallback: string,
): string {
  return String(env[key] || "").trim() || fallback;
}

function canWriteSessions(env: Env): boolean {
  return Boolean(env.AIRTABLE_API_KEY && env.AIRTABLE_BASE_ID && env.AIRTABLE_TABLE_SESSIONS);
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

function paymentsUrl(env: Env): string {
  const table = encodeURIComponent(env.AIRTABLE_TABLE_PAYMENTS || "payments");
  return `https://api.airtable.com/v0/${env.AIRTABLE_BASE_ID}/${table}`;
}

function pointsLedgerUrl(env: Env): string {
  const table = encodeURIComponent(env.AIRTABLE_TABLE_POINTS_LEDGER || "points_ledger");
  return `https://api.airtable.com/v0/${env.AIRTABLE_BASE_ID}/${table}`;
}

async function listGenericRecords(
  env: Env,
  urlBase: string,
  { formula, maxRecords = 100 }: { formula?: string; maxRecords?: number } = {},
): Promise<AirtableRecord[]> {
  const url = new URL(urlBase);
  url.searchParams.set("pageSize", String(Math.max(1, Math.min(maxRecords, 100))));
  if (formula) url.searchParams.set("filterByFormula", formula);

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: headers(env),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Airtable generic list failed: ${response.status} ${text}`);
  }

  const data = (await response.json()) as AirtableListResponse;
  return data.records ?? [];
}

type ContextSession = {
  session_id: string;
  service_date: string;
  model_name: string;
  work_type: string;
  amount_total_thb: number;
  amount_paid_thb: number;
  balance_thb: number;
  payment_status: string;
  session_status: string;
  payment_ref: string;
  memberstack_id: string;
  member_email: string;
  customer_key: string;
  client_name: string;
};

function mapContextSession(fields: AirtableFields | undefined): ContextSession | null {
  const sessionId = pickString(fields, ["session_id", "Session ID", "fldLTq2kZbyRv22IA"]);
  if (!sessionId) return null;

  const amountTotal = toNum(
    fields?.amount_total_thb ?? fields?.amount_thb ?? fields?.["Amount THB"] ?? fields?.fldhwC79ndbnEXSZz,
  );
  const amountPaid = toNum(fields?.amount_paid_thb ?? fields?.paid_amount_thb ?? fields?.["Amount Paid THB"]);

  return {
    session_id: sessionId,
    service_date: pickString(fields, ["service_date", "job_date", "Date", "Service Date"]),
    model_name: pickString(fields, ["model_name", "Model Name"]),
    work_type: pickString(fields, ["work_type", "job_type", "Work Type", "Job Type", "package_code", "Package Code"]),
    amount_total_thb: amountTotal,
    amount_paid_thb: amountPaid,
    balance_thb: Math.max(0, amountTotal - amountPaid),
    payment_status: pickString(fields, ["payment_status", "Payment Status", "fldTY5lE6m0kQf72n"]).toLowerCase(),
    session_status: pickString(fields, ["status", "Session Status", "fldHAlxnRfpKucnNV"]).toLowerCase(),
    payment_ref: pickString(fields, ["payment_ref", "Payment Ref", "fldojgjSQLaO0uQLX"]),
    memberstack_id: pickString(fields, ["memberstack_id", "Memberstack ID"]),
    member_email: pickString(fields, ["member_email", "Member Email", "email", "Email"]),
    customer_key: pickString(fields, ["customer_key", "Customer Key"]),
    client_name: pickString(fields, ["client_name", "mmd_client_name", "Client Name", "Member Name"]),
  };
}

type ContextPoint = {
  created_at: string;
  points_delta: number;
  entry_type: string;
};

function mapContextPoint(fields: AirtableFields | undefined): ContextPoint {
  return {
    created_at: pickString(fields, ["created_at", "Created At"]),
    points_delta: toNum(fields?.points ?? fields?.Points),
    entry_type: pickString(fields, ["type", "Type"]).toLowerCase() || "earn",
  };
}

function buildServiceHistorySummaryFromSessions(sessions: ContextSession[]): string {
  if (!sessions.length) return "No prior service history found.";

  const sorted = [...sessions].sort((a, b) => {
    const aTime = new Date(a.service_date || 0).getTime();
    const bTime = new Date(b.service_date || 0).getTime();
    return bTime - aTime;
  });

  const latest = sorted[0];
  return [
    `total_sessions=${sorted.length}`,
    latest.service_date ? `latest_date=${latest.service_date}` : "",
    latest.model_name ? `latest_model=${latest.model_name}` : "",
    latest.work_type ? `latest_work_type=${latest.work_type}` : "",
    latest.session_status ? `latest_status=${latest.session_status}` : "",
  ]
    .filter(Boolean)
    .join(" | ");
}

export async function buildImmigrationLinkContext(
  env: Env,
  input: {
    immigration_id?: string;
    line_user_id?: string;
    memberstack_id?: string;
    email?: string;
    display_name?: string;
    current_tier?: string;
    target_tier?: string;
    membership_status?: string;
  },
): Promise<ImmigrationLinkContext> {
  const lineUserId = toStr(input.line_user_id);
  const memberstackId = toStr(input.memberstack_id);
  const email = toStr(input.email).toLowerCase();
  const displayName = toStr(input.display_name).toLowerCase();
  const immigrationId = toStr(input.immigration_id);

  let lineHistory: MigrationRecord[] = [];
  let serviceHistory: ContextSession[] = [];
  let pointEntries: ContextPoint[] = [];

  if (!canReadAirtable(env)) {
    return {
      source: "mock",
      line_history: [],
      service_history_summary: "Airtable disabled for link context.",
      service_history: [],
      current_status: {
        active_session_id: "",
        latest_session_status: "",
        latest_payment_status: "",
      },
      points: {
        balance: 0,
        total_earned: 0,
        total_redeemed: 0,
        entries: [],
      },
      membership: {
        memberstack_id: memberstackId,
        status: toStr(input.membership_status) || "pending",
        current_tier: toStr(input.current_tier),
        target_tier: toStr(input.target_tier),
        auto_signup_ready: !memberstackId,
      },
    };
  }

  try {
    const result = await listRecordsFromAirtable(env);
    lineHistory = result.records.filter((record) => {
      const matchesImmigration = immigrationId && record.migration_id === immigrationId;
      const matchesLine = lineUserId && record.source_user_id === lineUserId;
      const matchesName = displayName && toStr(record.parsed_name).toLowerCase() === displayName;
      return Boolean(matchesImmigration || matchesLine || matchesName);
    });
  } catch {
    lineHistory = [];
  }

  try {
    const sessionRows = await listGenericRecords(env, sessionsUrl(env), { maxRecords: 100 });
    serviceHistory = sessionRows
      .map((record) => mapContextSession(record.fields))
      .filter((record): record is ContextSession => Boolean(record))
      .filter((record) => {
        const matchesMemberstack = memberstackId && record.memberstack_id === memberstackId;
        const matchesEmail = email && record.member_email.toLowerCase() === email;
        const matchesName = displayName && record.client_name.toLowerCase() === displayName;
        return Boolean(matchesMemberstack || matchesEmail || matchesName);
      });
  } catch {
    serviceHistory = [];
  }

  const sessionIds = new Set(serviceHistory.map((record) => record.session_id));
  const customerKeys = Array.from(new Set(serviceHistory.map((record) => record.customer_key).filter(Boolean)));
  const memberEmails = Array.from(new Set(serviceHistory.map((record) => record.member_email.toLowerCase()).filter(Boolean)));

  try {
    const formulas: string[] = [];
    if (customerKeys[0]) formulas.push(`{customer_key}="${encodeFormulaValue(customerKeys[0])}"`);
    if (memberEmails[0]) formulas.push(`{member_email}="${encodeFormulaValue(memberEmails[0])}"`);
    if (formulas.length) {
      const pointRows = await listGenericRecords(env, pointsLedgerUrl(env), {
        formula: formulas.length === 1 ? formulas[0] : `OR(${formulas.join(",")})`,
        maxRecords: 100,
      });
      pointEntries = pointRows.map((row) => mapContextPoint(row.fields));
    }
  } catch {
    pointEntries = [];
  }

  const totalEarned = pointEntries.filter((entry) => entry.points_delta > 0).reduce((sum, entry) => sum + entry.points_delta, 0);
  const totalRedeemed = Math.abs(
    pointEntries.filter((entry) => entry.points_delta < 0).reduce((sum, entry) => sum + entry.points_delta, 0),
  );

  const latestSession = [...serviceHistory].sort((a, b) => {
    const aTime = new Date(a.service_date || 0).getTime();
    const bTime = new Date(b.service_date || 0).getTime();
    return bTime - aTime;
  })[0];

  return {
    source: "airtable",
    line_history: lineHistory,
    service_history_summary: buildServiceHistorySummaryFromSessions(serviceHistory),
    service_history: serviceHistory.map((record) => ({
      session_id: record.session_id,
      service_date: record.service_date,
      model_name: record.model_name,
      work_type: record.work_type,
      amount_total_thb: record.amount_total_thb,
      amount_paid_thb: record.amount_paid_thb,
      balance_thb: record.balance_thb,
      payment_status: record.payment_status,
      session_status: record.session_status,
      payment_ref: record.payment_ref,
    })),
    current_status: {
      active_session_id: latestSession?.session_id || "",
      latest_session_status: latestSession?.session_status || "",
      latest_payment_status: latestSession?.payment_status || "",
    },
    points: {
      balance: totalEarned - totalRedeemed,
      total_earned: totalEarned,
      total_redeemed: totalRedeemed,
      entries: pointEntries,
    },
    membership: {
      memberstack_id: memberstackId || latestSession?.memberstack_id || "",
      status: toStr(input.membership_status) || (memberstackId ? "active" : "pending_signup"),
      current_tier: toStr(input.current_tier),
      target_tier: toStr(input.target_tier),
      auto_signup_ready: !memberstackId,
    },
  };
}

export async function writeLinkAuditRecord(
  env: Env,
  input: {
    immigration_id: string;
    display_name?: string;
    line_user_id?: string;
    memberstack_id?: string;
    customer_url: string;
    model_url: string;
    customer_rules_url: string;
    model_rules_url: string;
    customer_dashboard_url: string;
    model_dashboard_url: string;
    context: ImmigrationLinkContext;
  },
): Promise<void> {
  if (!enabled(env)) return;

  const response = await fetch(syncTargetUrl(env), {
    method: "POST",
    headers: headers(env),
    body: JSON.stringify({
      fields: {
        inbox_id: `links_${input.immigration_id}`,
        created_by: "immigrate-worker",
        source: "line",
        intent: "create_links",
        member_name: input.display_name || "",
        line_user_id: input.line_user_id || "",
        admin_note: `Generated customer/model links for ${input.immigration_id}`,
        payload_json: JSON.stringify({
          immigration_id: input.immigration_id,
          memberstack_id: input.memberstack_id || "",
          customer_url: input.customer_url,
          model_url: input.model_url,
          customer_rules_url: input.customer_rules_url,
          model_rules_url: input.model_rules_url,
          customer_dashboard_url: input.customer_dashboard_url,
          model_dashboard_url: input.model_dashboard_url,
          context: input.context,
        }),
        status: "new",
      },
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Airtable link audit failed: ${response.status} ${text}`);
  }
}

async function findSessionRecord(
  env: Env,
  sessionId: string,
  paymentRef?: string,
): Promise<AirtableRecord | null> {
  const url = new URL(sessionsUrl(env));
  url.searchParams.set("pageSize", "1");

  const escapedSessionId = encodeFormulaValue(sessionId);
  const escapedPaymentRef = encodeFormulaValue(String(paymentRef || "").trim());
  const formulas = [
    `{fldLTq2kZbyRv22IA}="${escapedSessionId}"`,
    `{session_id}="${escapedSessionId}"`,
    paymentRef
      ? `AND({fldLTq2kZbyRv22IA}="${escapedSessionId}",{fldojgjSQLaO0uQLX}="${escapedPaymentRef}")`
      : "",
    paymentRef
      ? `AND({session_id}="${escapedSessionId}",{payment_ref}="${escapedPaymentRef}")`
      : "",
  ].filter(Boolean);

  for (const formula of formulas) {
    url.searchParams.set("filterByFormula", formula);

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: headers(env),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Airtable session lookup failed: ${response.status} ${text}`);
    }

    const data = (await response.json()) as AirtableListResponse;
    const record = data.records?.[0];
    if (record?.id) return record;
  }

  return null;
}

async function patchSessionRecord(
  env: Env,
  recordId: string,
  fields: Record<string, AirtableValue>,
): Promise<AirtableSingleResponse> {
  const response = await fetch(`${sessionsUrl(env)}/${encodeURIComponent(recordId)}`, {
    method: "PATCH",
    headers: headers(env),
    body: JSON.stringify({ fields }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Airtable session patch failed: ${response.status} ${text}`);
  }

  return (await response.json()) as AirtableSingleResponse;
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

export async function confirmCustomerBookingToAirtable(
  env: Env,
  input: CustomerBookingConfirmRequest,
) {
  const paymentType = input.payment_type === "full" ? "full" : "deposit";
  const selectedAmount =
    typeof input.selected_amount_thb === "number" && Number.isFinite(input.selected_amount_thb)
      ? input.selected_amount_thb
      : null;
  const confirmedAt = new Date().toISOString();

  if (!canWriteSessions(env)) {
    return {
      mode: "mock" as const,
      session_status: "awaiting_payment",
      payment_status: "pending",
      payment_ref: input.payment_ref || "",
      payment_type: paymentType,
      selected_amount_thb: selectedAmount,
      confirmed_at: confirmedAt,
    };
  }

  const sessionRecord = await findSessionRecord(env, input.session_id, input.payment_ref);
  if (!sessionRecord?.id) {
    throw new Error("session_not_found");
  }

  const existingPaymentRef =
    getString(sessionRecord.fields, "payment_ref") ||
    getString(sessionRecord.fields, "fldojgjSQLaO0uQLX") ||
    "";

  const sessionStatusField = sessionField(env, "AIRTABLE_SESSION_FIELD_STATUS", "fldHAlxnRfpKucnNV");
  const paymentStatusField = sessionField(
    env,
    "AIRTABLE_SESSION_FIELD_PAYMENT_STATUS",
    "fldTY5lE6m0kQf72n",
  );
  const paymentStageField = sessionField(
    env,
    "AIRTABLE_SESSION_FIELD_PAYMENT_STAGE",
    "payment_stage",
  );
  const amountField = sessionField(env, "AIRTABLE_SESSION_FIELD_AMOUNT_THB", "fldhwC79ndbnEXSZz");
  const finalPriceField = sessionField(
    env,
    "AIRTABLE_SESSION_FIELD_FINAL_PRICE_THB",
    "fldug5LUyiLyLvrCV",
  );
  const confirmationNotesField = sessionField(
    env,
    "AIRTABLE_SESSION_FIELD_CONFIRMATION_NOTES",
    "confirmation_notes",
  );
  const customerConfirmedAtField = sessionField(
    env,
    "AIRTABLE_SESSION_FIELD_CUSTOMER_CONFIRMED_AT",
    "customer_confirmed_at",
  );

  const noteParts = [
    `customer_confirmed_at=${confirmedAt}`,
    `payment_type=${paymentType}`,
    selectedAmount != null ? `selected_amount_thb=${selectedAmount}` : "",
    input.client_name ? `client_name=${input.client_name}` : "",
    input.note ? `note=${input.note}` : "",
  ].filter(Boolean);

  const existingNotes = getString(sessionRecord.fields, confirmationNotesField) || "";
  const nextNotes = [existingNotes, noteParts.join(" | ")].filter(Boolean).join("\n");

  await patchSessionRecord(env, sessionRecord.id, {
    [sessionStatusField]: "awaiting_payment",
    [paymentStatusField]: "pending",
    [paymentStageField]: paymentType,
    ...(selectedAmount != null
      ? {
          [amountField]: selectedAmount,
          [finalPriceField]: selectedAmount,
        }
      : {}),
    [confirmationNotesField]: nextNotes,
    [customerConfirmedAtField]: confirmedAt,
  });

  return {
    mode: "airtable" as const,
    session_status: "awaiting_payment",
    payment_status: "pending",
    payment_ref: input.payment_ref || existingPaymentRef,
    payment_type: paymentType,
    selected_amount_thb: selectedAmount,
    confirmed_at: confirmedAt,
  };
}
