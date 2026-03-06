import type { LoaderFunctionArgs } from "react-router";
import { shopifyRedirect } from "../shopify-params";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  return shopifyRedirect(request, "/app/dress-model");
};
