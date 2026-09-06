import { firstpartyNotices } from "./firstparty-notices.js";
import { firstpartyAssetClosure } from "./firstparty-assets.js";
import { createHash } from "node:crypto";
import {
  firstpartyProviders,
  firstpartyCapabilities,
  firstpartyImplementations,
  firstpartyRecipes,
  firstpartySchemas,
  firstpartyWorkerSchemas,
  firstpartyWorkerDeclarations,
} from "../firstparty-declarations.js";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { stringify } from "yaml";
import { composeAuthoredCatalog } from "../authoring.js";
import type { Catalog } from "../types.js";
import type { PackManifest } from "./types.js";
import { inspectPackage } from "../../kernel/composition/resources.js";
import type { Extension, Resource } from "../../contracts/extensions/contract.js";
import { parsePackYaml } from "./load.js";

import { FIRSTPARTY_DIRECTORY as firstpartyDirectory } from "./installed-firstparty.js";
export { FIRSTPARTY_DIRECTORY as firstpartyDirectory } from "./installed-firstparty.js";
/** Authoring projection only. Runtime never calls this module. */
export function authoredFirstpartyPack(catalog: Catalog): PackManifest {
  return {
    id: "business-pack.consumer-business",
    title: "Consumer business",
    kind: "business-pack",
    version: catalog.skillVersion,
    revision: catalog.skillVersion,
    dependsOn: [],
    createsProviderSpend: false,
    domains: catalog.domains,
    areas: catalog.areas,
    workflows: catalog.workflows,
    references: catalog.references,
    roles: catalog.roles,
    gates: catalog.gates,
    contextPacks: catalog.contextPacks,
    phases: catalog.phases,
    lanes: catalog.lanes,
    profiles: catalog.profiles,
    repositoryProfiles: catalog.repositoryProfiles ?? [],
    providerContracts: catalog.providerContracts ?? [],
    capabilities: [],
    extensions: [],
  };
}
export function packYaml(pack: PackManifest): string {
  const snake = (value: unknown): unknown =>
    Array.isArray(value)
      ? value.map(snake)
      : value && typeof value === "object"
        ? Object.fromEntries(
            Object.entries(value)
              .filter(([, v]) => v !== undefined)
              .map(([key, v]) => [key.replace(/[A-Z]/g, (char) => `_${char.toLowerCase()}`), snake(v)]),
          )
        : value;
  return stringify(snake(pack), { lineWidth: 0 });
}
/** Emit the exact same verified extension format accepted for imported packages. */
export function renderFirstpartyPackage(skillRoot: string): Record<string, Buffer> {
  const authored = composeAuthoredCatalog(skillRoot);
  const pack = authoredFirstpartyPack(authored);
  const packBytes = Buffer.from(packYaml(pack));
  parsePackYaml(packBytes.toString("utf8"), "firstparty authoring projection");
  const files: Record<string, Buffer> = { "catalog-pack.yaml": packBytes };
  const resources: Resource[] = [{ id: "b2c/catalog", path: "catalog-pack.yaml", kind: "catalog-pack", mediaType: "application/yaml" }];
  const add = (relative: string, kind: Resource["kind"]) => {
    const existing = resources.find((row) => row.path === relative);
    if (existing) {
      if (existing.kind !== kind) throw Error(`firstparty.resource_kind_conflict:${relative}`);
      return;
    }
    resources.push({
      id: `b2c/resource-${createHash("sha256").update(relative).digest("hex")}`,
      path: relative,
      kind,
      mediaType: relative.endsWith(".md") ? "text/markdown" : "text/plain",
    });
    files[relative] = readFileSync(path.join(skillRoot, relative));
  };
  for (const reference of pack.references) add(reference.path, "knowledge");
  for (const role of pack.roles ?? [])
    if (role.contextOrigin !== "workspace") for (const prompt of [role.promptPath, ...role.parentPromptPaths]) add(prompt, "prompt");
  for (const gate of pack.gates ?? []) {
    if (gate.scriptPath) add(gate.scriptPath, "gate");
    if (gate.commandManifestPath) add(gate.commandManifestPath, "gate");
  }
  for (const relative of firstpartyAssetClosure(
    skillRoot,
    resources.filter((resource) => resource.kind === "knowledge" || resource.kind === "prompt").map((resource) => resource.path),
  )) {
    if (!resources.some((resource) => resource.path === relative)) add(relative, "asset");
  }
  for (const schema of [...firstpartySchemas, ...firstpartyWorkerSchemas]) {
    resources.push({ id: schema.id, path: schema.path, kind: "schema", mediaType: "application/schema+json" });
    files[schema.path] = Buffer.from(JSON.stringify(schema.schema, null, 2) + "\n");
  }
  const knowledge = new Map(
    resources
      .filter((resource) => resource.kind === "knowledge")
      .map((resource) => [resource.path, { id: resource.id, sha256: `sha256:${createHash("sha256").update(files[resource.path]!).digest("hex")}` }]),
  );
  const worker = firstpartyWorkerDeclarations(authored, knowledge);
  const thirdParty = firstpartyNotices(skillRoot, pack.references, resources);
  resources.push(...thirdParty.resources);
  Object.assign(files, thirdParty.files);
  const extension: Extension = {
    apiVersion: "b2c.extension/v1",
    hostApiVersion: "b2c/v1",
    id: "b2c/consumer-business",
    version: pack.version,
    title: pack.title,
    dependencies: [],
    imports: [],
    resources,
    ...(thirdParty.notices.length ? { thirdParty: thirdParty.notices } : {}),
    catalogPacks: ["b2c/catalog"],
    providers: [...firstpartyProviders, ...worker.providers],
    capabilities: [...firstpartyCapabilities, ...worker.capabilities],
    implementations: [...firstpartyImplementations, ...worker.implementations],
    recipes: [...firstpartyRecipes, ...worker.recipes],
  };
  files["extension.yaml"] = Buffer.from(stringify(extension, { lineWidth: 0, aliasDuplicateObjects: false }));
  const temp = mkdtempSync(path.join(tmpdir(), "b2c-firstparty-"));
  try {
    for (const [relative, bytes] of Object.entries(files)) {
      const target = path.join(temp, relative);
      mkdirSync(path.dirname(target), { recursive: true });
      writeFileSync(target, bytes);
    }
    const snapshot = inspectPackage(temp);
    files["snapshot.json"] = Buffer.from(JSON.stringify(snapshot, null, 2) + "\n");
    return {
      ...Object.fromEntries(Object.entries(files).map(([relative, bytes]) => [`${firstpartyDirectory}/${relative}`, bytes])),
      "catalog/generated/firstparty-pin.json": Buffer.from(JSON.stringify({ digest: snapshot.digest, version: snapshot.extension.version }, null, 2) + "\n"),
    };
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}
