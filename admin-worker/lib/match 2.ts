import type {
  MatchRequest,
  MatchResponse,
  MatchResult,
  ModelCardLite,
} from "../types";

function includesAny(haystack: string[] = [], needles: string[] = []): number {
  const h = new Set(haystack.map((x) => x.toLowerCase()));
  let score = 0;
  for (const n of needles) {
    if (h.has(n.toLowerCase())) score += 1;
  }
  return score;
}

function scoreModel(model: ModelCardLite, req: MatchRequest): MatchResult | null {
  const reasons: string[] = [];
  let score = 0;

  if (req.constraints?.require_available_now && !model.available_now) {
    return null;
  }

  if (req.constraints?.respect_minimum_rate && req.constraints?.budget_amount_thb) {
    if (model.minimum_rate_90m > req.constraints.budget_amount_thb) {
      return null;
    }
  }

  if (model.available_now) {
    score += 20;
    reasons.push("Available now");
  }

  const occasion = req.request.occasion;
  if (occasion && model.best_for.map((x) => x.toLowerCase()).includes(occasion.toLowerCase())) {
    score += 25;
    reasons.push(`Strong ${occasion} fit`);
  }

  const vibeMatches = includesAny(
    model.vibe_tags,
    req.request.preferences.vibe_tags ?? [],
  );
  if (vibeMatches > 0) {
    score += vibeMatches * 10;
    reasons.push("Vibe matches request");
  }

  const languageMatches = includesAny(
    model.languages,
    req.request.preferences.languages ?? [],
  );
  if (languageMatches > 0) {
    score += languageMatches * 8;
    reasons.push("Language matches request");
  }

  if (model.ai_match_summary) {
    score += 5;
  }

  if (req.client?.tier === "premium" && ["premium", "vip", "gws", "ems"].includes(model.model_tier)) {
    score += 6;
  }

  if (req.client?.tier === "vip" && ["vip", "gws", "ems"].includes(model.model_tier)) {
    score += 10;
  }

  if (req.client?.tier === "standard" && model.model_tier === "standard") {
    score += 5;
  }

  return {
    working_name: model.working_name,
    score,
    reason: reasons,
    requires_per_approval: model.requires_per_approval,
  };
}

function getPresentationCount(tier?: string): number {
  if (tier === "vip" || tier === "svip" || tier === "blackcard") return 1;
  if (tier === "premium") return 2;
  return 3;
}

function getPresentationMode(tier?: string): MatchResponse["policy"]["presentation_mode"] {
  if (tier === "premium") return "premium_curated";
  if (tier === "vip" || tier === "svip" || tier === "blackcard") return "vip_curated";
  return "standard_curated";
}

export function matchModels(input: MatchRequest): MatchResponse {
  const matches = input.models
    .map((m) => scoreModel(m, input))
    .filter((x): x is MatchResult => Boolean(x))
    .sort((a, b) => b.score - a.score);

  const presentationCount = Math.min(
    input.constraints?.max_results ?? getPresentationCount(input.client?.tier),
    getPresentationCount(input.client?.tier),
  );

  const shortlisted = matches.slice(0, presentationCount);

  return {
    ok: true,
    matches: shortlisted,
    flags: {
      high_value_client:
        input.client?.budget_signal === "high" ||
        input.client?.budget_signal === "premium",
      ask_per_before_high_tier:
        input.client?.budget_signal === "high" ||
        shortlisted.some((m) => m.requires_per_approval),
      any_requires_per_approval: shortlisted.some((m) => m.requires_per_approval),
    },
    policy: {
      presentation_count: presentationCount,
      presentation_mode: getPresentationMode(input.client?.tier),
    },
  };
}
