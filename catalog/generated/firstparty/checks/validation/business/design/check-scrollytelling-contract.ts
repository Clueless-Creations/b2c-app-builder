#!/usr/bin/env node
/**
 * check-scrollytelling-contract
 *
 * Checks the portable editorial-scrollytelling contract and the source hooks
 * that keep copy, state, and visuals on one scroll clock. The gate always
 * checks the shipped section runtime under --skill-root. It checks a business
 * surface contract only when a site-shaped landing uses scrollytelling or the
 * contract marks scrollytelling as applicable.
 *
 * This is a static gate. It can prove that declarations and implementation
 * hooks exist. It cannot prove browser timing, layout, or visual quality. The
 * recorded viewport QA and a browser review own those claims.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  asBoolean,
  asString,
  collectFiles,
  flagString,
  getPath,
  isRecord,
  issue,
  parseFlags,
  reportAndExit,
  type Issue,
} from "../../../../tooling/lib/launch-state.js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const defaultSkillRoot = path.resolve(scriptDir, "../../../..");
const flags = parseFlags(process.argv.slice(2), [
  { flags: ["--skill-root"], key: "skillRoot" },
  { flags: ["--root", "--workspace-root"], key: "workspaceRoot" },
]);
const skillRoot = path.resolve(flagString(flags, "skillRoot") ?? defaultSkillRoot);
const workspaceRoot = path.resolve(flagString(flags, "workspaceRoot") ?? path.join(skillRoot, "examples/workspace/business"));

const RUNTIME_PATH = "examples/workspace/business/growth/landing/sections/Scrollytelling.tsx";
const RUNTIME_SUPPORT_PATHS = [
  "examples/workspace/business/growth/landing/lib/scene-progress.ts",
  "examples/workspace/business/growth/landing/lib/scroll-scene-controller.ts",
  "examples/workspace/business/growth/landing/motion.css",
];
const EXAMPLE_PATH = "examples/workspace/business/growth/landing/surface-contract.example.json";
const CONTRACT_PATH = "growth/landing/surface-contract.json";
const WEB_SOURCE_EXTENSIONS = new Set([".css", ".html", ".js", ".jsx", ".mjs", ".mts", ".ts", ".tsx"]);
const SCAN_ROOTS = ["growth/landing", "growth/funnel", "web"];
// Must stay identical to scene-progress.ts STATE_ID_PATTERN: SSR calls
// assertStableStateIds before hydration, so accepting a broader contract here
// would turn a green static gate into a runtime throw.
const STABLE_SLUG = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
const VALID_ROLES = {
  situation: new Set(["situation", "need"]),
  intervention: new Set(["decision", "intervention", "mechanism"]),
  outcome: new Set(["outcome", "proof"]),
};
const VALID_SOURCE_KINDS = new Set(["html", "svg", "canvas", "image", "video"]);
const VALID_DIRECTIONS = new Set(["forward", "reverse", "jump"]);
const VALID_RESULTS = new Set(["pass", "fail", "pending"]);
const VALID_QA_MODES = new Set(["default", "short_mobile", "reduced_motion", "no_js", "save_data"]);
const DEGRADED_QA_MODES = ["short_mobile", "reduced_motion", "no_js", "save_data"] as const;
const CONTENT_ASSET_MANIFEST_PATH = "growth/content-assets/manifest.json";
// Keep this vocabulary aligned with check-content-assets.ts. These are the
// statuses that activate its done-output and provenance checks; draft records
// are not evidence that a landing asset is approved for use.
const APPROVED_CONTENT_ASSET_STATUSES = new Set(["done", "ready", "production", "approved"]);
const CONTENT_ASSET_REQUIRED_STRINGS = ["asset_id", "surface", "route", "status", "license_status"] as const;
const CONTENT_ASSET_REQUIRED_ARRAYS = ["inputs", "outputs", "truth_constraints", "approvals"] as const;
const STILL_OUTPUT = /\.(?:avif|jpe?g|png|svg|webp)(?:$|[?#])/iu;
const VIDEO_OUTPUT = /\.(?:avi|m4v|mkv|mov|mp4|webm)(?:$|[?#])/iu;

export interface ScrollytellingValidationContext {
  file: string;
  topLevelLocales?: string[];
  requirePassingQa: boolean;
  workspaceRoot?: string;
}

interface ContentAssetManifestEntry {
  index: number;
  record: Record<string, unknown>;
}

interface ContentAssetManifestIndex {
  assets: Map<string, ContentAssetManifestEntry>;
  file: string;
}

function pushMissing(issues: Issue[], code: string, field: string, file: string): void {
  issues.push(issue("error", `scrollytelling.contract.${code}.missing`, `${field} must be a non-empty string.`, file));
}

function stringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || !item.trim())) return undefined;
  return value.map((item) => String(item).trim());
}

function requireStringField(record: Record<string, unknown>, field: string, code: string, file: string, issues: Issue[]): string | undefined {
  const value = asString(record[field])?.trim();
  if (!value) pushMissing(issues, code, field, file);
  return value;
}

function duplicateValues(values: string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates];
}

function validateDigest(
  record: Record<string, unknown>,
  field: string,
  code: string,
  label: string,
  context: ScrollytellingValidationContext,
  issues: Issue[],
): string | undefined {
  const digest = requireStringField(record, field, code, context.file, issues);
  if (digest && !SHA256.test(digest)) {
    issues.push(issue("error", `scrollytelling.contract.${code}.invalid`, `${label}.${field} must be a lowercase SHA-256 digest.`, context.file));
  } else if (digest && context.requirePassingQa && /^0{64}$/u.test(digest)) {
    issues.push(
      issue(
        "error",
        `scrollytelling.contract.${code}.placeholder`,
        `${label}.${field} is the template placeholder. Hash the approved locale copy before treating the active landing as verified.`,
        context.file,
      ),
    );
  }
  return digest;
}

function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function htmlAnchors(source: string): Set<string> {
  const anchors = new Set<string>();
  for (const match of source.matchAll(/\b(?:id|name)\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s"'=<>`]+))/giu)) {
    const value = match[1] ?? match[2] ?? match[3];
    if (value) anchors.add(value);
  }
  return anchors;
}

function markdownHeadingSlug(text: string): string {
  return text
    .replace(/\[([^\]]+)\]\([^)]+\)/gu, "$1")
    .replace(/<[^>]+>/gu, "")
    .replace(/[`*_~]/gu, "")
    .trim()
    .toLowerCase()
    .replace(/[!"#$%&'()*+,./:;<=>?@[\\\]^`{|}~]/gu, "")
    .replace(/\s+/gu, "-");
}

function markdownAnchors(source: string): Set<string> {
  const anchors = htmlAnchors(source);
  const counts = new Map<string, number>();
  for (const line of source.split(/\r?\n/u)) {
    const match = line.match(/^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/u);
    if (!match) continue;
    let heading = match[1] ?? "";
    const explicit = heading.match(/\s+\{#([^}\s]+)\}\s*$/u);
    if (explicit?.[1]) {
      anchors.add(explicit[1]);
      heading = heading.slice(0, explicit.index).trim();
    }
    const base = markdownHeadingSlug(heading);
    if (!base) continue;
    const duplicateIndex = counts.get(base) ?? 0;
    anchors.add(duplicateIndex === 0 ? base : `${base}-${duplicateIndex}`);
    counts.set(base, duplicateIndex + 1);
  }
  return anchors;
}

function validateEvidenceReference(reference: string, label: string, context: ScrollytellingValidationContext, issues: Issue[]): void {
  if (!context.requirePassingQa || !context.workspaceRoot || /^https?:\/\//iu.test(reference)) return;
  const fragmentIndex = reference.indexOf("#");
  const pathPart = (fragmentIndex >= 0 ? reference.slice(0, fragmentIndex) : reference).trim();
  const rawFragment = fragmentIndex >= 0 ? reference.slice(fragmentIndex + 1).trim() : "";
  const resolved = path.resolve(context.workspaceRoot, pathPart);
  const root = path.resolve(context.workspaceRoot);
  const insideRoot = resolved === root || resolved.startsWith(`${root}${path.sep}`);
  if (!pathPart || !insideRoot || !existsSync(resolved)) {
    issues.push(
      issue(
        "error",
        "scrollytelling.contract.evidence_path.missing",
        `${label} must resolve to an existing path under the business workspace, or use an explicit http/https URL.`,
        context.file,
      ),
    );
    return;
  }
  if (!rawFragment) return;

  let fragment: string;
  try {
    fragment = decodeURIComponent(rawFragment);
  } catch {
    fragment = rawFragment;
  }
  let source: string;
  try {
    source = readFileSync(resolved, "utf8");
  } catch {
    source = "";
  }
  const extension = path.extname(resolved).toLowerCase();
  const anchors = [".md", ".markdown", ".mdx"].includes(extension)
    ? markdownAnchors(source)
    : [".html", ".htm"].includes(extension)
      ? htmlAnchors(source)
      : new Set<string>();
  if (!anchors.has(fragment)) {
    issues.push(
      issue(
        "error",
        "scrollytelling.contract.evidence_fragment.missing",
        `${label} fragment #${rawFragment} must resolve to an explicit Markdown heading slug or HTML id/name in ${pathPart}.`,
        context.file,
      ),
    );
  }
}

function loadContentAssetManifest(context: ScrollytellingValidationContext, issues: Issue[]): ContentAssetManifestIndex | undefined {
  const root = context.workspaceRoot ? path.resolve(context.workspaceRoot) : undefined;
  const manifestAbsolute = root ? path.join(root, CONTENT_ASSET_MANIFEST_PATH) : undefined;
  if (!manifestAbsolute || !existsSync(manifestAbsolute)) {
    issues.push(
      issue(
        "error",
        "scrollytelling.contract.content_asset_manifest.missing",
        `Active image and video scenes require the canonical ${CONTENT_ASSET_MANIFEST_PATH} manifest under the business workspace.`,
        context.file,
      ),
    );
    return undefined;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(manifestAbsolute, "utf8"));
  } catch (error) {
    issues.push(
      issue(
        "error",
        "scrollytelling.contract.content_asset_manifest.invalid_json",
        `${CONTENT_ASSET_MANIFEST_PATH} is invalid JSON: ${String(error)}`,
        CONTENT_ASSET_MANIFEST_PATH,
      ),
    );
    return undefined;
  }

  const rows = Array.isArray(parsed) ? parsed : isRecord(parsed) && Array.isArray(parsed.assets) ? parsed.assets : undefined;
  if (!rows) {
    issues.push(
      issue(
        "error",
        "scrollytelling.contract.content_asset_manifest.invalid",
        `${CONTENT_ASSET_MANIFEST_PATH} must be an asset array or an object with an assets array, matching the content-asset contract.`,
        CONTENT_ASSET_MANIFEST_PATH,
      ),
    );
    return undefined;
  }

  const assets = new Map<string, ContentAssetManifestEntry>();
  rows.forEach((row, index) => {
    if (!isRecord(row)) {
      issues.push(
        issue(
          "error",
          "scrollytelling.contract.content_asset_manifest.asset.invalid",
          `Content asset manifest row ${index} must be an object.`,
          CONTENT_ASSET_MANIFEST_PATH,
        ),
      );
      return;
    }
    const assetId = asString(row.asset_id)?.trim();
    if (!assetId) return;
    if (assets.has(assetId)) {
      issues.push(
        issue(
          "error",
          "scrollytelling.contract.content_asset_manifest.asset_id.duplicate",
          `Content asset manifest asset_id ${assetId} is duplicated, so a scene reference cannot resolve deterministically.`,
          CONTENT_ASSET_MANIFEST_PATH,
        ),
      );
      return;
    }
    assets.set(assetId, { index, record: row });
  });
  return { assets, file: CONTENT_ASSET_MANIFEST_PATH };
}

function manifestFieldLabel(entry: ContentAssetManifestEntry, field: string): string {
  return `content-assets manifest row ${entry.index} (${asString(entry.record.asset_id)?.trim() ?? "missing asset_id"}).${field}`;
}

function validateApprovedContentAsset(
  assetId: string,
  referenceField: "asset_id" | "poster_asset_id",
  manifest: ContentAssetManifestIndex | undefined,
  context: ScrollytellingValidationContext,
  issues: Issue[],
): ContentAssetManifestEntry | undefined {
  if (!manifest) return undefined;
  const entry = manifest.assets.get(assetId);
  if (!entry) {
    issues.push(
      issue(
        "error",
        `scrollytelling.contract.${referenceField}.unknown`,
        `${referenceField} ${assetId} does not resolve to a record in ${manifest.file}.`,
        context.file,
      ),
    );
    return undefined;
  }

  for (const field of CONTENT_ASSET_REQUIRED_STRINGS) {
    if (!asString(entry.record[field])?.trim()) {
      issues.push(
        issue(
          "error",
          `scrollytelling.contract.${referenceField}.manifest_record_invalid`,
          `${manifestFieldLabel(entry, field)} must be a non-empty string under the canonical content-asset schema.`,
          manifest.file,
        ),
      );
    }
  }
  for (const field of CONTENT_ASSET_REQUIRED_ARRAYS) {
    if (!stringArray(entry.record[field])?.length) {
      issues.push(
        issue(
          "error",
          `scrollytelling.contract.${referenceField}.manifest_record_invalid`,
          `${manifestFieldLabel(entry, field)} must be a non-empty string array under the canonical content-asset schema.`,
          manifest.file,
        ),
      );
    }
  }

  const status = asString(entry.record.status)?.trim().toLowerCase() ?? "";
  if (!APPROVED_CONTENT_ASSET_STATUSES.has(status)) {
    issues.push(
      issue(
        "error",
        `scrollytelling.contract.${referenceField}.unapproved`,
        `${referenceField} ${assetId} has status ${status || "missing"}. Scrollytelling may use only done-tier content assets (${[
          ...APPROVED_CONTENT_ASSET_STATUSES,
        ].join(", ")}).`,
        manifest.file,
      ),
    );
  }

  const root = context.workspaceRoot ? path.resolve(context.workspaceRoot) : undefined;
  for (const output of stringArray(entry.record.outputs) ?? []) {
    if (/^[a-z][a-z0-9+.-]*:/iu.test(output) || output.startsWith("#")) continue;
    const resolved = root ? path.resolve(root, output) : undefined;
    const insideRoot = Boolean(resolved && root && (resolved === root || resolved.startsWith(`${root}${path.sep}`)));
    if (!resolved || !insideRoot || !existsSync(resolved)) {
      issues.push(
        issue(
          "error",
          `scrollytelling.contract.${referenceField}.output_missing`,
          `${referenceField} ${assetId} is done-tier, but its local output does not resolve under the business workspace: ${output}.`,
          manifest.file,
        ),
      );
    }
  }
  return entry;
}

function manifestOutputs(entry: ContentAssetManifestEntry | undefined): string[] {
  return entry ? (stringArray(entry.record.outputs) ?? []) : [];
}

/** Validate one scrollytelling object from surface-contract.json. */
export function validateScrollytellingContract(value: unknown, context: ScrollytellingValidationContext): Issue[] {
  const issues: Issue[] = [];
  const { file, requirePassingQa } = context;
  if (!isRecord(value)) {
    issues.push(issue("error", "scrollytelling.contract.invalid", "scrollytelling must be an object.", file));
    return issues;
  }

  const applicable = asBoolean(value.applicable);
  if (applicable === undefined) {
    issues.push(issue("error", "scrollytelling.contract.applicable.invalid", "scrollytelling.applicable must be true or false.", file));
  }
  const contractEvidence = requireStringField(value, "evidence", "evidence", file, issues);
  if (contractEvidence && applicable === true) validateEvidenceReference(contractEvidence, "scrollytelling.evidence", context, issues);

  if (applicable === false) {
    for (const field of ["locales", "scenes", "qa"] as const) {
      const rows = value[field];
      if (!Array.isArray(rows)) {
        issues.push(
          issue("error", `scrollytelling.contract.${field}.invalid`, `scrollytelling.${field} must be an empty array when applicable is false.`, file),
        );
      } else if (rows.length > 0) {
        issues.push(
          issue(
            "error",
            `scrollytelling.contract.not_applicable.${field}_not_empty`,
            `scrollytelling.${field} must be empty when applicable is false; the evidence field owns the plain-language rationale.`,
            file,
          ),
        );
      }
    }
    return issues;
  }

  const locales = stringArray(value.locales);
  if (!locales) {
    issues.push(issue("error", "scrollytelling.contract.locales.invalid", "scrollytelling.locales must be an array of non-empty locale tags.", file));
  } else {
    const duplicates = duplicateValues(locales);
    if (duplicates.length > 0) {
      issues.push(issue("error", "scrollytelling.contract.locales.duplicate", `scrollytelling.locales repeats: ${duplicates.join(", ")}.`, file));
    }
    for (const locale of locales) {
      if (!/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/u.test(locale)) {
        issues.push(issue("error", "scrollytelling.contract.locale.invalid", `${locale} is not a stable locale tag.`, file));
      }
    }
    const missingLocales = (context.topLevelLocales ?? []).filter((locale) => !locales.includes(locale));
    if (missingLocales.length > 0) {
      issues.push(
        issue(
          "error",
          "scrollytelling.contract.locale_coverage.missing",
          `Scrollytelling has no contract coverage for landing locale(s): ${missingLocales.join(", ")}.`,
          file,
        ),
      );
    }
  }

  if (!Array.isArray(value.scenes)) {
    issues.push(issue("error", "scrollytelling.contract.scenes.invalid", "scrollytelling.scenes must be an array.", file));
  }
  if (!Array.isArray(value.qa)) {
    issues.push(issue("error", "scrollytelling.contract.qa.invalid", "scrollytelling.qa must be an array.", file));
  }
  if (applicable !== true) return issues;

  const scenes = Array.isArray(value.scenes) ? value.scenes : [];
  if (scenes.length === 0) {
    issues.push(
      issue(
        "error",
        "scrollytelling.contract.scenes.missing",
        "An applicable editorial sequence needs at least one scene with ordered situation or need, intervention or mechanism, and outcome or proof roles.",
        file,
      ),
    );
  }

  const sceneIds: string[] = [];
  const sceneStateIds = new Map<string, Set<string>>();
  const contentAssetManifest =
    requirePassingQa &&
    scenes.some((candidate) => isRecord(candidate) && (asString(candidate.source_kind) === "image" || asString(candidate.source_kind) === "video"))
      ? loadContentAssetManifest(context, issues)
      : undefined;

  scenes.forEach((candidate, index) => {
    const label = `scrollytelling.scenes[${index}]`;
    if (!isRecord(candidate)) {
      issues.push(issue("error", "scrollytelling.contract.scene.invalid", `${label} must be an object.`, file));
      return;
    }

    const id = requireStringField(candidate, "id", `scene.${index}.id`, file, issues);
    if (id) {
      sceneIds.push(id);
      if (!STABLE_SLUG.test(id)) {
        issues.push(issue("error", "scrollytelling.contract.scene_id.invalid", `${label}.id must be a stable lowercase slug.`, file));
      }
    }

    const roles = stringArray(candidate.narrative_roles);
    if (!roles || roles.length === 0) {
      issues.push(issue("error", "scrollytelling.contract.narrative_roles.missing", `${label}.narrative_roles must name at least one narrative role.`, file));
    } else {
      const normalizedRoles = roles.map((role) => role.toLowerCase());
      const situation = normalizedRoles.findIndex((role) => VALID_ROLES.situation.has(role));
      const intervention = normalizedRoles.findIndex((role) => VALID_ROLES.intervention.has(role));
      const outcome = normalizedRoles.findIndex((role) => VALID_ROLES.outcome.has(role));
      if (situation < 0 || intervention < 0 || outcome < 0) {
        issues.push(
          issue(
            "error",
            "scrollytelling.contract.narrative_sequence.incomplete",
            `${label}.narrative_roles must include a situation or need, then a decision, intervention, or mechanism, then an outcome or proof.`,
            file,
          ),
        );
      } else if (!(situation < intervention && intervention < outcome)) {
        issues.push(
          issue(
            "error",
            "scrollytelling.contract.narrative_sequence.out_of_order",
            `${label}.narrative_roles is out of order. Establish the situation or need before the mechanism, then show the outcome or proof.`,
            file,
          ),
        );
      }
    }

    const states = stringArray(candidate.states);
    if (!states || states.length === 0) {
      issues.push(issue("error", "scrollytelling.contract.states.missing", `${label}.states must name at least one stable state ID.`, file));
    } else {
      for (const stateId of states) {
        if (!STABLE_SLUG.test(stateId)) {
          issues.push(
            issue("error", "scrollytelling.contract.state_id.invalid", `${label}.states contains ${stateId}; state IDs must be lowercase slugs.`, file),
          );
        }
      }
      if (id) sceneStateIds.set(id, new Set(states));
      const duplicates = duplicateValues(states);
      if (duplicates.length > 0) {
        issues.push(issue("error", "scrollytelling.contract.state_id.duplicate", `${label}.states repeats: ${duplicates.join(", ")}.`, file));
      }
    }
    if (roles && states && roles.length !== states.length) {
      issues.push(
        issue(
          "error",
          "scrollytelling.contract.role_state_count_mismatch",
          `${label}.narrative_roles and ${label}.states must have the same length so each visual state maps to one story role.`,
          file,
        ),
      );
    }

    for (const localeDependentField of ["copy_key", "copy_sha256", "caption", "accessible_description"] as const) {
      if (candidate[localeDependentField] !== undefined) {
        issues.push(
          issue(
            "error",
            "scrollytelling.contract.localization.scene_field",
            `${label}.${localeDependentField} is locale-dependent and must move into ${label}.localizations.`,
            file,
          ),
        );
      }
    }

    const localizationRows = Array.isArray(candidate.localizations) ? candidate.localizations : undefined;
    if (!localizationRows) {
      issues.push(
        issue(
          "error",
          "scrollytelling.contract.localizations.invalid",
          `${label}.localizations must contain exactly one row for each scrollytelling locale.`,
          file,
        ),
      );
    } else {
      const localizationLocales: string[] = [];
      localizationRows.forEach((localization, localizationIndex) => {
        const localizationLabel = `${label}.localizations[${localizationIndex}]`;
        if (!isRecord(localization)) {
          issues.push(issue("error", "scrollytelling.contract.localization.invalid", `${localizationLabel} must be an object.`, file));
          return;
        }
        const locale = requireStringField(localization, "locale", `scene.${index}.localization.${localizationIndex}.locale`, file, issues);
        if (locale) {
          localizationLocales.push(locale);
          if (locales && !locales.includes(locale)) {
            issues.push(
              issue(
                "error",
                "scrollytelling.contract.localization.locale_unknown",
                `${localizationLabel}.locale is not declared in scrollytelling.locales.`,
                file,
              ),
            );
          }
        }

        const beats = Array.isArray(localization.beats) ? localization.beats : undefined;
        if (!beats) {
          issues.push(issue("error", "scrollytelling.contract.localization.beats.invalid", `${localizationLabel}.beats must be an array.`, file));
        } else {
          const beatStateIds: string[] = [];
          beats.forEach((beat, beatIndex) => {
            const beatLabel = `${localizationLabel}.beats[${beatIndex}]`;
            if (!isRecord(beat)) {
              issues.push(issue("error", "scrollytelling.contract.localization.beat.invalid", `${beatLabel} must be an object.`, file));
              beatStateIds.push("");
              return;
            }
            const stateId = requireStringField(beat, "state_id", `scene.${index}.localization.${localizationIndex}.beat.${beatIndex}.state_id`, file, issues);
            beatStateIds.push(stateId ?? "");
            const text = requireStringField(beat, "text", `scene.${index}.localization.${localizationIndex}.beat.${beatIndex}.text`, file, issues);
            requireStringField(beat, "copy_key", `scene.${index}.localization.${localizationIndex}.beat.${beatIndex}.copy_key`, file, issues);
            const digest = validateDigest(
              beat,
              "copy_sha256",
              `scene.${index}.localization.${localizationIndex}.beat.${beatIndex}.copy_sha256`,
              beatLabel,
              context,
              issues,
            );
            if (requirePassingQa && text && digest && SHA256.test(digest) && !/^0{64}$/u.test(digest) && digest !== sha256(text)) {
              issues.push(
                issue(
                  "error",
                  "scrollytelling.contract.localization.copy_digest_mismatch",
                  `${beatLabel}.copy_sha256 must hash the exact localized text in ${beatLabel}.text.`,
                  file,
                ),
              );
            }
          });
          if (!states || beatStateIds.length !== states.length || beatStateIds.some((stateId, stateIndex) => stateId !== states[stateIndex])) {
            issues.push(
              issue(
                "error",
                "scrollytelling.contract.localization.beat_state_order_mismatch",
                `${localizationLabel}.beats state_id values must match ${label}.states exactly and in order.`,
                file,
              ),
            );
          }
        }

        for (const field of ["caption", "accessible_description"] as const) {
          const localizedCopy = localization[field];
          const copyLabel = `${localizationLabel}.${field}`;
          if (!isRecord(localizedCopy)) {
            issues.push(
              issue("error", `scrollytelling.contract.localization.${field}.invalid`, `${copyLabel} must contain text, copy_key, and copy_sha256.`, file),
            );
            continue;
          }
          const text = requireStringField(localizedCopy, "text", `scene.${index}.localization.${localizationIndex}.${field}.text`, file, issues);
          requireStringField(localizedCopy, "copy_key", `scene.${index}.localization.${localizationIndex}.${field}.copy_key`, file, issues);
          const digest = validateDigest(
            localizedCopy,
            "copy_sha256",
            `scene.${index}.localization.${localizationIndex}.${field}.copy_sha256`,
            copyLabel,
            context,
            issues,
          );
          if (requirePassingQa && text && digest && SHA256.test(digest) && !/^0{64}$/u.test(digest) && digest !== sha256(text)) {
            issues.push(
              issue(
                "error",
                "scrollytelling.contract.localization.copy_digest_mismatch",
                `${copyLabel}.copy_sha256 must hash the exact localized text in ${copyLabel}.text.`,
                file,
              ),
            );
          }
        }
      });

      const duplicateLocales = duplicateValues(localizationLocales);
      if (duplicateLocales.length > 0) {
        issues.push(
          issue(
            "error",
            "scrollytelling.contract.localization.locale_duplicate",
            `${label}.localizations repeats locale(s): ${duplicateLocales.join(", ")}.`,
            file,
          ),
        );
      }
      const missingLocalizationLocales = (locales ?? []).filter((locale) => !localizationLocales.includes(locale));
      if (missingLocalizationLocales.length > 0 || localizationLocales.length !== (locales ?? []).length) {
        issues.push(
          issue(
            "error",
            "scrollytelling.contract.localization.locale_coverage",
            `${label}.localizations must cover every scrollytelling locale exactly once. Missing: ${missingLocalizationLocales.join(", ") || "none"}.`,
            file,
          ),
        );
      }
    }

    for (const field of ["visual_job", "evidence_id"] as const) {
      requireStringField(candidate, field, `scene.${index}.${field}`, file, issues);
    }

    const sourceKind = requireStringField(candidate, "source_kind", `scene.${index}.source_kind`, file, issues);
    if (sourceKind && !VALID_SOURCE_KINDS.has(sourceKind)) {
      issues.push(
        issue("error", "scrollytelling.contract.source_kind.invalid", `${label}.source_kind must be one of ${[...VALID_SOURCE_KINDS].join(", ")}.`, file),
      );
    }
    const heavySource = sourceKind === "image" || sourceKind === "video";
    const assetId = asString(candidate.asset_id)?.trim();
    let primaryAsset: ContentAssetManifestEntry | undefined;
    if (heavySource && !assetId) {
      issues.push(issue("error", "scrollytelling.contract.asset_id.missing", `${label}.asset_id is required for ${sourceKind} source scenes.`, file));
    } else if (heavySource && assetId && requirePassingQa) {
      primaryAsset = validateApprovedContentAsset(assetId, "asset_id", contentAssetManifest, context, issues);
      const outputs = manifestOutputs(primaryAsset);
      const expectedOutput = sourceKind === "video" ? VIDEO_OUTPUT : STILL_OUTPUT;
      if (outputs.length > 0 && !outputs.some((output) => expectedOutput.test(output))) {
        issues.push(
          issue(
            "error",
            "scrollytelling.contract.asset_id.source_kind_mismatch",
            `${label}.asset_id ${assetId} has no ${sourceKind} output in ${CONTENT_ASSET_MANIFEST_PATH}. The declared source_kind must match the approved output.`,
            file,
          ),
        );
      }
    }

    if (!isRecord(candidate.activation_guides)) {
      issues.push(
        issue("error", "scrollytelling.contract.activation_guides.invalid", `${label}.activation_guides must define desktop, mobile, and short_mobile.`, file),
      );
    } else {
      const guides: Record<"desktop" | "mobile" | "short_mobile", number | undefined> = {
        desktop: undefined,
        mobile: undefined,
        short_mobile: undefined,
      };
      for (const mode of ["desktop", "mobile", "short_mobile"] as const) {
        const guide = candidate.activation_guides[mode];
        if (typeof guide !== "number" || !Number.isFinite(guide) || guide < 0 || guide > 1) {
          issues.push(
            issue("error", "scrollytelling.contract.activation_guide.invalid", `${label}.activation_guides.${mode} must be a number from 0 to 1.`, file),
          );
        } else {
          guides[mode] = guide;
        }
      }
      if (guides.desktop !== undefined && guides.mobile !== undefined && guides.short_mobile !== undefined) {
        if (guides.mobile === guides.desktop && guides.short_mobile === guides.desktop) {
          issues.push(
            issue(
              "error",
              "scrollytelling.contract.activation_guides.responsive_authorship_missing",
              `${label}.activation_guides cannot reuse the desktop guide for both mobile modes. Record the authored responsive activation choices.`,
              file,
            ),
          );
        }
        if (guides.short_mobile === guides.mobile || guides.short_mobile === guides.desktop) {
          issues.push(
            issue(
              "error",
              "scrollytelling.contract.activation_guides.short_mobile_not_distinct",
              `${label}.activation_guides.short_mobile must be independently authored and distinct from both desktop and mobile.`,
              file,
            ),
          );
        }
      }
    }

    if (!isRecord(candidate.modes)) {
      issues.push(
        issue("error", "scrollytelling.contract.modes.invalid", `${label}.modes must define mobile, reduced_motion, no_js, and save_data behavior.`, file),
      );
    } else {
      const expected: Record<string, Set<string>> = {
        mobile: new Set(["recomposed", "inline"]),
        reduced_motion: new Set(["final"]),
        no_js: new Set(["final"]),
        save_data: new Set(sourceKind === "image" || sourceKind === "video" ? ["poster", "omit"] : ["code-native"]),
      };
      for (const [mode, allowed] of Object.entries(expected)) {
        const modeValue = asString(candidate.modes[mode]);
        if (!modeValue || !allowed.has(modeValue)) {
          issues.push(
            issue(
              "error",
              `scrollytelling.contract.mode.${mode}.invalid`,
              `${label}.modes.${mode} must be ${[...allowed].join(" or ")}; Save-Data can replace heavy media, but it cannot freeze a code-native scene.`,
              file,
            ),
          );
        }
      }
    }
    const posterAssetId = asString(candidate.poster_asset_id)?.trim();
    if (heavySource && isRecord(candidate.modes) && candidate.modes.save_data === "poster") {
      if (!posterAssetId) {
        issues.push(
          issue(
            "error",
            "scrollytelling.contract.poster_asset_id.missing",
            `${label}.poster_asset_id must identify an authored Save-Data poster for ${sourceKind} scenes. A mode declaration alone is not poster evidence.`,
            file,
          ),
        );
      } else if (requirePassingQa) {
        const posterAsset = validateApprovedContentAsset(posterAssetId, "poster_asset_id", contentAssetManifest, context, issues);
        if (assetId && posterAssetId === assetId) {
          issues.push(
            issue(
              "error",
              "scrollytelling.contract.poster_asset_id.same_as_primary",
              `${label}.poster_asset_id must be a distinct approved still asset, not the same heavy record as asset_id.`,
              file,
            ),
          );
        }
        const posterOutputs = manifestOutputs(posterAsset);
        const posterHasVideoOutput = posterOutputs.some((output) => VIDEO_OUTPUT.test(output));
        const posterHasStillOutput = posterOutputs.some((output) => STILL_OUTPUT.test(output));
        const posterDuration = posterAsset?.record.duration_seconds;
        if (posterOutputs.length > 0 && (posterHasVideoOutput || !posterHasStillOutput || (typeof posterDuration === "number" && posterDuration > 0))) {
          issues.push(
            issue(
              "error",
              "scrollytelling.contract.poster_asset_id.not_lightweight",
              `${label}.poster_asset_id ${posterAssetId} must resolve to a distinct still-image output, not a video or other heavy-media record.`,
              file,
            ),
          );
        }
      }
    }
    if (heavySource && isRecord(candidate.modes) && candidate.modes.save_data === "omit" && posterAssetId) {
      issues.push(
        issue(
          "error",
          "scrollytelling.contract.poster_asset_id.unexpected",
          `${label}.poster_asset_id must be absent when modes.save_data is omit. Declare poster only when the authored poster will actually render.`,
          file,
        ),
      );
    }

    if (typeof candidate.forward_reverse !== "boolean") {
      issues.push(
        issue(
          "error",
          "scrollytelling.contract.forward_reverse.invalid",
          `${label}.forward_reverse must be a Boolean proof flag. Keep it false in an unverified template.`,
          file,
        ),
      );
    } else if (requirePassingQa && candidate.forward_reverse !== true) {
      issues.push(
        issue(
          "error",
          "scrollytelling.contract.forward_reverse.missing",
          `${label}.forward_reverse must be true; each scene must be verified in both directions.`,
          file,
        ),
      );
    }
  });

  for (const [kind, values] of [["scene_id", sceneIds]] as const) {
    const duplicates = duplicateValues(values);
    if (duplicates.length > 0) {
      issues.push(
        issue("error", `scrollytelling.contract.${kind}.duplicate`, `Scrollytelling ${kind.replace("_", " ")}(s) repeat: ${duplicates.join(", ")}.`, file),
      );
    }
  }

  const qa = Array.isArray(value.qa) ? value.qa : [];
  const qaViewports: string[] = [];
  const qaLocales = new Set<string>();
  const qaCoverage: Array<{
    viewport?: string;
    browser?: string;
    platform?: string;
    mode?: string;
    direction?: string;
    sceneId?: string;
    expectedState?: string;
    locale?: string;
  }> = [];
  qa.forEach((candidate, index) => {
    const label = `scrollytelling.qa[${index}]`;
    if (!isRecord(candidate)) {
      issues.push(issue("error", "scrollytelling.contract.qa_row.invalid", `${label} must be an object.`, file));
      return;
    }
    const viewport = requireStringField(candidate, "viewport", `qa.${index}.viewport`, file, issues);
    if (viewport) qaViewports.push(viewport.toLowerCase());
    const browser = requireStringField(candidate, "browser", `qa.${index}.browser`, file, issues);
    const platform = requireStringField(candidate, "platform", `qa.${index}.platform`, file, issues);
    const mode = requireStringField(candidate, "mode", `qa.${index}.mode`, file, issues);
    if (mode) {
      if (!VALID_QA_MODES.has(mode)) {
        issues.push(issue("error", "scrollytelling.contract.qa.mode.invalid", `${label}.mode must be one of ${[...VALID_QA_MODES].join(", ")}.`, file));
      }
    }
    const locale = requireStringField(candidate, "locale", `qa.${index}.locale`, file, issues);
    if (locale) {
      qaLocales.add(locale);
      if (locales && !locales.includes(locale)) {
        issues.push(issue("error", "scrollytelling.contract.qa.locale_unknown", `${label}.locale does not exist in scrollytelling.locales.`, file));
      }
    }
    const direction = requireStringField(candidate, "direction", `qa.${index}.direction`, file, issues);
    if (direction) {
      if (!VALID_DIRECTIONS.has(direction)) {
        issues.push(issue("error", "scrollytelling.contract.qa.direction.invalid", `${label}.direction must be forward, reverse, or jump.`, file));
      }
    }
    const sceneId = requireStringField(candidate, "scene_id", `qa.${index}.scene_id`, file, issues);
    if (sceneId && !sceneIds.includes(sceneId)) {
      issues.push(issue("error", "scrollytelling.contract.qa.scene_unknown", `${label}.scene_id does not resolve to a declared scene.`, file));
    }
    const expectedState = requireStringField(candidate, "expected_state", `qa.${index}.expected_state`, file, issues);
    if (sceneId && expectedState && !sceneStateIds.get(sceneId)?.has(expectedState)) {
      issues.push(issue("error", "scrollytelling.contract.qa.state_unknown", `${label}.expected_state does not resolve inside scene ${sceneId}.`, file));
    }
    const result = requireStringField(candidate, "result", `qa.${index}.result`, file, issues);
    if (result && !VALID_RESULTS.has(result)) {
      issues.push(issue("error", "scrollytelling.contract.qa.result.invalid", `${label}.result must be pass, fail, or pending.`, file));
    } else if (result && requirePassingQa && result !== "pass") {
      issues.push(
        issue(
          "error",
          "scrollytelling.contract.qa.not_passing",
          `${label}.result is ${result}; an active landing cannot claim completed scrollytelling QA.`,
          file,
        ),
      );
    }
    const evidence = requireStringField(candidate, "evidence", `qa.${index}.evidence`, file, issues);
    if (evidence) validateEvidenceReference(evidence, `${label}.evidence`, context, issues);
    qaCoverage.push({ viewport, browser, platform, mode, direction, sceneId, expectedState, locale });
  });

  for (const [sceneId, stateIds] of sceneStateIds) {
    for (const stateId of stateIds) {
      for (const direction of ["forward", "reverse"]) {
        const covered = qaCoverage.some(
          (row) => row.mode === "default" && row.direction === direction && row.sceneId === sceneId && row.expectedState === stateId,
        );
        if (!covered) {
          issues.push(
            issue(
              "error",
              "scrollytelling.contract.qa.state_direction.missing",
              `QA needs a default-mode ${direction} row for scene ${sceneId}, state ${stateId}.`,
              file,
            ),
          );
        }
      }
    }
    if (!qaCoverage.some((row) => row.sceneId === sceneId && row.mode === "default" && row.direction === "jump")) {
      issues.push(
        issue("error", "scrollytelling.contract.qa.jump.missing", `QA needs a default-mode jump or restored-position row for scene ${sceneId}.`, file),
      );
    }
    for (const mode of DEGRADED_QA_MODES) {
      if (!qaCoverage.some((row) => row.sceneId === sceneId && row.mode === mode)) {
        issues.push(
          issue(
            "error",
            `scrollytelling.contract.qa.${mode}.missing`,
            `QA needs a ${mode} row for scene ${sceneId}, with browser, platform, viewport, locale, direction, expected state, result, and evidence.`,
            file,
          ),
        );
      }
    }
    if (!qaCoverage.some((row) => row.sceneId === sceneId && row.viewport && isMobileViewport(row.viewport))) {
      issues.push(
        issue(
          "error",
          "scrollytelling.contract.qa.scene_mobile.missing",
          `QA needs a mobile viewport row for scene ${sceneId}. Static declarations do not prove the mobile composition.`,
          file,
        ),
      );
    }
  }
  for (const locale of locales ?? []) {
    if (!qaLocales.has(locale)) {
      issues.push(issue("error", "scrollytelling.contract.qa.locale_coverage.missing", `QA has no evidence row for locale ${locale}.`, file));
    }
    for (const [sceneId, stateIds] of sceneStateIds) {
      for (const stateId of stateIds) {
        for (const direction of ["forward", "reverse"]) {
          if (
            !qaCoverage.some(
              (row) =>
                row.locale === locale && row.sceneId === sceneId && row.expectedState === stateId && row.mode === "default" && row.direction === direction,
            )
          ) {
            issues.push(
              issue(
                "error",
                "scrollytelling.contract.qa.locale_state_direction.missing",
                `QA needs a default-mode ${direction} row for locale ${locale}, scene ${sceneId}, state ${stateId}.`,
                file,
              ),
            );
          }
        }
      }
      if (!qaCoverage.some((row) => row.locale === locale && row.sceneId === sceneId && row.mode === "default" && row.direction === "jump")) {
        issues.push(
          issue(
            "error",
            "scrollytelling.contract.qa.locale_jump.missing",
            `QA needs a default-mode jump or restored-position row for locale ${locale}, scene ${sceneId}.`,
            file,
          ),
        );
      }
      for (const mode of DEGRADED_QA_MODES) {
        if (!qaCoverage.some((row) => row.locale === locale && row.sceneId === sceneId && row.mode === mode)) {
          issues.push(
            issue(
              "error",
              "scrollytelling.contract.qa.locale_mode.missing",
              `QA needs a ${mode} row for locale ${locale}, scene ${sceneId}. Tier 1 locale coverage cannot borrow a degraded-mode result from another locale.`,
              file,
            ),
          );
        }
      }
    }
  }
  if (!qaViewports.some((viewport) => isMobileViewport(viewport))) {
    issues.push(
      issue(
        "error",
        "scrollytelling.contract.qa.mobile.missing",
        "QA must record evidence for a mobile viewport. Static declarations do not prove browser behavior.",
        file,
      ),
    );
  }
  const desktopRows = qaCoverage.filter((row) => row.platform && isDesktopPlatform(row.platform) && row.viewport && viewportWidth(row.viewport) > 799);
  for (const family of ["chrome", "safari", "firefox"] as const) {
    const familyRows = desktopRows.filter((row) => browserFamily(row.browser) === family);
    if (familyRows.length === 0) {
      issues.push(issue("error", `scrollytelling.contract.qa.browser.${family}.missing`, `QA must include ${familyName(family)} on a desktop platform.`, file));
      continue;
    }
    const familyHeights = new Set(familyRows.map((row) => viewportHeight(row.viewport)).filter((value): value is number => value !== undefined));
    if (familyHeights.size < 2) {
      issues.push(
        issue(
          "error",
          `scrollytelling.contract.qa.browser.${family}.heights_insufficient`,
          `QA must include short and tall parsed desktop viewport heights for ${familyName(family)}, not borrow height coverage from another browser.`,
          file,
        ),
      );
    }
  }
  if (!qaCoverage.some((row) => row.viewport && isMobileViewport(row.viewport) && isIosPlatform(row.platform) && browserFamily(row.browser) === "safari")) {
    issues.push(issue("error", "scrollytelling.contract.qa.ios_safari.missing", "QA must include iOS Safari evidence.", file));
  }
  if (!qaCoverage.some((row) => row.viewport && isMobileViewport(row.viewport) && isAndroidPlatform(row.platform) && browserFamily(row.browser) === "chrome")) {
    issues.push(issue("error", "scrollytelling.contract.qa.android_chrome.missing", "QA must include Android Chrome evidence.", file));
  }
  for (const pair of [
    {
      code: "ios_safari",
      label: "iOS Safari",
      matches: (row: (typeof qaCoverage)[number]): boolean => isIosPlatform(row.platform) && browserFamily(row.browser) === "safari",
    },
    {
      code: "android_chrome",
      label: "Android Chrome",
      matches: (row: (typeof qaCoverage)[number]): boolean => isAndroidPlatform(row.platform) && browserFamily(row.browser) === "chrome",
    },
  ] as const) {
    const pairRows = qaCoverage.filter((row) => row.viewport && isMobileViewport(row.viewport) && pair.matches(row));
    const normalHeights = pairRows
      .filter((row) => row.mode !== "short_mobile")
      .map((row) => viewportHeight(row.viewport))
      .filter((value): value is number => value !== undefined);
    const shortHeights = pairRows
      .filter((row) => row.mode === "short_mobile")
      .map((row) => viewportHeight(row.viewport))
      .filter((value): value is number => value !== undefined);
    if (
      normalHeights.length === 0 ||
      shortHeights.length === 0 ||
      !shortHeights.some((shortHeight) => normalHeights.some((normalHeight) => shortHeight < normalHeight))
    ) {
      issues.push(
        issue(
          "error",
          `scrollytelling.contract.qa.${pair.code}.heights_insufficient`,
          `QA must include ${pair.label} at a parsed normal or tall mobile height and at a genuinely shorter short_mobile height.`,
          file,
        ),
      );
    }
  }
  const desktopHeights = new Set(desktopRows.map((row) => viewportHeight(row.viewport)).filter((value): value is number => value !== undefined));
  if (desktopHeights.size < 2) {
    issues.push(
      issue(
        "error",
        "scrollytelling.contract.qa.desktop_viewports.insufficient",
        "QA must include at least two distinct parsed desktop viewport heights. Static declarations do not prove layout behavior.",
        file,
      ),
    );
  }
  const normalMobileHeights = qaCoverage
    .filter((row) => row.mode !== "short_mobile" && row.viewport && isMobileViewport(row.viewport))
    .map((row) => viewportHeight(row.viewport))
    .filter((value): value is number => value !== undefined);
  const shortMobileHeights = qaCoverage
    .filter((row) => row.mode === "short_mobile" && row.viewport && isMobileViewport(row.viewport))
    .map((row) => viewportHeight(row.viewport))
    .filter((value): value is number => value !== undefined);
  if (
    normalMobileHeights.length === 0 ||
    shortMobileHeights.length === 0 ||
    !shortMobileHeights.some((shortHeight) => normalMobileHeights.some((normalHeight) => shortHeight < normalHeight))
  ) {
    issues.push(
      issue(
        "error",
        "scrollytelling.contract.qa.mobile_heights.insufficient",
        "QA must include a parsed normal or tall mobile viewport and a distinct short_mobile viewport with a shorter height.",
        file,
      ),
    );
  }
  return issues;
}

function viewportWidth(viewport: string): number {
  const match = viewport.match(/(?:^|\D)(\d{2,4})\s*[x×]\s*(\d{2,4})(?:\D|$)/u);
  return match ? Number(match[1]) : Number.POSITIVE_INFINITY;
}

function viewportHeight(viewport: string | undefined): number | undefined {
  const match = viewport?.match(/(?:^|\D)(\d{2,4})\s*[x×]\s*(\d{2,4})(?:\D|$)/u);
  return match ? Number(match[2]) : undefined;
}

function isMobileViewport(viewport: string): boolean {
  return /mobile/iu.test(viewport) || viewportWidth(viewport) <= 799;
}

function browserFamily(browser: string | undefined): "chrome" | "safari" | "firefox" | undefined {
  if (!browser) return undefined;
  if (/firefox/iu.test(browser)) return "firefox";
  if (/chrome/iu.test(browser)) return "chrome";
  if (/safari/iu.test(browser)) return "safari";
  return undefined;
}

function familyName(family: "chrome" | "safari" | "firefox"): string {
  return family[0]!.toUpperCase() + family.slice(1);
}

function isIosPlatform(platform: string | undefined): boolean {
  return Boolean(platform && /(?:\bios\b|iphone|ipad)/iu.test(platform));
}

function isAndroidPlatform(platform: string | undefined): boolean {
  return Boolean(platform && /android/iu.test(platform));
}

function isDesktopPlatform(platform: string): boolean {
  return /(?:desktop|mac\s?os|windows|linux|chrome\s?os)/iu.test(platform) && !isIosPlatform(platform) && !isAndroidPlatform(platform);
}

function readJson(filePath: string, issues: Issue[], issueCode: string, displayPath: string): unknown {
  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch (error) {
    issues.push(issue("error", issueCode, `${displayPath} is invalid JSON: ${String(error)}`, displayPath));
    return undefined;
  }
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//gu, "").replace(/^\s*\/\/.*$/gmu, "");
}

function checkSource(source: string, file: string, scope: "runtime" | "business", crossCuttingSource = source): Issue[] {
  const issues: Issue[] = [];
  const code = stripComments(source);
  const crossCuttingCode = stripComments(crossCuttingSource);
  const prefix = `scrollytelling.${scope}`;
  const equalBucket =
    /Math\.floor\s*\([^)]{0,160}?(?:progress|value|scrollYProgress)[^)]{0,100}?\*\s*(?:count|\w+\.length)/u.test(code) ||
    /Math\.floor\s*\([^)]{0,160}?(?:count|\w+\.length)[^)]{0,100}?\*\s*(?:progress|value|scrollYProgress)/u.test(code);
  if (equalBucket) {
    issues.push(
      issue(
        "error",
        `${prefix}.equal_bucket_quantization`,
        "The source derives active narrative state from Math.floor(progress * count). Equal scene buckets drift from real step geometry; derive activation from measured anchor centers.",
        file,
      ),
    );
  }
  if (!code.includes("--scene-p") || !code.includes("--beat-t") || !code.includes("--beat-index")) {
    issues.push(
      issue(
        "error",
        `${prefix}.css_progress_contract_missing`,
        "Scrollytelling source must publish the stable --scene-p, --beat-t, and --beat-index CSS progress hooks from one scroll calculation.",
        file,
      ),
    );
  }
  const sceneHook = /data-scene-id/u.test(code) || (/data-scene-track/u.test(code) && /\bid=\{?id\}?/u.test(code));
  const stateHook = /data-state-id/u.test(code) || (/data-scene-state/u.test(code) && /data-scene-step-state/u.test(code));
  const anchorHook = /data-scrolly-(?:step|anchor)/u.test(code) || /data-scene-step/u.test(code);
  if (!sceneHook || !stateHook || !anchorHook) {
    issues.push(
      issue(
        "error",
        `${prefix}.source_hooks_missing`,
        "Scrollytelling source must expose a stable scene hook, active and per-step state hooks, and a semantic step anchor for deterministic inspection.",
        file,
      ),
    );
  }
  if (!/(?:getBoundingClientRect|offsetTop|IntersectionObserver)/u.test(code)) {
    issues.push(
      issue(
        "error",
        `${prefix}.anchor_geometry_missing`,
        "Scrollytelling source does not derive activation from real anchor geometry. Static equal segments cannot prove copy and visual synchronization.",
        file,
      ),
    );
  }
  if (/<video\b[^>]*\bautoplay\b/iu.test(code) || /<video\b[^>]*\bautoPlay(?:\s|=|\/|>)/u.test(code)) {
    issues.push(
      issue(
        "error",
        `${prefix}.autoplay_narrative_media`,
        "Narrative media must not autoplay. Scroll state owns the story; video can be an explicit asset with a poster fallback.",
        file,
      ),
    );
  }
  const saveDataFreeze =
    /if\s*\([^)]*(?:saveData|save_data)[^)]*\)\s*(?:return(?:\s+(?:null|0|false))?\s*;|\{[\s\S]{0,160}?(?:return(?:\s+(?:null|0|false))?\s*;|setProperty\([^)]*--scene-p[^)]*0))/iu.test(
      code,
    ) ||
    /if\s*\([^)]*(?:saveData|save_data)[^)]*\)\s*\{[^}]{0,160}?(?:applyFinalState|sceneProgress\s*=\s*[01])/iu.test(code) ||
    /(?:saveData|save_data)\s*\?\s*(?:0|null|false)\s*:/iu.test(code);
  if (saveDataFreeze) {
    issues.push(
      issue(
        "error",
        `${prefix}.save_data_code_native_freeze`,
        "Save-Data freezes the narrative or its code-native progress. Suppress only elements marked data-scene-heavy-media and keep HTML, SVG, and canvas scenes scroll-linked.",
        file,
      ),
    );
  }
  for (const match of crossCuttingCode.matchAll(/([^{}]*\[data-scene-save-data[^{}]*)\{([^{}]*)\}/giu)) {
    const selector = match[1] ?? "";
    const declarations = match[2] ?? "";
    if (/(?:display\s*:\s*none|visibility\s*:\s*hidden)/iu.test(declarations) && !/data-scene-heavy-media/u.test(selector)) {
      issues.push(
        issue(
          "error",
          `${prefix}.save_data_suppression_too_broad`,
          "A Save-Data selector hides more than [data-scene-heavy-media]. Keep code-native HTML, SVG, and canvas evidence available.",
          file,
        ),
      );
    }
  }
  if (!/<section\b/u.test(code) || !/<ol\b/u.test(code) || !/<li\b/u.test(code)) {
    issues.push(
      issue(
        "error",
        `${prefix}.semantic_fallback_missing`,
        "The runtime must ship the complete narrative as semantic section, ordered-list, and list-item markup before JavaScript runs.",
        file,
      ),
    );
  }
  if (!/useReducedMotion|prefers-reduced-motion/u.test(crossCuttingCode)) {
    issues.push(issue("error", `${prefix}.reduced_motion_hook_missing`, "The runtime needs a reduced-motion hook that exposes a complete final state.", file));
  }
  return issues;
}

function topLevelLocales(contract: Record<string, unknown>): string[] {
  if (!Array.isArray(contract.locales)) return [];
  const locales: string[] = [];
  for (const row of contract.locales) {
    if (typeof row === "string" && row.trim()) locales.push(row.trim());
    if (isRecord(row) && asString(row.locale)?.trim()) locales.push(asString(row.locale)!.trim());
  }
  return locales;
}

function landingLaneActive(root: string): boolean {
  const statePath = path.join(root, "state/business-state.json");
  if (!existsSync(statePath)) return false;
  try {
    const state = JSON.parse(readFileSync(statePath, "utf8"));
    for (const lane of ["landing", "funnel", "growth"]) {
      const status = asString(getPath(state, `lanes.${lane}.status`))?.toLowerCase();
      if (status && !["pending", "not_needed", "deferred"].includes(status)) return true;
    }
  } catch {
    // The state validator owns malformed JSON. Site-shape signals still scope this gate.
  }
  return false;
}

function siteShaped(root: string): boolean {
  return [
    "growth/landing/index.html",
    "growth/landing/package.json",
    "growth/landing/app",
    "growth/landing/pages",
    "growth/funnel/index.html",
    "web/package.json",
  ].some((relativePath) => existsSync(path.join(root, relativePath)));
}

function collectBusinessSource(root: string): Array<{ file: string; source: string }> {
  const rows: Array<{ file: string; source: string }> = [];
  for (const scanRoot of SCAN_ROOTS) {
    const absolute = path.join(root, scanRoot);
    for (const filePath of collectFiles(absolute, WEB_SOURCE_EXTENSIONS)) {
      rows.push({ file: path.relative(root, filePath), source: readFileSync(filePath, "utf8") });
    }
  }
  return rows;
}

const issues: Issue[] = [];

const runtimeAbsolute = path.join(skillRoot, RUNTIME_PATH);
if (!existsSync(runtimeAbsolute)) {
  issues.push(issue("error", "scrollytelling.runtime.template_missing", `The shipped runtime is missing under --skill-root: ${RUNTIME_PATH}.`, RUNTIME_PATH));
} else {
  const runtimeParts = [RUNTIME_PATH, ...RUNTIME_SUPPORT_PATHS];
  const missingSupport = runtimeParts.filter((relativePath) => !existsSync(path.join(skillRoot, relativePath)));
  for (const relativePath of missingSupport) {
    issues.push(
      issue(
        "error",
        "scrollytelling.runtime.support_missing",
        `The shipped scrollytelling runtime is missing required support source: ${relativePath}.`,
        relativePath,
      ),
    );
  }
  const runtimeSource = runtimeParts
    .filter((relativePath) => existsSync(path.join(skillRoot, relativePath)))
    .map((relativePath) => readFileSync(path.join(skillRoot, relativePath), "utf8"))
    .join("\n");
  issues.push(...checkSource(runtimeSource, RUNTIME_PATH, "runtime"));
}

const exampleAbsolute = path.join(skillRoot, EXAMPLE_PATH);
if (!existsSync(exampleAbsolute)) {
  issues.push(
    issue(
      "error",
      "scrollytelling.runtime.contract_example_missing",
      `The shipped surface-contract example is missing under --skill-root: ${EXAMPLE_PATH}.`,
      EXAMPLE_PATH,
    ),
  );
} else {
  const example = readJson(exampleAbsolute, issues, "scrollytelling.runtime.contract_example_invalid", EXAMPLE_PATH);
  if (isRecord(example)) {
    issues.push(
      ...validateScrollytellingContract(example.scrollytelling, {
        file: EXAMPLE_PATH,
        topLevelLocales: topLevelLocales(example),
        requirePassingQa: false,
      }),
    );
  }
}

const businessSource = collectBusinessSource(workspaceRoot);
const scrollySource = businessSource.filter(
  ({ file, source }) => /scrolly/i.test(path.basename(file)) || /\bScrollytelling\b|data-scrolly-|data-scene-(?:id|track|step)|--scene-p/u.test(source),
);
const contractAbsolute = path.join(workspaceRoot, CONTRACT_PATH);
const activeLanding = landingLaneActive(workspaceRoot) || siteShaped(workspaceRoot) || existsSync(contractAbsolute);

if (activeLanding) {
  if (!existsSync(contractAbsolute)) {
    if (scrollySource.length > 0) {
      issues.push(
        issue(
          "error",
          "scrollytelling.business.surface_contract_missing",
          "The active landing contains scrollytelling hooks or a component, but growth/landing/surface-contract.json has no scrollytelling declaration.",
          CONTRACT_PATH,
        ),
      );
    }
  } else {
    const contract = readJson(contractAbsolute, issues, "scrollytelling.business.surface_contract_invalid", CONTRACT_PATH);
    if (isRecord(contract)) {
      const scrolly = contract.scrollytelling;
      const applicable = isRecord(scrolly) ? asBoolean(scrolly.applicable) : undefined;
      if (!isRecord(scrolly)) {
        issues.push(
          issue(
            "error",
            "scrollytelling.business.declaration_missing",
            "Every active landing surface contract must include a scrollytelling object with applicable true or false and a non-empty evidence rationale.",
            CONTRACT_PATH,
          ),
        );
      } else if (applicable === undefined) {
        issues.push(issue("error", "scrollytelling.contract.applicable.invalid", "scrollytelling.applicable must be true or false.", CONTRACT_PATH));
      }
      if (isRecord(scrolly) && applicable === false && scrollySource.length === 0) {
        issues.push(
          ...validateScrollytellingContract(scrolly, {
            file: CONTRACT_PATH,
            topLevelLocales: topLevelLocales(contract),
            requirePassingQa: true,
            workspaceRoot,
          }),
        );
      }
      if (applicable === true || scrollySource.length > 0) {
        if (applicable === false && scrollySource.length > 0) {
          issues.push(
            issue(
              "error",
              "scrollytelling.business.applicability_mismatch",
              "surface-contract.json marks scrollytelling not applicable, but landing source contains scrollytelling hooks or components.",
              CONTRACT_PATH,
            ),
          );
        }
        issues.push(
          ...validateScrollytellingContract(scrolly, {
            file: CONTRACT_PATH,
            topLevelLocales: topLevelLocales(contract),
            requirePassingQa: true,
            workspaceRoot,
          }),
        );
        const combinedSource = scrollySource.map((row) => row.source).join("\n");
        const allBusinessSource = businessSource.map((row) => row.source).join("\n");
        issues.push(...checkSource(combinedSource, scrollySource.map((row) => row.file).join(", "), "business", allBusinessSource));
      }
    }
  }
}

reportAndExit("Editorial scrollytelling contract (static declarations and hooks; browser behavior requires recorded QA)", issues);
