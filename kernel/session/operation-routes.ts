import { assertRedistributable, noticesForResources, renderThirdPartyNotices } from "../composition/notices.js";
import { assertWorkerContext } from "../composition/worker-context.js";
import { boundedFileBytes } from "../lib/bounded-file.js";
import { loadRunState } from "../engine/runstate.js";
import { createHash } from "node:crypto";
import { openSync, closeSync, fsyncSync, existsSync, lstatSync, mkdirSync, writeFileSync, unlinkSync } from "node:fs";
import path from "node:path";
import { Ajv2020, type AnySchema } from "ajv/dist/2020.js";
import { validateSourceAccess } from "../../contracts/source-access.js";
import { loadSelectedKnowledge, verifySelectedEffect, verifySelectedOperation } from "../composition/compile-bindings.js";
import { createSnapshotReader, readSnapshotResource, readStoredSnapshot } from "../composition/resources.js";
import { workflowContractFingerprint } from "../engine/review-evidence.js";
import { outputFingerprintPath } from "../engine/artifact-fingerprint.js";
import type { CatalogWorkflowNode, CompiledRunNode } from "../engine/compile.js";
import type { NodeExecutor, NodeVerifier, NodeExecutionContext, NodeExecutionResult, NodeVerificationContext, VerificationOutcome } from "./executor.js";
import { snapshotWorkspaceChanges, verifyWorkspaceChanges } from "./input-inventory.js";

export interface OperationRouteRequest {
  input: unknown;
  idempotencyKey: string;
  knowledge: ReturnType<typeof loadSelectedKnowledge>;
}
/** Host callbacks are explicitly installed code. Package manifests cannot register or execute callbacks. */
export interface OperationRoute {
  kind?: "structured-result";
  operation: string;
  implementationId: string;
  packageDigest: string;
  resultArtifactId: string;
  receiptArtifactId: string;
  binaryArtifactIds?: readonly string[];
  /** Host-owned declarations of actual incorporation, never inferred from loading knowledge. */
  incorporatedResources?: readonly { resourceId: string; packageDigest: string }[];
  /** Reserved declared output; callbacks cannot supply these generated notice bytes. */
  noticeArtifactId?: string;
  input(context: NodeExecutionContext): unknown;
  execute(request: OperationRouteRequest): Promise<{ output: unknown; evidence: unknown; artifacts?: Array<{ artifactId: string; bytes: Buffer }> }>;
  /** Independent readback. A schema-valid assertion alone never proves the declared result. */
  observe(request: { input: unknown; output: unknown; evidence: unknown; idempotencyKey: string }): Promise<boolean>;
  maxReceiptAgeMs: number;
}
export interface WorkerArtifactRoute {
  kind: "worker-artifacts";
  operation: string;
  implementationId: string;
  packageDigest: string;
  executor: NodeExecutor;
  verifier: NodeVerifier;
}
type HostRoute = OperationRoute | WorkerArtifactRoute;
interface Receipt {
  schemaVersion: "b2c.operation-receipt/v1";
  operation: string;
  implementationId: string;
  contractFingerprint: string;
  runId: string;
  workflowId: string;
  idempotencyKey: string;
  input: unknown;
  inputDigest: string;
  acceptedInputFingerprint: string;
  executionCycle: string;
  outputDigest: string;
  artifactDigests?: Record<string, string>;
  incorporationDigest?: string;
  recordedAt: string;
  evidence: unknown;
  providerProof: "not_observed";
}
const bytesDigest = (value: Buffer) => createHash("sha256").update(value).digest("hex");
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const failure = (error: unknown): NodeExecutionResult => ({
  status: "failed",
  outputs: [],
  evidence: [],
  error: error instanceof Error ? error.message : String(error),
});

function inside(root: string, relative: string, access: "read" | "create" = "create"): string {
  validateSourceAccess([{ path: relative, access }]);
  const absolute = path.resolve(root, relative);
  let cursor = path.resolve(root);
  if (lstatSync(cursor).isSymbolicLink()) throw new Error("binding.workspace_symlink");
  for (const part of relative.split("/")) {
    cursor = path.join(cursor, part);
    try {
      if (lstatSync(cursor).isSymbolicLink()) throw new Error("binding.output_symlink");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  return absolute;
}
function schemaValidator(node: CompiledRunNode, kind: "inputSchema" | "outputSchema" | "evidenceSchema"): (value: unknown) => void {
  const binding = node.selectedOperation!;
  const snapshot = readStoredSnapshot(binding.contract.packageDirectory, binding.contract.packageDigest);
  const operation = snapshot.extension.capabilities.flatMap((capability) => capability.operations).find((entry) => entry.id === binding.operation)!;
  const schema = JSON.parse(readSnapshotResource(binding.contract.packageDirectory, snapshot, operation[kind]).toString("utf8")) as AnySchema;
  const ajv = new Ajv2020({ strict: true, allErrors: true });
  ajv.addFormat("date-time", { type: "string", validate: (value: string) => /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value)) });
  const validate = ajv.compile(schema);
  return (value) => {
    if (!validate(value)) throw new Error(`binding.${kind}_invalid:${JSON.stringify(validate.errors)}`);
  };
}
function validateNode(node: CompiledRunNode): void {
  if (!node.selectedOperation) throw new Error("binding.selected_operation_missing");
  verifySelectedOperation(node.selectedOperation);
  verifySelectedEffect(node);
}
function verifyInstalledContext(node: CompiledRunNode, workspaceRoot: string): void {
  const selected = node.selectedOperation!;
  const owner = readStoredSnapshot(selected.recipeSelection.packageDirectory, selected.recipeSelection.packageDigest);
  for (const relative of node.role ? [node.role.promptPath, ...node.role.parentPromptPaths] : []) {
    const authoredPath = relative.startsWith(`.b2c-launch/packages/${owner.digest.slice(7)}/`)
      ? relative.slice(`.b2c-launch/packages/${owner.digest.slice(7)}/`.length)
      : relative;
    const resource = owner.extension.resources.find((entry) => entry.path === authoredPath && ["prompt", "knowledge"].includes(entry.kind));
    if (
      resource &&
      !boundedFileBytes(inside(workspaceRoot, relative, "read"), 1024 * 1024).equals(
        readSnapshotResource(selected.recipeSelection.packageDirectory, owner, resource.id),
      )
    )
      throw new Error("binding.installed_context_changed");
  }
}
function validateReceipt(node: CompiledRunNode, route: OperationRoute, receipt: Receipt, output: unknown, now: string): void {
  const age = Date.parse(now) - Date.parse(receipt.recordedAt);
  if (
    receipt.schemaVersion !== "b2c.operation-receipt/v1" ||
    receipt.operation !== route.operation ||
    receipt.implementationId !== route.implementationId ||
    receipt.workflowId !== node.workflowId ||
    receipt.contractFingerprint !== workflowContractFingerprint(node) ||
    receipt.inputDigest !== digest(receipt.input) ||
    receipt.outputDigest !== digest(output) ||
    receipt.incorporationDigest !== incorporationDigest(route) ||
    receipt.providerProof !== "not_observed" ||
    typeof receipt.executionCycle !== "string"
  )
    throw new Error("binding.receipt_identity_mismatch");
  if (!Number.isFinite(age) || age < 0 || age > route.maxReceiptAgeMs) throw new Error("binding.receipt_stale");
  if (
    receipt.idempotencyKey !==
    digest([receipt.runId, node.workflowId, receipt.contractFingerprint, receipt.inputDigest, receipt.acceptedInputFingerprint, receipt.executionCycle])
  )
    throw new Error("binding.receipt_idempotency_mismatch");
  schemaValidator(node, "inputSchema")(receipt.input);
  schemaValidator(node, "outputSchema")(output);
  schemaValidator(node, "evidenceSchema")(receipt.evidence);
}

function incorporationDigest(route: OperationRoute): string | undefined {
  return route.noticeArtifactId ? digest({ artifactId: route.noticeArtifactId, resources: route.incorporatedResources }) : undefined;
}

function binaryOutputIds(route: OperationRoute): string[] {
  return [...(route.binaryArtifactIds ?? []), ...(route.noticeArtifactId ? [route.noticeArtifactId] : [])];
}

function operationNoticeBytes(node: CompiledRunNode, route: OperationRoute): Buffer | undefined {
  if (!route.noticeArtifactId) return undefined;
  const selected = node.selectedOperation!;
  // Visibility starts at selected recipe/contract/implementation exports. A selected resource's
  // owner is provenance only: importing one knowledge resource must not expose its siblings.
  const identities = [selected.recipeSelection, selected.contract, selected.implementation];
  const packages = [...new Map(identities.map((identity) => [identity.packageDigest, identity])).values()].map((identity) => ({
    directory: identity.packageDirectory,
    snapshot: readStoredSnapshot(identity.packageDirectory, identity.packageDigest),
  }));
  const entries = (route.incorporatedResources ?? []).flatMap((reference) => {
    const reader = createSnapshotReader();
    const visible = packages.find((entry) => {
      try {
        return reader.identity(entry.directory, entry.snapshot, reference.resourceId).packageDigest === reference.packageDigest;
      } catch {
        return false;
      }
    });
    if (!visible) throw new Error(`binding.incorporated_resource_unselected:${reference.resourceId}`);
    // The verified snapshot import resolver fixes the owner digest and sibling store location.
    const directory = path.join(path.dirname(visible.directory), reference.packageDigest.slice(7));
    const owner = { directory, snapshot: reader.load(directory, reference.packageDigest) };
    assertRedistributable([owner], [reference.resourceId]);
    return noticesForResources([owner], [reference.resourceId]);
  });
  const unique = [...new Map(entries.map((entry) => [`${entry.packageDigest}:${entry.id}`, entry])).values()];
  return Buffer.from(renderThirdPartyNotices(unique), "utf8");
}

function verifyNoticeBytes(node: CompiledRunNode, route: OperationRoute, paths: Record<string, string>): void {
  const expected = operationNoticeBytes(node, route);
  if (expected && (!paths[route.noticeArtifactId!] || !boundedFileBytes(paths[route.noticeArtifactId!]!, 32 * 1024 * 1024).equals(expected)))
    throw new Error("binding.notice_output_mismatch");
}

function verifyBinaryArtifacts(route: OperationRoute, receipt: Receipt, paths: Record<string, string>): void {
  const ids = binaryOutputIds(route);
  if (
    Object.keys(receipt.artifactDigests ?? {}).length !== ids.length ||
    ids.some((id) => !paths[id] || bytesDigest(boundedFileBytes(paths[id]!, 32 * 1024 * 1024)) !== receipt.artifactDigests?.[id])
  )
    throw new Error("binding.binary_artifact_mismatch");
}

function executionCycle(node: CompiledRunNode, context: NodeExecutionContext): string {
  const file = inside(context.workspaceDir, "run/run-state.json", "read");
  if (!existsSync(file)) return "standalone";
  const run = loadRunState(file),
    state = run.nodes[node.id],
    attempt = state?.attempts.at(-1);
  if (
    run.runId !== context.runId ||
    attempt?.id !== context.attemptId ||
    !(
      attempt.status === "running" ||
      (attempt.status === "succeeded" &&
        node.outputs.every((id) => context.artifactPaths[id] && existsSync(inside(context.workspaceDir, context.artifactPaths[id]!))))
    ) ||
    attempt.inputFingerprint !== context.authorization?.inputFingerprint
  )
    throw Error("binding.current_attempt_required");
  if (attempt.workOrderOccurrenceId) {
    const occurrence = run.workOrders?.[attempt.workOrderOccurrenceId];
    if (!occurrence || occurrence.status !== "running" || occurrence.workflowId !== node.workflowId || !occurrence.attemptIds.includes(attempt.id))
      throw Error("binding.current_occurrence_required");
    return `occurrence:${occurrence.id}`;
  }
  return `cycle:${state!.attemptCycleStart ?? 0}`;
}
/** A new cycle may replace only the previous independently accepted artifact set. Partial effects never qualify. */
function allowCompletedCycleRollover(node: CompiledRunNode, context: NodeExecutionContext, prior: Receipt, cycle: string, paths: Record<string, string>): void {
  const run = loadRunState(inside(context.workspaceDir, "run/run-state.json", "read")),
    state = run.nodes[node.id],
    current = state?.attempts.at(-1);
  if (
    !state ||
    !current ||
    prior.runId !== run.runId ||
    prior.executionCycle === cycle ||
    run.runId !== context.runId ||
    current.id !== context.attemptId ||
    current.status !== "running"
  )
    throw Error("binding.rollover_identity_mismatch");
  const bindings = node.outputs.map((id) => run.artifactBindings.find((b) => b.artifactId === id));
  const previousId = bindings[0]?.attemptId,
    previous = state.attempts.find((a) => a.id === previousId),
    review = previous?.independentVerification;
  if (
    !previous ||
    previous.status !== "succeeded" ||
    !previous.finishedAt ||
    previous.readbackRequired ||
    review?.verdict !== "accepted" ||
    review.mode !== "workspace" ||
    review.attemptId !== previous.id ||
    review.workflowId !== node.workflowId ||
    review.policyFingerprint !== workflowContractFingerprint(node) ||
    review.producerSessionId !== previous.ownerSessionId ||
    review.verifierSessionId === previous.ownerSessionId
  )
    throw Error("binding.rollover_prior_not_independently_accepted");
  if (
    previous.workOrderOccurrenceId
      ? prior.executionCycle !== `occurrence:${previous.workOrderOccurrenceId}`
      : !/^cycle:\d+$/.test(prior.executionCycle) ||
        Number(prior.executionCycle.slice(6)) > state.attempts.indexOf(previous) ||
        Number(prior.executionCycle.slice(6)) >= (state.attemptCycleStart ?? 0)
  )
    throw Error("binding.rollover_prior_cycle_mismatch");
  if (current.workOrderOccurrenceId) {
    if (!previous.workOrderOccurrenceId || run.workOrders?.[previous.workOrderOccurrenceId]?.status !== "completed")
      throw Error("binding.rollover_prior_occurrence_incomplete");
  } else if (
    !node.recurrenceDays ||
    state.attempts.indexOf(previous) >= (state.attemptCycleStart ?? 0) ||
    Date.parse(current.startedAt!) - Date.parse(previous.finishedAt) < node.recurrenceDays * 86400000
  )
    throw Error("binding.rollover_cycle_not_due");
  for (const [index, id] of node.outputs.entries()) {
    const binding = bindings[index],
      subject = review.subjects.find((s) => s.artifactId === id);
    if (
      !binding?.accepted ||
      binding.attemptId !== previous.id ||
      binding.producedBy !== node.id ||
      binding.path !== paths[id] ||
      !subject ||
      subject.path !== binding.path ||
      subject.fingerprint !== binding.fingerprint ||
      outputFingerprintPath(inside(context.workspaceDir, binding.path)) !== binding.fingerprint
    )
      throw Error("binding.rollover_prior_proof_changed");
  }
}

function validateWorkerOutputs(node: CompiledRunNode, root: string, outputs: readonly { artifactId: string; path: string; fingerprint: string }[]): void {
  if (
    node.outputs.length !== node.outputPaths.length ||
    outputs.length !== node.outputs.length ||
    new Set(outputs.map((o) => o.artifactId)).size !== outputs.length ||
    outputs.some(
      (output) =>
        !node.outputs.includes(output.artifactId as never) ||
        node.outputPaths[node.outputs.indexOf(output.artifactId as never)] !== output.path ||
        outputFingerprintPath(inside(root, output.path, "read")) !== output.fingerprint,
    )
  )
    throw Error("binding.worker_output_mismatch");
}

/** Uses existing node output artifacts for both result and receipt; adds no execution state store. */
export class OperationRouteRegistry {
  readonly #routes = new Map<string, HostRoute>();
  constructor(routes: readonly HostRoute[]) {
    for (const route of routes) {
      const key = `${route.operation}\0${route.implementationId}\0${route.packageDigest}`;
      if (
        this.#routes.has(key) ||
        (route.kind !== "worker-artifacts" &&
          (route.resultArtifactId === route.receiptArtifactId || !Number.isFinite(route.maxReceiptAgeMs) || route.maxReceiptAgeMs <= 0))
      )
        throw new Error("binding.invalid_or_duplicate_host_route");
      if (
        route.kind !== "worker-artifacts" &&
        (Boolean(route.noticeArtifactId) !== Boolean(route.incorporatedResources?.length) ||
          (route.incorporatedResources &&
            new Set(route.incorporatedResources.map((entry) => `${entry.packageDigest}:${entry.resourceId}`)).size !== route.incorporatedResources.length))
      )
        throw new Error("binding.invalid_incorporation_declaration");
      this.#routes.set(
        key,
        Object.freeze({
          ...route,
          ...(route.kind !== "worker-artifacts" && route.binaryArtifactIds ? { binaryArtifactIds: Object.freeze([...route.binaryArtifactIds]) } : {}),
          ...(route.kind !== "worker-artifacts" && route.incorporatedResources
            ? { incorporatedResources: Object.freeze(route.incorporatedResources.map((entry) => Object.freeze({ ...entry }))) }
            : {}),
        }),
      );
    }
  }
  #route(node: CompiledRunNode): HostRoute {
    validateNode(node);
    const selected = node.selectedOperation!;
    const route = this.#routes.get(`${selected.operation}\0${selected.implementation.id}\0${selected.implementation.packageDigest}`);
    if (!route) throw new Error("binding.execution_route_unavailable");
    if (route.kind === "worker-artifacts") {
      if (
        selected.implementation.mode !== "worker-artifact" ||
        selected.recipeSelection.target.platform !== "host" ||
        selected.recipeSelection.target.runtime !== "agent-cli"
      )
        throw Error("binding.worker_target_or_mode_mismatch");
      assertWorkerContext({ ...node, id: node.workflowId } as unknown as CatalogWorkflowNode, selected.implementation.workerContext);
      return route;
    }
    if (selected.implementation.mode === "worker-artifact") throw Error("binding.worker_route_required");
    const declaredIds = [route.resultArtifactId, route.receiptArtifactId, ...binaryOutputIds(route)];
    if (
      new Set(declaredIds).size !== declaredIds.length ||
      node.outputs.length !== declaredIds.length ||
      declaredIds.some((id) => !node.outputs.includes(id as never))
    )
      throw new Error("binding.route_output_coverage_mismatch");
    return route;
  }
  async execute(node: CompiledRunNode, context: NodeExecutionContext): Promise<NodeExecutionResult> {
    try {
      const route = this.#route(node);
      verifyInstalledContext(node, context.workspaceDir);
      const authorization = context.authorization;
      if (
        !authorization ||
        authorization.workflowId !== node.workflowId ||
        authorization.runId !== context.runId ||
        authorization.attemptId !== context.attemptId ||
        authorization.actionClass !== node.actionClass ||
        authorization.protectedCategory !== node.protectedCategory ||
        authorization.evaluatedAt !== context.now ||
        authorization.approvalRequirements.some((approval) => approval.status !== "approved") ||
        node.approvals.some((approval) => !authorization.approvalRequirements.some((actual) => actual.id === approval.id && actual.status === "approved"))
      )
        throw new Error("binding.current_authority_required");
      if (route.kind === "worker-artifacts") {
        if (node.outputs.length !== node.outputPaths.length || node.outputs.some((id, index) => context.artifactPaths[id] !== node.outputPaths[index]))
          throw Error("binding.worker_output_path_mismatch");
        const cycle = executionCycle(node, context);
        const run = loadRunState(inside(context.workspaceDir, "run/run-state.json", "read"));
        if (cycle === "standalone" || run.nodes[node.id]?.attempts.at(-1)?.status !== "running") throw Error("binding.current_attempt_required");
        schemaValidator(
          node,
          "inputSchema",
        )({ workflowId: node.workflowId, runId: context.runId, attemptId: context.attemptId, inputFingerprint: authorization.inputFingerprint });
        const before = snapshotWorkspaceChanges(context.workspaceDir);
        const allowedSource = structuredClone(node.sourceAccess ?? []),
          allowedOutputs = [...node.outputPaths],
          runtimeWrites = context.runtimeWrites;
        let result: NodeExecutionResult;
        try {
          result = await route.executor.execute(node, context);
        } finally {
          if (verifyWorkspaceChanges(context.workspaceDir, before, allowedSource, allowedOutputs, runtimeWrites).length)
            throw Error("binding.worker_mutated_undeclared_workspace");
        }
        this.#route(node);
        executionCycle(node, context);
        if (result.status !== "succeeded") return result;
        if (result.outputs.some((output) => context.artifactPaths[output.artifactId] !== output.path)) throw Error("binding.worker_output_path_mismatch");
        validateWorkerOutputs(node, context.workspaceDir, result.outputs);
        schemaValidator(
          node,
          "outputSchema",
        )({ workflowId: node.workflowId, outputs: result.outputs.map(({ artifactId, path, fingerprint }) => ({ artifactId, path, fingerprint })) });
        schemaValidator(node, "evidenceSchema")({ workflowId: node.workflowId, evidence: result.evidence });
        return result;
      }
      const noticeBytes = operationNoticeBytes(node, route);
      const resultPath = context.artifactPaths[route.resultArtifactId];
      const receiptPath = context.artifactPaths[route.receiptArtifactId];
      if (!resultPath || !receiptPath || resultPath === receiptPath || !node.outputPaths.includes(resultPath) || !node.outputPaths.includes(receiptPath))
        throw new Error("binding.output_paths_missing");
      const resultFile = inside(context.workspaceDir, resultPath);
      const receiptFile = inside(context.workspaceDir, receiptPath);
      const beforeInput = snapshotWorkspaceChanges(context.workspaceDir);
      let input: unknown;
      try {
        input = route.input(context);
        schemaValidator(node, "inputSchema")(input);
      } finally {
        if (verifyWorkspaceChanges(context.workspaceDir, beforeInput, [], [], context.runtimeWrites).length)
          throw new Error("binding.input_callback_mutated_workspace");
      }

      const contractFingerprint = workflowContractFingerprint(node);
      const inputDigest = digest(input);
      const acceptedInputFingerprint = authorization.inputFingerprint;
      if (!acceptedInputFingerprint) throw new Error("binding.accepted_input_identity_missing");
      const cycle = executionCycle(node, context);
      const idempotencyKey = digest([context.runId, node.workflowId, contractFingerprint, inputDigest, acceptedInputFingerprint, cycle]);
      const binaryPaths = Object.fromEntries(
        binaryOutputIds(route).map((id) => {
          const relative = context.artifactPaths[id];
          if (!relative || !node.outputPaths.includes(relative)) throw new Error("binding.binary_output_path_missing");
          return [id, inside(context.workspaceDir, relative)];
        }),
      );
      const destinations = [resultFile, receiptFile, ...Object.values(binaryPaths)];
      if (new Set(destinations).size !== destinations.length) throw new Error("binding.output_path_collision");
      let replay = existsSync(resultFile) || existsSync(receiptFile) || Object.values(binaryPaths).some(existsSync);
      let rollover = false;
      if (replay && existsSync(resultFile) && existsSync(receiptFile)) {
        const prior = JSON.parse(boundedFileBytes(receiptFile, 1024 * 1024).toString("utf8")) as Receipt;
        if (prior.schemaVersion === "b2c.operation-receipt/v1" && prior.executionCycle !== cycle) {
          const priorOutput = JSON.parse(boundedFileBytes(resultFile, 1024 * 1024).toString("utf8"));
          validateReceipt(node, route, prior, priorOutput, prior.recordedAt);
          verifyBinaryArtifacts(route, prior, binaryPaths);
          verifyNoticeBytes(node, route, binaryPaths);
          allowCompletedCycleRollover(node, context, prior, cycle, context.artifactPaths);
          rollover = true;
          replay = false;
        }
      }
      if (!replay) {
        // Persist intent in the declared receipt artifact before any callback can cause an effect.
        mkdirSync(path.dirname(receiptFile), { recursive: true });
        const fd = openSync(inside(context.workspaceDir, receiptPath), rollover ? "w" : "wx", 0o600);
        try {
          writeFileSync(
            fd,
            JSON.stringify({
              schemaVersion: "b2c.operation-intent/v1",
              runId: context.runId,
              workflowId: node.workflowId,
              idempotencyKey,
              recordedAt: context.now,
            }),
          );
          fsyncSync(fd);
        } finally {
          closeSync(fd);
        }
        for (let parentPath = path.dirname(receiptFile); ; parentPath = path.dirname(parentPath)) {
          const parent = openSync(parentPath, "r");
          try {
            fsyncSync(parent);
          } finally {
            closeSync(parent);
          }
          if (parentPath === path.resolve(context.workspaceDir)) break;
        }
      }
      if (rollover) {
        for (const file of [resultFile, ...Object.values(binaryPaths)]) {
          unlinkSync(file);
          const fd = openSync(path.dirname(file), "r");
          try {
            fsyncSync(fd);
          } finally {
            closeSync(fd);
          }
        }
      }
      const before = snapshotWorkspaceChanges(context.workspaceDir);
      let output: unknown;
      let receipt: Receipt;
      let binaries: Array<{ artifactId: string; bytes: Buffer }> = [];
      try {
        if (replay) {
          if (!existsSync(resultFile) || !existsSync(receiptFile)) throw new Error("binding.partial_prior_result_requires_readback");
          output = JSON.parse(boundedFileBytes(resultFile, 1024 * 1024).toString("utf8"));
          receipt = JSON.parse(boundedFileBytes(receiptFile, 1024 * 1024).toString("utf8")) as Receipt;
          validateReceipt(node, route, receipt, output, context.now);
          verifyBinaryArtifacts(route, receipt, binaryPaths);
          verifyNoticeBytes(node, route, binaryPaths);
          if (receipt.idempotencyKey !== idempotencyKey || receipt.runId !== context.runId) throw new Error("binding.prior_result_identity_mismatch");
        } else {
          const response = await route.execute({ input, idempotencyKey, knowledge: loadSelectedKnowledge(node.selectedOperation!) });
          schemaValidator(node, "outputSchema")(response.output);
          schemaValidator(node, "evidenceSchema")(response.evidence);
          output = response.output;
          const returned = response.artifacts ?? [];
          if (
            returned.length !== (route.binaryArtifactIds?.length ?? 0) ||
            new Set(returned.map((entry) => entry.artifactId)).size !== returned.length ||
            returned.some(
              (entry) =>
                !route.binaryArtifactIds?.includes(entry.artifactId) ||
                !Buffer.isBuffer(entry.bytes) ||
                entry.bytes.length === 0 ||
                entry.bytes.length > 64 * 1024 * 1024,
            )
          )
            throw new Error("binding.binary_output_coverage_mismatch");
          binaries = returned.map((entry) => ({ artifactId: entry.artifactId, bytes: Buffer.from(entry.bytes) }));
          if (noticeBytes) binaries.push({ artifactId: route.noticeArtifactId!, bytes: noticeBytes });
          receipt = {
            schemaVersion: "b2c.operation-receipt/v1",
            operation: route.operation,
            implementationId: route.implementationId,
            contractFingerprint,
            runId: context.runId,
            workflowId: node.workflowId,
            idempotencyKey,
            input,
            inputDigest,
            acceptedInputFingerprint,
            executionCycle: cycle,
            outputDigest: digest(output),
            ...(route.noticeArtifactId ? { incorporationDigest: incorporationDigest(route) } : {}),
            ...(binaries.length ? { artifactDigests: Object.fromEntries(binaries.map((entry) => [entry.artifactId, bytesDigest(entry.bytes)])) } : {}),
            recordedAt: context.now,
            evidence: response.evidence,
            providerProof: "not_observed",
          };
        }
        if (!(await route.observe({ input, output, evidence: receipt.evidence, idempotencyKey }))) throw new Error("binding.observation_missing_or_mismatched");
        validateNode(node);
        verifyInstalledContext(node, context.workspaceDir);
        validateReceipt(node, route, receipt, output, context.now);
      } finally {
        const unauthorized = verifyWorkspaceChanges(context.workspaceDir, before, [], [], context.runtimeWrites);
        if (unauthorized.length) throw new Error(`binding.route_undeclared_write:${unauthorized.join(",")}`);
      }
      if (!replay) {
        mkdirSync(path.dirname(resultFile), { recursive: true });
        mkdirSync(path.dirname(receiptFile), { recursive: true });
        writeFileSync(inside(context.workspaceDir, resultPath), `${JSON.stringify(output, null, 2)}\n`, { flag: "wx" });
        for (const binary of binaries) {
          const destination = inside(context.workspaceDir, context.artifactPaths[binary.artifactId]!);
          mkdirSync(path.dirname(destination), { recursive: true });
          writeFileSync(destination, binary.bytes, { flag: "wx" });
        }
        writeFileSync(inside(context.workspaceDir, receiptPath), `${JSON.stringify(receipt, null, 2)}\n`, { flag: "w" });
      }
      return {
        status: "succeeded",
        outputs: [route.resultArtifactId, route.receiptArtifactId, ...binaryOutputIds(route)].map((artifactId) => ({
          artifactId,
          path: context.artifactPaths[artifactId]!,
          fingerprint: outputFingerprintPath(inside(context.workspaceDir, context.artifactPaths[artifactId]!)),
          evidence: ["Pinned custom schema validation and registered host observation passed; provider live proof remains unknown."],
        })),
        evidence: ["Local operation conformance observed."],
      };
    } catch (error) {
      return failure(error);
    }
  }
  async verify(node: CompiledRunNode, context: NodeVerificationContext): Promise<VerificationOutcome> {
    try {
      const route = this.#route(node);
      verifyInstalledContext(node, context.workspaceDir);
      if (route.kind === "worker-artifacts") {
        const run = loadRunState(inside(context.workspaceDir, "run/run-state.json", "read"));
        const attempt = run.nodes[node.id]?.attempts.at(-1);
        if (
          !context.runId ||
          run.runId !== context.runId ||
          !context.inputFingerprint ||
          attempt?.inputFingerprint !== context.inputFingerprint ||
          !(attempt.status === "succeeded" || (attempt.status === "blocked" && run.nodes[node.id]?.blocker === "Verification required"))
        )
          throw Error("binding.current_attempt_required");
        const outputs = context.outputs.map((output) => {
          const binding = run.artifactBindings.find((entry) => entry.artifactId === output.artifactId);
          if (!binding || binding.path !== output.path || binding.attemptId !== attempt.id || binding.producedBy !== node.id || !binding.fingerprint)
            throw Error("binding.worker_output_attempt_mismatch");
          return { ...output, fingerprint: binding.fingerprint };
        });
        validateWorkerOutputs(node, context.workspaceDir, outputs);
        const before = snapshotWorkspaceChanges(context.workspaceDir);
        const runtimeWrites = context.runtimeWrites;
        let outcome: VerificationOutcome;
        try {
          outcome = await route.verifier.verify(node, context);
        } finally {
          if (verifyWorkspaceChanges(context.workspaceDir, before, [], [], runtimeWrites).length) throw Error("binding.verifier_mutated_workspace");
        }
        this.#route(node);
        validateWorkerOutputs(node, context.workspaceDir, outputs);
        return outcome;
      }
      const result = context.outputs.find((entry) => entry.artifactId === route.resultArtifactId);
      const receiptRef = context.outputs.find((entry) => entry.artifactId === route.receiptArtifactId);
      if (!result || !receiptRef || !node.outputPaths.includes(result.path) || !node.outputPaths.includes(receiptRef.path))
        throw new Error("binding.verification_outputs_missing");
      const output = JSON.parse(boundedFileBytes(inside(context.workspaceDir, result.path), 1024 * 1024).toString("utf8"));
      const receipt = JSON.parse(boundedFileBytes(inside(context.workspaceDir, receiptRef.path), 1024 * 1024).toString("utf8")) as Receipt;
      validateReceipt(node, route, receipt, output, context.now);
      verifyBinaryArtifacts(
        route,
        receipt,
        Object.fromEntries(
          binaryOutputIds(route).map((id) => {
            const ref = context.outputs.find((entry) => entry.artifactId === id);
            if (!ref || !node.outputPaths.includes(ref.path)) throw new Error("binding.binary_verification_path_missing");
            return [id, inside(context.workspaceDir, ref.path)];
          }),
        ),
      );
      verifyNoticeBytes(
        node,
        route,
        Object.fromEntries(
          binaryOutputIds(route).map((id) => {
            const ref = context.outputs.find((entry) => entry.artifactId === id);
            if (!ref) throw new Error("binding.binary_verification_path_missing");
            return [id, inside(context.workspaceDir, ref.path)];
          }),
        ),
      );
      if (!context.runId || !context.inputFingerprint || receipt.runId !== context.runId || receipt.acceptedInputFingerprint !== context.inputFingerprint)
        throw new Error("binding.verifier_execution_identity_mismatch");
      const before = snapshotWorkspaceChanges(context.workspaceDir);
      let observed: boolean;
      try {
        observed = await route.observe({ input: receipt.input, output, evidence: receipt.evidence, idempotencyKey: receipt.idempotencyKey });
      } finally {
        if (verifyWorkspaceChanges(context.workspaceDir, before, [], [], context.runtimeWrites).length) throw new Error("binding.verifier_mutated_workspace");
      }
      if (!observed) throw new Error("binding.observation_missing_or_mismatched");
      validateNode(node);
      verifyInstalledContext(node, context.workspaceDir);
      validateReceipt(node, route, receipt, output, context.now);
      return { status: "accepted", evidence: "Pinned custom schemas and registered host readback matched. Provider live proof remains unknown." };
    } catch (error) {
      return { status: "rejected", evidence: "", error: error instanceof Error ? error.message : String(error) };
    }
  }
}
