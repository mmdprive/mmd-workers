import { success } from '../lib/response.js';
import { badRequest } from '../lib/errors.js';
import { assertActor } from '../services/guardrails.js';
import { unifiedSearch } from '../services/retrieval.js';
import { rankResults } from '../services/ranking.js';

// TODO: Implement real search logic
export async function handleSearch(req, env, ctx, body) {
  if (!body?.query) throw badRequest('query is required');
  assertActor(body.actor);
  const limit = Math.min(Number(body.limit || env.AI_DEFAULT_LIMIT || 10), Number(env.AI_MAX_LIMIT || 30));
  const results = await unifiedSearch({ query: body.query, scope: body.scope || [] });
  return success(req.requestId, {
    results: rankResults(results).slice(0, limit)
  }, {
    confidence: 0.85,
    latency_ms: 1
  });
}
