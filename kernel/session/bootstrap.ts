#!/usr/bin/env node
/**
 * Initialize the current workspace state from an accepted product, install runtime
 * entrypoints, and adopt state and control through the reducer. Optional onboarding
 * answers supply explicit work authority. Dry-run is the default.
 */
import { loadProductInstanceDocument, productYamlPath } from "../../catalog/ontology/instance-load.js";
import { renderProductMarkdown } from "../../catalog/ontology/render-product.js";
import { initializeWorkspace } from "./initialize.js";
import { isInitializationOwner, withInitializationReads } from "./initialization-guard.js";
import { installEntrypoints } from "../../adapters/install-entrypoints.js";
import { boundedFileBytes } from "../lib/bounded-file.js";
import { atomicFile } from "../lib/atomic-file.js";
import { existsSync, lstatSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { parse as parseYaml } from "yaml";

import { isMainModule, parseArgs, resolveCallerPath } from "../lib/cli.js";
import { runReducer, skillRoot } from "./reducer-cli.js";
import { loadControlFile, resolveWorkspacePaths, type WorkspacePaths } from "./run.js";
import { buildBudgetBalances, buildGrantsPatch, buildWaivers, loadAnswers, type OnboardingAnswers } from "./onboard.js";
import { validateBudgetLedger, validateBusinessState, validateControl, validateGrants, validateWaivers } from "../schema/index.js";
import { laneKeys, type BudgetLedgerDocument, type BusinessStateV2, type ControlFile, type LanesMap } from "../schema/types.js";
import { describeTsxSpawnFailure, resolveRuntimeCommand } from "../../tooling/lib/tsx-bin.js";
import { loadWorkspaceCatalogIfPresent, renderCatalogRefusal } from "./catalog-contract.js";
import { resolveCliWorkspace } from "./status.js";

const BOOTSTRAP_SESSION = "bootstrap-driver";
const SLUG_RULE = /^[a-z0-9][a-z0-9-]*$/;

interface StepReport {
  readonly step: string;
  readonly action: "would" | "did" | "skip" | "fail";
  readonly detail: string;
}

function report(entries: StepReport[], step: string, action: StepReport["action"], detail: string): void {
  entries.push({ step, action, detail });
}

function runSkillCli(relativePath: string, cliArgs: string[]): { code: number; output: string } {
  const command = resolveRuntimeCommand(skillRoot(), [path.join(skillRoot(), relativePath), ...cliArgs]);
  const result = spawnSync(command.executable, command.args, {
    cwd: skillRoot(),
    encoding: "utf8",
  });
  // Same blank-diagnostic shape as runReducer: name the launch or signal cause the child could not
  // report itself, and keep it at the tail so the `.slice(-400)` in the fail reports preserves it.
  const failure = describeTsxSpawnFailure(command.executable, result);
  return { code: result.status ?? -1, output: `${result.stdout ?? ""}\n${result.stderr ?? ""}${failure ? `\n${failure}` : ""}` };
}

/** The skill version a workspace's runtime binding was installed at; undefined when unreadable. */
function readPinnedSkillVersion(runtimeManifestPath: string): string | undefined {
  if (!existsSync(runtimeManifestPath)) return undefined;
  try {
    const manifest = JSON.parse(readFileSync(runtimeManifestPath, "utf8")) as { skillVersion?: string };
    return typeof manifest.skillVersion === "string" ? manifest.skillVersion : undefined;
  } catch {
    return undefined;
  }
}

/** control/manifest.json's entries are keyed by resolved file path; a missing manifest tracks nothing. */
function manifestTracks(manifestPath: string, filePath: string): boolean {
  if (!existsSync(manifestPath)) return false;
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as { entries?: Record<string, unknown> };
    return Boolean(manifest.entries?.[path.resolve(filePath)]);
  } catch {
    return false;
  }
}

function adopt(paths: WorkspacePaths, filePath: string, targetDoc: "business-state" | "control" | "budget-ledger"): { code: number; output: string } {
  return runReducer([
    "adopt",
    "--file",
    filePath,
    "--target-doc",
    targetDoc,
    "--manifest",
    paths.manifest,
    "--audit",
    paths.audit,
    "--session",
    BOOTSTRAP_SESSION,
  ]);
}

export interface BootstrapResult {
  readonly code: number;
  readonly reports: readonly StepReport[];
}

interface PreparedBootstrapInput {
  readonly state: BusinessStateV2;
  readonly control: ControlFile;
  readonly stateSource: "existing" | "product";
  readonly hasControl: boolean;
}

function validationMessage(issues: readonly { message: string; path: string }[]): string {
  return issues.map((issue) => `${issue.message} (${issue.path})`).join("; ");
}

function controlScaffold(state: BusinessStateV2, now: string): ControlFile {
  return {
    schemaVersion: "1.0.0",
    updatedAt: now,
    businessSlug: state.project.slug,
    killSwitch: { engaged: false, engagedAt: "", engagedBy: "", reason: "" },
    grants: {},
    waivers: [],
  };
}

function normalizedWorkspaceSlug(workspace: string): string {
  return path
    .basename(path.resolve(workspace))
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "");
}

function acceptedProductIdentity(workspace: string): { name: string; slug: string } {
  const product = loadProductInstanceDocument(productYamlPath(workspace));
  if (product.meta.status !== "accepted" || readFileSync(path.join(workspace, "PRODUCT.md"), "utf8") !== renderProductMarkdown(product))
    throw new Error("business.accepted_product_required");
  const productPath = path.join(workspace, "PRODUCT.md");
  if (!existsSync(productPath)) {
    throw new Error("no state exists and PRODUCT.md is missing; accept a product direction before bootstrapping the durable runtime");
  }
  const markdown = readFileSync(productPath, "utf8");
  const match = /^---\s*\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u.exec(markdown);
  if (!match) throw new Error("PRODUCT.md must start with YAML frontmatter");

  let frontmatter: unknown;
  try {
    frontmatter = parseYaml(match[1] ?? "");
  } catch (error) {
    throw new Error(`PRODUCT.md frontmatter is not valid YAML: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (typeof frontmatter !== "object" || frontmatter === null || Array.isArray(frontmatter)) {
    throw new Error("PRODUCT.md frontmatter must be a YAML object");
  }
  const fields = frontmatter as Record<string, unknown>;
  if (fields.status !== "accepted") {
    throw new Error("PRODUCT.md frontmatter must set status: accepted before the durable runtime is initialized");
  }
  if (typeof fields.name !== "string" || !fields.name.trim()) {
    throw new Error("PRODUCT.md frontmatter must contain a non-empty name");
  }
  const name = fields.name.replace(/\s+/gu, " ").trim();
  let slug: string;
  if (fields.slug === undefined) {
    slug = normalizedWorkspaceSlug(workspace);
  } else if (typeof fields.slug === "string") {
    slug = fields.slug.trim();
  } else {
    throw new Error("PRODUCT.md frontmatter slug must be a string when present");
  }
  if (!slug || !SLUG_RULE.test(slug)) {
    throw new Error("PRODUCT.md identity must resolve to a slug with lowercase letters, digits, and hyphens");
  }
  return { name, slug };
}

function stateFromAcceptedProduct(workspace: string, now: string): BusinessStateV2 {
  const identity = acceptedProductIdentity(workspace);
  const researchPath = path.join(workspace, "strategy", "RESEARCH.md");
  for (const location of [path.join(workspace, "strategy"), researchPath])
    if (existsSync(location) && lstatSync(location).isSymbolicLink()) throw new Error("business.unsafe_research_evidence");
  const researchEvidence =
    existsSync(researchPath) &&
    boundedFileBytes(researchPath, 1024 * 1024)
      .toString("utf8")
      .trim()
      ? ["strategy/RESEARCH.md"]
      : [];
  const lanes = {} as LanesMap;
  for (const key of laneKeys) lanes[key] = { status: "pending", evidence: [], blockers: [] };
  lanes.research = { status: "running", evidence: researchEvidence, blockers: [] };
  lanes.product = { status: "running", evidence: ["PRODUCT.md"], blockers: [] };
  return {
    schemaVersion: "2.0.0",
    updatedAt: now,
    narrative: { sinceLastTime: "", rightNow: "", yourCall: "", lastCelebratedPhase: "" },
    project: {
      name: identity.name,
      slug: identity.slug,
      owner: "",
      phase: "phase_0_orient",
      launchScope: "full",
      kickoffDate: "",
      platforms: [],
      bundleIds: { ios: "", android: "" },
      publicUrls: { landing: "", privacy: "", terms: "" },
    },
    lanes,
    founderGates: { pending: [] },
  };
}

/** Resolve and validate every state/control input before an apply run can write entrypoints. */
export function initialBootstrapDocuments(workspace: string, now: string) {
  const product = loadProductInstanceDocument(productYamlPath(workspace));
  if (product.meta.status !== "accepted" || readFileSync(path.join(workspace, "PRODUCT.md"), "utf8") !== renderProductMarkdown(product))
    throw new Error("business.accepted_product_required");
  const state = stateFromAcceptedProduct(workspace, now);
  return { state, control: controlScaffold(state, now) };
}

export function prepareBootstrapInput(workspace: string, paths: WorkspacePaths, now: string): PreparedBootstrapInput {
  let state: BusinessStateV2;
  let stateSource: PreparedBootstrapInput["stateSource"];

  if (existsSync(paths.state)) {
    let raw: unknown;
    try {
      raw = JSON.parse(readFileSync(paths.state, "utf8"));
    } catch (error) {
      throw new Error(`state/business-state.json is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
    }
    const check = validateBusinessState(raw);
    if (!check.valid || !check.value) throw new Error(`state/business-state.json is invalid: ${validationMessage(check.issues)}`);
    state = check.value;
    stateSource = "existing";
  } else {
    state = stateFromAcceptedProduct(workspace, now);
    const stateCheck = validateBusinessState(state);
    if (!stateCheck.valid || !stateCheck.value) throw new Error(`PRODUCT.md produced invalid business state: ${validationMessage(stateCheck.issues)}`);
    state = stateCheck.value;
    stateSource = "product";
  }

  const hasControl = existsSync(paths.control);
  let control: ControlFile;
  if (hasControl) {
    let raw: unknown;
    try {
      raw = JSON.parse(readFileSync(paths.control, "utf8"));
    } catch (error) {
      throw new Error(`control/control.json is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
    }
    const check = validateControl(raw);
    if (!check.valid || !check.value) throw new Error(`control/control.json is invalid: ${validationMessage(check.issues)}`);
    if (check.value.businessSlug !== state.project.slug) {
      throw new Error(`control/control.json names businessSlug "${check.value.businessSlug}" but business state names "${state.project.slug}"`);
    }
    control = check.value;
  } else {
    const candidate = controlScaffold(state, now);
    const check = validateControl(candidate);
    if (!check.valid || !check.value) throw new Error(`control scaffold is invalid: ${validationMessage(check.issues)}`);
    control = check.value;
  }

  return { state, control, stateSource, hasControl };
}

function validateOnboardingPreflight(answers: OnboardingAnswers, control: ControlFile, ledgerPath: string, now: string): void {
  if (answers.businessSlug !== control.businessSlug) {
    throw new Error(`answers name businessSlug "${answers.businessSlug}" but this workspace is "${control.businessSlug}"`);
  }

  const grants = buildGrantsPatch(control.grants, answers.units, now);
  const grantsCheck = validateGrants({ schemaVersion: "1.0.0", updatedAt: now, grants });
  if (!grantsCheck.valid) throw new Error(`grants are invalid: ${validationMessage(grantsCheck.issues)}`);

  const waivers = buildWaivers(control.waivers, answers.waivers ?? [], now);
  const waiversCheck = validateWaivers({ schemaVersion: "1.0.0", updatedAt: now, waivers });
  if (!waiversCheck.valid) throw new Error(`waivers are invalid: ${validationMessage(waiversCheck.issues)}`);

  let existingLedger: BudgetLedgerDocument | undefined;
  if (existsSync(ledgerPath)) {
    let raw: unknown;
    try {
      raw = JSON.parse(readFileSync(ledgerPath, "utf8"));
    } catch (error) {
      throw new Error(`budget ledger is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
    }
    const check = validateBudgetLedger(raw);
    if (!check.valid || !check.value) throw new Error(`budget ledger is invalid: ${validationMessage(check.issues)}`);
    existingLedger = check.value;
  }
  const ledger = {
    schemaVersion: "1.0.0" as const,
    updatedAt: now,
    balances: buildBudgetBalances(existingLedger?.balances ?? [], answers.budgets ?? [], now),
    entries: existingLedger?.entries ?? [],
  };
  const ledgerCheck = validateBudgetLedger(ledger);
  if (!ledgerCheck.valid) throw new Error(`budgets are invalid: ${validationMessage(ledgerCheck.issues)}`);
}

export function bootstrapWorkspace(workspace: string, options: { apply: boolean; answersPath?: string; now?: string }): BootstrapResult {
  if (options.apply && !isInitializationOwner(workspace)) {
    if (options.answersPath) {
      const prepared = prepareBootstrapInput(workspace, resolveWorkspacePaths(workspace), options.now ?? new Date().toISOString());
      validateOnboardingPreflight(
        loadAnswers(options.answersPath),
        prepared.control,
        resolveWorkspacePaths(workspace).ledger,
        options.now ?? new Date().toISOString(),
      );
    }
    initializeWorkspace(workspace, { now: options.now });
    return withInitializationReads(workspace, () => bootstrapWorkspace(workspace, options));
  }

  const compatible = loadWorkspaceCatalogIfPresent(workspace);
  if (!compatible.ok) {
    return { code: 1, reports: [{ step: "bootstrap.compatibility", action: "fail", detail: renderCatalogRefusal(compatible.refusal) }] };
  }
  const reports: StepReport[] = [];
  const paths = resolveWorkspacePaths(workspace);
  const runtimeManifestPath = path.join(workspace, ".b2c-launch", "runtime.json");
  const apply = options.apply;
  const now = options.now ?? new Date().toISOString();
  let prepared: PreparedBootstrapInput;
  try {
    prepared = prepareBootstrapInput(workspace, paths, now);
  } catch (error) {
    report(reports, "preflight", "fail", error instanceof Error ? error.message : String(error));
    return { code: 1, reports };
  }
  if (options.answersPath) {
    try {
      const answers = loadAnswers(options.answersPath);
      validateOnboardingPreflight(answers, prepared.control, paths.ledger, now);
    } catch (error) {
      report(reports, "preflight", "fail", `onboarding answers are invalid: ${error instanceof Error ? error.message : String(error)}`);
      return { code: 1, reports };
    }
  }

  // --- 1. executable catalog + runtime binding ---------------------------------------------------
  // Initialization writes the first pin. Existing pins change only through composition activation.
  const hasCatalog = compatible.catalog !== undefined;
  const pinnedVersion = readPinnedSkillVersion(runtimeManifestPath);
  if (hasCatalog && existsSync(runtimeManifestPath)) {
    report(reports, "entrypoints", "skip", `preserved installed runtime ${pinnedVersion ?? "unversioned"}; use explicit composition activation for changes`);
  } else if (!apply) {
    report(reports, "entrypoints", "would", "install catalog.json, .b2c-launch/runtime.json, and repo agent entrypoints (install-entrypoints --apply)");
  } else {
    const result = (() => {
      try {
        installEntrypoints({ target: workspace, apply: true, vars: { APP_NAME: prepared.state.project.name } });
        return { code: 0, output: "" };
      } catch (error) {
        return { code: 1, output: error instanceof Error ? error.message : String(error) };
      }
    })();
    if (result.code !== 0) {
      report(reports, "entrypoints", "fail", `install-entrypoints exited ${result.code}: ${result.output.trim().slice(-400)}`);
      return { code: 1, reports };
    }
    report(reports, "entrypoints", "did", "installed catalog.json, .b2c-launch/runtime.json, and repo agent entrypoints");
  }

  // --- 2. business state (and a control scaffold when none exists) ----------------------------
  if (prepared.stateSource === "existing") {
    report(reports, "business-state", "skip", `${path.relative(workspace, paths.state)} already exists`);
  } else if (!apply) {
    report(reports, "business-state", "would", "initialize state/business-state.json from accepted PRODUCT.md");
  } else {
    mkdirSync(path.dirname(paths.state), { recursive: true });
    atomicFile(paths.state, `${JSON.stringify(prepared.state, null, 2)}\n`);
    report(reports, "business-state", "did", `initialized ${path.relative(workspace, paths.state)} from accepted PRODUCT.md`);
  }
  if (prepared.hasControl) {
    report(reports, "control", "skip", `${path.relative(workspace, paths.control)} already exists`);
  } else {
    if (!apply) {
      report(reports, "control", "would", `write a control scaffold to ${path.relative(workspace, paths.control)} from the business state's slug`);
    } else {
      mkdirSync(path.dirname(paths.control), { recursive: true });
      atomicFile(paths.control, `${JSON.stringify(prepared.control, null, 2)}\n`);
      report(reports, "control", "did", `wrote control scaffold to ${path.relative(workspace, paths.control)}`);
    }
  }

  // --- 3. reducer adoption: a truthful baseline for the first session's tamper preflight ----------
  const adoptions: Array<{ file: string; targetDoc: "business-state" | "control" | "budget-ledger"; required: boolean }> = [
    { file: paths.state, targetDoc: "business-state", required: true },
    { file: paths.control, targetDoc: "control", required: true },
    { file: paths.ledger, targetDoc: "budget-ledger", required: false },
  ];
  for (const candidate of adoptions) {
    const name = `adopt:${candidate.targetDoc}`;
    if (!existsSync(candidate.file)) {
      if (candidate.required && apply) {
        report(reports, name, "fail", `${path.relative(workspace, candidate.file)} does not exist after the earlier steps — bootstrap is incomplete`);
        return { code: 1, reports };
      }
      if (!candidate.required) report(reports, name, "skip", `${path.relative(workspace, candidate.file)} does not exist (legitimate first-run state)`);
      else report(reports, name, "would", `adopt ${path.relative(workspace, candidate.file)} once it exists`);
      continue;
    }
    if (manifestTracks(paths.manifest, candidate.file)) {
      report(reports, name, "skip", "already tracked in the reducer manifest");
      continue;
    }
    if (!apply) {
      report(reports, name, "would", `record ${path.relative(workspace, candidate.file)} as the reducer's disclosed baseline`);
      continue;
    }
    const result = adopt(paths, candidate.file, candidate.targetDoc);
    if (result.code !== 0) {
      report(reports, name, "fail", `reducer adopt exited ${result.code}: ${result.output.trim().slice(-400)}`);
      return { code: 1, reports };
    }
    report(reports, name, "did", "recorded as the reducer's disclosed baseline (manifest + audit)");
  }

  // --- 4. founder onboarding answers (optional) ---------------------------------------------------
  if (options.answersPath) {
    if (!apply) {
      report(reports, "onboarding", "would", `apply grants/waivers/budgets from ${options.answersPath} through kernel/session/onboard.ts`);
    } else {
      const onboardArgs = ["--workspace", workspace, "--answers", options.answersPath];
      if (options.now) onboardArgs.push("--now", options.now);
      const result = runSkillCli("kernel/session/onboard.ts", onboardArgs);
      if (result.code !== 0) {
        report(reports, "onboarding", "fail", `onboard exited ${result.code}: ${result.output.trim().slice(-400)}`);
        return { code: 1, reports };
      }
      report(reports, "onboarding", "did", `applied onboarding answers from ${options.answersPath}`);
    }
  } else {
    report(reports, "onboarding", "skip", "no --answers file given; grants stay as they are (an ungranted business parks everything for review)");
  }

  return { code: 0, reports };
}

function main(): number {
  const args = parseArgs(process.argv.slice(2));
  if (!args.workspace) {
    console.error("Usage: tsx kernel/session/bootstrap.ts --workspace <id-or-path> [--apply] [--answers <file>] [--now <iso>]");
    return 1;
  }
  const resolvedWorkspace = resolveCliWorkspace(args.workspace);
  if (!resolvedWorkspace.ok) {
    console.error(resolvedWorkspace.message);
    return 1;
  }
  const workspace = resolvedWorkspace.path;
  if (!existsSync(workspace)) {
    console.error(`ISSUE bootstrap.workspace_missing: ${workspace} does not exist`);
    return 1;
  }
  const apply = args.apply === "true";
  const result = bootstrapWorkspace(workspace, {
    apply,
    answersPath: args.answers ? resolveCallerPath(args.answers) : undefined,
    now: args.now,
  });
  for (const entry of result.reports) {
    const label = entry.action === "would" ? "PLAN" : entry.action === "did" ? "DONE" : entry.action === "skip" ? "SKIP" : "FAIL";
    console.log(`${label} ${entry.step}: ${entry.detail}`);
  }
  if (result.code === 0) {
    if (!apply) {
      console.log("");
      console.log("Dry run only — nothing was written. Re-run with --apply to perform the steps above.");
    } else {
      console.log("");
      const finalControl = loadControlFile(resolveWorkspacePaths(workspace).control);
      if (finalControl && Object.keys(finalControl.grants).length > 0) {
        console.log("Workspace is bootstrapped with work authority. A session needs a brief file, for example:");
        console.log(
          '  { "schemaVersion": "1.0.0", "businessSlug": "<slug from state/business-state.json>", "founderContact": { "email": "founder@example.com" } }',
        );
        console.log(`Then: b2c run --workspace ${workspace} --brief <brief.json> --session <session-id>`);
      } else {
        console.log("Workspace is bootstrapped with no work authority. Work remains parked until onboarding answers are applied:");
        console.log(`  b2c onboard --workspace ${workspace} --answers <answers.json>`);
      }
      console.log(`And to let this machine's MCP server address it: b2c workspaces register <slug> ${workspace}`);
    }
  }
  return result.code;
}

if (isMainModule(import.meta.url)) {
  try {
    process.exitCode = main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : "business.initialization_failed");
    process.exitCode = 1;
  }
}
