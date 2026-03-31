import type { Deal } from "./types";

// ⚠️ public base URL ใช้ได้
const ADMIN_API_BASE =
  process.env.NEXT_PUBLIC_ADMIN_API_BASE || "http://localhost:8787";

// 🔐 server-only token (ห้ามมี NEXT_PUBLIC อีกต่อไป)
const ADMIN_INTERNAL_TOKEN =
  process.env.AUTH_ADMIN_CONSOLE_TOKEN || "";

function authHeaders(): HeadersInit {
  if (!ADMIN_INTERNAL_TOKEN) {
    throw new Error("Missing AUTH_ADMIN_CONSOLE_TOKEN");
  }

  return {
    Authorization: `Bearer ${ADMIN_INTERNAL_TOKEN}`,
  };
}

export async function getDeals(
  params?: Record<string, string | undefined>,
): Promise<{ ok: true; deals: Deal[] }> {
  const url = new URL(`${ADMIN_API_BASE}/v1/admin/deals/list-lite`);

  Object.entries(params || {}).forEach(([key, value]) => {
    if (value) url.searchParams.set(key, value);
  });

  const res = await fetch(url.toString(), {
    headers: authHeaders(),
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to fetch deals: ${res.status} ${text}`);
  }

  return (await res.json()) as { ok: true; deals: Deal[] };
}

export async function getDealById(dealId: string): Promise<Deal> {
  const data = await getDeals();
  const deal = data.deals.find((d) => d.deal_id === dealId);

  if (!deal) {
    throw new Error(`Deal not found: ${dealId}`);
  }

  return deal;
}

export async function getDashboardSummary(): Promise<{
  open_deals: number;
  needs_per: number;
  pending_payments: number;
  active_models: number;
}> {
  const data = await getDeals();

  return {
    open_deals: data.deals.length,
    needs_per: data.deals.filter((d) => d.deal_status === "needs_per_review").length,
    pending_payments: data.deals.filter((d) => d.deal_status === "awaiting_payment").length,
    active_models: 0,
  };
}