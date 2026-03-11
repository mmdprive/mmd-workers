import { json, notFound, readJsonBody } from './src/lib/response.js';
import { requireInternalAuth, withRequestContext } from './src/lib/auth.js';
import { handlePing } from './src/routes/ping.js';
import { handleSearch } from './src/routes/search.js';
import { handleAnswer } from './src/routes/answer.js';
import { handleMemberContext } from './src/routes/member-context.js';
import { handleRecommend } from './src/routes/recommend.js';

export default {
  async fetch(request, env, ctx) {
    try {
      const req = withRequestContext(request);
      const url = new URL(request.url);
      const path = url.pathname;
      const method = request.method.toUpperCase();

      if (method === 'GET' && path === '/ping') {
        return handlePing(req);
      }

      requireInternalAuth(request, env);

      if (method === 'POST' && path === '/v1/ai/search') {
        const body = await readJsonBody(request);
        return await handleSearch(req, env, ctx, body);
      }
      if (method === 'POST' && path === '/v1/ai/answer') {
        const body = await readJsonBody(request);
        return await handleAnswer(req, env, ctx, body);
      }
      if (method === 'POST' && path === '/v1/ai/member-context') {
        const body = await readJsonBody(request);
        return await handleMemberContext(req, env, ctx, body);
      }
      if (method === 'POST' && path === '/v1/ai/recommend') {
        const body = await readJsonBody(request);
        return await handleRecommend(req, env, ctx, body);
      }

      return notFound(req.requestId, 'Route not found');
    } catch (error) {
      const requestId = request.headers.get('X-Request-Id') || crypto.randomUUID();
      const status = error.status || 500;
      return json(status, {
        ok: false,
        data: null,
        meta: { request_id: requestId },
        error: {
          code: error.code || 'INTERNAL_ERROR',
          message: error.message || 'Unexpected error'
        }
      });
    }
  }
};
