import type {
  Env,
  ExtractPreferencesRequest,
  HealthResponse,
  MatchRequest,
  ReplyRequest,
} from "./types";
import { badRequest, internalError, json, unauthorized } from "./lib/response";
import { extractPreferences } from "./lib/extract";
import { matchModels } from "./lib/match";
import { draftReply } from "./lib/reply";

function isAuthorized(request: Request, env: Env): boolean {
  const auth = request.headers.get("authorization");
  if (!auth) return false;
  return auth === `Bearer ${env.INTERNAL_TOKEN}`;
}

async function parseJson<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      const url = new URL(request.url);
      const path = url.pathname;
      const method = request.method.toUpperCase();

      if (path === "/v1/ai/health" && method === "GET") {
        const body: HealthResponse = {
          ok: true,
          service: "ai-worker",
          version: "v1",
        };
        return json(body);
      }

      if (!isAuthorized(request, env)) {
        return unauthorized();
      }

      if (path === "/v1/ai/extract-preferences" && method === "POST") {
        const input = await parseJson<ExtractPreferencesRequest>(request);
        if (!input?.text) {
          return badRequest("text is required");
        }
        return json(extractPreferences(input));
      }

      if (path === "/v1/ai/match" && method === "POST") {
        const input = await parseJson<MatchRequest>(request);
        if (!input?.request || !Array.isArray(input.models)) {
          return badRequest("request and models are required");
        }
        return json(matchModels(input));
      }

      if (path === "/v1/ai/reply" && method === "POST") {
        const input = await parseJson<ReplyRequest>(request);
        if (!input?.matches || !Array.isArray(input.matches)) {
          return badRequest("matches array is required");
        }
        return json(draftReply(input));
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
      console.error("ai-worker error", error);
      return internalError();
    }
  },
};
