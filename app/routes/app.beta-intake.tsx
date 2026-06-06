import { useEffect } from "react";
import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Form, useLoaderData, useNavigation, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import posthog from "posthog-js";
import { authenticate } from "../shopify.server";
import prisma, { ensureShop } from "../db.server";
import { shopifyRedirect } from "../shopify-params";
import { createLoaderTiming } from "../lib/loaderTiming.server";
import {
  BETA_BIGGEST_PAINS,
  BETA_CATALOG_TYPES,
  BETA_GRAPHIC_SENSITIVITY,
  BETA_HERO_PRODUCT_FOCUS,
  BETA_INTENDED_USE_CASES,
  BETA_LAUNCH_STAGES,
  BETA_OUTPUT_CHANNELS,
  BETA_PHOTO_WORKFLOWS,
  BETA_SHOOT_GOALS,
  BETA_SKU_VOLUMES,
  BETA_STYLING_SUPPORT,
} from "../lib/beta";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const timing = createLoaderTiming("app.beta-intake", request);
  const { session } = await timing.measure("authenticateAdminMs", () =>
    authenticate.admin(request),
  );
  await timing.measure("ensureShopMs", () => ensureShop(session.shop));

  const shop = await timing.measure("shopProfileLookupMs", () =>
    prisma.shop.findUnique({
      where: { id: session.shop },
      select: {
        betaIntakeCompleted: true,
        contactEmail: true,
        storeUrl: true,
        catalogType: true,
        skuVolume: true,
        photoWorkflow: true,
        biggestPain: true,
        intendedUseCase: true,
        launchStage: true,
        shootGoal: true,
        heroProductFocus: true,
        stylingSupport: true,
        graphicSensitivity: true,
        outputChannels: true,
        intakeNotes: true,
      },
    }),
  );

  if (!shop) {
    timing.log({ notFound: true });
    throw new Response("Shop not found", { status: 500 });
  }

  timing.log({ betaIntakeCompleted: shop.betaIntakeCompleted });
  return { shop: session.shop, profile: shop };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const fd = await request.formData();
  await ensureShop(session.shop);

  const payload = {
    contactEmail: ((fd.get("contactEmail") as string) || "").trim() || null,
    storeUrl: ((fd.get("storeUrl") as string) || "").trim() || null,
    catalogType: ((fd.get("catalogType") as string) || "").trim() || null,
    skuVolume: ((fd.get("skuVolume") as string) || "").trim() || null,
    photoWorkflow: ((fd.get("photoWorkflow") as string) || "").trim() || null,
    biggestPain: ((fd.get("biggestPain") as string) || "").trim() || null,
    intendedUseCase: ((fd.get("intendedUseCase") as string) || "").trim() || null,
    launchStage: ((fd.get("launchStage") as string) || "").trim() || null,
    shootGoal: ((fd.get("shootGoal") as string) || "").trim() || null,
    heroProductFocus: ((fd.get("heroProductFocus") as string) || "").trim() || null,
    stylingSupport: ((fd.get("stylingSupport") as string) || "").trim() || null,
    graphicSensitivity: ((fd.get("graphicSensitivity") as string) || "").trim() || null,
    outputChannels: fd.getAll("outputChannels").map(String).filter(Boolean),
    intakeNotes: ((fd.get("intakeNotes") as string) || "").trim() || null,
    betaIntakeCompleted: true,
  };

  await prisma.shop.update({
    where: { id: session.shop },
    data: payload,
  });

  const nextPath = fd.get("nextPath") === "/app/dress-model" ? "/app/dress-model" : "/app/onboarding";
  return shopifyRedirect(request, nextPath);
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

function CheckboxGroup({
  name,
  label,
  options,
  defaultValue,
}: {
  name: string;
  label: string;
  options: readonly string[];
  defaultValue?: string[] | null;
}) {
  const selected = new Set(defaultValue ?? []);
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium text-krea-text">{label}</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {options.map((option) => (
          <label
            key={option}
            className="flex min-h-10 items-center gap-2 rounded-md border border-krea-border bg-white px-3 py-2 text-sm text-krea-text"
          >
            <input
              type="checkbox"
              name={name}
              value={option}
              defaultChecked={selected.has(option)}
              className="h-4 w-4 rounded border-krea-border text-krea-accent focus:ring-krea-accent/40"
            />
            <span>{option}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export default function BetaIntake() {
  const { shop, profile } = useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const isCompleted = profile.betaIntakeCompleted;
  const isSaving =
    navigation.state !== "idle" &&
    navigation.formMethod?.toLowerCase() === "post";
  const submitLabel = isCompleted ? "Save profile" : "Continue to brand setup";
  const savingLabel = isCompleted
    ? "Saving profile..."
    : "Saving and opening brand setup...";

  useEffect(() => {
    posthog.capture("shop_intake_viewed", { shop });
  }, [shop]);

  return (
    <div className="min-h-screen bg-krea-bg p-6 pt-10">
      <div className="mx-auto max-w-2xl rounded-2xl border border-krea-border bg-white p-6 shadow-sm">
        {!isCompleted && (
          <div className="rounded-lg border border-krea-accent/25 bg-krea-accent/5 px-3 py-2 text-xs text-krea-text">
            Step 1 of 2: Help us understand your catalog and workflow.
          </div>
        )}

        <h1 className="mt-4 text-2xl font-semibold text-krea-text">
          {isCompleted ? "Store profile" : "Tell us about your store"}
        </h1>
        <p className="mt-2 text-sm text-krea-muted">
          This should take about two minutes and helps TinyLemon tune the setup to your catalog.
        </p>

        <Form
          method="post"
          className="mt-6 grid gap-4"
          onSubmit={() =>
            posthog.capture("shop_intake_completed", {
              shop,
            })
          }
        >
          <input
            type="hidden"
            name="nextPath"
            value={isCompleted ? "/app/dress-model" : "/app/onboarding"}
          />

          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-krea-text">Best contact email</span>
            <input
              name="contactEmail"
              type="email"
              defaultValue={profile.contactEmail ?? ""}
              placeholder="you@brand.com"
              className="h-10 w-full rounded-md border border-krea-border px-3 text-sm text-krea-text"
            />
          </label>

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
            name="launchStage"
            label="Where is your store right now?"
            options={BETA_LAUNCH_STAGES}
            defaultValue={profile.launchStage}
          />
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
          <SelectField
            name="shootGoal"
            label="What are you trying to create?"
            options={BETA_SHOOT_GOALS}
            defaultValue={profile.shootGoal}
          />
          <SelectField
            name="heroProductFocus"
            label="How exact should the uploaded product stay?"
            options={BETA_HERO_PRODUCT_FOCUS}
            defaultValue={profile.heroProductFocus}
          />
          <SelectField
            name="stylingSupport"
            label="Should TinyLemon style the rest of the outfit?"
            options={BETA_STYLING_SUPPORT}
            defaultValue={profile.stylingSupport}
          />
          <SelectField
            name="graphicSensitivity"
            label="Do your products have logos, text, graphics, or prints?"
            options={BETA_GRAPHIC_SENSITIVITY}
            defaultValue={profile.graphicSensitivity}
          />
          <CheckboxGroup
            name="outputChannels"
            label="What outputs do you need?"
            options={BETA_OUTPUT_CHANNELS}
            defaultValue={profile.outputChannels}
          />

          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-krea-text">Anything else we should know?</span>
            <textarea
              name="intakeNotes"
              defaultValue={profile.intakeNotes ?? ""}
              rows={3}
              maxLength={500}
              placeholder="e.g. launching a new brand, need consistent models, want styled looks around one hero product"
              className="w-full rounded-md border border-krea-border px-3 py-2 text-sm text-krea-text"
            />
          </label>

          <button
            type="submit"
            disabled={isSaving}
            aria-busy={isSaving}
            className="mt-2 h-10 rounded-md bg-krea-accent text-sm font-medium text-white transition-all hover:opacity-90 active:scale-95 disabled:cursor-wait disabled:opacity-70 disabled:active:scale-100"
          >
            {isSaving ? savingLabel : submitLabel}
          </button>
          <div aria-live="polite" className="min-h-5 text-xs text-krea-muted">
            {isSaving ? "Your answers are being saved." : null}
          </div>
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
