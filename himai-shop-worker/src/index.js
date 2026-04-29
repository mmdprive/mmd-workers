const LOCK = "himai-shop-worker-v2026-04-29-shop-routes";
const DEFAULT_DASHBOARD_UPSTREAM = "https://admin-worker.malemodel-bkk.workers.dev";
const DEFAULT_CATALOG_UPSTREAM = "https://himai-chat-worker.malemodel-bkk.workers.dev";

export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);
      const method = request.method.toUpperCase();

      if (method === "OPTIONS") {
        return new Response(null, { status: 204, headers: corsHeaders(request, env) });
      }

      if (method === "GET" && (url.pathname === "/health" || url.pathname === "/ping")) {
        return withCors(
          request,
          env,
          json({
            ok: true,
            app: env.APP_NAME || "Himai Shop",
            worker: "himai-shop-worker",
            lock: LOCK,
            routes: [
              "GET /health",
              "GET /shop",
              "POST /shop",
              "POST /shop/signup",
              "GET /mmd-shop",
              "GET /mmd-shop/catalog",
              "GET /api/mmd-shop/catalog",
              "GET /v1/admin/dashboard/ceo",
              "ANY /internal/admin/*",
              "ANY /v1/admin/*",
              "ANY /api/member/*",
            ],
            upstream: getDashboardUpstream(env),
            ts: Date.now(),
          })
        );
      }

      if (method === "GET" && url.pathname === "/shop") {
        return withCors(request, env, json(shopSurface(env)));
      }

      if (method === "POST" && isShopSignupPath(url.pathname)) {
        return await proxyShopSignup(request, env);
      }

      if (method === "GET" && url.pathname === "/v1/admin/dashboard/ceo") {
        return await proxyDashboardCEO(request, env);
      }

      if (method === "GET" && isMmdShopCatalogPath(url.pathname)) {
        return await proxyShopCatalog(request, env);
      }

      if (isAdminProxyPath(url.pathname)) {
        return await proxyAdminWorker(request, env);
      }

      return withCors(request, env, json({ ok: false, error: "not_found" }, 404));
    } catch (error) {
      return withCors(
        request,
        env,
        json(
          {
            ok: false,
            error: "internal_error",
            message: error && error.message ? error.message : String(error),
          },
          500
        )
      );
    }
  },
};

async function proxyShopSignup(request, env) {
  const incomingUrl = new URL(request.url);
  const upstreamUrl = new URL(`${getCatalogUpstream(env)}/shop/signup`);
  upstreamUrl.search = incomingUrl.search;

  const upstreamRequest = new Request(upstreamUrl.toString(), {
    method: "POST",
    headers: shopSignupHeaders(request),
    body: request.body,
  });
  const response = env.HIMAI_CHAT_WORKER
    ? await env.HIMAI_CHAT_WORKER.fetch(upstreamRequest)
    : await fetch(upstreamRequest);

  return proxyResponse(request, env, response);
}

async function proxyShopCatalog(request, env) {
  const incomingUrl = new URL(request.url);
  const upstreamUrl = new URL(`${getCatalogUpstream(env)}/api/mmd-shop/catalog`);
  upstreamUrl.search = incomingUrl.search;

  const upstreamRequest = new Request(upstreamUrl.toString(), {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
  });
  const response = env.HIMAI_CHAT_WORKER
    ? await env.HIMAI_CHAT_WORKER.fetch(upstreamRequest)
    : await fetch(upstreamRequest);

  return proxyResponse(request, env, response);
}

async function proxyDashboardCEO(request, env) {
  const auth = request.headers.get("Authorization") || "";
  if (!/^Bearer\s+\S+/i.test(auth)) {
    return withCors(request, env, json({ ok: false, error: "unauthorized" }, 401));
  }
  const incomingBearer = auth.replace(/^Bearer\s+/i, "").trim();
  const upstreamBearer =
    (safeEqual(incomingBearer, env.ADMIN_BEARER) || safeEqual(incomingBearer, env.INTERNAL_TOKEN)) &&
    env.INTERNAL_TOKEN
      ? env.INTERNAL_TOKEN
      : incomingBearer;

  const upstreamRequest = new Request(`${getDashboardUpstream(env)}/v1/admin/dashboard/ceo`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${upstreamBearer}`,
      Accept: "application/json",
    },
  });
  const response = env.ADMIN_WORKER
    ? await env.ADMIN_WORKER.fetch(upstreamRequest)
    : await fetch(upstreamRequest);

  return proxyResponse(request, env, response);
}

async function proxyAdminWorker(request, env) {
  const response = env.ADMIN_WORKER
    ? await env.ADMIN_WORKER.fetch(request)
    : await fetch(toUpstreamRequest(request, getDashboardUpstream(env)));

  return proxyResponse(request, env, response);
}

function proxyResponse(request, env, response) {
  const headers = new Headers(response.headers);
  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json; charset=utf-8");
  }
  headers.set("Cache-Control", headers.get("Cache-Control") || "no-store");

  return withCors(
    request,
    env,
    new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    })
  );
}

function shopSurface(env) {
  return {
    ok: true,
    brand: "Himai Shop",
    path: "/shop",
    purpose: "shop_signup",
    signup_endpoint: "POST /shop",
    compatibility_signup_endpoint: "POST /shop/signup",
    line_oa: env.LINE_OA_HANDLE || "@himaishop",
    line_oa_url: env.LINE_OA_URL || "https://line.me/R/ti/p/@himaishop",
    sibling_shop: {
      brand: "MMD Shop",
      path: "/mmd-shop",
      catalog_endpoint: "GET /mmd-shop",
      compatibility_catalog_endpoint: "GET /api/mmd-shop/catalog",
    },
  };
}

function isShopSignupPath(pathname) {
  return pathname === "/shop" || pathname === "/shop/signup";
}

function isMmdShopCatalogPath(pathname) {
  return (
    pathname === "/mmd-shop" ||
    pathname === "/mmd-shop/catalog" ||
    pathname === "/api/mmd-shop/catalog"
  );
}

function shopSignupHeaders(request) {
  const headers = new Headers();
  const contentType = request.headers.get("Content-Type");
  const authorization = request.headers.get("Authorization");
  const accept = request.headers.get("Accept");

  headers.set("Accept", accept || "application/json");
  if (contentType) headers.set("Content-Type", contentType);
  if (authorization) headers.set("Authorization", authorization);

  return headers;
}

function isAdminProxyPath(pathname) {
  return (
    pathname.startsWith("/internal/admin/") ||
    pathname.startsWith("/v1/admin/") ||
    pathname.startsWith("/api/member/")
  );
}

function toUpstreamRequest(request, upstreamBase) {
  const incomingUrl = new URL(request.url);
  const upstreamUrl = new URL(incomingUrl.pathname + incomingUrl.search, upstreamBase);
  return new Request(upstreamUrl.toString(), request);
}

function getDashboardUpstream(env) {
  return String(env.ADMIN_DASHBOARD_UPSTREAM || DEFAULT_DASHBOARD_UPSTREAM).replace(/\/+$/, "");
}

function getCatalogUpstream(env) {
  return String(env.MMD_SHOP_CATALOG_UPSTREAM || DEFAULT_CATALOG_UPSTREAM).replace(/\/+$/, "");
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function getAllowedOrigins(env) {
  return String(env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function corsHeaders(request, env) {
  const origin = request.headers.get("Origin") || "";
  const requestOrigin = new URL(request.url).origin;
  const allowed = getAllowedOrigins(env);
  const headers = new Headers();

  if (origin && (origin === requestOrigin || allowed.length === 0 || allowed.includes(origin))) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Vary", "Origin");
  }

  headers.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Confirm-Key");
  headers.set("Access-Control-Max-Age", "86400");
  return headers;
}

function withCors(request, env, response) {
  const headers = new Headers(response.headers);
  corsHeaders(request, env).forEach((value, key) => headers.set(key, value));
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function safeEqual(a, b) {
  const aa = String(a || "");
  const bb = String(b || "");
  if (aa.length !== bb.length) return false;

  let result = 0;
  for (let i = 0; i < aa.length; i += 1) {
    result |= aa.charCodeAt(i) ^ bb.charCodeAt(i);
  }
  return result === 0;
}
