const AIRTABLE_API = "https://api.airtable.com/v0";

async function airtableFetch(env, path, init) {
  const key = env.AIRTABLE_API_KEY;
  const base = env.AIRTABLE_BASE_ID;
  if (!key || !base) return { ok: false, error: "missing_airtable_env" };

  const url = `${AIRTABLE_API}/${base}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${key}`,
      ...(init && init.headers ? init.headers : {}),
    },
  });

  let data = null;
  try {
    data = await res.json();
  } catch (_) {}

  if (!res.ok) return { ok: false, status: res.status, data };
  return { ok: true, data };
}

async function airtableListAll(env, tableId) {
  if (!env.AIRTABLE_API_KEY || !env.AIRTABLE_BASE_ID) return [];

  const all = [];
  let offset = null;

  do {
    const params = new URLSearchParams();
    params.set("pageSize", "100");
    if (offset) params.set("offset", offset);

    const r = await airtableFetch(env, `/${encodeURIComponent(tableId)}?${params.toString()}`);
    if (!r.ok) break;

    const records = (r.data && r.data.records) || [];
    for (const rec of records) {
      all.push({ id: rec.id, fields: rec.fields || {} });
    }

    offset = (r.data && r.data.offset) || null;
  } while (offset);

  return all;
}

export async function getDashboardCEO(env) {
  const [ledgerRecords, payoutRecords, batchRecords] = await Promise.all([
    airtableListAll(env, "tbl2hqvi2hmk3wpe0"),
    airtableListAll(env, "tblJF9dH59FK31dgA"),
    airtableListAll(env, "tblwFgl4et1TOgtNn"),
  ]);

  let revenue = 0;
  let cost = 0;
  let margin = 0;
  let outstanding = 0;
  let cashPaid = 0;

  const trendMap = new Map();
  const supplierMap = new Map();

  for (const rec of ledgerRecords) {
    const f = rec.fields || {};
    const status = String(f["fld5c5KU1zqW5azXM"] || "");
    if (status === "void") continue;

    const date = String(f["fldD8EbMb2jegXKXn"] || "undated");
    const r = Number(f["fldGUHbjodVKZQuQZ"] || 0);
    const c = Number(f["fldcic1IRo0hB0A2z"] || 0);
    const m = Number(f["fldOTobGDmTVJCKTH"] || 0);
    const owed = Number(f["fldXX85oksNP4yinL"] || 0);

    revenue += r;
    cost += c;
    margin += m;

    if (status === "open") {
      outstanding += owed;

      const supplierIds = Array.isArray(f["fldwv8SHlbizOfWgm"]) ? f["fldwv8SHlbizOfWgm"] : [];
      for (const supplierId of supplierIds) {
        const id = String(supplierId);
        if (!supplierMap.has(id)) {
          supplierMap.set(id, {
            supplier_id: id,
            supplier_name: id,
            owed: 0,
            status: "ready_to_pay",
          });
        }
        supplierMap.get(id).owed += owed;
      }
    }

    if (!trendMap.has(date)) {
      trendMap.set(date, { date, revenue: 0, cost: 0, margin: 0 });
    }
    const row = trendMap.get(date);
    row.revenue += r;
    row.cost += c;
    row.margin += m;
  }

  for (const rec of payoutRecords) {
    const f = rec.fields || {};
    const status = String(f["fldgo6dkYaHg8pgSr"] || "");
    if (status === "paid") {
      cashPaid += Number(f["flddxwAqW0JQFTcUF"] || 0);
    }
  }

  const lowStockBatches = batchRecords.filter(
    (rec) => String(rec.fields["fldYtzXtBvK3HuqQa"] || "") === "Low"
  ).length;

  const depletedBatches = batchRecords.filter(
    (rec) => String(rec.fields["fldZW2m1Xq8q0ZH9Z"] || "").toLowerCase() === "depleted"
  ).length;

  return {
    ok: true,
    summary: {
      revenue,
      cost,
      margin,
      outstanding,
      cash_paid: cashPaid,
      net_after_supplier: margin - outstanding,
      low_stock_batches: lowStockBatches,
      depleted_batches: depletedBatches,
    },
    trend: Array.from(trendMap.values())
      .sort((a, b) => String(a.date).localeCompare(String(b.date)))
      .slice(-14),
    supplier_balances: Array.from(supplierMap.values()).sort((a, b) => b.owed - a.owed),
  };
}
