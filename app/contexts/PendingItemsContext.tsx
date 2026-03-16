import { createContext, useContext, useState, useCallback } from 'react';

export type FlatLayQuality = 'good' | 'warn' | 'fail';

/**
 * A single uploaded-but-not-yet-generated outfit item.
 * Stored at the /app layout level so it survives route transitions.
 * Keeping the actual File object here prevents it from being GC'd after
 * the dress-model component unmounts.
 */
export interface PendingEntry {
  id: string;          // matches BatchItem.id for deduplication
  file: File;
  backFile: File | null;
  skuName: string;
  quality: FlatLayQuality | null;
}

interface PendingItemsCtx {
  entries: PendingEntry[];
  upsert: (entry: PendingEntry) => void;
  remove: (id: string) => void;
  clear: () => void;
  selectedModelId: string | null;
  setSelectedModelId: (id: string | null) => void;
}

const Ctx = createContext<PendingItemsCtx | null>(null);

export function PendingItemsProvider({ children }: { children: React.ReactNode }) {
  const [entries, setEntries] = useState<PendingEntry[]>([]);
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);

  const upsert = useCallback((entry: PendingEntry) => {
    setEntries(prev => {
      const idx = prev.findIndex(e => e.id === entry.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = entry;
        return next;
      }
      return [...prev, entry];
    });
  }, []);

  const remove = useCallback((id: string) => {
    setEntries(prev => prev.filter(e => e.id !== id));
  }, []);

  const clear = useCallback(() => setEntries([]), []);

  return (
    <Ctx.Provider value={{ entries, upsert, remove, clear, selectedModelId, setSelectedModelId }}>
      {children}
    </Ctx.Provider>
  );
}

export function usePendingItems(): PendingItemsCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('usePendingItems must be used inside PendingItemsProvider');
  return ctx;
}
