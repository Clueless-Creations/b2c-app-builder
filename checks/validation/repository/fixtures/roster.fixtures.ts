import { copyFileSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { type Harness } from "./_harness.js";

const AGENTS_DIR = "engineering/app-agent-roster/agents";

export function register(h: Harness): void {
  const { makeFixture, runFixture, runFixtureJson } = h;

  const baseline = makeFixture("roster-baseline");
  runFixture("shipped roster has no near-duplicate role pair", baseline, "check-roster-overlap.ts", 0);
  runFixture("shipped roster carries no human-in-the-loop language", baseline, "check-roster-headless-safety.ts", 0);

  const duplicate = makeFixture("roster-overlap-duplicate");
  copyFileSync(path.join(duplicate, AGENTS_DIR, "mobile-engineer.md"), path.join(duplicate, AGENTS_DIR, "backend-infrastructure-engineer.md"));
  runFixture(
    "a role file copied onto another fails the overlap check as a warning",
    duplicate,
    "check-roster-overlap.ts",
    0,
    "roster_overlap.jaccard_similarity_high",
  );
  runFixtureJson(
    "overlap warning still passes --json (warning-tier, not error-tier)",
    duplicate,
    "check-roster-overlap.ts",
    0,
    "roster_overlap.jaccard_similarity_high",
  );

  const distinct = makeFixture("roster-overlap-distinct");
  runFixtureJson("distinct roster reports no overlap warning over --json", distinct, "check-roster-overlap.ts", 0);

  const humanInTheLoop = makeFixture("roster-headless-unsafe");
  const targetPath = path.join(humanInTheLoop, AGENTS_DIR, "mobile-engineer.md");
  writeFileSync(targetPath, `${readFileSync(targetPath, "utf8")}\nIf unsure, ask the founder before continuing.\n`);
  runFixture(
    "human-in-the-loop language in a role file fails the headless-safety check",
    humanInTheLoop,
    "check-roster-headless-safety.ts",
    1,
    "roster_headless_safety.if_unsure_ask",
  );
  runFixtureJson(
    "headless-safety failure reports the matched phrase's rule over --json",
    humanInTheLoop,
    "check-roster-headless-safety.ts",
    1,
    "roster_headless_safety.if_unsure_ask",
  );

  const waitForApproval = makeFixture("roster-headless-unsafe-wait-for-approval");
  const waitTargetPath = path.join(waitForApproval, AGENTS_DIR, "customer-success.md");
  writeFileSync(waitTargetPath, `${readFileSync(waitTargetPath, "utf8")}\nWait for approval before sending any reply.\n`);
  runFixture(
    "'wait for approval' language fails the headless-safety check",
    waitForApproval,
    "check-roster-headless-safety.ts",
    1,
    "roster_headless_safety.wait_for_approval",
  );
}
