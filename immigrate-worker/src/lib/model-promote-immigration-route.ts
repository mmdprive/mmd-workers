import type { Env } from "../types";
import { handleModelPromoteImmigration } from "./model-promote-immigration";

export const MODEL_PROMOTE_IMMIGRATION_ROUTE = "/sigil/admin/models/promote-immigration";

export function isModelPromoteImmigrationRoute(pathname: string): boolean {
  return pathname === MODEL_PROMOTE_IMMIGRATION_ROUTE;
}

export async function maybeHandleModelPromoteImmigrationRoute(
  request: Request,
  env: Env,
  pathname: string,
): Promise<Response | null> {
  if (!isModelPromoteImmigrationRoute(pathname)) return null;
  return handleModelPromoteImmigration(request, env);
}
