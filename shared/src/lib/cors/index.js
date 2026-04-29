export function parseAllowedOrigins(csv) {
  return String(csv || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

export function buildCorsHeaders(origin, allowedOrigins) {
  const headers = new Headers();
  if (origin && Array.isArray(allowedOrigins) && allowedOrigins.includes(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Vary", "Origin");
  }
  headers.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Internal-Token, X-Confirm-Key");
  headers.set("Access-Control-Max-Age", "86400");
  return headers;
}
