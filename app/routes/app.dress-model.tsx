import { useState, useRef, useEffect, useCallback } from 'react';
import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from 'react-router';
import { useLoaderData, useRouteError, useRevalidator } from 'react-router';
import { boundary } from '@shopify/shopify-app-react-router/server';
import { X, Download, Loader2, Plus } from 'lucide-react';
import type { PresetModelEntry } from '../lib/types';
import { cleanFlatLay } from '../lib/flatLayCleanup';
import { extractGarmentSpec } from '../lib/garmentSpec';
import { PDP_STYLE_PRESETS, STYLING_DIRECTION_PRESETS } from '../lib/pdpPresets';
import { authenticate } from '../shopify.server';
import prisma, { ensureShop } from '../db.server';
import { uploadImageToBlob } from '../blob.server';
import { tasks } from '../trigger.server';
import {
  getPlanForShop,
  getMonthlyUsage,
  reserveGenerations,
  PLAN_LIMITS,
  PLAN_ANGLES,
} from '../lib/billing.server';

// Vercel function timeout — action runs cleanFlatLay + extractGarmentSpec (~15s per item)
export const config = { maxDuration: 60 };

// ── Loader ────────────────────────────────────────────────────────────────────

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  await ensureShop(shop);

  const [brandStyle, plan, used] = await Promise.all([
    prisma.brandStyle.findUnique({ where: { shopId: shop } }),
    getPlanForShop(shop),
    getMonthlyUsage(shop),
  ]);

  return {
    shop,
    styleIds: brandStyle?.styleIds ?? [PDP_STYLE_PRESETS[0].id],
    stylingDirectionId: brandStyle?.stylingDirectionId ?? STYLING_DIRECTION_PRESETS[0].id,
    plan,
    used,
    limit: PLAN_LIMITS[plan] ?? PLAN_LIMITS.free,
    angles: PLAN_ANGLES[plan] ?? PLAN_ANGLES.free,
  };
};

// ── Action ────────────────────────────────────────────────────────────────────

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shopId = session.shop;
  const body = (await request.json()) as Record<string, unknown>;
  const intent = body.intent as string;

  // ── trigger_generation ───────────────────────────────────────────────────────
  if (intent === 'trigger_generation') {
    const skuName = (body.skuName as string) || 'Untitled';
    const modelId = body.modelId as string;
    const modelImageUrl = body.modelImageUrl as string;
    const modelHeight = body.modelHeight as string | undefined;
    const styleId = (body.styleId as string) ?? 'white-studio';
    const stylingDirectionId = (body.stylingDirectionId as string) ?? 'minimal';
    const frontB64 = body.frontB64 as string;
    const frontMime = (body.frontMime as string) ?? 'image/png';
    const backB64 = body.backB64 as string | null;
    const backMime = body.backMime as string | null;

    // ── Billing gate — reserve 1 credit atomically before any work ──────────────
    try {
      await reserveGenerations(shopId, 1);
    } catch (e) {
      const msg = (e as Error).message;
      if (msg === 'insufficient_credits') {
        const [used, plan] = await Promise.all([
          getMonthlyUsage(shopId),
          getPlanForShop(shopId),
        ]);
        return Response.json(
          { error: 'limit_reached', used, limit: PLAN_LIMITS[plan] ?? PLAN_LIMITS.free, plan },
          { status: 402 },
        );
      }
      // Serialization conflict or unexpected DB error — ask client to retry
      return Response.json({ error: 'try_again' }, { status: 503 });
    }

    // Validate model image origin (prevent SSRF)
    try {
      const u = new URL(modelImageUrl);
      if (
        !u.hostname.endsWith('vercel-storage.com') &&
        !u.hostname.endsWith('.vercel.app') &&
        !u.hostname.endsWith('.blob.vercel-storage.com')
      ) {
        return Response.json({ error: 'Invalid model image URL' }, { status: 400 });
      }
    } catch {
      return Response.json({ error: 'Invalid model image URL' }, { status: 400 });
    }

    await ensureShop(shopId);

    const apiKey = process.env.GEMINI_API_KEY!;

    // Phase 1: Clean flat lay(s) server-side — no more client key exposure
    const cleanFlatLayB64 = await cleanFlatLay(frontB64, frontMime, apiKey);
    const cleanBackFlatLayB64 =
      backB64 && backMime
        ? await cleanFlatLay(backB64, backMime, apiKey).catch(() => null)
        : null;

    // Phase 2: Extract garment spec
    const garmentSpec = await extractGarmentSpec(cleanFlatLayB64, 'image/png', apiKey);

    // Phase 3: Create outfit record (empty URL placeholder to get the DB-assigned ID)
    const outfit = await prisma.outfit.create({
      data: {
        shopId,
        name: skuName,
        frontFlatLayUrl: '',
        modelId,
        garmentSpec: JSON.parse(JSON.stringify(garmentSpec)),
        status: 'pending',
      },
    });

    // Phase 4: Upload flat lay(s) to Blob (uses outfit.id in the path)
    const cleanFlatLayUrl = await uploadImageToBlob(
      Buffer.from(cleanFlatLayB64, 'base64'),
      `outfits/${shopId}/${outfit.id}/flat-lay.png`,
    );

    let cleanBackFlatLayUrl: string | undefined;
    if (cleanBackFlatLayB64) {
      cleanBackFlatLayUrl = await uploadImageToBlob(
        Buffer.from(cleanBackFlatLayB64, 'base64'),
        `outfits/${shopId}/${outfit.id}/flat-lay-back.png`,
      );
    }

    // Phase 5: Trigger background job
    const handle = await tasks.trigger('generate-outfit', {
      outfitId: outfit.id,
      shopId,
      modelImageUrl,
      modelHeight,
      styleId,
      stylingDirectionId,
    });

    // Phase 6: Back-fill URLs + jobId in one update
    await prisma.outfit.update({
      where: { id: outfit.id },
      data: {
        frontFlatLayUrl: cleanFlatLayUrl,
        cleanFlatLayUrl,
        cleanBackFlatLayUrl: cleanBackFlatLayUrl ?? null,
        jobId: handle.id,
      },
    });

    return Response.json({ outfitId: outfit.id, cleanFlatLayUrl });
  }

  // ── poll_status ──────────────────────────────────────────────────────────────
  if (intent === 'poll_status') {
    const outfitId = body.outfitId as string;
    const outfit = await prisma.outfit.findFirst({
      where: { id: outfitId, shopId },
      select: {
        status: true,
        images: { select: { id: true, pose: true, imageUrl: true } },
      },
    });
    if (!outfit) return Response.json({ error: 'Not found' }, { status: 404 });
    return Response.json({ status: outfit.status, images: outfit.images });
  }

  // ── delete_outfit ────────────────────────────────────────────────────────────
  if (intent === 'delete_outfit') {
    const outfitId = body.outfitId as string;
    const outfit = await prisma.outfit.findFirst({ where: { id: outfitId, shopId } });
    if (!outfit) return Response.json({ error: 'Not found' }, { status: 404 });
    await prisma.outfit.delete({ where: { id: outfitId } });
    return Response.json({ ok: true });
  }

  return Response.json({ error: 'Unknown intent' }, { status: 400 });
};

// ── Utilities ─────────────────────────────────────────────────────────────────

function readFileAsBase64(file: File): Promise<{ base64: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
      if (match) resolve({ base64: match[2], mimeType: match[1] });
      else reject(new Error('Failed to read file'));
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function nanoid() {
  return Math.random().toString(36).slice(2, 9);
}

// ── Types ─────────────────────────────────────────────────────────────────────

type ItemStatus =
  | 'pending'
  | 'processing'
  | 'generating_front'
  | 'generating_tq'
  | 'generating_back'
  | 'done'
  | 'error';

interface ResultShot {
  angleId: string;
  label: string;
  url: string;
}

interface BatchItem {
  id: string;
  frontFile: File;
  frontPreview: string;
  backFile: File | null;
  backPreview: string | null;
  skuName: string;
  status: ItemStatus;
  cleanPreview: string | null;
  results: ResultShot[];
  error: string | null;
  savedOutfitId: string | null;
}

const MAX_BATCH = 10;

const STATUS_LABEL: Record<ItemStatus, string> = {
  pending: 'Pending',
  processing: 'Starting…',
  generating_front: '1/3',
  generating_tq: '2/3',
  generating_back: '3/3',
  done: 'Done',
  error: 'Error',
};

const POSE_LABEL: Record<string, string> = {
  front: 'Front',
  'three-quarter': 'Three-quarter',
  back: 'Back',
};

const ACTIVE_STATUSES: ItemStatus[] = [
  'processing',
  'generating_front',
  'generating_tq',
  'generating_back',
];

// ── Component ─────────────────────────────────────────────────────────────────

export default function DressModel() {
  const { styleIds, stylingDirectionId } = useLoaderData<typeof loader>();
  const { revalidate } = useRevalidator();

  const [presetModels, setPresetModels] = useState<PresetModelEntry[]>([]);
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [previewModel, setPreviewModel] = useState<PresetModelEntry | null>(null);
  const [items, setItems] = useState<BatchItem[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const backInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  // Keep a ref to items so the polling interval reads fresh state without
  // being listed as a dependency (avoids clearing/recreating the interval on every state update).
  const itemsRef = useRef(items);
  useEffect(() => { itemsRef.current = items; }, [items]);

  useEffect(() => {
    fetch('/preset-models.json')
      .then(r => r.json())
      .then((data: PresetModelEntry[]) => {
        setPresetModels(data);
        if (data[0]) setSelectedModelId(data[0].id);
      })
      .catch(() => {});
  }, []);

  const addFiles = useCallback((files: FileList | File[]) => {
    const arr = Array.from(files).filter(f => f.type.startsWith('image/'));
    const slots = MAX_BATCH - items.length;
    const toAdd = arr.slice(0, slots);
    const newItems: BatchItem[] = toAdd.map(file => ({
      id: nanoid(),
      frontFile: file,
      frontPreview: URL.createObjectURL(file),
      backFile: null,
      backPreview: null,
      skuName: file.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' '),
      status: 'pending',
      cleanPreview: null,
      results: [],
      error: null,
      savedOutfitId: null,
    }));
    setItems(prev => [...prev, ...newItems]);
  }, [items.length]);

  const removeItem = (id: string) => setItems(prev => prev.filter(i => i.id !== id));
  const updateSkuName = (id: string, name: string) =>
    setItems(prev => prev.map(i => i.id === id ? { ...i, skuName: name } : i));
  const updateItem = (id: string, patch: Partial<BatchItem>) =>
    setItems(prev => prev.map(i => i.id === id ? { ...i, ...patch } : i));
  const addBackFile = (id: string, file: File) =>
    setItems(prev => prev.map(i =>
      i.id === id ? { ...i, backFile: file, backPreview: URL.createObjectURL(file) } : i,
    ));

  const onDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); };
  const onDragLeave = () => setIsDragging(false);
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
  };

  // ── Polling ──────────────────────────────────────────────────────────────────

  const isPolling = items.some(i => (ACTIVE_STATUSES as string[]).includes(i.status));

  useEffect(() => {
    if (!isPolling) return;

    const interval = setInterval(async () => {
      const active = itemsRef.current.filter(
        i => (ACTIVE_STATUSES as string[]).includes(i.status) && i.savedOutfitId,
      );
      if (!active.length) return;

      await Promise.all(
        active.map(async item => {
          try {
            const res = await fetch('/app/dress-model', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ intent: 'poll_status', outfitId: item.savedOutfitId }),
            });
            if (!res.ok) return;

            const { status, images } = (await res.json()) as {
              status: string;
              images: Array<{ id: string; pose: string; imageUrl: string }>;
            };

            const results: ResultShot[] = (images ?? []).map(img => ({
              angleId: img.pose,
              label: POSE_LABEL[img.pose] ?? img.pose,
              url: img.imageUrl,
            }));

            if (status === 'completed') {
              updateItem(item.id, { status: 'done', results, error: null });
              revalidate();
            } else if (status === 'failed') {
              updateItem(item.id, { status: 'error', error: 'Generation failed. Please try again.' });
            } else {
              const uiStatus: ItemStatus =
                status === 'generating_front' ? 'generating_front'
                : status === 'generating_tq' ? 'generating_tq'
                : status === 'generating_back' ? 'generating_back'
                : 'processing';
              updateItem(item.id, { status: uiStatus, results });
            }
          } catch {
            // Silent — will retry on next interval tick
          }
        }),
      );
    }, 3000);

    return () => clearInterval(interval);
  }, [isPolling]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Generate ─────────────────────────────────────────────────────────────────

  async function handleGenerate() {
    if (!selectedModelId || isRunning) return;
    const pending = items.filter(i => i.status === 'pending' || i.status === 'error');
    if (!pending.length) return;

    const selectedModel = presetModels.find(m => m.id === selectedModelId);
    if (!selectedModel) return;

    setIsRunning(true);

    // Fire all trigger_generation requests in parallel — each POSTs the raw flat lay,
    // runs cleanFlatLay + extractGarmentSpec server-side (~10–15s), then enqueues the job.
    await Promise.all(
      pending.map(async item => {
        updateItem(item.id, {
          status: 'processing',
          error: null,
          results: [],
          cleanPreview: null,
          savedOutfitId: null,
        });

        try {
          const { base64: frontB64, mimeType: frontMime } = await readFileAsBase64(item.frontFile);
          let backB64: string | null = null;
          let backMime: string | null = null;
          if (item.backFile) {
            const back = await readFileAsBase64(item.backFile);
            backB64 = back.base64;
            backMime = back.mimeType;
          }

          const res = await fetch('/app/dress-model', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              intent: 'trigger_generation',
              skuName: item.skuName,
              modelId: selectedModel.id,
              modelImageUrl: selectedModel.imageUrl,
              modelHeight: selectedModel.height,
              styleId: styleIds[0] ?? 'white-studio',
              stylingDirectionId,
              frontB64,
              frontMime,
              backB64,
              backMime,
            }),
          });

          if (!res.ok) {
            const json = await res.json().catch(() => ({ error: 'Request failed' })) as { error?: string };
            throw new Error(json.error ?? 'Failed to start generation');
          }

          const { outfitId, cleanFlatLayUrl } = (await res.json()) as {
            outfitId: string;
            cleanFlatLayUrl: string;
          };

          updateItem(item.id, {
            status: 'processing',
            savedOutfitId: outfitId,
            cleanPreview: cleanFlatLayUrl,
          });
        } catch (err) {
          updateItem(item.id, {
            status: 'error',
            error: (err as Error).message ?? 'Failed to start generation',
          });
        }
      }),
    );

    setIsRunning(false);
    // Polling interval picks up from here for items that are now 'processing'
  }

  // ── Delete saved outfit ───────────────────────────────────────────────────────

  const pendingCount = items.filter(i => i.status === 'pending' || i.status === 'error').length;
  const canGenerate = pendingCount > 0 && !!selectedModelId && !isRunning;
  const doneCount = items.filter(i => i.status === 'done').length;
  const activeStyle =
    STYLING_DIRECTION_PRESETS.find(p => p.id === stylingDirectionId) ??
    STYLING_DIRECTION_PRESETS[0];

  return (
    <div className="min-h-screen bg-krea-bg">

      {/* ── Flat lay upload ── */}
      <div className="px-6 pt-6 max-w-lg space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-krea-muted">Flat lays</p>
          <p className="text-xs text-krea-muted">{items.length}/{MAX_BATCH}</p>
        </div>

        {items.length < MAX_BATCH && (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            className={`w-full rounded-xl border-2 border-dashed py-8 flex flex-col items-center justify-center gap-2 transition-colors ${
              isDragging
                ? 'border-krea-accent bg-krea-accent/5'
                : 'border-krea-border bg-white hover:border-krea-accent/40'
            }`}
          >
            <Plus className="w-5 h-5 text-krea-muted" />
            <p className="text-sm text-krea-muted">Drop front flat lays or click to browse</p>
            <p className="text-xs text-krea-muted/60">Up to {MAX_BATCH - items.length} more</p>
          </button>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={e => { if (e.target.files) addFiles(e.target.files); e.target.value = ''; }}
        />

        {items.length > 0 && (
          <div className="space-y-2">
            {items.map(item => (
              <div
                key={item.id}
                className="flex items-center gap-3 bg-white rounded-xl px-3 py-2 border border-krea-border"
              >
                <div className="w-10 h-10 rounded-md overflow-hidden bg-krea-bg flex-shrink-0">
                  <img src={item.frontPreview} alt="" className="w-full h-full object-cover" />
                </div>

                <input
                  type="text"
                  value={item.skuName}
                  onChange={e => updateSkuName(item.id, e.target.value)}
                  placeholder="SKU name"
                  disabled={item.status !== 'pending' && item.status !== 'error'}
                  className="flex-1 text-sm bg-transparent focus:outline-none text-krea-text placeholder:text-krea-muted/50 disabled:opacity-60"
                />

                {(item.status === 'pending' || item.status === 'error') && (
                  item.backPreview ? (
                    <div className="relative group w-8 h-8 rounded-md overflow-hidden flex-shrink-0">
                      <img src={item.backPreview} alt="back" className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => setItems(prev =>
                          prev.map(i => i.id === item.id ? { ...i, backFile: null, backPreview: null } : i)
                        )}
                        className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X className="w-3 h-3 text-white" />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => backInputRefs.current[item.id]?.click()}
                      className="flex-shrink-0 text-xs text-krea-muted border border-krea-border rounded-md px-2 py-1 hover:border-krea-accent/40 hover:text-krea-text transition-colors"
                    >
                      + Back
                    </button>
                  )
                )}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  ref={el => { backInputRefs.current[item.id] = el; }}
                  onChange={e => { const f = e.target.files?.[0]; if (f) addBackFile(item.id, f); e.target.value = ''; }}
                />

                <span className={`text-xs flex-shrink-0 ${
                  item.status === 'done' ? 'text-green-600'
                  : item.status === 'error' ? 'text-red-500'
                  : item.status === 'pending' ? 'text-krea-muted'
                  : 'text-krea-accent'
                }`}>
                  {STATUS_LABEL[item.status]}
                </span>

                {(item.status === 'pending' || item.status === 'error') && (
                  <button
                    type="button"
                    onClick={() => removeItem(item.id)}
                    className="p-1 rounded hover:bg-krea-bg transition-colors flex-shrink-0"
                  >
                    <X className="w-3.5 h-3.5 text-krea-muted" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Model picker ── */}
      <section className="px-6 pb-6 space-y-3 mt-8">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-krea-muted">Model</p>
        {presetModels.length === 0 ? (
          <p className="text-xs text-krea-muted">Loading models…</p>
        ) : (
          <div className="grid grid-cols-5 gap-3">
            {presetModels.map(model => {
              const isSelected = selectedModelId === model.id;
              return (
                <div
                  key={model.id}
                  className={`group rounded-xl overflow-hidden border-2 transition-all cursor-pointer ${
                    isSelected
                      ? 'border-krea-accent shadow-sm'
                      : 'border-transparent hover:border-krea-border'
                  }`}
                  onClick={() => setPreviewModel(model)}
                >
                  <div className="aspect-[2/3] overflow-hidden bg-white relative">
                    <img
                      src={model.imageUrl}
                      alt={model.name}
                      className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                      referrerPolicy="no-referrer"
                    />
                    {isSelected && (
                      <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-krea-accent flex items-center justify-center">
                        <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 12 12">
                          <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </div>
                    )}
                  </div>
                  <div className="py-2 px-2 bg-white">
                    <p className="text-sm font-medium text-krea-text truncate">{model.name}</p>
                    <p className="text-xs text-krea-muted truncate">{model.ethnicity.split(' /')[0]}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ── Style summary + Generate ── */}
      <div className="px-6 pb-8 space-y-4">
        <div className="flex items-center gap-2 text-sm text-krea-muted">
          <span>Style:</span>
          <span className="font-medium text-krea-text">{activeStyle.label}</span>
          <a href="/app/brand-style" className="text-xs text-krea-accent underline underline-offset-2">Edit</a>
        </div>

        <button
          type="button"
          onClick={handleGenerate}
          disabled={!canGenerate}
          className="krea-button"
        >
          {isRunning ? (
            <span className="flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Starting…
            </span>
          ) : `Generate${pendingCount > 1 ? ` ${pendingCount} SKUs` : ''}`}
        </button>
      </div>

      {/* ── Active results ── */}
      {items.some(i => i.results.length > 0 || i.cleanPreview) && (
        <div className="px-6 pb-10 space-y-8">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-krea-muted">
            Output{doneCount > 0 ? ` — ${doneCount} SKU${doneCount > 1 ? 's' : ''} done` : ''}
          </p>

          {items.filter(i => i.results.length > 0 || i.cleanPreview).map(item => (
            <div key={item.id} className="space-y-2">
              <p className="text-sm font-medium text-krea-text">{item.skuName || 'Untitled'}</p>
              <div className="grid grid-cols-4 gap-3">

                {item.cleanPreview && (
                  <div className="space-y-1.5">
                    <div className="aspect-[2/3] rounded-lg overflow-hidden border border-krea-border bg-white">
                      <img src={item.cleanPreview} alt="Clean flat lay" className="w-full h-full object-contain" />
                    </div>
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] text-krea-muted">Flat lay</p>
                      <a
                        href={item.cleanPreview}
                        download={`${item.skuName || 'sku'}-flat-lay.png`}
                        className="p-1 rounded hover:bg-krea-border/40"
                      >
                        <Download className="w-3.5 h-3.5 text-krea-muted" />
                      </a>
                    </div>
                  </div>
                )}

                {item.results.map(shot => (
                  <div key={shot.angleId} className="space-y-1.5">
                    <div className="aspect-[2/3] rounded-lg overflow-hidden border border-krea-border bg-white">
                      <img src={shot.url} alt={shot.label} className="w-full h-full object-cover" />
                    </div>
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] text-krea-muted">{shot.label}</p>
                      <a
                        href={shot.url}
                        download={`${item.skuName || 'sku'}-${shot.angleId}.png`}
                        className="p-1 rounded hover:bg-krea-border/40"
                      >
                        <Download className="w-3.5 h-3.5 text-krea-muted" />
                      </a>
                    </div>
                  </div>
                ))}

                {(ACTIVE_STATUSES as string[]).includes(item.status) &&
                  Array.from({ length: 3 - item.results.length }).map((_, i) => (
                    <div key={`skel-${i}`} className="space-y-1.5">
                      <div className="aspect-[2/3] rounded-lg bg-krea-border/30 animate-pulse" />
                      <p className="text-[10px] text-krea-muted/40">
                        {['Front', 'Three-quarter', 'Back'][item.results.length + i]}
                      </p>
                    </div>
                  ))
                }
              </div>

              {item.error && <p className="text-xs text-red-500">{item.error}</p>}
            </div>
          ))}
        </div>
      )}

      {/* ── Model preview overlay ── */}
      {previewModel && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6"
          onClick={() => setPreviewModel(null)}
        >
          <div
            className="relative flex gap-8 items-end max-h-[90vh]"
            onClick={e => e.stopPropagation()}
          >
            <img
              src={previewModel.imageUrl}
              alt={previewModel.name}
              className="h-[85vh] w-auto object-contain rounded-xl shadow-2xl"
              referrerPolicy="no-referrer"
            />
            <div className="pb-2 space-y-4 min-w-[180px]">
              <div className="space-y-1">
                <p className="text-2xl font-semibold text-white">{previewModel.name}</p>
                <p className="text-sm text-white/60">{previewModel.gender}</p>
                <p className="text-sm text-white/60">{previewModel.ethnicity}</p>
                <p className="text-sm text-white/60">{previewModel.bodyBuild}</p>
                <p className="text-sm text-white/60">{previewModel.height}</p>
              </div>
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => { setSelectedModelId(previewModel.id); setPreviewModel(null); }}
                  className="krea-button text-sm"
                >
                  {selectedModelId === previewModel.id ? 'Selected ✓' : 'Select model'}
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewModel(null)}
                  className="krea-button-secondary text-sm"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = headersArgs => {
  return boundary.headers(headersArgs);
};
