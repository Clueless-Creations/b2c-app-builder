import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync, readlinkSync } from "node:fs";
import path from "node:path";
import { validateSourceAccess, type SourceAccess } from "../../contracts/source-access.js";

export interface TaskInputSnapshot {
  readonly roots: readonly string[];
  readonly files: readonly { path: string; sha256: string }[];
}

interface InventoryLimits {
  readonly maxFiles?: number;
  readonly maxBytes?: number;
}

/** Resolve without following a symlink in any workspace-relative path component. */
export function regularInputPath(root: string, relative: string): string {
  if (!relative || path.isAbsolute(relative) || relative.split(/[\\/]/).some((part) => part === "..")) {
    throw new Error(`task input must be workspace-relative: ${relative}`);
  }
  const normalized = path.normalize(relative);
  if (normalized === "." || normalized === `.${path.sep}`) throw new Error("task input cannot be the workspace root");
  let current = path.resolve(root);
  for (const part of normalized.split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    if (lstatSync(current).isSymbolicLink()) throw new Error(`task input cannot follow a symbolic link: ${relative}`);
  }
  return current;
}

/** Expand directory reads into exact ordinary file receipts. A limit fails; it never truncates. */
export function snapshotTaskInputs(root: string, targets: readonly string[], limits: InventoryLimits = {}): TaskInputSnapshot {
  const maxFiles = limits.maxFiles ?? 1024;
  const maxBytes = limits.maxBytes ?? 32 * 1024 * 1024;
  const files = new Map<string, { path: string; sha256: string }>();
  let bytes = 0;
  let directories = 0;
  const visit = (relative: string): number => {
    const absolute = regularInputPath(root, relative);
    const stat = lstatSync(absolute);
    if (stat.isDirectory()) {
      if (++directories > 1024 || relative.split("/").length > 64) throw new Error("task input directory inventory exceeds traversal bounds");
      let count = 0;
      for (const name of readdirSync(absolute).sort()) count += visit(path.posix.join(relative, name));
      return count;
    }
    if (!stat.isFile()) throw new Error(`task input must be a regular file or directory: ${relative}`);
    if (files.has(relative)) return 1;
    bytes += stat.size;
    if (files.size >= maxFiles || bytes > maxBytes) throw new Error(`task input inventory exceeds ${maxFiles} files or ${maxBytes} bytes`);
    files.set(relative, { path: relative, sha256: `sha256:${createHash("sha256").update(readFileSync(absolute)).digest("hex")}` });
    return 1;
  };
  const roots = [
    ...new Set(
      targets.map((target) => {
        regularInputPath(root, target);
        return path.normalize(target).split(path.sep).filter(Boolean).join("/");
      }),
    ),
  ];
  for (const relative of roots) {
    if (visit(relative) === 0) throw new Error(`required task input directory is empty: ${relative}`);
  }
  return { roots, files: [...files.values()] };
}

/** Re-read immutable inputs after execution, including newly added or removed directory files. */
export function verifyTaskInputs(
  root: string,
  snapshot: TaskInputSnapshot,
  mutableFiles: readonly string[] = [],
  sourceAccess: readonly SourceAccess[] = [],
): string[] {
  let current: TaskInputSnapshot;
  try {
    current = snapshotTaskInputs(root, snapshot.roots);
  } catch (error) {
    return [`task input inventory changed or became unreadable: ${error instanceof Error ? error.message : String(error)}`];
  }
  const before = new Map(snapshot.files.map((file) => [file.path, file.sha256]));
  const after = new Map(current.files.map((file) => [file.path, file.sha256]));
  const mutable = new Set(mutableFiles);
  const issues: string[] = [];
  for (const file of new Set([...before.keys(), ...after.keys()])) {
    if (sourceAccess.some((claim) => claim.access === "update" && (file === claim.path || file.startsWith(`${claim.path}/`)))) continue;
    if (!before.has(file) || !after.has(file)) issues.push(`task input inventory changed: ${file}`);
    else if (!mutable.has(file) && before.get(file) !== after.get(file)) issues.push(`read-only task input changed: ${file}`);
  }
  return issues;
}

export interface SourceAccessSnapshot {
  readonly claims: readonly SourceAccess[];
  readonly readOnly: TaskInputSnapshot;
}

/** Check each existing ancestor, including destinations that have not been created yet. */
export function snapshotSourceAccess(root: string, claims: readonly SourceAccess[], hostRoot?: string): SourceAccessSnapshot {
  const validated = validateSourceAccess(claims);
  const workspace = realpathSync(root);
  for (const claim of validated) {
    let cursor = workspace;
    for (const segment of claim.path.split("/")) {
      cursor = path.join(cursor, segment);
      if (existsSync(cursor) && lstatSync(cursor).isSymbolicLink()) throw new Error(`Source claim follows symlink: ${claim.path}`);
      // lstat also sees dangling links, which existsSync intentionally does not.
      try {
        if (lstatSync(cursor).isSymbolicLink()) throw new Error(`Source claim follows symlink: ${claim.path}`);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }
    if (hostRoot && claim.access !== "read") {
      const host = realpathSync(hostRoot);
      if (cursor === host || cursor.startsWith(host + path.sep) || host.startsWith(cursor + path.sep))
        throw new Error("Source claim includes the builder checkout.");
    }
    if (claim.access === "create" && existsSync(cursor)) throw new Error(`Create claim already exists: ${claim.path}`);
    if (claim.access !== "create" && !existsSync(cursor)) throw new Error(`Source claim is missing: ${claim.path}`);
  }
  for (const claim of validated) if (existsSync(path.join(root, claim.path))) assertOrdinarySourceTree(root, claim.path);
  return {
    claims: validated,
    readOnly: snapshotTaskInputs(
      root,
      validated.filter((claim) => claim.access === "read").map((claim) => claim.path),
    ),
  };
}

export function verifySourceAccess(root: string, snapshot: SourceAccessSnapshot): string[] {
  const errors = verifyTaskInputs(root, snapshot.readOnly);
  for (const claim of snapshot.claims) {
    try {
      regularInputPath(root, claim.path);
      assertOrdinarySourceTree(root, claim.path);
    } catch (error) {
      errors.push(`Source claim became unsafe or missing: ${claim.path} (${error instanceof Error ? error.message : String(error)})`);
    }
  }
  return errors;
}

function assertOrdinarySourceTree(root: string, relative: string): void {
  let visited = 0;
  const visit = (entry: string, depth: number): void => {
    if (++visited > 100000 || depth > 64) throw new Error("Source tree exceeds inventory bounds.");
    const absolute = regularInputPath(root, entry);
    const stat = lstatSync(absolute);
    if (stat.isDirectory()) for (const name of readdirSync(absolute)) visit(path.posix.join(entry, name), depth + 1);
    else if (!stat.isFile()) throw new Error(`Source tree contains a non-regular entry: ${entry}`);
  };
  visit(relative, 0);
}

export interface WorkspaceChangeSnapshot {
  readonly entries: Readonly<Record<string, { kind: "file" | "directory" | "symlink" | "other"; signature: string }>>;
}

export function workspaceChangeEntry(absolute: string): WorkspaceChangeSnapshot["entries"][string] {
  const stat = lstatSync(absolute, { bigint: true });
  const kind = stat.isSymbolicLink() ? "symlink" : stat.isDirectory() ? "directory" : stat.isFile() ? "file" : "other";
  const signature = [
    stat.dev,
    stat.ino,
    stat.mode,
    ...(kind === "directory" ? [] : [stat.size, stat.mtimeNs, stat.ctimeNs]),
    kind === "symlink" ? readlinkSync(absolute) : "",
  ].join(":");
  return { kind, signature };
}

/** Detect persistent changes; this is a post-execution audit, not a filesystem sandbox. */
export function snapshotWorkspaceChanges(root: string): WorkspaceChangeSnapshot {
  const entries: Record<string, { kind: "file" | "directory" | "symlink" | "other"; signature: string }> = Object.create(null);
  let count = 0;
  const visit = (relative: string, depth: number): void => {
    if (++count > 100000 || depth > 64) throw new Error("Workspace change inventory exceeds 100000 entries or 64 levels.");
    const absolute = path.join(root, relative);
    const entry = workspaceChangeEntry(absolute);
    const { kind } = entry;
    entries[relative] = entry;
    if (kind === "directory") for (const name of readdirSync(absolute).sort()) visit(path.posix.join(relative, name), depth + 1);
  };
  for (const name of readdirSync(root).sort()) visit(name, 0);
  return { entries };
}

export function verifyWorkspaceChanges(
  root: string,
  before: WorkspaceChangeSnapshot,
  sourceAccess: readonly SourceAccess[],
  outputPaths: readonly string[],
  runtimeWrites?: () => WorkspaceChangeSnapshot,
): string[] {
  let trusted: WorkspaceChangeSnapshot | undefined;
  let after: WorkspaceChangeSnapshot;
  try {
    after = snapshotWorkspaceChanges(root);
    trusted = runtimeWrites?.();
  } catch (error) {
    return [`workspace change audit failed: ${error instanceof Error ? error.message : String(error)}`];
  }
  const claims = validateSourceAccess(sourceAccess);
  const allowed = [...claims.filter((claim) => claim.access !== "read").map((claim) => claim.path), ...outputPaths];
  const errors: string[] = [];
  for (const entry of new Set([...Object.keys(before.entries), ...Object.keys(after.entries)])) {
    if (before.entries[entry]?.signature === after.entries[entry]?.signature) continue;
    const trustedEntry = trusted?.entries[entry];
    if (trustedEntry?.kind === "file" && trustedEntry.signature === after.entries[entry]?.signature) continue;
    if (allowed.some((target) => entry === target || entry.startsWith(`${target}/`))) continue;
    if (!before.entries[entry] && after.entries[entry]?.kind === "directory" && allowed.some((target) => target.startsWith(`${entry}/`))) continue;
    errors.push(`workspace changed outside declared source/output scope: ${entry}`);
  }
  return errors;
}
