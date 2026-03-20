import type { ReplyRequest, ReplyResponse } from "../types";

export function draftReply(input: ReplyRequest): ReplyResponse {
  const top = input.matches[0];
  const requiresReview =
    Boolean(input.flags?.ask_per_before_high_tier) ||
    input.matches.some((m) => m.requires_per_approval);

  if (!top) {
    return {
      ok: true,
      reply_text:
        "Thank you. Let me review the best possible match for your request and come back to you shortly.",
      tone: "luxury_concierge",
      requires_human_review: true,
    };
  }

  if (requiresReview) {
    return {
      ok: true,
      reply_text:
        "I have a strong match in mind for your request. Let me have this reviewed personally and I’ll come back to you shortly.",
      tone: "luxury_concierge",
      requires_human_review: true,
    };
  }

  const venue = input.request.venue_name ? ` at ${input.request.venue_name}` : "";
  const occasion = input.request.occasion ?? "your request";

  return {
    ok: true,
    reply_text: `We have someone who would suit your ${occasion} request very well${venue} — polished, discreet, and comfortable in this setting. I can arrange this for you now.`,
    tone: "luxury_concierge",
    requires_human_review: false,
  };
}
