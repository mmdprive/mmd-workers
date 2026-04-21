import { success } from '../lib/response.js';
import { badRequest, forbidden } from '../lib/errors.js';
import { assertActor, canViewMemberContext } from '../services/guardrails.js';
import { buildMemberContext } from '../services/retrieval.js';

// TODO: Implement real member context retrieval logic
export async function handleMemberContext(req, env, ctx, body) {
  if (!body?.member_id) throw badRequest('member_id is required');
  assertActor(body.actor);
  if (!canViewMemberContext(body.actor, body.member_id)) {
    throw forbidden('Actor cannot access this member context');
  }
  const data = await buildMemberContext(body.member_id);
  return success(req.requestId, data, {
    confidence: 0.9,
    latency_ms: 1
  });
}
