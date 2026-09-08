import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { loadKnowledgePackages } from "../../catalog/knowledge-packages.js";
import type { CatalogKnowledgePackage } from "../../catalog/types.js";
import type { ContributionUnit, EvaluationCase } from "../../contracts/contribution/contract.js";
import { resolveScriptPath } from "../../tooling/lib/script-paths.js";
import { resolveTsxCommand } from "../../tooling/lib/tsx-bin.js";
import { readContributionManifest, readTextIfExists, truncate } from "./manifest-io.js";
import type { EvaluateCaseResult, EvaluateData } from "./types.js";

/**
 * `contribution.evaluate`: run the evaluation cases a contribution declares. A counterexample is
 * a lexical check of the candidate text; a LaunchBench scenario is a lint of the scenario file
 * and its validator names; a command runs only when the CLI caller allowed commands, with a
 * bounded environment and timeout; rendered review and comparison stay human or vision tasks and
 * never auto-pass. Nothing here writes a file.
 *
 * Command forms (all behind --allow-commands):
 * - `npm run <script> [args]`: a script package.json declares, run from the skill root.
 * - `npx tsx <path> [args]` or a bare `<path>.ts [args]`: a TypeScript script inside the skill
 *   root, run through the repository's own tsx from the skill root.
 * - any other executable: run from the contribution root, as before.
 * A bare `.yaml` path under checks/validation/repository/evals/launchbench/ is an authored
 * LaunchBench scenario, so the case is the scenario lint, not a process.
 */
const COMMAND_TIMEOUT_MS = 60_000;
const LAUNCHBENCH_SCENARIO_DIRECTORY = "checks/validation/repository/evals/launchbench/";
const NPM_SCRIPT_NAME = /^[A-Za-z0-9][\w:.-]*$/u;
const LAUNCHBENCH_TEXT_KEYS = ["id", "title", "prompt", "expected_guardrail"] as const;
const LAUNCHBENCH_LIST_KEYS = ["validators", "must_catch", "should_say"] as const;
const REJECTION = /\b(?:reject(?:s|ed)?|refuse(?:s|d)?|fail(?:s|ed|ure)?|never|not|avoid|wrong|block(?:s|ed)?|counterexample|anti-pattern|instead|no)\b/iu;
const WINDOW = 240;

type Observation = EvaluateCaseResult["observations"][number];

function result(
  item: EvaluationCase,
  status: EvaluateCaseResult["status"],
  detail: string,
  observations: Observation[] = item.observations,
): EvaluateCaseResult {
  return { id: item.id, kind: item.kind, status, detail: truncate(detail, 2000), observations: observations.map((entry) => ({ ...entry })) };
}

/** A manifest-relative path that stays inside the contribution root, or undefined when it escapes. */
function insideRoot(root: string, relative: string): string | undefined {
  if (path.isAbsolute(relative)) return undefined;
  const resolved = path.resolve(root, relative);
  const rel = path.relative(path.resolve(root), resolved);
  return rel === "" || rel.startsWith("..") || path.isAbsolute(rel) ? undefined : resolved;
}

function candidateText(
  targetRoot: string,
  skillRoot: string,
  unit: ContributionUnit,
  item: EvaluationCase,
  packages: ReadonlyMap<string, CatalogKnowledgePackage>,
): { text: string; origin: string } | undefined {
  const candidates: string[] = [];
  for (const relative of [item.path, unit.target.path]) {
    const file = relative ? insideRoot(targetRoot, relative) : undefined;
    if (file) candidates.push(file);
  }
  const pkg = unit.target.id ? packages.get(unit.target.id) : undefined;
  if (pkg) candidates.push(path.join(skillRoot, pkg.path));
  for (const file of candidates) {
    const text = readTextIfExists(file);
    if (text !== undefined) return { text, origin: file };
  }
  return undefined;
}

/** The paragraph window around the first occurrence of a phrase, or undefined when the phrase is absent. */
function phraseWindow(text: string, phrase: string): string | undefined {
  const lower = text.toLowerCase();
  const needle = phrase.toLowerCase();
  const index = lower.indexOf(needle);
  if (index === -1) return undefined;
  const start = Math.max(0, lower.lastIndexOf("\n\n", index), index - WINDOW);
  const nextBreak = lower.indexOf("\n\n", index + needle.length);
  const end = Math.min(nextBreak === -1 ? lower.length : nextBreak, index + needle.length + WINDOW);
  return text.slice(start, end);
}

function evaluateCounterexample(
  item: EvaluationCase,
  unit: ContributionUnit | undefined,
  targetRoot: string,
  skillRoot: string,
  packages: ReadonlyMap<string, CatalogKnowledgePackage>,
): EvaluateCaseResult {
  if (!unit) return result(item, "failed", `unit ${item.unitId} is not declared in the manifest`);
  if (!item.mustFail.length && !item.mustPass.length) return result(item, "failed", "a counterexample needs at least one mustFail or mustPass phrase");
  const candidate = candidateText(targetRoot, skillRoot, unit, item, packages);
  if (!candidate) {
    return result(
      item,
      "requires-review",
      `no candidate text to check: unit ${unit.id} targets ${unit.target.kind}${unit.target.id ? ` ${unit.target.id}` : ""}; name a path inside the contribution root or target a knowledge reference`,
    );
  }
  const missingPass = item.mustPass.filter((phrase) => phraseWindow(candidate.text, phrase) === undefined);
  const missingFail = item.mustFail.filter((phrase) => phraseWindow(candidate.text, phrase) === undefined);
  if (missingPass.length || missingFail.length) {
    const parts = [
      ...missingFail.map((phrase) => `mustFail phrase not mentioned: "${phrase}"`),
      ...missingPass.map((phrase) => `mustPass phrase not present: "${phrase}"`),
    ];
    return result(item, "failed", `${parts.join("; ")} (checked ${candidate.origin})`);
  }
  const unrejected = item.mustFail.filter((phrase) => !REJECTION.test(phraseWindow(candidate.text, phrase) ?? ""));
  if (unrejected.length) {
    return result(
      item,
      "requires-review",
      `lexical check only: ${unrejected.map((phrase) => `"${phrase}"`).join(", ")} appear in ${candidate.origin} without visible rejection wording nearby; a reviewer decides whether the text rejects them`,
    );
  }
  return result(
    item,
    "passed",
    `lexical check: ${item.mustFail.length} mustFail phrase(s) mentioned with rejection wording and ${item.mustPass.length} mustPass phrase(s) present in ${candidate.origin}; the judgment behind the text stays a review task`,
  );
}

function evaluateLaunchbench(item: EvaluationCase, targetRoot: string, skillRoot: string): EvaluateCaseResult {
  if (!item.path) return result(item, "failed", "a launchbench-scenario case needs path");
  const file = insideRoot(targetRoot, item.path);
  if (!file) return result(item, "failed", `path ${item.path} escapes the contribution root`);
  return lintLaunchbenchScenario(item, file, item.path, skillRoot);
}

/** Lint one LaunchBench scenario file: the required keys and every validator name resolving to a real script. */
function lintLaunchbenchScenario(item: EvaluationCase, file: string, label: string, skillRoot: string): EvaluateCaseResult {
  const text = readTextIfExists(file);
  if (text === undefined) return result(item, "failed", `scenario file ${label} is missing or unreadable`);
  let parsed: unknown;
  try {
    parsed = YAML.parse(text);
  } catch (error) {
    return result(item, "failed", `scenario file ${label} is not valid YAML: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return result(item, "failed", `scenario file ${label} must be a mapping`);
  const scenario = parsed as Record<string, unknown>;
  const problems: string[] = [];
  for (const key of LAUNCHBENCH_TEXT_KEYS) {
    if (typeof scenario[key] !== "string" || !(scenario[key] as string).trim()) problems.push(`${key} must be a non-empty string`);
  }
  for (const key of LAUNCHBENCH_LIST_KEYS) {
    const value = scenario[key];
    if (!Array.isArray(value) || !value.length || value.some((entry) => typeof entry !== "string" || !entry.trim()))
      problems.push(`${key} must be a non-empty list of strings`);
  }
  const validators = Array.isArray(scenario.validators) ? scenario.validators.filter((entry): entry is string => typeof entry === "string") : [];
  const resolved: string[] = [];
  for (const name of validators) {
    try {
      resolved.push(`${name} -> ${resolveScriptPath(skillRoot, name)}`);
    } catch (error) {
      problems.push(`validator ${name} does not resolve: ${error instanceof Error ? error.message.split(".")[0] : String(error)}`);
    }
  }
  if (problems.length) return result(item, "failed", `${label}: ${problems.join("; ")}`);
  return result(item, "passed", `${label} carries every required LaunchBench key; ${resolved.join(", ")}`);
}

/** A skill-root-relative path that stays inside the skill root, or undefined when it escapes or is absolute. */
function insideSkillRoot(skillRoot: string, relative: string): string | undefined {
  return insideRoot(skillRoot, relative.replace(/\\/gu, "/").replace(/^\.\//u, ""));
}

function npmScripts(skillRoot: string): Set<string> {
  try {
    const parsed = JSON.parse(readFileSync(path.join(skillRoot, "package.json"), "utf8")) as { scripts?: Record<string, unknown> };
    return new Set(Object.keys(parsed.scripts ?? {}));
  } catch {
    return new Set();
  }
}

type CommandPlan =
  | { kind: "run"; executable: string; args: string[]; cwd: string; label: string; where: string }
  | { kind: "lint"; file: string; label: string }
  | { kind: "invalid"; detail: string };

/**
 * Classify a declared command. Recognized repository forms run from the skill root through the
 * repository's own tooling; anything else runs from the contribution root as an executable name.
 */
function planCommand(command: string, targetRoot: string, skillRoot: string): CommandPlan {
  const argv = command.trim().split(/\s+/u).filter(Boolean);
  const [first, second, third, ...rest] = argv;
  if (!first) return { kind: "invalid", detail: "a command case needs a non-empty command" };
  if (first === "npm" && second === "run") {
    if (!third || !NPM_SCRIPT_NAME.test(third)) return { kind: "invalid", detail: "npm run needs a script name" };
    if (!npmScripts(skillRoot).has(third)) return { kind: "invalid", detail: `npm script ${third} is not declared in package.json` };
    return { kind: "run", executable: "npm", args: ["run", third, ...rest], cwd: skillRoot, label: argv.join(" "), where: "the skill root" };
  }
  const tsxForm = first === "npx" && second === "tsx";
  const scriptPath = tsxForm ? third : first.endsWith(".ts") ? first : undefined;
  if (scriptPath !== undefined) {
    const args = tsxForm ? rest : argv.slice(1);
    const file = insideSkillRoot(skillRoot, scriptPath);
    if (!file) return { kind: "invalid", detail: `script path ${scriptPath} must be a relative path inside the skill root` };
    if (!file.endsWith(".ts")) return { kind: "invalid", detail: `${scriptPath} is not a TypeScript script` };
    if (!existsSync(file)) return { kind: "invalid", detail: `script ${scriptPath} does not exist under the skill root` };
    const label = `npx tsx ${path.relative(skillRoot, file)}${args.length ? ` ${args.join(" ")}` : ""}`;
    return { kind: "run", ...resolveTsxCommand(skillRoot, [file, ...args]), cwd: skillRoot, label, where: "the skill root" };
  }
  if (argv.length === 1 && /\.ya?ml$/u.test(first)) {
    const file = insideSkillRoot(skillRoot, first);
    const relative = file ? path.relative(skillRoot, file).replace(/\\/gu, "/") : undefined;
    if (!file || !relative?.startsWith(LAUNCHBENCH_SCENARIO_DIRECTORY))
      return { kind: "invalid", detail: `a .yaml command must be a LaunchBench scenario under ${LAUNCHBENCH_SCENARIO_DIRECTORY}; got ${first}` };
    return { kind: "lint", file, label: relative };
  }
  return { kind: "run", executable: first, args: argv.slice(1), cwd: targetRoot, label: argv.join(" "), where: "the contribution root" };
}

function evaluateCommand(item: EvaluationCase, targetRoot: string, skillRoot: string, allowCommands: boolean): EvaluateCaseResult {
  const plan = planCommand(item.command ?? "", targetRoot, skillRoot);
  // A scenario lint reads one authored file and runs no process, so it needs no command allowance.
  if (plan.kind === "lint") return lintLaunchbenchScenario(item, plan.file, plan.label, skillRoot);
  if (!allowCommands) return result(item, "refused", "command cases run only when the CLI caller passes --allow-commands; nothing was executed");
  if (plan.kind === "invalid") return result(item, "failed", plan.detail);
  const run = spawnSync(plan.executable, plan.args, {
    cwd: plan.cwd,
    encoding: "utf8",
    timeout: COMMAND_TIMEOUT_MS,
    shell: false,
    env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "" },
  });
  const output = `${run.stdout ?? ""}\n${run.stderr ?? ""}`.trim();
  if (run.error) return result(item, "failed", `${plan.label} did not run: ${run.error.message}`);
  if (run.signal) return result(item, "failed", `${plan.label} ended by ${run.signal} (timeout ${COMMAND_TIMEOUT_MS} ms)`);
  if (run.status !== 0) return result(item, "failed", `${plan.label} exited ${run.status}: ${output.slice(-600)}`);
  return result(item, "passed", `${plan.label} exited 0 from ${plan.where}${output ? `: ${output.slice(-300)}` : ""}`);
}

export async function evaluateContribution(targetRoot: string, deps: { skillRoot: string; suite?: string; allowCommands: boolean }): Promise<EvaluateData> {
  const manifest = readContributionManifest(targetRoot);
  const units = new Map(manifest.units.map((unit) => [unit.id, unit]));
  const packages = new Map<string, CatalogKnowledgePackage>(loadKnowledgePackages(deps.skillRoot).map((pkg) => [pkg.id, pkg]));
  const selected = deps.suite ? manifest.evaluations.filter((item) => item.id === deps.suite || item.unitId === deps.suite) : manifest.evaluations;
  const cases: EvaluateCaseResult[] = [];
  for (const item of selected) {
    switch (item.kind) {
      case "counterexample":
        cases.push(evaluateCounterexample(item, units.get(item.unitId), targetRoot, deps.skillRoot, packages));
        break;
      case "launchbench-scenario":
        cases.push(evaluateLaunchbench(item, targetRoot, deps.skillRoot));
        break;
      case "command":
        cases.push(evaluateCommand(item, targetRoot, deps.skillRoot, deps.allowCommands));
        break;
      case "rendered-review":
        cases.push(result(item, "requires-review", "rendered review is a human or vision task; it never auto-passes"));
        break;
      case "comparison":
        cases.push(result(item, "requires-review", `${item.observations.length} recorded observation(s) reported as-is; a reviewer judges the comparison`));
        break;
      default: {
        const exhaustive: never = item.kind;
        cases.push(result(item, "failed", `unhandled evaluation kind ${String(exhaustive)}`));
      }
    }
  }
  const passed = cases.filter((entry) => entry.status === "passed").length;
  const failed = cases.some((entry) => entry.status === "failed");
  return { target: targetRoot, manifestId: manifest.id, cases, pass: passed > 0 && !failed };
}
