// Model promotion route wiring example for immigrate-worker/src/index.ts
// Apply these two blocks to the real index.ts runtime entrypoint.

import {
  maybeHandleModelPromoteImmigrationRoute,
} from "./lib/model-promote-immigration-route";

// Inside fetch handler, after pathname is available:
// const pathname = url.pathname;

export async function maybeRouteModelPromotion(
  request: Request,
  env: Env,
  pathname: string,
): Promise<Response | null> {
  const modelPromotionResponse = await maybeHandleModelPromoteImmigrationRoute(
    request,
    env,
    pathname,
  );

  if (modelPromotionResponse) {
    return modelPromotionResponse;
  }

  return null;
}
