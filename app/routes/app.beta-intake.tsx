import { useEffect } from "react";
import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Form, useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import posthog from "posthog-js";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { shopifyRedirect } from "../shopify-params";
import {
  BETA_BIGGEST_PAINS,
  BETA_CATALOG_TYPES,
  BETA_INTENDED_USE_CASES,
  BETA_PHOTO_WORKFLOWS,
  BETA_SKU_VOLUMES,
  BETA_STATUS,
} from "../lib/beta";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  const shop = await prisma.shop.findUnique({
    where: { id: session.shop },
    select: {
      betaAccess: true,
      betaStatus: true,
      betaWelcomeCompleted: true,
      betaIntakeCompleted: true,
      storeUrl: true,
      catalogType: true,
      skuVolume: true,
      photoWorkflow: true,
      biggestPain: true,
      intendedUseCase: true,
    },
  });

  const isBeta =
    shop?.betaAccess === true &&
    shop.betaStatus !== BETA_STATUS.paused &&
    shop.betaStatus !== BETA_STATUS.ended;

  if (!isBeta) {
    return shopifyRedirect(request, "/app");
  }

  if (!shop?.betaWelcomeCompleted) {
    return shopifyRedirect(request, "/app/beta-welcome");
  }

  if (shop?.betaIntakeCompleted) {
    return shopifyRedirect(request, "/app/onboarding");
  }

  return { shop: session.shop, profile: shop };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const fd = await request.formData();

  const payload = {
    storeUrl: ((fd.get("storeUrl") as string) || "").trim() || null,
    catalogType: ((fd.get("catalogType") as string) || "").trim() || null,
    skuVolume: ((fd.get("skuVolume") as string) || "").trim() || null,
    photoWorkflow: ((fd.get("photoWorkflow") as string) || "").trim() || null,
    biggestPain: ((fd.get("biggestPain") as string) || "").trim() || null,
    intendedUseCase: ((fd.get("intendedUseCase") as string) || "").trim() || null,
    betaIntakeCompleted: true,
  };

  await prisma.shop.update({
    where: { id: session.shop },
    data: payload,
  });

  return shopifyRedirect(request, "/app/onboarding");
};

function SelectField({
  name,
  label,
  options,
  defaultValue,
}: {
  name: string;
  label: string;
  options: readonly string[];
  defaultValue?: string | null;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-krea-text">{label}</span>
      <select
        name={name}
        defaultValue={defaultValue ?? ""}
        className="h-10 w-full rounded-md border border-krea-border bg-white px-3 text-sm text-krea-text"
        required
      >
        <option value="" disabled>
          Select one
        </option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

export default function BetaIntake() {
  const { shop, profile } = useLoaderData<typeof loader>();

  useEffect(() => {
    posthog.capture("beta_intake_viewed", { shop, beta_access: true });
  }, [shop]);

  return (
    <div className="min-h-screen bg-krea-bg p-6 pt-10">
      <div className="mx-auto max-w-2xl rounded-2xl border border-krea-border bg-white p-6 shadow-sm">
        <div className="rounded-lg border border-krea-accent/25 bg-krea-accent/5 px-3 py-2 text-xs text-krea-text">
          Step 2 of 3: Help us understand your catalog and workflow.
        </div>

        <h1 className="mt-4 text-2xl font-semibold text-krea-text">A quick beta intake</h1>
        <p className="mt-2 text-sm text-krea-muted">
          This should take about two minutes and helps us make the beta more useful for you.
        </p>

        <Form
          method="post"
          className="mt-6 grid gap-4"
          onSubmit={() =>
            posthog.capture("beta_intake_completed", {
              shop,
              beta_access: true,
            })
          }
        >
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-krea-text">Store URL</span>
            <input
              name="storeUrl"
              defaultValue={profile.storeUrl ?? ""}
              placeholder="https://yourstore.com"
              className="h-10 w-full rounded-md border border-krea-border px-3 text-sm text-krea-text"
            />
          </label>

          <SelectField
            name="catalogType"
            label="What do you sell?"
            options={BETA_CATALOG_TYPES}
            defaultValue={profile.catalogType}
          />
          <SelectField
            name="skuVolume"
            label="How many new SKUs or images do you add in a typical week?"
            options={BETA_SKU_VOLUMES}
            defaultValue={profile.skuVolume}
          />
          <SelectField
            name="photoWorkflow"
            label="How do you create product photos today?"
            options={BETA_PHOTO_WORKFLOWS}
            defaultValue={profile.photoWorkflow}
          />
          <SelectField
            name="biggestPain"
            label="What is the biggest challenge today?"
            options={BETA_BIGGEST_PAINS}
            defaultValue={profile.biggestPain}
          />
          <SelectField
            name="intendedUseCase"
            label="What would make TinyLemon most valuable for you?"
            options={BETA_INTENDED_USE_CASES}
            defaultValue={profile.intendedUseCase}
          />

          <button
            type="submit"
            className="mt-2 h-10 rounded-md bg-krea-accent text-sm font-medium text-white transition-all hover:opacity-90 active:scale-95"
          >
            Continue to brand setup
          </button>
        </Form>
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
