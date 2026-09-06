#!/usr/bin/env node
/**
 * install-control-permissions.ts — layer 3 of the autonomy trust boundary described in
 * surfaces/workspace-template/repo-agent-entrypoints/AGENTS.md's "Autonomy Trust Boundary" section: OS
 * write-protection of `control/` from the agent's uid, the one layer of the three that actually
 * PREVENTS a Bash-capable scheduled session from self-granting rather than merely detecting it
 * (layer 1, the tool allowlist in adapters/profile.ts) or refusing it after the fact (layer
 * 2, the founder-authority gate in kernel/reducer/cli.ts).
 *
 * THE MECHANISM (all of it): clear the group and other write bits — `chmod go-w`, recursively —
 * on `control/` and every entry currently inside it, never touching the owner's own bits. Read and
 * execute (traversal/listing) stay intact for group/other, matching the workspace AGENTS.md's own
 * description of the agent's OS account needing "read-only access to control/". That is the exact
 * mode math this script applies: `nextMode = currentMode & ~0o022` for every directory and file
 * under `control/`, applied bottom-up.
 *
 * WHY CHMOD ALONE ISN'T THE WHOLE STORY: clearing group/other write only protects against a uid
 * that ISN'T the owner. The uid that owns `control/` can always chmod it back to writable — chmod
 * permission itself is governed by ownership, not by the current mode bits. So this script cannot,
 * by itself, know whether it just built a real boundary or a merely advisory one: that depends on
 * whether the scheduled session actually runs as a different, unprivileged OS account, which is a
 * founder OS-admin decision outside this script's authority (see NEVER below). Determining which
 * one actually resulted is deliberately NOT this file's job at install time — see
 * `verifyControlBoundary` below, which answers that empirically, and honestly, at verify/session
 * time instead of trusting what this installer merely intended.
 *
 * KNOWN LIMITATION (read before relying on this for a live grant above the lowest level):
 * `control/` currently holds BOTH the founder-only autonomy document (control.json: kill switch +
 * grants + waivers) AND the operational bookkeeping files a scheduled session legitimately writes
 * every run through the reducer (budget-ledger.json, manifest.json, audit.jsonl) plus the session
 * lock it writes directly (session.lock — kernel/reducer/lock.ts). A directory-level chmod cannot
 * separate "founder-only" from "session-writable" within one directory: the reducer's atomic
 * writes (write-tmp-then-rename, kernel/reducer/cli.ts's writeFileAtomic) need write permission on
 * the DIRECTORY, not just the target file, and so does session.lock's own acquire/heartbeat/
 * release. So a workspace where this boundary is genuinely `enforced` (a real, different
 * --agent-user session uid) will ALSO lose the scheduled session's own ability to record budget
 * spend or hold its session lock — the runtime does not yet split `control/` into a founder-only
 * document and a session-writable bookkeeping location. Naming this rather than silently working
 * around it; resolving it is a file-layout change outside this script's scope.
 *
 * NEVER: runs sudo; creates, deletes, or modifies a user account; chowns anything (this script
 * never calls chown at all — the mechanism above needs none). If applying the plan would need
 * privileges this process doesn't have, it prints the exact command the founder must run
 * themselves and exits non-zero in --apply mode, rather than attempting any workaround.
 *
 * Usage (mirrors install-entrypoints.ts / install-schedule.ts: default is a dry run):
 *   tsx adapters/install-control-permissions.ts --workspace <dir> [--agent-user <name>] [--apply]
 */
import { chmodSync, existsSync, readdirSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { expandHome, flagBoolean, flagString, parseFlags } from "../tooling/lib/launch-state.js";
import { isMainModule } from "../kernel/lib/cli.js";
import { loadWorkspaceCatalog, renderCatalogRefusal } from "../kernel/session/catalog-contract.js";

/** Clears the group+other write bits only; owner bits and every read/execute bit pass through untouched. */
const CLEAR_GROUP_OTHER_WRITE = ~0o022;

export function controlDirFor(workspaceDir: string): string {
  return path.join(workspaceDir, "control");
}

function octalMode(mode: number): string {
  return `0${(mode & 0o777).toString(8).padStart(3, "0")}`;
}

// --- plan: what would change, computed without touching disk (dry-run and --apply share this) --

export interface ControlPermissionEntry {
  readonly absolutePath: string;
  /** Relative to control/ itself; "." names control/ itself. */
  readonly relativePath: string;
  readonly isDirectory: boolean;
  readonly currentMode: number;
  readonly targetMode: number;
  readonly changes: boolean;
}

/** Recursively lists control/ (itself first, then every entry inside, parent before children) with the go-w-cleared target mode for each. Pure and read-only — no fixture ever needs a real chmod to exercise this. */
export function planControlPermissions(controlDir: string): ControlPermissionEntry[] {
  const entries: ControlPermissionEntry[] = [];
  const visit = (absolutePath: string): void => {
    const stats = statSync(absolutePath);
    const currentMode = stats.mode & 0o777;
    const targetMode = currentMode & CLEAR_GROUP_OTHER_WRITE;
    entries.push({
      absolutePath,
      relativePath: path.relative(controlDir, absolutePath) || ".",
      isDirectory: stats.isDirectory(),
      currentMode,
      targetMode,
      changes: currentMode !== targetMode,
    });
    if (stats.isDirectory()) {
      for (const name of readdirSync(absolutePath)) visit(path.join(absolutePath, name));
    }
  };
  visit(controlDir);
  return entries;
}

// --- agent-account existence probe (injectable so no fixture ever depends on a real OS account) -

export type UserExists = (name: string) => "yes" | "no" | "unknown";

/** Real probe via `id -u <name>` (no sudo, no account mutation) — the production default; fixtures inject a fake. "unknown" only when `id` itself can't be run, never guessed as yes/no. */
export const defaultUserExists: UserExists = (name) => {
  const result = spawnSync("id", ["-u", name], { encoding: "utf8" });
  if (result.error) return "unknown";
  return result.status === 0 ? "yes" : "no";
};

function describeSeparation(agentUser: string | undefined, ownUsername: string | undefined, userExists: UserExists): string {
  if (!agentUser || (ownUsername && agentUser === ownUsername)) {
    return "ADVISORY ONLY: no separate --agent-user was given (or it's the same account running this installer), so a scheduled session would run as the SAME account that owns control/ — that account can always chmod its own permissions back. This narrows exposure to other accounts on this machine, not to your own scheduled session. Create a separate, unprivileged OS account for scheduled runs and re-run with --agent-user <name> for a real boundary.";
  }
  const existence = userExists(agentUser);
  if (existence === "no") {
    return `NOTE: no OS account named "${agentUser}" was found on this system yet. The permissions above are applied and ready, but until that account exists AND your scheduler runs scheduled sessions as it, this stays advisory only — confirm with verifyControlBoundary() (or a session's own digest) once it does.`;
  }
  if (existence === "unknown") {
    return `NOTE: could not confirm whether OS account "${agentUser}" exists (the "id" command is unavailable here). If a scheduled session actually runs as that account, this is now a real boundary — confirm with verifyControlBoundary() from inside a real session run rather than trusting this message alone.`;
  }
  return `If a scheduled session actually runs as "${agentUser}" (confirm your cron/launchd job is configured that way), this is now a real, OS-enforced boundary against that account. Confirm with verifyControlBoundary() from inside a real session run rather than trusting this message alone.`;
}

// --- CLI ----------------------------------------------------------------------------------------

function fail(message: string): never {
  console.error(`install-control-permissions: ${message}`);
  process.exit(1);
}

function runMain(): void {
  const argv = process.argv.slice(2);
  const flags = parseFlags(argv, [
    { flags: ["--workspace", "--target"], key: "workspace" },
    { flags: ["--agent-user"], key: "agentUser", kind: "string" },
    { flags: ["--apply"], key: "apply", kind: "boolean" },
  ]);
  const workspace = flagString(flags, "workspace") ? path.resolve(expandHome(flagString(flags, "workspace")!)) : undefined;
  if (!workspace) fail("--workspace <business-workspace-dir> is required.");
  const compatible = loadWorkspaceCatalog(workspace);
  if (!compatible.ok) fail(renderCatalogRefusal(compatible.refusal));
  const controlDir = controlDirFor(workspace);
  if (!existsSync(controlDir)) fail(`${controlDir} does not exist yet. Run onboarding first so control/ is created, then install its permissions.`);

  const agentUser = flagString(flags, "agentUser");
  const apply = flagBoolean(flags, "apply");
  const remedyCommand = `sudo chmod -R go-w ${JSON.stringify(controlDir)}`;

  const stats = statSync(controlDir);
  const ownerUid = stats.uid;
  const processUid = typeof process.getuid === "function" ? process.getuid() : undefined;

  if (processUid !== undefined && processUid !== ownerUid) {
    console.log(
      `install-control-permissions: this process (uid ${processUid}) does not own ${controlDir} (owned by uid ${ownerUid}), so it cannot chmod it — this script never runs sudo or chowns on your behalf.`,
    );
    console.log(`  Run this yourself: ${remedyCommand}`);
    if (apply) process.exit(1);
    return; // dry-run: informative only, never a non-zero exit
  }

  const plan = planControlPermissions(controlDir);
  const changing = plan.filter((entry) => entry.changes);
  const ownUsername = (() => {
    try {
      return os.userInfo().username;
    } catch {
      return undefined;
    }
  })();
  const separationNote = describeSeparation(agentUser, ownUsername, defaultUserExists);

  if (!apply) {
    console.log(
      `install-control-permissions: DRY RUN — would clear group/other write on ${plan.length} entr${plan.length === 1 ? "y" : "ies"} under ${controlDir} (${changing.length} would actually change):`,
    );
    for (const entry of plan) {
      const label = entry.relativePath === "." ? "(control/ itself)" : entry.relativePath;
      console.log(`  ${label}: ${octalMode(entry.currentMode)} -> ${octalMode(entry.targetMode)}${entry.changes ? "" : " (already clear)"}`);
    }
    console.log(`  ${separationNote}`);
    return;
  }

  const failures: string[] = [];
  for (const entry of changing) {
    try {
      chmodSync(entry.absolutePath, entry.targetMode);
    } catch (error) {
      failures.push(`${entry.relativePath}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (failures.length > 0) {
    console.log(`install-control-permissions: could not apply the full plan (${failures.length} failure(s)):`);
    for (const failure of failures) console.log(`  ${failure}`);
    console.log(`  Run this yourself: ${remedyCommand}`);
    process.exit(1);
  }
  console.log(`install-control-permissions: cleared group/other write on ${changing.length} entr${changing.length === 1 ? "y" : "ies"} under ${controlDir}.`);
  console.log(`  ${separationNote}`);
}

if (isMainModule(import.meta.url)) {
  runMain();
}

// --- the honest verifier -------------------------------------------------------------------------

export type ControlBoundaryState = "enforced" | "advisory_only" | "unprotected";

/**
 * A typed verdict, never a boolean, because "is control/ protected?" does not have a yes/no
 * answer that is both simple and honest. `state` is the one field anything downstream (the session
 * digest, a founder-facing status line) may act on; every other field is evidence for a human
 * reading `reasons`, not a second source of truth to re-derive a verdict from.
 */
export interface ControlBoundaryVerdict {
  readonly state: ControlBoundaryState;
  /** True only when this process's uid is a real, non-owning uid relative to control/'s owner — the only situation in which "enforced" is even reachable. */
  readonly agentUidDiffers: boolean;
  readonly controlMode: string;
  readonly ownerUid: number;
  readonly processUid: number;
  readonly reasons: string[];
}

export interface VerifyControlBoundaryOptions {
  /** Overrides the probe file's name prefix only (collision-avoidance for parallel test runs). Never a way to inject a fake uid, mode, or write result — see the doc comment below on why that would defeat the entire point of this function. */
  readonly probeFilePrefix?: string;
}

function attemptEmpiricalWrite(controlDir: string, prefix: string): { canWrite: boolean; error?: string } {
  const probePath = path.join(controlDir, `${prefix}-${process.pid}-${randomBytes(4).toString("hex")}`);
  try {
    // "wx": create-and-write, fail if it already exists. Exercises exactly the directory-write
    // permission a real out-of-band tamper attempt (or the reducer's own rename-based atomic
    // write) would need — not merely opening an existing, possibly more-permissive file.
    writeFileSync(probePath, "control-boundary-probe", { flag: "wx" });
  } catch (error) {
    return { canWrite: false, error: error instanceof Error ? error.message : String(error) };
  }
  try {
    unlinkSync(probePath);
  } catch {
    /* best-effort cleanup: the write already proved canWrite; a failed unlink doesn't change that */
  }
  return { canWrite: true };
}

/**
 * THE HONEST VERIFIER (deliberately the one function this whole module exists to get right). Its
 * entire job is to never claim a boundary stronger than what actually holds right now, for THIS
 * process. Two rules enforce that:
 *
 * 1. "enforced" requires an EMPIRICAL failure — this function actually attempts to create a probe
 *    file inside control/ and watches it fail — from a process whose uid does not own control/.
 *    Mode bits are read and reported (see `reasons`/`controlMode`) but are never, by themselves,
 *    sufficient to call a boundary "enforced": a restrictive mode on paper proves nothing about
 *    what this process can actually do.
 * 2. A process that OWNS control/ can always `chmod` it back to writable — chmod permission is
 *    governed by ownership, not by the file's current mode bits — so a same-uid process is NEVER
 *    reported as "enforced", no matter how restrictive control/'s mode looks, and no matter what
 *    the empirical probe happens to return (an owner's write attempt will almost always succeed
 *    regardless of mode, since this script never clears the owner's own bits). That case is
 *    "advisory_only" when the mode shows an attempt was made (group/other write cleared), or
 *    "unprotected" when it wasn't.
 */
export function verifyControlBoundary(workspaceDir: string, opts: VerifyControlBoundaryOptions = {}): ControlBoundaryVerdict {
  const controlDir = controlDirFor(workspaceDir);
  const processUid = typeof process.getuid === "function" ? process.getuid() : -1;
  const reasons: string[] = [];

  if (!existsSync(controlDir)) {
    return {
      state: "unprotected",
      agentUidDiffers: false,
      controlMode: "n/a",
      ownerUid: -1,
      processUid,
      reasons: [`${controlDir} does not exist yet — there is nothing to protect, so no boundary can be claimed.`],
    };
  }
  if (processUid < 0) {
    reasons.push(
      "this platform has no POSIX uid model (process.getuid is unavailable), so a filesystem-permission boundary cannot be verified — never claim 'enforced' without one.",
    );
  }

  const stats = statSync(controlDir);
  const ownerUid = stats.uid;
  const controlMode = octalMode(stats.mode);
  const agentUidDiffers = processUid >= 0 && processUid !== ownerUid;
  const modeClearsGroupOtherWrite = (stats.mode & 0o022) === 0;

  const probe = attemptEmpiricalWrite(controlDir, opts.probeFilePrefix ?? ".control-boundary-probe");
  reasons.push(
    probe.canWrite
      ? "empirical probe: this process could write a new file inside control/ just now."
      : `empirical probe: this process could NOT write a new file inside control/ just now (${probe.error}).`,
  );

  if (!agentUidDiffers) {
    // Same uid as the owner: chmod could always be reverted by this very process, so "enforced" is
    // categorically unreachable here regardless of what the probe above returned.
    if (modeClearsGroupOtherWrite) {
      reasons.push(
        `control/ (mode ${controlMode}) is owned by this same process's uid (${processUid}); even with group/other write cleared, this process can chmod it right back to writable — that is not a real boundary against itself.`,
      );
      return { state: "advisory_only", agentUidDiffers, controlMode, ownerUid, processUid, reasons };
    }
    reasons.push(`control/'s mode (${controlMode}) does not restrict group/other write at all, and this process owns it anyway.`);
    return { state: "unprotected", agentUidDiffers, controlMode, ownerUid, processUid, reasons };
  }

  // A genuinely different, non-owning uid: the empirical probe result is the only thing that matters.
  if (!probe.canWrite) {
    reasons.push(
      `this process's uid (${processUid}) differs from control/'s owner (${ownerUid}) and genuinely could not write inside control/ — an OS-enforced boundary, not merely mode bits asserted on paper.`,
    );
    return { state: "enforced", agentUidDiffers, controlMode, ownerUid, processUid, reasons };
  }
  reasons.push(
    `this process's uid (${processUid}) differs from control/'s owner (${ownerUid}), but it could still write inside control/ — mode ${controlMode} is not actually keeping it out.`,
  );
  return { state: "unprotected", agentUidDiffers, controlMode, ownerUid, processUid, reasons };
}
