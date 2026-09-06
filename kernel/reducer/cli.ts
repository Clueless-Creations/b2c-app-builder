#!/usr/bin/env node
import { assertReadableWorkspaceFile } from "./erasure-guard.js";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { isMainModule, parseArgs } from "../lib/cli.js";
import { findProvisioningProvider } from "../../adapters/provisioning/requirements.js";
import { checkOperatingModelMutation } from "../operating-model/validate.js";
import { appendAuditEntry, verifyAuditChain } from "./audit.js";
import { acquireLock, releaseLock, type AcquireResult } from "./lock.js";
import {
  applyPatch,
  checkDeclaredOutputs,
  checkPreconditions,
  PatchRejected,
  sha256Hex,
  validatePatchShape,
  validateTargetDocument,
  type PatchIssue,
  type PatchTargetDoc,
  type StatePatch,
} from "./patch.js";
import { emptyCurrentTruth, loadCurrentTruthFile, reconcileCurrentTruth, type ReconcileReceipt } from "./current-truth.js";

/**
 * The single-writer reducer CLI (KTD7, R14). Every mutation to a business/control/grants/
 * waivers/budget-ledger document flows through `commit`. Current-truth writes flow through
 * `reconcile`. Each command validates input, applies the change transactionally
 * (write temp-then-rename — a rejection at any stage leaves the file on disk untouched),
 * records the resulting content hash into a manifest, and appends a hash-chained audit entry.
 * `preflight` re-derives the same hashes and compares them to the manifest so an out-of-band
 * edit between commits is caught before the next one lands.
 *
 * Exit codes: 0 = committed/ok; 1 = patch rejected (validation); 2 = lock contention
 * ("did not run"); 3 = tamper detected (out-of-band edit or a broken audit chain).
 */

const SCHEMA_VERSION_BY_TARGET: Record<PatchTargetDoc, string> = {
  "business-state": "2.0.0",
  control: "1.0.0",
  grants: "1.0.0",
  waivers: "1.0.0",
  "budget-ledger": "1.0.0",
  "current-truth": "1.0.0",
};

interface ManifestEntry {
  readonly targetDoc: PatchTargetDoc;
  readonly file: string;
  readonly stateHash: string;
  readonly updatedAt: string;
  readonly lastPatchId: string;
}

interface ReducerManifest {
  schemaVersion: "1.0.0";
  entries: Record<string, ManifestEntry>;
}

function readPatchInput(patchArg: string | undefined): string {
  if (!patchArg || patchArg === "-") return readFileSync(0, "utf8");
  return readFileSync(patchArg, "utf8");
}

function writeFileAtomic(filePath: string, contents: string): void {
  mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp-${process.pid}-${Math.random().toString(36).slice(2)}`;
  writeFileSync(tmp, contents, "utf8");
  renameSync(tmp, filePath);
}

function loadManifest(manifestPath: string): ReducerManifest {
  if (!existsSync(manifestPath)) return { schemaVersion: "1.0.0", entries: {} };
  return JSON.parse(readFileSync(manifestPath, "utf8")) as ReducerManifest;
}

function saveManifest(manifestPath: string, manifest: ReducerManifest): void {
  writeFileAtomic(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

function printIssues(issues: readonly PatchIssue[]): void {
  for (const issue of issues) console.log(`ISSUE ${issue.code}: ${issue.message}${issue.path ? ` (${issue.path})` : ""}`);
}

function requireArgs(args: Record<string, string>, names: readonly string[]): string | undefined {
  const missing = names.filter((name) => !args[name]);
  if (missing.length === 0) return undefined;
  return `reducer.missing_argument: --${missing.join(", --")} ${missing.length === 1 ? "is" : "are"} required`;
}

function accessRouteCrossCheckIssues(candidate: Record<string, unknown>): PatchIssue[] {
  const issues: PatchIssue[] = [];
  const providers = candidate.providers;
  if (typeof providers !== "object" || providers === null || Array.isArray(providers)) return issues;
  for (const [toolName, entry] of Object.entries(providers as Record<string, unknown>)) {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) continue;
    const accessRoute = (entry as Record<string, unknown>).accessRoute;
    if (typeof accessRoute !== "string" || accessRoute === "not_selected") continue;
    // Keys stay v1 snake_case tool names; manifest ids are provider.<kebab>. Tools with no
    // manifest entry (cloudflare, remotion, the deliberately-undeclared local tooling) skip
    // the cross-check — there is no declaration to check against.
    const provider = findProvisioningProvider(`provider.${toolName.replace(/_/g, "-")}`);
    if (provider && !(provider.accessRoutes as readonly string[]).includes(accessRoute)) {
      issues.push({
        code: "reducer.access_route_undeclared",
        message: `providers.${toolName} selects access route "${accessRoute}", but ${provider.providerId} declares only ${provider.accessRoutes.join(", ")}`,
        path: `providers.${toolName}.accessRoute`,
      });
    }
  }
  return issues;
}

function runCommit(args: Record<string, string>): number {
  const missing = requireArgs(args, ["file", "manifest", "audit"]);
  if (missing) {
    console.log(`ISSUE ${missing}`);
    console.log("RESULT: rejected");
    return 1;
  }
  const filePath = path.resolve(args.file!);
  const manifestPath = path.resolve(args.manifest!);
  const auditPath = path.resolve(args.audit!);

  let patch: StatePatch;
  try {
    patch = JSON.parse(readPatchInput(args.patch)) as StatePatch;
  } catch (error) {
    console.log(`ISSUE patch.invalid_shape: patch input is not valid JSON (${error instanceof Error ? error.message : String(error)})`);
    console.log("RESULT: rejected");
    return 1;
  }

  const shapeIssues = validatePatchShape(patch);
  if (shapeIssues.length > 0) {
    printIssues(shapeIssues);
    console.log("RESULT: rejected");
    return 1;
  }

  // Founder-authority gate for autonomy-defining documents. A patch to control/grants/waivers
  // changes what the autonomous session is allowed to do, so it must not originate from the
  // session's own autonomous work — only from a founder-initiated flow (onboarding, the approve
  // CLI) that passes --founder-authority. This is a bug-defense and honesty layer, NOT a defense
  // against a jailbroken Bash-capable agent that could pass the flag itself: the actual prevention
  // is OS write-protection of the control/ directory from the session's uid (see the workspace
  // AGENTS.md "Autonomy trust boundary" section). The session runner never passes this flag and
  // never targets these documents, so a stray control write from autonomous work fails loudly here.
  const AUTONOMY_DOCS: readonly PatchTargetDoc[] = ["control", "grants", "waivers"];
  if (AUTONOMY_DOCS.includes(patch.targetDoc) && args["founder-authority"] !== "true") {
    console.log(
      `ISSUE reducer.founder_authority_required: a patch to "${patch.targetDoc}" changes autonomy grants and requires --founder-authority (founder-initiated flow only)`,
    );
    console.log("RESULT: rejected");
    return 1;
  }

  const session = args.session ?? patch.authoredBy;
  const lockPath = args.lock ?? `${filePath}.lock`;
  const acquireResult: AcquireResult = acquireLock(lockPath, {
    ownerSessionId: session,
    // Aligned with kernel/session/run.ts's own --lock-ttl-seconds flag name for the same concept
    // (lock TTL in seconds) — the two used to disagree (--lock-ttl vs --lock-ttl-seconds), so a
    // value meant for this lock could never actually reach it under the old name.
    ttlSeconds: Number(args["lock-ttl-seconds"] ?? 30),
    retries: Number(args["lock-retries"] ?? 3),
    retryDelayMs: Number(args["lock-retry-delay-ms"] ?? 25),
    breakStale: args["break-stale-verified"] === "true",
  });
  if (!acquireResult.ok) {
    const code = acquireResult.reason === "held" ? "reducer.lock_held" : "reducer.lock_stale_requires_break";
    console.log(
      `ISSUE ${code}: lock at ${lockPath} is held by session "${acquireResult.holder.ownerSessionId}" (heartbeat ${acquireResult.holder.heartbeatAt || "<none>"})`,
    );
    console.log("RESULT: did not run");
    return 2;
  }

  try {
    const manifest = loadManifest(manifestPath);
    const existingEntry = manifest.entries[filePath];
    const fileExists = existsSync(filePath);

    if (existingEntry) {
      if (!fileExists) {
        console.log(`ISSUE reducer.out_of_band_edit: ${filePath} is tracked in the manifest but is missing on disk`);
        console.log("RESULT: tamper_detected");
        return 3;
      }
      const currentHash = sha256Hex(readFileSync(filePath, "utf8"));
      if (currentHash !== existingEntry.stateHash) {
        console.log(
          `ISSUE reducer.out_of_band_edit: ${filePath} changed outside the reducer since the last commit (expected ${existingEntry.stateHash}, found ${currentHash})`,
        );
        console.log("RESULT: tamper_detected");
        return 3;
      }
    } else if (fileExists) {
      console.log(`ISSUE reducer.out_of_band_edit: ${filePath} exists on disk but is not tracked in the manifest; commit a baseline through the reducer first`);
      console.log("RESULT: tamper_detected");
      return 3;
    }

    const before: unknown = fileExists ? JSON.parse(readFileSync(filePath, "utf8")) : {};

    const preconditionIssues = checkPreconditions(before, patch);
    if (preconditionIssues.length > 0) {
      printIssues(preconditionIssues);
      console.log("RESULT: rejected");
      return 1;
    }

    let candidate: Record<string, unknown>;
    try {
      candidate = applyPatch(before, patch);
    } catch (error) {
      if (error instanceof PatchRejected) {
        printIssues(error.issues);
        console.log("RESULT: rejected");
        return 1;
      }
      throw error;
    }

    const now = args.now ?? new Date().toISOString();
    candidate.schemaVersion = SCHEMA_VERSION_BY_TARGET[patch.targetDoc];
    candidate.updatedAt = now;

    const declaredOutputIssues = checkDeclaredOutputs(before, candidate, patch);
    if (declaredOutputIssues.length > 0) {
      printIssues(declaredOutputIssues);
      console.log("RESULT: rejected");
      return 1; // nothing written: the file on disk is untouched (transactional apply)
    }

    const schemaIssues = validateTargetDocument(patch.targetDoc, candidate);
    if (schemaIssues.length > 0) {
      printIssues(schemaIssues);
      console.log("RESULT: rejected");
      return 1; // nothing written: the file on disk is untouched (transactional apply)
    }

    // Cross-document check the JSON schema cannot express: a chosen provider access route must
    // be one the provider's provisioning-manifest entry declares. Runs after the schema step so
    // it can assume shape. validateTargetDocument stays strictly single-document — the manifest
    // is static data shipped with the runtime, not a second mutable document.
    if (patch.targetDoc === "business-state") {
      const routeIssues = accessRouteCrossCheckIssues(candidate);
      if (routeIssues.length > 0) {
        printIssues(routeIssues);
        console.log("RESULT: rejected");
        return 1; // nothing written: the file on disk is untouched (transactional apply)
      }
      const mutationIssues = checkOperatingModelMutation(before, candidate);
      if (mutationIssues.length > 0) {
        printIssues(mutationIssues);
        console.log("RESULT: rejected");
        return 1;
      }
    }

    const bytes = `${JSON.stringify(candidate, null, 2)}\n`;
    const newHash = sha256Hex(bytes);
    writeFileAtomic(filePath, bytes);

    manifest.entries[filePath] = { targetDoc: patch.targetDoc, file: filePath, stateHash: newHash, updatedAt: now, lastPatchId: patch.patchId };
    saveManifest(manifestPath, manifest);

    const auditEntry = appendAuditEntry(
      auditPath,
      { sessionId: session, targetDoc: patch.targetDoc, patchId: patch.patchId, action: "commit", summary: patch.reason, stateHash: newHash },
      now,
    );

    console.log(`COMMITTED ${patch.targetDoc} ${filePath} stateHash=${newHash} auditSeq=${auditEntry.seq}`);
    console.log("RESULT: committed");
    return 0;
  } finally {
    releaseLock(lockPath, session);
  }
}

function runPreflight(args: Record<string, string>): number {
  const missing = requireArgs(args, ["manifest"]);
  if (missing) {
    console.log(`ISSUE ${missing}`);
    console.log("RESULT: rejected");
    return 1;
  }
  const manifestPath = path.resolve(args.manifest!);
  const manifest = loadManifest(manifestPath);
  const problems: string[] = [];
  for (const entry of Object.values(manifest.entries)) {
    if (!existsSync(entry.file)) {
      problems.push(`ISSUE reducer.out_of_band_edit: ${entry.file} (${entry.targetDoc}) is tracked but missing on disk`);
      continue;
    }
    const currentHash = sha256Hex(readFileSync(entry.file, "utf8"));
    if (currentHash !== entry.stateHash) {
      problems.push(
        `ISSUE reducer.out_of_band_edit: ${entry.file} (${entry.targetDoc}) changed outside the reducer (expected ${entry.stateHash}, found ${currentHash})`,
      );
    }
  }
  if (problems.length > 0) {
    for (const problem of problems) console.log(problem);
    console.log("RESULT: preflight_failed");
    return 3;
  }
  console.log(`PREFLIGHT OK: ${Object.keys(manifest.entries).length} tracked document(s) match the manifest`);
  console.log("RESULT: preflight_ok");
  return 0;
}

function runVerifyAudit(args: Record<string, string>): number {
  const missing = requireArgs(args, ["audit"]);
  if (missing) {
    console.log(`ISSUE ${missing}`);
    console.log("RESULT: rejected");
    return 1;
  }
  const auditPath = path.resolve(args.audit!);
  const verification = verifyAuditChain(auditPath);
  if (!verification.valid) {
    console.log(`ISSUE reducer.audit_chain_broken: ${verification.reason}`);
    console.log("RESULT: audit_chain_broken");
    return 3;
  }
  console.log(`AUDIT CHAIN OK: ${verification.entriesChecked} entries verified from genesis`);
  console.log("RESULT: audit_chain_ok");
  return 0;
}

/**
 * Adopt a pre-existing document as the reducer's baseline — the migration bootstrap path.
 * The v1 migrator writes documents directly (there is no prior manifest to patch against),
 * so adoption records the current content hash as a disclosed baseline plus an audit entry.
 * Bootstrap-only: adopting over an already-tracked document is rejected, never silent.
 */
function runAdopt(args: Record<string, string>): number {
  const missing = requireArgs(args, ["file", "target-doc", "manifest", "audit", "session"]);
  if (missing) {
    console.log(`ISSUE ${missing}`);
    console.log("RESULT: rejected");
    return 1;
  }
  const targetDoc = args["target-doc"] as PatchTargetDoc;
  if (!(targetDoc in SCHEMA_VERSION_BY_TARGET)) {
    console.log(`ISSUE reducer.unknown_target_doc: "${targetDoc}" is not a reducer-owned document`);
    console.log("RESULT: rejected");
    return 1;
  }
  const filePath = path.resolve(args.file!);
  if (!existsSync(filePath)) {
    console.log(`ISSUE reducer.adopt_missing_file: ${filePath} does not exist`);
    console.log("RESULT: rejected");
    return 1;
  }
  const contents = readFileSync(filePath, "utf8");
  const issues = validateTargetDocument(targetDoc, JSON.parse(contents));
  if (issues.length > 0) {
    printIssues(issues);
    console.log("RESULT: rejected");
    return 1;
  }
  const manifestPath = path.resolve(args.manifest!);
  const manifest = loadManifest(manifestPath);
  if (manifest.entries[filePath]) {
    console.log(`ISSUE reducer.adopt_already_tracked: ${filePath} already has a manifest baseline; adoption is bootstrap-only`);
    console.log("RESULT: rejected");
    return 1;
  }
  const stateHash = sha256Hex(contents);
  const now = new Date().toISOString();
  appendAuditEntry(path.resolve(args.audit!), {
    sessionId: args.session!,
    targetDoc,
    patchId: `adopt:${args.session!}:${targetDoc}`,
    action: "adopt",
    summary: "adopted pre-existing document as reducer baseline (migration bootstrap)",
    stateHash,
    issueCodes: [],
  });
  manifest.entries[filePath] = { targetDoc, file: filePath, stateHash, updatedAt: now, lastPatchId: `adopt:${args.session!}:${targetDoc}` };
  saveManifest(manifestPath, manifest);
  console.log(`ADOPTED ${targetDoc} (${stateHash.slice(0, 12)})`);
  console.log("RESULT: adopted");
  return 0;
}

function runReconcile(args: Record<string, string>): number {
  const missing = requireArgs(args, ["file", "manifest", "audit", "receipt", "session"]);
  if (missing) {
    console.log(`ISSUE ${missing}`);
    console.log("RESULT: rejected");
    return 1;
  }
  const filePath = path.resolve(args.file!);
  const manifestPath = path.resolve(args.manifest!);
  const auditPath = path.resolve(args.audit!);
  const receiptPath = path.resolve(args.receipt!);
  const session = args.session!;
  const now = args.now ?? new Date().toISOString();
  const lockPath = args.lock ?? `${filePath}.lock`;

  let receipt: ReconcileReceipt;
  try {
    receipt = JSON.parse(readFileSync(receiptPath, "utf8")) as ReconcileReceipt;
  } catch (error) {
    console.log(`ISSUE current_truth.invalid_receipt: receipt is not valid JSON (${error instanceof Error ? error.message : String(error)})`);
    console.log("RESULT: rejected");
    return 1;
  }

  const acquireResult: AcquireResult = acquireLock(lockPath, {
    ownerSessionId: session,
    ttlSeconds: Number(args["lock-ttl-seconds"] ?? 30),
    retries: Number(args["lock-retries"] ?? 3),
    retryDelayMs: Number(args["lock-retry-delay-ms"] ?? 25),
    breakStale: args["break-stale-verified"] === "true",
  });
  if (!acquireResult.ok) {
    const code = acquireResult.reason === "held" ? "reducer.lock_held" : "reducer.lock_stale_requires_break";
    console.log(
      `ISSUE ${code}: lock at ${lockPath} is held by session "${acquireResult.holder.ownerSessionId}" (heartbeat ${acquireResult.holder.heartbeatAt || "<none>"})`,
    );
    console.log("RESULT: did not run");
    return 2;
  }

  try {
    const manifest = loadManifest(manifestPath);
    const existingEntry = manifest.entries[filePath];
    const fileExists = existsSync(filePath);

    if (existingEntry) {
      if (!fileExists) {
        console.log(`ISSUE reducer.out_of_band_edit: ${filePath} is tracked in the manifest but is missing on disk`);
        console.log("RESULT: tamper_detected");
        return 3;
      }
      const currentHash = sha256Hex(readFileSync(filePath, "utf8"));
      if (currentHash !== existingEntry.stateHash) {
        console.log(
          `ISSUE reducer.out_of_band_edit: ${filePath} changed outside the reducer since the last commit (expected ${existingEntry.stateHash}, found ${currentHash})`,
        );
        console.log("RESULT: tamper_detected");
        return 3;
      }
    } else if (fileExists) {
      console.log(`ISSUE reducer.out_of_band_edit: ${filePath} exists on disk but is not tracked in the manifest; commit a baseline through the reducer first`);
      console.log("RESULT: tamper_detected");
      return 3;
    }

    const loaded = fileExists ? loadCurrentTruthFile(filePath) : { document: emptyCurrentTruth(now), issues: [] };
    if (loaded.issues.length > 0) {
      for (const item of loaded.issues) console.log(`ISSUE ${item.code}: ${item.message}${item.path ? ` (${item.path})` : ""}`);
      console.log("RESULT: rejected");
      return 1;
    }

    const result = reconcileCurrentTruth(loaded.document ?? emptyCurrentTruth(now), receipt, now);
    switch (result.kind) {
      case "rejected":
        for (const item of result.issues) console.log(`ISSUE ${item.code}: ${item.message}${item.path ? ` (${item.path})` : ""}`);
        console.log("RESULT: rejected");
        return 1;
      case "committed": {
        if (result.noop) {
          console.log("RESULT: noop");
          return 0;
        }
        const bytes = `${JSON.stringify(result.document, null, 2)}\n`;
        const newHash = sha256Hex(bytes);
        writeFileAtomic(filePath, bytes);
        manifest.entries[filePath] = {
          targetDoc: "current-truth",
          file: filePath,
          stateHash: newHash,
          updatedAt: now,
          lastPatchId: `reconcile:${receipt.receiptId}`,
        };
        saveManifest(manifestPath, manifest);
        const auditEntry = appendAuditEntry(
          auditPath,
          {
            sessionId: session,
            targetDoc: "current-truth",
            patchId: `reconcile:${receipt.receiptId}`,
            action: "reconcile",
            summary: `reconciled current truth from receipt ${receipt.receiptId}`,
            stateHash: newHash,
          },
          now,
        );
        console.log(`COMMITTED current-truth ${filePath} stateHash=${newHash} auditSeq=${auditEntry.seq}`);
        console.log("RESULT: committed");
        return 0;
      }
      default: {
        const exhaustive: never = result;
        throw new Error(`Unhandled reconcile result ${String(exhaustive)}`);
      }
    }
  } finally {
    releaseLock(lockPath, session);
  }
}

function main(): number {
  const [command, ...rest] = process.argv.slice(2);
  const args = parseArgs(rest);
  const execute = (): number => {
    switch (command) {
      case "commit":
        return runCommit(args);
      case "preflight":
        return runPreflight(args);
      case "verify-audit":
        return runVerifyAudit(args);
      case "adopt":
        return runAdopt(args);
      case "reconcile":
        return runReconcile(args);
      default:
        console.error(`Unknown reducer command "${command ?? ""}". Expected one of: commit, preflight, verify-audit, adopt, reconcile.`);
        return 1;
    }
  };
  if (!args.manifest) return execute();
  const manifestPath = path.resolve(args.manifest);
  const lock = `${manifestPath}.lock`;
  const owner = `reducer-manifest:${process.pid}`;
  const acquired = acquireLock(lock, { ownerSessionId: owner, retries: 3, ttlSeconds: 300 });
  if (!acquired.ok) {
    console.log("ISSUE reducer.manifest_busy: another reducer transition owns this workspace");
    return 2;
  }
  try {
    assertReadableWorkspaceFile(manifestPath);
    return execute();
  } catch (error) {
    console.log(`ISSUE reducer.transition_refused: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  } finally {
    releaseLock(lock, owner);
  }
}

if (isMainModule(import.meta.url)) {
  process.exitCode = main();
}
