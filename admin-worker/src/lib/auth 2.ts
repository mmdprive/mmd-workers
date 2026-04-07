import type { Env } from "../types";

export function isAuthorized(request: Request, env: Env): boolean {
  const auth = request.headers.get("authorization");
  return auth === `Bearer ${env.INTERNAL_TOKEN}`;
}
