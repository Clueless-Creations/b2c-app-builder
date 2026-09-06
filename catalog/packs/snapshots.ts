import path from "node:path";
import { createHash } from "node:crypto";
import { readPackageResourceFile, verifySnapshot, type PackageDependency } from "../../kernel/composition/resources.js";
import { resourcePathSchema } from "../../contracts/extensions/contract.js";
import { parsePackYaml } from "./load.js";
import type { PackManifest } from "./types.js";

/** Load the existing authored pack schema from immutable extension resources. No second workflow vocabulary. */
export function loadSnapshotPacks(packages: readonly PackageDependency[], context?: { prefix: string; origin: "skill" | "workspace" }): PackManifest[] {
  const packs: PackManifest[] = [];
  const seen = new Set<string>();
  for (const owner of packages) {
    verifySnapshot(owner.directory, owner.snapshot);
    const extension = owner.snapshot.extension;
    const localBytes = new Map<string, Buffer>();
    const readLocal = (id: string): Buffer => {
      const declaration = extension.resources.find((entry) => entry.id === id);
      if (!declaration) throw new Error(`pack_snapshot.resource_not_local:${id}`);
      const cached = localBytes.get(id);
      if (cached) return cached;
      const bytes = readPackageResourceFile(owner.directory, declaration.path);
      if (createHash("sha256").update(bytes).digest("hex") !== owner.snapshot.files[declaration.path]) throw new Error(`pack_snapshot.resource_changed:${id}`);
      localBytes.set(id, bytes);
      return bytes;
    };
    for (const id of extension.catalogPacks ?? []) {
      const declaration = extension.resources.find((entry) => entry.id === id && entry.kind === "catalog-pack");
      if (!declaration) throw new Error(`pack_snapshot.catalog_resource_not_local:${id}`);
      const pack = parsePackYaml(readLocal(id).toString("utf8"), `${extension.id}:${id}`);
      if (seen.has(pack.id)) throw new Error(`pack_snapshot.duplicate_pack:${pack.id}`);
      seen.add(pack.id);
      const requirePinnedPath = (relative: string, kinds: string[]) => {
        resourcePathSchema.parse(relative);
        const resource = extension.resources.find((entry) => entry.path === relative && kinds.includes(entry.kind));
        if (!resource) throw new Error(`pack_snapshot.unpinned_resource:${relative}`);
        readLocal(resource.id);
      };
      for (const reference of pack.references) {
        requirePinnedPath(reference.path, ["knowledge"]);
        reference.resource = {
          path: context ? `${context.prefix}/${reference.path}` : reference.path,
          sha256: `sha256:${owner.snapshot.files[reference.path]}`,
          origin: context?.origin ?? "workspace",
        };
      }
      for (const role of pack.roles ?? [])
        for (const prompt of [role.promptPath, ...role.parentPromptPaths]) {
          resourcePathSchema.parse(prompt);
          if (role.contextOrigin !== "workspace") {
            requirePinnedPath(prompt, ["knowledge", "prompt"]);
            role.promptResources ??= {};
            role.promptResources[prompt] = `sha256:${owner.snapshot.files[prompt]}`;
          }
        }
      for (const gate of pack.gates ?? []) {
        if (!gate.scriptPath && !gate.commandManifestPath) throw new Error(`pack_snapshot.gate_source_missing:${gate.id}`);
        if (gate.scriptPath) requirePinnedPath(gate.scriptPath, ["gate"]);
        if (gate.commandManifestPath) {
          requirePinnedPath(gate.commandManifestPath, ["gate"]);
          const declaration = extension.resources.find((entry) => entry.path === gate.commandManifestPath)!;
          const manifest = JSON.parse(readLocal(declaration.id).toString("utf8"));
          if (typeof manifest.scripts?.[gate.command] !== "string" || !manifest.scripts[gate.command].trim())
            throw new Error(`pack_snapshot.host_command_missing:${gate.id}`);
        }
      }
      const localRoles = new Set((pack.roles ?? []).map((role) => role.id));
      const localReferences = new Set(pack.references.map((reference) => reference.id));
      for (const workflow of pack.workflows) {
        if (!localRoles.has(workflow.roleId)) throw new Error(`pack_snapshot.role_not_declared:${workflow.roleId}`);
        if (workflow.referenceIds.some((id) => !localReferences.has(id))) throw new Error(`pack_snapshot.reference_not_declared:${workflow.id}`);
      }
      packs.push(pack);
    }
  }
  return packs;
}

/** Context references point at workspace-local immutable package snapshots; no mutable copies. */
export function rebaseSnapshotPacks(workspaceRoot: string, packages: readonly PackageDependency[]): PackManifest[] {
  const result: PackManifest[] = [];
  const seen = new Set<string>();
  for (const owner of packages) {
    const prefix = `.b2c-launch/packages/${owner.snapshot.digest.slice(7)}`;
    if (path.resolve(owner.directory) !== path.resolve(workspaceRoot, prefix)) throw new Error("pack_snapshot.workspace_local_store_required");
    const packs = loadSnapshotPacks([owner]);
    const rebase = (relative: string) => `${prefix}/${resourcePathSchema.parse(relative)}`;
    for (const pack of packs) {
      if (seen.has(pack.id)) throw new Error(`pack_snapshot.duplicate_pack:${pack.id}`);
      seen.add(pack.id);
      result.push({
        ...pack,
        references: pack.references.map((reference) => ({
          ...reference,
          resource: { ...reference.resource!, path: rebase(reference.path), origin: "workspace" },
        })),
        roles: pack.roles?.map((role) =>
          role.contextOrigin === "workspace"
            ? role
            : {
                ...role,
                promptPath: rebase(role.promptPath),
                parentPromptPaths: role.parentPromptPaths.map(rebase),
                promptResources: Object.fromEntries(Object.entries(role.promptResources ?? {}).map(([relative, digest]) => [rebase(relative), digest])),
              },
        ),
        gates: pack.gates?.map((gate) => ({
          ...gate,
          scriptPath: gate.scriptPath ? rebase(gate.scriptPath) : undefined,
          ...(gate.commandManifestPath ? { commandManifestPath: rebase(gate.commandManifestPath) } : {}),
        })),
      });
    }
  }
  return result;
}
