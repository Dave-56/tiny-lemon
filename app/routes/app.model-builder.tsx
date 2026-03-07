import { useEffect, useState } from "react";
import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import type { PresetModelEntry } from "../lib/types";

const STORAGE_KEY = "tinylemon_selected_preset_id";

// Authentication handled by parent layout (app.tsx)
export const loader = async (_: LoaderFunctionArgs) => {
  return null;
};

export default function ModelBuilder() {
  const [models, setModels] = useState<PresetModelEntry[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/preset-models.json")
      .then((r) => r.json())
      .then((data: PresetModelEntry[]) => {
        setModels(data);
        const saved = localStorage.getItem(STORAGE_KEY);
        setSelectedId(saved && data.some((m) => m.id === saved) ? saved : (data[0]?.id ?? null));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function select(id: string) {
    setSelectedId(id);
    localStorage.setItem(STORAGE_KEY, id);
  }

  return (
    <s-page heading="Model builder">
      <div className="p-6 space-y-6">

        {/* Library grid */}
        <section>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-krea-muted mb-3">
            Library models
          </p>
          {loading ? (
            <div className="grid grid-cols-4 xl:grid-cols-5 gap-3">
              {Array.from({ length: 15 }).map((_, i) => (
                <div key={i} className="aspect-[2/3] rounded-xl bg-gray-100 animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-4 xl:grid-cols-5 gap-3">
              {models.map((model) => {
                const isSelected = selectedId === model.id;
                return (
                  <button
                    key={model.id}
                    type="button"
                    onClick={() => select(model.id)}
                    className={`relative rounded-xl overflow-hidden border-2 transition-all ${
                      isSelected
                        ? "border-krea-accent shadow-lg shadow-krea-accent/20"
                        : "border-transparent hover:border-krea-border"
                    }`}
                  >
                    <img
                      src={model.imageUrl}
                      alt={model.name}
                      className="w-full aspect-[2/3] object-cover"
                    />
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent px-2 py-2">
                      <p className="text-xs text-white font-medium truncate">{model.name}</p>
                      <p className="text-[10px] text-white/70 truncate">
                        {model.gender[0]} · {model.ethnicity.split(" /")[0]}
                      </p>
                    </div>
                    <div className="absolute top-2 left-2">
                      <span className="text-[9px] font-bold uppercase tracking-widest bg-black/50 text-white/80 px-1.5 py-0.5 rounded">
                        Library
                      </span>
                    </div>
                    {isSelected && (
                      <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-krea-accent flex items-center justify-center">
                        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                          <path d="M2 5L4 7L8 3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </section>

        {/* Custom models — v1 */}
        <section className="border border-dashed border-krea-border rounded-xl p-6 text-center">
          <p className="text-sm font-medium text-krea-muted">Custom models coming soon</p>
          <p className="text-xs text-krea-muted/70 mt-1">Generate a model tailored to your brand.</p>
        </section>

      </div>
    </s-page>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
