import { success } from '../lib/response.js';
import { badRequest } from '../lib/errors.js';
import { assertActor } from '../services/guardrails.js';
import { unifiedSearch } from '../services/retrieval.js';
import { rankResults } from '../services/ranking.js';
import { summarizeResults } from '../services/summarizer.js';

// TODO: Implement real answer generation logic
export async function handleAnswer(req, env, ctx, body) {
  if (!body?.query) throw badRequest('query is required');
  assertActor(body.actor);
  const results = rankResults(await unifiedSearch({ query: body.query, scope: body.scope || [] }));
  return success(req.requestId, {
    answer: summarizeResults(body.query, results),
    sources: results.slice(0, 3).map((item) => ({
      type: item.type,
      id: item.id,
      source: item.source
    }))
  }, {
    confidence: 0.82,
    latency_ms: 1
  });
}
