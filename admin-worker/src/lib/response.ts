import type { ErrorBody } from "../types";

function mergeHeaders(init?: ResponseInit): Headers {
  const headers = new Headers(init?.headers);
  if (!headers.has("content-type")) {
    headers.set("content-type", "application/json; charset=utf-8");
  }
  return headers;
}

export function json(data: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(data, null, 2), {
    ...init,
    headers: mergeHeaders(init),
  });
}

export function errorResponse(
  status: number,
  code: string,
  message: string,
  init?: ResponseInit,
): Response {
  const body: ErrorBody = {
    ok: false,
    error: { code, message },
  };

  return json(body, {
    ...init,
    status,
  });
}

export function badRequest(
  message: string,
  code = "INVALID_INPUT",
  init?: ResponseInit,
): Response {
  return errorResponse(400, code, message, init);
}

export function unauthorized(
  message = "Unauthorized",
  code = "UNAUTHORIZED",
  init?: ResponseInit,
): Response {
  return errorResponse(401, code, message, init);
}

export function forbidden(
  message = "Forbidden",
  code = "FORBIDDEN",
  init?: ResponseInit,
): Response {
  return errorResponse(403, code, message, init);
}

export function notFound(
  message = "Route not found",
  code = "NOT_FOUND",
  init?: ResponseInit,
): Response {
  return errorResponse(404, code, message, init);
}

export function methodNotAllowed(
  message = "Method Not Allowed",
  code = "METHOD_NOT_ALLOWED",
  init?: ResponseInit,
): Response {
  return errorResponse(405, code, message, init);
}

export function unsupportedMediaType(
  message = "Content-Type must be application/json",
  code = "UNSUPPORTED_MEDIA_TYPE",
  init?: ResponseInit,
): Response {
  return errorResponse(415, code, message, init);
}

export function internalError(
  message = "Internal Server Error",
  code = "INTERNAL_ERROR",
  init?: ResponseInit,
): Response {
  return errorResponse(500, code, message, init);
}
