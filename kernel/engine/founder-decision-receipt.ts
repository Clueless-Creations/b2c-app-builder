import { createHash, verify as verifyEd25519 } from "node:crypto";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import path from "node:path";
import { appendAuditEntry, readAuditLog, verifyAuditChain, type AuditEntry, type AuditEntryInput } from "../reducer/audit.js";
import {
  computeFounderWorkspaceBinding,
  loadFounderTrustStore,
  type FounderTrustStoreLoadOptions,
  type TrustedFounderDecisionKey,
} from "./founder-trust-store.js";
import type {
  ApprovalProvenance,
  FounderDecision,
  FounderDecisionKind,
  FounderDecisionPayload,
  FounderDecisionReceipt,
  RunStateDocument,
} from "../schema/types.js";

/** Untrusted environment input. Production trust comes from the external trust store. */
export const FOUNDER_ED25519_PUBLIC_KEY_ENV = "B2C_APP_BUILDER_FOUNDER_ED25519_PUBLIC_KEY";
export const FOUNDER_DECISION_RECEIPT_AUDIENCE = "b2c-app-builder/founder-decision/v1" as const;
export const FOUNDER_DECISION_RECEIPT_ALGORITHM = "Ed25519" as const;
export const FOUNDER_DECISION_MAX_INGRESS_LIFETIME_MS = 15 * 60 * 1000;
export const FOUNDER_DECISION_MAX_FUTURE_SKEW_MS = 0;
export const DIRECT_DESIGN_TASTE_PATCH_PREFIX = "design-taste" as const;
export const DESIGN_TASTE_DELEGATION_PATCH_PREFIX = "design-taste-delegation" as const;
export const DESIGN_TASTE_DELEGATION_APPROVAL_ID = "decision.design.taste.delegation" as const;

export type FounderDecisionReceiptErrorCode =
  | "receipt_json_invalid"
  | "receipt_shape_invalid"
  | "receipt_noncanonical"
  | "receipt_signature_invalid"
  | "receipt_context_mismatch"
  | "receipt_expired"
  | "receipt_not_yet_valid"
  | "receipt_chain_invalid"
  | "receipt_audit_projection_invalid"
  | "audit_chain_invalid"
  | "founder_key_missing"
  | "founder_key_invalid"
  | "founder_key_unpinned"
  | "founder_key_mismatch"
  | "workspace_binding_invalid";

export class FounderDecisionReceiptError extends Error {
  readonly code: FounderDecisionReceiptErrorCode;

  constructor(code: FounderDecisionReceiptErrorCode, message: string) {
    super(message);
    this.name = "FounderDecisionReceiptError";
    this.code = code;
  }
}

function fail(code: FounderDecisionReceiptErrorCode, message: string): never {
  throw new FounderDecisionReceiptError(code, message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertExactKeys(value: Record<string, unknown>, expected: readonly string[], label: string): void {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) {
    fail("receipt_noncanonical", `${label} must contain exactly: ${expected.join(", ")}`);
  }
}

function requiredString(value: unknown, label: string, pattern?: RegExp): string {
  if (typeof value !== "string" || value.length === 0 || value.trim() !== value || (pattern && !pattern.test(value))) {
    fail("receipt_shape_invalid", `${label} is invalid`);
  }
  return value;
}

function receiptId(value: unknown, label = "receiptId"): string {
  return requiredString(value, label, /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/);
}

function sha256Hex(value: unknown, label: string): string {
  return requiredString(value, label, /^[a-f0-9]{64}$/);
}

function canonicalIso(value: unknown, label: string): string {
  const text = requiredString(value, label);
  const parsed = new Date(text);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== text) {
    fail("receipt_noncanonical", `${label} must be a canonical UTC ISO timestamp`);
  }
  return text;
}

function canonicalBase64Url(value: unknown, label: string, expectedBytes?: number): string {
  const text = requiredString(value, label, /^[A-Za-z0-9_-]+$/);
  const decoded = Buffer.from(text, "base64url");
  if (decoded.length === 0 || decoded.toString("base64url") !== text || (expectedBytes !== undefined && decoded.length !== expectedBytes)) {
    fail("receipt_noncanonical", `${label} must be canonical unpadded base64url${expectedBytes === undefined ? "" : ` for ${expectedBytes} bytes`}`);
  }
  return text;
}

function parseFounderDecision(value: unknown): FounderDecision {
  if (!isRecord(value)) fail("receipt_shape_invalid", "payload.decision must be an object");
  const kind = value.kind;
  if (kind === "design_taste_direct") {
    assertExactKeys(value, ["kind", "verdict", "designSha256"], "payload.decision");
    if (value.verdict !== "pass" && value.verdict !== "fail") {
      fail("receipt_shape_invalid", "direct design taste verdict must be pass or fail");
    }
    return {
      kind,
      verdict: value.verdict,
      designSha256: sha256Hex(value.designSha256, "payload.decision.designSha256"),
    };
  }
  if (kind === "design_taste_delegation") {
    assertExactKeys(value, ["kind", "status"], "payload.decision");
    if (value.status !== "approved" && value.status !== "rejected") {
      fail("receipt_shape_invalid", "design taste delegation status must be approved or rejected");
    }
    return { kind, status: value.status };
  }
  fail("receipt_shape_invalid", "payload.decision.kind is unsupported");
}

function parseFounderDecisionPayload(value: unknown): FounderDecisionPayload {
  if (!isRecord(value)) fail("receipt_shape_invalid", "payload must be an object");
  assertExactKeys(
    value,
    ["audience", "receiptId", "previousReceiptId", "sequence", "workspaceBinding", "runId", "issuedAt", "expiresAt", "decision"],
    "payload",
  );
  if (value.audience !== FOUNDER_DECISION_RECEIPT_AUDIENCE) {
    fail("receipt_context_mismatch", `payload.audience must be ${FOUNDER_DECISION_RECEIPT_AUDIENCE}`);
  }
  const id = receiptId(value.receiptId);
  const previousReceiptId = value.previousReceiptId === null ? null : receiptId(value.previousReceiptId, "previousReceiptId");
  if (!Number.isSafeInteger(value.sequence) || (value.sequence as number) < 1) {
    fail("receipt_shape_invalid", "payload.sequence must be a positive safe integer");
  }
  const sequence = value.sequence as number;
  if ((sequence === 1) !== (previousReceiptId === null)) {
    fail("receipt_noncanonical", "sequence 1 must have a null previousReceiptId, and later receipts must name a predecessor");
  }
  if (previousReceiptId === id) fail("receipt_chain_invalid", "a receipt cannot name itself as its predecessor");
  const issuedAt = canonicalIso(value.issuedAt, "payload.issuedAt");
  const expiresAt = canonicalIso(value.expiresAt, "payload.expiresAt");
  if (Date.parse(expiresAt) <= Date.parse(issuedAt)) {
    fail("receipt_shape_invalid", "payload.expiresAt must be later than payload.issuedAt");
  }
  if (Date.parse(expiresAt) - Date.parse(issuedAt) > FOUNDER_DECISION_MAX_INGRESS_LIFETIME_MS) {
    fail("receipt_shape_invalid", "founder decision receipt validity cannot exceed 15 minutes");
  }
  return {
    audience: FOUNDER_DECISION_RECEIPT_AUDIENCE,
    receiptId: id,
    previousReceiptId,
    sequence,
    workspaceBinding: sha256Hex(value.workspaceBinding, "payload.workspaceBinding"),
    runId: requiredString(value.runId, "payload.runId", /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/),
    issuedAt,
    expiresAt,
    decision: parseFounderDecision(value.decision),
  };
}

/** Parse a receipt value and reject every extra, missing, ambiguous, or noncanonical field. */
export function parseFounderDecisionReceipt(value: unknown): FounderDecisionReceipt {
  if (!isRecord(value)) fail("receipt_shape_invalid", "founder decision receipt must be an object");
  assertExactKeys(value, ["schemaVersion", "algorithm", "keyId", "payload", "signature"], "receipt");
  if (value.schemaVersion !== "1.0.0") fail("receipt_shape_invalid", "receipt.schemaVersion must be 1.0.0");
  if (value.algorithm !== FOUNDER_DECISION_RECEIPT_ALGORITHM) {
    fail("receipt_shape_invalid", `receipt.algorithm must be ${FOUNDER_DECISION_RECEIPT_ALGORITHM}`);
  }
  return {
    schemaVersion: "1.0.0",
    algorithm: FOUNDER_DECISION_RECEIPT_ALGORITHM,
    keyId: sha256Hex(value.keyId, "receipt.keyId"),
    payload: parseFounderDecisionPayload(value.payload),
    signature: canonicalBase64Url(value.signature, "receipt.signature", 64),
  };
}

function compactJsonWithoutChangingStrings(input: string): string {
  let compact = "";
  let inString = false;
  let escaped = false;
  for (const character of input) {
    if (inString) {
      compact += character;
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') {
      inString = true;
      compact += character;
    } else if (!/\s/u.test(character)) {
      compact += character;
    }
  }
  return compact;
}

/** Parse JSON without accepting a second value, oversized input, or lossy envelope shape. */
export function parseFounderDecisionReceiptJson(input: string): FounderDecisionReceipt {
  if (typeof input !== "string" || input.length === 0 || Buffer.byteLength(input, "utf8") > 64 * 1024) {
    fail("receipt_json_invalid", "founder decision receipt JSON is empty or exceeds 64 KiB");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(input) as unknown;
  } catch {
    fail("receipt_json_invalid", "founder decision receipt is not valid JSON");
  }
  const receipt = parseFounderDecisionReceipt(parsed);
  if (compactJsonWithoutChangingStrings(input) !== canonicalFounderDecisionReceipt(receipt)) {
    fail("receipt_noncanonical", "founder decision receipt JSON must use the canonical field order and encoding");
  }
  return receipt;
}

/** The only byte representation accepted for signing and signature verification. */
export function canonicalFounderDecisionPayload(payload: FounderDecisionPayload): string {
  const parsed = parseFounderDecisionPayload(payload);
  const decision =
    parsed.decision.kind === "design_taste_direct"
      ? {
          kind: parsed.decision.kind,
          verdict: parsed.decision.verdict,
          designSha256: parsed.decision.designSha256,
        }
      : { kind: parsed.decision.kind, status: parsed.decision.status };
  return JSON.stringify({
    audience: parsed.audience,
    receiptId: parsed.receiptId,
    previousReceiptId: parsed.previousReceiptId,
    sequence: parsed.sequence,
    workspaceBinding: parsed.workspaceBinding,
    runId: parsed.runId,
    issuedAt: parsed.issuedAt,
    expiresAt: parsed.expiresAt,
    decision,
  });
}

/** Canonical envelope serialization for storage, fixtures, and transport. */
export function canonicalFounderDecisionReceipt(receipt: FounderDecisionReceipt): string {
  const parsed = parseFounderDecisionReceipt(receipt);
  return JSON.stringify({
    schemaVersion: parsed.schemaVersion,
    algorithm: parsed.algorithm,
    keyId: parsed.keyId,
    payload: JSON.parse(canonicalFounderDecisionPayload(parsed.payload)) as FounderDecisionPayload,
    signature: parsed.signature,
  });
}

export { computeFounderWorkspaceBinding, trustedFounderKeyFromBase64Url } from "./founder-trust-store.js";
export type { TrustedFounderDecisionKey } from "./founder-trust-store.js";

/** Load trust from the protected external store, defaulting to the fail-closed autonomous role. */
export function loadTrustedFounderKey(options: FounderTrustStoreLoadOptions = {}): TrustedFounderDecisionKey {
  return loadFounderTrustStore({ ...options, role: options.role ?? "autonomous_session" }).trustedKey;
}

/** Explicit fixture key-id pin. Production sessions must create the audit-backed trust binding. */
export function pinFounderDecisionTrust(run: RunStateDocument, trustedKey?: TrustedFounderDecisionKey): boolean {
  if (!trustedKey) {
    fail("founder_key_unpinned", "a production run must use an audit-backed founder trust binding; test pinning requires an explicit fixture key");
  }
  if (run.founderDecisionTrust !== undefined && run.founderDecisionTrust.keyId !== trustedKey.keyId) {
    fail("founder_key_mismatch", "the explicit fixture key does not match this run's audit-backed founder trust binding");
  }
  if (run.founderDecisionKeyId === undefined) {
    run.founderDecisionKeyId = trustedKey.keyId;
    return true;
  }
  if (run.founderDecisionKeyId !== trustedKey.keyId) {
    fail("founder_key_mismatch", "the configured founder key does not match this run's pinned key id");
  }
  return false;
}

/** Approval-safe trust check. A missing pin fails; approval code must never initialize it. */
export function assertFounderDecisionTrust(run: RunStateDocument, trustedKey: TrustedFounderDecisionKey = loadTrustedFounderKey()): void {
  const pinnedKeyId = run.founderDecisionTrust?.keyId ?? run.founderDecisionKeyId;
  if (pinnedKeyId === undefined) {
    fail("founder_key_unpinned", "this run has no pinned founder decision key; session start must pin trust before approval");
  }
  if (pinnedKeyId !== trustedKey.keyId || (run.founderDecisionKeyId !== undefined && run.founderDecisionKeyId !== pinnedKeyId)) {
    fail("founder_key_mismatch", "the configured founder key does not match this run's pinned key id");
  }
}

/** SHA-256 of exact DESIGN.md bytes. The decision never follows a symlink. */
export function computeDesignDocumentSha256(workspaceRoot: string): string {
  try {
    const realRoot = realpathSync.native(workspaceRoot);
    const designPath = path.join(realRoot, "DESIGN.md");
    const stat = lstatSync(designPath);
    if (!stat.isFile() || stat.isSymbolicLink()) fail("workspace_binding_invalid", "DESIGN.md must be a regular file inside the workspace");
    return createHash("sha256").update(readFileSync(designPath)).digest("hex");
  } catch (error) {
    if (error instanceof FounderDecisionReceiptError) throw error;
    fail("workspace_binding_invalid", `DESIGN.md cannot be hashed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export interface VerifyFounderDecisionReceiptOptions {
  readonly trustedKey?: TrustedFounderDecisionKey;
  readonly now?: string;
  readonly allowExpired?: boolean;
  readonly maxFutureSkewMs?: number;
  readonly expectedRunId?: string;
  readonly expectedWorkspaceBinding?: string;
  readonly expectedDecision?: FounderDecision;
}

export interface VerifiedFounderDecisionReceipt {
  readonly receipt: FounderDecisionReceipt;
  readonly canonicalPayload: string;
  readonly keyId: string;
}

function timeNow(value: string | undefined): number {
  if (value === undefined) return Date.now();
  return Date.parse(canonicalIso(value, "verification now"));
}

function sameDecision(left: FounderDecision, right: FounderDecision): boolean {
  if (left.kind !== right.kind) return false;
  if (left.kind === "design_taste_direct" && right.kind === "design_taste_direct") {
    return left.verdict === right.verdict && left.designSha256 === right.designSha256;
  }
  return left.kind === "design_taste_delegation" && right.kind === "design_taste_delegation" && left.status === right.status;
}

/** Verify structure, key id, canonical payload bytes, Ed25519 signature, time, and optional context. */
export function verifyFounderDecisionReceipt(
  value: FounderDecisionReceipt | unknown,
  options: VerifyFounderDecisionReceiptOptions = {},
): VerifiedFounderDecisionReceipt {
  const receipt = parseFounderDecisionReceipt(value);
  const trustedKey = options.trustedKey ?? loadTrustedFounderKey();
  if (receipt.keyId !== trustedKey.keyId) fail("founder_key_mismatch", "receipt key id does not match the trusted founder key");
  const canonicalPayload = canonicalFounderDecisionPayload(receipt.payload);
  if (!verifyEd25519(null, Buffer.from(canonicalPayload, "utf8"), trustedKey.publicKey, Buffer.from(receipt.signature, "base64url"))) {
    fail("receipt_signature_invalid", "founder decision receipt signature is invalid");
  }
  const now = timeNow(options.now);
  const maxFutureSkewMs = options.maxFutureSkewMs ?? FOUNDER_DECISION_MAX_FUTURE_SKEW_MS;
  if (!Number.isSafeInteger(maxFutureSkewMs) || maxFutureSkewMs < 0 || Date.parse(receipt.payload.issuedAt) > now + maxFutureSkewMs) {
    fail("receipt_not_yet_valid", "founder decision receipt was issued beyond the permitted clock skew");
  }
  if (!options.allowExpired && Date.parse(receipt.payload.expiresAt) <= now) {
    fail("receipt_expired", "founder decision receipt has expired");
  }
  if (options.expectedRunId !== undefined && receipt.payload.runId !== options.expectedRunId) {
    fail("receipt_context_mismatch", "founder decision receipt targets another run");
  }
  if (options.expectedWorkspaceBinding !== undefined && receipt.payload.workspaceBinding !== options.expectedWorkspaceBinding) {
    fail("receipt_context_mismatch", "founder decision receipt targets another workspace");
  }
  if (options.expectedDecision !== undefined && !sameDecision(receipt.payload.decision, options.expectedDecision)) {
    fail("receipt_context_mismatch", "founder decision receipt does not match the expected decision");
  }
  return { receipt, canonicalPayload, keyId: trustedKey.keyId };
}

/** Exact audit fields derived from the signed decision. */
export function founderDecisionAuditProjection(receiptValue: FounderDecisionReceipt, sessionId: string): AuditEntryInput {
  const receipt = parseFounderDecisionReceipt(receiptValue);
  const normalizedSessionId = requiredString(sessionId, "sessionId");
  const decision = receipt.payload.decision;
  if (decision.kind === "design_taste_direct") {
    return {
      sessionId: normalizedSessionId,
      targetDoc: "DESIGN.md",
      patchId: `${DIRECT_DESIGN_TASTE_PATCH_PREFIX}:${decision.designSha256}:${decision.verdict}`,
      action: `founder_design_taste_${decision.verdict}`,
      summary: `Direct founder/owner Taste Gate decision: ${decision.verdict}`,
      stateHash: decision.designSha256,
      issueCodes: [],
      receipt,
    };
  }
  return {
    sessionId: normalizedSessionId,
    targetDoc: "run-state",
    patchId: `${DESIGN_TASTE_DELEGATION_PATCH_PREFIX}:${receipt.payload.runId}:${decision.status}`,
    action: `founder_design_taste_delegation_${decision.status}`,
    summary: `${DESIGN_TASTE_DELEGATION_APPROVAL_ID}: ${decision.status}`,
    stateHash: "",
    issueCodes: [],
    receipt,
  };
}

function assertFounderDecisionAuditProjection(entry: AuditEntry, receipt: FounderDecisionReceipt): void {
  const projected = founderDecisionAuditProjection(receipt, entry.sessionId);
  const exact =
    entry.targetDoc === projected.targetDoc &&
    entry.patchId === projected.patchId &&
    entry.action === projected.action &&
    entry.summary === projected.summary &&
    entry.stateHash === projected.stateHash &&
    JSON.stringify(entry.issueCodes) === "[]" &&
    entry.receipt !== undefined &&
    JSON.stringify(entry.receipt) === canonicalFounderDecisionReceipt(receipt);
  const recordedAt = Date.parse(canonicalIso(entry.timestamp, `audit entry ${entry.seq} timestamp`));
  const recordedDuringWindow = recordedAt >= Date.parse(receipt.payload.issuedAt) && recordedAt <= Date.parse(receipt.payload.expiresAt);
  if (!exact || !recordedDuringWindow) {
    fail("receipt_audit_projection_invalid", `audit entry ${entry.seq} is not the exact in-window projection of receipt ${receipt.payload.receiptId}`);
  }
}

export interface FounderDecisionAuditLink extends VerifiedFounderDecisionReceipt {
  readonly auditEntry: AuditEntry;
}

/** Append an already verified receipt during its ingress window using the exact audit projection. */
export function appendFounderDecisionAuditEntry(
  auditPath: string,
  verified: VerifiedFounderDecisionReceipt,
  sessionId: string,
  recordedAt: string = new Date().toISOString(),
): FounderDecisionAuditLink {
  const canonicalRecordedAt = canonicalIso(recordedAt, "recordedAt");
  if (
    Date.parse(canonicalRecordedAt) < Date.parse(verified.receipt.payload.issuedAt) ||
    Date.parse(canonicalRecordedAt) > Date.parse(verified.receipt.payload.expiresAt)
  ) {
    fail("receipt_expired", "founder decision receipt must be appended during its signed validity window");
  }
  const auditEntry = appendAuditEntry(auditPath, founderDecisionAuditProjection(verified.receipt, sessionId), canonicalRecordedAt);
  assertFounderDecisionAuditProjection(auditEntry, verified.receipt);
  return { ...verified, auditEntry };
}

/** Find one receipt's audit link and reject duplicate receipt ids. */
export function findFounderDecisionAuditEntry(auditPath: string, id: string): AuditEntry | undefined {
  const normalizedId = receiptId(id);
  const matches = readAuditLog(auditPath).filter((entry) => entry.receipt?.payload?.receiptId === normalizedId);
  if (matches.length > 1) fail("receipt_chain_invalid", `receipt id ${normalizedId} appears more than once in the audit log`);
  return matches[0];
}

export interface FounderDecisionChainOptions {
  readonly run: RunStateDocument;
  readonly workspaceRoot: string;
  readonly auditPath: string;
  readonly kind: FounderDecisionKind;
  readonly trustedKey?: TrustedFounderDecisionKey;
  readonly now?: string;
}

/**
 * Read and validate the complete signed chain for one run and decision kind. Expired receipts
 * remain valid ancestors; callers decide whether the latest link is still current.
 */
export function readFounderDecisionReceiptChain(options: FounderDecisionChainOptions): FounderDecisionAuditLink[] {
  const trustedKey = options.trustedKey ?? loadTrustedFounderKey();
  assertFounderDecisionTrust(options.run, trustedKey);
  const auditVerification = verifyAuditChain(options.auditPath);
  if (!auditVerification.valid) fail("audit_chain_invalid", auditVerification.reason ?? "reducer audit chain is invalid");
  const expectedWorkspaceBinding = computeFounderWorkspaceBinding(options.workspaceRoot);
  const entries = readAuditLog(options.auditPath);
  const seenAllReceiptIds = new Set<string>();
  for (const entry of entries) {
    if (entry.receipt === undefined) continue;
    const parsed = parseFounderDecisionReceipt(entry.receipt);
    if (seenAllReceiptIds.has(parsed.payload.receiptId)) {
      fail("receipt_chain_invalid", `receipt id ${parsed.payload.receiptId} appears more than once in the audit log`);
    }
    seenAllReceiptIds.add(parsed.payload.receiptId);
  }
  const links: FounderDecisionAuditLink[] = [];
  for (const entry of entries) {
    if (entry.receipt === undefined) continue;
    const parsed = parseFounderDecisionReceipt(entry.receipt);
    if (parsed.payload.runId !== options.run.runId || parsed.payload.decision.kind !== options.kind) continue;
    const verified = verifyFounderDecisionReceipt(parsed, {
      trustedKey,
      now: options.now,
      allowExpired: true,
      expectedRunId: options.run.runId,
      expectedWorkspaceBinding,
    });
    assertFounderDecisionAuditProjection(entry, verified.receipt);
    const previous = links.at(-1);
    const expectedSequence = previous ? previous.receipt.payload.sequence + 1 : 1;
    const expectedPreviousReceiptId = previous?.receipt.payload.receiptId ?? null;
    if (
      verified.receipt.payload.sequence !== expectedSequence ||
      verified.receipt.payload.previousReceiptId !== expectedPreviousReceiptId ||
      (previous && Date.parse(verified.receipt.payload.issuedAt) < Date.parse(previous.receipt.payload.issuedAt))
    ) {
      fail("receipt_chain_invalid", `receipt ${verified.receipt.payload.receiptId} does not continue the exact per-run, per-kind chain`);
    }
    links.push({ ...verified, auditEntry: entry });
  }
  return links;
}

/** Return the durable audited tip. Expiry limits ingress; it does not silently revoke a recorded decision. */
export function findLatestValidFounderDecisionReceipt(options: FounderDecisionChainOptions): FounderDecisionAuditLink | undefined {
  return readFounderDecisionReceiptChain(options).at(-1);
}

export interface VerifyIncomingFounderDecisionReceiptOptions extends Omit<FounderDecisionChainOptions, "kind"> {
  readonly expectedDecision: FounderDecision;
}

export type IncomingFounderDecisionReceiptResult =
  (VerifiedFounderDecisionReceipt & { readonly disposition: "append" }) | (FounderDecisionAuditLink & { readonly disposition: "already_recorded" });

/** Verify a new signed edge against the exact current predecessor and requested local decision. */
export function verifyIncomingFounderDecisionReceipt(
  value: string | FounderDecisionReceipt | unknown,
  options: VerifyIncomingFounderDecisionReceiptOptions,
): IncomingFounderDecisionReceiptResult {
  const receipt = typeof value === "string" ? parseFounderDecisionReceiptJson(value) : parseFounderDecisionReceipt(value);
  const trustedKey = options.trustedKey ?? loadTrustedFounderKey();
  assertFounderDecisionTrust(options.run, trustedKey);
  const expectedWorkspaceBinding = computeFounderWorkspaceBinding(options.workspaceRoot);
  const history = readFounderDecisionReceiptChain({ ...options, kind: options.expectedDecision.kind, trustedKey });
  const predecessor = history.at(-1);
  const existingEntry = findFounderDecisionAuditEntry(options.auditPath, receipt.payload.receiptId);
  if (existingEntry) {
    const existing = history.find((link) => link.auditEntry.entryHash === existingEntry.entryHash);
    if (!existing || existing !== predecessor || canonicalFounderDecisionReceipt(existing.receipt) !== canonicalFounderDecisionReceipt(receipt)) {
      fail("receipt_chain_invalid", "a consumed receipt id may be retried only as the exact current chain tip");
    }
    verifyFounderDecisionReceipt(receipt, {
      trustedKey,
      now: options.now,
      allowExpired: true,
      expectedRunId: options.run.runId,
      expectedWorkspaceBinding,
      expectedDecision: options.expectedDecision,
    });
    return { disposition: "already_recorded", ...existing };
  }
  const verified = verifyFounderDecisionReceipt(receipt, {
    trustedKey,
    now: options.now,
    expectedRunId: options.run.runId,
    expectedWorkspaceBinding,
    expectedDecision: options.expectedDecision,
  });
  if (
    verified.receipt.payload.sequence !== (predecessor?.receipt.payload.sequence ?? 0) + 1 ||
    verified.receipt.payload.previousReceiptId !== (predecessor?.receipt.payload.receiptId ?? null) ||
    (predecessor && Date.parse(verified.receipt.payload.issuedAt) < Date.parse(predecessor.receipt.payload.issuedAt))
  ) {
    fail("receipt_chain_invalid", "incoming founder decision receipt does not continue the current chain tip");
  }
  return { disposition: "append", ...verified };
}

/** Exact run-state provenance for a consumed delegation receipt. */
export function founderReceiptApprovalProvenance(
  link: Pick<FounderDecisionAuditLink, "receipt" | "auditEntry">,
  validatedAt: string = link.auditEntry.timestamp,
): Extract<ApprovalProvenance, { source: "founder_receipt" }> {
  return {
    source: "founder_receipt",
    receiptId: link.receipt.payload.receiptId,
    keyId: link.receipt.keyId,
    auditEntryHash: link.auditEntry.entryHash,
    issuedAt: link.receipt.payload.issuedAt,
    validatedAt: canonicalIso(validatedAt, "validatedAt"),
  };
}
