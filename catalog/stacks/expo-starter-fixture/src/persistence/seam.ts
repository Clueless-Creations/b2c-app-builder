export const PERSISTENCE_SEAM_BOUND = true;
export const PERSISTENCE_STORE_KIND = "local-cache" as const;

export interface PersistenceSeam {
  restore(): Promise<unknown>;
  persist(value: unknown): Promise<void>;
  peek(): unknown;
}

/**
 * In-process local cache. Not SecureStore, not web storage, and not a backend.
 * Cross-process restart is owned by the host SQLite/file runtime.
 */
export function boundLocalCacheSeam(): PersistenceSeam {
  let stored: unknown = null;
  return {
    restore() {
      return Promise.resolve(stored);
    },
    persist(value: unknown) {
      stored = value;
      return Promise.resolve();
    },
    peek() {
      return stored;
    },
  };
}
