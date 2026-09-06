/**
 * runtime-sync-lib.ts — pure planning core for the installed-runtime sync.
 *
 * The CLI (tooling/runtime-sync.ts) gathers three inputs — the git-tracked
 * source file hashes, the installed runtime's file hashes, and the ownership
 * manifest the previous sync wrote — and this module turns them into a plan.
 * Keeping the plan computation pure (no filesystem access) lets the validator
 * fixture suite exercise every ownership rule against synthetic trees.
 *
 * Ownership model (the install-manifest pattern):
 * - The manifest records exactly what the previous sync wrote, by hash.
 * - A runtime file matching its manifest hash is ours; source changes copy over it.
 * - A runtime file differing from BOTH its manifest hash and the source is a
 *   conflict: someone edited the installed runtime directly. Sync must stop and
 *   surface it instead of silently clobbering the edit — the "runtime drifted
 *   ahead of the repo" failure this tool exists to end.
 * - A manifest-owned file the source no longer ships is an orphan: deleted,
 *   unless it was also hand-edited (then it is a conflict too).
 * - A runtime file neither in the source nor in the manifest is unowned: never
 *   touched, reported so drift stays visible.
 * - With no manifest at all (first run), every differing runtime file is a
 *   bootstrap conflict — ownership cannot be proven, so the caller must adopt
 *   the source explicitly.
 */

export interface SyncManifest {
  schemaVersion: 1;
  sourceVersion: string;
  syncedAt: string;
  /** Relative posix path -> sha256 of the bytes the sync wrote. */
  files: Record<string, string>;
}

export interface SyncPlanInput {
  /** Relative posix path -> sha256 for every git-tracked source file. */
  sourceFiles: Record<string, string>;
  /** Relative posix path -> sha256 for every runtime file (ignored paths already filtered). */
  runtimeFiles: Record<string, string>;
  /** Relative posix paths of runtime symlinks (files or directories). Never followed. */
  runtimeSymlinks?: string[];
  /** The manifest written by the previous sync, when one exists. */
  manifest: SyncManifest | undefined;
}

export interface SyncPlan {
  /** Source files to write into the runtime (new, changed, or recovering an owned edit under force). */
  copies: string[];
  /** Manifest-owned files the source no longer ships; safe to delete. */
  deletes: string[];
  /** Runtime files with edits the manifest cannot account for; sync must not proceed without force. */
  conflicts: string[];
  /**
   * Source paths that sit at or under a runtime symlink. Writing them would
   * follow the link into a tree outside the runtime, so they block the sync
   * entirely — no flag overrides this; remove the symlink instead.
   */
  symlinkBlocked: string[];
  /** Runtime files neither the source nor the manifest knows; never touched. */
  unowned: string[];
  /** Files already identical in source and runtime. */
  unchanged: string[];
  /** True when no manifest exists, so differing files cannot prove ownership. */
  bootstrap: boolean;
}

/** Paths (relative, posix) the sync never reads, writes, or reports. */
export const IGNORED_RUNTIME_PATTERNS: readonly RegExp[] = [
  /^node_modules\//u,
  /\/node_modules\//u,
  /^dist\//u,
  /^\.runtime-sync-manifest\.json$/u,
  /(^|\/)\.DS_Store$/u,
  /\.log$/u,
  /^behavioral-results\//u,
  /^evals\/behavioral-results\//u,
  /^\.venv\//u,
];

export function isIgnoredRuntimePath(relPath: string): boolean {
  return IGNORED_RUNTIME_PATTERNS.some((pattern) => pattern.test(relPath));
}

export function computeSyncPlan(input: SyncPlanInput): SyncPlan {
  const { sourceFiles, runtimeFiles, manifest } = input;
  const bootstrap = manifest === undefined;
  const owned = manifest?.files ?? {};
  const plan: SyncPlan = { copies: [], deletes: [], conflicts: [], symlinkBlocked: [], unowned: [], unchanged: [], bootstrap };
  const symlinks = input.runtimeSymlinks ?? [];
  const underSymlink = (relPath: string): boolean => symlinks.some((link) => relPath === link || relPath.startsWith(`${link}/`));

  for (const [relPath, sourceHash] of Object.entries(sourceFiles)) {
    if (underSymlink(relPath)) {
      // A copy here would write THROUGH the runtime symlink into whatever tree
      // it points at — the exact external-clobber the ownership model forbids.
      plan.symlinkBlocked.push(relPath);
      continue;
    }
    const runtimeHash = runtimeFiles[relPath];
    if (runtimeHash === undefined) {
      plan.copies.push(relPath);
      continue;
    }
    if (runtimeHash === sourceHash) {
      plan.unchanged.push(relPath);
      continue;
    }
    const ownedHash = owned[relPath];
    if (ownedHash !== undefined && ownedHash === runtimeHash) {
      // The runtime still holds exactly what the last sync wrote; the source moved on.
      plan.copies.push(relPath);
    } else {
      // Bootstrap, or the runtime was edited after the last sync: ownership unproven.
      plan.conflicts.push(relPath);
    }
  }

  for (const [relPath, runtimeHash] of Object.entries(runtimeFiles)) {
    if (sourceFiles[relPath] !== undefined) continue;
    const ownedHash = owned[relPath];
    if (ownedHash === undefined) {
      plan.unowned.push(relPath);
    } else if (ownedHash === runtimeHash) {
      plan.deletes.push(relPath);
    } else {
      // We owned it, the source dropped it, AND someone edited it since: surface, never delete.
      plan.conflicts.push(relPath);
    }
  }

  for (const key of ["copies", "deletes", "conflicts", "symlinkBlocked", "unowned", "unchanged"] as const) {
    plan[key].sort((a, b) => a.localeCompare(b));
  }
  return plan;
}

/** The manifest a completed sync should persist: every source file at its source hash. */
export function nextManifest(sourceFiles: Record<string, string>, sourceVersion: string, syncedAt: string): SyncManifest {
  return { schemaVersion: 1, sourceVersion, syncedAt, files: { ...sourceFiles } };
}

/** True when the runtime matches the source exactly (nothing to copy or delete, no conflicts or symlink blocks). */
export function planIsClean(plan: SyncPlan): boolean {
  return plan.copies.length === 0 && plan.deletes.length === 0 && plan.conflicts.length === 0 && plan.symlinkBlocked.length === 0;
}
