#!/usr/bin/env node
/**
 * check-post-launch-ops
 *
 * Enforces the Post-Launch Operations contract: a launched app is a live
 * business, and "launched" is not the end state of the launch package. When
 * the post_launch_ops lane is claimed (partial/done) or the project reaches
 * the post-launch phases (phase_6/phase_6b), this validator requires:
 *   1. operations/POST_LAUNCH_OPS.md to exist (the operating runbook).
 *   2. The runbook to carry the operating sections: Weekly Operating Rhythm,
 *      Crash Triage, Review Responses, Release And Hotfix Cadence,
 *      Retention Review, Support Operations, Launch Retro.
 *   3. done additionally requires: a named crash route (Sentry or store crash
 *      reports), a stated review-response SLA, a retention cohort source, and
 *      operations/LAUNCH_RETRO.md on disk so the retro loop feeds failure cards.
 *   4. The numbers loop: lanes.post_launch_ops.live_since anchors the clock;
 *      day-30/day-90 retro checkpoints cannot sit uncompleted past their due
 *      date, evidence cells cannot hold placeholder text ("unverified — confirm
 *      in RevenueCat"), and the weekly log must carry dated rows with real
 *      numbers once the app has been live past two weeks. A recorded Kill
 *      verdict is the one legitimate way for the rhythm to go quiet.
 *
 * Launch-and-vanish — shipping the store release with no operating rhythm —
 * is the failure this catches. See knowledge/operations/post-launch-operations.md.
 *
 * Run:
 *   npm run check:post-launch -- --root <app-repo-root>
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { asString, getPath, issue, loadProjectState, parseCliArgs, readText, reportAndExit } from "../../../../tooling/lib/launch-state.js";
import { parseRequiredTableSection } from "../../../../kernel/lib/required-table-section.js";

const args = parseCliArgs(process.argv.slice(2));
const loaded = loadProjectState(args);
const issues = [...loaded.issues];
const state = loaded.state;

function includes(text: string, phrase: string): boolean {
  return text.toLowerCase().includes(phrase.toLowerCase());
}

function includesAny(text: string, phrases: string[]): boolean {
  return phrases.some((phrase) => includes(text, phrase));
}

// ── Scope guard ─────────────────────────────────────────────────────────────

const laneStatus = state ? asString(getPath(state, "lanes.post_launch_ops.status"))?.toLowerCase() : undefined;
const phase = state ? (asString(getPath(state, "project.phase"))?.toLowerCase() ?? "") : "";
const postLaunchPhase = phase === "phase_6" || phase === "phase_6b";
const laneClaimed = laneStatus === "running" || laneStatus === "succeeded";
const laneDone = laneStatus === "succeeded";

if (!laneClaimed && !postLaunchPhase) {
  // Pre-launch work: the lane sits not_started/deferred under normal
  // lane-coverage rules until the app is live.
  reportAndExit("Post-launch operations check", issues);
  // No argument: honor the exit code reportAndExit set (errors still fail on the skip path).
  process.exit();
}

// ── Check 0: runbook exists ─────────────────────────────────────────────────

const runbookCandidates = ["operations/POST_LAUNCH_OPS.md", "post-launch/operations/POST_LAUNCH_OPS.md"];
const runbookPath = runbookCandidates.find((candidate) => Boolean(readText(args.root, candidate)));
const runbook = runbookPath ? readText(args.root, runbookPath) : undefined;

if (!runbook || !runbookPath) {
  issues.push(
    issue(
      "error",
      "post_launch_ops.runbook_missing",
      "operations/POST_LAUNCH_OPS.md is required once the project is post-launch (phase_6/phase_6b) or the post_launch_ops lane is claimed. " +
        "A launched app with no operating runbook is the launch-and-vanish anti-pattern. " +
        "See knowledge/operations/post-launch-operations.md.",
      "operations/POST_LAUNCH_OPS.md",
    ),
  );
  reportAndExit("Post-launch operations check", issues);
  process.exit();
}

// ── Check 1: operating sections present ─────────────────────────────────────

const requiredSections = [
  "Weekly Operating Rhythm",
  "Crash Triage",
  "Review Responses",
  "Release And Hotfix Cadence",
  "Retention Review",
  "Manual Loop Proof",
  "Support Operations",
  "Launch Retro",
];

for (const section of requiredSections) {
  if (section === "Manual Loop Proof") continue;
  if (!includes(runbook, section)) {
    issues.push(
      issue(
        laneDone ? "error" : "warning",
        `post_launch_ops.section_missing.${section.toLowerCase().replaceAll(" ", "_")}`,
        `${runbookPath} is missing the "${section}" section. The operating runbook must cover the full weekly rhythm, not a subset.`,
        runbookPath,
      ),
    );
  }
}

// ── Check 2: the numbers loop ───────────────────────────────────────────────
// A live app is measured in dollars and users, not deploy logs. Everything
// below hangs off lanes.post_launch_ops.live_since: checkpoint due dates and
// weekly-log freshness compare against the current date. Severity is error
// whenever the app is actually live (done lane OR post-launch phase) — a
// phase_6 project cannot dodge the numbers by leaving the lane partial — and
// warning only for a lane claimed early, before the project reaches launch.

const numbersSeverity = laneDone || postLaunchPhase ? "error" : "warning";
const MS_PER_DAY = 86_400_000;
const CHECKPOINT_GRACE_DAYS = 7;
const WEEKLY_STALE_DAYS = 14;
// The lazy fills observed on real launches: text that occupies the cell so the
// row looks done while the number never arrived.
const PLACEHOLDER_TEXT = /\b(unverified|tbd|todo|to be filled|pending|confirm in|placeholder)\b/i;
// Measured-value contracts, shared by the weekly log and the verdict evidence
// pack: a rate is a percentage, money is an MRR-labeled dollar amount with at
// least one digit ("MRR $0" counts; "ad spend $500" and "MRR $..." do not),
// and the one legitimate substitute is a dated blocker naming what stopped the
// pull. Adjectives — "flat", "declining", "looks healthy" — are directions,
// not measurements.
const MEASURED_RATE = /\d+(?:\.\d+)?\s*%/;
const MEASURED_MONEY = /\$\s*\d[\d,]*(?:\.\d+)?/;
const MEASURED_MRR = /\bMRR\b[^|]*\$\s*\d[\d,]*(?:\.\d+)?/i;
/** A dated blocker earns its pass only when its embedded date is a real,
 * non-future calendar date — "blocked: RevenueCat auth 2026-99-99" is a
 * placeholder wearing a blocker's clothes. */
function datedBlockerValid(cell: string): boolean {
  const match = cell.match(/blocked\b[^|]*?(\d{4}-\d{2}-\d{2})/i);
  return Boolean(match && parseLiveDate(match[1] ?? ""));
}

/** Column-appropriate measured evidence for a Kill/Hold/Scale row: every cell
 * filled and non-placeholder, the MRR-trend cell carrying a dollar amount, the
 * retention-trend cell a percentage, the founder-hours cell a number, and the
 * unit-economics cell a number or an explained n/a (or a valid dated blocker
 * in any of their places). */
function verdictEvidenceMeasured(verdictSection: string, cells: string[], verdictColumn: number): boolean {
  const evidenceCells = verdictColumn > 2 ? cells.slice(2, verdictColumn) : [];
  if (evidenceCells.length === 0) return false;
  if (evidenceCells.some((cell) => cell.trim().length === 0 || PLACEHOLDER_TEXT.test(cell))) return false;
  const columnOk = (pattern: RegExp, valid: (cell: string) => boolean): boolean => {
    const index = tableColumnIndex(verdictSection, pattern);
    if (index <= 1 || index >= verdictColumn) return true;
    const cell = cells[index] ?? "";
    return valid(cell) || datedBlockerValid(cell);
  };
  return (
    columnOk(/mrr/i, (cell) => MEASURED_MONEY.test(cell)) &&
    columnOk(/retention/i, (cell) => MEASURED_RATE.test(cell)) &&
    columnOk(/hrs|hours/i, (cell) => /\d/.test(cell)) &&
    columnOk(/cac|ltv|payback/i, (cell) => /\d/.test(cell) || /\bn\/a\b/i.test(cell))
  );
}

/** Strict calendar date: shape, round-trip, and not in the future. A typo'd
 * month (2026-99-99) or a forward-dated launch would otherwise turn every
 * comparison into silent NaN/negative math and disarm the clock entirely. */
function parseLiveDate(raw: string): Date | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return undefined;
  const date = new Date(`${raw}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== raw) return undefined;
  if (date.getTime() > Date.now()) return undefined;
  return date;
}

// A value-producing process is not safe to automate on a paper design alone. The runbook must
// either prove one successful manual cycle or state why no such automation applies. This check is
// separate from the weekly clock because the proof must exist before the first automated run.
const manualLoopHeaders = ["Date", "Process", "Input", "Output", "Result", "Cost", "Failure mode", "Automation decision"] as const;

/** Authoritative prefixes keep the safety decision machine-readable while
 * leaving the rest of the cell available for an authored rationale. */
function automationDisposition(decision: string): "automate" | "keep_manual" | undefined {
  const value = decision.trim();
  if (/^automate\b/i.test(value)) return "automate";
  if (/^keep manual\b/i.test(value)) return "keep_manual";
  return undefined;
}

const manualProofResult = parseRequiredTableSection(runbook, "Manual Loop Proof", manualLoopHeaders);
if (!manualProofResult.ok) {
  const sectionMissing = manualProofResult.errors.some((error) => error.kind === "section-missing");
  issues.push(
    issue(
      numbersSeverity,
      sectionMissing ? "post_launch_ops.section_missing.manual_loop_proof" : "post_launch_ops.manual_loop_proof_missing",
      sectionMissing
        ? `${runbookPath} is missing the "Manual Loop Proof" H2 section. A prose mention does not satisfy the automation-proof contract.`
        : `${runbookPath}'s Manual Loop Proof must contain one canonical manual-run table. Duplicate, empty, separated, or malformed tables do not prove the process.`,
      runbookPath,
    ),
  );
} else {
  const manualProofSection = manualProofResult.section.renderedBody;
  const applicabilityDeclarations = manualProofSection
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^Applicability\b/i.test(line));
  const applicability = applicabilityDeclarations.length === 1 ? (applicabilityDeclarations[0]?.match(/^Applicability:\s*(.+)$/i)?.[1]?.trim() ?? "") : "";
  const notApplicable = applicability.match(/^not applicable\s*(?:—|-|:)\s*(.+)$/i);
  const notApplicableReason = notApplicable?.[1]?.trim() ?? "";
  const substantiveNotApplicableReason =
    notApplicableReason.length >= 15 && !PLACEHOLDER_TEXT.test(notApplicableReason) && !/^(reason|none|not applicable|n\/a)$/i.test(notApplicableReason);
  const applicable = /^applicable$/i.test(applicability);
  const normalizedHeaders = manualLoopHeaders.map((header) => header.toLowerCase());
  const canonicalHeaders =
    manualProofResult.section.header.normalizedCells.length === normalizedHeaders.length &&
    manualProofResult.section.header.normalizedCells.every((header, index) => header === normalizedHeaders[index]);
  const rowsComplete =
    canonicalHeaders &&
    manualProofResult.section.rows.every((row) => {
      if (row.rawCellCount !== manualProofResult.section.width) return false;
      const [date, processName, input, output, result, cost, failureMode, automationDecision] = row.cells;
      const evidenceCells = [processName, input, output, result, cost, failureMode, automationDecision];
      const disposition = automationDisposition(automationDecision ?? "");
      return (
        Boolean(parseLiveDate(date ?? "")) &&
        evidenceCells.every((cell) => Boolean(cell) && !PLACEHOLDER_TEXT.test(cell ?? "")) &&
        /^(passed|failed)$/i.test(result ?? "") &&
        Boolean(disposition) &&
        (disposition !== "automate" || /^passed$/i.test(result ?? ""))
      );
    });
  const hasPassedRun = manualProofResult.section.rows.some((row) => /^passed$/i.test(row.cells[4] ?? ""));

  if (!applicable && !substantiveNotApplicableReason) {
    issues.push(
      issue(
        numbersSeverity,
        "post_launch_ops.manual_loop_applicability_missing",
        `${runbookPath}'s Manual Loop Proof must record exactly one rendered "Applicability: applicable" or ` +
          '"Applicability: not applicable — <authored reason>" declaration. Duplicate, contradictory, placeholder, or option-menu declarations ' +
          "do not decide whether a value-producing process will be automated.",
        runbookPath,
      ),
    );
  }

  const declaredRowsInvalid = manualProofResult.section.rows.length > 0 && !rowsComplete;
  const applicableProofMissing = applicable && (manualProofResult.section.rows.length === 0 || !rowsComplete || !hasPassedRun);
  if (declaredRowsInvalid || applicableProofMissing) {
    issues.push(
      issue(
        numbersSeverity,
        "post_launch_ops.manual_loop_proof_missing",
        `Every declared Manual Loop Proof row in ${runbookPath} must use the canonical width, a real past date, complete evidence, and a Result of "passed" or "failed". ` +
          'Automation decision must begin with "automate" or "keep manual". When applicable, at least one complete row must record "passed"; ' +
          'any row beginning with "automate" must itself be passed.',
        runbookPath,
      ),
    );
  }
}

const liveSinceRaw = state ? (asString(getPath(state, "lanes.post_launch_ops.live_since")) ?? "").trim() : "";
const liveSince = parseLiveDate(liveSinceRaw);
const daysLive = liveSince ? Math.floor((Date.now() - liveSince.getTime()) / MS_PER_DAY) : 0;

if (!liveSince) {
  issues.push(
    issue(
      numbersSeverity,
      "post_launch_ops.live_since_missing",
      "lanes.post_launch_ops.live_since does not record a valid past ISO date for when the app went live " +
        (liveSinceRaw ? `(current value: "${liveSinceRaw}"). ` : ". ") +
        "Without a real calendar date nothing can ever be overdue — no retro checkpoint has a due date and the weekly log has no " +
        "freshness bar. Record the first approved-for-sale date once; it never changes.",
      "state/business-state.json",
    ),
  );
}

const retroFile = ["operations/LAUNCH_RETRO.md", "post-launch/operations/LAUNCH_RETRO.md"].find((candidate) => existsSync(path.join(args.root, candidate)));
const retroText = retroFile ? (readText(args.root, retroFile) ?? "") : "";

// The wind-down exemption must be earned, not typed: a one-string state edit
// (kill_or_scale_decision: kill) with no retro behind it would otherwise skip
// every checkpoint and weekly-log gate. Kill counts only when the state mirror
// is complete AND some retro checkpoint was actually completed (a valid past
// date in the Retro Window) AND that same checkpoint carries a Kill verdict
// over a filled, non-placeholder evidence pack.
/** A completion date suppresses gates only when it is a real, non-future
 * calendar date inside the launch-anchored window: on or after live_since plus
 * the checkpoint's due day minus grace, so an early-but-plausible run counts
 * and a recycled pre-launch date does not. */
function checkpointCompletionValid(cell: string, dueDays: number): boolean {
  const date = parseLiveDate(cell.trim());
  if (!date || !liveSince) return false;
  return date.getTime() >= liveSince.getTime() + (dueDays - CHECKPOINT_GRACE_DAYS) * MS_PER_DAY;
}

const killDecided = ((): boolean => {
  if (!state) return false;
  const decision = (asString(getPath(state, "lanes.post_launch_ops.kill_or_scale_decision")) ?? "").trim();
  const decidedAt = (asString(getPath(state, "lanes.post_launch_ops.kill_or_scale_decided_at")) ?? "").trim();
  if (!/^kill$/i.test(decision) || !parseLiveDate(decidedAt)) return false;
  const verdictSection = markdownSection(retroText, "Kill, Hold, Or Scale");
  const windowSection = markdownSection(retroText, "Retro Window");
  if (!verdictSection || !windowSection) return false;
  const verdictColumn = tableColumnIndex(verdictSection, /verdict/i);
  if (verdictColumn === -1) return false;
  return ["Day 30", "Day 90"].some((checkpoint) => {
    if (!checkpointCompletionValid(tableRowCells(windowSection, checkpoint)[2] ?? "", checkpoint === "Day 90" ? 90 : 30)) return false;
    const cells = tableRowCells(verdictSection, checkpoint);
    if (!/^kill\b/i.test((cells[verdictColumn] ?? "").trim())) return false;
    return verdictEvidenceMeasured(verdictSection, cells, verdictColumn);
  });
})();

if (liveSince && !killDecided) {
  // Checkpoints that were never completed are the dodge the verdict gates
  // cannot see: every existing check fires only after a completion date is
  // recorded. Past due-plus-grace, the untouched row is itself the miss.
  const retroWindow = markdownSection(retroText, "Retro Window");
  const checkpoints: Array<{ label: string; dueDays: number; code: string; severity: "error" | "warning" }> = [
    { label: "Launch \\+7 days", dueDays: 7, code: "launch_7", severity: "warning" },
    { label: "Day 30", dueDays: 30, code: "day_30", severity: numbersSeverity },
    { label: "Day 90", dueDays: 90, code: "day_90", severity: numbersSeverity },
  ];
  for (const checkpoint of checkpoints) {
    // Completion requires a valid, non-future calendar date — "TBD" or an
    // impossible date in the Date cell is not a completed checkpoint and must
    // not suppress the overdue error.
    const completed = checkpointCompletionValid(tableRowCells(retroWindow, checkpoint.label)[2] ?? "", checkpoint.dueDays);
    if (!completed && daysLive > checkpoint.dueDays + CHECKPOINT_GRACE_DAYS) {
      issues.push(
        issue(
          checkpoint.severity,
          `post_launch_ops.checkpoint_overdue.${checkpoint.code}`,
          `The app has been live ${daysLive} days and the ${checkpoint.label.replaceAll("\\", "")} retro checkpoint in ${retroFile ?? "operations/LAUNCH_RETRO.md"} ` +
            `is still not completed (due at day ${checkpoint.dueDays}, grace ${CHECKPOINT_GRACE_DAYS} days). An uncompleted checkpoint is how the ` +
            `kill-or-scale question gets dodged indefinitely — run the checkpoint now and record its date in the Retro Window.`,
          retroFile ?? "operations/LAUNCH_RETRO.md",
        ),
      );
    }
  }

  // The weekly log is where the Weekly Ops Review proves it read reality.
  // Once the app has been live past two weeks, the log needs dated rows, the
  // latest row must be recent, and its metric cells must hold numbers — not
  // adjectives, not "unverified".
  if (daysLive >= WEEKLY_STALE_DAYS) {
    const runbookLines = runbook.split(/\r?\n/);
    const headerIndex = runbookLines.findIndex(
      (line) => line.trim().startsWith("|") && /date/i.test(line) && /crash-free/i.test(line) && /retention|d7/i.test(line),
    );
    if (headerIndex === -1) {
      issues.push(
        issue(
          numbersSeverity,
          "post_launch_ops.weekly_log_missing",
          `${runbookPath} no longer carries the weekly log table (Date | Crash-free % | … | D7 retention). The log is the proof the ` +
            `Weekly Ops Review reads real numbers each week — keep the table and add one dated row per session.`,
          runbookPath,
        ),
      );
    } else {
      const headerCells = runbookLines[headerIndex]!.split("|");
      const crashColumn = headerCells.findIndex((cell) => /crash-free/i.test(cell));
      const retentionColumn = headerCells.findIndex((cell) => /d7|retention/i.test(cell));
      const dateRows: Array<{ date: Date; cells: string[] }> = [];
      for (let i = headerIndex + 1; i < runbookLines.length; i += 1) {
        const line = runbookLines[i]?.trim() ?? "";
        if (!line.startsWith("|")) break;
        const match = line.match(/^\|\s*(\d{4}-\d{2}-\d{2})\s*\|/);
        // Same strict past-date validation as live_since: a future-dated or
        // impossible row must not anchor the freshness math.
        const rowDate = match ? parseLiveDate(match[1] ?? "") : undefined;
        if (rowDate) dateRows.push({ date: rowDate, cells: line.split("|").map((cell) => cell.trim()) });
      }
      if (dateRows.length === 0) {
        issues.push(
          issue(
            numbersSeverity,
            "post_launch_ops.weekly_log_missing",
            `The app has been live ${daysLive} days and the weekly log in ${runbookPath} has no dated rows. A live business with an empty ` +
              `weekly log is launch-and-vanish in progress — run the Weekly Ops Review and record the numbers (or record the Kill verdict if the app is wound down).`,
            runbookPath,
          ),
        );
      } else {
        const latest = dateRows.reduce((a, b) => (a.date.getTime() >= b.date.getTime() ? a : b));
        const rowAgeDays = Math.floor((Date.now() - latest.date.getTime()) / MS_PER_DAY);
        if (rowAgeDays > WEEKLY_STALE_DAYS) {
          issues.push(
            issue(
              numbersSeverity,
              "post_launch_ops.weekly_log_stale",
              `The latest weekly log row in ${runbookPath} is ${rowAgeDays} days old. The Weekly Ops Review runs even in a quiet week — ` +
                `a stale log means the rhythm stopped and nobody recorded why. Run the session, or record the Kill verdict if the app is wound down.`,
              runbookPath,
            ),
          );
        }
        // A measured value is a percentage (crash-free and D7 are both rates),
        // or the documented dated-blocker form. An incidental digit inside an
        // adjective sentence ("iOS 17 looks fine") is not a metric.
        const metricCells = [crashColumn, retentionColumn].filter((index) => index > 0).map((index) => latest.cells[index] ?? "");
        if (metricCells.some((cell) => !(MEASURED_RATE.test(cell) || datedBlockerValid(cell)) || PLACEHOLDER_TEXT.test(cell))) {
          issues.push(
            issue(
              numbersSeverity,
              "post_launch_ops.weekly_numbers_missing",
              `The latest weekly log row in ${runbookPath} holds no measured values in its crash-free/retention cells. A metric is a ` +
                `percentage ("99.6%", "31%") or a dated blocker ("blocked: PostHog auth 2026-07-20") — adjectives with incidental digits are ` +
                `not a metrics review. Pull the values from Sentry, PostHog, and RevenueCat.`,
              runbookPath,
            ),
          );
        }
        // The runbook contract puts MRR and its delta in Notes each week — the
        // dollar figure is the whole point of the numbers loop, so rate columns
        // alone cannot satisfy it, and neither can an unrelated dollar amount.
        const notesColumn = headerCells.findIndex((cell) => /notes/i.test(cell));
        const notesCell = notesColumn > 0 ? (latest.cells[notesColumn] ?? "") : "";
        if (notesColumn === -1 || !(MEASURED_MRR.test(notesCell) || datedBlockerValid(notesCell)) || PLACEHOLDER_TEXT.test(notesCell)) {
          issues.push(
            issue(
              numbersSeverity,
              "post_launch_ops.weekly_revenue_missing",
              `The latest weekly log row in ${runbookPath} records no MRR figure. The Notes column carries an MRR-labeled dollar amount ` +
                `("MRR $412 (+3%)"; "MRR $0" is a legitimate value) or a dated blocker — "ad spend $500" is not MRR, and a metrics review ` +
                `that never touches revenue is metrics theater with extra steps. Pull it from RevenueCat.`,
              runbookPath,
            ),
          );
        }
      }
    }
  }
}

// ── Check 3: done-status proof floor ────────────────────────────────────────

if (laneDone) {
  if (!includesAny(runbook, ["sentry", "store crash reports", "crash reports in app store connect", "play console vitals"])) {
    issues.push(
      issue(
        "error",
        "post_launch_ops.crash_route_missing",
        `${runbookPath} names no crash route. Record Sentry (or store crash reports as the fallback) with alert routing before the lane is done.`,
        runbookPath,
      ),
    );
  }
  if (!includes(runbook, "sla")) {
    issues.push(
      issue(
        "error",
        "post_launch_ops.review_sla_missing",
        `${runbookPath} states no review-response SLA. Record how fast reviews get replies so reputation work is a contract, not a mood.`,
        runbookPath,
      ),
    );
  }
  if (!includes(runbook, "cohort")) {
    issues.push(
      issue(
        "error",
        "post_launch_ops.retention_source_missing",
        `${runbookPath} names no retention cohort source. Record the D0/D7/D30 cohort source (PostHog plus RevenueCat renewals) before the lane is done.`,
        runbookPath,
      ),
    );
  }
}

// ── Check 4: retro verdict substance ────────────────────────────────────────
// Runs for done lanes AND live phases: a phase_6 project with the lane still
// partial must not be able to record a checkpoint date over an empty or
// placeholder verdict row — the substance bar travels with the phase, not
// only with the lane status.

if (laneDone || postLaunchPhase) {
  const retroPath = ["operations/LAUNCH_RETRO.md", "post-launch/operations/LAUNCH_RETRO.md"].find((candidate) => existsSync(path.join(args.root, candidate)));
  if (!retroPath) {
    issues.push(
      issue(
        "error",
        "post_launch_ops.launch_retro_missing",
        "operations/LAUNCH_RETRO.md is required once the app is live or post_launch_ops is done. The retro is how this launch's misses become failure cards " +
          "and LaunchBench scenarios instead of oral lore.",
        "operations/LAUNCH_RETRO.md",
      ),
    );
  } else {
    // The retro must carry the whole-app verdict surface. Channel-level
    // stop/scale rules exist elsewhere; this is the only place the question
    // "keep investing in this app or move to the next one" is forced, and a
    // rhythm with no exit question runs zombie apps indefinitely.
    const retroRaw = readText(args.root, retroPath) ?? "";
    // Section presence is judged on the actual heading, not a prose mention —
    // "we should think about kill, hold, or scale" in Surprises is not a
    // verdict surface.
    const verdictSection = markdownSection(retroRaw, "Kill, Hold, Or Scale");
    if (!verdictSection) {
      issues.push(
        issue(
          "error",
          "post_launch_ops.kill_or_scale_missing",
          `${retroPath} has no "Kill, Hold, Or Scale" section. The day-30/day-90 retro must carry the whole-app verdict ` +
            `(post-launch-operations.md §9) — evidence columns filled by the agent, verdict decided by the founder.`,
          retroPath,
        ),
      );
    } else {
      // The heading alone is not the contract — the verdict is. Once the Retro
      // Window table records a completion date for Day 30 or Day 90, that
      // checkpoint's row in the Kill, Hold, Or Scale table must carry an actual
      // verdict, and the decision must be mirrored into state/business-state.json.
      // Before the first checkpoint completes, the section's presence is enough
      // (done at launch +7 days is legitimate).
      const windowSection = markdownSection(retroRaw, "Retro Window");
      const verdictColumn = tableColumnIndex(verdictSection, /verdict/i);
      const completedCheckpoints = ["Day 30", "Day 90"].filter((checkpoint) => Boolean(tableRowCells(windowSection, checkpoint)[2]?.trim()));

      for (const checkpoint of completedCheckpoints) {
        const cells = tableRowCells(verdictSection, checkpoint);
        const verdictCell = verdictColumn === -1 ? "" : (cells[verdictColumn] ?? "");
        if (!/^(scale|hold|fix|kill)\b/i.test(verdictCell.trim())) {
          issues.push(
            issue(
              "error",
              "post_launch_ops.kill_or_scale_verdict_unfilled",
              `${retroPath} records the ${checkpoint} checkpoint as completed, but its Kill, Hold, Or Scale row carries no verdict. ` +
                `A completed checkpoint with an empty verdict is the zombie-app miss the section exists to stop — record Scale, Hold, Fix, or Kill.`,
              retroPath,
            ),
          );
        }
        // The verdict is only as good as its evidence pack: every column
        // between the checkpoint and the verdict (MRR trend, retention trend,
        // unit economics, founder hours) must be filled before the decision
        // counts. Rationale stays the founder's optional words.
        const evidenceCells = verdictColumn > 2 ? cells.slice(2, verdictColumn) : [];
        if (verdictColumn !== -1 && (cells.length === 0 || evidenceCells.some((cell) => cell.trim().length === 0))) {
          issues.push(
            issue(
              "error",
              "post_launch_ops.kill_or_scale_evidence_unfilled",
              `${retroPath}'s ${checkpoint} Kill, Hold, Or Scale row is missing evidence cells (MRR trend, retention trend, unit economics, founder hours). ` +
                `A verdict without the evidence pack is a mood, not a decision — fill every evidence column from RevenueCat, PostHog, and the weekly log.`,
              retroPath,
            ),
          );
        } else if (evidenceCells.some((cell) => PLACEHOLDER_TEXT.test(cell))) {
          // Non-empty is not the bar: "unverified — confirm in RevenueCat" fills
          // the cell while dodging the pull. The number, or the dated blocker
          // that prevents it, is the only content that counts.
          issues.push(
            issue(
              "error",
              "post_launch_ops.kill_or_scale_evidence_placeholder",
              `${retroPath}'s ${checkpoint} Kill, Hold, Or Scale row carries placeholder text ("unverified", "TBD", "confirm in …") in its evidence cells. ` +
                `Pull the actual values from RevenueCat and PostHog before recording the verdict — a decision made over placeholders is the metrics-theater miss.`,
              retroPath,
            ),
          );
        } else if (!verdictEvidenceMeasured(verdictSection, cells, verdictColumn)) {
          issues.push(
            issue(
              "error",
              "post_launch_ops.kill_or_scale_evidence_unmeasured",
              `${retroPath}'s ${checkpoint} Kill, Hold, Or Scale row holds no measured values: the MRR-trend cell needs a dollar amount ` +
                `("$412 MRR, flat 4 wks") and the retention cell a percentage ("D7 31% → 29%"), or a dated blocker in their place. ` +
                `"flat" and "declining" are directions, not measurements — a verdict decided over adjectives is still a mood.`,
              retroPath,
            ),
          );
        }
      }

      if (completedCheckpoints.length > 0 && state) {
        const decision = (asString(getPath(state, "lanes.post_launch_ops.kill_or_scale_decision")) ?? "").trim();
        const decidedAt = (asString(getPath(state, "lanes.post_launch_ops.kill_or_scale_decided_at")) ?? "").trim();
        if (!/^(scale|hold|fix|kill)$/i.test(decision) || !/^\d{4}-\d{2}-\d{2}$/.test(decidedAt)) {
          issues.push(
            issue(
              "error",
              "post_launch_ops.kill_or_scale_state_missing",
              `A day-30/day-90 retro checkpoint is complete but lanes.post_launch_ops.kill_or_scale_decision/kill_or_scale_decided_at ` +
                `do not record a valid verdict (scale|hold|fix|kill) with an ISO date. The state mirror is what future sessions and the portfolio registry read.`,
              "state/business-state.json",
            ),
          );
        } else {
          // The mirror must agree with the latest completed checkpoint: future
          // sessions and the portfolio registry read the state value, so a
          // retro saying Kill while state says scale drives the wrong
          // allocation and skips the wind-down.
          const latest = completedCheckpoints[completedCheckpoints.length - 1] ?? "";
          const latestVerdict = (verdictColumn === -1 ? "" : (tableRowCells(verdictSection, latest)[verdictColumn] ?? ""))
            .trim()
            .match(/^(scale|hold|fix|kill)\b/i)?.[1]
            ?.toLowerCase();
          if (latestVerdict && latestVerdict !== decision.toLowerCase()) {
            issues.push(
              issue(
                "error",
                "post_launch_ops.kill_or_scale_state_mismatch",
                `lanes.post_launch_ops.kill_or_scale_decision ("${decision}") disagrees with the latest completed checkpoint's verdict in ${retroPath} ("${latestVerdict}"). ` +
                  `Update the state mirror when the verdict changes — it is what future sessions and the portfolio registry act on.`,
                "state/business-state.json",
              ),
            );
          }
        }
      }
    }
  }
}

// ── Check 5: the operating lanes' own artifacts ─────────────────────────────
// The Weekly Ops Review orchestrates; the support queue, the retention
// program, and the financial pulse are separately-gated lanes with their own
// artifacts. Before this check, "support sweep" and "route involuntary churn"
// were bullets inside one node's prose — an autonomous run had no distinct
// obligation to prove a ticket was answered, a churn cohort was worked, or the
// money was actually read (2026-08-19 audit). Same clock and same exemption as
// the weekly log: the lanes get two weeks from live_since to stand up, and a
// recorded Kill verdict is the one legitimate way for them to go quiet.

/** Latest strictly-dated table row anywhere in the document (first cell a valid past ISO date). */
function latestDatedTableRow(text: string): { date: Date; cells: string[]; ageDays: number } | undefined {
  let latest: { date: Date; cells: string[] } | undefined;
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    const match = trimmed.match(/^\|\s*(\d{4}-\d{2}-\d{2})\s*\|/);
    const rowDate = match ? parseLiveDate(match[1] ?? "") : undefined;
    if (!rowDate) continue;
    if (!latest || rowDate.getTime() > latest.date.getTime()) latest = { date: rowDate, cells: trimmed.split("|").map((cell) => cell.trim()) };
  }
  if (!latest) return undefined;
  return { ...latest, ageDays: Math.floor((Date.now() - latest.date.getTime()) / MS_PER_DAY) };
}

if (liveSince && !killDecided && daysLive >= WEEKLY_STALE_DAYS) {
  const laneArtifacts: Array<{
    file: string;
    lane: string;
    stoodUpBy: string;
    judge: (text: string, artifactPath: string) => void;
  }> = [
    {
      file: "operations/SUPPORT_OPS.md",
      lane: "support",
      stoodUpBy: "the support-queue node (knowledge §7): queue state, response SLA, escalation routes",
      judge: (text, artifactPath) => {
        if (!includes(text, "sla")) {
          issues.push(
            issue(
              numbersSeverity,
              "post_launch_ops.support_sla_missing",
              `${artifactPath} states no response SLA. Support is a contract with a clock — record how fast a ticket gets a first reply.`,
              artifactPath,
            ),
          );
        }
        const row = latestDatedTableRow(text);
        if (!row || row.ageDays > WEEKLY_STALE_DAYS) {
          issues.push(
            issue(
              numbersSeverity,
              "post_launch_ops.support_log_stale",
              `${artifactPath} has no dated queue row newer than ${WEEKLY_STALE_DAYS} days. The support sweep records queue depth and oldest-ticket age ` +
                `every cycle — an unrecorded queue is an unanswered one until proven otherwise.`,
              artifactPath,
            ),
          );
        } else if (!row.cells.some((cell) => /\d/.test(cell) && !PLACEHOLDER_TEXT.test(cell)) || row.cells.some((cell) => PLACEHOLDER_TEXT.test(cell))) {
          issues.push(
            issue(
              numbersSeverity,
              "post_launch_ops.support_numbers_missing",
              `${artifactPath}'s latest queue row holds no counted state (queue depth, oldest ticket age) or carries placeholder text. ` +
                `"inbox fine" is not a swept queue — count it, or record the dated blocker that stopped the sweep.`,
              artifactPath,
            ),
          );
        }
      },
    },
    {
      file: "operations/RETENTION_OPS.md",
      lane: "retention",
      stoodUpBy: "the retention node (knowledge §6 + billing-health-and-reactivation.md): cohort source, D7/D30 numbers, the intervention log",
      judge: (text, artifactPath) => {
        if (!includes(text, "cohort")) {
          issues.push(
            issue(
              numbersSeverity,
              "post_launch_ops.retention_cohort_source_missing",
              `${artifactPath} names no cohort source. Record where D0/D7/D30 comes from (PostHog cohorts plus RevenueCat renewals) — ` +
                `a retention program with no source argues from memory.`,
              artifactPath,
            ),
          );
        }
        const row = latestDatedTableRow(text);
        if (!row || row.ageDays > WEEKLY_STALE_DAYS) {
          issues.push(
            issue(
              numbersSeverity,
              "post_launch_ops.retention_log_stale",
              `${artifactPath} has no dated retention row newer than ${WEEKLY_STALE_DAYS} days. The retention pass reads the cohorts every cycle, ` +
                `quiet weeks included — a stale log means nobody knows whether the funnel is leaking.`,
              artifactPath,
            ),
          );
        } else if (!row.cells.some((cell) => MEASURED_RATE.test(cell) || datedBlockerValid(cell)) || row.cells.some((cell) => PLACEHOLDER_TEXT.test(cell))) {
          issues.push(
            issue(
              numbersSeverity,
              "post_launch_ops.retention_numbers_missing",
              `${artifactPath}'s latest row holds no measured retention value (a percentage like "D7 31%") or a valid dated blocker, or carries placeholder text. ` +
                `Directions ("holding", "declining") are not measurements.`,
              artifactPath,
            ),
          );
        }
        if (!includes(text, "intervention")) {
          issues.push(
            issue(
              numbersSeverity,
              "post_launch_ops.retention_intervention_missing",
              `${artifactPath} carries no Intervention section. Reading the cohorts without a shipped-or-planned intervention log is observation, ` +
                `not a retention program — record what was tried, when, and what moved (involuntary churn routes through the billing recovery levers).`,
              artifactPath,
            ),
          );
        }
      },
    },
    {
      file: "operations/FINANCE_OPS.md",
      lane: "finance",
      stoodUpBy: "the financial-health node: MRR, spend, and runway read from the real providers on a cadence",
      judge: (text, artifactPath) => {
        const row = latestDatedTableRow(text);
        if (!row || row.ageDays > WEEKLY_STALE_DAYS) {
          issues.push(
            issue(
              numbersSeverity,
              "post_launch_ops.finance_log_stale",
              `${artifactPath} has no dated finance row newer than ${WEEKLY_STALE_DAYS} days. The financial pulse is read on a cadence — ` +
                `a business whose money was last read a month ago is being operated on vibes.`,
              artifactPath,
            ),
          );
        } else if (!row.cells.some((cell) => MEASURED_MRR.test(cell) || datedBlockerValid(cell)) || row.cells.some((cell) => PLACEHOLDER_TEXT.test(cell))) {
          issues.push(
            issue(
              numbersSeverity,
              "post_launch_ops.finance_mrr_missing",
              `${artifactPath}'s latest row records no MRR-labeled dollar amount ("MRR $412"; "MRR $0" is a legitimate value) or valid dated blocker, ` +
                `or carries placeholder text. Pull it from RevenueCat — revenue adjectives are the metrics-theater miss with money attached.`,
              artifactPath,
            ),
          );
        }
        if (!includesAny(text, ["runway", "burn"])) {
          issues.push(
            issue(
              numbersSeverity,
              "post_launch_ops.finance_runway_missing",
              `${artifactPath} never states runway or burn. MRR without the spend side is half a pulse — record monthly spend and the runway it implies.`,
              artifactPath,
            ),
          );
        }
      },
    },
  ];

  for (const spec of laneArtifacts) {
    const text = readText(args.root, spec.file);
    if (!text) {
      issues.push(
        issue(
          numbersSeverity,
          `post_launch_ops.lane_artifact_missing.${spec.lane}`,
          `${spec.file} is required once the app has been live past two weeks: ${spec.stoodUpBy}. ` +
            `Its absence means that lane's work has no evidence surface — the launch-and-vanish miss, one lane at a time.`,
          spec.file,
        ),
      );
      continue;
    }
    spec.judge(text, spec.file);
  }
}

reportAndExit("Post-launch operations check", issues);

/** The block from a `## <heading>` line to the next `## ` heading (or EOF). */
function markdownSection(markdown: string, heading: string): string {
  const lines = markdown.split(/\r?\n/);
  const headingPattern = new RegExp(`^##\\s*${heading}`, "i");
  const start = lines.findIndex((line) => headingPattern.test(line.trim()));
  if (start === -1) return "";
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i += 1) {
    if (/^## /.test(lines[i] ?? "")) {
      end = i;
      break;
    }
  }
  return lines.slice(start, end).join("\n");
}

/** Cells of the first table row whose first cell is `label` (outer pipes produce empty edge cells; index 1 is the first real cell). */
function tableRowCells(section: string, label: string): string[] {
  const row = section.split(/\r?\n/).find((line) => new RegExp(`^\\|\\s*${label}\\s*\\|`, "i").test(line.trim()));
  return row ? row.split("|").map((cell) => cell.trim()) : [];
}

/** Index of the header column matching `pattern` in the section's first table header row, or -1. */
function tableColumnIndex(section: string, pattern: RegExp): number {
  const header = section.split(/\r?\n/).find((line) => line.trim().startsWith("|") && pattern.test(line));
  if (!header) return -1;
  return header.split("|").findIndex((cell) => pattern.test(cell));
}
