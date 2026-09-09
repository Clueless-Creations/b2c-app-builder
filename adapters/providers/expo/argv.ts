/**
 * Typed Expo/EAS argv. Caller-authored extra flags are refused. Documented
 * `--non-interactive` / `--json` are added only when the retrieved CLI reference lists them.
 * Neither flag grants authority.
 */

import { getExpoEasCommand, type ExpoEasCommandId, type ExpoEasCommandSpec } from "../../../catalog/stacks/expo-eas-commands.js";

export type ExpoArgvRefusalCode =
  | "unknown-operation"
  | "unsupported-operation"
  | "model-authored-flag"
  | "missing-platform"
  | "missing-profile"
  | "missing-build-id"
  | "missing-workflow"
  | "invalid-identifier"
  | "latest-refused"
  | "platform-all-refused"
  | "yes-without-authority"
  | "auto-submit-without-authority"
  | "secret-in-argv";

export class ExpoArgvRefusal extends Error {
  readonly code: ExpoArgvRefusalCode;
  constructor(code: ExpoArgvRefusalCode, message: string) {
    super(message);
    this.name = "ExpoArgvRefusal";
    this.code = code;
  }
}

export interface ExpoEasArgvRequest {
  readonly operationId: ExpoEasCommandId;
  readonly platform?: "ios" | "android";
  readonly profile?: string;
  readonly buildId?: string;
  readonly submissionId?: string;
  readonly workflowRelativePath?: string;
  readonly outputPath?: string;
  readonly hostAuthorityGranted: boolean;
  readonly extraFlags?: readonly string[];
  readonly autoSubmit?: boolean;
  readonly wait?: boolean;
}

const SAFE_ID = /^[A-Za-z0-9._-]+$/u;
const WORKFLOW_PATH = /^\.eas\/workflows\/[A-Za-z0-9._-]+\.ya?ml$/u;

function assertSafe(value: string | undefined, label: string): void {
  if (value === undefined) return;
  if (!SAFE_ID.test(value)) throw new ExpoArgvRefusal("invalid-identifier", `${label} is not a validated identifier.`);
}

function refuseSecrets(request: ExpoEasArgvRequest): void {
  const candidates = [request.profile, request.buildId, request.submissionId, request.workflowRelativePath, request.outputPath];
  for (const value of candidates) {
    if (value && /token|password|secret|BEGIN /i.test(value)) {
      throw new ExpoArgvRefusal("secret-in-argv", "Refusing argv that looks like a secret. Tokens stay in the isolated env, never in arguments.");
    }
  }
}

export function buildExpoEasArgv(request: ExpoEasArgvRequest): string[] {
  let operation: ExpoEasCommandSpec;
  try {
    operation = getExpoEasCommand(request.operationId);
  } catch {
    throw new ExpoArgvRefusal("unknown-operation", `Unknown Expo/EAS operation ${request.operationId}.`);
  }
  if (operation.support !== "implemented-fixture") {
    throw new ExpoArgvRefusal(
      "unsupported-operation",
      `${operation.id} is ${operation.support}. Labeled-unavailable owners (#85/#86) and excluded commands are not spawned.`,
    );
  }
  if (request.extraFlags && request.extraFlags.length > 0) {
    const name = request.extraFlags[0]!.split("=")[0] ?? request.extraFlags[0];
    throw new ExpoArgvRefusal("model-authored-flag", `Refusing extra flag ${name}. Caller-authored flags are not a generic escape hatch.`);
  }
  refuseSecrets(request);
  assertSafe(request.platform, "platform");
  assertSafe(request.profile, "profile");
  assertSafe(request.buildId, "build id");
  assertSafe(request.submissionId, "submission id");
  if (request.workflowRelativePath && !WORKFLOW_PATH.test(request.workflowRelativePath)) {
    throw new ExpoArgvRefusal("missing-workflow", "Workflow path must be a reviewed `.eas/workflows/<name>.yml` file inside the app.");
  }
  if (!request.hostAuthorityGranted && operation.requiredAuthority !== "none" && operation.requiredAuthority !== "observe") {
    throw new ExpoArgvRefusal(
      "yes-without-authority",
      `${operation.id} requires host authority before the process starts. --non-interactive and --yes are not permission.`,
    );
  }
  if (request.autoSubmit && !request.hostAuthorityGranted) {
    throw new ExpoArgvRefusal(
      "auto-submit-without-authority",
      "Auto-submit is a store effect. --auto-submit and --non-interactive do not grant submission authority.",
    );
  }

  const argv: string[] = [];
  switch (operation.id) {
    case "expo.version":
      argv.push("--version");
      break;
    case "expo.whoami":
      argv.push("whoami");
      break;
    case "expo.start":
      argv.push("start");
      break;
    case "expo.run.ios":
      argv.push("run:ios");
      break;
    case "expo.run.android":
      argv.push("run:android");
      break;
    case "eas.whoami":
      argv.push("whoami");
      break;
    case "eas.project.info":
      argv.push("project:info");
      break;
    case "eas.build.cloud":
    case "eas.build.local": {
      if (!request.platform)
        throw new ExpoArgvRefusal("missing-platform", `${operation.id} requires an explicit ios or android platform. Platform all is refused.`);
      if (!request.profile) throw new ExpoArgvRefusal("missing-profile", `${operation.id} requires an explicit eas.json profile. Production is not inferred.`);
      argv.push("build", "--platform", request.platform, "--profile", request.profile);
      if (operation.id === "eas.build.local") argv.push("--local");
      if (request.autoSubmit) {
        if (!operation.documentedFlags.autoSubmit)
          throw new ExpoArgvRefusal("auto-submit-without-authority", `${operation.id} does not document --auto-submit.`);
        argv.push("--auto-submit");
      }
      if (operation.documentedFlags.json) argv.push("--json");
      if (operation.documentedFlags.nonInteractive) argv.push("--non-interactive");
      if (operation.documentedFlags.freezeCredentials) argv.push("--freeze-credentials");
      if (operation.documentedFlags.wait && request.wait !== true) argv.push("--no-wait");
      break;
    }
    case "eas.build.list":
      if (request.platform) argv.push("build:list", "--platform", request.platform);
      else argv.push("build:list");
      if (request.profile) argv.push("--build-profile", request.profile);
      if (operation.documentedFlags.json) argv.push("--json");
      if (operation.documentedFlags.nonInteractive) argv.push("--non-interactive");
      break;
    case "eas.build.view":
      if (!request.buildId) throw new ExpoArgvRefusal("missing-build-id", "eas.build.view requires the persisted remote build id.");
      argv.push("build:view", request.buildId);
      if (operation.documentedFlags.json) argv.push("--json");
      break;
    case "eas.build.cancel":
      if (!request.buildId) throw new ExpoArgvRefusal("missing-build-id", "eas.build.cancel requires the persisted remote build id.");
      argv.push("build:cancel", request.buildId);
      if (operation.documentedFlags.nonInteractive) argv.push("--non-interactive");
      break;
    case "eas.submit":
      if (!request.platform) throw new ExpoArgvRefusal("missing-platform", "eas.submit requires ios or android. Platform all is refused.");
      if (!request.profile) throw new ExpoArgvRefusal("missing-profile", "eas.submit requires an explicit submit profile.");
      if (!request.buildId)
        throw new ExpoArgvRefusal("missing-build-id", "eas.submit requires an explicit build id. --latest is refused so the artifact stays bound.");
      argv.push("submit", "--platform", request.platform, "--profile", request.profile, "--id", request.buildId);
      if (operation.documentedFlags.nonInteractive) argv.push("--non-interactive");
      if (operation.documentedFlags.wait && request.wait !== true) argv.push("--no-wait");
      break;
    case "eas.submit.list":
      argv.push("submit:list");
      if (request.platform) argv.push("--platform", request.platform);
      if (operation.documentedFlags.json) argv.push("--json");
      if (operation.documentedFlags.nonInteractive) argv.push("--non-interactive");
      break;
    case "eas.submit.view":
      if (!request.submissionId) throw new ExpoArgvRefusal("missing-build-id", "eas.submit.view requires the persisted submission id.");
      argv.push("submit:view", request.submissionId);
      if (operation.documentedFlags.json) argv.push("--json");
      if (operation.documentedFlags.nonInteractive) argv.push("--non-interactive");
      break;
    case "eas.workflow.validate":
      if (!request.workflowRelativePath) throw new ExpoArgvRefusal("missing-workflow", "workflow:validate requires a reviewed workflow file.");
      argv.push("workflow:validate", request.workflowRelativePath);
      if (operation.documentedFlags.nonInteractive) argv.push("--non-interactive");
      break;
    case "eas.workflow.run":
      if (!request.workflowRelativePath) throw new ExpoArgvRefusal("missing-workflow", "workflow:run requires a reviewed workflow file.");
      argv.push("workflow:run", request.workflowRelativePath);
      if (operation.documentedFlags.json) argv.push("--json");
      if (operation.documentedFlags.nonInteractive) argv.push("--non-interactive");
      if (operation.documentedFlags.wait && request.wait !== true) argv.push("--no-wait");
      break;
    case "eas.workflow.status":
      if (!request.buildId) throw new ExpoArgvRefusal("missing-build-id", "workflow:status requires the persisted workflow run id.");
      argv.push("workflow:status", request.buildId);
      if (operation.documentedFlags.json) argv.push("--json");
      if (operation.documentedFlags.nonInteractive) argv.push("--non-interactive");
      break;
    case "eas.workflow.runs":
      argv.push("workflow:runs");
      if (operation.documentedFlags.json) argv.push("--json");
      break;
    case "expo.prebuild":
    case "expo.export":
    case "expo.login":
    case "expo.config":
    case "eas.init":
    case "eas.credentials":
    case "eas.credentials.configure-build":
    case "eas.device.create":
    case "eas.env.exec":
    case "eas.update":
    case "eas.deploy":
    case "eas.deploy.promote":
      throw new ExpoArgvRefusal("unsupported-operation", `${operation.id} is ${operation.support} and has no argv.`);
    default: {
      const exhaustive: never = operation.id;
      throw new ExpoArgvRefusal("unknown-operation", `unhandled operation: ${String(exhaustive)}`);
    }
  }
  if (argv.includes("--latest") || argv.includes("all")) {
    if (argv.includes("--latest")) throw new ExpoArgvRefusal("latest-refused", "--latest is refused; bind the current artifact id.");
    if (argv.includes("--platform") && argv[argv.indexOf("--platform") + 1] === "all") {
      throw new ExpoArgvRefusal("platform-all-refused", "Platform all is refused so each job keeps one identity.");
    }
  }
  return argv;
}
