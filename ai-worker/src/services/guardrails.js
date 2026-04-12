import { forbidden } from '../lib/errors.js';

export function assertActor(actor) {
  if (!actor || !actor.role) {
    throw forbidden('Actor role is required');
  }
}

export function canViewMemberContext(actor, memberId) {
  if (actor.role === 'admin' || actor.role === 'system') return true;
  if (actor.role === 'member' && actor.member_id === memberId) return true;
  return false;
}
