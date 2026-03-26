import { readFileSync } from 'fs';
import { join } from 'path';
import { useState, useRef, useEffect, useCallback } from 'react';
import { useLoaderData, useRouteError, useRevalidator, Link } from 'react-router';
import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from 'react-router';
import { boundary } from '@shopify/shopify-app-react-router/server';
import {
  Download, MoreHorizontal, ZoomIn, X, Trash2, Loader2,
  ChevronLeft, ChevronRight, Image as ImageIcon, RefreshCw,
  Upload, ExternalLink,
} from 'lucide-react';
import { zipSync } from 'fflate';
import { useAuthenticatedFetch } from '../contexts/AuthenticatedFetchContext';
import { GeneratedPoseImage } from '../components/GeneratedPoseImage';
import { authenticate } from '../shopify.server';
import prisma from '../db.server';
import { BRAND_STYLE_PRESETS } from '../lib/pdpPresets';
import { isSessionExpiredResponse, SESSION_EXPIRED_MESSAGE } from '../lib/authenticatedRequest.client';
import { handleRegenerateOutfit } from '../lib/triggerGeneration.server';
import { getEffectiveEntitlements } from '../lib/billing.server';
import { cancelRunSafely, enqueueShopifySync } from '../lib/triggerJobs.server';
import posthog from 'posthog-js';

const SHOPIFY_SYNC_RECENCY_WINDOW_MS = 10 * 60 * 1000;

// ── Loader ─────────────────────────────────────────────────────────────────────

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const [outfits, entitlements] = await Promise.all([
    prisma.outfit.findMany({
      where: { shopId: shop },
      include: { images: true },
      orderBy: { createdAt: 'desc' },
    }),
    getEffectiveEntitlements(shop),
  ]);

  // Resolve model names: check DB first (custom models), then preset JSON
  const modelIds = [...new Set(outfits.map((o) => o.modelId).filter(Boolean))];

  const dbModels = modelIds.length
    ? await prisma.model.findMany({
        where: { id: { in: modelIds } },
        select: { id: true, name: true },
      })
    : [];

  const presetModels: Array<{ id: string; name: string }> = JSON.parse(
    readFileSync(join(process.cwd(), 'public', 'preset-models.json'), 'utf-8'),
  );

  const modelNameMap: Record<string, string> = {};
  for (const m of [...presetModels, ...dbModels]) {
    modelNameMap[m.id] = m.name;
  }

  const brandStyleLabelMap: Record<string, string> = Object.fromEntries(
    BRAND_STYLE_PRESETS.map((p) => [p.id, p.label]),
  );

  return { shop, outfits, modelNameMap, brandStyleLabelMap, isBeta: entitlements.isBeta };
};

// ── Action ─────────────────────────────────────────────────────────────────────

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shopId = session.shop;

  const body = (await request.json()) as Record<string, unknown>;

  if (body.intent === 'delete_outfit') {
    const outfitId = body.outfitId as string;
    const outfit = await prisma.outfit.findFirst({ where: { id: outfitId, shopId } });
    if (!outfit) return Response.json({ error: 'Not found' }, { status: 404 });
    await prisma.outfit.delete({ where: { id: outfitId } });
    return Response.json({ ok: true });
  }

  if (body.intent === 'rename_outfit') {
    const outfitId = body.outfitId as string;
    const name = (body.name as string)?.trim();
    if (!name) return Response.json({ error: 'Name required' }, { status: 400 });
    const outfit = await prisma.outfit.findFirst({ where: { id: outfitId, shopId } });
    if (!outfit) return Response.json({ error: 'Not found' }, { status: 404 });
    await prisma.outfit.update({ where: { id: outfitId }, data: { name } });
    return Response.json({ ok: true });
  }

  if (body.intent === 'delete_outfits') {
    const raw = body.outfitIds as unknown;
    const ids = Array.isArray(raw)
      ? (raw as string[]).slice(0, 100).filter((id) => typeof id === 'string')
      : [];
    if (ids.length === 0) return Response.json({ error: 'No outfits to delete' }, { status: 400 });
    const { count } = await prisma.outfit.deleteMany({
      where: { id: { in: ids }, shopId },
    });
    return Response.json({ ok: true, deleted: count });
  }

  if (body.intent === 'regenerate_outfit') {
    const outfitId = body.outfitId as string;
    const userDirection = (body.userDirection as string) || undefined;
    return handleRegenerateOutfit(shopId, outfitId, userDirection);
  }

  if (body.intent === 'cancel_sync') {
    const outfitId = body.outfitId as string;
    const outfit = await prisma.outfit.findFirst({
      where: { id: outfitId, shopId },
      select: { jobId: true },
    });
    if (!outfit) return Response.json({ error: 'Not found' }, { status: 404 });
    if (outfit.jobId) {
      await cancelRunSafely(outfit.jobId);
    }
    await prisma.outfit.update({
      where: { id: outfitId },
      data: { shopifySyncStatus: null },
    });
    return Response.json({ ok: true });
  }

  if (body.intent === 'publish_to_shopify') {
    const outfitId = body.outfitId as string;
    const outfit = await prisma.outfit.findFirst({
      where: { id: outfitId, shopId },
      select: {
        status: true,
        shopifyProductId: true,
        shopifySyncStatus: true,
        shopifySyncedAt: true,
      },
    });
    if (!outfit) return Response.json({ error: 'Not found' }, { status: 404 });
    if (outfit.status !== 'completed') {
      return Response.json({ error: 'Outfit is not completed.' }, { status: 400 });
    }
    const syncStartedRecently =
      outfit.shopifySyncStatus === 'syncing' &&
      outfit.shopifySyncedAt != null &&
      Date.now() - outfit.shopifySyncedAt.getTime() < SHOPIFY_SYNC_RECENCY_WINDOW_MS;
    if (syncStartedRecently) {
      console.info('[publish_to_shopify.idempotent_reuse]', {
        outfitId,
        shopId,
        reason: 'already_syncing_recently',
      });
      return Response.json({ ok: true, reused: true });
    }
    const handle = await enqueueShopifySync({
      outfitId,
      shopId,
      shopifyProductId: outfit.shopifyProductId ?? undefined,
    });
    console.info('[publish_to_shopify.enqueued]', {
      outfitId,
      shopId,
      reused: false,
    });
    await prisma.outfit.update({
      where: { id: outfitId },
      data: { shopifySyncStatus: 'syncing', jobId: handle.id },
    });
    return Response.json({ ok: true });
  }

  if (body.intent === 'cancel_generation') {
    const outfitId = body.outfitId as string;
    if (!outfitId || typeof outfitId !== 'string') {
      return Response.json({ error: 'outfitId required' }, { status: 400 });
    }
    const outfit = await prisma.outfit.findFirst({
      where: { id: outfitId, shopId },
      select: { status: true, jobId: true },
    });
    if (!outfit) return Response.json({ error: 'Not found' }, { status: 404 });
    const inProgress =
      outfit.status !== 'completed' && outfit.status !== 'failed';
    if (!inProgress) {
      return Response.json(
        { error: 'Outfit is not generating. Nothing to cancel.' },
        { status: 400 }
      );
    }
    if (outfit.jobId) {
      await cancelRunSafely(outfit.jobId);
    }
    await prisma.outfit.update({
      where: { id: outfitId, shopId },
      data: {
        status: 'failed',
        errorMessage: 'Cancelled by user',
        jobId: null,
      },
    });
    return Response.json({ ok: true });
  }

  return Response.json({ error: 'Unknown intent' }, { status: 400 });
};

// ── Constants ──────────────────────────────────────────────────────────────────

const POSE_LABEL: Record<string, string> = {
  front: 'Front',
  'three-quarter': 'Three-quarter',
  back: 'Back',
};

// ── Types ──────────────────────────────────────────────────────────────────────

type OutfitWithImages = Awaited<ReturnType<typeof loader>>['outfits'][number];

// ── ZIP helper ─────────────────────────────────────────────────────────────────

async function downloadAsZip(
  outfitName: string,
  entries: Array<{ url: string; filename: string }>,
) {
  const fetched = await Promise.all(
    entries.map(async ({ url, filename }) => {
      try {
        const res = await fetch(url);
        return [filename, new Uint8Array(await res.arrayBuffer())] as const;
      } catch {
        return null;
      }
    }),
  );
  const files: Record<string, Uint8Array> = {};
  for (const e of fetched) {
    if (e) files[e[0]] = e[1];
  }
  const zipped = zipSync(files, { level: 0 });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(
    new Blob([zipped.buffer as ArrayBuffer], { type: 'application/zip' }),
  );
  a.download = `${outfitName.replace(/\s+/g, '-')}-outfit.zip`;
  a.click();
  URL.revokeObjectURL(a.href);
}

// ── Download helper ────────────────────────────────────────────────────────────

async function downloadImage(url: string, filename: string) {
  const res = await fetch(url);
  const blob = await res.blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

// ── ImageTile ──────────────────────────────────────────────────────────────────

function ImageTile({
  url,
  asset,
  label,
  hasVariants = true,
  onLightbox,
  isLcp = false,
}: {
  url: string;
  asset?: unknown;
  label: string;
  hasVariants?: boolean;
  onLightbox: () => void;
  isLcp?: boolean;
}) {
  const [error, setError] = useState(false);
  return (
    <div>
      <div
        className="group relative h-[300px] rounded-lg overflow-hidden border border-krea-border bg-white cursor-pointer"
        onClick={onLightbox}
      >
        {error ? (
          <div className="w-full h-full" style={{ background: '#f3f4f6' }} aria-hidden />
        ) : (
          hasVariants ? (
            <GeneratedPoseImage
              asset={asset}
              url={url}
              label={label}
              width={800}
              height={1200}
              className="block w-full h-full object-contain"
              style={{ aspectRatio: '2 / 3' }}
              loading={isLcp ? undefined : 'lazy'}
              decoding={isLcp ? undefined : 'async'}
              fetchPriority={isLcp ? 'high' : undefined}
              sizes="(min-width: 1024px) 400px, 90vw"
              placeholderClassName="w-full h-full"
            />
          ) : (
            <img
              src={url}
              alt={label}
              width={800}
              height={1200}
              className="block w-full h-full object-contain"
              style={{ aspectRatio: '2 / 3' }}
              loading={isLcp ? undefined : 'lazy'}
              decoding={isLcp ? undefined : 'async'}
              fetchPriority={isLcp ? 'high' : undefined}
              sizes="(min-width: 1024px) 400px, 90vw"
              onError={() => setError(true)}
            />
          )
        )}
        <div className="absolute inset-0 bg-black/25 flex items-center justify-center transition-opacity opacity-100 md:opacity-0 md:group-hover:opacity-100 pointer-events-none">
          <div className="p-2 rounded-full bg-white/90">
            <ZoomIn className="w-4 h-4 text-krea-text" />
          </div>
        </div>
      </div>
      <div className="flex items-center justify-between mt-1.5">
        <p className="text-[10px] text-krea-muted">{label}</p>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); downloadImage(url, `${label.toLowerCase().replace(/\s+/g, '-')}.png`); }}
          className="p-1 rounded hover:bg-krea-border/40 transition-colors"
        >
          <Download className="w-3.5 h-3.5 text-krea-muted" />
        </button>
      </div>
    </div>
  );
}

// ── Regenerate modal ───────────────────────────────────────────────────────────

const CUSTOM_DIRECTION_MAX = 300;

function RegenerateModal({
  outfitName,
  onClose,
  onSubmit,
}: {
  outfitName: string;
  onClose: () => void;
  onSubmit: (userDirection?: string) => Promise<{ ok: boolean; error?: string }>;
}) {
  const [userDirection, setUserDirection] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const firstInputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    firstInputRef.current?.focus();
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  async function handleSubmit() {
    setError(null);
    setSubmitting(true);
    const result = await onSubmit(userDirection.trim() || undefined);
    setSubmitting(false);
    if (result.ok) {
      onClose();
    } else {
      setError(result.error ?? 'Something went wrong. Try again.');
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold text-krea-text">Regenerate outfit</h3>
        <p className="text-sm text-krea-muted">
          Run generation again for <span className="font-medium text-krea-text">{outfitName}</span>.
        </p>
        <div>
          <label htmlFor="regenerate-direction" className="block text-xs font-medium text-krea-muted mb-1">
            Add instructions (optional)
          </label>
          <textarea
            ref={firstInputRef}
            id="regenerate-direction"
            value={userDirection}
            onChange={(e) => setUserDirection(e.target.value.slice(0, CUSTOM_DIRECTION_MAX))}
            placeholder="e.g. Warmer lighting, less shadow"
            maxLength={CUSTOM_DIRECTION_MAX}
            rows={3}
            className="w-full text-sm border border-krea-border rounded-lg px-3 py-2 text-krea-text placeholder:text-krea-muted/60 focus:outline-none focus:ring-2 focus:ring-krea-accent/40"
          />
          <p className="text-[10px] text-krea-muted mt-1">
            {userDirection.length}/{CUSTOM_DIRECTION_MAX}. Focus on lighting, background, or pose style for best results.
          </p>
        </div>
        <p className="text-xs text-krea-muted">
          This uses 1 generation from your plan.
        </p>
        {error && (
          <p className="text-xs text-red-500">{error}</p>
        )}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="px-4 py-2 text-sm text-krea-muted hover:text-krea-text border border-krea-border rounded-lg transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="px-4 py-2 text-sm font-medium text-white bg-krea-text hover:bg-krea-text/90 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Regenerating…
              </>
            ) : (
              'Regenerate'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Lightbox ───────────────────────────────────────────────────────────────────

function Lightbox({
  outfit,
  initialIndex,
  onClose,
}: {
  outfit: OutfitWithImages;
  initialIndex: number;
  onClose: () => void;
}) {
  const front = outfit.images.find((img) => img.pose === 'front');
  const tq    = outfit.images.find((img) => img.pose === 'three-quarter');
  const back  = outfit.images.find((img) => img.pose === 'back');

  const images: Array<{ url: string; label: string; asset?: unknown; hasVariants: boolean }> = [
    ...(front ? [{ url: front.imageUrl, label: 'Front', asset: front.assetManifest, hasVariants: true }] : []),
    ...(tq ? [{ url: tq.imageUrl, label: 'Three-quarter', asset: tq.assetManifest, hasVariants: true }] : []),
    ...(back ? [{ url: back.imageUrl, label: 'Back', asset: back.assetManifest, hasVariants: true }] : []),
    ...(outfit.cleanFlatLayUrl
      ? [{ url: outfit.cleanFlatLayUrl, label: 'Flat lay', hasVariants: false }]
      : []),
  ];

  const [index, setIndex] = useState(initialIndex);
  const current = images[index];

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft')  setIndex((i) => (i - 1 + images.length) % images.length);
      if (e.key === 'ArrowRight') setIndex((i) => (i + 1) % images.length);
      if (e.key === 'Escape')     onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [images.length, onClose]);

  if (!current) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 flex flex-col"
      onClick={onClose}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-6 py-4 shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <p className="text-sm font-medium text-white">{outfit.name || 'Untitled'}</p>
          <p className="text-xs text-white/50 mt-0.5">
            {new Date(outfit.createdAt).toLocaleDateString(undefined, {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-2 rounded-full hover:bg-white/10 transition-colors"
        >
          <X className="w-5 h-5 text-white" />
        </button>
      </div>

      {/* Image + arrows */}
      <div
        className="flex-1 flex items-center justify-center gap-4 px-6 min-h-0"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={() => setIndex((i) => (i - 1 + images.length) % images.length)}
          className="p-2 rounded-full hover:bg-white/10 transition-colors shrink-0"
          style={{ visibility: images.length > 1 ? 'visible' : 'hidden' }}
        >
          <ChevronLeft className="w-6 h-6 text-white" />
        </button>

        <div className="flex items-center justify-center max-h-full max-w-lg w-full">
          {current.hasVariants ? (
            <GeneratedPoseImage
              asset={current.asset}
              url={current.url}
              label={current.label}
              decoding="async"
              className="block max-w-full object-contain rounded-lg"
              style={{ maxHeight: 'calc(100vh - 200px)' }}
              sizes="800px"
              placeholderClassName="w-full max-w-lg rounded-lg bg-krea-border/30"
            />
          ) : (
            <img
              key={current.url}
              src={current.url}
              alt={current.label}
              decoding="async"
              className="block max-w-full object-contain rounded-lg"
              style={{ maxHeight: 'calc(100vh - 200px)' }}
            />
          )}
        </div>

        <button
          type="button"
          onClick={() => setIndex((i) => (i + 1) % images.length)}
          className="p-2 rounded-full hover:bg-white/10 transition-colors shrink-0"
          style={{ visibility: images.length > 1 ? 'visible' : 'hidden' }}
        >
          <ChevronRight className="w-6 h-6 text-white" />
        </button>
      </div>

      {/* Footer */}
      <div
        className="flex items-center justify-center gap-3 px-6 py-4 shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-sm text-white/80">{current.label}</p>
        <span className="text-white/30">·</span>
        <p className="text-xs text-white/50">{index + 1} / {images.length}</p>
        <button
          type="button"
          onClick={() => downloadImage(current.url, `${current.label.toLowerCase().replace(/\s+/g, '-')}.png`)}
          className="ml-2 flex items-center gap-1.5 text-xs text-white/70 hover:text-white border border-white/20 rounded-md px-3 py-1.5 transition-colors"
        >
          <Download className="w-3.5 h-3.5" />
          Download
        </button>
      </div>
    </div>
  );
}

// ── ShopifyPublishButton ───────────────────────────────────────────────────────

function ShopifyPublishButton({
  outfit,
  onPublish,
}: {
  outfit: OutfitWithImages;
  onPublish?: (outfitId: string) => void;
}) {
  const syncStatus = (outfit as { shopifySyncStatus?: string | null }).shopifySyncStatus;
  const productUrl = (outfit as { shopifyProductUrl?: string | null }).shopifyProductUrl;

  if (syncStatus === 'synced' && productUrl) {
    return (
      <button
        type="button"
        onClick={() => window.open(productUrl, '_blank')}
        className="flex items-center gap-1.5 text-[11px] text-krea-muted border border-krea-border rounded-md px-2.5 py-1 hover:bg-krea-border/40 transition-colors"
      >
        <ExternalLink className="w-3 h-3" />
        View in Shopify
      </button>
    );
  }

  if (syncStatus === 'syncing') {
    return (
      <button
        type="button"
        disabled
        className="flex items-center gap-1.5 text-[11px] text-krea-muted border border-krea-border rounded-md px-2.5 py-1 opacity-50 cursor-not-allowed"
      >
        <Loader2 className="w-3 h-3 animate-spin" />
        Publishing…
      </button>
    );
  }

  const label = syncStatus === 'stale' ? 'Re-publish to Shopify' : 'Publish to Shopify';

  return (
    <button
      type="button"
      onClick={() => onPublish?.(outfit.id)}
      className="flex items-center gap-1.5 text-[11px] text-krea-muted border border-krea-border rounded-md px-2.5 py-1 hover:bg-krea-border/40 transition-colors"
    >
      <Upload className="w-3 h-3" />
      {label}
    </button>
  );
}

// ── OutfitCard ─────────────────────────────────────────────────────────────────

const OUTFIT_STATUS = {
  pending: 'pending',
  processing: 'processing',
  generating_front: 'generating_front',
  generating_tq: 'generating_tq',
  generating_back: 'generating_back',
  generating_poses: 'generating_poses',
  completed: 'completed',
  failed: 'failed',
} as const;

function OutfitCard({
  outfit,
  modelName,
  brandStyleLabel,
  isDeleting,
  selected,
  onDelete,
  onRename,
  onToggleSelect,
  onLightbox,
  onRegenerate,
  onCancel,
  onPublish,
  onCancelSync,
}: {
  outfit: OutfitWithImages;
  modelName: string | undefined;
  brandStyleLabel: string;
  isDeleting: boolean;
  selected: boolean;
  onDelete: (id: string) => void;
  onRename: (id: string, name: string) => Promise<{ ok: boolean; error?: string }>;
  onToggleSelect: (id: string) => void;
  onLightbox: (outfitId: string, index: number) => void;
  onRegenerate?: (outfitId: string) => void;
  onCancel?: (outfitId: string) => void;
  onPublish?: (outfitId: string) => void;
  onCancelSync?: (outfitId: string) => void;
}) {
  const status = (outfit as { status?: string }).status ?? 'completed';
  const syncStatus = (outfit as { shopifySyncStatus?: string | null }).shopifySyncStatus;
  const isInProgress = status !== OUTFIT_STATUS.completed && status !== OUTFIT_STATUS.failed;
  const canRegenerate = (status === OUTFIT_STATUS.completed || status === OUTFIT_STATUS.failed) && onRegenerate;
  const [menuOpen, setMenuOpen]         = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [renaming, setRenaming]         = useState(false);
  const [renameValue, setRenameValue]   = useState(outfit.name);
  const [renameSaving, setRenameSaving] = useState(false);
  const [renameError, setRenameError]   = useState<string | null>(null);
  const [downloading, setDownloading]   = useState(false);
  const menuRef   = useRef<HTMLDivElement>(null);
  const renameRef = useRef<HTMLInputElement>(null);

  // Ordered shots: front is hero, then tq, back, flat lay (smallest)
  type CardShot = {
    url: string;
    asset?: unknown;
    label: string;
    key: string;
    size: 'hero' | 'normal' | 'small';
    hasVariants: boolean;
  };
  const front = outfit.images.find((img) => img.pose === 'front');
  const tq    = outfit.images.find((img) => img.pose === 'three-quarter');
  const back  = outfit.images.find((img) => img.pose === 'back');

  const cardShots: CardShot[] = [
    ...(front ? [{ url: front.imageUrl, asset: front.assetManifest, label: 'Front', key: front.id, size: 'hero' as const, hasVariants: true }] : []),
    ...(tq ? [{ url: tq.imageUrl, asset: tq.assetManifest, label: 'Three-quarter', key: tq.id, size: 'normal' as const, hasVariants: true }] : []),
    ...(back ? [{ url: back.imageUrl, asset: back.assetManifest, label: 'Back', key: back.id, size: 'normal' as const, hasVariants: true }] : []),
    ...(outfit.cleanFlatLayUrl
      ? [{
          url: outfit.cleanFlatLayUrl,
          label: 'Flat lay',
          key: 'flat-lay',
          size: 'small' as const,
          hasVariants: false,
        }]
      : []),
  ];

  const sizeToFr = { hero: '1.1fr', normal: '1fr', small: '0.8fr' };
  const gridTemplate = cardShots.map((s) => sizeToFr[s.size]).join(' ') || '1fr';

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  // Auto-focus rename input
  useEffect(() => {
    if (renaming) renameRef.current?.focus();
  }, [renaming]);

  function startRename() {
    setRenameValue(outfit.name);
    setRenameError(null);
    setRenaming(true);
    setMenuOpen(false);
  }

  function cancelRename() {
    setRenaming(false);
    setRenameValue(outfit.name);
    setRenameError(null);
  }

  async function commitRename() {
    const trimmed = renameValue.trim();
    if (!trimmed || trimmed === outfit.name) {
      cancelRename();
      return;
    }
    if (renameSaving) return;
    setRenameSaving(true);
    setRenameError(null);
    const result = await onRename(outfit.id, trimmed);
    setRenameSaving(false);
    if (result.ok) {
      setRenaming(false);
      setRenameError(null);
    } else {
      setRenameError(result.error ?? 'Couldn’t rename outfit');
    }
  }

  async function handleDownloadAll() {
    setMenuOpen(false);
    setDownloading(true);
    try {
      const entries = cardShots.map((s) => ({
        url: s.url,
        filename: `${s.label.toLowerCase().replace(/\s+/g, '-')}.png`,
      }));
      await downloadAsZip(outfit.name || 'outfit', entries);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div
      className={`rounded-xl border border-krea-border bg-white transition-opacity ${
        isDeleting ? 'opacity-40 pointer-events-none' : ''
      }`}
    >
      {/* Card header — single row: checkbox | title · date · tag | actions */}
      <div className="flex items-center gap-3 px-4 pt-4 pb-3">
        <label className="shrink-0 cursor-pointer" onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            checked={selected}
            onChange={() => onToggleSelect(outfit.id)}
            className="rounded border-krea-border text-krea-text focus:ring-krea-text"
          />
        </label>
        <div className="flex-1 min-w-0 flex flex-wrap items-center gap-x-2 gap-y-1.5">
          {renaming ? (
            <>
              <input
                ref={renameRef}
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onBlur={commitRename}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitRename();
                  if (e.key === 'Escape') cancelRename();
                }}
                className="min-w-[8rem] flex-1 text-sm font-medium text-krea-text bg-transparent border-b border-krea-border focus:outline-none focus:border-krea-text"
              />
              {renameError && (
                <span className="w-full text-xs text-red-600">{renameError}</span>
              )}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={commitRename}
                  disabled={
                    renameSaving ||
                    !renameValue.trim() ||
                    renameValue.trim() === outfit.name
                  }
                  className="text-xs text-white bg-krea-text hover:bg-krea-text/90 rounded px-2 py-1 transition-colors disabled:opacity-50 disabled:pointer-events-none"
                >
                  {renameSaving ? 'Saving…' : 'Save'}
                </button>
                <button
                  type="button"
                  onClick={cancelRename}
                  disabled={renameSaving}
                  className="text-xs text-krea-muted hover:text-krea-text px-2 py-1 transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            </>
          ) : (
            <>
              <span className="text-sm font-medium text-krea-text truncate">
                {outfit.name || 'Untitled'}
                {modelName && (
                  <span className="font-normal text-krea-muted"> by {modelName}</span>
                )}
              </span>
              <span className="text-krea-border shrink-0" aria-hidden>·</span>
              <span
                className="text-[11px] font-medium text-krea-muted bg-krea-border/40 rounded-md px-2 py-0.5 shrink-0"
                title="Styling direction used for this outfit"
              >
                {brandStyleLabel}
              </span>
              <span className="text-krea-border shrink-0" aria-hidden>·</span>
              <span className="text-xs text-krea-muted shrink-0">
                {new Date(outfit.createdAt).toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </span>
            </>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={handleDownloadAll}
            disabled={downloading || isInProgress}
            className="flex items-center gap-1.5 text-[11px] text-krea-muted border border-krea-border rounded-md px-2.5 py-1 hover:bg-krea-border/40 transition-colors disabled:opacity-50"
          >
            <Download className="w-3 h-3" />
            {downloading ? 'Zipping…' : 'Download all'}
          </button>

          {status === OUTFIT_STATUS.completed && (
            <ShopifyPublishButton outfit={outfit} onPublish={onPublish} />
          )}

          {/* ... menu */}
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              className="p-1.5 rounded hover:bg-krea-border/40 transition-colors"
            >
              <MoreHorizontal className="w-4 h-4 text-krea-muted" />
            </button>

            {menuOpen && (
              <div className="absolute right-0 top-full mt-1 w-40 rounded-lg border border-krea-border bg-white shadow-md z-20 py-1">
                {canRegenerate && (
                  <>
                    <button
                      type="button"
                      onClick={() => { setMenuOpen(false); onRegenerate?.(outfit.id); }}
                      className="w-full text-left px-3 py-2 text-xs text-krea-text hover:bg-krea-border/30 transition-colors flex items-center gap-2"
                    >
                      <RefreshCw className="w-3 h-3" />
                      {status === OUTFIT_STATUS.failed ? 'Try again' : 'Regenerate'}
                    </button>
                    <div className="h-px bg-krea-border my-1" />
                  </>
                )}
                <button
                  type="button"
                  onClick={startRename}
                  className="w-full text-left px-3 py-2 text-xs text-krea-text hover:bg-krea-border/30 transition-colors"
                >
                  Rename
                </button>
                {syncStatus === 'syncing' && onCancelSync && (
                  <>
                    <div className="h-px bg-krea-border my-1" />
                    <button
                      type="button"
                      onClick={() => { setMenuOpen(false); onCancelSync(outfit.id); }}
                      className="w-full text-left px-3 py-2 text-xs text-amber-600 hover:bg-amber-50 transition-colors"
                    >
                      Cancel sync
                    </button>
                  </>
                )}
                {!isInProgress && (
                  <>
                    <div className="h-px bg-krea-border my-1" />
                    <button
                      type="button"
                      onClick={() => { setMenuOpen(false); setConfirmDelete(true); }}
                      className="w-full text-left px-3 py-2 text-xs text-red-500 hover:bg-red-50 transition-colors"
                    >
                      Delete outfit
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Delete confirmation */}
      {confirmDelete && (
        <div className="mx-4 mb-3 flex items-center gap-2 rounded-lg bg-red-50 border border-red-100 px-3 py-2">
          <p className="text-xs text-red-600 flex-1">
            Delete this outfit? This can't be undone.
          </p>
          <button
            type="button"
            onClick={() => setConfirmDelete(false)}
            className="text-xs text-krea-muted hover:text-krea-text px-2 py-0.5"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => { setConfirmDelete(false); onDelete(outfit.id); }}
            className="text-xs text-white bg-red-500 hover:bg-red-600 rounded px-2 py-0.5 transition-colors"
          >
            Delete
          </button>
        </div>
      )}

      {/* In-progress banner */}
      {isInProgress && (
        <div className="mx-4 mb-2 flex items-center justify-between gap-2 rounded-lg bg-amber-50 border border-amber-100 px-3 py-2">
          <div className="flex items-center gap-2">
            <Loader2 className="w-4 h-4 text-amber-600 animate-spin shrink-0" />
            <span className="text-xs text-amber-800">
              {status === 'pending' || status === 'processing' ? 'Regenerating…' : 'Generating…'}
            </span>
          </div>
          {onCancel && (
            <button
              type="button"
              onClick={() => onCancel(outfit.id)}
              className="text-xs font-medium text-amber-800 hover:text-amber-900 underline decoration-amber-300 hover:decoration-amber-500 transition-colors shrink-0"
            >
              Cancel
            </button>
          )}
        </div>
      )}

      {/* Image grid: front model shot hero (2fr) → tq → back → flat lay */}
      <div
        className={`px-4 pb-4 grid gap-3 relative ${isInProgress ? 'pointer-events-none opacity-90' : ''}`}
        style={{
          gridTemplateColumns: gridTemplate,
          maxWidth: cardShots.length < 4 ? `${cardShots.length * 215}px` : undefined,
        }}
      >
        {cardShots.map((shot, i) => (
          <ImageTile
            key={shot.key}
            url={shot.url}
            asset={shot.asset}
            label={shot.label}
            hasVariants={shot.hasVariants}
            onLightbox={isInProgress ? () => {} : () => onLightbox(outfit.id, i)}
            isLcp={i === 0}
          />
        ))}
      </div>
      {status === OUTFIT_STATUS.failed && (outfit as { errorMessage?: string | null }).errorMessage && (
        <p className="px-4 pb-3 text-xs text-red-500">
          {(outfit as { errorMessage: string }).errorMessage}
        </p>
      )}
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function Outfits() {
  const { shop, outfits, modelNameMap, brandStyleLabelMap, isBeta } = useLoaderData<typeof loader>();
  const { revalidate } = useRevalidator();
  const authenticatedFetch = useAuthenticatedFetch();

  const prevStatusRef = useRef<Record<string, string>>({});
  useEffect(() => {
    for (const outfit of outfits) {
      const prev = prevStatusRef.current[outfit.id];
      if (prev && prev !== 'completed' && outfit.status === 'completed') {
        posthog.capture('generation_completed', { shop, outfitId: outfit.id });
      }
      prevStatusRef.current[outfit.id] = outfit.status ?? '';
    }
  }, [outfits, shop]);

  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [lightbox, setLightbox]       = useState<{ outfitId: string; index: number } | null>(null);
  const [regenerateModal, setRegenerateModal] = useState<{ outfitId: string; outfitName: string } | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);

  const closeLightbox = useCallback(() => setLightbox(null), []);

  function handleSessionExpired() {
    setSessionError(SESSION_EXPIRED_MESSAGE);
  }

  // Poll when any outfit is generating or being synced to Shopify
  const hasInProgress = outfits.some((o) => {
    const s = (o as { status?: string }).status;
    const syncS = (o as { shopifySyncStatus?: string | null }).shopifySyncStatus;
    return (s && s !== 'completed' && s !== 'failed') || syncS === 'syncing';
  });
  useEffect(() => {
    if (!hasInProgress) return;
    const interval = setInterval(() => revalidate(), 5000);
    return () => clearInterval(interval);
  }, [hasInProgress, revalidate]);

  function toggleSelect(id: string) {
    setSelectedIds((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function deleteOutfit(outfitId: string) {
    setSessionError(null);
    setDeletingIds((s) => new Set(s).add(outfitId));
    const res = await authenticatedFetch('/app/outfits', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ intent: 'delete_outfit', outfitId }),
    });
    if (!res.ok) {
      if (isSessionExpiredResponse(res)) handleSessionExpired();
      setDeletingIds((s) => { const n = new Set(s); n.delete(outfitId); return n; });
      return;
    }
    revalidate();
  }

  async function renameOutfit(
    outfitId: string,
    name: string,
  ): Promise<{ ok: boolean; error?: string }> {
    setSessionError(null);
    const res = await authenticatedFetch('/app/outfits', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ intent: 'rename_outfit', outfitId, name }),
    });
    if (!res.ok) {
      if (isSessionExpiredResponse(res)) {
        handleSessionExpired();
        return { ok: false, error: SESSION_EXPIRED_MESSAGE };
      }
      const data = await res.json().catch(() => ({})) as { error?: string };
      return { ok: false, error: data.error ?? 'Couldn’t rename outfit' };
    }
    revalidate();
    return { ok: true };
  }

  async function submitRegenerate(userDirection?: string): Promise<{ ok: boolean; error?: string }> {
    if (!regenerateModal) return { ok: false, error: 'No outfit selected' };
    setSessionError(null);
    const res = await authenticatedFetch('/app/outfits', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        intent: 'regenerate_outfit',
        outfitId: regenerateModal.outfitId,
        userDirection: userDirection || undefined,
      }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string; used?: number; limit?: number; plan?: string; message?: string };
    if (!res.ok) {
      if (isSessionExpiredResponse(res)) {
        handleSessionExpired();
        return { ok: false, error: SESSION_EXPIRED_MESSAGE };
      }
      if (res.status === 402 && data.error === 'limit_reached') {
        return { ok: false, error: data.message ?? "You've used all your generations this month. Upgrade to continue." };
      }
      return { ok: false, error: data.error ?? 'Could not regenerate. Try again.' };
    }
    revalidate();
    return { ok: true };
  }

  async function cancelSync(outfitId: string) {
    setSessionError(null);
    const res = await authenticatedFetch('/app/outfits', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ intent: 'cancel_sync', outfitId }),
    });
    if (!res.ok) {
      if (isSessionExpiredResponse(res)) handleSessionExpired();
      return;
    }
    revalidate();
  }

  async function publishOutfit(outfitId: string) {
    setSessionError(null);
    const res = await authenticatedFetch('/app/outfits', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ intent: 'publish_to_shopify', outfitId }),
    });
    if (!res.ok) {
      if (isSessionExpiredResponse(res)) handleSessionExpired();
      return;
    }
    posthog.capture('outfit_published', { shop, outfitId });
    if (isBeta) {
      posthog.capture('first_outfit_published', { shop, beta_access: true, outfit_id: outfitId });
    }
    revalidate();
  }

  async function cancelGeneration(outfitId: string) {
    setSessionError(null);
    const res = await authenticatedFetch('/app/outfits', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ intent: 'cancel_generation', outfitId }),
    });
    if (!res.ok) {
      if (isSessionExpiredResponse(res)) handleSessionExpired();
      return;
    }
    revalidate();
  }

  async function deleteSelectedOutfits() {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    setSessionError(null);
    setConfirmBulkDelete(false);
    setBulkDeleting(true);
    const res = await authenticatedFetch('/app/outfits', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ intent: 'delete_outfits', outfitIds: ids }),
    });
    setBulkDeleting(false);
    if (!res.ok) {
      if (isSessionExpiredResponse(res)) handleSessionExpired();
      return;
    }
    setSelectedIds(new Set());
    revalidate();
  }

  const lightboxOutfit = lightbox
    ? outfits.find((o) => o.id === lightbox.outfitId) ?? null
    : null;

  return (
    <div className="min-h-screen bg-krea-bg p-6">
      <div className="max-w-4xl space-y-6">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-krea-muted">
          Outfits{outfits.length > 0 ? ` — ${outfits.length}` : ''}
        </p>

        {sessionError && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {sessionError}
          </div>
        )}

        {outfits.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
            <ImageIcon className="w-10 h-10 text-krea-border" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-krea-text">No outfits yet</p>
              <p className="text-xs text-krea-muted">
                Generate your first outfit in the Dress model tab.
              </p>
            </div>
            <Link
              to="/app/dress-model"
              className="mt-2 text-xs text-krea-text border border-krea-border rounded-md px-4 py-2 hover:bg-krea-border/40 transition-colors"
            >
              Create your first outfit
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {selectedIds.size > 0 && (
              <div className="flex flex-wrap items-center gap-3 rounded-lg border border-krea-border bg-white px-4 py-3">
                <span className="text-sm text-krea-text">
                  {selectedIds.size} selected
                </span>
                <button
                  type="button"
                  onClick={() => setSelectedIds(new Set())}
                  className="text-xs text-krea-muted hover:text-krea-text transition-colors"
                >
                  Clear selection
                </button>
                {!confirmBulkDelete ? (
                  <button
                    type="button"
                    onClick={() => setConfirmBulkDelete(true)}
                    className="flex items-center gap-1.5 text-xs text-red-600 hover:text-red-700 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Delete selected
                  </button>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-red-600">
                      Delete {selectedIds.size} outfits? This can&apos;t be undone.
                    </span>
                    <button
                      type="button"
                      onClick={() => setConfirmBulkDelete(false)}
                      className="text-xs text-krea-muted hover:text-krea-text px-2 py-0.5"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={deleteSelectedOutfits}
                      disabled={bulkDeleting}
                      className="text-xs text-white bg-red-500 hover:bg-red-600 rounded px-2 py-0.5 transition-colors disabled:opacity-50"
                    >
                      {bulkDeleting ? 'Deleting…' : 'Delete'}
                    </button>
                  </div>
                )}
              </div>
            )}
            {outfits.map((outfit) => (
              <OutfitCard
                key={outfit.id}
                outfit={outfit}
                modelName={modelNameMap[outfit.modelId] ?? undefined}
                brandStyleLabel={
                  brandStyleLabelMap[(outfit as { brandStyleId?: string }).brandStyleId ?? 'minimal'] ??
                  'Minimal Clarity'
                }
                isDeleting={deletingIds.has(outfit.id)}
                selected={selectedIds.has(outfit.id)}
                onDelete={deleteOutfit}
                onRename={renameOutfit}
                onToggleSelect={toggleSelect}
                onLightbox={(id, idx) => setLightbox({ outfitId: id, index: idx })}
                onRegenerate={() => setRegenerateModal({ outfitId: outfit.id, outfitName: outfit.name || 'Untitled' })}
                onCancel={cancelGeneration}
                onPublish={publishOutfit}
                onCancelSync={cancelSync}
              />
            ))}
          </div>
        )}
      </div>

      {lightboxOutfit && lightbox && (
        <Lightbox
          outfit={lightboxOutfit}
          initialIndex={lightbox.index}
          onClose={closeLightbox}
        />
      )}

      {regenerateModal && (
        <RegenerateModal
          outfitName={regenerateModal.outfitName}
          onClose={() => setRegenerateModal(null)}
          onSubmit={(userDirection) => submitRegenerate(userDirection)}
        />
      )}
    </div>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
