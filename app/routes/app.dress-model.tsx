import { useState, useRef, useEffect, useCallback } from 'react';
import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from 'react-router';
import { useLoaderData, useRouteError, useRevalidator, Link } from 'react-router';
import { boundary } from '@shopify/shopify-app-react-router/server';
import { useAuthenticatedFetch } from '../contexts/AuthenticatedFetchContext';
import { X, Download, Loader2, Plus, AlertTriangle, CheckCircle, XCircle } from 'lucide-react';
import { zipSync } from 'fflate';
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

  const [brandStyle, plan, used, customModels] = await Promise.all([
    prisma.brandStyle.findUnique({ where: { shopId: shop } }),
    getPlanForShop(shop),
    getMonthlyUsage(shop),
    prisma.model.findMany({
      where: { shopId: shop, isPreset: false },
      orderBy: { createdAt: 'desc' },
      select: { id: true, name: true, gender: true, ethnicity: true, imageUrl: true, height: true, bodyBuild: true },
    }),
  ]);

  return {
    shop,
    styleIds: brandStyle?.styleIds ?? [PDP_STYLE_PRESETS[0].id],
    stylingDirectionId: brandStyle?.stylingDirectionId ?? STYLING_DIRECTION_PRESETS[0].id,
    plan,
    used,
    limit: PLAN_LIMITS[plan] ?? PLAN_LIMITS.free,
    angles: PLAN_ANGLES[plan] ?? PLAN_ANGLES.free,
    customModels,
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
    let plan: string;
    try {
      plan = await reserveGenerations(shopId, 1);
    } catch (e) {
      const msg = (e as Error).message;
      if (msg === 'insufficient_credits') {
        const [used, limitPlan] = await Promise.all([
          getMonthlyUsage(shopId),
          getPlanForShop(shopId),
        ]);
        return Response.json(
          { error: 'limit_reached', used, limit: PLAN_LIMITS[limitPlan] ?? PLAN_LIMITS.free, plan: limitPlan },
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

    // Resolve allowed poses: plan ceiling ∩ brand preference
    // If brand has never configured poses (angleIds null/empty), treat as "all plan-allowed poses"
    const brandStyleRecord = await prisma.brandStyle.findUnique({
      where: { shopId },
      select: { angleIds: true },
    });
    const effectiveAngleIds = brandStyleRecord?.angleIds?.length
      ? brandStyleRecord.angleIds
      : PLAN_ANGLES[plan] ?? PLAN_ANGLES.free;
    const allowedPoses = (PLAN_ANGLES[plan] ?? PLAN_ANGLES.free).filter(p =>
      effectiveAngleIds.includes(p),
    );

    const apiKey = process.env.GEMINI_API_KEY!;

    // Phase 1: Clean flat lay(s) server-side — no more client key exposure
    let cleanFlatLayB64: string;
    try {
      cleanFlatLayB64 = await cleanFlatLay(frontB64, frontMime, apiKey);
    } catch (e) {
      return Response.json({ error: (e as Error).message }, { status: 422 });
    }
    const cleanBackFlatLayB64 =
      backB64 && backMime
        ? await cleanFlatLay(backB64, backMime, apiKey).catch(() => null)
        : null;

    // Phase 2: Extract garment spec
    let garmentSpec: Awaited<ReturnType<typeof extractGarmentSpec>>;
    try {
      garmentSpec = await extractGarmentSpec(cleanFlatLayB64, 'image/png', apiKey);
    } catch (e) {
      return Response.json({ error: (e as Error).message }, { status: 422 });
    }

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
      allowedPoses,
      cleanBackFlatLayUrl: cleanBackFlatLayUrl ?? undefined,
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

    return Response.json({ outfitId: outfit.id, cleanFlatLayUrl, shopId });
  }

  // ── poll_status ──────────────────────────────────────────────────────────────
  if (intent === 'poll_status') {
    const outfitId = body.outfitId as string;
    const outfit = await prisma.outfit.findFirst({
      where: { id: outfitId, shopId },
      select: {
        status: true,
        errorMessage: true,
        images: { select: { id: true, pose: true, imageUrl: true } },
      },
    });
    if (!outfit) return Response.json({ error: 'Not found' }, { status: 404 });
    return Response.json({ status: outfit.status, errorMessage: outfit.errorMessage ?? null, images: outfit.images });
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

function validateFlatLay(file: File): Promise<FlatLayQuality> {
  return new Promise(resolve => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const MAX = 150;
      const scale = Math.min(1, MAX / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);

      const { data } = ctx.getImageData(0, 0, w, h);
      const n = w * h;
      const lum = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        lum[i] = (0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2]) / 255;
      }

      const avgBrightness = lum.reduce((s, v) => s + v, 0) / n;

      // Corner busyness: 4 corners at 20% of min dimension
      const pad = Math.round(Math.min(w, h) * 0.2);
      let cSum = 0, cSumSq = 0, cCount = 0;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          if ((x < pad || x >= w - pad) && (y < pad || y >= h - pad)) {
            const v = lum[y * w + x];
            cSum += v; cSumSq += v * v; cCount++;
          }
        }
      }
      const cMean = cSum / cCount;
      const cornerStdDev = Math.sqrt(Math.max(0, cSumSq / cCount - cMean * cMean));

      const ratio = img.width / img.height;

      let issues = 0;
      if (avgBrightness < 0.25) issues += 2;
      else if (avgBrightness < 0.4) issues += 1;
      if (cornerStdDev > 0.25) issues += 2;
      else if (cornerStdDev > 0.15) issues += 1;
      if (ratio > 1.8 || ratio < 0.45) issues += 2;
      else if (ratio > 1.3) issues += 1;

      resolve(issues >= 3 ? 'fail' : issues >= 1 ? 'warn' : 'good');
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve('warn'); };
    img.src = url;
  });
}

async function downloadAllAsZip(items: BatchItem[]) {
  const doneItems = items.filter(i => i.status === 'done' && i.results.length > 0);
  if (!doneItems.length) return;

  const entries = doneItems.flatMap(item => [
    ...(item.cleanPreview ? [{ url: item.cleanPreview, name: `${item.skuName || 'sku'}-flat-lay.png` }] : []),
    ...item.results.map(s => ({ url: s.url, name: `${item.skuName || 'sku'}-${s.angleId}.png` })),
  ]);

  const fetched = await Promise.all(
    entries.map(async ({ url, name }) => {
      try {
        const res = await fetch(url);
        return [name, new Uint8Array(await res.arrayBuffer())] as const;
      } catch { return null; }
    }),
  );

  const files: Record<string, Uint8Array> = {};
  for (const e of fetched) { if (e) files[e[0]] = e[1]; }

  const zipped = zipSync(files, { level: 0 });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([zipped.buffer as ArrayBuffer], { type: 'application/zip' }));
  a.download = 'tiny-lemon-exports.zip';
  a.click();
  URL.revokeObjectURL(a.href);
}

// ── Types ─────────────────────────────────────────────────────────────────────

type ItemStatus =
  | 'pending'
  | 'processing'
  | 'generating_front'
  | 'generating_tq'
  | 'generating_back'
  | 'done'
  | 'error'
  | 'submitted'; // job was triggered but polling was lost (e.g. session expired mid-poll)

interface ResultShot {
  angleId: string;
  label: string;
  url: string;
}

type FlatLayQuality = 'good' | 'warn' | 'fail';

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
  savedShopId: string | null;
  quality: FlatLayQuality | null;
}

const MAX_BATCH = 10;

const STATUS_LABEL: Record<ItemStatus, string> = {
  pending: 'Pending',
  processing: 'Starting…',
  generating_front: '1/3',
  generating_tq: '2/3',
  generating_back: '3/3',
  submitted: 'Submitted',
  done: 'Done',
  error: 'Error',
};

const POSE_LABEL: Record<string, string> = {
  front: 'Front',
  'three-quarter': 'Three-quarter',
  back: 'Back',
};

const UPGRADE_MSG = "You've used all your generations this month. Upgrade to continue.";

function ErrorMsg({ msg }: { msg: string }) {
  if (msg === UPGRADE_MSG) {
    return (
      <span>
        You&apos;ve used all your generations this month.{' '}
        <Link to="/app/billing" className="underline font-medium">Upgrade to continue</Link>.
      </span>
    );
  }
  return <>{msg}</>;
}

const ACTIVE_STATUSES: ItemStatus[] = [
  'processing',
  'generating_front',
  'generating_tq',
  'generating_back',
];

// ── Component ─────────────────────────────────────────────────────────────────

export default function DressModel() {
  const { styleIds, stylingDirectionId, customModels } = useLoaderData<typeof loader>();
  const { revalidate } = useRevalidator();
  const authenticatedFetch = useAuthenticatedFetch();

  const [presetModels, setPresetModels] = useState<PresetModelEntry[]>([]);
  const [selectedModelId, setSelectedModelId] = useState<string | null>(customModels[0]?.id ?? null);
  const [modelTab, setModelTab] = useState<'mine' | 'presets'>(customModels.length > 0 ? 'mine' : 'presets');
  const [previewModel, setPreviewModel] = useState<PresetModelEntry | null>(null);
  const [items, setItems] = useState<BatchItem[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const backInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const selectedCardRef = useRef<HTMLDivElement | null>(null);

  // Keep a ref to items so the polling interval reads fresh state without
  // being listed as a dependency (avoids clearing/recreating the interval on every state update).
  const itemsRef = useRef(items);
  useEffect(() => { itemsRef.current = items; }, [items]);

  // Track consecutive poll failures per item to surface errors after repeated failures
  const pollFailuresRef = useRef<Record<string, number>>({});

  useEffect(() => {
    fetch('/preset-models.json')
      .then(r => r.json())
      .then((data: PresetModelEntry[]) => {
        setPresetModels(data);
        if (data[0] && !customModels.length) setSelectedModelId(data[0].id);
      })
      .catch(() => {});
  }, []);

  // Scroll the selected model card into view when selection changes
  useEffect(() => {
    selectedCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }, [selectedModelId]);

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
      savedShopId: null,
      quality: null,
    }));
    setItems(prev => [...prev, ...newItems]);

    // Run quality validation asynchronously after items are added
    newItems.forEach(item => {
      validateFlatLay(item.frontFile).then(quality => {
        setItems(prev => prev.map(i => i.id === item.id ? { ...i, quality } : i));
      });
    });
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
            // Use the public status endpoint — no Shopify auth required on every tick.
            const shopParam = item.savedShopId ? `?shop=${encodeURIComponent(item.savedShopId)}` : '';
            const res = await fetch(`/api/outfit-status/${item.savedOutfitId}${shopParam}`);
            if (!res.ok) {
              const failures = (pollFailuresRef.current[item.id] ?? 0) + 1;
              pollFailuresRef.current[item.id] = failures;
              if (failures >= 3) {
                updateItem(item.id, { status: 'submitted', error: null });
              }
              return;
            }

            // Reset counter on any successful response
            pollFailuresRef.current[item.id] = 0;

            const { status, errorMessage, images } = (await res.json()) as {
              status: string;
              errorMessage?: string | null;
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
              updateItem(item.id, { status: 'error', error: errorMessage ?? 'Generation failed. Please try again.' });
            } else {
              const uiStatus: ItemStatus =
                status === 'generating_front' ? 'generating_front'
                : status === 'generating_tq' ? 'generating_tq'
                : status === 'generating_back' ? 'generating_back'
                : 'processing';
              updateItem(item.id, { status: uiStatus, results });
            }
          } catch {
            const failures = (pollFailuresRef.current[item.id] ?? 0) + 1;
            pollFailuresRef.current[item.id] = failures;
            if (failures >= 3) {
              updateItem(item.id, { status: 'submitted', error: null });
            }
          }
        }),
      );
    }, 3000);

    return () => clearInterval(interval);
  }, [isPolling]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Generate ─────────────────────────────────────────────────────────────────

  const allModels: PresetModelEntry[] = [
    ...(customModels as PresetModelEntry[]),
    ...presetModels,
  ];

  async function handleGenerate() {
    if (!selectedModelId || isRunning) return;
    const pending = items.filter(i => i.status === 'pending' || i.status === 'error');
    if (!pending.length) return;

    const selectedModel = allModels.find(m => m.id === selectedModelId);
    if (!selectedModel) return;

    setIsRunning(true);

    // Fire all trigger_generation requests in parallel — each POSTs the raw flat lay,
    // runs cleanFlatLay + extractGarmentSpec server-side (~10–15s), then enqueues the job.
    await Promise.all(
      pending.map(async item => {
        // If this item already has a savedOutfitId (e.g. session expired during polling but
        // the background job may have continued), resume polling instead of re-generating.
        if (item.savedOutfitId) {
          pollFailuresRef.current[item.id] = 0;
          updateItem(item.id, { status: 'processing', error: null });
          return;
        }

        updateItem(item.id, {
          status: 'processing',
          error: null,
          results: [],
          cleanPreview: null,
          savedOutfitId: null,
          savedShopId: null,
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

          const res = await authenticatedFetch('/app/dress-model', {
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
            if (res.status === 401 || res.status === 403) {
              throw new Error('Session expired — please refresh the page.');
            }
            if (res.status === 402) {
              throw new Error(UPGRADE_MSG);
            }
            const json = await res.json().catch(() => null) as { error?: string } | null;
            throw new Error(json?.error ?? `Something went wrong (${res.status}). Please try again.`);
          }

          // Detect auth redirect: session expired causes a 302 → 200 HTML response
          const contentType = res.headers.get('Content-Type') ?? '';
          if (!contentType.includes('application/json')) {
            throw new Error('Session expired — please refresh the page.');
          }

          const { outfitId, cleanFlatLayUrl, shopId: savedShopId } = (await res.json()) as {
            outfitId: string;
            cleanFlatLayUrl: string;
            shopId: string;
          };

          updateItem(item.id, {
            status: 'processing',
            savedOutfitId: outfitId,
            savedShopId,
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
  const errorCount = items.filter(i => i.status === 'error').length;
  const canGenerate = pendingCount > 0 && !!selectedModelId && !isRunning;
  const doneCount = items.filter(i => i.status === 'done').length;
  const activeBackground =
    PDP_STYLE_PRESETS.find(p => p.id === styleIds[0]) ?? PDP_STYLE_PRESETS[0];
  const activeStyle =
    STYLING_DIRECTION_PRESETS.find(p => p.id === stylingDirectionId) ??
    STYLING_DIRECTION_PRESETS[0];

  return (
    <div className="min-h-screen bg-krea-bg flex gap-6 p-6">

      {/* ── Left column ── */}
      <div className="w-[420px] flex-shrink-0 space-y-6">

      {/* ── Flat lay upload ── */}
      <div className="space-y-4">
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
              <div key={item.id} className="space-y-1">
              <div
                className="flex items-center gap-3 bg-white rounded-xl px-3 py-2 border border-krea-border"
              >
                <div className="w-10 h-10 rounded-md overflow-hidden bg-krea-bg flex-shrink-0 relative">
                  <img src={item.frontPreview} alt="" className="w-full h-full object-cover" />
                  {item.quality === 'good' && (
                    <span title="Looks good" className="absolute bottom-0.5 right-0.5">
                      <CheckCircle className="w-3 h-3 text-green-500 bg-white rounded-full" />
                    </span>
                  )}
                  {item.quality === 'warn' && (
                    <span title="Might struggle" className="absolute bottom-0.5 right-0.5">
                      <AlertTriangle className="w-3 h-3 text-yellow-500 bg-white rounded-full" />
                    </span>
                  )}
                  {item.quality === 'fail' && (
                    <span title="Likely to fail" className="absolute bottom-0.5 right-0.5">
                      <XCircle className="w-3 h-3 text-red-500 bg-white rounded-full" />
                    </span>
                  )}
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
                  : item.status === 'submitted' ? 'text-amber-500'
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
              {item.quality === 'warn' && item.status === 'pending' && (
                <p className="text-[10px] text-yellow-600 flex items-center gap-1 px-1">
                  <AlertTriangle className="w-3 h-3 flex-shrink-0" />
                  Might struggle — dark or complex background detected
                </p>
              )}
              {item.quality === 'fail' && item.status === 'pending' && (
                <p className="text-[10px] text-red-500 flex items-center gap-1 px-1">
                  <XCircle className="w-3 h-3 flex-shrink-0" />
                  Likely to fail — try a plain white/light background
                </p>
              )}
              {item.status === 'error' && item.error && (
                <p className="text-[10px] text-red-500 flex items-center gap-1 px-1">
                  <XCircle className="w-3 h-3 flex-shrink-0" />
                  <ErrorMsg msg={item.error} />
                </p>
              )}
              {item.status === 'submitted' && (
                <p className="text-[10px] text-krea-muted flex items-center gap-1 px-1">
                  Generation in progress —{' '}
                  <Link to="/app/outfits" className="underline font-medium text-krea-text">view result in Outfits</Link>
                </p>
              )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Style summary + Generate ── */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-sm text-krea-muted">
          <span>Style:</span>
          <span className="font-medium text-krea-text">{activeBackground.label} · {activeStyle.label}</span>
          <Link to="/app/brand-style" className="text-xs text-krea-accent underline underline-offset-2">Edit</Link>
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
          ) : errorCount > 0 && pendingCount === errorCount
            ? `Retry${errorCount > 1 ? ` ${errorCount} failed` : ''}`
            : `Generate${pendingCount > 1 ? ` ${pendingCount} SKUs` : ''}`}
        </button>
      </div>

      {/* ── Active results ── */}
      {items.some(i => i.results.length > 0 || i.cleanPreview) && (
        <div className="space-y-8">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-krea-muted">
              Output{doneCount > 0 ? ` — ${doneCount} SKU${doneCount > 1 ? 's' : ''} done` : ''}
            </p>
            {doneCount > 1 && (
              <button
                type="button"
                onClick={() => downloadAllAsZip(items)}
                className="flex items-center gap-1.5 text-xs text-krea-accent hover:text-krea-text transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                Download all
              </button>
            )}
          </div>

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

              {item.error && <p className="text-xs text-red-500"><ErrorMsg msg={item.error} /></p>}
              {item.status === 'submitted' && (
                <p className="text-xs text-krea-muted">
                  Generation in progress —{' '}
                  <Link to="/app/outfits" className="underline font-medium text-krea-text">view result in Outfits</Link>
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      </div>{/* end left column */}

      {/* ── Right column ── */}
      <div className="flex-1 min-w-0 sticky top-6 self-start max-h-[calc(100vh-48px)] overflow-y-auto space-y-6">

      {/* ── Model picker ── */}
      <section className="space-y-3">

        {/* Segment control */}
        {(() => {
          const selectedInMine = selectedModelId != null && (customModels as PresetModelEntry[]).some(m => m.id === selectedModelId);
          const selectedInPresets = selectedModelId != null && presetModels.some(m => m.id === selectedModelId);
          return (
            <div className="flex gap-1 p-1 bg-black/5 rounded-xl">
              <button
                type="button"
                onClick={() => setModelTab('mine')}
                className={`relative flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium rounded-lg transition-all ${
                  modelTab === 'mine'
                    ? 'bg-white text-krea-text shadow-sm'
                    : 'text-krea-muted hover:text-krea-text'
                }`}
              >
                Mine
                {selectedInMine && modelTab !== 'mine' && (
                  <span className="w-1.5 h-1.5 rounded-full bg-krea-accent" />
                )}
              </button>
              <button
                type="button"
                onClick={() => setModelTab('presets')}
                className={`relative flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium rounded-lg transition-all ${
                  modelTab === 'presets'
                    ? 'bg-white text-krea-text shadow-sm'
                    : 'text-krea-muted hover:text-krea-text'
                }`}
              >
                Presets
                {selectedInPresets && modelTab !== 'presets' && (
                  <span className="w-1.5 h-1.5 rounded-full bg-krea-accent" />
                )}
              </button>
            </div>
          );
        })()}

        {/* Mine tab */}
        {modelTab === 'mine' && (
          customModels.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
              <p className="text-sm text-krea-muted">No custom models yet.</p>
              <Link
                to="/app/model-builder"
                className="text-xs font-medium text-krea-text underline underline-offset-2 hover:opacity-70 transition-opacity"
              >
                Create a model →
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-4 gap-2">
              {(customModels as PresetModelEntry[]).map(model => {
                const isSelected = selectedModelId === model.id;
                return (
                  <div
                    key={model.id}
                    ref={isSelected ? selectedCardRef : null}
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
          )
        )}

        {/* Presets tab — async from JSON fetch */}
        {modelTab === 'presets' && (
          presetModels.length === 0 ? (
            <p className="text-xs text-krea-muted py-4">Loading models…</p>
          ) : (
            <div className="grid grid-cols-4 gap-2">
              {presetModels.map(model => {
                const isSelected = selectedModelId === model.id;
                return (
                  <div
                    key={model.id}
                    ref={isSelected ? selectedCardRef : null}
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
          )
        )}

      </section>

      </div>{/* end right column */}

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
            <button
              type="button"
              onClick={() => setPreviewModel(null)}
              className="absolute -top-4 -right-4 w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors z-10"
            >
              <X className="w-4 h-4 text-white" />
            </button>
            <img
              src={previewModel.imageUrl}
              alt={previewModel.name}
              className="h-[85vh] w-auto object-contain rounded-xl shadow-2xl"
              referrerPolicy="no-referrer"
            />
            <div className="pb-2 space-y-4 min-w-[180px] bg-white rounded-xl p-4">
              <div className="space-y-1">
                <p className="text-2xl font-semibold text-krea-text">{previewModel.name}</p>
                <p className="text-sm text-krea-muted">{previewModel.gender}</p>
                <p className="text-sm text-krea-muted">{previewModel.ethnicity}</p>
                <p className="text-sm text-krea-muted">{previewModel.bodyBuild}</p>
                <p className="text-sm text-krea-muted">{previewModel.height}</p>
              </div>
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => { setSelectedModelId(previewModel.id); setPreviewModel(null); }}
                  className="krea-button text-sm"
                >
                  {selectedModelId === previewModel.id ? 'Selected ✓' : 'Select model'}
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
