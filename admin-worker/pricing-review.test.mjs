import assert from "node:assert/strict";
import {
  calculateProvisionalPricing,
  choosePricingReplyStrategy,
  parseAdContextSignals,
} from "./index.js";

const gws = parseAdContextSignals("ลูกค้ามาจาก catalogue GWs15 และถามเรท");
assert.equal(gws.ad_context_found, true);
assert.equal(gws.creative_code, "GWs15");
assert.equal(gws.creative_code_type, "GWs");
assert.equal(gws.needs_per_ad_match, undefined);

const catalogue = parseAdContextSignals("catalogue_ref: CAT-777");
assert.equal(catalogue.ad_context_found, true);
assert.equal(catalogue.catalogue_ref, "CAT-777");
assert.equal(choosePricingReplyStrategy(catalogue), "catalogue_ack");

const none = parseAdContextSignals("สอบถามเรทได้ที่ไหนครับ");
assert.equal(none.ad_context_found, false);
assert.equal(none.ad_context_unknown, true);
assert.equal(choosePricingReplyStrategy(none), "generic_pricing_ack");

const normal = calculateProvisionalPricing({
  previous_prices_thb: [5000, 7000, 9000],
  model_identity_uncertain: false,
  unknown_ability: false,
  risk_flag: false,
});
assert.equal(normal.final_price_confirmed, false);
assert.equal(normal.can_auto_send_to_customer, true);
assert.equal(normal.confidence, "medium");

const unknownAdContext = calculateProvisionalPricing({
  previous_prices_thb: [5000, 7000],
  model_identity_uncertain: true,
  unknown_ability: false,
  risk_flag: false,
});
assert.equal(unknownAdContext.can_auto_send_to_customer, false);
assert.equal(unknownAdContext.guardrails.model_identity_uncertain_blocks_final, true);

const highRisk = calculateProvisionalPricing({
  previous_prices_thb: [5000, 7000],
  model_identity_uncertain: false,
  unknown_ability: false,
  risk_flag: true,
});
assert.equal(highRisk.can_auto_send_to_customer, false);
assert.equal(highRisk.guardrails.risk_blocks_auto_send, true);

const unknownAbility = calculateProvisionalPricing({
  previous_prices_thb: [5000, 7000],
  model_identity_uncertain: false,
  unknown_ability: true,
  risk_flag: false,
});
assert.equal(unknownAbility.can_auto_send_to_customer, false);
assert.equal(unknownAbility.guardrails.unknown_ability_blocks_claims, true);

const noHistory = calculateProvisionalPricing({});
assert.equal(noHistory.confidence, "low");
assert.equal(noHistory.final_price_confirmed, false);

console.log("admin pricing review tests passed");
