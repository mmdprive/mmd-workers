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

export function badRequest(message: string, code = "INVALID_INPUT"): Response {
  const body: ErrorBody = {
    ok: false,
    error: { code, message },
  };
  return json(body, { status: 400 });
}

export function internalError(message = "Internal Server Error"): Response {
  const body: ErrorBody = {
    ok: false,
    error: { code: "INTERNAL_ERROR", message },
  };
  return json(body, { status: 500 });
}
