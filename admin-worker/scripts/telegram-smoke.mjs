import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const DEFAULT_BASE_URL = "https://admin-worker.malemodel-bkk.workers.dev";
const DEFAULT_CONFIG_PATH = path.resolve(
  process.cwd(),
  "scripts/telegram-smoke.config.json.example",
);
const DEFAULT_PREFIX = "🧪 TEST ONLY";

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function asTrimmedString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function pickAuthHeaders() {
  const bearer = asTrimmedString(process.env.ADMIN_BEARER);
  if (bearer) {
    return { Authorization: `Bearer ${bearer}` };
  }

  const confirmKey = asTrimmedString(process.env.CONFIRM_KEY);
  if (confirmKey) {
    return { "X-Confirm-Key": confirmKey };
  }

  throw new Error("missing ADMIN_BEARER or CONFIRM_KEY");
}

function loadConfig() {
  const explicitPath = asTrimmedString(process.env.TELEGRAM_SMOKE_CONFIG);
  const inlineJson = asTrimmedString(process.env.TELEGRAM_SMOKE_ROOMS_JSON);

  if (inlineJson) {
    return JSON.parse(inlineJson);
  }

  const filePath = explicitPath || DEFAULT_CONFIG_PATH;
  if (!fs.existsSync(filePath)) {
    throw new Error(
      `missing config file: ${filePath}. Set TELEGRAM_SMOKE_CONFIG or TELEGRAM_SMOKE_ROOMS_JSON.`,
    );
  }

  return readJson(filePath);
}

function resolveRooms(config) {
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    throw new Error("config must be a JSON object");
  }

  const defaultChatId = asTrimmedString(config.chat_id || process.env.TELEGRAM_CHAT_ID);
  if (!defaultChatId) {
    throw new Error("config.chat_id or TELEGRAM_CHAT_ID is required");
  }

  if (!Array.isArray(config.rooms) || config.rooms.length === 0) {
    throw new Error("config.rooms must contain at least one room");
  }

  return config.rooms.map((room, index) => {
    const label = asTrimmedString(room?.label || room?.name || room?.key);
    const chatId = asTrimmedString(room?.chat_id || defaultChatId);
    const threadEnv = asTrimmedString(room?.thread_env);
    const fromEnv = threadEnv ? process.env[threadEnv] : "";
    const rawThreadId = room?.message_thread_id ?? fromEnv;
    const threadId = Number(rawThreadId);

    if (!label) throw new Error(`rooms[${index}] label/key is required`);
    if (!chatId) throw new Error(`rooms[${index}] chat_id is required`);
    if (!Number.isInteger(threadId) || threadId <= 0) {
      const suffix = threadEnv ? ` via ${threadEnv}` : "";
      throw new Error(`rooms[${index}] message_thread_id is required for ${label}${suffix}`);
    }

    return {
      key: asTrimmedString(room?.key || label.toLowerCase().replace(/[^a-z0-9]+/g, "_")),
      label,
      chat_id: chatId,
      message_thread_id: threadId,
    };
  });
}

async function run() {
  const config = loadConfig();
  const rooms = resolveRooms(config);
  const authHeaders = pickAuthHeaders();
  const baseUrl = asTrimmedString(process.env.ADMIN_WORKER_BASE_URL) || DEFAULT_BASE_URL;
  const prefix = asTrimmedString(process.env.TELEGRAM_SMOKE_PREFIX) || DEFAULT_PREFIX;
  const timestamp = new Date().toISOString();
  const endpoint = `${baseUrl.replace(/\/+$/, "")}/v1/admin/telegram/dm`;
  const failures = [];

  console.log(`Telegram smoke test target: ${endpoint}`);
  console.log(`Rooms: ${rooms.length}`);

  for (const room of rooms) {
    const payload = {
      chat_id: room.chat_id,
      message_thread_id: room.message_thread_id,
      text: `${prefix}\nRoom: ${room.label}\nTS: ${timestamp}`,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    };

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders,
      },
      body: JSON.stringify(payload),
    });

    const body = await response.json().catch(() => null);
    const telegramOk = Boolean(body?.telegram?.ok);
    const passed =
      response.status === 200 && body?.ok === true && body?.layer === "core" && telegramOk;

    if (passed) {
      console.log(`PASS ${room.label} thread=${room.message_thread_id}`);
      continue;
    }

    failures.push({
      room: room.label,
      status: response.status,
      body,
    });
    console.error(`FAIL ${room.label} thread=${room.message_thread_id} status=${response.status}`);
  }

  if (failures.length > 0) {
    console.error(JSON.stringify({ ok: false, failures }, null, 2));
    process.exitCode = 1;
    return;
  }

  console.log(JSON.stringify({ ok: true, rooms: rooms.length, ts: timestamp }, null, 2));
}

run().catch((error) => {
  console.error(String(error?.stack || error?.message || error));
  process.exitCode = 1;
});
