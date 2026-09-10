/**
 * Discover a trusted Expo CLI or EAS CLI executable without installing and without
 * recommending `npx eas-cli@latest`.
 */

import path from "node:path";
import { probeExecutablesOnPath, type ExecutableCandidate } from "../../../kernel/contribution/host-observe.js";
import { EAS_CLI_DOCUMENTED_VERSION } from "../../../catalog/stacks/expo-eas-commands.js";
import {
  EXPO_PROCESS_DISCOVERY_TIMEOUT_MS,
  assertTrustedExpoProcessRequest,
  buildExpoProcessEnv,
  defaultExpoProcessRunner,
  type ExpoProcessRequest,
  type ExpoProcessResult,
  type ExpoProcessRunner,
} from "./process.js";

export type ExpoCliKind = "expo" | "eas";

export type ExpoDiscoveryCode = "missing" | "unrelated-executable" | "trusted";

export interface ExpoDiscoveredExecutable {
  readonly path: string;
  readonly version: string | null;
  readonly commandName: ExpoCliKind;
  readonly pathOrder: number;
}

export interface ExpoCliDiscovery {
  readonly code: ExpoDiscoveryCode;
  readonly kind: ExpoCliKind;
  readonly selected: ExpoDiscoveredExecutable | null;
  readonly candidates: readonly ExpoDiscoveredExecutable[];
  readonly documentedEasVersion: typeof EAS_CLI_DOCUMENTED_VERSION;
  readonly message: string;
}

export interface DiscoverExpoCliInput {
  readonly kind: ExpoCliKind;
  readonly isolatedHome: string;
  readonly cwd: string;
  readonly pathEnv?: string;
  readonly probeExecutables?: (command: string) => ExecutableCandidate[];
  readonly run: ExpoProcessRunner;
}

const EXPO_IDENTITY = ["expo", "metro"] as const;
const EAS_IDENTITY = ["eas-cli", "eas cli", "expo application services"] as const;

function versionRequest(executable: string, cwd: string, isolatedHome: string, pathEnv: string): ExpoProcessRequest {
  const request: ExpoProcessRequest = {
    executable,
    argv: ["--version"],
    cwd,
    env: buildExpoProcessEnv({ isolatedHome, pathValue: pathEnv }),
    timeoutMs: EXPO_PROCESS_DISCOVERY_TIMEOUT_MS,
  };
  assertTrustedExpoProcessRequest(request);
  return request;
}

function looksLike(kind: ExpoCliKind, result: ExpoProcessResult, basename: string): boolean {
  const text = `${result.stdout}\n${result.stderr}`.toLowerCase();
  const name = basename.toLowerCase();
  if (kind === "expo") {
    return name === "expo" || EXPO_IDENTITY.some((token) => text.includes(token));
  }
  return name === "eas" || name === "eas-cli" || EAS_IDENTITY.some((token) => text.includes(token));
}

function parseVersion(text: string): string | null {
  const match = text.match(/(\d+\.\d+\.\d+)/);
  return match?.[1] ?? null;
}

export function discoverExpoCli(input: DiscoverExpoCliInput): ExpoCliDiscovery {
  const pathEnv = input.pathEnv ?? "";
  const commandName = input.kind === "expo" ? "expo" : "eas";
  const probe = input.probeExecutables ?? ((command: string) => probeExecutablesOnPath(command, { PATH: pathEnv }));
  const names = input.kind === "eas" ? ["eas", "eas-cli"] : ["expo"];
  const candidates: ExpoDiscoveredExecutable[] = [];
  for (const name of names) {
    for (const found of probe(name)) {
      const result = input.run(versionRequest(found.path, input.cwd, input.isolatedHome, pathEnv));
      const related = looksLike(input.kind, result, path.basename(found.path));
      candidates.push({
        path: found.path,
        version: parseVersion(`${result.stdout}\n${result.stderr}`),
        commandName: input.kind,
        pathOrder: found.pathOrder,
      });
      if (!related) {
        return {
          code: "unrelated-executable",
          kind: input.kind,
          selected: null,
          candidates,
          documentedEasVersion: EAS_CLI_DOCUMENTED_VERSION,
          message: `The executable at ${found.path} does not look like ${commandName}. Refusing to treat an unrelated binary as Expo/EAS CLI.`,
        };
      }
    }
  }
  const selected = candidates[0];
  if (!selected) {
    return {
      code: "missing",
      kind: input.kind,
      selected: null,
      candidates,
      documentedEasVersion: EAS_CLI_DOCUMENTED_VERSION,
      message: `${commandName} is not on the isolated PATH. This is a hold, not an install, and not a global block on unrelated work. Do not install Expo or EAS CLI from this hold, and do not use an unpinned installer.`,
    };
  }
  return {
    code: "trusted",
    kind: input.kind,
    selected,
    candidates,
    documentedEasVersion: EAS_CLI_DOCUMENTED_VERSION,
    message:
      selected.version === null
        ? `Trusted ${commandName} at ${selected.path}. Version output was not a semver; documented EAS CLI ${EAS_CLI_DOCUMENTED_VERSION} is not this binary.`
        : `Trusted ${commandName} ${selected.version} at ${selected.path}. Documented EAS CLI ${EAS_CLI_DOCUMENTED_VERSION} is a docs page, not this host observation.`,
  };
}

/** Isolated `--version` lookup for `b2c doctor`. Never authenticates or mutates. */
export const defaultDiscoverRunner: ExpoProcessRunner = defaultExpoProcessRunner;

export function discoverExpoCliForDoctor(input: {
  readonly kind: ExpoCliKind;
  readonly isolatedHome: string;
  readonly cwd: string;
  readonly pathEnv?: string;
}): ExpoCliDiscovery {
  return discoverExpoCli({
    kind: input.kind,
    isolatedHome: input.isolatedHome,
    cwd: input.cwd,
    pathEnv: input.pathEnv ?? process.env.PATH ?? "",
    run: defaultDiscoverRunner,
  });
}
