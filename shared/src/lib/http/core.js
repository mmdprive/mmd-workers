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
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
