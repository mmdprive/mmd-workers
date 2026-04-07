import crypto from "node:crypto";

const DEFAULT_SYNC_TABLE = "MMD — Console Inbox";
const LINE_API_BASE = "https://api.line.me/v2/bot";

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      "content-type": "application/json; charset=utf-8",
    },
    body: JSON.stringify(body),
  };
}

function getHeader(headers, name) {
  if (!headers) return "";
  const lower = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (String(key).toLowerCase() === lower) return String(value || "");
  }
  return "";
}

function encodeFormulaValue(value) {
  return String(value || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function verifyLineSignature(rawBody, signature, secret) {
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("base64");
  const provided = Buffer.from(String(signature || ""), "utf8");
  const actual = Buffer.from(expected, "utf8");

  if (provided.length !== actual.length) return false;
  return crypto.timingSafeEqual(provided, actual);
}

function toTextMessage(event) {
  if (event?.type !== "message" || event?.message?.type !== "text") return "";
  return String(event.message.text || "").trim();
}

function hasClientTag(text) {
  return /(^|\s)#client(\s|$)/i.test(String(text || ""));
}

function getMessageType(event) {
  return String(event?.message?.type || "").trim();
}

function getLineUserId(event) {
  return String(event?.source?.userId || event?.source?.groupId || event?.source?.roomId || "").trim();
}

function getReplyToken(event) {
  return String(event?.replyToken || "").trim();
}

function inferIntent(text, event) {
  const normalized = String(text || "").toLowerCase();
  if (!normalized) {
    if (event?.type === "follow") return "new_follow";
    if (event?.type === "postback") return "postback";
    return "line_event";
  }

  if (hasClientTag(text)) return "client_tagged";
  if (/(จอง|book|booking|คิว|นัด|reserve)/i.test(normalized)) return "create_session";
  if (/(สมัคร|member|สมาชิก|renew|ต่ออายุ|upgrade)/i.test(normalized)) return "membership";
  if (/(ราคา|price|rate|promotion|โปร|package|แพ็กเกจ)/i.test(normalized)) return "pricing";
  if (/(สวัสดี|hello|hi|hey)/i.test(normalized)) return "greeting";
  return "note_only";
}

function buildAdminNote(event, text) {
  if (text) return text;
  if (event?.type === "follow") return "[follow] user added LINE OA";
  if (event?.type === "unfollow") return "[unfollow] user blocked or removed LINE OA";
  if (event?.type === "postback") return `[postback] ${String(event?.postback?.data || "").trim() || "received"}`;
  const messageType = getMessageType(event);
  if (messageType) return `[message:${messageType}] non-text LINE message`;
  return `[${event?.type || "unknown"}] LINE event`;
}

function buildFlags(event, text) {
  const flags = [
    "line_webhook",
    event?.type ? `event:${event.type}` : "",
    getMessageType(event) ? `message:${getMessageType(event)}` : "",
    text ? "has_text" : "no_text",
    hasClientTag(text) ? "tag:client" : "",
  ].filter(Boolean);
  return Array.from(new Set(flags));
}

function buildAirtableRecord(event) {
  return buildAirtableRecordWithProfile(event, null);
}

function buildAirtableRecordWithProfile(event, profile) {
  const receivedAt = new Date().toISOString();
  const messageText = toTextMessage(event);
  const lineUserId = getLineUserId(event);
  const eventId = String(event?.message?.id || event?.webhookEventId || `evt_${Date.now()}`);
  const migrationId = `line_${eventId}`;
  const flags = buildFlags(event, messageText);
  const intent = inferIntent(messageText, event);
  const messageType = getMessageType(event);
  const adminNote = buildAdminNote(event, messageText);
  const clientTagged = hasClientTag(messageText);

  return {
    fields: {
      inbox_id: migrationId,
      created_by: "netlify-line-webhook",
      source: "line",
      intent,
      member_name: String(profile?.displayName || "").trim(),
      member_phone: "",
      line_user_id: lineUserId,
      line_id: eventId,
      legacy_tags: flags.join(", "),
      admin_note: adminNote,
      payload_json: JSON.stringify({
        migration_id: migrationId,
        source_channel: "line",
        source_user_id: lineUserId,
        source_message_id: eventId,
        received_at: receivedAt,
        raw_text: messageText,
        parsed_name: "",
        parsed_phone: "",
        parsed_intent: intent,
        parsed_budget_thb: 0,
        parsed_date: "",
        parsed_location: "",
        confidence_score: 0,
        dedupe_status: "unresolved",
        linked_client_id: "",
        flags,
        migration_status: "synced_to_airtable",
        event_type: String(event?.type || ""),
        message_type: messageType,
        client_tagged: clientTagged,
        immigrate_ready: clientTagged,
        immigrate_mode: clientTagged ? "manual" : "none",
        profile: profile || null,
        line_event: event,
      }),
      status: "new",
    },
  };
}

async function findExistingEvent({ baseId, apiKey, tableName, eventId, migrationId }) {
  const table = encodeURIComponent(tableName || DEFAULT_SYNC_TABLE);
  const url = new URL(`https://api.airtable.com/v0/${baseId}/${table}`);
  url.searchParams.set("pageSize", "1");
  url.searchParams.set(
    "filterByFormula",
    `OR({line_id}="${encodeFormulaValue(eventId)}",{inbox_id}="${encodeFormulaValue(migrationId)}")`,
  );

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Airtable dedupe lookup failed: ${response.status} ${text}`);
  }

  const payload = await response.json();
  return Array.isArray(payload?.records) ? payload.records[0] || null : null;
}

async function fetchLineProfile(accessToken, userId) {
  if (!accessToken || !userId) return null;

  const response = await fetch(`${LINE_API_BASE}/profile/${encodeURIComponent(userId)}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    return null;
  }

  return response.json();
}

async function sendLineReply(accessToken, replyToken, text) {
  if (!accessToken || !replyToken || !text) return false;

  const response = await fetch(`${LINE_API_BASE}/message/reply`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      replyToken,
      messages: [{ type: "text", text }],
    }),
  });

  return response.ok;
}

function buildAutoReplyMessage(event, profile) {
  const text = toTextMessage(event);
  const name = String(profile?.displayName || "").trim();
  const firstName = name ? name.split(/\s+/)[0] : "";
  const prefix = firstName ? `${firstName} ` : "";
  const intent = inferIntent(text, event);

  if (!hasClientTag(text)) {
    return "";
  }

  if (event?.type === "follow") {
    return `สวัสดีค่ะ ${prefix}ยินดีต้อนรับสู่ MMD Prive ส่งข้อความที่ต้องการได้เลย เช่น จองงาน, เช็กราคา, หรือสมัครสมาชิก`;
  }

  if (intent === "create_session") {
    return `รับข้อความแล้วค่ะ ${prefix}เดี๋ยวทีมงานช่วยดูเรื่องจองคิวให้นะคะ`;
  }
  if (intent === "membership") {
    return `รับเรื่องสมาชิกแล้วค่ะ ${prefix}เดี๋ยวทีมงานตรวจสอบและตอบกลับให้นะคะ`;
  }
  if (intent === "pricing") {
    return `รับคำถามเรื่องราคาแล้วค่ะ ${prefix}เดี๋ยวทีมงานส่งรายละเอียดกลับให้นะคะ`;
  }
  if (intent === "greeting") {
    return `สวัสดีค่ะ ${prefix}ต้องการสอบถามเรื่องจองงาน ราคา หรือสมาชิก พิมพ์มาได้เลยนะคะ`;
  }
  if (text) {
    return `รับข้อความแล้วค่ะ ${prefix}ทีมงานจะตรวจสอบและตอบกลับให้นะคะ`;
  }
  return "";
}

async function writeEventToAirtable({ baseId, apiKey, tableName, event, profile }) {
  const eventId = String(event?.message?.id || event?.webhookEventId || `evt_${Date.now()}`);
  const migrationId = `line_${eventId}`;
  const existing = await findExistingEvent({
    baseId,
    apiKey,
    tableName,
    eventId,
    migrationId,
  });

  if (existing?.id) {
    return {
      id: existing.id,
      deduped: true,
    };
  }

  const table = encodeURIComponent(tableName || DEFAULT_SYNC_TABLE);
  const response = await fetch(`https://api.airtable.com/v0/${baseId}/${table}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(buildAirtableRecordWithProfile(event, profile)),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Airtable write failed: ${response.status} ${text}`);
  }

  return response.json();
}

export async function handler(event) {
  if (event.httpMethod === "GET") {
    return json(200, { ok: true, service: "line-webhook-netlify" });
  }

  if (event.httpMethod !== "POST") {
    return json(405, { ok: false, error: "method_not_allowed" });
  }

  const lineChannelSecret = process.env.LINE_CHANNEL_SECRET || "";
  const lineChannelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN || "";
  const airtableApiKey = process.env.AIRTABLE_API_KEY || "";
  const airtableBaseId = process.env.AIRTABLE_BASE_ID || "";
  const airtableTableName = process.env.AIRTABLE_SYNC_TABLE || DEFAULT_SYNC_TABLE;
  const autoReplyEnabled = String(process.env.LINE_AUTO_REPLY_ENABLED || "false").toLowerCase() === "true";

  if (!lineChannelSecret || !airtableApiKey || !airtableBaseId) {
    return json(500, {
      ok: false,
      error: "missing_env",
      required: ["LINE_CHANNEL_SECRET", "AIRTABLE_API_KEY", "AIRTABLE_BASE_ID"],
    });
  }

  const rawBody = event.isBase64Encoded
    ? Buffer.from(event.body || "", "base64").toString("utf8")
    : String(event.body || "");
  const signature = getHeader(event.headers, "x-line-signature");

  if (!verifyLineSignature(rawBody, signature, lineChannelSecret)) {
    return json(401, { ok: false, error: "invalid_signature" });
  }

  let payload;
  try {
    payload = JSON.parse(rawBody || "{}");
  } catch {
    return json(400, { ok: false, error: "invalid_json" });
  }

  const events = Array.isArray(payload.events) ? payload.events : [];
  const saved = [];

  for (const item of events) {
    const lineUserId = getLineUserId(item);
    const messageText = toTextMessage(item);
    const clientTagged = hasClientTag(messageText);
    const profile =
      clientTagged && item?.source?.type === "user" && lineChannelAccessToken
        ? await fetchLineProfile(lineChannelAccessToken, lineUserId)
        : null;
    const record = await writeEventToAirtable({
      baseId: airtableBaseId,
      apiKey: airtableApiKey,
      tableName: airtableTableName,
      event: item,
      profile,
    });
    const replyText = buildAutoReplyMessage(item, profile);
    const replied =
      !record?.deduped && autoReplyEnabled && replyText
        ? await sendLineReply(lineChannelAccessToken, getReplyToken(item), replyText)
        : false;
    saved.push({
      id: record?.id || "",
      deduped: Boolean(record?.deduped),
      type: item?.type || "",
      intent: inferIntent(messageText, item),
      client_tagged: clientTagged,
      replied,
      profile_name: String(profile?.displayName || ""),
      line_user_id: lineUserId,
      message_id: String(item?.message?.id || item?.webhookEventId || ""),
    });
  }

  return json(200, {
    ok: true,
    processed: events.length,
    saved,
  });
}
