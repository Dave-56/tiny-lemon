import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";

import { login } from "../../shopify.server";

// Shopify's login() throws a redirect Response when a valid ?shop= param is
// present (continues OAuth). Without shop, it returns errors — in that case
// we forward to the landing page so a merchant is never dead-ended here.
// The manual shop-domain input form was removed to satisfy Shopify App Store
// review ("installation must initiate from a Shopify-owned surface").
export const loader = async ({ request }: LoaderFunctionArgs) => {
  await login(request);
  throw redirect("/");
};
