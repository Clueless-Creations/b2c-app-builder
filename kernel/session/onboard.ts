#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";

import { isMainModule, parseArgs, resolveCallerPath } from "../lib/cli.js";
import { runReducer } from "./reducer-cli.js";
import { resolveWorkspacePaths } from "./run.js";
import { loadWorkspaceCatalog, renderCatalogRefusal } from "./catalog-contract.js";
import { periodKeyFor } from "../autonomy/budget.js";
import { validateBudgetLedger, validateControl, validateGrants, validateWaivers } from "../schema/index.js";
import type { StatePatch, PatchOp, PatchPath, PatchPrecondition } from "../reducer/patch.js";
import type {
  BudgetBalance,
  BudgetLedgerDocument,
  BusinessUnit,
  ControlFile,
  Grant,
  GrantLevel,
  GrantsMap,
  ProtectedCategory,
  UndoContract,
  Waiver,
  WaivableActionClass,
  WaiverCaps,
  BudgetPeriod,
  GrantableDomainId,
} from "../schema/types.js";
import { businessUnitDomains, grantLevels } from "../schema/types.js";
import { resolveCliWorkspace } from "./status.js";

/**
 * The scripted onboarding driver (U7, R5): a founder onboarding conversation (run interactively
 * against reference.operations.autonomy-onboarding, or replayed for a rehearsal/test) ends with
 * a recorded transcript — this file is what turns that transcript into the founder's actual
 * grants, waivers, and spend allocations. It never writes control.json directly: every change is expressed as a
 * typed StatePatch and applied through kernel/reducer/cli.ts, exactly like every other write to a
 * reducer-owned document (KTD7). A waiver whose envelope (scope, cap+period, expiry, undo-or-
 * mitigation) is incomplete refuses the *entire* run before anything is committed — onboarding
 * either activates cleanly or not at all, never partially.
 *
 * CLI: tsx kernel/session/onboard.ts --workspace <id-or-path> --answers <file> [--dry-run] [--now <iso>]
 *
 * Exit codes mirror the reducer's own convention (see kernel/reducer/cli.ts, kernel/session/run.ts):
 * 0 = committed (or a dry run / no-op that needed no commit), 1 = the answers file or a waiver
 * envelope is invalid (refused before any write), 2 = did not run (lock contention), 3 = tamper
 * detected (out-of-band edit caught by the reducer's preflight).
 */

// --- the answers-file contract ------------------------------------------------------------------

export interface OnboardingWaiverInput {
  readonly domainId: GrantableDomainId;
  readonly actionClass: WaivableActionClass;
  readonly protectedCategory: ProtectedCategory;
  readonly scope: { readonly resourcePattern: string; readonly description: string };
  readonly caps: WaiverCaps;
  readonly budgetPeriod: BudgetPeriod;
  readonly expiry: string;
  readonly undoContract: UndoContract;
}

/**
 * How much this business may spend in one area, for one period. Distinct from a waiver's caps: a
 * waiver answers "may you make this one protected move, up to this much"; this answers "how much
 * does this area have to spend at all", which is what funds a grant's `budget_funded` prerequisite.
 * Before this existed, `BudgetBalance.allocated` was a field nothing ever filled — grants answered
 * whether the agent could act and nothing ever answered how much it could commit.
 *
 * "per_run" is deliberately not offered: its period key needs a runId, and onboarding is a founder
 * conversation with no run in flight. Allocations are per named period and do not renew themselves,
 * the same contract the founder is given for waiver expiry.
 */
export interface OnboardingBudgetInput {
  readonly unit: BusinessUnit;
  readonly currency: string;
  readonly budgetPeriod: Exclude<BudgetPeriod, "per_run">;
  readonly allocated: number;
}

export interface OnboardingAnswers {
  readonly schemaVersion: "1.0.0";
  readonly businessSlug: string;
  readonly founderContact: { readonly email: string };
  /** Not every unit needs an answer in one run: a unit absent here is left exactly as it was. */
  readonly units: Partial<Record<BusinessUnit, { readonly level: GrantLevel }>>;
  readonly waivers?: readonly OnboardingWaiverInput[];
  readonly budgets?: readonly OnboardingBudgetInput[];
}

export class AnswersInvalid extends Error {
  readonly issues: readonly string[];
  constructor(issues: readonly string[]) {
    super(`Onboarding answers are invalid: ${issues.join("; ")}`);
    this.issues = issues;
  }
}

const businessUnits = Object.keys(businessUnitDomains) as readonly BusinessUnit[];

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Structural validation only, mirroring brief.ts: this document has no U1 schema registry entry of its own (it never lands on disk verbatim — it is consumed once and turned into a control-file patch). */
export function validateAnswersShape(value: unknown): string[] {
  const issues: string[] = [];
  if (!isPlainObject(value)) return ["answers must be a JSON object"];

  if (value.schemaVersion !== "1.0.0") issues.push('schemaVersion must be "1.0.0"');
  if (!isNonEmptyString(value.businessSlug)) issues.push("businessSlug is required");

  const contact = value.founderContact;
  if (!isPlainObject(contact) || !isNonEmptyString(contact.email) || !contact.email.includes("@")) {
    issues.push("founderContact.email is required and must look like an email address");
  }

  const units = value.units;
  if (!isPlainObject(units)) {
    issues.push("units is required and must be an object");
  } else {
    for (const [unit, answer] of Object.entries(units)) {
      if (!businessUnits.includes(unit as BusinessUnit)) {
        issues.push(`units."${unit}" is not a recognized business unit (expected one of ${businessUnits.join(", ")})`);
        continue;
      }
      if (!isPlainObject(answer) || !grantLevels.includes(answer.level as GrantLevel)) {
        issues.push(`units."${unit}".level must be one of ${grantLevels.join(", ")}`);
      }
    }
  }

  if (value.waivers !== undefined) {
    if (!Array.isArray(value.waivers)) issues.push("waivers, when present, must be an array");
    else value.waivers.forEach((entry, index) => issues.push(...validateWaiverInputShape(entry, index)));
  }

  if (value.budgets !== undefined) {
    if (!Array.isArray(value.budgets)) issues.push("budgets, when present, must be an array");
    else value.budgets.forEach((entry, index) => issues.push(...validateBudgetInputShape(entry, index)));
  }

  return issues;
}

/** "per_run" is excluded on purpose — see OnboardingBudgetInput. */
const allocatablePeriods: readonly string[] = ["daily", "weekly", "monthly"];

function validateBudgetInputShape(value: unknown, index: number): string[] {
  const prefix = `budgets[${index}]`;
  if (!isPlainObject(value)) return [`${prefix} must be an object`];
  const issues: string[] = [];
  if (!businessUnits.includes(value.unit as BusinessUnit)) {
    issues.push(`${prefix}.unit must be one of ${businessUnits.join(", ")}`);
  }
  if (!isNonEmptyString(value.currency)) issues.push(`${prefix}.currency is required (e.g. "USD")`);
  if (!allocatablePeriods.includes(value.budgetPeriod as string)) {
    issues.push(
      `${prefix}.budgetPeriod must be one of ${allocatablePeriods.join(", ")} — "per_run" needs a run in flight, so it cannot be allocated during onboarding`,
    );
  }
  if (typeof value.allocated !== "number" || !Number.isFinite(value.allocated) || value.allocated <= 0) {
    issues.push(`${prefix}.allocated must be a positive number — allocating zero funds nothing and is indistinguishable from not answering`);
  }
  return issues;
}

function validateWaiverInputShape(value: unknown, index: number): string[] {
  const prefix = `waivers[${index}]`;
  if (!isPlainObject(value)) return [`${prefix} must be an object`];
  const issues: string[] = [];
  if (!isNonEmptyString(value.domainId)) issues.push(`${prefix}.domainId is required`);
  if (!isNonEmptyString(value.actionClass)) issues.push(`${prefix}.actionClass is required`);
  if (!isNonEmptyString(value.protectedCategory)) issues.push(`${prefix}.protectedCategory is required`);
  if (!isPlainObject(value.scope) || !isNonEmptyString(value.scope.resourcePattern) || !isNonEmptyString(value.scope.description)) {
    issues.push(`${prefix}.scope (resourcePattern, description) is required — what exactly this covers`);
  }
  if (!isPlainObject(value.caps) || typeof value.caps.maxPerAction !== "number" || typeof value.caps.maxPerPeriod !== "number") {
    issues.push(`${prefix}.caps (maxPerAction, maxPerPeriod) is required — the cap and how it resets`);
  }
  if (!isNonEmptyString(value.budgetPeriod)) issues.push(`${prefix}.budgetPeriod is required — how often the cap resets`);
  if (!isNonEmptyString(value.expiry)) issues.push(`${prefix}.expiry is required — when this pre-approval runs out`);
  if (!isPlainObject(value.undoContract)) {
    issues.push(`${prefix}.undoContract is required — a real undo, or an irreversibility acknowledgment plus mitigation steps`);
  }
  return issues;
}

export function parseAnswers(raw: string): OnboardingAnswers {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new AnswersInvalid([`answers file is not valid JSON (${error instanceof Error ? error.message : String(error)})`]);
  }
  const issues = validateAnswersShape(parsed);
  if (issues.length > 0) throw new AnswersInvalid(issues);
  return parsed as OnboardingAnswers;
}

export function loadAnswers(answersPath: string): OnboardingAnswers {
  return parseAnswers(readFileSync(answersPath, "utf8"));
}

// --- transcript -> grants/waivers ----------------------------------------------------------------

/**
 * Expands unit-level answers to domain-level grants (KTD3: business units are a copy-layer
 * grouping over domains; grants themselves always bind to the domain id). A domain whose unit was
 * not answered this run, or whose answer did not actually change its level, is left byte-for-byte
 * as it was — re-running onboarding with an unchanged answer must not manufacture a spurious
 * updatedAt churn.
 */
export function buildGrantsPatch(existing: GrantsMap, units: OnboardingAnswers["units"], now: string): GrantsMap {
  const next: GrantsMap = { ...existing };
  for (const [unit, answer] of Object.entries(units) as Array<[BusinessUnit, { level: GrantLevel } | undefined]>) {
    if (!answer) continue;
    for (const domainId of businessUnitDomains[unit]) {
      const current = next[domainId];
      if (current && current.level === answer.level) continue; // unchanged: leave exactly as it was
      const grant: Grant = {
        domainId,
        level: answer.level,
        prerequisites: current?.prerequisites ?? [],
        grantedAt: current?.grantedAt ?? now,
        grantedBy: "founder",
        grantedViaUnit: unit,
        updatedAt: now,
      };
      next[domainId] = grant;
    }
  }
  return next;
}

let waiverSequence = 0;
function nextWaiverId(domainId: string): string {
  waiverSequence += 1;
  return `waiver.${domainId.slice("domain.".length)}.onboarding-${waiverSequence}`;
}

/**
 * Folds allocations into the ledger's balances, keyed by unit plus the resolved period. Re-answering
 * the same unit and period replaces that allocation rather than stacking a second row, and carries
 * forward whatever is already committed and spent against it: raising a budget must never reset the
 * spend history, or `remaining` — the number every budget check actually reads — becomes fiction.
 */
export function buildBudgetBalances(existing: readonly BudgetBalance[], inputs: readonly OnboardingBudgetInput[], now: string): BudgetBalance[] {
  const next = [...existing];
  for (const input of inputs) {
    const period = periodKeyFor(input.budgetPeriod, now);
    const index = next.findIndex((balance) => balance.unit === input.unit && balance.period === period);
    const prior = index >= 0 ? next[index] : undefined;
    const committed = prior?.committed ?? 0;
    const spent = prior?.spent ?? 0;
    const balance: BudgetBalance = {
      unit: input.unit,
      period,
      currency: input.currency,
      allocated: input.allocated,
      committed,
      spent,
      remaining: input.allocated - committed - spent,
      updatedAt: now,
    };
    if (index >= 0) next[index] = balance;
    else next.push(balance);
  }
  return next;
}

/** Every founder pre-approval is a fresh, deliberate record — onboarding always appends, never silently overwrites a prior one. */
export function buildWaivers(existing: readonly Waiver[], inputs: readonly OnboardingWaiverInput[], now: string): Waiver[] {
  const added: Waiver[] = inputs.map((input) => {
    const id = nextWaiverId(input.domainId);
    return {
      id,
      domainId: input.domainId,
      actionClass: input.actionClass,
      protectedCategory: input.protectedCategory,
      scope: input.scope,
      caps: input.caps,
      budgetPeriod: input.budgetPeriod,
      expiry: input.expiry,
      undoContract: input.undoContract,
      auditRef: `audit.onboarding.${id}`,
      status: "active",
      createdAt: now,
      createdBy: "founder",
    };
  });
  return [...existing, ...added];
}

// --- workspace plumbing (shared with kernel/session/run.ts via ./reducer-cli.js) -------------------

function tryLoadJson(filePath: string): unknown | undefined {
  if (!existsSync(filePath)) return undefined;
  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch {
    return undefined;
  }
}

function loadExistingControl(controlPath: string): ControlFile | undefined {
  const raw = tryLoadJson(controlPath);
  if (raw === undefined) return undefined;
  const result = validateControl(raw);
  return result.valid ? result.value : undefined;
}

/** Undefined means "no ledger yet", which is a legitimate first-run state, not a failure. */
function loadExistingLedger(ledgerPath: string): BudgetLedgerDocument | undefined {
  const raw = tryLoadJson(ledgerPath);
  if (raw === undefined) return undefined;
  const result = validateBudgetLedger(raw);
  return result.valid ? result.value : undefined;
}

function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function main(): number {
  const args = parseArgs(process.argv.slice(2));
  const missing = ["workspace", "answers"].filter((name) => !args[name]);
  if (missing.length > 0) {
    console.error(`onboard.missing_argument: --${missing.join(", --")} ${missing.length === 1 ? "is" : "are"} required`);
    return 1;
  }

  const resolvedWorkspace = resolveCliWorkspace(args.workspace!);
  if (!resolvedWorkspace.ok) {
    console.error(resolvedWorkspace.message);
    return 1;
  }
  const workspace = resolvedWorkspace.path;
  const compatible = loadWorkspaceCatalog(workspace);
  if (!compatible.ok) {
    console.error(`ISSUE onboard.compatibility: ${renderCatalogRefusal(compatible.refusal)}`);
    return 1;
  }
  const paths = resolveWorkspacePaths(workspace);
  const now = args.now ?? new Date().toISOString();
  const dryRun = args["dry-run"] === "true";

  let answers: OnboardingAnswers;
  try {
    answers = loadAnswers(resolveCallerPath(args.answers!));
  } catch (error) {
    const message = error instanceof AnswersInvalid ? error.issues.join("; ") : error instanceof Error ? error.message : String(error);
    console.error(`ISSUE onboard.answers_invalid: ${message}`);
    return 1;
  }

  const existingControl = loadExistingControl(paths.control);
  if (existingControl && existingControl.businessSlug !== answers.businessSlug) {
    console.error(
      `ISSUE onboard.business_slug_mismatch: answers file names "${answers.businessSlug}" but this workspace's control file is "${existingControl.businessSlug}"`,
    );
    return 1;
  }

  // --- build and validate the candidate grants + waivers against U1's real schemas (never a
  // second, hand-rolled copy of the same rules) before anything is written -----------------------

  const candidateGrants = buildGrantsPatch(existingControl?.grants ?? {}, answers.units, now);
  const grantsCheck = validateGrants({ schemaVersion: "1.0.0", updatedAt: now, grants: candidateGrants });
  if (!grantsCheck.valid) {
    for (const issue of grantsCheck.issues) console.error(`ISSUE onboard.grant_invalid: ${issue.message} (${issue.path})`);
    return 1;
  }

  const waiverInputs = answers.waivers ?? [];
  const candidateWaivers = buildWaivers(existingControl?.waivers ?? [], waiverInputs, now);
  const waiversCheck = validateWaivers({ schemaVersion: "1.0.0", updatedAt: now, waivers: candidateWaivers });
  if (!waiversCheck.valid) {
    // "a waiver opt-in missing any envelope field refuses activation" — the whole run refuses,
    // not just the incomplete waiver, so nothing is committed here even if other waivers or all
    // of the grant choices were fine.
    for (const issue of waiversCheck.issues) console.error(`ISSUE onboard.waiver_incomplete: ${issue.message} (${issue.path})`);
    return 1;
  }

  // Spend allocations validate here, alongside grants and waivers, so a malformed budget refuses
  // the run before anything is written — the same all-or-nothing rule the waiver envelope gets.
  const budgetInputs = answers.budgets ?? [];
  const existingLedger = loadExistingLedger(paths.ledger);
  const candidateLedger: BudgetLedgerDocument = {
    schemaVersion: "1.0.0",
    updatedAt: now,
    balances: buildBudgetBalances(existingLedger?.balances ?? [], budgetInputs, now),
    entries: existingLedger?.entries ?? [],
  };
  const ledgerCheck = validateBudgetLedger(candidateLedger);
  if (!ledgerCheck.valid) {
    for (const issue of ledgerCheck.issues) console.error(`ISSUE onboard.budget_invalid: ${issue.message} (${issue.path})`);
    return 1;
  }

  const grantsChanged = !deepEqual(existingControl?.grants ?? {}, candidateGrants);
  const waiversChanged = waiverInputs.length > 0; // always an append when present; never a no-op
  const budgetsChanged = budgetInputs.length > 0;

  const ops: PatchOp[] = [];
  const declaredOutputs: PatchPath[] = [];
  const isBootstrap = !existingControl;

  if (isBootstrap) {
    // control.schema.json requires grants and waivers on every document, so a first-ever
    // commit for this workspace must set both even when this run's answers left one of them
    // unchanged from the (nonexistent) baseline — "changed vs. before" only means something
    // once a before exists.
    ops.push(
      { op: "set", path: ["businessSlug"], value: answers.businessSlug },
      { op: "set", path: ["killSwitch"], value: { engaged: false, engagedAt: "", engagedBy: "", reason: "" } },
      { op: "set", path: ["grants"], value: candidateGrants },
      { op: "set", path: ["waivers"], value: candidateWaivers },
    );
    declaredOutputs.push(["businessSlug"], ["killSwitch"], ["grants"], ["waivers"]);
  } else {
    if (grantsChanged) {
      ops.push({ op: "set", path: ["grants"], value: candidateGrants });
      declaredOutputs.push(["grants"]);
    }
    if (waiversChanged) {
      ops.push({ op: "set", path: ["waivers"], value: candidateWaivers });
      declaredOutputs.push(["waivers"]);
    }
  }

  if (ops.length === 0 && !budgetsChanged) {
    console.log("Nothing to update: every answered area already matches this business's current settings.");
    return 0;
  }

  if (dryRun) {
    if (budgetsChanged) {
      console.log(`DRY RUN: would ${existingLedger ? "update" : "create"} ${paths.ledger} with:`);
      console.log(JSON.stringify({ balances: candidateLedger.balances }, null, 2));
    }
    if (ops.length > 0) {
      console.log(`DRY RUN: would ${isBootstrap ? "create" : "update"} ${paths.control} with:`);
      console.log(JSON.stringify({ grants: grantsChanged ? candidateGrants : undefined, waivers: waiversChanged ? candidateWaivers : undefined }, null, 2));
    }
    return 0;
  }

  /**
   * Two reducer-owned documents cannot be committed as one transaction — the reducer is
   * per-document — so the order decides what a partial failure leaves behind, and the two
   * outcomes are not equally honest. Ledger first: an allocation with no grants authorizes
   * nothing and is inert. The reverse would put the founder's trust settings live while the
   * money answer they just gave silently failed to land, which is the state most likely to be
   * mistaken for success. Both candidates were validated above, so a failure here is lock
   * contention or tamper detection, never a bad answer.
   */
  if (budgetsChanged) {
    const ledgerPatch: StatePatch = {
      schemaVersion: "1.0.0",
      patchId: `patch.onboard-budget.${answers.businessSlug}.${Date.parse(now) || Date.now()}`,
      targetDoc: "budget-ledger",
      reason: "Applying founder spend allocations from autonomy onboarding",
      authoredBy: "onboarding-driver",
      authoredAt: now,
      preconditions: existingLedger
        ? [{ path: ["updatedAt"], operator: "equals", value: existingLedger.updatedAt }]
        : [{ path: ["balances"], operator: "not_exists" }],
      ops: existingLedger
        ? [{ op: "set", path: ["balances"], value: candidateLedger.balances }]
        : [
            { op: "set", path: ["balances"], value: candidateLedger.balances },
            { op: "set", path: ["entries"], value: candidateLedger.entries },
          ],
      declaredOutputs: existingLedger ? [["balances"]] : [["balances"], ["entries"]],
    };
    const ledgerResult = runReducer(
      [
        "commit",
        "--file",
        paths.ledger,
        "--manifest",
        paths.manifest,
        "--audit",
        paths.audit,
        "--session",
        "onboarding-driver",
        "--now",
        now,
        "--founder-authority",
        "true",
      ],
      JSON.stringify(ledgerPatch),
    );
    process.stdout.write(ledgerResult.output);
    if (ledgerResult.code !== 0) return ledgerResult.code;
  }

  if (ops.length === 0) return 0;

  // Race guard: two onboarding runs against the same workspace must not silently clobber one
  // another. Bootstrap asserts nothing has beaten us to creating this control doc; an update
  // asserts the document is still exactly as we read it (optimistic concurrency on updatedAt) —
  // either way, a racing commit that lands first makes the reducer reject this one with a named
  // precondition failure instead of silently overwriting it.
  const preconditions: PatchPrecondition[] = isBootstrap
    ? [{ path: ["businessSlug"], operator: "not_exists" }]
    : [{ path: ["updatedAt"], operator: "equals", value: existingControl!.updatedAt }];

  const patch: StatePatch = {
    schemaVersion: "1.0.0",
    patchId: `patch.onboard.${answers.businessSlug}.${Date.parse(now) || Date.now()}`,
    targetDoc: "control",
    reason: "Applying founder autonomy onboarding answers",
    authoredBy: "onboarding-driver",
    authoredAt: now,
    preconditions,
    ops,
    declaredOutputs,
  };

  const result = runReducer(
    // Onboarding is a founder-initiated flow, so it carries --founder-authority: the reducer
    // requires it for control/grants/waivers patches (autonomous session work never does).
    [
      "commit",
      "--file",
      paths.control,
      "--manifest",
      paths.manifest,
      "--audit",
      paths.audit,
      "--session",
      "onboarding-driver",
      "--now",
      now,
      "--founder-authority",
      "true",
    ],
    JSON.stringify(patch),
  );
  process.stdout.write(result.output);
  return result.code;
}

if (isMainModule(import.meta.url)) {
  process.exitCode = main();
}
