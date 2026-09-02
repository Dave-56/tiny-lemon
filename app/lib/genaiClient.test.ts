import { describe, expect, it, vi } from 'vitest';
import {
  OpenRouterApiError,
  OpenRouterGenAIClient,
  buildOpenRouterChatBody,
  buildOpenRouterImagesBody,
  createGenAIClient,
  getGenAIApiKey,
  getGenAIProviderName,
  isImageGenerationRequest,
  toOpenRouterModelId,
  type GenAIRequest,
} from './genaiClient';
import { classifyImageProviderError } from './flatLayCleanup';

vi.mock('./observability.server', () => ({ logServerEvent: vi.fn() }));

const PNG = 'iVBORw0KGgo=';
const JPG = '/9j/4AAQSkZJRg==';

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function makeClient(handler: (url: string, init: RequestInit) => Response | Promise<Response>) {
  const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) =>
    handler(String(input), init ?? {}),
  );
  const client = new OpenRouterGenAIClient({
    apiKey: 'sk-or-test',
    fetch: fetchMock as unknown as typeof fetch,
    appUrl: 'https://tinylemon.xyz',
  });
  return { client, fetchMock };
}

function lastBody(fetchMock: ReturnType<typeof vi.fn>) {
  const [, init] = fetchMock.mock.calls.at(-1) as [string, RequestInit];
  return JSON.parse(String(init.body));
}

describe('provider selection', () => {
  it('defaults to Gemini when no OpenRouter key is present', () => {
    const env = { GEMINI_API_KEY: 'g' } as NodeJS.ProcessEnv;
    expect(getGenAIProviderName(env)).toBe('gemini');
    expect(getGenAIApiKey(env)).toBe('g');
  });

  it('prefers OpenRouter when its key is present, and honours the explicit override', () => {
    const env = { GEMINI_API_KEY: 'g', OPENROUTER_API_KEY: 'o' } as NodeJS.ProcessEnv;
    expect(getGenAIProviderName(env)).toBe('openrouter');
    expect(getGenAIApiKey(env)).toBe('o');
    expect(getGenAIProviderName({ ...env, GENAI_PROVIDER: 'gemini' })).toBe('gemini');
    expect(getGenAIApiKey({ GENAI_PROVIDER: 'openrouter' } as NodeJS.ProcessEnv)).toBeUndefined();
  });

  it('throws a clear error when the selected provider has no key', () => {
    expect(() =>
      createGenAIClient({ env: { GENAI_PROVIDER: 'openrouter' } as NodeJS.ProcessEnv }),
    ).toThrow(/OPENROUTER_API_KEY/);
    expect(() => createGenAIClient({ env: {} as NodeJS.ProcessEnv })).toThrow(/GEMINI_API_KEY/);
  });

  it('builds an OpenRouter client from env', () => {
    const client = createGenAIClient({ env: { OPENROUTER_API_KEY: 'o' } as NodeJS.ProcessEnv });
    expect(client).toBeInstanceOf(OpenRouterGenAIClient);
  });
});

describe('model id mapping', () => {
  it('maps the default Gemini ids onto OpenRouter ids and passes namespaced ids through', () => {
    expect(toOpenRouterModelId('gemini-3.1-flash-image-preview')).toBe('google/gemini-3.1-flash-image');
    expect(toOpenRouterModelId('gemini-2.5-flash')).toBe('google/gemini-2.5-flash');
    expect(toOpenRouterModelId('google/gemini-3-pro-image')).toBe('google/gemini-3-pro-image');
  });

  it('detects image requests by modality or by model name', () => {
    expect(
      isImageGenerationRequest({
        model: 'gemini-2.5-flash',
        contents: { parts: [] },
        config: { responseModalities: ['IMAGE'] },
      }),
    ).toBe(true);
    expect(isImageGenerationRequest({ model: 'gemini-3.1-flash-image-preview', contents: { parts: [] } })).toBe(true);
    expect(isImageGenerationRequest({ model: 'gemini-2.5-flash', contents: { parts: [] } })).toBe(false);
  });
});

describe('request translation', () => {
  const imageRequest: GenAIRequest = {
    model: 'gemini-3.1-flash-image-preview',
    contents: [{
      role: 'user',
      parts: [
        { text: 'BACK VIEW: rotate the model.' },
        { text: 'IMAGE 1: garment flat lay.' },
        { inlineData: { data: PNG, mimeType: 'image/png' } },
        { text: 'IMAGE 2: model reference.' },
        { inlineData: { data: JPG, mimeType: 'image/jpeg' } },
        { text: 'Generate the photo.' },
      ],
    }],
    config: {
      responseModalities: ['IMAGE'],
      imageConfig: { aspectRatio: '2:3', imageSize: '1K' },
      thinkingConfig: { thinkingLevel: 'MINIMAL' },
      temperature: 0.3,
    },
  };

  it('turns a multi-image Gemini request into an Images API body with ordered references', () => {
    const body = buildOpenRouterImagesBody(imageRequest);
    expect(body.model).toBe('google/gemini-3.1-flash-image');
    expect(body.prompt).toBe(
      'BACK VIEW: rotate the model.\n\nIMAGE 1: garment flat lay.\n\nIMAGE 2: model reference.\n\nGenerate the photo.',
    );
    expect(body.aspect_ratio).toBe('2:3');
    expect(body.resolution).toBe('1K');
    expect(body.n).toBe(1);
    expect(body.output_format).toBe('png');
    expect(body.input_references).toEqual([
      { type: 'image_url', image_url: { url: `data:image/png;base64,${PNG}` } },
      { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${JPG}` } },
    ]);
  });

  it('omits aspect ratio, resolution and references when the request has none', () => {
    const body = buildOpenRouterImagesBody({
      model: 'gemini-3.1-flash-image-preview',
      contents: { parts: [{ text: 'a red circle' }] },
      config: { responseModalities: ['IMAGE'], temperature: 0.2 },
    });
    expect(body).toEqual({
      model: 'google/gemini-3.1-flash-image',
      prompt: 'a red circle',
      n: 1,
      output_format: 'png',
    });
  });

  it('turns a vision request into a chat body with data-URL image parts and JSON mode', () => {
    const body = buildOpenRouterChatBody({
      model: 'gemini-2.5-flash',
      contents: { parts: [{ inlineData: { data: JPG, mimeType: 'image/jpeg' } }, { text: 'Describe the garment.' }] },
      config: { temperature: 0.2, responseMimeType: 'application/json' },
    });
    expect(body).toEqual({
      model: 'google/gemini-2.5-flash',
      messages: [{
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${JPG}` } },
          { type: 'text', text: 'Describe the garment.' },
        ],
      }],
      temperature: 0.2,
      response_format: { type: 'json_object' },
    });
  });
});

describe('OpenRouterGenAIClient', () => {
  it('returns generated images as Gemini-shaped inline data', async () => {
    const { client, fetchMock } = makeClient((url) => {
      expect(url).toBe('https://openrouter.ai/api/v1/images');
      return jsonResponse(200, { data: [{ b64_json: PNG, media_type: 'image/png' }] });
    });

    const response = await client.models.generateContent({
      model: 'gemini-3.1-flash-image-preview',
      contents: { parts: [{ inlineData: { data: JPG, mimeType: 'image/jpeg' } }, { text: 'clean flat lay' }] },
      config: { responseModalities: ['IMAGE'], temperature: 0.2 },
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer sk-or-test');
    expect(headers['HTTP-Referer']).toBe('https://tinylemon.xyz');
    expect(lastBody(fetchMock).input_references).toHaveLength(1);
    expect(response.candidates?.[0]?.finishReason).toBe('STOP');
    expect(response.candidates?.[0]?.content?.parts?.[0]?.inlineData).toEqual({
      data: PNG,
      mimeType: 'image/png',
    });
  });

  it('accepts data-URL image results and reports an empty result without throwing', async () => {
    const { client: withUrl } = makeClient(() =>
      jsonResponse(200, { data: [{ url: `data:image/png;base64,${PNG}` }] }),
    );
    const urlResponse = await withUrl.models.generateContent({
      model: 'gemini-3.1-flash-image-preview',
      contents: { parts: [{ text: 'x' }] },
    });
    expect(urlResponse.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data).toBe(PNG);

    const { client: empty } = makeClient(() => jsonResponse(200, { data: [] }));
    const emptyResponse = await empty.models.generateContent({
      model: 'gemini-3.1-flash-image-preview',
      contents: { parts: [{ text: 'x' }] },
    });
    expect(emptyResponse.candidates?.[0]?.finishReason).toBe('OTHER');
    expect(emptyResponse.candidates?.[0]?.content?.parts).toEqual([]);
  });

  it('returns chat text on both response.text and the first candidate part', async () => {
    const { client, fetchMock } = makeClient((url) => {
      expect(url).toBe('https://openrouter.ai/api/v1/chat/completions');
      return jsonResponse(200, {
        choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: '{"count":1,"confidence":0.9}' } }],
      });
    });

    const response = await client.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [{ role: 'user', parts: [{ inlineData: { data: PNG, mimeType: 'image/png' } }, { text: 'count' }] }],
      config: { temperature: 0 },
    });

    expect(lastBody(fetchMock).temperature).toBe(0);
    expect(response.text).toBe('{"count":1,"confidence":0.9}');
    expect(response.candidates?.[0]?.content?.parts?.[0]?.text).toBe('{"count":1,"confidence":0.9}');
    expect(response.candidates?.[0]?.finishReason).toBe('STOP');
  });

  it('surfaces API errors with status and code so the classifier can refund correctly', async () => {
    const { client } = makeClient(() =>
      jsonResponse(402, {
        error: { code: 402, message: 'Insufficient credits. Add more using https://openrouter.ai/settings/credits' },
      }),
    );

    const promise = client.models.generateContent({
      model: 'gemini-3.1-flash-image-preview',
      contents: { parts: [{ text: 'x' }] },
    });
    await expect(promise).rejects.toBeInstanceOf(OpenRouterApiError);
    const error = (await promise.catch(e => e)) as OpenRouterApiError;
    expect(error.status).toBe(402);
    expect(error.message).toContain('Insufficient credits');
    expect(classifyImageProviderError(error)).toBe('provider_billing');
  });

  it('maps rate limits and upstream failures to the existing refundable kinds', async () => {
    const { client: limited } = makeClient(() =>
      jsonResponse(429, { error: { code: 429, message: 'Rate limit exceeded' } }),
    );
    const limitedError = await limited.models
      .generateContent({ model: 'gemini-2.5-flash', contents: { parts: [{ text: 'x' }] } })
      .catch(e => e as Error);
    expect(classifyImageProviderError(limitedError)).toBe('quota_or_rate_limit');

    const { client: upstream } = makeClient(() =>
      jsonResponse(502, {
        error: { code: 502, message: 'Provider returned error', metadata: { raw: 'model overloaded', provider_name: 'Google' } },
      }),
    );
    const upstreamError = (await upstream.models
      .generateContent({ model: 'gemini-2.5-flash', contents: { parts: [{ text: 'x' }] } })
      .catch(e => e)) as Error;
    expect(upstreamError.message).toContain('model overloaded');
    expect(classifyImageProviderError(upstreamError)).toBe('provider_unavailable');
  });

  it('treats a 200 body that carries an error object as a failure', async () => {
    const { client } = makeClient(() =>
      jsonResponse(200, { error: { code: 'moderation', message: 'Your input was flagged by moderation' } }),
    );
    const error = await client.models
      .generateContent({ model: 'gemini-3.1-flash-image-preview', contents: { parts: [{ text: 'x' }] } })
      .catch(e => e as Error);
    expect(error).toBeInstanceOf(OpenRouterApiError);
    expect(classifyImageProviderError(error)).toBe('safety');
  });
});
