import type { ActionFunctionArgs } from "react-router";
import { getShopFromSessionToken } from "../lib/sessionToken.server";
import { handleBulkUpscaleRequest } from "../lib/upscaleOrchestration.server";

export const config = { maxDuration: 15 };

interface BulkUpscaleRequestBody {
  outfitId: string;
  targetScale?: 2 | 4;
}

/**
 * POST /api/bulk-upscale
 * Authenticates via Authorization: Bearer <session token>.
 * Enqueues upscale-image Trigger.dev tasks for every eligible image in an outfit.
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

  let body: BulkUpscaleRequestBody;
  try {
    body = (await request.json()) as BulkUpscaleRequestBody;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.outfitId) {
    return Response.json(
      { error: "Missing required field: outfitId" },
      { status: 400 },
    );
  }

  return handleBulkUpscaleRequest({
    outfitId: body.outfitId,
    shopId,
    targetScale: body.targetScale === 4 ? 4 : 2,
  });
};
