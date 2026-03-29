import type { Env } from "../types";

export function readInternalToken(request: Request): string {
  const headerToken = (request.headers.get("x-internal-token") || "").trim();
  if (headerToken) return headerToken;

  const auth = request.headers.get("authorization") || "";
  return auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
}

export function isAuthorized(request: Request, env: Env): boolean {
  const expected = String(env.INTERNAL_TOKEN || "").trim();
  if (!expected) return false;
  return readInternalToken(request) === expected;
}
