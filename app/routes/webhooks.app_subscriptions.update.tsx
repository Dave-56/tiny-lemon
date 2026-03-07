import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

// Fires when a subscription is created, updated, cancelled, or payment fails.
// Keeps Shop.plan in sync so our usage gate always reflects the true state.
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, payload } = await authenticate.webhook(request);

  const status = payload?.app_subscription?.status as string | undefined;
  const planName = payload?.app_subscription?.name as string | undefined;

  if (status === "CANCELLED" || status === "DECLINED" || status === "EXPIRED") {
    await prisma.shop.updateMany({ where: { id: shop }, data: { plan: "free" } });
  } else if (status === "ACTIVE" && planName) {
    await prisma.shop.updateMany({ where: { id: shop }, data: { plan: planName } });
  }

  return new Response(null, { status: 200 });
};
