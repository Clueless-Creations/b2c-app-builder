import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { upstreamManifestSchema, upstreamObservationSchema, type UpstreamManifest, type UpstreamObservation } from "../../contracts/contribution/contract.js";

/**
 * Authored upstream relationships live in `catalog/upstreams/<id>.yaml` (ADR-0005). Verbatim
 * notice texts live beside them under `notices/`, and dated observations written by
 * `b2c contribute upstream-check --write` live under `observations/`. This loader reads and
 * validates those files. It never fetches, installs, or executes anything.
 */
export const UPSTREAMS_DIRECTORY = "catalog/upstreams";
export const UPSTREAM_NOTICES_DIRECTORY = `${UPSTREAMS_DIRECTORY}/notices`;
export const UPSTREAM_OBSERVATIONS_DIRECTORY = `${UPSTREAMS_DIRECTORY}/observations`;

export interface LoadedUpstream {
  readonly manifest: UpstreamManifest;
  /** Repository-relative manifest path. */
  readonly manifestPath: string;
  /** Verbatim notice text when the manifest names one and it exists. */
  readonly notice?: { readonly path: string; readonly text: string; readonly sha256: string };
  readonly observation?: UpstreamObservation;
  readonly observationPath?: string;
}

export interface UpstreamLoadIssue {
  readonly code: string;
  readonly message: string;
  readonly path?: string;
}

export interface LoadedUpstreams {
  readonly upstreams: LoadedUpstream[];
  readonly issues: UpstreamLoadIssue[];
}

function snakeToCamel(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(snakeToCamel);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
        key.replace(/_([a-z0-9])/gu, (_match, char: string) => char.toUpperCase()),
        snakeToCamel(entry),
      ]),
    );
  }
  return value;
}

export function camelToSnake(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(camelToSnake);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .map(([key, entry]) => [key.replace(/[A-Z]/gu, (char) => `_${char.toLowerCase()}`), camelToSnake(entry)]),
    );
  }
  return value;
}

const sha256 = (value: string | Buffer): string => createHash("sha256").update(value).digest("hex");

function formatZodError(error: unknown): string {
  if (error && typeof error === "object" && "issues" in error && Array.isArray((error as { issues: unknown[] }).issues)) {
    return (error as { issues: Array<{ path: PropertyKey[]; message: string }> }).issues
      .slice(0, 6)
      .map((issue) => `${issue.path.map(String).join(".") || "(root)"}: ${issue.message}`)
      .join("; ");
  }
  return error instanceof Error ? error.message : String(error);
}

/** Parse one authored manifest (snake_case YAML) into the typed contract shape. */
export function parseUpstreamManifest(text: string, sourceLabel = "upstream manifest"): UpstreamManifest {
  const parsed = YAML.parse(text) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error(`${sourceLabel}: manifest must be a mapping.`);
  const result = upstreamManifestSchema.safeParse(snakeToCamel(parsed));
  if (!result.success) throw new Error(`${sourceLabel}: ${formatZodError(result.error)}`);
  return result.data;
}

export function parseUpstreamObservation(text: string, sourceLabel = "upstream observation"): UpstreamObservation {
  const parsed = JSON.parse(text) as unknown;
  const result = upstreamObservationSchema.safeParse(parsed);
  if (!result.success) throw new Error(`${sourceLabel}: ${formatZodError(result.error)}`);
  return result.data;
}

export function upstreamManifestPath(skillRoot: string, upstreamId: string): string {
  return path.join(skillRoot, UPSTREAMS_DIRECTORY, `${upstreamId}.yaml`);
}

export function upstreamObservationPath(skillRoot: string, upstreamId: string): string {
  return path.join(skillRoot, UPSTREAM_OBSERVATIONS_DIRECTORY, `${upstreamId}.json`);
}

export function loadUpstreams(skillRoot: string): LoadedUpstreams {
  const directory = path.join(skillRoot, UPSTREAMS_DIRECTORY);
  const issues: UpstreamLoadIssue[] = [];
  const upstreams: LoadedUpstream[] = [];
  if (!existsSync(directory))
    return { upstreams, issues: [{ code: "upstreams.directory_missing", message: `${UPSTREAMS_DIRECTORY} is missing.`, path: UPSTREAMS_DIRECTORY }] };
  const files = readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.ya?ml$/u.test(entry.name))
    .map((entry) => entry.name)
    .sort();
  const seen = new Set<string>();
  for (const name of files) {
    const relative = `${UPSTREAMS_DIRECTORY}/${name}`;
    let manifest: UpstreamManifest;
    try {
      manifest = parseUpstreamManifest(readFileSync(path.join(directory, name), "utf8"), relative);
    } catch (error) {
      issues.push({ code: "upstreams.manifest_invalid", message: error instanceof Error ? error.message : String(error), path: relative });
      continue;
    }
    if (`${manifest.id}.yaml` !== name) {
      issues.push({
        code: "upstreams.id_filename_mismatch",
        message: `${relative} declares id ${manifest.id}; the file name must be ${manifest.id}.yaml.`,
        path: relative,
      });
    }
    if (seen.has(manifest.id)) issues.push({ code: "upstreams.id_duplicate", message: `Duplicate upstream id ${manifest.id}.`, path: relative });
    seen.add(manifest.id);
    const loaded: { -readonly [K in keyof LoadedUpstream]: LoadedUpstream[K] } = { manifest, manifestPath: relative };
    if (manifest.license.noticeFile) {
      const noticePath = path.join(skillRoot, manifest.license.noticeFile);
      if (!existsSync(noticePath)) {
        issues.push({
          code: "upstreams.notice_missing",
          message: `${manifest.id} names notice file ${manifest.license.noticeFile}, which does not exist.`,
          path: relative,
        });
      } else {
        const text = readFileSync(noticePath, "utf8");
        const digest = sha256(text);
        loaded.notice = { path: manifest.license.noticeFile, text, sha256: digest };
        if (manifest.license.evidenceSha256 && manifest.license.evidenceSha256 !== digest) {
          issues.push({
            code: "upstreams.notice_digest_mismatch",
            message: `${manifest.id} retained notice text does not match license.evidence_sha256; re-review the license before trusting the notice.`,
            path: manifest.license.noticeFile,
          });
        }
      }
    }
    const observationFile = upstreamObservationPath(skillRoot, manifest.id);
    if (existsSync(observationFile)) {
      try {
        const observation = parseUpstreamObservation(readFileSync(observationFile, "utf8"), path.relative(skillRoot, observationFile));
        if (observation.upstreamId !== manifest.id) {
          issues.push({
            code: "upstreams.observation_id_mismatch",
            message: `${observationFile} records ${observation.upstreamId}, not ${manifest.id}.`,
            path: path.relative(skillRoot, observationFile),
          });
        } else {
          loaded.observation = observation;
          loaded.observationPath = path.relative(skillRoot, observationFile);
        }
      } catch (error) {
        issues.push({
          code: "upstreams.observation_invalid",
          message: error instanceof Error ? error.message : String(error),
          path: path.relative(skillRoot, observationFile),
        });
      }
    }
    upstreams.push(loaded);
  }
  return { upstreams, issues };
}

export function findUpstream(skillRoot: string, upstreamId: string): LoadedUpstream | undefined {
  return loadUpstreams(skillRoot).upstreams.find((entry) => entry.manifest.id === upstreamId);
}

/** Serialize a manifest back to the authored snake_case YAML shape (used by scaffolds and tests). */
export function renderUpstreamManifestYaml(manifest: UpstreamManifest): string {
  return YAML.stringify(camelToSnake(manifest), { lineWidth: 120 });
}
