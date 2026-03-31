export type ClientTier = "standard" | "premium" | "vip" | "svip" | "blackcard";
export type Channel = "web" | "line" | "telegram" | "internal";
export type HistorySignal = "none" | "low" | "medium" | "high";

export interface ChatMessageRequest {
  text: string;
  member_id?: string;
  conversation_id?: string;
  deal_id?: string;
  channel?: Channel;
  client_tier?: ClientTier;
  history_signal?: HistorySignal;
}

export interface ChatMessageResponse {
  ok: boolean;
  reply?: string;
  deal_id?: string;
  intake?: unknown;
  deal?: unknown;
  meta?: unknown;
}

export function buildChatMessageRequest(
  input: ChatMessageRequest,
): ChatMessageRequest {
  return {
    text: input.text,
    member_id: input.member_id,
    conversation_id: input.conversation_id,
    deal_id: input.deal_id,
    channel: input.channel ?? "web",
    client_tier: input.client_tier ?? "standard",
    history_signal: input.history_signal ?? "none",
  };
}

export async function sendChatMessage(
  baseUrl: string,
  payload: ChatMessageRequest,
): Promise<ChatMessageResponse> {
  const response = await fetch(`${baseUrl.replace(/\/+$/, "")}/v1/chat/message`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  return (await response.json()) as ChatMessageResponse;
}
