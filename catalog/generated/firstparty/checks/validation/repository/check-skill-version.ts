#!/usr/bin/env node
import { existsSync, readFileSync, realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import { inspectRuntimePins, defaultRuntimeInstallRoots } from "../../../adapters/providers/runtime-pin.js";
import { flagBoolean, flagString, issue, isRecord, parseFlags, reportAndExit, type Issue } from "../../../tooling/lib/launch-state.js";
import { readSourceText, redactSourceSecrets, sourceHttpFailure, type SourceHttpOptions } from "../../../tooling/lib/source-http.js";
import { isMainModule } from "../../../tooling/lib/cli-entrypoint.js";

interface VersionManifest {
  skill: string;
  version: string;
  updatedAt?: string;
  sourcePath?: string;
  releaseNotes?: string[];
}

interface VersionArgs {
  source: string;
  installed: string;
  remoteUrl?: string;
  sourceExplicit: boolean;
  allRuntimes: boolean;
  runtimesRoot?: string;
}

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const skillRoot = path.resolve(scriptDir, "../../..");
export async function checkSkillVersion(argv: string[], httpOptions: SourceHttpOptions = {}): Promise<Issue[]> {
  let args: VersionArgs;
  try {
    args = parseArgs(argv);
  } catch {
    return [issue("error", "skill_version.remote_url_invalid", "--remote and --remote-url require a non-empty URL argument, not another flag.")];
  }
  const issues: Issue[] = [];

  const installed = loadManifest(args.installed, "installed");
  const latest = args.remoteUrl ? await loadRemoteManifest(args.remoteUrl, httpOptions) : loadManifest(args.source, "latest");
  issues.push(...installed.issues, ...latest.issues);

  /**
   * A source checkout can compare with itself. An installed runtime cannot use itself as the latest
   * source because that comparison provides no freshness evidence.
   */
  if (!args.remoteUrl && samePath(args.source, args.installed) && !args.sourceExplicit && !isSourceCheckout(args.installed)) {
    issues.push(
      issue(
        "error",
        "skill_version.source_unresolved",
        [
          "This compared the installed runtime against itself, so it did not check freshness at all.",
          "Run `npm run runtime:sync -- --all-clients` from the source checkout to sync every consumer,",
          "or re-run with --source /path/to/checkout or --remote-url.",
        ].join(" "),
        path.relative(process.cwd(), path.join(args.installed, "skill-version.json")),
      ),
    );
  }

  if (installed.manifest && latest.manifest) {
    if (installed.manifest.skill !== latest.manifest.skill) {
      issues.push(
        issue(
          "error",
          "skill_version.skill_mismatch",
          `Installed skill ${installed.manifest.skill} does not match latest skill ${latest.manifest.skill}.`,
          "skill-version.json",
        ),
      );
    } else {
      const comparison = compareSemver(installed.manifest.version, latest.manifest.version);
      if (comparison === undefined) {
        issues.push(
          issue(
            "error",
            "skill_version.invalid_semver",
            `Version strings must be semver-like. Installed: ${installed.manifest.version}; latest: ${latest.manifest.version}.`,
            "skill-version.json",
          ),
        );
      } else if (comparison < 0) {
        issues.push(
          issue(
            "error",
            "skill_version.stale",
            [
              `Installed B2C App Builder skill is ${installed.manifest.version}; latest available source is ${latest.manifest.version}.`,
              "Before continuing the request, ask whether to update the local skill runtime or continue with the installed version.",
              "If the founder approves, sync the source skill into ~/.codex/skills/b2c-app-builder, install dependencies, run focused verification, and verify the Claude/Agents/Cursor links.",
            ].join(" "),
            path.relative(process.cwd(), path.join(args.installed, "skill-version.json")),
          ),
        );
      } else if (comparison > 0) {
        issues.push(
          issue(
            "warning",
            "skill_version.installed_newer_than_source",
            `Installed version ${installed.manifest.version} is newer than source version ${latest.manifest.version}. Confirm the source path before syncing over it.`,
            path.relative(process.cwd(), path.join(args.installed, "skill-version.json")),
          ),
        );
      }
    }
  }

  if (args.allRuntimes && latest.manifest) {
    const inspections = inspectRuntimePins(latest.manifest.version, defaultRuntimeInstallRoots(args.runtimesRoot ?? homedir()), args.source);
    for (const item of inspections) {
      switch (item.relation) {
        case "missing":
        case "equal":
          break;
        case "ahead":
          issues.push(
            issue(
              "warning",
              "skill_version.runtime_ahead_of_pin",
              `Client runtime ${item.id} at ${item.root} is ${item.version}, ahead of source ${latest.manifest.version}.`,
              item.root,
            ),
          );
          break;
        case "behind":
          issues.push(
            issue(
              "error",
              "skill_version.runtime_behind_pin",
              `Client runtime ${item.id} at ${item.root} is ${item.version ?? "unknown"}, behind source ${latest.manifest.version}. Sync every B2C App Builder client before continuing.`,
              item.root,
            ),
          );
          break;
        case "invalid":
          issues.push(
            issue("error", "skill_version.runtime_pin_invalid", `Client runtime ${item.id} at ${item.root} has no readable skill-version.json.`, item.root),
          );
          break;
        default: {
          const exhaustive: never = item.relation;
          throw new Error(`Unhandled runtime pin relation ${String(exhaustive)}`);
        }
      }
    }
  }

  return issues.map((item) => ({
    ...item,
    message: redactSourceSecrets(item.message, httpOptions.env),
    file: item.file ? redactSourceSecrets(item.file, httpOptions.env) : undefined,
  }));
}

function parseArgs(argv: string[]): VersionArgs {
  for (const [index, token] of argv.entries()) {
    if (/^--remote(?:-url)?=/u.test(token)) throw new Error("Invalid remote URL argument.");
    if (!["--remote", "--remote-url"].includes(token)) continue;
    const value = argv[index + 1];
    if (!value?.trim() || value.startsWith("-")) throw new Error("Invalid remote URL argument.");
  }
  const flags = parseFlags(argv, [
    { flags: ["--source", "--latest"], key: "source" },
    { flags: ["--installed", "--runtime"], key: "installed" },
    { flags: ["--remote-url", "--remote"], key: "remoteUrl", kind: "string" },
    { flags: ["--root"], key: "rootFallback" },
    { flags: ["--all-runtimes"], key: "allRuntimes", kind: "boolean" },
    { flags: ["--runtimes-root"], key: "runtimesRoot" },
  ]);

  const explicitSource = flagString(flags, "source");
  const source = explicitSource ?? (process.env.B2C_APP_BUILDER_SKILL_SOURCE ? path.resolve(process.env.B2C_APP_BUILDER_SKILL_SOURCE) : findDefaultSource());
  let installed =
    flagString(flags, "installed") ?? (process.env.B2C_APP_BUILDER_SKILL_INSTALLED ? path.resolve(process.env.B2C_APP_BUILDER_SKILL_INSTALLED) : skillRoot);

  // --root only acts as an installed-path fallback when neither --installed
  // nor --runtime appears anywhere on the command line.
  const rootFallback = flagString(flags, "rootFallback");
  if (rootFallback !== undefined && !argv.includes("--installed") && !argv.includes("--runtime")) {
    installed = rootFallback;
  }

  return {
    source,
    installed,
    remoteUrl: flagString(flags, "remoteUrl"),
    sourceExplicit: Boolean(process.env.B2C_APP_BUILDER_SKILL_SOURCE) || explicitSource !== undefined,
    allRuntimes: flagBoolean(flags, "allRuntimes"),
    runtimesRoot: flagString(flags, "runtimesRoot"),
  };
}

function findDefaultSource(): string {
  const candidates = [process.env.B2C_APP_BUILDER_SKILL_SOURCE, skillRoot].filter((candidate): candidate is string => Boolean(candidate));
  return candidates.find((candidate) => existsSync(path.join(candidate, "skill-version.json"))) ?? skillRoot;
}

function samePath(left: string, right: string): boolean {
  return normalizePath(left) === normalizePath(right);
}

function normalizePath(value: string): string {
  try {
    return realpathSync(value);
  } catch {
    return path.resolve(value);
  }
}

/**
 * True when this root is the repository copy rather than an installed runtime. Two signals have to
 * agree: the manifest's own sourcePath is the tail of the resolved path (since ADR-0002 the
 * sourcePath is ".", so the tail is the manifest's own directory), and the checkout root above
 * that tail carries a `.git`. An installed runtime under ~/.codex/skills satisfies neither, so it
 * can never talk its way out of the freshness comparison.
 *
 * realpathSync first, because the consumer copies (~/.claude, ~/.agents, ~/.cursor) are symlinks
 * into the Codex runtime — the link path is not what we need to classify. `.git` is checked with
 * existsSync rather than a directory test so a git worktree, where `.git` is a file, still counts.
 */
function isSourceCheckout(root: string): boolean {
  const resolved = normalizePath(root);
  const manifestPath = path.join(resolved, "skill-version.json");
  if (!existsSync(manifestPath)) return false;
  try {
    const parsed: unknown = JSON.parse(readFileSync(manifestPath, "utf8"));
    const sourcePath = isRecord(parsed) && typeof parsed.sourcePath === "string" ? parsed.sourcePath : undefined;
    if (!sourcePath) return false;
    const segments = sourcePath.split("/").filter((segment) => segment && segment !== ".");
    const suffix = segments.length ? path.sep + segments.join(path.sep) : "";
    if (suffix && !resolved.endsWith(suffix)) return false;
    const checkoutRoot = suffix ? resolved.slice(0, resolved.length - suffix.length) : resolved;
    return existsSync(path.join(checkoutRoot, ".git"));
  } catch {
    return false;
  }
}

function loadManifest(root: string, label: "installed" | "latest"): { manifest?: VersionManifest; issues: Issue[] } {
  const manifestPath = path.join(root, "skill-version.json");
  if (!existsSync(manifestPath)) {
    return {
      issues: [
        issue(
          label === "latest" ? "warning" : "error",
          `skill_version.${label}_manifest_missing`,
          `${label} skill-version.json is missing at ${manifestPath}.`,
          manifestPath,
        ),
      ],
    };
  }

  try {
    const parsed: unknown = JSON.parse(readFileSync(manifestPath, "utf8"));
    if (!isRecord(parsed)) {
      return { issues: [issue("error", `skill_version.${label}_manifest_invalid`, `${label} manifest must be a JSON object.`, manifestPath)] };
    }

    const skill = parsed.skill;
    const version = parsed.version;
    if (typeof skill !== "string" || !skill.trim()) {
      return { issues: [issue("error", `skill_version.${label}_skill_missing`, `${label} manifest must include skill.`, manifestPath)] };
    }
    if (typeof version !== "string" || !version.trim()) {
      return { issues: [issue("error", `skill_version.${label}_version_missing`, `${label} manifest must include version.`, manifestPath)] };
    }

    return {
      manifest: {
        skill,
        version,
        updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : undefined,
        sourcePath: typeof parsed.sourcePath === "string" ? parsed.sourcePath : undefined,
        releaseNotes: Array.isArray(parsed.releaseNotes) ? parsed.releaseNotes.filter((item): item is string => typeof item === "string") : undefined,
      },
      issues: [],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { issues: [issue("error", `skill_version.${label}_manifest_parse_error`, `${label} manifest is not valid JSON: ${message}`, manifestPath)] };
  }
}

async function loadRemoteManifest(remoteUrl: string, options: SourceHttpOptions): Promise<{ manifest?: VersionManifest; issues: Issue[] }> {
  let text: string;
  // A requested URL can itself carry a token in its path. Never echo it in diagnostics.
  const remoteLabel = "remote skill-version.json";
  try {
    text = (await readSourceText(remoteUrl, { ...options, maxBytes: 256 * 1024 })).text;
  } catch (error) {
    return {
      issues: [issue("error", "skill_version.remote_unavailable", `Could not verify the remote skill version. ${sourceHttpFailure(error)}`, remoteLabel)],
    };
  }
  try {
    const parsed: unknown = JSON.parse(text);
    if (!isRecord(parsed)) {
      return { issues: [issue("error", "skill_version.remote_manifest_invalid", "Remote skill-version.json must be an object.", remoteLabel)] };
    }
    const skill = parsed.skill;
    const version = parsed.version;
    if (typeof skill !== "string" || !skill.trim() || typeof version !== "string" || !version.trim()) {
      return {
        issues: [
          issue("error", "skill_version.remote_manifest_missing_fields", "Remote skill-version.json must include non-empty skill and version.", remoteLabel),
        ],
      };
    }
    if (skill !== "b2c-app-builder" || !parseSemver(version)) {
      return {
        issues: [issue("error", "skill_version.remote_manifest_invalid", "Remote manifest must name B2C App Builder and a semver version.", remoteLabel)],
      };
    }
    return {
      manifest: {
        skill,
        version,
        updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : undefined,
        sourcePath: typeof parsed.sourcePath === "string" ? parsed.sourcePath : undefined,
        releaseNotes: Array.isArray(parsed.releaseNotes) ? parsed.releaseNotes.filter((item): item is string => typeof item === "string") : undefined,
      },
      issues: [],
    };
  } catch {
    return { issues: [issue("error", "skill_version.remote_manifest_parse_error", "Remote manifest is not valid JSON.", remoteLabel)] };
  }
}

function compareSemver(left: string, right: string): number | undefined {
  const leftParts = parseSemver(left);
  const rightParts = parseSemver(right);
  if (!leftParts || !rightParts) {
    return undefined;
  }
  for (const [leftValue, rightValue] of [
    [leftParts[0], rightParts[0]],
    [leftParts[1], rightParts[1]],
    [leftParts[2], rightParts[2]],
  ] as const) {
    if (leftValue !== rightValue) {
      return leftValue < rightValue ? -1 : 1;
    }
  }
  return 0;
}

function parseSemver(value: string): [number, number, number] | undefined {
  const match = value.trim().match(/^(\d+)\.(\d+)\.(\d+)(?:[-+][0-9A-Za-z.-]+)?$/);
  if (!match) {
    return undefined;
  }
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

if (isMainModule(import.meta.url)) {
  try {
    reportAndExit("Skill version freshness check", await checkSkillVersion(process.argv.slice(2)));
  } catch {
    reportAndExit("Skill version freshness check", [issue("error", "skill_version.check_failed", "Skill version verification failed.")]);
  }
}
