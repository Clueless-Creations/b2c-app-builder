import { lanes } from "./lanes.js";
import { phases } from "./phases.js";

/**
 * Small derived exports ported from runtime/graph/runtime.ts (deleted at cutover, U11 —
 * KTD11 "dead engine code superseded by v2"). tooling/lib/launch-state.ts consumes these
 * directly for phase-gated coverage checks and lane-dependency validation, so they are kept
 * as a standalone module rather than folded into catalog/index.ts's composeCatalog(): they
 * are plain arrays/records derived from catalog/lanes.ts and catalog/phases.ts, not part of
 * the Catalog shape itself, and tooling should not have to pay for a full composeCatalog()
 * call (which also discovers gates from package.json) just to read them.
 */
export const phaseOrder: string[] = [...phases].sort((a, b) => a.order - b.order).map((phase) => phase.key);

/**
 * Index in phaseOrder at which the orient/scaffold window ends. Computed as a POSITION in
 * phaseOrder, never as a phase's `order` value: order values may carry gaps (deleting dead
 * phase.0a left 0,2,3,…), and the previous max-of-orders version only worked while the two
 * happened to coincide — the gap silently widened the orient window by one phase and two
 * founder-copy fixtures caught the drift (2026-08-19).
 */
export const PHASE_ORIENT_LAST_INDEX: number = Math.max(
  ...phases.filter((phase) => "orientWindow" in phase && phase.orientWindow === true).map((phase) => phaseOrder.indexOf(phase.key)),
);

export const requiredLanes: string[] = lanes.map((lane) => lane.key);

export const laneDependencies: Record<string, string[]> = Object.fromEntries(
  lanes.map((lane) => [
    lane.key,
    lane.dependencyIds.map((dependencyId) => {
      const dependency = lanes.find((candidate) => candidate.id === dependencyId);
      if (!dependency) throw new Error(`Unknown lane dependency ${dependencyId}`);
      return dependency.key;
    }),
  ]),
);
