export interface Env {
  AIRTABLE_API_KEY: string;
  INTERNAL_TOKEN: string;
  AIRTABLE_BASE_ID: string;
  AIRTABLE_TABLE_CONSOLE_INBOX: string;
  AIRTABLE_TABLE_CLIENTS: string;
  AIRTABLE_TABLE_SESSIONS: string;
  AIRTABLE_TABLE_PAYMENT_PROOFS: string;
  AIRTABLE_TABLE_ACTIVITY_LOGS: string;
  TELEGRAM_WORKER_BASE_URL?: string;
  TELEGRAM_CHAT_ID?: string;
  TG_THREAD_CONFIRM?: string;
  TG_THREAD_POINTS?: string;
  TG_THREAD_MEMBERSHIP?: string;
  ALLOWED_ORIGINS?: string;
  IMMIGRATE_WRITE_ENABLED?: string;
}

export type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

export interface ApiErrorBody {
  ok: false;
  error: string;
  detail?: Json;
  request_id: string;
}

export interface ApiOkBody<T extends Json | Record<string, unknown>> {
  ok: true;
  request_id: string;
  data: T;
}

export interface MigrationContext {
  requestId: string;
  env: Env;
}

export interface LineInboxPayload {
  source: 'LINE';
  line_user_id: string;
  display_name?: string;
  message_text?: string;
  raw_payload?: Json;
  legacy_tags?: string[];
  consent?: boolean;
  last_contacted_at?: string;
}

export interface ClientUpsertPayload {
  source?: string;
  client_name: string;
  email?: string;
  line_user_id?: string;
  telegram_username?: string;
  phone?: string;
  privacy_level?: string;
  legacy_tags?: string[];
  notes?: string;
}

export interface SessionUpsertPayload {
  session_id: string;
  package_code?: string;
  memberstack_id?: string;
  payment_ref?: string;
  payment_status?: string;
  session_status?: string;
  verification_status?: string;
  customer_telegram_username?: string;
  model_telegram_username?: string;
  customer_ack_at?: string;
  model_ack_at?: string;
  amount_thb?: number;
  source?: string;
}

export interface PaymentProofCreatePayload {
  payment_ref: string;
  session_id?: string;
  payment_date?: string;
  amount?: number;
  payment_status?: string;
  verification_status?: string;
  payment_method?: string;
  receipt_photo?: string;
  notes?: string;
  package_code?: string;
  payment_type?: string;
}

export interface SessionStatusPayload {
  session_id: string;
  session_status?: 'Pending' | 'Confirmed' | 'Completed' | 'Cancelled' | 'Incomplete';
  verification_status?: 'notified' | 'verified' | 'rejected' | 'ready';
  payment_status?: 'pending' | 'partial' | 'paid';
  model_tier?: 'public' | 'standard' | 'premium' | 'vip' | 'svip' | 'blackcard';
  price_mode?: 'fixed' | 'approval';
  notify_telegram?: boolean;
  note?: string;
}

export interface AirtableRecord {
  id: string;
  fields: Record<string, Json>;
  createdTime?: string;
}
