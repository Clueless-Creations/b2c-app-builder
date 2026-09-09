/**
 * Canonical EAS request/effect identity (#106).
 *
 * The digest covers the upload-relevant source snapshot plus the selected command,
 * project, platform, profile, environment, artifact intent, and runtime pin.
 * Expo runtime compatibility (`runtimeVersion`) stays a distinct binding field; it is
 * not folded into the source snapshot.
 *
 * Source hashing reuses `fingerprintAppSource` (existing snapshot machinery). Extra
 * EAS roots cover lockfiles, plugins, workflows, and config that a four-file
 * eas.json/app.json/package.json/.easignore digest missed. Caches, VCS, secrets, and
 * `.b2c` ledger files are not hashed.
 *
 * This is not a kernel operation journal and not a shared provider scheduler.
 * Coordinate #104: same persist-before-effect / full-identity / resume-observation
 * invariant; do not extract a generic journal from this proving case.
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fingerprintAppSource } from "../../../kernel/engine/source-fingerprint.js";
import type { ExpoEasCommandId } from "../../../catalog/stacks/expo-eas-commands.js";
import type { EasArtifactKind, EasJobBinding } from "./jobs.js";
import type { InspectedExpoProject } from "./project-config.js";
import type { ExpoEasTarget } from "./preflight.js";

/**
 * Roots that change the reproducible EAS upload/build input set.
 * `fingerprintAppSource` already skips `.git`, `node_modules`, `build`, `dist`, and
 * similar caches inside any walked directory.
 */
export const EAS_UPLOAD_SOURCE_ROOTS = [
  "package.json",
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "bun.lock",
  "bun.lockb",
  "app.json",
  "app.config.js",
  "app.config.ts",
  "app.config.mjs",
  "eas.json",
  ".easignore",
  ".eas",
  "plugins",
  "app",
  "apps",
  "src",
  "lib",
  "native",
  "ios",
  "android",
  "App.tsx",
  "App.ts",
  "App.jsx",
  "App.js",
  "index.ts",
  "index.js",
  "metro.config.js",
  "babel.config.js",
] as const;

const ALWAYS_EXCLUDED = ["secrets", ".env", "credentials"] as const;

function easExcludedPaths(cwd: string): string[] {
  const excluded = new Set<string>(ALWAYS_EXCLUDED);
  const ignoreFile = path.join(cwd, ".easignore");
  if (!existsSync(ignoreFile)) return [...excluded];
  for (const raw of readFileSync(ignoreFile, "utf8").split(/\r?\n/)) {
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("!")) continue;
    if (trimmed.includes("*") || trimmed.includes("?")) continue;
    const normalized = trimmed.replace(/^\//, "").replace(/\/$/, "");
    if (!normalized || path.posix.isAbsolute(normalized)) continue;
    if (normalized.split("/").some((part) => part === "." || part === "..")) continue;
    excluded.add(normalized);
  }
  return [...excluded];
}

/** Content-addressed digest of the files EAS would actually upload for this project. */
export function fingerprintEasUploadInputs(cwd: string): string {
  return fingerprintAppSource(cwd, EAS_UPLOAD_SOURCE_ROOTS, { excludedPaths: easExcludedPaths(cwd) });
}

export function buildEasJobBinding(input: {
  readonly cwd: string;
  readonly operationId: ExpoEasCommandId;
  readonly target: ExpoEasTarget;
  readonly project: InspectedExpoProject;
  readonly platform?: "ios" | "android";
  readonly profile?: string;
  readonly environment?: string;
  readonly artifactKind?: EasArtifactKind;
  readonly runtimeVersion?: string;
  readonly workflowRelativePath?: string;
  readonly autoSubmit?: boolean;
}): EasJobBinding {
  return {
    sourceFingerprint: fingerprintEasUploadInputs(input.cwd),
    profile: input.profile ?? "unspecified",
    platform: input.platform ?? "ios",
    environment: input.environment ?? "unspecified",
    artifactKind: input.artifactKind ?? "unknown",
    runtimeVersion: input.runtimeVersion,
    commandId: input.operationId,
    easProjectId: input.target.approvedProjectId ?? input.project.linkedProjectId,
    workflowRelativePath: input.workflowRelativePath,
    autoSubmit: input.autoSubmit === true,
  };
}
