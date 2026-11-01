export interface BoundedCacheOptions {
  maxEntries?: number;
  maxCapacity?: number;
  defaultTtlMs?: number;
}

/**
 * Generic Bounded LRU/TTL Cache with deterministic memory consumption and hit/miss tracking.
 */
export class BoundedCache<K, V> {
  private store = new Map<K, { value: V; expiresAt: number }>();
  private readonly maxCapacity: number;
  private readonly defaultTtlMs: number;
  private hits = 0;
  private misses = 0;
  private evictions = 0;

  constructor(
    maxCapacityOrOptions: number | BoundedCacheOptions = 500,
    defaultTtlMs = 1800000,
  ) {
    if (
      typeof maxCapacityOrOptions === "object" &&
      maxCapacityOrOptions !== null
    ) {
      this.maxCapacity =
        maxCapacityOrOptions.maxEntries ??
        maxCapacityOrOptions.maxCapacity ??
        500;
      this.defaultTtlMs = maxCapacityOrOptions.defaultTtlMs ?? defaultTtlMs;
    } else {
      this.maxCapacity = maxCapacityOrOptions;
      this.defaultTtlMs = defaultTtlMs;
    }
  }

  public get size(): number {
    return this.store.size;
  }

  public get(key: K): V | undefined {
    const item = this.store.get(key);
    if (!item) {
      this.misses++;
      return undefined;
    }
    if (Date.now() > item.expiresAt) {
      this.store.delete(key);
      this.misses++;
      return undefined;
    }
    // LRU refresh
    this.store.delete(key);
    this.store.set(key, item);
    this.hits++;
    return item.value;
  }

  public set(key: K, value: V, ttlMs?: number): void {
    if (this.store.size >= this.maxCapacity) {
      const oldestKey = this.store.keys().next().value;
      if (oldestKey !== undefined) {
        this.store.delete(oldestKey);
        this.evictions++;
      }
    }
    this.store.set(key, {
      value,
      expiresAt: Date.now() + (ttlMs ?? this.defaultTtlMs),
    });
  }

  public has(key: K): boolean {
    return this.get(key) !== undefined;
  }

  public delete(key: K): boolean {
    return this.store.delete(key);
  }

  public clear(): void {
    this.store.clear();
    this.hits = 0;
    this.misses = 0;
    this.evictions = 0;
  }

  public getStats() {
    return {
      size: this.store.size,
      maxCapacity: this.maxCapacity,
      hits: this.hits,
      misses: this.misses,
      evictions: this.evictions,
      hitRate:
        this.hits + this.misses > 0 ? this.hits / (this.hits + this.misses) : 0,
    };
  }
}

/**
 * Global cache for published immutable workflow definitions.
 * Keyed by version snapshot ID or content hash.
 */
export const publishedVersionCache = new BoundedCache<string, unknown>(
  500,
  3600000,
);
