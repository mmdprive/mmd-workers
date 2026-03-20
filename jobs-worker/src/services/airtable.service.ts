import Airtable from "airtable";
import { ENV, AIRTABLE_ENABLED } from "../config/env";
import { AT } from "../config/airtable-fields";
import type { ParsedIdentity } from "../utils/username";
import type { NormalizedPricing } from "../utils/pricing";

const base = AIRTABLE_ENABLED
  ? new Airtable({ apiKey: ENV.AIRTABLE_API_KEY }).base(ENV.AIRTABLE_BASE_ID)
  : null;

function toStr(value: unknown): string {
  return String(value ?? "").trim();
}

export type CreateLinksPayload = Record<string, any>;

export async function upsertClient(
  payload: CreateLinksPayload,
  identity: ParsedIdentity
) {
  if (!base) return { id: "mock_client" };

  const table = base(ENV.AIRTABLE_TABLE_CLIENTS);

  return await table.create({
    "Client Name": toStr(payload.client_name) || identity.mmd_client_name,
    username: identity.username,
    mmd_client_name: identity.mmd_client_name,
    nickname: identity.nickname,
    suffix_code: identity.suffix_code,
    memberstack_id: toStr(payload.memberstack_id),
    line_user_id: toStr(payload.line_user_id),
    telegram_username: toStr(payload.telegram_username),
    email: toStr(payload.gmail || payload.email).toLowerCase(),
    source: "jobs_worker",
  });
}

export async function upsertSessionRecord(
  payload: CreateLinksPayload,
  identity: ParsedIdentity,
  pricing: NormalizedPricing,
  sessionId: string,
  paymentRef: string
) {
  if (!base) return { id: "mock_session" };

  const table = base(ENV.AIRTABLE_TABLE_SESSIONS);

  return await table.create({
    [AT.SESSIONS.SESSION_ID]: sessionId,
    [AT.SESSIONS.STATUS]: "pending",
    [AT.SESSIONS.PACKAGE_CODE]: toStr(payload.package_code) || "job",
    [AT.SESSIONS.AMOUNT_THB]: pricing.amount_thb,
    [AT.SESSIONS.PAYMENT_STATUS]: "pending",
    [AT.SESSIONS.PAYMENT_REF]: paymentRef,
    [AT.SESSIONS.MEMBERSTACK_ID]: toStr(payload.memberstack_id),
    [AT.SESSIONS.CUSTOMER_TELEGRAM_USERNAME]: toStr(
      payload.customer_telegram_username
    ),
    [AT.SESSIONS.MODEL_TELEGRAM_USERNAME]: toStr(
      payload.model_telegram_username
    ),
    [AT.SESSIONS.LINE_USER_ID]: toStr(payload.line_user_id),
    [AT.SESSIONS.JOB_ID]: toStr(payload.job_id),

    [AT.SESSIONS.BASE_PRICE_THB]: pricing.base_price_thb,
    [AT.SESSIONS.ADDON_1_NAME]: pricing.addon_1_name,
    [AT.SESSIONS.ADDON_1_PRICE_THB]: pricing.addon_1_price_thb,
    [AT.SESSIONS.ADDON_2_NAME]: pricing.addon_2_name,
    [AT.SESSIONS.ADDON_2_PRICE_THB]: pricing.addon_2_price_thb,
    [AT.SESSIONS.ADDON_3_NAME]: pricing.addon_3_name,
    [AT.SESSIONS.ADDON_3_PRICE_THB]: pricing.addon_3_price_thb,
    [AT.SESSIONS.ADDON_4_NAME]: pricing.addon_4_name,
    [AT.SESSIONS.ADDON_4_PRICE_THB]: pricing.addon_4_price_thb,
    [AT.SESSIONS.ADDONS_TOTAL_THB]: pricing.addons_total_thb,
    [AT.SESSIONS.FINAL_PRICE_THB]: pricing.final_price_thb,

    client_name: toStr(payload.client_name) || identity.mmd_client_name,
    username: identity.username,
    mmd_client_name: identity.mmd_client_name,
    model_name: toStr(payload.model_name),
    job_type: toStr(payload.job_type),
    job_date: toStr(payload.job_date),
    start_time: toStr(payload.start_time),
    end_time: toStr(payload.end_time),
    location_name: toStr(payload.location_name),
    google_map_url: toStr(payload.google_map_url),
    note: toStr(payload.note),
  });
}

export async function upsertPaymentRecord(
  payload: CreateLinksPayload,
  pricing: NormalizedPricing,
  sessionId: string,
  paymentRef: string
) {
  if (!base) return { id: "mock_payment" };

  const table = base(ENV.AIRTABLE_TABLE_PAYMENTS);
  const now = new Date().toISOString();

  return await table.create({
    [AT.PAYMENTS.PAYMENT_REF]: paymentRef,
    [AT.PAYMENTS.PAYMENT_DATE]: now,
    [AT.PAYMENTS.AMOUNT]: pricing.amount_thb,
    [AT.PAYMENTS.PAYMENT_STATUS]: "pending",
    [AT.PAYMENTS.PAYMENT_METHOD]:
      toStr(payload.payment_method) || "promptpay",
    [AT.PAYMENTS.VERIFICATION_STATUS]: "pending",
    [AT.PAYMENTS.PAYMENT_INTENT_STATUS]: "manual_review",
    [AT.PAYMENTS.PACKAGE_CODE]: toStr(payload.package_code) || "job",
    [AT.PAYMENTS.CREATED_AT]: now,
    [AT.PAYMENTS.SESSION_ID]: sessionId,
    [AT.PAYMENTS.PAYMENT_STAGE]: toStr(payload.payment_type) || "full",
    [AT.PAYMENTS.PROVIDER]: toStr(payload.payment_method) || "promptpay",
    [AT.PAYMENTS.PROVIDER_TXN_ID]: "",
    [AT.PAYMENTS.NOTES]: toStr(payload.note),
  });
}
