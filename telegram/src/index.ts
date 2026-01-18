// telegram/src/index.ts
/* =========================================================
   MMD Privé — Worker Root Router (production-safe)
   - CORS whitelist via env.ALLOWED_ORIGIN or env.ALLOWED_ORIGINS
   - Routes:
       GET  /ping
       GET/POST /promo/validate
       POST /bot/notify
       POST /webhooks/paypal
   ========================================================= */

import { handlePromo } from "./routes/promo";

type Env = {
  ALLOWED_ORIGIN?: string;        // legacy: single or comma-separated
  ALLOWED_ORIGINS?: string;       // preferred: comma-separated
  // your existing secrets/vars (optional typing here)
  PROMO_CODES_JSON?: string;
  PROMOTION_MONTHLY_JSON?: string;
};

function json(data: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(data), { ...init, headers });
}

function parseAllowedOrigins(env: Env): string[] {
  const raw = (env.ALLOWED_ORIGINS || env.ALLOWED_ORIGIN || "").trim();
  if (!raw) return [];
  return raw.split(",").map(s => s.trim()).filter(Boolean);
}

function corsHeaders(req: Request, env: Env): Headers {
  const h = new Headers();
  const origin = req.headers.get("origin") || "";
  const allow = parseAllowedOrigins(env);

  // If no whitelist configured: do NOT reflect arbitrary origins.
  // (Worker is still callable server-to-server without CORS)
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

async function handleNotImplemented(req: Request, env: Env) {
  return withCors(req, env, json({ ok: false, error: "not_implemented" }, { status: 501 }));
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);

    // CORS preflight
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(req, env) });
    }

    // Basic health
    if (req.method === "GET" && url.pathname === "/ping") {
      return withCors(req, env, json({ ok: true, ping: "OK" }));
    }

    // Promo
    if (url.pathname === "/promo/validate") {
      const res = await handlePromo(req, env);
      return withCors(req, env, res);
    }

    // Telegram notify (placeholder: wire your real handler later)
    if (url.pathname === "/bot/notify") {
      return handleNotImplemented(req, env);
    }

    // PayPal webhook (placeholder: wire your real handler later)
    if (url.pathname === "/webhooks/paypal") {
      return handleNotImplemented(req, env);
    }

    return withCors(req, env, json({ ok: false, error: "not_found" }, { status: 404 }));
  },
   // telegram/src/index.ts
import { handlePromo } from "./routes/promo";
import legacy from "./worker.legacy"; // ใช้ fetch() เดิมทั้งหมด

type Env = any;

function json(data: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(data), { ...init, headers });
}

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);

    // (A) health
    if (req.method === "GET" && url.pathname === "/ping") {
      return json({ ok: true, ping: "OK" });
    }

    // (B) promo endpoint (ใหม่)
    if (url.pathname === "/promo/validate") {
      return handlePromo(req, env);
    }

    // (C) fallback ไปใช้ของเดิมทั้งหมด (/bot/notify, /webhooks/paypal, ฯลฯ)
    return legacy.fetch(req, env, ctx);
  },
};

};
