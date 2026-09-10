import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { b2cAppBuilderHome } from "../../adapters/registry.js";

export const DOCTOR_HOST_FILENAME = "doctor-host.json";
export const DOCTOR_HOST_SCHEMA = "b2c.doctor-host/v1";

export const REVENUECAT_CLI_HOST_IDENTITIES = [
  "trusted",
  "missing",
  "unrelated-executable",
  "unsupported-version",
  "unsupported-schema",
] as const;
export type DoctorHostRevenueCatCliIdentity = (typeof REVENUECAT_CLI_HOST_IDENTITIES)[number];

export interface DoctorHostRevenueCatCliObservation {
  readonly latestObserved: string | null;
  readonly path: string | null;
  readonly version: string | null;
  readonly identity: DoctorHostRevenueCatCliIdentity;
}

export interface DoctorHostObservation {
  readonly schemaVersion: typeof DOCTOR_HOST_SCHEMA;
  readonly comparedAt: string;
  readonly latestObserved: string | null;
  readonly path: string | null;
  readonly version: string | null;
  readonly revenuecatCli?: DoctorHostRevenueCatCliObservation;
}

export function doctorHostPath(home = b2cAppBuilderHome()): string {
  return path.join(home, DOCTOR_HOST_FILENAME);
}

/** Rewrite `$HOME` to `~` so a pasted status block does not carry a home-directory identity. */
export function sanitizeExecutablePath(executablePath: string, home = process.env.HOME ?? os.homedir()): string {
  if (!home) return executablePath;
  const resolvedHome = path.resolve(home);
  const resolved = path.resolve(executablePath);
  if (resolved === resolvedHome) return "~";
  if (resolved.startsWith(`${resolvedHome}${path.sep}`)) return `~${resolved.slice(resolvedHome.length)}`;
  return executablePath;
}

export function readDoctorHostObservation(home = b2cAppBuilderHome()): DoctorHostObservation | null {
  const file = doctorHostPath(home);
  if (!existsSync(file)) return null;
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as Partial<DoctorHostObservation>;
    if (parsed.schemaVersion !== DOCTOR_HOST_SCHEMA) return null;
    if (typeof parsed.comparedAt !== "string" || !parsed.comparedAt) return null;
    const revenuecatCli = parseRevenueCatCliObservation(parsed.revenuecatCli);
    return {
      schemaVersion: DOCTOR_HOST_SCHEMA,
      comparedAt: parsed.comparedAt,
      latestObserved: typeof parsed.latestObserved === "string" ? parsed.latestObserved : null,
      path: typeof parsed.path === "string" ? parsed.path : null,
      version: typeof parsed.version === "string" ? parsed.version : null,
      ...(revenuecatCli ? { revenuecatCli } : {}),
    };
  } catch {
    return null;
  }
}

function isRevenueCatCliIdentity(value: unknown): value is DoctorHostRevenueCatCliIdentity {
  return typeof value === "string" && (REVENUECAT_CLI_HOST_IDENTITIES as readonly string[]).includes(value);
}

function parseRevenueCatCliObservation(value: unknown): DoctorHostRevenueCatCliObservation | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  if (!isRevenueCatCliIdentity(record.identity)) return undefined;
  return {
    latestObserved: typeof record.latestObserved === "string" ? record.latestObserved : null,
    path: typeof record.path === "string" ? record.path : null,
    version: typeof record.version === "string" ? record.version : null,
    identity: record.identity,
  };
}

export function writeDoctorHostObservation(observation: DoctorHostObservation, home = b2cAppBuilderHome()): { ok: true } | { ok: false; message: string } {
  try {
    mkdirSync(home, { recursive: true });
    writeFileSync(doctorHostPath(home), `${JSON.stringify(observation, null, 2)}\n`, "utf8");
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
}

export function renderDoctorHostBlock(observation: DoctorHostObservation | null): string {
  const header = "Host ASC (last b2c doctor observation, not a live PATH probe";
  if (!observation) {
    return `${header}):\ndoctor has not been run on this machine. Run \`b2c doctor\` to record the winning asc path and version.`;
  }
  const stamped = `${header}; compared-at ${observation.comparedAt}):`;
  const latest = observation.latestObserved ?? "(unknown)";
  if (!observation.path) {
    return `${stamped}\ndoctor ran; no asc on PATH. Latest observed ${latest}. This is not proof Apple is unavailable.`;
  }
  const version = observation.version ?? "(unparseable)";
  return `${stamped}\nwinning ${observation.path} ${version} (latest observed ${latest})`;
}

export function renderRevenueCatCliHostBlock(observation: DoctorHostObservation | null): string {
  const header = "Host RevenueCat CLI (last b2c doctor observation, not a live PATH probe and not live catalog proof";
  if (!observation) {
    return `${header}):\ndoctor has not been run on this machine. Run \`b2c doctor\` to record the winning rc/revenuecat path and version.`;
  }
  const stamped = `${header}; compared-at ${observation.comparedAt}):`;
  const recorded = observation.revenuecatCli;
  if (!recorded) {
    return `${stamped}\ndoctor ran; this observation did not record RevenueCat CLI. Run \`b2c doctor\` again. This is not live catalog proof.`;
  }
  const latest = recorded.latestObserved ?? "(unknown)";
  switch (recorded.identity) {
    case "missing":
      return `${stamped}\ndoctor ran; no RevenueCat CLI on PATH. Latest observed ${latest}. This is not live catalog proof.`;
    case "unrelated-executable":
      return `${stamped}\ndoctor ran; PATH rc/revenuecat did not identify as RevenueCat CLI. Latest observed ${latest}. This is not live catalog proof.`;
    case "unsupported-version":
    case "unsupported-schema":
      return `${stamped}\nwinning ${recorded.path ?? "(unknown)"} ${recorded.version ?? "(unparseable)"} is not the reviewed RevenueCat CLI ${latest}. This is not live catalog proof.`;
    case "trusted": {
      if (!recorded.path) {
        return `${stamped}\ndoctor ran; trusted identity lacked a path. Latest observed ${latest}. This is not live catalog proof.`;
      }
      const version = recorded.version ?? "(unparseable)";
      return `${stamped}\nwinning ${recorded.path} ${version} (reviewed executable ${latest}). Live catalog is unproven.`;
    }
    default: {
      const exhaustive: never = recorded.identity;
      return exhaustive;
    }
  }
}

export function appendDoctorHostBlock(text: string, home = b2cAppBuilderHome()): string {
  const observation = readDoctorHostObservation(home);
  return `${text}\n\n${renderDoctorHostBlock(observation)}\n\n${renderRevenueCatCliHostBlock(observation)}`;
}
