/**
 * grading.ts — the shared finding/report shape and the single-recommended-edit priority for
 * the design-taste surface grader (tooling/grade-design-surface.ts).
 *
 * knowledge/design/design-worthiness.md rule 10 states its own escalation order: "After
 * mechanical checks pass and attested warnings have rows, send a taste packet to the founder."
 * selectRecommendedNextEdit() is that order made deterministic and testable, so the grader
 * cannot be gamed into recommending whichever finding sounds easiest to fix.
 */
import type { Issue } from "./launch-state.js";
import type { RubricTier } from "./design-taste-rubric.js";

/**
 * One graded observation against one rubric dimension. Extends the base Issue shape
 * (severity/code/message/file) every other validator in this repo already emits, so a
 * mechanical GradingFinding can be built directly from an Issue plus its dimension metadata.
 */
export interface GradingFinding extends Issue {
  readonly tier: RubricTier;
  readonly dimensionKey: string;
  /**
   * Issue requires a severity even for tier:"taste" findings, which design-worthiness.md rule
   * 10 says an agent may only ever recommend, never pass or fail — so taste findings always
   * carry "warning" here as a formality. selectRecommendedNextEdit() never branches on
   * severity for tier:"taste"; it branches on `strength` instead. Treat a taste finding's
   * severity as inert.
   */
  /**
   * Only meaningful for tier:"taste" findings: how strongly a founder-facing grading pass
   * weighs this single observation, on a 1-5 scale. Undefined (or 0) for mechanical/attested
   * findings, which are ordered by tier and severity, never by strength.
   */
  readonly strength?: number;
  /** Required for attested/taste findings assembled from a model-judged pass — the anti-fabrication line the grading-input schema enforces (see grade-design-surface.ts's validateGradingInput). Absent for mechanically computed findings, which need no such attestation. */
  readonly observedEvidence?: string;
}

export interface GradingReport {
  readonly rubricVersion: string;
  readonly pinnedReferences: ReadonlyArray<{ readonly referenceId: string; readonly sourceSha256: string }>;
  readonly gradedAt: string;
  readonly findings: GradingFinding[];
  readonly recommendedNextEdit: string;
}

export const NO_FURTHER_EDIT_MESSAGE =
  "No further edit needed: every mechanical check this grader can run is clean, no attested-tier warning was recorded, and no taste observation was submitted.";

/**
 * Chooses exactly one next edit, per design-worthiness.md rule 10's own escalation order:
 * the first mechanical-tier error, in the order `findings` lists them (the caller is
 * responsible for that being file order — see sortFindingsInFileOrder in
 * grade-design-surface.ts); failing that, the first attested-tier warning, in the same order;
 * failing that, the single strongest taste-tier observation (highest `strength`, ties broken
 * by array position so the choice stays deterministic); failing all three, a fixed
 * "nothing to do" message. Never a beauty score, never more than one edit.
 */
export function selectRecommendedNextEdit(findings: readonly GradingFinding[]): string {
  const mechanicalError = findings.find((finding) => finding.tier === "mechanical" && finding.severity === "error");
  if (mechanicalError) return describeFinding(mechanicalError);

  const attestedWarning = findings.find((finding) => finding.tier === "attested" && finding.severity === "warning");
  if (attestedWarning) return describeFinding(attestedWarning);

  const tasteFindings = findings.filter((finding) => finding.tier === "taste");
  if (tasteFindings.length > 0) {
    const strongest = tasteFindings.reduce((best, candidate) => (tasteStrength(candidate) > tasteStrength(best) ? candidate : best));
    return describeFinding(strongest);
  }

  return NO_FURTHER_EDIT_MESSAGE;
}

function describeFinding(finding: GradingFinding): string {
  const where = finding.file ? ` (${finding.file})` : "";
  return `${finding.code}${where}: ${finding.message}`;
}

function tasteStrength(finding: GradingFinding): number {
  return typeof finding.strength === "number" && Number.isFinite(finding.strength) ? finding.strength : 0;
}

/** Stable sort by file path (undefined sorts first), then by code — the "file order" selectRecommendedNextEdit's own doc comment promises for tied-tier findings. */
export function sortFindingsInFileOrder(findings: readonly GradingFinding[]): GradingFinding[] {
  return [...findings].sort((left, right) => {
    const fileCompare = (left.file ?? "").localeCompare(right.file ?? "");
    if (fileCompare !== 0) return fileCompare;
    return left.code.localeCompare(right.code);
  });
}
