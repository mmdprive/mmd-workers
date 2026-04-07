import { success } from '../lib/response.js';
import { badRequest } from '../lib/errors.js';
import { assertActor } from '../services/guardrails.js';

export async function handleRecommend(req, env, ctx, body) {
  if (!body?.query) throw badRequest('query is required');
  assertActor(body.actor);
  const recommendations = [
    {
      type: 'offer',
      label: 'Suggest Black Card consultation',
      score: 0.91,
      reason: 'High-intent concierge query detected'
    },
    {
      type: 'route',
      label: 'Escalate to admin concierge review',
      score: 0.79,
      reason: 'Manual review may improve premium handling'
    }
  ];
  return success(req.requestId, { recommendations }, {
    confidence: 0.8,
    latency_ms: 1
  });
}
