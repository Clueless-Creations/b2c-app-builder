import { surfaceState, type SurfaceStateKind } from "../states/surface-state.js";

export function modalScreen(kind: SurfaceStateKind = "ready") {
  return { id: "modal" as const, presentation: "modal" as const, state: surfaceState(kind) };
}
