import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { shopifyRedirect } from "../shopify-params";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return shopifyRedirect(request, "/app/dress-model");
};
