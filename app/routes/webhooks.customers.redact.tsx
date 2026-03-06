import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

// Shopify GDPR: merchant requests deletion of customer data.
// We store no customer PII — only shop-level data (outfits, generated images).
// Return 200. Update this when user data is stored.
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  return new Response();
};
