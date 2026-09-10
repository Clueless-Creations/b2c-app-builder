import { PLANNING_ARTIFACT_BYTE_CAP } from "./planning-limits.js";
import { readResearchObservations } from "./research-observations.js";
import { createHash } from "node:crypto";
import { existsSync, lstatSync } from "node:fs";
import path from "node:path";
import { FOUNDER_BRIEF_ARTIFACT, type FounderIntentSlice } from "../../contracts/public-api/contract.js";
import { loadProductInstanceDocument } from "../../catalog/ontology/instance-load.js";
import { boundedFileBytes } from "../lib/bounded-file.js";
import { assertNoPendingInitialization } from "./initialization-guard.js";
import { assertNoPendingErasure } from "../reducer/erasure-guard.js";
import { assertCompositionActivationComplete } from "../composition/activation.js";
import { founderConstraintSlice } from "./founder-brief.js";

export const RESEARCH_ARTIFACTS = ["strategy/RESEARCH.md", "strategy/SIGNAL_CORPUS.md", "strategy/OFFER_TEST.md", "strategy/RED_TEAM_FINDINGS.md"] as const;
export const PRODUCT_ARTIFACT = "product.yaml" as const;
const PLANNING_RESUME_ARTIFACTS = [FOUNDER_BRIEF_ARTIFACT, PRODUCT_ARTIFACT, ...RESEARCH_ARTIFACTS] as const;
const RUNTIME_MARKERS = [
  "catalog.json",
  ".b2c-launch/runtime.json",
  "control/manifest.json",
  "control/control.json",
  "run/run-state.json",
  "state/business-state.json",
];

/** Planning is a lifecycle state, not a workaround for a damaged installed runtime. */
export function isPlanningWorkspace(root: string): boolean {
  assertNoPendingInitialization(root);
  assertNoPendingErasure(root);
  assertCompositionActivationComplete(root);
  if (RUNTIME_MARKERS.some((relative) => existsSync(path.join(root, relative)))) return false;
  const product = readPlanningArtifact(root, PRODUCT_ARTIFACT);
  if (!product) return false;
  loadProductInstanceDocument(path.join(root, PRODUCT_ARTIFACT));
  return true;
}

/** Fixed callers supply relative artifacts; never read through a substituted ancestor. */
export function readPlanningArtifact(root: string, relative: string): Buffer | undefined {
  if (path.isAbsolute(relative) || relative.split(/[\\/]/).some((part) => !part || part === "." || part === ".."))
    throw new Error("business.unsafe_planning_artifact");
  let file = path.resolve(root);
  for (const part of relative.split("/")) {
    file = path.join(file, part);
    if (existsSync(file) && lstatSync(file).isSymbolicLink()) throw new Error("business.unsafe_planning_artifact");
  }
  return existsSync(file) ? boundedFileBytes(file, PLANNING_ARTIFACT_BYTE_CAP) : undefined;
}

/** References existing authored evidence; file presence never means accepted work. No provider calls. */
export function readFounderIntent(root: string): FounderIntentSlice | undefined {
  const bytes = readPlanningArtifact(root, FOUNDER_BRIEF_ARTIFACT);
  if (!bytes) return undefined;
  const text = bytes.toString("utf8");
  const { slice, truncated } = founderConstraintSlice(text);
  return {
    artifact: FOUNDER_BRIEF_ARTIFACT,
    digest: `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
    characterCount: text.length,
    slice,
    truncated,
  };
}

export function readPlanningResume(root: string) {
  const artifacts = PLANNING_RESUME_ARTIFACTS.map((relative) => {
    const bytes = readPlanningArtifact(root, relative);
    return {
      path: relative,
      present: bytes !== undefined,
      bytes: bytes?.length ?? 0,
      contentSha256: bytes ? createHash("sha256").update(bytes).digest("hex") : null,
      acceptance: "not_evaluated" as const,
    };
  });
  const latest = new Map(readResearchObservations(root).map((entry) => [entry.record.queryId, entry]));
  const queries = [...latest.values()].map((entry) => ({
    queryId: entry.record.queryId,
    path: entry.path,
    outcome: entry.record.outcome,
    observedAt: entry.record.observedAt ?? null,
  }));
  return {
    researchQueries: queries.slice(0, 20),
    omittedQueryCount: Math.max(0, queries.length - 20),
    workflowId: "workflow.research.research-backed-spec",
    artifacts,
    businessComplete: false as const,
    nextAction:
      "Read operations/FOUNDER_BRIEF.md as the canonical founder brief, then product.yaml. File presence is not product acceptance. Then read the saved research, signal corpus, offer test and review findings before collecting new evidence. Reuse matching current observations; reconcile uncertain charged calls before replay. Validate the authored outputs, then perform independent research review and initialize the accepted product. Research completion is not business completion.",
  };
}
