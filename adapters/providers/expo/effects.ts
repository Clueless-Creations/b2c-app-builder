/**
 * Aggregate Expo/EAS effect closure.
 *
 * A build-looking command can still auto-submit, publish an OTA, deploy a server, run hooks,
 * upload source, or spend credits. Gate the union before spawn, not after a nested action.
 */

import {
  authorityForEffects,
  getExpoEasCommand,
  maxAuthority,
  type ExpoEasCommandId,
  type ExpoEasEffectVector,
  type RequiredAuthority,
} from "../../../catalog/stacks/expo-eas-commands.js";
import { inspectExpoProject, type InspectedExpoProject, type InspectedWorkflow } from "./project-config.js";

export type NestedEffectKind =
  | "build-hook"
  | "source-upload"
  | "cloud-credits"
  | "credential-change"
  | "auto-submit"
  | "server-deployment"
  | "ota-publication"
  | "production-promotion"
  | "store-submission"
  | "workflow-trigger"
  | "device-registration"
  | "config-plugin-evaluation";

export interface ExpoEasEffectClosure {
  readonly commandId: ExpoEasCommandId;
  readonly vector: ExpoEasEffectVector;
  readonly nested: readonly NestedEffectKind[];
  readonly requiredAuthority: RequiredAuthority;
  readonly workflow?: InspectedWorkflow;
}

export interface EffectInspectionRequest {
  readonly commandId: ExpoEasCommandId;
  readonly profile?: string;
  readonly autoSubmitRequested?: boolean;
  readonly workflowRelativePath?: string;
}

function withEffect(vector: ExpoEasEffectVector, key: keyof ExpoEasEffectVector): ExpoEasEffectVector {
  if (vector[key]) return vector;
  return { ...vector, [key]: true };
}

function workflowEffects(workflow: InspectedWorkflow): { vector: ExpoEasEffectVector; nested: NestedEffectKind[] } {
  let vector: ExpoEasEffectVector = {
    localCodeExecution: false,
    sourceUpload: true,
    cloudCredits: true,
    credentialMutation: false,
    autoSubmit: false,
    serverDeployment: false,
    otaPublication: false,
    productionPromotion: false,
    storeSubmission: false,
    deviceRegistration: false,
    configPluginEvaluation: true,
  };
  const nested: NestedEffectKind[] = ["source-upload", "cloud-credits", "config-plugin-evaluation"];
  for (const jobType of workflow.jobTypes) {
    switch (jobType) {
      case "build":
        nested.push("cloud-credits");
        break;
      case "submit":
        vector = withEffect(vector, "storeSubmission");
        vector = withEffect(vector, "autoSubmit");
        nested.push("auto-submit", "store-submission");
        break;
      case "update":
        vector = withEffect(vector, "otaPublication");
        nested.push("ota-publication");
        break;
      case "deploy":
        vector = withEffect(vector, "serverDeployment");
        nested.push("server-deployment");
        break;
      case "fingerprint":
      case "get-build":
      case "require":
      case "unknown":
        break;
      default: {
        const exhaustive: never = jobType;
        throw new Error(`unhandled workflow job type: ${String(exhaustive)}`);
      }
    }
  }
  if (workflow.hasPushTrigger || workflow.hasPullRequestTrigger || workflow.hasScheduleTrigger) {
    nested.push("workflow-trigger");
  }
  return { vector, nested };
}

export function inspectCommandEffects(project: InspectedExpoProject, request: EffectInspectionRequest): ExpoEasEffectClosure {
  const command = getExpoEasCommand(request.commandId);
  let vector = command.effects;
  const nested: NestedEffectKind[] = [];
  if (vector.sourceUpload) nested.push("source-upload");
  if (vector.cloudCredits) nested.push("cloud-credits");
  if (vector.credentialMutation) nested.push("credential-change");
  if (vector.deviceRegistration) nested.push("device-registration");
  if (vector.configPluginEvaluation) nested.push("config-plugin-evaluation");
  if (vector.otaPublication) nested.push("ota-publication");
  if (vector.serverDeployment) nested.push("server-deployment");
  if (vector.productionPromotion) nested.push("production-promotion");
  if (vector.storeSubmission) nested.push("store-submission");
  if (
    project.npmHooks.length > 0 &&
    (request.commandId === "eas.build.cloud" || request.commandId === "eas.build.local" || request.commandId === "eas.workflow.run")
  ) {
    vector = withEffect(vector, "localCodeExecution");
    nested.push("build-hook");
  }
  const profile = request.profile;
  if (profile && project.profileAutoSubmit[profile]) {
    vector = withEffect(vector, "autoSubmit");
    vector = withEffect(vector, "storeSubmission");
    nested.push("auto-submit", "store-submission");
  }
  if (profile && project.profileDeployServer[profile]) {
    vector = withEffect(vector, "serverDeployment");
    nested.push("server-deployment");
  }
  if (request.autoSubmitRequested) {
    vector = withEffect(vector, "autoSubmit");
    vector = withEffect(vector, "storeSubmission");
    nested.push("auto-submit", "store-submission");
  }
  let workflow: InspectedWorkflow | undefined;
  if (request.workflowRelativePath) {
    workflow = project.workflows.find((entry) => entry.relativePath === request.workflowRelativePath);
    if (workflow) {
      const extra = workflowEffects(workflow);
      vector = {
        localCodeExecution: vector.localCodeExecution || extra.vector.localCodeExecution,
        sourceUpload: vector.sourceUpload || extra.vector.sourceUpload,
        cloudCredits: vector.cloudCredits || extra.vector.cloudCredits,
        credentialMutation: vector.credentialMutation || extra.vector.credentialMutation,
        autoSubmit: vector.autoSubmit || extra.vector.autoSubmit,
        serverDeployment: vector.serverDeployment || extra.vector.serverDeployment,
        otaPublication: vector.otaPublication || extra.vector.otaPublication,
        productionPromotion: vector.productionPromotion || extra.vector.productionPromotion,
        storeSubmission: vector.storeSubmission || extra.vector.storeSubmission,
        deviceRegistration: vector.deviceRegistration || extra.vector.deviceRegistration,
        configPluginEvaluation: vector.configPluginEvaluation || extra.vector.configPluginEvaluation,
      };
      nested.push(...extra.nested);
    }
  }
  const requiredAuthority = maxAuthority(command.requiredAuthority, authorityForEffects(vector, command.requiredAuthority));
  return { commandId: request.commandId, vector, nested: [...new Set(nested)], requiredAuthority, workflow };
}

export function inspectProjectCommandEffects(projectRoot: string, request: EffectInspectionRequest): ExpoEasEffectClosure {
  return inspectCommandEffects(inspectExpoProject(projectRoot), request);
}

export function workflowTriggersExceedApproval(closure: ExpoEasEffectClosure, allowTriggers: boolean): boolean {
  if (allowTriggers) return false;
  return Boolean(closure.workflow && (closure.workflow.hasPushTrigger || closure.workflow.hasPullRequestTrigger || closure.workflow.hasScheduleTrigger));
}
