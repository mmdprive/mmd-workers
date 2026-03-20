import type { Env } from "../types";

export async function sendInternalTelegramAlert(
  env: Env,
  message: string,
): Promise<void> {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) {
    return;
  }

  const response = await fetch(
    `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        chat_id: env.TELEGRAM_CHAT_ID,
        text: message,
        parse_mode: "HTML",
        ...(env.TG_THREAD_CONFIRM
          ? { message_thread_id: Number(env.TG_THREAD_CONFIRM) }
          : {}),
      }),
    },
  );

  if (!response.ok) {
    const text = await response.text();
    console.error("telegram alert failed", text);
  }
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
