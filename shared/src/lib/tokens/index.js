export const PUBLIC_TOKEN_PARAM = "t";

export function readPublicToken(url) {
  return String(url.searchParams.get(PUBLIC_TOKEN_PARAM) || "").trim();
}
