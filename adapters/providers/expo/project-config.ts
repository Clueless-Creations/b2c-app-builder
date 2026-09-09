/**
 * Static inspection of an Expo app directory.
 *
 * Parses eas.json, package.json, app.json, .easignore, and `.eas/workflows/*.yml` as text.
 * It never evaluates `app.config.js`, config plugins, or `expo config`.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";

export const EAS_NPM_HOOK_SCRIPTS = [
  "eas-build-pre-install",
  "eas-build-post-install",
  "eas-build-on-success",
  "eas-build-on-error",
  "eas-build-on-complete",
] as const;

export type WorkflowJobType = "build" | "submit" | "update" | "deploy" | "fingerprint" | "get-build" | "require" | "unknown";

export interface InspectedWorkflow {
  readonly relativePath: string;
  readonly parseOk: boolean;
  readonly jobTypes: readonly WorkflowJobType[];
  readonly triggerKinds: readonly string[];
  readonly hasPushTrigger: boolean;
  readonly hasPullRequestTrigger: boolean;
  readonly hasScheduleTrigger: boolean;
}

export interface InspectedExpoProject {
  readonly root: string;
  readonly easJsonPresent: boolean;
  readonly easJsonParseOk: boolean;
  readonly appJsonPresent: boolean;
  readonly dynamicConfigPresent: boolean;
  readonly easIgnorePresent: boolean;
  readonly npmHooks: readonly string[];
  readonly buildProfiles: readonly string[];
  readonly submitProfiles: readonly string[];
  readonly profileAutoSubmit: Readonly<Record<string, boolean>>;
  readonly profileDeployServer: Readonly<Record<string, boolean>>;
  readonly workflows: readonly InspectedWorkflow[];
  readonly linkedProjectId: string | undefined;
}

function readJson(file: string): unknown | undefined {
  try {
    return JSON.parse(readFileSync(file, "utf8")) as unknown;
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function workflowJobType(value: unknown): WorkflowJobType {
  if (value === "build" || value === "submit" || value === "update" || value === "deploy" || value === "fingerprint" || value === "get-build" || value === "require") {
    return value;
  }
  return "unknown";
}

function inspectWorkflowFile(root: string, relativePath: string): InspectedWorkflow {
  const absolute = path.join(root, relativePath);
  let parsed: unknown;
  try {
    parsed = parseYaml(readFileSync(absolute, "utf8"));
  } catch {
    return {
      relativePath,
      parseOk: false,
      jobTypes: [],
      triggerKinds: [],
      hasPushTrigger: false,
      hasPullRequestTrigger: false,
      hasScheduleTrigger: false,
    };
  }
  const record = isRecord(parsed) ? parsed : {};
  const jobs = isRecord(record.jobs) ? record.jobs : {};
  const jobTypes = Object.values(jobs).map((job) => workflowJobType(isRecord(job) ? job.type : undefined));
  const on = isRecord(record.on) ? record.on : typeof record.on === "string" ? { [record.on]: true } : {};
  const triggerKinds = Object.keys(on);
  return {
    relativePath,
    parseOk: true,
    jobTypes,
    triggerKinds,
    hasPushTrigger: "push" in on,
    hasPullRequestTrigger: "pull_request" in on || "pullRequest" in on,
    hasScheduleTrigger: "schedule" in on,
  };
}

function listWorkflows(root: string): InspectedWorkflow[] {
  const directory = path.join(root, ".eas", "workflows");
  if (!existsSync(directory)) return [];
  return readdirSync(directory)
    .filter((name) => name.endsWith(".yml") || name.endsWith(".yaml"))
    .sort()
    .map((name) => inspectWorkflowFile(root, path.posix.join(".eas/workflows", name)));
}

export function inspectExpoProject(root: string): InspectedExpoProject {
  const easJsonPath = path.join(root, "eas.json");
  const appJsonPath = path.join(root, "app.json");
  const packageJsonPath = path.join(root, "package.json");
  const easJsonPresent = existsSync(easJsonPath);
  const easJson = easJsonPresent ? readJson(easJsonPath) : undefined;
  const easJsonParseOk = !easJsonPresent || isRecord(easJson);
  const record = isRecord(easJson) ? easJson : {};
  const build = isRecord(record.build) ? record.build : {};
  const submit = isRecord(record.submit) ? record.submit : {};
  const buildProfiles = Object.keys(build);
  const submitProfiles = Object.keys(submit);
  const profileAutoSubmit: Record<string, boolean> = {};
  const profileDeployServer: Record<string, boolean> = {};
  for (const name of buildProfiles) {
    const profile = build[name];
    if (!isRecord(profile)) continue;
    profileAutoSubmit[name] = profile.autoSubmit === true;
    const env = isRecord(profile.env) ? profile.env : {};
    profileDeployServer[name] = env.EXPO_UNSTABLE_DEPLOY_SERVER === "1" || env.EXPO_UNSTABLE_DEPLOY_SERVER === 1;
  }
  const appJson = existsSync(appJsonPath) ? readJson(appJsonPath) : undefined;
  const expo = isRecord(appJson) && isRecord(appJson.expo) ? appJson.expo : isRecord(appJson) ? appJson : undefined;
  const extraExpo = expo && isRecord(expo.extra) ? expo.extra : undefined;
  const easExtra = extraExpo && isRecord(extraExpo.eas) ? extraExpo.eas : undefined;
  const linkedProjectId = easExtra && typeof easExtra.projectId === "string" ? easExtra.projectId : undefined;
  const packageJson = existsSync(packageJsonPath) ? readJson(packageJsonPath) : undefined;
  const scripts = isRecord(packageJson) && isRecord(packageJson.scripts) ? packageJson.scripts : {};
  const npmHooks = EAS_NPM_HOOK_SCRIPTS.filter((hook) => hook in scripts);
  const dynamicConfigPresent = existsSync(path.join(root, "app.config.js")) || existsSync(path.join(root, "app.config.ts"));
  return {
    root,
    easJsonPresent,
    easJsonParseOk,
    appJsonPresent: existsSync(appJsonPath),
    dynamicConfigPresent,
    easIgnorePresent: existsSync(path.join(root, ".easignore")),
    npmHooks,
    buildProfiles,
    submitProfiles,
    profileAutoSubmit,
    profileDeployServer,
    workflows: listWorkflows(root),
    linkedProjectId,
  };
}

export function workflowRelativePathAllowed(relativePath: string): boolean {
  return /^\.eas\/workflows\/[A-Za-z0-9._-]+\.ya?ml$/u.test(relativePath);
}
