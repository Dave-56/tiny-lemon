import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from 'react-router';
import { Form, useLoaderData, useRouteError } from 'react-router';
import { boundary } from '@shopify/shopify-app-react-router/server';
import posthog from 'posthog-js';
import { authenticate } from '../shopify.server';
import prisma, { ensureShop } from '../db.server';
import { BRAND_STYLE_PRESETS } from '../lib/pdpPresets';
import { getEffectiveEntitlements } from '../lib/billing.server';
import type { BrandEnergy, PrimaryCategory } from '../lib/brandProfileMapping';
import { shopifyRedirect } from '../shopify-params';

// ── Loader ────────────────────────────────────────────────────────────────────

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const [shop, brandStyle] = await Promise.all([
    prisma.shop.findUnique({
      where: { id: session.shop },
      select: {
        betaAccess: true,
        betaStatus: true,
        catalogType: true,
        intendedUseCase: true,
        shootGoal: true,
      },
    }),
    prisma.brandStyle.findUnique({
      where: { shopId: session.shop },
      select: { onboardingCompleted: true },
    }),
  ]);
  if (brandStyle?.onboardingCompleted) {
    return shopifyRedirect(request, '/app/dress-model');
  }
  return {
    ready: true,
    isBeta:
      shop?.betaAccess === true &&
      shop.betaStatus !== 'paused' &&
      shop.betaStatus !== 'ended',
    profile: {
      catalogType: shop?.catalogType ?? null,
      intendedUseCase: shop?.intendedUseCase ?? null,
      shootGoal: shop?.shootGoal ?? null,
    },
  };
};

// ── Action ────────────────────────────────────────────────────────────────────

function normalizePrimaryCategory(value: string | null | undefined): PrimaryCategory | null {
  const normalized = value === 'jewelry' || value === 'beauty' ? 'other' : value;
  const allowed: PrimaryCategory[] = [
    'womenswear',
    'menswear',
    'unisex',
    'activewear',
    'streetwear',
    'formalwear',
    'other',
  ];
  return allowed.includes(normalized as PrimaryCategory) ? (normalized as PrimaryCategory) : null;
}

function getBrandEnergyFromStyle(styleId: string): BrandEnergy | null {
  const ids: BrandEnergy[] = ['minimal', 'accessible', 'editorial', 'premium', 'street', 'athletic'];
  return ids.includes(styleId as BrandEnergy) ? (styleId as BrandEnergy) : null;
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shopId = session.shop;
  const fd = await request.formData();
  const brandStyleId = String(fd.get('brandStyleId') ?? '');

  const selectedPreset = BRAND_STYLE_PRESETS.find((preset) => preset.id === brandStyleId);
  if (!selectedPreset) {
    throw new Response('Choose a default shoot style', { status: 400 });
  }

  await ensureShop(shopId);
  const [entitlements, shop] = await Promise.all([
    getEffectiveEntitlements(shopId),
    prisma.shop.findUnique({
      where: { id: shopId },
      select: { catalogType: true },
    }),
  ]);

  const brandEnergy = getBrandEnergyFromStyle(brandStyleId);
  const primaryCategory = normalizePrimaryCategory(shop?.catalogType);
  const pricePoint = brandStyleId === 'premium' ? 'premium' : null;

  await prisma.brandStyle.upsert({
    where: { shopId },
    update: {
      brandEnergy,
      primaryCategory,
      pricePoint,
      brandStyleId,
      onboardingCompleted: true,
    },
    create: {
      shopId,
      angleIds: [...entitlements.effectiveAngles],
      brandStyleId,
      brandEnergy,
      primaryCategory,
      pricePoint,
      onboardingCompleted: true,
    },
  });

  await prisma.shop.update({
    where: { id: shopId },
    data: {
      betaOnboardingCompleted: true,
    },
  }).catch(() => null);

  return shopifyRedirect(request, '/app/dress-model');
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function Onboarding() {
  const { isBeta, profile } = useLoaderData<typeof loader>();

  return (
    <div className="min-h-screen bg-krea-bg p-6 pt-10">
      <div className="mx-auto max-w-3xl space-y-6">
        {isBeta && (
          <div className="rounded-lg border border-krea-accent/25 bg-krea-accent/5 px-3 py-2 text-xs text-krea-text">
            Step 2 of 2: Choose the default shoot style for your model photos.
          </div>
        )}

        <div>
          <h1 className="text-2xl font-semibold text-krea-text">Choose your default shoot style</h1>
          <p className="mt-2 text-sm text-krea-muted">
            This sets the starting look for generated photos. You can change it later from Brand style.
          </p>
        </div>

        {(profile.shootGoal || profile.intendedUseCase || profile.catalogType) && (
          <div className="flex flex-wrap gap-2 text-xs text-krea-muted">
            {profile.shootGoal && (
              <span className="rounded-full border border-krea-border bg-white px-2 py-1">
                {profile.shootGoal}
              </span>
            )}
            {profile.intendedUseCase && (
              <span className="rounded-full border border-krea-border bg-white px-2 py-1">
                {profile.intendedUseCase}
              </span>
            )}
            {profile.catalogType && (
              <span className="rounded-full border border-krea-border bg-white px-2 py-1">
                {profile.catalogType}
              </span>
            )}
          </div>
        )}

        <Form
          method="post"
          className="space-y-5"
          onSubmit={() => {
            if (isBeta) posthog.capture('brand_setup_completed', { beta_access: true });
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {BRAND_STYLE_PRESETS.map((preset, index) => (
              <label
                key={preset.id}
                className="group flex cursor-pointer flex-col rounded-lg border-2 border-krea-border bg-white transition-colors has-[:checked]:border-krea-accent has-[:checked]:bg-krea-accent/5 hover:border-krea-muted"
              >
                <input
                  type="radio"
                  name="brandStyleId"
                  value={preset.id}
                  defaultChecked={index === 0}
                  className="sr-only"
                  required
                />
                <div className="aspect-[3/4] w-full overflow-hidden rounded-t-md bg-krea-bg">
                  <img src={preset.imageUrl} alt={preset.label} className="h-full w-full object-cover" />
                </div>
                <div className="space-y-1 px-3 py-2">
                  <span className="block text-sm font-medium text-krea-text group-has-[:checked]:text-krea-accent">
                    {preset.label}
                  </span>
                  <span className="block text-xs leading-snug text-krea-muted">{preset.description}</span>
                </div>
              </label>
            ))}
          </div>

          <button
            type="submit"
            className="h-10 w-full rounded-md bg-krea-accent text-sm font-medium text-white transition-all hover:opacity-90 active:scale-95 sm:w-auto sm:px-8"
          >
            Start generating
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
