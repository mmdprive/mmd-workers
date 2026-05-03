import type { Env } from "./types";

export type InternalRoutesEnv = Env & {
  ASSETS?: Fetcher;
};

const CREATE_SESSION_LOADER_PATH = "/a/create-session-loader.js";
const CREATE_SESSION_SCRIPT_PATH = "/a/create-session.js";
const JS_CONTENT_TYPE = "application/javascript; charset=utf-8";
const CSS_CONTENT_TYPE = "text/css; charset=utf-8";

const CREATE_SESSION_LOADER_FALLBACK = `window.MMD_CREATE_SESSION_DIAG = {
  ok: false,
  message: "asset_fallback_loader_served",
  rootFound: Boolean(document.querySelector("[data-mmd-create-session-pro]")),
  at: new Date().toISOString()
};
console.warn("[MMD Create Session] fallback loader served", window.MMD_CREATE_SESSION_DIAG);`;

const CREATE_SESSION_SCRIPT_FALLBACK = `window.__MMD_CREATE_SESSION_ASSET__ = { ready: true };`;

function buildAssetResponse(
  request: Request,
  body: BodyInit | null,
  init: ResponseInit,
): Response {
  if (request.method === "HEAD") {
    return new Response(null, init);
  }
  return new Response(body, init);
}

function respondWithJavascript(request: Request, source: string, cacheControl: string): Response {
  return buildAssetResponse(request, source, {
    status: 200,
    headers: {
      "content-type": JS_CONTENT_TYPE,
      "cache-control": cacheControl,
    },
  });
}

async function serveAsset(request: Request, env: InternalRoutesEnv): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/a/")) return null;

  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method not allowed", {
      status: 405,
      headers: {
        allow: "GET, HEAD",
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "no-store",
      },
    });
  }

  if (env.ASSETS) {
    const res = await env.ASSETS.fetch(request);
    if (res.status !== 404) {
      const headers = new Headers(res.headers);
      headers.set("cache-control", "public, max-age=300");
      if (url.pathname.endsWith(".js")) headers.set("content-type", JS_CONTENT_TYPE);
      if (url.pathname.endsWith(".css")) headers.set("content-type", CSS_CONTENT_TYPE);
      return buildAssetResponse(request, res.body, {
        status: res.status,
        statusText: res.statusText,
        headers,
      });
    }
  }

  if (url.pathname === CREATE_SESSION_LOADER_PATH) {
    return respondWithJavascript(request, CREATE_SESSION_LOADER_FALLBACK, "public, max-age=60");
  }

  if (url.pathname === CREATE_SESSION_SCRIPT_PATH) {
    return respondWithJavascript(request, CREATE_SESSION_SCRIPT_FALLBACK, "public, max-age=300");
  }

  return new Response("Asset not found", {
    status: 404,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

export async function handleInternalRoutes(
  request: Request,
  env: InternalRoutesEnv,
): Promise<Response | null> {
  return serveAsset(request, env);
}
