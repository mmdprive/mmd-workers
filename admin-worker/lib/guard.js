import { HttpError } from "./http.js";
import {
  requireConfirmKey as sharedRequireConfirmKey,
  requireInternalToken as sharedRequireInternalToken,
} from "../../shared/src/lib/auth/guard.js";

export function requireConfirmKey(req, env) {
  return sharedRequireConfirmKey(req, env, HttpError);
}

export function requireInternalToken(req, env) {
  return sharedRequireInternalToken(req, env, HttpError);
}
