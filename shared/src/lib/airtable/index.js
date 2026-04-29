export function firstPresentField(fields = {}, candidates = []) {
  for (const key of candidates) {
    if (fields[key] !== undefined && fields[key] !== null && fields[key] !== "") {
      return fields[key];
    }
  }
  return "";
}

export function canonicalSessionFieldCandidates() {
  return ["session_id", "Session ID", "SESSION_ID"];
}
