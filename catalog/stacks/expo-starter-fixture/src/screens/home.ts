import { surfaceState, type SurfaceStateKind } from "../states/surface-state.js";

export function homeScreen(kind: SurfaceStateKind = "ready") {
  return { id: "home" as const, state: surfaceState(kind) };
}
