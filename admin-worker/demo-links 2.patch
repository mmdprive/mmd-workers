const AIRTABLE_API = "https://api.airtable.com/v0";

export async function demoLinksCreate(req, env) {
  if (!isAuthed(req, env)) {
    return json(
      {
        ok: false,
        error: "unauthorized",
        message: "Invalid or missing auth",
      },
      401
    );
  }

  if (!env.AIRTABLE_API_KEY || !env.AIRTABLE_BASE_ID || !env.AIRTABLE_TABLE_DEMO_LINKS) {
    return json(
      {
        ok: false,
        error: "missing_airtable_env",
        message: "Airtable env is missing",
      },
      500
    );
  }

  const body = await safeJson(req);

  const mode = asString(body.mode);
  if (mode && mode !== "demo_id") {
    return json(
      {
        ok: false,
        error: "invalid_mode",
        message: "mode must be demo_id",
      },
      400
    );
  }

  const demoState = normalizeDemoState(body.demo_state);
  const confirmBaseUrl =
    asString(body.confirm_base_url) || "https://mmdbkk.com/confirm";

  const record = {
    demo_id: generateDemoId(),
    demo_state: demoState,
    client_name: demoState === "invalid" ? "" : asString(body.client_name),
    model_name: demoState === "invalid" ? "" : asString(body.model_name),
    job_name: demoState === "invalid" ? "" : asString(body.job_name),
    event_date: demoState === "invalid" ? "" : asString(body.event_date),
    event_time: demoState === "invalid" ? "" : asString(body.event_time),
    location_name: demoState === "invalid" ? "" : asString(body.location_name),
    amount_thb: demoState === "invalid" ? "" : normalizeAmount(body.amount_thb),
    session_id: demoState === "invalid" ? "" : asString(body.session_id),
    payment_ref: demoState === "invalid" ? "" : asString(body.payment_ref),
    payment_type: demoState === "invalid" ? "" : normalizePaymentType(body.payment_type),
    created_by: asString(body.created_by) || "Per",
    notes: asString(body.notes),
    confirm_base_url: confirmBaseUrl,
    generated_url: "",
    created_at_iso: new Date().toISOString(),
    updated_at_iso: new Date().toISOString(),
    is_active: true,
  };

  record.generated_url =
    `${confirmBaseUrl}#demo_id=${encodeURIComponent(record.demo_id)}`;

  const validationError = validateRecordForState(record);
  if (validationError) {
    return json(
      {
        ok: false,
        error: validationError.code,
        message: validationError.message,
      },
      400
    );
  }

  try {
    const airtableRecord = await airtableCreateRecord(env, {
      "Demo ID": record.demo_id,
      "Demo State": record.demo_state,
      "Client Name": record.client_name,
      "Model Name": record.model_name,
      "Job Name": record.job_name,
      "Event Date": record.event_date,
      "Event Time": record.event_time,
      "Location Name": record.location_name,
      "Amount THB": record.amount_thb,
      "Session ID": record.session_id,
      "Payment Ref": record.payment_ref,
      "Payment Type": record.payment_type,
      "Created By": record.created_by,
      "Notes": record.notes,
      "Confirm Base URL": record.confirm_base_url,
      "Generated URL": record.generated_url,
      "Created At ISO": record.created_at_iso,
      "Updated At ISO": record.updated_at_iso,
      "Is Active": record.is_active,
    });

    return json({
      ok: true,
      demo_id: record.demo_id,
      generated_url: record.generated_url,
      airtable_record_id: airtableRecord.id,
      data: record,
    });
  } catch (error) {
    return json(
      {
        ok: false,
        error: "create_failed",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      500
    );
  }
}

export async function demoLinksGet(req, env) {
  if (!env.AIRTABLE_API_KEY || !env.AIRTABLE_BASE_ID || !env.AIRTABLE_TABLE_DEMO_LINKS) {
    return json(
      {
        ok: false,
        error: "missing_airtable_env",
        message: "Airtable env is missing",
      },
      500
    );
  }

  const url = new URL(req.url);
  const demoId = asString(url.searchParams.get("demo_id"));

  if (!demoId) {
    return json(
      {
        ok: false,
        error: "missing_demo_id",
        message: "demo_id is required",
      },
      400
    );
  }

  try {
    const record = await airtableFindByDemoId(env, demoId);

    if (!record) {
      return json(
        {
          ok: false,
          error: "not_found",
          message: "No demo record found",
        },
        404
      );
    }

    const fields = record.fields || {};
    const demoState = asString(fields["Demo State"]).toLowerCase();
    const amount = normalizeAmount(fields["Amount THB"]);
    const isPaid = demoState === "paid";
    const isInvalid = demoState === "invalid";

    return json({
      ok: true,
      demo_id: asString(fields["Demo ID"]),
      session_id: isInvalid ? "" : asString(fields["Session ID"]),
      payment_ref: isInvalid ? "" : asString(fields["Payment Ref"]),
      payment_type: isInvalid ? "" : asString(fields["Payment Type"]),
      amount_thb: isInvalid ? "" : amount,
      remaining_amount_thb: isInvalid ? "" : isPaid ? 0 : amount,
      verification_status: isInvalid ? "" : isPaid ? "Confirmed" : "Pending",
      payment_status: isInvalid ? "" : isPaid ? "Paid" : "Unpaid",
      updated_at:
        asString(fields["Updated At ISO"]) || asString(fields["Created At ISO"]),
      message: getDemoMessage(demoState),
      client_name: isInvalid ? "" : asString(fields["Client Name"]),
      model_name: isInvalid ? "" : asString(fields["Model Name"]),
      job_name: isInvalid ? "" : asString(fields["Job Name"]),
      event_date: isInvalid ? "" : asString(fields["Event Date"]),
      event_time: isInvalid ? "" : asString(fields["Event Time"]),
      location_name: isInvalid ? "" : asString(fields["Location Name"]),
      promptpay_url: "",
      card_enabled: !isInvalid && !isPaid,
      promptpay_enabled: !isInvalid && !isPaid,
      is_paid: isPaid,
      is_mock: true,
      demo_state: demoState,
    });
  } catch (error) {
    return json(
      {
        ok: false,
        error: "internal_error",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      500
    );
  }
}

function isAuthed(req, env) {
  const auth = req.headers.get("Authorization") || "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";

  if (env.ADMIN_BEARER && bearer && bearer === env.ADMIN_BEARER) {
    return true;
  }

  const confirmKey = asString(req.headers.get("X-Confirm-Key") || "");
  if (env.CONFIRM_KEY && confirmKey && confirmKey === env.CONFIRM_KEY) {
    return true;
  }

  const internalToken = env.INTERNAL_TOKEN || "";
  if (internalToken && bearer && bearer === internalToken) {
    return true;
  }

  return false;
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

async function safeJson(req) {
  try {
    return await req.json();
  } catch (_) {
    return {};
  }
}

function asString(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function normalizeDemoState(value) {
  const v = asString(value).toLowerCase();
  if (v === "pending" || v === "paid" || v === "invalid") return v;
  return "pending";
}

function normalizePaymentType(value) {
  const v = asString(value).toLowerCase();
  if (v === "deposit" || v === "final" || v === "full" || v === "tips") {
    return v;
  }
  return "final";
}

function normalizeAmount(value) {
  const raw = asString(value).replace(/[^0-9.-]/g, "");
  if (!raw) return "";
  const n = Number(raw);
  if (Number.isNaN(n)) return "";
  return n;
}

function generateDemoId() {
  return `demo_${crypto.randomUUID().replace(/-/g, "").slice(0, 18)}`;
}

function getDemoMessage(demoState) {
  if (demoState === "paid") {
    return "ระบบบันทึกรายการนี้เรียบร้อย และ session นี้ได้รับการยืนยันแล้ว";
  }

  if (demoState === "invalid") {
    return "ลิงก์อาจหมดอายุหรือไม่ถูกต้อง กรุณาติดต่อ MMD เพื่อรับลิงก์ใหม่";
  }

  return "ยอดคงเหลือสำหรับ session นี้ยังไม่ได้ชำระ สามารถดำเนินการต่อได้จากหน้านี้";
}

function validateRecordForState(record) {
  if (record.demo_state === "invalid") {
    return null;
  }

  const required = [
    ["client_name", record.client_name],
    ["model_name", record.model_name],
    ["job_name", record.job_name],
    ["event_date", record.event_date],
    ["event_time", record.event_time],
    ["location_name", record.location_name],
  ];

  for (const [key, value] of required) {
    if (value === "" || value === null || value === undefined) {
      return {
        code: `missing_${key}`,
        message: `${key} is required`,
      };
    }
  }

  if (record.amount_thb === "" || !Number.isFinite(Number(record.amount_thb)) || Number(record.amount_thb) <= 0) {
    return {
      code: "invalid_amount_thb",
      message: "amount_thb must be greater than 0",
    };
  }

  return null;
}

function escapeAirtableValue(value) {
  return String(value).replace(/'/g, "\\'");
}

async function airtableCreateRecord(env, fields) {
  const url =
    `${AIRTABLE_API}/${env.AIRTABLE_BASE_ID}/${encodeURIComponent(env.AIRTABLE_TABLE_DEMO_LINKS)}`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.AIRTABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      fields,
      typecast: true,
    }),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data?.error?.message || "Airtable create failed");
  }

  return data;
}

async function airtableFindByDemoId(env, demoId) {
  const formula = `{Demo ID}='${escapeAirtableValue(demoId)}'`;
  const url =
    `${AIRTABLE_API}/${env.AIRTABLE_BASE_ID}/${encodeURIComponent(env.AIRTABLE_TABLE_DEMO_LINKS)}?maxRecords=1&filterByFormula=${encodeURIComponent(formula)}`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${env.AIRTABLE_API_KEY}`,
    },
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data?.error?.message || "Airtable lookup failed");
  }

  const records = data.records || [];
  return records[0] || null;
}
