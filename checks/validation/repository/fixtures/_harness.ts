import { cpSync, mkdtempSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolveScriptPath } from "../../../../tooling/lib/script-paths.js";
import { resolveTsxBin } from "../../../../tooling/lib/tsx-bin.js";

export interface FixtureResult {
  label: string;
  ok: boolean;
  expectedCode: number;
  actualCode: number | null;
  expectedText?: string;
  output: string;
}

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
export const skillRoot = path.resolve(scriptDir, "../../../..");

export function writeBusinessEntrypoints(root: string): void {
  cpSync(path.join(skillRoot, "surfaces/workspace-template", "repo-agent-entrypoints", "AGENTS.md"), path.join(root, "AGENTS.md"));
  cpSync(path.join(skillRoot, "surfaces/workspace-template", "repo-agent-entrypoints", "CLAUDE.md"), path.join(root, "CLAUDE.md"));
  // The Cursor rule is a real entrypoint: install-entrypoints.ts (ENTRYPOINT_FILES) and
  // kernel/session/new.ts both write it into a generated business, and check-continuity-contract
  // requires it. A fixture that models a generated business must install it too.
  mkdirSync(path.join(root, ".cursor", "rules"), { recursive: true });
  cpSync(
    path.join(skillRoot, "surfaces/workspace-template", "repo-agent-entrypoints", ".cursor", "rules", "agents.mdc"),
    path.join(root, ".cursor", "rules", "agents.mdc"),
  );
  cpSync(path.join(skillRoot, "examples", "workspace", "business", "engineering/app-agent-roster", "APP_AGENTS.md"), path.join(root, "APP_AGENTS.md"));
  cpSync(path.join(skillRoot, "examples", "workspace", "business", "engineering/app-agent-roster", "agents"), path.join(root, "agents"), { recursive: true });
  cpSync(path.join(skillRoot, "examples", "workspace", "business", "operations/ORCHESTRATION.md"), path.join(root, "operations/ORCHESTRATION.md"));
  cpSync(path.join(skillRoot, "examples", "workspace", "business", "operations/orchestration.html"), path.join(root, "operations/orchestration.html"));
}

export interface Harness {
  readonly tempRoot: string;
  readonly results: FixtureResult[];
  makeFixture: (name: string) => string;
  makeEmptyFixture: (name: string) => string;
  runFixture: (
    label: string,
    root: string,
    script: string,
    expectedCode: number,
    expectedText?: string,
    extraArgs?: string[],
    env?: Record<string, string>,
    forbiddenText?: string,
  ) => void;
  runScriptArgs: (label: string, script: string, args: string[], expectedCode: number, expectedText?: string, env?: Record<string, string>) => void;
  /**
   * D1 (#32): the same invocation as runFixture, with `--json` appended, asserting the
   * `{pass, failures}` contract instead of a raw-text substring — `expectedRule` matches
   * `Issue.code` verbatim (the same string an existing runFixture call already names as
   * `expectedText`), so an existing PASS/FAIL fixture call becomes a JSON-contract proof with no
   * new fixture-root authoring.
   */
  runFixtureJson: (
    label: string,
    root: string,
    script: string,
    expectedCode: number,
    expectedRule?: string,
    extraArgs?: string[],
    env?: Record<string, string>,
  ) => void;
  cleanupFixtures: () => void;
  cleanup: () => void;
}

export function createHarness(): Harness {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "b2c-validator-fixtures-"));
  const results: FixtureResult[] = [];
  const tsxBin = resolveTsxBin(skillRoot);

  const makeFixture = (name: string): string => {
    const fixtureRoot = path.join(tempRoot, name);
    cpSync(path.join(skillRoot, "examples", "workspace", "business"), fixtureRoot, { recursive: true });
    // starters/ used to live under business/ and came along with the copy
    // above. It is a sibling now (docs/architecture.md: starter app code is not a
    // template), so the fixture root has to pull it in explicitly — several
    // validators scan a business root for starter prompts and shipped copy.
    cpSync(path.join(skillRoot, "surfaces", "starters"), path.join(fixtureRoot, "surfaces", "starters"), { recursive: true });
    cpSync(path.join(skillRoot, "examples", "workspace", "business", "trust", "secrets", "SECRETS.md"), path.join(fixtureRoot, "SECRETS.md"));
    return fixtureRoot;
  };

  const makeEmptyFixture = (name: string): string => {
    const fixtureRoot = path.join(tempRoot, name);
    mkdirSync(fixtureRoot, { recursive: true });
    // Empty fixtures model either a business workspace directly or a repository
    // containing business/. Seed both shapes so tests can write one targeted
    // artifact without duplicating directory setup. Presence still comes from
    // files, never from these empty directory roots.
    for (const capability of ["state", "strategy", "product", "design", "engineering", "analytics", "growth", "revenue", "store", "trust", "operations"]) {
      mkdirSync(path.join(fixtureRoot, capability), { recursive: true });
      mkdirSync(path.join(fixtureRoot, "business", capability), { recursive: true });
    }
    return fixtureRoot;
  };

  const runScript = (
    label: string,
    scriptArgs: string[],
    expectedCode: number,
    expectedText?: string,
    env?: Record<string, string>,
    forbiddenText?: string,
  ): void => {
    const result = spawnSync(tsxBin, scriptArgs, {
      cwd: skillRoot,
      encoding: "utf8",
      env: env ? { ...process.env, ...env } : undefined,
    });
    const output = `${result.stdout}\n${result.stderr}`;
    results.push({
      label,
      ok: result.status === expectedCode && (!expectedText || output.includes(expectedText)) && (!forbiddenText || !output.includes(forbiddenText)),
      expectedCode,
      actualCode: result.status,
      expectedText,
      output,
    });
  };

  const runFixture = (
    label: string,
    root: string,
    script: string,
    expectedCode: number,
    expectedText?: string,
    extraArgs: string[] = [],
    env?: Record<string, string>,
    forbiddenText?: string,
  ): void => {
    runScript(label, [resolveScriptPath(skillRoot, script), "--root", root, ...extraArgs], expectedCode, expectedText, env, forbiddenText);
  };

  const runScriptArgs = (label: string, script: string, args: string[], expectedCode: number, expectedText?: string, env?: Record<string, string>): void => {
    runScript(label, [resolveScriptPath(skillRoot, script), ...args], expectedCode, expectedText, env);
  };

  const runFixtureJson = (
    label: string,
    root: string,
    script: string,
    expectedCode: number,
    expectedRule?: string,
    extraArgs: string[] = [],
    env?: Record<string, string>,
  ): void => {
    const result = spawnSync(tsxBin, [resolveScriptPath(skillRoot, script), "--root", root, ...extraArgs, "--json"], {
      cwd: skillRoot,
      encoding: "utf8",
      env: env ? { ...process.env, ...env } : undefined,
    });
    const rawOutput = `${result.stdout}\n${result.stderr}`;
    let parsed: { pass?: unknown; failures?: unknown } | undefined;
    let parseError: string | undefined;
    try {
      parsed = JSON.parse((result.stdout ?? "").trim()) as { pass?: unknown; failures?: unknown };
    } catch (error) {
      parseError = error instanceof Error ? error.message : String(error);
    }
    const failures = Array.isArray(parsed?.failures) ? (parsed.failures as Array<{ rule?: unknown }>) : [];
    const passMatches = parsed !== undefined && parsed.pass === (expectedCode === 0);
    const ruleMatches = expectedRule === undefined || failures.some((failure) => failure.rule === expectedRule);
    results.push({
      label,
      ok: result.status === expectedCode && parsed !== undefined && passMatches && ruleMatches,
      expectedCode,
      actualCode: result.status,
      expectedText: expectedRule,
      output: parseError ? `${rawOutput}\n(--json did not parse: ${parseError})` : rawOutput,
    });
  };

  const cleanup = (): void => {
    rmSync(tempRoot, { recursive: true, force: true });
  };

  const cleanupFixtures = (): void => {
    for (const entry of readdirSync(tempRoot)) {
      rmSync(path.join(tempRoot, entry), { recursive: true, force: true });
    }
  };

  return { tempRoot, results, makeFixture, makeEmptyFixture, runFixture, runScriptArgs, runFixtureJson, cleanupFixtures, cleanup };
}

export function reportResults(results: FixtureResult[]): number {
  const failed = results.filter((result) => !result.ok);
  console.log("Validator fixture tests");
  console.log(`${failed.length} failure(s), ${results.length - failed.length} passed`);
  for (const result of results) {
    console.log(`${result.ok ? "PASS" : "FAIL"} ${result.label}`);
    if (!result.ok) {
      console.log(`  expected exit ${result.expectedCode}, got ${result.actualCode}`);
      if (result.expectedText) {
        console.log(`  expected text: ${result.expectedText}`);
      }
      console.log(result.output.trim());
    }
  }
  return failed.length;
}

export * from "./_state.js";
export * from "./_builders-store.js";
export * from "./_builders-ops.js";
