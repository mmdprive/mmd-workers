import { buildSummary } from "./lib/summary.js";

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const path = url.pathname;
    const method = req.method.toUpperCase();

    if (method === "OPTIONS") {
      return corsPreflight(req, env);
    }

    if (method === "GET" && path === "/ping") {
      return withCors(
        req,
        env,
        jsonResponse({
          ok: true,
          worker: "summary-worker",
          ts: Date.now(),
        })
      );
    }

    if (method === "GET" && path === "/pay/summary") {
      return handlePaySummary(req, env);
    }

    if (method === "GET" && path === "/v1/admin/member/summary") {
      if (!isAuthed(req, env)) {
        return withCors(
          req,
          env,
          jsonResponse(
            {
              ok: false,
              error: { code: "unauthorized", message: "Unauthorized" },
            },
            401
          )
        );
      }

      const t = toStr(url.searchParams.get("t"));
      if (!t) {
        return withCors(
          req,
          env,
          jsonResponse(
            {
              ok: false,
              error: { code: "missing_token", message: "Missing token" },
            },
            400
          )
        );
      }

      try {
        const tokenPayload = await readTokenFromKV(env, t);
        if (!tokenPayload) {
          return withCors(
            req,
            env,
            jsonResponse(
              {
                ok: false,
                error: { code: "invalid_token", message: "Invalid or expired token" },
              },
              401
            )
          );
        }

        const result = await buildSummary(env, tokenPayload, "internal");
        return withCors(req, env, jsonResponse(result));
      } catch (err) {
        return withCors(
          req,
          env,
          jsonResponse(
            {
              ok: false,
              error: {
                code: "internal_summary_failed",
                message: String(err?.message || err || "internal_summary_failed"),
              },
            },
            500
          )
        );
      }
    }

    return withCors(
      req,
      env,
      jsonResponse(
        {
          ok: false,
          error: { code: "not_found", message: "Not found" },
        },
        404
      )
    );
  },
};

async function handlePaySummary(req, env) {
  const url = new URL(req.url);
  const t = toStr(url.searchParams.get("t"));

  if (!t) {
    return withCors(
      req,
      env,
      jsonResponse(
        {
          ok: false,
          error: { code: "missing_token", message: "Missing token" },
        },
        400
      )
    );
  }

  try {
    const tokenPayload = await readTokenFromKV(env, t);
    if (!tokenPayload) {
      return withCors(
        req,
        env,
        jsonResponse(
          {
            ok: false,
            error: { code: "invalid_token", message: "Invalid or expired token" },
          },
          401
        )
      );
    }

    const summary = await buildSummary(env, tokenPayload, "public");
    return withCors(req, env, jsonResponse(summary));
  } catch (err) {
    return withCors(
      req,
      env,
      jsonResponse(
        {
          ok: false,
          error: {
            code: "summary_failed",
            message: String(err?.message || err || "summary_failed"),
          },
        },
        500
      )
    );
  }
}

function isAuthed(req, env) {
  const auth = req.headers.get("Authorization") || "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (env.ADMIN_BEARER && bearer && bearer === env.ADMIN_BEARER) return true;

  const ck = (req.headers.get("X-Confirm-Key") || "").trim();
  if (env.CONFIRM_KEY && ck && ck === env.CONFIRM_KEY) return true;

  return false;
}

async function readTokenFromKV(env, token) {
  const kv = env.PAY_SESSIONS_KV || env.PAYMENTS_KV || env.KV;
  if (!kv || !token) return null;

  const parts = String(token).split(".");
  const sig = parts.length === 3 ? parts[2] : null;
  if (!sig) return null;

  const raw = await kv.get(`tok:${sig}`);
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function getAllowedOrigins(env) {
  return new Set(
    String(env.ALLOWED_ORIGINS || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  );
}

function corsHeaders(req, env) {
  const origin = req.headers.get("Origin") || "";
  const allow = getAllowedOrigins(env);
  const h = new Headers();

  if (allow.size > 0 && allow.has(origin)) {
    h.set("Access-Control-Allow-Origin", origin);
    h.set("Vary", "Origin");
  }

  h.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  h.set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Confirm-Key");
  h.set("Access-Control-Max-Age", "86400");
  return h;
}

function corsPreflight(req, env) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(req, env),
  });
}

function withCors(req, env, res) {
  const h = new Headers(res.headers);
  const extra = corsHeaders(req, env);
  extra.forEach((v, k) => h.set(k, v));
  return new Response(res.body, {
    status: res.status,
    headers: h,
  });
}

function jsonResponse(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function toStr(v) {
  return v == null ? "" : String(v);
}