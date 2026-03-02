// chat-worker — LOCK v2026-03-02 (starter)
// Purpose: Member-facing AI chatbot gateway (separate from telegram-worker which is system/internal only)
//
// Endpoints:
//   GET  /health
//   POST /v1/chat/message   (public/member)  -> returns ai reply
//   POST /v1/chat/internal  (internal)       -> for system workers (telegram-worker/events-worker) to relay messages
//
// ENV (vars/secrets suggestion):
//   INTERNAL_TOKEN (secret)          // shared internal auth token
//   ALLOWED_ORIGINS (var)            // CORS allowlist CSV
//   AI_PROVIDER (var) "openai"|"mock"
//   OPENAI_API_KEY (secret)          // if AI_PROVIDER=openai
//   OPENAI_MODEL (var) e.g. "gpt-4.1-mini" (example)
//   CHAT_SESSIONS_KV (KV namespace)  // optional: store convo context per member_id

function corsHeaders(origin, allowedCsv) {
  const allowed = (allowedCsv || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const ok = origin && allowed.includes(origin);

  const h = new Headers();
  if (ok) {
    h.set("Access-Control-Allow-Origin", origin);
    h.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    h.set("Access-Control-Allow-Headers", "Content-Type, X-Internal-Token");
    h.set("Access-Control-Allow-Credentials", "true");
  }
  return h;
}

function json(data, { status = 200, cors } = {}) {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (cors) for (const [k, v] of cors.entries()) headers.set(k, v);
  return new Response(JSON.stringify(data), { status, headers });
}

function requireInternal(req, env) {
  const tok = (req.headers.get("X-Internal-Token") || "").trim();
  return tok && tok === (env.INTERNAL_TOKEN || "");
}

async function readJson(req) {
  const ct = (req.headers.get("Content-Type") || "").toLowerCase();
  if (!ct.includes("application/json")) return null;
  return req.json().catch(() => null);
}

// ---- AI adapters ----
async function aiReplyMock(input) {
  const text = String(input?.text || "");
  return { text: `mock_reply: ${text}`, meta: { provider: "mock" } };
}

async function aiReplyOpenAI(env, input) {
  // Minimal OpenAI REST call (no SDK) — keep it simple
  const apiKey = env.OPENAI_API_KEY;
  const model = env.OPENAI_MODEL || "gpt-4.1-mini";
  if (!apiKey) return { text: "ai_unconfigured", meta: { provider: "openai" } };

  const payload = {
    model,
    // Use Responses API style-like shape (kept generic); adjust if you standardize later
    input: [
      {
        role: "user",
        content: [{ type: "text", text: String(input?.text || "") }],
      },
    ],
  };

  const r = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!r.ok) {
    const errTxt = await r.text().catch(() => "");
    return { text: "ai_error", meta: { provider: "openai", status: r.status, err: errTxt.slice(0, 300) } };
  }

  const out = await r.json().catch(() => null);

  // Try best-effort extract
  const text =
    out?.output_text ||
    out?.output?.[0]?.content?.find?.((c) => c.type === "output_text")?.text ||
    "ai_ok";

  return { text, meta: { provider: "openai", model } };
}

async function getAiReply(env, input) {
  const provider = (env.AI_PROVIDER || "mock").toLowerCase();
  if (provider === "openai") return aiReplyOpenAI(env, input);
  return aiReplyMock(input);
}

// Optional: store last N messages in KV for continuity (keep tiny)
async function appendHistory(env, memberId, role, text) {
  if (!env.CHAT_SESSIONS_KV || !memberId) return;
  const key = `chat:${memberId}`;
  const old = await env.CHAT_SESSIONS_KV.get(key, { type: "json" }).catch(() => null);
  const arr = Array.isArray(old) ? old : [];
  arr.push({ role, text: String(text || ""), ts: Date.now() });
  const trimmed = arr.slice(-12);
  await env.CHAT_SESSIONS_KV.put(key, JSON.stringify(trimmed), { expirationTtl: 60 * 60 * 24 * 7 }); // 7d
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const method = req.method.toUpperCase();
    const origin = req.headers.get("Origin") || "";
    const cors = corsHeaders(origin, env.ALLOWED_ORIGINS);

    if (method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

    if (method === "GET" && (url.pathname === "/" || url.pathname === "/health")) {
      return json({ ok: true, worker: "chat-worker", date: "2026-03-02" }, { cors });
    }

    // Public/member endpoint
    if (method === "POST" && url.pathname === "/v1/chat/message") {
      const body = await readJson(req);
      if (!body?.text) return json({ ok: false, error: "bad_request" }, { status: 400, cors });

      const member_id = body.member_id ? String(body.member_id) : "";
      const text = String(body.text || "");

      await appendHistory(env, member_id, "user", text);

      const reply = await getAiReply(env, { member_id, text });

      await appendHistory(env, member_id, "assistant", reply.text);

      return json({ ok: true, reply: reply.text, meta: reply.meta }, { cors });
    }

    // Internal relay endpoint (system workers)
    if (method === "POST" && url.pathname === "/v1/chat/internal") {
      if (!requireInternal(req, env)) return json({ ok: false, error: "unauthorized" }, { status: 401, cors });

      const body = await readJson(req);
      if (!body?.text) return json({ ok: false, error: "bad_request" }, { status: 400, cors });

      const member_id = body.member_id ? String(body.member_id) : "";
      const text = String(body.text || "");
      const context = body.context || null;

      const reply = await getAiReply(env, { member_id, text, context });

      return json({ ok: true, reply: reply.text, meta: reply.meta }, { cors });
    }

    return new Response("not_found", { status: 404, headers: cors });
  },
};
