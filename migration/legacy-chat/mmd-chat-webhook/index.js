// index.js (updated)
// Dependencies: express, node-fetch@2, slugify, body-parser
const express = require("express");
const fetch = require("node-fetch");
const slugify = require("slugify");
const bodyParser = require("body-parser");

const app = express();
app.use(bodyParser.json());

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY || "";
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID || "";
const PORT = process.env.PORT || 3000;

// ---------- Airtable helpers ----------
async function airtablePatchRecord(recordId, fields) {
  if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
    throw new Error("Airtable not configured");
  }
  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Models/${recordId}`;
  const body = { fields };
  const r = await fetch(url, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${AIRTABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const j = await r.json();
  if (!r.ok) {
    throw new Error(`Airtable patch error: ${JSON.stringify(j)}`);
  }
  return j;
}

async function fetchModelsFromAirtable(maxRecords = 50) {
  if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) return [];
  // Prefer view "Available Now" if exists; otherwise default
  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Models?maxRecords=${maxRecords}`;
  const r = await fetch(url, {
    headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` },
  });
  const j = await r.json();
  return j.records || [];
}

// ---------- helpers ----------
function computeCanonicalSlug(modelFields, recordIdFallback) {
  const idNum = modelFields.model_id || null;
  const baseName = modelFields.working_name || "model";
  let idPart = "000";
  if (idNum) {
    idPart = String(idNum).padStart(3, "0");
  } else if (recordIdFallback) {
    // derive a stable short id from record id
    const rid = String(recordIdFallback).replace(/[^0-9a-z]/gi, "").slice(-6);
    const num = parseInt(rid.split("").reduce((s, ch) => s + ch.charCodeAt(0), 0), 10);
    idPart = String(num % 1000).padStart(3, "0");
  } else {
    idPart = "000";
  }
  const slug = slugify(baseName, { lower: true, strict: true });
  return `/model/${idPart}-${slug}`;
}

function scoreModelAgainstRequest(model, req) {
  let score = 0;
  const m = model.fields || {};
  if (m.available_now) score += 30;
  if (req.preferred_look && Array.isArray(req.preferred_look)) {
    const matches = (m.vibe_tags || []).filter(t => req.preferred_look.includes(t)).length;
    score += matches * 15;
  }
  if (req.experience_type && (m.best_for || []).includes(req.experience_type)) score += 20;
  if (req.preferred_language && Array.isArray(req.preferred_language)) {
    const langMatch = (m.languages || []).some(l => req.preferred_language.includes(l));
    if (langMatch) score += 15;
  }
  const budgetSignal = req.budget_signal || "standard";
  if (budgetSignal === "high" && (m.model_tier === "vip" || m.model_tier === "gws" || m.model_tier === "ems")) score += 10;
  if (m.minimum_rate_90m && req.budget_max && (m.minimum_rate_90m > req.budget_max)) score -= 40;
  return Math.max(0, Math.min(100, score));
}

// Mock classifier/draft (keep as before)
async function callOpenAIForClassifier(text) {
  return {
    classification: { category: "standard_booking", confidence: 0.9 },
    extracted: {
      date: null, time: null, start_datetime: null, location: null,
      venue_name: null, duration_minutes: 90, budget_min: null, budget_max: null,
      budget_signal: "standard", selection_mode: "mmd_suggestion",
      specific_model_requested: null, preferred_look: [], preferred_language: [],
      experience_type: null, urgency: "2-24h", client_id: null, client_status: "guest"
    },
    flags: { requires_per_approval: false, needs_per_review: false, high_potential: false, gw_em_request: false, risk_flag: "none", ready_to_go: false, advance_booking: false }
  };
}

async function callOpenAIForDraft(classifiedJson) {
  return {
    customer_reply: "ได้เลยครับ/ค่ะ — เดี๋ยว MMD ช่วยคัดคนที่เหมาะกับคำขอนี้ให้ครับ/ค่ะ",
    internal_summary: "Mock internal summary",
    recommended_action: "auto_reply"
  };
}

// ---------- Endpoint ----------
app.post("/webhook/message", async (req, res) => {
  try {
    const body = req.body || {};
    const conversation_id = body.conversation_id || `conv-${Date.now()}`;
    const text = body.text || "";

    const classify = await callOpenAIForClassifier(text);

    // Fetch candidate models from Airtable
    const airtableModels = await fetchModelsFromAirtable(50);
    let candidates = [];
    if (airtableModels.length > 0) {
      const reqExtract = classify.extracted;
      candidates = airtableModels.map(m => {
        const score = scoreModelAgainstRequest(m, reqExtract);
        return {
          record_id: m.id,
          model_id: (m.fields && m.fields.model_id) || null,
          working_name: (m.fields && m.fields.working_name) || "(no name)",
          model_tier: (m.fields && m.fields.model_tier) || "standard",
          fit_score: score,
          reason_short: ((m.fields && m.fields.ai_match_summary) || "").slice(0, 120),
          fields: m.fields || {}
        };
      }).filter(c => c.fit_score > 0)
      .sort((a,b) => b.fit_score - a.fit_score)
      .slice(0,3);
    }

    // Handle canonical_slug fallback and update Airtable canonical_slug_manual if needed
    for (const c of candidates) {
      const f = c.fields || {};
      if ((!f.canonical_slug || f.canonical_slug === "Unable to generate formula") && AIRTABLE_API_KEY && AIRTABLE_BASE_ID) {
        const fallback = computeCanonicalSlug({ model_id: f.model_id, working_name: f.working_name }, c.record_id);
        // Attempt to write fallback into canonical_slug_manual
        try {
          const patch = await airtablePatchRecord(c.record_id, {
            canonical_slug_manual: fallback,
            // optional: add internal note about auto-fill
            internal_notes: ((f.internal_notes || "") + `\n[sys] canonical_slug_manual auto-set: ${fallback}`).trim()
          });
          // update local copy for response
          c.fields.canonical_slug_manual = fallback;
        } catch (err) {
          // log and continue; we'll return warning in response
          console.error("Airtable patch failed for", c.record_id, err.message);
          c.fields.canonical_slug_manual = null;
          c._canonical_update_error = String(err.message || err);
        }
      }
    }

    const draft = await callOpenAIForDraft({ classify, candidates });

    const out = {
      conversation_id,
      timestamp: new Date().toISOString(),
      intent: classify.classification.category,
      classification: classify.classification,
      extracted: classify.extracted,
      flags: classify.flags,
      matching: {
        candidate_models: candidates.map(c => ({
          model_id: c.model_id,
          record_id: c.record_id,
          working_name: c.working_name,
          model_tier: c.model_tier,
          fit_score: Number((c.fit_score/100).toFixed(2)),
          reason_short: c.reason_short,
          canonical_slug: (c.fields && (c.fields.canonical_slug || c.fields.canonical_slug_manual)) || null,
          canonical_update_error: c._canonical_update_error || null
        })),
        suggestion_mode: candidates.length ? "auto_shortlist" : "no_candidates",
        suggestion_confidence: candidates.length ? (candidates[0].fit_score/100) : 0
      },
      customer_reply: draft.customer_reply,
      internal_summary: draft.internal_summary,
      recommended_action: draft.recommended_action,
      meta: { source_message: text, raw_nlu_confidence: classify.classification.confidence }
    };

    return res.json({ ok: true, ...out });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

app.listen(PORT, () => {
  console.log(`MMD chat webhook listening on ${PORT}`);
});
