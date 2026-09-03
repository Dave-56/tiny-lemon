/**
 * Input validation, job start, and job polling for the agent on-model endpoint.
 *
 * Reuses the merchant pipeline end to end: `handleTriggerGeneration` uploads
 * the raw garment, reserves nothing (system shop), and enqueues the
 * `generate-outfit` Trigger.dev task, which runs the full non-demo quality
 * path (flat-lay cleanup, spec extraction, front pose). We only ask for the
 * front pose, which is what one $0.50 call buys.
 */
import { readFileSync } from "fs";
import { join } from "path";
import prisma, { ensureShop } from "../../db.server";
import { handleTriggerGeneration } from "../triggerGeneration.server";
import { logServerEvent } from "../observability.server";
import {
  AGENT_SHOP_ID,
  ON_MODEL_DEFAULT_MODEL_ID,
  ON_MODEL_DEFAULT_WAIT_SECONDS,
  ON_MODEL_MAX_WAIT_SECONDS,
  jobStatusUrl,
} from "./config.server";

// ── Presets ───────────────────────────────────────────────────────────────────

export type PresetModelSummary = {
  id: string;
  name: string;
  gender: string;
  ethnicity: string;
  bodyBuild: string;
  height: string;
};

let presetCache: PresetModelSummary[] | null = null;

export function getAgentPresetModels(): PresetModelSummary[] {
  if (presetCache) return presetCache;
  const raw = readFileSync(join(process.cwd(), "public", "preset-models.json"), "utf-8");
  const arr = JSON.parse(raw) as Array<Partial<PresetModelSummary> & { id: string }>;
  presetCache = arr.map((p) => ({
    id: p.id,
    name: p.name ?? p.id,
    gender: p.gender ?? "",
    ethnicity: p.ethnicity ?? "",
    bodyBuild: p.bodyBuild ?? "",
    height: p.height ?? "",
  }));
  return presetCache;
}

// ── Input ─────────────────────────────────────────────────────────────────────

const ALLOWED_MIME = new Set(["image/png", "image/jpeg", "image/webp"]);
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
/** base64 inflates by 4/3; allow a little slack for whitespace. */
const MAX_BASE64_CHARS = Math.ceil((MAX_IMAGE_BYTES * 4) / 3) + 1024;

export type OnModelInput = {
  garmentImageUrl?: string;
  garmentImageBase64?: string;
  mimeType: string;
  modelId: string;
  wait: number;
};

export type ParsedInput =
  | { ok: true; input: OnModelInput }
  | { ok: false; status: number; error: string; message: string };

function invalid(message: string, error = "invalid_input", status = 400): ParsedInput {
  return { ok: false, status, error, message };
}

/** Validates the JSON body. Runs before any payment so bad input is free. */
export function parseOnModelInput(body: unknown): ParsedInput {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return invalid("Body must be a JSON object.");
  }
  const b = body as Record<string, unknown>;

  const url = typeof b.garmentImageUrl === "string" ? b.garmentImageUrl.trim() : "";
  let base64 = typeof b.garmentImageBase64 === "string" ? b.garmentImageBase64.trim() : "";
  if (!url && !base64) {
    return invalid("Provide garmentImageUrl (https) or garmentImageBase64.", "missing_garment");
  }
  if (url && base64) {
    return invalid("Provide only one of garmentImageUrl or garmentImageBase64.");
  }

  let mimeType = typeof b.mimeType === "string" ? b.mimeType.trim().toLowerCase() : "";
  if (url) {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return invalid("garmentImageUrl is not a valid URL.");
    }
    if (parsed.protocol !== "https:") {
      return invalid("garmentImageUrl must use https.");
    }
    if (url.length > 2048) {
      return invalid("garmentImageUrl is too long.");
    }
  } else {
    const dataUrl = /^data:([a-z0-9.+/-]+);base64,(.*)$/is.exec(base64);
    if (dataUrl) {
      mimeType = mimeType || dataUrl[1].toLowerCase();
      base64 = dataUrl[2];
    }
    base64 = base64.replace(/\s+/g, "");
    if (base64.length > MAX_BASE64_CHARS) {
      return invalid("garmentImageBase64 exceeds the 10 MB limit.", "image_too_large", 413);
    }
    if (!/^[A-Za-z0-9+/]+=*$/.test(base64)) {
      return invalid("garmentImageBase64 is not valid base64.");
    }
    mimeType = mimeType || "image/png";
    if (!ALLOWED_MIME.has(mimeType)) {
      return invalid("mimeType must be image/png, image/jpeg, or image/webp.");
    }
  }

  const modelId = typeof b.modelId === "string" && b.modelId.trim()
    ? b.modelId.trim()
    : ON_MODEL_DEFAULT_MODEL_ID;
  if (!getAgentPresetModels().some((p) => p.id === modelId)) {
    return invalid(
      `Unknown modelId "${modelId}". See GET /api/on-model for the preset list.`,
      "unknown_model",
    );
  }

  let wait = ON_MODEL_DEFAULT_WAIT_SECONDS;
  if (b.wait !== undefined) {
    const n = typeof b.wait === "number" ? b.wait : Number(b.wait);
    if (!Number.isFinite(n) || n < 0) {
      return invalid("wait must be a non-negative number of seconds.");
    }
    wait = Math.min(Math.floor(n), ON_MODEL_MAX_WAIT_SECONDS);
  }

  return {
    ok: true,
    input: {
      ...(url ? { garmentImageUrl: url } : { garmentImageBase64: base64 }),
      mimeType: url ? mimeType : mimeType,
      modelId,
      wait,
    },
  };
}

// ── Garment fetch ─────────────────────────────────────────────────────────────

export class GarmentFetchError extends Error {
  status: number;
  constructor(message: string, status = 422) {
    super(message);
    this.name = "GarmentFetchError";
    this.status = status;
  }
}

/** Resolves the garment to base64 + mime, fetching remote URLs with a hard cap. */
export async function resolveGarment(
  input: OnModelInput,
): Promise<{ frontB64: string; frontMime: string }> {
  if (input.garmentImageBase64) {
    return { frontB64: input.garmentImageBase64, frontMime: input.mimeType };
  }
  const url = input.garmentImageUrl!;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  let res: Response;
  try {
    res = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: { accept: "image/png,image/jpeg,image/webp,image/*" },
    });
  } catch (error) {
    clearTimeout(timer);
    throw new GarmentFetchError(
      `Could not download garmentImageUrl: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  clearTimeout(timer);
  if (!res.ok) {
    throw new GarmentFetchError(`garmentImageUrl returned HTTP ${res.status}.`);
  }
  const declaredLength = Number(res.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_IMAGE_BYTES) {
    throw new GarmentFetchError("garmentImageUrl exceeds the 10 MB limit.", 413);
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.byteLength > MAX_IMAGE_BYTES) {
    throw new GarmentFetchError("garmentImageUrl exceeds the 10 MB limit.", 413);
  }
  const contentType = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  const mime = ALLOWED_MIME.has(contentType)
    ? contentType
    : input.mimeType && ALLOWED_MIME.has(input.mimeType)
      ? input.mimeType
      : sniffImageMime(buffer);
  if (!mime) {
    throw new GarmentFetchError("garmentImageUrl is not a PNG, JPEG, or WebP image.");
  }
  return { frontB64: buffer.toString("base64"), frontMime: mime };
}

function sniffImageMime(buffer: Buffer): string | null {
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return "image/png";
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP") {
    return "image/webp";
  }
  return null;
}

// ── Job lifecycle ─────────────────────────────────────────────────────────────

export class JobStartError extends Error {
  status: number;
  code: string;
  constructor(message: string, status = 502, code = "generation_unavailable") {
    super(message);
    this.name = "JobStartError";
    this.status = status;
    this.code = code;
  }
}

export type AgentProtocol = "mpp" | "x402" | "free";

/**
 * Starts a generation and returns the job id (the outfit id).
 * `nonce` keeps the merchant idempotency key unique per paid call so two
 * agents sending the same garment never share one job.
 */
export async function startOnModelJob(args: {
  frontB64: string;
  frontMime: string;
  modelId: string;
  protocol: AgentProtocol;
  nonce: string;
}): Promise<string> {
  await ensureShop(AGENT_SHOP_ID);
  const res = await handleTriggerGeneration(AGENT_SHOP_ID, {
    skuName: `agent:${args.protocol}:${args.nonce}`,
    modelId: args.modelId,
    frontB64: args.frontB64,
    frontMime: args.frontMime,
    styleId: "white-studio",
    brandStyleId: "minimal",
  });
  const data = (await res.json().catch(() => ({}))) as {
    outfitId?: string;
    error?: string;
    message?: string;
  };
  if (!res.ok || !data.outfitId) {
    logServerEvent("error", "agent_on_model.start_failed", {
      status: res.status,
      error: data.error ?? null,
      protocol: args.protocol,
    });
    throw new JobStartError(
      data.message ?? data.error ?? "Generation could not be started.",
      res.status >= 500 || res.status === 402 ? 502 : res.status,
    );
  }
  logServerEvent("info", "agent_on_model.started", {
    jobId: data.outfitId,
    protocol: args.protocol,
    modelId: args.modelId,
  });
  return data.outfitId;
}

export type JobState =
  | {
      status: "completed";
      jobId: string;
      modelId: string;
      createdAt: Date;
      image: { url: string; mimeType: string; width: number; height: number; pose: "front" };
    }
  | { status: "processing"; jobId: string; modelId: string; createdAt: Date; stage: string }
  | { status: "failed"; jobId: string; modelId: string; createdAt: Date; error: string };

export async function getJobState(jobId: string): Promise<JobState | null> {
  const outfit = await prisma.outfit.findFirst({
    where: { id: jobId, shopId: AGENT_SHOP_ID },
    select: {
      id: true,
      status: true,
      errorMessage: true,
      modelId: true,
      createdAt: true,
      images: {
        where: { pose: "front" },
        select: { imageUrl: true, assetManifest: true },
        take: 1,
      },
    },
  });
  if (!outfit) return null;
  const front = outfit.images[0];
  if (outfit.status === "completed" && front) {
    const manifest = (front.assetManifest ?? null) as
      | { original?: { width?: number; height?: number; url?: string } }
      | null;
    return {
      status: "completed",
      jobId: outfit.id,
      modelId: outfit.modelId,
      createdAt: outfit.createdAt,
      image: {
        url: front.imageUrl,
        mimeType: "image/png",
        width: manifest?.original?.width ?? 800,
        height: manifest?.original?.height ?? 1200,
        pose: "front",
      },
    };
  }
  if (outfit.status === "failed") {
    return {
      status: "failed",
      jobId: outfit.id,
      modelId: outfit.modelId,
      createdAt: outfit.createdAt,
      error: outfit.errorMessage ?? "Generation failed.",
    };
  }
  return {
    status: "processing",
    jobId: outfit.id,
    modelId: outfit.modelId,
    createdAt: outfit.createdAt,
    stage: outfit.status,
  };
}

/** Polls the job until it is terminal or `maxMs` elapses. */
export async function waitForJob(jobId: string, maxMs: number): Promise<JobState | null> {
  const deadline = Date.now() + maxMs;
  let state = await getJobState(jobId);
  while (state && state.status === "processing" && Date.now() < deadline) {
    const remaining = deadline - Date.now();
    await new Promise((resolve) => setTimeout(resolve, Math.min(2_000, Math.max(250, remaining))));
    state = await getJobState(jobId);
  }
  return state;
}

// ── Response shapes ───────────────────────────────────────────────────────────

export function jobResponse(state: JobState, origin: string): { status: number; body: Record<string, unknown> } {
  const model = getAgentPresetModels().find((p) => p.id === state.modelId);
  const common = {
    jobId: state.jobId,
    statusUrl: jobStatusUrl(origin, state.jobId),
    model: model ? { id: model.id, name: model.name, gender: model.gender } : { id: state.modelId },
    createdAt: state.createdAt.toISOString(),
  };
  if (state.status === "completed") {
    return { status: 200, body: { status: "completed", ...common, image: state.image } };
  }
  if (state.status === "failed") {
    return { status: 502, body: { status: "failed", ...common, error: state.error } };
  }
  return {
    status: 202,
    body: {
      status: "processing",
      ...common,
      stage: state.stage,
      pollAfterSeconds: 5,
      message: "Image is still generating. GET statusUrl (free) until status is completed.",
    },
  };
}

// ── OpenAPI / discovery material (shared by MPP, x402 Bazaar, AgentCash) ──────

export const ON_MODEL_EXAMPLE_INPUT = {
  garmentImageUrl: "https://tinylemon.xyz/landing-before.png",
  modelId: "model-01",
  wait: 20,
};

export function onModelInputSchema(): Record<string, unknown> {
  const presets = getAgentPresetModels();
  return {
    type: "object",
    required: ["garmentImageUrl"],
    properties: {
      garmentImageUrl: {
        type: "string",
        format: "uri",
        description:
          "HTTPS URL of a garment flat-lay photo (PNG, JPEG, or WebP, max 10 MB). Use this or garmentImageBase64.",
        example: ON_MODEL_EXAMPLE_INPUT.garmentImageUrl,
      },
      garmentImageBase64: {
        type: "string",
        description:
          "Base64 garment image (raw base64 or a data: URL). Alternative to garmentImageUrl. Max 10 MB decoded.",
      },
      mimeType: {
        type: "string",
        enum: ["image/png", "image/jpeg", "image/webp"],
        description: "MIME type of garmentImageBase64. Ignored for URLs. Defaults to image/png.",
      },
      modelId: {
        type: "string",
        enum: presets.map((p) => p.id),
        default: ON_MODEL_DEFAULT_MODEL_ID,
        description:
          "Preset model to dress: " + presets.map((p) => `${p.id} (${p.name}, ${p.gender})`).join(", ") + ".",
        example: ON_MODEL_DEFAULT_MODEL_ID,
      },
      wait: {
        type: "integer",
        minimum: 0,
        maximum: ON_MODEL_MAX_WAIT_SECONDS,
        default: ON_MODEL_DEFAULT_WAIT_SECONDS,
        description:
          "Seconds to hold the request open for the image. If generation is still running afterwards the call returns 202 with a free statusUrl to poll.",
      },
    },
    additionalProperties: false,
  };
}

export const ON_MODEL_EXAMPLE_OUTPUT = {
  status: "completed",
  jobId: "cmf0z8k9x0001abcd12345678",
  statusUrl: "https://tinylemon.xyz/api/on-model/jobs/cmf0z8k9x0001abcd12345678",
  model: { id: "model-01", name: "Aisha", gender: "Female" },
  createdAt: "2026-09-03T18:00:00.000Z",
  image: {
    url: "https://axuxhuif6aiflbu8.public.blob.vercel-storage.com/outfits/__agent__/cmf0z8k9x0001abcd12345678/front.1a2b3c4d.png",
    mimeType: "image/png",
    width: 800,
    height: 1200,
    pose: "front",
  },
};

export const ON_MODEL_EXAMPLE_PROCESSING = {
  status: "processing",
  jobId: "cmf0z8k9x0001abcd12345678",
  statusUrl: "https://tinylemon.xyz/api/on-model/jobs/cmf0z8k9x0001abcd12345678",
  model: { id: "model-01", name: "Aisha", gender: "Female" },
  createdAt: "2026-09-03T18:00:00.000Z",
  stage: "generating_front",
  pollAfterSeconds: 5,
  message: "Image is still generating. GET statusUrl (free) until status is completed.",
};

export function onModelOutputSchema(): Record<string, unknown> {
  return {
    type: "object",
    required: ["status", "jobId", "statusUrl"],
    properties: {
      status: { type: "string", enum: ["completed", "processing", "failed"] },
      jobId: { type: "string" },
      statusUrl: { type: "string", format: "uri", description: "Free GET endpoint returning this same object." },
      model: {
        type: "object",
        properties: { id: { type: "string" }, name: { type: "string" }, gender: { type: "string" } },
      },
      createdAt: { type: "string", format: "date-time" },
      image: {
        type: "object",
        description: "Present when status is completed.",
        properties: {
          url: { type: "string", format: "uri" },
          mimeType: { type: "string" },
          width: { type: "integer" },
          height: { type: "integer" },
          pose: { type: "string" },
        },
      },
      stage: { type: "string", description: "Present while processing." },
      pollAfterSeconds: { type: "integer", description: "Present while processing." },
      message: { type: "string" },
      error: { type: "string", description: "Present when status is failed." },
    },
  };
}
