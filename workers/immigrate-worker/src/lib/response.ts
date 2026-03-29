import type { ErrorBody, Meta } from "../types";

export function makeMeta(request: Request): Meta {
  return {
    request_id: request.headers.get("x-request-id") || crypto.randomUUID(),
    ts: new Date().toISOString(),
  };
}

export function json(data: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(data, null, 2), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...(init?.headers ?? {}),
    },
  });
}

export function badRequest(message: string, meta: Meta, details?: Record<string, unknown>): Response {
  const body: ErrorBody & { meta: Meta } = {
    ok: false,
    error: { code: "INVALID_INPUT", message, details },
    meta,
  };
  return json(body, { status: 400 });
}

export function unauthorized(meta: Meta, message = "Unauthorized"): Response {
  const body: ErrorBody & { meta: Meta } = {
    ok: false,
    error: { code: "UNAUTHORIZED", message },
    meta,
  };
  return json(body, { status: 401 });
}

export function internalError(meta: Meta, message = "Internal Server Error"): Response {
  const body: ErrorBody & { meta: Meta } = {
    ok: false,
    error: { code: "INTERNAL_ERROR", message },
    meta,
  };
  return json(body, { status: 500 });
}
