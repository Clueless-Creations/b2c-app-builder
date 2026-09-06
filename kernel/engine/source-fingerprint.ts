import { createHash } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, readlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { RunStateDocument } from "../schema/types.js";
import { invalidateDescendants } from "./runstate.js";
import type { CatalogArtifactId, CompiledPlan } from "./compile.js";

const DEFAULT_SOURCE_ROOTS = ["native", "landing", "app", "apps", "ios", "android", "lib", "src", "packages", "pubspec.yaml", "package.json"] as const;
const IGNORED_SEGMENTS = new Set([".git", ".dart_tool", ".gradle", ".next", "build", "DerivedData", "dist", "node_modules"]);
export const APP_SOURCE_FINGERPRINT_PATH = "run/app-source-fingerprint.sha256";

/** Deterministic, content-addressed snapshot of app source, independent of chat or workflow output prose. */
export function fingerprintAppSource(
  workspaceDir: string,
  roots: readonly string[] = DEFAULT_SOURCE_ROOTS,
  options: { readonly excludedPaths?: readonly string[] } = {},
): string {
  const workspace = path.resolve(workspaceDir);
  const hash = createHash("sha256");
  let visited = 0;
  const excludedPaths = [...new Set(options.excludedPaths ?? [])].map((entry) => entry.replace(/\\/g, "/").replace(/\/$/, ""));
  for (const excluded of excludedPaths) {
    if (!excluded || path.posix.isAbsolute(excluded) || excluded.split("/").some((part) => part === "." || part === ".."))
      throw new Error(`excluded source path must be workspace-relative: ${excluded}`);
  }
  const visit = (absolute: string, relative: string): void => {
    if (excludedPaths.some((excluded) => relative === excluded || relative.startsWith(`${excluded}/`))) return;
    const stat = lstatSync(absolute);
    if (stat.isSymbolicLink()) {
      hash.update(`${relative}\0symlink\0${readlinkSync(absolute)}\0`);
      visited += 1;
      return;
    }
    if (stat.isDirectory()) {
      for (const name of readdirSync(absolute).sort()) {
        if (IGNORED_SEGMENTS.has(name)) continue;
        visit(path.join(absolute, name), path.posix.join(relative, name));
      }
      return;
    }
    if (!stat.isFile()) return;
    visited += 1;
    hash.update(`${relative}\0${stat.mode}\0${stat.size}\0`);
    hash.update(readFileSync(absolute));
  };
  for (const root of [...new Set(roots)].sort()) {
    const absolute = path.resolve(workspace, root);
    if (absolute !== workspace && !absolute.startsWith(`${workspace}${path.sep}`)) throw new Error(`source root escapes workspace: ${root}`);
    if (existsSync(absolute)) visit(absolute, root);
  }
  hash.update(`files:${visited}`);
  return `sha256:${hash.digest("hex")}`;
}

/**
 * Ingest an externally observed source checkpoint into run state. Catalogs opt in by declaring
 * the artifact as an input to cascade/surface nodes. A changed accepted fingerprint invalidates
 * every descendant through the ordinary graph mechanism; first observation simply establishes
 * the baseline. The caller remains responsible for persisting run state.
 */
export function ingestSourceFingerprint(
  plan: CompiledPlan,
  run: RunStateDocument,
  artifactId: CatalogArtifactId,
  fingerprint: string,
  now: string,
): "baseline" | "unchanged" | "changed" {
  const binding = run.artifactBindings.find((candidate) => candidate.artifactId === artifactId);
  if (!binding) throw new Error(`source fingerprint artifact is not bound: ${artifactId}`);
  if (!/^sha256:[a-f0-9]{64}$/.test(fingerprint)) throw new Error("source fingerprint must be sha256:<64 lowercase hex>");
  const previous = binding.fingerprint;
  if (binding.accepted && previous === fingerprint) return "unchanged";
  binding.fingerprint = fingerprint;
  binding.accepted = true;
  binding.producedBy = "external.source-observer";
  binding.attemptId = undefined;
  run.updatedAt = now;
  if (!previous) return "baseline";
  invalidateDescendants(plan, run, [artifactId], now);
  return "changed";
}

/** Observe app source at each session/batch boundary and persist the graph input workers open. */
export function observeAppSourceFingerprint(
  plan: CompiledPlan,
  run: RunStateDocument,
  workspaceDir: string,
  now: string,
): "not_configured" | "baseline" | "unchanged" | "changed" {
  const binding = run.artifactBindings.find((candidate) => candidate.path === APP_SOURCE_FINGERPRINT_PATH);
  if (!binding) return "not_configured";
  const fingerprint = fingerprintAppSource(workspaceDir, [
    ...DEFAULT_SOURCE_ROOTS,
    ...plan.nodes.flatMap((node) => (node.sourceAccess ?? []).map((claim) => claim.path)),
  ]);
  const absolute = path.join(workspaceDir, APP_SOURCE_FINGERPRINT_PATH);
  mkdirSync(path.dirname(absolute), { recursive: true });
  writeFileSync(absolute, `${fingerprint}\n`, "utf8");
  return ingestSourceFingerprint(plan, run, binding.artifactId as CatalogArtifactId, fingerprint, now);
}
