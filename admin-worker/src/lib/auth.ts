import type { Env } from "../types";

function str(value: unknown): string {
  return String(value ?? "").trim();
}

export function extractBearerToken(request: Request): string {
  const auth = str(request.headers.get("Authorization"));
  if (!auth) return "";

  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match ? str(match[1]) : "";
}

export function extractConfirmKey(request: Request): string {
  return str(request.headers.get("X-Confirm-Key"));
}

export function hasAdminBearer(request: Request, env: Env): boolean {
  const expected = str(env.ADMIN_BEARER);
  const actual = extractBearerToken(request);
  return Boolean(expected && actual && actual === expected);
}

export function hasInternalToken(request: Request, env: Env): boolean {
  const expected = str(env.INTERNAL_TOKEN);
  const actual = extractBearerToken(request);
  return Boolean(expected && actual && actual === expected);
}

export function hasConfirmKey(request: Request, env: Env): boolean {
  const expected = str(env.CONFIRM_KEY);
  const actual = extractConfirmKey(request);
  return Boolean(expected && actual && actual === expected);
}

export function isAuthorized(request: Request, env: Env): boolean {
  return (
    hasAdminBearer(request, env) ||
    hasConfirmKey(request, env) ||
    hasInternalToken(request, env)
  );
}

export function isConfirmKeyAuthorized(request: Request, env: Env): boolean {
  return hasConfirmKey(request, env);
}
