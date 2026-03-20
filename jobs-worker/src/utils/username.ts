export type ParsedIdentity = {
  username: string;
  mmd_client_name: string;
  nickname: string;
  suffix_code: string;
};

function toStr(value: unknown): string {
  return String(value ?? "").trim();
}

export function parseIdentity(input: {
  username?: string;
  mmd_client_name?: string;
  nickname?: string;
  suffix_code?: string;
}): ParsedIdentity {
  const username = toStr(input.username).toLowerCase();

  if (!username) {
    throw new Error("missing_username");
  }

  const parts = username.split(/\s+/);
  const nickname = toStr(input.nickname) || parts[0] || "";
  const suffix_code = toStr(input.suffix_code) || parts[1] || "";
  const mmd_client_name = toStr(input.mmd_client_name) || nickname;

  return {
    username,
    mmd_client_name,
    nickname,
    suffix_code,
  };
}
