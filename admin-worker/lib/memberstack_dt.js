import { str } from "./util.js";

const DT_BASE = "https://admin.memberstack.com";

export function membersTableId(env) {
  return str(env.MEMBERS_TABLE_ID || "tbl_cmjals5ud001e0svfhuamh6kn");
}
export function packagesTableId(env) {
  return str(env.PACKAGES_TABLE_ID || "tbl_cmjaltwge001q0tvdefxianf1");
}
export function memberPackagesTableId(env) {
  return str(env.MEMBER_PACKAGES_TABLE_ID || "tbl_cmjalu8k5001r0tvd456cdexr");
}

export async function dtFetch(env, path, { method = "GET", body } = {}) {
  if (!env.MEMBERSTACK_API_KEY) throw new Error("missing_env_MEMBERSTACK_API_KEY");

  const res = await fetch(DT_BASE + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-API-KEY": env.MEMBERSTACK_API_KEY,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const txt = await res.text();
  let data = null;
  try { data = JSON.parse(txt); } catch { data = { raw: txt }; }
  if (!res.ok) throw new Error(`memberstack_dt_error_${res.status}: ${txt}`);
  return data;
}

function memberPayload(data) {
  const input = data && typeof data === "object" ? data : {};
  const email = str(input.email).toLowerCase();
  const password = str(input.password);
  const customFields = {
    ...(input.customFields && typeof input.customFields === "object" ? input.customFields : {}),
  };

  for (const [key, value] of Object.entries(input)) {
    if (["email", "password", "plans", "customFields", "metaData", "json", "loginRedirect"].includes(key)) continue;
    if (value == null) continue;
    if (typeof value === "string" && !value.trim()) continue;
    customFields[key] = value;
  }

  return {
    email,
    ...(password ? { password } : {}),
    ...(Array.isArray(input.plans) && input.plans.length ? { plans: input.plans } : {}),
    ...(Object.keys(customFields).length ? { customFields } : {}),
    ...(input.metaData && typeof input.metaData === "object" ? { metaData: input.metaData } : {}),
    ...(input.json && typeof input.json === "object" ? { json: input.json } : {}),
    ...(str(input.loginRedirect) ? { loginRedirect: str(input.loginRedirect) } : {}),
  };
}

function memberResult(out) {
  if (out && typeof out === "object" && "data" in out) {
    return out.data || null;
  }
  return out?.member || out || null;
}

export async function dtQuery(env, tableId, findMany) {
  return dtFetch(env, "/v1/data-records/query", {
    method: "POST",
    body: { table: tableId, query: { findMany } },
  });
}

export async function dtGetRecordById(recordId, env) {
  const out = await dtFetch(env, `/members/${encodeURIComponent(recordId)}`, { method: "GET" });
  return memberResult(out);
}

export async function dtCreateRecord(env, tableId, data) {
  void tableId;
  const out = await dtFetch(env, "/members", {
    method: "POST",
    body: memberPayload(data),
  });
  return memberResult(out);
}

export async function dtUpdateRecord(recordId, data, env) {
  const out = await dtFetch(env, `/members/${encodeURIComponent(recordId)}`, {
    method: "PATCH",
    body: memberPayload(data),
  });
  return memberResult(out);
}

export async function dtFindMember({ email, memberstack_id }, env) {
  const key = str(memberstack_id || email).toLowerCase();
  if (!key) return null;

  try {
    const out = await dtFetch(env, `/members/${encodeURIComponent(key)}`, { method: "GET" });
    return memberResult(out);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error || "");
    if (message.includes("memberstack_dt_error_404")) return null;
    throw error;
  }
}

export async function dtFindPackageByCodeOrTier(codeOrTier, env) {
  const table = packagesTableId(env);

  let out = await dtQuery(env, table, { where: { code: { equals: codeOrTier } }, take: 1 });
  let rec = out?.data?.records?.[0] || null;
  if (rec) return rec;

  out = await dtQuery(env, table, { where: { tier: { equals: codeOrTier } }, take: 1 });
  rec = out?.data?.records?.[0] || null;
  return rec;
}

export async function dtListPackages({ active }, env) {
  const table = packagesTableId(env);
  const where = active ? { is_active: { equals: true } } : undefined;

  const out = await dtQuery(env, table, {
    where,
    take: 200,
    orderBy: [{ priority_level: "asc" }],
  });

  return out?.data?.records || [];
}

export async function dtMetrics(env) {
  const pkgs = await dtListPackages({ active: true }, env);

  const membersOut = await dtQuery(env, membersTableId(env), { take: 2000 });
  const members = membersOut?.data?.records || [];

  const byTier = {};
  const byStatus = {};
  for (const r of members) {
    const d = r?.data || r || {};
    const tier = String(d.tier || "unknown");
    const st = String(d.status || "unknown");
    byTier[tier] = (byTier[tier] || 0) + 1;
    byStatus[st] = (byStatus[st] || 0) + 1;
  }

  return {
    packages_active: pkgs.length,
    members_sampled: members.length,
    members_by_tier: byTier,
    members_by_status: byStatus,
  };
}
