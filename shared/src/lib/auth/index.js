export function readBearerToken(request) {
  const auth = request.headers.get("Authorization") || "";
  return auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
}

export function readHeaderToken(request, headerName) {
  return (request.headers.get(headerName) || "").trim();
}
