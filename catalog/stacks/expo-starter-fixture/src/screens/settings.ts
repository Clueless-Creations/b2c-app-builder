import { surfaceState, type SurfaceStateKind } from "../states/surface-state.js";

export function settingsScreen(kind: SurfaceStateKind = "ready") {
  return { id: "settings" as const, state: surfaceState(kind) };
}
