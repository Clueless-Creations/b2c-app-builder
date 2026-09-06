#!/usr/bin/env node
/**
 * check-lane-coverage.ts — aggregate readiness floor for all required lanes.
 *
 * Reports a coverage ledger that makes "did nothing" loud:
 *
 *   ERROR   — lane is not_started and the project is past the orient phase
 *   ERROR   — lane is partial and the project is past orient AND has neither
 *             evidence nor blockers nor a reason field
 *   WARNING — lane is partial with no evidence, no blockers, and no reason
 *             (regardless of phase — silent stall is always visible)
 *   CLEAN   — done (with evidence) | blocked (with blocker) |
 *             not_needed (with reason) | deferred (with reason)
 *
 * npm script: check:lane-coverage
 * Usage: tsx checks/validation/business/process/check-lane-coverage.ts --root /path/to/app
 */

import {
  asArray,
  asString,
  extractIsoDate,
  getPath,
  isRecord,
  isPastOrientPhase,
  issue,
  Issue,
  laneDependencies,
  loadProjectState,
  parseCliArgs,
  reportAndExit,
  requiredLanes,
  satisfiedDependencyStatuses,
  validateLaneDependencyGraph,
  validateReason,
} from "../../../../tooling/lib/launch-state.js";

// Founder gates get a tighter re-engagement window than the general 60-day
// stall bar: a gate is a decision waiting to be re-asked, not a scope note.
const FOUNDER_GATE_STALE_DAYS = 30;
// Active gates only — the canonical prefix syntax ("founder-gated <date>: …",
// "awaiting founder …"). A standing policy note like "Founder approval is
// required before paid spend" is a reminder, not a presented decision, and
// must never age into a false stale-gate error.
const FOUNDER_GATE_PATTERN = /^\s*(?:founder[-\s]?gated|founder[-\s]?only|awaiting (?:the )?founder)\b/i;

/**
 * Calls validateReason and returns the count of new warnings pushed (0 or 1+).
 * This lets the caller keep the counts.warning ledger accurate.
 */
function validateReasonAndCount(reason: string | undefined, lanePath: string, context: string, issues: Issue[]): number {
  const before = issues.length;
  validateReason(reason, lanePath, context, issues);
  // Count only warnings that were actually pushed.
  return issues.slice(before).filter((i) => i.severity === "warning").length;
}

/**
 * Edge rule: a lane may not claim `done` while an upstream lane it depends on
 * is still not_started, partial, or blocked.
 *
 * This is the machine-readable form of "Lock phase outputs before depending on
 * them" (SKILL.md, Operating Posture) and the Flow Gates in
 * flow-traceability.md — previously prose only, and therefore self-attestable.
 *
 * The escape hatch is `lanes.<lane>.dependency_override`: a dated reason
 * downgrades the error to a warning and is itself checked for staleness. Silent
 * bypass is not available, which is the point.
 */
function checkLaneDependencies(state: unknown, lane: string, issues: Issue[]): { errors: number; warnings: number } {
  const dependencies = laneDependencies[lane] ?? [];
  if (dependencies.length === 0) return { errors: 0, warnings: 0 };

  const unlocked = dependencies
    .map((dep) => ({ dep, status: asString(getPath(state, `lanes.${dep}.status`)) ?? "missing" }))
    .filter(({ status }) => !satisfiedDependencyStatuses.has(status));

  if (unlocked.length === 0) return { errors: 0, warnings: 0 };

  const detail = unlocked.map(({ dep, status }) => `${dep} (${status})`).join(", ");
  const override = asString(getPath(state, `lanes.${lane}.dependency_override`));

  // The override only buys the downgrade when it clears the same dated/substantive
  // bar as every other reason. A one-character override is the bypass this gate
  // exists to refuse. Staleness stays a warning: a once-valid override going old is
  // drift to surface, not proof the lanes were never independent.
  const overrideIssues: Issue[] = [];
  if (override?.trim()) validateReason(override, `lanes.${lane}`, "dependency override", overrideIssues);
  const overrideIsSubstantive = Boolean(override?.trim()) && !overrideIssues.some((i) => i.code.endsWith("reason_undated_or_trivial"));

  if (overrideIsSubstantive) {
    // Overridden: surface it as a warning that never goes quiet.
    issues.push(
      issue(
        "warning",
        `lane_coverage.${lane}.dependency_overridden`,
        `lanes.${lane} is done while upstream ${detail} is unlocked, permitted by dependency_override. ` +
          `Confirm the override still holds; an upstream lane that never locks means this lane's evidence rests on a moving input.`,
        "state/business-state.json",
      ),
    );
    issues.push(...overrideIssues);
    return { errors: 0, warnings: 1 + overrideIssues.filter((i) => i.severity === "warning").length };
  }

  issues.push(...overrideIssues);
  issues.push(
    issue(
      "error",
      `lane_coverage.${lane}.dependency_unlocked`,
      `lanes.${lane} is done but upstream ${detail} is not locked. ` +
        `A lane cannot be finished on an input that is still moving (SKILL.md: "Lock phase outputs before depending on them"). ` +
        (override?.trim()
          ? `The recorded dependency_override is undated or too thin to count — rewrite it with an ISO date and the concrete independence rationale.`
          : `Advance the upstream lane to done/not_needed/deferred, or record a dated lanes.${lane}.dependency_override explaining why this lane is genuinely independent of it.`),
      "state/business-state.json",
    ),
  );
  return { errors: 1, warnings: overrideIssues.filter((i) => i.severity === "warning").length };
}

const args = parseCliArgs(process.argv.slice(2));
const loaded = loadProjectState(args);
const issues = [...loaded.issues];
const state = loaded.state;

// Authoring-integrity guard on the shipped edge map itself (unknown lane ids,
// self-edges, cycles). Cheap, and it fails loudly for the maintainer editing
// laneDependencies rather than silently for the founder running a launch.
validateLaneDependencyGraph(issues);

if (state) {
  const currentPhase = asString(getPath(state, "project.phase")) ?? "";
  const pastOrient = isPastOrientPhase(currentPhase);

  const counts = {
    clean: 0,
    warning: 0,
    error: 0,
    missing: 0,
  };

  for (const lane of requiredLanes) {
    const lanePath = `lanes.${lane}`;

    if (!isRecord(getPath(state, lanePath))) {
      counts.missing += 1;
      issues.push(
        issue(
          "error",
          `lane_coverage.${lane}.missing`,
          `${lanePath} is missing entirely. All ${requiredLanes.length} required lanes must be present in state/business-state.json.`,
          "state/business-state.json",
        ),
      );
      continue;
    }

    const status = asString(getPath(state, `${lanePath}.status`));
    const evidence = asArray(getPath(state, `${lanePath}.evidence`));
    const nonEmptyEvidence = evidence.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
    const blockers = asArray(getPath(state, `${lanePath}.blockers`));
    const nonEmptyBlockers = blockers.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
    const reason = asString(getPath(state, `${lanePath}.reason`));
    const hasReason = Boolean(reason?.trim());
    const hasAnyEvidence = nonEmptyEvidence.length > 0;
    const hasAnyBlocker = nonEmptyBlockers.length > 0;

    // --- founder-gate re-engagement ---
    // A founder gate is a pause awaiting a decision, not a termination. On
    // real launches, "founder-gated: paid campaign launch and budget spend"
    // sat in blockers for months while the fully planned spend never turned
    // on — because nothing ever brought the decision back to the founder.
    // Founder-gated blockers carry the ISO date they were last presented;
    // past the re-engagement window the agent re-presents the gate with what
    // changed since and re-dates the blocker with the founder's response.
    // Silence defers again — it never converts to approval, and it never
    // means forever. Stale founder gates are errors once the app is live:
    // a live app with its growth levers parked behind a forgotten question
    // is the distribution-never-turns-on failure mode.
    if (status === "running" || status === "blocked" || status === "deferred") {
      const postLaunch = /^phase_6/.test(currentPhase.toLowerCase());
      for (const blocker of nonEmptyBlockers) {
        if (!FOUNDER_GATE_PATTERN.test(blocker)) continue;
        // The presented-at date is read from the documented position only —
        // "founder-gated YYYY-MM-DD: <what>" — i.e. between the gate keyword
        // and the colon. A campaign or deadline date later in the free text
        // must neither keep a stale gate looking fresh nor age a fresh one.
        const keywordMatch = FOUNDER_GATE_PATTERN.exec(blocker);
        const afterKeyword = keywordMatch ? blocker.slice(keywordMatch.index + keywordMatch[0].length) : "";
        const beforeColon = afterKeyword.split(":")[0] ?? "";
        const presentedAtRaw = extractIsoDate(beforeColon);
        const presentedDate = presentedAtRaw ? new Date(`${presentedAtRaw}T00:00:00Z`) : undefined;
        // One day of forward tolerance: a founder east of UTC recording
        // today's local date before UTC midnight is same-day, not forward-dated.
        const presentedAt =
          presentedAtRaw &&
          presentedDate &&
          !Number.isNaN(presentedDate.getTime()) &&
          presentedDate.toISOString().slice(0, 10) === presentedAtRaw &&
          presentedDate.getTime() <= Date.now() + 86_400_000
            ? presentedAtRaw
            : undefined;
        if (!presentedAt) {
          const undatedSeverity = postLaunch ? "error" : "warning";
          counts[undatedSeverity] += 1;
          issues.push(
            issue(
              undatedSeverity,
              `lane_coverage.${lane}.founder_gate_undated`,
              `lanes.${lane} carries a founder-gated blocker with no valid past ISO date ("${blocker.slice(0, 80)}"). ` +
                `Record the real date the gate was last presented so the re-engagement window is checkable — an undated, typo'd, or ` +
                `forward-dated founder gate is one nobody can ever call stale, and on a live app that is an error, not a nit.`,
              "state/business-state.json",
            ),
          );
          continue;
        }
        const ageDays = Math.floor((Date.now() - new Date(`${presentedAt}T00:00:00Z`).getTime()) / 86_400_000);
        if (ageDays > FOUNDER_GATE_STALE_DAYS) {
          const severity = postLaunch ? "error" : "warning";
          counts[severity === "error" ? "error" : "warning"] += 1;
          issues.push(
            issue(
              severity,
              `lane_coverage.${lane}.founder_gate_reengagement_due`,
              `lanes.${lane}'s founder gate was last presented ${ageDays} days ago (${presentedAt}) with no recorded refresh. ` +
                `Re-present it to the founder with what changed since, and re-date the blocker with their response — approve, defer again, or drop the lane. ` +
                `A founder gate is a pause, not a termination; silence is not a decision.`,
              "state/business-state.json",
            ),
          );
        }
      }
    }

    // --- not_started ---
    if (status === "pending") {
      if (pastOrient) {
        // Past orient: not_started is a hard error.
        counts.error += 1;
        issues.push(
          issue(
            "error",
            `lane_coverage.${lane}.not_started_past_orient`,
            `lanes.${lane} is not_started but the project is past the orient phase (${currentPhase || "unknown"}). ` +
              `Start the lane, block it with a reason, or explicitly mark it not_needed or deferred.`,
            "state/business-state.json",
          ),
        );
      } else {
        // Still in orient window: not_started is expected and clean.
        counts.clean += 1;
      }
      continue;
    }

    // --- partial ---
    if (status === "running") {
      const silentStall = !hasAnyEvidence && !hasAnyBlocker && !hasReason;
      if (silentStall && pastOrient) {
        // Partial + no evidence + no blocker + no reason, past orient = error.
        counts.error += 1;
        issues.push(
          issue(
            "error",
            `lane_coverage.${lane}.partial_stall_past_orient`,
            `lanes.${lane} is partial with no evidence, no blockers, and no reason — and the project is past the orient phase (${currentPhase || "unknown"}). ` +
              `Add an evidence path, a blocker, or a reason field to show intentional progress, or advance the lane status.`,
            "state/business-state.json",
          ),
        );
      } else if (silentStall) {
        // Partial + silent stall during orient window = warning.
        counts.warning += 1;
        issues.push(
          issue(
            "warning",
            `lane_coverage.${lane}.partial_no_evidence_no_blocker`,
            `lanes.${lane} is partial but has no evidence paths, no blockers, and no reason. ` +
              `Add an evidence path, a blocker, or a reason field to show intentional progress.`,
            "state/business-state.json",
          ),
        );
      } else {
        // Partial with at least some signal = counts as in-flight but clean.
        counts.clean += 1;
        // Tier-1: validate that the reason (if present) is dated and non-trivial.
        if (hasReason) {
          counts.warning += validateReasonAndCount(reason, `lanes.${lane}`, "partial stall", issues);
        }
      }
      continue;
    }

    // --- done ---
    if (status === "succeeded") {
      if (!hasAnyEvidence) {
        // done without evidence = error (existing rule mirrored here for the ledger).
        counts.error += 1;
        issues.push(
          issue(
            "error",
            `lane_coverage.${lane}.done_without_evidence`,
            `lanes.${lane} is done but has no evidence paths. Done status requires at least one concrete artifact path or live-proof reference.`,
            "state/business-state.json",
          ),
        );
      } else {
        counts.clean += 1;
      }

      // Edge check runs regardless of the evidence outcome: "done with evidence"
      // on an unlocked upstream is exactly the drift this rule exists to catch.
      const edge = checkLaneDependencies(state, lane, issues);
      counts.error += edge.errors;
      counts.warning += edge.warnings;
      continue;
    }

    // --- blocked ---
    if (status === "blocked") {
      if (!hasAnyBlocker) {
        // blocked without a blocker = error (existing rule mirrored here).
        counts.error += 1;
        issues.push(
          issue(
            "error",
            `lane_coverage.${lane}.blocked_without_blocker`,
            `lanes.${lane} is blocked but has no blocker entry. Add at least one non-empty string to the blockers array.`,
            "state/business-state.json",
          ),
        );
      } else {
        counts.clean += 1;
      }
      continue;
    }

    // --- not_needed | deferred ---
    if (status === "not_needed" || status === "deferred") {
      if (!hasAnyEvidence && !hasAnyBlocker && !hasReason) {
        // Skipping without a reason = error.
        counts.error += 1;
        issues.push(
          issue(
            "error",
            `lane_coverage.${lane}.${status}_without_reason`,
            `lanes.${lane} is ${status} but has no evidence, blockers, or reason explaining why. ` +
              `Record the rationale so a future agent can verify the skip is intentional.`,
            "state/business-state.json",
          ),
        );
      } else {
        counts.clean += 1;
        // Tier-1: if a free-text reason is present, validate it is dated and non-trivial.
        if (hasReason) {
          counts.warning += validateReasonAndCount(reason, `lanes.${lane}`, status, issues);
        }
      }
      continue;
    }

    // Unknown / invalid status: not our job to validate here (validate-project-state handles it),
    // but count it so the ledger total is complete.
    counts.missing += 1;
  }

  // Human summary accompanies text output only.
  const total = requiredLanes.length;
  const phaseLabel = currentPhase || "unknown";
  if (!process.argv.includes("--json")) console.log(`Lane coverage ledger — phase: ${phaseLabel} | past-orient enforcement: ${pastOrient ? "ON" : "OFF"}`);
  if (!process.argv.includes("--json"))
    console.log(`  ${counts.clean}/${total} clean  |  ${counts.warning} warning(s)  |  ${counts.error} error(s)  |  ${counts.missing} missing`);
}

reportAndExit("Lane coverage check", issues);
