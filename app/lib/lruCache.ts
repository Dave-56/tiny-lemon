type Clock = () => number;

export interface LruOptions<K> {
  maxEntries?: number;
  ttlMs?: number;
  clock?: Clock;
  keyToString?: (key: K) => string;
}

/** Simple TTL LRU cache (in-memory, process-local). */
export class LruCache<K, V> {
  private map: Map<string, { value: V; expiresAt: number }> = new Map();
  private order: string[] = [];
  private maxEntries: number;
  private ttlMs: number;
  private now: Clock;
  private keyToString: (key: K) => string;

  constructor(opts: LruOptions<K> = {}) {
    this.maxEntries = opts.maxEntries ?? 1000;
    this.ttlMs = opts.ttlMs ?? 60 * 60 * 1000; // default 60 min
    this.now = opts.clock ?? (() => Date.now());
    this.keyToString = opts.keyToString ?? ((k: unknown) => String(k));
  }

  get(key: K): V | undefined {
    const k = this.key(key);
    const entry = this.map.get(k);
    if (!entry) return undefined;
    if (entry.expiresAt <= this.now()) {
      this.delete(key);
      return undefined;
    }
    this.touch(k);
    return entry.value;
  }

  set(key: K, value: V, ttlOverrideMs?: number) {
    const k = this.key(key);
    const expiresAt = this.now() + (ttlOverrideMs ?? this.ttlMs);
    this.map.set(k, { value, expiresAt });
    this.touch(k);
    this.enforce();
  }

  has(key: K): boolean {
    return this.get(key) !== undefined;
  }

  delete(key: K) {
    const k = this.key(key);
    this.map.delete(k);
    const idx = this.order.indexOf(k);
    if (idx >= 0) this.order.splice(idx, 1);
  }

  private key(key: K): string { return this.keyToString(key); }

  private touch(k: string) {
    const idx = this.order.indexOf(k);
    if (idx >= 0) this.order.splice(idx, 1);
    this.order.push(k);
  }

  private enforce() {
    while (this.order.length > this.maxEntries) {
      const k = this.order.shift();
      if (k) this.map.delete(k);
    }
  }
}

