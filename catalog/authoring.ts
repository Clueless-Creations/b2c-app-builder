import { readFileSync } from "node:fs";
import path from "node:path";
import { summarizeProviderContract } from "../adapters/providers/contract.js";
import { loadProviderContracts } from "../adapters/providers/load.js";
import { areas } from "./areas.js";
import { buildArtifacts } from "./artifacts.js";
import { contextPacks } from "./context-packs.js";
import { domains } from "./domains.js";
import { discoverGates } from "./gates.js";
import { lanes } from "./lanes.js";
import { withComposition, catalogCounts } from "./packs/compose.js";
import { phases } from "./phases.js";
import { loadKnowledgePackages, resolveKnowledgeGraph } from "./knowledge-packages.js";
import { roles } from "./roles.js";
import type { Catalog } from "./types.js";
import { workflows } from "./workflows/index.js";
import { profiles } from "./profiles.js";
import { repositoryProfiles } from "./repository-profiles/registry.js";

export function readSkillVersion(skillRoot: string): string {
  const parsed = JSON.parse(readFileSync(path.join(skillRoot, "skill-version.json"), "utf8")) as { version?: string };
  return parsed.version ?? "0.0.0";
}

export function composeAuthoredCatalog(skillRoot: string): Catalog {
  const knowledge = resolveKnowledgeGraph(loadKnowledgePackages(skillRoot), workflows, contextPacks);
  const catalog: Catalog = {
    schemaVersion: "2.0.0",
    skillVersion: readSkillVersion(skillRoot),
    areas: [...areas],
    domains: [...domains].sort((a, b) => a.order - b.order),
    phases: [...phases].sort((a, b) => a.order - b.order),
    lanes: [...lanes],
    roles: [...roles],
    contextPacks: knowledge.contextPacks,
    references: knowledge.references,
    workflows: knowledge.workflows,
    artifacts: buildArtifacts(knowledge.workflows),
    gates: discoverGates(skillRoot, domains),
    profiles: [...profiles],
    repositoryProfiles: [...repositoryProfiles],
    providerContracts: loadProviderContracts(skillRoot).contracts.map(summarizeProviderContract),
  };
  const counts = catalogCounts(catalog);
  return withComposition(catalog, [], counts, {});
}
