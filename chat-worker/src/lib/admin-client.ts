import type { Env, ModelCardLite, ModelsListLiteResponse } from "../types";

export async function fetchModelCardsLite(env: Env): Promise<ModelCardLite[]> {
  const response = await fetch(
    `${env.ADMIN_WORKER_BASE_URL}/v1/admin/models/list-lite`,
    {
      method: "GET",
      headers: {
        "authorization": `Bearer ${env.INTERNAL_TOKEN}`,
      },
    },
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `admin-worker /v1/admin/models/list-lite failed: ${response.status} ${text}`,
    );
  }

  const data = (await response.json()) as ModelsListLiteResponse;
  return data.models;
}
