import { createHash } from "node:crypto";
import { readFileSync, realpathSync, statSync } from "node:fs";
import path from "node:path";
import { loadDesignSystem } from "./design-md.js";
import { asArray, asString, isRecord, issue, type Issue } from "./launch-state.js";

export const CONTENT_ASSETS_VERSION = "2";
const PRODUCTION_KINDS = ["generated", "composed", "captured", "licensed"];
const ASSET_KINDS = ["still", "video", "ugc", "product_ad", "b_roll", "demo", "app_preview", "interactive_3d"];
const REFERENCE_ROLES = ["identity", "scene", "product", "composition", "motion"];
const IDENTITY_INFLUENCES = ["typography", "logo", "voice", "color"];
const INFLUENCES = [...IDENTITY_INFLUENCES, "composition", "lighting", "camera", "material", "motion", "product"];
const VIDEO_KINDS = ["video", "ugc", "product_ad", "b_roll", "demo", "app_preview"];
const text = (value: unknown): string => asString(value)?.trim() ?? "";
const strings = (value: unknown): string[] => asArray(value).map(text).filter(Boolean);

/** Declared local dependencies only. Consumers still have to enforce workspace containment. */
export function contentAssetDependencyPaths(manifest: unknown): string[] {
  if (!isRecord(manifest) || manifest.schema_version !== CONTENT_ASSETS_VERSION) return [];
  const paths: string[] = [];
  for (const candidate of asArray(manifest.assets)) {
    if (!isRecord(candidate)) continue;
    paths.push(...strings(candidate.inputs));
    const brief = isRecord(candidate.brief) ? candidate.brief : {};
    const kit = isRecord(brief.kit) ? brief.kit : {};
    paths.push(text(kit.path));
    for (const item of [...asArray(kit.assets), ...asArray(brief.lineage), ...asArray(brief.references)]) {
      if (isRecord(item)) paths.push(text(item.path));
    }
    for (const item of asArray(brief.claims)) if (isRecord(item)) paths.push(text(item.source));
  }
  return [...new Set(paths.filter((value) => value && !/^[a-z][a-z0-9+.-]*:/i.test(value) && !value.startsWith("#")))].sort();
}

/** Checks declarations and current local bytes; never asserts provider execution or visual quality. */
export function validateContentAssetsV2(root: string, manifest: unknown, manifestPath = "growth/content-assets/manifest.json"): Issue[] {
  if (!isRecord(manifest) || manifest.schema_version !== CONTENT_ASSETS_VERSION) return [];
  const issues: Issue[] = [];
  const fail = (field: string, message: string) => issues.push(issue("error", `content_assets.v2.${field}`, message, manifestPath));
  const requiredText = (value: unknown, field: string) => {
    if (!text(value)) fail(field, `${field} must be a non-empty string.`);
  };
  const stringArray = (value: unknown, field: string, allowEmpty = false): string[] => {
    if (!Array.isArray(value) || value.some((entry) => !text(entry)) || (!allowEmpty && !value.length)) {
      fail(field, `${field} must be ${allowEmpty ? "an explicit" : "a non-empty"} array of non-empty strings.`);
    }
    return strings(value);
  };
  const recordArray = (value: unknown, field: string): Record<string, unknown>[] => {
    if (!Array.isArray(value) || value.some((entry) => !isRecord(entry))) fail(field, `${field} must be an explicit array of objects.`);
    return asArray(value).filter(isRecord);
  };
  const fileBytes = (relative: unknown, digest: unknown, field: string): boolean => {
    const source = text(relative);
    if (!source || path.isAbsolute(source) || /^[a-z][a-z0-9+.-]*:/i.test(source) || source.startsWith("#")) {
      fail(
        `${field}.path`,
        `${field} requires a workspace-relative file, not a remote URL or host path. Retain a permitted local source record for external evidence.`,
      );
      return false;
    }
    const lexicalRoot = path.resolve(root);
    const absolute = path.resolve(root, source);
    if (!absolute.startsWith(`${lexicalRoot}${path.sep}`)) {
      fail(`${field}.outside_workspace`, `${field} resolves outside the workspace.`);
      return false;
    }
    try {
      const realRoot = realpathSync(root);
      const realFile = realpathSync(absolute);
      if (!realFile.startsWith(`${realRoot}${path.sep}`)) {
        fail(`${field}.outside_workspace`, `${field} resolves outside the workspace through a symlink.`);
        return false;
      }
      if (!statSync(realFile).isFile()) {
        fail(`${field}.not_file`, `${field} must point to a regular file.`);
        return false;
      }
      const actual = createHash("sha256").update(readFileSync(realFile)).digest("hex");
      if (!/^[a-f0-9]{64}$/.test(text(digest))) fail(`${field}.digest_missing`, `${field} requires a SHA-256 digest of the current source bytes.`);
      else if (actual !== digest) fail(`${field}.stale`, `${field} changed since the brief was recorded. Reassess the brief and affected output.`);
      return true;
    } catch {
      fail(`${field}.missing`, `${field} must resolve to a readable local file.`);
      return false;
    }
  };
  // Do not ask the design loader to follow an external identity-file symlink.
  try {
    if (!realpathSync(path.join(root, "DESIGN.md")).startsWith(`${realpathSync(root)}${path.sep}`)) {
      fail("kit.outside_workspace", "DESIGN.md must resolve inside this workspace.");
      return issues;
    }
  } catch {
    fail("kit.missing", "Version 2 requires a readable root DESIGN.md.");
    return issues;
  }
  const design = loadDesignSystem(root);
  const foundation = isRecord(design.frontmatter?.foundation) ? design.frontmatter.foundation : {};
  const resources = asArray(foundation.typographyResources).filter(isRecord);
  const resourceIds = new Set(resources.map((resource) => text(resource.id)));
  const assetIds = new Set<string>();
  if (!Array.isArray(manifest.assets)) fail("assets", "Version 2 requires an assets array.");
  for (const [index, candidate] of asArray(manifest.assets).entries()) {
    const key = `assets.${index}`;
    if (!isRecord(candidate)) {
      fail(key, "Each asset must be an object.");
      continue;
    }
    const asset = candidate;
    const assetId = text(asset.asset_id);
    if (!assetId || assetIds.has(assetId)) fail(`${key}.asset_id`, "Each asset needs a unique asset_id.");
    assetIds.add(assetId);
    if (!PRODUCTION_KINDS.includes(text(asset.production_kind)))
      fail(`${key}.production_kind`, `production_kind must be one of ${PRODUCTION_KINDS.join(", ")}, independent of provider.`);
    if (!ASSET_KINDS.includes(text(asset.asset_kind))) fail(`${key}.asset_kind`, `asset_kind must be one of ${ASSET_KINDS.join(", ")}.`);
    const dimensions = isRecord(asset.dimensions) ? asset.dimensions : {};
    for (const axis of ["width", "height"])
      if (!Number.isSafeInteger(dimensions[axis]) || Number(dimensions[axis]) <= 0)
        fail(`${key}.dimensions.${axis}`, `dimensions.${axis} must be a positive integer in output pixels.`);
    if (
      VIDEO_KINDS.includes(text(asset.asset_kind)) &&
      !(typeof asset.duration_seconds === "number" && Number.isFinite(asset.duration_seconds) && asset.duration_seconds > 0)
    )
      fail(`${key}.duration_seconds`, "Video assets require a positive finite duration_seconds.");
    if (!isRecord(asset.brief)) {
      fail(`${key}.brief`, "Version 2 requires a structured asset brief before production.");
      continue;
    }
    const brief = asset.brief;
    requiredText(brief.purpose, `${key}.brief.purpose`);
    requiredText(brief.placement, `${key}.brief.placement`);
    stringArray(brief.allowed_variation, `${key}.brief.allowed_variation`, true);
    stringArray(brief.forbidden_changes, `${key}.brief.forbidden_changes`);
    const kit = isRecord(brief.kit) ? brief.kit : {};
    if (kit.path !== "DESIGN.md") fail(`${key}.brief.kit.path`, "The identity authority is root DESIGN.md.");
    fileBytes(kit.path, kit.sha256, `${key}.brief.kit`);
    requiredText(kit.revision, `${key}.brief.kit.revision`);
    if (kit.revision !== design.frontmatter?.version)
      fail(`${key}.brief.kit.revision`, "Kit revision must match current DESIGN.md frontmatter version; the digest separately binds its bytes.");
    for (const [i, item] of recordArray(kit.assets, `${key}.brief.kit.assets`).entries()) fileBytes(item.path, item.sha256, `${key}.brief.kit.assets.${i}`);
    const lineage = recordArray(brief.lineage, `${key}.brief.lineage`);
    for (const [i, item] of lineage.entries()) {
      fileBytes(item.path, item.sha256, `${key}.brief.lineage.${i}`);
      requiredText(item.rights, `${key}.brief.lineage.${i}.rights`);
    }
    for (const input of stringArray(asset.inputs, `${key}.inputs`)) {
      if (!lineage.some((item) => item.path === input))
        fail(`${key}.brief.lineage.unrecorded`, "Every production input must have a local byte-bound lineage and rights entry.");
    }
    for (const [i, reference] of recordArray(brief.references, `${key}.brief.references`).entries()) {
      const prefix = `${key}.brief.references.${i}`;
      fileBytes(reference.path, reference.sha256, prefix);
      requiredText(reference.rights, `${prefix}.rights`);
      const roles = stringArray(reference.roles, `${prefix}.roles`);
      if (roles.some((role) => !REFERENCE_ROLES.includes(role)))
        fail(`${prefix}.roles`, "Reference roles must be identity, scene, product, composition or motion.");
      const influences = stringArray(reference.permitted_influence, `${prefix}.permitted_influence`);
      if (influences.some((influence) => !INFLUENCES.includes(influence)))
        fail(`${prefix}.permitted_influence`, `Permitted influences are ${INFLUENCES.join(", ")}; claims require their own sources.`);
      if (!roles.includes("identity") && influences.some((influence) => IDENTITY_INFLUENCES.includes(influence)))
        fail(`${prefix}.identity_override`, "A scene, product, composition or motion reference cannot override identity typography, logo, voice or color.");
      stringArray(reference.forbidden_transfers, `${prefix}.forbidden_transfers`);
    }
    for (const [i, claim] of recordArray(brief.claims, `${key}.brief.claims`).entries()) {
      requiredText(claim.text, `${key}.brief.claims.${i}.text`);
      fileBytes(claim.source, claim.sha256, `${key}.brief.claims.${i}`);
    }
    if (typeof brief.contains_text !== "boolean") fail(`${key}.brief.contains_text`, "Declare whether the output contains text.");
    const fonts = stringArray(brief.fonts, `${key}.brief.fonts`, brief.contains_text === false);
    for (const font of fonts) {
      if (!resourceIds.has(font)) fail(`${key}.brief.fonts.unowned`, `Font resource ${font} is not owned by DESIGN.md foundation.typographyResources.`);
      const resource = resources.find((entry) => entry.id === font);
      if (resource?.mode === "local") fileBytes(resource.path, resource.sha256, `${key}.brief.fonts.${font}`);
    }
    const technique = isRecord(asset.technique) ? asset.technique : {};
    const techniqueKind = text(technique.kind);
    if (!["native", "semantic_web", "layered_2_5d", "real_3d", "media"].includes(techniqueKind))
      fail(`${key}.technique.kind`, "Select native, semantic_web, layered_2_5d, real_3d or media technique by the user job.");
    requiredText(technique.reason, `${key}.technique.reason`);
    const renderer = isRecord(technique.renderer) ? technique.renderer : {};
    requiredText(renderer.id, `${key}.technique.renderer.id`);
    const supported = stringArray(renderer.capabilities, `${key}.technique.renderer.capabilities`);
    const required = stringArray(technique.required_capabilities, `${key}.technique.required_capabilities`);
    for (const capability of required)
      if (!supported.includes(capability))
        fail(
          `${key}.technique.unsupported_renderer`,
          `Selected renderer does not declare required capability ${capability}. This checks compatibility declarations, not observed execution.`,
        );
    if (techniqueKind === "real_3d") {
      for (const capability of ["depth", "camera", "picking"])
        if (!required.includes(capability))
          fail(`${key}.technique.real_3d`, `Real 3D must require ${capability}; prerecorded media is not an interactive substitute.`);
      if (asset.asset_kind !== "interactive_3d") fail(`${key}.technique.kind_mismatch`, "Real 3D technique requires interactive_3d asset kind.");
    } else if (asset.asset_kind === "interactive_3d") fail(`${key}.technique.kind_mismatch`, "interactive_3d requires the real_3d technique.");
    const fallback = isRecord(technique.fallback) ? technique.fallback : {};
    for (const field of ["mode", "preserved_job", "limitations"]) requiredText(fallback[field], `${key}.technique.fallback.${field}`);
    stringArray(technique.proof_requirements, `${key}.technique.proof_requirements`);
    if (techniqueKind === "layered_2_5d" || asset.compositing !== undefined) {
      const compositing = isRecord(asset.compositing) ? asset.compositing : {};
      for (const field of ["alignment", "camera", "lighting", "mobile_variant"]) requiredText(compositing[field], `${key}.compositing.${field}`);
      const requiredLayers = stringArray(compositing.required_layers, `${key}.compositing.required_layers`);
      const layers = recordArray(compositing.layers, `${key}.compositing.layers`);
      const ids = new Set<string>();
      for (const [i, layer] of layers.entries()) {
        const prefix = `${key}.compositing.layers.${i}`;
        const id = text(layer.id);
        if (!id || ids.has(id)) fail(`${prefix}.id`, "Layer IDs must be unique and non-empty.");
        ids.add(id);
        if (!lineage.some((item) => item.path === layer.input)) fail(`${prefix}.input`, "Layer input must resolve to a byte-bound lineage entry.");
        for (const pair of ["origin", "anchor"]) {
          const value = layer[pair];
          if (
            !Array.isArray(value) ||
            value.length !== 2 ||
            value.some((coordinate) => typeof coordinate !== "number" || !Number.isFinite(coordinate) || coordinate < 0 || coordinate > 1)
          )
            fail(`${prefix}.${pair}`, `${pair} requires normalized [x,y] coordinates from zero to one.`);
        }
        if (typeof layer.depth !== "number" || !Number.isFinite(layer.depth)) fail(`${prefix}.depth`, "Layer depth must be finite.");
        if (typeof layer.alpha !== "boolean") fail(`${prefix}.alpha`, "Declare whether the layer requires transparency.");
      }
      for (const id of requiredLayers) if (!ids.has(id)) fail(`${key}.compositing.required_layer_missing`, `Required compositing layer ${id} is missing.`);
    }
  }
  return issues;
}
