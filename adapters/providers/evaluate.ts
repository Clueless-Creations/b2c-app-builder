import path from "node:path";
import { latestEntryForSource, unmigratedBreakingEntries, UNSNAPPED_HASH } from "./capability-delta.js";
import { REQUIRED_PROVIDER_CONTRACT_IDS, requiredKindPresent, type ProviderContractKind } from "./contract.js";
import { loadCapabilityDelta, loadProviderContracts, loadRegistrySourceIds, loadSnapshotHashes, type LoadIssue } from "./load.js";

export interface ProviderContractEvaluation {
  readonly errors: string[];
}

const REQUIRED_KINDS: readonly ProviderContractKind[] = ["billing", "agent_runtime", "store_cli"];

export function evaluateProviderContracts(skillRoot: string, registryPath: string): ProviderContractEvaluation {
  const errors: string[] = [];
  const loaded = loadProviderContracts(skillRoot);
  for (const issue of loaded.issues) errors.push(`${issue.path}: ${issue.message}`);
  const ids = new Set<string>();
  for (const contract of loaded.contracts) {
    if (ids.has(contract.id)) errors.push(`Duplicate provider contract id ${contract.id}.`);
    ids.add(contract.id);
  }
  for (const requiredId of REQUIRED_PROVIDER_CONTRACT_IDS) {
    if (!ids.has(requiredId)) errors.push(`Missing required provider contract ${requiredId}.`);
  }
  for (const kind of REQUIRED_KINDS) {
    if (!requiredKindPresent(loaded.contracts, kind)) errors.push(`Missing provider contract kind ${kind}.`);
  }
  const registry = loadRegistrySourceIds(registryPath);
  if (registry.issue) errors.push(registry.issue);
  for (const contract of loaded.contracts) {
    for (const sourceId of contract.sourceIds) {
      if (!registry.ids.has(sourceId)) {
        errors.push(`${contract.id} source_ids entry ${sourceId} is not in the source registry.`);
      }
    }
  }
  return { errors };
}

export function evaluateCapabilityDelta(input: { skillRoot: string; snapshotPath: string; deltaPath?: string }): ProviderContractEvaluation {
  const errors: string[] = [];
  const loadedContracts = loadProviderContracts(input.skillRoot);
  for (const issue of loadedContracts.issues) errors.push(`${issue.path}: ${issue.message}`);
  const loadedDelta = loadCapabilityDelta(input.skillRoot, input.deltaPath);
  for (const issue of loadedDelta.issues) errors.push(`${issue.path}: ${issue.message}`);
  const delta = loadedDelta.delta;
  if (!delta) return { errors };

  const snapshots = loadSnapshotHashes(input.snapshotPath);
  if (snapshots.issue) errors.push(snapshots.issue);

  const contractedSources = new Map<string, string>();
  for (const contract of loadedContracts.contracts) {
    for (const sourceId of contract.sourceIds) contractedSources.set(sourceId, contract.id);
  }
  for (const [sourceId, providerId] of contractedSources) {
    const entry = latestEntryForSource(delta, sourceId);
    if (!entry) {
      errors.push(`Contracted source ${sourceId} (${providerId}) has no capability-delta entry.`);
      continue;
    }
    if (entry.providerId !== providerId) {
      errors.push(`Capability-delta for ${sourceId} names provider ${entry.providerId}, expected ${providerId}.`);
    }
    if (snapshots.present) {
      const snapshotHash = snapshots.hashes.get(sourceId);
      if (snapshotHash) {
        if (entry.toHash !== snapshotHash) {
          errors.push(
            `Capability-delta for ${sourceId} to_hash ${entry.toHash} does not match snapshot hash ${snapshotHash}. Classify the freshness change before merge.`,
          );
        }
      } else if (entry.toHash !== UNSNAPPED_HASH) {
        errors.push(`Contracted source ${sourceId} has no verified snapshot baseline; to_hash must be ${UNSNAPPED_HASH} until the first successful fetch.`);
      }
    }
  }
  for (const entry of unmigratedBreakingEntries(delta)) {
    errors.push(
      `Breaking capability-delta for ${entry.sourceId} (${entry.providerId}) is not migrated. Migration status ${entry.migration} blocks provider-proof and revenue readiness.`,
    );
  }
  return { errors };
}

export interface UnmigratedBreakingReport {
  readonly summaries: string[];
  readonly loadErrors: readonly LoadIssue[];
}

export function resolveProviderContractIds(skillRoot: string, names: readonly string[]): string[] {
  if (names.length === 0) return [];
  const loaded = loadProviderContracts(skillRoot);
  const normalized = names.map((name) => name.trim().toLowerCase()).filter((name) => name.length > 0);
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const name of normalized) {
    for (const contract of loaded.contracts) {
      if (seen.has(contract.id)) continue;
      if (contract.id.toLowerCase() === name || contract.title.toLowerCase() === name) {
        ids.push(contract.id);
        seen.add(contract.id);
      }
    }
  }
  return ids;
}

export function unmigratedBreakingSummaries(skillRoot: string, providerId?: string | readonly string[], deltaPath?: string): UnmigratedBreakingReport {
  const loaded = loadCapabilityDelta(skillRoot, deltaPath);
  if (!loaded.delta) {
    return { summaries: [], loadErrors: loaded.issues };
  }
  return {
    summaries: unmigratedBreakingEntries(loaded.delta, providerId).map((entry) => `${entry.sourceId}: ${entry.summary} (migration ${entry.migration})`),
    loadErrors: loaded.issues,
  };
}

export function defaultRegistryPath(skillRoot: string): string {
  return path.join(skillRoot, "checks/validation/repository/source-registry.yaml");
}

export function defaultSnapshotPath(repoRoot: string): string {
  return path.join(repoRoot, "docs/source-freshness/source-snapshots/current.json");
}
