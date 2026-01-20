import { buildCors, corsHeaders } from "../lib/cors.js";
import { json, safeJson, HttpError } from "../lib/http.js";
import { str, normalizeTier, normalizeStatus, toISODate } from "../lib/util.js";
import { requireConfirmKey } from "../lib/guard.js";
import {
  dtFindMember,
  dtGetRecordById,
  dtUpdateRecord,
  dtListPackages,
  dtMetrics,
} from "../lib/memberstack_dt.js";

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const path = url.pathname;

    const origin = req.headers.get("Origin") || "";
    const cors = buildCors(origin, env.ALLOWED_ORIGINS);

    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(cors) });
    }

    if (origin && !cors.allowOrigin) {
      return json({ ok: false, error: "origin_not_allowed" }, 403, corsHeaders(cors));
    }

    try {
      if (req.method === "GET" && (path === "/" || path === "/health")) {
        return json({ ok: true, lock: "v2026-LOCK-01i", worker: "admin" }, 200, corsHeaders(cors));
      }

      if (!path.startsWith("/v1/admin/")) {
        return json({ ok: false, error: "not_found" }, 404, corsHeaders(cors));
      }

      requireConfirmKey(req, env);

      // GET /v1/admin/member?email=... OR ?memberstack_id=...
      if (path === "/v1/admin/member" && req.method === "GET") {
        const email = str(url.searchParams.get("email") || "").toLowerCase();
        const msid = str(url.searchParams.get("memberstack_id") || "");
        if (!email && !msid) return json({ ok: false, error: "missing_query" }, 400, corsHeaders(cors));

        const member = await dtFindMember({ email, memberstack_id: msid }, env);
        return json({ ok: true, member }, 200, corsHeaders(cors));
      }

      // POST /v1/admin/member/update
      if (path === "/v1/admin/member/update" && req.method === "POST") {
        const body = await safeJson(req);
        if (!body) return json({ ok: false, error: "invalid_json" }, 400, corsHeaders(cors));
        const out = await handleAdminMemberUpdate(body, env);
        return json({ ok: true, ...out }, 200, corsHeaders(cors));
      }

      // GET /v1/admin/packages?active=true|false
      if (path === "/v1/admin/packages" && req.method === "GET") {
        const q = str(url.searchParams.get("active") || "true").toLowerCase();
        const active = q === "1" || q === "true" || q === "yes";
        const items = await dtListPackages({ active }, env);
        return json({ ok: true, packages: items }, 200, corsHeaders(cors));
      }

      // GET /v1/admin/metrics
      if (path === "/v1/admin/metrics" && req.method === "GET") {
        const metrics = await dtMetrics(env);
        return json({ ok: true, metrics }, 200, corsHeaders(cors));
      }

      return json({ ok: false, error: "not_found" }, 404, corsHeaders(cors));
    } catch (err) {
      if (err instanceof HttpError) return json(err.body, err.status, corsHeaders(cors));
      return json({ ok: false, error: "server_error", detail: String(err?.message || err) }, 500, corsHeaders(cors));
    }
  },
};

async function handleAdminMemberUpdate(body, env) {
  const recordId = str(body.record_id || "");
  const email = str(body.email || "").toLowerCase();
  const msid = str(body.memberstack_id || "");
  const patchIn = body.patch && typeof body.patch === "object" ? body.patch : null;
  if (!patchIn) throw new HttpError(400, { ok: false, error: "missing_patch" });

  let existing = null;
  if (recordId) existing = await dtGetRecordById(recordId, env);
  else if (msid || email) existing = await dtFindMember({ email, memberstack_id: msid }, env);
  else throw new HttpError(400, { ok: false, error: "missing_identifier" });

  if (!existing?.id) throw new HttpError(404, { ok: false, error: "member_not_found" });

  const allowed = new Set([
    "tier",
    "status",
    "source",
    "telegram_id",
    "notes_internal",
    "expire_at",
    "last_payment_at",
    "nickname",
  ]);

  const patch = {};
  for (const [k, v] of Object.entries(patchIn)) {
    if (!allowed.has(k)) continue;

    if (k === "tier") patch.tier = normalizeTier(v);
    else if (k === "expire_at" || k === "last_payment_at") patch[k] = toISODate(v);
    else if (k === "status") patch.status = normalizeStatus(v);
    else patch[k] = str(v);
  }

  if (!Object.keys(patch).length) throw new HttpError(400, { ok: false, error: "no_allowed_fields" });

  const saved = await dtUpdateRecord(existing.id, patch, env);
  return { record_id: existing.id, updated: patch, record: saved };
}
