const AIRTABLE_META_API = "https://api.airtable.com/v0/meta/bases";

const REQUIRED_SCHEMA = {
  "Model Partners": {
    priority: "pass",
    fields: [
      "Partner ID",
      "Partner Name",
      "Status",
      "Partner Type",
      "Default Commission Type",
      "Default Commission Rate",
      "Payout Method",
      "Payout Account Ref",
      "Partner Commissions",
      "Model Referrals",
    ],
  },
  "Model Referrals": {
    priority: "p2",
    fields: [
      "Referral ID",
      "Partner",
      "Model",
      "Ownership Status",
      "Commission Type",
      "Commission Rate",
      "Basis Rule",
      "Approved At",
      "Approved By",
      "Notes",
      "Flat Amount THB",
      "Ownership Reason",
      "Transfer Reason",
      "Revoke Reason",
      "Previous Referral ID",
      "Transferred To Referral ID",
      "Created By Worker",
    ],
  },
  "Partner Commissions": {
    priority: "p0",
    fields: [
      "Commission ID",
      "Partner",
      "Referral",
      "Model",
      "Job",
      "Session ID",
      "Payment Ref",
      "Currency",
      "Commission Basis Amount",
      "Commission Rate Snapshot",
      "Commission Type Snapshot",
      "Commission Amount",
      "Status",
      "Approved At",
      "Paid At",
      "Held Reason",
      "Void Reason",
      "Payout Reference",
      "commission_key",
      "eligibility_status",
      "approval_status",
      "payout_status",
      "split_index",
      "split_percent",
      "commission_group_key",
      "audit_json",
    ],
  },
  Jobs: {
    priority: "p1",
    fields: [
      "Partner Commissions",
      "commission_state",
      "commission_snapshot_locked",
      "commission_snapshot_locked_at",
      "partner_id_snapshot",
      "partner_referral_id_snapshot",
      "commission_eligible",
      "partner_commission_id",
    ],
  },
  Sessions: {
    priority: "p1",
    fields: [
      "partner_id_snapshot",
      "partner_referral_id_snapshot",
      "partner_commission_state",
      "commission_eligible",
      "commission_eligible_at",
    ],
  },
  Payments: {
    priority: "p2",
    fields: [
      "session_id",
      "payment_type",
      "commission_unlocks",
      "commission_unlock_checked_at",
      "commission_unlock_notes",
    ],
  },
};

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`missing_env:${name}`);
  return value;
}

async function fetchBaseSchema({ baseId, apiKey }) {
  const res = await fetch(`${AIRTABLE_META_API}/${baseId}/tables`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`airtable_meta_error_${res.status}:${JSON.stringify(data)}`);
  }
  return Array.isArray(data?.tables) ? data.tables : [];
}

function tableFieldNames(table) {
  return new Set((table?.fields || []).map((field) => String(field.name || "").trim()));
}

function buildReport(tables) {
  const byName = new Map(tables.map((table) => [table.name, table]));
  const report = [];

  for (const [tableName, spec] of Object.entries(REQUIRED_SCHEMA)) {
    const table = byName.get(tableName);
    if (!table) {
      report.push({
        table: tableName,
        priority: spec.priority,
        exists: false,
        missing_fields: [...spec.fields],
      });
      continue;
    }

    const presentFields = tableFieldNames(table);
    const missing = spec.fields.filter((field) => !presentFields.has(field));

    report.push({
      table: tableName,
      priority: spec.priority,
      exists: true,
      missing_fields: missing,
      pass: missing.length === 0,
    });
  }

  return report;
}

function summarize(report) {
  const blockers = report.filter(
    (item) => (item.priority === "p0" || item.priority === "p1") && (!item.exists || item.missing_fields.length)
  );

  return {
    launch_ready: blockers.length === 0,
    blocker_count: blockers.length,
    report,
  };
}

async function main() {
  const apiKey = requiredEnv("AIRTABLE_API_KEY");
  const baseId = requiredEnv("AIRTABLE_BASE_ID");
  const tables = await fetchBaseSchema({ apiKey, baseId });
  const summary = summarize(buildReport(tables));

  console.log(JSON.stringify(summary, null, 2));

  if (!summary.launch_ready) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
