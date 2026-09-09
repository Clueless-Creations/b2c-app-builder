import path from "node:path";
import type { RevenueCatCliDiscovery, RevenueCatCliDiscoveryCode } from "./cli-discovery.js";
import { isMutationEffect, type CliEffectClass, type CliOperationSpec } from "./cli-operations.js";

export type RevenueCatCliHoldCode =
  | "missing-cli"
  | "unrelated-executable"
  | "unsupported-version"
  | "unsupported-schema"
  | "unselected-provider"
  | "unresolved-project"
  | "ambiguous-project"
  | "ambient-project-mismatch"
  | "missing-auth"
  | "insufficient-permissions"
  | "unsafe-override"
  | "authority-missing"
  | "production-test-store-refused"
  | "unsupported-operation"
  | "experimental-unavailable"
  | "raw-api-refused"
  | "nested-orchestration-refused"
  | "profile-default-refused"
  | "mutation-uncertain"
  | "request-project-mismatch"
  | "request-app-mismatch"
  | "unscoped-observation"
  | "stale-plan-approval";

export type RevenueCatCliPreflightStatus = "hold" | "skip" | "ready";

export interface RevenueCatCliPreflight {
  readonly status: RevenueCatCliPreflightStatus;
  readonly code: RevenueCatCliHoldCode | "ready" | "unselected-provider";
  readonly message: string;
  readonly blocksUnrelatedWork: false;
}

export interface RevenueCatCliTarget {
  readonly providerSelected: boolean;
  readonly approvedProjectId?: string;
  readonly approvedAppId?: string;
  readonly ambientProjectId?: string;
  readonly ambientProfile?: string;
  readonly appStoreKind?: "test-store" | "app-store" | "play-store" | "web-billing" | "unresolved";
  readonly hostAuthorityGranted: boolean;
  readonly hasCredential: boolean;
  readonly endpointOverride?: string;
  readonly headerOverride?: string;
  readonly proxyOverride?: boolean;
}

export function holdFromDiscovery(code: RevenueCatCliDiscoveryCode, message: string): RevenueCatCliPreflight | undefined {
  switch (code) {
    case "trusted":
      return undefined;
    case "missing":
      return { status: "hold", code: "missing-cli", message, blocksUnrelatedWork: false };
    case "unrelated-executable":
      return { status: "hold", code: "unrelated-executable", message, blocksUnrelatedWork: false };
    case "unsupported-version":
      return { status: "hold", code: "unsupported-version", message, blocksUnrelatedWork: false };
    case "unsupported-schema":
      return { status: "hold", code: "unsupported-schema", message, blocksUnrelatedWork: false };
    default: {
      const exhaustive: never = code;
      return exhaustive;
    }
  }
}

export function assessRevenueCatCliPreflight(input: {
  readonly discovery: RevenueCatCliDiscovery;
  readonly operation: CliOperationSpec;
  readonly target: RevenueCatCliTarget;
  readonly requestProjectId?: string;
  readonly requestAppId?: string;
}): RevenueCatCliPreflight {
  if (!input.target.providerSelected) {
    return {
      status: "skip",
      code: "unselected-provider",
      message: "RevenueCat CLI is present or absent; it does not change bindings or block unrelated work while RevenueCat is unselected.",
      blocksUnrelatedWork: false,
    };
  }
  const discoveryHold = holdFromDiscovery(input.discovery.code, input.discovery.message);
  if (discoveryHold) return discoveryHold;
  if (input.target.endpointOverride || input.target.headerOverride || input.target.proxyOverride) {
    return {
      status: "hold",
      code: "unsafe-override",
      message: "Refusing RC_BASE_URL, RC_HEADERS, and proxy overrides. Fixture servers must use isolated fake credentials.",
      blocksUnrelatedWork: false,
    };
  }
  if (input.operation.support !== "implemented-fixture") {
    const code: RevenueCatCliHoldCode =
      input.operation.effectClass === "raw-api"
        ? "raw-api-refused"
        : input.operation.effectClass === "nested-orchestration"
          ? "nested-orchestration-refused"
          : input.operation.effectClass === "profile-default-mutation"
            ? "profile-default-refused"
            : input.operation.experimental
              ? "experimental-unavailable"
              : "unsupported-operation";
    return {
      status: "hold",
      code,
      message: `${input.operation.id} is ${input.operation.support}. Nested setup/rico/skills, raw api, refunds, publish, and experimental store plan/apply are not generic shell routes.`,
      blocksUnrelatedWork: false,
    };
  }
  if (input.operation.requiresAuth && input.operation.effectClass !== "local-discovery" && !input.target.hasCredential) {
    return {
      status: "hold",
      code: "missing-auth",
      message: `${input.operation.id} needs an authorized secret reference. Credential files are not read to prove that a profile exists.`,
      blocksUnrelatedWork: false,
    };
  }
  if (input.operation.requiresProject) {
    const approved = input.target.approvedProjectId?.trim();
    if (!approved) {
      return {
        status: "hold",
        code: "unresolved-project",
        message: `${input.operation.id} needs an explicit approved RevenueCat project id. A profile named staging is not a Test Store.`,
        blocksUnrelatedWork: false,
      };
    }
    if (input.target.ambientProjectId && input.target.ambientProjectId !== approved) {
      return {
        status: "hold",
        code: "ambient-project-mismatch",
        message: `Ambient project ${input.target.ambientProjectId} does not match approved project ${approved}. The approved project is retained; the process is not started.`,
        blocksUnrelatedWork: false,
      };
    }
    if (input.target.ambientProfile && !input.target.approvedProjectId) {
      return {
        status: "hold",
        code: "ambiguous-project",
        message: "An ambient profile cannot select the project. Pass the approved --project-id.",
        blocksUnrelatedWork: false,
      };
    }
    const requestedProject = input.requestProjectId?.trim();
    if (!requestedProject || requestedProject !== approved) {
      return {
        status: "hold",
        code: "request-project-mismatch",
        message: `Request project ${requestedProject || "(missing)"} does not match approved project ${approved}. The approved project is retained; the process is not started.`,
        blocksUnrelatedWork: false,
      };
    }
  }
  if (input.operation.requiresApp || input.operation.effectClass === "test-store-mutation") {
    const approvedApp = input.target.approvedAppId?.trim();
    const requestedApp = input.requestAppId?.trim();
    if (!approvedApp) {
      return {
        status: "hold",
        code: "unresolved-project",
        message: `${input.operation.id} needs an explicit approved RevenueCat app id before spawn.`,
        blocksUnrelatedWork: false,
      };
    }
    if (!requestedApp || requestedApp !== approvedApp) {
      return {
        status: "hold",
        code: "request-app-mismatch",
        message: `Request app ${requestedApp || "(missing)"} does not match approved app ${approvedApp}. The approved app is retained; the process is not started.`,
        blocksUnrelatedWork: false,
      };
    }
  }
  if (input.operation.effectClass === "test-store-mutation") {
    if (input.target.appStoreKind !== "test-store") {
      return {
        status: "hold",
        code: "production-test-store-refused",
        message: "customers simulate-purchase is refused until the target RevenueCat app is verified as a Test Store. Production, App Store, Play, and unresolved apps are not Test Store.",
        blocksUnrelatedWork: false,
      };
    }
  }
  if (input.operation.requiresHostAuthority && !input.target.hostAuthorityGranted) {
    return {
      status: "hold",
      code: "authority-missing",
      message: `${input.operation.id} requires host authority before spawn. --no-input and --yes do not grant permission.`,
      blocksUnrelatedWork: false,
    };
  }
  return { status: "ready", code: "ready", message: `${input.operation.id} preflight passed.`, blocksUnrelatedWork: false };
}

export function isolatedConfigHome(root: string, workspaceKey: string): string {
  return path.join(root, "rc-config", workspaceKey);
}

export function mutationTimeoutIsUncertain(effectClass: CliEffectClass, timedOut: boolean): boolean {
  return timedOut && isMutationEffect(effectClass);
}
