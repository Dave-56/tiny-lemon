import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";

// Shopify GDPR: shop requests deletion of all their data (48h after uninstall).
// Deleting the Shop record cascades to Outfit, GeneratedImage, CreditBalance, CreditTransaction.
// Sessions are keyed by shop string (not Shop.id) so delete those separately.
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  await Promise.all([
    db.shop.deleteMany({ where: { id: shop } }),
    db.session.deleteMany({ where: { shop } }),
  ]);

  return new Response();
};
