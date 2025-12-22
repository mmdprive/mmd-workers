export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const ua = request.headers.get("User-Agent") || "";

    // ---------- CORS Preflight ----------
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(env, origin) });
    }

    // ---------- Health check ----------
    if (request.method === "GET") {
      return json({ ok: true, ping: "OK" }, 200, corsHeaders(env, origin));
    }

    // ---------- Origin allowlist ----------
    const allowedOrigin = String(env.ALLOWED_ORIGIN || "").trim();
    if (allowedOrigin && origin && origin !== allowedOrigin) {
      return text("Forbidden", 403, corsHeaders(env, origin));
    }

    // ---------- Only POST (notify) ----------
    if (request.method !== "POST") {
      return text("Method Not Allowed", 405, corsHeaders(env, origin));
    }

    // ---------- Parse JSON ----------
    let body;
    try {
      body = await request.json();
    } catch {
      return text("Bad Request", 400, corsHeaders(env, origin));
    }

    // ---------- Turnstile ----------
    const turnstileToken = String(body.turnstile_token || "");
    if (!turnstileToken) {
      return text("Missing CAPTCHA token", 400, corsHeaders(env, origin));
    }
    const turnstileOk = await verifyTurnstile(env.TURNSTILE_SECRET, turnstileToken, request);
    if (!turnstileOk) {
      return text("CAPTCHA verification failed", 403, corsHeaders(env, origin));
    }

    // ---------- Normalize ----------
    const eventId = crypto.randomUUID();
    const nowISO = new Date().toISOString();

    const pkg = String(body.package || "").trim(); // "7days" | "standard" | "premium"
    const amountClient = toInt(body.amount_thb);
    const currency = String(body.currency || "THB").toUpperCase();

    const page = String(body.page || "/pay/membership");
    const lang = String(body.lang || "th").toLowerCase();

    const isAuth = Boolean(body.is_authenticated);
    const customerEmail = String(body.customer_email || "");
    const customerName = String(body.customer_name || "");
    const memberId = String(body.member_id || "");
    const anomalyFlags = Array.isArray(body.anomaly_flags) ? body.anomaly_flags : [];

    // promo inputs (optional)
    const promoCode = String(body.promo_code || "").trim().toUpperCase();
    const promoSig = String(body.promo_sig || "").trim();

    // ---------- Base price (LOCKED) ----------
    const BASE_PRICE = { "7days": 1499, "standard": 1199, "premium": 2999 };

    if (!pkg || !Object.prototype.hasOwnProperty.call(BASE_PRICE, pkg)) {
      return text("Invalid package", 400, corsHeaders(env, origin));
    }
    if (!Number.isFinite(amountClient) || amountClient <= 0) {
      return text("Invalid amount", 400, corsHeaders(env, origin));
    }

    // ---------- Compute expected price (base -> monthly -> code) ----------
    const pricing = await computeExpectedPrice({
      pkg,
      base: BASE_PRICE,
      now: new Date(),
      promoCode,
      promoSig,
      env,
    });

    // enforce price
    if (amountClient !== pricing.amount) {
      return text(`Amount mismatch (expected ${pricing.amount})`, 400, corsHeaders(env, origin));
    }

    // ---------- PromptPay URL enforcement ----------
    // We do NOT trust client promptpay_url. We compute expected and require match.
    const promptpayId = String(env.PROMPTPAY_ID || "").trim();
    if (!promptpayId) {
      return text("Missing PROMPTPAY_ID", 500, corsHeaders(env, origin));
    }

    const expectedPromptpayUrl = `https://promptpay.io/${promptpayId}/${pricing.amount}`;
    const promptpayUrlClient = String(body.promptpay_url || "").trim();
    if (!promptpayUrlClient) {
      return text("Missing promptpay_url", 400, corsHeaders(env, origin));
    }
    if (promptpayUrlClient !== expectedPromptpayUrl) {
      return text("PromptPay URL mismatch", 400, corsHeaders(env, origin));
    }

    // ---------- Telegram message ----------
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

    const amountFmt = pricing.amount.toLocaleString("en-US");

    const lines = [];
    lines.push("🖤 MMD Privé — Membership Payment (Notify)");
    lines.push(`Event: ${eventId}`);
    lines.push(`Time (BKK): ${timeBkk}`);
    lines.push("");
    lines.push("— Payment —");
    lines.push(`Package: ${pkgLabel(pkg)} (${pkg})`);
    lines.push(`Amount: ${amountFmt} ${currency}`);
    if (pricing.source !== "base") lines.push(`Promo: ${pricing.label}`);
    if (promoCode) lines.push(`Promo Code: ${promoCode}`);
    lines.push(`PromptPay ID: ${promptpayId}`);
    lines.push(`PromptPay URL: ${expectedPromptpayUrl}`);
    lines.push(`Page: ${page}`);
    lines.push(`Lang: ${lang}`);
    lines.push("");
    lines.push("— Customer —");
    lines.push(`Authenticated: ${isAuth ? "YES" : "NO"}`);
    if (customerEmail) lines.push(`Email: ${customerEmail}`);
    if (customerName) lines.push(`Name: ${customerName}`);
    if (memberId) lines.push(`Member ID: ${memberId}`);
    if (!isAuth) lines.push("Notice: Guest / not logged in (verification may take longer)");
    if (anomalyFlags.length) lines.push(`Anomaly: ${anomalyFlags.join(", ")}`);
    lines.push("");
    lines.push("— System —");
    if (origin) lines.push(`Origin: ${origin}`);
    if (ua) lines.push(`UA: ${truncate(ua, 160)}`);
    lines.push(`TS: ${nowISO}`);
    lines.push("");
    lines.push("Status: Customer clicked “Notify Team”");

    const tgText = lines.join("\n");

    // 1) Send Telegram
    const tgOk = await sendTelegram(env, tgText);

    // 2) Write Airtable
    let airtablePayOk = false;
    let airtableLogOk = false;

    try {
      airtablePayOk = await airtableCreate(env, env.AIRTABLE_TABLE_PAYMENTS, {
        "Member Email": customerEmail || "(guest)",
        "Package Code": pkg,
        "Amount": pricing.amount,
        "Currency": currency,
        "Status": "notified",
        "PromptPay URL": expectedPromptpayUrl,
        "Event ID": eventId,
        "Page": page,
        "Authenticated": isAuth ? "yes" : "no",
        "Anomaly Flags": anomalyFlags.join(", "),
        "Created At (ISO)": nowISO,
        "Promo Label": pricing.label || "",
        "Promo Source": pricing.source,
        "Promo Code": promoCode || ""
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
      expected_amount: pricing.amount,
      promo: { source: pricing.source, label: pricing.label || "", code: promoCode || "" },
      airtable: { payments: airtablePayOk, access_log: airtableLogOk }
    };

    const headers = { ...corsHeaders(env, origin), "Content-Type": "application/json" };
    return new Response(JSON.stringify(resBody), { status: tgOk ? 200 : 502, headers });
  }
};

// ---------------- Promo Engine ----------------

async function computeExpectedPrice({ pkg, base, now, promoCode, promoSig, env }) {
  // base
  let result = { amount: base[pkg], source: "base", label: "" };

  // monthly promo (time-based)
  const monthly = safeJson(env.PROMO_MONTHLY_JSON);
  if (monthly?.active && isWithin(now, monthly.start, monthly.end)) {
    const mp = monthly?.prices?.[pkg];
    const mpNum = Number(mp);
    if (Number.isFinite(mpNum) && mpNum > 0) {
      result = { amount: Math.trunc(mpNum), source: "monthly", label: monthly.label || "MONTHLY PROMO" };
    }
  }

  // promo code (overrides monthly if valid)
  if (promoCode) {
    // strict: require valid signature, otherwise reject
    const okSig = await verifyPromoSig(env.WEBHOOK_SECRET, promoCode, promoSig);
    if (!okSig) {
      // hard fail (security)
      throw new HttpError(403, "Invalid promo signature");
    }

    const codes = safeJson(env.PROMO_CODES_JSON) || {};
    const rule = codes[promoCode];
    if (!rule) {
      throw new HttpError(400, "Invalid promo code");
    }
    const cpNum = Number(rule?.prices?.[pkg]);
    if (!Number.isFinite(cpNum) || cpNum <= 0) {
      throw new HttpError(400, "Promo not applicable");
    }

    result = { amount: Math.trunc(cpNum), source: "code", label: rule.label || `CODE ${promoCode}` };
  }

  return result;
}

function isWithin(now, startISO, endISO) {
  if (!startISO || !endISO) return false;
  const s = new Date(startISO);
  const e = new Date(endISO);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return false;
  return now >= s && now <= e;
}

function safeJson(v) {
  try { return JSON.parse(String(v || "")); } catch { return null; }
}

// sig = base64url(HMAC_SHA256(WEBHOOK_SECRET, promoCode))
async function verifyPromoSig(secret, promoCode, sig) {
  if (!secret || !promoCode || !sig) return false;
  const expected = await hmacBase64Url(secret, promoCode);
  return timingSafeEqualStr(expected, sig);
}

async function hmacBase64Url(secret, msg) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const mac = await crypto.subtle.sign("HMAC", key, enc.encode(msg));
  return base64UrlEncode(new Uint8Array(mac));
}

function base64UrlEncode(bytes) {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  const b64 = btoa(bin);
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function timingSafeEqualStr(a, b) {
  const aa = String(a || "");
  const bb = String(b || "");
  if (aa.length !== bb.length) return false;
  let out = 0;
  for (let i = 0; i < aa.length; i++) out |= aa.charCodeAt(i) ^ bb.charCodeAt(i);
  return out === 0;
}

// ---------------- Helpers ----------------

function corsHeaders(env, origin) {
  const allow = String(env.ALLOWED_ORIGIN || "").trim();
  const allowOrigin = allow || origin || "*";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
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
  if (!Number.isFinite(n)) return NaN;
  return Math.trunc(n);
}

function truncate(s, max) {
  const str = String(s || "");
  return str.length > max ? str.slice(0, max - 1) + "…" : str;
}

async function sendTelegram(env, text) {
  const token = env.TG_BOT_TOKEN;
  const chatId = env.TG_CHAT_ID;
  const threadId = Number(env.TG_THREAD_PAYMENT || 0);

  if (!token || !chatId) return false;

  const payload = { chat_id: chatId, text, disable_web_page_preview: true };
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

  if (!baseId) throw new Error("Missing AIRTABLE_BASE_ID");
  if (!token) throw new Error("Missing AIRTABLE_API_KEY");

  const res = await fetch(`https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table)}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ fields })
  });

  if (!res.ok) throw new Error(await res.text().catch(() => "Airtable error"));
  return true;
}

async function verifyTurnstile(secret, token, request) {
  if (!secret) return false;
  const ip = request.headers.get("CF-Connecting-IP") || "";

  const formData = new FormData();
  formData.append("secret", secret);
  formData.append("response", token);
  if (ip) formData.append("remoteip", ip);

  const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body: formData
  });

  if (!res.ok) return false;
  const data = await res.json().catch(() => null);
  return Boolean(data && data.success);
}

// Small helper to throw HTTP errors inside promo engine
class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
