export const PERSISTENCE_SEAM_BOUND = false;

export interface PersistenceSeam {
  restore(): Promise<unknown>;
  persist(value: unknown): Promise<void>;
}

export function unboundPersistenceSeam(): PersistenceSeam {
  return {
    restore() {
      return Promise.reject(new Error("persistence seam unbound"));
    },
    persist() {
      return Promise.reject(new Error("persistence seam unbound"));
    },
  };
}
