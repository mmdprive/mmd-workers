// telegram/src/routes/promo.ts
/* =========================================================
   Promo Endpoint (LOCK-safe)
   - GET  /promo/validate?code=VIPDEC&subtotal=30000&currency=THB&intent=join_premium&tier=premium
   - POST /promo/validate  { code, subtotal, currency, intent, tier }

   Env:
     - PROMO_CODES_JSON (required)
     - PROMOTION_MONTHLY_JSON (optional)  // merge/override if present

   Notes:
   - subtotal expected in major units (THB) as number (e.g. 30000)
   - amount discounts assumed in same major unit as subtotal
   ========================================================= */

export type Env = {
  PROMO_CODES_JSON?: string;
  PROMOTION_MONTHLY_JSON?: string;
};

export type PromoRule = {
  label?: string;
  active?: boolean;

  type?: "percent" | "amount";
  value?: number;
  currency?: string;

  min_subtotal?: number;

  // allowlists (optional)
  intents?: string[];
  tiers?: string[];

  // ISO string
  expires_at?: string;
};

type PromoDict = Record<string, PromoRule>;

function jres(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function safeNum(v: unknown): number {
  const s = String(v ?? "").replace(/,/g, "").trim();
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function safeUpper(v: unknown): string {
  return String(v ?? "").trim().toUpperCase();
}

function safeLower(v: unknown): string {
  return String(v ?? "").trim().toLowerCase();
}

function parseJsonObject(raw?: string): Record<string, any> {
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

function normalizeDict(raw: Record<string, any>): PromoDict {
  const out: PromoDict = {};
  for (const [k, v] of Object.entries(raw || {})) {
    const code = safeUpper(k);
    if (!code) continue;
    if (!v || typeof v !== "object") continue;
    out[code] = v as PromoRule;
  }
  return out;
}

/**
 * Merge priority:
 * 1) PROMO_CODES_JSON base
 * 2) PROMOTION_MONTHLY_JSON overrides (if provided)
 */
function loadPromoDict(env: Env): PromoDict {
  const base = normalizeDict(parseJsonObject(env.PROMO_CODES_JSON));
  const monthlyRaw = parseJsonObject(env.PROMOTION_MONTHLY_JSON);
  const monthly = normalizeDict(monthlyRaw);

  // shallow override per code (monthly wins per field)
  for (const [code, rule] of Object.entries(monthly)) {
    base[code] = { ...(base[code] || {}), ...(rule || {}) };
  }

  return base;
}

function computeDiscount(subtotal: number, rule: PromoRule): { type: "percent" | "amount"; value: number; discount: number } {
  const type: "percent" | "amount" = rule.type === "amount" ? "amount" : "percent";
  const rawValue = safeNum(rule.value);

  let discount = 0;
  if (type === "percent") {
    const pct = Math.max(0, Math.min(100, rawValue));
    discount = Math.round((Math.max(0, subtotal) * pct) / 100);
    return { type, value: pct, discount };
  }

  const amt = Math.max(0, rawValue);
  discount = Math.round(amt);
  return { type, value: amt, discount };
}

function validateRule(params: {
  code: string;
  subtotal: number;
  currency: string;
  intent: string;
  tier: string;
  rule: PromoRule;
}): { ok: boolean; status: number; payload: any } {
  const { code, subtotal, currency, intent, tier, rule } = params;

  if (rule.active === false) {
    return { ok: false, status: 200, payload: { ok: false, valid: false, code, reason: "inactive" } };
  }

  if (isExpired(rule.expires_at)) {
    return {
      ok: false,
      status: 200,
      payload: { ok: false, valid: false, code, reason: "expired", expires_at: rule.expires_at || null },
    };
  }

  if (rule.currency) {
    const expected = safeUpper(rule.currency);
    const got = safeUpper(currency);
    if (got && expected && got !== expected) {
      return {
        ok: false,
        status: 200,
        payload: { ok: false, valid: false, code, reason: "currency_mismatch", currency_expected: expected, currency_got: got },
      };
    }
  }

  if (rule.min_subtotal && subtotal > 0 && subtotal < rule.min_subtotal) {
    return {
      ok: false,
      status: 200,
      payload: { ok: false, valid: false, code, reason: "min_subtotal", min_subtotal: rule.min_subtotal, subtotal },
    };
  }

  if (Array.isArray(rule.intents) && rule.intents.length) {
    const i = String(intent || "").trim();
    if (i && !rule.intents.includes(i)) {
      return { ok: false, status: 200, payload: { ok: false, valid: false, code, reason: "intent_not_allowed", intent: i } };
    }
  }

  if (Array.isArray(rule.tiers) && rule.tiers.length) {
    const t = safeLower(tier);
    if (t && !rule.tiers.map(safeLower).includes(t)) {
      return { ok: false, status: 200, payload: { ok: false, valid: false, code, reason: "tier_not_allowed", tier: t } };
    }
  }

  return { ok: true, status: 200, payload: null };
}

export async function handlePromo(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);

  // NOTE: This handler is meant to be mounted under "/promo"
  // so it should handle "/promo/validate" paths.
  if (!url.pathname.endsWith("/promo/validate") && !url.pathname.endsWith("/promo/validate/")) {
    // allow mounting at "/promo" router that calls this only for validate;
    // but safe fallback:
    return jres({ ok: false, error: "not_found" }, 404);
  }

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
  } else if (req.method === "OPTIONS") {
    // if you do CORS in router, you can remove this.
    return new Response("", { status: 204 });
  } else {
    return jres({ ok: false, error: "method_not_allowed" }, 405);
  }

  if (!code) return jres({ ok: false, error: "missing_code" }, 400);

  const dict = loadPromoDict(env);
  const rule = dict[code];

  if (!rule) {
    return jres({ ok: false, valid: false, code, reason: "not_found" }, 200);
  }

  const v = validateRule({ code, subtotal, currency, intent, tier, rule });
  if (!v.ok) return jres(v.payload, v.status);

  const { type, value, discount } = computeDiscount(subtotal, rule);
  const subtotalAfter = Math.max(0, Math.round(subtotal - discount));

  return jres({
    ok: true,
    valid: true,
    code,
    promo: {
      label: rule.label || code,
      type,
      value,
      currency: safeUpper(rule.currency || currency || "THB"),
      min_subtotal: rule.min_subtotal || 0,
      expires_at: rule.expires_at || null,
      intents: rule.intents || [],
      tiers: rule.tiers || [],
    },
    preview: {
      subtotal: Math.round(subtotal),
      discount,
      subtotal_after: subtotalAfter,
    },
  });
}
