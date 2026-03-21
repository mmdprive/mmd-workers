import type { Env } from "./index";

export async function sendTelegramMessage(
  env: Env,
  text: string
): Promise<any> {
  if (!env.TELEGRAM_BOT_TOKEN) {
    throw new Error("TELEGRAM_BOT_TOKEN is missing");
  }

  const url = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`;

  const payload = {
    chat_id: env.TELEGRAM_CHAT_ID,
    message_thread_id: Number(env.TG_THREAD_CONFIRM || 61),
    text,
    parse_mode: "HTML",
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(`Telegram send failed: ${JSON.stringify(data)}`);
  }

  return data;
}