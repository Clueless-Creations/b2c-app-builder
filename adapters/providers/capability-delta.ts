export const CAPABILITY_DELTA_SCHEMA_VERSION = 1 as const;

export const CAPABILITY_CLASSIFICATIONS = ["ignore", "docs", "commands", "template", "validator", "eval", "breaking"] as const;
export type CapabilityClassification = (typeof CAPABILITY_CLASSIFICATIONS)[number];

export const MIGRATION_STATUSES = ["none", "pending", "complete"] as const;
export type MigrationStatus = (typeof MIGRATION_STATUSES)[number];

export const UNSNAPPED_HASH = "unsnapped";

export interface CapabilityDeltaEntry {
  readonly providerId: string;
  readonly sourceId: string;
  readonly fromHash: string;
  readonly toHash: string;
  readonly classification: CapabilityClassification;
  readonly summary: string;
  readonly migration: MigrationStatus;
}

export interface CapabilityDelta {
  readonly schemaVersion: typeof CAPABILITY_DELTA_SCHEMA_VERSION;
  readonly reviewedAt: string;
  readonly entries: readonly CapabilityDeltaEntry[];
}

export function isCapabilityClassification(value: string): value is CapabilityClassification {
  return (CAPABILITY_CLASSIFICATIONS as readonly string[]).includes(value);
}

export function isMigrationStatus(value: string): value is MigrationStatus {
  return (MIGRATION_STATUSES as readonly string[]).includes(value);
}

export function migrationComplete(migration: MigrationStatus): boolean {
  switch (migration) {
    case "none":
    case "pending":
      return false;
    case "complete":
      return true;
    default: {
      const exhaustive: never = migration;
      throw new Error(`Unhandled migration status ${String(exhaustive)}`);
    }
  }
}

export function classificationBlocksReadiness(classification: CapabilityClassification, migration: MigrationStatus): boolean {
  switch (classification) {
    case "ignore":
    case "docs":
    case "commands":
    case "template":
    case "validator":
    case "eval":
      return false;
    case "breaking":
      return !migrationComplete(migration);
    default: {
      const exhaustive: never = classification;
      throw new Error(`Unhandled capability classification ${String(exhaustive)}`);
    }
  }
}

export function unmigratedBreakingEntries(delta: CapabilityDelta, providerId?: string | readonly string[]): CapabilityDeltaEntry[] {
  const allowed = normalizeProviderFilter(providerId);
  return delta.entries.filter((entry) => {
    if (allowed && !allowed.has(entry.providerId)) return false;
    return classificationBlocksReadiness(entry.classification, entry.migration);
  });
}

function normalizeProviderFilter(providerId?: string | readonly string[]): Set<string> | undefined {
  if (providerId === undefined) return undefined;
  if (typeof providerId === "string") return new Set([providerId]);
  return new Set(providerId);
}

export function latestEntryForSource(delta: CapabilityDelta, sourceId: string): CapabilityDeltaEntry | undefined {
  const matches = delta.entries.filter((entry) => entry.sourceId === sourceId);
  return matches.at(-1);
}
