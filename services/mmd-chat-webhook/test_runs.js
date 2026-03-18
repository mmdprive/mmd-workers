// test_runs.js
// Usage:
//   copy to project root and run:
//     node test_runs.js
//
// Optional env vars (create .env or export in shell):
//   WEBHOOK_URL (default http://localhost:3000/webhook/message)
//   AIRTABLE_API_KEY (optional; if set the script will query canonical_slug fields)
//   AIRTABLE_BASE_ID (required if AIRTABLE_API_KEY is set)

const fetch = require("node-fetch");
require("dotenv").config();

const WEBHOOK_URL = process.env.WEBHOOK_URL || "http://localhost:3000/webhook/message";
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY || "";
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID || "";

async function postPayload(payload) {
  const r = await fetch(WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    timeout: 30000
  });
  const j = await r.json().catch(() => ({ ok: false, error: "invalid_json" }));
  return j;
}

async function fetchAirtableRecord(recordId) {
  if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) return null;
  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Models/${recordId}?fields[]=canonical_slug&fields[]=canonical_slug_manual&fields[]=working_name`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` } });
  const j = await r.json().catch(() => null);
  return j;
}

async function runTest(name, payload) {
  console.log("------------------------------------------------------------");
  console.log(`TEST: ${name}`);
  console.log("Payload:", JSON.stringify(payload, null, 2));
  try {
    const res = await postPayload(payload);
    console.log("--- Webhook response ---");
    console.log(JSON.stringify(res, null, 2));

    if (res && res.ok && res.matching && res.matching.candidate_models && res.matching.candidate_models.length) {
      console.log(`Found ${res.matching.candidate_models.length} candidate(s). Checking Airtable canonical fields (if configured)...`);
      for (const c of res.matching.candidate_models) {
        console.log(`- Candidate: ${c.working_name} (record_id: ${c.record_id || c.model_id || "unknown"})`);
        const recId = c.record_id || c.model_id;
        if (recId && AIRTABLE_API_KEY && AIRTABLE_BASE_ID) {
          const airt = await fetchAirtableRecord(recId);
          console.log("  Airtable record:", JSON.stringify(airt && airt.fields ? {
            working_name: airt.fields.working_name,
            canonical_slug: airt.fields.canonical_slug,
            canonical_slug_manual: airt.fields.canonical_slug_manual
          } : airt, null, 2));
        } else {
          console.log("  Skipped Airtable check (no AIRTABLE_API_KEY or no record id).");
        }
      }
    } else {
      console.log("No candidate models returned or no matching block in response.");
    }
  } catch (e) {
    console.error("Error running test:", e);
  }
}

async function main() {
  console.log("MMD webhook test runner");
  console.log("WEBHOOK_URL =", WEBHOOK_URL);
  if (AIRTABLE_API_KEY && AIRTABLE_BASE_ID) {
    console.log("Airtable integration: enabled (AIRTABLE_BASE_ID =", AIRTABLE_BASE_ID, ")");
  } else {
    console.log("Airtable integration: disabled (set AIRTABLE_API_KEY + AIRTABLE_BASE_ID to enable)");
  }

  const tests = [
    {
      name: "A - Standard booking (auto)",
      payload: {
        conversation_id: "testA",
        text: "คืนนี้มีใครสูง สุภาพ พูดอังกฤษได้ไหม dinner Four Seasons 20:00 งบ 20-30k"
      }
    },
    {
      name: "B - Ready-to-go (first-accept-wins)",
      payload: {
        conversation_id: "testB",
        text: "มีใครพร้อมออกตอนนี้ 2 ชม. ที่สุขุมวิทไหม"
      }
    },
    {
      name: "C - High-potential (escalate)",
      payload: {
        conversation_id: "testC",
        text: "ผมขอ priority access ให้คนใหม่ งบ 100000 ครับ อยากเป็นคนแรก"
      }
    }
  ];

  for (const t of tests) {
    await runTest(t.name, t.payload);
  }

  console.log("------------------------------------------------------------");
  console.log("All tests completed.");
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
