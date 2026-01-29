// realtime-worker — LOCK v2026-LOCK-RT-01
// Purpose: WebSocket rooms (chat/location), room-token issuing via internal endpoint.
// Video call: intended via provider tokens (Daily/Twilio) — not implemented in this minimal deploy.

export class RoomDO {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.sockets = new Set();
  }

  async fetch(req) {
    const url = new URL(req.url);

    // Internal: store room tokens
    if (url.hostname === "do.local" && url.pathname === "/store_tokens" && req.method === "POST") {
      const data = await req.json().catch(() => null);
      if (!data?.customer || !data?.model) return new Response("bad_request", { status: 400 });
      await this.state.storage.put("room_tokens", { customer: String(data.customer), model: String(data.model) });
      return new Response("ok", { status: 200 });
    }

    // WebSocket upgrade
    if (url.pathname === "/v1/rt/ws") {
      const token = (url.searchParams.get("token") || "").trim();
      const room = (url.searchParams.get("room") || "").trim();

      if (!room) return new Response("bad_request", { status: 400 });

      const ok = await this._checkRoomToken(token);
      if (!ok) return new Response("unauthorized", { status: 401 });

      const pair = new WebSocketPair();
      const client = pair[0];
      const server = pair[1];

      server.accept();
      this.sockets.add(server);

      server.addEventListener("message", (evt) => this._onMessage(server, evt.data, room));
      server.addEventListener("close", () => this.sockets.delete(server));
      server.addEventListener("error", () => this.sockets.delete(server));

      // hello + last_location (if any)
      const lastLoc = await this.state.storage.get("last_location");
      server.send(JSON.stringify({ type: "hello", room, ts: Date.now(), last_location: lastLoc || null }));

      return new Response(null, { status: 101, webSocket: client });
    }

    return new Response("not_found", { status: 404 });
  }

  async _checkRoomToken(token) {
    if (!token) return false;
    const data = await this.state.storage.get("room_tokens");
    if (!data) return false;
    return token === data.customer || token === data.model;
  }

  async _onMessage(ws, raw, room) {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    // Very small allowlist
    const type = String(msg?.type || "");
    if (!["ping", "chat", "location", "photo_meta"].includes(type)) return;

    if (type === "ping") {
      ws.send(JSON.stringify({ type: "pong", ts: Date.now() }));
      return;
    }

    const out = { ...msg, room, server_ts: Date.now() };
    const text = JSON.stringify(out);

    for (const s of this.sockets) {
      try { s.send(text); } catch {}
    }

    if (type === "location" && typeof msg.lat === "number" && typeof msg.lng === "number") {
      await this.state.storage.put("last_location", { lat: msg.lat, lng: msg.lng, ts: Date.now() });
    }
  }
}

function corsHeaders(origin, allowedCsv) {
  const allowed = (allowedCsv || "").split(",").map(s => s.trim()).filter(Boolean);
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

function requireInternal(req, env) {
  const tok = (req.headers.get("X-Internal-Token") || "").trim();
  return tok && tok === (env.INTERNAL_TOKEN || "");
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const method = req.method.toUpperCase();
    const origin = req.headers.get("Origin") || "";
    const cors = corsHeaders(origin, env.ALLOWED_ORIGINS);

    if (method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

    if (method === "GET" && (url.pathname === "/" || url.pathname === "/health")) {
      return new Response(JSON.stringify({ ok: true, worker: "realtime-worker" }), {
        status: 200,
        headers: new Headers({ "Content-Type": "application/json", ...Object.fromEntries(cors) }),
      });
    }

    // Internal: open room and issue tokens
    if (method === "POST" && url.pathname === "/v1/rt/room/open") {
      if (!requireInternal(req, env)) return new Response("unauthorized", { status: 401, headers: cors });

      const body = await req.json().catch(() => null);
      if (!body?.job_id) return new Response("bad_request", { status: 400, headers: cors });

      const jobId = String(body.job_id);
      const roomName = `room:${jobId}`;

      const customer = crypto.randomUUID();
      const model = crypto.randomUUID();

      const id = env.ROOM.idFromName(roomName);
      const stub = env.ROOM.get(id);

      await stub.fetch("https://do.local/store_tokens", {
        method: "POST",
        body: JSON.stringify({ customer, model }),
      });

      const webBase = String(env.WEB_BASE_URL || "").replace(/\/+$/, "");
      // You can host /live in Webflow and point it to WS endpoint
      const liveCustomerUrl = `${webBase}/live?room=${encodeURIComponent(roomName)}&token=${encodeURIComponent(customer)}`;
      const liveModelUrl = `${webBase}/live?room=${encodeURIComponent(roomName)}&token=${encodeURIComponent(model)}`;

      return new Response(JSON.stringify({
        ok: true,
        job_id: jobId,
        room: roomName,
        live_customer_url: liveCustomerUrl,
        live_model_url: liveModelUrl
      }), {
        status: 200,
        headers: new Headers({ "Content-Type": "application/json", ...Object.fromEntries(cors) }),
      });
    }

    // Public: WebSocket endpoint routed to DO
    if (method === "GET" && url.pathname === "/v1/rt/ws") {
      const room = (url.searchParams.get("room") || "").trim();
      if (!room) return new Response("bad_request", { status: 400, headers: cors });
      const id = env.ROOM.idFromName(room);
      return env.ROOM.get(id).fetch(req);
    }

    return new Response("not_found", { status: 404, headers: cors });
  },
};
