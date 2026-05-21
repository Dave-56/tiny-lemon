import type { ActionFunctionArgs } from "react-router";
import { getShopFromSessionToken } from "../lib/sessionToken.server";
import { handleRegenerateOutfit } from "../lib/triggerGeneration.server";

export const config = { maxDuration: 30 };

interface RegenerateOutfitRequestBody {
  outfitId: string;
  userDirection?: string;
}

/**
 * POST /api/regenerate-outfit
 * Authenticates via Authorization: Bearer <session token> and always returns
 * JSON. This keeps regenerate out of the embedded /app route auth bounce path.
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

  let body: RegenerateOutfitRequestBody;
  try {
    body = (await request.json()) as RegenerateOutfitRequestBody;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.outfitId) {
    return Response.json(
      { error: "Missing required field: outfitId" },
      { status: 400 },
    );
  }

  return handleRegenerateOutfit(
    shopId,
    body.outfitId,
    body.userDirection || undefined,
  );
};
