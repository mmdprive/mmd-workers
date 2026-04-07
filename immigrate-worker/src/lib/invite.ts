function toStr(value: unknown): string {
  return String(value ?? "").trim();
}

function normalizeNicknameBase(value: unknown): string {
  const normalized = toStr(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");

  return normalized || "member";
}

function normalizeSuffix(value: unknown): string {
  return toStr(value)
    .toLowerCase()
    .replace(/[^a-z]/g, "")
    .slice(0, 2);
}

function hashSeed(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash >>> 0;
}

function deriveSuffix(explicit: unknown, seed: string): string {
  const direct = normalizeSuffix(explicit);
  if (direct.length === 2) return direct;

  const fallbackHash = hashSeed(seed || "member");
  const letters = "abcdefghijklmnopqrstuvwxyz";
  const a = letters[fallbackHash % 26];
  const b = letters[Math.floor(fallbackHash / 26) % 26];
  const hashed = `${a}${b}`;

  if (direct.length === 1) {
    return `${direct}${hashed[1]}`;
  }

  return hashed;
}

function normalizeUsername(value: unknown): string {
  return toStr(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");
}

export interface InviteIdentityInput {
  username?: string;
  nickname?: string;
  suffix_code?: string;
  mmd_client_name?: string;
  client_name?: string;
  folder_name?: string;
  line_user_id?: string;
  telegram_username?: string;
  memberstack_id?: string;
  email?: string;
  gmail?: string;
}

export interface InviteIdentity {
  username: string;
  nickname: string;
  suffix_code: string;
  mmd_client_name: string;
}

export type InviteRole = "customer" | "model";
export type InviteLane = "customer_onboarding" | "model_console";

export interface InviteTokenPayload {
  kind: "customer_invite";
  role: InviteRole;
  lane: InviteLane;
  invite_id: string;
  immigration_id?: string;
  username: string;
  mmd_client_name: string;
  nickname: string;
  suffix_code: string;
  email?: string;
  line_user_id?: string;
  telegram_username?: string;
  memberstack_id?: string;
  model_name?: string;
  model_record_id?: string;
  rules_url?: string;
  console_url?: string;
  requires_rules_ack?: boolean;
  requires_model_binding?: boolean;
  iat: number;
  exp: number;
}

function utf8Bytes(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function bytesToBinary(bytes: Uint8Array): string {
  let result = "";
  for (const byte of bytes) result += String.fromCharCode(byte);
  return result;
}

function binaryToBytes(binary: string): Uint8Array {
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function base64UrlEncodeUtf8(value: string): string {
  return btoa(bytesToBinary(utf8Bytes(value)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlDecodeUtf8(value: string): string {
  const normalized = value
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(value.length / 4) * 4, "=");

  return new TextDecoder().decode(binaryToBytes(atob(normalized)));
}

async function signValue(value: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    toArrayBuffer(utf8Bytes(secret)),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const signature = await crypto.subtle.sign("HMAC", key, toArrayBuffer(utf8Bytes(value)));
  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function getConfirmSecret(env: { CONFIRM_KEY?: string; INTERNAL_TOKEN?: string }): string {
  return toStr(env.CONFIRM_KEY) || toStr(env.INTERNAL_TOKEN);
}

export function generateUsername(input: InviteIdentityInput): string {
  const manual = normalizeUsername(input.username);
  if (manual) return manual;

  const nicknameBase = normalizeNicknameBase(
    input.folder_name || input.nickname || input.mmd_client_name || input.client_name,
  ).slice(0, 24);

  const seed = [
    toStr(input.line_user_id),
    toStr(input.telegram_username),
    toStr(input.memberstack_id),
    toStr(input.email || input.gmail).toLowerCase(),
    toStr(input.folder_name),
    toStr(input.client_name),
    toStr(input.nickname),
  ]
    .filter(Boolean)
    .join("|");

  const suffix = deriveSuffix(input.suffix_code, seed || nicknameBase);
  return `${nicknameBase}_${suffix}`;
}

export function parseInviteIdentity(input: InviteIdentityInput): InviteIdentity {
  const username = generateUsername(input);
  const parts = username.split(/[_\s-]+/).filter(Boolean);
  const nickname =
    toStr(input.nickname || input.folder_name) || normalizeNicknameBase(parts[0] || input.client_name || input.folder_name);
  const suffix_code = deriveSuffix(
    input.suffix_code || parts[1],
    [
      toStr(input.line_user_id),
      toStr(input.telegram_username),
      toStr(input.memberstack_id),
      toStr(input.email || input.gmail).toLowerCase(),
      toStr(input.folder_name),
      toStr(input.client_name),
    ]
      .filter(Boolean)
      .join("|") || username,
  );
  const mmd_client_name = toStr(input.mmd_client_name || input.client_name || input.folder_name) || nickname;

  return {
    username,
    nickname,
    suffix_code,
    mmd_client_name,
  };
}

export function buildAbsoluteUrl(baseUrl: string, input: string | undefined, fallbackPath: string): string {
  const raw = toStr(input);
  if (raw.startsWith("http://") || raw.startsWith("https://")) return raw;

  const base = toStr(baseUrl).replace(/\/+$/, "");
  const path = raw || fallbackPath;
  return `${base}${path.startsWith("/") ? "" : "/"}${path}`;
}

export async function signInviteToken(payload: InviteTokenPayload, secret: string): Promise<string> {
  if (!secret) throw new Error("missing_confirm_key");

  const encodedPayload = base64UrlEncodeUtf8(JSON.stringify(payload));
  const signature = await signValue(encodedPayload, secret);
  return `${encodedPayload}.${signature}`;
}

export async function verifyInviteToken(token: string, secret: string): Promise<InviteTokenPayload> {
  if (!secret) throw new Error("missing_confirm_key");

  const parts = token.split(".");
  if (parts.length !== 2) throw new Error("invalid_token_format");

  const [encodedPayload, signature] = parts;
  const expected = await signValue(encodedPayload, secret);
  if (signature !== expected) throw new Error("invalid_token_signature");

  const payload = JSON.parse(base64UrlDecodeUtf8(encodedPayload)) as InviteTokenPayload;
  const now = Math.floor(Date.now() / 1000);

  if (
    payload.kind !== "customer_invite" ||
    (payload.role !== "customer" && payload.role !== "model") ||
    (payload.lane !== "customer_onboarding" && payload.lane !== "model_console") ||
    !payload.invite_id ||
    !payload.username ||
    !payload.nickname ||
    !payload.exp
  ) {
    throw new Error("invalid_invite_payload");
  }

  if (payload.exp <= now) throw new Error("expired_invite_token");

  return payload;
}

export async function generateInviteLink(
  env: { CONFIRM_KEY?: string; INTERNAL_TOKEN?: string; PUBLIC_WEB_BASE_URL?: string },
  input: InviteIdentity & {
    invite_id: string;
    immigration_id?: string;
    email?: string;
    line_user_id?: string;
    telegram_username?: string;
    memberstack_id?: string;
    invite_page?: string;
    expires_in_hours?: number;
    role?: InviteRole;
    lane?: InviteLane;
    model_name?: string;
    model_record_id?: string;
    rules_url?: string;
    console_url?: string;
    requires_rules_ack?: boolean;
    requires_model_binding?: boolean;
  },
): Promise<{
  onboarding_url: string;
  customer_onboarding_url: string;
  customer_invite_t: string;
  expires_at: string;
}> {
  const secret = getConfirmSecret(env);
  const now = Math.floor(Date.now() / 1000);
  const expiresInHours = Math.max(1, Math.min(24 * 30, Number(input.expires_in_hours || 24 * 7)));
  const role: InviteRole = input.role === "model" ? "model" : "customer";
  const lane: InviteLane = input.lane || (role === "model" ? "model_console" : "customer_onboarding");
  const payload: InviteTokenPayload = {
    kind: "customer_invite",
    role,
    lane,
    invite_id: input.invite_id,
    immigration_id: toStr(input.immigration_id),
    username: toStr(input.username).toLowerCase(),
    nickname: toStr(input.nickname),
    suffix_code: toStr(input.suffix_code).toLowerCase(),
    mmd_client_name: toStr(input.mmd_client_name),
    email: toStr(input.email).toLowerCase(),
    line_user_id: toStr(input.line_user_id),
    telegram_username: toStr(input.telegram_username),
    memberstack_id: toStr(input.memberstack_id),
    model_name: toStr(input.model_name),
    model_record_id: toStr(input.model_record_id),
    rules_url: toStr(input.rules_url),
    console_url: toStr(input.console_url),
    requires_rules_ack:
      input.requires_rules_ack == null ? role === "model" : Boolean(input.requires_rules_ack),
    requires_model_binding:
      input.requires_model_binding == null ? role === "model" : Boolean(input.requires_model_binding),
    iat: now,
    exp: now + expiresInHours * 3600,
  };

  const token = await signInviteToken(payload, secret);
  const invitePage = buildAbsoluteUrl(
    toStr(env.PUBLIC_WEB_BASE_URL) || "https://mmdbkk.com",
    input.invite_page,
    "/member/onboarding",
  );

  return {
    onboarding_url: `${invitePage}?t=${encodeURIComponent(token)}`,
    customer_invite_t: token,
    customer_onboarding_url: `${invitePage}?t=${encodeURIComponent(token)}`,
    expires_at: new Date(payload.exp * 1000).toISOString(),
  };
}
