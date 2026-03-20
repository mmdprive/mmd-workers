import express, { Request, Response } from "express";
import { ENV, AIRTABLE_ENABLED } from "./config/env";
import { parseIdentity } from "./utils/username";
import { normalizePricing } from "./utils/pricing";
import {
  upsertClient,
  upsertSessionRecord,
  upsertPaymentRecord,
  type CreateLinksPayload,
} from "./services/airtable.service";
import { generateSecureConfirmationLinks } from "./services/confirm-links.service";
import { randomUUID } from "crypto";

const app = express();
app.use(express.json());

function toStr(value: unknown): string {
  return String(value ?? "").trim();
}

function requiredString(value: unknown, field: string): string {
  const s = toStr(value);
  if (!s) throw new Error(`missing_${field}`);
  return s;
}

function makeSessionId(): string {
  return `sess_${Date.now().toString(36)}_${randomUUID().slice(0, 8)}`;
}

function makePaymentRef(): string {
  return `pay_${Date.now().toString(36)}_${randomUUID().slice(0, 8)}`;
}

function requireJobFields(payload: CreateLinksPayload) {
  requiredString(payload.client_name, "client_name");
  requiredString(payload.username, "username");
  requiredString(payload.model_name, "model_name");
  requiredString(payload.job_type, "job_type");
  requiredString(payload.job_date, "job_date");
  requiredString(payload.start_time, "start_time");
  requiredString(payload.end_time, "end_time");
  requiredString(payload.location_name, "location_name");
}

function safeJsonError(error: unknown): string {
  if (error instanceof Error) return error.message;

  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

async function sendInternalTelegramNotify(input: unknown) {
  console.log("telegram_notify", input);
}

app.get("/v1/jobs/health", (_req: Request, res: Response) => {
  res.json({
    ok: true,
    service: "jobs-worker",
    airtable_enabled: AIRTABLE_ENABLED,
    secure_token_enabled: Boolean(ENV.CONFIRM_KEY),
  });
});

app.post("/v1/jobs/create-links", async (req: Request, res: Response) => {
  try {
    const payload = req.body as CreateLinksPayload;

    requireJobFields(payload);

    const identity = parseIdentity(payload);
    const pricing = normalizePricing(payload);

    const session_id = makeSessionId();
    const payment_ref = makePaymentRef();

    const client = await upsertClient(payload, identity);

    const session = await upsertSessionRecord(
      payload,
      identity,
      pricing,
      session_id,
      payment_ref
    );

    const payment = await upsertPaymentRecord(
      payload,
      pricing,
      session_id,
      payment_ref
    );

    const links = await generateSecureConfirmationLinks({
      session_id,
      payment_ref,
      confirm_page: payload.confirm_page,
      model_confirm_page: payload.model_confirm_page,
    });

    await sendInternalTelegramNotify({
      session_id,
      payment_ref,
      client_name: toStr(payload.client_name) || identity.mmd_client_name,
      model_name: toStr(payload.model_name),
      amount_thb: pricing.amount_thb,
      customer_confirmation_url: links.customer_confirmation_url,
      model_confirmation_url: links.model_confirmation_url,
    });

    console.log("create-links result", {
      session_id,
      payment_ref,
      amount_thb: pricing.amount_thb,
      customer_confirmation_url: links.customer_confirmation_url,
      model_confirmation_url: links.model_confirmation_url,
    });

    res.json({
      ok: true,
      session_id,
      payment_ref,
      amount_thb: pricing.amount_thb,
      customer_confirmation_url: links.customer_confirmation_url,
      model_confirmation_url: links.model_confirmation_url,
      debug: {
        client_id: client?.id || null,
        session_record_id: session?.id || null,
        payment_record_id: payment?.id || null,
        airtable_enabled: AIRTABLE_ENABLED,
        secure_token_enabled: Boolean(ENV.CONFIRM_KEY),
      },
    });
  } catch (error) {
    console.error("create-links error:", error);

    res.status(400).json({
      ok: false,
      error: safeJsonError(error),
    });
  }
});

app.listen(ENV.PORT, () => {
  console.log(`🚀 jobs-worker running on port ${ENV.PORT}`);
});
