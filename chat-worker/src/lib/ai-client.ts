import type { Env } from "../types";

export async function callAiWorker<T>(
  env: Env,
  path: string,
  payload: unknown,
): Promise<T> {
  const response = await fetch(`${env.AI_WORKER_BASE_URL}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "authorization": `Bearer ${env.INTERNAL_TOKEN}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`ai-worker ${path} failed: ${response.status} ${text}`);
  }

  return (await response.json()) as T;
}
