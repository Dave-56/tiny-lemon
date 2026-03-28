import { useState, useRef, useEffect, useCallback } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import {
  useLoaderData,
  useRouteError,
  useSearchParams,
  useLocation,
  useNavigate,
  useBlocker,
  useBeforeUnload,
  Link,
} from "react-router";
import { usePendingItems } from "../contexts/PendingItemsContext";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { GeneratedPoseImage } from "../components/GeneratedPoseImage";
import { useAuthenticatedFetch } from "../contexts/AuthenticatedFetchContext";
import {
  X,
  Download,
  Loader2,
  Plus,
  AlertTriangle,
  CheckCircle,
  XCircle,
} from "lucide-react";
import { zipSync } from "fflate";
import { getCachedFlatLay, setCachedFlatLay } from "../lib/flatlayCache";
import type { PresetModelEntry } from "../lib/types";
import { BRAND_STYLE_PRESETS } from "../lib/pdpPresets";
import { authenticate } from "../shopify.server";
import prisma, { ensureShop } from "../db.server";
import {
  getEffectiveEntitlements,
  getMonthlyUsage,
} from "../lib/billing.server";
import { getSupportEmail } from "../lib/support.server";
import { handleTriggerGeneration } from "../lib/triggerGeneration.server";
import {
  isSessionExpiredResponse,
  SESSION_EXPIRED_MESSAGE,
} from "../lib/authenticatedRequest.client";
import posthog from "posthog-js";

// ── Loader ────────────────────────────────────────────────────────────────────

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  await ensureShop(shop);

  const [brandStyle, entitlements, used, customModels, wouldUseLive] =
    await Promise.all([
      prisma.brandStyle.findUnique({ where: { shopId: shop } }),
      getEffectiveEntitlements(shop),
      getMonthlyUsage(shop),
      prisma.model.findMany({
        where: { shopId: shop, isPreset: false },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          name: true,
          gender: true,
          ethnicity: true,
          imageUrl: true,
          height: true,
          bodyBuild: true,
        },
      }),
      prisma.betaFeedback.findFirst({
        where: { shopId: shop, category: "would_use_live" },
        select: { id: true },
      }),
    ]);

  return {
    shop,
    brandStyleId: brandStyle?.brandStyleId ?? BRAND_STYLE_PRESETS[0].id,
    plan: entitlements.publicPlan,
    used,
    limit: entitlements.effectiveLimit,
    angles: entitlements.effectiveAngles,
    isBeta: entitlements.isBeta,
    supportEmail: getSupportEmail(),
    wouldUseLiveCaptured: Boolean(wouldUseLive),
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
  if (intent === "trigger_generation") {
    return handleTriggerGeneration(shopId, {
      skuName: (body.skuName as string) || "Untitled",
      modelId: body.modelId as string,
      modelImageUrl: body.modelImageUrl as string,
      modelHeight: body.modelHeight as string | undefined,
      modelGender: body.modelGender as string | undefined,
      styleId: (body.styleId as string) ?? "white-studio",
      brandStyleId: (body.brandStyleId as string) ?? "minimal",
      frontB64: body.frontB64 as string,
      frontMime: (body.frontMime as string) ?? "image/png",
      backB64: body.backB64 as string | null,
      backMime: body.backMime as string | null,
    });
  }

  // ── poll_status ──────────────────────────────────────────────────────────────
  if (intent === "poll_status") {
    const outfitId = body.outfitId as string;
    const outfit = await prisma.outfit.findFirst({
      where: { id: outfitId, shopId },
      select: {
        status: true,
        errorMessage: true,
        images: {
          select: { id: true, pose: true, imageUrl: true, assetManifest: true },
        },
      },
    });
    if (!outfit) return Response.json({ error: "Not found" }, { status: 404 });
    return Response.json({
      status: outfit.status,
      errorMessage: outfit.errorMessage ?? null,
      images: outfit.images,
    });
  }

  // ── delete_outfit ────────────────────────────────────────────────────────────
  if (intent === "delete_outfit") {
    const outfitId = body.outfitId as string;
    const outfit = await prisma.outfit.findFirst({
      where: { id: outfitId, shopId },
    });
    if (!outfit) return Response.json({ error: "Not found" }, { status: 404 });
    await prisma.outfit.delete({ where: { id: outfitId } });
    return Response.json({ ok: true });
  }

  return Response.json({ error: "Unknown intent" }, { status: 400 });
};

// ── Utilities ─────────────────────────────────────────────────────────────────

function readFileAsBase64(
  file: File,
): Promise<{ base64: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
      if (match) resolve({ base64: match[2], mimeType: match[1] });
      else reject(new Error("Failed to read file"));
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function nanoid() {
  return Math.random().toString(36).slice(2, 9);
}

// --- Worker-based downscale + hash -------------------------------------------------
let flatlayWorker: Worker | null = null;
function getFlatlayWorker(): Worker {
  if (!flatlayWorker) {
    flatlayWorker = new Worker(
      new URL("../workers/flatlayWorker.ts", import.meta.url),
      { type: "module" },
    );
  }
  return flatlayWorker;
}

async function downscaleAndHash(
  file: File,
): Promise<{
  bytes: ArrayBuffer;
  mimeType: string;
  contentHash: string;
  width: number;
  height: number;
}> {
  const worker = getFlatlayWorker();
  const id = Math.random().toString(36).slice(2);
  const ab = await file.arrayBuffer();
  return new Promise((resolve, reject) => {
    const onMessage = (e: MessageEvent) => {
      const data = e.data as any;
      if (data.id !== id) return;
      worker.removeEventListener("message", onMessage);
      if (data.ok)
        resolve({
          bytes: data.bytes,
          mimeType: data.mimeType,
          contentHash: data.contentHash,
          width: data.width,
          height: data.height,
        });
      else reject(new Error(data.error || "worker_error"));
    };
    worker.addEventListener("message", onMessage);
    worker.postMessage({ id, arrayBuffer: ab, mimeType: file.type }, [ab]);
  });
}

// Remote flat-lay validation via API; fail-open on errors/auth issues.
async function validateFlatLayRemote(
  authenticatedFetch: ReturnType<typeof useAuthenticatedFetch>,
  file: File,
): Promise<FlatLayQuality | null> {
  try {
    const t0 = performance.now();
    const {
      bytes: rawBytes,
      mimeType,
      contentHash,
      width,
      height,
    } = await downscaleAndHash(file).catch(async () => ({
      bytes: await file.arrayBuffer(),
      mimeType: file.type || "image/jpeg",
      contentHash: "",
      width: 0,
      height: 0,
    }));

    // Client cache: instant result if present (still refresh in background)
    const cached = contentHash ? getCachedFlatLay(contentHash) : null;
    let qualityFromCache: FlatLayQuality | null = null;
    if (cached) {
      qualityFromCache = cached.quality;
    }

    const b64 = (() => {
      const arr = new Uint8Array(rawBytes as ArrayBuffer);
      let binary = "";
      const CHUNK = 0x8000;
      for (let i = 0; i < arr.length; i += CHUNK) {
        binary += String.fromCharCode.apply(
          null,
          Array.from(arr.subarray(i, i + CHUNK)) as unknown as number[],
        );
      }
      return btoa(binary);
    })();

    const res = await authenticatedFetch("/api/validate-flatlay", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageB64: b64, mimeType }),
    });
    if (!res.ok) {
      return qualityFromCache; // fail-open; keep cached if any
    }
    const data = (await res.json()) as {
      schemaVersion?: string;
      model?: string;
      contentHash?: string;
      quality?: FlatLayQuality;
      reasons?: string[];
      score?: number | null;
      count?: number | null;
      warnMode?: boolean;
      cacheHit?: boolean;
    };
    if (data.schemaVersion === "1" && data.quality && data.contentHash) {
      setCachedFlatLay({
        schemaVersion: "1",
        model: data.model || "unknown",
        contentHash: data.contentHash,
        quality: data.quality,
        reasons: data.reasons,
        score: data.score ?? null,
        count: data.count ?? null,
        at: Date.now(),
      } as any);
    }
    try {
      if (data.quality) {
        posthog.capture("flatlay_validated", {
          quality: data.quality,
          score: typeof data.score === "number" ? data.score : undefined,
          reason: data.reasons?.[0],
          size: file.size,
          mime: file.type,
          downscaled_w: width,
          downscaled_h: height,
          latency_ms: Math.round(performance.now() - t0),
          cacheHit: data.cacheHit,
          model: data.model,
          schemaVersion: data.schemaVersion,
          warnMode: data.warnMode,
        });
      }
    } catch {}
    return data.quality ?? qualityFromCache;
  } catch {
    return null;
  }
}

function generateThumbnail(file: File): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const SIZE = 60;
      const scale = Math.min(1, SIZE / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", 0.7));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve("");
    };
    img.src = url;
  });
}

async function downloadAllAsZip(items: BatchItem[]) {
  const doneItems = items.filter(
    (i) => i.status === "done" && i.results.length > 0,
  );
  if (!doneItems.length) return;

  const entries = doneItems.flatMap((item) => [
    ...(item.cleanPreview
      ? [
          {
            url: item.cleanPreview,
            name: `${item.skuName || "sku"}-flat-lay.png`,
          },
        ]
      : []),
    ...item.results.map((s) => ({
      url: s.url,
      name: `${item.skuName || "sku"}-${s.angleId}.png`,
    })),
  ]);

  const fetched = await Promise.all(
    entries.map(async ({ url, name }) => {
      try {
        const res = await fetch(url);
        return [name, new Uint8Array(await res.arrayBuffer())] as const;
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
  const a = document.createElement("a");
  a.href = URL.createObjectURL(
    new Blob([zipped.buffer as ArrayBuffer], { type: "application/zip" }),
  );
  a.download = "tiny-lemon-exports.zip";
  a.click();
  URL.revokeObjectURL(a.href);
}

// ── Types ─────────────────────────────────────────────────────────────────────

type ItemStatus =
  | "pending"
  | "creating" // POST in flight (waiting for outfitId)
  | "processing"
  | "generating_front"
  | "generating_tq"
  | "generating_back"
  | "generating_poses" // 3/4 + back running in parallel
  | "done"
  | "error"
  | "submitted"; // job was triggered but polling was lost (e.g. session expired mid-poll)

interface ResultShot {
  angleId: string;
  label: string;
  url: string;
  asset?: unknown;
}

type FlatLayQuality = "good" | "warn" | "fail";

interface BatchItem {
  id: string;
  frontFile: File;
  frontPreview: string;
  backFile: File | null;
  backPreview: string | null;
  skuName: string;
  status: ItemStatus;
  cleanPreview: string | null;
  thumbnail: string | null;
  results: ResultShot[];
  error: string | null;
  savedOutfitId: string | null;
  savedShopId: string | null;
  quality: FlatLayQuality | null;
}

// Serializable subset of BatchItem stored in sessionStorage.
// Excludes File objects (unserializable) and blob: preview URLs (tab-lived).
type PersistedItem = Omit<
  BatchItem,
  "frontFile" | "frontPreview" | "backFile" | "backPreview"
>;

const SESSION_KEY = (shop: string) => `dress-model-items-${shop}`;

const MAX_BATCH = 10;

const STATUS_LABEL: Record<ItemStatus, string> = {
  pending: "Uploaded",
  creating: "Creating outfit…",
  processing: "Starting…",
  generating_front: "Generating front",
  generating_tq: "Generating three-quarter",
  generating_back: "Generating back",
  generating_poses: "Generating poses",
  submitted: "Submitted",
  done: "Done",
  error: "Error",
};

const POSE_LABEL: Record<string, string> = {
  front: "Front",
  "three-quarter": "Three-quarter",
  back: "Back",
};

const UPGRADE_MSG =
  "You've used all your generations this month. Upgrade to continue.";
const BETA_LIMIT_MSG =
  "You've used your beta allocation for now. Contact us if you need more access.";

function ErrorMsg({
  msg,
  isBeta,
  supportEmail,
}: {
  msg: string;
  isBeta: boolean;
  supportEmail: string;
}) {
  if (msg === UPGRADE_MSG) {
    return (
      <span>
        You&apos;ve used all your generations this month.{" "}
        <Link to="/app/billing" className="underline font-medium">
          Upgrade to continue
        </Link>
        .
      </span>
    );
  }
  if (isBeta && msg === BETA_LIMIT_MSG) {
    return (
      <span>
        You&apos;ve used your beta allocation for now.{" "}
        <a
          href={`mailto:${supportEmail}?subject=${encodeURIComponent("TinyLemon beta access")}`}
          className="underline font-medium"
        >
          Contact us
        </a>{" "}
        if you need more access.
      </span>
    );
  }
  return <>{msg}</>;
}

const ACTIVE_STATUSES: ItemStatus[] = [
  "creating",
  "processing",
  "generating_front",
  "generating_tq",
  "generating_back",
  "generating_poses",
];

const WOULD_USE_LIVE_DELAY_MS = 15_000;

// ── Component ─────────────────────────────────────────────────────────────────

export default function DressModel() {
  const {
    shop,
    brandStyleId,
    customModels,
    isBeta,
    supportEmail,
    wouldUseLiveCaptured,
  } = useLoaderData<typeof loader>();
  const authenticatedFetch = useAuthenticatedFetch();
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const pendingItemsCtx = usePendingItems();

  const [presetModels, setPresetModels] = useState<PresetModelEntry[]>([]);
  // Priority: URL param > router state (passed from brand-style) > context (survived nav) > first custom model
  const [selectedModelId, setSelectedModelId] = useState<string | null>(
    searchParams.get("model") ??
      (location.state as { model?: string } | null)?.model ??
      pendingItemsCtx.selectedModelId ??
      customModels[0]?.id ??
      null,
  );
  const [modelTab, setModelTab] = useState<"mine" | "presets">(
    customModels.length > 0 ? "mine" : "presets",
  );

  // Updates React state, URL param, and layout-level context so selection survives navigation
  const selectModel = useCallback(
    (id: string) => {
      setSelectedModelId(id);
      pendingItemsCtx.setSelectedModelId(id);
      setSearchParams(
        (prev) => {
          prev.set("model", id);
          return prev;
        },
        { replace: true },
      );
    },
    [setSearchParams, pendingItemsCtx],
  );
  const [previewModel, setPreviewModel] = useState<PresetModelEntry | null>(
    null,
  );
  const [items, setItems] = useState<BatchItem[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [wouldUseLivePrompt, setWouldUseLivePrompt] = useState<{
    outfitId: string;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const backInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const selectedCardRef = useRef<HTMLDivElement | null>(null);
  const firstFlatlayTrackedRef = useRef(false);
  const firstGenerationTriggeredRef = useRef(false);
  const firstGenerationCompletedRef = useRef(false);
  const wouldUseLiveHandledRef = useRef(wouldUseLiveCaptured);
  const wouldUseLiveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  // Keep a ref to items so the polling interval reads fresh state without
  // being listed as a dependency (avoids clearing/recreating the interval on every state update).
  const itemsRef = useRef(items);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  // Track consecutive poll failures per item to surface errors after repeated failures
  const pollFailuresRef = useRef<Record<string, number>>({});

  const clearWouldUseLiveTimeout = useCallback(() => {
    if (wouldUseLiveTimeoutRef.current) {
      clearTimeout(wouldUseLiveTimeoutRef.current);
      wouldUseLiveTimeoutRef.current = null;
    }
  }, []);

  useEffect(() => {
    fetch("/preset-models.json")
      .then((r) => r.json())
      .then((data: PresetModelEntry[]) => {
        setPresetModels(data);
        // Only default to first preset if nothing is already selected (no custom models, no URL param)
        if (data[0] && !customModels.length && !searchParams.get("model"))
          selectModel(data[0].id);
      })
      .catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Scroll the selected model card into view when selection changes,
  // and keep the layout-level context in sync so it survives navigation.
  useEffect(() => {
    selectedCardRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "center",
    });
    if (selectedModelId) pendingItemsCtx.setSelectedModelId(selectedModelId);
  }, [selectedModelId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Session persistence ───────────────────────────────────────────────────────

  // On mount: normalize location.state.model → URL param and clear state.
  // URL param wins if both are present (deep link / back-forward takes priority).
  useEffect(() => {
    const stateModel = (location.state as { model?: string } | null)?.model;
    if (!stateModel) return;
    const params = new URLSearchParams(location.search);
    if (!params.get("model")) params.set("model", stateModel);
    navigate(`${location.pathname}?${params.toString()}`, {
      replace: true,
      state: null,
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // On mount: merge pending entries (from context, survived route change) with the
  // most recently submitted item (from sessionStorage). Called once; both sources
  // are read synchronously so a single setItems avoids a double-render.
  useEffect(() => {
    const merged: BatchItem[] = [];
    const seenIds = new Set<string>();

    // 1. Pending entries (uploaded files kept alive in the layout-level context)
    for (const entry of pendingItemsCtx.entries) {
      if (seenIds.has(entry.id)) continue;
      seenIds.add(entry.id);
      merged.push({
        id: entry.id,
        frontFile: entry.file,
        frontPreview: URL.createObjectURL(entry.file),
        backFile: entry.backFile,
        backPreview: entry.backFile
          ? URL.createObjectURL(entry.backFile)
          : null,
        skuName: entry.skuName,
        status: "pending",
        cleanPreview: null,
        thumbnail: null,
        results: [],
        error: null,
        savedOutfitId: null,
        savedShopId: null,
        quality: entry.quality,
      });
    }

    // 2. Most recently submitted item (generating or done) from sessionStorage
    try {
      const raw = sessionStorage.getItem(SESSION_KEY(shop));
      if (raw) {
        const stored = JSON.parse(raw) as PersistedItem;
        if (stored?.savedOutfitId && !seenIds.has(stored.id)) {
          merged.push({
            ...stored,
            frontFile: new File([], stored.skuName), // dummy — never read after savedOutfitId exists
            frontPreview: stored.cleanPreview ?? stored.thumbnail ?? "", // CDN URL for done items; thumbnail for in-progress
            backFile: null,
            backPreview: null,
          });
        }
      }
    } catch {
      // corrupt storage, ignore
    }

    if (merged.length > 0) setItems(merged);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync pending items (real files, not dummy-restored ones) to the layout context
  // whenever items change, so they survive navigation to other routes.
  // Skip the first call to avoid clearing the context before the restore runs.
  const hasSyncedCtxRef = useRef(false);
  useEffect(() => {
    if (!hasSyncedCtxRef.current) {
      hasSyncedCtxRef.current = true;
      return;
    }
    // Only items with a real File (size > 0) are pending entries — dummies from
    // sessionStorage restore have size 0 and must not overwrite the context.
    const realPending = items.filter(
      (i) =>
        i.status === "pending" &&
        i.savedOutfitId === null &&
        i.frontFile.size > 0,
    );
    const pendingIds = new Set(realPending.map((i) => i.id));
    realPending.forEach((item) =>
      pendingItemsCtx.upsert({
        id: item.id,
        file: item.frontFile,
        backFile: item.backFile,
        skuName: item.skuName,
        quality: item.quality,
      }),
    );
    // Remove context entries that no longer exist in items (user removed them)
    pendingItemsCtx.entries.forEach((e) => {
      if (!pendingIds.has(e.id)) pendingItemsCtx.remove(e.id);
    });
  }, [items]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync the single most-recently-submitted item to sessionStorage.
  // Excludes failed items. Keeps only 1 — completed items live in the Outfits route.
  const hasSyncedStorageRef = useRef(false);
  useEffect(() => {
    if (!hasSyncedStorageRef.current) {
      hasSyncedStorageRef.current = true;
      return;
    }
    const latest = [...items]
      .reverse()
      .find((i) => i.savedOutfitId !== null && i.status !== "error");
    if (latest) {
      const {
        id,
        skuName,
        status,
        cleanPreview,
        thumbnail,
        results,
        error,
        savedOutfitId,
        savedShopId,
        quality,
      } = latest;
      sessionStorage.setItem(
        SESSION_KEY(shop),
        JSON.stringify({
          id,
          skuName,
          status,
          cleanPreview,
          thumbnail,
          results,
          error,
          savedOutfitId,
          savedShopId,
          quality,
        }),
      );
    } else {
      sessionStorage.removeItem(SESSION_KEY(shop));
    }
  }, [items, shop]); // eslint-disable-line react-hooks/exhaustive-deps

  const addFiles = useCallback(
    (files: FileList | File[]) => {
      const arr = Array.from(files).filter((f) => f.type.startsWith("image/"));
      const slots = MAX_BATCH - items.length;
      const toAdd = arr.slice(0, slots);
      const newItems: BatchItem[] = toAdd.map((file) => ({
        id: nanoid(),
        frontFile: file,
        frontPreview: URL.createObjectURL(file),
        backFile: null,
        backPreview: null,
        skuName: file.name.replace(/\.[^.]+$/, "").replace(/[-_]/g, " "),
        status: "pending",
        cleanPreview: null,
        thumbnail: null,
        results: [],
        error: null,
        savedOutfitId: null,
        savedShopId: null,
        quality: null,
      }));
      setItems((prev) => [...prev, ...newItems]);
      if (isBeta && newItems.length > 0 && !firstFlatlayTrackedRef.current) {
        firstFlatlayTrackedRef.current = true;
        posthog.capture("first_flatlay_uploaded", { shop, beta_access: true });
      }

      // Run quality validation and thumbnail generation asynchronously after items are added
      newItems.forEach((item, idx) => {
        // Stagger validations slightly to avoid burst
        setTimeout(() => {
          validateFlatLayRemote(authenticatedFetch, item.frontFile).then(
            (quality) => {
              setItems((prev) =>
                prev.map((i) =>
                  i.id === item.id ? { ...i, quality: quality ?? null } : i,
                ),
              );
            },
          );
        }, idx * 200);

        generateThumbnail(item.frontFile).then((thumbnail) => {
          setItems((prev) =>
            prev.map((i) => (i.id === item.id ? { ...i, thumbnail } : i)),
          );
        });
      });
    },
    [items.length, authenticatedFetch, isBeta, shop],
  );

  const removeItem = (id: string) =>
    setItems((prev) => prev.filter((i) => i.id !== id));
  const updateSkuName = (id: string, name: string) =>
    setItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, skuName: name } : i)),
    );
  const updateItem = (id: string, patch: Partial<BatchItem>) =>
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  const addBackFile = (id: string, file: File) =>
    setItems((prev) =>
      prev.map((i) =>
        i.id === id
          ? { ...i, backFile: file, backPreview: URL.createObjectURL(file) }
          : i,
      ),
    );

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };
  const onDragLeave = () => setIsDragging(false);
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
  };

  // ── Nav guard ────────────────────────────────────────────────────────────────
  // Block internal navigation when pending uploads exist or a generation is in-flight.
  // Pending items survive SPA navigation via the context, but the user should still
  // be warned when generating so they know results are running server-side.

  const hasPending = pendingItemsCtx.entries.length > 0;

  const blocker = useBlocker(hasPending || isRunning);

  useBeforeUnload(
    useCallback(
      (e: BeforeUnloadEvent) => {
        if (hasPending || isRunning) e.preventDefault();
      },
      [hasPending, isRunning],
    ),
  );

  // ── Polling ──────────────────────────────────────────────────────────────────

  const isPolling = items.some((i) =>
    (ACTIVE_STATUSES as string[]).includes(i.status),
  );

  useEffect(() => {
    if (!isPolling) return;

    const interval = setInterval(async () => {
      const active = itemsRef.current.filter(
        (i) =>
          (ACTIVE_STATUSES as string[]).includes(i.status) && i.savedOutfitId,
      );
      if (!active.length) return;

      await Promise.all(
        active.map(async (item) => {
          try {
            // Use the public status endpoint — no Shopify auth required on every tick.
            const shopParam = item.savedShopId
              ? `?shop=${encodeURIComponent(item.savedShopId)}`
              : "";
            const res = await fetch(
              `/api/outfit-status/${item.savedOutfitId}${shopParam}`,
            );
            if (!res.ok) {
              const failures = (pollFailuresRef.current[item.id] ?? 0) + 1;
              pollFailuresRef.current[item.id] = failures;
              if (failures >= 3) {
                updateItem(item.id, { status: "submitted", error: null });
              }
              return;
            }

            // Reset counter on any successful response
            pollFailuresRef.current[item.id] = 0;

            const { status, errorMessage, cleanFlatLayUrl, images } =
              (await res.json()) as {
                status: string;
                errorMessage?: string | null;
                cleanFlatLayUrl?: string | null;
                images: Array<{
                  id: string;
                  pose: string;
                  imageUrl: string;
                  assetManifest?: unknown;
                }>;
              };

            const results: ResultShot[] = (images ?? []).map((img) => ({
              angleId: img.pose,
              label: POSE_LABEL[img.pose] ?? img.pose,
              url: img.imageUrl,
              asset: img.assetManifest,
            }));

            const patch: Partial<BatchItem> = { results };
            if (cleanFlatLayUrl) patch.cleanPreview = cleanFlatLayUrl;

            if (status === "completed") {
              updateItem(item.id, { ...patch, status: "done", error: null });
              // Do not call revalidate() here: the loader uses authenticate.admin(), and after a
              // 2–3 min generation the session can be expired, which would replace the page with
              // an error boundary while the job actually succeeded. We already have results from
              // the poll; usage count etc. will refresh on next navigation.
            } else if (status === "failed") {
              updateItem(item.id, {
                ...patch,
                status: "error",
                error: errorMessage ?? "Generation failed. Please try again.",
              });
            } else {
              const uiStatus: ItemStatus =
                status === "generating_front"
                  ? "generating_front"
                  : status === "generating_tq"
                    ? "generating_tq"
                    : status === "generating_back"
                      ? "generating_back"
                      : status === "generating_poses"
                        ? "generating_poses"
                        : "processing";
              updateItem(item.id, { ...patch, status: uiStatus });
            }
          } catch {
            const failures = (pollFailuresRef.current[item.id] ?? 0) + 1;
            pollFailuresRef.current[item.id] = failures;
            if (failures >= 3) {
              updateItem(item.id, { status: "submitted", error: null });
            }
          }
        }),
      );
    }, 3000);

    return () => clearInterval(interval);
  }, [isPolling]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!isBeta) return;
    const completed = items.find((i) => i.status === "done" && i.savedOutfitId);
    if (!completed?.savedOutfitId) return;

    if (!firstGenerationCompletedRef.current) {
      firstGenerationCompletedRef.current = true;
      posthog.capture("first_generation_completed", {
        shop,
        beta_access: true,
        outfit_id: completed.savedOutfitId,
      });
    }

    if (
      !wouldUseLiveHandledRef.current &&
      !wouldUseLivePrompt &&
      !wouldUseLiveTimeoutRef.current
    ) {
      const outfitId = completed.savedOutfitId;
      wouldUseLiveTimeoutRef.current = setTimeout(() => {
        clearWouldUseLiveTimeout();
        if (wouldUseLiveHandledRef.current) return;
        setWouldUseLivePrompt((current) => current ?? { outfitId });
      }, WOULD_USE_LIVE_DELAY_MS);
    }
  }, [clearWouldUseLiveTimeout, isBeta, items, shop, wouldUseLivePrompt]);

  useEffect(() => {
    if (!wouldUseLivePrompt) return;
    clearWouldUseLiveTimeout();
  }, [clearWouldUseLiveTimeout, wouldUseLivePrompt]);

  useEffect(() => {
    return () => {
      clearWouldUseLiveTimeout();
    };
  }, [clearWouldUseLiveTimeout]);

  async function submitWouldUseLive(rating: "yes" | "almost" | "no") {
    if (!wouldUseLivePrompt) return;
    const outfitId = wouldUseLivePrompt.outfitId;
    wouldUseLiveHandledRef.current = true;
    clearWouldUseLiveTimeout();
    setWouldUseLivePrompt(null);
    posthog.capture("would_use_live_answered", {
      shop,
      beta_access: true,
      outfit_id: outfitId,
      rating,
    });
    await authenticatedFetch("/app/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        category: "would_use_live",
        rating,
        outfitId,
      }),
    }).catch(() => null);
  }

  // ── Generate ─────────────────────────────────────────────────────────────────

  const allModels: PresetModelEntry[] = [
    ...(customModels as PresetModelEntry[]),
    ...presetModels,
  ];

  async function handleGenerate() {
    if (!selectedModelId || isRunning) return;
    const pending = items.filter(
      (i) => i.status === "pending" || i.status === "error",
    );
    if (!pending.length) return;

    const selectedModel = allModels.find((m) => m.id === selectedModelId);
    if (!selectedModel) return;

    setIsRunning(true);

    // Fire all trigger_generation requests in parallel — each POSTs the raw flat lay,
    // uploads raw to Blob, enqueues the job; job runs cleanFlatLay + extractGarmentSpec.
    await Promise.all(
      pending.map(async (item) => {
        // If this item already has a savedOutfitId (e.g. session expired during polling but
        // the background job may have continued), resume polling instead of re-generating.
        if (item.savedOutfitId) {
          pollFailuresRef.current[item.id] = 0;
          updateItem(item.id, { status: "processing", error: null });
          return;
        }

        updateItem(item.id, {
          status: "creating",
          error: null,
          results: [],
          cleanPreview: null,
          savedOutfitId: null,
          savedShopId: null,
        });

        try {
          const { base64: frontB64, mimeType: frontMime } =
            await readFileAsBase64(item.frontFile);
          let backB64: string | null = null;
          let backMime: string | null = null;
          if (item.backFile) {
            const back = await readFileAsBase64(item.backFile);
            backB64 = back.base64;
            backMime = back.mimeType;
          }

          // POST to /api/trigger-generation so we always get JSON (401 on auth failure, not HTML).
          const body = JSON.stringify({
            skuName: item.skuName,
            modelId: selectedModel.id,
            modelImageUrl: selectedModel.imageUrl,
            modelHeight: selectedModel.height,
            modelGender: selectedModel.gender,
            styleId: "white-studio",
            brandStyleId,
            frontB64,
            frontMime,
            backB64,
            backMime,
          });

          posthog.capture("generation_triggered", {
            shop,
            skuName: item.skuName,
          });
          if (isBeta && !firstGenerationTriggeredRef.current) {
            firstGenerationTriggeredRef.current = true;
            posthog.capture("first_generation_triggered", {
              shop,
              beta_access: true,
              sku_name: item.skuName,
            });
          }
          const res = await authenticatedFetch("/api/trigger-generation", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body,
          });
          if (!res.ok) {
            if (isSessionExpiredResponse(res)) {
              throw new Error(SESSION_EXPIRED_MESSAGE);
            }
            if (res.status === 402) {
              const data = (await res.json().catch(() => ({}))) as {
                message?: string;
                isBeta?: boolean;
              };
              if (data.isBeta) {
                posthog.capture("beta_cap_reached", {
                  shop,
                  beta_access: true,
                });
              }
              throw new Error(data.message ?? UPGRADE_MSG);
            }
            const text = await res.text();
            let errMsg: string;
            try {
              const json = JSON.parse(text) as { error?: string } | null;
              errMsg =
                json?.error ??
                `Something went wrong (${res.status}). Please try again.`;
            } catch {
              errMsg =
                text?.slice(0, 200) ||
                `Something went wrong (${res.status}). Please try again.`;
            }
            throw new Error(errMsg);
          }

          const { outfitId, shopId: savedShopId } = (await res.json()) as {
            outfitId: string;
            shopId: string;
          };
          updateItem(item.id, {
            status: "processing",
            savedOutfitId: outfitId,
            savedShopId,
            cleanPreview: null, // job will backfill; polling may return cleanFlatLayUrl once ready
          });
        } catch (err) {
          const errMsg = (err as Error).message ?? "Failed to start generation";
          updateItem(item.id, {
            status: "error",
            error: errMsg,
          });
        }
      }),
    );

    setIsRunning(false);
    // Polling interval picks up from here for items that are now 'processing'
  }

  // ── Delete saved outfit ───────────────────────────────────────────────────────

  const pendingCount = items.filter(
    (i) => i.status === "pending" || i.status === "error",
  ).length;
  const errorCount = items.filter((i) => i.status === "error").length;
  const canGenerate = pendingCount > 0 && !!selectedModelId && !isRunning;
  const doneCount = items.filter((i) => i.status === "done").length;
  // When any item is in progress, show that phase on the button
  const activeItem = items.find((i) =>
    (ACTIVE_STATUSES as string[]).includes(i.status),
  );
  const buttonStateLabel = activeItem
    ? (STATUS_LABEL[activeItem.status as ItemStatus] ?? "Generating…")
    : null;
  const activeStyle =
    BRAND_STYLE_PRESETS.find((p) => p.id === brandStyleId) ??
    BRAND_STYLE_PRESETS[0];

  return (
    <>
      <div className="min-h-screen bg-krea-bg flex gap-6 p-6">
        {/* ── Left column ── */}
        <div className="w-[420px] flex-shrink-0 space-y-6">
          {isBeta && (
            <div className="rounded-xl border border-krea-accent/20 bg-krea-accent/5 px-4 py-3 text-sm text-krea-text">
              <p className="font-medium">You&apos;re in beta.</p>
              <p className="mt-1 text-xs text-krea-muted">
                Best results come from one clean garment per image.
              </p>
              <div className="mt-2 flex gap-3 text-xs">
                <a
                  href={`mailto:${supportEmail}?subject=${encodeURIComponent("TinyLemon beta support")}`}
                  onClick={() =>
                    posthog.capture("beta_support_clicked", {
                      shop,
                      location: "dress_model_banner",
                    })
                  }
                  className="font-medium text-krea-accent underline underline-offset-2"
                >
                  Need help?
                </a>
                <Link
                  to="/app/feedback"
                  className="font-medium text-krea-accent underline underline-offset-2"
                >
                  Send feedback
                </Link>
              </div>
            </div>
          )}

          {/* ── Flat lay upload ── */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-krea-muted">
                Flat lays
              </p>
              <p className="text-xs text-krea-muted">
                {items.length}/{MAX_BATCH}
              </p>
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
                    ? "border-krea-accent bg-krea-accent/5"
                    : "border-krea-border bg-white hover:border-krea-accent/40"
                }`}
              >
                <Plus className="w-5 h-5 text-krea-muted" />
                <p className="text-sm text-krea-muted">
                  One garment per image, any background. We'll clean it up
                </p>
                <p className="text-xs text-krea-muted/60">
                  Up to {MAX_BATCH - items.length} more
                </p>
              </button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files) addFiles(e.target.files);
                e.target.value = "";
              }}
            />

            {items.length > 0 && (
              <div className="space-y-2">
                {items.map((item) => (
                  <div key={item.id} className="space-y-1">
                    <div className="flex items-center gap-3 bg-white rounded-xl px-3 py-2 border border-krea-border">
                      <div className="w-10 h-10 rounded-md overflow-hidden bg-krea-bg flex-shrink-0 relative">
                        <img
                          src={item.frontPreview}
                          alt=""
                          className="block w-full h-full object-cover"
                          loading="lazy"
                          decoding="async"
                        />
                        {item.quality === "good" && (
                          <span
                            title="Looks good"
                            aria-label="Flat lay looks good"
                            className="absolute bottom-0.5 right-0.5"
                          >
                            <CheckCircle className="w-3 h-3 text-green-500 bg-white rounded-full" />
                          </span>
                        )}
                        {item.quality === "warn" && (
                          <span
                            title="Uncertain image quality"
                            aria-label="Flat lay quality uncertain"
                            className="absolute bottom-0.5 right-0.5"
                          >
                            <AlertTriangle className="w-3 h-3 text-yellow-500 bg-white rounded-full" />
                          </span>
                        )}
                        {item.quality === "fail" && (
                          <span
                            title="Image quality concern"
                            aria-label="Flat lay likely invalid"
                            className="absolute bottom-0.5 right-0.5"
                          >
                            <XCircle className="w-3 h-3 text-red-500 bg-white rounded-full" />
                          </span>
                        )}
                      </div>

                      <input
                        type="text"
                        value={item.skuName}
                        onChange={(e) => updateSkuName(item.id, e.target.value)}
                        placeholder="SKU name"
                        disabled={
                          item.status !== "pending" && item.status !== "error"
                        }
                        className="flex-1 text-sm bg-transparent focus:outline-none text-krea-text placeholder:text-krea-muted/50 disabled:opacity-60"
                      />

                      {(item.status === "pending" || item.status === "error") &&
                        (item.backPreview ? (
                          <div className="relative group w-8 h-8 rounded-md overflow-hidden flex-shrink-0">
                            <img
                              src={item.backPreview}
                              alt="back"
                              className="block w-full h-full object-cover"
                              loading="lazy"
                              decoding="async"
                            />
                            <button
                              type="button"
                              onClick={() =>
                                setItems((prev) =>
                                  prev.map((i) =>
                                    i.id === item.id
                                      ? {
                                          ...i,
                                          backFile: null,
                                          backPreview: null,
                                        }
                                      : i,
                                  ),
                                )
                              }
                              className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <X className="w-3 h-3 text-white" />
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() =>
                              backInputRefs.current[item.id]?.click()
                            }
                            className="flex-shrink-0 text-xs text-krea-muted border border-krea-border rounded-md px-2 py-1 hover:border-krea-accent/40 hover:text-krea-text transition-colors"
                          >
                            + Back
                          </button>
                        ))}
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        ref={(el) => {
                          backInputRefs.current[item.id] = el;
                        }}
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) addBackFile(item.id, f);
                          e.target.value = "";
                        }}
                      />

                      <span
                        className={`text-xs flex-shrink-0 ${
                          item.status === "done"
                            ? "text-green-600"
                            : item.status === "error"
                              ? "text-red-500"
                              : item.status === "submitted"
                                ? "text-amber-500"
                                : item.status === "pending"
                                  ? "text-krea-muted"
                                  : "text-krea-accent"
                        }`}
                      >
                        {STATUS_LABEL[item.status]}
                      </span>

                      {(item.status === "pending" ||
                        item.status === "error") && (
                        <button
                          type="button"
                          onClick={() => removeItem(item.id)}
                          className="p-1 rounded hover:bg-krea-bg transition-colors flex-shrink-0"
                        >
                          <X className="w-3.5 h-3.5 text-krea-muted" />
                        </button>
                      )}
                    </div>
                    {item.quality === "warn" && item.status === "pending" && (
                      <p className="text-[10px] text-yellow-600 flex items-center gap-1 px-1">
                        <AlertTriangle className="w-3 h-3 flex-shrink-0" />
                        We’re not sure this is a single garment. Try a clearer
                        flat lay.
                      </p>
                    )}
                    {item.quality === "fail" && item.status === "pending" && (
                      <p className="text-[10px] text-red-500 flex items-center gap-1 px-1">
                        <XCircle className="w-3 h-3 flex-shrink-0" />
                        Multiple or no garments detected. Use a single garment
                        flat lay.
                      </p>
                    )}
                    {item.status === "error" && item.error && (
                      <p className="text-[10px] text-red-500 flex items-center gap-1 px-1">
                        <XCircle className="w-3 h-3 flex-shrink-0" />
                        <ErrorMsg
                          msg={item.error}
                          isBeta={isBeta}
                          supportEmail={supportEmail}
                        />
                      </p>
                    )}
                    {item.status === "submitted" && (
                      <p className="text-[10px] text-krea-muted flex items-center gap-1 px-1">
                        Generation in progress —{" "}
                        <Link
                          to="/app/outfits"
                          className="underline font-medium text-krea-text"
                        >
                          view result in Outfits
                        </Link>
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
              <span className="font-medium text-krea-text">
                {activeStyle.label}
              </span>
              <Link
                to="/app/brand-style"
                state={{ model: selectedModelId }}
                className="text-xs text-krea-accent underline underline-offset-2"
              >
                Edit
              </Link>
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
              ) : buttonStateLabel ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {buttonStateLabel}
                </span>
              ) : errorCount > 0 && pendingCount === errorCount ? (
                `Retry${errorCount > 1 ? ` ${errorCount} failed` : ""}`
              ) : (
                `Generate${pendingCount > 1 ? ` ${pendingCount} SKUs` : ""}`
              )}
            </button>
          </div>

          {/* ── Output empty state: previous generations live in Outfits ── */}
          {!items.some((i) => i.results.length > 0 || i.cleanPreview) && (
            <div className="rounded-xl border border-krea-border bg-krea-bg/50 p-4 text-center">
              <p className="text-sm text-krea-muted">
                Output from this page is only shown until you leave or reload.
                Your previous generations are saved in Outfits.
              </p>
              <Link
                to="/app/outfits"
                className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-krea-accent hover:text-krea-text underline underline-offset-2"
              >
                View Outfits →
              </Link>
            </div>
          )}

          {/* ── Active results ── */}
          {items.some((i) => i.results.length > 0 || i.cleanPreview) && (
            <div className="space-y-8">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-krea-muted">
                  Output
                  {doneCount > 0
                    ? ` — ${doneCount} SKU${doneCount > 1 ? "s" : ""} done`
                    : ""}
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

              {items
                .filter((i) => i.results.length > 0 || i.cleanPreview)
                .map((item) => (
                  <div key={item.id} className="space-y-2">
                    <p className="text-sm font-medium text-krea-text">
                      {item.skuName || "Untitled"}
                    </p>
                    <div className="grid grid-cols-4 gap-3">
                      {item.cleanPreview && (
                        <div className="space-y-1.5">
                          <div className="aspect-[2/3] rounded-lg overflow-hidden border border-krea-border bg-white">
                            <img
                              src={item.cleanPreview}
                              alt="Clean flat lay"
                              className="block w-full h-full object-contain"
                              loading="lazy"
                              decoding="async"
                            />
                          </div>
                          <p className="text-[10px] text-krea-muted">
                            Flat lay
                          </p>
                        </div>
                      )}

                      {item.results.map((shot) => (
                        <div key={shot.angleId} className="space-y-1.5">
                          <div className="aspect-[2/3] rounded-lg overflow-hidden border border-krea-border bg-white">
                            <GeneratedPoseImage
                              asset={shot.asset}
                              url={shot.url}
                              label={shot.label}
                              preset="dressModelPreview"
                              className="block w-full h-full object-cover"
                              loading="lazy"
                              decoding="async"
                              placeholderClassName="w-full h-full bg-krea-border/30"
                            />
                          </div>
                          <p className="text-[10px] text-krea-muted">
                            {shot.label}
                          </p>
                        </div>
                      ))}

                      {(ACTIVE_STATUSES as string[]).includes(item.status) &&
                        Array.from({ length: 3 - item.results.length }).map(
                          (_, i) => {
                            const slotIndex = item.results.length + i;
                            const poseLabels = [
                              "Front",
                              "Three-quarter",
                              "Back",
                            ];
                            const isCurrentPhase =
                              (item.status === "generating_front" &&
                                slotIndex === 0) ||
                              (item.status === "generating_tq" &&
                                slotIndex === 1) ||
                              (item.status === "generating_back" &&
                                slotIndex === 2) ||
                              (item.status === "generating_poses" &&
                                (slotIndex === 1 || slotIndex === 2));
                            return (
                              <div key={`skel-${i}`} className="space-y-1.5">
                                <div className="aspect-[2/3] rounded-lg bg-krea-border/30 animate-pulse flex items-center justify-center">
                                  {isCurrentPhase && (
                                    <Loader2 className="w-8 h-8 text-krea-muted/50 animate-spin" />
                                  )}
                                </div>
                                <p
                                  className={`text-[10px] ${isCurrentPhase ? "text-krea-accent" : "text-krea-muted/40"}`}
                                >
                                  {isCurrentPhase
                                    ? `Generating ${poseLabels[slotIndex].toLowerCase()}…`
                                    : poseLabels[slotIndex]}
                                </p>
                              </div>
                            );
                          },
                        )}
                    </div>

                    {item.error && (
                      <p className="text-xs text-red-500">
                        <ErrorMsg
                          msg={item.error}
                          isBeta={isBeta}
                          supportEmail={supportEmail}
                        />
                      </p>
                    )}
                    {item.status === "submitted" && (
                      <p className="text-xs text-krea-muted">
                        Generation in progress —{" "}
                        <Link
                          to="/app/outfits"
                          className="underline font-medium text-krea-text"
                        >
                          view result in Outfits
                        </Link>
                      </p>
                    )}
                    {item.status === "done" && (
                      <p className="text-xs">
                        <Link
                          to="/app/outfits"
                          className="inline-flex items-center gap-1.5 font-medium text-krea-accent hover:text-krea-text underline underline-offset-2"
                        >
                          View in Outfits →
                        </Link>
                        <span className="text-krea-muted ml-1">
                          — full view, download & regenerate
                        </span>
                      </p>
                    )}
                  </div>
                ))}
            </div>
          )}
        </div>
        {/* end left column */}

        {/* ── Right column ── */}
        <div className="flex-1 min-w-0 sticky top-6 self-start max-h-[calc(100vh-48px)] overflow-y-auto space-y-6">
          {/* ── Model picker ── */}
          <section className="space-y-3">
            {/* Segment control */}
            {(() => {
              const selectedInMine =
                selectedModelId != null &&
                (customModels as PresetModelEntry[]).some(
                  (m) => m.id === selectedModelId,
                );
              const selectedInPresets =
                selectedModelId != null &&
                presetModels.some((m) => m.id === selectedModelId);
              return (
                <div className="flex gap-1 p-1 bg-black/5 rounded-xl">
                  <button
                    type="button"
                    onClick={() => setModelTab("mine")}
                    className={`relative flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium rounded-lg transition-all ${
                      modelTab === "mine"
                        ? "bg-white text-krea-text shadow-sm"
                        : "text-krea-muted hover:text-krea-text"
                    }`}
                  >
                    Mine
                    {selectedInMine && modelTab !== "mine" && (
                      <span className="w-1.5 h-1.5 rounded-full bg-krea-accent" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setModelTab("presets")}
                    className={`relative flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium rounded-lg transition-all ${
                      modelTab === "presets"
                        ? "bg-white text-krea-text shadow-sm"
                        : "text-krea-muted hover:text-krea-text"
                    }`}
                  >
                    Presets
                    {selectedInPresets && modelTab !== "presets" && (
                      <span className="w-1.5 h-1.5 rounded-full bg-krea-accent" />
                    )}
                  </button>
                </div>
              );
            })()}

            {/* Mine tab */}
            {modelTab === "mine" &&
              (customModels.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
                  <p className="text-sm text-krea-muted">
                    No custom models yet.
                  </p>
                  <Link
                    to="/app/model-builder"
                    className="text-xs font-medium text-krea-text underline underline-offset-2 hover:opacity-70 transition-opacity"
                  >
                    Create a model →
                  </Link>
                </div>
              ) : (
                <div className="grid grid-cols-4 gap-2">
                  {(customModels as PresetModelEntry[]).map((model) => {
                    const isSelected = selectedModelId === model.id;
                    return (
                      <div
                        key={model.id}
                        ref={isSelected ? selectedCardRef : null}
                        className={`group rounded-xl overflow-hidden border-2 transition-all cursor-pointer ${
                          isSelected
                            ? "border-krea-accent shadow-sm"
                            : "border-transparent hover:border-krea-border"
                        }`}
                        onClick={() => setPreviewModel(model)}
                      >
                        <div className="aspect-[2/3] overflow-hidden bg-white relative">
                          <img
                            src={model.imageUrl}
                            alt={model.name}
                            className="block w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                            loading="lazy"
                            decoding="async"
                            referrerPolicy="no-referrer"
                          />
                          {isSelected && (
                            <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-krea-accent flex items-center justify-center">
                              <svg
                                className="w-3 h-3 text-white"
                                fill="none"
                                viewBox="0 0 12 12"
                              >
                                <path
                                  d="M2 6l3 3 5-5"
                                  stroke="currentColor"
                                  strokeWidth="1.5"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                />
                              </svg>
                            </div>
                          )}
                        </div>
                        <div className="py-2 px-2 bg-white">
                          <p className="text-sm font-medium text-krea-text truncate">
                            {model.name}
                          </p>
                          <p className="text-xs text-krea-muted truncate">
                            {model.ethnicity.split(" /")[0]}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}

            {/* Presets tab — async from JSON fetch */}
            {modelTab === "presets" &&
              (presetModels.length === 0 ? (
                <p className="text-xs text-krea-muted py-4">Loading models…</p>
              ) : (
                <div className="grid grid-cols-4 gap-2">
                  {presetModels.map((model) => {
                    const isSelected = selectedModelId === model.id;
                    return (
                      <div
                        key={model.id}
                        ref={isSelected ? selectedCardRef : null}
                        className={`group rounded-xl overflow-hidden border-2 transition-all cursor-pointer ${
                          isSelected
                            ? "border-krea-accent shadow-sm"
                            : "border-transparent hover:border-krea-border"
                        }`}
                        onClick={() => setPreviewModel(model)}
                      >
                        <div className="aspect-[2/3] overflow-hidden bg-white relative">
                          <img
                            src={model.imageUrl}
                            alt={model.name}
                            className="block w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                            loading="lazy"
                            decoding="async"
                            referrerPolicy="no-referrer"
                          />
                          {isSelected && (
                            <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-krea-accent flex items-center justify-center">
                              <svg
                                className="w-3 h-3 text-white"
                                fill="none"
                                viewBox="0 0 12 12"
                              >
                                <path
                                  d="M2 6l3 3 5-5"
                                  stroke="currentColor"
                                  strokeWidth="1.5"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                />
                              </svg>
                            </div>
                          )}
                        </div>
                        <div className="py-2 px-2 bg-white">
                          <p className="text-sm font-medium text-krea-text truncate">
                            {model.name}
                          </p>
                          <p className="text-xs text-krea-muted truncate">
                            {model.ethnicity.split(" /")[0]}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
          </section>
        </div>
        {/* end right column */}

        {/* ── Model preview overlay ── */}
        {previewModel && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6"
            onClick={() => setPreviewModel(null)}
          >
            <div
              className="relative flex gap-8 items-end max-h-[90vh]"
              onClick={(e) => e.stopPropagation()}
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
                className="block h-[85vh] w-auto object-contain rounded-xl shadow-2xl"
                decoding="async"
                referrerPolicy="no-referrer"
              />
              <div className="pb-2 space-y-4 min-w-[180px] bg-white rounded-xl p-4">
                <div className="space-y-1">
                  <p className="text-2xl font-semibold text-krea-text">
                    {previewModel.name}
                  </p>
                  <p className="text-sm text-krea-muted">
                    {previewModel.gender}
                  </p>
                  <p className="text-sm text-krea-muted">
                    {previewModel.ethnicity}
                  </p>
                  <p className="text-sm text-krea-muted">
                    {previewModel.bodyBuild}
                  </p>
                  <p className="text-sm text-krea-muted">
                    {previewModel.height}
                  </p>
                </div>
                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      selectModel(previewModel.id);
                      setPreviewModel(null);
                    }}
                    className="krea-button text-sm"
                  >
                    {selectedModelId === previewModel.id
                      ? "Selected ✓"
                      : "Select model"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {wouldUseLivePrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-krea-text">
              Would you use this live?
            </h2>
            <p className="mt-2 text-sm text-krea-muted">
              One quick check-in so we can learn whether this result is already
              good enough for a live PDP.
            </p>
            <div className="mt-5 grid grid-cols-3 gap-3">
              {(["yes", "almost", "no"] as const).map((rating) => (
                <button
                  key={rating}
                  type="button"
                  onClick={() => submitWouldUseLive(rating)}
                  className="h-10 rounded-md border border-krea-border text-sm font-medium text-krea-text transition-colors hover:border-krea-accent hover:text-krea-accent"
                >
                  {rating === "yes"
                    ? "Yes"
                    : rating === "almost"
                      ? "Almost"
                      : "No"}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Nav guard confirm modal ── */}
      {blocker.state === "blocked" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-white rounded-xl p-6 max-w-sm w-full mx-4 space-y-4 shadow-xl">
            <p className="text-sm font-semibold text-krea-text">
              {isRunning
                ? "Generation in progress"
                : "Leave without generating?"}
            </p>
            <p className="text-xs text-krea-muted leading-relaxed">
              {isRunning
                ? "Your generation will continue running in the background. Come back to see the results — or leave and check the Outfits page later."
                : "Your uploaded outfits will still be here when you come back. No need to re-upload."}
            </p>
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => blocker.reset()}
                className="h-8 px-4 text-xs rounded-md border border-krea-border text-krea-text hover:bg-krea-bg transition-colors"
              >
                Stay
              </button>
              <button
                type="button"
                onClick={() => blocker.proceed()}
                className="h-8 px-4 text-xs rounded-md bg-krea-accent text-white hover:opacity-90 transition-opacity"
              >
                Leave
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
