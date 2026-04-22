import { AppProvider } from "@shopify/shopify-app-react-router/react";
import type { LoaderFunctionArgs } from "react-router";

import { login } from "../../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await login(request);
  return null;
};

export default function Auth() {
  return (
    <AppProvider embedded={false}>
      <s-page>
        <s-section heading="Open Tiny Lemon from Shopify">
          <s-text>
            Tiny Lemon is a Shopify app. To use it, install it from the
            Shopify App Store, or open it from the Apps menu inside your
            Shopify admin.
          </s-text>
        </s-section>
      </s-page>
    </AppProvider>
  );
}
