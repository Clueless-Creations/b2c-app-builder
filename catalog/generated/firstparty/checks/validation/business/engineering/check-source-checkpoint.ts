#!/usr/bin/env node
/**
 * Require a recoverable source checkpoint before the launch reports build progress.
 *
 * The check is quiet during setup when the repository is valid. It reports a warning
 * when setup has not created a repository or first commit. The same condition is an
 * error after engineering work starts or the project reaches the build phase.
 */
import { spawnSync } from "node:child_process";
import { realpathSync } from "node:fs";
import path from "node:path";
import { compileRepositoryContract, generatedProjectionPaths } from "../../../../catalog/repository-profiles/compile.js";
import { readAcceptedRepositoryProfile } from "../../../../catalog/repository-profiles/workspace.js";
import {
  asString,
  flagString,
  getPath,
  isRecord,
  issue,
  parseFlags,
  phaseOrder,
  readText,
  reportAndExit,
  type Issue,
} from "../../../../tooling/lib/launch-state.js";

const flags = parseFlags(process.argv.slice(2), [{ flags: ["--root"], key: "root" }]);
const root = path.resolve(flagString(flags, "root") ?? ".");
const issues: Issue[] = [];
const stateSource = readText(root, "state/business-state.json");
let broadBuildClaim = false;

if (stateSource) {
  try {
    const state: unknown = JSON.parse(stateSource);
    const phase = asString(getPath(state, "project.phase")) ?? "";
    const phaseIndex = phaseOrder.indexOf(phase);
    const buildIndex = phaseOrder.indexOf("phase_5");
    const engineering = getPath(state, "lanes.engineering");
    const engineeringStatus = isRecord(engineering) ? asString(engineering.status) : undefined;
    broadBuildClaim = (phaseIndex >= buildIndex && buildIndex >= 0) || ["running", "succeeded"].includes(engineeringStatus ?? "");
  } catch {
    // The project-state validator reports malformed JSON.
  }
}

const topLevel = git(["rev-parse", "--show-toplevel"]);
if (!topLevel.ok || realPath(topLevel.stdout.trim()) !== realPath(root)) {
  issues.push(
    issue(
      broadBuildClaim ? "error" : "warning",
      "source_checkpoint.repository_missing",
      broadBuildClaim
        ? "Build progress is recorded, but this project is not the root of a Git repository. Create the repository and its first source checkpoint before you make more build-readiness claims."
        : "Create a Git repository and first source checkpoint before broad build work starts.",
      root,
    ),
  );
  reportAndExit("Source checkpoint", issues);
} else {
  const head = git(["rev-parse", "--verify", "HEAD"]);
  if (!head.ok) {
    issues.push(
      issue(
        broadBuildClaim ? "error" : "warning",
        "source_checkpoint.no_commit",
        broadBuildClaim
          ? "Build progress is recorded, but the repository has no commit. Commit a clean starting point before more source changes or readiness claims."
          : "The repository has no commit. Create the first source checkpoint before broad build work starts.",
        root,
      ),
    );
  }

  const untracked = git(["ls-files", "--others", "--exclude-standard", "-z"]);
  const acceptedProfile = readAcceptedRepositoryProfile(root);
  const generated = acceptedProfile ? generatedProjectionPaths(compileRepositoryContract(root)) : undefined;
  const untrackedSource = untracked.ok
    ? untracked.stdout
        .split("\0")
        .filter(Boolean)
        .filter(isSourceFile)
        .filter((relative) => {
          if (!generated) return true;
          const normalized = relative.replaceAll("\\", "/");
          return !generated.has(normalized) && !normalized.includes("/generated/") && !normalized.startsWith("generated/");
        })
    : [];
  if (untrackedSource.length > 0) {
    issues.push(
      issue(
        broadBuildClaim ? "error" : "warning",
        "source_checkpoint.untracked_source",
        `${untrackedSource.length} source file(s) are not tracked by Git${broadBuildClaim ? " while build progress is recorded" : ""}. Review and checkpoint them first: ${untrackedSource.slice(0, 5).join(", ")}${untrackedSource.length > 5 ? ", …" : ""}.`,
        root,
      ),
    );
  }

  reportAndExit("Source checkpoint", issues);
}

function git(args: string[]): { ok: boolean; stdout: string } {
  const result = spawnSync("git", ["-C", root, ...args], { encoding: "utf8" });
  return { ok: result.status === 0, stdout: result.stdout ?? "" };
}

function realPath(value: string): string {
  try {
    return realpathSync(value);
  } catch {
    return path.resolve(value);
  }
}

function isSourceFile(relative: string): boolean {
  const normalized = relative.replaceAll("\\", "/");
  if (/^(?:build|dist|coverage|proof|\.dart_tool|\.gradle|DerivedData)\//.test(normalized)) return false;
  return (
    /(?:^|\/)(?:lib|src|app|ios|android|web|server|core|packages)\//.test(normalized) ||
    /\.(?:c|cc|cpp|css|dart|go|h|hpp|html|java|js|jsx|kt|kts|m|mm|py|rb|rs|scss|swift|ts|tsx|vue)$/.test(normalized)
  );
}
