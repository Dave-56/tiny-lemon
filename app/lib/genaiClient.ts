/**
 * Provider-neutral generative AI client.
 *
 * Every call site in the app was written against the @google/genai
 * `ai.models.generateContent(request)` shape and reads back either
 * `response.text` or `response.candidates[0].content.parts[].inlineData.data`.
 * This module keeps that contract and swaps the transport underneath:
 *
 *   - `openrouter` (default when OPENROUTER_API_KEY is set): the same Google
 *     image/text models, billed through OpenRouter prepaid credits. Image
 *     requests go to OpenRouter's Images API; text/vision requests go to
 *     chat completions.
 *   - `gemini`: the original direct Google Gemini API.
 *
 * Select explicitly with GENAI_PROVIDER=openrouter|gemini.
 */
import { GoogleGenAI } from '@google/genai';

// Fields are optional to stay assignable from the @google/genai response types.
export type GenAIInlineData = { data?: string; mimeType?: string };
export type GenAIPart = { text?: string; inlineData?: GenAIInlineData };
export type GenAIContent = { role?: string; parts?: GenAIPart[] };

export type GenAIImageConfig = { aspectRatio?: string; imageSize?: string };

export type GenAIRequestConfig = {
  temperature?: number;
  responseModalities?: readonly string[];
  responseMimeType?: string;
  imageConfig?: GenAIImageConfig;
  thinkingConfig?: unknown;
  [key: string]: unknown;
};

export type GenAIRequest = {
  model: string;
  contents: GenAIContent | GenAIContent[] | { parts: GenAIPart[] };
  config?: GenAIRequestConfig;
};

export type GenAICandidate = {
  finishReason?: string;
  content?: { parts?: GenAIPart[] };
};

export type GenAIResponse = {
  text?: string;
  candidates?: GenAICandidate[];
};

export interface GenAIClient {
  models: {
    generateContent(request: GenAIRequest): Promise<GenAIResponse>;
  };
}

export type GenAIProviderName = 'openrouter' | 'gemini';

// ─── Provider selection ─────────────────────────────────────────────────────

export function getGenAIProviderName(env: NodeJS.ProcessEnv = process.env): GenAIProviderName {
  const explicit = (env.GENAI_PROVIDER ?? '').trim().toLowerCase();
  if (explicit === 'openrouter' || explicit === 'gemini') return explicit;
  return env.OPENROUTER_API_KEY ? 'openrouter' : 'gemini';
}

/**
 * The API key for the active provider, or undefined when it is not configured.
 * Request paths use this to answer 503 early instead of failing mid-call.
 */
export function getGenAIApiKey(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return getGenAIProviderName(env) === 'openrouter'
    ? env.OPENROUTER_API_KEY || undefined
    : env.GEMINI_API_KEY || undefined;
}

export function createGenAIClient(
  options: { apiKey?: string; env?: NodeJS.ProcessEnv; fetch?: typeof fetch } = {},
): GenAIClient {
  const env = options.env ?? process.env;
  const provider = getGenAIProviderName(env);

  if (provider === 'openrouter') {
    const apiKey = env.OPENROUTER_API_KEY;
    if (!apiKey) {
      throw new Error('OPENROUTER_API_KEY is not set (GENAI_PROVIDER=openrouter).');
    }
    return new OpenRouterGenAIClient({
      apiKey,
      fetch: options.fetch,
      appUrl: env.SHOPIFY_APP_URL,
    });
  }

  const apiKey = options.apiKey ?? env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not set (GENAI_PROVIDER=gemini).');
  }
  return new GeminiGenAIClient(apiKey);
}

// ─── Gemini (direct) ────────────────────────────────────────────────────────

export class GeminiGenAIClient implements GenAIClient {
  private readonly ai: GoogleGenAI;
  readonly models: GenAIClient['models'];

  constructor(apiKey: string) {
    this.ai = new GoogleGenAI({ apiKey });
    this.models = {
      // The SDK's parameter type is stricter than GenAIRequest (enum unions for
      // modalities/aspect ratios). Every call site passes SDK-valid values, so
      // the cast only relaxes the compile-time check at this one boundary.
      generateContent: (request) =>
        this.ai.models.generateContent(
          request as unknown as Parameters<GoogleGenAI['models']['generateContent']>[0],
        ),
    };
  }
}

// ─── OpenRouter ─────────────────────────────────────────────────────────────

export const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

/** Direct Gemini ids → OpenRouter ids. Anything already namespaced passes through. */
const OPENROUTER_MODEL_ALIASES: Record<string, string> = {
  'gemini-3.1-flash-image-preview': 'google/gemini-3.1-flash-image',
  'gemini-3.1-flash-image': 'google/gemini-3.1-flash-image',
  'gemini-2.5-flash-image-preview': 'google/gemini-2.5-flash-image',
  'gemini-2.5-flash-image': 'google/gemini-2.5-flash-image',
  'gemini-3-pro-image-preview': 'google/gemini-3-pro-image',
};

export function toOpenRouterModelId(model: string): string {
  if (model.includes('/')) return model;
  return OPENROUTER_MODEL_ALIASES[model] ?? `google/${model}`;
}

export class OpenRouterApiError extends Error {
  status: number;
  code?: string | number;
  endpoint: string;

  constructor(args: { status: number; code?: string | number; message: string; endpoint: string }) {
    super(`OpenRouter ${args.endpoint} ${args.status}${args.code ? ` ${args.code}` : ''}: ${args.message}`);
    this.name = 'OpenRouterApiError';
    this.status = args.status;
    this.code = args.code;
    this.endpoint = args.endpoint;
  }
}

type FlattenedParts = { texts: string[]; images: GenAIInlineData[]; ordered: GenAIPart[] };

export function flattenGenAIParts(contents: GenAIRequest['contents']): FlattenedParts {
  const list: GenAIContent[] = Array.isArray(contents) ? contents : [contents as GenAIContent];
  const ordered: GenAIPart[] = [];
  for (const content of list) {
    for (const part of content?.parts ?? []) ordered.push(part);
  }
  return {
    ordered,
    texts: ordered.map(p => p.text).filter((t): t is string => typeof t === 'string' && t.length > 0),
    images: ordered.map(p => p.inlineData).filter((d): d is GenAIInlineData => !!d?.data),
  };
}

export function isImageGenerationRequest(request: GenAIRequest): boolean {
  const modalities = request.config?.responseModalities ?? [];
  if (modalities.some(m => String(m).toUpperCase() === 'IMAGE')) return true;
  return /image/i.test(request.model);
}

function toDataUrl(inline: GenAIInlineData): string {
  return `data:${inline.mimeType || 'image/png'};base64,${inline.data ?? ''}`;
}

/** Gemini `imageSize` ('1K' | '2K' | '4K' | '512') → OpenRouter `resolution`. */
function toOpenRouterResolution(imageSize?: string): string | undefined {
  if (!imageSize) return undefined;
  const upper = imageSize.toUpperCase();
  if (upper === '512' || upper === '0.5K') return '512';
  return upper;
}

export type OpenRouterImagesBody = {
  model: string;
  prompt: string;
  n: number;
  output_format: 'png';
  aspect_ratio?: string;
  resolution?: string;
  input_references?: Array<{ type: 'image_url'; image_url: { url: string } }>;
};

export function buildOpenRouterImagesBody(request: GenAIRequest): OpenRouterImagesBody {
  const { texts, images } = flattenGenAIParts(request.contents);
  const body: OpenRouterImagesBody = {
    model: toOpenRouterModelId(request.model),
    prompt: texts.join('\n\n'),
    n: 1,
    output_format: 'png',
  };
  const aspectRatio = request.config?.imageConfig?.aspectRatio;
  if (aspectRatio) body.aspect_ratio = aspectRatio;
  const resolution = toOpenRouterResolution(request.config?.imageConfig?.imageSize);
  if (resolution) body.resolution = resolution;
  if (images.length > 0) {
    body.input_references = images.map(image => ({
      type: 'image_url',
      image_url: { url: toDataUrl(image) },
    }));
  }
  return body;
}

export type OpenRouterChatBody = {
  model: string;
  messages: Array<{
    role: 'user';
    content: Array<
      | { type: 'text'; text: string }
      | { type: 'image_url'; image_url: { url: string } }
    >;
  }>;
  temperature?: number;
  response_format?: { type: 'json_object' };
};

export function buildOpenRouterChatBody(request: GenAIRequest): OpenRouterChatBody {
  const { ordered } = flattenGenAIParts(request.contents);
  const content: OpenRouterChatBody['messages'][number]['content'] = [];
  for (const part of ordered) {
    if (typeof part.text === 'string' && part.text.length > 0) {
      content.push({ type: 'text', text: part.text });
    } else if (part.inlineData?.data) {
      content.push({ type: 'image_url', image_url: { url: toDataUrl(part.inlineData) } });
    }
  }
  const body: OpenRouterChatBody = {
    model: toOpenRouterModelId(request.model),
    messages: [{ role: 'user', content }],
  };
  if (typeof request.config?.temperature === 'number') {
    body.temperature = request.config.temperature;
  }
  if (request.config?.responseMimeType === 'application/json') {
    body.response_format = { type: 'json_object' };
  }
  return body;
}

type OpenRouterErrorPayload = {
  error?: { code?: string | number; message?: string; metadata?: Record<string, unknown> };
};

type OpenRouterImagesResponse = OpenRouterErrorPayload & {
  data?: Array<{ b64_json?: string; url?: string; media_type?: string; revised_prompt?: string }>;
};

type OpenRouterChatResponse = OpenRouterErrorPayload & {
  choices?: Array<{
    finish_reason?: string;
    native_finish_reason?: string;
    message?: {
      content?: string | Array<{ type?: string; text?: string }>;
      images?: Array<{ type?: string; image_url?: { url?: string } }>;
    };
  }>;
};

function mapFinishReason(reason?: string): string | undefined {
  if (!reason) return undefined;
  const lower = reason.toLowerCase();
  if (lower === 'stop' || lower === 'end_turn') return 'STOP';
  if (lower === 'length') return 'MAX_TOKENS';
  if (lower === 'content_filter' || lower === 'safety') return 'SAFETY';
  return reason.toUpperCase();
}

function parseDataUrl(url: string): GenAIInlineData | undefined {
  const match = /^data:([^;,]+);base64,(.+)$/s.exec(url);
  if (!match) return undefined;
  return { mimeType: match[1], data: match[2] };
}

export class OpenRouterGenAIClient implements GenAIClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly appUrl?: string;
  readonly models: GenAIClient['models'];

  constructor(options: { apiKey: string; baseUrl?: string; fetch?: typeof fetch; appUrl?: string }) {
    this.apiKey = options.apiKey;
    this.baseUrl = (options.baseUrl ?? OPENROUTER_BASE_URL).replace(/\/$/, '');
    this.fetchImpl = options.fetch ?? globalThis.fetch;
    this.appUrl = options.appUrl;
    this.models = {
      generateContent: (request) =>
        isImageGenerationRequest(request) ? this.generateImage(request) : this.generateText(request),
    };
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        ...(this.appUrl ? { 'HTTP-Referer': this.appUrl } : {}),
        'X-Title': 'Tiny Lemon',
      },
      body: JSON.stringify(body),
    });

    const raw = await response.text();
    let parsed: T & OpenRouterErrorPayload;
    try {
      parsed = raw ? (JSON.parse(raw) as T & OpenRouterErrorPayload) : ({} as T & OpenRouterErrorPayload);
    } catch {
      throw new OpenRouterApiError({
        status: response.status,
        message: `non-JSON response: ${raw.slice(0, 200)}`,
        endpoint: path,
      });
    }

    if (!response.ok || parsed.error) {
      const message = parsed.error?.message ?? response.statusText ?? 'request failed';
      const metadata = parsed.error?.metadata;
      const detail = metadata && typeof metadata.raw === 'string' ? ` (${metadata.raw.slice(0, 300)})` : '';
      throw new OpenRouterApiError({
        status: response.status,
        code: parsed.error?.code,
        message: `${message}${detail}`,
        endpoint: path,
      });
    }
    return parsed;
  }

  private async generateImage(request: GenAIRequest): Promise<GenAIResponse> {
    const body = buildOpenRouterImagesBody(request);
    const result = await this.post<OpenRouterImagesResponse>('/images', body);
    const parts: GenAIPart[] = [];
    for (const item of result.data ?? []) {
      if (item.b64_json) {
        parts.push({ inlineData: { data: item.b64_json, mimeType: item.media_type ?? 'image/png' } });
      } else if (item.url) {
        const inline = parseDataUrl(item.url);
        if (inline) parts.push({ inlineData: inline });
      }
      if (item.revised_prompt) parts.push({ text: item.revised_prompt });
    }
    const hasImage = parts.some(p => !!p.inlineData);
    return {
      candidates: [{ finishReason: hasImage ? 'STOP' : 'OTHER', content: { parts } }],
    };
  }

  private async generateText(request: GenAIRequest): Promise<GenAIResponse> {
    const body = buildOpenRouterChatBody(request);
    const result = await this.post<OpenRouterChatResponse>('/chat/completions', body);
    const choice = result.choices?.[0];
    const content = choice?.message?.content;
    const text = Array.isArray(content)
      ? content.map(c => c.text ?? '').join('')
      : (content ?? '');
    const parts: GenAIPart[] = [];
    if (text) parts.push({ text });
    for (const image of choice?.message?.images ?? []) {
      const inline = image.image_url?.url ? parseDataUrl(image.image_url.url) : undefined;
      if (inline) parts.push({ inlineData: inline });
    }
    return {
      text,
      candidates: [{ finishReason: mapFinishReason(choice?.finish_reason), content: { parts } }],
    };
  }
}
