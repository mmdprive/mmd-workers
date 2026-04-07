import { badRequest } from './errors.js';

export function json(status, payload) {
  return new Response(JSON.stringify(payload, null, 2), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8'
    }
  });
}

export function success(requestId, data, meta = {}) {
  return json(200, {
    ok: true,
    data,
    meta: {
      request_id: requestId,
      ...meta
    },
    error: null
  });
}

export function notFound(requestId, message) {
  return json(404, {
    ok: false,
    data: null,
    meta: { request_id: requestId },
    error: { code: 'NOT_FOUND', message }
  });
}

export async function readJsonBody(request) {
  try {
    return await request.json();
  } catch {
    throw badRequest('Request body must be valid JSON');
  }
}
