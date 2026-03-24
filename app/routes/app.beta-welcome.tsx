import { useEffect } from "react";
import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Form, useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import posthog from "posthog-js";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { shopifyRedirect } from "../shopify-params";
import { getEffectiveEntitlements } from "../lib/billing.server";
import { BETA_STATUS } from "../lib/beta";
import { getSupportEmail } from "../lib/support.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  const shop = await prisma.shop.findUnique({
    where: { id: session.shop },
    select: {
      betaAccess: true,
      betaStatus: true,
      betaWelcomeCompleted: true,
    },
  });

  const isBeta =
    shop?.betaAccess === true &&
    shop.betaStatus !== BETA_STATUS.paused &&
    shop.betaStatus !== BETA_STATUS.ended;

  if (!isBeta) {
    return shopifyRedirect(request, "/app");
  }

  if (shop?.betaStatus !== BETA_STATUS.active) {
    await prisma.shop.update({
      where: { id: session.shop },
      data: {
        betaStatus: BETA_STATUS.active,
        betaActivatedAt: new Date(),
      },
    });
  }

  if (shop?.betaWelcomeCompleted) {
    return shopifyRedirect(request, "/app/beta-intake");
  }

  const entitlements = await getEffectiveEntitlements(session.shop);
  return {
    shop: session.shop,
    limit: entitlements.effectiveLimit,
    supportEmail: getSupportEmail(),
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  await prisma.shop.update({
    where: { id: session.shop },
    data: {
      betaStatus: BETA_STATUS.active,
      betaActivatedAt: new Date(),
      betaWelcomeCompleted: true,
    },
  });

  return shopifyRedirect(request, "/app/beta-intake");
};

export default function BetaWelcome() {
  const { shop, limit, supportEmail } = useLoaderData<typeof loader>();

  useEffect(() => {
    posthog.capture("beta_welcome_viewed", { shop, beta_cap: limit, beta_access: true });
  }, [shop, limit]);

  return (
    <div className="min-h-screen bg-krea-bg p-6 pt-12">
      <div className="mx-auto max-w-xl rounded-2xl border border-krea-border bg-white p-6 shadow-sm">
        <div className="mb-5 inline-flex rounded-full bg-krea-accent/10 px-3 py-1 text-xs font-medium text-krea-accent">
          TinyLemon Beta
        </div>
        <h1 className="text-2xl font-semibold text-krea-text">Welcome to the beta</h1>
        <p className="mt-2 text-sm text-krea-muted">
          You have free beta access while we learn with you. Your current beta allowance is {limit} generations per month.
        </p>

        <ul className="mt-6 space-y-3 text-sm text-krea-text">
          <li>Best results come from single-garment flat lays.</li>
          <li>You have full feature access during beta.</li>
          <li>We may reach out to learn what&apos;s working and what isn&apos;t.</li>
          <li>Support is available whenever you get stuck.</li>
        </ul>

        <div className="mt-8 flex gap-3">
          <Form
            method="post"
            onSubmit={() => posthog.capture("beta_welcome_completed", { shop, beta_cap: limit })}
            className="flex-1"
          >
            <button
              type="submit"
              className="h-10 w-full rounded-md bg-krea-accent text-sm font-medium text-white transition-all hover:opacity-90 active:scale-95"
            >
              Continue
            </button>
          </Form>
          <a
            href={`mailto:${supportEmail}?subject=${encodeURIComponent("TinyLemon beta support")}`}
            onClick={() => posthog.capture("beta_support_clicked", { shop, location: "beta_welcome" })}
            className="inline-flex h-10 items-center rounded-md border border-krea-border px-4 text-sm text-krea-text transition-colors hover:border-krea-muted"
          >
            Contact support
          </a>
        </div>
      </div>
    </div>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
