export const SURFACE_STATES = ["loading", "error", "empty", "retry", "ready"] as const;
export type SurfaceStateKind = (typeof SURFACE_STATES)[number];

export interface SurfaceState {
  kind: SurfaceStateKind;
  message?: string;
  retryAvailable: boolean;
}

export function surfaceState(kind: SurfaceStateKind, message?: string): SurfaceState {
  return {
    kind,
    ...(message ? { message } : {}),
    retryAvailable: kind === "error" || kind === "retry" || kind === "empty",
  };
}
