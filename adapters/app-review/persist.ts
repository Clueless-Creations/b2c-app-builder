import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, writeSync } from "node:fs";
import path from "node:path";

import { validateAppReviewState } from "../../kernel/schema/index.js";
import { containsSecretMaterial } from "./auth.js";
import { commandIsStoreSubmission } from "./implement.js";
import { projectAppReviewForFounder } from "./projection.js";
import { renderAppReviewMarkdown } from "./render.js";
import type { AppReviewState } from "./types.js";

export class InvalidAppReviewStateError extends Error {
  readonly filePath: string;

  constructor(filePath: string, detail: string) {
    super(`App Review state at ${filePath} is invalid: ${detail}`);
    this.name = "InvalidAppReviewStateError";
    this.filePath = filePath;
  }
}

export type LoadedAppReviewState =
  { readonly status: "missing" } | { readonly status: "ok"; readonly state: AppReviewState } | { readonly status: "invalid"; readonly message: string };

function writeAtomic(targetPath: string, contents: string): void {
  mkdirSync(path.dirname(targetPath), { recursive: true });
  const tmpPath = `${targetPath}.tmp`;
  const fd = openSync(tmpPath, "w");
  try {
    writeSync(fd, contents);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  renameSync(tmpPath, targetPath);
}

export function writeAppReviewState(filePath: string, state: AppReviewState): void {
  const check = validateAppReviewState<AppReviewState>(state);
  if (!check.valid) {
    throw new Error(`Refusing to write invalid App Review state: ${check.issues.map((issue) => issue.message).join("; ")}`);
  }
  const serialized = `${JSON.stringify(state, null, 2)}\n`;
  if (containsSecretMaterial(serialized) || serialized.includes("downloadUrl") || serialized.includes("messageBody")) {
    throw new Error("Refusing to write App Review state that contains credential, download URL, or reviewer body material");
  }
  writeAtomic(filePath, serialized);
}

export function writeAppReviewWatch(workspaceRoot: string, state: AppReviewState): void {
  writeAppReviewState(path.join(workspaceRoot, "run", "app-review.json"), state);
  const founder = projectAppReviewForFounder(state);
  const markdown = renderAppReviewMarkdown(state, founder);
  if (commandIsStoreSubmission(markdown) || markdown.includes("asc webhooks serve") || markdown.includes("asc web agreements accept")) {
    throw new Error("Refusing to write App Review markdown that emits a forbidden command");
  }
  writeAtomic(path.join(workspaceRoot, "store", "APP_REVIEW.md"), markdown);
}

export function interpretAppReviewState(parsed: unknown): LoadedAppReviewState {
  const check = validateAppReviewState<AppReviewState>(parsed);
  if (!check.valid || !check.value) {
    const detail = check.issues.map((item) => item.message).join("; ") || "schema validation failed";
    return { status: "invalid", message: detail };
  }
  return { status: "ok", state: check.value };
}

export function readAppReviewState(filePath: string): LoadedAppReviewState {
  if (!existsSync(filePath)) return { status: "missing" };
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(filePath, "utf8"));
  } catch {
    return { status: "invalid", message: "the file is not valid JSON" };
  }
  return interpretAppReviewState(parsed);
}

export function loadAppReviewState(filePath: string): AppReviewState | undefined {
  const loaded = readAppReviewState(filePath);
  switch (loaded.status) {
    case "missing":
      return undefined;
    case "ok":
      return loaded.state;
    case "invalid":
      throw new InvalidAppReviewStateError(filePath, loaded.message);
    default: {
      const exhaustive: never = loaded;
      throw new Error(`Unhandled App Review load status ${String(exhaustive)}`);
    }
  }
}
