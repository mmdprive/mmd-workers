import { json, safeJson, HttpError } from "../../lib/http.js";
import { requireInternalToken } from "../../lib/guard.js";
import { telegramNotify } from "../../lib/telegram.js";

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const path = url.pathname;

    try {
      if (req.method === "GET" && (path === "/" || path === "/health")) {
        return json({ ok: true, lock: "v2026-LOCK-01i", worker: "telegram" }, 200);
      }

      // Telegram webhook (ถ้าจะใช้จริง ค่อยทำ parser/commands เพิ่ม)
      if (path === "/telegram/webhook" && req.method === "POST") {
        const update = await safeJson(req);
        if (!update) return json({ ok: false, error: "invalid_json" }, 400);
        return json({ ok: true, received: true }, 200);
      }

      // Optional: internal send (ให้ worker อื่นเรียกผ่านตัวนี้)
      if (path === "/telegram/internal/send" && req.method === "POST") {
        requireInternalToken(req, env);
        const body = await safeJson(req);
        if (!body) return json({ ok: false, error: "invalid_json" }, 400);
        const tg = await telegramNotify(body, env);
        return json({ ok: true, telegram: tg }, 200);
      }

      return json({ ok: false, error: "not_found" }, 404);
    } catch (err) {
      if (err instanceof HttpError) return json(err.body, err.status);
      return json({ ok: false, error: "server_error", detail: String(err?.message || err) }, 500);
    }
  },
};
