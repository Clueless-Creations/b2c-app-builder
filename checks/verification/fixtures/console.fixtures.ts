import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { assert, assertSchemaValid, skillRoot, type Harness } from "./_harness.js";
import { internalVocabularyBlocklist } from "../../../kernel/session/digest.js";
import { resolveTsxBin } from "../../../tooling/lib/tsx-bin.js";
import { currentPin } from "./run-persistence.fixtures.js";

/** Onboarding and authority checks for the founder surface. */
const founderSurfaceVocabularyBlocklist: readonly string[] = [
  ...internalVocabularyBlocklist,
  "lane.",
  "mutate",
  "gateClass",
  "RunNode",
  "domainId",
  "businessSlug",
  "founderOnlyActions",
  "resourcePattern",
  "waiverRef",
  "budgetPeriod",
  "costEstimate",
  "killSwitch",
  "stateHash",
  "grantedViaUnit",
  "ttlSeconds",
  "auditRef",
  "patchId",
];

const tsxBin = resolveTsxBin(skillRoot);
const onboardCliPath = path.join(skillRoot, "kernel/session/onboard.ts");
const onboardingContentPath = path.join(skillRoot, "knowledge/operations/autonomy-onboarding.md");

const CONTROL_SCHEMA = "urn:b2c:core:control-schema";

interface CliResult {
  readonly code: number;
  readonly output: string;
}

function runOnboard(args: string[]): CliResult {
  const result = spawnSync(tsxBin, [onboardCliPath, ...args], { cwd: skillRoot, encoding: "utf8" });
  return { code: result.status ?? -1, output: `${result.stdout ?? ""}\n${result.stderr ?? ""}` };
}

function writeJson(filePath: string, value: unknown): void {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

interface WorkspaceHandle {
  readonly dir: string;
  readonly controlPath: string;
}

function makeWorkspace(harness: Harness, name: string): WorkspaceHandle {
  const dir = harness.makeTempDir(`console-${name}`);
  writeJson(path.join(dir, "catalog.json"), currentPin.catalog);
  return {
    dir,
    controlPath: path.join(dir, "control", "control.json"),
  };
}

function snapshot(root: string): Record<string, string> {
  const files: Record<string, string> = {};
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
      const filePath = path.join(dir, entry.name);
      const relative = path.relative(root, filePath);
      if (entry.isDirectory()) {
        files[`${relative}/`] = "directory";
        walk(filePath);
      } else files[relative] = readFileSync(filePath).toString("base64");
    }
  };
  walk(root);
  return files;
}

function bulkDefaultUnits(): Record<string, unknown> {
  return {
    Product: { level: "run-with-guardrails" },
    Design: { level: "run-with-guardrails" },
    Engineering: { level: "run-with-guardrails" },
    Growth: { level: "run-with-guardrails" },
    Analytics: { level: "run-with-guardrails" },
    Operations: { level: "run-with-guardrails" },
    Revenue: { level: "review-first" },
    Store: { level: "review-first" },
    Trust: { level: "review-first" },
  };
}

function baseAnswers(businessSlug: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { schemaVersion: "1.0.0", businessSlug, founderContact: { email: "founder@example.com" }, units: bulkDefaultUnits(), ...extra };
}

function fullWaiverInput(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    domainId: "domain.money",
    actionClass: "spend",
    protectedCategory: "spend",
    scope: { resourcePattern: "*", description: "Pay for routine ad spend on the approved growth channels only." },
    caps: { maxPerAction: 50, maxPerPeriod: 500, currency: "USD" },
    budgetPeriod: "monthly",
    expiry: "2027-01-01T00:00:00.000Z",
    undoContract: {
      kind: "mitigation",
      irreversibilityAcknowledgment: "Ad spend already delivered cannot be clawed back once it has run.",
      mitigationSteps: ["Pause the campaign immediately.", "Review spend in the next session."],
    },
    ...overrides,
  };
}

export function register(harness: Harness): void {
  harness.check("onboard: a missing durable catalog refuses before any workspace write", () => {
    const handle = makeWorkspace(harness, "missing-catalog");
    const answersPath = path.join(handle.dir, "answers.json");
    writeJson(answersPath, baseAnswers("fixture-missing-catalog"));
    unlinkSync(path.join(handle.dir, "catalog.json"));
    const before = JSON.stringify(snapshot(handle.dir));

    const result = runOnboard(["--workspace", handle.dir, "--answers", answersPath, "--now", "2026-08-05T00:00:00.000Z"]);
    assert(result.code === 1, `expected exit 1, got ${result.code}: ${result.output}`);
    assert(result.output.includes("invalid_catalog"), `expected a catalog refusal, got:\n${result.output}`);
    assert(JSON.stringify(snapshot(handle.dir)) === before, "missing-catalog refusal must leave every workspace byte unchanged");
  });

  // --- scenario 1: bulk-defaults onboarding produces a valid, conservative control file --------

  harness.check("onboard: a bulk-defaults transcript produces a valid control file (checked against the real U1 control schema)", () => {
    const handle = makeWorkspace(harness, "bulk-defaults");
    const answersPath = path.join(handle.dir, "answers.json");
    writeJson(answersPath, baseAnswers("fixture-bulk"));

    const result = runOnboard(["--workspace", handle.dir, "--answers", answersPath, "--now", "2026-08-05T00:00:00.000Z"]);
    assert(result.code === 0, `expected exit 0, got ${result.code}: ${result.output}`);
    assert(existsSync(handle.controlPath), "expected onboard.ts to write control.json");

    const parsed = JSON.parse(readFileSync(handle.controlPath, "utf8"));
    assertSchemaValid(harness.checkSchema(CONTROL_SCHEMA, parsed), "onboarded control document");

    assert(parsed.grants["domain.money"].level === "review-first", "expected the Revenue unit's conservative default (review-first) on domain.money");
    assert(parsed.grants["domain.store"].level === "review-first", "expected the Store unit's conservative default (review-first) on domain.store");
    assert(parsed.grants["domain.trust"].level === "review-first", "expected the Trust unit's conservative default (review-first) on domain.trust");
    assert(parsed.grants["domain.growth"].level === "run-with-guardrails", "expected the Growth unit's default (run-with-guardrails) on domain.growth");
    assert(
      parsed.grants["domain.research"].level === "run-with-guardrails",
      "expected the Product unit's default to expand to every member domain, including domain.research",
    );
    assert(Array.isArray(parsed.waivers) && parsed.waivers.length === 0, "bulk defaults must not pre-approve any protected action");
    assert(parsed.killSwitch.engaged === false, "onboarding must not engage the kill switch");
  });

  // --- scenario 2: a waiver missing a required envelope field refuses activation entirely -------

  harness.check("onboard: a waiver missing a required envelope field (structural) refuses the entire run, not just that waiver", () => {
    const handle = makeWorkspace(harness, "waiver-missing-field");
    const incompleteWaiver = fullWaiverInput();
    delete (incompleteWaiver as Record<string, unknown>).expiry;
    const answersPath = path.join(handle.dir, "answers.json");
    writeJson(answersPath, baseAnswers("fixture-waiver-missing", { waivers: [incompleteWaiver] }));

    const result = runOnboard(["--workspace", handle.dir, "--answers", answersPath, "--now", "2026-08-05T00:00:00.000Z"]);
    assert(result.code !== 0, `expected a non-zero exit for an incomplete waiver envelope, got ${result.code}`);
    assert(result.output.includes("ISSUE onboard."), `expected a named ISSUE error, got:\n${result.output}`);
    assert(result.output.toLowerCase().includes("expiry"), `expected the error to name the missing field (expiry), got:\n${result.output}`);
    assert(!existsSync(handle.controlPath), "an incomplete waiver must refuse activation before anything is written — control.json must not exist");
  });

  harness.check("onboard: a waiver failing the real U1 waiver schema (too-short description) refuses activation and writes nothing", () => {
    const handle = makeWorkspace(harness, "waiver-schema-invalid");
    const badWaiver = fullWaiverInput({ scope: { resourcePattern: "*", description: "too short" } }); // < 20 chars, fails waivers.schema.json
    const answersPath = path.join(handle.dir, "answers.json");
    writeJson(answersPath, baseAnswers("fixture-waiver-schema", { waivers: [badWaiver] }));

    const result = runOnboard(["--workspace", handle.dir, "--answers", answersPath, "--now", "2026-08-05T00:00:00.000Z"]);
    assert(result.code !== 0, `expected a non-zero exit, got ${result.code}: ${result.output}`);
    assert(result.output.includes("ISSUE onboard.waiver_incomplete"), `expected a named waiver_incomplete error, got:\n${result.output}`);
    assert(!existsSync(handle.controlPath), "a schema-invalid waiver must refuse activation before anything is written");
  });

  // --- judgment scenario: --dry-run never writes -------------------------------------------------

  harness.check("onboard: --dry-run reports what would change without writing control.json", () => {
    const handle = makeWorkspace(harness, "dry-run");
    const answersPath = path.join(handle.dir, "answers.json");
    writeJson(answersPath, baseAnswers("fixture-dry-run"));

    const result = runOnboard(["--workspace", handle.dir, "--answers", answersPath, "--dry-run", "--now", "2026-08-05T00:00:00.000Z"]);
    assert(result.code === 0, `expected exit 0 for a dry run, got ${result.code}: ${result.output}`);
    assert(result.output.includes("DRY RUN"), `expected dry-run output to say so, got:\n${result.output}`);
    assert(!existsSync(handle.controlPath), "a dry run must never write control.json");
  });

  // --- judgment scenario: re-running with an unchanged answer is a no-op -------------------------

  harness.check("onboard: re-running with answers that match the current settings is a no-op (no spurious commit)", () => {
    const handle = makeWorkspace(harness, "idempotent");
    const answersPath = path.join(handle.dir, "answers.json");
    writeJson(answersPath, baseAnswers("fixture-idempotent"));

    const first = runOnboard(["--workspace", handle.dir, "--answers", answersPath, "--now", "2026-08-05T00:00:00.000Z"]);
    assert(first.code === 0, `expected exit 0 on first run, got ${first.code}: ${first.output}`);
    const beforeSecond = readFileSync(handle.controlPath, "utf8");

    const second = runOnboard(["--workspace", handle.dir, "--answers", answersPath, "--now", "2026-08-05T01:00:00.000Z"]);
    assert(second.code === 0, `expected exit 0 on the repeat run, got ${second.code}: ${second.output}`);
    assert(second.output.includes("Nothing to update"), `expected the repeat run to report a no-op, got:\n${second.output}`);
    const afterSecond = readFileSync(handle.controlPath, "utf8");
    assert(beforeSecond === afterSecond, "an unchanged repeat onboarding run must not rewrite control.json");
  });

  // --- judgment scenario: a genuine second run (a real settings change, not idempotent) still succeeds under the new race-guard preconditions ----

  harness.check(
    "onboard: a legitimate sequential re-run that actually changes a setting still succeeds (the new precondition guards races, not ordinary re-onboarding)",
    () => {
      const handle = makeWorkspace(harness, "sequential-update");
      const answersPath = path.join(handle.dir, "answers.json");
      writeJson(answersPath, baseAnswers("fixture-sequential"));

      const first = runOnboard(["--workspace", handle.dir, "--answers", answersPath, "--now", "2026-08-05T00:00:00.000Z"]);
      assert(first.code === 0, `expected exit 0 on the bootstrap run, got ${first.code}: ${first.output}`);
      const afterFirst = JSON.parse(readFileSync(handle.controlPath, "utf8"));
      assert(afterFirst.grants["domain.money"].level === "review-first", "expected the bootstrap default for domain.money");

      // A real change: flip Revenue from review-first to full. This exercises the "update" branch
      // (existingControl is now truthy) and its equals(updatedAt) precondition, not the bootstrap
      // branch's not_exists(businessSlug) precondition.
      writeJson(answersPath, baseAnswers("fixture-sequential", { units: { ...bulkDefaultUnits(), Revenue: { level: "full" } } }));
      const second = runOnboard(["--workspace", handle.dir, "--answers", answersPath, "--now", "2026-08-05T01:00:00.000Z"]);
      assert(second.code === 0, `expected exit 0 on a genuine settings-change re-run, got ${second.code}: ${second.output}`);
      assert(!second.output.includes("precondition"), `a legitimate sequential update must never trip the race-guard precondition, got:\n${second.output}`);

      const afterSecond = JSON.parse(readFileSync(handle.controlPath, "utf8"));
      assert(
        afterSecond.grants["domain.money"].level === "full",
        `expected the updated grant level to be committed, got: ${JSON.stringify(afterSecond.grants["domain.money"])}`,
      );
    },
  );

  // --- founder-vocabulary: the onboarding content itself carries no internal vocabulary ----------

  harness.check("founder copy: the onboarding content file uses no internal vocabulary", () => {
    const text = readFileSync(onboardingContentPath, "utf8");
    const leaked = founderSurfaceVocabularyBlocklist.filter((term) => text.includes(term));
    assert(leaked.length === 0, `knowledge/operations/autonomy-onboarding.md leaked internal vocabulary: ${JSON.stringify(leaked)}`);
  });

  // --- judgment scenario: the blocklist scan is real, not vacuous --------------------------------

  harness.check("onboard: the founder-surface vocabulary check catches a leak (the check is not vacuous)", () => {
    assert(founderSurfaceVocabularyBlocklist.length > 0, "the blocklist must not be empty");
    const leaking = "Grant for domain.money at level review-first; protectedCategory spend; mutate the ledger.";
    const leaked = founderSurfaceVocabularyBlocklist.filter((term) => leaking.includes(term));
    assert(leaked.length > 0, "the blocklist scan failed to catch an obviously internal-vocabulary string — the check would pass vacuously");
  });
}
