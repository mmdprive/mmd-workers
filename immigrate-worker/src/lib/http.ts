import type { ApiErrorBody, ApiOkBody, Env, Json } from '../types';

export function json<T extends Json | Record<string, unknown>>(data: T, requestId: string, status = 200): Response {
  const body: ApiOkBody<T> = { ok: true, request_id: requestId, data };
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' }
  });
}

export function error(message: string, requestId: string, status = 400, detail?: Json): Response {
  const body: ApiErrorBody = { ok: false, error: message, request_id: requestId, detail };
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' }
  });
}

export function requestId(): string {
  return crypto.randomUUID();
}

export function parseAllowedOrigins(env: Env): string[] {
  return (env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}

export function applyCors(req: Request, env: Env, res: Response): Response {
  const origin = req.headers.get('origin');
  const headers = new Headers(res.headers);
  const allowed = parseAllowedOrigins(env);
  if (origin && allowed.includes(origin)) {
    headers.set('access-control-allow-origin', origin);
    headers.set('vary', 'Origin');
  }
  headers.set('access-control-allow-methods', 'GET,POST,OPTIONS');
  headers.set('access-control-allow-headers', 'Content-Type, Authorization, X-MMD-Internal-Token');
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

export async function readJson<T>(req: Request): Promise<T> {
  return await req.json<T>();
}

export function requireInternalAuth(req: Request, env: Env): string | null {
  const auth = req.headers.get('authorization') || '';
  const internal = req.headers.get('x-mmd-internal-token') || '';
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!env.INTERNAL_TOKEN) return 'INTERNAL_TOKEN is not configured';
  if (bearer === env.INTERNAL_TOKEN || internal === env.INTERNAL_TOKEN) return null;
  return 'Unauthorized';
}

export function isWriteEnabled(env: Env): boolean {
  return (env.IMMIGRATE_WRITE_ENABLED || 'false').toLowerCase() === 'true';
}
