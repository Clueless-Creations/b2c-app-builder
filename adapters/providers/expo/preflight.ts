/**
 * Host authority and selection checks that run before any Expo/EAS process is spawned.
 */

import path from "node:path";
import {
  getExpoEasCommand,
  isRemotePaidOrPublicEffect,
  type ExpoEasCommandId,
  type ExpoEasCommandSpec,
  type RequiredAuthority,
} from "../../../catalog/stacks/expo-eas-commands.js";
import {
  EXPO_APP_RUNTIME,
  operationFor,
  resolveExpoSelection,
  type CompositionTarget,
  type ExpoSelectionKind,
  type ExpoSelectionResolution,
} from "../../../catalog/stacks/expo-selection.js";
import type { ExpoCliDiscovery } from "./discovery.js";
import { workflowTriggersExceedApproval, type ExpoEasEffectClosure } from "./effects.js";
import type { InspectedExpoProject } from "./project-config.js";

export type ExpoEasHoldCode =
  | "missing-cli"
  | "unrelated-executable"
  | "unselected-app-stack"
  | "unselected-expo-cli"
  | "unselected-eas-cli"
  | "unselected-service"
  | "authority-missing"
  | "nested-effect-ungranted"
  | "wrong-project"
  | "wrong-profile"
  | "wrong-platform"
  | "missing-eas-json"
  | "invalid-eas-json"
  | "dynamic-config-plan"
  | "unsupported-host-mode"
  | "workflow-parse"
  | "workflow-trigger-refused"
  | "unsupported-operation"
  | "labeled-unavailable"
  | "passive-plan"
  | "missing-auth"
  | "mutation-uncertain"
  | "latest-refused";

export type ExpoEasPreflightStatus = "hold" | "skip" | "ready";

export interface ExpoEasPreflight {
  readonly status: ExpoEasPreflightStatus;
  readonly code: ExpoEasHoldCode | "ready";
  readonly message: string;
  readonly blocksUnrelatedWork: false;
}

export interface DeveloperHostFacts {
  readonly os: "darwin" | "linux" | "win32" | "other";
  readonly xcodeAvailable: boolean;
  readonly androidSdkAvailable: boolean;
}

export interface ExpoEasTarget {
  readonly compositionTarget: CompositionTarget;
  readonly selectedServices: readonly ExpoSelectionKind[];
  readonly approvedProjectId?: string;
  readonly approvedProfile?: string;
  readonly approvedPlatform?: "ios" | "android" | "web";
  readonly hostAuthorityGranted: boolean;
  readonly grantedAuthority: RequiredAuthority;
  readonly hasCredential: boolean;
  readonly allowWorkflowTriggers: boolean;
  readonly mode: "plan" | "dispatch";
  readonly host: DeveloperHostFacts;
}

function hold(code: ExpoEasHoldCode, message: string): ExpoEasPreflight {
  return { status: "hold", code, message, blocksUnrelatedWork: false };
}

function skip(code: ExpoEasHoldCode, message: string): ExpoEasPreflight {
  return { status: "skip", code, message, blocksUnrelatedWork: false };
}

export function isolatedConfigHome(root: string, workspaceId: string): string {
  return path.join(root, "homes", workspaceId);
}

function iosLocalNeedsXcode(commandId: ExpoEasCommandId, platform: "ios" | "android" | undefined): boolean {
  if (commandId === "expo.run.ios") return true;
  if (commandId === "eas.build.local" && platform === "ios") return true;
  return false;
}

function androidLocalNeedsSdk(commandId: ExpoEasCommandId, platform: "ios" | "android" | undefined): boolean {
  if (commandId === "expo.run.android") return true;
  if (commandId === "eas.build.local" && platform === "android") return true;
  return false;
}

export function assessExpoEasPreflight(input: {
  readonly discovery: ExpoCliDiscovery;
  readonly commandId: ExpoEasCommandId;
  readonly target: ExpoEasTarget;
  readonly project: InspectedExpoProject;
  readonly closure: ExpoEasEffectClosure;
  readonly requestProjectId?: string;
  readonly requestProfile?: string;
  readonly requestPlatform?: "ios" | "android";
}): ExpoEasPreflight {
  const spec: ExpoEasCommandSpec = getExpoEasCommand(input.commandId);
  const resolution: ExpoSelectionResolution = resolveExpoSelection({
    compositionTarget: input.target.compositionTarget,
    selectedServices: input.target.selectedServices,
  });
  if (!resolution.appStackSelected && input.target.compositionTarget.runtime !== EXPO_APP_RUNTIME) {
    return skip("unselected-app-stack", "Expo app stack is not the composition target. Expo/EAS CLI stays idle and does not block unrelated work.");
  }
  if (!resolution.appStackSelected) {
    return skip("unselected-app-stack", "Expo was not selected as the app runtime. Detection of a dependency is not consent to run Expo or EAS.");
  }
  if (spec.tool === "expo-cli" && !input.target.selectedServices.includes("expo-cli")) {
    return skip("unselected-expo-cli", "Expo CLI is unselected. The app stack selection does not spawn Expo CLI.");
  }
  if (spec.tool === "eas-cli" && !input.target.selectedServices.includes("eas-cli")) {
    return skip("unselected-eas-cli", "EAS CLI is unselected. Unselected EAS must not run.");
  }
  if (spec.requiredSelection !== "expo-cli" && spec.requiredSelection !== "eas-cli" && spec.requiredSelection !== "developer-host") {
    if (!input.target.selectedServices.includes(spec.requiredSelection)) {
      return skip("unselected-service", `Unselected ${spec.requiredSelection} stays idle. ${spec.id} is not dispatched.`);
    }
  }
  if (spec.support === "labeled-unavailable") {
    return hold("labeled-unavailable", `${spec.id} is classified for issue #${spec.queuedIssue} and is labeled unavailable. It is not spawned.`);
  }
  if (spec.support !== "implemented-fixture") {
    return hold("unsupported-operation", `${spec.id} is ${spec.support}. Passive plan does not run eas init, credentials, env:exec, or prebuild.`);
  }
  if (input.discovery.code === "missing") return hold("missing-cli", input.discovery.message);
  if (input.discovery.code === "unrelated-executable") return hold("unrelated-executable", input.discovery.message);
  if (!input.project.easJsonParseOk) return hold("invalid-eas-json", "eas.json is present but not static JSON. Dynamic evaluation is refused.");
  if (spec.projectLinkRequired && !input.project.easJsonPresent) {
    return hold("missing-eas-json", `${spec.id} needs an existing eas.json. eas init is not run to create one.`);
  }
  if (
    input.target.mode === "dispatch" &&
    input.project.dynamicConfigPresent &&
    spec.effects.configPluginEvaluation &&
    input.target.grantedAuthority === "observe"
  ) {
    return hold("dynamic-config-plan", "Dynamic app.config.js/ts is present. Passive inspection does not evaluate it.");
  }
  const approvedPlatform = input.target.approvedPlatform;
  if (input.requestPlatform && approvedPlatform && approvedPlatform !== "web" && input.requestPlatform !== approvedPlatform) {
    return hold("wrong-platform", `Requested platform ${input.requestPlatform} does not match approved ${approvedPlatform}.`);
  }
  if (input.requestProfile && input.target.approvedProfile && input.requestProfile !== input.target.approvedProfile) {
    return hold("wrong-profile", `Requested profile ${input.requestProfile} does not match approved ${input.target.approvedProfile}.`);
  }
  if (spec.projectLinkRequired) {
    const approved = input.target.approvedProjectId?.trim();
    if (approved && input.project.linkedProjectId && input.project.linkedProjectId !== approved) {
      return hold("wrong-project", `Linked EAS project ${input.project.linkedProjectId} does not match approved ${approved}. Refusing before a remote effect.`);
    }
    if (approved && input.requestProjectId && input.requestProjectId !== approved) {
      return hold("wrong-project", `Request project ${input.requestProjectId} does not match approved ${approved}.`);
    }
  }
  if (iosLocalNeedsXcode(spec.id, input.requestPlatform) && (input.target.host.os !== "darwin" || !input.target.host.xcodeAvailable)) {
    return hold(
      "unsupported-host-mode",
      "iOS local compile needs macOS and Xcode. A Linux host cannot claim it ran Xcode. Select an authorized EAS cloud route instead.",
    );
  }
  if (androidLocalNeedsSdk(spec.id, input.requestPlatform) && !input.target.host.androidSdkAvailable) {
    return hold("unsupported-host-mode", "Android local compile needs an Android SDK on this host. Cloud build is a separately authorized route.");
  }
  if (input.closure.workflow && !input.closure.workflow.parseOk) {
    return hold("workflow-parse", "Workflow YAML did not parse. Nested effects are unknown; dispatch is refused.");
  }
  if (workflowTriggersExceedApproval(input.closure, input.target.allowWorkflowTriggers)) {
    return hold(
      "workflow-trigger-refused",
      "Workflow default push, pull_request, or schedule triggers exceed a one-shot approved effect. They are not enabled.",
    );
  }
  if (input.target.mode === "plan") {
    return hold("passive-plan", "Passive plan classified effects and did not spawn a process, evaluate plugins, log in, or run eas init.");
  }
  if (spec.accountRequired && !input.target.hasCredential) {
    return hold("missing-auth", `${spec.id} needs an authorized Expo token reference. Credential files are not read to prove login.`);
  }
  const granted = input.target.grantedAuthority;
  const needed = input.closure.requiredAuthority;
  const grantedOk = input.target.hostAuthorityGranted && authoritySatisfies(granted, needed);
  if (!grantedOk && needed !== "none" && needed !== "observe") {
    return hold(
      "authority-missing",
      `${spec.id} requires ${needed} authority before dispatch. --non-interactive and --yes do not grant it. Nested effects: ${input.closure.nested.join(", ") || "none"}.`,
    );
  }
  if (!grantedOk && isRemotePaidOrPublicEffect(input.closure.vector)) {
    return hold("nested-effect-ungranted", `Aggregate effects ${input.closure.nested.join(", ")} exceed granted ${granted}.`);
  }
  if (input.closure.vector.autoSubmit && (!input.target.selectedServices.includes("eas-submit") || !authoritySatisfies(granted, "submit"))) {
    return hold("nested-effect-ungranted", "Auto-submit or a workflow submit job is a store effect. It cannot ride along with an authorized build.");
  }
  if (input.closure.vector.otaPublication && !authoritySatisfies(granted, "publish")) {
    return hold("nested-effect-ungranted", "OTA publication is a nested #85 effect. It is not granted by a build command.");
  }
  if (input.closure.vector.serverDeployment && !authoritySatisfies(granted, "publish")) {
    return hold("nested-effect-ungranted", "Server deployment (EAS Hosting or EXPO_UNSTABLE_DEPLOY_SERVER) is a nested #86 effect.");
  }
  if (input.closure.vector.productionPromotion && !authoritySatisfies(granted, "promote")) {
    return hold("nested-effect-ungranted", "Production promotion is a nested extra effect and is not granted by deploy or build.");
  }
  const mapping = operationFor(resolution, mappingOperation(spec.id));
  if (mapping.evidenceTier === "blocked" && spec.requiredSelection !== "expo-cli") {
    return skip("unselected-service", mapping.notes);
  }
  return { status: "ready", code: "ready", message: `${spec.id} preflight ready. Live cloud/signing remain separately evidenced.`, blocksUnrelatedWork: false };
}

function mappingOperation(
  commandId: ExpoEasCommandId,
):
  | "expo-cli-process"
  | "direct-local-compile"
  | "eas-local-build"
  | "eas-cloud-build"
  | "eas-workflows"
  | "store-handoff"
  | "eas-update"
  | "eas-hosting"
  | "expo-web-export"
  | "cng-prebuild" {
  switch (commandId) {
    case "expo.version":
    case "expo.whoami":
    case "expo.start":
    case "expo.login":
    case "expo.config":
      return "expo-cli-process";
    case "expo.run.ios":
    case "expo.run.android":
      return "direct-local-compile";
    case "expo.prebuild":
      return "cng-prebuild";
    case "expo.export":
      return "expo-web-export";
    case "eas.build.local":
      return "eas-local-build";
    case "eas.build.cloud":
    case "eas.build.list":
    case "eas.build.view":
    case "eas.build.cancel":
      return "eas-cloud-build";
    case "eas.submit":
    case "eas.submit.list":
    case "eas.submit.view":
      return "store-handoff";
    case "eas.workflow.validate":
    case "eas.workflow.run":
    case "eas.workflow.status":
    case "eas.workflow.runs":
      return "eas-workflows";
    case "eas.update":
      return "eas-update";
    case "eas.deploy":
    case "eas.deploy.promote":
      return "eas-hosting";
    case "eas.whoami":
    case "eas.project.info":
    case "eas.init":
    case "eas.credentials":
    case "eas.credentials.configure-build":
    case "eas.device.create":
    case "eas.env.exec":
      return "expo-cli-process";
    default: {
      const exhaustive: never = commandId;
      throw new Error(`unhandled command mapping: ${String(exhaustive)}`);
    }
  }
}

export function authoritySatisfies(granted: RequiredAuthority, needed: RequiredAuthority): boolean {
  const rank = (value: RequiredAuthority): number => {
    switch (value) {
      case "none":
        return 0;
      case "observe":
        return 1;
      case "compile":
        return 2;
      case "mutate":
        return 3;
      case "spend":
        return 4;
      case "submit":
        return 5;
      case "publish":
        return 6;
      case "promote":
        return 7;
      default: {
        const exhaustive: never = value;
        return exhaustive;
      }
    }
  };
  return rank(granted) >= rank(needed);
}
