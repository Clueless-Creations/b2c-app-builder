import { createHash, createPublicKey, type KeyObject } from "node:crypto";
import {
  closeSync,
  chmodSync,
  constants,
  existsSync,
  fchmodSync,
  fstatSync,
  fsyncSync,
  linkSync,
  lstatSync,
  mkdirSync,
  openSync,
  readSync,
  realpathSync,
  unlinkSync,
  writeSync,
  type Stats,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { appendAuditEntry, readAuditLog, verifyAuditChain, type AuditEntry, type AuditEntryInput } from "../reducer/audit.js";
import type { FounderDecisionTrustBinding, RunStateDocument } from "../schema/types.js";

export const FOUNDER_TRUST_FILE_ENV = "B2C_APP_BUILDER_FOUNDER_TRUST_FILE";
export const FOUNDER_TRUST_SCHEMA_VERSION = "1.0.0" as const;
export const FOUNDER_TRUST_PURPOSE = "b2c-founder-decision" as const;
export const FOUNDER_TRUST_ALGORITHM = "Ed25519" as const;
export const FOUNDER_TRUST_MAX_BYTES = 16 * 1024;
export const FOUNDER_TRUST_BINDING_ACTION = "founder_decision_trust_bound" as const;
const FOUNDER_TRUST_BINDING_PURPOSE = "b2c-founder-decision-trust-binding/v1" as const;

export type FounderTrustStoreErrorCode =
  | "founder_trust_missing"
  | "founder_trust_path_invalid"
  | "founder_trust_shape_invalid"
  | "founder_trust_noncanonical"
  | "founder_trust_key_invalid"
  | "founder_trust_permissions_invalid"
  | "founder_trust_owner_mismatch"
  | "founder_trust_role_refused"
  | "founder_trust_io_invalid"
  | "founder_trust_conflict"
  | "founder_trust_binding_missing"
  | "founder_trust_binding_invalid"
  | "founder_trust_audit_invalid";

export class FounderTrustStoreError extends Error {
  readonly code: FounderTrustStoreErrorCode;

  constructor(code: FounderTrustStoreErrorCode, message: string) {
    super(message);
    this.name = "FounderTrustStoreError";
    this.code = code;
  }
}

function fail(code: FounderTrustStoreErrorCode, message: string): never {
  throw new FounderTrustStoreError(code, message);
}

export interface FounderTrustStoreDocument {
  readonly schemaVersion: "1.0.0";
  readonly purpose: "b2c-founder-decision";
  readonly algorithm: "Ed25519";
  readonly keyId: string;
  readonly spkiDerBase64Url: string;
  readonly installedAt: string;
}

export interface TrustedFounderDecisionKey {
  readonly keyId: string;
  readonly publicKey: KeyObject;
  readonly spkiDerBase64Url: string;
}

export type FounderTrustAccessRole = "founder_mutation" | "receipt_consumer" | "autonomous_session" | "validation_read";

export interface FounderTrustObservedStat {
  readonly kind: "file" | "directory" | "symlink" | "other";
  readonly uid: number;
  readonly mode: number;
  readonly size: number;
  readonly dev: number | bigint;
  readonly ino: number | bigint;
}

export interface FounderTrustStoreLoadOptions {
  readonly env?: NodeJS.ProcessEnv;
  readonly trustFile?: string;
  readonly role?: FounderTrustAccessRole;
  /** Injectable for role fixtures. Production uses process.getuid(). */
  readonly processUid?: number;
  /** The workspace control-directory owner, when a workspace-specific call site inspected it. */
  readonly controlOwnerUid?: number;
  /** Injectable stat projection for ownership and permission fixtures. */
  readonly stat?: (absolutePath: string, observed: FounderTrustObservedStat) => FounderTrustObservedStat;
  /** Return true only when the caller can create a file in the trust directory. */
  readonly canCreateInTrustDirectory?: (absoluteDirectory: string) => boolean;
}

export interface LoadedFounderTrustStore {
  readonly document: FounderTrustStoreDocument;
  readonly trustedKey: TrustedFounderDecisionKey;
  readonly canonicalTrustPath: string;
  readonly trustDirectory: string;
  readonly trustFileSha256: string;
  readonly ownerUid: number;
}

export interface InstallFounderTrustStoreOptions {
  readonly publicKeyBase64Url: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly trustFile?: string;
  readonly apply?: boolean;
  readonly installedAt?: string;
  readonly processUid?: number;
  readonly controlOwnerUid?: number;
  readonly stat?: FounderTrustStoreLoadOptions["stat"];
}

export interface InstallFounderTrustStoreResult {
  readonly status: "dry_run" | "installed" | "already_installed";
  readonly keyId: string;
  readonly canonicalTrustPath: string;
  readonly trustFileSha256: string;
  readonly document: FounderTrustStoreDocument;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertExactKeys(value: Record<string, unknown>, expected: readonly string[], label: string): void {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) {
    fail("founder_trust_shape_invalid", `${label} must contain exactly: ${expected.join(", ")}`);
  }
}

function canonicalSha256(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) fail("founder_trust_shape_invalid", `${label} must be a lowercase SHA-256 hex value`);
  return value;
}

function canonicalIso(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim() !== value || value.length === 0) fail("founder_trust_shape_invalid", `${label} must be a timestamp`);
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) {
    fail("founder_trust_noncanonical", `${label} must be a canonical UTC ISO timestamp`);
  }
  return value;
}

function canonicalBase64Url(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]+$/.test(value)) {
    fail("founder_trust_shape_invalid", `${label} must be unpadded base64url text`);
  }
  const decoded = Buffer.from(value, "base64url");
  if (decoded.length === 0 || decoded.toString("base64url") !== value) {
    fail("founder_trust_noncanonical", `${label} must use canonical unpadded base64url`);
  }
  return value;
}

/** Decode base64url SPKI DER and require one canonical Ed25519 public key. */
export function trustedFounderKeyFromBase64Url(encoded: string): TrustedFounderDecisionKey {
  const canonical = canonicalBase64Url(encoded, "founder public key");
  try {
    const der = Buffer.from(canonical, "base64url");
    const publicKey = createPublicKey({ key: der, format: "der", type: "spki" });
    if (publicKey.asymmetricKeyType !== "ed25519") fail("founder_trust_key_invalid", "trusted founder public key is not Ed25519");
    const exported = publicKey.export({ format: "der", type: "spki" });
    if (typeof exported === "string" || !Buffer.from(exported).equals(der)) {
      fail("founder_trust_key_invalid", "trusted founder public key is not canonical SPKI DER");
    }
    return {
      keyId: createHash("sha256").update(der).digest("hex"),
      publicKey,
      spkiDerBase64Url: canonical,
    };
  } catch (error) {
    if (error instanceof FounderTrustStoreError) throw error;
    fail("founder_trust_key_invalid", `trusted founder public key is invalid: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export function canonicalFounderTrustStore(document: FounderTrustStoreDocument): string {
  return `${JSON.stringify({
    schemaVersion: document.schemaVersion,
    purpose: document.purpose,
    algorithm: document.algorithm,
    keyId: document.keyId,
    spkiDerBase64Url: document.spkiDerBase64Url,
    installedAt: document.installedAt,
  })}\n`;
}

export function parseFounderTrustStore(value: unknown): FounderTrustStoreDocument {
  if (!isRecord(value)) fail("founder_trust_shape_invalid", "founder trust store must be an object");
  assertExactKeys(value, ["schemaVersion", "purpose", "algorithm", "keyId", "spkiDerBase64Url", "installedAt"], "founder trust store");
  if (value.schemaVersion !== FOUNDER_TRUST_SCHEMA_VERSION) fail("founder_trust_shape_invalid", "founder trust store schemaVersion must be 1.0.0");
  if (value.purpose !== FOUNDER_TRUST_PURPOSE) fail("founder_trust_shape_invalid", `founder trust store purpose must be ${FOUNDER_TRUST_PURPOSE}`);
  if (value.algorithm !== FOUNDER_TRUST_ALGORITHM) fail("founder_trust_shape_invalid", `founder trust store algorithm must be ${FOUNDER_TRUST_ALGORITHM}`);
  const spkiDerBase64Url = canonicalBase64Url(value.spkiDerBase64Url, "founder trust store spkiDerBase64Url");
  const key = trustedFounderKeyFromBase64Url(spkiDerBase64Url);
  const keyId = canonicalSha256(value.keyId, "founder trust store keyId");
  if (keyId !== key.keyId) fail("founder_trust_key_invalid", "founder trust store keyId does not match its Ed25519 SPKI DER");
  return {
    schemaVersion: FOUNDER_TRUST_SCHEMA_VERSION,
    purpose: FOUNDER_TRUST_PURPOSE,
    algorithm: FOUNDER_TRUST_ALGORITHM,
    keyId,
    spkiDerBase64Url,
    installedAt: canonicalIso(value.installedAt, "founder trust store installedAt"),
  };
}

function projectStat(stat: Stats): FounderTrustObservedStat {
  return {
    kind: stat.isSymbolicLink() ? "symlink" : stat.isFile() ? "file" : stat.isDirectory() ? "directory" : "other",
    uid: stat.uid,
    mode: stat.mode,
    size: stat.size,
    dev: stat.dev,
    ino: stat.ino,
  };
}

function observedStat(absolutePath: string, options: FounderTrustStoreLoadOptions): FounderTrustObservedStat {
  let observed: FounderTrustObservedStat;
  try {
    observed = projectStat(lstatSync(absolutePath));
  } catch (error) {
    fail("founder_trust_missing", `founder trust path is unavailable: ${absolutePath}: ${error instanceof Error ? error.message : String(error)}`);
  }
  return options.stat?.(absolutePath, observed) ?? observed;
}

function processUid(options: FounderTrustStoreLoadOptions): number {
  const uid = options.processUid ?? process.getuid?.();
  if (!Number.isSafeInteger(uid) || (uid as number) < 0) fail("founder_trust_role_refused", "the founder trust role requires a concrete process uid");
  return uid as number;
}

function defaultHome(env: NodeJS.ProcessEnv): string {
  const configured = env.B2C_APP_BUILDER_HOME?.trim();
  return configured ? path.resolve(configured) : path.join(os.homedir(), ".b2c-app-builder");
}

/** Resolve the launcher-selected path. A trust-file override must already be absolute. */
export function resolveFounderTrustFile(options: Pick<FounderTrustStoreLoadOptions, "env" | "trustFile"> = {}): string {
  const env = options.env ?? process.env;
  const requested = options.trustFile ?? env[FOUNDER_TRUST_FILE_ENV]?.trim() ?? path.join(defaultHome(env), "trust", "founder-ed25519-v1.json");
  if (!path.isAbsolute(requested)) fail("founder_trust_path_invalid", `${FOUNDER_TRUST_FILE_ENV} and --trust-file must use an absolute path`);
  return path.normalize(requested);
}

function canonicalExistingTrustPath(requestedPath: string): { canonicalTrustPath: string; trustDirectory: string } {
  try {
    const requestedDirectory = path.dirname(requestedPath);
    if (lstatSync(requestedDirectory).isSymbolicLink()) {
      fail("founder_trust_path_invalid", "founder trust directory cannot be a symbolic link");
    }
    const canonicalDirectory = realpathSync.native(requestedDirectory);
    return { canonicalTrustPath: path.join(canonicalDirectory, path.basename(requestedPath)), trustDirectory: canonicalDirectory };
  } catch (error) {
    if (error instanceof FounderTrustStoreError) throw error;
    fail("founder_trust_missing", `founder trust directory is unavailable: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function canonicalPlannedTrustPath(requestedPath: string): string {
  let cursor = path.dirname(requestedPath);
  const suffix: string[] = [path.basename(requestedPath)];
  while (!existsSync(cursor)) {
    const parent = path.dirname(cursor);
    if (parent === cursor) fail("founder_trust_path_invalid", `no existing ancestor can anchor founder trust path ${requestedPath}`);
    suffix.unshift(path.basename(cursor));
    cursor = parent;
  }
  try {
    return path.join(realpathSync.native(cursor), ...suffix);
  } catch (error) {
    fail("founder_trust_path_invalid", `founder trust path cannot be canonicalized: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function assertPathSecurity(
  canonicalTrustPath: string,
  trustDirectory: string,
  options: FounderTrustStoreLoadOptions,
): { file: FounderTrustObservedStat; directory: FounderTrustObservedStat } {
  const directory = observedStat(trustDirectory, options);
  const file = observedStat(canonicalTrustPath, options);
  if (directory.kind !== "directory") fail("founder_trust_path_invalid", "founder trust directory must be a real directory, not a symbolic link");
  if (file.kind !== "file") fail("founder_trust_path_invalid", "founder trust file must be a regular file, not a symbolic link");
  if (directory.uid !== file.uid) fail("founder_trust_owner_mismatch", "founder trust directory and file must have the same owner");
  if ((directory.mode & 0o022) !== 0 || (file.mode & 0o022) !== 0) {
    fail("founder_trust_permissions_invalid", "founder trust directory and file must not be group- or other-writable");
  }
  if ((directory.mode & 0o005) !== 0o005 || (file.mode & 0o004) !== 0o004) {
    fail("founder_trust_permissions_invalid", "founder public trust must grant non-owner read and directory traversal for the split-UID session model");
  }
  if (file.size <= 0 || file.size > FOUNDER_TRUST_MAX_BYTES) {
    fail("founder_trust_io_invalid", `founder trust file must contain 1-${FOUNDER_TRUST_MAX_BYTES} bytes`);
  }
  return { file, directory };
}

function readNoFollow(canonicalTrustPath: string, expected: FounderTrustObservedStat): Buffer {
  let descriptor: number | undefined;
  try {
    descriptor = openSync(canonicalTrustPath, constants.O_RDONLY | constants.O_NOFOLLOW);
    const before = projectStat(fstatSync(descriptor));
    if (before.kind !== "file" || before.size <= 0 || before.size > FOUNDER_TRUST_MAX_BYTES) {
      fail("founder_trust_io_invalid", "opened founder trust path is not a bounded regular file");
    }
    if (before.dev !== expected.dev || before.ino !== expected.ino || before.uid !== expected.uid || (before.mode & 0o022) !== 0) {
      fail("founder_trust_io_invalid", "founder trust file identity, owner, or permissions changed before it could be read");
    }
    const bytes = Buffer.alloc(before.size);
    let offset = 0;
    while (offset < bytes.length) {
      const read = readSync(descriptor, bytes, offset, bytes.length - offset, null);
      if (read === 0) fail("founder_trust_io_invalid", "founder trust file ended before its recorded size");
      offset += read;
    }
    const after = projectStat(fstatSync(descriptor));
    if (after.dev !== before.dev || after.ino !== before.ino || after.size !== before.size) {
      fail("founder_trust_io_invalid", "founder trust file changed while it was being read");
    }
    return bytes;
  } catch (error) {
    if (error instanceof FounderTrustStoreError) throw error;
    fail(
      "founder_trust_io_invalid",
      `founder trust file could not be opened without following links: ${error instanceof Error ? error.message : String(error)}`,
    );
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
  return fail("founder_trust_io_invalid", "founder trust file read ended without a result");
}

function defaultCanCreateInTrustDirectory(directory: string): boolean {
  const probePath = path.join(directory, `.founder-trust-write-probe-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  let descriptor: number | undefined;
  try {
    descriptor = openSync(probePath, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    return true;
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error ? String((error as { code: unknown }).code) : "";
    if (["EACCES", "EPERM", "EROFS"].includes(code)) return false;
    fail("founder_trust_io_invalid", `founder trust directory write probe failed ambiguously: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
    try {
      if (existsSync(probePath)) unlinkSync(probePath);
    } catch {
      fail("founder_trust_io_invalid", "founder trust directory write probe could not remove its temporary file");
    }
  }
  return fail("founder_trust_io_invalid", "founder trust directory write probe ended without a result");
}

function assertRole(role: FounderTrustAccessRole, fileOwnerUid: number, directory: string, options: FounderTrustStoreLoadOptions): void {
  if (role === "validation_read") return;
  const uid = processUid(options);
  if (role === "founder_mutation") {
    if (options.controlOwnerUid !== undefined && options.controlOwnerUid !== fileOwnerUid) {
      fail("founder_trust_owner_mismatch", "founder trust owner does not match the workspace control owner");
    }
    if (uid !== fileOwnerUid || (options.controlOwnerUid !== undefined && uid !== options.controlOwnerUid)) {
      fail("founder_trust_role_refused", "founder mutation requires the process, trust store, and supplied control owner to share one uid");
    }
    return;
  }
  if (uid === fileOwnerUid) fail("founder_trust_role_refused", `${role} cannot run as the founder trust-store owner`);
  if (role === "receipt_consumer" && options.controlOwnerUid !== undefined && uid !== options.controlOwnerUid) {
    fail("founder_trust_role_refused", "a receipt consumer must run as the supplied workspace control owner");
  }
  const canCreate = options.canCreateInTrustDirectory?.(directory) ?? defaultCanCreateInTrustDirectory(directory);
  if (canCreate) fail("founder_trust_role_refused", `${role} must be empirically unable to create files in the founder trust directory`);
}

/** Load and verify the exact external public-key trust store. Raw key environment values are ignored. */
export function loadFounderTrustStore(options: FounderTrustStoreLoadOptions = {}): LoadedFounderTrustStore {
  const requestedPath = resolveFounderTrustFile(options);
  const { canonicalTrustPath, trustDirectory } = canonicalExistingTrustPath(requestedPath);
  const security = assertPathSecurity(canonicalTrustPath, trustDirectory, options);
  const bytes = readNoFollow(canonicalTrustPath, security.file);
  let parsed: unknown;
  try {
    parsed = JSON.parse(bytes.toString("utf8")) as unknown;
  } catch {
    fail("founder_trust_shape_invalid", "founder trust store is not valid JSON");
  }
  const document = parseFounderTrustStore(parsed);
  if (bytes.toString("utf8") !== canonicalFounderTrustStore(document)) {
    fail("founder_trust_noncanonical", "founder trust store must use the canonical field order, JSON encoding, and terminal newline");
  }
  const trustedKey = trustedFounderKeyFromBase64Url(document.spkiDerBase64Url);
  assertRole(options.role ?? "validation_read", security.file.uid, trustDirectory, options);
  return {
    document,
    trustedKey,
    canonicalTrustPath,
    trustDirectory,
    trustFileSha256: createHash("sha256").update(bytes).digest("hex"),
    ownerUid: security.file.uid,
  };
}

function ensureInstallDirectory(
  requestedPath: string,
  options: InstallFounderTrustStoreOptions,
): { canonicalTrustPath: string; trustDirectory: string; ownerUid: number } {
  const requestedDirectory = path.dirname(requestedPath);
  try {
    if (existsSync(requestedDirectory) && lstatSync(requestedDirectory).isSymbolicLink()) {
      fail("founder_trust_path_invalid", "founder trust directory cannot be a symbolic link");
    }
    mkdirSync(requestedDirectory, { recursive: true, mode: 0o755 });
  } catch (error) {
    if (error instanceof FounderTrustStoreError) throw error;
    fail("founder_trust_io_invalid", `founder trust directory could not be created: ${error instanceof Error ? error.message : String(error)}`);
  }
  const canonicalDirectory = realpathSync.native(requestedDirectory);
  const canonicalTrustPath = path.join(canonicalDirectory, path.basename(requestedPath));
  let observed = observedStat(canonicalDirectory, options);
  if (observed.kind !== "directory") fail("founder_trust_path_invalid", "founder trust parent must be a real directory");
  const uid = options.processUid ?? process.getuid?.();
  if (!Number.isSafeInteger(uid) || uid !== observed.uid || (options.controlOwnerUid !== undefined && options.controlOwnerUid !== observed.uid)) {
    fail("founder_trust_role_refused", "trust installation requires the process, trust directory, and supplied control owner to share one uid");
  }
  // This store contains a public key only. Other UIDs need read/traverse access while all
  // mutation remains owner-only; 0700/0600 would make the mandated split-UID launcher model
  // impossible without a platform-specific ACL.
  chmodSync(canonicalDirectory, 0o755);
  observed = observedStat(canonicalDirectory, options);
  if ((observed.mode & 0o777) !== 0o755) fail("founder_trust_permissions_invalid", "founder trust directory must have mode 0755 during installation");
  return { canonicalTrustPath, trustDirectory: canonicalDirectory, ownerUid: observed.uid };
}

function fsyncDirectory(directory: string): void {
  let descriptor: number | undefined;
  try {
    descriptor = openSync(directory, constants.O_RDONLY);
    fsyncSync(descriptor);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

/** Plan or install one immutable public-only trust store. A different existing key always refuses. */
export function installFounderTrustStore(options: InstallFounderTrustStoreOptions): InstallFounderTrustStoreResult {
  const trustedKey = trustedFounderKeyFromBase64Url(options.publicKeyBase64Url);
  const installedAt = canonicalIso(options.installedAt ?? new Date().toISOString(), "installedAt");
  const requestedPath = resolveFounderTrustFile({ env: options.env, trustFile: options.trustFile });
  const document: FounderTrustStoreDocument = {
    schemaVersion: FOUNDER_TRUST_SCHEMA_VERSION,
    purpose: FOUNDER_TRUST_PURPOSE,
    algorithm: FOUNDER_TRUST_ALGORITHM,
    keyId: trustedKey.keyId,
    spkiDerBase64Url: trustedKey.spkiDerBase64Url,
    installedAt,
  };
  const bytes = Buffer.from(canonicalFounderTrustStore(document), "utf8");
  const plannedHash = createHash("sha256").update(bytes).digest("hex");

  if (!options.apply) {
    return { status: "dry_run", keyId: trustedKey.keyId, canonicalTrustPath: canonicalPlannedTrustPath(requestedPath), trustFileSha256: plannedHash, document };
  }

  const { canonicalTrustPath, trustDirectory } = ensureInstallDirectory(requestedPath, options);
  if (existsSync(canonicalTrustPath)) {
    const current = loadFounderTrustStore({
      env: options.env,
      trustFile: canonicalTrustPath,
      role: "founder_mutation",
      processUid: options.processUid,
      controlOwnerUid: options.controlOwnerUid,
      stat: options.stat,
    });
    if (current.trustedKey.keyId !== trustedKey.keyId) {
      fail("founder_trust_conflict", `a different founder key is already installed at ${canonicalTrustPath}`);
    }
    return {
      status: "already_installed",
      keyId: current.trustedKey.keyId,
      canonicalTrustPath: current.canonicalTrustPath,
      trustFileSha256: current.trustFileSha256,
      document: current.document,
    };
  }

  const temporaryPath = path.join(trustDirectory, `.founder-ed25519-v1.${process.pid}.${Date.now()}.tmp`);
  let descriptor: number | undefined;
  try {
    descriptor = openSync(temporaryPath, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o644);
    fchmodSync(descriptor, 0o644);
    let offset = 0;
    while (offset < bytes.length) offset += writeSync(descriptor, bytes, offset, bytes.length - offset);
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = undefined;
    // link(2) creates the final name atomically and refuses to replace a concurrent install.
    linkSync(temporaryPath, canonicalTrustPath);
    unlinkSync(temporaryPath);
    fsyncDirectory(trustDirectory);
  } catch (error) {
    if (descriptor !== undefined) closeSync(descriptor);
    try {
      if (existsSync(temporaryPath)) unlinkSync(temporaryPath);
    } catch {
      // Preserve the original installation error.
    }
    const code = typeof error === "object" && error !== null && "code" in error ? String((error as { code: unknown }).code) : "";
    if (code === "EEXIST") fail("founder_trust_conflict", `founder trust was installed concurrently at ${canonicalTrustPath}; rerun to inspect it`);
    if (error instanceof FounderTrustStoreError) throw error;
    fail("founder_trust_io_invalid", `founder trust installation failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  const installed = loadFounderTrustStore({
    env: options.env,
    trustFile: canonicalTrustPath,
    role: "founder_mutation",
    processUid: options.processUid,
    controlOwnerUid: options.controlOwnerUid,
    stat: options.stat,
  });
  if (installed.trustFileSha256 !== plannedHash || installed.trustedKey.keyId !== trustedKey.keyId) {
    fail("founder_trust_io_invalid", "installed founder trust store failed exact readback");
  }
  return {
    status: "installed",
    keyId: installed.trustedKey.keyId,
    canonicalTrustPath: installed.canonicalTrustPath,
    trustFileSha256: installed.trustFileSha256,
    document: installed.document,
  };
}

/** Stable workspace identity shared by signed decisions and the run's trust binding. */
export function computeFounderWorkspaceBinding(workspaceRoot: string): string {
  try {
    const realRoot = realpathSync.native(workspaceRoot);
    if (!lstatSync(realRoot).isDirectory()) fail("founder_trust_binding_invalid", "workspace root is not a directory");
    return createHash("sha256").update(`b2c-app-builder/workspace/v1\0${realRoot}`, "utf8").digest("hex");
  } catch (error) {
    if (error instanceof FounderTrustStoreError) throw error;
    fail("founder_trust_binding_invalid", `workspace root cannot be bound: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/** Inspect the real workspace control directory for founder-mutation role checks. */
export function founderControlOwnerUid(workspaceRoot: string): number {
  try {
    const realRoot = realpathSync.native(workspaceRoot);
    const controlPath = path.join(realRoot, "control");
    const control = lstatSync(controlPath);
    if (!control.isDirectory() || control.isSymbolicLink()) {
      fail("founder_trust_owner_mismatch", "workspace control must be a real directory before founder authority can mutate it");
    }
    return control.uid;
  } catch (error) {
    if (error instanceof FounderTrustStoreError) throw error;
    fail("founder_trust_owner_mismatch", `workspace control owner cannot be inspected: ${error instanceof Error ? error.message : String(error)}`);
  }
}

interface FounderTrustAuditPayload {
  readonly purpose: typeof FOUNDER_TRUST_BINDING_PURPOSE;
  readonly runId: string;
  readonly workspaceBinding: string;
  readonly keyId: string;
  readonly trustFileSha256: string;
  readonly canonicalTrustPath: string;
  readonly boundAt: string;
}

function canonicalTrustAuditPayload(payload: FounderTrustAuditPayload): string {
  return JSON.stringify({
    purpose: payload.purpose,
    runId: payload.runId,
    workspaceBinding: payload.workspaceBinding,
    keyId: payload.keyId,
    trustFileSha256: payload.trustFileSha256,
    canonicalTrustPath: payload.canonicalTrustPath,
    boundAt: payload.boundAt,
  });
}

function trustAuditPayload(run: RunStateDocument, workspaceRoot: string, store: LoadedFounderTrustStore, boundAt: string): FounderTrustAuditPayload {
  return {
    purpose: FOUNDER_TRUST_BINDING_PURPOSE,
    runId: run.runId,
    workspaceBinding: computeFounderWorkspaceBinding(workspaceRoot),
    keyId: store.trustedKey.keyId,
    trustFileSha256: store.trustFileSha256,
    canonicalTrustPath: store.canonicalTrustPath,
    boundAt: canonicalIso(boundAt, "founder trust boundAt"),
  };
}

function founderTrustAuditProjection(payload: FounderTrustAuditPayload, sessionId: string): AuditEntryInput {
  if (typeof sessionId !== "string" || sessionId.trim() !== sessionId || sessionId.length === 0) {
    fail("founder_trust_binding_invalid", "founder trust binding requires a session id");
  }
  const canonical = canonicalTrustAuditPayload(payload);
  return {
    sessionId,
    targetDoc: "run-state",
    patchId: `founder-decision-trust:${payload.runId}`,
    action: FOUNDER_TRUST_BINDING_ACTION,
    summary: canonical,
    stateHash: createHash("sha256").update(canonical, "utf8").digest("hex"),
    issueCodes: [],
  };
}

function exactTrustEntry(entry: AuditEntry, payload: FounderTrustAuditPayload): boolean {
  const projected = founderTrustAuditProjection(payload, entry.sessionId);
  return (
    entry.timestamp === payload.boundAt &&
    entry.targetDoc === projected.targetDoc &&
    entry.patchId === projected.patchId &&
    entry.action === projected.action &&
    entry.summary === projected.summary &&
    entry.stateHash === projected.stateHash &&
    JSON.stringify(entry.issueCodes) === "[]" &&
    entry.receipt === undefined
  );
}

function bindingFrom(payload: FounderTrustAuditPayload, entry: AuditEntry): FounderDecisionTrustBinding {
  return {
    keyId: payload.keyId,
    trustFileSha256: payload.trustFileSha256,
    canonicalTrustPath: payload.canonicalTrustPath,
    workspaceBinding: payload.workspaceBinding,
    runId: payload.runId,
    boundAt: payload.boundAt,
    auditEntryHash: entry.entryHash,
  };
}

function assertAuditChain(auditPath: string): AuditEntry[] {
  try {
    const result = verifyAuditChain(auditPath);
    if (!result.valid) fail("founder_trust_audit_invalid", result.reason ?? "founder trust audit chain is invalid");
    return readAuditLog(auditPath);
  } catch (error) {
    if (error instanceof FounderTrustStoreError) throw error;
    fail("founder_trust_audit_invalid", `founder trust audit could not be parsed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function matchingTrustEntries(
  run: RunStateDocument,
  workspaceRoot: string,
  auditPath: string,
  store: LoadedFounderTrustStore,
): Array<{ entry: AuditEntry; payload: FounderTrustAuditPayload }> {
  const entries = assertAuditChain(auditPath);
  const candidates = entries.filter((entry) => entry.action === FOUNDER_TRUST_BINDING_ACTION && entry.patchId === `founder-decision-trust:${run.runId}`);
  const exact: Array<{ entry: AuditEntry; payload: FounderTrustAuditPayload }> = [];
  for (const entry of candidates) {
    const payload = trustAuditPayload(run, workspaceRoot, store, entry.timestamp);
    if (!exactTrustEntry(entry, payload))
      fail("founder_trust_binding_invalid", `audit entry ${entry.seq} is not the exact founder trust projection for this run`);
    exact.push({ entry, payload });
  }
  if (exact.length > 1) fail("founder_trust_binding_invalid", "the run contains duplicate founder trust binding audit entries");
  return exact;
}

export interface BindFounderTrustOptions {
  readonly workspaceRoot: string;
  readonly auditPath: string;
  /** Durable path used to prove that a no-audit, unbound run has not been persisted yet. */
  readonly runStatePath: string;
  readonly sessionId: string;
  readonly store: LoadedFounderTrustStore;
  readonly boundAt?: string;
}

/** Bind a newly seeded run. Repeating the exact call reuses one audit edge; it never creates a replacement. */
export function bindFounderTrustToNewRun(run: RunStateDocument, options: BindFounderTrustOptions): FounderDecisionTrustBinding {
  if (run.founderDecisionTrust !== undefined) {
    assertFounderTrustBinding(run, options);
    return run.founderDecisionTrust;
  }
  const prior = matchingTrustEntries(run, options.workspaceRoot, options.auditPath, options.store);
  let entry: AuditEntry;
  let payload: FounderTrustAuditPayload;
  if (prior.length === 1) {
    ({ entry, payload } = prior[0]!);
  } else {
    try {
      lstatSync(options.runStatePath);
      fail("founder_trust_binding_missing", "an already-persisted unbound run cannot initialize founder trust from store presence");
    } catch (error) {
      if (error instanceof FounderTrustStoreError) throw error;
      const code = typeof error === "object" && error !== null && "code" in error ? String((error as { code: unknown }).code) : "";
      if (code !== "ENOENT")
        fail("founder_trust_io_invalid", `run-state existence could not be checked safely: ${error instanceof Error ? error.message : String(error)}`);
    }
    payload = trustAuditPayload(run, options.workspaceRoot, options.store, options.boundAt ?? new Date().toISOString());
    entry = appendAuditEntry(options.auditPath, founderTrustAuditProjection(payload, options.sessionId), payload.boundAt);
    const readback = assertAuditChain(options.auditPath).find((candidate) => candidate.entryHash === entry.entryHash);
    if (!readback || !exactTrustEntry(readback, payload)) fail("founder_trust_audit_invalid", "founder trust audit append failed exact readback");
  }
  run.founderDecisionTrust = bindingFrom(payload, entry);
  run.founderDecisionKeyId = payload.keyId;
  return run.founderDecisionTrust;
}

/** Recover only an already-audited binding. An existing unbound run never trusts a store by presence alone. */
export function recoverFounderTrustBindingFromAudit(
  run: RunStateDocument,
  options: Omit<BindFounderTrustOptions, "sessionId" | "boundAt" | "runStatePath">,
): FounderDecisionTrustBinding {
  if (run.founderDecisionTrust !== undefined) {
    assertFounderTrustBinding(run, { ...options, sessionId: "binding-readback" });
    return run.founderDecisionTrust;
  }
  const prior = matchingTrustEntries(run, options.workspaceRoot, options.auditPath, options.store);
  if (prior.length !== 1) {
    fail("founder_trust_binding_missing", "this existing run has no audit-backed founder trust binding; it cannot be initialized retroactively");
  }
  const { entry, payload } = prior[0]!;
  run.founderDecisionTrust = bindingFrom(payload, entry);
  run.founderDecisionKeyId = payload.keyId;
  return run.founderDecisionTrust;
}

/** Verify the run binding against the current store bytes, workspace identity, and exact audit edge. */
export function assertFounderTrustBinding(
  run: RunStateDocument,
  options: Pick<BindFounderTrustOptions, "workspaceRoot" | "auditPath" | "store"> & { readonly sessionId?: string },
): void {
  const binding = run.founderDecisionTrust;
  if (!binding) fail("founder_trust_binding_missing", "this run has no founder trust binding");
  const values = Object.keys(binding).sort();
  const expectedKeys = ["keyId", "trustFileSha256", "canonicalTrustPath", "workspaceBinding", "runId", "boundAt", "auditEntryHash"].sort();
  if (JSON.stringify(values) !== JSON.stringify(expectedKeys)) fail("founder_trust_binding_invalid", "founder trust binding has missing or extra fields");
  const payload = trustAuditPayload(run, options.workspaceRoot, options.store, binding.boundAt);
  if (
    binding.keyId !== payload.keyId ||
    binding.trustFileSha256 !== payload.trustFileSha256 ||
    binding.canonicalTrustPath !== payload.canonicalTrustPath ||
    binding.workspaceBinding !== payload.workspaceBinding ||
    binding.runId !== payload.runId ||
    (run.founderDecisionKeyId !== undefined && run.founderDecisionKeyId !== binding.keyId)
  ) {
    fail("founder_trust_binding_invalid", "founder trust binding does not match this run, workspace, or current trust store");
  }
  canonicalSha256(binding.auditEntryHash, "founder trust binding auditEntryHash");
  const entries = assertAuditChain(options.auditPath);
  const matches = entries.filter((entry) => entry.entryHash === binding.auditEntryHash);
  if (matches.length !== 1 || !exactTrustEntry(matches[0]!, payload)) {
    fail("founder_trust_audit_invalid", "founder trust binding does not name its exact audit entry");
  }
  const trustEntries = entries.filter((entry) => entry.action === FOUNDER_TRUST_BINDING_ACTION && entry.patchId === `founder-decision-trust:${run.runId}`);
  if (trustEntries.length !== 1 || trustEntries[0]!.entryHash !== binding.auditEntryHash) {
    fail("founder_trust_audit_invalid", "founder trust binding audit history is missing, duplicated, or replaced");
  }
}
