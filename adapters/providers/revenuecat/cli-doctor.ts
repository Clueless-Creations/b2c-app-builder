/**
 * RevenueCat CLI doctor and selected-target probe.
 *
 * Local identity uses Increment A discovery (`--version` and `commands --json`).
 * Selected-target checks reuse Increment A preflight. This module never spawns
 * authenticated commands, never mutates, and never claims live catalog proof.
 * Host `b2c inspect` invokes the host probe; `b2c doctor` is a supported equivalent.
 * Catalog mutate stays on the existing execute/ledger path and is not a second planner.
 */

import {
  defaultDiscoverRunner,
  discoverRevenueCatCli,
  type RevenueCatCliDiscovery,
  type RevenueCatCliDiscoveryCode,
} from "./cli-discovery.js";
import { getRevenueCatCliOperation, REVENUECAT_CLI_RELEASE } from "./cli-operations.js";

export type { RevenueCatCliDiscovery };
import {
  assessRevenueCatCliPreflight,
  holdFromDiscovery,
  type RevenueCatCliHoldCode,
  type RevenueCatCliPreflight,
  type RevenueCatCliTarget,
} from "./cli-preflight.js";

export type RevenueCatCliDoctorFindingSeverity = "ok" | "warn";

export interface RevenueCatCliDoctorFinding {
  readonly severity: RevenueCatCliDoctorFindingSeverity;
  readonly code: string;
  readonly message: string;
}

export interface RevenueCatCliHostObservation {
  readonly latestObserved: string | null;
  readonly path: string | null;
  readonly version: string | null;
  readonly identity: RevenueCatCliDiscoveryCode;
}

export interface RevenueCatCliHostDoctorResult {
  readonly observation: RevenueCatCliHostObservation;
  readonly findings: readonly RevenueCatCliDoctorFinding[];
  readonly liveCatalogProven: false;
}

export interface RevenueCatCliSelectedTargetProbe {
  readonly kind: "revenuecat-cli-selected-target";
  readonly preflight: RevenueCatCliPreflight;
  readonly liveCatalogProven: false;
  readonly mutated: false;
  readonly spawnedAuthenticatedCommand: false;
  readonly liveCatalogClaim: "unproven";
}

const PROJECT_OPERATION_ID = "rc.offerings.list";
const APP_OPERATION_ID = "rc.apps.show";

export const REVENUECAT_CLI_DOCTOR_REVIEWED_VERSION = REVENUECAT_CLI_RELEASE.version;

/** Isolated `--version` / `commands --json` lookup for `b2c inspect`. Never authenticates. */
export function discoverRevenueCatCliForDoctor(input: {
  readonly isolatedHome: string;
  readonly cwd: string;
  readonly pathEnv?: string;
}): RevenueCatCliDiscovery {
  return discoverRevenueCatCli({
    isolatedHome: input.isolatedHome,
    cwd: input.cwd,
    pathEnv: input.pathEnv ?? process.env.PATH ?? "",
    run: defaultDiscoverRunner,
  });
}

export function assessRevenueCatCliHostDoctor(input: {
  readonly discovery: RevenueCatCliDiscovery;
  readonly latestObserved: string;
  readonly sanitizePath: (executablePath: string) => string;
}): RevenueCatCliHostDoctorResult {
  const latest = input.latestObserved;
  const selectedPath = input.discovery.selected ? input.sanitizePath(input.discovery.selected.path) : null;
  const version = input.discovery.selected?.version ?? null;
  const observation: RevenueCatCliHostObservation = {
    latestObserved: latest,
    path: selectedPath,
    version,
    identity: input.discovery.code,
  };
  const extras: RevenueCatCliDoctorFinding[] = [];
  const extrasCandidates = input.discovery.candidates.slice(1);
  if (extrasCandidates.length > 0 && selectedPath) {
    extras.push({
      severity: "warn",
      code: "doctor.revenuecat_cli_shadowed",
      message: `PATH also has ${extrasCandidates.map((entry) => input.sanitizePath(entry.path)).join(", ")}; winner is ${selectedPath}. Inspect will not install or upgrade the host.`,
    });
  }

  switch (input.discovery.code) {
    case "trusted":
      return {
        observation,
        findings: [
          {
            severity: "ok",
            code: "doctor.revenuecat_cli",
            message: `winning ${selectedPath} ${version ?? "(unparseable)"} (reviewed executable ${latest}). Local identity only — not live catalog proof. Inspect will not install, log in, or refresh OAuth.`,
          },
          ...extras,
        ],
        liveCatalogProven: false,
      };
    case "missing":
      return {
        observation,
        findings: [
          {
            severity: "warn",
            code: "doctor.revenuecat_cli_missing",
            message: `no rc or revenuecat on PATH. Reviewed executable ${latest}. Billing lanes that select RevenueCat CLI need that binary; inspect will not install it. This is not live catalog proof.`,
          },
        ],
        liveCatalogProven: false,
      };
    case "unrelated-executable":
      return {
        observation,
        findings: [
          {
            severity: "warn",
            code: "doctor.revenuecat_cli_unrelated",
            message: `found executable(s) named rc/revenuecat that did not identify as RevenueCat CLI ${latest}${selectedPath ? ` (winner ${selectedPath})` : ""}. An unrelated rc binary is not the provider. Inspect will not install a replacement.`,
          },
        ],
        liveCatalogProven: false,
      };
    case "unsupported-version":
      return {
        observation,
        findings: [
          {
            severity: "warn",
            code: "doctor.revenuecat_cli_unsupported",
            message: `winning ${selectedPath ?? "(unknown path)"} reports ${version ?? "an unparseable version"}; reviewed executable support is exactly ${latest}. Inspect will not upgrade the host. This is not live catalog proof.`,
          },
          ...extras,
        ],
        liveCatalogProven: false,
      };
    case "unsupported-schema":
      return {
        observation,
        findings: [
          {
            severity: "warn",
            code: "doctor.revenuecat_cli_unsupported_schema",
            message: `winning ${selectedPath ?? "(unknown path)"} ${version ?? ""} did not return a usable commands --json tree for RevenueCat CLI ${latest}. Inspect will not install or rewrite the binary. This is not live catalog proof.`,
          },
          ...extras,
        ],
        liveCatalogProven: false,
      };
    default: {
      const exhaustive: never = input.discovery.code;
      return exhaustive;
    }
  }
}

function selectedTargetHold(
  code: RevenueCatCliHoldCode | "unselected-provider",
  message: string,
): RevenueCatCliPreflight {
  if (code === "unselected-provider") {
    return {
      status: "skip",
      code: "unselected-provider",
      message,
      blocksUnrelatedWork: false,
    };
  }
  return { status: "hold", code, message, blocksUnrelatedWork: false };
}

/**
 * Selected-project/app checks for a workspace that has chosen RevenueCat.
 * Fail closed without host authority. Never spawn. Never treat matching ids as live catalog proof.
 */
export function probeRevenueCatCliSelectedTarget(input: {
  readonly discovery: RevenueCatCliDiscovery;
  readonly target: RevenueCatCliTarget;
  readonly requestProjectId?: string;
  readonly requestAppId?: string;
}): RevenueCatCliSelectedTargetProbe {
  const unproven = {
    kind: "revenuecat-cli-selected-target" as const,
    liveCatalogProven: false as const,
    mutated: false as const,
    spawnedAuthenticatedCommand: false as const,
    liveCatalogClaim: "unproven" as const,
  };

  if (!input.target.providerSelected) {
    return {
      ...unproven,
      preflight: selectedTargetHold(
        "unselected-provider",
        "RevenueCat is unselected. Local CLI identity does not change bindings or block unrelated work. Live catalog is unproven.",
      ),
    };
  }

  const discoveryHold = holdFromDiscovery(input.discovery.code, input.discovery.message);
  if (discoveryHold) {
    return { ...unproven, preflight: discoveryHold };
  }

  const listOperation = getRevenueCatCliOperation(PROJECT_OPERATION_ID);
  if (!listOperation) {
    return {
      ...unproven,
      preflight: selectedTargetHold("unsupported-operation", "rc.offerings.list is not in the reviewed operation matrix."),
    };
  }
  const project = assessRevenueCatCliPreflight({
    discovery: input.discovery,
    operation: listOperation,
    target: { ...input.target, hostAuthorityGranted: true },
    requestProjectId: input.requestProjectId ?? input.target.approvedProjectId,
    requestAppId: input.requestAppId,
  });
  if (project.status !== "ready") {
    return { ...unproven, preflight: project };
  }

  const needsApp = Boolean(input.target.approvedAppId?.trim() || input.requestAppId?.trim());
  if (needsApp) {
    const showOperation = getRevenueCatCliOperation(APP_OPERATION_ID);
    if (!showOperation) {
      return {
        ...unproven,
        preflight: selectedTargetHold("unsupported-operation", "rc.apps.show is not in the reviewed operation matrix."),
      };
    }
    const app = assessRevenueCatCliPreflight({
      discovery: input.discovery,
      operation: showOperation,
      target: { ...input.target, hostAuthorityGranted: true },
      requestProjectId: input.requestProjectId ?? input.target.approvedProjectId,
      requestAppId: input.requestAppId ?? input.target.approvedAppId,
    });
    if (app.status !== "ready") {
      return { ...unproven, preflight: app };
    }
  }

  if (!input.target.hostAuthorityGranted) {
    return {
      ...unproven,
      preflight: selectedTargetHold(
        "authority-missing",
        "Selected RevenueCat project/app checks fail closed without host authority. Doctor/probe will not spawn authenticated rc commands or claim live catalog proof.",
      ),
    };
  }

  return {
    ...unproven,
    preflight: {
      status: "ready",
      code: "ready",
      message:
        "Selected RevenueCat project/app ids match the approved target. Live catalog remains unproven; doctor/probe did not spawn an authenticated command.",
      blocksUnrelatedWork: false,
    },
  };
}
