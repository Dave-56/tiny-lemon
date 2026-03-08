import { useState, useEffect } from 'react';
import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from 'react-router';
import { useFetcher, useLoaderData, useRouteError } from 'react-router';
import { boundary } from '@shopify/shopify-app-react-router/server';
import { Check } from 'lucide-react';
import { authenticate } from '../shopify.server';
import prisma, { ensureShop } from '../db.server';
import { PDP_STYLE_PRESETS, ANGLE_PRESETS, STYLING_DIRECTION_PRESETS } from '../lib/pdpPresets';
import { getPlanForShop, PLAN_ANGLES } from '../lib/billing.server';

// ── Loader ────────────────────────────────────────────────────────────────────

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const [brandStyle, plan] = await Promise.all([
    prisma.brandStyle.findUnique({ where: { shopId: session.shop } }),
    getPlanForShop(session.shop),
  ]);
  return {
    styleIds: brandStyle?.styleIds ?? [PDP_STYLE_PRESETS[0].id],
    angleIds: brandStyle?.angleIds ?? ANGLE_PRESETS.map((p) => p.id),
    stylingDirectionId: brandStyle?.stylingDirectionId ?? STYLING_DIRECTION_PRESETS[0].id,
    allowedAngleIds: PLAN_ANGLES[plan] ?? PLAN_ANGLES.free,
  };
};

// ── Action ────────────────────────────────────────────────────────────────────

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shopId = session.shop;
  const fd = await request.formData();

  const styleIds = fd.getAll('styleIds') as string[];
  const angleIds = fd.getAll('angleIds') as string[];
  const stylingDirectionId = fd.get('stylingDirectionId') as string;

  await ensureShop(shopId);
  await prisma.brandStyle.upsert({
    where: { shopId },
    update: { styleIds, angleIds, stylingDirectionId },
    create: { shopId, styleIds, angleIds, stylingDirectionId },
  });

  return { ok: true };
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function BrandStyle() {
  const { styleIds: savedStyleIds, angleIds: savedAngleIds, stylingDirectionId: savedStylingId, allowedAngleIds } =
    useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();

  const [selectedStyleIds, setSelectedStyleIds] = useState<string[]>(savedStyleIds);
  const [selectedAngleIds, setSelectedAngleIds] = useState<string[]>(savedAngleIds);
  const [stylingDirectionId, setStylingDirectionId] = useState<string>(savedStylingId);
  const [saveFeedback, setSaveFeedback] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Show "Saved" briefly after successful action, or an error if it failed
  useEffect(() => {
    if (fetcher.state !== 'idle') return;
    if ((fetcher.data as { ok?: boolean } | undefined)?.ok) {
      setSaveFeedback(true);
      const t = window.setTimeout(() => setSaveFeedback(false), 2000);
      return () => clearTimeout(t);
    }
    if (fetcher.data && !(fetcher.data as { ok?: boolean }).ok) {
      setSaveError('Failed to save. Please try again.');
    }
  }, [fetcher.state, fetcher.data]);

  const toggleStyleId = (id: string) => {
    setSelectedStyleIds([id]);
  };

  const toggleAngleId = (id: string) => {
    setSelectedAngleIds((prev) => {
      const next = prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id];
      return next.length > 0 ? next : prev;
    });
  };

  function handleSave() {
    const fd = new FormData();
    selectedStyleIds.forEach((id) => fd.append('styleIds', id));
    selectedAngleIds.forEach((id) => fd.append('angleIds', id));
    fd.set('stylingDirectionId', stylingDirectionId);
    fetcher.submit(fd, { method: 'post' });
  }

  const allowedAnglePresets = ANGLE_PRESETS.filter(p => allowedAngleIds.includes(p.id));
  const selectedDirection = STYLING_DIRECTION_PRESETS.find((p) => p.id === stylingDirectionId);
  const isSaving = fetcher.state !== 'idle';

  return (
    <div className="min-h-screen bg-krea-bg p-6">
      <div className="max-w-sm space-y-8">

        {/* Background */}
        <section className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-krea-muted">Background</p>
          <div className="flex gap-2">
            {PDP_STYLE_PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => toggleStyleId(p.id)}
                className={`flex-1 h-8 rounded-md border text-xs font-medium transition-colors ${
                  selectedStyleIds.includes(p.id)
                    ? 'border-krea-accent bg-krea-accent text-white'
                    : 'border-krea-border bg-white text-krea-muted hover:border-krea-muted hover:text-krea-text'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          {PDP_STYLE_PRESETS.filter((p) => selectedStyleIds.includes(p.id)).map((p) =>
            p.description ? (
              <p key={p.id} className="text-xs text-krea-muted leading-relaxed">{p.description}</p>
            ) : null,
          )}
        </section>

        {/* Poses — only shown to paid plans with multiple options to configure */}
        {allowedAnglePresets.length > 1 && (
          <section className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-krea-muted">Poses</p>
            <p className="text-xs text-krea-muted">Views generated per outfit.</p>
            <div className="flex gap-2">
              {allowedAnglePresets.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => toggleAngleId(p.id)}
                  className={`flex-1 h-8 rounded-md border text-xs font-medium transition-colors ${
                    selectedAngleIds.includes(p.id)
                      ? 'border-krea-accent bg-krea-accent text-white'
                      : 'border-krea-border bg-white text-krea-muted hover:border-krea-muted hover:text-krea-text'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </section>
        )}

        {/* Styling Direction */}
        <section className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-krea-muted">Styling Direction</p>
          <p className="text-xs text-krea-muted">The energy your model projects. Set once for your brand.</p>
          <select
            value={stylingDirectionId}
            onChange={(e) => setStylingDirectionId(e.target.value)}
            className="w-full h-9 rounded-md border border-krea-border bg-white px-3 text-sm text-krea-text focus:outline-none focus:border-krea-accent/40 transition-colors appearance-none"
          >
            {STYLING_DIRECTION_PRESETS.map((p) => (
              <option key={p.id} value={p.id}>{p.label}</option>
            ))}
          </select>
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
