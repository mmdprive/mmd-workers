export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const ua = request.headers.get("User-Agent") || "";

    // Health check
    if (request.method === "GET") {
      return json({ ok: true, ping: "OK" }, 200, corsHeaders(env));
    }

    // Preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(env) });
    }

    // Origin allowlist
    const allowed = String(env.ALLOWED_ORIGIN || "").trim();
    if (allowed && origin && origin !== allowed) {
      return text("Forbidden", 403, corsHeaders(env));
    }

    if (request.method !== "POST") {
      return text("Method Not Allowed", 405, corsHeaders(env));
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return text("Bad Request", 400, corsHeaders(env));
    }

    // ---- Turnstile ----
    const turnstileToken = String(body.turnstile_token || "");
    if (!turnstileToken) {
      return text("Missing CAPTCHA token", 400, corsHeaders(env));
    }
    const turnstileOk = await verifyTurnstile(env.TURNSTILE_SECRET, turnstileToken, request);
    if (!turnstileOk) {
      return text("CAPTCHA verification failed", 403, corsHeaders(env));
    }

    // ---- Normalize ----
    const eventId = crypto.randomUUID();
    const nowISO = new Date().toISOString();

    const pkg = String(body.package || "").trim(); // 7days | standard | premium
    const currency = "THB";
    const page = String(body.page || "/pay/membership");
    const lang = String(body.lang || "th");

    const isAuth = Boolean(body.is_authenticated);
    const customerEmail = String(body.customer_email || "");
    const customerName = String(body.customer_name || "");
    const memberId = String(body.member_id || "");
    const anomalyFlags = Array.isArray(body.anomaly_flags) ? body.anomaly_flags : [];

    if (!["7days", "standard", "premium"].includes(pkg)) {
      return text("Invalid package", 400, corsHeaders(env));
    }

    // ---- Base prices (LOCK) ----
    const BASE_PRICES = {
      "7days": 1499,
      // TODO: ใส่ราคาจริงถ้าต้องการล็อคเพิ่ม
      "standard": toInt(body.amount_thb),
      "premium": toInt(body.amount_thb)
    };

    let amount = BASE_PRICES[pkg];
    if (!Number.isFinite(amount) || amount <= 0) {
      return text("Invalid amount", 400, corsHeaders(env));
    }

    // ---- Promotions ----
    let promoApplied = null;

    // Monthly promo JSON: {"7days":1299,"standard":4999}
    if (env.PROMO_MONTHLY_JSON) {
      try {
        const monthly = JSON.parse(env.PROMO_MONTHLY_JSON);
        if (monthly[pkg]) {
          amount = Number(monthly[pkg]);
          promoApplied = "monthly";
        }
      } catch {}
    }

    // Promo code: {"MMDSEP":{"7days":999},"VIP":{"premium":7999}}
    const promoCode = String(body.promo_code || "").toUpperCase();
    if (promoCode && env.PROMO_CODES_JSON) {
      try {
        const codes = JSON.parse(env.PROMO_CODES_JSON);
        if (codes[promoCode] && codes[promoCode][pkg]) {
          amount = Number(codes[promoCode][pkg]);
          promoApplied = `code:${promoCode}`;
        }
      } catch {}
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      return text("Invalid promo amount", 400, corsHeaders(env));
    }

    const promptpayId = String(env.PROMPTPAY_ID || "0829528889");
    const promptpayUrl = String(body.promptpay_url || "");
    if (!promptpayUrl) {
      return text("Missing promptpay_url", 400, corsHeaders(env));
    }

    // ---- Telegram message ----
    const timeBkk = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Bangkok",
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit"
    }).format(new Date());

    const pkgLabel = (p) => {
      if (p === "7days") return "7 DAYS GUEST PASS";
      if (p === "standard") return "STANDARD MEMBERSHIP";
      if (p === "premium") return "PREMIUM MEMBERSHIP";
      return p.toUpperCase();
    };

    const lines = [];
    lines.push("🖤 MMD Privé — Membership Payment (Notify)");
    lines.push(`Event: ${eventId}`);
    lines.push(`Time (BKK): ${timeBkk}`);
    lines.push("");
    lines.push("— Payment —");
    lines.push(`Package: ${pkgLabel(pkg)} (${pkg})`);
    lines.push(`Amount: ${amount.toLocaleString()} ${currency}`);
    if (promoApplied) lines.push(`Promo: ${promoApplied}`);
    lines.push(`PromptPay ID: ${promptpayId}`);
    lines.push(`PromptPay URL: ${promptpayUrl}`);
    lines.push(`Page: ${page}`);
    lines.push(`Lang: ${lang}`);
    lines.push("");
    lines.push("— Customer —");
    lines.push(`Authenticated: ${isAuth ? "YES" : "NO"}`);
    if (customerEmail) lines.push(`Email: ${customerEmail}`);
    if (customerName) lines.push(`Name: ${customerName}`);
    if (memberId) lines.push(`Member ID: ${memberId}`);
    if (anomalyFlags.length) lines.push(`Anomaly: ${anomalyFlags.join(", ")}`);
    lines.push("");
    lines.push("— System —");
    if (origin) lines.push(`Origin: ${origin}`);
    if (ua) lines.push(`UA: ${truncate(ua, 160)}`);
    lines.push(`TS: ${nowISO}`);
    lines.push("");
    lines.push("Status: Customer clicked “Notify Team”");

    const tgText = lines.join("\n");

    const tgOk = await sendTelegram(env, tgText);

    // ---- Airtable ----
    let airtablePayOk = false;
    let airtableLogOk = false;

    try {
      airtablePayOk = await airtableCreate(env, env.AIRTABLE_TABLE_PAYMENTS, {
        "Member Email": customerEmail || "(guest)",
        "Package Code": pkg,
        "Amount": amount,
        "Currency": currency,
        "Status": "notified",
        "PromptPay URL": promptpayUrl,
        "Event ID": eventId,
        "Page": page,
        "Authenticated": isAuth ? "yes" : "no",
        "Anomaly Flags": anomalyFlags.join(", "),
        "Created At (ISO)": nowISO
      });
    } catch {}

    try {
      airtableLogOk = await airtableCreate(env, env.AIRTABLE_TABLE_ACCESS_LOG, {
        "Member Email": customerEmail || "(guest)",
        "Action": "notify_payment",
        "Target": "telegram",
        "Result": tgOk ? "success" : "fail",
        "Event ID": eventId,
        "Created At (ISO)": nowISO
      });
    } catch {}

    const resBody = {
      ok: tgOk,
      event_id: eventId,
      airtable: { payments: airtablePayOk, access_log: airtableLogOk }
    };

    return json(resBody, tgOk ? 200 : 502, corsHeaders(env));
  }
};

// ---------- helpers ----------

function corsHeaders(env) {
  const allow = String(env.ALLOWED_ORIGIN || "*");
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "POST, OPTIONS, GET",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin"
  };
}

function text(msg, status, headers) {
  return new Response(msg, { status, headers });
}

function json(obj, status, headers) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...headers, "Content-Type": "application/json" }
  });
}

function toInt(v) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : NaN;
}

function truncate(s, max) {
  const str = String(s || "");
  return str.length > max ? str.slice(0, max - 1) + "…" : str;
}

async function sendTelegram(env, text) {
  const token = env.TG_BOT_TOKEN;
  const chatId = env.TG_CHAT_ID;
  const threadId = Number(env.TG_THREAD_PAYMENT || 0);

  const payload = {
    chat_id: chatId,
    text,
    disable_web_page_preview: true
  };
  if (threadId) payload.message_thread_id = threadId;

  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  return res.ok;
}

async function airtableCreate(env, tableName, fields) {
  const baseId = env.AIRTABLE_BASE_ID;
  const token = env.AIRTABLE_API_KEY;
  const table = tableName || "payments";

  const res = await fetch(`https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table)}`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ fields })
  });
  if (!res.ok) throw new Error(await res.text());
  return true;
}

async function verifyTurnstile(secret, token, request) {
  if (!secret) return false;
  const ip = request.headers.get("CF-Connecting-IP") || "";

  const form = new FormData();
  form.append("secret", secret);
  form.append("response", token);
  if (ip) form.append("remoteip", ip);

  const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body: form
  });
  if (!res.ok) return false;
  const data = await res.json();
  return Boolean(data && data.success);
}
