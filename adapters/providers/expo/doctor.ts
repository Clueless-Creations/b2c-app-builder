/**
 * Expo/EAS doctor and selected-target probe (#84).
 *
 * Local identity uses `--version` only. This module never spawns authenticated commands,
 * never mutates credentials, never runs eas init, and never claims a live EAS job.
 * Host `b2c doctor` invokes the host probe; paid build/submit stay on the mutating executor.
 */

import { EAS_CLI_DOCUMENTED_VERSION } from "../../../catalog/stacks/expo-eas-commands.js";
import { inspectCommandEffects } from "./effects.js";
import {
  discoverExpoCliForDoctor,
  type ExpoCliDiscovery,
  type ExpoCliKind,
  type ExpoDiscoveryCode,
} from "./discovery.js";
import { assessExpoEasPreflight, type ExpoEasHoldCode, type ExpoEasPreflight, type ExpoEasTarget } from "./preflight.js";
import { inspectExpoProject } from "./project-config.js";

export type { ExpoCliDiscovery };

export type ExpoEasDoctorFindingSeverity = "ok" | "warn";

export interface ExpoEasDoctorFinding {
  readonly severity: ExpoEasDoctorFindingSeverity;
  readonly code: string;
  readonly message: string;
}

export interface ExpoEasHostObservation {
  readonly latestObserved: string | null;
  readonly path: string | null;
  readonly version: string | null;
  readonly identity: ExpoDiscoveryCode;
  readonly kind: ExpoCliKind;
}

export interface ExpoEasHostDoctorResult {
  readonly observation: ExpoEasHostObservation;
  readonly findings: readonly ExpoEasDoctorFinding[];
  readonly liveEasProven: false;
}

export interface ExpoEasSelectedTargetProbe {
  readonly kind: "expo-eas-selected-target";
  readonly preflight: ExpoEasPreflight;
  readonly liveEasProven: false;
  readonly mutated: false;
  readonly spawnedAuthenticatedCommand: false;
  readonly liveEasClaim: "unproven";
}

export const EAS_CLI_DOCTOR_DOCUMENTED_VERSION = EAS_CLI_DOCUMENTED_VERSION;

/** Isolated `--version` lookup for `b2c doctor`. Never authenticates. */
export function discoverExpoCliKindForDoctor(input: {
  readonly kind: ExpoCliKind;
  readonly isolatedHome: string;
  readonly cwd: string;
  readonly pathEnv?: string;
}): ExpoCliDiscovery {
  return discoverExpoCliForDoctor(input);
}

export function assessExpoEasHostDoctor(input: {
  readonly discovery: ExpoCliDiscovery;
  readonly latestObserved: string;
  readonly sanitizePath: (executablePath: string) => string;
}): ExpoEasHostDoctorResult {
  const latest = input.latestObserved;
  const kind = input.discovery.kind;
  const tool = kind === "eas" ? "EAS CLI" : "Expo CLI";
  const findingPrefix = kind === "eas" ? "doctor.eas_cli" : "doctor.expo_cli";
  const selectedPath = input.discovery.selected ? input.sanitizePath(input.discovery.selected.path) : null;
  const version = input.discovery.selected?.version ?? null;
  const observation: ExpoEasHostObservation = {
    latestObserved: latest,
    path: selectedPath,
    version,
    identity: input.discovery.code,
    kind,
  };
  const extras: ExpoEasDoctorFinding[] = [];
  const extrasCandidates = input.discovery.candidates.slice(1);
  if (extrasCandidates.length > 0 && selectedPath) {
    extras.push({
      severity: "warn",
      code: `${findingPrefix}_shadowed`,
      message: `PATH also has ${extrasCandidates.map((entry) => input.sanitizePath(entry.path)).join(", ")}; winner is ${selectedPath}. Doctor will not install or upgrade the host.`,
    });
  }

  switch (input.discovery.code) {
    case "trusted":
      return {
        observation,
        findings: [
          {
            severity: "ok",
            code: findingPrefix,
            message: `winning ${selectedPath} ${version ?? "(unparseable)"} (documented ${tool} ${latest} is a docs page, not this binary). Local identity only — not a live EAS job, paid build, OTA, or credential proof. Doctor will not install, log in, or run eas init.`,
          },
          ...extras,
        ],
        liveEasProven: false,
      };
    case "missing":
      return {
        observation,
        findings: [
          {
            severity: "warn",
            code: `${findingPrefix}_missing`,
            message: `no ${kind === "eas" ? "eas" : "expo"} on PATH. Documented ${tool} ${latest} is not this host. Lanes that select ${tool} need that binary; doctor will not install it. This is not live EAS proof.`,
          },
        ],
        liveEasProven: false,
      };
    case "unrelated-executable":
      return {
        observation,
        findings: [
          {
            severity: "warn",
            code: `${findingPrefix}_unrelated`,
            message: `found executable(s) named ${kind === "eas" ? "eas/eas-cli" : "expo"} that did not identify as ${tool}${selectedPath ? ` (winner ${selectedPath})` : ""}. An unrelated binary is not the provider. Doctor will not install a replacement.`,
          },
        ],
        liveEasProven: false,
      };
    default: {
      const exhaustive: never = input.discovery.code;
      return exhaustive;
    }
  }
}

function selectedTargetHold(code: ExpoEasHoldCode, message: string): ExpoEasPreflight {
  if (code === "unselected-eas-cli" || code === "unselected-expo-cli" || code === "unselected-app-stack" || code === "unselected-service") {
    return { status: "skip", code, message, blocksUnrelatedWork: false };
  }
  return { status: "hold", code, message, blocksUnrelatedWork: false };
}

/**
 * Selected project/profile checks for a workspace that has chosen EAS.
 * Fail closed without host authority. Never spawn. Never treat matching ids as a live job.
 */
export function probeExpoEasSelectedTarget(input: {
  readonly discovery: ExpoCliDiscovery;
  readonly target: ExpoEasTarget;
  readonly cwd: string;
  readonly requestProjectId?: string;
  readonly requestProfile?: string;
  readonly requestPlatform?: "ios" | "android";
}): ExpoEasSelectedTargetProbe {
  const unproven = {
    kind: "expo-eas-selected-target" as const,
    liveEasProven: false as const,
    mutated: false as const,
    spawnedAuthenticatedCommand: false as const,
    liveEasClaim: "unproven" as const,
  };

  if (!input.target.selectedServices.includes("eas-cli")) {
    return {
      ...unproven,
      preflight: selectedTargetHold(
        "unselected-eas-cli",
        "EAS CLI is unselected. Local CLI identity does not change bindings or block unrelated work. Live EAS is unproven.",
      ),
    };
  }

  const project = inspectExpoProject(input.cwd);
  const closure = inspectCommandEffects(project, { commandId: "eas.project.info" });
  const idMatch = assessExpoEasPreflight({
    discovery: input.discovery,
    commandId: "eas.project.info",
    target: {
      ...input.target,
      hostAuthorityGranted: true,
      grantedAuthority: "observe",
      mode: "dispatch",
    },
    project,
    closure,
    requestProjectId: input.requestProjectId ?? input.target.approvedProjectId,
    requestProfile: input.requestProfile ?? input.target.approvedProfile,
    requestPlatform: input.requestPlatform,
  });
  if (idMatch.status !== "ready") {
    return { ...unproven, preflight: idMatch };
  }

  if (!input.target.hostAuthorityGranted) {
    return {
      ...unproven,
      preflight: selectedTargetHold(
        "authority-missing",
        "Selected EAS project/profile checks fail closed without host authority. Doctor/probe will not spawn authenticated eas commands or claim a live EAS job.",
      ),
    };
  }

  return {
    ...unproven,
    preflight: {
      status: "ready",
      code: "ready",
      message:
        "Selected EAS project/profile ids match the approved target. Live EAS remains unproven; doctor/probe did not spawn an authenticated command.",
      blocksUnrelatedWork: false,
    },
  };
}
