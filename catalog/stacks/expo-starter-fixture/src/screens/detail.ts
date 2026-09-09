import { surfaceState, type SurfaceStateKind } from "../states/surface-state.js";

export function detailScreen(id: string, kind: SurfaceStateKind = "ready") {
  return { id: "detail" as const, param: id, state: surfaceState(kind) };
}
