// telegram/src/index.ts
import { handlePromo } from "./routes/promo";
import legacy from "./worker.legacy";

type Env = any;

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);

    // health
    if (req.method === "GET" && url.pathname === "/ping") {
      return json({ ok: true, service: "mmd-telegram-topic-router", lock: "v2026-LOCK-01k" });
    }

    // promo (ต้องมาก่อน legacy)
    if (url.pathname === "/promo/validate") {
      return handlePromo(req, env);
    }

    // fallback ของเดิมทั้งหมด
    return legacy.fetch(req, env, ctx);
  },
};
