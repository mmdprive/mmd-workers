import type {
  Channel,
  ClientTier,
  Env,
  ExtractPreferencesResponse,
  MatchResponse,
  ReplyResponse,
} from "../types";
import { callAiWorker } from "./ai-client";
import { fetchModelCardsLite } from "./admin-client";
import { escapeHtml, sendInternalTelegramAlert } from "./telegram";

export async function handleClientMessageWithAi(
  env: Env,
  input: {
    clientId: string;
    clientTier: ClientTier;
    messageText: string;
    channel: Channel;
  },
): Promise<{
  replyText: string;
  requiresHumanReview: boolean;
  debug: unknown;
}> {
  const extracted = await callAiWorker<ExtractPreferencesResponse>(
    env,
    "/v1/ai/extract-preferences",
    {
      text: input.messageText,
      channel: input.channel,
      client: {
        tier: input.clientTier,
      },
    },
  );

  if (extracted.flags.specific_model_requested) {
    await sendInternalTelegramAlert(
      env,
      [
        "🖤 <b>Specific Model Request</b>",
        `Client: ${escapeHtml(input.clientId)}`,
        `Tier: ${escapeHtml(input.clientTier)}`,
        `Message: ${escapeHtml(input.messageText)}`,
      ].join("\n"),
    );

    return {
      replyText:
        "Of course. I’ll check availability for your requested model and come back to you shortly.",
      requiresHumanReview: true,
      debug: { extracted },
    };
  }

  const models = await fetchModelCardsLite(env);

  const matchResult = await callAiWorker<MatchResponse>(env, "/v1/ai/match", {
    client: {
      tier: input.clientTier,
      budget_signal: extracted.preferences.budget_signal,
      selection_mode: "mmd_suggestion",
    },
    request: {
      occasion: extracted.preferences.occasion,
      time_label: extracted.preferences.time_label,
      venue_name: extracted.preferences.venue_name,
      location_area: extracted.preferences.location_area,
      preferences: {
        appearance_tags: extracted.preferences.appearance_tags,
        vibe_tags: extracted.preferences.vibe_tags,
        languages: extracted.preferences.languages,
      },
    },
    constraints: {
      require_available_now:
        extracted.preferences.time_label === "now" ||
        extracted.preferences.time_label === "tonight",
      respect_minimum_rate: true,
      budget_amount_thb: extracted.preferences.budget_amount_thb,
      max_results: 3,
    },
    models,
  });

  const forceHumanReview =
    ["vip", "svip", "blackcard"].includes(input.clientTier) ||
    (extracted.preferences.budget_amount_thb ?? 0) >= 50000;

  const drafted = await callAiWorker<ReplyResponse>(env, "/v1/ai/reply", {
    client: {
      tier: input.clientTier,
    },
    request: {
      occasion: extracted.preferences.occasion,
      time_label: extracted.preferences.time_label,
      venue_name: extracted.preferences.venue_name,
    },
    matches: matchResult.matches,
    flags: {
      ask_per_before_high_tier:
        matchResult.flags.ask_per_before_high_tier || forceHumanReview,
    },
    reply_mode: "client-facing",
  });

  if (drafted.requires_human_review || forceHumanReview) {
    await sendInternalTelegramAlert(
      env,
      [
        "🖤 <b>MMD AI Review Needed</b>",
        `Client: ${escapeHtml(input.clientId)}`,
        `Tier: ${escapeHtml(input.clientTier)}`,
        `Message: ${escapeHtml(input.messageText)}`,
        "",
        `<b>Top matches:</b> ${escapeHtml(
          matchResult.matches.map((m) => m.working_name).join(", ") || "-",
        )}`,
        `<b>Top reason:</b> ${escapeHtml(
          matchResult.matches[0]?.reason.join(", ") || "-",
        )}`,
        `<b>Flags:</b> high_value=${String(matchResult.flags.high_value_client)}, per_first=${String(matchResult.flags.ask_per_before_high_tier || forceHumanReview)}`,
      ].join("\n"),
    );
  }

  return {
    replyText: drafted.reply_text,
    requiresHumanReview: drafted.requires_human_review || forceHumanReview,
    debug: {
      extracted,
      matchResult,
      forceHumanReview,
    },
  };
}
