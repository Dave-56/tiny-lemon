import { useState, useRef, useEffect } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "react-router";
import { Link, useFetcher, useLoaderData } from "react-router";
import { readFileSync } from "fs";
import { join } from "path";

import { login } from "../shopify.server";
import { ensureShop } from "../db.server";
import { handleTriggerGeneration } from "../lib/triggerGeneration.server";
import { DEMO_SHOP_ID } from "../lib/billing.server";
import { buildRateLimitHeaders, consumeRateLimit } from "../lib/rateLimit.server";
import { getNormalizedRateLimitSubject } from "../lib/rateLimitSubject.server";

import landingStyles from "./_index/styles.module.css";
import styles from "../styles/try.module.css";

export const meta: MetaFunction = () => {
  const title = "Try free: flat-lay to studio shot — Tiny Lemon";
  const description =
    "Generate one AI studio shot from your flat-lay in seconds. No signup. For fashion brands on Shopify.";
  return [
    { title },
    { name: "description", content: description },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
  ];
};

type PresetModel = { id: string; name: string; imageUrl: string; gender: string; ethnicity: string; bodyBuild: string; height: string };

// #region agent log
function debugLog(
  location: string,
  message: string,
  data: Record<string, unknown>,
  hypothesisId: string
) {
  const payload = {
    sessionId: "63d77a",
    location,
    message,
    data,
    hypothesisId,
    timestamp: Date.now(),
  };
  fetch("http://127.0.0.1:7384/ingest/922c043d-8201-4442-8506-2ee8f8772d35", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "63d77a" },
    body: JSON.stringify(payload),
  }).catch(() => {});
  console.log("[Try action debug]", message, data);
}
// #endregion

/**
 * Get buffer and mime from a form file value. Works with File/Blob in browser
 * and in runtimes (e.g. Vercel) that may expose a different shape.
 */
async function getFileBytes(
  value: unknown
): Promise<{ buffer: Buffer; mime: string } | null> {
  // #region agent log
  const hasValue = value != null;
  const arrayBufferType = typeof (value as File)?.arrayBuffer;
  debugLog(
    "try.tsx:getFileBytes(entry)",
    "getFileBytes called",
    { hasValue, arrayBufferType, valueConstructor: value != null ? (value as object).constructor?.name : undefined },
    "H2"
  );
  // #endregion
  if (value == null) {
    // #region agent log
    debugLog("try.tsx:getFileBytes(null)", "return null: value == null", {}, "H1");
    // #endregion
    return null;
  }
  if (typeof (value as File)?.arrayBuffer !== "function") {
    // #region agent log
    debugLog("try.tsx:getFileBytes(no arrayBuffer)", "return null: no arrayBuffer", { arrayBufferType }, "H2");
    // #endregion
    return null;
  }
  try {
    const ab = await (value as File).arrayBuffer();
    const buffer = Buffer.from(ab);
    const mime = (value as Blob).type || "image/png";
    // #region agent log
    debugLog("try.tsx:getFileBytes(ok)", "return buffer", { bufferLen: buffer.length, mime }, "H4");
    // #endregion
    return { buffer, mime };
  } catch (e) {
    // #region agent log
    debugLog("try.tsx:getFileBytes(catch)", "return null: catch", { errorName: (e as Error)?.name }, "H3");
    // #endregion
    return null;
  }
}

export const loader = async (_args: LoaderFunctionArgs) => {
  let presets: PresetModel[] = [];
  try {
    const path = join(process.cwd(), "public", "try-preset-models.json");
    const raw = readFileSync(path, "utf-8");
    const arr = JSON.parse(raw) as Array<{ id: string; name: string; imageUrl: string; gender?: string; ethnicity?: string; bodyBuild?: string; height?: string }>;
    presets = arr.map((p) => ({
      id: p.id,
      name: p.name,
      imageUrl: p.imageUrl,
      gender: p.gender ?? "",
      ethnicity: p.ethnicity ?? "",
      bodyBuild: p.bodyBuild ?? "",
      height: p.height ?? "",
    }));
  } catch {
    // ignore
  }
  const installUrl = process.env.SHOPIFY_APP_INSTALL_URL ?? "";
  return { presets, showForm: Boolean(login), installUrl };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const rateLimit = await consumeRateLimit({
    namespace: "try-demo",
    subject: getNormalizedRateLimitSubject(request),
    limit: 1,
    windowMs: 24 * 60 * 60 * 1000,
    algorithm: "fixed",
  });
  const rateLimitHeaders = buildRateLimitHeaders(rateLimit);
  const jsonWithRateLimit = (
    body: unknown,
    init?: ResponseInit,
  ) => {
    const headers = new Headers(init?.headers);
    for (const [key, value] of rateLimitHeaders.entries()) {
      headers.set(key, value);
    }
    return Response.json(body, { ...init, headers });
  };

  if (!rateLimit.allowed) {
    return jsonWithRateLimit(
      {
        error: "rate_limited",
        message:
          "1 free generation per day limit reached. Try again tomorrow or install the app for unlimited generations.",
      },
      { status: 429 },
    );
  }
  const fd = await request.formData();
  const modelId = (fd.get("modelId") as string) || "";
  const flatLay = fd.get("flatLay");
  // #region agent log
  const formKeys = Array.from(fd.keys());
  const flatLayType = typeof flatLay;
  const flatLayConstructor = flatLay != null && typeof flatLay === "object" ? (flatLay as object).constructor?.name : undefined;
  const hasArrayBuffer = flatLay != null && typeof (flatLay as File).arrayBuffer === "function";
  const hasType = flatLay != null && typeof flatLay === "object" && "type" in (flatLay as object);
  const flatLaySize = flatLay != null && typeof (flatLay as Blob).size === "number" ? (flatLay as Blob).size : undefined;
  const flatLayKeys = flatLay != null && typeof flatLay === "object" ? Object.keys(flatLay as object) : [];
  debugLog(
    "try.tsx:action(after formData)",
    "formData received",
    {
      formKeys,
      hasFlatLay: flatLay != null,
      flatLayType,
      flatLayConstructor,
      hasArrayBuffer,
      hasType,
      flatLaySize,
      flatLayKeys,
    },
    "H1"
  );
  // #endregion
  if (!flatLay || !modelId) {
    return jsonWithRateLimit({ error: "Missing flatLay or modelId" }, { status: 400 });
  }
  const fileResult = await getFileBytes(flatLay);
  if (!fileResult) {
    // #region agent log
    debugLog("try.tsx:action(400)", "returning Invalid file upload", { formKeys, flatLayType, flatLayConstructor }, "H5");
    // #endregion
    return jsonWithRateLimit({ error: "Invalid file upload" }, { status: 400 });
  }
  const base64 = fileResult.buffer.toString("base64");
  const mime = fileResult.mime;
  let presets: PresetModel[] = [];
  try {
    const path = join(process.cwd(), "public", "try-preset-models.json");
    const raw = readFileSync(path, "utf-8");
    const arr = JSON.parse(raw) as Array<{ id: string; name: string; imageUrl: string; gender?: string; ethnicity?: string; bodyBuild?: string; height?: string }>;
    presets = arr.map((p) => ({ id: p.id, name: p.name, imageUrl: p.imageUrl, gender: p.gender ?? "", ethnicity: p.ethnicity ?? "", bodyBuild: p.bodyBuild ?? "", height: p.height ?? "" }));
  } catch {
    return jsonWithRateLimit({ error: "Presets unavailable" }, { status: 500 });
  }
  const preset = presets.find((p) => p.id === modelId);
  if (!preset) {
    return jsonWithRateLimit({ error: "Invalid model" }, { status: 400 });
  }
  await ensureShop(DEMO_SHOP_ID);
  const res = await handleTriggerGeneration(DEMO_SHOP_ID, {
    modelId: preset.id,
    modelImageUrl: preset.imageUrl,
    modelGender: preset.gender || undefined,
    frontB64: base64,
    frontMime: mime,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    return jsonWithRateLimit(data, { status: res.status });
  }
  const data = (await res.json()) as { outfitId: string; shopId: string };
  return jsonWithRateLimit(data);
};

export default function TryPage() {
  const { presets, showForm, installUrl } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<{ outfitId?: string; shopId?: string; error?: string; message?: string }>();
  const [selectedModelId, setSelectedModelId] = useState<string>(presets[0]?.id ?? "");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewModel, setPreviewModel] = useState<PresetModel | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isSubmitting = fetcher.state === "submitting" || fetcher.state === "loading";
  const data = fetcher.data;
  const error = data?.error ? (data.message || data.error) : null;
  const outfitId = dismissed ? null : (data?.outfitId ?? null);
  const selectedPreset = presets.find((p) => p.id === selectedModelId) ?? null;

  useEffect(() => {
    if (fetcher.state === "submitting") setDismissed(false);
  }, [fetcher.state]);

  useEffect(() => {
    if (!previewModel) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setPreviewModel(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [previewModel]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
    } else {
      setPreviewUrl(null);
    }
  };

  return (
    <div className={landingStyles.page}>
      <div className={landingStyles.headerWrapper}>
        <header className={landingStyles.header}>
          <Link to="/" className={landingStyles.logo} aria-label="Tiny Lemon home">
            <img src="/app-icon-1200x1200.png" alt="" className={landingStyles.logoIcon} width={32} height={32} />
            <span>TinyLemon</span>
          </Link>
          <nav className={landingStyles.nav} aria-label="Main">
            <Link to="/#features" className={landingStyles.navLink}>
              Features
            </Link>
            <Link to="/pricing" className={landingStyles.navLink}>
              Pricing
            </Link>
            <Link to="/blog" className={landingStyles.navLink}>
              Blog
            </Link>
            <Link to="/#how-it-works" className={landingStyles.navLink}>
              About
            </Link>
            <Link to="/#login" className={landingStyles.navLink}>
              Contact
            </Link>
            {showForm && (
              <Link to="/#login" className={landingStyles.navLink}>
                Log in
              </Link>
            )}
          </nav>
          <div className={landingStyles.headerActions}>
            {showForm && (
              <Link to="/#login" className={landingStyles.btnPrimary}>
                Get started
              </Link>
            )}
          </div>
        </header>
      </div>

      <main>
        <section className={styles.section}>
          <h1 className={styles.pageTitle}>Try free</h1>
          <p className={styles.subtitle}>
            Upload a flat-lay and pick a model. You get one front-angle studio
            shot. No signup. 1 per day per device.
          </p>

          {outfitId ? (
            <div className={styles.generatingLayout}>
              <div className={styles.lockedForm}>
                {previewUrl && (
                  <div>
                    <p className={styles.lockedLabel}>Your flat-lay</p>
                    <div className={styles.flatlayPreview}>
                      <img src={previewUrl} alt="Your flat-lay" />
                    </div>
                  </div>
                )}
                {selectedPreset && (
                  <div>
                    <p className={styles.lockedLabel}>Model</p>
                    <div className={styles.lockedModelCard}>
                      <img src={selectedPreset.imageUrl} alt={selectedPreset.name} />
                      <span>{selectedPreset.name}</span>
                    </div>
                  </div>
                )}
              </div>
              <TryPollResult
                outfitId={outfitId}
                flatLayPreviewUrl={previewUrl}
                installUrl={installUrl}
                showInstallCta={showForm}
                onReset={() => setDismissed(true)}
              />
            </div>
          ) : (
            <fetcher.Form method="post" encType="multipart/form-data" className={styles.form}>
              <div className={styles.formGrid}>
                <div className={styles.field}>
                  <label className={styles.label}>Flat-lay image</label>
                  <p className={styles.modelHint}>
                    Upload a photo of your product laid flat. Your shot will use this image.
                  </p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    name="flatLay"
                    accept="image/png,image/jpeg,image/webp"
                    required
                    onChange={handleFileChange}
                    className={styles.fileInputHidden}
                    id="flatlay-upload"
                  />
                  <button
                    type="button"
                    className={styles.uploadButton}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {previewUrl ? "Change image" : "Choose flat-lay image"}
                  </button>
                  {previewUrl && (
                    <>
                      <div className={styles.flatlayPreview}>
                        <img src={previewUrl} alt="Your flat-lay" />
                      </div>
                      <button
                        type="submit"
                        className={`${landingStyles.btnPrimary} ${styles.generateButton}`}
                        disabled={isSubmitting}
                      >
                        {isSubmitting ? "Generating…" : "Generate"}
                      </button>
                    </>
                  )}
                  {error && <p className={styles.error}>{error}</p>}
                </div>
                <div className={styles.field}>
                  <label className={styles.label}>Model</label>
                  <p className={styles.modelHint}>
                    Click a model to select — your shot will use their look.
                  </p>
                  <div className={styles.modelGrid}>
                    {presets.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        className={`${styles.modelCard} ${selectedModelId === p.id ? styles.modelCardSelected : ""}`}
                        onClick={() => setSelectedModelId(p.id)}
                        title={p.name}
                      >
                        <button
                          type="button"
                          className={styles.modelCardInfoBtn}
                          onClick={(e) => { e.stopPropagation(); setPreviewModel(p); }}
                          aria-label={`Preview ${p.name}`}
                        >
                          ⤢
                        </button>
                        <img src={p.imageUrl} alt={p.name} />
                        <span>{p.name}</span>
                      </button>
                    ))}
                  </div>
                  <input type="hidden" name="modelId" value={selectedModelId} />
                </div>
              </div>
            </fetcher.Form>
          )}

          {showForm && !outfitId && (
            <div className={styles.ctaBlock}>
              <p className={styles.cta}>
                Need more angles or your store? Add the app.
              </p>
              <a
                href={installUrl || "/auth/login"}
                {...(installUrl ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                className={landingStyles.btnPrimary}
              >
                Add the app to my store
              </a>
              <p className={styles.ctaSecondary}>
                Already have the app?{" "}
                <Link to="/auth/login" className={styles.ctaLink}>
                  Log in
                </Link>
              </p>
            </div>
          )}
        </section>
      </main>

      <footer className={landingStyles.footer}>
        <div className={landingStyles.footerTop}>
          <div className={landingStyles.footerBrand}>
            <Link to="/" className={landingStyles.footerLogo}>
              TinyLemon
            </Link>
            <p className={landingStyles.footerTagline}>
              Beautiful product photos in minutes. For fashion brands on Shopify.
            </p>
          </div>
          <div className={landingStyles.footerColumns}>
            <div className={landingStyles.footerCol}>
              <h3 className={landingStyles.footerHeading}>Product</h3>
              <Link to="/try" className={landingStyles.footerLink}>
                Try free
              </Link>
              <Link to="/#features" className={landingStyles.footerLink}>
                Features
              </Link>
              <Link to="/pricing" className={landingStyles.footerLink}>
                Pricing
              </Link>
              <a href="/#login" className={landingStyles.footerLink}>
                Contact
              </a>
            </div>
            <div className={landingStyles.footerCol}>
              <h3 className={landingStyles.footerHeading}>Company</h3>
              <Link to="/blog" className={landingStyles.footerLink}>
                Blog
              </Link>
              <a href="/#how-it-works" className={landingStyles.footerLink}>
                About
              </a>
              <a href="/#login" className={landingStyles.footerLink}>
                Contact
              </a>
            </div>
            <div className={landingStyles.footerCol}>
              <h3 className={landingStyles.footerHeading}>Legal</h3>
              <Link to="/privacy" className={landingStyles.footerLink}>
                Privacy Policy
              </Link>
              <Link to="/terms" className={landingStyles.footerLink}>
                Terms of Use
              </Link>
            </div>
          </div>
        </div>
        <div className={landingStyles.footerBottom}>
          <span className={landingStyles.footerCopyright}>
            © {new Date().getFullYear()} TinyLemon.
          </span>
        </div>
      </footer>

      {/* ── Model preview overlay ── */}
      {previewModel && (
        <div
          className={styles.modelOverlay}
          onClick={() => setPreviewModel(null)}
        >
          <div
            className={styles.modelOverlayInner}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className={styles.modelOverlayClose}
              onClick={() => setPreviewModel(null)}
              aria-label="Close"
            >
              ✕
            </button>
            <img
              src={previewModel.imageUrl}
              alt={previewModel.name}
              className={styles.modelOverlayImg}
              referrerPolicy="no-referrer"
            />
            <div className={styles.modelOverlayInfo}>
              <div className={styles.modelOverlayMeta}>
                <p className={styles.modelOverlayName}>{previewModel.name}</p>
                {previewModel.ethnicity && <p className={styles.modelOverlayDetail}>{previewModel.ethnicity}</p>}
                {previewModel.bodyBuild && <p className={styles.modelOverlayDetail}>{previewModel.bodyBuild}</p>}
                {previewModel.height && <p className={styles.modelOverlayDetail}>{previewModel.height}</p>}
              </div>
              <button
                type="button"
                className={`${landingStyles.btnPrimary} ${styles.modelOverlaySelect}`}
                onClick={() => { setSelectedModelId(previewModel.id); setPreviewModel(null); }}
              >
                {selectedModelId === previewModel.id ? "Selected ✓" : "Select model"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const PROGRESS_STEPS = [
  { key: "pending", label: "Analysing your garment" },
  { key: "generating_front", label: "Dressing the model" },
  { key: "completed", label: "Your studio shot is ready" },
] as const;

function getActiveStep(status: string): number {
  if (status === "pending") return 0;
  if (status === "generating_front") return 1;
  if (status === "completed" || status === "failed") return 2;
  return 0;
}

function TryPollResult({
  outfitId,
  flatLayPreviewUrl,
  installUrl,
  showInstallCta,
  onReset,
}: {
  outfitId: string;
  flatLayPreviewUrl: string | null;
  installUrl: string;
  showInstallCta: boolean;
  onReset: () => void;
}) {
  const [status, setStatus] = useState<string>("pending");
  const [images, setImages] = useState<{ pose: string; imageUrl: string }[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef(Date.now());

  useEffect(() => {
    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startRef.current) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      const res = await fetch(`/try/status?outfitId=${encodeURIComponent(outfitId)}`);
      const data = (await res.json()) as {
        status: string;
        errorMessage?: string | null;
        images?: { pose: string; imageUrl: string }[];
      };
      if (cancelled) return;
      setStatus(data.status);
      if (data.errorMessage) setErrorMsg(data.errorMessage);
      if (data.images?.length) setImages(data.images);
      if (data.status !== "completed" && data.status !== "failed") {
        setTimeout(poll, 2500);
      }
    };
    poll();
    return () => {
      cancelled = true;
    };
  }, [outfitId]);

  const activeStep = getActiveStep(status);
  const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const ss = String(elapsed % 60).padStart(2, "0");
  const resultImage = images.find((i) => i.pose === "front") ?? images[0] ?? null;

  if (status === "failed") {
    return (
      <div className={styles.progressPanel}>
        <p className={styles.error}>{errorMsg || "Generation failed. Please try a different garment image."}</p>
        <button type="button" className={styles.uploadButton} onClick={onReset}>
          Try a different image
        </button>
      </div>
    );
  }

  return (
    <div className={styles.progressPanel}>
      {status !== "completed" && (
        <>
          <ol className={styles.progressSteps}>
            {PROGRESS_STEPS.map((step, i) => (
              <li
                key={step.key}
                className={
                  i < activeStep
                    ? styles.stepDone
                    : i === activeStep
                    ? styles.stepActive
                    : styles.stepPending
                }
              >
                <span className={styles.stepDot}>{i < activeStep ? "✓" : i + 1}</span>
                <span className={styles.stepLabel}>{step.label}</span>
              </li>
            ))}
          </ol>
          <p className={styles.timerLine}>Usually 45–90 sec · {mm}:{ss} elapsed</p>
        </>
      )}

      {status === "completed" && resultImage && (
        <>
          <div className={styles.resultReveal}>
            <img
              src={resultImage.imageUrl}
              alt="Studio shot"
              className={`${styles.revealImg} ${styles.revealImgResult}`}
            />
          </div>
          <div className={styles.revealActions}>
            <a href={resultImage.imageUrl} download="studio-shot.jpg" className={styles.downloadButton}>
              Download
            </a>
          </div>
          {showInstallCta && (
            <div className={styles.resultCta}>
              <p className={styles.resultCtaText}>Want 3 angles for your whole catalogue?</p>
              <a
                href={installUrl || "/auth/login"}
                {...(installUrl ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                className={landingStyles.btnPrimary}
              >
                Add the app to my store
              </a>
            </div>
          )}
        </>
      )}
    </div>
  );
}
