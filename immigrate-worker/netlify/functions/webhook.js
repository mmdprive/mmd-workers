import crypto from "node:crypto";

const DEFAULT_SYNC_TABLE = "MMD — Console Inbox";
const LINE_API_BASE = "https://api.line.me/v2/bot";
const THAI_MONTHS_PATTERN =
  "มกราคม|ม.ค.|กุมภาพันธ์|ก.พ.|มีนาคม|มี.ค.|เมษายน|เม.ย.|พฤษภาคม|พ.ค.|มิถุนายน|มิ.ย.|กรกฎาคม|ก.ค.|สิงหาคม|ส.ค.|กันยายน|ก.ย.|ตุลาคม|ต.ค.|พฤศจิกายน|พ.ย.|ธันวาคม|ธ.ค.";

const BOOKING_SIGNAL_RE =
  /(จอง|book|booking|คิว|นัด|reserve|เรียก|รับงาน|ยังรับ|ว่าง|available|availability|ไปได้|เช็คคิว|เช็กคิว|เช็คว่าง|เช็กว่าง)/i;
const TIMING_SIGNAL_RE = new RegExp(`(วันนี้|คืนนี้|พรุ่งนี้|วันที่|เวลา|\\d{1,2}[:.]\\d{2}|\\d{1,2}\\s*(?:${THAI_MONTHS_PATTERN}))`, "i");
const LOCATION_SIGNAL_RE = /(โซน|แถว|ที่|ห้วยขวาง|นนท์|นอนท์|พระราม|สุขุมวิท|ลาดพร้าว|สาทร|สีลม|อโศก|ทองหล่อ|เอกมัย|รัชดา|อารีย์|บางนา|ปิ่นเกล้า|บางกะปิ|เชียงใหม่|ภูเก็ต|พัทยา)/i;
const STOP_MODEL_WORDS = new Set([
  "วันที่",
  "เวลา",
  "วันนี้",
  "คืนนี้",
  "พรุ่งนี้",
  "จอง",
  "นัด",
  "คิว",
  "book",
  "booking",
  "reserve",
  "available",
  "availability",
  "ราคา",
  "price",
  "rate",
  "package",
  "member",
  "สมัคร",
]);

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

function normalizeLookup(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[._\-]+/g, " ")
    .replace(/[^a-z0-9ก-๙\s]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function splitLines(text) {
  return String(text || "")
    .split(/\r?\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function extractDateLabel(text) {
  const raw = String(text || "");
  const explicit = raw.match(new RegExp(`(?:วันที่\\s*)?(\\d{1,2}\\s*(?:${THAI_MONTHS_PATTERN})(?:\\s*\\d{2,4})?)`, "i"));
  if (explicit?.[1]) return explicit[1].replace(/\s+/g, " ").trim();
  if (/วันนี้/i.test(raw)) return "วันนี้";
  if (/คืนนี้/i.test(raw)) return "คืนนี้";
  if (/พรุ่งนี้/i.test(raw)) return "พรุ่งนี้";
  return "";
}

function extractTimeLabel(text) {
  const raw = String(text || "");
  const explicit = raw.match(/(?:เวลา\s*)?(\d{1,2}[:.]\d{2})/i);
  return explicit?.[1] ? explicit[1].replace(".", ":") : "";
}

function extractCandidateName(text) {
  const lines = splitLines(text);
  const firstUsefulLine = lines.find((line) => {
    const normalized = normalizeLookup(line);
    return normalized && !STOP_MODEL_WORDS.has(normalized) && !TIMING_SIGNAL_RE.test(line) && !LOCATION_SIGNAL_RE.test(line);
  });

  const source = firstUsefulLine || lines[0] || String(text || "");
  const candidate = String(source)
    .replace(BOOKING_SIGNAL_RE, " ")
    .replace(TIMING_SIGNAL_RE, " ")
    .replace(LOCATION_SIGNAL_RE, " ")
    .trim()
    .split(/\s+/)
    .find((token) => {
      const normalized = normalizeLookup(token);
      return normalized && !STOP_MODEL_WORDS.has(normalized) && !/^\d+$/.test(normalized);
    });

  return String(candidate || "").trim();
}

function extractLocationLabel(text, modelName = "") {
  const lines = splitLines(text);
  const normalizedModel = normalizeLookup(modelName);
  const locationLine = lines.find((line) => {
    const normalized = normalizeLookup(line);
    if (!normalized || normalized === normalizedModel) return false;
    if (TIMING_SIGNAL_RE.test(line)) return false;
    if (BOOKING_SIGNAL_RE.test(line)) return false;
    return LOCATION_SIGNAL_RE.test(line) || /^[ก-๙\s]{3,}$/.test(line);
  });

  if (locationLine) return locationLine.replace(/^โซน\s*/i, "").trim();

  const inline = String(text || "").match(/(?:โซน|แถว|ที่)\s*([ก-๙A-Za-z0-9\s]{2,40}?)(?=\s*(?:วันที่|เวลา|วันนี้|คืนนี้|พรุ่งนี้|\d{1,2}[:.]\d{2}|$))/i);
  return inline?.[1] ? inline[1].trim() : "";
}

function extractBookingLite(text, modelName = "") {
  const candidateModel = modelName || extractCandidateName(text);
  return {
    model_name: candidateModel,
    location_area: extractLocationLabel(text, candidateModel),
    date_label: extractDateLabel(text),
    time_label: extractTimeLabel(text),
  };
}

function looksLikeSpecificModelRequest(text) {
  const normalized = normalizeLookup(text);
  if (!normalized) return false;
  const hasCandidate = Boolean(extractCandidateName(text));
  return hasCandidate && (BOOKING_SIGNAL_RE.test(text) || TIMING_SIGNAL_RE.test(text) || LOCATION_SIGNAL_RE.test(text));
}

function modelMatchesText(model, text) {
  const haystack = normalizeLookup(text);
  const names = [
    model?.working_name,
    model?.display_name,
    model?.model_name,
    model?.nickname,
    ...(Array.isArray(model?.aliases) ? model.aliases : []),
  ]
    .map(normalizeLookup)
    .filter(Boolean);

  return names.some((name) => haystack === name || haystack.includes(name));
}

async function fetchModelsListLite({ adminWorkerBaseUrl, internalToken }) {
  const base = String(adminWorkerBaseUrl || "").replace(/\/$/, "");
  if (!base || !internalToken) return [];

  try {
    const response = await fetch(`${base}/v1/admin/models/list-lite`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${internalToken}`,
      },
    });

    if (!response.ok) return [];
    const payload = await response.json();
    return Array.isArray(payload?.models) ? payload.models : [];
  } catch {
    return [];
  }
}

function findRequestedModel(text, models) {
  const direct = Array.isArray(models) ? models.find((model) => modelMatchesText(model, text)) : null;
  if (direct) return direct;

  const candidate = normalizeLookup(extractCandidateName(text));
  if (!candidate || !Array.isArray(models)) return null;
  return (
    models.find((model) => {
      const names = [
        model?.working_name,
        model?.display_name,
        model?.model_name,
        model?.nickname,
        ...(Array.isArray(model?.aliases) ? model.aliases : []),
      ]
        .map(normalizeLookup)
        .filter(Boolean);
      return names.some((name) => name === candidate || name.includes(candidate) || candidate.includes(name));
    }) || null
  );
}

function inferIntent(text, event) {
  const normalized = String(text || "").toLowerCase();
  if (!normalized) {
    if (event?.type === "follow") return "new_follow";
    if (event?.type === "postback") return "postback";
    return "line_event";
  }

  if (looksLikeSpecificModelRequest(text)) return "model_availability";
  if (/(จอง|book|booking|คิว|นัด|reserve)/i.test(normalized)) return "create_session";
  if (/(สมัคร|member|สมาชิก|renew|ต่ออายุ|upgrade)/i.test(normalized)) return "membership";
  if (/(ราคา|price|rate|promotion|โปร|package|แพ็กเกจ)/i.test(normalized)) return "pricing";
  if (/(สวัสดี|hello|hi|hey)/i.test(normalized)) return "greeting";
  if (hasClientTag(text)) return "client_tagged";
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
  const intent = inferIntent(text, event);
  const booking = extractBookingLite(text);
  const flags = [
    "line_webhook",
    event?.type ? `event:${event.type}` : "",
    getMessageType(event) ? `message:${getMessageType(event)}` : "",
    text ? "has_text" : "no_text",
    hasClientTag(text) ? "tag:client" : "",
    intent ? `intent:${intent}` : "",
    booking.model_name ? "specific_model_requested" : "",
    booking.date_label || booking.time_label ? "has_timing" : "",
    booking.location_area ? "has_location" : "",
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
  const booking = extractBookingLite(messageText);

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
        parsed_name: booking.model_name || "",
        parsed_phone: "",
        parsed_intent: intent,
        parsed_budget_thb: 0,
        parsed_date: booking.date_label || "",
        parsed_time: booking.time_label || "",
        parsed_location: booking.location_area || "",
        specific_model_requested: Boolean(booking.model_name),
        requested_model_name: booking.model_name || "",
        confidence_score: booking.model_name && (booking.date_label || booking.time_label || booking.location_area) ? 0.82 : 0.35,
        dedupe_status: "unresolved",
        linked_client_id: "",
        flags,
        migration_status: "synced_to_airtable",
        event_type: String(event?.type || ""),
        message_type: messageType,
        client_tagged: clientTagged,
        immigrate_ready: clientTagged || intent === "model_availability",
        immigrate_mode: clientTagged || intent === "model_availability" ? "manual" : "none",
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

function buildModelAvailabilityReply({ prefix, booking, matchedModel }) {
  const requestedName = matchedModel?.working_name || booking.model_name || "นายแบบที่สนใจ";
  const parts = [];
  if (booking.location_area) parts.push(`โซน${booking.location_area}`);
  if (booking.date_label) parts.push(booking.date_label);
  if (booking.time_label) parts.push(`เวลา ${booking.time_label}`);
  const detail = parts.length ? ` ${parts.join(" ")}` : "";

  if (matchedModel?.available_now === true && matchedModel?.requires_per_approval !== true) {
    return `รับทราบครับ ${prefix}ผมพบชื่อ ${requestedName}${detail} แล้วครับ เดี๋ยวส่งคำขอให้ Per ตรวจสอบคิวจริงและยืนยันก่อนล็อกงานนะครับ`;
  }

  if (matchedModel) {
    return `รับทราบครับ ${prefix}ผมพบชื่อ ${requestedName}${detail} แล้วครับ สถานะรับงานต้องให้ Per ตรวจสอบรอบสุดท้ายก่อนยืนยันนะครับ`;
  }

  return `รับทราบครับ ${prefix}ผมเห็นว่าต้องการเช็ก ${requestedName}${detail} เดี๋ยวส่งให้ Per ตรวจสอบสถานะรับงานและความพร้อมก่อนยืนยันนะครับ`;
}

async function buildAutoReplyMessage(event, profile, options = {}) {
  const text = toTextMessage(event);
  const name = String(profile?.displayName || "").trim();
  const firstName = name ? name.split(/\s+/)[0] : "";
  const prefix = firstName ? `${firstName} ` : "";
  const intent = inferIntent(text, event);

  if (!hasClientTag(text) && !looksLikeSpecificModelRequest(text) && event?.type !== "follow") {
    return "";
  }

  if (event?.type === "follow") {
    return `สวัสดีครับ ${prefix}ยินดีต้อนรับสู่ MMD Privé ส่งข้อความที่ต้องการได้เลย เช่น จองงาน, เช็กราคา, เช็กนายแบบ หรือสมัครสมาชิก`;
  }

  if (intent === "model_availability") {
    const models = await fetchModelsListLite(options);
    const matchedModel = findRequestedModel(text, models);
    const booking = extractBookingLite(text, matchedModel?.working_name || "");
    return buildModelAvailabilityReply({ prefix, booking, matchedModel });
  }

  if (intent === "create_session") {
    return `รับข้อความแล้วครับ ${prefix}เดี๋ยวทีมงานช่วยดูเรื่องจองคิวให้นะครับ`;
  }
  if (intent === "membership") {
    return `รับเรื่องสมาชิกแล้วครับ ${prefix}เดี๋ยวทีมงานตรวจสอบและตอบกลับให้นะครับ`;
  }
  if (intent === "pricing") {
    return `รับคำถามเรื่องราคาแล้วครับ ${prefix}เดี๋ยวทีมงานส่งรายละเอียดกลับให้นะครับ`;
  }
  if (intent === "greeting") {
    return `สวัสดีครับ ${prefix}ต้องการสอบถามเรื่องจองงาน ราคา เช็กนายแบบ หรือสมาชิก พิมพ์มาได้เลยนะครับ`;
  }
  if (text) {
    return `รับข้อความแล้วครับ ${prefix}ทีมงานจะตรวจสอบและตอบกลับให้นะครับ`;
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
  const adminWorkerBaseUrl = process.env.ADMIN_WORKER_BASE_URL || "";
  const internalToken = process.env.INTERNAL_TOKEN || "";
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
    const intent = inferIntent(messageText, item);
    const shouldFetchProfile =
      (clientTagged || intent === "model_availability") && item?.source?.type === "user" && lineChannelAccessToken;
    const profile = shouldFetchProfile ? await fetchLineProfile(lineChannelAccessToken, lineUserId) : null;
    const record = await writeEventToAirtable({
      baseId: airtableBaseId,
      apiKey: airtableApiKey,
      tableName: airtableTableName,
      event: item,
      profile,
    });
    const replyText = await buildAutoReplyMessage(item, profile, {
      adminWorkerBaseUrl,
      internalToken,
    });
    const replied =
      !record?.deduped && autoReplyEnabled && replyText
        ? await sendLineReply(lineChannelAccessToken, getReplyToken(item), replyText)
        : false;
    saved.push({
      id: record?.id || "",
      deduped: Boolean(record?.deduped),
      type: item?.type || "",
      intent,
      client_tagged: clientTagged,
      specific_model_requested: intent === "model_availability",
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
