export function buildCors(origin, allowedCsv) {
  const allowed = (allowedCsv || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const ok = !!origin && allowed.includes(origin);
  return { allowOrigin: ok ? origin : "", varyOrigin: true };
}

export function corsHeaders(cors) {
  const h = {};
  if (cors?.allowOrigin) h["Access-Control-Allow-Origin"] = cors.allowOrigin;
  if (cors?.varyOrigin) h["Vary"] = "Origin";
  h["Access-Control-Allow-Methods"] = "GET,POST,OPTIONS";
  h["Access-Control-Allow-Headers"] = "Content-Type,Authorization,X-Confirm-Key,X-Internal-Token";
  h["Access-Control-Max-Age"] = "86400";
  return h;
}
