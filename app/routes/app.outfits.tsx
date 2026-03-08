import { useState } from 'react';
import { useLoaderData, useRouteError, useRevalidator } from 'react-router';
import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from 'react-router';
import { boundary } from '@shopify/shopify-app-react-router/server';
import { Download, Trash2 } from 'lucide-react';
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

  return { outfits };
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

  return Response.json({ error: 'Unknown intent' }, { status: 400 });
};

// ── Component ─────────────────────────────────────────────────────────────────

const POSE_LABEL: Record<string, string> = {
  front: 'Front',
  'three-quarter': 'Three-quarter',
  back: 'Back',
};

export default function Outfits() {
  const { outfits } = useLoaderData<typeof loader>();
  const { revalidate } = useRevalidator();
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function deleteOutfit(outfitId: string) {
    setDeleteError(null);
    const res = await fetch('/app/outfits', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ intent: 'delete_outfit', outfitId }),
    });
    if (!res.ok) {
      setDeleteError('Failed to delete outfit. Please try again.');
      return;
    }
    revalidate();
  }

  return (
    <div className="min-h-screen bg-krea-bg p-6">
      <div className="max-w-4xl space-y-6">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-krea-muted">
            Outfits{outfits.length > 0 ? ` — ${outfits.length}` : ''}
          </p>
        </div>

        {deleteError && (
          <p className="text-xs text-red-500">{deleteError}</p>
        )}

        {outfits.length === 0 ? (
          <p className="text-sm text-krea-muted">No saved outfits yet. Generate some in the Dress model tab.</p>
        ) : (
          <div className="space-y-8">
            {outfits.map((outfit) => {
              const front = outfit.images.find((img) => img.pose === 'front');
              const tq    = outfit.images.find((img) => img.pose === 'three-quarter');
              const back  = outfit.images.find((img) => img.pose === 'back');
              const shots = [front, tq, back].filter(Boolean) as typeof outfit.images;

              return (
                <div key={outfit.id} className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-krea-text">{outfit.name || 'Untitled'}</p>
                      <p className="text-xs text-krea-muted">
                        {new Date(outfit.createdAt).toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => deleteOutfit(outfit.id)}
                      className="p-1.5 rounded hover:bg-krea-border/40 transition-colors"
                      title="Delete outfit"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-krea-muted hover:text-red-500" />
                    </button>
                  </div>
                  <div className="grid grid-cols-4 gap-3">
                    {outfit.cleanFlatLayUrl && (
                      <div className="space-y-1.5">
                        <div className="aspect-[2/3] rounded-lg overflow-hidden border border-krea-border bg-white">
                          <img src={outfit.cleanFlatLayUrl} alt="Flat lay" className="w-full h-full object-contain" />
                        </div>
                        <div className="flex items-center justify-between">
                          <p className="text-[10px] text-krea-muted">Flat lay</p>
                          <a href={outfit.cleanFlatLayUrl} download className="p-1 rounded hover:bg-krea-border/40">
                            <Download className="w-3.5 h-3.5 text-krea-muted" />
                          </a>
                        </div>
                      </div>
                    )}
                    {shots.map((img) => (
                      <div key={img.id} className="space-y-1.5">
                        <div className="aspect-[2/3] rounded-lg overflow-hidden border border-krea-border bg-white">
                          <img
                            src={img.imageUrl}
                            alt={POSE_LABEL[img.pose] ?? img.pose}
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <div className="flex items-center justify-between">
                          <p className="text-[10px] text-krea-muted">{POSE_LABEL[img.pose] ?? img.pose}</p>
                          <a href={img.imageUrl} download className="p-1 rounded hover:bg-krea-border/40">
                            <Download className="w-3.5 h-3.5 text-krea-muted" />
                          </a>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
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
