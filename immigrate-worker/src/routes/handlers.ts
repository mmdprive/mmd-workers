import { AirtableClient } from '../airtable';
import { decideSessionStatus, MODEL_TIER_VALUES, needsPerApproval, PAYMENT_STATUS_VALUES, PRICE_MODE_VALUES, SESSION_STATUS_VALUES, VERIFICATION_STATUS_VALUES } from '../lib/mmd';
import { notifyInternal } from '../lib/telegram';
import { assert, asStringArray, isIsoLike, isNonEmptyString, oneOf } from '../lib/validate';
import type { ClientUpsertPayload, Env, LineInboxPayload, PaymentProofCreatePayload, SessionStatusPayload, SessionUpsertPayload } from '../types';

export async function handleLineInbox(env: Env, payload: LineInboxPayload, requestId: string) {
  assert(payload?.source === 'LINE', 'source must be LINE');
  assert(isNonEmptyString(payload.line_user_id), 'line_user_id is required');

  const airtable = new AirtableClient(env);
  const record = await airtable.create(env.AIRTABLE_TABLE_CONSOLE_INBOX, {
    source: 'LINE',
    line_user_id: payload.line_user_id,
    display_name: payload.display_name || '',
    message_text: payload.message_text || '',
    legacy_tags: asStringArray(payload.legacy_tags) || [],
    consent: payload.consent ?? false,
    last_contacted: payload.last_contacted_at || new Date().toISOString(),
    payload_json: JSON.stringify(payload.raw_payload || {})
  });

  await audit(env, 'immigrate.line.inbox', requestId, {
    entity_type: 'console_inbox',
    related_ref: payload.line_user_id,
    details: `Created console inbox record ${record.id}`
  });

  return { action: 'created', record_id: record.id };
}

export async function handleClientUpsert(env: Env, payload: ClientUpsertPayload, requestId: string) {
  assert(isNonEmptyString(payload.client_name), 'client_name is required');
  const airtable = new AirtableClient(env);
  const key = payload.email || payload.line_user_id || payload.telegram_username || payload.client_name;
  const fields = {
    'Client Name': payload.client_name,
    email: payload.email || '',
    line_user_id: payload.line_user_id || '',
    telegram_username: payload.telegram_username || '',
    phone: payload.phone || '',
    privacy_level: payload.privacy_level || '',
    legacy_tags: asStringArray(payload.legacy_tags) || [],
    notes: payload.notes || '',
    source: payload.source || 'immigrate-worker'
  };
  const result = await airtable.upsertByTextField(env.AIRTABLE_TABLE_CLIENTS, 'email', payload.email || key, fields);
  await audit(env, 'immigrate.client.upsert', requestId, {
    entity_type: 'client',
    related_ref: key,
    details: `${result.action} client ${result.record.id}`
  });
  return { action: result.action, record_id: result.record.id };
}

export async function handleSessionUpsert(env: Env, payload: SessionUpsertPayload, requestId: string) {
  assert(isNonEmptyString(payload.session_id), 'session_id is required');
  if (payload.customer_ack_at) assert(isIsoLike(payload.customer_ack_at), 'customer_ack_at must be ISO-like');
  if (payload.model_ack_at) assert(isIsoLike(payload.model_ack_at), 'model_ack_at must be ISO-like');
  if (payload.session_status) oneOf(payload.session_status, SESSION_STATUS_VALUES, 'session_status');
  if (payload.verification_status) oneOf(payload.verification_status, VERIFICATION_STATUS_VALUES, 'verification_status');
  if (payload.payment_status) oneOf(payload.payment_status, PAYMENT_STATUS_VALUES, 'payment_status');

  const airtable = new AirtableClient(env);
  const fields = {
    session_id: payload.session_id,
    package_code: payload.package_code || '',
    memberstack_id: payload.memberstack_id || '',
    payment_ref: payload.payment_ref || '',
    payment_status: payload.payment_status || '',
    'Session Status': payload.session_status || 'Pending',
    status: payload.verification_status || '',
    customer_telegram_username: payload.customer_telegram_username || '',
    model_telegram_username: payload.model_telegram_username || '',
    customer_ack_at: payload.customer_ack_at || '',
    model_ack_at: payload.model_ack_at || '',
    amount_thb: payload.amount_thb ?? null,
    source: payload.source || 'immigrate-worker'
  };
  const result = await airtable.upsertByTextField(env.AIRTABLE_TABLE_SESSIONS, 'session_id', payload.session_id, fields);
  await audit(env, 'immigrate.session.upsert', requestId, {
    entity_type: 'session',
    related_ref: payload.session_id,
    details: `${result.action} session ${result.record.id}`
  });
  return { action: result.action, record_id: result.record.id };
}

export async function handlePaymentProofCreate(env: Env, payload: PaymentProofCreatePayload, requestId: string) {
  assert(isNonEmptyString(payload.payment_ref), 'payment_ref is required');
  const airtable = new AirtableClient(env);
  const record = await airtable.create(env.AIRTABLE_TABLE_PAYMENT_PROOFS, {
    payment_ref: payload.payment_ref,
    session_id: payload.session_id || '',
    payment_date: payload.payment_date || '',
    amount: payload.amount ?? null,
    payment_status: payload.payment_status || '',
    verification_status: payload.verification_status || '',
    payment_method: payload.payment_method || '',
    receipt_photo: payload.receipt_photo || '',
    notes: payload.notes || '',
    package_code: payload.package_code || '',
    payment_type: payload.payment_type || ''
  });
  await audit(env, 'immigrate.payment_proof.create', requestId, {
    entity_type: 'payment_proof',
    related_ref: payload.payment_ref,
    details: `created payment proof ${record.id}`
  });
  return { action: 'created', record_id: record.id };
}

export async function handleSessionStatus(env: Env, payload: SessionStatusPayload, requestId: string) {
  assert(isNonEmptyString(payload.session_id), 'session_id is required');
  oneOf(payload.model_tier, MODEL_TIER_VALUES, 'model_tier');
  oneOf(payload.price_mode, PRICE_MODE_VALUES, 'price_mode');
  if (payload.session_status) oneOf(payload.session_status, SESSION_STATUS_VALUES, 'session_status');
  if (payload.verification_status) oneOf(payload.verification_status, VERIFICATION_STATUS_VALUES, 'verification_status');
  if (payload.payment_status) oneOf(payload.payment_status, PAYMENT_STATUS_VALUES, 'payment_status');

  const airtable = new AirtableClient(env);
  const existing = await airtable.findFirstByFormula(env.AIRTABLE_TABLE_SESSIONS, `{session_id}="${payload.session_id.replace(/"/g, '\\"')}"`);
  if (!existing) throw new Error(`session_id not found: ${payload.session_id}`);

  const finalSessionStatus = decideSessionStatus(payload);
  const fields: Record<string, string> = {
    'Session Status': finalSessionStatus
  };
  if (payload.verification_status) fields.status = payload.verification_status;
  if (payload.payment_status) fields.payment_status = payload.payment_status;

  const updated = await airtable.update(env.AIRTABLE_TABLE_SESSIONS, existing.id, fields);

  const needsApproval = needsPerApproval(payload);
  if (payload.notify_telegram !== false) {
    const text = needsApproval
      ? [
          'MMD Approval Required',
          `session_id: ${payload.session_id}`,
          `record_id: ${existing.id}`,
          `Session Status: ${finalSessionStatus}`,
          `model_tier: ${payload.model_tier || ''}`,
          `price_mode: ${payload.price_mode || ''}`,
          'Reason: Premium+ model or non-fixed pricing must be approved by Per first.',
          payload.note ? `note: ${payload.note}` : ''
        ].filter(Boolean).join('\n')
      : [
          'MMD Session Auto-Confirmed',
          `session_id: ${payload.session_id}`,
          `record_id: ${existing.id}`,
          `Session Status: ${finalSessionStatus}`,
          `model_tier: ${payload.model_tier || ''}`,
          `price_mode: ${payload.price_mode || ''}`,
          'Reason: Standard/Public model with fixed price can proceed.',
          payload.note ? `note: ${payload.note}` : ''
        ].filter(Boolean).join('\n');
    await notifyInternal(env, text, env.TG_THREAD_CONFIRM || '61');
  }

  await audit(env, 'immigrate.session.status', requestId, {
    entity_type: 'session',
    related_ref: payload.session_id,
    details: `updated ${existing.id} Session Status=${finalSessionStatus}`
  });

  return {
    action: 'updated',
    record_id: updated.id,
    session_status: finalSessionStatus,
    approval_required: needsApproval
  };
}

async function audit(env: Env, action: string, requestId: string, input: { entity_type: string; related_ref: string; details: string }) {
  const airtable = new AirtableClient(env);
  try {
    await airtable.create(env.AIRTABLE_TABLE_ACTIVITY_LOGS, {
      'Action Performed': action,
      'Performed By': 'immigrate-worker',
      'Entity Type': input.entity_type,
      Details: JSON.stringify({ request_id: requestId, ref: input.related_ref, note: input.details }),
      'Verification Status': 'verified'
    });
  } catch {
    // do not block main migration flow on audit failure
  }
}
