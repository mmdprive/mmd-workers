import { handlePromo } from "./routes/promo";
import legacy from "./worker.legacy";

export default {
  async fetch(req: Request, env: any, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);

    if (req.method === "GET" && url.pathname === "/ping") {
      return json({ ok: true, ping: "OK" });
    }

    if (url.pathname === "/promo/validate") {
      return handlePromo(req, env);
    }

    // fallback ของเดิม: /bot/notify, /webhooks/paypal ฯลฯ
    return legacy.fetch(req, env, ctx);
  },
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
