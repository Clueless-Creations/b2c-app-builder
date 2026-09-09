#!/usr/bin/env node
/**
 * check-paid-tool-intake.ts — start-of-workflow tool intake record.
 *
 * `strategy/TOOL_DECISIONS.md` must record the one start-of-workflow intake
 * (recommended set / pick next / defer optional) or an explicit "no optional
 * tools" row before paid-tool routing can succeed. The unused seed is a no-op
 * for the general audit. The workflow gate `check:paid-tool-intake-required`
 * fails closed on a missing or unused file.
 *
 * npm script: check:paid-tool-intake
 * Usage: tsx checks/validation/business/operations/check-paid-tool-intake.ts --root <workspace>
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { issue, parseCliArgs, reportAndExit, type Issue } from "../../../../tooling/lib/launch-state.js";

const args = parseCliArgs(process.argv.slice(2));
const requireIntake = process.argv.includes("--require-intake");
const issues: Issue[] = [];
const decisionsRel = "strategy/TOOL_DECISIONS.md";
const decisionsPath = path.join(args.root, decisionsRel);
const unusedMarker = "Workflow intake is not recorded yet";

function run(): void {
  if (!existsSync(decisionsPath)) {
    if (requireIntake) {
      issues.push(
        issue(
          "error",
          "paid_tool_intake.missing",
          "Paid-tool routing requires strategy/TOOL_DECISIONS.md with a start-of-workflow intake or an explicit no optional tools row.",
          decisionsRel,
        ),
      );
    }
    reportAndExit("Paid-tool intake check", issues);
    return;
  }

  const text = readFileSync(decisionsPath, "utf8");
  if (text.includes(unusedMarker)) {
    if (requireIntake) {
      issues.push(
        issue(
          "error",
          "paid_tool_intake.not_recorded",
          "Paid-tool routing cannot succeed while workflow intake is still the unused seed.",
          decisionsRel,
        ),
      );
    }
    reportAndExit("Paid-tool intake check", issues);
    return;
  }

  const intakeSection = text.split(/^## Workflow intake\b/m)[1]?.split(/^## /m)[0] ?? "";
  if (!intakeSection) {
    issues.push(
      issue(
        "error",
        "paid_tool_intake.section_missing",
        "strategy/TOOL_DECISIONS.md must include a Workflow intake section that records the start-of-workflow question.",
        decisionsRel,
      ),
    );
  } else if (!/^\s*Selected route:/im.test(intakeSection) && !/^\s*no optional tools\b/im.test(intakeSection)) {
    issues.push(
      issue(
        "error",
        "paid_tool_intake.decision_missing",
        "Workflow intake must record a selected route or an explicit no optional tools row.",
        decisionsRel,
      ),
    );
  }

  reportAndExit("Paid-tool intake check", issues);
}

run();
