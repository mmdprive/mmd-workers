import crypto from "crypto";

export type ConfirmTokenPayload = {
  kind: "customer_confirm" | "model_confirm";
  role: "customer" | "model";
  session_id: string;
  payment_ref: string;
  iat: number;
};

function base64UrlEncode(input: string): string {
  return Buffer.from(input, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlDecode(input: string): string {
  const normalized = input
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(input.length / 4) * 4, "=");

  return Buffer.from(normalized, "base64").toString("utf8");
}

function signValue(value: string, secret: string): string {
  return crypto
    .createHmac("sha256", secret)
    .update(value)
    .digest("hex");
}

export function signConfirmToken(
  payload: ConfirmTokenPayload,
  secret: string
): string {
  if (!secret) {
    throw new Error("missing_confirm_key");
  }

  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = signValue(encodedPayload, secret);

  return `${encodedPayload}.${signature}`;
}

export function verifyConfirmToken(
  token: string,
  secret: string
): ConfirmTokenPayload {
  if (!secret) {
    throw new Error("missing_confirm_key");
  }

  const parts = token.split(".");
  if (parts.length !== 2) {
    throw new Error("invalid_token_format");
  }

  const [encodedPayload, signature] = parts;
  const expected = signValue(encodedPayload, secret);

  if (signature !== expected) {
    throw new Error("invalid_token_signature");
  }

  const raw = base64UrlDecode(encodedPayload);
  const parsed = JSON.parse(raw) as ConfirmTokenPayload;

  if (!parsed.session_id || !parsed.payment_ref || !parsed.kind || !parsed.role) {
    throw new Error("invalid_token_payload");
  }

  return parsed;
}
