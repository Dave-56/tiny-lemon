import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Link, Outlet, useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";

import { AuthenticatedFetchProvider } from "../contexts/AuthenticatedFetchContext";
import { PendingItemsProvider } from "../contexts/PendingItemsContext";
import { PostHogProvider } from "../components/PostHogProvider";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { getMonthlyUsage, getEffectiveEntitlements } from "../lib/billing.server";
import { ensureBetaAccessFromAllowlist } from "../lib/betaAccess.server";
import { getAppFlowRedirect } from "../lib/appFlow.server";
import { getSupportEmail } from "../lib/support.server";
import { shopifyRedirect } from "../shopify-params";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  await ensureBetaAccessFromAllowlist(session.shop);

  const [shop, brandStyle, used, entitlements] = await Promise.all([
    prisma.shop.findUnique({
      where: { id: session.shop },
      select: {
        plan: true,
        betaAccess: true,
        betaStatus: true,
        betaWelcomeCompleted: true,
        betaIntakeCompleted: true,
      },
    }),
    prisma.brandStyle.findUnique({
      where: { shopId: session.shop },
      select: { onboardingCompleted: true },
    }),
    getMonthlyUsage(session.shop),
    getEffectiveEntitlements(session.shop),
  ]);

  const redirectPath = getAppFlowRedirect({
    pathname: new URL(request.url).pathname,
    betaAccess: shop?.betaAccess ?? false,
    betaStatus: shop?.betaStatus ?? null,
    betaWelcomeCompleted: shop?.betaWelcomeCompleted ?? false,
    betaIntakeCompleted: shop?.betaIntakeCompleted ?? false,
    onboardingCompleted: brandStyle?.onboardingCompleted ?? false,
  });
  if (redirectPath) {
    return shopifyRedirect(request, redirectPath);
  }

  const plan = shop?.plan ?? "free";
  const supportEmail = getSupportEmail();

  // eslint-disable-next-line no-undef
  return {
    apiKey: process.env.SHOPIFY_API_KEY || "",
    shop: session.shop,
    plan,
    used,
    limit: entitlements.effectiveLimit,
    isBeta: entitlements.isBeta,
    betaStatus: entitlements.betaStatus,
    showUpgradePrompt: entitlements.showUpgradePrompt,
    supportEmail,
  };
};

export default function App() {
  const {
    apiKey,
    shop,
    plan,
    used,
    limit,
    isBeta,
    showUpgradePrompt,
    supportEmail,
  } = useLoaderData<typeof loader>();

  return (
    <AppProvider embedded apiKey={apiKey}>
      <AuthenticatedFetchProvider>
      <PendingItemsProvider>
      <s-app-nav>
        <s-link href="/app/dress-model">Dress model</s-link>
        <s-link href="/app/outfits">Outfits</s-link>
        <s-link href="/app/model-builder">Model builder</s-link>
        <s-link href="/app/brand-style">Brand style</s-link>
        {!isBeta && <s-link href="/app/billing">Billing</s-link>}
      </s-app-nav>

      {/* Usage counter — rendered outside s-app-nav to avoid App Bridge conflicts */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-krea-border bg-white text-xs text-krea-muted">
        {isBeta && (
          <span className="rounded-full bg-krea-accent/10 px-2 py-0.5 font-medium text-krea-accent">
            Beta
          </span>
        )}
        <span className={used >= limit ? "text-red-500 font-medium" : ""}>{used}/{limit} generations this month</span>
        {used >= limit && showUpgradePrompt ? (
          <Link to="/app/billing" className="text-red-500 underline underline-offset-2 font-medium">
            Upgrade to continue →
          </Link>
        ) : used >= limit && isBeta ? (
          <a
            href={`mailto:${supportEmail}?subject=${encodeURIComponent("TinyLemon beta access")}`}
            className="text-krea-accent underline underline-offset-2"
          >
            Contact us for more access
          </a>
        ) : plan === "free" && showUpgradePrompt ? (
          <Link to="/app/billing" className="text-krea-accent underline underline-offset-2">
            Upgrade
          </Link>
        ) : null}
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
