export type FlatLayCacheEntry = {
  quality: 'good' | 'warn' | 'fail';
  score: number | null;
  reasons?: string[];
  count: number | null;
  schemaVersion: '1';
  model: string;
  contentHash: string;
  at: number; // epoch ms
};

const KEY = 'flatlay_cache_v1';
const TTL_MS = 24 * 60 * 60 * 1000; // 24h

function load(): Record<string, FlatLayCacheEntry> {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const obj = JSON.parse(raw) as Record<string, FlatLayCacheEntry>;
    const now = Date.now();
    for (const k of Object.keys(obj)) {
      if (now - obj[k].at > TTL_MS) delete obj[k];
    }
    return obj;
  } catch { return {}; }
}

function save(map: Record<string, FlatLayCacheEntry>) {
  try { localStorage.setItem(KEY, JSON.stringify(map)); } catch {}
}

export function getCachedFlatLay(contentHash: string): FlatLayCacheEntry | null {
  const map = load();
  return map[contentHash] ?? null;
}

export function setCachedFlatLay(entry: FlatLayCacheEntry) {
  const map = load();
  map[entry.contentHash] = { ...entry, at: Date.now() };
  save(map);
}

