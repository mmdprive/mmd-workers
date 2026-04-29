import { json as sharedJson } from "../../shared/src/lib/response/http.js";
import { HttpError as SharedHttpError, safeJson as sharedSafeJson } from "../../shared/src/lib/http/core.js";

export class HttpError extends SharedHttpError {}

export async function safeJson(req) {
  return sharedSafeJson(req);
}

export function json(obj, status = 200, headers = {}) {
  return sharedJson(obj, status, headers);
}
