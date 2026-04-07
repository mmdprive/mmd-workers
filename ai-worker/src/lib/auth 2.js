import { unauthorized } from './errors.js';

export function withRequestContext(request) {
  return {
    requestId: request.headers.get('X-Request-Id') || crypto.randomUUID(),
    serviceName: request.headers.get('X-Service-Name') || 'unknown'
  };
}

export function requireInternalAuth(request, env) {
  const auth = request.headers.get('Authorization') || '';
  const expected = `Bearer ${env.INTERNAL_TOKEN}`;
  if (!env.INTERNAL_TOKEN || auth !== expected) {
    throw unauthorized('Missing or invalid internal token');
  }
}
