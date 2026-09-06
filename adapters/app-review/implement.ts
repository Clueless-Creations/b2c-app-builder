import { createHash } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { commandIsForbiddenForAppReview } from "./mandate.js";
import type { AppReviewConsumerImplementation, AppReviewConsumerPatch } from "./types.js";

const FORBIDDEN_SUBMIT_SNIPPETS = ["asc review submit", "asc publish appstore --submit", "asc web agreements accept"];

export function consumerPatchPathIsSafe(relativePath: string): boolean {
  const trimmed = relativePath.trim();
  if (!trimmed) return false;
  if (path.isAbsolute(trimmed)) return false;
  if (trimmed.includes("\0")) return false;
  const normalized = path.posix.normalize(trimmed.replaceAll("\\", "/"));
  if (normalized.startsWith("..") || normalized.includes("/../") || normalized === "..") return false;
  if (normalized.startsWith("/")) return false;
  return normalized === trimmed.replaceAll("\\", "/");
}

export function commandIsStoreSubmission(command: string): boolean {
  if (commandIsForbiddenForAppReview(command)) return true;
  const trimmed = command.trim();
  if (trimmed === "asc metadata push" || trimmed.startsWith("asc metadata push ")) {
    return !trimmed.includes("--dry-run");
  }
  return false;
}

export function patchContainsStoreSubmission(patch: AppReviewConsumerPatch): boolean {
  const blob = `${patch.relativePath}\n${patch.contents}`;
  if (commandIsStoreSubmission(blob)) return true;
  return FORBIDDEN_SUBMIT_SNIPPETS.some((snippet) => blob.includes(snippet));
}

export function applyConsumerPatches(
  workspaceRoot: string,
  patches: readonly AppReviewConsumerPatch[],
  appliedAt: string,
  producerSessionId: string,
): AppReviewConsumerImplementation {
  const producer = producerSessionId.trim();
  if (!producer) {
    throw new Error("App Review remediation refuses to apply a patch without a producer session id");
  }
  for (const patch of patches) {
    if (!consumerPatchPathIsSafe(patch.relativePath)) {
      throw new Error(`App Review remediation refuses unsafe consumer path: ${patch.relativePath}`);
    }
    if (patchContainsStoreSubmission(patch)) {
      throw new Error("App Review remediation refuses a consumer patch that submits to App Store Connect");
    }
  }
  const appliedPaths: string[] = [];
  for (const patch of patches) {
    const target = path.join(workspaceRoot, patch.relativePath);
    switch (patch.kind) {
      case "create":
        if (existsSync(target)) {
          throw new Error(`App Review remediation refuses to create over existing consumer file: ${patch.relativePath}`);
        }
        break;
      case "replace":
        break;
      default: {
        const exhaustive: never = patch.kind;
        throw new Error(`Unhandled App Review patch kind ${String(exhaustive)}`);
      }
    }
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, patch.contents, "utf8");
    appliedPaths.push(patch.relativePath);
  }
  const revisionSource = patches.map((patch) => `${patch.relativePath}\n${patch.contents}`).join("\n");
  return {
    sourceRevision: createHash("sha256").update(revisionSource).digest("hex"),
    appliedPaths,
    appliedAt,
    producerSessionId: producer,
  };
}
