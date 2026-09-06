import { replaceTableBlock } from "./_table-edit.js";
import { appendFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { type Harness, expectRecord, getLane, readState, skillRoot, writeCompleteCompoundEngineering, writeState } from "./_harness.js";

/**
 * Lifecycle fixtures: post-launch operations, Google Play readiness, the
 * backend data contract, the CE-unavailable Standalone Engineering Loop, and
 * the launch-tier state field.
 */
export function register(h: Harness): void {
  const { makeFixture, makeEmptyFixture, runFixture } = h;

  // ── Post-launch operations ────────────────────────────────────────────────

  // The numbers-loop gates are anchored on lanes.post_launch_ops.live_since and
  // compare against the real current date, so fixtures compute their dates
  // relative to now — a fixed date would silently change meaning as time passes.
  const isoDaysAgo = (days: number): string => {
    const date = new Date();
    date.setUTCDate(date.getUTCDate() - days);
    return date.toISOString().slice(0, 10);
  };

  const setPostLaunchLive = (root: string, daysLive: number): void => {
    const state = readState(root);
    getLane(state, "post_launch_ops")["live_since"] = isoDaysAgo(daysLive);
    writeState(root, state);
  };

  const appendWeeklyLogRow = (root: string, options: { daysAgo: number; crashFree?: string; d7?: string; notes?: string }): void => {
    const runbookPath = path.join(root, "operations/POST_LAUNCH_OPS.md");
    const header = "| Date | Crash-free % | New reviews (avg rating) | D7 retention | Decision shipped | Notes |\n| --- | --- | --- | --- | --- | --- |";
    const row = `| ${isoDaysAgo(options.daysAgo)} | ${options.crashFree ?? "99.7%"} | 4.8 (3 new) | ${options.d7 ?? "31%"} | shipped paywall copy fix | ${options.notes ?? "MRR $412 (+3%)"} |`;
    writeFileSync(path.join(runbookPath), replaceTableBlock(readFileSync(runbookPath, "utf8"), header, `${header}\n${row}`), "utf8");
  };

  const setManualLoopApplicability = (root: string, value: string): void => {
    const runbookPath = path.join(root, "operations/POST_LAUNCH_OPS.md");
    const runbook = readFileSync(runbookPath, "utf8").replace(
      "Applicability: TODO — Record exactly one declaration: applicable, or not applicable with a specific reason.",
      `Applicability: ${value}`,
    );
    writeFileSync(runbookPath, runbook, "utf8");
  };

  const recordSuccessfulManualLoop = (root: string): void => {
    const runbookPath = path.join(root, "operations/POST_LAUNCH_OPS.md");
    const header =
      "| Date | Process | Input | Output | Result | Cost | Failure mode | Automation decision |\n| --- | --- | --- | --- | --- | --- | --- | --- |";
    const row = `| ${isoDaysAgo(2)} | renewal reminder send | 18 opted-in renewal reminders | 18 delivered reminders | passed | $0 | two stale email addresses observed | keep manual until three clean weekly runs |`;
    writeFileSync(runbookPath, replaceTableBlock(readFileSync(runbookPath, "utf8"), header, `${header}\n${row}`), "utf8");
    setManualLoopApplicability(root, "applicable");
  };

  const makeCompletedPostLaunchFixture = (name: string): string => {
    const root = makeFixture(name);
    const state = readState(root);
    expectRecord(state.project, "project")["phase"] = "phase_6b";
    const lane = getLane(state, "post_launch_ops");
    lane["status"] = "succeeded";
    lane["evidence"] = ["operations/POST_LAUNCH_OPS.md", "operations/LAUNCH_RETRO.md"];
    writeState(root, state);
    setPostLaunchLive(root, 10);
    return root;
  };

  const replaceManualLoopSection = (root: string, replacement: (section: string) => string): void => {
    const runbookPath = path.join(root, "operations/POST_LAUNCH_OPS.md");
    const runbook = readFileSync(runbookPath, "utf8");
    const section = runbook.match(/## Manual Loop Proof[\s\S]*?(?=## Support Operations)/)?.[0];
    if (!section) throw new Error(`Manual Loop Proof fixture anchor is missing in ${root}`);
    writeFileSync(runbookPath, runbook.replace(section, replacement(section)), "utf8");
  };

  // The three operating-lane artifacts (2026-08-19 split: support queue, retention program,
  // financial pulse). Valid by default; each fail-then-catch case below breaks exactly one rule.
  const writeOperatingLaneArtifacts = (root: string, overrides: { support?: string; retention?: string; finance?: string; daysAgo?: number } = {}): void => {
    const rowDate = isoDaysAgo(overrides.daysAgo ?? 3);
    const support =
      overrides.support ??
      `# Support Operations\n\nResponse SLA: first reply within 24 hours.\n\n| Date | Open tickets | Oldest ticket age | Shipped/escalated |\n| --- | --- | --- | --- |\n| ${rowDate} | 2 | 1 day | refund routed via App Store; FAQ updated |\n`;
    const retention =
      overrides.retention ??
      `# Retention Program\n\nCohort source: PostHog D0/D7/D30 cohorts plus RevenueCat renewals.\n\n| Date | D7 | D30 | Involuntary churn |\n| --- | --- | --- | --- |\n| ${rowDate} | 31% | 12% | 2 recovered via retry |\n\n## Intervention\n\n| Date | Intervention | Result |\n| --- | --- | --- |\n| ${rowDate} | day-3 win-back email | +2% D7 |\n`;
    const finance =
      overrides.finance ??
      `# Financial Pulse\n\n| Date | MRR | Spend | Runway |\n| --- | --- | --- | --- |\n| ${rowDate} | MRR $412 | $95/mo tools | runway 14 months at current burn |\n`;
    writeFileSync(path.join(root, "operations/SUPPORT_OPS.md"), support, "utf8");
    writeFileSync(path.join(root, "operations/RETENTION_OPS.md"), retention, "utf8");
    writeFileSync(path.join(root, "operations/FINANCE_OPS.md"), finance, "utf8");
  };

  const completeCheckpoint = (
    root: string,
    checkpoint: "Day 30" | "Day 90",
    options: { daysAgo: number; verdict: string; evidence?: [string, string, string, string] },
  ): void => {
    const retroPath = path.join(root, "operations/LAUNCH_RETRO.md");
    const ev = options.evidence ?? ["$412 MRR, flat 4 wks", "D7 31% → 29% → 31%", "n/a — organic only", "6"];
    const retro = replaceTableBlock(
      replaceTableBlock(readFileSync(retroPath, "utf8"), `| ${checkpoint} | | |`, `| ${checkpoint} | ${isoDaysAgo(options.daysAgo)} | founder |`),
      `| ${checkpoint} | | | | | | |`,
      `| ${checkpoint} | ${ev[0]} | ${ev[1]} | ${ev[2]} | ${ev[3]} | ${options.verdict} | |`,
    );
    writeFileSync(retroPath, retro, "utf8");
  };

  const postLaunchComplete = makeFixture("post-launch-complete");
  {
    const state = readState(postLaunchComplete);
    expectRecord(state.project, "project")["phase"] = "phase_6b";
    const lane = getLane(state, "post_launch_ops");
    lane["status"] = "succeeded";
    lane["evidence"] = ["operations/POST_LAUNCH_OPS.md", "operations/LAUNCH_RETRO.md"];
    writeState(postLaunchComplete, state);
    setPostLaunchLive(postLaunchComplete, 10);
    setManualLoopApplicability(postLaunchComplete, "not applicable — No value-producing process is scheduled for automation.");
  }
  runFixture("post-launch lane done with complete runbook passes", postLaunchComplete, "check-post-launch-ops.ts", 0);

  const postLaunchManualLoopComplete = makeFixture("post-launch-manual-loop-complete");
  {
    const state = readState(postLaunchManualLoopComplete);
    expectRecord(state.project, "project")["phase"] = "phase_6b";
    const lane = getLane(state, "post_launch_ops");
    lane["status"] = "succeeded";
    lane["evidence"] = ["operations/POST_LAUNCH_OPS.md", "operations/LAUNCH_RETRO.md"];
    writeState(postLaunchManualLoopComplete, state);
    setPostLaunchLive(postLaunchManualLoopComplete, 10);
    recordSuccessfulManualLoop(postLaunchManualLoopComplete);
  }
  runFixture("post-launch applicable automation with a successful manual-loop row passes", postLaunchManualLoopComplete, "check-post-launch-ops.ts", 0);

  const postLaunchManualLoopEmpty = makeFixture("post-launch-manual-loop-empty");
  {
    const state = readState(postLaunchManualLoopEmpty);
    expectRecord(state.project, "project")["phase"] = "phase_6b";
    const lane = getLane(state, "post_launch_ops");
    lane["status"] = "succeeded";
    lane["evidence"] = ["operations/POST_LAUNCH_OPS.md", "operations/LAUNCH_RETRO.md"];
    writeState(postLaunchManualLoopEmpty, state);
    setPostLaunchLive(postLaunchManualLoopEmpty, 10);
    setManualLoopApplicability(postLaunchManualLoopEmpty, "applicable");
  }
  runFixture(
    "post-launch applicable automation without a successful manual-loop row fails",
    postLaunchManualLoopEmpty,
    "check-post-launch-ops.ts",
    1,
    "post_launch_ops.manual_loop_proof_missing",
  );

  const postLaunchManualLoopNegated = makeFixture("post-launch-manual-loop-negated-success");
  {
    const state = readState(postLaunchManualLoopNegated);
    expectRecord(state.project, "project")["phase"] = "phase_6b";
    const lane = getLane(state, "post_launch_ops");
    lane["status"] = "succeeded";
    lane["evidence"] = ["operations/POST_LAUNCH_OPS.md", "operations/LAUNCH_RETRO.md"];
    writeState(postLaunchManualLoopNegated, state);
    setPostLaunchLive(postLaunchManualLoopNegated, 10);
    recordSuccessfulManualLoop(postLaunchManualLoopNegated);
    const runbookPath = path.join(postLaunchManualLoopNegated, "operations/POST_LAUNCH_OPS.md");
    writeFileSync(runbookPath, readFileSync(runbookPath, "utf8").replace("| passed | $0 |", "| not completed because the export failed | $0 |"), "utf8");
  }
  runFixture(
    "manual-loop result text cannot negate a success keyword and still pass",
    postLaunchManualLoopNegated,
    "check-post-launch-ops.ts",
    1,
    "post_launch_ops.manual_loop_proof_missing",
  );

  const postLaunchManualLoopUndecided = makeFixture("post-launch-manual-loop-undecided");
  {
    const state = readState(postLaunchManualLoopUndecided);
    expectRecord(state.project, "project")["phase"] = "phase_6b";
    const lane = getLane(state, "post_launch_ops");
    lane["status"] = "succeeded";
    lane["evidence"] = ["operations/POST_LAUNCH_OPS.md", "operations/LAUNCH_RETRO.md"];
    writeState(postLaunchManualLoopUndecided, state);
    setPostLaunchLive(postLaunchManualLoopUndecided, 10);
  }
  runFixture(
    "post-launch manual-loop proof without an applicability decision fails",
    postLaunchManualLoopUndecided,
    "check-post-launch-ops.ts",
    1,
    "post_launch_ops.manual_loop_applicability_missing",
  );

  const postLaunchManualLoopPhraseOnly = makeCompletedPostLaunchFixture("post-launch-manual-loop-phrase-only");
  {
    setManualLoopApplicability(postLaunchManualLoopPhraseOnly, "not applicable — No value-producing process is scheduled for automation.");
    const runbookPath = path.join(postLaunchManualLoopPhraseOnly, "operations/POST_LAUNCH_OPS.md");
    const runbook = readFileSync(runbookPath, "utf8").replace("## Manual Loop Proof", "Manual Loop Proof is documented below.");
    writeFileSync(runbookPath, runbook, "utf8");
  }
  runFixture(
    "a prose-only Manual Loop Proof phrase cannot replace the required H2 section",
    postLaunchManualLoopPhraseOnly,
    "check-post-launch-ops.ts",
    1,
    "post_launch_ops.section_missing.manual_loop_proof",
  );

  const postLaunchManualLoopMissing = makeCompletedPostLaunchFixture("post-launch-manual-loop-missing");
  {
    const runbookPath = path.join(postLaunchManualLoopMissing, "operations/POST_LAUNCH_OPS.md");
    const runbook = readFileSync(runbookPath, "utf8").replace(/## Manual Loop Proof[\s\S]*?(?=## Support Operations)/, "");
    writeFileSync(runbookPath, runbook, "utf8");
  }
  runFixture(
    "a missing Manual Loop Proof section fails",
    postLaunchManualLoopMissing,
    "check-post-launch-ops.ts",
    1,
    "post_launch_ops.section_missing.manual_loop_proof",
  );

  const postLaunchManualLoopEmptySection = makeCompletedPostLaunchFixture("post-launch-manual-loop-empty-section");
  {
    const runbookPath = path.join(postLaunchManualLoopEmptySection, "operations/POST_LAUNCH_OPS.md");
    const runbook = readFileSync(runbookPath, "utf8").replace(/## Manual Loop Proof[\s\S]*?(?=## Support Operations)/, "## Manual Loop Proof\n\n");
    writeFileSync(runbookPath, runbook, "utf8");
  }
  runFixture(
    "an empty Manual Loop Proof section fails",
    postLaunchManualLoopEmptySection,
    "check-post-launch-ops.ts",
    1,
    "post_launch_ops.manual_loop_proof_missing",
  );

  const postLaunchManualLoopDuplicate = makeCompletedPostLaunchFixture("post-launch-manual-loop-duplicate");
  {
    setManualLoopApplicability(postLaunchManualLoopDuplicate, "not applicable — No value-producing process is scheduled for automation.");
    const runbookPath = path.join(postLaunchManualLoopDuplicate, "operations/POST_LAUNCH_OPS.md");
    const runbook = readFileSync(runbookPath, "utf8").replace(
      "## Support Operations",
      "## Manual Loop Proof\n\nApplicability: not applicable — No value-producing process is scheduled for automation.\n\n## Support Operations",
    );
    writeFileSync(runbookPath, runbook, "utf8");
  }
  runFixture(
    "duplicate Manual Loop Proof sections fail instead of selecting the first",
    postLaunchManualLoopDuplicate,
    "check-post-launch-ops.ts",
    1,
    "post_launch_ops.manual_loop_proof_missing",
  );

  const postLaunchManualLoopMalformedLater = makeCompletedPostLaunchFixture("post-launch-manual-loop-malformed-later-row");
  {
    recordSuccessfulManualLoop(postLaunchManualLoopMalformedLater);
    const runbookPath = path.join(postLaunchManualLoopMalformedLater, "operations/POST_LAUNCH_OPS.md");
    const runbook = readFileSync(runbookPath, "utf8").replace(
      "| keep manual until three clean weekly runs |",
      "| keep manual until three clean weekly runs |\n" +
        `| ${isoDaysAgo(1)} | renewal reminder send | 12 opted-in reminders | 11 delivered reminders | unknown | $0 | one address rejected | keep manual |`,
    );
    writeFileSync(runbookPath, runbook, "utf8");
  }
  runFixture(
    "a valid manual-loop row cannot hide a malformed later declared row",
    postLaunchManualLoopMalformedLater,
    "check-post-launch-ops.ts",
    1,
    "post_launch_ops.manual_loop_proof_missing",
  );

  const postLaunchManualLoopContradictoryApplicability = makeCompletedPostLaunchFixture("post-launch-manual-loop-contradictory-applicability");
  {
    setManualLoopApplicability(postLaunchManualLoopContradictoryApplicability, "not applicable — No value-producing process is scheduled for automation.");
    const runbookPath = path.join(postLaunchManualLoopContradictoryApplicability, "operations/POST_LAUNCH_OPS.md");
    const runbook = readFileSync(runbookPath, "utf8").replace(
      "Applicability: not applicable — No value-producing process is scheduled for automation.",
      "Applicability: not applicable — No value-producing process is scheduled for automation.\nApplicability: applicable",
    );
    writeFileSync(runbookPath, runbook, "utf8");
  }
  runFixture(
    "contradictory rendered Manual Loop applicability declarations fail closed",
    postLaunchManualLoopContradictoryApplicability,
    "check-post-launch-ops.ts",
    1,
    "post_launch_ops.manual_loop_applicability_missing",
  );

  const postLaunchManualLoopDuplicateApplicability = makeCompletedPostLaunchFixture("post-launch-manual-loop-duplicate-applicability");
  {
    setManualLoopApplicability(postLaunchManualLoopDuplicateApplicability, "not applicable — No value-producing process is scheduled for automation.");
    const runbookPath = path.join(postLaunchManualLoopDuplicateApplicability, "operations/POST_LAUNCH_OPS.md");
    const runbook = readFileSync(runbookPath, "utf8").replace(
      "Applicability: not applicable — No value-producing process is scheduled for automation.",
      "Applicability: not applicable — No value-producing process is scheduled for automation.\n" +
        "Applicability: not applicable — The same process was declared twice by mistake.",
    );
    writeFileSync(runbookPath, runbook, "utf8");
  }
  runFixture(
    "duplicate rendered Manual Loop applicability declarations fail even when they agree",
    postLaunchManualLoopDuplicateApplicability,
    "check-post-launch-ops.ts",
    1,
    "post_launch_ops.manual_loop_applicability_missing",
  );

  const postLaunchManualLoopMalformedDuplicateApplicability = makeCompletedPostLaunchFixture("post-launch-manual-loop-malformed-duplicate-applicability");
  {
    setManualLoopApplicability(postLaunchManualLoopMalformedDuplicateApplicability, "not applicable — No value-producing process is scheduled for automation.");
    const runbookPath = path.join(postLaunchManualLoopMalformedDuplicateApplicability, "operations/POST_LAUNCH_OPS.md");
    const runbook = readFileSync(runbookPath, "utf8").replace(
      "Applicability: not applicable — No value-producing process is scheduled for automation.",
      "Applicability: not applicable — No value-producing process is scheduled for automation.\n  Applicability should be applicable",
    );
    writeFileSync(runbookPath, runbook, "utf8");
  }
  runFixture(
    "a malformed indented applicability candidate cannot hide behind an earlier valid declaration",
    postLaunchManualLoopMalformedDuplicateApplicability,
    "check-post-launch-ops.ts",
    1,
    "post_launch_ops.manual_loop_applicability_missing",
  );

  const postLaunchManualLoopFencedApplicabilityExample = makeCompletedPostLaunchFixture("post-launch-manual-loop-fenced-applicability-example");
  {
    setManualLoopApplicability(postLaunchManualLoopFencedApplicabilityExample, "not applicable — No value-producing process is scheduled for automation.");
    const runbookPath = path.join(postLaunchManualLoopFencedApplicabilityExample, "operations/POST_LAUNCH_OPS.md");
    const runbook = readFileSync(runbookPath, "utf8").replace(
      "Applicability: not applicable — No value-producing process is scheduled for automation.",
      "Applicability: not applicable — No value-producing process is scheduled for automation.\n\n```markdown\nApplicability: applicable\n```",
    );
    writeFileSync(runbookPath, runbook, "utf8");
  }
  runFixture(
    "a fenced Manual Loop applicability example does not duplicate the rendered declaration",
    postLaunchManualLoopFencedApplicabilityExample,
    "check-post-launch-ops.ts",
    0,
  );

  const postLaunchManualLoopFailedAutomation = makeCompletedPostLaunchFixture("post-launch-manual-loop-failed-automation");
  {
    recordSuccessfulManualLoop(postLaunchManualLoopFailedAutomation);
    const runbookPath = path.join(postLaunchManualLoopFailedAutomation, "operations/POST_LAUNCH_OPS.md");
    const runbook = readFileSync(runbookPath, "utf8").replace(
      "| keep manual until three clean weekly runs |",
      "| keep manual until three clean weekly runs |\n" +
        `| ${isoDaysAgo(1)} | renewal export | 25 renewals | 19 exported | failed | $0 | six records rejected | automate renewal export now |`,
    );
    writeFileSync(runbookPath, runbook, "utf8");
  }
  runFixture(
    "an unrelated passed run cannot authorize automation for a failed process",
    postLaunchManualLoopFailedAutomation,
    "check-post-launch-ops.ts",
    1,
    "post_launch_ops.manual_loop_proof_missing",
  );

  const postLaunchManualLoopFailedKeptManual = makeCompletedPostLaunchFixture("post-launch-manual-loop-failed-kept-manual");
  {
    recordSuccessfulManualLoop(postLaunchManualLoopFailedKeptManual);
    const runbookPath = path.join(postLaunchManualLoopFailedKeptManual, "operations/POST_LAUNCH_OPS.md");
    const runbook = readFileSync(runbookPath, "utf8").replace(
      "| keep manual until three clean weekly runs |",
      "| automate the renewal reminder send |\n" +
        `| ${isoDaysAgo(1)} | renewal export | 25 renewals | 19 exported | failed | $0 | six records rejected | keep manual until a retry passes |`,
    );
    writeFileSync(runbookPath, runbook, "utf8");
  }
  runFixture("a passed process may automate while a failed process stays manual", postLaunchManualLoopFailedKeptManual, "check-post-launch-ops.ts", 0);

  const postLaunchManualLoopAmbiguousDecision = makeCompletedPostLaunchFixture("post-launch-manual-loop-ambiguous-decision");
  {
    recordSuccessfulManualLoop(postLaunchManualLoopAmbiguousDecision);
    const runbookPath = path.join(postLaunchManualLoopAmbiguousDecision, "operations/POST_LAUNCH_OPS.md");
    const runbook = readFileSync(runbookPath, "utf8").replace("keep manual until three clean weekly runs", "do not automate until three clean weekly runs");
    writeFileSync(runbookPath, runbook, "utf8");
  }
  runFixture(
    "an ambiguous free-form Automation decision fails closed",
    postLaunchManualLoopAmbiguousDecision,
    "check-post-launch-ops.ts",
    1,
    "post_launch_ops.manual_loop_proof_missing",
  );

  const postLaunchManualLoopLaterFailedAutomation = makeCompletedPostLaunchFixture("post-launch-manual-loop-later-failed-automation");
  {
    recordSuccessfulManualLoop(postLaunchManualLoopLaterFailedAutomation);
    const runbookPath = path.join(postLaunchManualLoopLaterFailedAutomation, "operations/POST_LAUNCH_OPS.md");
    const runbook = readFileSync(runbookPath, "utf8").replace(
      "| keep manual until three clean weekly runs |",
      "| keep manual until three clean weekly runs |\n" +
        `| ${isoDaysAgo(1)} | renewal reminder send | 12 opted-in reminders | 8 delivered | failed | $0 | four addresses rejected | automate the next reminder send |`,
    );
    writeFileSync(runbookPath, runbook, "utf8");
  }
  runFixture(
    "an earlier passed run cannot excuse a later failed automation decision for the same process",
    postLaunchManualLoopLaterFailedAutomation,
    "check-post-launch-ops.ts",
    1,
    "post_launch_ops.manual_loop_proof_missing",
  );

  const postLaunchManualLoopPassedAutomation = makeCompletedPostLaunchFixture("post-launch-manual-loop-passed-automation");
  {
    recordSuccessfulManualLoop(postLaunchManualLoopPassedAutomation);
    const runbookPath = path.join(postLaunchManualLoopPassedAutomation, "operations/POST_LAUNCH_OPS.md");
    const runbook = readFileSync(runbookPath, "utf8").replace("keep manual until three clean weekly runs", "automate the renewal reminder send");
    writeFileSync(runbookPath, runbook, "utf8");
  }
  runFixture("a passed process may carry an explicit automation decision", postLaunchManualLoopPassedAutomation, "check-post-launch-ops.ts", 0);

  const postLaunchManualLoopNestedFence = makeCompletedPostLaunchFixture("post-launch-manual-loop-nested-fence");
  {
    const runbookPath = path.join(postLaunchManualLoopNestedFence, "operations/POST_LAUNCH_OPS.md");
    const nestedExample = [
      "## Manual Loop Proof",
      "",
      "Applicability: applicable",
      "",
      "- Example only:",
      "    ```markdown",
      "    | Date | Process | Input | Output | Result | Cost | Failure mode | Automation decision |",
      "    | --- | --- | --- | --- | --- | --- | --- | --- |",
      `    | ${isoDaysAgo(2)} | renewal reminder send | 18 reminders | 18 delivered | passed | $0 | two stale addresses | keep manual |`,
      "    ```",
      "",
    ].join("\n");
    const runbook = readFileSync(runbookPath, "utf8").replace(/## Manual Loop Proof[\s\S]*?(?=## Support Operations)/, nestedExample);
    writeFileSync(runbookPath, runbook, "utf8");
  }
  runFixture(
    "a table example inside a list-nested fence cannot satisfy Manual Loop Proof",
    postLaunchManualLoopNestedFence,
    "check-post-launch-ops.ts",
    1,
    "post_launch_ops.manual_loop_proof_missing",
  );

  const postLaunchManualLoopListMarkerFence = makeCompletedPostLaunchFixture("post-launch-manual-loop-list-marker-fence");
  {
    const runbookPath = path.join(postLaunchManualLoopListMarkerFence, "operations/POST_LAUNCH_OPS.md");
    const nestedExample = [
      "## Manual Loop Proof",
      "",
      "Applicability: applicable",
      "",
      "- ```markdown",
      "  | Date | Process | Input | Output | Result | Cost | Failure mode | Automation decision |",
      "  | --- | --- | --- | --- | --- | --- | --- | --- |",
      `  | ${isoDaysAgo(2)} | renewal reminder send | 18 reminders | 18 delivered | passed | $0 | two stale addresses | keep manual |`,
      "  ```",
      "",
    ].join("\n");
    const runbook = readFileSync(runbookPath, "utf8").replace(/## Manual Loop Proof[\s\S]*?(?=## Support Operations)/, nestedExample);
    writeFileSync(runbookPath, runbook, "utf8");
  }
  runFixture(
    "a table inside a fence opened on a list-marker line cannot satisfy Manual Loop Proof",
    postLaunchManualLoopListMarkerFence,
    "check-post-launch-ops.ts",
    1,
    "post_launch_ops.manual_loop_proof_missing",
  );

  const postLaunchManualLoopIndentedListFence = makeCompletedPostLaunchFixture("post-launch-manual-loop-indented-list-fence");
  recordSuccessfulManualLoop(postLaunchManualLoopIndentedListFence);
  replaceManualLoopSection(postLaunchManualLoopIndentedListFence, (section) => `- Context\n\n  \`\`\`text\n  Hidden example\n<script>\n\`\`\`\n${section}`);
  runFixture(
    "a list-continuation fence cannot hide raw HTML and make later Manual Loop evidence appear valid",
    postLaunchManualLoopIndentedListFence,
    "check-post-launch-ops.ts",
    1,
    "post_launch_ops.manual_loop_proof_missing",
  );

  for (const [name, prefix] of [
    ["two-space", ">  "],
    ["three-space", ">   "],
    ["four-space", ">    "],
    ["tab", ">\t"],
  ]) {
    const root = makeCompletedPostLaunchFixture(`post-launch-manual-loop-${name}-quote-fence`);
    recordSuccessfulManualLoop(root);
    replaceManualLoopSection(root, (section) => `${section}\n${prefix}\`\`\`text\n${prefix}hidden example\n${prefix}\`\`\``);
    runFixture(
      `a blockquote-relative fence with ${name} content spacing invalidates strict Manual Loop evidence`,
      root,
      "check-post-launch-ops.ts",
      1,
      "post_launch_ops.manual_loop_proof_missing",
    );
  }

  for (const [name, prefix] of [
    ["two-space", ">  "],
    ["three-space", ">   "],
    ["four-space", ">    "],
    ["tab", ">\t"],
  ]) {
    const root = makeCompletedPostLaunchFixture(`post-launch-manual-loop-${name}-quote-html`);
    recordSuccessfulManualLoop(root);
    replaceManualLoopSection(root, (section) => `${section}\n${prefix}<script type="text/plain">`);
    runFixture(
      `blockquote-relative raw HTML with ${name} content spacing invalidates strict Manual Loop evidence`,
      root,
      "check-post-launch-ops.ts",
      1,
      "post_launch_ops.manual_loop_proof_missing",
    );
  }

  const postLaunchManualLoopNestedContainerHtml = makeCompletedPostLaunchFixture("post-launch-manual-loop-nested-container-html");
  recordSuccessfulManualLoop(postLaunchManualLoopNestedContainerHtml);
  replaceManualLoopSection(
    postLaunchManualLoopNestedContainerHtml,
    (section) => `${section}\n>  - <script type="text/plain">\n>  - hidden example\n>  - </script>`,
  );
  runFixture(
    "nested container-relative raw HTML invalidates strict Manual Loop evidence",
    postLaunchManualLoopNestedContainerHtml,
    "check-post-launch-ops.ts",
    1,
    "post_launch_ops.manual_loop_proof_missing",
  );

  const postLaunchManualLoopDeepContainerHtml = makeCompletedPostLaunchFixture("post-launch-manual-loop-deep-container-html");
  recordSuccessfulManualLoop(postLaunchManualLoopDeepContainerHtml);
  replaceManualLoopSection(postLaunchManualLoopDeepContainerHtml, (section) => `${section}\n${"> ".repeat(33)}<script>`);
  runFixture(
    "deeply nested container-relative raw HTML has no strict-dialect escape hatch",
    postLaunchManualLoopDeepContainerHtml,
    "check-post-launch-ops.ts",
    1,
    "post_launch_ops.manual_loop_proof_missing",
  );

  const postLaunchManualLoopIndentedCode = makeCompletedPostLaunchFixture("post-launch-manual-loop-indented-code-table");
  {
    const runbookPath = path.join(postLaunchManualLoopIndentedCode, "operations/POST_LAUNCH_OPS.md");
    const indentedExample = [
      "## Manual Loop Proof",
      "",
      "Applicability: applicable",
      "",
      "    | Date | Process | Input | Output | Result | Cost | Failure mode | Automation decision |",
      "    | --- | --- | --- | --- | --- | --- | --- | --- |",
      `    | ${isoDaysAgo(2)} | renewal reminder send | 18 reminders | 18 delivered | passed | $0 | two stale addresses | keep manual |`,
      "",
    ].join("\n");
    const runbook = readFileSync(runbookPath, "utf8").replace(/## Manual Loop Proof[\s\S]*?(?=## Support Operations)/, indentedExample);
    writeFileSync(runbookPath, runbook, "utf8");
  }
  runFixture(
    "an indented code-block table cannot satisfy Manual Loop Proof",
    postLaunchManualLoopIndentedCode,
    "check-post-launch-ops.ts",
    1,
    "post_launch_ops.manual_loop_proof_missing",
  );

  const postLaunchManualLoopInvalidFenceInfo = makeCompletedPostLaunchFixture("post-launch-manual-loop-invalid-fence-info");
  {
    recordSuccessfulManualLoop(postLaunchManualLoopInvalidFenceInfo);
    const runbookPath = path.join(postLaunchManualLoopInvalidFenceInfo, "operations/POST_LAUNCH_OPS.md");
    const runbook = readFileSync(runbookPath, "utf8").replace("## Manual Loop Proof", "```example`invalid\n## Manual Loop Proof");
    writeFileSync(runbookPath, runbook, "utf8");
  }
  runFixture(
    "an invalid backtick info string does not hide a real Manual Loop Proof section",
    postLaunchManualLoopInvalidFenceInfo,
    "check-post-launch-ops.ts",
    0,
  );

  for (const [name, opening, closing] of [
    ["script", '<script type="text/plain">', "</script>"],
    ["style", '<style type="text/plain">', "</style>"],
    ["template", "<template>", "</template>"],
    ["pre", "<pre>", "</pre>"],
    ["textarea", "<textarea>", "</textarea>"],
    ["processing instruction", "<?b2c-proof", "?>"],
    ["declaration", "<!FORMATION-PROOF", ">"],
    ["CDATA", "<![CDATA[", "]]>"],
    ["block container", "<div>", "</div>"],
    ["less-common block container", '<iframe title="proof">', "</iframe>"],
    ["custom element", "<x-b2c-proof>", "</x-b2c-proof>"],
    ["custom element with a quoted angle bracket", '<x-b2c-proof data-label="a > b">', "</x-b2c-proof>"],
  ] as const) {
    const root = makeCompletedPostLaunchFixture(`post-launch-manual-loop-raw-html-${name.replace(/\s+/g, "-")}`);
    setManualLoopApplicability(root, "not applicable — No value-producing process is scheduled for automation.");
    replaceManualLoopSection(root, (section) => `${opening}\n${section}${closing}\n`);
    runFixture(
      `a Manual Loop Proof section inside a raw HTML ${name} block is not rendered evidence`,
      root,
      "check-post-launch-ops.ts",
      1,
      "post_launch_ops.manual_loop_proof_missing",
    );
  }

  for (const [name, opener, prefix] of [
    ["list", '- <script type="text/plain">', "  "],
    ["blockquote", '> <script type="text/plain">', "> "],
  ] as const) {
    const root = makeCompletedPostLaunchFixture(`post-launch-manual-loop-container-raw-html-${name}`);
    setManualLoopApplicability(root, "not applicable — No value-producing process is scheduled for automation.");
    replaceManualLoopSection(root, (section) => {
      const nestedSection = section
        .trimEnd()
        .split("\n")
        .map((line) => `${prefix}${line}`)
        .join("\n");
      return `${opener}\n${nestedSection}\n${prefix}</script>\n`;
    });
    runFixture(
      `a Manual Loop Proof section inside a ${name}-container raw HTML block is not rendered evidence`,
      root,
      "check-post-launch-ops.ts",
      1,
      "post_launch_ops.manual_loop_proof_missing",
    );
  }

  for (const [name, opener] of [
    ["script", "<script><!-- explanatory note -->"],
    ["block container", "<div><!-- explanatory note -->"],
  ] as const) {
    const root = makeCompletedPostLaunchFixture(`post-launch-manual-loop-raw-html-commented-${name.replace(/\s+/g, "-")}`);
    setManualLoopApplicability(root, "not applicable — No value-producing process is scheduled for automation.");
    replaceManualLoopSection(root, (section) => `${opener}\n${section}`);
    runFixture(
      `a same-line closed comment cannot prevent a raw HTML ${name} opener from hiding Manual Loop evidence`,
      root,
      "check-post-launch-ops.ts",
      1,
      "post_launch_ops.manual_loop_proof_missing",
    );
  }

  const postLaunchManualLoopScriptTable = makeCompletedPostLaunchFixture("post-launch-manual-loop-script-table");
  {
    setManualLoopApplicability(postLaunchManualLoopScriptTable, "not applicable — No value-producing process is scheduled for automation.");
    const runbookPath = path.join(postLaunchManualLoopScriptTable, "operations/POST_LAUNCH_OPS.md");
    const table =
      "| Date | Process | Input | Output | Result | Cost | Failure mode | Automation decision |\n" + "| --- | --- | --- | --- | --- | --- | --- | --- |";
    const runbook = replaceTableBlock(readFileSync(runbookPath, "utf8"), table, `<script type="text/plain">\n${table}\n</script>`);
    writeFileSync(runbookPath, runbook, "utf8");
  }
  runFixture(
    "a table inside a script block cannot satisfy a live Manual Loop Proof section",
    postLaunchManualLoopScriptTable,
    "check-post-launch-ops.ts",
    1,
    "post_launch_ops.manual_loop_proof_missing",
  );

  const postLaunchManualLoopScriptApplicability = makeCompletedPostLaunchFixture("post-launch-manual-loop-script-applicability");
  {
    setManualLoopApplicability(postLaunchManualLoopScriptApplicability, "not applicable — No value-producing process is scheduled for automation.");
    const runbookPath = path.join(postLaunchManualLoopScriptApplicability, "operations/POST_LAUNCH_OPS.md");
    const declaration = "Applicability: not applicable — No value-producing process is scheduled for automation.";
    const runbook = readFileSync(runbookPath, "utf8").replace(declaration, `<script type="text/plain">\n${declaration}\n</script>`);
    writeFileSync(runbookPath, runbook, "utf8");
  }
  runFixture(
    "an applicability declaration inside a script block cannot exempt a live Manual Loop Proof section",
    postLaunchManualLoopScriptApplicability,
    "check-post-launch-ops.ts",
    1,
    "post_launch_ops.manual_loop_proof_missing",
  );

  const postLaunchManualLoopIndentedApplicability = makeCompletedPostLaunchFixture("post-launch-manual-loop-indented-applicability");
  {
    setManualLoopApplicability(postLaunchManualLoopIndentedApplicability, "not applicable — No value-producing process is scheduled for automation.");
    const runbookPath = path.join(postLaunchManualLoopIndentedApplicability, "operations/POST_LAUNCH_OPS.md");
    const declaration = "Applicability: not applicable — No value-producing process is scheduled for automation.";
    const runbook = readFileSync(runbookPath, "utf8").replace(declaration, `    ${declaration}`);
    writeFileSync(runbookPath, runbook, "utf8");
  }
  runFixture(
    "an applicability declaration rendered as indented code cannot exempt Manual Loop Proof",
    postLaunchManualLoopIndentedApplicability,
    "check-post-launch-ops.ts",
    1,
    "post_launch_ops.manual_loop_proof_missing",
  );

  for (const [name, prefix] of [
    ["an H2", "## Manual Loop Proof"],
    ["a closed fence", "## Manual Loop Proof\n\n```text\nHidden example\n```"],
  ] as const) {
    const root = makeCompletedPostLaunchFixture(`post-launch-manual-loop-indented-applicability-after-${name.replace(/\s+/g, "-")}`);
    replaceManualLoopSection(root, () =>
      [
        prefix,
        "    Applicability: not applicable — No value-producing process is scheduled for automation.",
        "",
        "| Date | Process | Input | Output | Result | Cost | Failure mode | Automation decision |",
        "| --- | --- | --- | --- | --- | --- | --- | --- |",
        "",
      ].join("\n"),
    );
    runFixture(
      `indented-code applicability immediately after ${name} cannot exempt Manual Loop Proof`,
      root,
      "check-post-launch-ops.ts",
      1,
      "post_launch_ops.manual_loop_proof_missing",
    );
  }

  const postLaunchManualLoopSelfClosingScript = makeCompletedPostLaunchFixture("post-launch-manual-loop-self-closing-script");
  setManualLoopApplicability(postLaunchManualLoopSelfClosingScript, "not applicable — No value-producing process is scheduled for automation.");
  replaceManualLoopSection(postLaunchManualLoopSelfClosingScript, (section) => `<script/>\n${section}`);
  runFixture(
    "a Manual Loop section in a self-closing script-name HTML block is not rendered evidence",
    postLaunchManualLoopSelfClosingScript,
    "check-post-launch-ops.ts",
    1,
    "post_launch_ops.manual_loop_proof_missing",
  );

  const postLaunchManualLoopInlineHtmlMention = makeCompletedPostLaunchFixture("post-launch-manual-loop-inline-html-mention");
  recordSuccessfulManualLoop(postLaunchManualLoopInlineHtmlMention);
  replaceManualLoopSection(postLaunchManualLoopInlineHtmlMention, (section) =>
    section.replace("Applicability: applicable", "Applicability: applicable\n\nContext: a literal `<script>` mention is inline prose, not a raw HTML block."),
  );
  runFixture("an inline raw-HTML tag mention does not hide later Manual Loop evidence", postLaunchManualLoopInlineHtmlMention, "check-post-launch-ops.ts", 0);

  const postLaunchManualLoopFencedHtmlOpener = makeCompletedPostLaunchFixture("post-launch-manual-loop-fenced-html-opener");
  recordSuccessfulManualLoop(postLaunchManualLoopFencedHtmlOpener);
  replaceManualLoopSection(postLaunchManualLoopFencedHtmlOpener, (section) =>
    section.replace("Applicability: applicable", 'Applicability: applicable\n\n```html\n<script type="text/plain">\n## Hidden example\n```'),
  );
  runFixture("a raw-HTML opener inside a fence does not hide later Manual Loop evidence", postLaunchManualLoopFencedHtmlOpener, "check-post-launch-ops.ts", 0);

  const postLaunchManualLoopHtmlComment = makeCompletedPostLaunchFixture("post-launch-manual-loop-html-comment");
  recordSuccessfulManualLoop(postLaunchManualLoopHtmlComment);
  replaceManualLoopSection(postLaunchManualLoopHtmlComment, (section) => `<!-- unsupported evidence syntax -->\n${section}`);
  runFixture(
    "a block-position HTML comment invalidates a strict Manual Loop evidence document",
    postLaunchManualLoopHtmlComment,
    "check-post-launch-ops.ts",
    1,
    "post_launch_ops.manual_loop_proof_missing",
  );

  const postLaunchManualLoopInlineComment = makeCompletedPostLaunchFixture("post-launch-manual-loop-inline-comment");
  recordSuccessfulManualLoop(postLaunchManualLoopInlineComment);
  replaceManualLoopSection(postLaunchManualLoopInlineComment, (section) =>
    section.replace("Applicability: applicable", "Context <!--\nApplicability: applicable\n-->"),
  );
  runFixture(
    "an inline HTML comment cannot hide the only Manual Loop applicability declaration",
    postLaunchManualLoopInlineComment,
    "check-post-launch-ops.ts",
    1,
    "post_launch_ops.manual_loop_proof_missing",
  );

  const postLaunchManualLoopUnclosedHtml = makeCompletedPostLaunchFixture("post-launch-manual-loop-unclosed-html");
  setManualLoopApplicability(postLaunchManualLoopUnclosedHtml, "not applicable — No value-producing process is scheduled for automation.");
  replaceManualLoopSection(postLaunchManualLoopUnclosedHtml, (section) => `<script type="text/plain">\n${section}`);
  runFixture(
    "an unclosed raw HTML block hides Manual Loop evidence through end of file",
    postLaunchManualLoopUnclosedHtml,
    "check-post-launch-ops.ts",
    1,
    "post_launch_ops.manual_loop_proof_missing",
  );

  const postLaunchManualLoopNotApplicableMalformed = makeCompletedPostLaunchFixture("post-launch-manual-loop-not-applicable-malformed-row");
  {
    setManualLoopApplicability(postLaunchManualLoopNotApplicableMalformed, "not applicable — No value-producing process is scheduled for automation.");
    const runbookPath = path.join(postLaunchManualLoopNotApplicableMalformed, "operations/POST_LAUNCH_OPS.md");
    const runbook = replaceTableBlock(
      readFileSync(runbookPath, "utf8"),
      "| Date | Process | Input | Output | Result | Cost | Failure mode | Automation decision |\n| --- | --- | --- | --- | --- | --- | --- | --- |",
      "| Date | Process | Input | Output | Result | Cost | Failure mode | Automation decision |\n| --- | --- | --- | --- | --- | --- | --- | --- |\n| 2999-01-01 | reminder send | real input | real output | maybe | $0 | none | do not automate |",
    );
    writeFileSync(runbookPath, runbook, "utf8");
  }
  runFixture(
    "not-applicable prose cannot hide a malformed declared manual-loop row",
    postLaunchManualLoopNotApplicableMalformed,
    "check-post-launch-ops.ts",
    1,
    "post_launch_ops.manual_loop_proof_missing",
  );

  // The live date is the anchor for every due-date and freshness gate; a live
  // app with no recorded live_since has no clock, so nothing can ever be overdue.
  const postLaunchNoLiveDate = makeFixture("post-launch-live-date-missing");
  {
    const state = readState(postLaunchNoLiveDate);
    const lane = getLane(state, "post_launch_ops");
    lane["status"] = "succeeded";
    lane["evidence"] = ["operations/POST_LAUNCH_OPS.md", "operations/LAUNCH_RETRO.md"];
    writeState(postLaunchNoLiveDate, state);
  }
  runFixture("post-launch done without a live_since date fails", postLaunchNoLiveDate, "check-post-launch-ops.ts", 1, "post_launch_ops.live_since_missing");

  // A typo'd calendar value (2026-99-99) must not silently disarm the clock:
  // Invalid Date math would turn every overdue comparison into NaN === false.
  const postLaunchBadLiveDate = makeFixture("post-launch-live-date-invalid");
  {
    const state = readState(postLaunchBadLiveDate);
    const lane = getLane(state, "post_launch_ops");
    lane["status"] = "succeeded";
    lane["evidence"] = ["operations/POST_LAUNCH_OPS.md", "operations/LAUNCH_RETRO.md"];
    lane["live_since"] = "2026-99-99";
    writeState(postLaunchBadLiveDate, state);
  }
  runFixture("post-launch done with an invalid live_since fails", postLaunchBadLiveDate, "check-post-launch-ops.ts", 1, "post_launch_ops.live_since_missing");

  // A forward-dated launch (negative days live) would suppress every gate too.
  const postLaunchFutureLiveDate = makeFixture("post-launch-live-date-future");
  {
    const state = readState(postLaunchFutureLiveDate);
    const lane = getLane(state, "post_launch_ops");
    lane["status"] = "succeeded";
    lane["evidence"] = ["operations/POST_LAUNCH_OPS.md", "operations/LAUNCH_RETRO.md"];
    lane["live_since"] = isoDaysAgo(-30);
    writeState(postLaunchFutureLiveDate, state);
  }
  runFixture("post-launch done with a future live_since fails", postLaunchFutureLiveDate, "check-post-launch-ops.ts", 1, "post_launch_ops.live_since_missing");

  // A phase_6 project cannot dodge the numbers by leaving the lane partial:
  // the launch-and-vanish repos observed in the wild never marked the lane done.
  const postLaunchPhaseVanish = makeFixture("post-launch-phase-vanish");
  {
    const state = readState(postLaunchPhaseVanish);
    expectRecord(state.project, "project")["phase"] = "phase_6";
    const lane = getLane(state, "post_launch_ops");
    lane["status"] = "running";
    writeState(postLaunchPhaseVanish, state);
    setPostLaunchLive(postLaunchPhaseVanish, 20);
  }
  runFixture(
    "post-launch phase with a partial lane and an empty weekly log fails",
    postLaunchPhaseVanish,
    "check-post-launch-ops.ts",
    1,
    "post_launch_ops.weekly_log_missing",
  );

  const postLaunchNoRunbook = makeFixture("post-launch-no-runbook");
  {
    const state = readState(postLaunchNoRunbook);
    expectRecord(state.project, "project")["phase"] = "phase_6";
    writeState(postLaunchNoRunbook, state);
    rmSync(path.join(postLaunchNoRunbook, "operations/POST_LAUNCH_OPS.md"));
  }
  runFixture("post-launch phase without runbook fails", postLaunchNoRunbook, "check-post-launch-ops.ts", 1, "post_launch_ops.runbook_missing");

  const postLaunchNoRetro = makeFixture("post-launch-no-retro");
  {
    const state = readState(postLaunchNoRetro);
    const lane = getLane(state, "post_launch_ops");
    lane["status"] = "succeeded";
    lane["evidence"] = ["operations/POST_LAUNCH_OPS.md"];
    writeState(postLaunchNoRetro, state);
    setPostLaunchLive(postLaunchNoRetro, 10);
    rmSync(path.join(postLaunchNoRetro, "operations/LAUNCH_RETRO.md"));
  }
  runFixture("post-launch done without launch retro fails", postLaunchNoRetro, "check-post-launch-ops.ts", 1, "post_launch_ops.launch_retro_missing");

  // A retro with no whole-app verdict surface is the zombie-app setup: the
  // weekly rhythm runs forever and no checkpoint ever asks kill, hold, or scale.
  const postLaunchNoVerdict = makeFixture("post-launch-retro-no-verdict");
  {
    const state = readState(postLaunchNoVerdict);
    const lane = getLane(state, "post_launch_ops");
    lane["status"] = "succeeded";
    lane["evidence"] = ["operations/POST_LAUNCH_OPS.md", "operations/LAUNCH_RETRO.md"];
    writeState(postLaunchNoVerdict, state);
    setPostLaunchLive(postLaunchNoVerdict, 10);
    writeFileSync(
      path.join(postLaunchNoVerdict, "operations/LAUNCH_RETRO.md"),
      ["# Launch Retro", "", "## Lane Usage", "", "## Stalls And Blockers", "", "## Surprises", "", "## Failure Card Candidates"].join("\n"),
      "utf8",
    );
  }
  runFixture(
    "post-launch done with a retro missing the kill-or-scale verdict fails",
    postLaunchNoVerdict,
    "check-post-launch-ops.ts",
    1,
    "post_launch_ops.kill_or_scale_missing",
  );

  // Mentioning the phrase in prose is not the section: only the real heading
  // (and its table) counts as the verdict surface.
  const postLaunchProsePhrase = makeFixture("post-launch-retro-prose-phrase-only");
  {
    const state = readState(postLaunchProsePhrase);
    const lane = getLane(state, "post_launch_ops");
    lane["status"] = "succeeded";
    lane["evidence"] = ["operations/POST_LAUNCH_OPS.md", "operations/LAUNCH_RETRO.md"];
    writeState(postLaunchProsePhrase, state);
    setPostLaunchLive(postLaunchProsePhrase, 10);
    writeFileSync(
      path.join(postLaunchProsePhrase, "operations/LAUNCH_RETRO.md"),
      ["# Launch Retro", "", "## Surprises", "", "We should think about kill, hold, or scale at some point.", "", "## Failure Card Candidates"].join("\n"),
      "utf8",
    );
  }
  runFixture(
    "retro mentioning the verdict phrase in prose without the section fails",
    postLaunchProsePhrase,
    "check-post-launch-ops.ts",
    1,
    "post_launch_ops.kill_or_scale_missing",
  );

  // The heading alone is words-not-work: once the Retro Window records a
  // completed Day 30/Day 90 pass, the checkpoint's verdict row and the state
  // mirror must both carry the decision.
  const postLaunchVerdictEmpty = makeFixture("post-launch-checkpoint-verdict-empty");
  {
    const state = readState(postLaunchVerdictEmpty);
    const lane = getLane(state, "post_launch_ops");
    lane["status"] = "succeeded";
    lane["evidence"] = ["operations/POST_LAUNCH_OPS.md", "operations/LAUNCH_RETRO.md"];
    writeState(postLaunchVerdictEmpty, state);
    setPostLaunchLive(postLaunchVerdictEmpty, 40);
    appendWeeklyLogRow(postLaunchVerdictEmpty, { daysAgo: 3 });
    completeCheckpoint(postLaunchVerdictEmpty, "Day 30", { daysAgo: 8, verdict: "" });
  }
  runFixture(
    "completed day-30 checkpoint with an empty verdict row fails",
    postLaunchVerdictEmpty,
    "check-post-launch-ops.ts",
    1,
    "post_launch_ops.kill_or_scale_verdict_unfilled",
  );

  const postLaunchVerdictNoState = makeFixture("post-launch-verdict-without-decision");
  {
    const state = readState(postLaunchVerdictNoState);
    const lane = getLane(state, "post_launch_ops");
    lane["status"] = "succeeded";
    lane["evidence"] = ["operations/POST_LAUNCH_OPS.md", "operations/LAUNCH_RETRO.md"];
    writeState(postLaunchVerdictNoState, state);
    setPostLaunchLive(postLaunchVerdictNoState, 40);
    appendWeeklyLogRow(postLaunchVerdictNoState, { daysAgo: 3 });
    completeCheckpoint(postLaunchVerdictNoState, "Day 30", { daysAgo: 8, verdict: "Hold" });
  }
  runFixture(
    "recorded verdict without a reducer-owned decision fails",
    postLaunchVerdictNoState,
    "check-post-launch-ops.ts",
    1,
    "post_launch_ops.kill_or_scale_state_missing",
  );

  const postLaunchVerdictComplete = makeFixture("post-launch-verdict-complete");
  {
    const state = readState(postLaunchVerdictComplete);
    const lane = getLane(state, "post_launch_ops");
    lane["status"] = "succeeded";
    lane["evidence"] = ["operations/POST_LAUNCH_OPS.md", "operations/LAUNCH_RETRO.md"];
    lane["kill_or_scale_decision"] = "hold";
    lane["kill_or_scale_decided_at"] = isoDaysAgo(8);
    writeState(postLaunchVerdictComplete, state);
    setPostLaunchLive(postLaunchVerdictComplete, 40);
    appendWeeklyLogRow(postLaunchVerdictComplete, { daysAgo: 3 });
    writeOperatingLaneArtifacts(postLaunchVerdictComplete);
    completeCheckpoint(postLaunchVerdictComplete, "Day 30", {
      daysAgo: 8,
      verdict: "Hold — flat but positive, low founder cost",
      evidence: ["$412 MRR, flat 4 wks", "D7 31% → 29% → 31%", "n/a — organic only", "6"],
    });
    setManualLoopApplicability(postLaunchVerdictComplete, "not applicable — No value-producing process is scheduled for automation.");
  }
  runFixture("completed checkpoint with verdict and state mirror passes", postLaunchVerdictComplete, "check-post-launch-ops.ts", 0);

  // ── The operating lanes' own artifacts (support / retention / finance) ─────
  // One green control past the two-week stand-up window, then one broken rule
  // per case — a gate is real only once it has been watched to fail.

  const laneArtifactFixture = (name: string, overrides: Parameters<typeof writeOperatingLaneArtifacts>[1] = {}, skipArtifacts = false): string => {
    const root = makeFixture(name);
    const state = readState(root);
    expectRecord(state.project, "project")["phase"] = "phase_6b";
    const lane = getLane(state, "post_launch_ops");
    lane["status"] = "running";
    writeState(root, state);
    setPostLaunchLive(root, 20);
    appendWeeklyLogRow(root, { daysAgo: 3 });
    setManualLoopApplicability(root, "not applicable — No value-producing process is scheduled for automation.");
    if (!skipArtifacts) writeOperatingLaneArtifacts(root, overrides);
    return root;
  };

  runFixture("operating lanes: all three artifacts valid past two weeks passes", laneArtifactFixture("lanes-green"), "check-post-launch-ops.ts", 0);
  runFixture(
    "operating lanes: a live app with no support runbook fails",
    laneArtifactFixture("lanes-none", {}, true),
    "check-post-launch-ops.ts",
    1,
    "post_launch_ops.lane_artifact_missing.support",
  );
  runFixture(
    "support: no stated SLA fails",
    laneArtifactFixture("lanes-support-sla", {
      support: `# Support Operations\n\n| Date | Open tickets | Oldest ticket age | Shipped/escalated |\n| --- | --- | --- | --- |\n| ${isoDaysAgo(3)} | 2 | 1 day | FAQ updated |\n`,
    }),
    "check-post-launch-ops.ts",
    1,
    "post_launch_ops.support_sla_missing",
  );
  runFixture(
    "support: a stale queue row fails",
    laneArtifactFixture("lanes-support-stale", {
      support: `# Support Operations\n\nResponse SLA: 24 hours.\n\n| Date | Open tickets | Oldest ticket age | Shipped/escalated |\n| --- | --- | --- | --- |\n| ${isoDaysAgo(20)} | 2 | 1 day | FAQ updated |\n`,
    }),
    "check-post-launch-ops.ts",
    1,
    "post_launch_ops.support_log_stale",
  );
  runFixture(
    "support: an uncounted or placeholder queue row fails",
    laneArtifactFixture("lanes-support-placeholder", {
      support: `# Support Operations\n\nResponse SLA: 24 hours.\n\n| Date | Open tickets | Oldest ticket age | Shipped/escalated |\n| --- | --- | --- | --- |\n| ${isoDaysAgo(3)} | TBD | pending | inbox fine |\n`,
    }),
    "check-post-launch-ops.ts",
    1,
    "post_launch_ops.support_numbers_missing",
  );
  runFixture(
    "retention: no named cohort source fails",
    laneArtifactFixture("lanes-retention-source", {
      retention: `# Retention Program\n\n| Date | D7 | D30 | Involuntary churn |\n| --- | --- | --- | --- |\n| ${isoDaysAgo(3)} | 31% | 12% | 2 recovered |\n\n## Intervention\n\n| Date | Intervention | Result |\n| --- | --- | --- |\n| ${isoDaysAgo(3)} | win-back email | +2% D7 |\n`,
    }),
    "check-post-launch-ops.ts",
    1,
    "post_launch_ops.retention_cohort_source_missing",
  );
  runFixture(
    "retention: adjectives instead of measured cohort values fail",
    laneArtifactFixture("lanes-retention-adjectives", {
      retention: `# Retention Program\n\nCohort source: PostHog cohorts plus RevenueCat renewals.\n\n| Date | D7 | D30 | Involuntary churn |\n| --- | --- | --- | --- |\n| ${isoDaysAgo(3)} | holding | fine | seems normal |\n\n## Intervention\n\n| Date | Intervention | Result |\n| --- | --- | --- |\n| ${isoDaysAgo(3)} | none | — |\n`,
    }),
    "check-post-launch-ops.ts",
    1,
    "post_launch_ops.retention_numbers_missing",
  );
  runFixture(
    "retention: no intervention log fails",
    laneArtifactFixture("lanes-retention-intervention", {
      retention: `# Retention Program\n\nCohort source: PostHog cohorts plus RevenueCat renewals.\n\n| Date | D7 | D30 | Involuntary churn |\n| --- | --- | --- | --- |\n| ${isoDaysAgo(3)} | 31% | 12% | 2 recovered |\n`,
    }),
    "check-post-launch-ops.ts",
    1,
    "post_launch_ops.retention_intervention_missing",
  );
  runFixture(
    "finance: no MRR-labeled dollar amount fails",
    laneArtifactFixture("lanes-finance-mrr", {
      finance: `# Financial Pulse\n\n| Date | MRR | Spend | Runway |\n| --- | --- | --- | --- |\n| ${isoDaysAgo(3)} | growing nicely | $95/mo | runway 14 months |\n`,
    }),
    "check-post-launch-ops.ts",
    1,
    "post_launch_ops.finance_mrr_missing",
  );
  runFixture(
    "finance: no runway or burn statement fails",
    laneArtifactFixture("lanes-finance-runway", {
      finance: `# Financial Pulse\n\n| Date | MRR | Spend |\n| --- | --- | --- |\n| ${isoDaysAgo(3)} | MRR $412 | $95/mo tools |\n`,
    }),
    "check-post-launch-ops.ts",
    1,
    "post_launch_ops.finance_runway_missing",
  );
  runFixture(
    "finance: a stale pulse row fails",
    laneArtifactFixture("lanes-finance-stale", {
      finance: `# Financial Pulse\n\n| Date | MRR | Spend | Runway |\n| --- | --- | --- | --- |\n| ${isoDaysAgo(20)} | MRR $412 | $95/mo tools | runway 14 months |\n`,
    }),
    "check-post-launch-ops.ts",
    1,
    "post_launch_ops.finance_log_stale",
  );

  // A verdict without its evidence pack is a mood, not a decision.
  const postLaunchVerdictNoEvidence = makeFixture("post-launch-verdict-without-evidence");
  {
    const state = readState(postLaunchVerdictNoEvidence);
    const lane = getLane(state, "post_launch_ops");
    lane["status"] = "succeeded";
    lane["evidence"] = ["operations/POST_LAUNCH_OPS.md", "operations/LAUNCH_RETRO.md"];
    lane["kill_or_scale_decision"] = "hold";
    lane["kill_or_scale_decided_at"] = isoDaysAgo(8);
    writeState(postLaunchVerdictNoEvidence, state);
    setPostLaunchLive(postLaunchVerdictNoEvidence, 40);
    appendWeeklyLogRow(postLaunchVerdictNoEvidence, { daysAgo: 3 });
    const retro = replaceTableBlock(
      replaceTableBlock(
        readFileSync(path.join(postLaunchVerdictNoEvidence, "operations/LAUNCH_RETRO.md"), "utf8"),
        "| Day 30 | | |",
        `| Day 30 | ${isoDaysAgo(8)} | founder |`,
      ),
      "| Day 30 | | | | | | |",
      "| Day 30 | | | | | Hold | |",
    );
    writeFileSync(path.join(postLaunchVerdictNoEvidence, "operations/LAUNCH_RETRO.md"), retro, "utf8");
  }
  runFixture(
    "verdict recorded without the evidence pack fails",
    postLaunchVerdictNoEvidence,
    "check-post-launch-ops.ts",
    1,
    "post_launch_ops.kill_or_scale_evidence_unfilled",
  );

  // The clueless-clothing miss: every evidence cell filled with "unverified —
  // confirm in RevenueCat". Non-empty placeholder text is still not a number.
  const postLaunchEvidencePlaceholder = makeFixture("post-launch-evidence-placeholder");
  {
    const state = readState(postLaunchEvidencePlaceholder);
    const lane = getLane(state, "post_launch_ops");
    lane["status"] = "succeeded";
    lane["evidence"] = ["operations/POST_LAUNCH_OPS.md", "operations/LAUNCH_RETRO.md"];
    lane["kill_or_scale_decision"] = "hold";
    lane["kill_or_scale_decided_at"] = isoDaysAgo(8);
    writeState(postLaunchEvidencePlaceholder, state);
    setPostLaunchLive(postLaunchEvidencePlaceholder, 40);
    appendWeeklyLogRow(postLaunchEvidencePlaceholder, { daysAgo: 3 });
    completeCheckpoint(postLaunchEvidencePlaceholder, "Day 30", {
      daysAgo: 8,
      verdict: "Hold",
      evidence: ["unverified — confirm in RevenueCat", "unverified — confirm in PostHog", "n/a", "8"],
    });
  }
  runFixture(
    "evidence cells filled with unverified placeholders fail",
    postLaunchEvidencePlaceholder,
    "check-post-launch-ops.ts",
    1,
    "post_launch_ops.kill_or_scale_evidence_placeholder",
  );

  // The state mirror must agree with the latest completed checkpoint's verdict.
  const postLaunchVerdictMismatch = makeFixture("post-launch-verdict-state-mismatch");
  {
    const state = readState(postLaunchVerdictMismatch);
    const lane = getLane(state, "post_launch_ops");
    lane["status"] = "succeeded";
    lane["evidence"] = ["operations/POST_LAUNCH_OPS.md", "operations/LAUNCH_RETRO.md"];
    lane["kill_or_scale_decision"] = "scale";
    lane["kill_or_scale_decided_at"] = isoDaysAgo(8);
    writeState(postLaunchVerdictMismatch, state);
    setPostLaunchLive(postLaunchVerdictMismatch, 40);
    appendWeeklyLogRow(postLaunchVerdictMismatch, { daysAgo: 3 });
    completeCheckpoint(postLaunchVerdictMismatch, "Day 30", { daysAgo: 8, verdict: "Hold" });
  }
  runFixture(
    "state mirror disagreeing with the retro verdict fails",
    postLaunchVerdictMismatch,
    "check-post-launch-ops.ts",
    1,
    "post_launch_ops.kill_or_scale_state_mismatch",
  );

  // The zombie dodge the day-30 gate cannot see: never complete the checkpoint
  // at all. Once the app has been live past the due date plus grace, an
  // untouched Retro Window row is itself the failure.
  const postLaunchDay30Overdue = makeFixture("post-launch-day30-overdue");
  {
    const state = readState(postLaunchDay30Overdue);
    const lane = getLane(state, "post_launch_ops");
    lane["status"] = "succeeded";
    lane["evidence"] = ["operations/POST_LAUNCH_OPS.md", "operations/LAUNCH_RETRO.md"];
    writeState(postLaunchDay30Overdue, state);
    setPostLaunchLive(postLaunchDay30Overdue, 45);
    appendWeeklyLogRow(postLaunchDay30Overdue, { daysAgo: 3 });
  }
  runFixture(
    "day-30 checkpoint never completed past its due date fails",
    postLaunchDay30Overdue,
    "check-post-launch-ops.ts",
    1,
    "post_launch_ops.checkpoint_overdue.day_30",
  );

  // Launch-and-vanish in its purest form: live past two weeks, weekly log empty.
  const postLaunchWeeklyMissing = makeFixture("post-launch-weekly-log-missing");
  {
    const state = readState(postLaunchWeeklyMissing);
    const lane = getLane(state, "post_launch_ops");
    lane["status"] = "succeeded";
    lane["evidence"] = ["operations/POST_LAUNCH_OPS.md", "operations/LAUNCH_RETRO.md"];
    writeState(postLaunchWeeklyMissing, state);
    setPostLaunchLive(postLaunchWeeklyMissing, 20);
  }
  runFixture(
    "live past two weeks with an empty weekly log fails",
    postLaunchWeeklyMissing,
    "check-post-launch-ops.ts",
    1,
    "post_launch_ops.weekly_log_missing",
  );

  const postLaunchWeeklyStale = makeFixture("post-launch-weekly-log-stale");
  {
    const state = readState(postLaunchWeeklyStale);
    const lane = getLane(state, "post_launch_ops");
    lane["status"] = "succeeded";
    lane["evidence"] = ["operations/POST_LAUNCH_OPS.md", "operations/LAUNCH_RETRO.md"];
    lane["kill_or_scale_decision"] = "hold";
    lane["kill_or_scale_decided_at"] = isoDaysAgo(10);
    writeState(postLaunchWeeklyStale, state);
    setPostLaunchLive(postLaunchWeeklyStale, 45);
    appendWeeklyLogRow(postLaunchWeeklyStale, { daysAgo: 20 });
    completeCheckpoint(postLaunchWeeklyStale, "Day 30", {
      daysAgo: 10,
      verdict: "Hold",
      evidence: ["$210 MRR, flat", "D7 24% stable", "n/a — organic only", "5"],
    });
  }
  runFixture("latest weekly log row older than two weeks fails", postLaunchWeeklyStale, "check-post-launch-ops.ts", 1, "post_launch_ops.weekly_log_stale");

  // A fresh row whose metric cells hold adjectives or "unverified" instead of
  // numbers is the metrics-theater variant of the same miss.
  const postLaunchWeeklyPlaceholder = makeFixture("post-launch-weekly-numbers-placeholder");
  {
    const state = readState(postLaunchWeeklyPlaceholder);
    const lane = getLane(state, "post_launch_ops");
    lane["status"] = "succeeded";
    lane["evidence"] = ["operations/POST_LAUNCH_OPS.md", "operations/LAUNCH_RETRO.md"];
    writeState(postLaunchWeeklyPlaceholder, state);
    setPostLaunchLive(postLaunchWeeklyPlaceholder, 20);
    appendWeeklyLogRow(postLaunchWeeklyPlaceholder, { daysAgo: 2, crashFree: "unverified", d7: "looks fine" });
  }
  runFixture("weekly log row without real numbers fails", postLaunchWeeklyPlaceholder, "check-post-launch-ops.ts", 1, "post_launch_ops.weekly_numbers_missing");

  // A recycled pre-launch date in the Retro Window is not a completion: the
  // window is anchored to live_since, so a date before launch suppresses nothing.
  const postLaunchPrelaunchDate = makeFixture("post-launch-checkpoint-prelaunch-date");
  {
    const state = readState(postLaunchPrelaunchDate);
    const lane = getLane(state, "post_launch_ops");
    lane["status"] = "succeeded";
    lane["evidence"] = ["operations/POST_LAUNCH_OPS.md", "operations/LAUNCH_RETRO.md"];
    writeState(postLaunchPrelaunchDate, state);
    setPostLaunchLive(postLaunchPrelaunchDate, 45);
    appendWeeklyLogRow(postLaunchPrelaunchDate, { daysAgo: 3 });
    const retroPath = path.join(postLaunchPrelaunchDate, "operations/LAUNCH_RETRO.md");
    writeFileSync(retroPath, replaceTableBlock(readFileSync(retroPath, "utf8"), "| Day 30 | | |", `| Day 30 | ${isoDaysAgo(60)} | founder |`), "utf8");
  }
  runFixture(
    "checkpoint dated before the launch does not suppress the overdue error",
    postLaunchPrelaunchDate,
    "check-post-launch-ops.ts",
    1,
    "post_launch_ops.checkpoint_overdue.day_30",
  );

  // Every evidence column is typed: founder hours must be a number, not prose.
  const postLaunchKillHoursAdjective = makeFixture("post-launch-kill-hours-adjective");
  {
    const state = readState(postLaunchKillHoursAdjective);
    const lane = getLane(state, "post_launch_ops");
    lane["status"] = "succeeded";
    lane["evidence"] = ["operations/POST_LAUNCH_OPS.md", "operations/LAUNCH_RETRO.md"];
    lane["kill_or_scale_decision"] = "kill";
    lane["kill_or_scale_decided_at"] = isoDaysAgo(25);
    writeState(postLaunchKillHoursAdjective, state);
    setPostLaunchLive(postLaunchKillHoursAdjective, 120);
    completeCheckpoint(postLaunchKillHoursAdjective, "Day 30", { daysAgo: 88, verdict: "Fix" });
    completeCheckpoint(postLaunchKillHoursAdjective, "Day 90", {
      daysAgo: 25,
      verdict: "Kill",
      evidence: ["$60 MRR declining 4 wks", "D30 4% two cohorts", "n/a — organic only", "looks healthy"],
    });
  }
  runFixture(
    "kill verdict with prose in the founder-hours cell neither exempts nor passes",
    postLaunchKillHoursAdjective,
    "check-post-launch-ops.ts",
    1,
    "post_launch_ops.kill_or_scale_evidence_unmeasured",
  );

  // A blocker with an impossible embedded date is a placeholder in disguise.
  const postLaunchBogusBlocker = makeFixture("post-launch-weekly-bogus-blocker");
  {
    const state = readState(postLaunchBogusBlocker);
    const lane = getLane(state, "post_launch_ops");
    lane["status"] = "succeeded";
    lane["evidence"] = ["operations/POST_LAUNCH_OPS.md", "operations/LAUNCH_RETRO.md"];
    writeState(postLaunchBogusBlocker, state);
    setPostLaunchLive(postLaunchBogusBlocker, 20);
    appendWeeklyLogRow(postLaunchBogusBlocker, { daysAgo: 2, crashFree: "blocked: Sentry auth 2026-99-99" });
  }
  runFixture(
    "weekly blocker with an impossible date fails the measured-value bar",
    postLaunchBogusBlocker,
    "check-post-launch-ops.ts",
    1,
    "post_launch_ops.weekly_numbers_missing",
  );

  // Adjectives in the verdict evidence pack are not measurements: a Kill row
  // reading "declining / bad" must neither earn the wind-down exemption nor
  // pass the substance bar.
  const postLaunchKillAdjectives = makeFixture("post-launch-kill-adjective-evidence");
  {
    const state = readState(postLaunchKillAdjectives);
    const lane = getLane(state, "post_launch_ops");
    lane["status"] = "succeeded";
    lane["evidence"] = ["operations/POST_LAUNCH_OPS.md", "operations/LAUNCH_RETRO.md"];
    lane["kill_or_scale_decision"] = "kill";
    lane["kill_or_scale_decided_at"] = isoDaysAgo(25);
    writeState(postLaunchKillAdjectives, state);
    setPostLaunchLive(postLaunchKillAdjectives, 120);
    completeCheckpoint(postLaunchKillAdjectives, "Day 30", { daysAgo: 88, verdict: "Fix" });
    completeCheckpoint(postLaunchKillAdjectives, "Day 90", {
      daysAgo: 25,
      verdict: "Kill",
      evidence: ["declining", "bad", "n/a", "8"],
    });
  }
  runFixture(
    "kill verdict over adjective evidence neither exempts nor passes substance",
    postLaunchKillAdjectives,
    "check-post-launch-ops.ts",
    1,
    "post_launch_ops.kill_or_scale_evidence_unmeasured",
  );

  // A dollar amount that is not MRR does not satisfy the revenue contract.
  const postLaunchWrongMoney = makeFixture("post-launch-weekly-wrong-money");
  {
    const state = readState(postLaunchWrongMoney);
    const lane = getLane(state, "post_launch_ops");
    lane["status"] = "succeeded";
    lane["evidence"] = ["operations/POST_LAUNCH_OPS.md", "operations/LAUNCH_RETRO.md"];
    writeState(postLaunchWrongMoney, state);
    setPostLaunchLive(postLaunchWrongMoney, 20);
    appendWeeklyLogRow(postLaunchWrongMoney, { daysAgo: 2, notes: "ad spend $500 this week" });
  }
  runFixture("weekly Notes with a non-MRR dollar amount fails", postLaunchWrongMoney, "check-post-launch-ops.ts", 1, "post_launch_ops.weekly_revenue_missing");

  // The wind-down exemption must be earned: a one-string state edit
  // (kill_or_scale_decision: kill) with no dated mirror and no Kill verdict in
  // the retro must not skip the weekly and checkpoint gates.
  const postLaunchKillStringOnly = makeFixture("post-launch-kill-string-only");
  {
    const state = readState(postLaunchKillStringOnly);
    const lane = getLane(state, "post_launch_ops");
    lane["status"] = "succeeded";
    lane["evidence"] = ["operations/POST_LAUNCH_OPS.md", "operations/LAUNCH_RETRO.md"];
    lane["kill_or_scale_decision"] = "kill";
    writeState(postLaunchKillStringOnly, state);
    setPostLaunchLive(postLaunchKillStringOnly, 20);
  }
  runFixture(
    "kill decision without a dated mirror and retro verdict does not exempt the gates",
    postLaunchKillStringOnly,
    "check-post-launch-ops.ts",
    1,
    "post_launch_ops.weekly_log_missing",
  );

  // A Kill verdict typed into the verdict table without the Retro Window ever
  // recording a completed checkpoint is still a dodge: the exemption requires
  // the checkpoint to have actually happened.
  const postLaunchKillNoCheckpoint = makeFixture("post-launch-kill-uncompleted-checkpoint");
  {
    const state = readState(postLaunchKillNoCheckpoint);
    expectRecord(state.project, "project")["phase"] = "phase_6";
    const lane = getLane(state, "post_launch_ops");
    lane["status"] = "running";
    lane["kill_or_scale_decision"] = "kill";
    lane["kill_or_scale_decided_at"] = isoDaysAgo(10);
    writeState(postLaunchKillNoCheckpoint, state);
    setPostLaunchLive(postLaunchKillNoCheckpoint, 120);
    const retroPath = path.join(postLaunchKillNoCheckpoint, "operations/LAUNCH_RETRO.md");
    const retro = readFileSync(retroPath, "utf8").replace(
      "| Day 90 | | | | | | |",
      "| Day 90 | $60 MRR declining | D30 under 5% | n/a — organic only | 8 | Kill | |",
    );
    writeFileSync(retroPath, retro, "utf8");
  }
  runFixture(
    "kill verdict without a completed retro checkpoint does not exempt the gates",
    postLaunchKillNoCheckpoint,
    "check-post-launch-ops.ts",
    1,
    "post_launch_ops.checkpoint_overdue.day_30",
  );

  // "TBD" or an impossible value in the Date cell is not a completed checkpoint.
  const postLaunchCheckpointTbd = makeFixture("post-launch-checkpoint-tbd-date");
  {
    const state = readState(postLaunchCheckpointTbd);
    expectRecord(state.project, "project")["phase"] = "phase_6";
    const lane = getLane(state, "post_launch_ops");
    lane["status"] = "running";
    writeState(postLaunchCheckpointTbd, state);
    setPostLaunchLive(postLaunchCheckpointTbd, 45);
    appendWeeklyLogRow(postLaunchCheckpointTbd, { daysAgo: 3 });
    const retroPath = path.join(postLaunchCheckpointTbd, "operations/LAUNCH_RETRO.md");
    writeFileSync(retroPath, replaceTableBlock(readFileSync(retroPath, "utf8"), "| Day 30 | | |", "| Day 30 | TBD | founder |"), "utf8");
  }
  runFixture(
    "TBD in the checkpoint date cell does not suppress the overdue error",
    postLaunchCheckpointTbd,
    "check-post-launch-ops.ts",
    1,
    "post_launch_ops.checkpoint_overdue.day_30",
  );

  // A future-dated weekly row must not anchor the freshness math.
  const postLaunchWeeklyFutureRow = makeFixture("post-launch-weekly-future-row");
  {
    const state = readState(postLaunchWeeklyFutureRow);
    const lane = getLane(state, "post_launch_ops");
    lane["status"] = "succeeded";
    lane["evidence"] = ["operations/POST_LAUNCH_OPS.md", "operations/LAUNCH_RETRO.md"];
    lane["kill_or_scale_decision"] = "hold";
    lane["kill_or_scale_decided_at"] = isoDaysAgo(8);
    writeState(postLaunchWeeklyFutureRow, state);
    setPostLaunchLive(postLaunchWeeklyFutureRow, 45);
    appendWeeklyLogRow(postLaunchWeeklyFutureRow, { daysAgo: -5 });
    completeCheckpoint(postLaunchWeeklyFutureRow, "Day 30", {
      daysAgo: 8,
      verdict: "Hold",
      evidence: ["$310 MRR, flat", "D7 27% stable", "n/a — organic only", "5"],
    });
  }
  runFixture(
    "a future-dated weekly row does not satisfy the freshness gate",
    postLaunchWeeklyFutureRow,
    "check-post-launch-ops.ts",
    1,
    "post_launch_ops.weekly_log_missing",
  );

  // The substance bar travels with the phase: a live app whose lane is still
  // partial cannot record a checkpoint date over an empty verdict row.
  const postLaunchPhaseEmptyVerdict = makeFixture("post-launch-phase-checkpoint-empty-verdict");
  {
    const state = readState(postLaunchPhaseEmptyVerdict);
    expectRecord(state.project, "project")["phase"] = "phase_6";
    const lane = getLane(state, "post_launch_ops");
    lane["status"] = "running";
    writeState(postLaunchPhaseEmptyVerdict, state);
    setPostLaunchLive(postLaunchPhaseEmptyVerdict, 45);
    appendWeeklyLogRow(postLaunchPhaseEmptyVerdict, { daysAgo: 3 });
    const retroPath = path.join(postLaunchPhaseEmptyVerdict, "operations/LAUNCH_RETRO.md");
    writeFileSync(retroPath, replaceTableBlock(readFileSync(retroPath, "utf8"), "| Day 30 | | |", `| Day 30 | ${isoDaysAgo(10)} | founder |`), "utf8");
  }
  runFixture(
    "live phase with a completed checkpoint over an empty verdict row fails",
    postLaunchPhaseEmptyVerdict,
    "check-post-launch-ops.ts",
    1,
    "post_launch_ops.kill_or_scale_verdict_unfilled",
  );

  // Rates without dollars are not a metrics review: the Notes cell carries MRR.
  const postLaunchWeeklyNoRevenue = makeFixture("post-launch-weekly-no-revenue");
  {
    const state = readState(postLaunchWeeklyNoRevenue);
    const lane = getLane(state, "post_launch_ops");
    lane["status"] = "succeeded";
    lane["evidence"] = ["operations/POST_LAUNCH_OPS.md", "operations/LAUNCH_RETRO.md"];
    writeState(postLaunchWeeklyNoRevenue, state);
    setPostLaunchLive(postLaunchWeeklyNoRevenue, 20);
    appendWeeklyLogRow(postLaunchWeeklyNoRevenue, { daysAgo: 2, notes: "quiet week" });
  }
  runFixture(
    "weekly row without an MRR figure in Notes fails",
    postLaunchWeeklyNoRevenue,
    "check-post-launch-ops.ts",
    1,
    "post_launch_ops.weekly_revenue_missing",
  );

  // Incidental digits inside adjectives are not measured values.
  const postLaunchWeeklyAdjective = makeFixture("post-launch-weekly-adjective-numbers");
  {
    const state = readState(postLaunchWeeklyAdjective);
    const lane = getLane(state, "post_launch_ops");
    lane["status"] = "succeeded";
    lane["evidence"] = ["operations/POST_LAUNCH_OPS.md", "operations/LAUNCH_RETRO.md"];
    writeState(postLaunchWeeklyAdjective, state);
    setPostLaunchLive(postLaunchWeeklyAdjective, 20);
    appendWeeklyLogRow(postLaunchWeeklyAdjective, { daysAgo: 2, crashFree: "iOS 17 looks fine", d7: "D7 looks fine 4 sure" });
  }
  runFixture(
    "adjectives with incidental digits fail the measured-value bar",
    postLaunchWeeklyAdjective,
    "check-post-launch-ops.ts",
    1,
    "post_launch_ops.weekly_numbers_missing",
  );

  // A recorded Kill verdict is the one legitimate way for the rhythm to stop:
  // wind-down quiet must not read as launch-and-vanish.
  const postLaunchKilledQuiet = makeFixture("post-launch-killed-app-quiet");
  {
    const state = readState(postLaunchKilledQuiet);
    const lane = getLane(state, "post_launch_ops");
    lane["status"] = "succeeded";
    lane["evidence"] = ["operations/POST_LAUNCH_OPS.md", "operations/LAUNCH_RETRO.md"];
    lane["kill_or_scale_decision"] = "kill";
    lane["kill_or_scale_decided_at"] = isoDaysAgo(25);
    writeState(postLaunchKilledQuiet, state);
    setPostLaunchLive(postLaunchKilledQuiet, 120);
    completeCheckpoint(postLaunchKilledQuiet, "Day 30", {
      daysAgo: 88,
      verdict: "Fix",
      evidence: ["$95 MRR declining", "D7 18% → 14%", "n/a — organic only", "9"],
    });
    completeCheckpoint(postLaunchKilledQuiet, "Day 90", {
      daysAgo: 25,
      verdict: "Kill",
      evidence: ["$60 MRR declining 4 wks", "D30 under 5% two cohorts", "n/a — organic only", "8"],
    });
    setManualLoopApplicability(postLaunchKilledQuiet, "not applicable — This business is in wind-down and schedules no value-producing automation.");
  }
  runFixture("killed app in wind-down with a quiet weekly log passes", postLaunchKilledQuiet, "check-post-launch-ops.ts", 0);

  // ── Portfolio registry ────────────────────────────────────────────────────

  // Optional surface: single-business founders have no registry and stay clean.
  const portfolioAbsent = makeEmptyFixture("portfolio-registry-absent");
  runFixture("missing portfolio registry is a clean no-op", portfolioAbsent, "check-portfolio-registry.ts", 0);

  // Once the registry exists it must carry the whole board, not just app rows.
  const portfolioThin = makeEmptyFixture("portfolio-registry-thin");
  writeFileSync(
    path.join(portfolioThin, "strategy/PORTFOLIO_REGISTRY.md"),
    ["# Portfolio Registry", "", "## Businesses", "", "| Business | Repo | Stage |", "| --- | --- | --- |", "| Ocho | ~/code/rork-ocho | live |"].join("\n"),
    "utf8",
  );
  runFixture(
    "portfolio registry without allocation, learnings, and pipeline fails",
    portfolioThin,
    "check-portfolio-registry.ts",
    1,
    "portfolio_registry.section_missing.allocation",
  );

  // A board with every heading and zero real business rows is a blank board
  // claiming to exist — token presence is not substance. The shipped template
  // stays inert through its _example:_ row, exercised by the audit-plan step.
  const portfolioBlank = makeEmptyFixture("portfolio-registry-blank-board");
  writeFileSync(
    path.join(portfolioBlank, "strategy/PORTFOLIO_REGISTRY.md"),
    [
      "# Portfolio Registry",
      "",
      "## Businesses",
      "",
      "| Business | Repo | Stage | MRR (trend) | Last verdict (date) |",
      "| --- | --- | --- | --- | --- |",
      "",
      "## Allocation",
      "",
      "Hours go where the verdicts point.",
      "",
      "## Cross-App Learnings",
      "",
      "| Learning | Source app | Date | Applied where next |",
      "| --- | --- | --- | --- |",
      "",
      "## Next Launch Pipeline",
      "",
      "| Idea | Evidence so far | Starts when |",
      "| --- | --- | --- |",
    ].join("\n"),
    "utf8",
  );
  runFixture(
    "portfolio registry with headings but no business rows fails",
    portfolioBlank,
    "check-portfolio-registry.ts",
    1,
    "portfolio_registry.businesses_empty",
  );

  const portfolioFilled = makeEmptyFixture("portfolio-registry-filled");
  const shippedPortfolio = readFileSync(path.join(skillRoot, "examples", "workspace", "business", "strategy/PORTFOLIO_REGISTRY.md"), "utf8");
  writeFileSync(
    path.join(portfolioFilled, "strategy/PORTFOLIO_REGISTRY.md"),
    shippedPortfolio.replace(
      /\| _example: Ocho_[^\n]*\n/,
      "| Ocho | ~/code/rork-ocho | 2026-05-29 | live | $180 flat | hold (2026-06-28) | 8 | day-90 retro |\n",
    ),
    "utf8",
  );
  runFixture("portfolio registry with a real business row passes", portfolioFilled, "check-portfolio-registry.ts", 0);

  const postLaunchThin = makeFixture("post-launch-thin-runbook");
  {
    const state = readState(postLaunchThin);
    const lane = getLane(state, "post_launch_ops");
    lane["status"] = "succeeded";
    lane["evidence"] = ["operations/POST_LAUNCH_OPS.md", "operations/LAUNCH_RETRO.md"];
    writeState(postLaunchThin, state);
    setPostLaunchLive(postLaunchThin, 10);
    writeFileSync(
      path.join(postLaunchThin, "operations/POST_LAUNCH_OPS.md"),
      ["# Post-Launch Operations", "We will check Sentry sometimes and reply to reviews when there is time."].join("\n"),
      "utf8",
    );
  }
  runFixture("post-launch done with thin runbook fails", postLaunchThin, "check-post-launch-ops.ts", 1, "post_launch_ops.section_missing");

  // ── Backend data contract ─────────────────────────────────────────────────

  function setEngineeringDone(root: string): void {
    const state = readState(root);
    const lane = getLane(state, "engineering");
    lane["status"] = "succeeded";
    lane["evidence"] = ["engineering/TECH_SPEC.md", "engineering/ENGINEERING_PLAN.md", "engineering/PRODUCTION_READINESS.md"];
    writeState(root, state);
  }

  const backendComplete = makeFixture("backend-contract-complete");
  setEngineeringDone(backendComplete);
  runFixture("engineering done with template data contract passes", backendComplete, "check-backend-data-contract.ts", 0);

  const backendNoSection = makeFixture("backend-contract-no-section");
  setEngineeringDone(backendNoSection);
  writeFileSync(
    path.join(backendNoSection, "engineering/TECH_SPEC.md"),
    ["# Tech Spec", "Implementation contracts are traced from state/LAUNCH_TRACE.md; schema lives wherever the builder put it."].join("\n"),
    "utf8",
  );
  runFixture("engineering done without data contract section fails", backendNoSection, "check-backend-data-contract.ts", 1, "backend_contract.section_missing");

  const backendNoSpec = makeFixture("backend-contract-no-spec");
  setEngineeringDone(backendNoSpec);
  rmSync(path.join(backendNoSpec, "engineering/TECH_SPEC.md"));
  runFixture("engineering done without tech spec fails", backendNoSpec, "check-backend-data-contract.ts", 1, "backend_contract.tech_spec_missing");

  // Words-vs-work grounding: naming RLS in prose is not tested authorization.
  const backendUntestedAuth = makeFixture("backend-contract-untested-auth");
  setEngineeringDone(backendUntestedAuth);
  writeFileSync(
    path.join(backendUntestedAuth, "engineering/TECH_SPEC.md"),
    [
      "# Tech Spec",
      "## Data Contract",
      "### Backend Selection",
      "supabase — chosen for the archetype starter default.",
      "### Data Model",
      "profiles and entities per the starter schema.",
      "### Authorization Model",
      "Enforcement: Postgres RLS policies. Deny-by-default.",
      "### Migrations And Environments",
      "Migrations run through the supabase CLI; dev/staging/prod separated.",
    ].join("\n"),
    "utf8",
  );
  runFixture(
    "engineering done with untested prose-only RLS claim fails",
    backendUntestedAuth,
    "check-backend-data-contract.ts",
    1,
    "backend_contract.authorization_untested",
  );

  const backendUngroundedAuth = makeFixture("backend-contract-ungrounded-auth");
  setEngineeringDone(backendUngroundedAuth);
  writeFileSync(
    path.join(backendUngroundedAuth, "engineering/TECH_SPEC.md"),
    [
      "# Tech Spec",
      "## Data Contract",
      "### Backend Selection",
      "supabase — chosen for the archetype starter default.",
      "### Data Model",
      "profiles and entities per the starter schema.",
      "### Authorization Model",
      "Enforcement: Postgres RLS policies. Deny-by-default. Rules are tested via supabase/tests/rls.test.sql (owner, anonymous, cross-user).",
      "### Migrations And Environments",
      "Migrations run through the supabase CLI; dev/staging/prod separated.",
    ].join("\n"),
    "utf8",
  );
  runFixture(
    "engineering done with tested-authz claim but no artifact on disk fails",
    backendUngroundedAuth,
    "check-backend-data-contract.ts",
    1,
    "backend_contract.authorization_proof_missing",
  );

  // Regression (verification pass): numbered headings must not defeat the
  // Authorization Model section extraction and silently widen the scan.
  const backendNumberedHeading = makeFixture("backend-contract-numbered-heading");
  setEngineeringDone(backendNumberedHeading);
  writeFileSync(
    path.join(backendNumberedHeading, "engineering/TECH_SPEC.md"),
    [
      "# Tech Spec",
      "## Data Contract",
      "### 1. Backend Selection",
      "supabase — chosen for the archetype starter default.",
      "### 2. Data Model",
      "profiles and entities per the starter schema. Integration tested elsewhere.",
      "### 3. Authorization Model",
      "Enforcement: Postgres RLS policies. Deny-by-default.",
      "### 4. Migrations And Environments",
      "Migrations run through the supabase CLI; dev/staging/prod separated.",
    ].join("\n"),
    "utf8",
  );
  runFixture(
    "numbered authorization heading still gates untested prose-only RLS",
    backendNumberedHeading,
    "check-backend-data-contract.ts",
    1,
    "backend_contract.authorization_untested",
  );

  // ── Standalone Engineering Loop (CE unavailable) ──────────────────────────

  function setCeUnavailable(root: string): void {
    appendFileSync(
      path.join(root, "engineering/ENGINEERING_PLAN.md"),
      "\nCE unavailable in this runtime. Route: ce_fallback. Use an equivalent engineering loop.\n",
      "utf8",
    );
  }

  const ceFallbackNoLoop = makeFixture("ce-fallback-no-loop");
  writeCompleteCompoundEngineering(ceFallbackNoLoop);
  setCeUnavailable(ceFallbackNoLoop);
  runFixture(
    "ce unavailable without standalone loop in plan fails",
    ceFallbackNoLoop,
    "check-compound-engineering-routing.ts",
    1,
    "compound_engineering.standalone_loop_missing",
  );

  const ceFallbackWithLoop = makeFixture("ce-fallback-with-loop");
  writeCompleteCompoundEngineering(ceFallbackWithLoop);
  setCeUnavailable(ceFallbackWithLoop);
  writeFileSync(
    path.join(ceFallbackWithLoop, "engineering/ENGINEERING_PLAN.md"),
    [
      "# Engineering Plan",
      "Compound Engineering: unavailable in this runtime; ce-plan and ce-work are replaced by the Standalone Engineering Loop with the same evidence bar.",
      "Standalone Engineering Loop: plan, bounded slices, adversarial review, test, and proof per engineering-orchestration.md section 1b.",
      "Brainstorm: product direction already decisive; brainstorm skipped with rationale recorded.",
    ].join("\n"),
    "utf8",
  );
  runFixture("ce unavailable with standalone loop in plan passes", ceFallbackWithLoop, "check-compound-engineering-routing.ts", 0);

  // ── Email lane deepening (DNS reference, unsubscribe, brand tokens) ──────

  function setEmailDone(root: string): void {
    const state = readState(root);
    const lane = getLane(state, "email");
    lane["status"] = "succeeded";
    lane["evidence"] = ["growth/EMAIL_OPS.md"];
    writeState(root, state);
    mkdirSync(path.join(root, "proof"), { recursive: true });
    for (const proof of ["email-domain-verified.txt", "email-spf-dkim-pass.txt", "email-test-send-log.txt"]) {
      writeFileSync(path.join(root, "proof", proof), "captured 2026-06-10\n", "utf8");
    }
    appendFileSync(
      path.join(root, "SECRETS.md"),
      "\n| `RESEND_API_KEY` | Resend | server_secret | local/staging/prod | backend | server-only | Doppler project/config | founder | quarterly | routed |\n",
      "utf8",
    );
    // Populate the sender map / domain rows the template ships as placeholders.
    const emailOpsPath = path.join(root, "growth/EMAIL_OPS.md");
    const emailOps = readFileSync(emailOpsPath, "utf8")
      .replaceAll("<!-- e.g. hello@mail.example.com -->", "hello@mail.example.com")
      .replaceAll("<!-- e.g. support@example.com -->", "support@example.com")
      .replaceAll("<!-- e.g. mail.example.com -->", "mail.example.com");
    writeFileSync(emailOpsPath, emailOps, "utf8");
  }

  const emailDoneComplete = makeFixture("email-done-complete");
  setEmailDone(emailDoneComplete);
  runFixture("email lane done with dns/unsubscribe/brand contract passes", emailDoneComplete, "check-email.ts", 0);

  const emailDoneUnbranded = makeFixture("email-done-unbranded");
  setEmailDone(emailDoneUnbranded);
  {
    const emailOpsPath = path.join(emailDoneUnbranded, "growth/EMAIL_OPS.md");
    writeFileSync(emailOpsPath, readFileSync(emailOpsPath, "utf8").replaceAll("DESIGN.md", "the design doc"), "utf8");
  }
  runFixture("email lane done without DESIGN.md brand tokens fails", emailDoneUnbranded, "check-email.ts", 1, "email.brand_tokens_missing");

  const emailDoneNoDns = makeFixture("email-done-no-dns");
  setEmailDone(emailDoneNoDns);
  writeFileSync(
    path.join(emailDoneNoDns, "growth/EMAIL_OPS.md"),
    [
      "# Email Ops",
      "Sender map:",
      "| Email | From address | Template | Unsubscribe required |",
      "| --- | --- | --- | --- |",
      "| welcome | hello@mail.example.com | resend/email-templates.ts `welcomeEmail` | no (transactional) |",
      "Brand tokens pulled from DESIGN.md per email-templates.ts.",
    ].join("\n"),
    "utf8",
  );
  runFixture("email lane done without SPF/DKIM reference fails", emailDoneNoDns, "check-email.ts", 1, "email.dns_proof_reference_missing");

  // ── Analytics event-catalog completeness ─────────────────────────────────

  function setAnalyticsDone(root: string): void {
    const state = readState(root);
    const lane = getLane(state, "analytics_attribution");
    lane["status"] = "succeeded";
    writeState(root, state);
  }

  const catalogReconciled = makeFixture("analytics-catalog-reconciled");
  setAnalyticsDone(catalogReconciled);
  runFixture("analytics done with reconciled event catalog passes", catalogReconciled, "check-analytics-catalog.ts", 0);

  const catalogDrift = makeFixture("analytics-catalog-drift");
  setAnalyticsDone(catalogDrift);
  appendFileSync(path.join(catalogDrift, "growth", "VIRAL_GROWTH.md"), "\n- `invented_share_event`\n", "utf8");
  runFixture(
    "analytics done with an uncataloged doc event fails",
    catalogDrift,
    "check-analytics-catalog.ts",
    1,
    "analytics_catalog.invented_share_event.uncataloged",
  );

  // revenue/REVENUE_OPS.md is a surface doc too: a billing/cancellation event named
  // there without a catalog row is the same invented-inline miss.
  const catalogRevenueDrift = makeFixture("analytics-catalog-revenue-drift");
  setAnalyticsDone(catalogRevenueDrift);
  appendFileSync(path.join(catalogRevenueDrift, "revenue/REVENUE_OPS.md"), "\n- `invented_billing_event`\n", "utf8");
  runFixture(
    "analytics done with an uncataloged revenue-doc event fails",
    catalogRevenueDrift,
    "check-analytics-catalog.ts",
    1,
    "analytics_catalog.invented_billing_event.uncataloged",
  );

  // A done REVENUE lane makes revenue-doc drift an error even while the
  // analytics lane is still partial — the revenue claim is what makes the
  // event name load-bearing.
  const catalogRevenueDoneDrift = makeFixture("analytics-catalog-revenue-done-drift");
  {
    const state = readState(catalogRevenueDoneDrift);
    getLane(state, "revenue")["status"] = "succeeded";
    writeState(catalogRevenueDoneDrift, state);
  }
  appendFileSync(path.join(catalogRevenueDoneDrift, "revenue/REVENUE_OPS.md"), "\n- `invented_billing_event`\n", "utf8");
  runFixture(
    "done revenue lane with an uncataloged revenue-doc event fails even while analytics is partial",
    catalogRevenueDoneDrift,
    "check-analytics-catalog.ts",
    1,
    "analytics_catalog.invented_billing_event.uncataloged",
  );

  // ── Launch scope state field ──────────────────────────────────────────────
  // Scope is explicit, typed, and cannot silently bypass coverage.
  const invalidScope = makeFixture("launch-scope-invalid");
  {
    const state = readState(invalidScope);
    expectRecord(state.project, "project")["launchScope"] = "minimal";
    writeState(invalidScope, state);
  }
  runFixture("invalid launch scope fails", invalidScope, "validate-project-state.ts", 1, "project_state.invalid_schema");

  const missingScope = makeFixture("launch-scope-missing");
  {
    const state = readState(missingScope);
    delete expectRecord(state.project, "project").launchScope;
    writeState(missingScope, state);
  }
  runFixture("missing launch scope fails", missingScope, "validate-project-state.ts", 1, "project_state.invalid_schema");

  const explicitEssentials = makeFixture("launch-scope-explicit-essentials");
  {
    const state = readState(explicitEssentials);
    expectRecord(state.project, "project").launchScope = "essentials";
    writeState(explicitEssentials, state);
  }
  runFixture("explicit essentials scope validates", explicitEssentials, "validate-project-state.ts", 0);

  // ── The pre-build clock ───────────────────────────────────────────────────
  // kickoffDate starts the pre-build clock at orient; a launch still in
  // phases 0-2 past 45 days is surfaced as a stall, because most dead launches
  // die in planning with nobody ever deciding to stop.
  const clockIsoDaysAgo = (days: number): string => {
    const date = new Date();
    date.setUTCDate(date.getUTCDate() - days);
    return date.toISOString().slice(0, 10);
  };

  const kickoffStalled = makeFixture("kickoff-pre-build-stall");
  {
    const state = readState(kickoffStalled);
    const project = expectRecord(state.project, "project");
    project["kickoffDate"] = clockIsoDaysAgo(60);
    writeState(kickoffStalled, state);
  }
  runFixture("launch still pre-build 60 days after kickoff surfaces the stall", kickoffStalled, "validate-project-state.ts", 0, "project.pre_build_stall");

  const kickoffFresh = makeFixture("kickoff-fresh");
  {
    const state = readState(kickoffFresh);
    const project = expectRecord(state.project, "project");
    project["kickoffDate"] = clockIsoDaysAgo(10);
    writeState(kickoffFresh, state);
  }
  runFixture("fresh kickoff in pre-build passes without stall findings", kickoffFresh, "validate-project-state.ts", 0);

  // The blank seed is legitimate only during orientation: past orient, a
  // missing kickoff date is a clock that can never fire.
  const kickoffMissingPastOrient = makeFixture("kickoff-missing-past-orient");
  {
    const state = readState(kickoffMissingPastOrient);
    expectRecord(state.project, "project")["phase"] = "phase_1_research";
    writeState(kickoffMissingPastOrient, state);
  }
  runFixture("blank kickoff date past orientation fails", kickoffMissingPastOrient, "validate-project-state.ts", 1, "project.kickoffDate.missing");

  const kickoffInvalid = makeFixture("kickoff-invalid-date");
  {
    const state = readState(kickoffInvalid);
    const project = expectRecord(state.project, "project");
    project["kickoffDate"] = "2026-99-99";
    writeState(kickoffInvalid, state);
  }
  runFixture("invalid kickoff date fails", kickoffInvalid, "validate-project-state.ts", 1, "project.kickoffDate.invalid");

  // ── Scope-skip exit regression ────────────────────────────────────────────
  // The skip paths used process.exit(0), which discarded the
  // project_state.missing error reportAndExit had already emitted (exit 0 with
  // "1 error(s)" printed). The skip path must still fail on a missing state.

  const postLaunchNoState = makeEmptyFixture("post-launch-missing-state");
  runFixture("post-launch ops fails loudly when project state is missing", postLaunchNoState, "check-post-launch-ops.ts", 1, "project_state.missing");
}
