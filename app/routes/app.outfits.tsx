import { readFileSync } from 'fs';
import { join } from 'path';
import { useState, useRef, useEffect, useCallback } from 'react';
import { useLoaderData, useRouteError, useRevalidator, Link } from 'react-router';
import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from 'react-router';
import { boundary } from '@shopify/shopify-app-react-router/server';
import {
  Download, MoreHorizontal, ZoomIn, X,
  ChevronLeft, ChevronRight, Image as ImageIcon,
} from 'lucide-react';
import { zipSync } from 'fflate';
import { useAuthenticatedFetch } from '../contexts/AuthenticatedFetchContext';
import { authenticate } from '../shopify.server';
import prisma from '../db.server';

// ── Loader ─────────────────────────────────────────────────────────────────────

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const outfits = await prisma.outfit.findMany({
    where: { shopId: shop },
    include: { images: true },
    orderBy: { createdAt: 'desc' },
  });

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

  return { outfits, modelNameMap };
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
  label,
  onLightbox,
}: {
  url: string;
  label: string;
  onLightbox: () => void;
}) {
  return (
    <div>
      <div
        className="group relative h-[300px] rounded-lg overflow-hidden border border-krea-border bg-white cursor-pointer"
        onClick={onLightbox}
      >
        <img src={url} alt={label} className="w-full h-full object-contain" />
        {/* Overlay: always visible on mobile, hover-only on md+ */}
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

  const images: Array<{ url: string; label: string }> = [
    ...(front ? [{ url: front.imageUrl, label: 'Front'         }] : []),
    ...(tq    ? [{ url: tq.imageUrl,    label: 'Three-quarter' }] : []),
    ...(back  ? [{ url: back.imageUrl,  label: 'Back'          }] : []),
    ...(outfit.cleanFlatLayUrl ? [{ url: outfit.cleanFlatLayUrl, label: 'Flat lay' }] : []),
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
          <img
            key={current.url}
            src={current.url}
            alt={current.label}
            className="max-w-full object-contain rounded-lg"
            style={{ maxHeight: 'calc(100vh - 200px)' }}
          />
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

// ── OutfitCard ─────────────────────────────────────────────────────────────────

function OutfitCard({
  outfit,
  modelName,
  isDeleting,
  onDelete,
  onRename,
  onLightbox,
}: {
  outfit: OutfitWithImages;
  modelName: string | undefined;
  isDeleting: boolean;
  onDelete: (id: string) => void;
  onRename: (id: string, name: string) => Promise<void>;
  onLightbox: (outfitId: string, index: number) => void;
}) {
  const [menuOpen, setMenuOpen]         = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [renaming, setRenaming]         = useState(false);
  const [renameValue, setRenameValue]   = useState(outfit.name);
  const [downloading, setDownloading]   = useState(false);
  const menuRef   = useRef<HTMLDivElement>(null);
  const renameRef = useRef<HTMLInputElement>(null);

  // Ordered shots: front is hero, then tq, back, flat lay (smallest)
  type CardShot = { url: string; label: string; key: string; size: 'hero' | 'normal' | 'small' };
  const front = outfit.images.find((img) => img.pose === 'front');
  const tq    = outfit.images.find((img) => img.pose === 'three-quarter');
  const back  = outfit.images.find((img) => img.pose === 'back');

  const cardShots: CardShot[] = [
    ...(front ? [{ url: front.imageUrl, label: 'Front',         key: front.id,    size: 'hero'   as const }] : []),
    ...(tq    ? [{ url: tq.imageUrl,    label: 'Three-quarter', key: tq.id,        size: 'normal' as const }] : []),
    ...(back  ? [{ url: back.imageUrl,  label: 'Back',          key: back.id,      size: 'normal' as const }] : []),
    ...(outfit.cleanFlatLayUrl
      ? [{ url: outfit.cleanFlatLayUrl, label: 'Flat lay', key: 'flat-lay', size: 'small' as const }]
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
    setRenaming(true);
    setMenuOpen(false);
  }

  async function commitRename() {
    const trimmed = renameValue.trim();
    setRenaming(false);
    if (trimmed && trimmed !== outfit.name) {
      await onRename(outfit.id, trimmed);
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
      {/* Card header */}
      <div className="flex items-start justify-between px-4 pt-4 pb-3">
        <div className="flex-1 min-w-0 mr-3">
          {renaming ? (
            <input
              ref={renameRef}
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitRename();
                if (e.key === 'Escape') setRenaming(false);
              }}
              className="w-full text-sm font-medium text-krea-text bg-transparent border-b border-krea-border focus:outline-none focus:border-krea-text"
            />
          ) : (
            <p className="text-sm font-medium text-krea-text truncate">
              {outfit.name || 'Untitled'}
              {modelName && (
                <span className="font-normal text-krea-muted"> by {modelName}</span>
              )}
            </p>
          )}
          <p className="text-xs text-krea-muted mt-0.5">
            {new Date(outfit.createdAt).toLocaleDateString(undefined, {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })}
          </p>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={handleDownloadAll}
            disabled={downloading}
            className="flex items-center gap-1.5 text-[11px] text-krea-muted border border-krea-border rounded-md px-2.5 py-1 hover:bg-krea-border/40 transition-colors disabled:opacity-50"
          >
            <Download className="w-3 h-3" />
            {downloading ? 'Zipping…' : 'Download all'}
          </button>

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
                <button
                  type="button"
                  onClick={startRename}
                  className="w-full text-left px-3 py-2 text-xs text-krea-text hover:bg-krea-border/30 transition-colors"
                >
                  Rename
                </button>
                <div className="h-px bg-krea-border my-1" />
                <button
                  type="button"
                  onClick={() => { setMenuOpen(false); setConfirmDelete(true); }}
                  className="w-full text-left px-3 py-2 text-xs text-red-500 hover:bg-red-50 transition-colors"
                >
                  Delete outfit
                </button>
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

      {/* Image grid: front model shot hero (2fr) → tq → back → flat lay */}
      <div
        className="px-4 pb-4 grid gap-3"
        style={{
          gridTemplateColumns: gridTemplate,
          maxWidth: cardShots.length < 4 ? `${cardShots.length * 215}px` : undefined,
        }}
      >
        {cardShots.map((shot, i) => (
          <ImageTile
            key={shot.key}
            url={shot.url}
            label={shot.label}
            onLightbox={() => onLightbox(outfit.id, i)}
          />
        ))}
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function Outfits() {
  const { outfits, modelNameMap } = useLoaderData<typeof loader>();
  const { revalidate } = useRevalidator();
  const authenticatedFetch = useAuthenticatedFetch();

  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
  const [lightbox, setLightbox]       = useState<{ outfitId: string; index: number } | null>(null);

  const closeLightbox = useCallback(() => setLightbox(null), []);

  async function deleteOutfit(outfitId: string) {
    setDeletingIds((s) => new Set(s).add(outfitId));
    const res = await authenticatedFetch('/app/outfits', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ intent: 'delete_outfit', outfitId }),
    });
    if (!res.ok) {
      setDeletingIds((s) => { const n = new Set(s); n.delete(outfitId); return n; });
      return;
    }
    revalidate();
  }

  async function renameOutfit(outfitId: string, name: string) {
    await authenticatedFetch('/app/outfits', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ intent: 'rename_outfit', outfitId, name }),
    });
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
            {outfits.map((outfit) => (
              <OutfitCard
                key={outfit.id}
                outfit={outfit}
                modelName={modelNameMap[outfit.modelId] ?? undefined}
                isDeleting={deletingIds.has(outfit.id)}
                onDelete={deleteOutfit}
                onRename={renameOutfit}
                onLightbox={(id, idx) => setLightbox({ outfitId: id, index: idx })}
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
    </div>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
