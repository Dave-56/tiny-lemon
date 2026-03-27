import type { ActionFunctionArgs } from "react-router";
import { getShopFromSessionToken } from "../lib/sessionToken.server";
import { handleSingleUpscaleRequest } from "../lib/upscaleOrchestration.server";

export const config = { maxDuration: 15 };

interface UpscaleRequestBody {
  generatedImageId: string;
  targetScale?: 2 | 4;
}

/**
 * POST /api/upscale-image
 * Authenticates via Authorization: Bearer <session token>.
 * Enqueues an upscale-image Trigger.dev task for a single GeneratedImage.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const secret = process.env.SHOPIFY_API_SECRET;
  if (!secret) {
    return Response.json(
      { error: "Server configuration error" },
      { status: 500 },
    );
  }

  const auth = request.headers.get("Authorization");
  const shopId = getShopFromSessionToken(auth, secret);
  if (!shopId) {
    return Response.json(
      { error: "Session expired — please refresh the page." },
      { status: 401 },
    );
  }

  let body: UpscaleRequestBody;
  try {
    body = (await request.json()) as UpscaleRequestBody;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.generatedImageId) {
    return Response.json(
      { error: "Missing required field: generatedImageId" },
      { status: 400 },
    );
  }

  return handleSingleUpscaleRequest({
    generatedImageId: body.generatedImageId,
    shopId,
    targetScale: body.targetScale === 4 ? 4 : 2,
  });
};
