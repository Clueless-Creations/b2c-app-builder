import { createHash, randomUUID } from "node:crypto";
import {
  constants,
  lstatSync,
  mkdirSync,
  openSync,
  closeSync,
  readFileSync,
  writeFileSync,
  realpathSync,
  fstatSync,
  renameSync,
  rmSync,
  existsSync,
} from "node:fs";
import path from "node:path";
import { parseDocument } from "yaml";
import { validateExtension, validateExtensionClosure, resourcePathSchema, type Extension } from "../../contracts/extensions/contract.js";

export interface PackageSnapshot {
  readonly extension: Extension;
  readonly digest: string;
  readonly files: Readonly<Record<string, string>>;
  readonly dependencies: readonly { id: string; digest: string }[];
}
export interface PackageDependency {
  readonly directory: string;
  readonly snapshot: PackageSnapshot;
}
const hash = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(",")}}`;
  return JSON.stringify(value);
}

function readResource(root: string, relative: string): Buffer {
  resourcePathSchema.parse(relative);
  if (lstatSync(root).isSymbolicLink()) throw new Error("Package root must not be a symlink.");
  const actualRoot = realpathSync(root);
  let cursor = actualRoot;
  const ancestors: Array<{ location: string; dev: number; ino: number }> = [];
  for (const segment of relative.split("/")) {
    const parent = lstatSync(cursor);
    if (!parent.isDirectory() || parent.isSymbolicLink()) throw new Error(`Unsafe resource directory: ${relative}`);
    ancestors.push({ location: cursor, dev: parent.dev, ino: parent.ino });
    cursor = path.join(cursor, segment);
  }
  const before = lstatSync(cursor);
  if (!before.isFile() || before.isSymbolicLink()) throw new Error(`Resource is not a regular file: ${relative}`);
  if (before.size > 32 * 1024 * 1024) throw new Error(`Resource exceeds 32 MiB: ${relative}`);
  const descriptor = openSync(cursor, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const opened = fstatSync(descriptor);
    if (!opened.isFile() || opened.dev !== before.dev || opened.ino !== before.ino) throw new Error(`Resource changed before opening: ${relative}`);
    const checkAncestors = () => {
      for (const ancestor of ancestors) {
        const current = lstatSync(ancestor.location);
        if (!current.isDirectory() || current.isSymbolicLink() || current.dev !== ancestor.dev || current.ino !== ancestor.ino)
          throw new Error(`Resource directory changed: ${relative}`);
      }
    };
    checkAncestors();
    const bytes = readFileSync(descriptor);
    const after = fstatSync(descriptor);
    if (bytes.length > 32 * 1024 * 1024 || after.size !== opened.size || after.mtimeMs !== opened.mtimeMs || after.ctimeMs !== opened.ctimeMs)
      throw new Error(`Resource changed while reading: ${relative}`);
    checkAncestors();
    return bytes;
  } finally {
    closeSync(descriptor);
  }
}
function freeze<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

/** Read-only metadata inspection. No hooks, imports, subprocesses, or network access. */
export function inspectPackage(source: string, dependencies: readonly PackageDependency[] = []): PackageSnapshot {
  const root = path.resolve(source);
  if (lstatSync(root).isSymbolicLink()) throw new Error("Package root must not be a symlink.");
  const manifestBytes = readResource(root, "extension.yaml");
  const document = parseDocument(manifestBytes.toString("utf8"), { uniqueKeys: true });
  if (document.errors.length) throw new Error("Invalid extension YAML.");
  const extension = validateExtension(document.toJS({ maxAliasCount: 0 }));
  const verifiedPins = new Map<string, string>();
  const selected = extension.dependencies.map((reference) => {
    const matches = dependencies.filter((entry) => entry.snapshot.extension.id === reference.id && entry.snapshot.extension.version === reference.version);
    if (matches.length !== 1) throw new Error(`Missing or ambiguous dependency: ${reference.id}@${reference.version}`);
    verifySnapshot(matches[0]!.directory, matches[0]!.snapshot, new Set(), verifiedPins);
    return matches[0]!.snapshot;
  });
  validateExtensionClosure(
    extension,
    selected.map((item) => item.extension),
  );
  const files: Record<string, string> = Object.create(null) as Record<string, string>;
  files["extension.yaml"] = hash(manifestBytes);
  for (const resource of extension.resources) files[resource.path] = hash(readResource(root, resource.path));
  const closure = selected.map((entry) => ({ id: entry.extension.id, digest: entry.digest })).sort((a, b) => a.id.localeCompare(b.id));
  return freeze({ extension, files, dependencies: closure, digest: `sha256:${hash(canonical({ files, dependencies: closure }))}` });
}

/** Copy only declared bytes to an immutable-by-contract digest address. Verify on every read. */
export function snapshotPackage(source: string, store: string, dependencies: readonly PackageDependency[] = []): PackageSnapshot {
  const snapshot = inspectPackage(source, dependencies);
  mkdirSync(store, { recursive: true, mode: 0o700 });
  if (lstatSync(store).isSymbolicLink()) throw new Error("Snapshot store must not be a symlink.");
  const physicalStore = realpathSync(store);
  for (const dependency of dependencies) {
    if (snapshot.dependencies.some((entry) => entry.digest === dependency.snapshot.digest))
      copySnapshot(dependency.directory, physicalStore, dependency.snapshot);
  }
  publishSnapshot(source, physicalStore, snapshot);
  return snapshot;
}

function copySnapshot(source: string, store: string, snapshot: PackageSnapshot): void {
  verifySnapshot(source, snapshot);
  for (const dependency of snapshot.dependencies) {
    const location = path.join(path.dirname(source), dependency.digest.slice(7));
    const child = JSON.parse(readResource(location, "snapshot.json").toString("utf8")) as PackageSnapshot;
    copySnapshot(location, store, child);
  }
  publishSnapshot(source, store, snapshot);
}

function publishSnapshot(source: string, store: string, snapshot: PackageSnapshot): void {
  const destination = path.join(store, snapshot.digest.slice(7));
  if (existsSync(destination)) {
    verifySnapshot(destination, snapshot);
    return;
  }
  const temporary = path.join(store, `.pending-${randomUUID()}`);
  mkdirSync(temporary, { mode: 0o700 });
  try {
    for (const [relative, expected] of Object.entries(snapshot.files)) {
      const bytes = readResource(source, relative);
      if (hash(bytes) !== expected) throw new Error(`Package changed during snapshot: ${relative}`);
      const target = path.join(temporary, relative);
      mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
      writeFileSync(target, bytes, { flag: "wx", mode: 0o444 });
    }
    writeFileSync(path.join(temporary, "snapshot.json"), JSON.stringify(snapshot, null, 2) + "\n", { flag: "wx", mode: 0o444 });
    verifySnapshot(temporary, snapshot);
    try {
      renameSync(temporary, destination);
    } catch (error) {
      if (!existsSync(destination)) throw error;
      verifySnapshot(destination, snapshot);
    }
    verifySnapshot(destination, snapshot);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}

export function verifySnapshot(
  directory: string,
  snapshot: PackageSnapshot,
  ancestors: ReadonlySet<string> = new Set(),
  packagePins: Map<string, string> = new Map(),
): void {
  const previousPin = packagePins.get(snapshot.extension.id);
  if (previousPin && previousPin !== snapshot.digest) throw new Error(`Conflicting package versions or content: ${snapshot.extension.id}`);
  packagePins.set(snapshot.extension.id, snapshot.digest);
  if (ancestors.has(snapshot.digest)) throw new Error("Package dependency cycle.");
  const visited = new Set([...ancestors, snapshot.digest]);
  if (lstatSync(directory).isSymbolicLink()) throw new Error("Snapshot directory must not be a symlink.");
  const expected = `sha256:${hash(canonical({ files: snapshot.files, dependencies: snapshot.dependencies }))}`;
  if (snapshot.digest !== expected) throw new Error("Snapshot metadata digest mismatch.");
  for (const [relative, digest] of Object.entries(snapshot.files)) {
    if (hash(readResource(directory, relative)) !== digest) throw new Error(`Pinned resource changed: ${relative}`);
  }
  const document = parseDocument(readResource(directory, "extension.yaml").toString("utf8"), { uniqueKeys: true });
  if (document.errors.length || canonical(validateExtension(document.toJS({ maxAliasCount: 0 }))) !== canonical(snapshot.extension))
    throw new Error("Pinned manifest does not match snapshot metadata.");
  const required = new Set(["extension.yaml", ...snapshot.extension.resources.map((entry) => entry.path)]);
  if (required.size !== Object.keys(snapshot.files).length || [...required].some((entry) => !Object.hasOwn(snapshot.files, entry)))
    throw new Error("Snapshot must hash every declared resource exactly once.");
  if (snapshot.dependencies.length !== snapshot.extension.dependencies.length) throw new Error("Snapshot dependency closure does not match manifest.");
  const resolvedDependencies: Extension[] = [];
  const seenDependencies = new Set<string>();
  for (const dependency of snapshot.dependencies) {
    if (seenDependencies.has(dependency.id)) throw new Error("Duplicate snapshot dependency.");
    seenDependencies.add(dependency.id);
    if (!/^sha256:[a-f0-9]{64}$/.test(dependency.digest)) throw new Error("Invalid dependency digest.");
    const location = path.join(path.dirname(directory), dependency.digest.slice(7));
    const pinned = JSON.parse(readResource(location, "snapshot.json").toString("utf8")) as PackageSnapshot;
    if (
      pinned.digest !== dependency.digest ||
      pinned.extension.id !== dependency.id ||
      !snapshot.extension.dependencies.some((entry) => entry.id === dependency.id && entry.version === pinned.extension.version)
    )
      throw new Error("Pinned dependency identity mismatch.");
    verifySnapshot(location, pinned, visited, packagePins);
    resolvedDependencies.push(pinned.extension);
  }
  validateExtensionClosure(snapshot.extension, resolvedDependencies);
}

/** One synchronous verification pass. Never retain this reader across a worker/provider await.
 * Complete packages are checked once; every resource read still hashes the actual bytes.
 * A later compile or dispatch creates a fresh reader and rechecks the full closure.
 */
export function createSnapshotReader() {
  const verified = new Map<string, PackageSnapshot>();
  const verify = (directory: string, snapshot: PackageSnapshot): PackageSnapshot => {
    const key = `${path.resolve(directory)}\0${snapshot.digest}`;
    const cached = verified.get(key);
    if (cached) return cached;
    const pinned = structuredClone(snapshot);
    verifySnapshot(directory, pinned);
    freeze(pinned);
    verified.set(key, pinned);
    return pinned;
  };
  const load = (directory: string, expectedDigest: string): PackageSnapshot => {
    const cached = verified.get(`${path.resolve(directory)}\0${expectedDigest}`);
    if (cached) return cached;
    const snapshot = JSON.parse(readResource(directory, "snapshot.json").toString("utf8")) as PackageSnapshot;
    if (snapshot.digest !== expectedDigest) throw new Error("Stored package digest does not match the selected binding.");
    return verify(directory, snapshot);
  };
  const locate = (directory: string, supplied: PackageSnapshot, id: string): { directory: string; snapshot: PackageSnapshot; relative: string } => {
    const snapshot = verify(directory, supplied);
    const resource = snapshot.extension.resources.find((entry) => entry.id === id);
    if (resource) return { directory, snapshot, relative: resource.path };
    const imported = snapshot.extension.imports.find((entry) => entry.exports.includes(id));
    const dependency = imported && snapshot.dependencies.find((entry) => entry.id === imported.package.id);
    if (!dependency) throw new Error(`Resource is not exported or imported by this package: ${id}`);
    const location = path.join(path.dirname(directory), dependency.digest.slice(7));
    return locate(location, load(location, dependency.digest), id);
  };
  const exportDigest = (directory: string, supplied: PackageSnapshot, id: string, kind: "operation" | "implementation"): string => {
    const snapshot = verify(directory, supplied);
    const local =
      kind === "operation"
        ? snapshot.extension.capabilities.some((capability) => capability.operations.some((operation) => operation.id === id))
        : snapshot.extension.implementations.some((implementation) => implementation.id === id);
    if (local) return snapshot.digest;
    const imported = snapshot.extension.imports.find((entry) => entry.exports.includes(id));
    const dependency = imported && snapshot.dependencies.find((entry) => entry.id === imported.package.id);
    if (!dependency) throw new Error(`binding.export_not_visible:${id}`);
    const location = path.join(path.dirname(directory), dependency.digest.slice(7));
    return exportDigest(location, load(location, dependency.digest), id, kind);
  };
  return {
    load,
    exportDigest,
    resolve(directory: string, snapshot: PackageSnapshot, id: string): string {
      const resource = locate(directory, snapshot, id);
      return path.join(resource.directory, resource.relative);
    },
    read(directory: string, snapshot: PackageSnapshot, id: string): Buffer {
      const resource = locate(directory, snapshot, id),
        bytes = readResource(resource.directory, resource.relative);
      if (hash(bytes) !== resource.snapshot.files[resource.relative]) throw new Error(`Pinned resource changed during resolution: ${id}`);
      return bytes;
    },
    identity(directory: string, snapshot: PackageSnapshot, id: string): { packageDigest: string; kind: string; sha256: string } {
      const located = locate(directory, snapshot, id),
        resource = located.snapshot.extension.resources.find((entry) => entry.id === id)!;
      return { packageDigest: located.snapshot.digest, kind: resource.kind, sha256: located.snapshot.files[resource.path]! };
    },
  };
}
export type SnapshotReader = ReturnType<typeof createSnapshotReader>;

/** Path for metadata inspection; execution consumers read pinned bytes again at dispatch. */
export function resolveSnapshotResource(directory: string, snapshot: PackageSnapshot, id: string): string {
  return createSnapshotReader().resolve(directory, snapshot, id);
}
/** Verified current resource bytes, without a path-reopen gap. */
export function readSnapshotResource(directory: string, snapshot: PackageSnapshot, id: string): Buffer {
  return createSnapshotReader().read(directory, snapshot, id);
}
/** Read exact metadata and verify its complete resource/dependency closure. */
export function readStoredSnapshot(directory: string, expectedDigest: string): PackageSnapshot {
  return createSnapshotReader().load(directory, expectedDigest);
}
export function snapshotResourceIdentity(directory: string, snapshot: PackageSnapshot, id: string): { packageDigest: string; kind: string; sha256: string } {
  return createSnapshotReader().identity(directory, snapshot, id);
}
export function snapshotExportDigest(directory: string, snapshot: PackageSnapshot, id: string, kind: "operation" | "implementation"): string {
  return createSnapshotReader().exportDigest(directory, snapshot, id, kind);
}

/** Bounded, no-follow package bytes for a compiled exact resource pin. */
export { readResource as readPackageResourceFile };
