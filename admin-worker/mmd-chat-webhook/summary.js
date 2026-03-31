/**
 * summary.js
 * Minimal buildSummary helper (ESM)
 *
 * This is a safe stub so index.js can import './summary'.
 * Replace with real summarization (OpenAI / other) later.
 */

function escapeHtml(s = "") {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * buildSummary(payload, env)
 * - payload: string | object
 * - env: optional environment object
 *
 * Returns:
 * { ok: true, summary_text, summary_html, meta: {...} }
 */
export async function buildSummary(payload = "", env = {}) {
  try {
    // Accept string or object (try to extract text)
    let text = "";
    if (typeof payload === "string") {
      text = payload;
    } else if (payload && typeof payload === "object") {
      // common keys: text, body, content, message, note
      text = payload.text || payload.body || payload.content || payload.message || payload.note || "";
      if (!text) {
        // fallback to JSON stringify for debugging
        text = JSON.stringify(payload).slice(0, 1000);
      }
    } else {
      text = String(payload || "");
    }

    // Simple summarization: shorten and mark
    const maxLen = 300;
    const trimmed = text.length > maxLen ? text.slice(0, maxLen) + "…" : text;
    const summaryText = trimmed ? `สรุปสั้น ๆ: ${trimmed}` : "ไม่มีเนื้อหาให้สรุป";
    const summaryHtml = `<p>${escapeHtml(summaryText)}</p>`;

    // Return consistent shape for index.js consumers
    return {
      ok: true,
      summary_text: summaryText,
      summary_html: summaryHtml,
      meta: {
        source_excerpt: text.slice(0, 500),
        created_at: new Date().toISOString(),
      },
    };
  } catch (err) {
    return { ok: false, error: String(err?.message || err) };
  }
}
