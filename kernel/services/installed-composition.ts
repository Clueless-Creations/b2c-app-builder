import { assertNoPendingInitialization } from "../session/initialization-guard.js";
import { resolveProviderImplementation } from "../composition/providers.js";
import { boundedFileBytes } from "../lib/bounded-file.js";
import { assertGateProviderBindings } from "../session/deterministic-gates.js";
import { assertNoPendingErasure } from "../reducer/erasure-guard.js";
import { existsSync, lstatSync, readdirSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { parseDocument } from "yaml";
import { loadRegistry, resolveRegisteredWorkspace } from "../../adapters/registry.js";
import { compositionSchema } from "../../contracts/public-api/contract.js";
import { composeCatalogFromPacks } from "../../catalog/index.js";
import { toRecipeCatalogInput } from "../../catalog/bridge.js";
import { rebaseSnapshotPacks } from "../../catalog/packs/snapshots.js";
import { readStoredSnapshot, snapshotPackage, type PackageDependency, type PackageSnapshot } from "../composition/resources.js";
import { resolveRecipeBindings } from "../composition/resolve.js";
import {
  applyCompositionActivation,
  assertCompositionActivationComplete,
  previewCompositionActivation,
  recoverCompositionActivation,
} from "../composition/activation.js";

export function resolveWorkspaceRegistration(id: string): string {
  const registry = loadRegistry();
  if (registry.workspaces.filter((entry) => entry.id === id).length !== 1) throw new Error("composition.workspace_unregistered_or_ambiguous");
  const result = resolveRegisteredWorkspace(id);
  if (!("path" in result)) throw new Error("composition.workspace_unavailable");
  assertNoPendingErasure(result.path);
  return result.path;
}
export function registeredWorkspace(id: string): string {
  const workspace = resolveWorkspaceRegistration(id);
  assertNoPendingInitialization(workspace);
  return workspace;
}
function location(root: string, relative: string): string {
  let current = root;
  for (const part of ["", ...relative.split("/")]) {
    current = path.join(current, part);
    if (existsSync(current) && lstatSync(current).isSymbolicLink()) throw new Error("composition.unsafe_path");
  }
  return current;
}
function boundedRead(root: string, relative: string): string {
  return boundedFileBytes(location(root, relative), 65536).toString("utf8");
}
function store(root: string): string {
  return location(root, ".b2c-launch/packages");
}
function summary(snapshot: PackageSnapshot) {
  return {
    id: snapshot.extension.id,
    version: snapshot.extension.version,
    digest: snapshot.digest,
    recipes: snapshot.extension.recipes.map(({ id, version }) => ({ id, version })),
    implementations: snapshot.extension.implementations.map(({ id, version }) => ({ id, version })),
  };
}
function packages(root: string, digests: readonly string[]): PackageDependency[] {
  const result = new Map<string, PackageDependency>();
  function visit(digest: string): void {
    if (result.has(digest)) return;
    if (!/^sha256:[a-f0-9]{64}$/.test(digest)) throw new Error("composition.invalid_package_digest");
    const directory = location(root, `.b2c-launch/packages/${digest.slice(7)}`);
    const snapshot = readStoredSnapshot(directory, digest);
    result.set(digest, { directory, snapshot });
    for (const dependency of snapshot.dependencies) visit(dependency.digest);
  }
  digests.forEach(visit);
  return [...result.values()];
}
export function installedPackages(input: { workspaceId: string }) {
  const root = registeredWorkspace(input.workspaceId);
  const directory = store(root);
  const digests = existsSync(directory)
    ? readdirSync(directory)
        .filter((entry) => /^[a-f0-9]{64}$/.test(entry))
        .sort()
        .map((entry) => `sha256:${entry}`)
    : [];
  return { packages: packages(root, digests).map((entry) => summary(entry.snapshot)) };
}
export function importInstalledPackage(input: { workspaceId: string; sourcePath: string; dependencyDigests: string[] }) {
  const root = registeredWorkspace(input.workspaceId);
  assertCompositionActivationComplete(root);
  const dependencies = packages(root, input.dependencyDigests);
  return summary(snapshotPackage(path.resolve(input.sourcePath), store(root), dependencies));
}
function plan(input: { workspaceId: string; packageDigests: string[] }) {
  return planWorkspaceComposition(registeredWorkspace(input.workspaceId), input.packageDigests);
}
export function planWorkspaceComposition(workspace: string, packageDigests: string[]) {
  assertCompositionActivationComplete(workspace);
  const runtime = JSON.parse(boundedRead(workspace, ".b2c-launch/runtime.json")) as Record<string, unknown>;
  if (runtime.schemaVersion !== "1.0.0" || runtime.skill !== "b2c-app-builder" || typeof runtime.skillRoot !== "string")
    throw new Error("composition.installed_runtime_required");
  const configFile = boundedRead(workspace, "b2c.yaml");
  if (Buffer.byteLength(configFile) > 65536) throw new Error("composition.configuration_too_large");
  const document = parseDocument(configFile, { uniqueKeys: true });
  if (document.errors.length) throw new Error("composition.configuration_invalid");
  const configuration = compositionSchema.parse(document.toJS({ maxAliasCount: 0 }));
  const closure = packages(workspace, packageDigests);
  const owners = closure.filter(({ snapshot }) =>
    snapshot.extension.recipes.some((recipe) => recipe.id === configuration.recipe.id && recipe.version === configuration.recipe.version),
  );
  if (owners.length !== 1) throw new Error("composition.recipe_missing_or_ambiguous");
  const owner = owners[0]!.snapshot.extension;
  const resolved = resolveRecipeBindings({
    packages: closure,
    recipe: { packageId: owner.id, packageVersion: owner.version, recipeId: configuration.recipe.id },
    target: configuration.target,
    overrides: Object.entries(configuration.bindings).map(([operation, binding]) => ({
      operation,
      implementation: resolveProviderImplementation(closure, { operation, provider: binding.provider, target: configuration.target }).implementation.id,
    })),
    hostSdkVersion: "1.0.0",
  });
  if (resolved.status !== "resolved") throw new Error("composition.binding_refused");
  if (typeof runtime.skillVersion !== "string") throw new Error("composition.installed_runtime_required");
  const composed = composeCatalogFromPacks(runtime.skillVersion, rebaseSnapshotPacks(workspace, closure));
  if (runtime.skillVersion !== composed.skillVersion) throw new Error("composition.installed_runtime_source_changed");
  const catalog = toRecipeCatalogInput(composed, resolved);
  for (const workflow of catalog.workflows) {
    if (workflow.gateCommands.includes("check:revenue") && !workflow.selectedOperation) throw new Error("composition.provider_validation_contract_required");
    assertGateProviderBindings(
      workflow.gateCommands,
      { gateArguments: workflow.gateArguments, selectedOperation: workflow.selectedOperation },
      runtime.skillRoot,
    );
  }
  return { workspace, preview: previewCompositionActivation({ workspace, catalog, runtime }) };
}
export function planInstalledComposition(input: { workspaceId: string; packageDigests: string[] }) {
  const { preview } = plan(input);
  const { files: _files, schemaVersion: _schemaVersion, workspaceRevision: _workspaceRevision, id, ...visible } = preview;
  return { ...visible, previewDigest: id, authorityGranted: false as const, providerExecution: "not_observed" as const };
}
export function activateInstalledComposition(input: { workspaceId: string; packageDigests: string[]; previewDigest: string }) {
  const { workspace, preview } = plan(input);
  if (preview.id !== input.previewDigest) throw new Error("composition.preview_stale");
  return applyCompositionActivation(workspace, preview, { ownerSessionId: `public-${randomUUID()}` });
}
export function recoverInstalledComposition(input: { workspaceId: string; mode: "resume" | "restore" }) {
  return recoverCompositionActivation(registeredWorkspace(input.workspaceId), input.mode, { ownerSessionId: `public-${randomUUID()}` });
}
