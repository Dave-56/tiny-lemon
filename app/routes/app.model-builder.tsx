import { useState, useEffect, useRef, useCallback } from 'react';
import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from 'react-router';
import { useFetcher, useLoaderData, useRouteError } from 'react-router';
import { boundary } from '@shopify/shopify-app-react-router/server';
import { ChevronDown, Loader2, X, ZoomIn } from 'lucide-react';
import { authenticate } from '../shopify.server';
import prisma from '../db.server';
import { generateModelImage } from '../gemini.server';
import { uploadImageToBlob } from '../blob.server';
import { PDP_STYLE_PRESETS, ANGLE_PRESETS } from '../lib/pdpPresets';
import { OPTIONS, SKIN_TONE_COLORS, ETHNICITY_PRESETS } from '../lib/modelOptions';
import type { ModelAttributes } from '../lib/types';

// Extend Vercel function timeout — generation + crop + upload can take up to ~45s
export const config = { maxDuration: 60 };

// ── Loader ────────────────────────────────────────────────────────────────────

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const models = await prisma.model.findMany({
    where: { shopId: session.shop, isPreset: false },
    orderBy: { createdAt: 'desc' },
    select: { id: true, name: true, gender: true, ethnicity: true, imageUrl: true },
  });
  return { models };
};

// ── Action ────────────────────────────────────────────────────────────────────

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shopId = session.shop;
  const fd = await request.formData();
  const intent = fd.get('intent') as string;

  // ── Delete ──
  if (intent === 'delete') {
    await prisma.model.delete({ where: { id: fd.get('modelId') as string, shopId } });
    return { ok: true };
  }

  // ── Generate ──
  const attrs: ModelAttributes = {
    name: ((fd.get('name') as string) ?? '').trim(),
    gender: fd.get('gender') as string,
    ethnicity: fd.get('ethnicity') as string,
    skinTone: fd.get('skinTone') as string,
    bodyBuild: fd.get('bodyBuild') as string,
    height: fd.get('height') as string,
    hairStyle: fd.get('hairStyle') as string,
    hairColor: fd.get('hairColor') as string,
    ageRange: fd.get('ageRange') as string,
  };

  const errors: string[] = [];
  if (!attrs.name) {
    errors.push('Model name is required');
  } else {
    const dup = await prisma.model.findFirst({
      where: { shopId, name: { equals: attrs.name, mode: 'insensitive' } },
    });
    if (dup) errors.push('A model with that name already exists');
  }
  if (errors.length) return { errors };

  // Ensure shop record exists before creating child records
  await prisma.shop.upsert({ where: { id: shopId }, update: {}, create: { id: shopId } });

  // Generate image (white-studio front — single image for this step)
  let base64: string;
  try {
    base64 = await generateModelImage(
      attrs,
      PDP_STYLE_PRESETS[0].promptSnippet,
      ANGLE_PRESETS[0].promptSnippet,
    );
  } catch (e) {
    return { errors: [(e as Error).message ?? 'Failed to generate model. Please try again.'] };
  }

  // Crop to 2:3 on the server (dynamic import keeps sharp out of the client bundle)
  const sharp = (await import('sharp')).default;
  const cropped = await sharp(Buffer.from(base64, 'base64'))
    .resize({ width: 800, height: 1200, fit: 'cover', position: 'top' })
    .png()
    .toBuffer();

  // Upload to Vercel Blob
  const imageUrl = await uploadImageToBlob(
    cropped,
    `models/${shopId}/${crypto.randomUUID()}.png`,
  );

  // Save to DB
  const model = await prisma.model.create({
    data: {
      shopId,
      name: attrs.name,
      gender: attrs.gender,
      ethnicity: attrs.ethnicity,
      skinTone: attrs.skinTone,
      bodyBuild: attrs.bodyBuild,
      height: attrs.height,
      hairStyle: attrs.hairStyle,
      hairColor: attrs.hairColor,
      ageRange: attrs.ageRange,
      imageUrl,
      styleId: 'white-studio',
      angleId: 'front',
    },
  });

  return { model };
};

// ── Types ─────────────────────────────────────────────────────────────────────

type LoaderModel = Awaited<ReturnType<typeof loader>>['models'][number];

// ── ModelLightbox ─────────────────────────────────────────────────────────────

function ModelLightbox({ model, onClose }: { model: LoaderModel; onClose: () => void }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex flex-col" onClick={onClose}>
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 shrink-0" onClick={(e) => e.stopPropagation()}>
        <div>
          <p className="text-sm font-medium text-white">{model.name}</p>
          <p className="text-xs text-white/50 mt-0.5">
            {model.gender} · {model.ethnicity}
          </p>
        </div>
        <button type="button" onClick={onClose} className="p-2 rounded-full hover:bg-white/10 transition-colors">
          <X className="w-5 h-5 text-white" />
        </button>
      </div>

      {/* Image */}
      <div className="flex-1 flex items-center justify-center p-6 min-h-0" onClick={(e) => e.stopPropagation()}>
        <img
          src={model.imageUrl}
          alt={model.name}
          className="max-h-full max-w-full object-contain rounded-xl"
          style={{ maxHeight: 'calc(100vh - 120px)' }}
        />
      </div>
    </div>
  );
}

// ── CustomModelCard ───────────────────────────────────────────────────────────

function CustomModelCard({ model, onZoom }: { model: LoaderModel; onZoom: () => void }) {
  const fetcher = useFetcher();
  const isDeleting = fetcher.state !== 'idle';

  return (
    <div className={`relative rounded-xl overflow-hidden border-2 border-transparent hover:border-krea-border transition-all ${isDeleting ? 'opacity-40 pointer-events-none' : ''}`}>
      <div className="group relative cursor-pointer" onClick={onZoom}>
        <img src={model.imageUrl} alt={model.name} className="w-full aspect-[2/3] object-cover" />
        <div className="absolute inset-0 bg-black/25 flex items-center justify-center transition-opacity opacity-0 group-hover:opacity-100 pointer-events-none">
          <div className="p-2 rounded-full bg-white/90">
            <ZoomIn className="w-4 h-4 text-krea-text" />
          </div>
        </div>
      </div>
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent px-2 py-2 pointer-events-none">
        <p className="text-xs text-white font-medium truncate">{model.name}</p>
        <p className="text-[10px] text-white/70 truncate">
          {model.gender[0]} · {model.ethnicity.split(' /')[0]}
        </p>
      </div>
      <fetcher.Form method="post" className="absolute top-2 right-2">
        <input type="hidden" name="intent" value="delete" />
        <input type="hidden" name="modelId" value={model.id} />
        <button
          type="submit"
          title="Delete model"
          className="w-6 h-6 rounded-full bg-black/60 flex items-center justify-center hover:bg-red-500/80 transition-colors"
          onClick={(e) => e.stopPropagation()}
        >
          <X className="w-3 h-3 text-white" />
        </button>
      </fetcher.Form>
    </div>
  );
}

// ── ModelBuilder ──────────────────────────────────────────────────────────────

const INITIAL_GENDER = 'Female';
const INITIAL_ETHNICITY = OPTIONS.ethnicities[0];
const INITIAL_PRESET = ETHNICITY_PRESETS[INITIAL_ETHNICITY]?.[INITIAL_GENDER] ?? {};

const SELECT_CLASS =
  'w-full h-9 rounded-md border border-krea-border bg-white px-3 text-sm text-krea-text focus:outline-none focus:border-krea-accent/40 transition-colors appearance-none disabled:opacity-50 disabled:cursor-not-allowed';

export default function ModelBuilder() {
  const { models } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();

  // Form state — initialised from the first ethnicity preset so fields are never blank
  const [name, setName] = useState('');
  const [gender, setGender] = useState(INITIAL_GENDER);
  const [ageRange, setAgeRange] = useState('25–34');
  const [ethnicity, setEthnicity] = useState(INITIAL_ETHNICITY);
  const [skinTone, setSkinTone] = useState(INITIAL_PRESET.skinTone ?? OPTIONS.skinTones[0]);
  const [bodyBuild, setBodyBuild] = useState(INITIAL_PRESET.bodyBuild ?? OPTIONS.bodyBuilds[INITIAL_GENDER][0]);
  const [height, setHeight] = useState(INITIAL_PRESET.height ?? OPTIONS.heights[0]);
  const [hairStyle, setHairStyle] = useState(INITIAL_PRESET.hairStyle ?? OPTIONS.hairStyles[INITIAL_GENDER][0]);
  const [hairColor, setHairColor] = useState(INITIAL_PRESET.hairColor ?? OPTIONS.hairColors[0]);
  const [showAppearance, setShowAppearance] = useState(false);
  const [lightboxModel, setLightboxModel] = useState<LoaderModel | null>(null);
  const closeLightbox = useCallback(() => setLightboxModel(null), []);

  const isGenerating = fetcher.state !== 'idle';
  const actionData = fetcher.data as { errors?: string[]; model?: unknown } | undefined;
  const errors = actionData?.errors;

  // Reset name after successful generate (loader revalidates automatically)
  const prevState = useRef(fetcher.state);
  useEffect(() => {
    if (prevState.current !== 'idle' && fetcher.state === 'idle' && actionData?.model) {
      setName('');
    }
    prevState.current = fetcher.state;
  }, [fetcher.state, actionData]);

  function applyPreset(eth: string, gen: string) {
    const preset = ETHNICITY_PRESETS[eth]?.[gen];
    if (!preset) return;
    if (preset.skinTone) setSkinTone(preset.skinTone);
    if (preset.bodyBuild) setBodyBuild(preset.bodyBuild);
    if (preset.height) setHeight(preset.height);
    if (preset.hairStyle) setHairStyle(preset.hairStyle);
    if (preset.hairColor) setHairColor(preset.hairColor);
  }

  function handleGenderChange(g: string) {
    setGender(g);
    // Reset gender-dependent dropdowns to first valid option before applying preset
    setBodyBuild((OPTIONS.bodyBuilds[g] ?? OPTIONS.bodyBuilds['Non-binary'])[0]);
    setHairStyle((OPTIONS.hairStyles[g] ?? OPTIONS.hairStyles['Non-binary'])[0]);
    applyPreset(ethnicity, g);
  }

  function handleEthnicityChange(e: string) {
    setEthnicity(e);
    applyPreset(e, gender);
  }

  function handleGenerate() {
    const fd = new FormData();
    fd.set('intent', 'generate');
    fd.set('name', name);
    fd.set('gender', gender);
    fd.set('ageRange', ageRange);
    fd.set('ethnicity', ethnicity);
    fd.set('skinTone', skinTone);
    fd.set('bodyBuild', bodyBuild);
    fd.set('height', height);
    fd.set('hairStyle', hairStyle);
    fd.set('hairColor', hairColor);
    fetcher.submit(fd, { method: 'post' });
  }

  return (
    <div className="min-h-screen bg-krea-bg flex">

      {/* ── Left: Form ── */}
      <div className="w-80 flex-shrink-0 border-r border-krea-border flex flex-col">
        <div className="flex-1 overflow-y-auto p-6 space-y-5">

          <p className="text-[11px] font-semibold uppercase tracking-widest text-krea-muted">Identity</p>

          {/* Name */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-sm text-krea-muted">Model name</label>
              <span className="text-[10px] font-bold uppercase tracking-widest text-red-400">Required</span>
            </div>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Zara"
              disabled={isGenerating}
              className={`w-full h-9 rounded-md border px-3 text-sm text-krea-text bg-white focus:outline-none transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                errors?.some((e) => e.toLowerCase().includes('name'))
                  ? 'border-red-400 focus:border-red-400'
                  : 'border-krea-border focus:border-krea-accent/40'
              }`}
            />
          </div>

          {/* Gender + Age range */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm text-krea-muted">Gender</label>
              <select
                value={gender}
                onChange={(e) => handleGenderChange(e.target.value)}
                disabled={isGenerating}
                className={SELECT_CLASS}
              >
                <option>Female</option>
                <option>Male</option>
                <option>Non-binary</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm text-krea-muted">Age range</label>
              <select
                value={ageRange}
                onChange={(e) => setAgeRange(e.target.value)}
                disabled={isGenerating}
                className={SELECT_CLASS}
              >
                {OPTIONS.ageRanges.map((r) => <option key={r}>{r}</option>)}
              </select>
            </div>
          </div>

          {/* Ethnicity */}
          <div className="space-y-1.5">
            <label className="text-sm text-krea-muted">Ethnicity</label>
            <select
              value={ethnicity}
              onChange={(e) => handleEthnicityChange(e.target.value)}
              disabled={isGenerating}
              className={SELECT_CLASS}
            >
              {OPTIONS.ethnicities.map((e) => <option key={e}>{e}</option>)}
            </select>
          </div>

          {/* Customize appearance toggle */}
          <button
            type="button"
            onClick={() => setShowAppearance((v) => !v)}
            disabled={isGenerating}
            className="flex items-center justify-between w-full px-3 py-2 rounded-md border border-krea-border bg-white hover:bg-krea-bg text-sm text-krea-text transition-colors disabled:opacity-50"
          >
            <span>Customize appearance</span>
            <ChevronDown className={`w-4 h-4 text-krea-muted transition-transform duration-200 ${showAppearance ? 'rotate-180' : ''}`} />
          </button>

          {showAppearance && (
            <div className="space-y-5">

              {/* Skin tone swatches */}
              <div className="space-y-2">
                <label className="text-sm text-krea-muted">Skin tone</label>
                <div className="flex gap-2 flex-wrap">
                  {OPTIONS.skinTones.map((tone) => (
                    <button
                      key={tone}
                      type="button"
                      title={tone}
                      onClick={() => setSkinTone(tone)}
                      disabled={isGenerating}
                      style={{ backgroundColor: SKIN_TONE_COLORS[tone] }}
                      className={`w-8 h-8 rounded-full border-2 transition-all disabled:cursor-not-allowed ${
                        skinTone === tone
                          ? 'border-krea-accent scale-110 shadow-md'
                          : 'border-transparent hover:border-krea-border'
                      }`}
                    />
                  ))}
                </div>
                <p className="text-xs text-krea-muted">{skinTone}</p>
              </div>

              {/* Body build */}
              <div className="space-y-1.5">
                <label className="text-sm text-krea-muted">Body build</label>
                <select
                  value={bodyBuild}
                  onChange={(e) => setBodyBuild(e.target.value)}
                  disabled={isGenerating}
                  className={SELECT_CLASS}
                >
                  {(OPTIONS.bodyBuilds[gender] ?? OPTIONS.bodyBuilds['Non-binary']).map((b) => (
                    <option key={b}>{b}</option>
                  ))}
                </select>
              </div>

              {/* Height */}
              <div className="space-y-1.5">
                <label className="text-sm text-krea-muted">Height</label>
                <select
                  value={height}
                  onChange={(e) => setHeight(e.target.value)}
                  disabled={isGenerating}
                  className={SELECT_CLASS}
                >
                  {OPTIONS.heights.map((h) => <option key={h}>{h}</option>)}
                </select>
              </div>

              {/* Hair style + color */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-sm text-krea-muted">Hair style</label>
                  <select
                    value={hairStyle}
                    onChange={(e) => setHairStyle(e.target.value)}
                    disabled={isGenerating}
                    className={SELECT_CLASS}
                  >
                    {(OPTIONS.hairStyles[gender] ?? OPTIONS.hairStyles['Non-binary']).map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm text-krea-muted">Hair color</label>
                  <select
                    value={hairColor}
                    onChange={(e) => setHairColor(e.target.value)}
                    disabled={isGenerating}
                    className={SELECT_CLASS}
                  >
                    {OPTIONS.hairColors.map((c) => <option key={c}>{c}</option>)}
                  </select>
                </div>
              </div>

            </div>
          )}

          {/* Generate button — sits right below the form */}
          <div className="pt-2 space-y-3">
            {errors && errors.length > 0 && (
              <div className="rounded-md bg-red-50 border border-red-200 p-3 space-y-1">
                {errors.map((e, i) => (
                  <p key={i} className="text-xs text-red-600">{e}</p>
                ))}
              </div>
            )}
            <button
              type="button"
              onClick={handleGenerate}
              disabled={isGenerating}
              className="w-full h-10 rounded-md bg-krea-accent text-white text-sm font-medium flex items-center justify-center gap-2 hover:opacity-90 active:scale-95 transition-all disabled:opacity-60 disabled:cursor-not-allowed disabled:active:scale-100"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Generating… (~30s)
                </>
              ) : (
                'Generate model'
              )}
            </button>
          </div>
        </div>
      </div>

      {/* ── Right: Gallery ── */}
      <div className="flex-1 overflow-y-auto p-6 space-y-8">

        {/* Custom models */}
        <section className="space-y-3">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-krea-muted">Your models</p>
          {models.length === 0 ? (
            <p className="text-sm text-krea-muted">No custom models yet — generate one on the left.</p>
          ) : (
            <div className="grid grid-cols-4 xl:grid-cols-5 gap-3">
              {models.map((model) => (
                <CustomModelCard key={model.id} model={model} onZoom={() => setLightboxModel(model)} />
              ))}
            </div>
          )}
        </section>

      </div>

      {lightboxModel && <ModelLightbox model={lightboxModel} onClose={closeLightbox} />}
    </div>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
