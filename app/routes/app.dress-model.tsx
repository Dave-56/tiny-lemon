import { useState, useRef, useEffect } from 'react';
import type { HeadersFunction, LoaderFunctionArgs } from 'react-router';
import { useLoaderData, useRouteError } from 'react-router';
import { boundary } from '@shopify/shopify-app-react-router/server';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import { Upload, X, Download, Loader2 } from 'lucide-react';
import type { PresetModelEntry } from '../lib/types';
import { cleanFlatLay } from '../lib/flatLayCleanup';
import { extractGarmentSpec } from '../lib/garmentSpec';
import { buildPromptFromSpec } from '../lib/garmentFidelityPrompt';
import { normalizeReferenceImage } from '../lib/normalizeReferenceImage';
import { cropToTargetAspectRatio } from '../lib/deterministicCrop';
import { PDP_STYLE_PRESETS, STYLING_DIRECTION_PRESETS } from '../lib/pdpPresets';

export const loader = async (_: LoaderFunctionArgs) => {
  return { geminiApiKey: process.env.GEMINI_API_KEY ?? '' };
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

function extractImage(response: {
  candidates?: Array<{ finishReason?: string; content?: { parts?: Array<{ inlineData?: { data?: string } }> } }>;
}): string {
  for (const part of response.candidates?.[0]?.content?.parts ?? []) {
    if (part.inlineData?.data) return `data:image/png;base64,${part.inlineData.data}`;
  }
  const reason = response.candidates?.[0]?.finishReason;
  if (reason === 'IMAGE_SAFETY' || reason === 'SAFETY') throw new Error('Image filtered by safety system. Try a different garment photo.');
  throw new Error('No image returned. Try again.');
}

function readBrandPrefs() {
  try {
    const saved = localStorage.getItem('nanobanana_pdp_presets');
    if (saved) {
      const p = JSON.parse(saved) as Record<string, unknown>;
      return {
        styleIds: Array.isArray(p.styleIds) ? (p.styleIds as string[]) : [PDP_STYLE_PRESETS[0].id],
        stylingDirectionId: typeof p.stylingDirectionId === 'string' ? p.stylingDirectionId : STYLING_DIRECTION_PRESETS[0].id,
      };
    }
  } catch (_) {}
  return { styleIds: [PDP_STYLE_PRESETS[0].id], stylingDirectionId: STYLING_DIRECTION_PRESETS[0].id };
}

function downloadImage(dataUrl: string, filename: string) {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  a.click();
}

type Phase = 'idle' | 'cleaning' | 'extracting' | 'generating' | 'done';

interface ResultShot {
  angleId: string;
  label: string;
  url: string;
}

const PHASE_LABELS: Record<Phase, string> = {
  idle: '',
  cleaning: 'Cleaning flat lay…',
  extracting: 'Analysing garment…',
  generating: 'Generating shots…',
  done: 'Done',
};

const POSE_LABELS = ['Front', 'Three-quarter', 'Back'];

// ── Component ─────────────────────────────────────────────────────────────────

export default function DressModel() {
  const { geminiApiKey } = useLoaderData<typeof loader>();

  const [presetModels, setPresetModels] = useState<PresetModelEntry[]>([]);
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [frontFile, setFrontFile] = useState<File | null>(null);
  const [frontPreview, setFrontPreview] = useState<string | null>(null);
  const [backFile, setBackFile] = useState<File | null>(null);
  const [backPreview, setBackPreview] = useState<string | null>(null);
  const [skuName, setSkuName] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [currentPose, setCurrentPose] = useState(0);
  const [cleanPreview, setCleanPreview] = useState<string | null>(null);
  const [results, setResults] = useState<ResultShot[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [previewModel, setPreviewModel] = useState<PresetModelEntry | null>(null);
  const cancelRef = useRef(false);
  const frontInputRef = useRef<HTMLInputElement>(null);
  const backInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch('/preset-models.json')
      .then((r) => r.json())
      .then((data: PresetModelEntry[]) => {
        setPresetModels(data);
        if (data[0]) setSelectedModelId(data[0].id);
      })
      .catch(() => {});
  }, []);

  const isGenerating = phase !== 'idle' && phase !== 'done';
  const canGenerate = !!frontFile && !!selectedModelId && !isGenerating;

  function onFrontFile(file: File) {
    setFrontFile(file);
    setFrontPreview(URL.createObjectURL(file));
    setResults([]);
    setCleanPreview(null);
    setError(null);
    setPhase('idle');
  }

  function onBackFile(file: File) {
    setBackFile(file);
    setBackPreview(URL.createObjectURL(file));
  }

  function clearFront() {
    setFrontFile(null);
    setFrontPreview(null);
    setResults([]);
    setCleanPreview(null);
    setPhase('idle');
  }

  function clearBack() {
    setBackFile(null);
    setBackPreview(null);
  }

  async function handleGenerate() {
    if (!frontFile || !selectedModelId) return;
    setError(null);
    setResults([]);
    setCleanPreview(null);
    setPhase('cleaning');
    setCurrentPose(0);
    cancelRef.current = false;

    try {
      // ── Read front flat lay ───────────────────────────────────────────────
      const { base64: rawFrontB64, mimeType: frontMime } = await readFileAsBase64(frontFile);

      // ── Phase 1: Clean flat lay ───────────────────────────────────────────
      const cleanB64 = await cleanFlatLay(rawFrontB64, frontMime, geminiApiKey);
      const cleanDataUrl = `data:image/png;base64,${cleanB64}`;
      setCleanPreview(cleanDataUrl);
      if (cancelRef.current) { setPhase('idle'); return; }

      // ── Phase 2: Extract garment spec ─────────────────────────────────────
      setPhase('extracting');
      const spec = await extractGarmentSpec(cleanB64, 'image/png', geminiApiKey);
      if (cancelRef.current) { setPhase('idle'); return; }

      // ── Fetch + normalize model reference ─────────────────────────────────
      const selectedModel = presetModels.find((m) => m.id === selectedModelId)!;
      const modelResp = await fetch(selectedModel.imageUrl);
      const modelBlob = await modelResp.blob();
      const modelB64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string).split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(modelBlob);
      });
      const normalizedRef = await normalizeReferenceImage(modelB64, 'image/png').catch(() => modelB64);

      // ── Read + clean back flat lay (optional) ─────────────────────────────
      let cleanBackB64: string | null = null;
      if (backFile) {
        const { base64: rawBackB64, mimeType: backMime } = await readFileAsBase64(backFile);
        cleanBackB64 = await cleanFlatLay(rawBackB64, backMime, geminiApiKey).catch(() => null);
      }
      if (cancelRef.current) { setPhase('idle'); return; }

      // ── Brand prefs ───────────────────────────────────────────────────────
      const prefs = readBrandPrefs();
      const stylePreset = PDP_STYLE_PRESETS.find((p) => prefs.styleIds.includes(p.id)) ?? PDP_STYLE_PRESETS[0];
      const stylingDir = STYLING_DIRECTION_PRESETS.find((p) => p.id === prefs.stylingDirectionId) ?? STYLING_DIRECTION_PRESETS[0];

      // ── Create chat session ───────────────────────────────────────────────
      setPhase('generating');
      const ai = new GoogleGenAI({ apiKey: geminiApiKey });
      const genConfig = {
        temperature: 0.2,
        imageConfig: { aspectRatio: '2:3' as const, imageSize: '1K' as const },
        thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH },
      };
      const chat = ai.chats.create({ model: 'gemini-3.1-flash-image-preview', config: genConfig });

      const newResults: ResultShot[] = [];
      let frontResultB64: string | null = null;

      // ── Turn 1: Front ─────────────────────────────────────────────────────
      setCurrentPose(1);
      const frontPrompt = buildPromptFromSpec(spec, 'front', stylePreset.promptSnippet, !!cleanBackB64, false, selectedModel.height, stylingDir);
      const frontMsg = [
        { inlineData: { data: cleanB64, mimeType: 'image/png' as const } },
        { inlineData: { data: normalizedRef, mimeType: 'image/png' as const } },
        { text: frontPrompt },
      ];
      const frontResp = await chat.sendMessage({ message: frontMsg, config: genConfig });
      if (cancelRef.current) { setPhase('idle'); return; }
      let frontUrl = extractImage(frontResp);
      frontResultB64 = frontUrl.replace(/^data:[^;]+;base64,/, '');
      try { frontUrl = await cropToTargetAspectRatio(frontUrl, 2 / 3); } catch (_) {}
      newResults.push({ angleId: 'front', label: 'Front', url: frontUrl });
      setResults([...newResults]);

      // ── Turn 2: Three-quarter ─────────────────────────────────────────────
      setCurrentPose(2);
      if (cancelRef.current) { setPhase('idle'); return; }
      const tqPrompt = buildPromptFromSpec(spec, 'three-quarter', stylePreset.promptSnippet, !!cleanBackB64, !!frontResultB64, selectedModel.height, stylingDir);
      const anchorPart = frontResultB64 ? [{ inlineData: { data: frontResultB64, mimeType: 'image/png' as const } }] : [];
      const tqMsg = [
        { inlineData: { data: cleanB64, mimeType: 'image/png' as const } },
        { inlineData: { data: normalizedRef, mimeType: 'image/png' as const } },
        ...anchorPart,
        { text: tqPrompt },
      ];
      const tqResp = await chat.sendMessage({ message: tqMsg, config: genConfig });
      if (cancelRef.current) { setPhase('idle'); return; }
      let tqUrl = extractImage(tqResp);
      try { tqUrl = await cropToTargetAspectRatio(tqUrl, 2 / 3); } catch (_) {}
      newResults.push({ angleId: 'three-quarter', label: 'Three-quarter', url: tqUrl });
      setResults([...newResults]);

      // ── Turn 3: Back ─────────────────────────────────────────────────────
      setCurrentPose(3);
      if (cancelRef.current) { setPhase('idle'); return; }
      const backPrompt = buildPromptFromSpec(spec, 'back', stylePreset.promptSnippet, !!cleanBackB64, !!frontResultB64, selectedModel.height, stylingDir);
      const backFlatLayB64 = cleanBackB64 ?? cleanB64;
      const backMsg = [
        { inlineData: { data: backFlatLayB64, mimeType: 'image/png' as const } },
        { inlineData: { data: normalizedRef, mimeType: 'image/png' as const } },
        ...anchorPart,
        { text: backPrompt },
      ];
      const backResp = await chat.sendMessage({ message: backMsg, config: genConfig });
      if (cancelRef.current) { setPhase('idle'); return; }
      let backUrl = extractImage(backResp);
      try { backUrl = await cropToTargetAspectRatio(backUrl, 2 / 3); } catch (_) {}
      newResults.push({ angleId: 'back', label: 'Back', url: backUrl });
      setResults([...newResults]);

      setPhase('done');
    } catch (err: unknown) {
      if (cancelRef.current) { setPhase('idle'); return; }
      setError((err as Error)?.message ?? 'Generation failed. Try again.');
      setPhase('idle');
    }
  }

  const sku = skuName.trim() || 'outfit';

  return (
    <div className="min-h-screen bg-krea-bg">
      <div className="px-6 pt-6 max-w-xl space-y-8">

        {/* Upload */}
        <section className="space-y-3">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-krea-muted">Garment photos</p>
          <div className="flex gap-3">
            {/* Front */}
            <div className="space-y-1">
              <p className="text-xs text-krea-muted">Front <span className="text-krea-accent">*</span></p>
              {frontPreview ? (
                <div className="relative group w-32 h-32 rounded-lg overflow-hidden border border-krea-border bg-white">
                  <img src={frontPreview} alt="Front flat lay" className="w-full h-full object-contain" />
                  <button
                    type="button"
                    onClick={clearFront}
                    className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="w-3 h-3 text-white" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => frontInputRef.current?.click()}
                  className="w-32 h-32 rounded-lg border-2 border-dashed border-krea-border bg-white flex flex-col items-center justify-center gap-1.5 hover:border-krea-accent/40 transition-colors"
                >
                  <Upload className="w-4 h-4 text-krea-muted" />
                  <span className="text-xs text-krea-muted">Front</span>
                </button>
              )}
              <input
                ref={frontInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) onFrontFile(f); e.target.value = ''; }}
              />
            </div>

            {/* Back */}
            <div className="space-y-1">
              <p className="text-xs text-krea-muted">Back <span className="text-[10px] text-krea-muted/60">(optional)</span></p>
              {backPreview ? (
                <div className="relative group w-32 h-32 rounded-lg overflow-hidden border border-krea-border bg-white">
                  <img src={backPreview} alt="Back flat lay" className="w-full h-full object-contain" />
                  <button
                    type="button"
                    onClick={clearBack}
                    className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="w-3 h-3 text-white" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => backInputRef.current?.click()}
                  className="w-32 h-32 rounded-lg border-2 border-dashed border-krea-border bg-white flex flex-col items-center justify-center gap-1.5 hover:border-krea-accent/40 transition-colors"
                >
                  <Upload className="w-4 h-4 text-krea-muted" />
                  <span className="text-xs text-krea-muted">Back</span>
                </button>
              )}
              <input
                ref={backInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) onBackFile(f); e.target.value = ''; }}
              />
            </div>
          </div>
        </section>

        {/* SKU name */}
        <section className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-krea-muted">SKU name</p>
          <input
            type="text"
            value={skuName}
            onChange={(e) => setSkuName(e.target.value)}
            placeholder="e.g. Linen Blazer SS25"
            className="krea-input w-64 text-sm"
          />
        </section>

      </div>

      {/* Model picker — full width */}
      <section className="px-6 pb-6 space-y-3 mt-8">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-krea-muted">Model</p>
        {presetModels.length === 0 ? (
          <p className="text-xs text-krea-muted">Loading models…</p>
        ) : (
          <div className="h-[70vh] overflow-y-auto krea-scrollbar pr-1">
            <div className="grid grid-cols-5 gap-3">
                {presetModels.map((model) => {
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
                            <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 12 12"><path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
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
            </div>
          )}
      </section>

      {/* Generate / Cancel */}
      <div className="px-6 pb-6 flex items-center gap-3">
          <button
            type="button"
            onClick={handleGenerate}
            disabled={!canGenerate}
            className="krea-button"
          >
            {isGenerating ? (
              <span className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                {phase === 'generating' ? `${POSE_LABELS[currentPose - 1] ?? ''}…` : PHASE_LABELS[phase]}
              </span>
            ) : 'Generate shots'}
          </button>

          {isGenerating && (
            <button
              type="button"
              onClick={() => { cancelRef.current = true; }}
              className="krea-button-secondary text-sm"
            >
              Cancel
            </button>
          )}

          {isGenerating && (
            <p className="text-xs text-krea-muted">
              {phase === 'generating' ? `${currentPose}/3 poses` : PHASE_LABELS[phase]}
            </p>
          )}
        </div>

      {error && (
        <p className="px-6 text-sm text-red-500">{error}</p>
      )}

      {/* Results */}
      {(cleanPreview || results.length > 0) && (
        <section className="px-6 pb-6 space-y-3">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-krea-muted">
            Output — {sku}
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">

              {/* Clean flat lay */}
              {cleanPreview && (
                <div className="space-y-1.5">
                  <div className="aspect-[2/3] rounded-lg overflow-hidden border border-krea-border bg-white">
                    <img src={cleanPreview} alt="Clean flat lay" className="w-full h-full object-contain" />
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] text-krea-muted">Flat lay</p>
                    <button
                      type="button"
                      onClick={() => downloadImage(cleanPreview, `${sku}-flat-lay.png`)}
                      className="p-1 rounded hover:bg-krea-border/40 transition-colors"
                    >
                      <Download className="w-3.5 h-3.5 text-krea-muted" />
                    </button>
                  </div>
                </div>
              )}

              {/* Model shots */}
              {results.map((shot) => (
                <div key={shot.angleId} className="space-y-1.5">
                  <div className="aspect-[2/3] rounded-lg overflow-hidden border border-krea-border bg-white">
                    <img src={shot.url} alt={shot.label} className="w-full h-full object-cover" />
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] text-krea-muted">{shot.label}</p>
                    <button
                      type="button"
                      onClick={() => downloadImage(shot.url, `${sku}-${shot.angleId}.png`)}
                      className="p-1 rounded hover:bg-krea-border/40 transition-colors"
                    >
                      <Download className="w-3.5 h-3.5 text-krea-muted" />
                    </button>
                  </div>
                </div>
              ))}

              {/* Skeleton placeholders for in-progress shots */}
              {isGenerating && phase === 'generating' &&
                Array.from({ length: 3 - results.length }).map((_, i) => (
                  <div key={`skel-${i}`} className="space-y-1.5">
                    <div className="aspect-[2/3] rounded-lg bg-krea-border/30 animate-pulse" />
                    <p className="text-[10px] text-krea-muted/40">{POSE_LABELS[results.length + i]}</p>
                  </div>
                ))
              }
          </div>
        </section>
      )}

      {/* Model preview overlay */}
      {previewModel && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6"
          onClick={() => setPreviewModel(null)}
        >
          <div
            className="relative flex gap-8 items-end max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Model image — full viewport height */}
            <img
              src={previewModel.imageUrl}
              alt={previewModel.name}
              className="h-[85vh] w-auto object-contain rounded-xl shadow-2xl"
              referrerPolicy="no-referrer"
            />
            {/* Info + actions */}
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

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
