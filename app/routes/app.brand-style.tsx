import { useState } from 'react';
import type { HeadersFunction, LoaderFunctionArgs } from 'react-router';
import { useRouteError } from 'react-router';
import { boundary } from '@shopify/shopify-app-react-router/server';
import { Check } from 'lucide-react';
import { PDP_STYLE_PRESETS, ANGLE_PRESETS, STYLING_DIRECTION_PRESETS } from '../lib/pdpPresets';

export const loader = async (_: LoaderFunctionArgs) => {
  return null;
};

function readPrefs() {
  try {
    const saved = localStorage.getItem('nanobanana_pdp_presets');
    if (saved) return JSON.parse(saved) as Record<string, unknown>;
  } catch (_) {}
  return null;
}

export default function BrandStyle() {
  const [selectedStyleIds, setSelectedStyleIds] = useState<string[]>(() => {
    const prefs = readPrefs();
    if (prefs) {
      if (Array.isArray(prefs.styleIds) && (prefs.styleIds as string[]).length > 0) {
        const valid = (prefs.styleIds as string[]).filter((id) => PDP_STYLE_PRESETS.some((p) => p.id === id));
        if (valid.length > 0) return valid;
      }
      if (typeof prefs.styleId === 'string' && PDP_STYLE_PRESETS.some((p) => p.id === prefs.styleId)) {
        return [prefs.styleId as string];
      }
    }
    return [PDP_STYLE_PRESETS[0].id];
  });

  const [selectedAngleIds, setSelectedAngleIds] = useState<string[]>(() => {
    const prefs = readPrefs();
    if (prefs) {
      if (Array.isArray(prefs.angleIds) && (prefs.angleIds as string[]).length > 0) {
        const valid = (prefs.angleIds as string[]).filter((id) => ANGLE_PRESETS.some((p) => p.id === id));
        if (valid.length > 0) return valid;
      }
      if (typeof prefs.angleId === 'string' && ANGLE_PRESETS.some((p) => p.id === prefs.angleId)) {
        return [prefs.angleId as string];
      }
    }
    return ANGLE_PRESETS.map((p) => p.id);
  });

  const [stylingDirectionId, setStylingDirectionId] = useState<string>(() => {
    const prefs = readPrefs();
    if (prefs && typeof prefs.stylingDirectionId === 'string') {
      const id = prefs.stylingDirectionId === 'clean' ? 'minimal' : prefs.stylingDirectionId;
      if (STYLING_DIRECTION_PRESETS.some((p) => p.id === id)) return id;
    }
    return STYLING_DIRECTION_PRESETS[0].id;
  });

  const [saveFeedback, setSaveFeedback] = useState(false);

  const toggleStyleId = (id: string) => {
    setSelectedStyleIds((prev) => {
      const next = prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id];
      return next.length > 0 ? next : [PDP_STYLE_PRESETS[0].id];
    });
  };

  const toggleAngleId = (id: string) => {
    setSelectedAngleIds((prev) => {
      const next = prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id];
      return next.length > 0 ? next : prev;
    });
  };

  const handleSave = () => {
    try {
      localStorage.setItem(
        'nanobanana_pdp_presets',
        JSON.stringify({ styleIds: selectedStyleIds, angleIds: selectedAngleIds, stylingDirectionId }),
      );
      setSaveFeedback(true);
      window.setTimeout(() => setSaveFeedback(false), 2000);
    } catch (_) {}
  };

  const selectedDirection = STYLING_DIRECTION_PRESETS.find((p) => p.id === stylingDirectionId);

  return (
    <div className="min-h-screen bg-krea-bg p-6">
      <div className="max-w-sm space-y-8">

        {/* Background */}
        <section className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-krea-muted">Background</p>
          <div className="flex gap-2">
            {PDP_STYLE_PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => toggleStyleId(p.id)}
                className={`flex-1 h-8 rounded-md border text-xs font-medium transition-colors ${
                  selectedStyleIds.includes(p.id)
                    ? 'border-krea-accent bg-krea-accent text-white'
                    : 'border-krea-border bg-white text-krea-muted hover:border-krea-muted hover:text-krea-text'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          {PDP_STYLE_PRESETS.filter((p) => selectedStyleIds.includes(p.id)).map((p) =>
            p.description ? (
              <p key={p.id} className="text-xs text-krea-muted leading-relaxed">{p.description}</p>
            ) : null,
          )}
        </section>

        {/* Angles */}
        <section className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-krea-muted">Angles</p>
          <p className="text-xs text-krea-muted">Views generated per outfit.</p>
          <div className="flex gap-2">
            {ANGLE_PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => toggleAngleId(p.id)}
                className={`flex-1 h-8 rounded-md border text-xs font-medium transition-colors ${
                  selectedAngleIds.includes(p.id)
                    ? 'border-krea-accent bg-krea-accent text-white'
                    : 'border-krea-border bg-white text-krea-muted hover:border-krea-muted hover:text-krea-text'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </section>

        {/* Styling Direction */}
        <section className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-krea-muted">Styling Direction</p>
          <p className="text-xs text-krea-muted">The energy your model projects. Set once for your brand.</p>
          <select
            value={stylingDirectionId}
            onChange={(e) => setStylingDirectionId(e.target.value)}
            className="w-full h-9 rounded-md border border-krea-border bg-white px-3 text-sm text-krea-text focus:outline-none focus:border-krea-accent/40 transition-colors appearance-none"
          >
            {STYLING_DIRECTION_PRESETS.map((p) => (
              <option key={p.id} value={p.id}>{p.label}</option>
            ))}
          </select>
          {selectedDirection?.description && (
            <p className="text-xs text-krea-muted leading-relaxed">{selectedDirection.description}</p>
          )}
        </section>

        {/* Save */}
        <button
          onClick={handleSave}
          className="flex items-center gap-2 h-9 px-5 rounded-md bg-krea-accent text-white text-sm font-medium hover:opacity-90 active:scale-95 transition-all"
        >
          {saveFeedback ? (
            <>
              <Check className="w-3.5 h-3.5" />
              Saved
            </>
          ) : (
            'Save brand style'
          )}
        </button>

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
