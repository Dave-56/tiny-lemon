import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { shopifyRedirect } from "../shopify-params";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const brandStyle = await prisma.brandStyle.findUnique({
    where: { shopId: session.shop },
    select: { onboardingCompleted: true },
  });
  if (!brandStyle?.onboardingCompleted) {
    return shopifyRedirect(request, "/app/onboarding");
  }
  return shopifyRedirect(request, "/app/dress-model");
};
