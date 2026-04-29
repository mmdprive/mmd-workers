import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MODEL_MANIFEST } from "../src/lib/model-manifest.generated.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(projectRoot, "..", "..");
const databaseDir = path.join(repoRoot, "Member Data", "database");

const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID || "appsV1ILPRfIjkaYg";
const CONSOLE_INBOX_TABLE_ID = process.env.AIRTABLE_TABLE_CONSOLE_INBOX_ID || "tblFHmfpB2TTrzO2e";
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY || "";

const mentionsCsvPath = path.join(databaseDir, "worked_model_mentions_from_immigration.csv");
const candidatesCsvPath = path.join(databaseDir, "worked_models_candidates.csv");
const reportJsonPath = path.join(databaseDir, "worked_models_candidates.report.json");
const overridesCsvPath = path.join(databaseDir, "model_code_overrides.csv");
const LINE_ONLY = process.env.AIRTABLE_EXTRACT_LINE_ONLY !== "false";
const DENYLIST_ALIAS_KEYS = new Set([
  "bank",
  "black",
  "boss",
  "craft",
  "drive",
  "frame",
  "jack",
  "master",
  "ming",
]);
const DENYLIST_TEXT_PATTERNS = [
  /\bblack\s+card\b/i,
  /\bbank\s+เดียว\b/i,
  /\bbank\b.*\bbank\b.*\bเดียว\b/i,
  /\bที่ไทย\s+bank\b/i,
  /\bgoogle\s+drive\b/i,
  /\bdrive\.google\.com\b/i,
  /\bcraftman\b/i,
  /\bjacklue/i,
  /\bformost\b/i,
  /\froming\b/i,
];

function toStr(value) {
  return String(value ?? "").trim();
}

function normalizeLooseToken(value) {
  return toStr(value)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9ก-๙]+/g, "");
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isStructuredSystemNote(value) {
  const lower = toStr(value).toLowerCase();
  if (!lower) return false;
  return [
    "renewal_page_submission",
    "renewal_web_intake",
    "payment_method:",
    "bank_transfer",
    "page:/pay/",
    "requested_path:",
    "proof_attached:",
    "telegram:",
    "compact redesign",
    "http://",
    "https://",
    "drive.google.com/",
    "google drive",
  ].some((token) => lower.includes(token));
}

function hitsDenylistedText(raw) {
  return DENYLIST_TEXT_PATTERNS.some((pattern) => pattern.test(raw));
}

function looksLikeLineInboxRecord(fields, payloadJson, immigrationId) {
  const candidateIds = [
    immigrationId,
    toStr(payloadJson.migration_id),
    toStr(payloadJson.immigration_id),
    toStr(fields.inbox_id),
  ].filter(Boolean);
  return candidateIds.some((value) => String(value).startsWith("line_"));
}

function shouldKeepAlias(label, source, model) {
  const key = normalizeLooseToken(label);
  if (!label || !key) return false;
  if (key.length < 3 && !/[0-9]/.test(key)) return false;
  if (source === "model_id") return true;
  if (/[0-9]/.test(key)) return true;
  if (/\s/.test(label)) return true;
  if (key.length >= 5) return true;
  if (model.source === "catalog" && key.length >= 3) return true;
  if (model.source === "local_models" && key.length >= 4) return true;
  return false;
}

function hasRawBoundaryMatch(raw, alias) {
  const pattern = new RegExp(`(^|[^A-Za-z0-9_])${escapeRegex(alias)}(?=$|[^A-Za-z0-9_])`, "i");
  return pattern.test(raw);
}

function shouldAllowNormalizedMatch(entry) {
  if (entry.source === "model_id" || entry.source === "code_override") return true;
  if (/[0-9]/.test(entry.alias)) return true;
  if (/[-_\s]/.test(entry.alias)) return true;
  return entry.alias_key.length >= 6;
}

function shouldRejectMatch(raw, entry, mode) {
  const lowerRaw = raw.toLowerCase();
  if (entry.alias_key === "bank" && lowerRaw.includes("ที่ไทย") && lowerRaw.includes("เดียว")) return true;
  if (DENYLIST_ALIAS_KEYS.has(entry.alias_key) && hitsDenylistedText(raw)) return true;
  if (mode === "normalized_substring" && !/[0-9]/.test(entry.alias) && entry.alias_key.length < 5) return true;
  if (mode === "raw_boundary" && entry.alias_key.length <= 4 && hitsDenylistedText(raw)) return true;
  return false;
}

function csvEscape(value) {
  const raw = String(value ?? "");
  if (raw.includes(",") || raw.includes('"') || raw.includes("\n")) {
    return `"${raw.replace(/"/g, '""')}"`;
  }
  return raw;
}

function toCsv(columns, rows) {
  return [
    columns.join(","),
    ...rows.map((row) => columns.map((column) => csvEscape(row[column])).join(",")),
  ].join("\n") + "\n";
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];
    if (char === '"') {
      if (inQuotes && next === '"') {
        field += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (char === "," && !inQuotes) {
      row.push(field);
      field = "";
      continue;
    }
    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(field);
      field = "";
      if (row.some((value) => value.length > 0)) rows.push(row);
      row = [];
      continue;
    }
    field += char;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    if (row.some((value) => value.length > 0)) rows.push(row);
  }
  const [header = [], ...body] = rows;
  return body.map((values) =>
    Object.fromEntries(header.map((key, index) => [key, values[index] ?? ""]))
  );
}

function readCsv(filePath) {
  if (!fs.existsSync(filePath)) return [];
  return parseCsv(fs.readFileSync(filePath, "utf8"));
}

function parsePayloadJson(value) {
  const raw = toStr(value);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function buildAliasEntries() {
  const entries = [];
  for (const model of MODEL_MANIFEST) {
    const pushAlias = (alias, source, weight) => {
      const label = toStr(alias);
      const key = normalizeLooseToken(label);
      if (!shouldKeepAlias(label, source, model)) return;
      entries.push({
        alias: label,
        alias_key: key,
        source,
        weight,
        model,
      });
    };

    pushAlias(model.working_name, "working_name", 120);
    pushAlias(model.nickname, "nickname", 110);
    pushAlias(model.folder_name, "folder_name", 115);
    pushAlias(model.folder_slug, "folder_slug", 90);
    pushAlias(model.username, "username", 80);
    pushAlias(model.vanity_slug, "vanity_slug", 75);
    pushAlias(model.model_id, "model_id", 70);
  }

  const overrides = readCsv(overridesCsvPath);
  for (const row of overrides) {
    const code = toStr(row.code);
    const workingName = toStr(row.working_name);
    if (!code) continue;
    const model = MODEL_MANIFEST.find((entry) =>
      normalizeLooseToken(entry.working_name) === normalizeLooseToken(workingName) ||
      normalizeLooseToken(entry.folder_name) === normalizeLooseToken(workingName)
    );
    if (!model) continue;
    entries.push({
      alias: code,
      alias_key: normalizeLooseToken(code),
      source: "code_override",
      weight: 140,
      model,
    });
  }

  const deduped = new Map();
  for (const entry of entries) {
    const dedupeKey = `${entry.model.model_id}::${entry.alias_key}::${entry.source}`;
    if (!deduped.has(dedupeKey)) deduped.set(dedupeKey, entry);
  }
  return [...deduped.values()];
}

function detectMatches(text, aliasEntries) {
  const raw = toStr(text);
  const normalized = normalizeLooseToken(raw);
  if (!raw || !normalized) return [];

  const matches = [];
  for (const entry of aliasEntries) {
    let mode = "";
    let score = 0;
    if (hasRawBoundaryMatch(raw, entry.alias)) {
      mode = "raw_boundary";
      score = entry.weight + Math.min(entry.alias.length, 24) + 6;
    } else if (entry.alias_key && shouldAllowNormalizedMatch(entry) && normalized.includes(entry.alias_key)) {
      mode = "normalized_substring";
      score = entry.weight - 8 + Math.min(entry.alias_key.length, 20);
    }
    if (!mode) continue;
    if (shouldRejectMatch(raw, entry, mode)) continue;
    matches.push({
      ...entry,
      match_mode: mode,
      matched_label_value: entry.alias,
      score,
    });
  }

  matches.sort((a, b) => b.score - a.score || b.alias.length - a.alias.length);
  const bestByModel = new Map();
  for (const match of matches) {
    if (!bestByModel.has(match.model.model_id)) bestByModel.set(match.model.model_id, match);
  }
  return [...bestByModel.values()].sort((a, b) => b.score - a.score);
}

async function fetchConsoleInboxRecords() {
  if (!AIRTABLE_API_KEY) {
    throw new Error("missing AIRTABLE_API_KEY");
  }

  const records = [];
  let offset = "";
  do {
    const url = new URL(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${CONSOLE_INBOX_TABLE_ID}`);
    url.searchParams.set("pageSize", "100");
    if (offset) url.searchParams.set("offset", offset);
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` },
    });
    if (!response.ok) {
      throw new Error(`airtable_fetch_failed_${response.status}:${await response.text()}`);
    }
    const payload = await response.json();
    records.push(...(payload.records || []));
    offset = payload.offset || "";
  } while (offset);

  return records;
}

function summarizeCandidates(mentionRows) {
  const buckets = new Map();
  for (const row of mentionRows) {
    const key = row.matched_model_id;
    if (!key) continue;
    const current = buckets.get(key) || {
      matched_working_name: row.matched_working_name,
      matched_model_id: row.matched_model_id,
      matched_model_key: row.matched_model_key,
      folder_name: row.folder_name,
      local_primary_collection: row.local_primary_collection,
      local_primary_path: row.local_primary_path,
      evidence_count: 0,
      mention_count: 0,
      latest_received_at: "",
      latest_migration_id: "",
      source_channels: new Set(),
      parsed_names: new Set(),
      sample_notes: [],
    };
    current.evidence_count += 1;
    current.mention_count += 1;
    if (!current.latest_received_at || row.received_at > current.latest_received_at) {
      current.latest_received_at = row.received_at;
      current.latest_migration_id = row.immigration_id;
    }
    if (row.matched_source) current.source_channels.add(row.matched_source);
    if (row.parsed_name) current.parsed_names.add(row.parsed_name);
    if (row.raw_text && current.sample_notes.length < 3) current.sample_notes.push(row.raw_text);
    buckets.set(key, current);
  }

  return [...buckets.values()]
    .map((item) => ({
      ...item,
      source_channels: [...item.source_channels].join("|"),
      parsed_names: [...item.parsed_names].join("|"),
      sample_notes: item.sample_notes.join(" || "),
    }))
    .sort((a, b) => b.evidence_count - a.evidence_count || a.matched_working_name.localeCompare(b.matched_working_name));
}

const aliasEntries = buildAliasEntries();
const records = await fetchConsoleInboxRecords();
const mentionRows = [];
let scannedRecordCount = 0;

for (const record of records) {
  const fields = record.fields || {};
  const payloadJson = parsePayloadJson(fields.payload_json);
  const rawText = toStr(payloadJson.raw_text || fields.admin_note);
  const immigrationId = toStr(payloadJson.migration_id || payloadJson.immigration_id || fields.inbox_id || record.id);
  if (!rawText) continue;
  if (LINE_ONLY && !looksLikeLineInboxRecord(fields, payloadJson, immigrationId)) continue;
  if (isStructuredSystemNote(rawText)) continue;
  scannedRecordCount += 1;

  const matches = detectMatches(rawText, aliasEntries);
  if (!matches.length) continue;
  const top = matches[0];
  const model = top.model;

  mentionRows.push({
    immigration_id: immigrationId,
    received_at: toStr(payloadJson.received_at || fields.created_at || record.createdTime),
    migration_status: toStr(payloadJson.migration_status || "synced_to_airtable"),
    parsed_name: toStr(payloadJson.parsed_name),
    parsed_intent: toStr(payloadJson.parsed_intent || fields.intent),
    source_user_id: toStr(payloadJson.source_user_id || fields.line_user_id),
    source_message_id: toStr(payloadJson.source_message_id || fields.line_id),
    matched_working_name: toStr(model.working_name),
    matched_model_id: toStr(model.model_id),
    matched_model_key: toStr(model.folder_slug || model.username || model.model_id),
    matched_alias: toStr(top.alias),
    matched_source: toStr(top.source),
    match_mode: toStr(top.match_mode),
    matched_label_value: toStr(top.matched_label_value),
    matched_rank: "1",
    matched_score: String(top.score),
    local_primary_collection: toStr(model.local_primary_collection),
    local_primary_path: toStr(model.local_primary_path),
    folder_name: toStr(model.folder_name),
    raw_text: rawText,
  });
}

const candidateRows = summarizeCandidates(mentionRows);

const mentionColumns = [
  "immigration_id",
  "received_at",
  "migration_status",
  "parsed_name",
  "parsed_intent",
  "source_user_id",
  "source_message_id",
  "matched_working_name",
  "matched_model_id",
  "matched_model_key",
  "matched_alias",
  "matched_source",
  "match_mode",
  "matched_label_value",
  "matched_rank",
  "matched_score",
  "local_primary_collection",
  "local_primary_path",
  "folder_name",
  "raw_text",
];

const candidateColumns = [
  "matched_working_name",
  "matched_model_id",
  "matched_model_key",
  "folder_name",
  "local_primary_collection",
  "local_primary_path",
  "evidence_count",
  "mention_count",
  "latest_received_at",
  "latest_migration_id",
  "source_channels",
  "parsed_names",
  "sample_notes",
];

fs.writeFileSync(mentionsCsvPath, toCsv(mentionColumns, mentionRows), "utf8");
fs.writeFileSync(candidatesCsvPath, toCsv(candidateColumns, candidateRows), "utf8");
fs.writeFileSync(
  reportJsonPath,
  JSON.stringify(
    {
      generated_at: new Date().toISOString(),
      airtable_table: "MMD — Console Inbox",
      code_override_count: readCsv(overridesCsvPath).length,
      line_inbox_record_count: records.length,
      scanned_record_count: scannedRecordCount,
      line_only: LINE_ONLY,
      alias_key_count: aliasEntries.length,
      mention_row_count: mentionRows.length,
      worked_model_count: candidateRows.length,
      top_models: candidateRows.slice(0, 10).map((row) => ({
        matched_working_name: row.matched_working_name,
        matched_model_id: row.matched_model_id,
        evidence_count: row.evidence_count,
      })),
    },
    null,
    2
  ),
  "utf8"
);

console.log(
  JSON.stringify(
    {
      ok: true,
      mention_row_count: mentionRows.length,
      worked_model_count: candidateRows.length,
      alias_key_count: aliasEntries.length,
    },
    null,
    2
  )
);
