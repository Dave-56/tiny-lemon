import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Link, Outlet, useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";

import { AuthenticatedFetchProvider } from "../contexts/AuthenticatedFetchContext";
import { PendingItemsProvider } from "../contexts/PendingItemsContext";
import { PostHogProvider } from "../components/PostHogProvider";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { getMonthlyUsage, PLAN_LIMITS } from "../lib/billing.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  const [shop, used] = await Promise.all([
    prisma.shop.findUnique({ where: { id: session.shop }, select: { plan: true } }),
    getMonthlyUsage(session.shop),
  ]);

  const plan = shop?.plan ?? "free";
  const limit = PLAN_LIMITS[plan] ?? PLAN_LIMITS.free;

  // eslint-disable-next-line no-undef
  return { apiKey: process.env.SHOPIFY_API_KEY || "", shop: session.shop, plan, used, limit };
};

export default function App() {
  const { apiKey, shop, plan, used, limit } = useLoaderData<typeof loader>();

  return (
    <AppProvider embedded apiKey={apiKey}>
      <AuthenticatedFetchProvider>
      <PendingItemsProvider>
      <s-app-nav>
        <s-link href="/app/dress-model">Dress model</s-link>
        <s-link href="/app/outfits">Outfits</s-link>
        <s-link href="/app/model-builder">Model builder</s-link>
        <s-link href="/app/brand-style">Brand style</s-link>
        <s-link href="/app/billing">Billing</s-link>
      </s-app-nav>

      {/* Usage counter — rendered outside s-app-nav to avoid App Bridge conflicts */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-krea-border bg-white text-xs text-krea-muted">
        <span>{used}/{limit} generations this month</span>
        {plan === "free" && (
          <Link to="/app/billing" className="text-krea-accent underline underline-offset-2">
            Upgrade
          </Link>
        )}
      </div>

      <PostHogProvider shop={shop} plan={plan} />
      <Outlet />
      </PendingItemsProvider>
      </AuthenticatedFetchProvider>
    </AppProvider>
  );
}

// Shopify needs React Router to catch some thrown responses, so that their headers are included in the response.
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
