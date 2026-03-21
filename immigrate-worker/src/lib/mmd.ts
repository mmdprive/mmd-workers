import type { SessionStatusPayload } from '../types';

export const SESSION_STATUS_VALUES = ['Pending', 'Confirmed', 'Completed', 'Cancelled', 'Incomplete'] as const;
export const VERIFICATION_STATUS_VALUES = ['notified', 'verified', 'rejected', 'ready'] as const;
export const PAYMENT_STATUS_VALUES = ['pending', 'partial', 'paid'] as const;
export const MODEL_TIER_VALUES = ['public', 'standard', 'premium', 'vip', 'svip', 'blackcard'] as const;
export const PRICE_MODE_VALUES = ['fixed', 'approval'] as const;

export function decideSessionStatus(input: SessionStatusPayload): 'Pending' | 'Confirmed' | 'Completed' | 'Cancelled' | 'Incomplete' {
  if (input.session_status) return input.session_status;
  const model = input.model_tier;
  const priceMode = input.price_mode;
  const autoConfirm = (model === 'public' || model === 'standard') && priceMode === 'fixed';
  return autoConfirm ? 'Confirmed' : 'Pending';
}

export function needsPerApproval(input: SessionStatusPayload): boolean {
  const model = input.model_tier;
  const priceMode = input.price_mode;
  return !((model === 'public' || model === 'standard') && priceMode === 'fixed');
}
