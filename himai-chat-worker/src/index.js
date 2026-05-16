export default {
  async fetch(request, env, ctx) {
    try {
      const url = new URL(request.url);
      const path = url.pathname;
      const method = request.method.toUpperCase();

      if (method === "GET" && path === "/health") {
        return json({
          ok: true,
          app: env.APP_NAME || "Himai Shop",
          line_oa: env.LINE_OA_HANDLE || "@himaishop",
          line_oa_url: env.LINE_OA_URL || "https://line.me/R/ti/p/@himaishop",
          routes: [
            "GET /health",
            "POST /line/webhook",
            "POST /shop/signup",
            "POST /internal/airtable/send-report",
            "POST /internal/line/push"
          ]
        });
      }

      if (method === "POST" && path === "/line/webhook") {
        return handleLineWebhook(request, env);
      }

      if (method === "POST" && path === "/shop/signup") {
        return handleShopSignup(request, env);
      }

      if (method === "POST" && path === "/internal/airtable/send-report") {
        return handleInternalSendReport(request, env);
      }

      if (method === "POST" && path === "/internal/line/push") {
        return handleInternalPush(request, env);
      }

      return json({ ok: false, error: "Not found" }, 404);
    } catch (error) {
      console.log("Unhandled error:", error);
      return json({
        ok: false,
        error: "Unhandled error",
        detail: error?.message || String(error)
      }, 500);
    }
  }
};

/* =========================
   CONFIG
========================= */

function getConfig(env) {
  return {
    appName: env.APP_NAME || "Himai Shop",
    lineOAHandle: env.LINE_OA_HANDLE || "@himaishop",
    lineOAUrl: env.LINE_OA_URL || "https://line.me/R/ti/p/@himaishop",
    registerPrefix: env.REGISTER_PREFIX || "REGISTER HIMAI",
    suppliersTable: env.AIRTABLE_SUPPLIERS_TABLE || "Suppliers",
    himaiCustomersTableId: env.HIMAI_CUSTOMERS_TABLE_ID || "tblmNV3LP9kvXOzcU",
    consoleInboxTableId: env.CONSOLE_INBOX_TABLE_ID || "tblFHmfpB2TTrzO2e"
  };
}

/* =========================
   LINE WEBHOOK
========================= */

async function handleLineWebhook(request, env) {
  const cfg = getConfig(env);
  const rawBody = await request.text();
  const signature = request.headers.get("x-line-signature") || "";

  const isValid = await verifyLineSignature(
    rawBody,
    signature,
    env.LINE_CHANNEL_SECRET
  );

  if (!isValid) {
    return json({ ok: false, error: "Invalid LINE signature" }, 401);
  }

  let body;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return json({ ok: false, error: "Invalid JSON body" }, 400);
  }

  const events = Array.isArray(body.events) ? body.events : [];

  for (const event of events) {
    try {
      await processLineEvent(event, env, cfg);
    } catch (error) {
      console.log("processLineEvent error:", error?.message || String(error));
    }
  }

  return json({ ok: true });
}

async function processLineEvent(event, env, cfg) {
  if (!event || !event.type) return;

  if (event.type === "follow") {
    if (event.replyToken) {
      await replyLineMessage(env, event.replyToken, [
        {
          type: "text",
          text:
            `ยินดีต้อนรับสู่ ${cfg.appName} ✨\n\n` +
            `สมัครสมาชิกเบื้องต้นได้ที่หน้า /shop ก่อน แล้วคุยต่อกับร้านผ่าน LINE นี้ได้ทันที\n\n` +
            `หากเป็น supplier และต้องการเชื่อมบัญชี กรุณาส่ง:\n` +
            `${cfg.registerPrefix} ชื่อในระบบ`
        }
      ]);
    }
    return;
  }

  if (event.type !== "message") return;
  if (event.message?.type !== "text") return;

  const text = (event.message.text || "").trim();
  const replyToken = event.replyToken;
  const userId = event?.source?.userId;

  if (!replyToken) return;

  const upperText = text.toUpperCase();
  const upperPrefix = cfg.registerPrefix.toUpperCase();

  if (upperText.startsWith(upperPrefix)) {
    if (!userId) {
      await replyLineMessage(env, replyToken, [
        {
          type: "text",
          text: "ไม่สามารถอ่าน LINE user id ได้ในขณะนี้ กรุณาลองใหม่อีกครั้ง"
        }
      ]);
      return;
    }

    const keyword = text.slice(cfg.registerPrefix.length).trim();

    if (!keyword) {
      await replyLineMessage(env, replyToken, [
        {
          type: "text",
          text:
            `กรุณาส่งชื่อ supplier ต่อท้าย เช่น\n` +
            `${cfg.registerPrefix} Somchai`
        }
      ]);
      return;
    }

    let lineProfile = null;
    try {
      lineProfile = await getLineProfile(env, userId);
    } catch (error) {
      console.log("getLineProfile error:", error?.message || String(error));
    }

    const result = await findAndUpdateSupplierByName(env, cfg, {
      keyword,
      userId,
      lineDisplayName: lineProfile?.displayName || ""
    });

    if (result.matched) {
      await replyLineMessage(env, replyToken, [
        {
          type: "text",
          text:
            `เชื่อม supplier สำเร็จแล้ว ✨\n` +
            `ชื่อในระบบ: ${result.supplierName}\n` +
            `จากนี้ระบบสามารถส่งรายงานผ่าน LINE ได้`
        }
      ]);
    } else {
      await replyLineMessage(env, replyToken, [
        {
          type: "text",
          text:
            `ไม่พบ supplier ชื่อ "${keyword}" ในระบบ\n` +
            `กรุณาตรวจสอบชื่อแล้วลองใหม่อีกครั้ง`
        }
      ]);
    }

    return;
  }

  if (upperText === "สมัครสมาชิก" || upperText === "SIGN UP" || upperText === "สมัคร") {
    await replyLineMessage(env, replyToken, [
      {
        type: "text",
        text:
          `สมัครสมาชิกเบื้องต้นได้ที่หน้า /shop ก่อนเลย ✨\n` +
          `หลังจากลงทะเบียนแล้ว สามารถกลับมาคุยต่อที่ LINE นี้ได้ทันที`
      }
    ]);
    return;
  }

  await replyLineMessage(env, replyToken, [
    {
      type: "text",
      text:
        `สวัสดีจาก ${cfg.appName} ✨\n\n` +
        `หากต้องการสมัครสมาชิกเบื้องต้น ให้ลงทะเบียนผ่านหน้า /shop\n` +
        `หากเป็น supplier และต้องการเชื่อมบัญชี ส่ง:\n` +
        `${cfg.registerPrefix} ชื่อในระบบ`
    }
  ]);
}

/* =========================
   SHOP SIGNUP
========================= */

async function handleShopSignup(request, env) {
  const cfg = getConfig(env);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "Invalid JSON body" }, 400);
  }

  const {
    brand,
    source_path,
    username,
    display_name,
    phone,
    email,
    note,
    consent,
    source
  } = body || {};

  const normalizedUsername = String(username || "").trim();
  const normalizedDisplayName = String(display_name || "").trim();
  const normalizedPhone = normalizePhone(phone);
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const normalizedNote = String(note || "").trim();

  if (!normalizedUsername || normalizedUsername.length < 3) {
    return json({ ok: false, error: "Username is required" }, 400);
  }

  if (!normalizedDisplayName || normalizedDisplayName.length < 2) {
    return json({ ok: false, error: "Display name is required" }, 400);
  }

  if (!normalizedPhone || normalizedPhone.length < 8) {
    return json({ ok: false, error: "Phone is required" }, 400);
  }

  if (normalizedEmail && !isValidEmail(normalizedEmail)) {
    return json({ ok: false, error: "Invalid email format" }, 400);
  }

  if (!consent) {
    return json({ ok: false, error: "Consent is required" }, 400);
  }

  const customerName = normalizedDisplayName;

  let existingRecord = null;

  if (normalizedEmail) {
    existingRecord = await findHimaiCustomerByField(
      env,
      cfg.himaiCustomersTableId,
      "email",
      normalizedEmail
    );
  }

  if (!existingRecord && normalizedPhone) {
    existingRecord = await findHimaiCustomerByField(
      env,
      cfg.himaiCustomersTableId,
      "phone",
      normalizedPhone
    );
  }

  const noteBlock =
    `Brand: ${brand || "Himai Shop"}\n` +
    `Source: ${source || "webflow-shop"}\n` +
    `Consent: yes\n` +
    `User note: ${normalizedNote || "-"}`;

  if (existingRecord) {
    await airtableRequest(env, cfg.himaiCustomersTableId, {
      method: "PATCH",
      body: JSON.stringify({
        records: [
          {
            id: existingRecord.id,
            fields: {
              "Customer Name": customerName,
              "username": normalizedUsername,
              "display_name": normalizedDisplayName,
              "phone": normalizedPhone,
              "email": normalizedEmail || "",
              "brand_origin": "Himai Shop",
              "acquisition_channel": "webflow-shop",
              "source_path": source_path || "/shop",
              "line_oa_source": "@himaishop",
              "signup_status": "active",
              "curation_label": "standard-curated",
              "note": noteBlock
            }
          }
        ]
      })
    });

    try {
      await airtableRequest(env, cfg.consoleInboxTableId, {
        method: "POST",
        body: JSON.stringify({
          records: [
            {
              fields: {
                "source": "WEB",
                "intent": "membership_signup",
                "member_name": normalizedDisplayName,
                "member_email": normalizedEmail || "",
                "member_phone": normalizedPhone,
                "admin_note":
                  `Himai Shop signup updated existing customer\n` +
                  `Username: ${normalizedUsername}\n` +
                  `Source Path: ${source_path || "/shop"}\n` +
                  `Matched Record: ${existingRecord.id}\n` +
                  `Note: ${normalizedNote || "-"}`,
                "payload_json": JSON.stringify(
                  {
                    action: "update-existing",
                    existing_record_id: existingRecord.id,
                    brand: brand || "Himai Shop",
                    source_path: source_path || "/shop",
                    username: normalizedUsername,
                    display_name: normalizedDisplayName,
                    phone: normalizedPhone,
                    email: normalizedEmail || "",
                    note: normalizedNote || "",
                    source: source || "webflow-shop"
                  },
                  null,
                  2
                ),
                "status": "new"
              }
            }
          ]
        })
      });
    } catch (logError) {
      console.log("Console Inbox log skipped:", logError?.message || String(logError));
    }

    return json({
      ok: true,
      mode: "updated",
      message: "Existing Himai Shop customer updated",
      customer_name: customerName,
      existing_record_id: existingRecord.id,
      brand_origin: "Himai Shop",
      line_oa: cfg.lineOAHandle,
      line_url: cfg.lineOAUrl,
      next: "line"
    });
  }

  await airtableRequest(env, cfg.himaiCustomersTableId, {
    method: "POST",
    body: JSON.stringify({
      records: [
        {
          fields: {
            "Customer Name": customerName,
            "username": normalizedUsername,
            "display_name": normalizedDisplayName,
            "phone": normalizedPhone,
            "email": normalizedEmail || "",
            "brand_origin": "Himai Shop",
            "acquisition_channel": "webflow-shop",
            "source_path": source_path || "/shop",
            "line_oa_source": "@himaishop",
            "signup_status": "new",
            "curation_label": "standard-curated",
            "note": noteBlock
          }
        }
      ]
    })
  });

  try {
    await airtableRequest(env, cfg.consoleInboxTableId, {
      method: "POST",
      body: JSON.stringify({
        records: [
          {
            fields: {
              "source": "WEB",
              "intent": "membership_signup",
              "member_name": normalizedDisplayName,
              "member_email": normalizedEmail || "",
              "member_phone": normalizedPhone,
              "admin_note":
                `Himai Shop signup created new customer\n` +
                `Username: ${normalizedUsername}\n` +
                `Source Path: ${source_path || "/shop"}\n` +
                `Note: ${normalizedNote || "-"}`,
              "payload_json": JSON.stringify(
                {
                  action: "create-new",
                  brand: brand || "Himai Shop",
                  source_path: source_path || "/shop",
                  username: normalizedUsername,
                  display_name: normalizedDisplayName,
                  phone: normalizedPhone,
                  email: normalizedEmail || "",
                  note: normalizedNote || "",
                  source: source || "webflow-shop"
                },
                null,
                2
              ),
              "status": "new"
            }
          }
        ]
      })
    });
  } catch (logError) {
    console.log("Console Inbox log skipped:", logError?.message || String(logError));
  }

  return json({
    ok: true,
    mode: "created",
    message: "Himai Shop signup created",
    customer_name: customerName,
    brand_origin: "Himai Shop",
    line_oa: cfg.lineOAHandle,
    line_url: cfg.lineOAUrl,
    next: "line"
  });
}

/* =========================
   INTERNAL ENDPOINTS
========================= */

async function handleInternalSendReport(request, env) {
  const cfg = getConfig(env);
  const auth = request.headers.get("authorization") || "";
  const bearer = auth.replace(/^Bearer\s+/i, "");

  if (!safeEqual(bearer, env.INTERNAL_TOKEN)) {
    return json({ ok: false, error: "Unauthorized" }, 401);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "Invalid JSON body" }, 400);
  }

  const {
    lineUserId,
    supplierName,
    reportDate,
    totalSales,
    unitsSold,
    stockUnits,
    stockValue,
    outstandingCost,
    updatedAt,
    highlights
  } = body || {};

  if (!lineUserId) {
    return json({ ok: false, error: "Missing lineUserId" }, 400);
  }

  const flex = buildPartnerReportFlex(env, {
    supplierName,
    reportDate,
    totalSales,
    unitsSold,
    stockUnits,
    stockValue,
    outstandingCost,
    updatedAt,
    highlights
  });

  await pushLineMessage(env, lineUserId, [flex]);
  await updateSupplierLastReportSentAt(env, cfg, lineUserId).catch(() => null);

  return json({ ok: true, sent: true });
}

async function handleInternalPush(request, env) {
  const auth = request.headers.get("authorization") || "";
  const bearer = auth.replace(/^Bearer\s+/i, "");

  if (!safeEqual(bearer, env.INTERNAL_TOKEN)) {
    return json({ ok: false, error: "Unauthorized" }, 401);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "Invalid JSON body" }, 400);
  }

  const { lineUserId, messages } = body || {};

  if (!lineUserId || !Array.isArray(messages) || messages.length === 0) {
    return json({
      ok: false,
      error: "lineUserId and messages are required"
    }, 400);
  }

  await pushLineMessage(env, lineUserId, messages);

  return json({ ok: true, sent: true });
}

/* =========================
   AIRTABLE
========================= */

async function airtableRequest(env, path, init = {}) {
  const url = `https://api.airtable.com/v0/${env.AIRTABLE_BASE_ID}/${path}`;
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${env.AIRTABLE_TOKEN}`,
      "Content-Type": "application/json",
      ...(init.headers || {})
    }
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Airtable error: ${response.status} ${text}`);
  }

  return response.json();
}

async function findHimaiCustomerByField(env, tableId, fieldName, fieldValue) {
  const escapedValue = escapeAirtableString(fieldValue);
  const formula = `{${fieldName}}="${escapedValue}"`;

  const params = new URLSearchParams({
    filterByFormula: formula,
    maxRecords: "1"
  });

  const result = await airtableRequest(env, `${tableId}?${params.toString()}`, {
    method: "GET"
  });

  return result.records?.[0] || null;
}

async function findAndUpdateSupplierByName(env, cfg, { keyword, userId, lineDisplayName }) {
  const table = encodeURIComponent(cfg.suppliersTable);

  const formula =
    `SEARCH(LOWER("${escapeAirtableString(keyword)}"), LOWER({Supplier Name}))`;

  const params = new URLSearchParams({
    filterByFormula: formula,
    maxRecords: "1"
  });

  const result = await airtableRequest(env, `${table}?${params.toString()}`, {
    method: "GET"
  });

  const record = result.records?.[0];
  if (!record) return { matched: false };

  const supplierName = record.fields?.["Supplier Name"] || keyword;

  await airtableRequest(env, table, {
    method: "PATCH",
    body: JSON.stringify({
      records: [
        {
          id: record.id,
          fields: {
            "LINE User ID": userId,
            "LINE Name": lineDisplayName || "",
            "LINE Status": "Connected",
            "Last LINE Linked At": new Date().toISOString()
          }
        }
      ]
    })
  });

  return {
    matched: true,
    supplierName
  };
}

async function updateSupplierLastReportSentAt(env, cfg, lineUserId) {
  const table = encodeURIComponent(cfg.suppliersTable);
  const formula = `{LINE User ID}="${escapeAirtableString(lineUserId)}"`;

  const params = new URLSearchParams({
    filterByFormula: formula,
    maxRecords: "1"
  });

  const result = await airtableRequest(env, `${table}?${params.toString()}`, {
    method: "GET"
  });

  const record = result.records?.[0];
  if (!record) return;

  await airtableRequest(env, table, {
    method: "PATCH",
    body: JSON.stringify({
      records: [
        {
          id: record.id,
          fields: {
            "Last Report Sent At": new Date().toISOString()
          }
        }
      ]
    })
  });
}

/* =========================
   LINE API
========================= */

async function verifyLineSignature(rawBody, signature, channelSecret) {
  if (!signature || !channelSecret) return false;

  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(channelSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signed = await crypto.subtle.sign("HMAC", key, enc.encode(rawBody));
  const generated = arrayBufferToBase64(signed);

  return safeEqual(generated, signature);
}

async function replyLineMessage(env, replyToken, messages) {
  const response = await fetch("https://api.line.me/v2/bot/message/reply", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}`
    },
    body: JSON.stringify({
      replyToken,
      messages
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`LINE reply failed: ${response.status} ${text}`);
  }
}

async function pushLineMessage(env, lineUserId, messages) {
  const response = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}`
    },
    body: JSON.stringify({
      to: lineUserId,
      messages
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`LINE push failed: ${response.status} ${text}`);
  }
}

async function getLineProfile(env, userId) {
  const response = await fetch(
    `https://api.line.me/v2/bot/profile/${encodeURIComponent(userId)}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}`
      }
    }
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`LINE profile failed: ${response.status} ${text}`);
  }

  return response.json();
}

/* =========================
   FLEX MESSAGE
========================= */

function buildPartnerReportFlex(env, payload) {
  const {
    supplierName,
    reportDate,
    totalSales,
    unitsSold,
    stockUnits,
    stockValue,
    outstandingCost,
    updatedAt,
    highlights
  } = payload || {};

  const list = Array.isArray(highlights) ? highlights.slice(0, 3) : [];
  const dateLabel = reportDate || formatDateTimeBangkok(new Date().toISOString(), false);
  const updatedLabel = updatedAt || formatDateTimeBangkok(new Date().toISOString(), true);

  const highlightContents = list.length
    ? list.flatMap((item, index) => {
        return [
          {
            type: "box",
            layout: "vertical",
            spacing: "xs",
            margin: index === 0 ? "md" : "lg",
            paddingAll: "14px",
            backgroundColor: "#FFFFFF",
            cornerRadius: "12px",
            borderWidth: "1px",
            borderColor: "#EEE7DE",
            contents: [
              {
                type: "text",
                text: String(item.product || "-"),
                size: "sm",
                weight: "bold",
                color: "#181614",
                wrap: true
              },
              {
                type: "box",
                layout: "baseline",
                margin: "sm",
                contents: [
                  {
                    type: "text",
                    text: "Sold",
                    size: "xs",
                    color: "#8A8178",
                    flex: 3
                  },
                  {
                    type: "text",
                    text: String(formatNumber(item.soldQty)),
                    size: "xs",
                    color: "#181614",
                    align: "end",
                    weight: "bold",
                    flex: 2
                  }
                ]
              },
              {
                type: "box",
                layout: "baseline",
                margin: "xs",
                contents: [
                  {
                    type: "text",
                    text: "Left",
                    size: "xs",
                    color: "#8A8178",
                    flex: 3
                  },
                  {
                    type: "text",
                    text: String(formatNumber(item.stockLeft)),
                    size: "xs",
                    color: "#181614",
                    align: "end",
                    weight: "bold",
                    flex: 2
                  }
                ]
              }
            ]
          }
        ];
      })
    : [
        {
          type: "text",
          text: "No selected highlights",
          size: "xs",
          color: "#8A8178",
          margin: "md"
        }
      ];

  return {
    type: "flex",
    altText: `${env.APP_NAME || "Himai Shop"} Partner Statement`,
    contents: {
      type: "bubble",
      size: "giga",
      styles: {
        header: { backgroundColor: "#FAF8F5" },
        body: { backgroundColor: "#FFFFFF" },
        footer: { backgroundColor: "#FAF8F5" }
      },
      header: {
        type: "box",
        layout: "vertical",
        paddingTop: "18px",
        paddingBottom: "16px",
        paddingStart: "22px",
        paddingEnd: "22px",
        contents: [
          {
            type: "text",
            text: env.APP_NAME || "Himai Shop",
            size: "lg",
            weight: "bold",
            color: "#181614"
          },
          {
            type: "text",
            text: "Partner Statement",
            size: "xs",
            color: "#8A8178",
            margin: "sm"
          }
        ]
      },
      body: {
        type: "box",
        layout: "vertical",
        paddingTop: "20px",
        paddingBottom: "20px",
        paddingStart: "22px",
        paddingEnd: "22px",
        contents: [
          {
            type: "text",
            text: `${formatNumber(totalSales)} THB`,
            size: "xxl",
            weight: "bold",
            color: "#181614",
            wrap: true
          },
          {
            type: "text",
            text: "Gross sales overview",
            size: "xs",
            color: "#8A8178",
            margin: "sm"
          },
          {
            type: "separator",
            margin: "lg",
            color: "#EEE7DE"
          },
          {
            type: "box",
            layout: "vertical",
            margin: "lg",
            spacing: "sm",
            contents: [
              minimalWhiteKvRow("Partner", supplierName || "-"),
              minimalWhiteKvRow("Report Date", dateLabel),
              minimalWhiteKvRow("Units Sold", String(formatNumber(unitsSold))),
              minimalWhiteKvRow("Stock Units", String(formatNumber(stockUnits))),
              minimalWhiteKvRow("Stock Value", `${formatNumber(stockValue)} THB`),
              minimalWhiteKvRow("Outstanding", `${formatNumber(outstandingCost)} THB`)
            ]
          },
          {
            type: "separator",
            margin: "lg",
            color: "#EEE7DE"
          },
          {
            type: "text",
            text: "Selected Highlights",
            size: "sm",
            weight: "bold",
            color: "#181614",
            margin: "lg"
          },
          ...highlightContents,
          {
            type: "separator",
            margin: "lg",
            color: "#EEE7DE"
          },
          {
            type: "box",
            layout: "vertical",
            margin: "lg",
            spacing: "xs",
            contents: [
              {
                type: "text",
                text: "Updated",
                size: "xs",
                color: "#8A8178"
              },
              {
                type: "text",
                text: updatedLabel,
                size: "sm",
                color: "#181614",
                wrap: true
              }
            ]
          }
        ]
      },
      footer: {
        type: "box",
        layout: "vertical",
        paddingTop: "14px",
        paddingBottom: "16px",
        paddingStart: "22px",
        paddingEnd: "22px",
        contents: [
          {
            type: "text",
            text: "Curated update from Himai Shop",
            size: "xs",
            color: "#8A8178",
            align: "center"
          }
        ]
      }
    }
  };
}

function minimalWhiteKvRow(label, value) {
  return {
    type: "box",
    layout: "baseline",
    spacing: "md",
    contents: [
      {
        type: "text",
        text: label,
        size: "xs",
        color: "#8A8178",
        flex: 4
      },
      {
        type: "text",
        text: String(value),
        size: "sm",
        color: "#181614",
        weight: "bold",
        align: "end",
        wrap: true,
        flex: 6
      }
    ]
  };
}

/* =========================
   UTILITIES
========================= */

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8"
    }
  });
}

function normalizePhone(phone) {
  return String(phone || "").replace(/[^\d+]/g, "").trim();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "").trim());
}

function escapeAirtableString(value) {
  return String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"');
}

function safeEqual(a, b) {
  const aa = String(a || "");
  const bb = String(b || "");
  if (aa.length !== bb.length) return false;

  let result = 0;
  for (let i = 0; i < aa.length; i++) {
    result |= aa.charCodeAt(i) ^ bb.charCodeAt(i);
  }
  return result === 0;
}

function arrayBufferToBase64(buffer) {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;

  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }

  return btoa(binary);
}

function formatNumber(value) {
  const num = Number(value || 0);
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0
  }).format(num);
}

function formatDateTimeBangkok(iso, includeTime = true) {
  const date = new Date(iso);

  const options = includeTime
    ? {
        timeZone: "Asia/Bangkok",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit"
      }
    : {
        timeZone: "Asia/Bangkok",
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
      };

  return new Intl.DateTimeFormat("en-GB", options).format(date);
}
