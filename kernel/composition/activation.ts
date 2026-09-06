import { assertNoPendingInitialization } from "../session/initialization-guard.js";
import { resolveProviderImplementation } from "./providers.js";
import type { PackageDependency } from "./resources.js";
import { reconcileRunPlan, buildCheckpoint } from "../engine/runstate.js";
import { validateBusinessState, validateRunState, validateCheckpoint } from "../schema/index.js";
import { assertNoPendingErasure } from "../reducer/erasure-guard.js";
import type { CompiledPlan } from "../engine/compile.js";
import { createHash, randomUUID } from "node:crypto";
import { closeSync, existsSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseDocument } from "yaml";
import { z } from "zod";
import { compositionSchema, type Composition } from "../../contracts/public-api/contract.js";
import { compilePlan, type CatalogInput } from "../engine/compile.js";
import { workflowContractFingerprint } from "../engine/review-evidence.js";
import { acquireLock, releaseLock, readLock, isStale } from "../reducer/lock.js";
import { createSnapshotReader } from "./resources.js";

const CATALOG = "catalog.json";
const RUNTIME = ".b2c-launch/runtime.json";
const RUN = "run/run-state.json";
const CHECKPOINT = "run/checkpoint.json";
const SURFACES = [
  ["catalog", CATALOG],
  ["runtime", RUNTIME],
  ["run", RUN],
  ["checkpoint", CHECKPOINT],
] as const;
const JOURNAL = ".b2c-launch/composition-activation.json";
const REVISION_FILES = [
  "state/business-state.json",
  "control/manifest.json",
  "control/control.json",
  "control/grants.json",
  "control/waivers.json",
  "control/budget-ledger.json",
  "run/run-state.json",
  "run/checkpoint.json",
  "state/current-truth.json",
];
const hash = (bytes: string): string => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
const digestSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const pairSchema = z.strictObject({ before: z.string().nullable(), after: z.string() });
const optionalPairSchema = z.strictObject({ before: z.string().nullable(), after: z.string().nullable() });
const previewSchema = z.strictObject({
  schemaVersion: z.literal(1),
  id: digestSchema,
  configurationDigest: digestSchema,
  configurationRevision: z.number().int().positive(),
  workspaceRevision: digestSchema,
  priorPlanId: z.string().nullable(),
  planId: z.string(),
  retained: z.array(z.string()),
  reopened: z.array(z.string()),
  added: z.array(z.string()),
  removed: z.array(z.string()),
  packageDigests: z.array(digestSchema),
  disclosures: z.array(
    z.strictObject({
      workflowId: z.string(),
      effect: z.string(),
      resources: z.array(z.string()),
      entrypoints: z.array(z.string()),
      requestedAuthorityCategories: z.array(z.string()),
      validationContract: z.strictObject({ id: z.string(), version: z.string(), kind: z.literal("billing") }).optional(),
    }),
  ),
  files: z.strictObject({ catalog: pairSchema, runtime: pairSchema, run: optionalPairSchema, checkpoint: optionalPairSchema }),
});
export type ActivationPreview = z.infer<typeof previewSchema>;
const journalSchema = z.strictObject({ schemaVersion: z.literal(1), status: z.literal("incomplete"), preview: previewSchema });
export type ActivationResult =
  { status: "activated"; planId: string; configurationRevision: number; idempotent: boolean } | { status: "restored"; planId: string | null };
export type ActivationBoundary = "journal" | "catalog" | "runtime" | "run" | "checkpoint" | "complete";
export interface ActivationOptions {
  ownerSessionId: string;
  /** Internal owner handoff; checked against the current durable session lease. */
  heldSessionLease?: string;
  /** Test-only interruption seam. Called after each durable persistence boundary. */
  afterWrite?: (boundary: ActivationBoundary) => void;
}

function location(workspace: string, relative: string): string {
  const root = path.resolve(workspace);
  if (!lstatSync(root).isDirectory() || lstatSync(root).isSymbolicLink()) throw new Error("composition.unsafe_workspace");
  let current = root;
  for (const segment of relative.split("/")) {
    current = path.join(current, segment);
    try {
      if (lstatSync(current).isSymbolicLink()) throw new Error("composition.unsafe_path");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  return current;
}
function read(workspace: string, relative: string): string | null {
  const file = location(workspace, relative);
  try {
    if (!lstatSync(file).isFile()) throw new Error("composition.invalid_file");
    return readFileSync(file, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}
function atomicWrite(file: string, bytes: string): void {
  mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    const descriptor = openSync(temporary, "wx", 0o600);
    try {
      writeFileSync(descriptor, bytes);
      fsyncSync(descriptor);
    } finally {
      closeSync(descriptor);
    }
    renameSync(temporary, file);
    const directory = openSync(path.dirname(file), "r");
    try {
      fsyncSync(directory);
    } finally {
      closeSync(directory);
    }
  } finally {
    if (existsSync(temporary)) unlinkSync(temporary);
  }
}
function durableRemove(file: string): void {
  unlinkSync(file);
  const directory = openSync(path.dirname(file), "r");
  try {
    fsyncSync(directory);
  } finally {
    closeSync(directory);
  }
}
function revision(workspace: string, preview?: ActivationPreview): string {
  return hash(
    JSON.stringify(
      REVISION_FILES.map((file) => {
        const current = read(workspace, file);
        const pair = file === RUN ? preview?.files.run : file === CHECKPOINT ? preview?.files.checkpoint : undefined;
        return [file, pair && current === pair.after ? pair.before : current];
      }),
    ),
  );
}
function configuration(workspace: string): { bytes: string; value: Composition } {
  const bytes = read(workspace, "b2c.yaml");
  if (bytes === null) throw new Error("composition.configuration_missing");
  const parsed = parseDocument(bytes, { uniqueKeys: true });
  if (parsed.errors.length) throw new Error("composition.configuration_invalid");
  return { bytes, value: compositionSchema.parse(parsed.toJS({ maxAliasCount: 0 })) };
}
function object(bytes: string): Record<string, unknown> {
  return z.record(z.string(), z.unknown()).parse(JSON.parse(bytes));
}
function previewId(preview: Omit<ActivationPreview, "id"> | ActivationPreview): string {
  const { id: _id, ...body } = preview as ActivationPreview;
  const canonical = (value: unknown): string =>
    Array.isArray(value)
      ? `[${value.map(canonical).join(",")}]`
      : value && typeof value === "object"
        ? `{${Object.entries(value)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
            .join(",")}}`
        : JSON.stringify(value);
  return hash(canonical(body));
}
function verifyPreview(input: ActivationPreview): ActivationPreview {
  const reader = createSnapshotReader();
  const preview = previewSchema.parse(input);
  if (previewId(preview) !== preview.id) throw new Error("composition.preview_tampered");
  const catalog = JSON.parse(preview.files.catalog.after) as CatalogInput;
  const plan = compilePlan(catalog);
  if (plan.planId !== preview.planId) throw new Error("composition.staged_plan_mismatch");
  for (const node of plan.nodes)
    if (node.selectedOperation) {
      for (const pin of [node.selectedOperation.contract, node.selectedOperation.implementation, node.selectedOperation.recipeSelection])
        reader.load(pin.packageDirectory, pin.packageDigest);
    }
  if (preview.files.run.after !== null) {
    const run = validateRunState(JSON.parse(preview.files.run.after));
    if (!run.valid || !run.value || run.value.planId !== preview.planId) throw new Error("composition.staged_run_mismatch");
  }
  if (preview.files.checkpoint.after !== null) {
    const checkpoint = validateCheckpoint(JSON.parse(preview.files.checkpoint.after));
    if (!checkpoint.valid || !checkpoint.value || JSON.stringify(checkpoint.value.runState) !== JSON.stringify(JSON.parse(preview.files.run.after ?? "null")))
      throw new Error("composition.staged_checkpoint_mismatch");
  }
  return preview;
}

/** All execution/read owners call this before reading either active pin. */
export function assertCompositionActivationComplete(workspace: string): void {
  if (read(workspace, JOURNAL) !== null)
    throw new Error("composition.activation_incomplete: recover the pending local activation before reading or executing the pin");
}
function stageRun(workspace: string, plan: CompiledPlan, changed: boolean, runtimeChanged: boolean) {
  const before = read(workspace, RUN),
    checkpointBefore = read(workspace, CHECKPOINT);
  if (!changed || before === null) return { run: { before, after: before }, checkpoint: { before: checkpointBefore, after: checkpointBefore } };
  const raw = object(before);
  const nodes = z.record(z.string(), z.unknown()).parse(raw.nodes);
  for (const item of Object.values(nodes)) {
    const node = z.record(z.string(), z.unknown()).parse(item);
    if (["running", "verifying", "needs_readback", "orphaned"].includes(String(node.status))) throw new Error("composition.active_or_uncertain_attempt");
    if (
      Array.isArray(node.attempts) &&
      node.attempts.some((attempt) => ["running", "verifying", "needs_readback", "orphaned"].includes(String(attempt.status)))
    )
      throw new Error("composition.active_or_uncertain_attempt");
  }
  if (Object.values((raw.workOrders ?? {}) as Record<string, { status?: string }>).some((entry) => entry.status === "running"))
    throw new Error("composition.active_or_uncertain_attempt");
  const prior = validateRunState(raw);
  const business = validateBusinessState(JSON.parse(read(workspace, "state/business-state.json") ?? "null"));
  if (!prior.valid || !prior.value || !business.valid || !business.value) throw new Error("composition.reconciliation_state_invalid");
  if (Object.values(prior.value.publicRequests ?? {}).some((request) => request.status === "running")) throw new Error("business.request_recovery_required");
  // Stable preview time: no clock-dependent bytes change between plan and apply.
  const next = reconcileRunPlan(plan, prior.value, business.value, {
    ownerSessionId: prior.value.ownerSessionId,
    ttlSeconds: prior.value.ttlSeconds,
    wallClockCapSeconds: prior.value.wallClockCapSeconds,
    now: prior.value.updatedAt,
    invalidateAll: runtimeChanged,
  });
  if (!validateRunState(next).valid) throw new Error("composition.reconciled_run_invalid");
  let checkpointAfter = checkpointBefore;
  if (checkpointBefore !== null) {
    const checked = validateCheckpoint(JSON.parse(checkpointBefore));
    if (!checked.valid || !checked.value || checked.value.runState.runId !== prior.value.runId) throw new Error("composition.checkpoint_invalid");
    checkpointAfter =
      JSON.stringify(buildCheckpoint(next, prior.value.ownerSessionId, `checkpoint:${plan.planId}:${next.runId}:${next.updatedAt}`, next.updatedAt), null, 2) +
      "\n";
  }
  return { run: { before, after: JSON.stringify(next, null, 2) + "\n" }, checkpoint: { before: checkpointBefore, after: checkpointAfter } };
}

/** Read-only preview. Proposed bytes do not repin an installed workspace. */
export function previewCompositionActivation(input: { workspace: string; catalog: CatalogInput; runtime: Record<string, unknown> }): ActivationPreview {
  const reader = createSnapshotReader();
  assertNoPendingErasure(input.workspace);
  assertCompositionActivationComplete(input.workspace);
  const config = configuration(input.workspace);
  const plan = compilePlan(input.catalog);
  const beforeCatalog = read(input.workspace, CATALOG);
  const priorPlan = beforeCatalog === null ? undefined : compilePlan(JSON.parse(beforeCatalog) as CatalogInput);
  const beforeRuntime = read(input.workspace, RUNTIME);
  const priorRuntime = beforeRuntime === null ? {} : object(beforeRuntime);
  const priorComposition = priorRuntime.composition === undefined ? {} : z.record(z.string(), z.unknown()).parse(priorRuntime.composition);
  const previousRevision =
    priorComposition.configurationRevision === undefined ? 0 : z.number().int().nonnegative().parse(priorComposition.configurationRevision);
  const configurationDigest = hash(config.bytes);
  const selected = plan.nodes.filter((node) => node.selectedOperation).map((node) => node.selectedOperation!);
  if (!selected.length) throw new Error("composition.unresolved_configuration");
  const closure = new Set<string>();
  const verifiedPackages: PackageDependency[] = [];
  const collect = (directory: string, digest: string): void => {
    if (closure.has(digest)) return;
    const snapshot = reader.load(directory, digest);
    closure.add(digest);
    verifiedPackages.push({ directory, snapshot });
    for (const dependency of snapshot.dependencies) collect(path.join(path.dirname(directory), dependency.digest.slice(7)), dependency.digest);
  };
  for (const binding of selected)
    for (const pin of [binding.recipeSelection, binding.contract, binding.implementation]) collect(pin.packageDirectory, pin.packageDigest);
  for (const binding of selected) {
    const recipeSnapshot = reader.load(binding.recipeSelection.packageDirectory, binding.recipeSelection.packageDigest);
    const recipe = recipeSnapshot.extension.recipes.find((entry) => entry.id === config.value.recipe.id);
    if (
      !recipe ||
      recipe.version !== config.value.recipe.version ||
      binding.recipeSelection.id !== config.value.recipe.id ||
      JSON.stringify(binding.recipeSelection.target) !== JSON.stringify(config.value.target)
    )
      throw new Error("composition.configuration_selection_mismatch");
    const declaration = recipe.operations.find((entry) => entry.operation === binding.operation);
    if (
      !declaration ||
      recipe.workflows.some((id) => !plan.nodes.some((node) => node.workflowId === id)) ||
      recipe.operations.some((entry) => entry.required && !selected.some((current) => current.operation === entry.operation))
    )
      throw new Error("composition.recipe_incomplete");
    const override = config.value.bindings[binding.operation];
    if (override?.connection) throw new Error("composition.connection_binding_uncompiled");
    const providerSelection = override
      ? resolveProviderImplementation(verifiedPackages, { operation: binding.operation, provider: override.provider, target: config.value.target })
      : undefined;
    if (
      override
        ? providerSelection!.implementation.id !== binding.implementation.id ||
          providerSelection!.owner.snapshot.digest !== binding.implementation.packageDigest
        : declaration.implementation !== binding.implementation.id
    )
      throw new Error("composition.configuration_binding_mismatch");
  }
  if (Object.keys(config.value.bindings).some((operation) => !selected.some((binding) => binding.operation === operation)))
    throw new Error("composition.configuration_binding_uncompiled");
  const packageDigests = [...closure].sort();
  const oldById = new Map(priorPlan?.nodes.map((node) => [node.id, node]));
  const retained: string[] = [],
    reopened: string[] = [],
    added: string[] = [];
  for (const node of plan.nodes) {
    const prior = oldById.get(node.id);
    if (!prior) added.push(node.workflowId);
    else (workflowContractFingerprint(prior) === workflowContractFingerprint(node) ? retained : reopened).push(node.workflowId);
  }
  const changed = new Set([...reopened, ...added]);
  let expanded = true;
  while (expanded) {
    expanded = false;
    for (const node of plan.nodes)
      if (!changed.has(node.workflowId) && node.dependencies.some((id) => changed.has(plan.nodes.find((entry) => entry.id === id)!.workflowId))) {
        changed.add(node.workflowId);
        reopened.push(node.workflowId);
        const retainedIndex = retained.indexOf(node.workflowId);
        if (retainedIndex >= 0) retained.splice(retainedIndex, 1);
        expanded = true;
      }
  }
  const removed = (priorPlan?.nodes ?? []).filter((node) => !plan.nodes.some((current) => current.id === node.id)).map((node) => node.workflowId);
  const runtimeContractChanged = ["skillVersion", "skillRoot", "knowledgeRoot", "installedSkillName", "skillRootEnv"].some(
    (field) => priorRuntime[field] !== input.runtime[field],
  );
  const runFiles = stageRun(input.workspace, plan, priorPlan?.planId !== plan.planId || runtimeContractChanged, runtimeContractChanged);
  const configurationRevision =
    priorComposition.configurationDigest === configurationDigest && priorComposition.planId === plan.planId
      ? Math.max(previousRevision, 1)
      : previousRevision + 1;
  const runtime = {
    ...input.runtime,
    catalogPath: CATALOG,
    catalogVersion: input.catalog.version,
    composition: {
      ...priorComposition,
      ...(input.runtime.composition as Record<string, unknown> | undefined),
      configurationDigest,
      configurationRevision,
      planId: plan.planId,
      packageDigests,
    },
  };
  const preview: Omit<ActivationPreview, "id"> = {
    schemaVersion: 1,
    configurationDigest,
    configurationRevision,
    workspaceRevision: revision(input.workspace),
    priorPlanId: priorPlan?.planId ?? null,
    planId: plan.planId,
    retained,
    reopened,
    added,
    removed,
    packageDigests,
    disclosures: plan.nodes.map((node) => ({
      workflowId: node.workflowId,
      effect: node.actionClass,
      resources: node.resources.map((resource) => resource.id),
      requestedAuthorityCategories: node.protectedCategory ? [node.protectedCategory] : [],
      ...(node.selectedOperation?.implementation.validationContract ? { validationContract: node.selectedOperation.implementation.validationContract } : {}),
      entrypoints:
        node.selectedOperation?.resources.filter((resource) => resource.kind === "adapter").map((resource) => `${resource.packageDigest}:${resource.id}`) ?? [],
    })),
    files: {
      ...runFiles,
      catalog: { before: beforeCatalog, after: JSON.stringify(input.catalog, null, 2) + "\n" },
      runtime: { before: beforeRuntime, after: JSON.stringify(runtime, null, 2) + "\n" },
    },
  };
  return verifyPreview({ ...preview, id: previewId(preview) });
}
function withLease<T>(workspace: string, options: ActivationOptions, operation: () => T): T {
  const held: string[] = [];
  try {
    for (const relative of ["control/session.lock", "control/manifest.json.lock", "state/business-state.json.lock"]) {
      const file = location(workspace, relative);
      if (relative === "control/session.lock" && options.heldSessionLease) {
        const lock = readLock(file);
        if (
          !lock ||
          lock.ownerSessionId !== options.ownerSessionId ||
          options.heldSessionLease !== options.ownerSessionId ||
          isStale(lock, new Date().toISOString())
        )
          throw new Error("composition.invalid_session_lease");
        continue;
      }
      const result = acquireLock(file, { ownerSessionId: options.ownerSessionId, retries: 0 });
      if (!result.ok) throw new Error(`composition.workspace_${result.reason}`);
      held.push(file);
    }
    assertNoPendingInitialization(workspace);
    assertNoPendingErasure(workspace);
    return operation();
  } finally {
    for (const file of held.reverse()) releaseLock(file, options.ownerSessionId);
  }
}
function validateCurrentInputs(workspace: string, preview: ActivationPreview): void {
  if (hash(configuration(workspace).bytes) !== preview.configurationDigest || revision(workspace, preview) !== preview.workspaceRevision)
    throw new Error("composition.stale_preview");
}
function finish(workspace: string, preview: ActivationPreview, options: ActivationOptions): ActivationResult {
  for (const [key, relative] of SURFACES) {
    const current = read(workspace, relative);
    if (current !== preview.files[key].before && current !== preview.files[key].after) throw new Error("composition.concurrent_pin_edit");
  }
  for (const [key, relative] of SURFACES) {
    const after = preview.files[key].after;
    if (after !== null) atomicWrite(location(workspace, relative), after);
    options.afterWrite?.(key);
  }
  durableRemove(location(workspace, JOURNAL));
  options.afterWrite?.("complete");
  return { status: "activated", planId: preview.planId, configurationRevision: preview.configurationRevision, idempotent: false };
}
/** Persist staged bytes, then replace pin and reconciled run surfaces under a named incomplete journal. */
export function applyCompositionActivation(workspace: string, input: ActivationPreview, options: ActivationOptions): ActivationResult {
  return withLease(workspace, options, () => {
    assertCompositionActivationComplete(workspace);
    const preview = verifyPreview(input);
    if (hash(configuration(workspace).bytes) !== preview.configurationDigest) throw new Error("composition.stale_preview");
    if (SURFACES.every(([key, relative]) => read(workspace, relative) === preview.files[key].after))
      return { status: "activated", planId: preview.planId, configurationRevision: preview.configurationRevision, idempotent: true };
    validateCurrentInputs(workspace, preview);
    if (SURFACES.some(([key, relative]) => read(workspace, relative) !== preview.files[key].before)) throw new Error("composition.stale_preview");
    const refreshed = previewCompositionActivation({
      workspace,
      catalog: JSON.parse(preview.files.catalog.after),
      runtime: object(preview.files.runtime.after),
    });
    if (refreshed.id !== preview.id) throw new Error("composition.stale_preview");
    atomicWrite(location(workspace, JOURNAL), JSON.stringify({ schemaVersion: 1, status: "incomplete", preview }));
    options.afterWrite?.("journal");
    return finish(workspace, preview, options);
  });
}
/** Recovery uses only the journal's staged bytes; it never recompiles or repins a source tree. */
export function recoverCompositionActivation(workspace: string, mode: "resume" | "restore", options: ActivationOptions): ActivationResult {
  return withLease(workspace, options, () => {
    const raw = read(workspace, JOURNAL);
    if (raw === null) throw new Error("composition.no_pending_activation");
    const journal = journalSchema.parse(JSON.parse(raw));
    if (previewId(journal.preview) !== journal.preview.id) throw new Error("composition.journal_tampered");
    if (mode === "resume") {
      const preview = verifyPreview(journal.preview);
      validateCurrentInputs(workspace, preview);
      return finish(workspace, preview, options);
    }
    if (revision(workspace, journal.preview) !== journal.preview.workspaceRevision) throw new Error("composition.stale_restore");
    for (const [key, relative] of SURFACES) {
      const current = read(workspace, relative),
        pair = journal.preview.files[key];
      if (current !== pair.before && current !== pair.after) throw new Error("composition.concurrent_pin_edit");
    }
    for (const [key, relative] of SURFACES) {
      const before = journal.preview.files[key].before;
      if (before === null) {
        if (read(workspace, relative) !== null) durableRemove(location(workspace, relative));
      } else atomicWrite(location(workspace, relative), before);
      options.afterWrite?.(key);
    }
    durableRemove(location(workspace, JOURNAL));
    options.afterWrite?.("complete");
    return { status: "restored", planId: journal.preview.priorPlanId };
  });
}
