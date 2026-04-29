function makeHttpError(HttpErrorCtor, status, body) {
  return new HttpErrorCtor(status, body);
}

export function requireConfirmKey(req, env, HttpErrorCtor) {
  if (!env.CONFIRM_KEY) return;
  const key = req.headers.get("X-Confirm-Key") || "";
  if (key !== env.CONFIRM_KEY) {
    throw makeHttpError(HttpErrorCtor, 403, { ok: false, error: "confirm_key_required" });
  }
}

export function requireInternalToken(req, env, HttpErrorCtor) {
  if (!env.INTERNAL_API_TOKEN) return;
  const key = req.headers.get("X-Internal-Token") || "";
  if (key !== env.INTERNAL_API_TOKEN) {
    throw makeHttpError(HttpErrorCtor, 403, { ok: false, error: "internal_token_required" });
  }
}
