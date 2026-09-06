import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { trustedSourceHash } from "../../tooling/lib/source-freshness-state.js";
import {
  CAPABILITY_DELTA_SCHEMA_VERSION,
  isCapabilityClassification,
  isMigrationStatus,
  type CapabilityDelta,
  type CapabilityDeltaEntry,
} from "./capability-delta.js";
import {
  assertAppleAscReusesAppReviewCapabilities,
  isProviderContractKind,
  PROVIDER_CONTRACT_SCHEMA_VERSION,
  type ProviderContract,
  type ProviderDeprecation,
  type ProviderFeature,
  type ProviderFeed,
} from "./contract.js";

export const PROVIDER_CONTRACTS_DIR = "catalog/providers";
export const CAPABILITY_DELTA_RELATIVE = "catalog/providers/capability-delta.yaml";

export interface LoadIssue {
  readonly path: string;
  readonly message: string;
}

export interface LoadedProviderContracts {
  readonly contracts: ProviderContract[];
  readonly issues: LoadIssue[];
}

export interface LoadedCapabilityDelta {
  readonly delta?: CapabilityDelta;
  readonly issues: LoadIssue[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function integer(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) ? value : undefined;
}

export function providerContractsDirectory(skillRoot: string): string {
  return path.join(skillRoot, PROVIDER_CONTRACTS_DIR);
}

export function capabilityDeltaPath(skillRoot: string): string {
  return path.join(skillRoot, CAPABILITY_DELTA_RELATIVE);
}

export function loadProviderContracts(skillRoot: string): LoadedProviderContracts {
  const directory = providerContractsDirectory(skillRoot);
  if (!existsSync(directory)) {
    return { contracts: [], issues: [{ path: directory, message: "Provider contracts directory is missing." }] };
  }
  const issues: LoadIssue[] = [];
  const contracts: ProviderContract[] = [];
  const files = readdirSync(directory)
    .filter((name) => name.endsWith(".yaml") && name !== "capability-delta.yaml")
    .sort();
  for (const name of files) {
    const filePath = path.join(directory, name);
    const loaded = readContractFile(filePath);
    if (loaded.issue) {
      issues.push({ path: filePath, message: loaded.issue });
      continue;
    }
    if (loaded.contract) contracts.push(loaded.contract);
  }
  return { contracts, issues };
}

export function loadCapabilityDelta(skillRoot: string, overridePath?: string): LoadedCapabilityDelta {
  const filePath = overridePath ?? capabilityDeltaPath(skillRoot);
  if (!existsSync(filePath)) {
    return { issues: [{ path: filePath, message: "Capability-delta ledger is missing." }] };
  }
  try {
    const parsed: unknown = parseYaml(readFileSync(filePath, "utf8"));
    const delta = parseCapabilityDelta(parsed);
    if (typeof delta === "string") return { issues: [{ path: filePath, message: delta }] };
    return { delta, issues: [] };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { issues: [{ path: filePath, message: `Capability-delta YAML failed to parse: ${message}` }] };
  }
}

function readContractFile(filePath: string): { contract?: ProviderContract; issue?: string } {
  try {
    const parsed: unknown = parseYaml(readFileSync(filePath, "utf8"));
    const contract = parseProviderContract(parsed);
    if (typeof contract === "string") return { issue: contract };
    const appleIssue = assertAppleAscReusesAppReviewCapabilities(contract);
    if (appleIssue) return { issue: appleIssue };
    return { contract };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { issue: `Provider contract YAML failed to parse: ${message}` };
  }
}

export function parseProviderContract(value: unknown): ProviderContract | string {
  if (!isRecord(value)) return "Provider contract must be a mapping.";
  if (integer(value.schema_version) !== PROVIDER_CONTRACT_SCHEMA_VERSION) {
    return `schema_version must be ${PROVIDER_CONTRACT_SCHEMA_VERSION}.`;
  }
  const id = text(value.id);
  const version = text(value.version);
  const kindRaw = text(value.kind);
  const title = text(value.title);
  if (!id) return "id is required.";
  if (!version) return "version is required.";
  if (!kindRaw || !isProviderContractKind(kindRaw)) return "kind must be billing, agent_runtime, or store_cli.";
  if (!title) return "title is required.";
  const sourceIds = stringList(value.source_ids);
  if (!sourceIds || sourceIds.length === 0) return "source_ids must be a non-empty string list.";
  const features = parseFeatures(value.features);
  if (typeof features === "string") return features;
  if (features.length === 0) return "features must be a non-empty list.";
  const deprecations = parseDeprecations(value.deprecations);
  if (typeof deprecations === "string") return deprecations;
  const feeds = parseFeeds(value.machine_readable_feeds);
  if (typeof feeds === "string") return feeds;
  const reviewCadenceDays = integer(value.review_cadence_days);
  if (reviewCadenceDays === undefined || reviewCadenceDays < 1 || reviewCadenceDays > 365) {
    return "review_cadence_days must be an integer from 1 to 365.";
  }
  const receiptRaw = text(value.capability_receipt);
  if (receiptRaw && receiptRaw !== "app_review_asc") return "capability_receipt, when set, must be app_review_asc.";
  return {
    schemaVersion: PROVIDER_CONTRACT_SCHEMA_VERSION,
    id,
    version,
    kind: kindRaw,
    title,
    sourceIds,
    features,
    sdkFloor: text(value.sdk_floor),
    deprecations,
    machineReadableFeeds: feeds,
    reviewCadenceDays,
    capabilityReceipt: receiptRaw === "app_review_asc" ? "app_review_asc" : undefined,
  };
}

function parseCapabilityDelta(value: unknown): CapabilityDelta | string {
  if (!isRecord(value)) return "Capability-delta must be a mapping.";
  if (integer(value.schema_version) !== CAPABILITY_DELTA_SCHEMA_VERSION) {
    return `schema_version must be ${CAPABILITY_DELTA_SCHEMA_VERSION}.`;
  }
  const reviewedAt = text(value.reviewed_at);
  if (!reviewedAt || !/^\d{4}-\d{2}-\d{2}$/.test(reviewedAt)) return "reviewed_at must be YYYY-MM-DD.";
  if (!Array.isArray(value.entries)) return "entries must be a list.";
  const entries: CapabilityDeltaEntry[] = [];
  for (const [index, item] of value.entries.entries()) {
    const entry = parseDeltaEntry(item);
    if (typeof entry === "string") return `entries[${index}]: ${entry}`;
    entries.push(entry);
  }
  return { schemaVersion: CAPABILITY_DELTA_SCHEMA_VERSION, reviewedAt, entries };
}

function parseDeltaEntry(value: unknown): CapabilityDeltaEntry | string {
  if (!isRecord(value)) return "entry must be a mapping.";
  const providerId = text(value.provider_id);
  const sourceId = text(value.source_id);
  const fromHash = text(value.from_hash);
  const toHash = text(value.to_hash);
  const classificationRaw = text(value.classification);
  const summary = text(value.summary);
  const migrationRaw = text(value.migration);
  if (!providerId) return "provider_id is required.";
  if (!sourceId) return "source_id is required.";
  if (!fromHash) return "from_hash is required.";
  if (!toHash) return "to_hash is required.";
  if (!classificationRaw || !isCapabilityClassification(classificationRaw)) {
    return "classification must be ignore, docs, commands, template, validator, eval, or breaking.";
  }
  if (!summary || summary.length < 12) return "summary must be at least 12 characters.";
  if (!migrationRaw || !isMigrationStatus(migrationRaw)) return "migration must be none, pending, or complete.";
  return {
    providerId,
    sourceId,
    fromHash,
    toHash,
    classification: classificationRaw,
    summary,
    migration: migrationRaw,
  };
}

function stringList(value: unknown): string[] | undefined {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || item.trim() === "")) return undefined;
  return value.map((item) => item.trim());
}

function parseFeatures(value: unknown): ProviderFeature[] | string {
  if (!Array.isArray(value)) return "features must be a list.";
  const features: ProviderFeature[] = [];
  for (const [index, item] of value.entries()) {
    if (!isRecord(item)) return `features[${index}] must be a mapping.`;
    const id = text(item.id);
    const notes = text(item.notes);
    if (!id) return `features[${index}].id is required.`;
    if (!notes) return `features[${index}].notes is required.`;
    if (typeof item.required !== "boolean") return `features[${index}].required must be a boolean.`;
    features.push({ id, required: item.required, notes });
  }
  return features;
}

function parseDeprecations(value: unknown): ProviderDeprecation[] | string {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return "deprecations must be a list.";
  const deprecations: ProviderDeprecation[] = [];
  for (const [index, item] of value.entries()) {
    if (!isRecord(item)) return `deprecations[${index}] must be a mapping.`;
    const id = text(item.id);
    const since = text(item.since);
    if (!id) return `deprecations[${index}].id is required.`;
    if (!since) return `deprecations[${index}].since is required.`;
    if (typeof item.blocking !== "boolean") return `deprecations[${index}].blocking must be a boolean.`;
    deprecations.push({ id, since, replacement: text(item.replacement), blocking: item.blocking });
  }
  return deprecations;
}

function parseFeeds(value: unknown): ProviderFeed[] | string {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return "machine_readable_feeds must be a list.";
  const feeds: ProviderFeed[] = [];
  for (const [index, item] of value.entries()) {
    if (!isRecord(item)) return `machine_readable_feeds[${index}] must be a mapping.`;
    const url = text(item.url);
    const kind = text(item.kind);
    if (!url) return `machine_readable_feeds[${index}].url is required.`;
    if (!kind) return `machine_readable_feeds[${index}].kind is required.`;
    feeds.push({ url, kind });
  }
  return feeds;
}

export function loadSnapshotHashes(snapshotPath: string): { hashes: Map<string, string>; present: boolean; issue?: string } {
  const hashes = new Map<string, string>();
  if (!existsSync(snapshotPath)) return { hashes, present: false };
  try {
    const parsed: unknown = JSON.parse(readFileSync(snapshotPath, "utf8"));
    if (!isRecord(parsed) || !Array.isArray(parsed.sources)) {
      return { hashes, present: true, issue: "Source snapshot must be an object with a sources list." };
    }
    for (const item of parsed.sources) {
      if (!isRecord(item)) continue;
      const id = text(item.id);
      const hash = trustedSourceHash(item);
      if (id && hash) hashes.set(id, hash);
    }
    return { hashes, present: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { hashes, present: true, issue: `Source snapshot failed to parse: ${message}` };
  }
}

export function loadRegistrySourceIds(registryPath: string): { ids: Set<string>; issue?: string } {
  const ids = new Set<string>();
  if (!existsSync(registryPath)) return { ids, issue: "Source registry is missing." };
  try {
    const parsed: unknown = parseYaml(readFileSync(registryPath, "utf8"));
    if (!isRecord(parsed) || !Array.isArray(parsed.sources)) {
      return { ids, issue: "Source registry must contain a sources list." };
    }
    for (const item of parsed.sources) {
      if (!isRecord(item)) continue;
      const id = text(item.id);
      if (id) ids.add(id);
    }
    return { ids };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ids, issue: `Source registry failed to parse: ${message}` };
  }
}
