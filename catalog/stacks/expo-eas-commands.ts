/**
 * Expo CLI / EAS CLI command-to-effect matrix (#84).
 *
 * Documented from the EAS CLI 23.2.0 reference and the Expo CLI command page retrieved
 * 2026-09-09. That is not an executed-binary proof and not a `/latest/` pin. Examples on the
 * site are not proof a host supports every flag.
 *
 * #85 and #86 add update and hosting semantics through these rows. They do not get a second
 * process runner. Unselected EAS services stay idle.
 *
 * This module classifies commands and effects. It does not spawn a process and does not grant
 * authority. `--non-interactive` and `--yes` are documented flags, not permission.
 */

import type { ExpoSelectionKind } from "./expo-selection.js";

export const EXPO_EAS_COMMAND_MATRIX_PATH = "catalog/stacks/expo-eas-commands.ts" as const;

/** Documented EAS CLI version on the retrieved reference page. Not a host observation. */
export const EAS_CLI_DOCUMENTED_VERSION = "23.2.0" as const;
export const EXPO_EAS_DOCS_RETRIEVED_ON = "2026-09-09" as const;

export const EXPO_EAS_COMMAND_SOURCES = {
  easCli: "https://docs.expo.dev/eas/cli/",
  expoCli: "https://docs.expo.dev/more/expo-cli/",
  localBuilds: "https://docs.expo.dev/build-reference/local-builds/",
  workflows: "https://docs.expo.dev/eas/workflows/introduction/",
  easJson: "https://docs.expo.dev/build/eas-json/",
  submitIos: "https://docs.expo.dev/submit/ios/",
  submitAndroid: "https://docs.expo.dev/submit/android/",
  envVars: "https://docs.expo.dev/eas/environment-variables/",
  easIgnore: "https://docs.expo.dev/build-reference/easignore/",
  npmHooks: "https://docs.expo.dev/build-reference/npm-hooks/",
  automateSubmissions: "https://docs.expo.dev/build/automate-submissions/",
} as const;

export type ExpoEasTool = "expo-cli" | "eas-cli";

export type ExpoEasCommandId =
  | "expo.version"
  | "expo.whoami"
  | "expo.start"
  | "expo.run.ios"
  | "expo.run.android"
  | "expo.prebuild"
  | "expo.export"
  | "expo.login"
  | "expo.config"
  | "eas.whoami"
  | "eas.project.info"
  | "eas.build.cloud"
  | "eas.build.local"
  | "eas.build.list"
  | "eas.build.view"
  | "eas.build.cancel"
  | "eas.submit"
  | "eas.submit.list"
  | "eas.submit.view"
  | "eas.workflow.validate"
  | "eas.workflow.run"
  | "eas.workflow.status"
  | "eas.workflow.runs"
  | "eas.init"
  | "eas.credentials"
  | "eas.credentials.configure-build"
  | "eas.device.create"
  | "eas.env.exec"
  | "eas.update"
  | "eas.deploy"
  | "eas.deploy.promote";

export type CommandSupport = "implemented-fixture" | "labeled-unavailable" | "deliberately-excluded";

export type NetworkRequirement = "none-guaranteed" | "possible-dev-services" | "account-and-project-check" | "upload-and-credits";

export type HostToolchainNeed = "none" | "xcode" | "android-sdk";

export type RequiredAuthority = "none" | "observe" | "compile" | "spend" | "mutate" | "submit" | "publish" | "promote";

export interface DocumentedFlags {
  readonly json: boolean;
  readonly nonInteractive: boolean;
  readonly yes: boolean;
  readonly local: boolean;
  readonly autoSubmit: boolean;
  readonly wait: boolean;
}

export interface ExpoEasEffectVector {
  readonly localCodeExecution: boolean;
  readonly sourceUpload: boolean;
  readonly cloudCredits: boolean;
  readonly credentialMutation: boolean;
  readonly autoSubmit: boolean;
  readonly serverDeployment: boolean;
  readonly otaPublication: boolean;
  readonly productionPromotion: boolean;
  readonly storeSubmission: boolean;
  readonly deviceRegistration: boolean;
  readonly configPluginEvaluation: boolean;
}

export interface ExpoEasCommandSpec {
  readonly id: ExpoEasCommandId;
  readonly title: string;
  readonly tool: ExpoEasTool;
  readonly command: readonly string[];
  readonly requiredSelection: ExpoSelectionKind;
  readonly queuedIssue: 82 | 84 | 85 | 86;
  readonly support: CommandSupport;
  readonly effects: ExpoEasEffectVector;
  readonly network: NetworkRequirement;
  readonly hostToolchain: HostToolchainNeed;
  readonly accountRequired: boolean;
  readonly projectLinkRequired: boolean;
  readonly requiredAuthority: RequiredAuthority;
  readonly documentedFlags: DocumentedFlags;
  readonly notes: string;
  readonly docsUrl: string;
}

const none: ExpoEasEffectVector = Object.freeze({
  localCodeExecution: false,
  sourceUpload: false,
  cloudCredits: false,
  credentialMutation: false,
  autoSubmit: false,
  serverDeployment: false,
  otaPublication: false,
  productionPromotion: false,
  storeSubmission: false,
  deviceRegistration: false,
  configPluginEvaluation: false,
});

const flags = (partial: Partial<DocumentedFlags> = {}): DocumentedFlags => ({
  json: false,
  nonInteractive: false,
  yes: false,
  local: false,
  autoSubmit: false,
  wait: false,
  ...partial,
});

function spec(entry: ExpoEasCommandSpec): ExpoEasCommandSpec {
  return entry;
}

export const EXPO_EAS_COMMANDS: readonly ExpoEasCommandSpec[] = [
  spec({
    id: "expo.version",
    title: "Expo CLI version",
    tool: "expo-cli",
    command: ["--version"],
    requiredSelection: "expo-cli",
    queuedIssue: 84,
    support: "implemented-fixture",
    effects: none,
    network: "none-guaranteed",
    hostToolchain: "none",
    accountRequired: false,
    projectLinkRequired: false,
    requiredAuthority: "none",
    documentedFlags: flags(),
    notes: "Local version probe. Do not treat docs /latest/ as this binary.",
    docsUrl: EXPO_EAS_COMMAND_SOURCES.expoCli,
  }),
  spec({
    id: "expo.whoami",
    title: "Expo CLI whoami",
    tool: "expo-cli",
    command: ["whoami"],
    requiredSelection: "expo-cli",
    queuedIssue: 84,
    support: "implemented-fixture",
    effects: none,
    network: "possible-dev-services",
    hostToolchain: "none",
    accountRequired: false,
    projectLinkRequired: false,
    requiredAuthority: "observe",
    documentedFlags: flags(),
    notes: "Account read. JSON flag is not assumed; the Expo CLI page documents whoami without --json.",
    docsUrl: EXPO_EAS_COMMAND_SOURCES.expoCli,
  }),
  spec({
    id: "expo.start",
    title: "Expo start Metro",
    tool: "expo-cli",
    command: ["start"],
    requiredSelection: "expo-cli",
    queuedIssue: 84,
    support: "implemented-fixture",
    effects: { ...none, localCodeExecution: true },
    network: "possible-dev-services",
    hostToolchain: "none",
    accountRequired: false,
    projectLinkRequired: false,
    requiredAuthority: "compile",
    documentedFlags: flags(),
    notes: "Dev server. Not offline: Metro and devices may use the network. Not an EAS job.",
    docsUrl: EXPO_EAS_COMMAND_SOURCES.expoCli,
  }),
  spec({
    id: "expo.run.ios",
    title: "Direct local iOS compile",
    tool: "expo-cli",
    command: ["run:ios"],
    requiredSelection: "expo-cli",
    queuedIssue: 84,
    support: "implemented-fixture",
    effects: { ...none, localCodeExecution: true },
    network: "possible-dev-services",
    hostToolchain: "xcode",
    accountRequired: false,
    projectLinkRequired: false,
    requiredAuthority: "compile",
    documentedFlags: flags(),
    notes: "Direct local compile, not EAS local. Requires macOS/Xcode. CocoaPods may still use the network. Linux cannot claim this ran.",
    docsUrl: EXPO_EAS_COMMAND_SOURCES.expoCli,
  }),
  spec({
    id: "expo.run.android",
    title: "Direct local Android compile",
    tool: "expo-cli",
    command: ["run:android"],
    requiredSelection: "expo-cli",
    queuedIssue: 84,
    support: "implemented-fixture",
    effects: { ...none, localCodeExecution: true },
    network: "possible-dev-services",
    hostToolchain: "android-sdk",
    accountRequired: false,
    projectLinkRequired: false,
    requiredAuthority: "compile",
    documentedFlags: flags(),
    notes: "Direct local compile, not EAS local. Needs an Android SDK. Gradle may still use the network.",
    docsUrl: EXPO_EAS_COMMAND_SOURCES.expoCli,
  }),
  spec({
    id: "expo.prebuild",
    title: "Continuous native generation",
    tool: "expo-cli",
    command: ["prebuild"],
    requiredSelection: "expo-cli",
    queuedIssue: 82,
    support: "deliberately-excluded",
    effects: { ...none, localCodeExecution: true, configPluginEvaluation: true },
    network: "possible-dev-services",
    hostToolchain: "none",
    accountRequired: false,
    projectLinkRequired: false,
    requiredAuthority: "mutate",
    documentedFlags: flags(),
    notes: "#82 owns native-directory ownership. This executor classifies the effect and refuses to spawn prebuild.",
    docsUrl: EXPO_EAS_COMMAND_SOURCES.expoCli,
  }),
  spec({
    id: "expo.export",
    title: "Expo web/export",
    tool: "expo-cli",
    command: ["export"],
    requiredSelection: "shipping-platform",
    queuedIssue: 86,
    support: "labeled-unavailable",
    effects: { ...none, localCodeExecution: true },
    network: "possible-dev-services",
    hostToolchain: "none",
    accountRequired: false,
    projectLinkRequired: false,
    requiredAuthority: "compile",
    documentedFlags: flags(),
    notes: "#86 owns export/hosting semantics. Classified here so a later owner can dispatch through this executor.",
    docsUrl: EXPO_EAS_COMMAND_SOURCES.expoCli,
  }),
  spec({
    id: "expo.login",
    title: "Expo CLI login",
    tool: "expo-cli",
    command: ["login"],
    requiredSelection: "expo-cli",
    queuedIssue: 84,
    support: "deliberately-excluded",
    effects: { ...none, credentialMutation: true },
    network: "account-and-project-check",
    hostToolchain: "none",
    accountRequired: true,
    projectLinkRequired: false,
    requiredAuthority: "mutate",
    documentedFlags: flags(),
    notes: "Passive plan and fixtures do not log in. Account changes stay founder-gated.",
    docsUrl: EXPO_EAS_COMMAND_SOURCES.expoCli,
  }),
  spec({
    id: "expo.config",
    title: "Evaluate app config",
    tool: "expo-cli",
    command: ["config"],
    requiredSelection: "expo-cli",
    queuedIssue: 84,
    support: "deliberately-excluded",
    effects: { ...none, localCodeExecution: true, configPluginEvaluation: true },
    network: "possible-dev-services",
    hostToolchain: "none",
    accountRequired: false,
    projectLinkRequired: false,
    requiredAuthority: "observe",
    documentedFlags: flags({ json: true }),
    notes: "Evaluates dynamic config and plugins. Passive inspection parses static JSON/YAML only.",
    docsUrl: EXPO_EAS_COMMAND_SOURCES.expoCli,
  }),
  spec({
    id: "eas.whoami",
    title: "EAS whoami",
    tool: "eas-cli",
    command: ["whoami"],
    requiredSelection: "eas-cli",
    queuedIssue: 84,
    support: "implemented-fixture",
    effects: none,
    network: "account-and-project-check",
    hostToolchain: "none",
    accountRequired: true,
    projectLinkRequired: false,
    requiredAuthority: "observe",
    documentedFlags: flags(),
    notes: "EAS CLI 23.2.0 documents `eas whoami` with no --json and no --non-interactive.",
    docsUrl: EXPO_EAS_COMMAND_SOURCES.easCli,
  }),
  spec({
    id: "eas.project.info",
    title: "EAS project info",
    tool: "eas-cli",
    command: ["project:info"],
    requiredSelection: "eas-cli",
    queuedIssue: 84,
    support: "implemented-fixture",
    effects: none,
    network: "account-and-project-check",
    hostToolchain: "none",
    accountRequired: true,
    projectLinkRequired: true,
    requiredAuthority: "observe",
    documentedFlags: flags(),
    notes: "Read the linked EAS project. Does not run eas init.",
    docsUrl: EXPO_EAS_COMMAND_SOURCES.easCli,
  }),
  spec({
    id: "eas.build.cloud",
    title: "EAS cloud build",
    tool: "eas-cli",
    command: ["build"],
    requiredSelection: "eas-build",
    queuedIssue: 84,
    support: "implemented-fixture",
    effects: { ...none, sourceUpload: true, cloudCredits: true, configPluginEvaluation: true },
    network: "upload-and-credits",
    hostToolchain: "none",
    accountRequired: true,
    projectLinkRequired: true,
    requiredAuthority: "spend",
    documentedFlags: flags({ json: true, nonInteractive: true, local: true, autoSubmit: true, wait: true }),
    notes:
      "Uploads source and may consume credits. --auto-submit is a nested store effect. --non-interactive is not permission. --local is a different operation.",
    docsUrl: EXPO_EAS_COMMAND_SOURCES.easCli,
  }),
  spec({
    id: "eas.build.local",
    title: "EAS local build",
    tool: "eas-cli",
    command: ["build", "--local"],
    requiredSelection: "eas-build",
    queuedIssue: 84,
    support: "implemented-fixture",
    effects: { ...none, localCodeExecution: true, configPluginEvaluation: true },
    network: "account-and-project-check",
    hostToolchain: "none",
    accountRequired: true,
    projectLinkRequired: true,
    requiredAuthority: "compile",
    documentedFlags: flags({ json: true, nonInteractive: true, local: true, autoSubmit: true, wait: true }),
    notes:
      "Documented experimental. Still authenticates and checks the EAS project; may download managed credentials. Not fully offline. Not identical to expo run:*. Platform `all` is disabled locally. iOS local still needs Xcode; Android local still needs an Android SDK. Live host toolchain remains not-run.",
    docsUrl: EXPO_EAS_COMMAND_SOURCES.localBuilds,
  }),
  spec({
    id: "eas.build.list",
    title: "List EAS builds",
    tool: "eas-cli",
    command: ["build:list"],
    requiredSelection: "eas-build",
    queuedIssue: 84,
    support: "implemented-fixture",
    effects: none,
    network: "account-and-project-check",
    hostToolchain: "none",
    accountRequired: true,
    projectLinkRequired: true,
    requiredAuthority: "observe",
    documentedFlags: flags({ json: true, nonInteractive: true }),
    notes: "Readback. Does not create a build.",
    docsUrl: EXPO_EAS_COMMAND_SOURCES.easCli,
  }),
  spec({
    id: "eas.build.view",
    title: "View one EAS build",
    tool: "eas-cli",
    command: ["build:view"],
    requiredSelection: "eas-build",
    queuedIssue: 84,
    support: "implemented-fixture",
    effects: none,
    network: "account-and-project-check",
    hostToolchain: "none",
    accountRequired: true,
    projectLinkRequired: true,
    requiredAuthority: "observe",
    documentedFlags: flags({ json: true }),
    notes: "Documented `--json` only. Used to reconcile an uncertain paid build before retry.",
    docsUrl: EXPO_EAS_COMMAND_SOURCES.easCli,
  }),
  spec({
    id: "eas.build.cancel",
    title: "Cancel an EAS build",
    tool: "eas-cli",
    command: ["build:cancel"],
    requiredSelection: "eas-build",
    queuedIssue: 84,
    support: "implemented-fixture",
    effects: { ...none, cloudCredits: true },
    network: "account-and-project-check",
    hostToolchain: "none",
    accountRequired: true,
    projectLinkRequired: true,
    requiredAuthority: "spend",
    documentedFlags: flags({ nonInteractive: true }),
    notes: "Cancels a remote job. Requires the persisted build id. --non-interactive is not permission.",
    docsUrl: EXPO_EAS_COMMAND_SOURCES.easCli,
  }),
  spec({
    id: "eas.submit",
    title: "Submit a binary to a store",
    tool: "eas-cli",
    command: ["submit"],
    requiredSelection: "eas-submit",
    queuedIssue: 84,
    support: "implemented-fixture",
    effects: { ...none, storeSubmission: true, sourceUpload: true },
    network: "upload-and-credits",
    hostToolchain: "none",
    accountRequired: true,
    projectLinkRequired: true,
    requiredAuthority: "submit",
    documentedFlags: flags({ nonInteractive: true, wait: true }),
    notes:
      "EAS CLI 23.2.0 documents submit without --json. Alias eas build:submit. Success is not TestFlight availability, review, approval, or release. --latest is refused. Live store submit remains not-run.",
    docsUrl: EXPO_EAS_COMMAND_SOURCES.submitIos,
  }),
  spec({
    id: "eas.submit.list",
    title: "List submissions",
    tool: "eas-cli",
    command: ["submit:list"],
    requiredSelection: "eas-submit",
    queuedIssue: 84,
    support: "implemented-fixture",
    effects: none,
    network: "account-and-project-check",
    hostToolchain: "none",
    accountRequired: true,
    projectLinkRequired: true,
    requiredAuthority: "observe",
    documentedFlags: flags({ json: true, nonInteractive: true }),
    notes: "Readback of submission jobs. Does not prove release.",
    docsUrl: EXPO_EAS_COMMAND_SOURCES.easCli,
  }),
  spec({
    id: "eas.submit.view",
    title: "View one submission",
    tool: "eas-cli",
    command: ["submit:view"],
    requiredSelection: "eas-submit",
    queuedIssue: 84,
    support: "implemented-fixture",
    effects: none,
    network: "account-and-project-check",
    hostToolchain: "none",
    accountRequired: true,
    projectLinkRequired: true,
    requiredAuthority: "observe",
    documentedFlags: flags({ json: true, nonInteractive: true }),
    notes: "Reconcile an uncertain submit before retry. Finished is not released.",
    docsUrl: EXPO_EAS_COMMAND_SOURCES.easCli,
  }),
  spec({
    id: "eas.workflow.validate",
    title: "Validate an EAS workflow file",
    tool: "eas-cli",
    command: ["workflow:validate"],
    requiredSelection: "eas-workflows",
    queuedIssue: 84,
    support: "implemented-fixture",
    effects: none,
    network: "possible-dev-services",
    hostToolchain: "none",
    accountRequired: false,
    projectLinkRequired: false,
    requiredAuthority: "observe",
    documentedFlags: flags({ nonInteractive: true }),
    notes: "Validates YAML. Nested job types are still classified locally before any workflow:run.",
    docsUrl: EXPO_EAS_COMMAND_SOURCES.workflows,
  }),
  spec({
    id: "eas.workflow.run",
    title: "Run an EAS workflow",
    tool: "eas-cli",
    command: ["workflow:run"],
    requiredSelection: "eas-workflows",
    queuedIssue: 84,
    support: "implemented-fixture",
    effects: { ...none, sourceUpload: true, cloudCredits: true, configPluginEvaluation: true },
    network: "upload-and-credits",
    hostToolchain: "none",
    accountRequired: true,
    projectLinkRequired: true,
    requiredAuthority: "spend",
    documentedFlags: flags({ json: true, nonInteractive: true, wait: true }),
    notes:
      "Uploads the project unless --ref is used. Nested submit/update/deploy jobs are extra effects gated before spawn. Default PR/push/schedule triggers are refused. --ssh is experimental and excluded.",
    docsUrl: EXPO_EAS_COMMAND_SOURCES.easCli,
  }),
  spec({
    id: "eas.workflow.status",
    title: "EAS workflow run status",
    tool: "eas-cli",
    command: ["workflow:status"],
    requiredSelection: "eas-workflows",
    queuedIssue: 84,
    support: "implemented-fixture",
    effects: none,
    network: "account-and-project-check",
    hostToolchain: "none",
    accountRequired: true,
    projectLinkRequired: true,
    requiredAuthority: "observe",
    documentedFlags: flags({ json: true, nonInteractive: true, wait: true }),
    notes: "Readback for workflow job identity.",
    docsUrl: EXPO_EAS_COMMAND_SOURCES.easCli,
  }),
  spec({
    id: "eas.workflow.runs",
    title: "List EAS workflow runs",
    tool: "eas-cli",
    command: ["workflow:runs"],
    requiredSelection: "eas-workflows",
    queuedIssue: 84,
    support: "implemented-fixture",
    effects: none,
    network: "account-and-project-check",
    hostToolchain: "none",
    accountRequired: true,
    projectLinkRequired: true,
    requiredAuthority: "observe",
    documentedFlags: flags({ json: true }),
    notes: "List recent runs. Does not start a workflow.",
    docsUrl: EXPO_EAS_COMMAND_SOURCES.easCli,
  }),
  spec({
    id: "eas.init",
    title: "Create or link an EAS project",
    tool: "eas-cli",
    command: ["init"],
    requiredSelection: "eas-cli",
    queuedIssue: 84,
    support: "deliberately-excluded",
    effects: { ...none, credentialMutation: true },
    network: "account-and-project-check",
    hostToolchain: "none",
    accountRequired: true,
    projectLinkRequired: false,
    requiredAuthority: "mutate",
    documentedFlags: flags({ json: true, nonInteractive: true }),
    notes: "Passive plan never runs eas init. Reconcile an existing project instead of creating a duplicate.",
    docsUrl: EXPO_EAS_COMMAND_SOURCES.easCli,
  }),
  spec({
    id: "eas.credentials",
    title: "Interactive EAS credentials",
    tool: "eas-cli",
    command: ["credentials"],
    requiredSelection: "eas-cli",
    queuedIssue: 84,
    support: "deliberately-excluded",
    effects: { ...none, credentialMutation: true },
    network: "account-and-project-check",
    hostToolchain: "none",
    accountRequired: true,
    projectLinkRequired: true,
    requiredAuthority: "mutate",
    documentedFlags: flags(),
    notes: "Interactive. Documented without --json/--non-interactive. Must not auto-create or revoke signing material.",
    docsUrl: EXPO_EAS_COMMAND_SOURCES.easCli,
  }),
  spec({
    id: "eas.credentials.configure-build",
    title: "Configure build credentials",
    tool: "eas-cli",
    command: ["credentials:configure-build"],
    requiredSelection: "eas-cli",
    queuedIssue: 84,
    support: "deliberately-excluded",
    effects: { ...none, credentialMutation: true },
    network: "account-and-project-check",
    hostToolchain: "none",
    accountRequired: true,
    projectLinkRequired: true,
    requiredAuthority: "mutate",
    documentedFlags: flags(),
    notes: "Signing readiness is inspected; this command is not spawned. Live signing remains not-run.",
    docsUrl: EXPO_EAS_COMMAND_SOURCES.easCli,
  }),
  spec({
    id: "eas.device.create",
    title: "Register a device",
    tool: "eas-cli",
    command: ["device:create"],
    requiredSelection: "eas-cli",
    queuedIssue: 84,
    support: "deliberately-excluded",
    effects: { ...none, deviceRegistration: true, credentialMutation: true },
    network: "account-and-project-check",
    hostToolchain: "none",
    accountRequired: true,
    projectLinkRequired: true,
    requiredAuthority: "mutate",
    documentedFlags: flags(),
    notes: "Device registration is an explicit extra effect, never implied by a build.",
    docsUrl: EXPO_EAS_COMMAND_SOURCES.easCli,
  }),
  spec({
    id: "eas.env.exec",
    title: "Execute bash with EAS env",
    tool: "eas-cli",
    command: ["env:exec"],
    requiredSelection: "eas-cli",
    queuedIssue: 84,
    support: "deliberately-excluded",
    effects: { ...none, localCodeExecution: true },
    network: "account-and-project-check",
    hostToolchain: "none",
    accountRequired: true,
    projectLinkRequired: true,
    requiredAuthority: "mutate",
    documentedFlags: flags({ nonInteractive: true }),
    notes: "Documented BASH_COMMAND is an arbitrary shell. Refused. Not a generic escape hatch.",
    docsUrl: EXPO_EAS_COMMAND_SOURCES.envVars,
  }),
  spec({
    id: "eas.update",
    title: "Publish an EAS Update",
    tool: "eas-cli",
    command: ["update"],
    requiredSelection: "eas-update",
    queuedIssue: 85,
    support: "labeled-unavailable",
    effects: { ...none, sourceUpload: true, otaPublication: true },
    network: "upload-and-credits",
    hostToolchain: "none",
    accountRequired: true,
    projectLinkRequired: true,
    requiredAuthority: "publish",
    documentedFlags: flags({ json: true, nonInteractive: true }),
    notes: "#85 owns runtime compatibility, rollout, and recovery. Classified so a workflow cannot hide an OTA inside a build job.",
    docsUrl: EXPO_EAS_COMMAND_SOURCES.easCli,
  }),
  spec({
    id: "eas.deploy",
    title: "EAS Hosting deploy",
    tool: "eas-cli",
    command: ["deploy"],
    requiredSelection: "eas-hosting",
    queuedIssue: 86,
    support: "labeled-unavailable",
    effects: { ...none, sourceUpload: true, serverDeployment: true },
    network: "upload-and-credits",
    hostToolchain: "none",
    accountRequired: true,
    projectLinkRequired: true,
    requiredAuthority: "publish",
    documentedFlags: flags({ json: true, nonInteractive: true }),
    notes: "#86 owns hosting. `--prod` is production promotion and is a nested extra effect. EXPO_UNSTABLE_DEPLOY_SERVER during build is also a deploy effect.",
    docsUrl: EXPO_EAS_COMMAND_SOURCES.easCli,
  }),
  spec({
    id: "eas.deploy.promote",
    title: "Promote an EAS Hosting deployment",
    tool: "eas-cli",
    command: ["deploy:promote"],
    requiredSelection: "eas-hosting",
    queuedIssue: 86,
    support: "labeled-unavailable",
    effects: { ...none, productionPromotion: true, serverDeployment: true },
    network: "account-and-project-check",
    hostToolchain: "none",
    accountRequired: true,
    projectLinkRequired: true,
    requiredAuthority: "promote",
    documentedFlags: flags({ json: true, nonInteractive: true }),
    notes: "#86 owns promotion/alias/domain. Classified here so workflow and `--prod` cannot skip the gate.",
    docsUrl: EXPO_EAS_COMMAND_SOURCES.easCli,
  }),
];

const BY_ID = new Map(EXPO_EAS_COMMANDS.map((command) => [command.id, command]));

export function getExpoEasCommand(id: ExpoEasCommandId): ExpoEasCommandSpec {
  const match = BY_ID.get(id);
  if (!match) throw new Error(`unknown Expo/EAS command: ${id}`);
  return match;
}

export function authorityRank(authority: RequiredAuthority): number {
  switch (authority) {
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
      const exhaustive: never = authority;
      throw new Error(`unhandled authority: ${String(exhaustive)}`);
    }
  }
}

export function maxAuthority(left: RequiredAuthority, right: RequiredAuthority): RequiredAuthority {
  return authorityRank(left) >= authorityRank(right) ? left : right;
}

export function authorityForEffects(effects: ExpoEasEffectVector, fallback: RequiredAuthority): RequiredAuthority {
  let required = fallback;
  if (effects.localCodeExecution) required = maxAuthority(required, "compile");
  if (effects.credentialMutation || effects.deviceRegistration || effects.configPluginEvaluation) required = maxAuthority(required, "mutate");
  if (effects.cloudCredits || effects.sourceUpload) required = maxAuthority(required, "spend");
  if (effects.autoSubmit || effects.storeSubmission) required = maxAuthority(required, "submit");
  if (effects.otaPublication || effects.serverDeployment) required = maxAuthority(required, "publish");
  if (effects.productionPromotion) required = maxAuthority(required, "promote");
  return required;
}

export function isRemotePaidOrPublicEffect(effects: ExpoEasEffectVector): boolean {
  return (
    effects.cloudCredits ||
    effects.sourceUpload ||
    effects.autoSubmit ||
    effects.storeSubmission ||
    effects.otaPublication ||
    effects.serverDeployment ||
    effects.productionPromotion ||
    effects.credentialMutation ||
    effects.deviceRegistration
  );
}
