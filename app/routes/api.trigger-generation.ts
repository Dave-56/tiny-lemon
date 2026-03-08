import type { ActionFunctionArgs } from "react-router";
import { getShopFromSessionToken } from "../lib/sessionToken.server";
import {
  handleTriggerGeneration,
  type TriggerGenerationBody,
} from "../lib/triggerGeneration.server";

export const config = { maxDuration: 30 };

/**
 * POST /api/trigger-generation
 * Authenticates via Authorization: Bearer <session token> and always returns JSON
 * (401 JSON on auth failure instead of HTML redirect). Used by dress-model so the
 * client gets a clear auth failure and can show "Session expired" without relying on content-type.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const secret = process.env.SHOPIFY_API_SECRET;
  if (!secret) {
    return Response.json(
      { error: "Server configuration error" },
      { status: 500 }
    );
  }

  const auth = request.headers.get("Authorization");
  const shopId = getShopFromSessionToken(auth, secret);
  if (!shopId) {
    return Response.json(
      { error: "Session expired — please refresh the page." },
      { status: 401 }
    );
  }

  let body: TriggerGenerationBody;
  try {
    body = (await request.json()) as TriggerGenerationBody;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.modelId || !body.modelImageUrl || !body.frontB64) {
    return Response.json(
      { error: "Missing required fields: modelId, modelImageUrl, frontB64" },
      { status: 400 }
    );
  }

  return handleTriggerGeneration(shopId, body);
};
