export class HttpError extends Error {
  constructor(status, body) {
    super("HTTP_" + status);
    this.status = status;
    this.body = body;
  }
}

export async function safeJson(req) {
  const text = await req.text();
  if (!text) return null;
  try { return JSON.parse(text); } catch { return null; }
}

export function json(obj, status = 200, headers = {}) {
  return new Response(JSON.stringify(obj, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...headers,
    },
  });
}
