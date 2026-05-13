import crypto from "node:crypto";

const DEFAULT_SYNC_TABLE = "MMD — Console Inbox";
const LINE_API_BASE = "https://api.line.me/v2/bot";
const THAI_MONTHS_PATTERN =
  "มกราคม|ม.ค.|กุมภาพันธ์|ก.พ.|มีนาคม|มี.ค.|เมษายน|เม.ย.|พฤษภาคม|พ.ค.|มิถุนายน|มิ.ย.|กรกฎาคม|ก.ค.|สิงหาคม|ส.ค.|กันยายน|ก.ย.|ตุลาคม|ต.ค.|พฤศจิกายน|พ.ย.|ธันวาคม|ธ.ค.";

const BOOKING_SIGNAL_RE =
  /(จอง|book|booking|คิว|นัด|reserve|เรียก|รับงาน|ยังรับ|ว่าง|available|availability|ไปได้|เช็คคิว|เช็กคิว|เช็คว่าง|เช็กว่าง)/i;
const TIMING_SIGNAL_RE = new RegExp(`(วันนี้|คืนนี้|พรุ่งนี้|วันที่|เวลา|\\d{1,2}[:.]\\d{2}|\\d{1,2}\\s*(?:${THAI_MONTHS_PATTERN}))`, "i");
const LOCATION_SIGNAL_RE = /(โซน|แถว|ที่|ห้วยขวาง|นนท์|นอนท์|พระราม|สุขุมวิท|ลาดพร้าว|สาทร|สีลม|อโศก|ทองหล่อ|เอกมัย|รัชดา|อารีย์|บางนา|ปิ่นเกล้า|บางกะปิ|เชียงใหม่|ภูเก็ต|พัทยา)/i;
const FAQ_REPLY_INTENTS = new Set([
  "pricing_review",
  "ask_where_to_get_rate",
  "image_rate_inquiry",
  "image_only_model_inquiry",
  "package_difference",
  "upgrade_question",
  "membership_fee_reason",
  "model_photo_review_question",
  "contact_admin",
]);
const PRICING_REVIEW_INTENTS = new Set(["pricing_review", "ask_where_to_get_rate", "image_rate_inquiry"]);
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

function isImageMessage(event) {
  return event?.type === "message" && event?.message?.type === "image";
}

function hasPriorImageContext(event) {
  const ref = event?.pricing_context || event?.context || event?.source_context || {};
  return Boolean(ref?.image_message_id || ref?.last_image_message_id || ref?.image_present);
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

function inferFaqIntent(text) {
  const normalized = String(text || "").toLowerCase().replace(/\s+/g, " ").trim();
  if (!normalized) return "";

  if (/อัปเกรด|อัพเกรด|upgrade/i.test(normalized)) return "upgrade_question";
  if (
    /(standard|สแตนดาร์ด).{0,40}(premium|พรีเมียม)|(premium|พรีเมียม).{0,40}(standard|สแตนดาร์ด)|ต่างจาก|ต่างกัน/i.test(
      normalized,
    )
  ) {
    return "package_difference";
  }
  if (/ทำไม.{0,20}(ค่าสมาชิก|เสียค่าสมาชิก|สมัครสมาชิก)|ค่าสมาชิก.{0,30}(ทำไม|เพื่ออะไร)/i.test(normalized)) {
    return "membership_fee_reason";
  }
  if (/(รูปตัวอย่าง|ตัวอย่างนายแบบ|ดูรูป|รูปนายแบบ|รีวิว|review|reviews)/i.test(normalized)) {
    return "model_photo_review_question";
  }
  if (/(คุยกับ|ติดต่อ|ขอคุย).{0,20}(แอดมิน|admin|mmd|per|เปอร์)|อยากคุยกับ\s*mmd/i.test(normalized)) {
    return "contact_admin";
  }
  if (/(สอบถามเรทได้ที่ไหน|เรทได้ที่ไหน|ถามเรท|ขอเรท|ดูเรท|เช็คเรท|เช็กเรท)/i.test(normalized)) {
    return "ask_where_to_get_rate";
  }
  if (/(ครั้งละ|สอบถามเรท|สอบถามราคา|เช็กราคา|เช็คราคา|ราคา|เรท|rate|price|กี่บาท|เท่าไร|เท่าไหร่|แพ็กเกจเท่าไร|แพคเกจเท่าไร|package price|แพงไหม|สูงไหม|ส่งไหม|รับไหม)/i.test(normalized)) {
    return "pricing_review";
  }

  return "";
}

function modelField(model, keys) {
  const fields = model?.fields && typeof model.fields === "object" ? model.fields : model || {};
  for (const key of keys) {
    const value = fields?.[key];
    if (value !== undefined && value !== null && String(value).trim()) return value;
  }
  return "";
}

function modelNames(model) {
  const aliases = modelField(model, ["aliases", "alias", "legacy_tags"]);
  const aliasList = Array.isArray(aliases)
    ? aliases
    : String(aliases || "")
        .split(/[,|\n]/)
        .map((item) => item.trim())
        .filter(Boolean);

  return [
    modelField(model, ["working_name", "Working Name"]),
    modelField(model, ["display_name", "Display Name"]),
    modelField(model, ["model_name", "Model Name"]),
    modelField(model, ["name", "Name"]),
    modelField(model, ["nickname", "Nickname"]),
    modelField(model, ["unique_key", "Unique Key"]),
    modelField(model, ["line_id", "LINE ID", "Line ID"]),
    modelField(model, ["line_user_id", "LINE User ID", "Line User ID"]),
    ...aliasList,
  ]
    .map(normalizeLookup)
    .filter(Boolean);
}

function modelMatchesText(model, text) {
  const haystack = normalizeLookup(text);
  const names = modelNames(model);
  const notes = normalizeLookup(modelField(model, ["notes_raw", "notes", "Notes", "admin_note", "payload_json"]));
  return names.some((name) => haystack === name || haystack.includes(name)) || (notes && notes.includes(haystack));
}

async function fetchModelsListLite({ adminWorkerBaseUrl, internalToken, confirmKey }, query = "") {
  const base = String(adminWorkerBaseUrl || "").replace(/\/$/, "");
  const q = String(query || "").trim();
  if (!base || (!internalToken && !confirmKey) || !q) return [];

  try {
    const headers = { "Content-Type": "application/json" };
    if (internalToken) headers.Authorization = `Bearer ${internalToken}`;
    if (confirmKey) headers["X-Confirm-Key"] = confirmKey;

    const endpoint = `${base}/v1/admin/models/list?q=${encodeURIComponent(q)}&limit=20`;
    const response = await fetch(endpoint, {
      method: "GET",
      headers,
    });

    if (!response.ok) return [];
    const payload = await response.json();
    if (Array.isArray(payload?.models)) return payload.models;
    if (Array.isArray(payload?.items)) return payload.items;
    return [];
  } catch {
    return [];
  }
}

async function fetchModelSourceResolution({ adminWorkerBaseUrl, internalToken, confirmKey }, query = "", categoryPath = "") {
  const base = String(adminWorkerBaseUrl || "").replace(/\/$/, "");
  const q = String(query || "").trim();
  if (!base || (!internalToken && !confirmKey) || !q) return null;

  try {
    const headers = { "Content-Type": "application/json" };
    if (internalToken) headers.Authorization = `Bearer ${internalToken}`;
    if (confirmKey) headers["X-Confirm-Key"] = confirmKey;

    const endpoint = new URL(`${base}/v1/admin/models/resolve-source`);
    endpoint.searchParams.set("q", q);
    endpoint.searchParams.set("source_owner", "lonelysomething");
    if (categoryPath) endpoint.searchParams.set("category_path", categoryPath);

    const response = await fetch(endpoint.toString(), {
      method: "GET",
      headers,
    });

    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

function logModelLookupDebug(options, data) {
  if (String(options?.lineModelLookupDebug || "").toLowerCase() !== "true") return;
  console.log(JSON.stringify({
    event: "line_model_lookup_debug",
    intent: data.intent || "",
    parsed_model_name: data.parsed_model_name || "",
    airtable_items_count: Number(data.airtable_items_count || 0),
    r2_lookup_attempted: Boolean(data.r2_lookup_attempted),
    r2_found: Boolean(data.r2_found),
    matched_prefix_redacted: data.matched_prefix_redacted || "",
    reply_sent: Boolean(data.reply_sent),
  }));
}

function findRequestedModel(text, models) {
  const direct = Array.isArray(models) ? models.find((model) => modelMatchesText(model, text)) : null;
  if (direct) return direct;

  const candidate = normalizeLookup(extractCandidateName(text));
  if (!candidate || !Array.isArray(models)) return null;
  return (
    models.find((model) => {
      const names = modelNames(model);
      return names.some((name) => name === candidate || name.includes(candidate) || candidate.includes(name));
    }) || null
  );
}

function inferIntent(text, event) {
  const normalized = String(text || "").toLowerCase();
  if (isImageMessage(event)) return "image_only_model_inquiry";
  if (!normalized) {
    if (event?.type === "follow") return "new_follow";
    if (event?.type === "postback") return "postback";
    return "line_event";
  }

  const faqIntent = inferFaqIntent(text);
  if (faqIntent) {
    return hasPriorImageContext(event) && (faqIntent === "pricing_review" || faqIntent === "ask_where_to_get_rate")
      ? "image_rate_inquiry"
      : faqIntent;
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
  const airtableIntent = PRICING_REVIEW_INTENTS.has(intent) ? "note_only" : intent;
  const messageType = getMessageType(event);
  const adminNote = buildAdminNote(event, messageText);
  const clientTagged = hasClientTag(messageText);
  const booking = extractBookingLite(messageText);

  return {
    fields: {
      inbox_id: migrationId,
      created_by: "netlify-line-webhook",
      source: "line",
      intent: airtableIntent,
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
        image_message_id: isImageMessage(event) ? String(event?.message?.id || "") : "",
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
  const requestedName =
    modelField(matchedModel, ["working_name", "Working Name", "model_name", "Model Name", "name", "Name", "nickname", "Nickname"]) ||
    booking.model_name ||
    "นายแบบที่สนใจ";
  const parts = [];
  if (booking.location_area) parts.push(`โซน${booking.location_area}`);
  if (booking.date_label) parts.push(booking.date_label);
  if (booking.time_label) parts.push(`เวลา ${booking.time_label}`);
  const detail = parts.length ? ` ${parts.join(" ")}` : "";
  const availableNow = modelField(matchedModel, ["available_now", "Available Now"]);
  const requiresApproval = modelField(matchedModel, ["requires_per_approval", "Requires Per Approval"]);

  if (availableNow === true && requiresApproval !== true) {
    return `รับทราบครับ ${prefix}ผมพบชื่อ ${requestedName}${detail} แล้วครับ เดี๋ยวส่งคำขอให้ Per ตรวจสอบคิวจริงและยืนยันก่อนล็อกงานนะครับ`;
  }

  if (matchedModel) {
    return `รับทราบครับ ${prefix}ผมพบชื่อ ${requestedName}${detail} แล้วครับ สถานะรับงานต้องให้ Per ตรวจสอบรอบสุดท้ายก่อนยืนยันนะครับ`;
  }

  return `รับทราบครับ ${prefix}ผมเห็นว่าต้องการเช็ก ${requestedName}${detail} เดี๋ยวส่งให้ Per ตรวจสอบสถานะรับงานและความพร้อมก่อนยืนยันนะครับ`;
}

function buildModelSourceFallbackReply({ prefix, booking, resolution }) {
  const requestedName = booking.model_name || resolution?.query || "นายแบบที่สนใจ";
  if (resolution?.source === "r2" && resolution?.found) {
    return `รับทราบครับ ${prefix}ผมพบข้อมูลเบื้องต้นของ ${requestedName} ในคลังโมเดลของระบบแล้วครับ เดี๋ยวส่งให้ Per ตรวจสอบสถานะและความพร้อมก่อนยืนยันนะครับ`;
  }
  return `รับทราบครับ ${prefix}ผมเห็นว่าต้องการเช็ก ${requestedName} เดี๋ยวส่งให้ Per ตรวจสอบจากประวัติ model-side ก่อนยืนยันนะครับ`;
}

function shouldAutoReplyForIntent(intent, text, event) {
  if (event?.type === "follow") return true;
  if (hasClientTag(text)) return true;
  if (intent === "model_availability") return true;
  if (FAQ_REPLY_INTENTS.has(intent)) return true;
  return false;
}

function buildPricingReviewAcknowledgement(prefix = "") {
  const greeting = prefix ? `ดีครับคุณ${prefix.trim()}` : "ดีครับ";
  return `${greeting}

สอบถามเรทกับผมตรงนี้ได้เลยครับ ผมรับเรื่องไว้แล้ว เดี๋ยวส่งให้ Per/Ewvon ตรวจสอบเรทและรายละเอียดที่เหมาะสมก่อนแจ้งกลับนะครับ

ถ้าสะดวก แจ้งวัน เวลา โซน และระยะเวลาที่ต้องการไว้ได้เลยครับ จะช่วยประเมินให้ตรงขึ้นครับ`;
}

function buildAdContextPricingAcknowledgement() {
  return `ดีครับ

สอบถามเรทกับผมตรงนี้ได้เลยครับ ผมรับเรื่องไว้แล้ว เดี๋ยวตรวจเรทของรายการที่คุณสนใจให้ก่อนแจ้งกลับนะครับ

ถ้าสะดวก แจ้งวัน เวลา โซน และระยะเวลาที่ต้องการไว้ได้เลยครับ จะช่วยประเมินให้ตรงขึ้นครับ`;
}

function buildCataloguePricingAcknowledgement() {
  return `ดีครับ

สอบถามเรทจาก Catalogue ที่คุณดูอยู่กับผมได้เลยครับ ผมรับเรื่องไว้แล้ว เดี๋ยวตรวจรายละเอียดให้ก่อนแจ้งกลับนะครับ

ถ้าสะดวก แจ้งวัน เวลา โซน และระยะเวลาที่ต้องการไว้ได้เลยครับ`;
}

function buildImageOnlyAcknowledgement() {
  return `ผมได้รับรูปแล้วครับ เดี๋ยวส่งให้ Per/Ewvon ตรวจสอบว่านายแบบในรูปตรงกับข้อมูลในระบบไหม พร้อมเรทล่าสุดและความพร้อมก่อนยืนยันนะครับ ถ้าสะดวก แจ้งวัน เวลา โซน และระยะเวลาที่ต้องการไว้ได้เลยครับ`;
}

function buildFaqReply(intent, prefix = "", context = {}) {
  if (intent === "pricing_review" || intent === "ask_where_to_get_rate" || intent === "image_rate_inquiry") {
    if (context.recommended_reply_strategy === "catalogue_ack") return buildCataloguePricingAcknowledgement();
    if (context.recommended_reply_strategy === "ad_context_ack") return buildAdContextPricingAcknowledgement();
    return buildPricingReviewAcknowledgement(prefix);
  }
  if (intent === "image_only_model_inquiry") return buildImageOnlyAcknowledgement();
  if (intent === "package_difference") {
    return `Standard กับ Premium จะต่างกันที่ระดับตัวเลือกและการดูแลครับ

Standard เหมาะกับการเริ่มต้น มีตัวเลือกและข้อมูลเบื้องต้นในขอบเขตที่ง่ายขึ้นครับ

Premium จะเหมาะกับคนที่ต้องการเลือกละเอียดขึ้น มีตัวเลือกและการดูแลมากขึ้นครับ

รายละเอียดสุดท้ายขึ้นอยู่กับนโยบายปัจจุบันและการยืนยันจาก Per ก่อนสรุปแพ็กเกจครับ`;
  }
  if (intent === "upgrade_question") {
    return `อัปเกรดจาก Standard เป็น Premium สามารถส่งให้ Per ตรวจสอบได้ครับ

รบกวนแจ้งชื่อสมาชิกหรือแพ็กเกจปัจจุบันที่ใช้อยู่ได้เลยครับ แล้วผมจะส่งต่อให้ Per ตรวจสอบเงื่อนไขและส่วนต่างก่อนยืนยันครับ`;
  }
  if (intent === "membership_fee_reason") {
    return `ค่าสมาชิกช่วยดูแลเรื่องการคัดกรองสิทธิ์ ความเป็นส่วนตัว การประสานงาน และคุณภาพของบริการครับ

ค่าสมาชิกไม่ใช่การการันตีการจองงานทันทีนะครับ รายละเอียดงาน ราคา และความพร้อมของนายแบบจะต้องยืนยันจากระบบและ Per ก่อนทุกครั้งครับ`;
  }
  if (intent === "model_photo_review_question") {
    return `รูปตัวอย่างนายแบบและรีวิวสามารถแนะนำให้ดูได้เฉพาะส่วนที่นโยบายและความเป็นส่วนตัวอนุญาตครับ

แจ้งแนวที่ชอบหรือแพ็กเกจที่สนใจมาได้เลยครับ เดี๋ยวผมส่งให้ Per แนะนำทางที่เหมาะสมต่อครับ`;
  }
  if (intent === "contact_admin") {
    return `รับทราบครับ ผมจะส่งคำถามนี้ให้ Per หรือ MMD ดูต่อครับ

ถ้ามีรายละเอียดเพิ่มเติม เช่น แพ็กเกจที่สนใจ วันเวลา หรือแนวนายแบบที่ต้องการ ส่งเพิ่มไว้ในแชทนี้ได้เลยครับ`;
  }
  return "";
}

function parsePricingRequest(text) {
  return {
    date: extractDateLabel(text),
    time: extractTimeLabel(text),
    location: extractLocationLabel(text),
    duration: String(text || "").match(/(\d+(?:\.\d+)?)\s*(?:ชม|ชั่วโมง|hr|hour|hours)/i)?.[1] || "",
  };
}

function parseAdContextFromText(text = "") {
  const source = String(text || "");
  const creative = source.match(/\b((?:GWs|EMs)[A-Za-z0-9_-]*)\b/i)?.[1] || "";
  const catalogue = source.match(/(?:catalogue|catalog|แคตตาล็อก|แคตาล็อก|แคต)\s*[:#-]?\s*([A-Za-z0-9_-]{2,40})/i)?.[1] || "";
  const utmContent = source.match(/utm_content=([^&\s]+)/i)?.[1] || "";
  const cardSet = source.match(/(?:card[_\s-]?set|ชุดการ์ด)\s*[:#-]?\s*([A-Za-z0-9_-]{2,40})/i)?.[1] || "";
  const creativeType = /^GWs/i.test(creative) ? "GWs" : /^EMs/i.test(creative) ? "EMs" : "unknown";
  const modelCandidates = Array.from(new Set([creative, utmContent].filter(Boolean)));
  return {
    ad_context_found: Boolean(creative || catalogue || utmContent || cardSet),
    ad_context_unknown: !creative && !catalogue && !utmContent && !cardSet,
    creative_code: creative || utmContent,
    creative_code_type: creativeType,
    catalogue_ref: catalogue,
    card_set_id: cardSet,
    model_candidates: modelCandidates,
    confidence: creative || catalogue ? 0.75 : utmContent || cardSet ? 0.55 : 0,
    source: creative || catalogue || utmContent || cardSet ? "line_payload_or_text" : "unknown",
    needs_per_ad_match: !creative && !catalogue && !utmContent && !cardSet,
  };
}

function choosePricingReplyStrategy(adContext = {}) {
  if (adContext.catalogue_ref) return "catalogue_ack";
  if (adContext.ad_context_found) return "ad_context_ack";
  return "generic_pricing_ack";
}

async function createPricingReview(options, event, profile, intent) {
  const base = String(options?.adminWorkerBaseUrl || "").replace(/\/+$/, "");
  if (!base || (!options?.internalToken && !options?.confirmKey)) {
    return { ok: false, skipped: true, error: "missing_admin_worker_auth" };
  }

  const text = toTextMessage(event);
  const adContext = parseAdContextFromText(text);
  const recommendedReplyStrategy = choosePricingReplyStrategy(adContext);
  const headers = { "Content-Type": "application/json" };
  if (options.internalToken) headers.Authorization = `Bearer ${options.internalToken}`;
  if (options.confirmKey) headers["X-Confirm-Key"] = options.confirmKey;

  const response = await fetch(`${base}/v1/admin/pricing/reviews/create`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      source: "line_oa",
      intent,
      line_user_id: getLineUserId(event),
      line_display_name: String(profile?.displayName || ""),
      client_name: String(profile?.displayName || ""),
      message_text: text,
      image_message_id: isImageMessage(event) ? String(event?.message?.id || "") : "",
      parsed_request: parsePricingRequest(text),
      ad_context_hint: adContext,
      ad_context_unknown: Boolean(adContext.ad_context_unknown),
      needs_per_ad_match: Boolean(adContext.needs_per_ad_match),
      recommended_reply_strategy: recommendedReplyStrategy,
      review_reason: "inbound_pricing_from_ad_or_unknown_creative",
      raw_event_ref: String(event?.message?.id || event?.webhookEventId || ""),
    }),
  });

  const data = await response.json().catch(() => ({}));
  return { ok: response.ok && data?.ok !== false, status: response.status, ...data };
}

function logLineWebhookDebug(options, data) {
  const enabled =
    String(options?.lineWebhookDebug || "").toLowerCase() === "true" ||
    String(options?.lineModelLookupDebug || "").toLowerCase() === "true";
  if (!enabled) return;
  console.log(
    JSON.stringify({
      event: "line_webhook_debug",
      event_type: data.event_type || "",
      intent: data.intent || "",
      detected_intent: data.intent || "",
      pricing_review_created: Boolean(data.pricing_review_created),
      telegram_sent: Boolean(data.telegram_sent),
      reply_sent: Boolean(data.reply_sent),
      category: data.category || "",
    }),
  );
}

async function buildAutoReplyMessage(event, profile, options = {}) {
  const text = toTextMessage(event);
  const name = String(profile?.displayName || "").trim();
  const firstName = name ? name.split(/\s+/)[0] : "";
  const prefix = firstName ? `${firstName} ` : "";
  const intent = inferIntent(text, event);

  if (!shouldAutoReplyForIntent(intent, text, event)) {
    logLineWebhookDebug(options, { intent, reply_sent: false, category: "not_auto_reply_intent" });
    return "";
  }

  if (event?.type === "follow") {
    return `สวัสดีครับ ${prefix}ยินดีต้อนรับสู่ MMD Privé ส่งข้อความที่ต้องการได้เลย เช่น จองงาน, เช็กราคา, เช็กนายแบบ หรือสมัครสมาชิก`;
  }

  if (intent === "model_availability") {
    const bookingSeed = extractBookingLite(text);
    const models = await fetchModelsListLite(options, bookingSeed.model_name || text);
    const matchedModel = findRequestedModel(text, models);
    const booking = extractBookingLite(text, modelField(matchedModel, ["working_name", "Working Name", "model_name", "Model Name", "name", "Name"]));
    if (matchedModel) {
      const reply = buildModelAvailabilityReply({ prefix, booking, matchedModel });
      logModelLookupDebug(options, {
        intent,
        parsed_model_name: booking.model_name,
        airtable_items_count: models.length,
        r2_lookup_attempted: false,
        r2_found: false,
        reply_sent: Boolean(reply),
      });
      return reply;
    }

    const resolution = await fetchModelSourceResolution(options, bookingSeed.model_name || text);
    const reply = buildModelSourceFallbackReply({ prefix, booking: bookingSeed, resolution });
    logModelLookupDebug(options, {
      intent,
      parsed_model_name: bookingSeed.model_name,
      airtable_items_count: models.length,
      r2_lookup_attempted: true,
      r2_found: resolution?.source === "r2" && resolution?.found,
      matched_prefix_redacted: resolution?.matched_prefix_redacted || "",
      reply_sent: Boolean(reply),
    });
    return reply;
  }

  if (FAQ_REPLY_INTENTS.has(intent)) {
    let pricingReview = null;
    const adContext = parseAdContextFromText(text);
    const recommendedReplyStrategy = choosePricingReplyStrategy(adContext);
    if (intent === "pricing_review" || intent === "ask_where_to_get_rate" || intent === "image_rate_inquiry" || intent === "image_only_model_inquiry") {
      pricingReview = options.createPricingReviewEnabled === false ? { ok: false, skipped: true, error: "deduped" } : await createPricingReview(options, event, profile, intent);
    }
    const reply = buildFaqReply(intent, prefix, { ...adContext, recommended_reply_strategy: recommendedReplyStrategy });
    logLineWebhookDebug(options, {
      intent,
      reply_sent: Boolean(reply),
      category: "faq_reply",
      pricing_review_created: Boolean(pricingReview?.ok),
      telegram_sent: Boolean(pricingReview?.telegram_sent),
    });
    return reply;
  }

  if (intent === "create_session") {
    return `รับข้อความแล้วครับ ${prefix}เดี๋ยวทีมงานช่วยดูเรื่องจองคิวให้นะครับ`;
  }
  if (intent === "membership") {
    return `รับเรื่องสมาชิกแล้วครับ ${prefix}เดี๋ยวทีมงานตรวจสอบและตอบกลับให้นะครับ`;
  }
  if (intent === "pricing") {
    if (options.createPricingReviewEnabled !== false) await createPricingReview(options, event, profile, "pricing_review");
    const adContext = parseAdContextFromText(text);
    return buildFaqReply("pricing_review", prefix, { ...adContext, recommended_reply_strategy: choosePricingReplyStrategy(adContext) });
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
  const internalToken = process.env.INTERNAL_TOKEN || process.env.ADMIN_BEARER || "";
  const confirmKey = process.env.CONFIRM_KEY || "";
  const autoReplyEnabled = String(process.env.LINE_AUTO_REPLY_ENABLED || "false").toLowerCase() === "true";
  const lineModelLookupDebug = process.env.LINE_MODEL_LOOKUP_DEBUG || "";
  const lineWebhookDebug = process.env.LINE_WEBHOOK_DEBUG || "";

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
      (clientTagged || intent === "model_availability" || FAQ_REPLY_INTENTS.has(intent)) &&
      item?.source?.type === "user" &&
      lineChannelAccessToken;
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
      confirmKey,
      lineModelLookupDebug,
      lineWebhookDebug,
      createPricingReviewEnabled: !record?.deduped,
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

export { buildFaqReply, choosePricingReplyStrategy, inferFaqIntent, inferIntent, parseAdContextFromText, shouldAutoReplyForIntent };
