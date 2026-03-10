import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";

// Shopify GDPR: single endpoint for all mandatory compliance webhooks (compliance_topics).
// HMAC verification via authenticate.webhook; 401 on invalid signature.
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  if (topic === "shop/redact") {
    await Promise.all([
      db.shop.deleteMany({ where: { id: shop } }),
      db.session.deleteMany({ where: { shop } }),
    ]);
  }
  // customers/data_request and customers/redact: we store no customer PII, just acknowledge
  return new Response();
};
