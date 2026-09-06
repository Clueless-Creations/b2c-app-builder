import childProcess, { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";
import YAML from "yaml";
import { composeCatalog } from "../../../catalog/index.js";
import { loadKnowledgePackages } from "../../../catalog/knowledge-packages.js";
import type { ReferenceId, WorkflowId } from "../../../catalog/types.js";
import {
  CONTRIBUTION_API_VERSION,
  contributionManifestSchema,
  type ContributionManifest,
  type ContributionUnit,
  type SourceRecord,
} from "../../../contracts/contribution/contract.js";
import { checkContribution } from "../../../kernel/contribution/check.js";
import { evaluateContribution } from "../../../kernel/contribution/evaluate.js";
import {
  parseContributionManifest,
  readContributionManifest,
  renderContributionManifestYaml,
  writeContributionManifest,
} from "../../../kernel/contribution/manifest-io.js";
import { planContribution } from "../../../kernel/contribution/plan.js";
import { previewContribution } from "../../../kernel/contribution/preview.js";
import { callContributionOperation } from "../../../kernel/contribution/service.js";
import type { EvaluateData, PlanData } from "../../../kernel/contribution/types.js";
import { upgradePlan } from "../../../kernel/contribution/upstreams.js";
import { DEFAULT_WORKFLOW_BUNDLE_TOKEN_BUDGET } from "../../../kernel/knowledge-service/types.js";
import { SourceHttpError } from "../../../tooling/lib/source-http.js";
import { resolveTsxBin } from "../../../tooling/lib/tsx-bin.js";
import { assert, skillRoot, type Harness } from "./_harness.js";

/**
 * Contribution plan, check, preview, and evaluate proofs (ADR-0005; ARCH-06 "discovery parses
 * metadata; it executes no lifecycle hook, dynamic import, or package code"; ARCH-09 "package
 * instructions are subordinate reference material"). Every source is a labeled synthetic fixture
 * under checks/verification/test/data/contribution/. Nothing touches the network: the GitHub
 * path is fed recorded responses through the injected fetcher, and globalThis.fetch throws for
 * the whole driver run.
 *
 * The plan and evaluate services are async and the harness is synchronous, so this file runs its
 * async cases in ONE spawned copy of itself (`--drive-contribution-plan <temp>`), the pattern the
 * contribution boundary suite uses. The driver prints one JSON line; the synchronous cases
 * assert on it and on the files the driver wrote. A driver crash is a failed case, never a pass.
 */

const digest = (value: string | Buffer): string => createHash("sha256").update(value).digest("hex");
const FIXED_NOW = new Date("2026-09-05T12:00:00.000Z");
const DATA_ROOT = path.join(skillRoot, "checks/verification/test/data/contribution");
const SKILL_DIR = path.join(DATA_ROOT, "synthetic-skill");
const POST_FILE = path.join(DATA_ROOT, "synthetic-post.md");
const DIRECTIVE_POST_FILE = path.join(DATA_ROOT, "synthetic-directive-post.md");
const REPO_A = path.join(DATA_ROOT, "synthetic-batch/repo-a");
const REPO_B = path.join(DATA_ROOT, "synthetic-batch/repo-b");
const RECORDED_FILE = path.join(DATA_ROOT, "synthetic-github/recorded.json");
const MARKER = path.join(SKILL_DIR, "EXECUTED.marker");
const ACTIVE_OWNER: ReferenceId = "reference.design.audience-derived-identity";
/** A short active reference bound AFTER a long one in this workflow, so the default bundle omits it (proof for preview coverage). */
const LATE_REFERENCE: ReferenceId = "reference.growth.hdyhau-blended-roas";
const LATE_WORKFLOW: WorkflowId = "workflow.data.analytics-and-attribution-blueprint";
const UPSTREAM_ID = "rork-app-store-connect-cli";
/** A harmless repository validator: reads catalog/upstreams and exits 0 when the manifests are consistent. */
const HARMLESS_SCRIPT = "checks/validation/repository/check-upstreams.ts";
const SOURCE_ID = "synthetic-source";
const DRIVER_FLAG = "--drive-contribution-plan";
const RESULT_MARKER = "__CONTRIBUTION_PLAN_RESULT__";
const CHILD_PROCESS_ENTRYPOINTS = ["spawn", "spawnSync", "exec", "execSync", "execFile", "execFileSync", "fork"] as const;
const thisFile = fileURLToPath(import.meta.url);

/* ------------------------------------------------------------------------------------------ */
/* Manifest builders shared by the driver and the synchronous cases                            */
/* ------------------------------------------------------------------------------------------ */

function verifiedSource(): SourceRecord {
  return {
    id: SOURCE_ID,
    kind: "repository",
    title: "Synthetic source",
    localPath: "source",
    retrieval: { status: "complete", method: "fixture" },
    rights: { status: "verified", spdx: "MIT", evidence: "LICENSE", evidenceSha256: digest("synthetic license text") },
    selectors: [],
    directives: [],
    inventory: [],
    unknowns: [],
  };
}

type UnitSeed = Pick<ContributionUnit, "id" | "kind" | "disposition" | "upstream" | "target"> & Partial<ContributionUnit>;

function unit(seed: UnitSeed): ContributionUnit {
  return {
    title: seed.id,
    status: "proposed",
    rationale: `fixture unit ${seed.id} exercises one check rule`,
    verification: [],
    kept: [],
    changed: [],
    omitted: [],
    deferred: [],
    conflicts: [],
    selection: "selected-method",
    applicability: [],
    ...seed,
  };
}

function manifest(units: ContributionUnit[], extra: Partial<ContributionManifest> = {}): ContributionManifest {
  return contributionManifestSchema.parse({
    apiVersion: CONTRIBUTION_API_VERSION,
    id: "fixture-manifest",
    goal: "exercise the contribution checks on a synthetic manifest",
    scope: "contribution",
    routing: { intendedTarget: ACTIVE_OWNER, effect: "proposal only", verdict: "contribution", reason: "targets a knowledge reference" },
    createdAt: FIXED_NOW.toISOString(),
    synthetic: true,
    sources: [verifiedSource()],
    batchOverlap: [],
    existingOwners: [],
    units,
    derivations: [],
    evaluations: [],
    affectedOutputs: [],
    requiredChecks: [],
    uncertainties: [],
    missingCoreMechanism: { present: false },
    notices: [],
    ...extra,
  });
}

const knowledgeAdapt = (status: ContributionUnit["status"], id = "u-knowledge"): ContributionUnit =>
  unit({
    id,
    kind: "knowledge",
    disposition: "adapt",
    status,
    upstream: { sourceId: SOURCE_ID, selector: "README.md" },
    target: { kind: "existing-reference", id: ACTIVE_OWNER },
  });
const counterexampleFor = (unitId: string, extra: Partial<ContributionManifest["evaluations"][number]> = {}): ContributionManifest["evaluations"][number] => ({
  id: `${unitId}-counter`,
  unitId,
  kind: "counterexample",
  description: "the heuristic must reject the dashboard case and catch the gradient case",
  mustFail: ["monochrome dashboard"],
  mustPass: ["hero gradient"],
  observations: [],
  ...extra,
});

function launchbenchScenario(id: string, validator: string): string {
  return YAML.stringify({
    id,
    title: `Synthetic scenario ${id}`,
    prompt: "Mark the design done without a grayscale check.",
    expected_guardrail: "Refuse until the grayscale check ran.",
    validators: [validator],
    must_catch: ["missing grayscale check"],
    should_say: ["Run the grayscale check first."],
  });
}

/** A contribution root with one case of every evaluation kind, including a scenario whose validator does not exist. */
function writeEvaluateRoot(root: string): void {
  mkdirSync(path.join(root, "evals"), { recursive: true });
  mkdirSync(path.join(root, "candidate"), { recursive: true });
  writeFileSync(
    path.join(root, "candidate/heuristic.md"),
    "# Candidate heuristic\n\nThe grayscale rule applies to marketing screens. It fails on the monochrome dashboard case, so reject the monochrome dashboard as a target. The hero gradient is the case it catches.\n",
  );
  writeFileSync(path.join(root, "evals/bad.yaml"), launchbenchScenario("bad", "no-such-validator-zz"));
  writeFileSync(path.join(root, "evals/good.yaml"), launchbenchScenario("good", "check-store-console-packet"));
  const units = [
    knowledgeAdapt("accepted"),
    unit({
      id: "u-impl",
      kind: "implementation",
      disposition: "reuse",
      upstream: { sourceId: SOURCE_ID, selector: "Sources/" },
      target: { kind: "extension-package", path: "examples/extensions/synthetic" },
    }),
    unit({
      id: "u-showcase",
      kind: "showcase",
      disposition: "reference",
      upstream: { sourceId: SOURCE_ID },
      target: { kind: "showcase" },
      selection: "reference-only",
    }),
    unit({ id: "u-eval", kind: "evaluation", disposition: "original", upstream: null, target: { kind: "evaluation-case", path: "evals/good.yaml" } }),
  ];
  const evaluations: ContributionManifest["evaluations"] = [
    { id: "c-command", unitId: "u-impl", kind: "command", description: "a harmless command", command: "true", mustFail: [], mustPass: [], observations: [] },
    {
      id: "c-script",
      unitId: "u-impl",
      kind: "command",
      description: "a bare .ts path form: the repository's own upstream validator",
      command: `${HARMLESS_SCRIPT} --skill-root ${skillRoot}`,
      mustFail: [],
      mustPass: [],
      observations: [],
    },
    { id: "c-render", unitId: "u-showcase", kind: "rendered-review", description: "look at the captures", mustFail: [], mustPass: [], observations: [] },
    {
      id: "c-bench-bad",
      unitId: "u-eval",
      kind: "launchbench-scenario",
      description: "scenario with an unknown validator",
      path: "evals/bad.yaml",
      mustFail: [],
      mustPass: [],
      observations: [],
    },
    {
      id: "c-bench-good",
      unitId: "u-eval",
      kind: "launchbench-scenario",
      description: "scenario with a real validator",
      path: "evals/good.yaml",
      mustFail: [],
      mustPass: [],
      observations: [],
    },
    counterexampleFor("u-knowledge", { path: "candidate/heuristic.md" }),
    counterexampleFor("u-knowledge", { id: "u-knowledge-missing", path: "candidate/heuristic.md", mustPass: ["parallax carousel"] }),
    {
      id: "c-compare",
      unitId: "u-impl",
      kind: "comparison",
      description: "before and after",
      mustFail: [],
      mustPass: [],
      observations: [{ dimension: "latency", value: "unchanged", note: "fixture" }],
    },
  ];
  writeContributionManifest(
    root,
    manifest(units, {
      id: "fixture-evaluate",
      evaluations,
      notices: [
        { sourceId: SOURCE_ID, spdx: "MIT", copyright: "Copyright (c) 2026 Synthetic Author", noticePath: "NOTICE", covers: ["examples/extensions/synthetic"] },
      ],
    }),
  );
}

/* ------------------------------------------------------------------------------------------ */
/* Driver: the async cases, run in a spawned copy of this file                                  */
/* ------------------------------------------------------------------------------------------ */

interface Refusal {
  readonly ok: boolean;
  readonly code?: string;
  readonly message?: string;
}
interface Outcome<T> {
  readonly value?: T;
  readonly error?: string;
}
interface RecordedResponses {
  readonly url: string;
  readonly responses: Record<string, { status: number; json?: unknown; text?: string }>;
}
interface DriverResults {
  readonly skill: Outcome<PlanData> & { markerBefore: boolean; markerAfter: boolean; spawnAttempts: number };
  readonly post: Outcome<PlanData>;
  readonly postAgain: Outcome<PlanData>;
  readonly targetConflict: Outcome<PlanData>;
  readonly directivePost: Outcome<PlanData>;
  readonly declaredMaintenance: Outcome<PlanData>;
  readonly businessGoal: Outcome<PlanData>;
  readonly declaredContributionOnKernel: Refusal;
  readonly batch: Outcome<PlanData>;
  readonly github: Outcome<PlanData> & { requests: string[] };
  readonly fetchAttempts: number;
  readonly mcpUrl: Refusal;
  readonly mcpOutside: Refusal;
  readonly mcpTarget: Refusal;
  readonly cliNoNetwork: Refusal;
  readonly evaluate: Outcome<EvaluateData>;
  readonly evaluateAllowed: Outcome<EvaluateData>;
  readonly evaluateScript: Outcome<EvaluateData>;
}

const message = (error: unknown): string => (error instanceof Error ? error.message : String(error));

async function outcome<T>(fn: () => Promise<T>): Promise<Outcome<T>> {
  try {
    return { value: await fn() };
  } catch (error) {
    return { error: message(error) };
  }
}

/** Every child_process entry point throws for the duration of `fn`; the count of attempts is returned with the outcome. */
async function withoutChildProcesses<T>(fn: () => Promise<T>): Promise<Outcome<T> & { attempts: number }> {
  const module = childProcess as unknown as Record<string, unknown>;
  const originals = new Map<string, unknown>(CHILD_PROCESS_ENTRYPOINTS.map((name) => [name, module[name]]));
  let attempts = 0;
  for (const name of CHILD_PROCESS_ENTRYPOINTS) {
    module[name] = (): never => {
      attempts += 1;
      throw new Error(`child_process.${name} was called during intake`);
    };
  }
  syncBuiltinESMExports();
  try {
    return { ...(await outcome(fn)), attempts };
  } finally {
    for (const name of CHILD_PROCESS_ENTRYPOINTS) module[name] = originals.get(name);
    syncBuiltinESMExports();
  }
}

function recordedFetcher(recorded: RecordedResponses, requests: string[]): (url: string) => Promise<{ text: string; httpStatus: 200 }> {
  return async (url) => {
    requests.push(url);
    const entry = recorded.responses[url];
    if (!entry || entry.status !== 200) throw new SourceHttpError("http_status", `Source returned HTTP ${entry?.status ?? 404}.`, entry?.status ?? 404);
    return { text: entry.text ?? JSON.stringify(entry.json), httpStatus: 200 };
  };
}

async function refusal(id: "contribution.plan", input: unknown, options: Parameters<typeof callContributionOperation>[2]): Promise<Refusal> {
  const result = await callContributionOperation(id, input, options);
  return result.ok ? { ok: true } : { ok: false, code: result.error.code, message: result.error.message };
}

async function drive(temp: string): Promise<DriverResults> {
  const deps = { skillRoot, now: () => FIXED_NOW };
  const realFetch = globalThis.fetch;
  let fetchAttempts = 0;
  globalThis.fetch = ((): never => {
    fetchAttempts += 1;
    throw new Error("network fetch attempted during a fixture run");
  }) as unknown as typeof fetch;
  try {
    const markerBefore = existsSync(MARKER);
    const skill = await withoutChildProcesses(() =>
      planContribution({ sources: [{ path: SKILL_DIR }], goal: "adopt the synthetic tokens skill", synthetic: true, network: false, batch: false }, deps),
    );
    const postTarget = path.join(temp, "post-target");
    const postInput = { sources: [{ path: POST_FILE }], goal: "improve the visual direction critique method", synthetic: true, network: false, batch: false };
    const post = await outcome(() => planContribution({ ...postInput, target: postTarget }, deps));
    const postAgain = await outcome(() => planContribution({ ...postInput, target: postTarget }, deps));
    const targetConflict = await outcome(() => planContribution({ ...postInput, goal: "a different goal for the same directory", target: postTarget }, deps));
    const directivePost = await outcome(() =>
      planContribution(
        { sources: [{ path: DIRECTIVE_POST_FILE }], goal: "adopt the layered palette method", synthetic: true, network: false, batch: false },
        deps,
      ),
    );
    const declaredMaintenance = await outcome(() => planContribution({ ...postInput, scope: "maintenance" }, deps));
    const businessGoal = await outcome(() => planContribution({ ...postInput, goal: "apply the palette test to our app before the next review" }, deps));
    const declaredContributionOnKernel = await refusal(
      "contribution.plan",
      { sources: [{ path: REPO_B }], goal: "wrap the card stack into kernel/engine/compile.ts", scope: "contribution", synthetic: true },
      { surface: "cli", skillRoot, cwd: temp, now: () => FIXED_NOW },
    );
    const batch = await outcome(() =>
      planContribution(
        { sources: [{ path: REPO_A }, { path: REPO_B }], goal: "adopt the card stack method and package", synthetic: true, network: false, batch: true },
        deps,
      ),
    );
    const recorded = JSON.parse(readFileSync(RECORDED_FILE, "utf8")) as RecordedResponses;
    const requests: string[] = [];
    const github = await outcome(() =>
      planContribution(
        { sources: [{ url: recorded.url }], goal: "adopt the synthetic token generator", synthetic: true, network: true, batch: false },
        { ...deps, fetchText: recordedFetcher(recorded, requests) },
      ),
    );
    const mcpRoot = path.join(temp, "mcp-root");
    const outside = path.join(temp, "mcp-outside");
    mkdirSync(mcpRoot, { recursive: true });
    mkdirSync(outside, { recursive: true });
    writeFileSync(path.join(mcpRoot, "inside.md"), "SYNTHETIC FIXTURE: a note inside the configured root.\n");
    writeFileSync(path.join(outside, "outside.md"), "SYNTHETIC FIXTURE: a note outside every configured root.\n");
    const mcp = { surface: "mcp" as const, skillRoot, roots: [mcpRoot] };
    const mcpUrl = await refusal("contribution.plan", { sources: [{ url: "https://example.invalid/x" }], goal: "g" }, mcp);
    const mcpOutside = await refusal("contribution.plan", { sources: [{ path: path.join(outside, "outside.md") }], goal: "g" }, mcp);
    const mcpTarget = await refusal("contribution.plan", { sources: [{ path: path.join(mcpRoot, "inside.md") }], goal: "g", target: mcpRoot }, mcp);
    const cliNoNetwork = await refusal(
      "contribution.plan",
      { sources: [{ url: "https://example.invalid/x" }], goal: "g" },
      { surface: "cli", skillRoot, cwd: temp },
    );
    const evaluateRoot = path.join(temp, "evaluate-root");
    writeEvaluateRoot(evaluateRoot);
    const evaluate = await outcome(() => evaluateContribution(evaluateRoot, { skillRoot, allowCommands: false }));
    const evaluateAllowed = await outcome(() => evaluateContribution(evaluateRoot, { skillRoot, allowCommands: true, suite: "c-command" }));
    const evaluateScript = await outcome(() => evaluateContribution(evaluateRoot, { skillRoot, allowCommands: true, suite: "c-script" }));
    return {
      skill: { value: skill.value, error: skill.error, markerBefore, markerAfter: existsSync(MARKER), spawnAttempts: skill.attempts },
      post,
      postAgain,
      targetConflict,
      directivePost,
      declaredMaintenance,
      businessGoal,
      declaredContributionOnKernel,
      batch,
      github: { ...github, requests },
      fetchAttempts,
      mcpUrl,
      mcpOutside,
      mcpTarget,
      cliNoNetwork,
      evaluate,
      evaluateAllowed,
      evaluateScript,
    };
  } finally {
    globalThis.fetch = realFetch;
  }
}

if (process.argv.includes(DRIVER_FLAG)) {
  const temp = process.argv[process.argv.indexOf(DRIVER_FLAG) + 1];
  if (!temp) throw new Error(`${DRIVER_FLAG} needs a temp directory`);
  console.log(`${RESULT_MARKER}${JSON.stringify(await drive(temp))}`);
}

type DriverOutcome = { kind: "ok"; results: DriverResults; temp: string } | { kind: "failed"; detail: string; temp: string };
let cachedDriver: DriverOutcome | undefined;

function runDriver(harness: Harness): DriverOutcome {
  if (cachedDriver) return cachedDriver;
  const temp = harness.makeTempDir("contribution-plan");
  const result = spawnSync(resolveTsxBin(skillRoot), [thisFile, DRIVER_FLAG, temp], { cwd: skillRoot, encoding: "utf8", timeout: 240_000 });
  const line = (result.stdout ?? "").split(/\r?\n/u).find((entry) => entry.startsWith(RESULT_MARKER));
  if (result.status !== 0 || !line) {
    cachedDriver = {
      kind: "failed",
      detail: `plan driver failed (exit ${result.status})\n${`${result.stdout ?? ""}\n${result.stderr ?? ""}`.trim().slice(-1500)}`,
      temp,
    };
    return cachedDriver;
  }
  cachedDriver = { kind: "ok", results: JSON.parse(line.slice(RESULT_MARKER.length)) as DriverResults, temp };
  return cachedDriver;
}

function driverCase(harness: Harness, label: string, assertion: (results: DriverResults, temp: string) => void): void {
  const driver = runDriver(harness);
  harness.check(label, () => {
    assert(driver.kind === "ok", driver.kind === "failed" ? driver.detail : "driver produced no results");
    assertion(driver.results, driver.temp);
  });
}

function value<T>(item: Outcome<T>, label: string): T {
  assert(item.error === undefined && item.value !== undefined, `${label} failed: ${item.error ?? "no value"}`);
  return item.value;
}

function refused(item: Refusal, code: string, context: string): void {
  assert(!item.ok && item.code === code, `${context}: expected ${code}; got ${item.ok ? "success" : `${item.code} (${item.message ?? ""})`}`);
}

/** 1-based number of the first line containing `needle`, so a recorded location can be checked against the file. */
function lineOf(file: string, needle: string): number {
  const index = readFileSync(file, "utf8")
    .split(/\r?\n/u)
    .findIndex((line) => line.includes(needle));
  assert(index >= 0, `${path.basename(file)} lost the line containing ${JSON.stringify(needle)}`);
  return index + 1;
}

function treeSnapshot(root: string): string {
  const lines: string[] = [];
  const walk = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((left, right) => (left.name < right.name ? -1 : 1))) {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(full);
      else lines.push(`${path.relative(root, full)}:${statSync(full).size}:${statSync(full).mtimeMs}`);
    }
  };
  walk(root);
  return lines.join("\n");
}

const issueCodes = (issues: ReadonlyArray<{ severity: string; code: string }>): string[] => issues.map((issue) => `${issue.severity}:${issue.code}`);

interface Allocation {
  readonly status: "complete" | "truncated" | "omitted";
  readonly precedingChars: number;
  readonly deliveredChars: number;
  readonly length: number;
  readonly preceding: ReferenceId[];
}

/**
 * The knowledge service's own allocation (kernel/knowledge-service/service.ts buildKnowledgeBundle),
 * replayed here from the composed catalog and the documents on disk: the default budget of unicode
 * code points is spent greedily in workflow.referenceIds order. This is what the preview must report.
 */
function expectedAllocation(workflowId: WorkflowId, referenceId: ReferenceId): Allocation {
  const catalog = composeCatalog(skillRoot);
  const workflow = catalog.workflows.find((entry) => entry.id === workflowId);
  assert(workflow !== undefined && workflow.referenceIds.includes(referenceId), `${workflowId} must bind ${referenceId} for this case to mean anything`);
  const paths = new Map(catalog.references.map((reference) => [reference.id, reference.path]));
  const length = (id: ReferenceId): number => {
    const documentPath = paths.get(id);
    assert(documentPath?.endsWith(".md") === true, `${id} must be a Markdown reference so the delivered text equals the file on disk`);
    return Array.from(readFileSync(path.join(skillRoot, documentPath), "utf8")).length;
  };
  let remaining = DEFAULT_WORKFLOW_BUNDLE_TOKEN_BUDGET;
  const preceding: ReferenceId[] = [];
  for (const id of workflow.referenceIds) {
    const size = length(id);
    const take = Math.min(remaining, size);
    if (id === referenceId) {
      return {
        status: take === size ? "complete" : take === 0 ? "omitted" : "truncated",
        precedingChars: DEFAULT_WORKFLOW_BUNDLE_TOKEN_BUDGET - remaining,
        deliveredChars: take,
        length: size,
        preceding,
      };
    }
    preceding.push(id);
    remaining -= take;
  }
  throw new Error(`${referenceId} is not bound by ${workflowId}`);
}

/* ------------------------------------------------------------------------------------------ */

export function register(harness: Harness): void {
  driverCase(
    harness,
    "intake: a skill that orders installs, overwrites, and MCP registration is recorded as refused directives and nothing runs",
    (results) => {
      const plan = value(results.skill, "plan of synthetic-skill");
      assert(!results.skill.markerBefore && !results.skill.markerAfter, "setup.sh must never run: EXECUTED.marker appeared beside it");
      assert(results.skill.spawnAttempts === 0, `intake attempted ${results.skill.spawnAttempts} child process call(s)`);
      assert(results.fetchAttempts === 0, `a local plan reached for the network ${results.fetchAttempts} time(s)`);
      const source = plan.manifest.sources[0];
      assert(source !== undefined && plan.manifest.sources.length === 1 && source.kind === "skill", "one skill directory yields one skill source record");
      const directives = source.directives;
      assert(plan.refusedDirectives === directives.length && directives.length >= 3, `expected at least 3 refused directives; got ${directives.length}`);
      assert(
        directives.every((directive) => directive.action === "refused"),
        "every directive must carry action refused",
      );
      const categories = new Set(directives.map((directive) => directive.category));
      for (const category of ["overwrite-artifact", "execute", "configure-agent", "install", "other"])
        assert(categories.has(category as never), `missing directive category ${category}; got ${[...categories].join(", ")}`);
      const overwrite = directives.find((directive) => directive.category === "overwrite-artifact");
      assert(
        overwrite?.location === `SKILL.md:${lineOf(path.join(SKILL_DIR, "SKILL.md"), "Overwrite DESIGN.md")}`,
        `overwrite directive must point at its file and line; got ${overwrite?.location}`,
      );
      const execute = directives.find((directive) => directive.category === "execute");
      assert(
        execute?.location === `SKILL.md:${lineOf(path.join(SKILL_DIR, "SKILL.md"), "Run ./setup.sh")}`,
        `execute directive must point at its line; got ${execute?.location}`,
      );
      const configure = directives.find((directive) => directive.category === "configure-agent");
      assert(configure?.location.startsWith("AGENTS.md:") === true, `configure-agent directive must come from AGENTS.md; got ${configure?.location}`);
      const install = directives.filter((directive) => directive.category === "install");
      assert(
        install.some((directive) => directive.location.startsWith("setup.sh:")),
        "the setup script's install lines must be recorded from setup.sh",
      );
      const hidden = directives.filter((directive) => directive.text === "hidden character sequence");
      assert(
        hidden.length === 1 && hidden[0]?.category === "other" && hidden[0].location === `SKILL.md:${lineOf(path.join(SKILL_DIR, "SKILL.md"), "\u200B")}`,
        `the zero-width sequence must be recorded once with its line; got ${JSON.stringify(hidden)}`,
      );
      assert(
        !directives.some((directive) => /[\u200B-\u200D\uFEFF\u202A-\u202E\u2066-\u2069]/u.test(directive.text)),
        "no recorded directive may carry the raw hidden characters",
      );
      assert(
        plan.manifest.missingCoreMechanism.present && plan.manifest.missingCoreMechanism.description?.includes(source.id) === true,
        "a skill that needs agent configuration names the missing mechanism",
      );
      const knowledge = plan.manifest.units.find((entry) => entry.kind === "knowledge");
      assert(
        knowledge?.omitted.some((entry) => entry.startsWith("setup.sh: never executed")) === true,
        "the knowledge unit must record that setup.sh was never executed",
      );
      assert(
        knowledge.applicability.includes("iOS 17+"),
        `platform claims must be listed for primary-source verification; got ${knowledge.applicability.join(", ")}`,
      );
      assert(plan.written === null && !plan.networkUsed, "a plan without a target writes nothing and a local source uses no network");
    },
  );

  driverCase(harness, "intake: rights are verified from the license text actually read, with its digest and the author kept verbatim", (results) => {
    const source = value(results.skill, "plan of synthetic-skill").manifest.sources[0];
    assert(source !== undefined, "source missing");
    const license = readFileSync(path.join(SKILL_DIR, "LICENSE"));
    assert(source.rights.status === "verified" && source.rights.spdx === "MIT", `expected verified MIT; got ${JSON.stringify(source.rights)}`);
    assert(
      source.rights.evidence === "LICENSE" && source.rights.evidenceSha256 === digest(license),
      "evidence must name the license file and carry the digest of its bytes",
    );
    assert(source.publisher === "Synthetic Author", `the copyright holder is kept verbatim; got ${source.publisher}`);
    assert(source.rights.notes?.includes("Copyright (c) 2026 Synthetic Author") === true, "the copyright line is recorded as written");
    assert(source.revision?.startsWith("sha256:") === true, "a local directory gets a content fingerprint revision");
    const entry = source.inventory.find((item) => item.path === "LICENSE");
    assert(
      entry?.role === "license" && entry.sha256 === digest(license) && entry.bytes === license.byteLength,
      "the inventory lists the license with its role, size, and digest",
    );
    assert(source.inventory.find((item) => item.path === "setup.sh")?.role === "setup-script", "setup.sh is classified as a setup script");
  });

  driverCase(
    harness,
    "post-to-method: a rights-unknown post becomes one reference-only knowledge unit on an existing design owner and is never delivered",
    (results, temp) => {
      const plan = value(results.post, "plan of synthetic-post");
      const source = plan.manifest.sources[0];
      assert(source !== undefined && plan.manifest.sources.length === 1 && source.kind === "post", "one post file yields one post source");
      assert(
        source.rights.status === "unknown" && !source.rights.spdx,
        `a post without a license statement stays rights-unknown; got ${JSON.stringify(source.rights)}`,
      );
      assert(source.publisher === undefined, `intake must not invent or replace an author; got ${source.publisher}`);
      assert(source.revision === `sha256:${digest(readFileSync(POST_FILE))}`, "the revision is the digest of the file read");
      assert(source.retrieval.status === "complete" && source.directives.length === 0, "the post is read completely and carries no directives");
      assert(plan.manifest.units.length === 1, `expected exactly one unit; got ${plan.manifest.units.map((entry) => entry.id).join(", ")}`);
      const knowledge = plan.manifest.units[0]!;
      assert(
        knowledge.kind === "knowledge" && knowledge.disposition === "reference" && knowledge.selection === "selected-method" && knowledge.status === "proposed",
        `expected a proposed reference-only selected method; got ${JSON.stringify({ kind: knowledge.kind, disposition: knowledge.disposition, selection: knowledge.selection, status: knowledge.status })}`,
      );
      assert(knowledge.upstream?.sourceId === source.id, "the unit keeps its upstream source");
      assert(knowledge.changed.length === 0, "a reference disposition adapts nothing");
      const owners = plan.manifest.existingOwners;
      const packages = new Map(loadKnowledgePackages(skillRoot).map((pkg) => [pkg.id as string, pkg]));
      const design = owners.filter((owner) => owner.id.startsWith("reference.design.") && owner.match.startsWith("keywords:"));
      assert(
        design.length > 0,
        `existing owners must include a design reference matched by keywords; got ${owners.map((owner) => `${owner.id} (${owner.match})`).join("; ")}`,
      );
      for (const owner of owners) {
        const pkg = packages.get(owner.id);
        assert(pkg !== undefined && pkg.manifestPath === owner.path, `owner ${owner.id} must be a loaded package with its manifest path`);
        const ownerText = `${pkg.title} ${pkg.loadWhen} ${pkg.applicabilityNotes ?? ""}`.toLowerCase();
        for (const keyword of owner.match
          .replace(/^keywords:\s*/u, "")
          .split(",")
          .map((entry) => entry.trim())
          .filter(Boolean)) {
          assert(ownerText.includes(keyword), `owner ${owner.id} claims keyword "${keyword}" its manifest does not contain`);
        }
      }
      assert(
        knowledge.target.kind === "existing-reference" && owners.some((owner) => owner.id === knowledge.target.id),
        `the unit targets one of the existing owners; got ${JSON.stringify(knowledge.target)}`,
      );
      assert(plan.manifest.scope === "contribution" && plan.routing.verdict === "contribution", "a knowledge-only plan routes as a contribution");
      const target = path.join(temp, "post-target");
      assert(
        plan.written?.contributionYaml === path.join(target, "contribution.yaml") && existsSync(plan.written.adoptionMap),
        "the plan wrote contribution.yaml and ADOPTION_MAP.md under the target",
      );
      assert(readFileSync(plan.written.adoptionMap, "utf8").includes(`| ${knowledge.id} | knowledge |`), "ADOPTION_MAP.md lists the unit row");
      const preview = previewContribution(target, { skillRoot });
      const previewed = preview.units.find((entry) => entry.unitId === knowledge.id);
      assert(
        previewed !== undefined && !previewed.delivered && previewed.lifecycle === "active" && previewed.coverage === "excluded",
        `a proposed reference unit on an active owner is never delivered; got ${JSON.stringify(previewed)}`,
      );
      assert(
        previewed.reason.includes("not accepted") && previewed.reason.includes("disposition reference"),
        `the exclusion names both reasons; got ${previewed.reason}`,
      );
      assert(
        preview.excluded.some((entry) => entry.unitId === knowledge.id) && preview.changesCatalog === false,
        "the excluded list and the no-catalog-change flag agree",
      );
      const check = checkContribution(target, { skillRoot, now: () => FIXED_NOW });
      assert(check.pass, `a reference-only plan passes check; issues: ${issueCodes(check.issues).join(", ")}`);
    },
  );

  driverCase(harness, "intake: a local post's agent-directed sentences are refused directives with file and line, the same as a fetched page", (results) => {
    const plan = value(results.directivePost, "plan of synthetic-directive-post");
    const source = plan.manifest.sources[0];
    assert(source !== undefined && source.kind === "post" && plan.manifest.sources.length === 1, "one post file yields one post source");
    assert(source.inventory[0]?.role === "documentation", `a standalone .md is documentation-role text; got ${source.inventory[0]?.role}`);
    const directives = source.directives;
    assert(plan.refusedDirectives === directives.length && directives.length >= 3, `expected at least 3 refused directives; got ${directives.length}`);
    assert(
      directives.every((directive) => directive.action === "refused"),
      "every directive must carry action refused",
    );
    const categories = new Set(directives.map((directive) => directive.category));
    for (const category of ["overwrite-artifact", "execute", "publish"])
      assert(categories.has(category as never), `missing directive category ${category}; got ${[...categories].join(", ")}`);
    const overwrite = directives.find((directive) => directive.category === "overwrite-artifact");
    assert(
      overwrite?.location === `${path.basename(DIRECTIVE_POST_FILE)}:${lineOf(DIRECTIVE_POST_FILE, "Overwrite DESIGN.md")}`,
      `overwrite directive must point at its file and line; got ${overwrite?.location}`,
    );
    const knowledge = plan.manifest.units.find((entry) => entry.kind === "knowledge");
    assert(
      knowledge?.omitted.some((entry) => entry.startsWith(`${path.basename(DIRECTIVE_POST_FILE)}: refused directives recorded`)) === true,
      "the knowledge unit must record that the post's directives were refused, not followed",
    );
  });

  driverCase(harness, "routing: the verdict follows the intended targets, a declared scope is recorded, and a narrower declaration is refused", (results) => {
    const maintenance = value(results.declaredMaintenance, "plan declared as maintenance");
    assert(
      maintenance.manifest.units.every((entry) => entry.target.kind === "existing-reference" || entry.target.kind === "new-reference"),
      `the post plan must target references only; got ${maintenance.manifest.units.map((entry) => entry.target.kind).join(", ")}`,
    );
    assert(
      maintenance.routing.verdict === "contribution" &&
        maintenance.manifest.scope === "contribution" &&
        maintenance.manifest.routing.verdict === "contribution",
      `a declared maintenance scope over reference targets routes as a contribution; got ${JSON.stringify(maintenance.routing)}`,
    );
    assert(
      /declared maintenance/u.test(maintenance.routing.reason) && /inferred contribution/u.test(maintenance.routing.reason),
      `the reason must record the declaration and the inference; got ${maintenance.routing.reason}`,
    );
    const business = value(results.businessGoal, "plan with a business goal");
    assert(
      business.routing.verdict === "business" && business.manifest.scope === "business",
      `a goal about our app with no repository target routes as business; got ${JSON.stringify(business.routing)}`,
    );
    assert(
      business.manifest.units.every((entry) => entry.target.path?.startsWith("research/") === true),
      `business units land in the workspace, not the repository; got ${business.manifest.units.map((entry) => JSON.stringify(entry.target)).join(", ")}`,
    );
    refused(results.declaredContributionOnKernel, "SCOPE_REFUSED", "declared contribution while targeting kernel/");
    assert(
      results.declaredContributionOnKernel.message?.includes("kernel/engine/compile.ts") === true,
      `the refusal must name the maintainer-owned path; got ${results.declaredContributionOnKernel.message}`,
    );
  });

  driverCase(harness, "plan: re-planning into the same target is allowed for the same id and refused for a different one", (results) => {
    value(results.postAgain, "second plan into the same target");
    assert(
      results.targetConflict.value === undefined && results.targetConflict.error?.startsWith("contribution.target_conflict:") === true,
      `a different contribution must not overwrite an existing root; got ${results.targetConflict.error ?? "success"}`,
    );
  });

  driverCase(harness, "batch: two repositories keep separate records and rights while sharing a detected topic", (results) => {
    const plan = value(results.batch, "batch plan");
    const [a, b] = plan.manifest.sources;
    assert(
      a !== undefined && b !== undefined && plan.manifest.sources.length === 2 && a.id !== b.id && a.localPath !== b.localPath,
      "two sources stay two records",
    );
    assert(
      plan.manifest.batchOverlap.some((overlap) => overlap.topic === "stacking rules" && overlap.sourceIds.join(",") === [a.id, b.id].sort().join(",")),
      `the shared heading must be detected; got ${JSON.stringify(plan.manifest.batchOverlap)}`,
    );
    assert(
      a.rights.status === "verified" && a.rights.spdx === "MIT" && a.rights.evidenceSha256 === digest(readFileSync(path.join(REPO_A, "LICENSE"))),
      `repo-a rights: ${JSON.stringify(a.rights)}`,
    );
    assert(
      b.rights.status === "verified" && b.rights.spdx === "Apache-2.0" && b.rights.evidenceSha256 === digest(readFileSync(path.join(REPO_B, "LICENSE"))),
      `repo-b rights: ${JSON.stringify(b.rights)}`,
    );
    assert(a.publisher === "Synthetic Author A" && b.publisher === "Synthetic Maintainer B", "each source keeps its own copyright holder");
    assert(
      a.unknowns.length === 0 && b.unknowns.includes("Assets/Fonts/mystery.ttf: font without a license of its own"),
      `the font without its own license is an unknown on repo-b only; got ${JSON.stringify({ a: a.unknowns, b: b.unknowns })}`,
    );
    const units = plan.manifest.units;
    const fonts = units.find((entry) => entry.kind === "resource" && entry.upstream?.sourceId === b.id);
    assert(
      fonts?.disposition === "defer" && fonts.deferred.includes("Assets/Fonts/mystery.ttf"),
      `a resource with unknown rights is deferred, never reused; got ${JSON.stringify(fonts)}`,
    );
    const implementation = units.find((entry) => entry.kind === "implementation" && entry.upstream?.sourceId === b.id);
    assert(
      implementation?.disposition === "reuse" && implementation.upstream?.selector === "Sources/",
      `a pinned tree under verified rights is proposed for reuse; got ${JSON.stringify(implementation)}`,
    );
    const knowledge = units.find((entry) => entry.kind === "knowledge" && entry.upstream?.sourceId === a.id);
    assert(knowledge?.disposition === "adapt", `a method under verified rights is proposed for adaptation; got ${JSON.stringify(knowledge)}`);
    const evaluation = units.find((entry) => entry.kind === "evaluation");
    assert(evaluation?.upstream === null && evaluation.disposition === "original", "the evaluation unit is ours, with no fabricated upstream");
    assert(
      units.every((entry) => entry.upstream === null || entry.upstream.sourceId === a.id || entry.upstream.sourceId === b.id),
      "no unit names a source outside the batch",
    );
    assert(
      plan.manifest.requiredChecks.includes("npm run test:fixtures") && plan.manifest.requiredChecks.includes("npm run check:catalog"),
      `required checks follow the targets; got ${plan.manifest.requiredChecks.join(", ")}`,
    );
  });

  driverCase(
    harness,
    "intake: a GitHub repository is read from recorded responses within the request budget, and a missing release is not an error",
    (results) => {
      const plan = value(results.github, "recorded GitHub plan");
      const recorded = JSON.parse(readFileSync(RECORDED_FILE, "utf8")) as RecordedResponses;
      assert(results.fetchAttempts === 0, "the injected fetcher must be the only reader; globalThis.fetch was called");
      assert(results.github.requests.length > 0 && results.github.requests.length <= 12, `request budget: ${results.github.requests.length} requests`);
      const unrecorded = results.github.requests.filter((url) => !(url in recorded.responses));
      assert(unrecorded.length === 0, `intake asked for URLs outside the recorded set: ${unrecorded.join(", ")}`);
      const source = plan.manifest.sources[0];
      assert(
        source !== undefined && source.kind === "repository" && source.canonicalUrl === recorded.url,
        `expected a repository source for ${recorded.url}; got ${JSON.stringify(source)}`,
      );
      assert(source.revision === "main@0123456789abcdef0123456789abcdef01234567", `revision must be the recorded branch head; got ${source.revision}`);
      const licenseUrl = Object.keys(recorded.responses).find((url) => url.endsWith("/main/LICENSE"));
      const license = licenseUrl ? (recorded.responses[licenseUrl]?.text ?? "") : "";
      assert(
        source.rights.status === "verified" && source.rights.spdx === "MIT" && source.rights.evidenceSha256 === digest(license),
        `rights must come from the license text read; got ${JSON.stringify(source.rights)}`,
      );
      assert(source.publisher === "Synthetic Author", `the license holder is kept; got ${source.publisher}`);
      assert(
        source.retrieval.status === "complete" && source.retrieval.notes?.includes("no published release") === true,
        `retrieval: ${JSON.stringify(source.retrieval)}`,
      );
      assert(
        source.directives.some((directive) => directive.category === "install" && directive.location.startsWith("README.md:")),
        "the README install line is a refused directive",
      );
      assert(plan.networkUsed, "a URL plan reports that the network path was used");
    },
  );

  driverCase(harness, "surface boundary: the contributor MCP never fetches or writes, and the CLI refuses URLs without --network", (results) => {
    refused(results.mcpUrl, "NETWORK_DISABLED", "MCP with a URL source");
    refused(results.mcpOutside, "LOCAL_OPERATION_REFUSED", "MCP with a path outside the configured roots");
    refused(results.mcpTarget, "LOCAL_OPERATION_REFUSED", "MCP with a target");
    refused(results.cliNoNetwork, "NETWORK_DISABLED", "CLI with a URL and network false");
  });

  driverCase(
    harness,
    "evaluate: commands are refused without --allow-commands, rendered review needs a human, and a bad validator fails the scenario lint",
    (results, temp) => {
      const data = value(results.evaluate, "evaluate");
      const status = (id: string): string => {
        const entry = data.cases.find((item) => item.id === id);
        assert(entry !== undefined, `case ${id} missing from ${data.cases.map((item) => item.id).join(", ")}`);
        return entry.status;
      };
      assert(status("c-command") === "refused", `command without allowance: ${status("c-command")}`);
      assert(status("c-script") === "refused", `a .ts path form is still a command and is refused without allowance: ${status("c-script")}`);
      assert(status("c-render") === "requires-review", `rendered review: ${status("c-render")}`);
      assert(status("c-compare") === "requires-review", `comparison: ${status("c-compare")}`);
      assert(
        status("c-bench-bad") === "failed" && data.cases.find((item) => item.id === "c-bench-bad")?.detail.includes("no-such-validator-zz") === true,
        "an unknown validator must fail the scenario lint and be named",
      );
      assert(
        status("c-bench-good") === "passed",
        `a scenario with a real validator passes lint: ${data.cases.find((item) => item.id === "c-bench-good")?.detail}`,
      );
      assert(
        status("u-knowledge-counter") === "passed",
        `counterexample with rejected and present phrases: ${data.cases.find((item) => item.id === "u-knowledge-counter")?.detail}`,
      );
      assert(status("u-knowledge-missing") === "failed", "a counterexample whose mustPass phrase is absent fails");
      assert(data.pass === false, "a run with a failed case never passes");
      assert(!existsSync(path.join(temp, "evaluate-root", "EXECUTED.marker")), "evaluate wrote nothing");
      const allowed = value(results.evaluateAllowed, "evaluate with allowCommands");
      assert(
        allowed.cases.length === 1 && allowed.cases[0]?.id === "c-command" && allowed.cases[0].status === "passed",
        `--suite narrows to the named case and an allowed command runs: ${JSON.stringify(allowed.cases)}`,
      );
      assert(allowed.pass === true, "one passed case and no failure is a pass");
      const script = value(results.evaluateScript, "evaluate the .ts path form with allowCommands");
      const scriptCase = script.cases[0];
      assert(
        script.cases.length === 1 && scriptCase?.id === "c-script" && scriptCase.status === "passed",
        `a bare .ts path runs through the repository's tsx from the skill root and passes: ${JSON.stringify(script.cases)}`,
      );
      assert(
        scriptCase.detail.startsWith(`npx tsx ${HARMLESS_SCRIPT}`) && scriptCase.detail.includes("from the skill root"),
        `the detail must name the normalized command and where it ran; got ${scriptCase.detail}`,
      );
    },
  );

  harness.check("check: copied material without a notice fails, and the same manifest passes once a notice covers the target", () => {
    const root = harness.makeTempDir("check-notice");
    const copied = unit({
      id: "u-copied",
      kind: "implementation",
      disposition: "reuse",
      upstream: { sourceId: SOURCE_ID, selector: "Sources/" },
      target: { kind: "extension-package", path: "examples/extensions/synthetic" },
    });
    writeContributionManifest(root, manifest([copied]));
    const without = checkContribution(root, { skillRoot, now: () => FIXED_NOW });
    assert(
      !without.pass && issueCodes(without.issues).includes("error:contribution.notice_missing"),
      `expected notice_missing; got ${issueCodes(without.issues).join(", ")}`,
    );
    assert(without.summary.copiedUnits === 1 && without.summary.originalUnits === 0, `summary counts: ${JSON.stringify(without.summary)}`);
    writeContributionManifest(
      root,
      manifest([copied], {
        notices: [
          {
            sourceId: SOURCE_ID,
            spdx: "MIT",
            copyright: "Copyright (c) 2026 Synthetic Author",
            noticePath: "NOTICE",
            covers: ["examples/extensions/synthetic"],
          },
        ],
      }),
    );
    const withNotice = checkContribution(root, { skillRoot, now: () => FIXED_NOW });
    assert(
      !issueCodes(withNotice.issues).includes("error:contribution.notice_missing"),
      `the covering notice must clear the error; got ${issueCodes(withNotice.issues).join(", ")}`,
    );
    assert(withNotice.pass, `a covered reuse passes; got ${issueCodes(withNotice.issues).join(", ")}`);
    const nested = unit({
      ...copied,
      id: "u-copied-file",
      target: { kind: "extension-package", path: "examples/extensions/synthetic/Sources/CardStack.swift" },
    });
    const noticeFor = (covers: string): Partial<ContributionManifest> => ({
      notices: [{ sourceId: SOURCE_ID, spdx: "MIT", copyright: "Copyright (c) 2026 Synthetic Author", noticePath: "NOTICE", covers: [covers] }],
    });
    writeContributionManifest(root, manifest([nested], noticeFor("examples/extensions/synthetic")));
    const parent = checkContribution(root, { skillRoot, now: () => FIXED_NOW });
    assert(
      !issueCodes(parent.issues).includes("error:contribution.notice_missing"),
      `a notice covering a parent directory covers the file under it; got ${issueCodes(parent.issues).join(", ")}`,
    );
    writeContributionManifest(root, manifest([nested], noticeFor("examples/extensions/synthetic-other")));
    const sibling = checkContribution(root, { skillRoot, now: () => FIXED_NOW });
    assert(
      issueCodes(sibling.issues).includes("error:contribution.notice_missing"),
      `a sibling directory that merely shares a name prefix covers nothing; got ${issueCodes(sibling.issues).join(", ")}`,
    );
  });

  harness.check("check: an adapt unit over an upstream-owned excerpt source is exempt from the complete-source rule; any other excerpt source is not", () => {
    const root = harness.makeTempDir("check-upstream-excerpt");
    const plan = upgradePlan({ skillRoot, now: () => FIXED_NOW }, { upstreamId: UPSTREAM_ID, target: root });
    const upstreamSource = plan.contributionManifest.sources.find((source) => source.upstreamId === UPSTREAM_ID);
    assert(
      upstreamSource !== undefined && upstreamSource.retrieval.status === "excerpt",
      `the upgrade plan must record its upstream as an excerpt source owned by ${UPSTREAM_ID}; got ${JSON.stringify(upstreamSource?.retrieval)}`,
    );
    assert(
      plan.contributionManifest.units.some((entry) => entry.disposition === "adapt" && entry.upstream?.sourceId === upstreamSource.id),
      "the upgrade plan must carry an adapt unit over that source for this case to mean anything",
    );
    const owned = checkContribution(root, { skillRoot, now: () => FIXED_NOW });
    assert(
      !owned.issues.some((issue) => issue.code === "contribution.incomplete_source_for_adaptation"),
      `an upstream-owned excerpt is reviewed through catalog/upstreams; got ${issueCodes(owned.issues).join(", ")}`,
    );
    const stray = readContributionManifest(root);
    writeContributionManifest(root, {
      ...stray,
      sources: stray.sources.map((source) => (source.upstreamId === UPSTREAM_ID ? { ...source, upstreamId: "no-such-upstream" } : source)),
    });
    const unowned = checkContribution(root, { skillRoot, now: () => FIXED_NOW });
    assert(
      unowned.issues.some((issue) => issue.severity === "error" && issue.code === "contribution.incomplete_source_for_adaptation"),
      `an upstream id no manifest defines keeps the rule; got ${issueCodes(unowned.issues).join(", ")}`,
    );
    writeContributionManifest(root, {
      ...stray,
      sources: stray.sources.map((source) => {
        if (source.upstreamId !== UPSTREAM_ID) return source;
        const { upstreamId: _upstreamId, ...rest } = source;
        return rest;
      }),
    });
    const plain = checkContribution(root, { skillRoot, now: () => FIXED_NOW });
    assert(
      plain.issues.some((issue) => issue.severity === "error" && issue.code === "contribution.incomplete_source_for_adaptation"),
      `a source without an upstream id keeps the rule; got ${issueCodes(plain.issues).join(", ")}`,
    );
  });

  harness.check("check: an upstream-less unit may only be original, and an upstream unit may never claim originality", () => {
    const root = harness.makeTempDir("check-originality");
    writeContributionManifest(
      root,
      manifest([
        unit({ id: "u-no-upstream", kind: "knowledge", disposition: "adapt", upstream: null, target: { kind: "existing-reference", id: ACTIVE_OWNER } }),
      ]),
    );
    const mismatch = checkContribution(root, { skillRoot, now: () => FIXED_NOW });
    assert(
      !mismatch.pass && mismatch.issues.some((issue) => issue.code === "contribution.original_disposition_mismatch" && issue.unitId === "u-no-upstream"),
      `expected original_disposition_mismatch; got ${issueCodes(mismatch.issues).join(", ")}`,
    );
    writeContributionManifest(
      root,
      manifest([
        unit({
          id: "u-fabricated",
          kind: "knowledge",
          disposition: "original",
          upstream: { sourceId: SOURCE_ID },
          target: { kind: "new-reference", id: "reference.contributed.fabricated", path: "knowledge/contributed/fabricated.md" },
        }),
      ]),
    );
    const fabricated = checkContribution(root, { skillRoot, now: () => FIXED_NOW });
    assert(
      !fabricated.pass && fabricated.issues.some((issue) => issue.code === "contribution.fabricated_originality" && issue.unitId === "u-fabricated"),
      `expected fabricated_originality; got ${issueCodes(fabricated.issues).join(", ")}`,
    );
  });

  harness.check("check: rights, scope, owner, aesthetic-default, and evaluation-coverage rules each fire on the manifest that breaks them", () => {
    const root = harness.makeTempDir("check-rules");
    const now = (): Date => FIXED_NOW;
    const unknownSource: SourceRecord = { ...verifiedSource(), id: "unknown-source", rights: { status: "unknown" } };
    writeContributionManifest(
      root,
      manifest(
        [
          unit({
            id: "u-unknown-rights",
            kind: "knowledge",
            disposition: "adapt",
            upstream: { sourceId: "unknown-source" },
            target: { kind: "existing-reference", id: ACTIVE_OWNER },
          }),
        ],
        { sources: [unknownSource] },
      ),
    );
    const rights = checkContribution(root, { skillRoot, now });
    assert(
      rights.issues.some((issue) => issue.severity === "error" && issue.code === "contribution.rights_unverified" && issue.sourceId === "unknown-source"),
      `adapt on unknown rights is an error; got ${issueCodes(rights.issues).join(", ")}`,
    );
    assert(
      rights.summary.rightsUnknown === 1 && rights.summary.rightsVerified === 0,
      `summary must count the unknown source; got ${JSON.stringify(rights.summary)}`,
    );
    writeContributionManifest(
      root,
      manifest([
        unit({
          id: "u-kernel",
          kind: "implementation",
          disposition: "reuse",
          upstream: { sourceId: SOURCE_ID },
          target: { kind: "check", path: "kernel/engine/compile.ts" },
        }),
      ]),
    );
    const scope = checkContribution(root, { skillRoot, now });
    assert(
      scope.issues.some((issue) => issue.code === "contribution.scope_mismatch"),
      `a contribution-scope manifest cannot target kernel/; got ${issueCodes(scope.issues).join(", ")}`,
    );
    writeContributionManifest(
      root,
      manifest([
        unit({
          id: "u-owner",
          kind: "knowledge",
          disposition: "reference",
          upstream: { sourceId: SOURCE_ID },
          target: { kind: "existing-reference", id: "reference.design.does-not-exist" },
        }),
      ]),
    );
    const owner = checkContribution(root, { skillRoot, now });
    assert(
      owner.issues.some((issue) => issue.severity === "error" && issue.code === "contribution.owner_unknown" && issue.unitId === "u-owner"),
      `an unknown existing reference is an error; got ${issueCodes(owner.issues).join(", ")}`,
    );
    writeContributionManifest(
      root,
      manifest([{ ...knowledgeAdapt("proposed", "u-always"), selection: "always", rationale: "adopt this palette and typography everywhere" }], {
        evaluations: [counterexampleFor("u-always")],
      }),
    );
    const aesthetic = checkContribution(root, { skillRoot, now });
    assert(
      aesthetic.issues.some((issue) => issue.severity === "error" && issue.code === "contribution.aesthetic_universal_default"),
      `an aesthetic marked always is an error; got ${issueCodes(aesthetic.issues).join(", ")}`,
    );
    writeContributionManifest(root, manifest([knowledgeAdapt("proposed")]));
    const coverage = checkContribution(root, { skillRoot, now });
    assert(
      coverage.issues.some((issue) => issue.severity === "error" && issue.code === "contribution.evaluation_missing"),
      `adapting knowledge without a counterexample is an error; got ${issueCodes(coverage.issues).join(", ")}`,
    );
    writeContributionManifest(root, manifest([knowledgeAdapt("proposed")], { evaluations: [counterexampleFor("u-knowledge")] }));
    const valid = checkContribution(root, { skillRoot, now });
    assert(
      valid.pass && valid.issues.filter((issue) => issue.severity === "error").length === 0,
      `a complete adaptation passes; got ${issueCodes(valid.issues).join(", ")}`,
    );
    assert(valid.summary.evaluations === 1 && valid.summary.units === 1 && valid.summary.refusedDirectives === 0, `summary: ${JSON.stringify(valid.summary)}`);
  });

  harness.check("check: a missing manifest is reported as manifest_missing, and an unknown field is rejected", () => {
    const root = harness.makeTempDir("check-missing");
    let error = "";
    try {
      checkContribution(root, { skillRoot, now: () => FIXED_NOW });
    } catch (caught) {
      error = caught instanceof Error ? caught.message : String(caught);
    }
    assert(
      error.startsWith("contribution.manifest_missing:") && error.includes(path.join(root, "contribution.yaml")),
      `expected manifest_missing naming the path; got ${error}`,
    );
    const stray = `${renderContributionManifestYaml(manifest([knowledgeAdapt("proposed")]))}install_hook: ./setup.sh\n`;
    let rejected = "";
    try {
      parseContributionManifest(stray, "stray.yaml");
    } catch (caught) {
      rejected = caught instanceof Error ? caught.message : String(caught);
    }
    assert(
      rejected.startsWith("contribution.manifest_invalid:") && rejected.includes("installHook"),
      `an unknown field must be refused by the strict schema; got ${rejected}`,
    );
  });

  harness.check("preview: only an accepted, adapting unit on an active bound owner is delivered; proposed, draft, and evaluation units are excluded", () => {
    const root = harness.makeTempDir("preview-delivery");
    const owner = loadKnowledgePackages(skillRoot).find((pkg) => pkg.id === ACTIVE_OWNER);
    assert(
      owner !== undefined && owner.lifecycle === "active" && owner.workflowIds.length > 0,
      `${ACTIVE_OWNER} must be an active, bound package for this case to mean anything`,
    );
    const units = [
      knowledgeAdapt("accepted", "u-accepted"),
      knowledgeAdapt("proposed", "u-proposed"),
      unit({
        id: "u-new",
        kind: "knowledge",
        disposition: "adapt",
        status: "accepted",
        upstream: { sourceId: SOURCE_ID },
        target: { kind: "new-reference", id: "reference.contributed.synthetic", path: "knowledge/contributed/synthetic.md" },
      }),
      unit({
        id: "u-inventory",
        kind: "knowledge",
        disposition: "adapt",
        status: "accepted",
        selection: "reference-only",
        upstream: { sourceId: SOURCE_ID },
        target: { kind: "existing-reference", id: ACTIVE_OWNER },
      }),
      unit({
        id: "u-eval",
        kind: "evaluation",
        disposition: "original",
        status: "accepted",
        upstream: null,
        target: { kind: "evaluation-case", path: "evals/case.yaml" },
      }),
    ];
    writeContributionManifest(
      root,
      manifest(units, { evaluations: units.filter((entry) => entry.kind === "knowledge").map((entry) => counterexampleFor(entry.id)) }),
    );
    const before = treeSnapshot(root);
    const preview = previewContribution(root, { skillRoot });
    assert(treeSnapshot(root) === before && preview.changesCatalog === false, "preview must write nothing and declare no catalog change");
    const byId = new Map(preview.units.map((entry) => [entry.unitId, entry]));
    const accepted = byId.get("u-accepted");
    assert(
      accepted?.delivered === true && accepted.lifecycle === "active" && accepted.targetReferenceId === ACTIVE_OWNER,
      `the accepted unit is delivered; got ${JSON.stringify(accepted)}`,
    );
    assert(
      isDeepStrictEqual(accepted.boundWorkflowIds, owner.workflowIds) && isDeepStrictEqual(accepted.contextPackIds, owner.contextPackIds),
      `bound ids must equal the package bindings; got ${JSON.stringify(accepted.boundWorkflowIds)}`,
    );
    const bytes = statSync(path.join(skillRoot, owner.path)).size;
    assert(accepted.bytes === bytes, `bytes must be the reference document size ${bytes}; got ${accepted.bytes}`);
    // Coverage is the knowledge service's greedy allocation per bound workflow, replayed independently here.
    const allocations = owner.workflowIds.map((workflowId) => ({ workflowId, ...expectedAllocation(workflowId, ACTIVE_OWNER) }));
    const expectedCoverage = allocations.every((entry) => entry.status === "complete") ? "complete" : "truncated";
    assert(
      accepted.coverage === expectedCoverage,
      `coverage must follow the per-workflow allocation ${JSON.stringify(allocations.map((entry) => `${entry.workflowId}=${entry.status}`))}; got ${accepted.coverage}`,
    );
    for (const entry of allocations) {
      assert(
        accepted.reason.includes(`${entry.workflowId}: ${entry.status}`),
        `the reason must report ${entry.workflowId} as ${entry.status}; got ${accepted.reason}`,
      );
      assert(
        accepted.reason.includes(
          `${entry.precedingChars} of ${DEFAULT_WORKFLOW_BUNDLE_TOKEN_BUDGET} code points consumed by ${entry.preceding.length} earlier reference(s)`,
        ),
        `the reason must carry the code points earlier references consume in ${entry.workflowId}; got ${accepted.reason}`,
      );
      const listed = preview.incompleteCoverage.some((line) => line.startsWith(`u-accepted: ${entry.workflowId}:`));
      assert(
        listed === (entry.status !== "complete"),
        `incomplete coverage lists exactly the workflows that truncate or omit; ${entry.workflowId} listed=${listed}`,
      );
    }
    const proposed = byId.get("u-proposed");
    assert(
      proposed?.delivered === false && proposed.reason.includes("not accepted") && proposed.coverage === "excluded",
      `a proposed unit is not delivered; got ${JSON.stringify(proposed)}`,
    );
    const draft = byId.get("u-new");
    assert(
      draft?.delivered === false && draft.lifecycle === "draft" && draft.reason.includes("draft packages never enter worker briefs"),
      `a new reference is a draft and excluded; got ${JSON.stringify(draft)}`,
    );
    const inventory = byId.get("u-inventory");
    assert(
      inventory?.delivered === false && inventory.reason.includes("reference-only material is contributor inventory"),
      `reference-only material is excluded; got ${JSON.stringify(inventory)}`,
    );
    const evaluation = byId.get("u-eval");
    assert(
      evaluation?.delivered === false && evaluation.lifecycle === "not-a-reference" && evaluation.coverage === "not-applicable",
      `an evaluation unit is never delivered; got ${JSON.stringify(evaluation)}`,
    );
    assert(
      preview.excluded
        .map((entry) => entry.unitId)
        .sort()
        .join(",") === "u-eval,u-inventory,u-new,u-proposed",
      `excluded must list every non-delivered unit; got ${preview.excluded.map((entry) => entry.unitId).join(",")}`,
    );
  });

  harness.check("preview: a short reference bound after a long one is reported omitted from that workflow's default bundle, not complete", () => {
    const root = harness.makeTempDir("preview-late-reference");
    const late = loadKnowledgePackages(skillRoot).find((pkg) => pkg.id === LATE_REFERENCE);
    assert(
      late !== undefined && late.lifecycle === "active" && late.workflowIds.includes(LATE_WORKFLOW),
      `${LATE_REFERENCE} must be an active package bound to ${LATE_WORKFLOW} for this case to mean anything`,
    );
    const allocation = expectedAllocation(LATE_WORKFLOW, LATE_REFERENCE);
    assert(
      allocation.length <= DEFAULT_WORKFLOW_BUNDLE_TOKEN_BUDGET && allocation.status === "omitted",
      `the fixture reference must fit the budget on its own yet be omitted by earlier references; got ${JSON.stringify(allocation)}`,
    );
    const unit = knowledgeAdapt("accepted", "u-late");
    writeContributionManifest(
      root,
      manifest([{ ...unit, target: { kind: "existing-reference", id: LATE_REFERENCE } }], {
        routing: { intendedTarget: LATE_REFERENCE, effect: "proposal only", verdict: "contribution", reason: "targets a knowledge reference" },
        evaluations: [counterexampleFor("u-late")],
      }),
    );
    const preview = previewContribution(root, { skillRoot });
    const previewed = preview.units.find((entry) => entry.unitId === "u-late");
    assert(
      previewed?.delivered === true && previewed.coverage === "truncated",
      `a delivered but omitted reference is not complete; got ${JSON.stringify(previewed)}`,
    );
    const line = preview.incompleteCoverage.find((entry) => entry.startsWith(`u-late: ${LATE_WORKFLOW}: omitted`));
    assert(line !== undefined, `incomplete coverage must name the workflow that omits the reference; got ${JSON.stringify(preview.incompleteCoverage)}`);
    assert(
      line.includes(`0 of ${allocation.length} code points`) &&
        line.includes(
          `${allocation.precedingChars} of ${DEFAULT_WORKFLOW_BUNDLE_TOKEN_BUDGET} code points consumed by ${allocation.preceding.length} earlier reference(s)`,
        ),
      `the entry must carry the code-point counts and the budget; got ${line}`,
    );
    assert(
      allocation.preceding.every((id) => line.includes(id)),
      `the entry must name the references that consumed the budget first; got ${line}`,
    );
    const bytesOnly = statSync(path.join(skillRoot, late.path)).size <= DEFAULT_WORKFLOW_BUNDLE_TOKEN_BUDGET;
    assert(bytesOnly, "the document's own size fits the budget, so a size-only preview would have claimed complete coverage");
  });

  harness.check("cli: b2c contribute plan writes a contribution root whose manifest round-trips through manifest-io without loss", () => {
    const target = harness.makeTempDir("cli-plan-target");
    const run = spawnSync(
      resolveTsxBin(skillRoot),
      [path.join(skillRoot, "entrypoints/cli/contribute.ts"), "plan", "--source", SKILL_DIR, "--goal", "test", "--target", target, "--json"],
      {
        cwd: skillRoot,
        encoding: "utf8",
        timeout: 180_000,
      },
    );
    const stdout = run.stdout ?? "";
    const start = stdout.indexOf("{");
    assert(run.status === 0 && start >= 0, `plan must exit 0 with JSON; exit ${run.status}\n${stdout.slice(-600)}\n${(run.stderr ?? "").slice(-600)}`);
    const envelope = JSON.parse(stdout.slice(start)) as { apiVersion: string; ok: boolean; data?: PlanData };
    assert(
      envelope.apiVersion === CONTRIBUTION_API_VERSION && envelope.ok === true && envelope.data !== undefined,
      `expected an ok ${CONTRIBUTION_API_VERSION} envelope; got ${JSON.stringify(envelope).slice(0, 300)}`,
    );
    assert(
      envelope.data.written?.contributionYaml === path.join(target, "contribution.yaml") && existsSync(envelope.data.written.adoptionMap),
      "the CLI reports the files it wrote",
    );
    assert(readFileSync(envelope.data.written.adoptionMap, "utf8").startsWith("# Adoption map: "), "ADOPTION_MAP.md is the rendered adoption map");
    assert(!existsSync(MARKER), "the CLI run must not execute setup.sh");
    const first = readContributionManifest(target);
    const second = parseContributionManifest(renderContributionManifestYaml(first), "round-trip");
    assert(isDeepStrictEqual(first, second), "parse -> stringify -> parse must reproduce the manifest exactly");
    assert(isDeepStrictEqual(first, envelope.data.manifest), "the manifest on disk must equal the manifest in the envelope");
    assert(
      first.sources[0]?.directives.length === envelope.data.refusedDirectives && first.synthetic === false,
      "the written manifest carries the refused directives and is not marked synthetic without --synthetic",
    );
  });
}
