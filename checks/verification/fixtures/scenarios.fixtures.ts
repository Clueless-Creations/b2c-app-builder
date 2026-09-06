import { register as registerMobileOperations } from "../scenarios/mobile-operation-conformance.js";
import { register as registerExtensionConformance } from "../scenarios/extension-conformance.js";
import type { Harness } from "./_harness.js";
import { register as registerContinuity } from "../scenarios/continuity-from-durable-state.js";
import { register as registerEntrypoints } from "../scenarios/entrypoint-installation-proof.js";
import { register as registerSecretRouting } from "../scenarios/secret-routing.js";
import { register as registerParallelOverlap } from "../scenarios/parallel-overlap.js";

/** Register executable end-to-end scenarios with the shared fixture runner. */
export function register(harness: Harness): void {
  registerMobileOperations(harness);
  registerExtensionConformance(harness);
  registerContinuity(harness);
  registerEntrypoints(harness);
  registerSecretRouting(harness);
  registerParallelOverlap(harness);
}
