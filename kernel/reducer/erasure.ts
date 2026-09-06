import {assertNoPendingInitialization} from "../session/initialization-guard.js";
import { createHash, randomUUID, verify } from "node:crypto";
import {
  constants,
  openSync,
  closeSync,
  fstatSync,
  fsyncSync,
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { z } from "zod";
import { computeFounderWorkspaceBinding, loadFounderTrustStore, type FounderTrustStoreLoadOptions } from "../engine/founder-trust-store.js";
import { observationsForSubject, sameSubjectReference } from "../operating-model/measurement.js";
import { erasedSubjectDigest, type EvidenceErasureTombstone } from "../operating-model/erasure-metadata.js";
import type { IdentityMapping, ObservationRecord, SubjectReference } from "../operating-model/types.js";
import { validateBusinessState, validateRunState, validateCurrentTruth, validateCheckpoint } from "../schema/index.js";
import type { RunStateDocument, CurrentTruthDocument } from "../schema/types.js";
import { appendAuditEntry, readAuditLog, verifyAuditChain } from "./audit.js";
import { acquireLock, releaseLock } from "./lock.js";

const hash = (value: string | Buffer): string => createHash("sha256").update(value).digest("hex");
const json = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const policySchema = z.strictObject({
  schemaVersion: z.literal("1.0.0"),
  id: z.string().min(1),
  revision: z.number().int().positive(),
  localRoots: z.array(z.string().min(1)),
  legalHoldPaths: z.array(z.string()),
  providerDeletionRequired: z.boolean(),
});
export type ErasurePolicy = z.infer<typeof policySchema>;
const payloadSchema = z.strictObject({
  audience: z.literal("b2c-app-builder/evidence-erasure/v1"),
  receiptId: z.string().uuid(),
  workspaceBinding: digest,
  policyDigest: digest,
  previewDigest: digest,
  issuedAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
});
export interface ErasureReceipt {
  schemaVersion: "1.0.0";
  algorithm: "Ed25519";
  keyId: string;
  payload: z.infer<typeof payloadSchema>;
  signature: string;
}
const receiptSchema = z.strictObject({
  schemaVersion: z.literal("1.0.0"),
  algorithm: z.literal("Ed25519"),
  keyId: digest,
  payload: payloadSchema,
  signature: z.string().regex(/^[A-Za-z0-9_-]+$/),
});
export interface ErasureMutation {
  relativePath: string;
  beforeSha256: string;
  afterBytes: string | null;
}
export interface ErasurePreview {
  schemaVersion: "1.0.0";
  receiptId: string;
  workspaceBinding: string;
  policyDigest: string;
  inventoryDigest: string;
  inventory: Array<{ relativePath: string; sha256: string }>;
  mutations: ErasureMutation[];
  erasedRecords: number;
  providerDeletion: "pending" | "not_required";
  blockers: string[];
}
export interface ErasureRequest {
  receiptId: string;
  subject: SubjectReference;
  policy: ErasurePolicy;
  now: string;
}
export interface ErasureResult {
  localComplete: boolean;
  globalComplete: boolean;
  providerDeletion: "pending" | "not_required";
  receiptId: string;
}
const PRIMARY_STATE = "state/business-state.json",
  RUN_STATE = "run/run-state.json",
  CURRENT_TRUTH = "state/current-truth.json";
const JOURNAL = "control/erasure-intent.json",
  MANIFEST = "control/manifest.json",
  AUDIT = "control/audit.jsonl";
const uuid = z.string().uuid();
const record = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === "object" && !Array.isArray(value));
function relative(value: string): string {
  if (!value || value.includes("\\") || value.includes("\0") || path.posix.isAbsolute(value) || value.split("/").some((x) => !x || x === "." || x === ".."))
    throw Error("erasure.invalid_path");
  return value;
}
const under = (file: string, root: string): boolean => file === root || file.startsWith(`${root}/`);
const immutable = (file: string): boolean => under(file, "control") || under(file, ".git") || file === "catalog.json";
function checkedAncestors(root: string, file: string): () => void {
  let cursor = root;
  const ancestors: Array<{ location: string; dev: number; ino: number }> = [];
  for (const segment of relative(file).split("/")) {
    const stat = lstatSync(cursor);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw Error("erasure.unsafe_directory");
    ancestors.push({ location: cursor, dev: stat.dev, ino: stat.ino });
    cursor = path.join(cursor, segment);
  }
  return () => {
    for (const prior of ancestors) {
      const current = lstatSync(prior.location);
      if (!current.isDirectory() || current.isSymbolicLink() || current.dev !== prior.dev || current.ino !== prior.ino)
        throw Error("erasure.directory_changed");
    }
  };
}
function syncDirectory(directory: string): void {
  const fd = openSync(directory, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}
function syncFile(root: string, file: string): void {
  const check = checkedAncestors(root, file);
  const fd = openSync(path.join(root, file), constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    check();
    fsyncSync(fd);
    check();
  } finally {
    closeSync(fd);
  }
  syncDirectory(path.dirname(path.join(root, file)));
}
function bytesAt(root: string, file: string): Buffer {
  const check = checkedAncestors(root, file),
    target = path.join(root, relative(file)),
    before = lstatSync(target);
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1) throw Error("erasure.unsafe_file");
  const fd = openSync(target, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const opened = fstatSync(fd);
    if (opened.dev !== before.dev || opened.ino !== before.ino || !opened.isFile()) throw Error("erasure.file_changed");
    check();
    const bytes = readFileSync(fd);
    const after = fstatSync(fd);
    check();
    if (after.size !== opened.size || after.mtimeMs !== opened.mtimeMs || after.ctimeMs !== opened.ctimeMs) throw Error("erasure.file_changed");
    return bytes;
  } finally {
    closeSync(fd);
  }
}
function inventory(root: string): Map<string, Buffer> {
  const files = new Map<string, Buffer>();
  let size = 0;
  const visit = (directory: string): void => {
    for (const name of readdirSync(path.join(root, directory)).sort()) {
      const file = directory ? `${directory}/${name}` : name;
      if (file === JOURNAL || file === "control/session.lock" || file === "control/manifest.json.lock") continue;
      if (name === ".git" || name === "node_modules") throw Error("erasure.uninventoried_store");
      const stat = lstatSync(path.join(root, file));
      if (stat.isSymbolicLink()) throw Error("erasure.symlink_refused");
      if (stat.isDirectory()) visit(file);
      else {
        if (!stat.isFile() || stat.nlink !== 1) throw Error("erasure.unsafe_file");
        if (stat.size > 16 * 1024 * 1024 || (size += stat.size) > 64 * 1024 * 1024 || files.size >= 5000) throw Error("erasure.inventory_limit");
        files.set(file, bytesAt(root, file));
      }
    }
  };
  visit("");
  return files;
}
function inventoryHash(files: Map<string, Buffer>): string {
  return hash(JSON.stringify([...files].filter(([file]) => file !== AUDIT && file !== MANIFEST).map(([file, bytes]) => [file, hash(bytes)])));
}
function matches(value: unknown, subjects: SubjectReference[]): boolean {
  return (
    record(value) &&
    typeof value.opaqueRef === "string" &&
    typeof value.appId === "string" &&
    typeof value.environment === "string" &&
    subjects.some((s) => sameSubjectReference(s, value as unknown as SubjectReference))
  );
}
function mentions(value: unknown, ids: Set<string>): boolean {
  if (typeof value === "string") return ids.has(value);
  if (Array.isArray(value)) return value.some((v) => mentions(v, ids));
  return record(value) && Object.values(value).some((v) => mentions(v, ids));
}
function redact(value: unknown, subjects: SubjectReference[], ids: Set<string>): unknown {
  if (Array.isArray(value)) return value.map((v) => redact(v, subjects, ids)).filter((v) => v !== undefined);
  if (!record(value)) return value;
  if (
    matches(value, subjects) ||
    Object.values(value).some((v) => matches(v, subjects)) ||
    (record(value.payload) && mentions(value.payload, ids)) ||
    (typeof value.id === "string" && ids.has(value.id))
  )
    return undefined;
  if (Object.values(value).some((v) => (typeof v === "string" ? ids.has(v) : Array.isArray(v) && v.some((x) => typeof x === "string" && ids.has(x)))))
    return undefined;
  return Object.fromEntries(
    Object.entries(value).flatMap(([key, v]) => {
      const next = redact(v, subjects, ids);
      return next === undefined ? [] : [[key, next]];
    }),
  );
}
export function canonicalErasurePayload(input: unknown): string {
  const p = payloadSchema.parse(input);
  return JSON.stringify({
    audience: p.audience,
    receiptId: p.receiptId,
    workspaceBinding: p.workspaceBinding,
    policyDigest: p.policyDigest,
    previewDigest: p.previewDigest,
    issuedAt: p.issuedAt,
    expiresAt: p.expiresAt,
  });
}
export function erasurePreviewDigest(preview: ErasurePreview): string {
  return hash(
    JSON.stringify({
      ...preview,
      mutations: preview.mutations.map((m) => ({
        relativePath: m.relativePath,
        beforeSha256: m.beforeSha256,
        afterSha256: m.afterBytes === null ? null : hash(m.afterBytes),
      })),
    }),
  );
}

type ErasureRunView = Pick<RunStateDocument, "nodes" | "artifactBindings"> & { archivedPlans?: ErasureRunView[] };
function invalidateRunProof(run: ErasureRunView, affectedFiles: Set<string>, affectedNodes: Set<string>): void {
  for (const archive of run.archivedPlans ?? []) invalidateRunProof(archive, affectedFiles, affectedNodes);
  for (const binding of run.artifactBindings) if (affectedFiles.has(binding.path) && binding.producedBy) affectedNodes.add(binding.producedBy);
  for (const binding of run.artifactBindings)
    if (affectedFiles.has(binding.path) || (binding.producedBy && affectedNodes.has(binding.producedBy))) binding.accepted = false;
  for (const [id, node] of Object.entries(run.nodes))
    if (affectedNodes.has(id)) {
      node.acceptedOutputFingerprint = undefined;
      node.verifiedBySessionId = undefined;
      if (node.status === "succeeded" || node.attempts.length) {
        node.status = "needs_readback";
        node.blocker = "Evidence was erased; current proof must be rebuilt.";
      }
      for (const attempt of node.attempts) {
        attempt.evidence = [];
        attempt.independentVerification = undefined;
        attempt.deterministicVerification = undefined;
      }
    }
}

function invalidateTruth(
  truth: CurrentTruthDocument,
  proofHashes: Set<string>,
  affectedNodes: Set<string>,
  ids: Set<string>,
  sensitive: string[],
  now: string,
): void {
  const removedEvidence = new Set(
    truth.evidence
      .filter(
        (e) => proofHashes.has(e.payloadHash) || affectedNodes.has(e.graphNodeId) || mentions(e, ids) || sensitive.some((v) => JSON.stringify(e).includes(v)),
      )
      .map((e) => e.id),
  );
  if (!removedEvidence.size) return;
  truth.evidence = truth.evidence.filter((e) => !removedEvidence.has(e.id));
  for (const claim of truth.claims) {
    if (claim.currentEvidenceId && removedEvidence.has(claim.currentEvidenceId)) {
      claim.status = "unresolved";
      claim.currentEvidenceId = null;
      claim.blockerKind = "missing_proof";
      claim.summary = "Evidence was erased; this claim needs new proof.";
    }
    claim.supersededEvidenceIds = claim.supersededEvidenceIds.filter((id) => !removedEvidence.has(id));
  }
  truth.lastReceiptId = null;
  truth.lastReconcileInputHash = null;
  truth.revision++;
  truth.updatedAt = now;
  if (!validateCurrentTruth(truth).valid) throw Error("erasure.invalid_truth_transition");
}

/** Read-only inventory. A signed receipt must bind this exact policy, workspace and byte scope. */
export function previewEvidenceErasure(workspace: string, request: ErasureRequest): ErasurePreview {
  assertNoPendingInitialization(workspace);
  if (existsSync(path.join(workspace, ".b2c-launch/composition-activation.json"))) throw Error("erasure.pending_composition_activation");
  const root = realpathSync(workspace);
  uuid.parse(request.receiptId);
  z.string().datetime().parse(request.now);
  const policy = policySchema.parse(request.policy);
  for (const file of [...policy.localRoots, ...policy.legalHoldPaths]) relative(file);
  if (policy.localRoots.some(immutable)) throw Error("erasure.immutable_scope");
  if (existsSync(path.join(root, JOURNAL))) throw Error("erasure.pending_transition");
  const files = inventory(root);
  const source = files.get(PRIMARY_STATE);
  if (!source) throw Error("erasure.state_missing");
  const checked = validateBusinessState(JSON.parse(source.toString()));
  if (!checked.valid || !checked.value?.operatingModel) throw Error("erasure.state_invalid");
  const state = checked.value,
    model = state.operatingModel!;
  if (model.erasures?.some((t) => t.id === request.receiptId)) throw Error("erasure.receipt_reused");
  const mappings: IdentityMapping[] = [];
  for (const bytes of files.values()) {
    try {
      const walk = (v: unknown): void => {
        if (Array.isArray(v)) v.forEach(walk);
        else if (record(v)) {
          if (record(v.from) && record(v.to) && typeof v.lifecycle === "string") mappings.push(v as unknown as IdentityMapping);
          Object.values(v).forEach(walk);
        }
      };
      walk(JSON.parse(bytes.toString()));
    } catch {}
  }
  const selected = observationsForSubject(
    model.records.filter((r): r is ObservationRecord => r.kind === "observation"),
    request.subject,
    mappings,
  );
  if (!selected.length) throw Error("erasure.subject_not_found");
  const subjects = [request.subject, ...selected.flatMap((r) => (r.subjectRef ? [r.subjectRef] : []))];
  const ids = new Set(selected.map((r) => r.id));
  let changed = true;
  while (changed) {
    changed = false;
    for (const row of model.records)
      if (!ids.has(row.id) && mentions(row, ids)) {
        ids.add(row.id);
        changed = true;
      }
  }
  const erased = model.records.filter((r) => ids.has(r.id));
  const sourceUris = erased.flatMap((r) => ("source" in r && r.source ? [r.source.uri] : []));
  const sourcePaths = new Set(sourceUris.filter((uri) => !uri.includes(":")));
  const proofHashes = new Set(
    [...sourcePaths].map((file) => {
      relative(file);
      const bytes = files.get(file);
      if (!bytes) throw Error("erasure.proof_missing");
      return hash(bytes);
    }),
  );
  const blockers: string[] = [];
  const mutations: ErasureMutation[] = [];
  const opaque = subjects.map((s) => s.opaqueRef);
  const payloadStrings = (value: unknown): string[] =>
    typeof value === "string" && value.length
      ? [value]
      : Array.isArray(value)
        ? value.flatMap(payloadStrings)
        : record(value)
          ? Object.values(value).flatMap(payloadStrings)
          : [];
  const sensitive = [...new Set([...opaque, ...selected.flatMap((row) => payloadStrings(row.value))])];
  for (const [file, bytes] of files) {
    if (opaque.some((ref) => file.includes(ref))) {
      blockers.push("identifying_path_requires_separate_erasure");
      continue;
    }
    const text = bytes.toString("utf8");
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {}
    const proof = proofHashes.has(hash(bytes));
    if (immutable(file)) {
      if (sensitive.some((ref) => text.includes(ref))) blockers.push("immutable_audit_contains_subject_data");
      continue;
    }
    if (file === PRIMARY_STATE || file === RUN_STATE || file === CURRENT_TRUTH) continue;
    const cleaned = parsed === undefined ? undefined : redact(parsed, subjects, ids);
    const matched = proof || (parsed !== undefined && JSON.stringify(cleaned) !== JSON.stringify(parsed));
    if (!matched) {
      if (sensitive.some((ref) => text.includes(ref))) blockers.push("unmapped_subject_copy");
      continue;
    }
    if (!policy.localRoots.some((prefix) => under(file, prefix))) {
      blockers.push("copy_outside_approved_scope");
      continue;
    }
    if (policy.legalHoldPaths.some((prefix) => under(file, prefix))) {
      blockers.push("legal_hold");
      continue;
    }
    if (
      proof &&
      model.records.some(
        (r) =>
          r.kind === "observation" &&
          !ids.has(r.id) &&
          !r.source.uri.includes(":") &&
          files.has(r.source.uri) &&
          proofHashes.has(hash(files.get(r.source.uri)!)),
      )
    ) {
      blockers.push("shared_proof_requires_redaction");
      continue;
    }
    mutations.push({ relativePath: file, beforeSha256: hash(bytes), afterBytes: proof || cleaned === undefined ? null : json(cleaned) });
  }
  const workspaceBinding = computeFounderWorkspaceBinding(root),
    policyDigest = hash(JSON.stringify(policy));
  const tombstone: EvidenceErasureTombstone = {
    id: request.receiptId,
    erasedAt: request.now,
    workspaceBinding,
    policyDigest,
    subjectDigests: [...new Set(subjects.map((s) => erasedSubjectDigest(request.receiptId, s)))].sort(),
    recordDigests: erased.map((r) => hash(JSON.stringify(r))).sort(),
    fileDigests: mutations.map((m) => m.beforeSha256).sort(),
    providerDeletion: policy.providerDeletionRequired || sourceUris.some((uri) => uri.includes(":")) ? "pending" : "not_required",
  };
  const next = structuredClone(state);
  next.operatingModel!.records = model.records.filter((r) => !ids.has(r.id));
  next.operatingModel!.events = model.events.filter((e) => !mentions(e, ids));
  next.operatingModel!.evidenceRequests = model.evidenceRequests.filter((e) => !mentions(e, ids));
  next.operatingModel!.erasures = [...(model.erasures ?? []), tombstone];
  next.updatedAt = request.now;
  if (!validateBusinessState(next).valid) throw Error("erasure.invalid_state_transition");
  mutations.push({ relativePath: PRIMARY_STATE, beforeSha256: hash(source), afterBytes: json(next) });
  const affectedFiles = new Set([...sourcePaths, ...mutations.filter((m) => m.relativePath !== PRIMARY_STATE).map((m) => m.relativePath)]);
  const affectedNodes = new Set<string>();
  if (files.has(RUN_STATE)) {
    const run = JSON.parse(files.get(RUN_STATE)!.toString()) as RunStateDocument;
    for (const binding of run.artifactBindings) if (affectedFiles.has(binding.path) && binding.producedBy) affectedNodes.add(binding.producedBy);
    if (files.has("catalog.json")) {
      const catalog = JSON.parse(files.get("catalog.json")!.toString()) as {
        workflows: Array<{ id: string; dependencies: string[]; reads?: string[]; outputPaths: string[] }>;
      };
      let expanded = true;
      while (expanded) {
        expanded = false;
        for (const workflow of catalog.workflows) {
          const id = workflow.id.replace(/^workflow\./, "run.");
          if (
            !affectedNodes.has(id) &&
            (workflow.outputPaths.some((p) => affectedFiles.has(p)) ||
              (workflow.reads ?? []).some((p) => affectedFiles.has(p)) ||
              workflow.dependencies.some((d) => affectedNodes.has(d.replace(/^workflow\./, "run."))))
          ) {
            affectedNodes.add(id);
            expanded = true;
            for (const output of workflow.outputPaths) affectedFiles.add(output);
          }
        }
      }
    } else if (affectedNodes.size) blockers.push("dependency_inventory_missing");
    invalidateRunProof(run, affectedFiles, affectedNodes);
    run.updatedAt = request.now;
    if (!validateRunState(run).valid) throw Error("erasure.invalid_run_transition");
    if (sensitive.some((ref) => JSON.stringify(run).includes(ref))) blockers.push("unmapped_run_subject_data");
    mutations.push({ relativePath: RUN_STATE, beforeSha256: hash(files.get(RUN_STATE)!), afterBytes: json(run) });
  }
  for (const [file, bytes] of files) {
    if (file === RUN_STATE || file === PRIMARY_STATE || file === CURRENT_TRUTH || immutable(file)) continue;
    const existing = mutations.find((m) => m.relativePath === file);
    if (existing?.afterBytes === null) continue;
    let copy: unknown;
    try {
      copy = JSON.parse(existing?.afterBytes ?? bytes.toString());
    } catch {
      continue;
    }
    let changedCopy = false;
    const visit = (value: unknown): void => {
      if (!record(value)) return;
      if (Array.isArray(value.artifactBindings) && record(value.nodes)) {
        const checked = validateRunState(value);
        if (!checked.valid || !checked.value) throw Error("erasure.invalid_run_snapshot");
        if (
          checked.value.artifactBindings.some((b) => affectedFiles.has(b.path) || (b.producedBy && affectedNodes.has(b.producedBy))) ||
          "archivedPlans" in checked.value
        ) {
          invalidateRunProof(checked.value, affectedFiles, affectedNodes);
          Object.assign(value, checked.value);
          changedCopy = true;
        }
      } else if (record(value.runState)) {
        visit(value.runState);
        if (changedCopy && file === "run/checkpoint.json") {
          value.stateHash = hash(json(next));
          value.writtenAt = request.now;
        }
      }
      if (Array.isArray(value.evidence) && Array.isArray(value.claims) && "lastReconcileInputHash" in value) {
        const checked = validateCurrentTruth(value);
        if (!checked.valid || !checked.value) throw Error("erasure.invalid_truth_snapshot");
        const before = JSON.stringify(checked.value);
        invalidateTruth(checked.value, proofHashes, affectedNodes, ids, sensitive, request.now);
        if (before !== JSON.stringify(checked.value)) {
          Object.assign(value, checked.value);
          changedCopy = true;
        }
      }
    };
    visit(copy);
    if (!changedCopy) continue;
    if (file !== "run/checkpoint.json" && !policy.localRoots.some((prefix) => under(file, prefix))) {
      blockers.push("dependent_copy_outside_approved_scope");
      continue;
    }
    if (file === "run/checkpoint.json" && !validateCheckpoint(copy).valid) throw Error("erasure.invalid_checkpoint_transition");
    const mutation = { relativePath: file, beforeSha256: hash(bytes), afterBytes: json(copy) };
    if (existing) Object.assign(existing, mutation);
    else mutations.push(mutation);
  }
  if (files.has(CURRENT_TRUTH)) {
    const truth = JSON.parse(files.get(CURRENT_TRUTH)!.toString()) as CurrentTruthDocument;
    invalidateTruth(truth, proofHashes, affectedNodes, ids, sensitive, request.now);
    mutations.push({ relativePath: CURRENT_TRUTH, beforeSha256: hash(files.get(CURRENT_TRUTH)!), afterBytes: json(truth) });
  }
  if (mutations.some((m) => policy.legalHoldPaths.some((prefix) => under(m.relativePath, prefix)))) blockers.push("legal_hold");
  if (sensitive.some((ref) => mutations.some((m) => m.afterBytes?.includes(ref)))) blockers.push("unmapped_retained_subject_data");
  return {
    schemaVersion: "1.0.0",
    receiptId: request.receiptId,
    workspaceBinding,
    policyDigest,
    inventoryDigest: inventoryHash(files),
    inventory: [...files].filter(([file]) => file !== AUDIT && file !== MANIFEST).map(([relativePath, bytes]) => ({ relativePath, sha256: hash(bytes) })),
    mutations: mutations.sort((a, b) => a.relativePath.localeCompare(b.relativePath)),
    erasedRecords: erased.length,
    providerDeletion: tombstone.providerDeletion,
    blockers: [...new Set(blockers)].sort(),
  };
}

interface ErasureJournal {
  schemaVersion: "1.0.0";
  preview: ErasurePreview;
  receipt: ErasureReceipt;
}
export interface ErasureHostContext {
  env?: NodeJS.ProcessEnv;
  now?: string;
  /** Host-only role-test observation; never accepted from an erasure request. */ trustObservation?: Pick<
    FounderTrustStoreLoadOptions,
    "processUid" | "controlOwnerUid" | "stat" | "canCreateInTrustDirectory"
  >;
  /** Fault injection in isolated reducer fixtures only. */ interruptAfterMutation?: number;
}
function authorize(root: string, preview: ErasurePreview, input: unknown, context: ErasureHostContext, allowExpired = false): ErasureReceipt {
  const receipt = receiptSchema.parse(input);
  const p = receipt.payload;
  const now = Date.parse(context.now ?? new Date().toISOString());
  if (
    !Number.isFinite(now) ||
    Date.parse(p.issuedAt) > now + 30000 ||
    Date.parse(p.expiresAt) <= Date.parse(p.issuedAt) ||
    (!allowExpired && Date.parse(p.expiresAt) <= now)
  )
    throw Error("erasure.authority_expired");
  if (
    p.receiptId !== preview.receiptId ||
    p.workspaceBinding !== computeFounderWorkspaceBinding(root) ||
    p.workspaceBinding !== preview.workspaceBinding ||
    p.policyDigest !== preview.policyDigest ||
    p.previewDigest !== erasurePreviewDigest(preview)
  )
    throw Error("erasure.authority_scope_mismatch");
  const trusted = loadFounderTrustStore({ ...context.trustObservation, env: context.env, role: "receipt_consumer" }).trustedKey;
  if (receipt.keyId !== trusted.keyId || !verify(null, Buffer.from(canonicalErasurePayload(p)), trusted.publicKey, Buffer.from(receipt.signature, "base64url")))
    throw Error("erasure.authority_invalid");
  if (preview.blockers.length) throw Error("erasure.scope_blocked");
  return receipt;
}
function atomic(root: string, file: string, bytes: string): void {
  const check = checkedAncestors(root, file),
    target = path.join(root, relative(file)),
    temporary = `${target}.erasure-next`;
  check();
  const fd = openSync(temporary, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
  try {
    check();
    writeFileSync(fd, bytes);
    fsyncSync(fd);
    check();
  } finally {
    closeSync(fd);
  }
  renameSync(temporary, target);
  check();
  syncDirectory(path.dirname(target));
}
function manifest(root: string): {
  schemaVersion: string;
  entries: Record<string, { targetDoc: string; file: string; stateHash: string; updatedAt: string; lastPatchId: string }>;
} {
  const value = JSON.parse(bytesAt(root, MANIFEST).toString());
  if (value.schemaVersion !== "1.0.0" || !record(value.entries)) throw Error("erasure.manifest_invalid");
  return value;
}
function confirmInventory(root: string, preview: ErasurePreview, resuming: boolean): void {
  const files = inventory(root);
  const mutations = new Map(preview.mutations.map((m) => [m.relativePath, m]));
  const original = new Map(preview.inventory.map((entry) => [entry.relativePath, entry.sha256]));
  for (const [file, bytes] of files) {
    if (file === AUDIT || file === MANIFEST) continue;
    const current = hash(bytes),
      mutation = mutations.get(file),
      before = original.get(file);
    if (before === undefined || (current !== before && (!resuming || !mutation || mutation.afterBytes === null || current !== hash(mutation.afterBytes))))
      throw Error("erasure.inventory_changed");
  }
  for (const [file] of original) if (!files.has(file) && (!resuming || mutations.get(file)?.afterBytes !== null)) throw Error("erasure.inventory_changed");
}
function finishJournal(root: string, journal: ErasureJournal, context: ErasureHostContext): ErasureResult {
  const { preview } = journal,
    scope = erasurePreviewDigest(preview),
    auditPath = path.join(root, AUDIT);
  if (!verifyAuditChain(auditPath).valid) throw Error("erasure.audit_invalid");
  const prepared = readAuditLog(auditPath).some(
    (entry) => entry.action === "evidence_erasure_prepared" && entry.patchId === preview.receiptId && entry.stateHash === scope,
  );
  authorize(root, preview, journal.receipt, context, prepared);
  confirmInventory(root, preview, prepared);
  if (!prepared)
    appendAuditEntry(auditPath, {
      sessionId: `erasure:${preview.receiptId}`,
      targetDoc: "business-state",
      patchId: preview.receiptId,
      action: "evidence_erasure_prepared",
      summary: "Signed local evidence erasure authorized; removed payload is never included in this audit.",
      stateHash: scope,
    });
  syncFile(root, AUDIT);
  const tracked = manifest(root);
  let applied = 0;
  for (const mutation of preview.mutations) {
    relative(mutation.relativePath);
    if (immutable(mutation.relativePath)) throw Error("erasure.immutable_scope");
    const target = path.join(root, mutation.relativePath),
      entryKey = Object.keys(tracked.entries).find((file) => path.join(realpathSync(path.dirname(file)), path.basename(file)) === target),
      entry = entryKey ? tracked.entries[entryKey] : undefined;
    const afterHash = mutation.afterBytes === null ? null : hash(mutation.afterBytes);
    const current = existsSync(target) ? hash(bytesAt(root, mutation.relativePath)) : null;
    if (current !== mutation.beforeSha256 && current !== afterHash) throw Error("erasure.target_changed");
    if (mutation.relativePath === PRIMARY_STATE && !entry) throw Error("erasure.untracked_state");
    if (entry && entry.stateHash !== mutation.beforeSha256 && entry.stateHash !== afterHash) throw Error("erasure.manifest_conflict");
    if (current !== afterHash) {
      if (mutation.afterBytes === null) {
        const check = checkedAncestors(root, mutation.relativePath);
        check();
        unlinkSync(target);
        check();
        syncDirectory(path.dirname(target));
      } else atomic(root, mutation.relativePath, mutation.afterBytes);
    }
    if (entry) {
      if (afterHash === null) delete tracked.entries[entryKey!];
      else tracked.entries[entryKey!] = { ...entry, stateHash: afterHash, updatedAt: context.now ?? new Date().toISOString(), lastPatchId: preview.receiptId };
    }
    atomic(root, MANIFEST, json(tracked));
    applied++;
    if (context.interruptAfterMutation === applied) throw Error("erasure.fixture_interrupt");
  }
  confirmInventory(root, preview, true);
  const complete = readAuditLog(auditPath).some(
    (entry) => entry.action === "evidence_erasure_completed" && entry.patchId === preview.receiptId && entry.stateHash === scope,
  );
  if (!complete)
    appendAuditEntry(auditPath, {
      sessionId: `erasure:${preview.receiptId}`,
      targetDoc: "business-state",
      patchId: preview.receiptId,
      action: "evidence_erasure_completed",
      summary: `Local inventory erased and dependent proof invalidated. Provider deletion: ${preview.providerDeletion}.`,
      stateHash: scope,
    });
  syncFile(root, AUDIT);
  unlinkSync(path.join(root, JOURNAL));
  syncDirectory(path.join(root, "control"));
  return {
    localComplete: true,
    globalComplete: preview.providerDeletion === "not_required",
    providerDeletion: preview.providerDeletion,
    receiptId: preview.receiptId,
  };
}
function withErasureLock<T>(root: string, operation: () => T): T {
  const session = `evidence-erasure:${randomUUID()}`,
    lock = path.join(root, "control/session.lock");
  const acquired = acquireLock(lock, { ownerSessionId: session, retries: 0, ttlSeconds: 300 });
  if (!acquired.ok) throw Error("erasure.workspace_busy");
  const manifestLock = path.join(root, `${MANIFEST}.lock`);
  const acquiredManifest = acquireLock(manifestLock, { ownerSessionId: session, retries: 0, ttlSeconds: 300 });
  if (!acquiredManifest.ok) {
    releaseLock(lock, session);
    throw Error("erasure.workspace_busy");
  }
  try {
    return operation();
  } finally {
    releaseLock(manifestLock, session);
    releaseLock(lock, session);
  }
}
/** Dedicated reducer operation. Generic state patches never receive an erasure bypass flag. */
export function executeEvidenceErasure(workspace: string, request: ErasureRequest, receipt: unknown, context: ErasureHostContext = {}): ErasureResult {
  const root = realpathSync(workspace);
  return withErasureLock(root, () => {
    if (!verifyAuditChain(path.join(root, AUDIT)).valid) throw Error("erasure.audit_invalid");
    const preview = previewEvidenceErasure(root, request);
    const authorized = authorize(root, preview, receipt, context);
    const tracked = manifest(root);
    for (const entry of Object.values(tracked.entries)) {
      if (hash(bytesAt(root, path.relative(root, path.join(realpathSync(path.dirname(entry.file)), path.basename(entry.file))))) !== entry.stateHash)
        throw Error("erasure.manifest_conflict");
    }
    const journal: ErasureJournal = { schemaVersion: "1.0.0", preview, receipt: authorized };
    atomic(root, JOURNAL, json(journal));
    return finishJournal(root, journal, context);
  });
}
/** Resume only the authenticated sanitized intent. It contains no removed payload to restore. */
export function resumeEvidenceErasure(workspace: string, context: ErasureHostContext = {}): ErasureResult {
  const root = realpathSync(workspace);
  return withErasureLock(root, () => {
    const journal = JSON.parse(bytesAt(root, JOURNAL).toString()) as ErasureJournal;
    if (journal.schemaVersion !== "1.0.0") throw Error("erasure.journal_invalid");
    return finishJournal(root, journal, context);
  });
}
