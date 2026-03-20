import type { ErrorBody } from "../types";

export function json(data: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(data, null, 2), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...(init?.headers ?? {}),
    },
  });
}

export function unauthorized(message = "Unauthorized"): Response {
  const body: ErrorBody = {
    ok: false,
    error: { code: "UNAUTHORIZED", message },
  };
  return json(body, { status: 401 });
}

export function internalError(message = "Internal Server Error"): Response {
  const body: ErrorBody = {
    ok: false,
    error: { code: "INTERNAL_ERROR", message },
  };
  return json(body, { status: 500 });
}
