import { ENV } from "../config/env";
import { signConfirmToken } from "../utils/token";

type GenerateSecureLinksInput = {
  session_id: string;
  payment_ref: string;
  confirm_page?: string;
  model_confirm_page?: string;
};

function toStr(value: unknown): string {
  return String(value ?? "").trim();
}

function buildAbsoluteUrl(input: string | undefined, fallbackPath: string): string {
  const raw = toStr(input);
  if (raw.startsWith("http://") || raw.startsWith("https://")) return raw;

  const baseUrl = ENV.WEB_BASE_URL.replace(/\/+$/, "");
  const path = raw || fallbackPath;

  return `${baseUrl}${path.startsWith("/") ? "" : "/"}${path}`;
}

export async function generateSecureConfirmationLinks(
  input: GenerateSecureLinksInput
) {
  const customerPage = buildAbsoluteUrl(
    input.confirm_page,
    "/confirm/job-confirmation"
  );

  const modelPage = buildAbsoluteUrl(
    input.model_confirm_page,
    "/confirm/job-model"
  );

  const now = Math.floor(Date.now() / 1000);

  const customer_t = signConfirmToken(
    {
      kind: "customer_confirm",
      role: "customer",
      session_id: input.session_id,
      payment_ref: input.payment_ref,
      iat: now,
    },
    ENV.CONFIRM_KEY
  );

  const model_t = signConfirmToken(
    {
      kind: "model_confirm",
      role: "model",
      session_id: input.session_id,
      payment_ref: input.payment_ref,
      iat: now,
    },
    ENV.CONFIRM_KEY
  );

  return {
    customer_t,
    model_t,
    customer_confirmation_url: `${customerPage}?t=${encodeURIComponent(customer_t)}`,
    model_confirmation_url: `${modelPage}?t=${encodeURIComponent(model_t)}`,
  };
}
