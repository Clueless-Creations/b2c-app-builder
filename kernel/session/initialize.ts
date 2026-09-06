import { randomUUID, createHash } from "node:crypto";
import { existsSync, lstatSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { atomicFile, durableUnlink } from "../lib/atomic-file.js";
import { boundedFileBytes } from "../lib/bounded-file.js";
import { acquireLock, releaseLock } from "../reducer/lock.js";
import { assertNoPendingErasure } from "../reducer/erasure-guard.js";
import { bootstrapWorkspace, initialBootstrapDocuments } from "./bootstrap.js";
import { resolveWorkspacePaths, loadControlFile } from "./run.js";
import { workspaceRevision } from "./workspace-revision.js";
import { loadWorkspaceCatalog } from "./catalog-contract.js";
import { skillRoot, runReducer } from "./reducer-cli.js";
import { readFirstpartyPackage } from "../../catalog/packs/installed-firstparty.js";
import { snapshotPackage } from "../composition/resources.js";
import { applyCompositionActivation, recoverCompositionActivation } from "../composition/activation.js";
import { planWorkspaceComposition } from "../services/installed-composition.js";
import { INITIALIZATION_JOURNAL, withInitializationReads } from "./initialization-guard.js";
import { buildInstalledRuntimeManifest } from "../../adapters/install-entrypoints.js";
import { composeCatalog } from "../../catalog/index.js";
import { toCatalogInput } from "../../catalog/bridge.js";
const DEFAULT_RECIPE = "b2c/complete-consumer-business";
const configuration = `apiVersion: b2c/v1\nrecipe: {id: ${DEFAULT_RECIPE}, version: 1.0.0}\ntarget: {platform: host, runtime: agent-cli}\nbindings: {}\n`;
const schema = z.strictObject({
  schemaVersion: z.literal(1),
  id: z.string(),
  expectedRevision: z.string(),
  productDigest: z.string(),
  packageDigest: z.string(),
  now: z.string(),
  stage: z.enum(["bootstrap", "bootstrapped", "configured", "activating", "activated"]),
  initial: z.record(z.string(), z.string()),
  activationId: z.string().optional(),
});
export type InitializationBoundary = "intent" | "bootstrap" | "package" | "configuration" | "activation-intent" | "activation" | "complete";
function file(workspace: string, relative: string): string {
  let current = workspace;
  for (const segment of relative.split("/")) {
    current = path.join(current, segment);
    if (existsSync(current) && lstatSync(current).isSymbolicLink()) throw new Error("business.unsafe_workspace_file");
  }
  return current;
}
function bytes(workspace: string, relative: string): string | null {
  const location = file(workspace, relative);
  return existsSync(location) ? boundedFileBytes(location, 32 * 1024 * 1024).toString("utf8") : null;
}
const digest = (value: string) => `sha256:${createHash("sha256").update(value).digest("hex")}`;
function productDigest(workspace: string) {
  return digest(JSON.stringify([bytes(workspace, "product.yaml"), bytes(workspace, "PRODUCT.md"), bytes(workspace, "DESIGN.md")]));
}
export function initializeWorkspace(
  workspace: string,
  options: { expectedRevision?: string; now?: string; afterWrite?: (boundary: InitializationBoundary) => void } = {},
) {
  if (!lstatSync(workspace).isDirectory() || lstatSync(workspace).isSymbolicLink()) throw new Error("business.unsafe_workspace_file");
  return withInitializationReads(workspace, () => {
    assertNoPendingErasure(workspace);
    const paths = resolveWorkspacePaths(workspace),
      journalPath = file(workspace, INITIALIZATION_JOURNAL),
      owner = `initialize-${randomUUID()}`;
    file(workspace, "control/session.lock");
    const locked = acquireLock(paths.sessionLock, { ownerSessionId: owner, retries: 0, ttlSeconds: 300 });
    if (!locked.ok) throw new Error("business.session_lock_unavailable");
    try {
      const source = readFirstpartyPackage(skillRoot());
      let journal = existsSync(journalPath) ? schema.parse(JSON.parse(boundedFileBytes(journalPath, 32 * 1024 * 1024).toString("utf8"))) : undefined;
      const initialRevision = !journal ? workspaceRevision(workspace) : undefined;
      if (!journal && options.expectedRevision && initialRevision !== options.expectedRevision) throw new Error("business.stale_revision");
      if (!journal && (existsSync(paths.catalog) || existsSync(file(workspace, ".b2c-launch/runtime.json")))) {
        const catalog = loadWorkspaceCatalog(workspace),
          runtime = JSON.parse(bytes(workspace, ".b2c-launch/runtime.json") ?? "null");
        if (
          !catalog.ok ||
          !runtime?.composition ||
          !loadControlFile(paths.control) ||
          !existsSync(paths.state) ||
          !existsSync(paths.manifest) ||
          runReducer(["preflight", "--manifest", paths.manifest]).code !== 0
        )
          throw new Error("business.initialization_incomplete");
        if (!Array.isArray(runtime.composition.packageDigests) || runtime.composition.packageDigests.some((value: unknown) => typeof value !== "string"))
          throw new Error("business.initialization_incomplete");
        const current = planWorkspaceComposition(workspace, runtime.composition.packageDigests).preview;
        if (bytes(workspace, "catalog.json") !== current.files.catalog.after || bytes(workspace, ".b2c-launch/runtime.json") !== current.files.runtime.after)
          throw new Error("business.initialization_incomplete");
        return { status: "already_initialized" as const, revision: workspaceRevision(workspace), authorityGranted: false as const };
      }
      if (!journal) {
        if (bytes(workspace, "b2c.yaml") !== null || existsSync(paths.state) || existsSync(paths.control))
          throw new Error("business.initialization_incomplete");
        if (
          !source.snapshot.extension.recipes.some((recipe) => recipe.id === DEFAULT_RECIPE && recipe.version === "1.0.0" && recipe.maturity === "implemented")
        )
          throw new Error("business.default_recipe_unavailable");
        const now = options.now ?? new Date().toISOString(),
          prepared = initialBootstrapDocuments(workspace, now);
        journal = {
          schemaVersion: 1,
          id: randomUUID(),
          expectedRevision: options.expectedRevision ?? initialRevision!,
          productDigest: productDigest(workspace),
          packageDigest: source.snapshot.digest,
          now,
          stage: "bootstrap",
          initial: {
            "catalog.json": JSON.stringify(toCatalogInput(composeCatalog(skillRoot())), null, 2) + "\n",
            ".b2c-launch/runtime.json": JSON.stringify(buildInstalledRuntimeManifest(skillRoot()), null, 2) + "\n",
            "state/business-state.json": JSON.stringify(prepared.state, null, 2) + "\n",
            "control/control.json": JSON.stringify(prepared.control, null, 2) + "\n",
          },
        };
        atomicFile(journalPath, JSON.stringify(journal));
        options.afterWrite?.("intent");
      }
      if (
        journal.packageDigest !== source.snapshot.digest ||
        journal.productDigest !== productDigest(workspace) ||
        (options.expectedRevision && options.expectedRevision !== journal.expectedRevision)
      )
        throw new Error("business.initialization_inputs_changed");
      const expected = initialBootstrapDocuments(workspace, journal.now);
      const expectedInitial = {
        "catalog.json": JSON.stringify(toCatalogInput(composeCatalog(skillRoot())), null, 2) + "\n",
        ".b2c-launch/runtime.json": JSON.stringify(buildInstalledRuntimeManifest(skillRoot()), null, 2) + "\n",
        "state/business-state.json": JSON.stringify(expected.state, null, 2) + "\n",
        "control/control.json": JSON.stringify(expected.control, null, 2) + "\n",
      };
      if (JSON.stringify(journal.initial) !== JSON.stringify(expectedInitial)) throw new Error("business.initialization_journal_changed");
      for (const relative of ["state/business-state.json", "control/control.json"]) {
        const current = bytes(workspace, relative);
        if (current !== null && current !== journal.initial[relative]) throw new Error("business.initialization_state_changed");
      }
      if (
        journal.stage !== "bootstrap" &&
        (!existsSync(paths.state) ||
          !existsSync(paths.control) ||
          !existsSync(paths.manifest) ||
          runReducer(["preflight", "--manifest", paths.manifest]).code !== 0)
      )
        throw new Error("business.initialization_state_changed");
      const save = (stage: typeof journal.stage) => {
        journal!.stage = stage;
        atomicFile(journalPath, JSON.stringify(journal));
      };
      if (journal.stage === "bootstrap") {
        for (const [relative, expected] of Object.entries(journal.initial)) {
          const current = bytes(workspace, relative);
          if (current !== null && current !== expected) throw new Error("business.initialization_bootstrap_changed");
        }
        // The installer writes the catalog after managed entrypoints. Finish only this exact interrupted pin pair.
        if (bytes(workspace, "catalog.json") !== null && bytes(workspace, ".b2c-launch/runtime.json") === null)
          atomicFile(file(workspace, ".b2c-launch/runtime.json"), journal.initial[".b2c-launch/runtime.json"]!);
        const result = bootstrapWorkspace(workspace, { apply: true, now: journal.now });
        if (result.code !== 0)
          throw new Error(`business.initialization_bootstrap_refused: ${JSON.stringify(result.reports.filter((entry) => entry.action === "fail"))}`);
        save("bootstrapped");
        options.afterWrite?.("bootstrap");
      }
      if (journal.stage === "bootstrapped") {
        const imported = snapshotPackage(source.directory, file(workspace, ".b2c-launch/packages"));
        if (imported.digest !== journal.packageDigest) throw new Error("business.initialization_package_changed");
        options.afterWrite?.("package");
        const current = bytes(workspace, "b2c.yaml");
        if (current !== null && current !== configuration) throw new Error("business.initialization_configuration_changed");
        atomicFile(file(workspace, "b2c.yaml"), configuration);
        save("configured");
        options.afterWrite?.("configuration");
      }
      if (bytes(workspace, "b2c.yaml") !== configuration) throw new Error("business.initialization_configuration_changed");
      const lease = { ownerSessionId: owner, heldSessionLease: owner };
      if (journal.stage === "configured") {
        const { preview } = planWorkspaceComposition(workspace, [journal.packageDigest]);
        journal.activationId = preview.id;
        save("activating");
        options.afterWrite?.("activation-intent");
        applyCompositionActivation(workspace, preview, lease);
        save("activated");
        options.afterWrite?.("activation");
      } else if (journal.stage === "activating") {
        if (existsSync(file(workspace, ".b2c-launch/composition-activation.json"))) recoverCompositionActivation(workspace, "resume", lease);
        else {
          const { preview } = planWorkspaceComposition(workspace, [journal.packageDigest]);
          const runtime = JSON.parse(bytes(workspace, ".b2c-launch/runtime.json") ?? "null");
          if (runtime?.composition?.planId !== preview.planId) {
            if (preview.id !== journal.activationId) throw new Error("business.initialization_activation_changed");
            applyCompositionActivation(workspace, preview, lease);
          }
        }
        save("activated");
        options.afterWrite?.("activation");
      }
      const final = planWorkspaceComposition(workspace, [journal.packageDigest]).preview;
      if (
        bytes(workspace, "catalog.json") !== final.files.catalog.after ||
        bytes(workspace, ".b2c-launch/runtime.json") !== final.files.runtime.after ||
        !existsSync(paths.state) ||
        !existsSync(paths.control) ||
        runReducer(["preflight", "--manifest", paths.manifest]).code !== 0
      )
        throw new Error("business.initialization_incomplete");
      durableUnlink(journalPath);
      options.afterWrite?.("complete");
      return { status: "initialized" as const, revision: workspaceRevision(workspace), authorityGranted: false as const };
    } finally {
      releaseLock(paths.sessionLock, owner);
    }
  });
}
