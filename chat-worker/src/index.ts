import type {
  ChatIncomingRequest,
  ChatIncomingResponse,
  Env,
  HealthResponse,
} from "./types";
import { handleClientMessageWithAi } from "./lib/ai-flow";
import { badRequest, internalError, json } from "./lib/response";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      const url = new URL(request.url);

      if (request.method === "GET" && url.pathname === "/v1/chat/health") {
        const body: HealthResponse = {
          ok: true,
          service: "chat-worker",
          version: "v1",
        };
        return json(body);
      }

      if (request.method === "POST" && url.pathname === "/v1/chat/incoming") {
        const body = (await request.json()) as Partial<ChatIncomingRequest>;

        if (!body.clientId || !body.clientTier || !body.messageText || !body.channel) {
          return badRequest(
            "clientId, clientTier, messageText, and channel are required",
          );
        }

        const result = await handleClientMessageWithAi(env, {
          clientId: body.clientId,
          clientTier: body.clientTier,
          messageText: body.messageText,
          channel: body.channel,
        });

        const responseBody: ChatIncomingResponse = {
          ok: true,
          reply_text: result.replyText,
          requires_human_review: result.requiresHumanReview,
          debug: result.debug,
        };

        return json(responseBody);
      }

      return json(
        {
          ok: false,
          error: {
            code: "NOT_FOUND",
            message: "Route not found",
          },
        },
        { status: 404 },
      );
    } catch (error) {
      console.error("chat-worker error", error);
      return internalError();
    }
  },
};
