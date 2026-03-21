import type { Env } from '../types';

export async function notifyInternal(env: Env, text: string, threadId?: string): Promise<Response | null> {
  if (!env.TELEGRAM_WORKER_BASE_URL) return null;
  const url = `${env.TELEGRAM_WORKER_BASE_URL.replace(/\/$/, '')}/telegram/internal/send`;
  return await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${env.INTERNAL_TOKEN}`
    },
    body: JSON.stringify({
      chat_id: env.TELEGRAM_CHAT_ID || '-1003546439681',
      message_thread_id: threadId ? Number(threadId) : undefined,
      text
    })
  });
}
