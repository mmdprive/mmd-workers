import type { Env, StockListResponse, StockUpdateRequest, StockUpdateResponse } from "../types";

const FIELD = {
  products: {
    name: "fld0oKjoZrb1IqntV",
    sku: "fldhJE7UEE4VYHjR6",
    category: "fld37QbTBaTDSvgKy",
    status: "fldxYkkvmK9izvACA",
    cost: "fldXmhvM3MmSKAZCc",
    retail: "fldD4ae8gTlwYVhez",
    supplier: "fldJCZ7YzsUjIItKf",
    note: "fldAT8hnluV4CtF3c",
  },
  batches: {
    name: "fldtfzLVljSCVdDNW",
    product: "fldVc73xUxjrfSjHY",
    supplier: "fldrrEXHJeTPKXs0l",
    batchCode: "fldavW4g5y3e3Mdx1",
    qtyIn: "fldY4BJKDzpi2f844",
    qtyRemaining: "fldvjoRuM1mrR6ItQ",
    costPerUnit: "fldP5LaRWkq0qBJVQ",
    lowStockFlag: "fldYtzXtBvK3HuqQa",
    status: "fldZW2m1Xq8q0ZH9Z",
    note: "fld5UTP9p8w6tn6JH",
  },
};

type AirtableRecord = { id: string; fields: Record<string, any> };

type ProductLite = {
  id: string;
  product_name: string;
  sku?: string;
  category?: string;
  catalog_status?: string;
  cost_price: number;
  retail_price: number;
  supplier_ids: string[];
  note?: string;
};

function airtableBaseUrl(env: Env, tableId: string): string {
  return `https://api.airtable.com/v0/${env.AIRTABLE_BASE_ID}/${tableId}`;
}

async function airtableList(env: Env, tableId: string): Promise<AirtableRecord[]> {
  const records: AirtableRecord[] = [];
  let offset = "";

  do {
    const url = new URL(airtableBaseUrl(env, tableId));
    url.searchParams.set("pageSize", "100");
    if (offset) url.searchParams.set("offset", offset);

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${env.AIRTABLE_API_KEY}` },
    });

    const data = (await res.json().catch(() => null)) as { records?: AirtableRecord[]; offset?: string } | null;

    if (!res.ok) {
      throw new Error(`Airtable list error: ${JSON.stringify(data)}`);
    }

    records.push(...(data?.records || []));
    offset = data?.offset || "";
  } while (offset);

  return records;
}

async function airtablePatch(env: Env, tableId: string, records: Array<{ id: string; fields: Record<string, any> }>) {
  const res = await fetch(airtableBaseUrl(env, tableId), {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${env.AIRTABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ records, typecast: true }),
  });

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    throw new Error(`Airtable patch error: ${JSON.stringify(data)}`);
  }

  return data as { records?: AirtableRecord[] };
}

function firstLinkedId(value: unknown): string {
  return Array.isArray(value) && value.length ? String(value[0]) : "";
}

function normalizeBatchStatus(status: unknown, qtyRemaining: number, lowStockFlag: unknown): string {
  const s = String(status || "").toLowerCase();
  const low = String(lowStockFlag || "").toLowerCase();

  if (qtyRemaining <= 0) return "out_of_stock";
  if (low.includes("low")) return "low_stock";
  if (s.includes("archived")) return "archived";
  if (s.includes("listed")) return "listed_on_mmd_shop";
  if (s.includes("review")) return "reviewing";
  return "in_stock";
}

function statusToAirtableBatchStatus(status: string): string {
  const map: Record<string, string> = {
    in_stock: "Active",
    low_stock: "Active",
    out_of_stock: "Depleted",
    reviewing: "Reviewing",
    listed_on_mmd_shop: "Listed on MMD Shop",
    archived: "Archived",
  };

  return map[String(status || "").trim()] || "Reviewing";
}

function statusToLowStockFlag(status: string, qty: number): string {
  if (status === "low_stock") return "Low";
  if (Number(qty || 0) <= 0) return "Out";
  return "OK";
}

function buildProductMap(productRecords: AirtableRecord[]): Map<string, ProductLite> {
  const map = new Map<string, ProductLite>();

  for (const rec of productRecords) {
    const f = rec.fields || {};
    map.set(rec.id, {
      id: rec.id,
      product_name: String(f[FIELD.products.name] || "Untitled Product"),
      sku: String(f[FIELD.products.sku] || ""),
      category: String(f[FIELD.products.category] || "-"),
      catalog_status: String(f[FIELD.products.status] || "draft"),
      cost_price: Number(f[FIELD.products.cost] || 0),
      retail_price: Number(f[FIELD.products.retail] || 0),
      supplier_ids: Array.isArray(f[FIELD.products.supplier]) ? f[FIELD.products.supplier] : [],
      note: String(f[FIELD.products.note] || ""),
    });
  }

  return map;
}

export async function listStock(env: Env): Promise<StockListResponse> {
  const [batchRecords, productRecords] = await Promise.all([
    airtableList(env, env.AIRTABLE_TABLE_MMD_SHOP_INVENTORY_BATCHES),
    airtableList(env, env.AIRTABLE_TABLE_MMD_SHOP_PRODUCTS),
  ]);

  const products = buildProductMap(productRecords);

  const items = batchRecords.map((rec) => {
    const f = rec.fields || {};
    const productId = firstLinkedId(f[FIELD.batches.product]);
    const product = products.get(productId);
    const qtyRemaining = Number(f[FIELD.batches.qtyRemaining] || 0);
    const cost = Number(f[FIELD.batches.costPerUnit] || product?.cost_price || 0);
    const retail = Number(product?.retail_price || 0);

    return {
      id: rec.id,
      batch_id: rec.id,
      batch_name: String(f[FIELD.batches.name] || ""),
      batch_code: String(f[FIELD.batches.batchCode] || ""),
      product_id: productId,
      product_name: product?.product_name || String(f[FIELD.batches.name] || "Untitled Product"),
      supplier_name: Array.isArray(f[FIELD.batches.supplier]) && f[FIELD.batches.supplier].length ? "Linked Supplier" : "-",
      category: product?.category || "-",
      cost_price: cost,
      retail_price: retail,
      stock_qty: qtyRemaining,
      quantity_in: Number(f[FIELD.batches.qtyIn] || 0),
      stock_status: normalizeBatchStatus(f[FIELD.batches.status], qtyRemaining, f[FIELD.batches.lowStockFlag]),
      approval_status: product?.catalog_status || "draft",
      mmd_shop_product_url: "",
      internal_notes: String(f[FIELD.batches.note] || ""),
    };
  });

  return { ok: true, count: items.length, items };
}

export async function updateStock(env: Env, payload: StockUpdateRequest): Promise<StockUpdateResponse> {
  const qty = Number(payload.stock_qty || 0);
  const stockStatus = String(payload.stock_status || "reviewing");

  const fields: Record<string, any> = {
    [FIELD.batches.qtyRemaining]: qty,
    [FIELD.batches.status]: statusToAirtableBatchStatus(stockStatus),
    [FIELD.batches.lowStockFlag]: statusToLowStockFlag(stockStatus, qty),
    [FIELD.batches.note]: String(payload.internal_notes || "").slice(0, 4000),
  };

  if (payload.cost_price !== undefined && payload.cost_price !== null) {
    fields[FIELD.batches.costPerUnit] = Number(payload.cost_price || 0);
  }

  if (payload.product_name) {
    fields[FIELD.batches.name] = String(payload.product_name).slice(0, 200);
  }

  const result = await airtablePatch(env, env.AIRTABLE_TABLE_MMD_SHOP_INVENTORY_BATCHES, [
    { id: payload.id, fields },
  ]);

  return { ok: true, record: result.records?.[0] || null };
}
