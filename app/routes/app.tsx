import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import {
  Link,
  Outlet,
  useLoaderData,
  useLocation,
  useNavigation,
  useRouteError,
} from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { useEffect, useMemo, useState } from "react";

import { AuthenticatedFetchProvider } from "../contexts/AuthenticatedFetchContext";
import { PendingItemsProvider } from "../contexts/PendingItemsContext";
import { PostHogProvider } from "../components/PostHogProvider";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { ensureBetaAccessForShop } from "../lib/betaAccess.server";
import { getMonthlyUsage, getEffectiveEntitlements } from "../lib/billing.server";
import { getAppFlowRedirect } from "../lib/appFlow.server";
import { getSupportEmail } from "../lib/support.server";
import { shopifyRedirect } from "../shopify-params";
import { createLoaderTiming } from "../lib/loaderTiming.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const timing = createLoaderTiming("app", request);
  const { session } = await timing.measure("authenticateAdminMs", () =>
    authenticate.admin(request),
  );
  await timing.measure("ensureBetaAccessMs", () =>
    ensureBetaAccessForShop(session.shop),
  );

  const [shop, brandStyle, used, entitlements] = await Promise.all([
    timing.measure("shopLookupMs", () =>
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
    ),
    timing.measure("brandStyleLookupMs", () =>
      prisma.brandStyle.findUnique({
        where: { shopId: session.shop },
        select: { onboardingCompleted: true },
      }),
    ),
    timing.measure("monthlyUsageMs", () => getMonthlyUsage(session.shop)),
    timing.measure("entitlementsMs", () => getEffectiveEntitlements(session.shop)),
  ]);

  const redirectPath = getAppFlowRedirect({
    pathname: new URL(request.url).pathname,
    betaIntakeCompleted: shop?.betaIntakeCompleted ?? false,
    onboardingCompleted: brandStyle?.onboardingCompleted ?? false,
  });
  if (redirectPath) {
    timing.log({ redirected: true, redirectPath });
    return shopifyRedirect(request, redirectPath);
  }

  const plan = shop?.plan ?? "free";
  const supportEmail = getSupportEmail();

  // eslint-disable-next-line no-undef
  timing.log({ redirected: false });
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
  const location = useLocation();
  const navigation = useNavigation();
  const [pendingPath, setPendingPath] = useState<string | null>(null);
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
  const appHref = (path: string) => `${path}${location.search}`;
  const navItems = useMemo(
    () => [
      { path: "/app/dress-model", label: "Dress model" },
      { path: "/app/outfits", label: "Outfits" },
      { path: "/app/model-builder", label: "Model builder" },
      { path: "/app/brand-style", label: "Brand style" },
      { path: "/app/beta-intake", label: "Store profile" },
      ...(isBeta ? [] : [{ path: "/app/billing", label: "Billing" }]),
    ],
    [isBeta],
  );
  const navigatingPath = navigation.location?.pathname ?? null;
  const loadingPath = navigatingPath ?? pendingPath;
  const loadingLabel = navItems.find((item) => item.path === loadingPath)?.label;
  const isRouteChanging = Boolean(
    loadingPath &&
      (loadingPath !== location.pathname || navigation.state !== "idle"),
  );

  useEffect(() => {
    setPendingPath(null);
  }, [location.pathname, location.search]);

  return (
    <AppProvider embedded apiKey={apiKey}>
      <AuthenticatedFetchProvider>
      <PendingItemsProvider>
      <s-app-nav>
        {navItems.map((item) => (
          <s-link
            key={item.path}
            href={appHref(item.path)}
            aria-busy={loadingPath === item.path ? "true" : undefined}
            onClick={() => {
              if (item.path !== location.pathname) {
                setPendingPath(item.path);
              }
            }}
          >
            {item.label}
          </s-link>
        ))}
      </s-app-nav>
      <div
        aria-hidden={!isRouteChanging}
        className="h-0.5 border-b border-krea-border bg-white"
      >
        {isRouteChanging && (
          <div className="h-full w-full animate-pulse bg-krea-accent" />
        )}
      </div>
      {isRouteChanging && (
        <span className="sr-only" role="status" aria-live="polite">
          Loading{loadingLabel ? ` ${loadingLabel}` : ""}
        </span>
      )}

      {/* Usage counter — rendered outside s-app-nav to avoid App Bridge conflicts */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-krea-border bg-white text-xs text-krea-muted">
        {isBeta && (
          <span className="rounded-full bg-krea-accent/10 px-2 py-0.5 font-medium text-krea-accent">
            Beta
          </span>
        )}
        <span className={used >= limit ? "text-red-500 font-medium" : ""}>{used}/{limit} generations this month</span>
        {used >= limit && showUpgradePrompt ? (
          <Link to={appHref("/app/billing")} className="text-red-500 underline underline-offset-2 font-medium">
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
          <Link to={appHref("/app/billing")} className="text-krea-accent underline underline-offset-2">
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
