import { useState, useEffect, useCallback } from 'react';
import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from 'react-router';
import { useFetcher, useLoaderData, useRouteError } from 'react-router';
import { boundary } from '@shopify/shopify-app-react-router/server';
import { Check } from 'lucide-react';
import { authenticate } from '../shopify.server';
import prisma, { ensureShop } from '../db.server';
import { ANGLE_PRESETS, STYLING_DIRECTION_PRESETS } from '../lib/pdpPresets';
import { getPlanForShop, PLAN_ANGLES } from '../lib/billing.server';
import { getRecommendedDirections } from '../lib/brandProfileMapping';
import posthog from 'posthog-js';

// ── Shared preset card ────────────────────────────────────────────────────────

type PresetItem = { id: string; label: string; imageUrl?: string };

function PresetCard({
  preset,
  selected,
  onSelect,
  recommended,
}: {
  preset: PresetItem;
  selected: boolean;
  onSelect: () => void;
  recommended?: boolean;
}) {
  const [imgError, setImgError] = useState(false);
  const showImage = preset.imageUrl && !imgError;

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onSelect();
      }
    },
    [onSelect],
  );

  return (
    <button
      type="button"
      onClick={onSelect}
      onKeyDown={handleKeyDown}
      className={`flex flex-col rounded-lg border-2 text-left transition-colors focus:outline-none focus:ring-2 focus:ring-krea-accent/50 focus:ring-offset-2 ${
        selected
          ? 'border-krea-accent bg-krea-accent/5'
          : 'border-krea-border bg-white hover:border-krea-muted hover:bg-gray-50/50'
      }`}
    >
      <div className="aspect-[3/4] w-full overflow-hidden rounded-t-md bg-krea-bg">
        {showImage ? (
          <img
            src={preset.imageUrl}
            alt={preset.label}
            className="h-full w-full object-cover"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs text-krea-muted">Preview</div>
        )}
      </div>
      <div className="flex items-center gap-1 px-2 py-1.5">
        <span className={`flex-1 text-xs font-medium ${selected ? 'text-krea-accent' : 'text-krea-text'}`}>
          {preset.label}
        </span>
        {recommended && (
          <span className="text-[9px] font-semibold uppercase tracking-wide text-krea-accent opacity-70">
            ✦
          </span>
        )}
      </div>
    </button>
  );
}

// ── Loader ────────────────────────────────────────────────────────────────────

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const [brandStyle, plan] = await Promise.all([
    prisma.brandStyle.findUnique({ where: { shopId: session.shop } }),
    getPlanForShop(session.shop),
  ]);
  return {
    shop: session.shop,
    angleIds: brandStyle?.angleIds ?? ANGLE_PRESETS.map((p) => p.id),
    stylingDirectionId: brandStyle?.stylingDirectionId ?? STYLING_DIRECTION_PRESETS[0].id,
    allowedAngleIds: PLAN_ANGLES[plan] ?? PLAN_ANGLES.free,
    brandEnergy: brandStyle?.brandEnergy ?? null,
    primaryCategory: brandStyle?.primaryCategory ?? null,
  };
};

// ── Action ────────────────────────────────────────────────────────────────────

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shopId = session.shop;
  const fd = await request.formData();

  const angleIds = fd.getAll('angleIds') as string[];
  const stylingDirectionId = fd.get('stylingDirectionId') as string;

  await ensureShop(shopId);
  await prisma.brandStyle.upsert({
    where: { shopId },
    update: { angleIds, stylingDirectionId },
    create: { shopId, angleIds, stylingDirectionId },
  });

  return { ok: true };
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function BrandStyle() {
  const { shop, angleIds: savedAngleIds, stylingDirectionId: savedStylingId, allowedAngleIds, brandEnergy, primaryCategory } =
    useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();

  const recommendedIds = getRecommendedDirections(brandEnergy, primaryCategory);
  const hasBrandProfile = Boolean(brandEnergy && primaryCategory);
  // Auto-expand if the saved direction is not in the recommended list
  const savedIsRecommended = recommendedIds.includes(savedStylingId as never);

  const [selectedAngleIds, setSelectedAngleIds] = useState<string[]>(savedAngleIds);
  const [stylingDirectionId, setStylingDirectionId] = useState<string>(savedStylingId);
  const [showAllDirections, setShowAllDirections] = useState(!hasBrandProfile || !savedIsRecommended);
  const [saveFeedback, setSaveFeedback] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Show "Saved" briefly after successful action, or an error if it failed
  useEffect(() => {
    if (fetcher.state !== 'idle') return;
    if ((fetcher.data as { ok?: boolean } | undefined)?.ok) {
      posthog.capture('brand_style_saved', { shop });
      setSaveFeedback(true);
      const t = window.setTimeout(() => setSaveFeedback(false), 2000);
      return () => clearTimeout(t);
    }
    if (fetcher.data && !(fetcher.data as { ok?: boolean }).ok) {
      setSaveError('Failed to save. Please try again.');
    }
  }, [fetcher.state, fetcher.data]);

  const toggleAngleId = (id: string) => {
    setSelectedAngleIds((prev) => {
      const next = prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id];
      return next.length > 0 ? next : prev;
    });
  };

  function handleSave() {
    const fd = new FormData();
    selectedAngleIds.forEach((id) => fd.append('angleIds', id));
    fd.set('stylingDirectionId', stylingDirectionId);
    fetcher.submit(fd, { method: 'post' });
  }

  const allowedAnglePresets = ANGLE_PRESETS.filter(p => allowedAngleIds.includes(p.id));
  const selectedDirection = STYLING_DIRECTION_PRESETS.find((p) => p.id === stylingDirectionId);
  const isSaving = fetcher.state !== 'idle';

  return (
    <div className="min-h-screen bg-krea-bg p-6">
      <div className="max-w-lg space-y-8">

        {/* Poses — only shown to paid plans with multiple options to configure */}
        {allowedAnglePresets.length > 1 && (
          <section className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-krea-muted">Poses</p>
            <p className="text-xs text-krea-muted">Views generated per outfit.</p>
            <div className="grid grid-cols-3 gap-3">
              {allowedAnglePresets.map((p) => (
                <PresetCard
                  key={p.id}
                  preset={p}
                  selected={selectedAngleIds.includes(p.id)}
                  onSelect={() => toggleAngleId(p.id)}
                />
              ))}
            </div>
          </section>
        )}

        {/* Styling Direction */}
        <section className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-krea-muted">Styling Direction</p>
          <p className="text-xs text-krea-muted">The aesthetic your model projects. Set once for your brand.</p>
          <div className="grid grid-cols-3 gap-3">
            {(showAllDirections ? STYLING_DIRECTION_PRESETS : STYLING_DIRECTION_PRESETS.filter((p) => recommendedIds.includes(p.id as never))).map((p) => (
              <PresetCard
                key={p.id}
                preset={p}
                selected={stylingDirectionId === p.id}
                onSelect={() => setStylingDirectionId(p.id)}
                recommended={hasBrandProfile && recommendedIds.includes(p.id as never)}
              />
            ))}
          </div>
          {hasBrandProfile && (
            <button
              type="button"
              onClick={() => setShowAllDirections((v) => !v)}
              className="text-xs text-krea-muted underline underline-offset-2 hover:text-krea-text transition-colors"
            >
              {showAllDirections ? 'Show recommended only' : 'See all styles'}
            </button>
          )}
          {selectedDirection?.description && (
            <p className="text-xs text-krea-muted leading-relaxed">{selectedDirection.description}</p>
          )}
        </section>

        {/* Save */}
        {saveError && <p className="text-xs text-red-500">{saveError}</p>}
        <button
          type="button"
          onClick={() => { setSaveError(null); handleSave(); }}
          disabled={isSaving}
          className="flex items-center gap-2 h-9 px-5 rounded-md bg-krea-accent text-white text-sm font-medium hover:opacity-90 active:scale-95 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {saveFeedback ? (
            <>
              <Check className="w-3.5 h-3.5" />
              Saved
            </>
          ) : isSaving ? (
            'Saving…'
          ) : (
            'Save brand style'
          )}
        </button>

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
