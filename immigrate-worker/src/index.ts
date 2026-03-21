import { handleSessionStatus } from "./session-status";

export interface Env {
  AIRTABLE_API_KEY: string;
  AIRTABLE_BASE_ID: string;
  AIRTABLE_TABLE_SESSIONS: string;
  INTERNAL_TOKEN: string;
  IMMIGRATE_WRITE_ENABLED?: string;
}

function json(data: unknown, status = 200, requestId?: string): Response {
  return new Response(
    JSON.stringify(
      requestId ? { ...((data as Record<string, unknown>) || {}), request_id: requestId } : data,
      null,
      2
    ),
    {
      status,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
      },
    }
  );
}

function getRequestId(): string {
  return crypto.randomUUID();
}

function isAuthorized(request: Request, env: Env): boolean {
  const auth = request.headers.get("Authorization") || "";
  const expected = `Bearer ${env.INTERNAL_TOKEN || ""}`;
  return auth === expected;
}

function withCors(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const requestId = getRequestId();
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return withCors(new Response(null, { status: 204 }));
    }

    if (request.method === "GET" && url.pathname === "/health") {
      return withCors(
        json(
          {
            ok: true,
            data: {
              service: "immigrate-worker",
              ok: true,
              write_enabled: String(env.IMMIGRATE_WRITE_ENABLED || "false") === "true",
            },
          },
          200,
          requestId
        )
      );
    }

    if (request.method === "POST" && url.pathname === "/v1/immigrate/session/status") {
      if (!isAuthorized(request, env)) {
        return withCors(
          json(
            {
              ok: false,
              error: "Unauthorized",
            },
            401,
            requestId
          )
        );
      }

      if (String(env.IMMIGRATE_WRITE_ENABLED || "false") !== "true") {
        return withCors(
          json(
            {
              ok: false,
              error: "Writes are disabled",
            },
            403,
            requestId
          )
        );
      }

      return withCors(await handleSessionStatus(request, env, requestId));
    }

    return withCors(
      json(
        {
          ok: false,
          error: "Not Found",
        },
        404,
        requestId
      )
    );
  },
};