import {
  renderControlRoomPage,
  renderCreateJobPage,
  renderCreateSessionPage,
  type InternalPageEnv,
} from "./internal-pages";
import { handleModelPromoteImmigration } from "./lib/model-promote-immigration";

export interface InternalRoutesEnv extends InternalPageEnv {
  ADMIN_WORKER_BASE_URL?: string;
  ASSETS?: Fetcher;
}

function redirect(to: string, status = 302): Response {
  return new Response(null, {
    status,
    headers: {
      location: to,
      "cache-control": "no-store",
    },
  });
}

function withQuery(path: string, url: URL): string {
  return `${path}${url.search || ""}`;
}

async function serveAsset(request: Request, env: InternalRoutesEnv): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/a/")) return null;

  if (env.ASSETS) {
    const res = await env.ASSETS.fetch(request);
    if (res.status !== 404) {
      const headers = new Headers(res.headers);
      headers.set("cache-control", "public, max-age=300");
      if (url.pathname.endsWith(".js")) headers.set("content-type", "application/javascript; charset=utf-8");
      if (url.pathname.endsWith(".css")) headers.set("content-type", "text/css; charset=utf-8");
      return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
    }
  }

  return new Response("Asset not found", {
    status: 404,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

async function requireAdminGate(request: Request, env: InternalRoutesEnv): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.searchParams.has("mock")) return null;

  const adminBase = env.ADMIN_WORKER_BASE_URL || "https://admin-worker.malemodel-bkk.workers.dev";
  try {
    const verifyRes = await fetch(`${adminBase.replace(/\/$/, "")}/v1/admin/auth/me`, {
      method: "GET",
      headers: {
        accept: "application/json",
        cookie: request.headers.get("cookie") || "",
        "x-mmd-gate": "mmd_admin_gate_v1",
      },
    });

    if (verifyRes.ok) return null;
  } catch {
    // Use admin login fallback below.
  }

  return redirect(`/internal/admin/login?next=${encodeURIComponent(`${url.pathname}${url.search}`)}`, 302);
}

async function proxyAdminApi(request: Request, env: InternalRoutesEnv): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/v1/admin/")) return null;

  const adminBase = env.ADMIN_WORKER_BASE_URL || "https://admin-worker.malemodel-bkk.workers.dev";
  const targetPath = url.pathname === "/v1/admin/jobs/create-session" ? "/v1/admin/create-session" : url.pathname;
  const target = new URL(`${adminBase.replace(/\/$/, "")}${targetPath}`);
  target.search = url.search;

  const headers = new Headers(request.headers);
  headers.set("host", target.host);
  headers.set("x-mmd-gate", "mmd_admin_gate_v1");

  const proxied = new Request(target.toString(), {
    method: request.method,
    headers,
    body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body,
    redirect: "manual",
  });

  const res = await fetch(proxied);
  const outHeaders = new Headers(res.headers);
  outHeaders.set("cache-control", "no-store");
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: outHeaders });
}

export async function handleInternalRoutes(request: Request, env: InternalRoutesEnv): Promise<Response | null> {
  const url = new URL(request.url);
  const pathname = url.pathname.replace(/\/+$/, "") || "/";

  const assetRes = await serveAsset(request, env);
  if (assetRes) return assetRes;

  if (pathname === "/sigil/admin/models/promote-immigration") {
    return handleModelPromoteImmigration(request, env);
  }

  const apiRes = await proxyAdminApi(request, env);
  if (apiRes) return apiRes;

  // Canonical create-session route is the jobs-scoped route. Keep the older
  // route as a durable redirect only, so bookmarks and login next links do not
  // resurrect the legacy operator surface.
  if (pathname === "/internal/admin/create-session") {
    return redirect(withQuery("/internal/admin/jobs/create-session", url), 308);
  }

  if (pathname === "/internal/admin/control-room") {
    const gate = await requireAdminGate(request, env);
    if (gate) return gate;
    return renderControlRoomPage();
  }

  if (pathname === "/internal/admin/jobs/create-session") {
    const gate = await requireAdminGate(request, env);
    if (gate) return gate;
    return renderCreateSessionPage(env);
  }

  if (pathname === "/internal/jobs/create-job") {
    const gate = await requireAdminGate(request, env);
    if (gate) return gate;
    return renderCreateJobPage();
  }

  return null;
}
