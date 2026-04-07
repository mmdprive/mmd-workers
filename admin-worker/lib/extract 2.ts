import type {
  ExtractPreferencesRequest,
  ExtractPreferencesResponse,
  ExtractedPreferences,
} from "../types";

function detectBudget(text: string): number | undefined {
  const match = text.match(/(\d{1,3}(?:,\d{3})+|\d{4,6})\s*(k|K|บาท|thb)?/);
  if (!match) return undefined;

  const raw = match[1].replace(/,/g, "");
  const value = Number(raw);
  if (Number.isNaN(value)) return undefined;

  if ((match[2] || "").toLowerCase() === "k") {
    return value * 1000;
  }
  return value;
}

function detectLanguages(text: string): string[] {
  const lower = text.toLowerCase();
  const out: string[] = [];
  if (lower.includes("english")) out.push("english");
  if (lower.includes("thai") || lower.includes("ภาษาไทย")) out.push("thai");
  if (lower.includes("japanese")) out.push("japanese");
  if (lower.includes("chinese")) out.push("chinese");
  if (lower.includes("korean")) out.push("korean");
  return out;
}

function detectVibes(text: string): string[] {
  const lower = text.toLowerCase();
  const out: string[] = [];
  if (lower.includes("confident")) out.push("confident");
  if (lower.includes("gentleman")) out.push("gentleman");
  if (lower.includes("calm")) out.push("calm");
  if (lower.includes("playful")) out.push("playful");
  if (lower.includes("romantic")) out.push("romantic");
  if (lower.includes("friendly")) out.push("friendly");
  return out;
}

function detectAppearance(text: string): string[] {
  const lower = text.toLowerCase();
  const out: string[] = [];
  if (lower.includes("tall")) out.push("tall");
  if (lower.includes("athletic")) out.push("athletic");
  if (lower.includes("cute")) out.push("cute");
  if (lower.includes("boyish")) out.push("boyish");
  if (lower.includes("mature")) out.push("mature");
  if (lower.includes("masculine")) out.push("masculine");
  return out;
}

function detectOccasion(text: string): string | undefined {
  const lower = text.toLowerCase();
  if (lower.includes("dinner")) return "dinner";
  if (lower.includes("travel")) return "travel";
  if (lower.includes("private")) return "private";
  if (lower.includes("gym")) return "gym";
  if (lower.includes("social")) return "social";
  return undefined;
}

function detectTimeLabel(text: string): string | undefined {
  const lower = text.toLowerCase();
  if (lower.includes("tonight")) return "tonight";
  if (lower.includes("now")) return "now";
  if (lower.includes("tomorrow")) return "tomorrow";
  return undefined;
}

function detectVenue(text: string): string | undefined {
  const venues = ["four seasons", "mandarin oriental", "capella", "sofitel"];
  const lower = text.toLowerCase();
  return venues.find((v) => lower.includes(v)) ?? undefined;
}

export function extractPreferences(
  input: ExtractPreferencesRequest,
): ExtractPreferencesResponse {
  const text = input.text.trim();
  const budgetAmount = detectBudget(text);
  const occasion = detectOccasion(text);
  const timeLabel = detectTimeLabel(text);
  const venue = detectVenue(text);

  let budgetSignal: ExtractedPreferences["budget_signal"] = undefined;
  if (budgetAmount) {
    if (budgetAmount >= 50000) budgetSignal = "high";
    else if (budgetAmount >= 30000) budgetSignal = "premium";
    else if (budgetAmount >= 15000) budgetSignal = "standard";
    else budgetSignal = "low";
  }

  const preferences: ExtractedPreferences = {
    occasion,
    time_label: timeLabel,
    venue_name: venue,
    appearance_tags: detectAppearance(text),
    vibe_tags: detectVibes(text),
    languages: detectLanguages(text),
    budget_signal: budgetSignal,
    budget_amount_thb: budgetAmount,
  };

  const lower = text.toLowerCase();
  const specificModelRequested =
    lower.includes("kenji") ||
    lower.includes("hito") ||
    lower.includes("hiei") ||
    lower.includes("hima");

  const highValueClient =
    budgetSignal === "high" || budgetSignal === "premium";

  const missingFields: string[] = [];
  if (!occasion) missingFields.push("occasion");
  if (!timeLabel) missingFields.push("time");
  if (!budgetAmount) missingFields.push("budget");

  return {
    ok: true,
    intent: "booking_inquiry",
    preferences,
    flags: {
      high_value_client: highValueClient,
      ask_per_before_high_tier: highValueClient,
      specific_model_requested: specificModelRequested,
    },
    missing_fields: missingFields,
  };
}
