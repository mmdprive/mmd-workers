import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(projectRoot, "..", "..");
const databaseDir = path.join(repoRoot, "Member Data", "database");

const primaryCsvPath = path.join(databaseDir, "mmd_models_airtable_import.csv");
const localModelsCsvPath = path.join(databaseDir, "mmd_models_local_models.csv");
const workedCandidatesCsvPath = path.join(databaseDir, "worked_models_candidates.csv");
const outputPath = path.join(projectRoot, "src", "lib", "model-manifest.generated.js");

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
  return parseCsv(fs.readFileSync(filePath, "utf8"));
}

function toStr(value) {
  return String(value ?? "").trim();
}

function slugToken(value) {
  return toStr(value)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9ก-๙]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");
}

function normalizeLooseToken(value) {
  return toStr(value)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9ก-๙]+/g, "");
}

function hasLetterToken(value) {
  return /[a-zก-๙]/i.test(toStr(value));
}

function jsonBlock(value) {
  return JSON.stringify(value, null, 2);
}

function localIdentityKey(row) {
  return [
    normalizeLooseToken(row.display_name),
    normalizeLooseToken(row.preferred_relative_path),
  ].join("|");
}

function chooseCanonicalLocalRow(current, incoming) {
  if (!current) return incoming;
  const currentKey = toStr(current.model_key);
  const incomingKey = toStr(incoming.model_key);
  if ((incomingKey.length || 999) !== (currentKey.length || 999)) {
    return incomingKey.length < currentKey.length ? incoming : current;
  }
  return incomingKey.localeCompare(currentKey) < 0 ? incoming : current;
}

function aliasIdentityKey(row) {
  return [
    normalizeLooseToken(row.folder_name || row.matched_working_name),
    normalizeLooseToken(row.local_primary_path),
  ].join("|");
}

function chooseCanonicalAlias(current, incoming) {
  if (!current) return incoming;
  const currentId = toStr(current.matched_model_id);
  const incomingId = toStr(incoming.matched_model_id);
  const currentEvidence = Number(toStr(current.evidence_count) || "0") || 0;
  const incomingEvidence = Number(toStr(incoming.evidence_count) || "0") || 0;
  if (incomingEvidence !== currentEvidence) return incomingEvidence > currentEvidence ? incoming : current;
  if ((incomingId.length || 999) !== (currentId.length || 999)) {
    return incomingId.length < currentId.length ? incoming : current;
  }
  return incomingId.localeCompare(currentId) < 0 ? incoming : current;
}

function inferLocalModelTaxonomy({ displayName, modelKey, preferredCollection, preferredRelativePath, collections }) {
  const haystack = [
    toStr(displayName),
    toStr(modelKey),
    toStr(preferredCollection),
    toStr(preferredRelativePath),
    toStr(collections),
  ]
    .join(" | ")
    .toLowerCase();

  const gwsMatch = /\bgws[\s_-]*\d+\b/i.exec(haystack);
  const emsMatch = /\bems[\s_-]*\d+\b/i.exec(haystack);

  if (haystack.includes("mmd exclusive") || gwsMatch || emsMatch) {
    if (gwsMatch) return { family: "exclusive", type: "gws", access: "vip", code: gwsMatch[0] };
    if (emsMatch) return { family: "exclusive", type: "ems", access: "svip", code: emsMatch[0] };
    return { family: "exclusive", type: "other", access: "vip", code: modelKey || displayName };
  }

  if (haystack.includes("mmd public")) {
    if (haystack.includes("extreme")) return { family: "public", type: "extreme", access: "public", code: modelKey || displayName };
    if (haystack.includes("travel")) return { family: "public", type: "travel", access: "public", code: modelKey || displayName };
    return { family: "public", type: "general", access: "public", code: modelKey || displayName };
  }

  if (
    haystack.includes("mmd private") ||
    haystack.includes("mmd standard compcard") ||
    haystack.includes("premium package") ||
    haystack.includes("standard package")
  ) {
    if (haystack.includes("/gay/") || haystack.includes("gay")) {
      return { family: "private", type: "gay", access: "private", code: modelKey || displayName };
    }
    if (haystack.includes("/straight/") || haystack.includes("straight")) {
      return { family: "private", type: "straight", access: "private", code: modelKey || displayName };
    }
    return { family: "private", type: "general", access: "private", code: modelKey || displayName };
  }

  return { family: "misc", type: "general", access: "", code: modelKey || displayName };
}

function buildLocalModelId(taxonomy, displayName, modelKey) {
  const familyMap = {
    public: "pub",
    private: "pri",
    exclusive: "exc",
    misc: "misc",
  };
  const typeMap = {
    travel: "trv",
    extreme: "ext",
    straight: "str",
    gay: "gay",
    gws: "gws",
    ems: "ems",
    general: "gen",
    other: "oth",
  };
  const family = familyMap[taxonomy.family] || "misc";
  const type = typeMap[taxonomy.type] || "gen";
  const base = slugToken(taxonomy.code || modelKey || displayName).slice(0, 40);
  return `mdl_${family}_${type}_${base}`;
}

const primaryRows = readCsv(primaryCsvPath);
const localModelRowsRaw = readCsv(localModelsCsvPath);
const localRowMap = new Map();
for (const row of localModelRowsRaw) {
  const key = localIdentityKey(row);
  if (!key || key === "|") continue;
  localRowMap.set(key, chooseCanonicalLocalRow(localRowMap.get(key), row));
}
const localModelRows = [...localRowMap.values()];
const workedCandidateRowsRaw = fs.existsSync(workedCandidatesCsvPath) ? readCsv(workedCandidatesCsvPath) : [];
const workedCandidateMap = new Map();
for (const row of workedCandidateRowsRaw) {
  const key = aliasIdentityKey(row);
  if (!key || key === "|") continue;
  workedCandidateMap.set(key, chooseCanonicalAlias(workedCandidateMap.get(key), row));
}
const workedCandidateRows = [...workedCandidateMap.values()];

const primaryManifest = primaryRows
  .filter((row) => toStr(row.model_id))
  .map((row) => ({
    model_id: toStr(row.model_id),
    working_name: toStr(row.working_name || row.name),
    nickname: toStr(row.nickname || row["ชื่อเล่น"] || row.working_name || row.name),
    folder_name: toStr(row.folder_name || row.working_name || row.name),
    folder_slug: toStr(row.folder_slug),
    username: toStr(row.username),
    vanity_slug: toStr(row.vanity_slug || row.slug),
    r2_prefix: toStr(row.r2_prefix),
    source: "catalog",
    local_primary_collection: toStr(row.local_primary_collection),
    local_primary_path: toStr(row.local_primary_path),
  }));

const seenPrimary = new Set(
  primaryManifest.flatMap((entry) =>
    [entry.model_id, entry.working_name, entry.nickname, entry.folder_name, entry.folder_slug, entry.username, entry.vanity_slug]
      .map(normalizeLooseToken)
      .filter(Boolean)
  )
);

const localModelMap = new Map();
for (const row of localModelRows) {
  const displayName = toStr(row.display_name);
  const modelKey = toStr(row.model_key);
  const preferredCollection = toStr(row.preferred_collection);
  const preferredRelativePath = toStr(row.preferred_relative_path);
  const collections = toStr(row.collections);
  const assetCount = Number(toStr(row.asset_count) || "0") || 0;
  const key = normalizeLooseToken(modelKey || displayName);
  if (!key || seenPrimary.has(key)) continue;
  if (!hasLetterToken(displayName || modelKey)) continue;
  if (assetCount < 1) continue;
  const taxonomy = inferLocalModelTaxonomy({
    displayName,
    modelKey,
    preferredCollection,
    preferredRelativePath,
    collections,
  });

  const current = localModelMap.get(key) || {
    model_id: buildLocalModelId(taxonomy, displayName, modelKey),
    working_name: displayName || modelKey,
    nickname: displayName || modelKey,
    folder_name: displayName || modelKey,
    folder_slug: slugToken(modelKey || displayName),
    username: "",
    vanity_slug: "",
    r2_prefix: preferredRelativePath ? `local://${preferredRelativePath}` : "",
    source: "local_models",
    asset_count: 0,
    local_primary_collection: preferredCollection,
    local_primary_path: preferredRelativePath,
    model_family: taxonomy.family,
    model_type: taxonomy.type,
    visibility_access: taxonomy.access,
  };
  current.asset_count = Math.max(current.asset_count, assetCount);
  if (!current.local_primary_collection && preferredCollection) current.local_primary_collection = preferredCollection;
  if (!current.local_primary_path && preferredRelativePath) current.local_primary_path = preferredRelativePath;
  localModelMap.set(key, current);
}

const supplementalManifest = [...localModelMap.values()]
  .sort((a, b) => b.asset_count - a.asset_count || a.folder_name.localeCompare(b.folder_name));

const aliasCandidates = workedCandidateRows
  .filter((row) => toStr(row.matched_model_id) && (toStr(row.folder_name) || toStr(row.matched_working_name)))
  .map((row) => ({
    alias: toStr(row.folder_name || row.matched_working_name),
    matched_model_id: toStr(row.matched_model_id),
    matched_working_name: toStr(row.matched_working_name),
    matched_model_key: toStr(row.matched_model_key),
    folder_name: toStr(row.folder_name),
    evidence_count: Number(toStr(row.evidence_count) || "0") || 0,
    mention_count: Number(toStr(row.mention_count) || "0") || 0,
  }));

const output = `// Generated by scripts/generate-model-manifest.mjs
// Source CSVs:
// - ${path.relative(projectRoot, primaryCsvPath)}
// - ${path.relative(projectRoot, localModelsCsvPath)}
// - ${path.relative(projectRoot, workedCandidatesCsvPath)}

export const MODEL_MANIFEST = ${jsonBlock([...primaryManifest, ...supplementalManifest])};

export const MODEL_ALIAS_CANDIDATES = ${jsonBlock(aliasCandidates)};
`;

fs.writeFileSync(outputPath, output, "utf8");

console.log(
  JSON.stringify(
    {
      ok: true,
      output: outputPath,
      primary_count: primaryManifest.length,
      supplemental_count: supplementalManifest.length,
      alias_count: aliasCandidates.length,
    },
    null,
    2
  )
);
