import type { Env } from "./types";
import { json, makeMeta } from "./lib/response";

const VIP_POINTS_REQUIRED = 1200;
const POINT_THB_RATE = 100;

function toStr(value: unknown): string {
  return String(value ?? "").trim();
}

function toNum(value: unknown): number | null {
  const n = Number(String(value ?? "").replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : null;
}

function publicCors(request: Request, env: Env): Headers {
  const headers = new Headers();
  const allowed = String(
    env.PUBLIC_ALLOWED_ORIGINS ||
      "https://mmdbkk.com,https://www.mmdbkk.com,https://sigil.mmdbkk.com,https://mmdprive.com,https://www.mmdprive.com,https://mmdprive.webflow.io",
  )
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const origin = request.headers.get("origin") || "";
  if (origin && allowed.includes(origin)) {
    headers.set("access-control-allow-origin", origin);
    headers.set("vary", "origin");
  }
  headers.set("access-control-allow-methods", "POST,OPTIONS");
  headers.set("access-control-allow-headers", "content-type, authorization, x-internal-token");
  headers.set("access-control-max-age", "86400");
  return headers;
}

function withCors(request: Request, env: Env, response: Response): Response {
  const headers = new Headers(response.headers);
  publicCors(request, env).forEach((value, key) => headers.set(key, value));
  return new Response(response.body, { status: response.status, headers });
}

function publicJson(request: Request, env: Env, data: unknown, init?: ResponseInit): Response {
  return withCors(request, env, json(data, init));
}

function readBearer(env: Env): string {
  return toStr(env.CONFIRM_KEY || env.INTERNAL_TOKEN);
}

async function forwardJson(url: string, env: Env, payload: Record<string, unknown>): Promise<Response | null> {
  if (!url) return null;
  const bearer = readBearer(env);
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(bearer ? { authorization: `Bearer ${bearer}`, "x-internal-token": bearer } : {}),
    },
    body: JSON.stringify(payload),
  });
  return response;
}

async function intakeFallback(request: Request, env: Env, payload: Record<string, unknown>, reason: string): Promise<Record<string, unknown>> {
  const url = new URL(request.url);
  const fallbackUrl = `${url.origin}/member/api/renewal/intake`;
  const fallbackPayload = {
    ...payload,
    flow: "review",
    points_action: payload.points_action || reason,
    fallback_reason: reason,
    source_page: payload.source_page || "sigil_inme_renewal",
    notify_telegram: true,
  };

  try {
    const response = await fetch(fallbackUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(fallbackPayload),
    });
    const data = await response.json().catch(() => null);
    return {
      attempted: true,
      ok: response.ok && data?.ok !== false,
      data,
    };
  } catch (error) {
    return {
      attempted: true,
      ok: false,
      error: error instanceof Error ? error.message : "fallback_failed",
    };
  }
}

export async function handlePublicPointsTopup(request: Request, env: Env): Promise<Response> {
  const meta = makeMeta(request);
  if (request.method === "OPTIONS") return withCors(request, env, new Response(null, { status: 204 }));
  if (request.method !== "POST") {
    return publicJson(request, env, { ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "POST required" }, meta }, { status: 405 });
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object") {
    return publicJson(request, env, { ok: false, error: { code: "INVALID_INPUT", message: "valid JSON payload required" }, meta }, { status: 400 });
  }

  const pointsShortfall = toNum(body.points_shortfall ?? body.points_to_add) || 0;
  const amountThb = toNum(body.amount_thb ?? body.topup_amount_thb) || pointsShortfall * POINT_THB_RATE;

  if (!pointsShortfall || pointsShortfall <= 0 || !amountThb || amountThb <= 0) {
    return publicJson(request, env, { ok: false, error: { code: "INVALID_TOPUP", message: "points_shortfall and amount_thb are required" }, meta }, { status: 400 });
  }

  const payload = {
    ...body,
    flow: "points_topup",
    payment_type: "points_topup",
    points_to_add: pointsShortfall,
    amount_thb: amountThb,
    points_required: toNum(body.points_required) || VIP_POINTS_REQUIRED,
    points_action: "points_topup_required",
  };

  const paymentsBase = toStr((env as unknown as { PAYMENTS_WORKER_BASE_URL?: string }).PAYMENTS_WORKER_BASE_URL || env.CREATE_LINKS_URL).replace(/\/$/, "");
  const candidateUrls = [
    paymentsBase && `${paymentsBase}/member/api/points/topup`,
    paymentsBase && `${paymentsBase}/v1/points/topup`,
    env.CREATE_LINKS_URL,
  ].filter(Boolean) as string[];

  for (const url of candidateUrls) {
    try {
      const upstream = await forwardJson(url, env, payload);
      if (!upstream) continue;
      const data = await upstream.json().catch(() => null);
      if (upstream.ok && data?.ok !== false) {
        return publicJson(request, env, {
          ok: true,
          data: {
            mode: "forwarded_to_payments_worker",
            upstream_url: url,
            points_to_add: pointsShortfall,
            amount_thb: amountThb,
            payment_url: data?.data?.payment_url || data?.payment_url || data?.data?.url || data?.url || "",
            upstream: data,
          },
          meta,
        });
      }
    } catch (_) {
      // Try the next candidate, then fallback to Per review.
    }
  }

  const fallback = await intakeFallback(request, env, payload, "points_topup_bridge_unavailable");
  return publicJson(request, env, {
    ok: true,
    data: {
      mode: "per_review_fallback",
      points_to_add: pointsShortfall,
      amount_thb: amountThb,
      fallback,
    },
    meta,
  });
}

export async function handlePublicActivateVip(request: Request, env: Env): Promise<Response> {
  const meta = makeMeta(request);
  if (request.method === "OPTIONS") return withCors(request, env, new Response(null, { status: 204 }));
  if (request.method !== "POST") {
    return publicJson(request, env, { ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "POST required" }, meta }, { status: 405 });
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object") {
    return publicJson(request, env, { ok: false, error: { code: "INVALID_INPUT", message: "valid JSON payload required" }, meta }, { status: 400 });
  }

  const pointsBalance = toNum(body.points_balance);
  const pointsToDeduct = toNum(body.points_to_deduct ?? body.points_required) || VIP_POINTS_REQUIRED;

  if (pointsBalance !== null && pointsBalance < pointsToDeduct) {
    return publicJson(request, env, {
      ok: false,
      error: { code: "INSUFFICIENT_POINTS", message: "not enough points to activate VIP" },
      meta,
    }, { status: 409 });
  }

  const payload = {
    ...body,
    flow: "vip_auto_activate",
    target_tier: "vip",
    points_to_deduct: pointsToDeduct,
    points_action: "vip_auto",
    activation_type: "vip_renewal",
  };

  const adminBase = toStr(env.ADMIN_WORKER_BASE_URL).replace(/\/$/, "");
  const paymentsBase = toStr((env as unknown as { PAYMENTS_WORKER_BASE_URL?: string }).PAYMENTS_WORKER_BASE_URL).replace(/\/$/, "");
  const candidateUrls = [
    adminBase && `${adminBase}/member/api/renewal/activate-vip`,
    adminBase && `${adminBase}/v1/member/activate-vip`,
    paymentsBase && `${paymentsBase}/member/api/renewal/activate-vip`,
    paymentsBase && `${paymentsBase}/v1/points/redeem-vip`,
  ].filter(Boolean) as string[];

  for (const url of candidateUrls) {
    try {
      const upstream = await forwardJson(url, env, payload);
      if (!upstream) continue;
      const data = await upstream.json().catch(() => null);
      if (upstream.ok && data?.ok !== false) {
        return publicJson(request, env, {
          ok: true,
          data: {
            mode: "forwarded_to_canonical_worker",
            upstream_url: url,
            target_tier: "vip",
            points_deducted: pointsToDeduct,
            upstream: data,
          },
          meta,
        });
      }
    } catch (_) {
      // Try the next candidate, then fallback to Per review.
    }
  }

  const fallback = await intakeFallback(request, env, payload, "vip_activation_bridge_unavailable");
  return publicJson(request, env, {
    ok: true,
    data: {
      mode: "per_review_fallback",
      target_tier: "vip",
      points_to_deduct: pointsToDeduct,
      fallback,
    },
    meta,
  });
}
