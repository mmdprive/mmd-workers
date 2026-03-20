import type { Env, HealthResponse, ModelsListLiteResponse } from "./types";
import { isAuthorized } from "./lib/auth";
import { listModelCardsLite } from "./lib/airtable";
import { internalError, json, unauthorized } from "./lib/response";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      const url = new URL(request.url);

      if (request.method === "GET" && url.pathname === "/v1/admin/health") {
        const body: HealthResponse = {
          ok: true,
          service: "admin-worker",
          version: "v1",
        };
        return json(body);
      }

      if (!isAuthorized(request, env)) {
        return unauthorized();
      }

      if (request.method === "GET" && url.pathname === "/v1/admin/models/list-lite") {
        const models = await listModelCardsLite(env);

        const body: ModelsListLiteResponse = {
          ok: true,
          models,
          count: models.length,
        };

        return json(body);
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
      console.error("admin-worker error", error);
      return internalError();
    }
  },
};
