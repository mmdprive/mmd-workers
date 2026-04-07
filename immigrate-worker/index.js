// immigrate-worker/index.js
// MMD Privé — migration layer worker for LINE legacy intake
//
// Position in architecture:
// - migration layer only
// - preserves legacy ambiguity instead of silently redefining core truth
// - writes raw intake trace through admin-worker /v1/admin/console/inbox
// - promotes to canonical member only when no match is found

const AIRTABLE_API = "https://api.airtable.com/v0";

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const path = url.pathname;
    const method = req.method.toUpperCase();
    const cors = corsHeaders(req, env);

    if (method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

    if (method === "GET" && (path === "/ping" || path === "/health")) {
      return withCors(json({ ok: true, worker: "immigrate-worker", layer: "migration", ts: Date.now() }), cors);
    }

    if (method === "POST" && path === "/v1/immigrate/line/preview") {
      const body = await safeJson(req);
      const normalized = normalizeLineLegacy(body);
      return withCors(json({ ok: true, layer: "migration", normalized }), cors);
    }

    if (method === "POST" && path === "/v1/immigrate/line/intake") {
      try {
        const body = await safeJson(req);
        const out = await handleLineIntake(body, env);
        return withCors(json(out, out.ok ? 200 : 400), cors);
      } catch (e) {
        return withCors(json({ ok: false, error: String(e?.message || e || "intake_failed") }, 500), cors);
      }
    }

    return withCors(json({ ok: false, error: "not_found" }, 404), cors);
  },
};

async function handleLineIntake(input, env) {
  const normalized = normalizeLineLegacy(input);
  const inboxPayload = buildInboxPayload(normalized, input);
  const inboxWrite = await postInboxTrace(inboxPayload, env);

  const existing = await findExistingCanonicalMember(normalized.identity, env);
  if (existing) {
    return {
      ok: true,
      layer: "migration",
      action: "linked_to_existing_member",
      inbox_record_id: inboxWrite?.record_id || null,
      member: existing,
      inferred: normalized.inferred,
    };
  }

  const created = await createCanonicalMember(normalized, env);
  return {
    ok: true,
    layer: "migration",
    action: "promoted_create_member",
    inbox_record_id: inboxWrite?.record_id || null,
    member: created,
    inferred: normalized.inferred,
  };
}

function normalizeLineLegacy(input) {
  const displayName = str(input.display_name || input.member_name || "");
  const nickname = str(input.nickname || displayName);
  const lineUserId = str(input.line_user_id || "");
  const lineId = str(input.line_id || "");
  const memberEmail = str(input.member_email || input.email || "");
  const memberPhone = str(input.member_phone || input.phone || "");
  const manualNote = str(input.manual_note || input.admin_note || "");
  const operatorSummary = str(input.operator_summary || "");

  const legacyTags = parseLegacyTags(input.legacy_tags || input.tags || "");
  const flags = inferFlags(legacyTags, nickname);
  const memberSince = inferMembershipStart(nickname, legacyTags);
  const baseMembership = inferBaseMembership(nickname, legacyTags, flags);
  const badgeTier = inferBadgeTier(nickname, legacyTags);

  return {
    source_channel: "line",
    layer: "migration",
    identity: {
      display_name: displayName,
      nickname,
      member_email: memberEmail,
      member_phone: memberPhone,
      line_user_id: lineUserId,
      line_id: lineId,
    },
    inferred: {
      base_membership: baseMembership.value,
      base_membership_source: baseMembership.source,
      badge_tier: badgeTier.value,
      badge_tier_source: badgeTier.source,
      member_since: memberSince.normalized,
      member_since_precision: memberSince.precision,
      client_flag: flags.client_flag,
      purchased_flag: flags.purchased_flag,
      has_membership_marker: flags.has_membership_marker,
    },
    notes: {
      manual_note: manualNote,
      operator_summary:
        operatorSummary ||
        buildOperatorSummary({
          nickname,
          baseMembership: baseMembership.value,
          badgeTier: badgeTier.value,
          memberSince: memberSince.normalized,
          flags,
        }),
    },
    legacy: {
      legacy_tags: legacyTags,
      raw_membership_marker: memberSince.raw,
    },
    raw: input,
  };
}

function buildInboxPayload(normalized, rawInput) {
  return {
    source: "line_official",
    intent: str(rawInput.intent || "immigration_intake"),
    member_name: normalized.identity.display_name || normalized.identity.nickname || "",
    member_email: normalized.identity.member_email || "",
    member_phone: normalized.identity.member_phone || "",
    line_user_id: normalized.identity.line_user_id || "",
    line_id: normalized.identity.line_id || "",
    legacy_tags: normalized.legacy.legacy_tags.join(","),
    admin_note: [
      normalized.notes.manual_note || "",
      normalized.notes.operator_summary || "",
      normalized.inferred.base_membership ? `inferred_base=${normalized.inferred.base_membership}` : "",
      normalized.inferred.badge_tier ? `inferred_badge=${normalized.inferred.badge_tier}` : "",
      normalized.inferred.member_since ? `inferred_member_since=${normalized.inferred.member_since}` : "",
    ].filter(Boolean).join(" | "),
    status: "new",
    payload_json: { normalized, raw: rawInput },
  };
}

async function postInboxTrace(payload, env) {
  const base = str(env.ADMIN_WORKER_BASE_URL).replace(/\/+$/, "");
  const key = str(env.CONFIRM_KEY);

  if (!base) throw new Error("missing_ADMIN_WORKER_BASE_URL");
  if (!key) throw new Error("missing_CONFIRM_KEY");

  const res = await fetch(`${base}/v1/admin/console/inbox`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Confirm-Key": key,
    },
    body: JSON.stringify(payload),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `admin_worker_http_${res.status}`);
  return data;
}

async function findExistingCanonicalMember(identity, env) {
  const tableName = str(env.CANONICAL_MEMBER_TABLE || env.AIRTABLE_TABLE_MEMBERS || "members");
  const clauses = [];

  if (identity.line_user_id) clauses.push(`{${str(env.CANONICAL_LINE_USER_ID_FIELD || "line_user_id")}}=${formulaString(identity.line_user_id)}`);
  if (identity.line_id) clauses.push(`{${str(env.CANONICAL_LINE_ID_FIELD || "line_id")}}=${formulaString(identity.line_id)}`);
  if (identity.member_email) clauses.push(`{${str(env.CANONICAL_EMAIL_FIELD || "email")}}=${formulaString(identity.member_email)}`);
  if (identity.member_phone) clauses.push(`{${str(env.CANONICAL_PHONE_FIELD || "phone")}}=${formulaString(identity.member_phone)}`);

  if (!clauses.length) return null;

  const filterByFormula = clauses.length === 1 ? clauses[0] : `OR(${clauses.join(",")})`;
  const rec = await airtableFindOne(env, tableName, filterByFormula);
  if (!rec) return null;
  return { id: rec.id, fields: rec.fields || {} };
}

async function createCanonicalMember(normalized, env) {
  const tableName = str(env.CANONICAL_MEMBER_TABLE || env.AIRTABLE_TABLE_MEMBERS || "members");
  const fields = {};

  fields[str(env.CANONICAL_NAME_FIELD || "name")] = normalized.identity.display_name || normalized.identity.nickname || "";
  fields[str(env.CANONICAL_NICKNAME_FIELD || "nickname")] = normalized.identity.nickname || "";
  fields[str(env.CANONICAL_CLIENT_NAME_FIELD || "mmd_client_name")] = normalized.identity.nickname || normalized.identity.display_name || "";
  fields[str(env.CANONICAL_LINE_ID_FIELD || "line_id")] = normalized.identity.line_id || "";
  fields[str(env.CANONICAL_LINE_USER_ID_FIELD || "line_user_id")] = normalized.identity.line_user_id || "";
  fields[str(env.CANONICAL_EMAIL_FIELD || "email")] = normalized.identity.member_email || "";
  fields[str(env.CANONICAL_PHONE_FIELD || "phone")] = normalized.identity.member_phone || "";
  fields[str(env.CANONICAL_LEGACY_TAGS_FIELD || "legacy_tags")] = normalized.legacy.legacy_tags.join(",");
  fields[str(env.CANONICAL_NOTES_FIELD || "notes")] = [normalized.notes.manual_note, normalized.notes.operator_summary].filter(Boolean).join("\n");
  fields[str(env.CANONICAL_STATUS_FIELD || "status")] = str(env.CANONICAL_DEFAULT_STATUS || "active");

  if (normalized.inferred.base_membership) {
    fields[str(env.CANONICAL_BASE_MEMBERSHIP_FIELD || "base_membership")] = normalized.inferred.base_membership;
  }
  if (normalized.inferred.badge_tier) {
    fields[str(env.CANONICAL_BADGE_TIER_FIELD || "badge_tier")] = normalized.inferred.badge_tier;
  }
  if (normalized.inferred.member_since) {
    fields[str(env.CANONICAL_MEMBER_SINCE_FIELD || "member_since")] = normalized.inferred.member_since;
  }

  const rec = await airtableCreateRecord(env, tableName, fields);
  return { id: rec?.id || null, fields: rec?.fields || {} };
}

function parseLegacyTags(value) {
  if (Array.isArray(value)) return value.map((v) => str(v)).filter(Boolean);
  return String(value || "").split(/[,\n|]/g).map((v) => v.trim()).filter(Boolean);
}

function inferFlags(legacyTags, nickname) {
  const tags = legacyTags.map((t) => t.toLowerCase());
  const nick = String(nickname || "").toLowerCase();
  return {
    client_flag: tags.includes("#client"),
    purchased_flag: tags.includes("#purchased"),
    has_membership_marker: tags.some((t) => /^#mem/i.test(t)) || nick.includes("#mem"),
  };
}

function inferBaseMembership(nickname, legacyTags, flags) {
  const nick = String(nickname || "").toLowerCase();
  const tags = legacyTags.map((t) => t.toLowerCase());
  if (nick.includes("lite")) return { value: "standard", source: "nickname_lite" };
  if (flags.has_membership_marker || flags.client_flag || flags.purchased_flag || tags.includes("#client") || tags.includes("#purchased")) {
    return { value: "premium", source: "legacy_member_without_lite" };
  }
  return { value: null, source: "unknown" };
}

function inferBadgeTier(nickname, legacyTags) {
  const nick = String(nickname || "").toLowerCase();
  const tags = legacyTags.map((t) => t.toLowerCase());
  if (nick.includes("-svip-") || tags.includes("-svip-") || tags.includes("svip")) {
    return { value: "svip", source: "legacy_svip" };
  }
  if (nick.includes("-vip-") || tags.includes("-vip-") || tags.includes("vip")) {
    return { value: "vip", source: "legacy_vip" };
  }
  return { value: null, source: "none" };
}

function inferMembershipStart(nickname, legacyTags) {
  const s = `${nickname || ""} ${legacyTags.join(" ")}`;

  let m = s.match(/#mem(\d{4})/i);
  if (m) return { raw: m[0], normalized: `${m[1]}-01-01`, precision: "year" };

  m = s.match(/#mem([A-Za-z]{3})(\d{2})/i);
  if (m) {
    const monMap = { jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06", jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12" };
    const mm = monMap[(m[1] || "").toLowerCase()];
    if (mm) return { raw: m[0], normalized: `20${m[2]}-${mm}-01`, precision: "month" };
  }

  m = s.match(/#mem(\d{2})(?!\d)/i);
  if (m) return { raw: m[0], normalized: `20${m[1]}-01-01`, precision: "year" };

  return { raw: "", normalized: null, precision: null };
}

function buildOperatorSummary({ nickname, baseMembership, badgeTier, memberSince, flags }) {
  return [
    nickname ? `nickname=${nickname}` : "",
    baseMembership ? `base=${baseMembership}` : "",
    badgeTier ? `badge=${badgeTier}` : "",
    memberSince ? `member_since=${memberSince}` : "",
    flags.client_flag ? "flag=#client" : "",
    flags.purchased_flag ? "flag=#purchased" : "",
  ].filter(Boolean).join(" | ");
}

async function airtableFetch(env, path, init) {
  if (!env.AIRTABLE_API_KEY || !env.AIRTABLE_BASE_ID) throw new Error("missing_airtable_env");

  const res = await fetch(`${AIRTABLE_API}/${env.AIRTABLE_BASE_ID}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${env.AIRTABLE_API_KEY}`,
      ...(init?.headers || {}),
    },
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error?.message || `airtable_http_${res.status}`);
  return data;
}

async function airtableFindOne(env, tableName, filterByFormula) {
  const params = new URLSearchParams();
  params.set("pageSize", "1");
  params.set("filterByFormula", filterByFormula);

  const data = await airtableFetch(env, `/${encodeURIComponent(tableName)}?${params.toString()}`, { method: "GET" });
  const rec = data?.records?.[0];
  if (!rec) return null;
  return { id: rec.id, fields: rec.fields || {} };
}

async function airtableCreateRecord(env, tableName, fields) {
  const data = await airtableFetch(env, `/${encodeURIComponent(tableName)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ records: [{ fields }], typecast: true }),
  });
  return data?.records?.[0] || null;
}

function formulaString(v) {
  return `"${String(v || "").replace(/"/g, '\\"')}"`;
}

function str(v) {
  return String(v || "").trim();
}

async function safeJson(req) {
  try {
    return await req.json();
  } catch (_) {
    return {};
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function corsHeaders(req, env) {
  const origin = req.headers.get("Origin") || "";
  const allow = String(env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
  const h = new Headers();

  if (!origin) {
    // server-to-server
  } else if (allow.length === 0 || allow.includes(origin)) {
    h.set("Access-Control-Allow-Origin", origin);
    h.set("Vary", "Origin");
  }

  h.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  h.set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Confirm-Key");
  h.set("Access-Control-Max-Age", "86400");
  h.set("Content-Type", "application/json");
  return h;
}

function withCors(res, cors) {
  const headers = new Headers(res.headers);
  cors.forEach((v, k) => headers.set(k, v));
  return new Response(res.body, { status: res.status, headers });
}
