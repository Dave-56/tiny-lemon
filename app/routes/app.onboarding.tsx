import { useState } from 'react';
import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from 'react-router';
import { Form, useRouteError } from 'react-router';
import { boundary } from '@shopify/shopify-app-react-router/server';
import { authenticate } from '../shopify.server';
import prisma, { ensureShop } from '../db.server';
import { BRAND_STYLE_PRESETS } from '../lib/pdpPresets';
import {
  BRAND_ENERGIES,
  PRIMARY_CATEGORIES,
  PRICE_POINTS,
  getRecommendedDirections,
} from '../lib/brandProfileMapping';
import { shopifyRedirect } from '../shopify-params';

// ── Loader ────────────────────────────────────────────────────────────────────

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const brandStyle = await prisma.brandStyle.findUnique({
    where: { shopId: session.shop },
    select: { onboardingCompleted: true },
  });
  if (brandStyle?.onboardingCompleted) {
    return shopifyRedirect(request, '/app/dress-model');
  }
  return { ready: true };
};

// ── Action ────────────────────────────────────────────────────────────────────

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shopId = session.shop;
  const fd = await request.formData();
  const brandEnergy = fd.get('brandEnergy') as string;
  const primaryCategory = fd.get('primaryCategory') as string;
  const pricePoint = fd.get('pricePoint') as string;
  const brandStyleId = fd.get('brandStyleId') as string;

  await ensureShop(shopId);
  await prisma.brandStyle.upsert({
    where: { shopId },
    update: { brandEnergy, primaryCategory, pricePoint, brandStyleId, onboardingCompleted: true },
    create: {
      shopId,
      angleIds: ['front'],
      brandStyleId,
      brandEnergy,
      primaryCategory,
      pricePoint,
      onboardingCompleted: true,
    },
  });

  return shopifyRedirect(request, '/app/dress-model');
};

// ── Shared card ───────────────────────────────────────────────────────────────

function SelectCard({
  imageUrl,
  label,
  description,
  selected,
  onSelect,
}: {
  imageUrl?: string;
  label: string;
  description?: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex flex-col rounded-lg border-2 text-left transition-colors focus:outline-none focus:ring-2 focus:ring-krea-accent/50 focus:ring-offset-2 ${
        selected
          ? 'border-krea-accent bg-krea-accent/5'
          : 'border-krea-border bg-white hover:border-krea-muted hover:bg-gray-50/50'
      }`}
    >
      <div className="aspect-[3/4] w-full overflow-hidden rounded-t-md bg-krea-bg">
        {imageUrl ? (
          <img src={imageUrl} alt={label} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs text-krea-muted">
            Preview
          </div>
        )}
      </div>
      <div className="px-2 py-1.5">
        <span className={`block text-xs font-medium ${selected ? 'text-krea-accent' : 'text-krea-text'}`}>
          {label}
        </span>
        {description && (
          <span className="block text-[10px] text-krea-muted leading-snug mt-0.5">{description}</span>
        )}
      </div>
    </button>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function Onboarding() {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [brandEnergy, setBrandEnergy] = useState('');
  const [primaryCategory, setPrimaryCategory] = useState('');
  const [pricePoint, setPricePoint] = useState('');
  const [brandStyleId, setStylingDirectionId] = useState('');

  function goToStep4() {
    const recs = getRecommendedDirections(brandEnergy, primaryCategory);
    setStylingDirectionId(recs[0]);
    setStep(4);
  }

  const recommendedIds = step === 4 ? getRecommendedDirections(brandEnergy, primaryCategory) : [];
  const selectedPreset = BRAND_STYLE_PRESETS.find((p) => p.id === brandStyleId);

  return (
    <div className="min-h-screen bg-krea-bg p-6 pt-12">
      <div className="mx-auto max-w-md space-y-6">

        {/* Step indicator */}
        <div className="flex items-center gap-2">
          {[1, 2, 3, 4].map((s) => (
            <div
              key={s}
              className={`h-1 flex-1 rounded-full transition-colors ${s <= step ? 'bg-krea-accent' : 'bg-krea-border'}`}
            />
          ))}
        </div>

        {/* Step 1: Brand Energy */}
        {step === 1 && (
          <div className="space-y-4">
            <div>
              <h1 className="text-lg font-semibold text-krea-text">How should your brand feel?</h1>
              <p className="text-xs text-krea-muted mt-1">Pick the aesthetic that best fits your brand.</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {BRAND_ENERGIES.map((energy) => {
                const preset = BRAND_STYLE_PRESETS.find((p) => p.id === energy.id);
                return (
                  <SelectCard
                    key={energy.id}
                    imageUrl={preset?.imageUrl}
                    label={energy.label}
                    description={energy.description}
                    selected={brandEnergy === energy.id}
                    onSelect={() => setBrandEnergy(energy.id)}
                  />
                );
              })}
            </div>
            <button
              type="button"
              disabled={!brandEnergy}
              onClick={() => setStep(2)}
              className="w-full h-9 rounded-md bg-krea-accent text-white text-sm font-medium hover:opacity-90 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Continue
            </button>
          </div>
        )}

        {/* Step 2: Primary Category */}
        {step === 2 && (
          <div className="space-y-4">
            <div>
              <h1 className="text-lg font-semibold text-krea-text">What do you primarily sell?</h1>
              <p className="text-xs text-krea-muted mt-1">This helps us suggest the right styling for your products.</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {PRIMARY_CATEGORIES.map((cat) => {
                const selected = primaryCategory === cat.id;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setPrimaryCategory(cat.id)}
                    className={`h-10 rounded-lg border-2 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-krea-accent/50 focus:ring-offset-2 ${
                      selected
                        ? 'border-krea-accent bg-krea-accent/5 text-krea-accent'
                        : 'border-krea-border bg-white text-krea-text hover:border-krea-muted'
                    }`}
                  >
                    {cat.label}
                  </button>
                );
              })}
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="h-9 px-4 rounded-md border border-krea-border text-sm text-krea-muted hover:border-krea-muted transition-colors"
              >
                Back
              </button>
              <button
                type="button"
                disabled={!primaryCategory}
                onClick={() => setStep(3)}
                className="flex-1 h-9 rounded-md bg-krea-accent text-white text-sm font-medium hover:opacity-90 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Continue
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Price Point */}
        {step === 3 && (
          <div className="space-y-4">
            <div>
              <h1 className="text-lg font-semibold text-krea-text">What's your price point?</h1>
              <p className="text-xs text-krea-muted mt-1">This shapes the production quality of your model photos.</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {PRICE_POINTS.map((pp) => {
                const selected = pricePoint === pp.id;
                return (
                  <button
                    key={pp.id}
                    type="button"
                    onClick={() => setPricePoint(pp.id)}
                    className={`rounded-lg border-2 px-3 py-2.5 text-left transition-colors focus:outline-none focus:ring-2 focus:ring-krea-accent/50 focus:ring-offset-2 ${
                      selected
                        ? 'border-krea-accent bg-krea-accent/5'
                        : 'border-krea-border bg-white hover:border-krea-muted'
                    }`}
                  >
                    <span className={`block text-sm font-medium ${selected ? 'text-krea-accent' : 'text-krea-text'}`}>
                      {pp.label}
                    </span>
                    <span className="block text-[10px] text-krea-muted leading-snug mt-0.5">{pp.description}</span>
                  </button>
                );
              })}
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="h-9 px-4 rounded-md border border-krea-border text-sm text-krea-muted hover:border-krea-muted transition-colors"
              >
                Back
              </button>
              <button
                type="button"
                disabled={!pricePoint}
                onClick={goToStep4}
                className="flex-1 h-9 rounded-md bg-krea-accent text-white text-sm font-medium hover:opacity-90 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Continue
              </button>
            </div>
          </div>
        )}

        {/* Step 4: Confirm styling direction */}
        {step === 4 && (
          <div className="space-y-4">
            <div>
              <h1 className="text-lg font-semibold text-krea-text">Your recommended style</h1>
              <p className="text-xs text-krea-muted mt-1">
                Based on your brand. You can change this anytime in Brand Style.
              </p>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {recommendedIds.map((dirId) => {
                const preset = BRAND_STYLE_PRESETS.find((p) => p.id === dirId);
                if (!preset) return null;
                return (
                  <SelectCard
                    key={dirId}
                    imageUrl={preset.imageUrl}
                    label={preset.label}
                    selected={brandStyleId === dirId}
                    onSelect={() => setStylingDirectionId(dirId)}
                  />
                );
              })}
            </div>
            {selectedPreset?.description && (
              <p className="text-xs text-krea-muted leading-relaxed">{selectedPreset.description}</p>
            )}
            <Form method="post" className="space-y-3">
              <input type="hidden" name="brandEnergy" value={brandEnergy} />
              <input type="hidden" name="primaryCategory" value={primaryCategory} />
              <input type="hidden" name="pricePoint" value={pricePoint} />
              <input type="hidden" name="brandStyleId" value={brandStyleId} />
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setStep(3)}
                  className="h-9 px-4 rounded-md border border-krea-border text-sm text-krea-muted hover:border-krea-muted transition-colors"
                >
                  Back
                </button>
                <button
                  type="submit"
                  disabled={!brandStyleId}
                  className="flex-1 h-9 rounded-md bg-krea-accent text-white text-sm font-medium hover:opacity-90 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Start generating
                </button>
              </div>
            </Form>
          </div>
        )}

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
