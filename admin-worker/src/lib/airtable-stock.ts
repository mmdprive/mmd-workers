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

const SHOP_TABLE = {
  products: "tblzsmNLfP6J0kQ90",
  batches: "tblwFgl4et1TOgtNn",
  movements: "tblASifwHdArNKQP2",
};

const MOVEMENT_FIELD = {
  name: "fldahJshKJkBP8Z7H",
  batch: "fldjF7wcc65dJIxt8",
  product: "fldCRBzBDOsNo3jLM",
  supplier: "fldzf4Hm1bQ9HGb7C",
  type: "fld95ubumrh0GQCgj",
  quantity: "fldRoDWshlUAg8aOy",
  unitCost: "fldqY9wq6NUqnfvFc",
  date: "flddnpCisCrCJhyHM",
  referenceType: "fld6bdKAAa1sOYw0Q",
  referenceId: "flddxY12JXrNsAUpE",
  note: "fldmnXBNlVcDdvkPh",
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

async function airtableGet(env: Env, tableId: string, recordId: string): Promise<AirtableRecord> {
  const res = await fetch(`${airtableBaseUrl(env, tableId)}/${recordId}`, {
    headers: { Authorization: `Bearer ${env.AIRTABLE_API_KEY}` },
  });

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    throw new Error(`Airtable get error: ${JSON.stringify(data)}`);
  }

  return data as AirtableRecord;
}

async function airtableCreate(env: Env, tableId: string, records: Array<{ fields: Record<string, any> }>) {
  const res = await fetch(airtableBaseUrl(env, tableId), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.AIRTABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ records, typecast: true }),
  });

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    throw new Error(`Airtable create error: ${JSON.stringify(data)}`);
  }

  return data as { records?: AirtableRecord[] };
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

function linkedIds(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function makeId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function movementTypeToAirtable(type: string): string {
  const map: Record<string, string> = {
    IN: "in",
    OUT: "out",
    ADJUST_IN: "adjustment",
    ADJUST_OUT: "adjustment",
    RESERVE: "reserve",
    RELEASE: "release",
    in: "in",
    out: "out",
    adjustment: "adjustment",
    reserve: "reserve",
    release: "release",
  };

  return map[type] || "adjustment";
}

function referenceTypeToAirtable(type: string): string {
  const map: Record<string, string> = {
    Receive: "batch_receive",
    Order: "order_item",
    Manual: "manual",
    Adjustment: "manual",
    SupplierAdjustment: "supplier_adjustment",
    batch_receive: "batch_receive",
    order_item: "order_item",
    manual: "manual",
    supplier_adjustment: "supplier_adjustment",
  };

  return map[type] || "manual";
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

function lowStockFlagForQty(qty: number): string {
  if (qty <= 0) return "Out";
  if (qty <= 5) return "Low";
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

async function createStockMovement(env: Env, input: {
  batchId: string;
  productIds?: string[];
  supplierIds?: string[];
  movementType: string;
  quantity: number;
  unitCost?: number;
  referenceType?: string;
  referenceId?: string;
  note?: string;
}) {
  const quantity = Math.abs(Number(input.quantity || 0));

  if (!input.batchId || quantity <= 0) {
    throw new Error("batchId and positive quantity are required for stock movement");
  }

  const movementType = movementTypeToAirtable(input.movementType);
  const referenceType = referenceTypeToAirtable(input.referenceType || "Manual");
  const movementName = `${movementType} · ${quantity} · ${makeId("mov")}`;

  return airtableCreate(env, SHOP_TABLE.movements, [
    {
      fields: {
        [MOVEMENT_FIELD.name]: movementName,
        [MOVEMENT_FIELD.batch]: [input.batchId],
        [MOVEMENT_FIELD.product]: input.productIds || [],
        [MOVEMENT_FIELD.supplier]: input.supplierIds || [],
        [MOVEMENT_FIELD.type]: movementType,
        [MOVEMENT_FIELD.quantity]: quantity,
        [MOVEMENT_FIELD.unitCost]: Number(input.unitCost || 0),
        [MOVEMENT_FIELD.date]: todayIsoDate(),
        [MOVEMENT_FIELD.referenceType]: referenceType,
        [MOVEMENT_FIELD.referenceId]: input.referenceId || "",
        [MOVEMENT_FIELD.note]: input.note || "",
      },
    },
  ]);
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
  const batch = await airtableGet(env, env.AIRTABLE_TABLE_MMD_SHOP_INVENTORY_BATCHES, payload.id);
  const beforeQty = Number(batch.fields?.[FIELD.batches.qtyRemaining] || 0);
  const qty = Number(payload.stock_qty || 0);
  const delta = qty - beforeQty;
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

  if (delta !== 0) {
    await createStockMovement(env, {
      batchId: payload.id,
      productIds: linkedIds(batch.fields?.[FIELD.batches.product]),
      supplierIds: linkedIds(batch.fields?.[FIELD.batches.supplier]),
      movementType: delta > 0 ? "ADJUST_IN" : "ADJUST_OUT",
      quantity: Math.abs(delta),
      unitCost: Number(payload.cost_price ?? batch.fields?.[FIELD.batches.costPerUnit] ?? 0),
      referenceType: "manual",
      referenceId: makeId("stock_update"),
      note: String(payload.internal_notes || `Manual stock update: ${beforeQty} -> ${qty}`).slice(0, 4000),
    });
  }

  return { ok: true, record: result.records?.[0] || null };
}

export async function receiveStock(env: Env, payload: {
  product_id: string;
  supplier_id?: string;
  batch_code?: string;
  quantity: number;
  cost_per_unit: number;
  note?: string;
}) {
  const qty = Number(payload.quantity || 0);

  if (!payload.product_id || qty <= 0) {
    throw new Error("product_id and positive quantity are required");
  }

  const batchName = `MMD Batch · ${payload.batch_code || makeId("batch")}`;

  const batch = await airtableCreate(env, SHOP_TABLE.batches, [
    {
      fields: {
        [FIELD.batches.name]: batchName,
        [FIELD.batches.product]: [payload.product_id],
        [FIELD.batches.supplier]: payload.supplier_id ? [payload.supplier_id] : [],
        [FIELD.batches.batchCode]: payload.batch_code || makeId("BATCH"),
        [FIELD.batches.qtyIn]: qty,
        [FIELD.batches.qtyRemaining]: qty,
        [FIELD.batches.costPerUnit]: Number(payload.cost_per_unit || 0),
        [FIELD.batches.status]: "Active",
        [FIELD.batches.lowStockFlag]: "OK",
        [FIELD.batches.note]: payload.note || "",
      },
    },
  ]);

  const createdBatch = batch.records?.[0];

  if (!createdBatch) {
    throw new Error("failed to create batch");
  }

  await createStockMovement(env, {
    batchId: createdBatch.id,
    productIds: [payload.product_id],
    supplierIds: payload.supplier_id ? [payload.supplier_id] : [],
    movementType: "in",
    quantity: qty,
    unitCost: Number(payload.cost_per_unit || 0),
    referenceType: "batch_receive",
    referenceId: createdBatch.id,
    note: payload.note || "Stock received",
  });

  return { ok: true, batch: createdBatch };
}

export async function adjustStock(env: Env, payload: {
  batch_id: string;
  quantity_delta: number;
  reason?: string;
  note?: string;
}) {
  const batch = await airtableGet(env, SHOP_TABLE.batches, payload.batch_id);
  const f = batch.fields || {};
  const currentQty = Number(f[FIELD.batches.qtyRemaining] || 0);
  const delta = Number(payload.quantity_delta || 0);
  const nextQty = Math.max(0, currentQty + delta);

  if (!payload.batch_id || delta === 0) {
    throw new Error("batch_id and non-zero quantity_delta are required");
  }

  await airtablePatch(env, SHOP_TABLE.batches, [
    {
      id: payload.batch_id,
      fields: {
        [FIELD.batches.qtyRemaining]: nextQty,
        [FIELD.batches.status]: nextQty <= 0 ? "Depleted" : "Active",
        [FIELD.batches.lowStockFlag]: lowStockFlagForQty(nextQty),
        [FIELD.batches.note]: payload.note || f[FIELD.batches.note] || "",
      },
    },
  ]);

  await createStockMovement(env, {
    batchId: payload.batch_id,
    productIds: linkedIds(f[FIELD.batches.product]),
    supplierIds: linkedIds(f[FIELD.batches.supplier]),
    movementType: "adjustment",
    quantity: Math.abs(delta),
    unitCost: Number(f[FIELD.batches.costPerUnit] || 0),
    referenceType: "manual",
    referenceId: makeId("adj"),
    note: payload.reason || payload.note || `Manual adjustment ${delta}`,
  });

  return { ok: true, batch_id: payload.batch_id, previous_qty: currentQty, next_qty: nextQty };
}

export async function deductStock(env: Env, payload: {
  batch_id: string;
  quantity: number;
  reference_type?: string;
  reference_id?: string;
  note?: string;
}) {
  const batch = await airtableGet(env, SHOP_TABLE.batches, payload.batch_id);
  const f = batch.fields || {};
  const currentQty = Number(f[FIELD.batches.qtyRemaining] || 0);
  const deductQty = Number(payload.quantity || 0);

  if (deductQty <= 0) {
    throw new Error("positive quantity is required");
  }

  if (currentQty < deductQty) {
    throw new Error(`insufficient stock: current=${currentQty}, requested=${deductQty}`);
  }

  const nextQty = currentQty - deductQty;

  await airtablePatch(env, SHOP_TABLE.batches, [
    {
      id: payload.batch_id,
      fields: {
        [FIELD.batches.qtyRemaining]: nextQty,
        [FIELD.batches.status]: nextQty <= 0 ? "Depleted" : "Active",
        [FIELD.batches.lowStockFlag]: lowStockFlagForQty(nextQty),
      },
    },
  ]);

  await createStockMovement(env, {
    batchId: payload.batch_id,
    productIds: linkedIds(f[FIELD.batches.product]),
    supplierIds: linkedIds(f[FIELD.batches.supplier]),
    movementType: "out",
    quantity: deductQty,
    unitCost: Number(f[FIELD.batches.costPerUnit] || 0),
    referenceType: payload.reference_type || "order_item",
    referenceId: payload.reference_id || "",
    note: payload.note || "Stock deducted",
  });

  return { ok: true, batch_id: payload.batch_id, previous_qty: currentQty, next_qty: nextQty };
}
