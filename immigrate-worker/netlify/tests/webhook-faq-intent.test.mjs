import assert from "node:assert/strict";
import {
  buildFaqReply,
  choosePricingReplyStrategy,
  inferFaqIntent,
  inferIntent,
  shouldAutoReplyForIntent,
} from "../functions/webhook.js";

const textEvent = (text) => ({
  type: "message",
  message: { type: "text", id: "m_text", text },
  source: { type: "user", userId: "U123" },
  replyToken: "reply-token",
});

const imageEvent = (context = {}) => ({
  type: "message",
  message: { type: "image", id: "m_image" },
  source: { type: "user", userId: "U123" },
  replyToken: "reply-token",
  ...context,
});

assert.equal(inferFaqIntent("สอบถามเรทได้ที่ไหนครับ"), "ask_where_to_get_rate");
assert.equal(inferIntent("สอบถามเรทได้ที่ไหนครับ", textEvent("สอบถามเรทได้ที่ไหนครับ")), "ask_where_to_get_rate");
assert.equal(inferIntent("เรทสูงไหมครับ", textEvent("เรทสูงไหมครับ")), "pricing_review");
assert.equal(inferIntent("", imageEvent()), "image_only_model_inquiry");
assert.equal(inferIntent("เรทสูงไหมครับ", { ...textEvent("เรทสูงไหมครับ"), context: { image_message_id: "m_image" } }), "image_rate_inquiry");

const generic = buildFaqReply("pricing_review", "", { recommended_reply_strategy: "generic_pricing_ack" });
assert.match(generic, /สอบถามเรทกับผมตรงนี้ได้เลยครับ/);
assert.doesNotMatch(generic, /สนใจนายแบบคนไหนครับ|หมายถึงคนไหนครับ|ส่งรูปมาหน่อยครับ/);
assert.doesNotMatch(generic, /บาท|฿\d/);

const adAck = buildFaqReply("pricing_review", "", { recommended_reply_strategy: "ad_context_ack" });
assert.match(adAck, /รายการที่คุณสนใจ/);
assert.doesNotMatch(adAck, /สนใจนายแบบคนไหนครับ/);

const catalogueAck = buildFaqReply("pricing_review", "", { recommended_reply_strategy: "catalogue_ack" });
assert.match(catalogueAck, /Catalogue/);
assert.doesNotMatch(catalogueAck, /สนใจนายแบบคนไหนครับ/);

const imageAck = buildFaqReply("image_only_model_inquiry", "", {});
assert.match(imageAck, /ผมได้รับรูปแล้วครับ/);
assert.doesNotMatch(imageAck, /บาท|฿\d/);

assert.equal(choosePricingReplyStrategy({ ad_context_found: true }), "ad_context_ack");
assert.equal(choosePricingReplyStrategy({ catalogue_ref: "CAT001" }), "catalogue_ack");
assert.equal(choosePricingReplyStrategy({}), "generic_pricing_ack");

assert.equal(shouldAutoReplyForIntent("pricing_review"), true);
assert.equal(shouldAutoReplyForIntent("model_availability"), true);

console.log("webhook FAQ/pricing intent tests passed");
