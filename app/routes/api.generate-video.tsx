import type { ActionFunctionArgs } from "react-router";
import { getShopFromSessionToken } from "../lib/sessionToken.server";
import { handleVideoGenerateRequest } from "../lib/videoOrchestration.server";

export const config = { maxDuration: 15 };

interface GenerateVideoRequestBody {
  outfitId: string;
}

/**
 * POST /api/generate-video
 * Authenticates via Authorization: Bearer <session token>.
 * Enqueues a generate-video Trigger.dev task for a completed Outfit.
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

  let body: GenerateVideoRequestBody;
  try {
    body = (await request.json()) as GenerateVideoRequestBody;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.outfitId) {
    return Response.json(
      { error: "Missing required field: outfitId" },
      { status: 400 },
    );
  }

  return handleVideoGenerateRequest({
    outfitId: body.outfitId,
    shopId,
  });
};
