// telegram/src/index.ts
/* =========================================================
   MMD Privé — Worker Root Router (production-safe)

   Routes:
     GET     /ping
     GET/POST /promo/validate
     (fallback) legacy: /bot/notify, /webhooks/paypal, /v1/payments/notify, etc.

   CORS:
     env.ALLOWED_ORIGINS (comma-separated) OR env.ALLOWED_ORIGIN (single)
   ========================================================= */

import { handlePromo } from "./routes/promo";
import legacy from "./worker.legacy";

type Env = {
  ALLOWED_ORIGIN?: string;
  ALLOWED_ORIGINS?: string;
};

function json(data: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(data, null, 2), { ...init, headers });
}

function parseAllowedOrigins(env: Env): string[] {
  const raw = String(env.ALLOWED_ORIGINS || env.ALLOWED_ORIGIN || "").trim();
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function corsHeaders(req: Request, env: Env): Headers {
  const h = new Headers();
  const origin = req.headers.get("origin") || "";
  const allow = parseAllowedOrigins(env);

  // ไม่ตั้ง whitelist = ไม่ reflect origin (ยังเรียก server-to-server ได้ตามปกติ)
  if (origin && allow.includes(origin)) {
    h.set("access-control-allow-origin", origin);
    h.set("vary", "Origin");
  }

  h.set("access-control-allow-methods", "GET,POST,OPTIONS");
  h.set("access-control-allow-headers", "Content-Type, X-MMD-Signature, Authorization");
  h.set("access-control-max-age", "86400");
  return h;
}

function withCors(req: Request, env: Env, res: Response): Response {
  const h = corsHeaders(req, env);
  const out = new Response(res.body, res);
  h.forEach((v, k) => out.headers.set(k, v));
  return out;
}

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);

    // Preflight
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(req, env) });
    }

    // Health
    if (req.method === "GET" && url.pathname === "/ping") {
      return withCors(req, env, json({ ok: true, ping: "OK" }));
    }

    // Promo
    if (url.pathname === "/promo/validate") {
      const res = await handlePromo(req, env as any);
      return withCors(req, env, res);
    }

    // Fallback to legacy routes (bot/paypal/payments/etc.)
    const legacyRes = await legacy.fetch(req, env as any, ctx);
    return withCors(req, env, legacyRes);
  },
};
