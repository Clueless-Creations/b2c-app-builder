import { readResearchObservations } from "./research-observations.js";
import { RESEARCH_ARTIFACTS } from "./planning-context.js";
import { assertNoPendingInitialization } from "./initialization-guard.js";
import { createHash } from "node:crypto";
import { existsSync, lstatSync } from "node:fs";
import path from "node:path";
import { boundedFileBytes } from "../lib/bounded-file.js";
import { fingerprintAppSource } from "../engine/source-fingerprint.js";
import { assertNoPendingErasure } from "../reducer/erasure-guard.js";
import { assertCompositionActivationComplete } from "../composition/activation.js";
const FILES = [
  ...RESEARCH_ARTIFACTS,
  "operations/LAUNCH_PROGRAM.md",
  "b2c.yaml",
  "product.yaml",
  "PRODUCT.md",
  "DESIGN.md",
  "catalog.json",
  ".b2c-launch/runtime.json",
  "state/business-state.json",
  "state/current-truth.json",
  "control/manifest.json",
  "control/control.json",
  "control/grants.json",
  "control/waivers.json",
  "control/budget-ledger.json",
  "run/run-state.json",
  "run/checkpoint.json",
];
export function workspaceRevision(workspace: string): string {
  assertNoPendingInitialization(workspace);
  assertNoPendingErasure(workspace);
  assertCompositionActivationComplete(workspace);
  const values = FILES.map((relative) => {
    let file = workspace;
    for (const segment of relative.split("/")) {
      file = path.join(file, segment);
      if (existsSync(file) && lstatSync(file).isSymbolicLink()) throw new Error("business.unsafe_workspace_file");
    }
    return [
      relative,
      existsSync(file)
        ? createHash("sha256")
            .update(boundedFileBytes(file, 32 * 1024 * 1024))
            .digest("hex")
        : null,
    ];
  });
  return `sha256:${createHash("sha256")
    .update(
      JSON.stringify({
        values,
        research: readResearchObservations(workspace).map(({ path, sha256 }) => ({ path, sha256 })),
        source: fingerprintAppSource(workspace),
      }),
    )
    .digest("hex")}`;
}
