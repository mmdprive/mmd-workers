export const SESSION_ID_PARAM = "session_id";

export function readSessionId(input) {
  if (!input || typeof input !== "object") return "";
  return String(input.session_id || input.sessionId || "").trim();
}
