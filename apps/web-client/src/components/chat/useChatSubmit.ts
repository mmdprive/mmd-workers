import { useState } from "react";
import {
  buildChatMessageRequest,
  sendChatMessage,
  type ChatMessageRequest,
  type ChatMessageResponse,
} from "@/lib/chat-api";

export function useChatSubmit(baseUrl: string) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lastResponse, setLastResponse] = useState<ChatMessageResponse | null>(null);

  async function submit(payload: ChatMessageRequest): Promise<ChatMessageResponse> {
    setIsSubmitting(true);
    try {
      const response = await sendChatMessage(
        baseUrl,
        buildChatMessageRequest(payload),
      );
      setLastResponse(response);
      return response;
    } finally {
      setIsSubmitting(false);
    }
  }

  return {
    isSubmitting,
    lastResponse,
    submit,
  };
}
