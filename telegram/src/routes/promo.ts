// telegram/src/routes/promo.ts
/* =========================================================
   Promo Endpoint
   - GET  /promo/validate?code=VIPDEC&subtotal=30000
   - POST /promo/validate  { code, subtotal, currency, intent, tier }
   Env:
     - PROMO_CODES_JSON (recommended)
       Example shape:
       {
         "VIPDEC": {
           "label": "VIP Dec Campaign",
           "type": "percent",
           "value": 10,
           "min_subtotal": 10000,
           "currency": "THB",
           "active": true,
           "expires_at": "2026-02-01T00:00:00.000Z"
         }
       }
   ========================================================= */

type Env = {
  PROMO_CODES_JSON?: string;
  PROMOTION_MONTHLY_JSON?: string; // optional; ignored unless you want to merge rules
};

type PromoRule = {
  label?: string;
  active?: boolean;

  // discount
  type?: "percent" | "amount";
  value?: number;                 // percent (0-100) or amount in currency minor? (you decide)
  currency?: string;              // e.g. "THB"

  // constraints
  min_subtotal?: number;          // subtotal in THB
  intents?: string[];             // allowed intents (optional)
  tiers?: string[];               // allowed tiers (optional)
  expires_at?: string;            // ISO date
};

function jres(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function safeNum(v: unknown): number {
  const n = Number(String(v ?? "").replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : 0;
}

function safeUpper(v: unknown): string {
  return String(v ?? "").trim().toUpperCase();
}

function parseJsonObject(raw: string | undefined): Record<string, any> {
  if (!raw) return {};
  try {
    const obj = JSON.parse(raw);
    return obj && typeof obj === "object" ? obj : {};
  } catch {
    return {};
  }
}

function isExpired(expiresAt?: string): boolean {
  if (!expiresAt) return false;
  const t = Date.parse(expiresAt);
  if (!Number.isFinite(t)) return false;
  return Date.now() > t;
}

export async function handlePromo(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);

  let code = "";
  let subtotal = 0;
  let currency = "";
  let intent = "";
  let tier = "";

  if (req.method === "GET") {
    code = safeUpper(url.searchParams.get("code"));
    subtotal = safeNum(url.searchParams.get("subtotal"));
    currency = safeUpper(url.searchParams.get("currency") || "");
    intent = String(url.searchParams.get("intent") || "").trim();
    tier = String(url.searchParams.get("tier") || "").trim();
  } else if (req.method === "POST") {
    let body: any = {};
    try {
      body = await req.json();
    } catch {
      return jres({ ok: false, error: "invalid_json" }, 400);
    }
    code = safeUpper(body.code);
    subtotal = safeNum(body.subtotal);
    currency = safeUpper(body.currency || "");
    intent = String(body.intent || "").trim();
    tier = String(body.tier || "").trim();
  } else {
    return jres({ ok: false, error: "method_not_allowed" }, 405);
  }

  if (!code) {
    return jres({ ok: false, error: "missing_code" }, 400);
  }

  // Load rules (PROMO_CODES_JSON is the main source)
  const dict = parseJsonObject(env.PROMO_CODES_JSON);

  const rule: PromoRule | undefined = dict[code];
  if (!rule) {
    return jres({
      ok: false,
      valid: false,
      code,
      reason: "not_found",
    });
  }

  if (rule.active === false) {
    return jres({ ok: false, valid: false, code, reason: "inactive" });
  }

  if (isExpired(rule.expires_at)) {
    return jres({ ok: false, valid: false, code, reason: "expired", expires_at: rule.expires_at });
  }

  if (rule.currency && currency && rule.currency.toUpperCase() !== currency) {
    return jres({ ok: false, valid: false, code, reason: "currency_mismatch", currency_expected: rule.currency });
  }

  if (rule.min_subtotal && subtotal > 0 && subtotal < rule.min_subtotal) {
    return jres({
      ok: false,
      valid: false,
      code,
      reason: "min_subtotal",
      min_subtotal: rule.min_subtotal,
      subtotal,
    });
  }

  if (rule.intents?.length && intent && !rule.intents.includes(intent)) {
    return jres({ ok: false, valid: false, code, reason: "intent_not_allowed", intent });
  }

  if (rule.tiers?.length && tier && !rule.tiers.includes(tier)) {
    return jres({ ok: false, valid: false, code, reason: "tier_not_allowed", tier });
  }

  // Compute discount preview (non-authoritative; your checkout can re-validate server-side)
  const type = rule.type || "percent";
  const value = safeNum(rule.value);

  let discount = 0;
  if (type === "percent") {
    discount = Math.round((Math.max(0, subtotal) * Math.max(0, Math.min(100, value))) / 100);
  } else {
    discount = Math.round(Math.max(0, value));
  }

  const subtotalAfter = Math.max(0, Math.round(subtotal - discount));

  return jres({
    ok: true,
    valid: true,
    code,
    promo: {
      label: rule.label || code,
      type,
      value,
      currency: rule.currency || currency || "THB",
      min_subtotal: rule.min_subtotal || 0,
      expires_at: rule.expires_at || null,
    },
    preview: {
      subtotal,
      discount,
      subtotal_after: subtotalAfter,
    },
  });
}
