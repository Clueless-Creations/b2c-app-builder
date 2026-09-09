import path from "node:path";
import { parseVersion, probeExecutablesOnPath, type ExecutableCandidate } from "../../../kernel/contribution/host-observe.js";
import {
  CLI_PROCESS_DISCOVERY_TIMEOUT_MS,
  assertTrustedCliProcessRequest,
  buildCliProcessEnv,
  defaultCliProcessRunner,
  type CliProcessRequest,
  type CliProcessResult,
  type CliProcessRunner,
} from "./cli-process.js";
import { REVENUECAT_CLI_RELEASE } from "./cli-operations.js";

const VERSION_PATTERN = "(\\d+\\.\\d+\\.\\d+)";
const IDENTITY_TOKENS = ["revenuecat", "offerings", "entitlements"] as const;
const REQUIRED_SCHEMA_COMMANDS = ["offerings", "customers", "apps", "projects", "entitlements", "products"] as const;

export type RevenueCatCliDiscoveryCode =
  | "missing"
  | "unrelated-executable"
  | "unsupported-version"
  | "unsupported-schema"
  | "trusted";

export interface RevenueCatCliExecutable {
  readonly path: string;
  readonly version: string | null;
  readonly commandName: "rc" | "revenuecat";
  readonly pathOrder: number;
}

export interface RevenueCatCliDiscovery {
  readonly code: RevenueCatCliDiscoveryCode;
  readonly selected: RevenueCatCliExecutable | null;
  readonly candidates: readonly RevenueCatCliExecutable[];
  readonly requiredRelease: typeof REVENUECAT_CLI_RELEASE;
  readonly schemaCommands: readonly string[];
  readonly message: string;
}

export interface DiscoverRevenueCatCliInput {
  readonly isolatedHome: string;
  readonly cwd: string;
  readonly pathEnv?: string;
  readonly probeExecutables?: (command: string) => ExecutableCandidate[];
  readonly run: CliProcessRunner;
}

function versionProbeRequest(executable: string, cwd: string, isolatedHome: string, pathEnv: string): CliProcessRequest {
  return {
    executable,
    argv: ["--version"],
    cwd,
    env: buildCliProcessEnv({ isolatedHome, pathValue: pathEnv }),
    timeoutMs: CLI_PROCESS_DISCOVERY_TIMEOUT_MS,
  };
}

function looksLikeRevenueCat(result: CliProcessResult): boolean {
  const text = `${result.stdout}\n${result.stderr}`.toLowerCase();
  return IDENTITY_TOKENS.some((token) => text.includes(token));
}

function parseCliVersion(result: CliProcessResult): string | null {
  return parseVersion(`${result.stdout}\n${result.stderr}`, VERSION_PATTERN);
}

function commandNameFor(executable: string): "rc" | "revenuecat" {
  return path.basename(executable) === "revenuecat" ? "revenuecat" : "rc";
}

function schemaCommandNames(payload: unknown): string[] {
  const names = new Set<string>();
  const visit = (value: unknown): void => {
    if (typeof value === "string") {
      const token = value.trim().split(/\s+/u)[0];
      if (token && REQUIRED_SCHEMA_COMMANDS.includes(token as (typeof REQUIRED_SCHEMA_COMMANDS)[number])) names.add(token);
      return;
    }
    if (Array.isArray(value)) {
      for (const entry of value) visit(entry);
      return;
    }
    if (value && typeof value === "object") {
      const record = value as Record<string, unknown>;
      for (const key of ["name", "command", "id", "path"]) {
        if (typeof record[key] === "string") visit(record[key]);
      }
      for (const nested of Object.values(record)) visit(nested);
    }
  };
  visit(payload);
  return [...names].sort();
}

function parseCommandsDocument(stdout: string): { ok: true; names: readonly string[] } | { ok: false; reason: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout) as unknown;
  } catch {
    return { ok: false, reason: "commands --json did not return JSON" };
  }
  if (parsed === null || (typeof parsed !== "object" && !Array.isArray(parsed))) {
    return { ok: false, reason: "commands --json envelope is not an object or array" };
  }
  const root = parsed && typeof parsed === "object" && !Array.isArray(parsed) && "data" in parsed ? (parsed as { data: unknown }).data : parsed;
  const names = schemaCommandNames(root);
  return { ok: true, names };
}

export function discoverRevenueCatCli(input: DiscoverRevenueCatCliInput): RevenueCatCliDiscovery {
  const pathEnv = input.pathEnv ?? "";
  const probe = input.probeExecutables ?? ((command: string) => probeExecutablesOnPath(command, { PATH: pathEnv }));
  const seen = new Set<string>();
  const raw: Array<ExecutableCandidate & { commandName: "rc" | "revenuecat" }> = [];
  for (const command of ["rc", "revenuecat"] as const) {
    for (const candidate of probe(command)) {
      if (seen.has(candidate.path)) continue;
      seen.add(candidate.path);
      raw.push({ ...candidate, commandName: command });
    }
  }
  raw.sort((left, right) => left.pathOrder - right.pathOrder || left.path.localeCompare(right.path));

  const identified: RevenueCatCliExecutable[] = [];
  const unrelated: RevenueCatCliExecutable[] = [];
  for (const candidate of raw) {
    const request = versionProbeRequest(candidate.path, input.cwd, input.isolatedHome, pathEnv);
    let result: CliProcessResult;
    try {
      assertTrustedCliProcessRequest(request);
      result = input.run(request);
    } catch {
      unrelated.push({ path: candidate.path, version: null, commandName: candidate.commandName, pathOrder: candidate.pathOrder });
      continue;
    }
    const version = parseCliVersion(result);
    const executable: RevenueCatCliExecutable = {
      path: candidate.path,
      version,
      commandName: commandNameFor(candidate.path),
      pathOrder: candidate.pathOrder,
    };
    if (looksLikeRevenueCat(result)) {
      identified.push(executable);
      continue;
    }
    if (result.status !== 0 || version === null) {
      unrelated.push(executable);
      continue;
    }
    const schemaRequest: CliProcessRequest = {
      executable: candidate.path,
      argv: ["commands", "--json", "--no-input", "--no-color"],
      cwd: input.cwd,
      env: buildCliProcessEnv({ isolatedHome: input.isolatedHome, pathValue: pathEnv }),
      timeoutMs: CLI_PROCESS_DISCOVERY_TIMEOUT_MS,
    };
    const schemaResult = input.run(schemaRequest);
    const document = schemaResult.status === 0 ? parseCommandsDocument(schemaResult.stdout) : { ok: false as const, reason: "exit" };
    if (document.ok && REQUIRED_SCHEMA_COMMANDS.every((name) => document.names.includes(name))) identified.push(executable);
    else unrelated.push(executable);
  }

  if (!identified.length) {
    if (!raw.length) {
      return {
        code: "missing",
        selected: null,
        candidates: [],
        requiredRelease: REVENUECAT_CLI_RELEASE,
        schemaCommands: [],
        message: `No RevenueCat CLI executable named rc or revenuecat was found. Install is founder-gated; the builder will not fetch an unpinned latest ${REVENUECAT_CLI_RELEASE.npmPackage} package.`,
      };
    }
    return {
      code: "unrelated-executable",
      selected: null,
      candidates: unrelated,
      requiredRelease: REVENUECAT_CLI_RELEASE,
      schemaCommands: [],
      message: `Found executable(s) named rc/revenuecat that did not identify as RevenueCat CLI ${REVENUECAT_CLI_RELEASE.version}. An unrelated rc binary is not the provider.`,
    };
  }

  const selected = identified[0]!;
  if (selected.version !== REVENUECAT_CLI_RELEASE.version) {
    return {
      code: "unsupported-version",
      selected,
      candidates: identified,
      requiredRelease: REVENUECAT_CLI_RELEASE,
      schemaCommands: [],
      message: `Trusted RevenueCat CLI at ${selected.path} reports ${selected.version ?? "an unparseable version"}; reviewed executable support is exactly ${REVENUECAT_CLI_RELEASE.version} (${REVENUECAT_CLI_RELEASE.commit}). The current README/source head is not the installed release.`,
    };
  }

  const schemaRequest: CliProcessRequest = {
    executable: selected.path,
    argv: ["commands", "--json", "--no-input", "--no-color"],
    cwd: input.cwd,
    env: buildCliProcessEnv({ isolatedHome: input.isolatedHome, pathValue: pathEnv }),
    timeoutMs: CLI_PROCESS_DISCOVERY_TIMEOUT_MS,
  };
  const schemaResult = input.run(schemaRequest);
  if (schemaResult.status !== 0) {
    return {
      code: "unsupported-schema",
      selected,
      candidates: identified,
      requiredRelease: REVENUECAT_CLI_RELEASE,
      schemaCommands: [],
      message: `RevenueCat CLI ${selected.version} at ${selected.path} did not return a usable commands --json document (exit ${schemaResult.status ?? "null"}).`,
    };
  }
  const document = parseCommandsDocument(schemaResult.stdout);
  if (!document.ok) {
    return {
      code: "unsupported-schema",
      selected,
      candidates: identified,
      requiredRelease: REVENUECAT_CLI_RELEASE,
      schemaCommands: [],
      message: `RevenueCat CLI ${selected.version} produced incompatible command discovery output: ${document.reason}.`,
    };
  }
  const missing = REQUIRED_SCHEMA_COMMANDS.filter((name) => !document.names.includes(name));
  if (missing.length) {
    return {
      code: "unsupported-schema",
      selected,
      candidates: identified,
      requiredRelease: REVENUECAT_CLI_RELEASE,
      schemaCommands: document.names,
      message: `RevenueCat CLI ${selected.version} command tree is missing required families: ${missing.join(", ")}.`,
    };
  }
  return {
    code: "trusted",
    selected,
    candidates: identified,
    requiredRelease: REVENUECAT_CLI_RELEASE,
    schemaCommands: document.names,
    message: `Trusted RevenueCat CLI ${selected.version} at ${selected.path}.`,
  };
}

export const defaultDiscoverRunner: CliProcessRunner = defaultCliProcessRunner;
