import express from "express";
import bodyParser from "body-parser";
import { buildSummary } from "./summary.js";

const app = express();
app.use(bodyParser.json());

const PORT = process.env.PORT || 3000;

app.get("/ping", (req, res) => {
  res.json({ ok: true, msg: "ping", ts: Date.now() });
});

app.post("/webhook/message", async (req, res) => {
  try {
    const body = req.body || {};
    const payload = (typeof body === "object" && body.text) ? body.text : body;
    const summary = await buildSummary(payload, {});
    return res.json({
      ok: true,
      customer_reply: "ได้เลยครับ/ค่ะ — เดี๋ยว MMD ช่วยคัดคนที่เหมาะให้ครับ/ค่ะ",
      internal_summary: summary.summary_text,
      matching: { candidate_models: [] },
      raw_summary: summary,
    });
  } catch (err) {
    console.error("webhook error:", err);
    return res.status(500).json({ ok: false, error: String(err?.message || err) });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`MMD chat webhook listening on ${PORT}`);
});
