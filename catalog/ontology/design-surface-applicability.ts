/**
 * Design-surface technique applicability projection (ONB-08 / scrollytelling / CRO).
 *
 * Authoritative inputs (no new policy store, no inference from purpose prose):
 *
 * | Decision                         | Owner                                                                 | selected                                              | not required                                      | unresolved / unavailable                         |
 * | -------------------------------- | --------------------------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------ |
 * | Surface technique class          | studio/seed/business.json `interaction` on each listed surface        | enum value present                                    | empty inventory (no listed surfaces)              | listed surface omits `interaction`               |
 * | Implemented scroll-linked UI     | landing/funnel/web source hooks                                       | scrollytelling component or scene hooks exist         | no such source                                    | —                                                |
 * | Landing scrollytelling contract  | growth/landing/surface-contract.json `scrollytelling.applicable`      | `true`                                                | `false` or file absent                            | file present but `applicable` missing/invalid    |
 * | 60fps.design MCP access          | strategy/TOOL_DECISIONS.md Workflow intake table, tool cell `60fps`   | access ready/active/connected and route not fallback  | motion technique not selected                     | row absent or not checked; blocked → unavailable |
 *
 * Packet prose such as "not applicable" is not authority. Implemented scroll-linked
 * behavior cannot evade testing because it was omitted from the studio checklist.
 */
import { existsSync, readdirSync, readFileSync, type Dirent } from "node:fs";
import path from "node:path";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function asBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

export const STUDIO_SEED_PATH = "studio/seed/business.json";
export const SURFACE_CONTRACT_PATH = "growth/landing/surface-contract.json";
export const TOOL_DECISIONS_PATH = "strategy/TOOL_DECISIONS.md";
export const SIXTY_FPS_TOOL_PATTERN = /60fps/i;
export const SCROLLY_SOURCE_PATTERN = /\bScrollytelling\b|data-scrolly-|data-scene-(?:id|track|step)|--scene-p/u;
export const WEB_SOURCE_EXTENSIONS = new Set([".css", ".html", ".js", ".jsx", ".mjs", ".mts", ".ts", ".tsx"]);
export const SCROLLY_SCAN_ROOTS = ["growth/landing", "growth/funnel", "web"] as const;

export const INTERACTION_KINDS = ["static-document", "conversion", "scroll-linked", "standard-transition", "bespoke-motion"] as const;
export type InteractionKind = (typeof INTERACTION_KINDS)[number];

export type SurfaceFamily = "landing" | "web-funnel" | "native" | "marketing";
export type TechniqueApplicability = "selected" | "not_required" | "unresolved";
export type MotionReferenceApplicability = TechniqueApplicability | "unavailable";
export type SixtyFpsToolStatus = "selected" | "unavailable" | "unresolved";
export type InventoryState = "present" | "empty" | "missing";

export interface SurfaceApplicability {
  id: string;
  family: SurfaceFamily;
  interaction: InteractionKind | "unresolved";
  scrollytelling: TechniqueApplicability;
  conversionExperiments: TechniqueApplicability;
  motionReference: TechniqueApplicability;
}

export interface DesignSurfaceApplicability {
  inventory: InventoryState;
  surfaces: SurfaceApplicability[];
  /** True when a listed studio surface omits a parseable `interaction` enum. */
  interactionUnresolved: boolean;
  implementedScrollytelling: boolean;
  scrollytelling: TechniqueApplicability;
  conversionExperiments: TechniqueApplicability;
  sixtyFpsRegister: MotionReferenceApplicability;
}

const INTERACTION_SET = new Set<string>(INTERACTION_KINDS);
const SCROLL_LINKED_KINDS = new Set<InteractionKind>(["scroll-linked"]);
const MOTION_REFERENCE_KINDS = new Set<InteractionKind>(["scroll-linked", "bespoke-motion"]);
const CONVERSION_KINDS = new Set<InteractionKind>(["conversion"]);

export function isInteractionKind(value: string): value is InteractionKind {
  return INTERACTION_SET.has(value);
}

function interactionOf(record: Record<string, unknown>): InteractionKind | "unresolved" {
  const value = asString(record.interaction)?.trim();
  if (!value) return "unresolved";
  return isInteractionKind(value) ? value : "unresolved";
}

function surfaceId(record: Record<string, unknown>, fallback: string): string {
  return asString(record.id)?.trim() || fallback;
}

function readStudioSurfaces(raw: unknown): {
  inventory: InventoryState;
  surfaces: Array<{ id: string; family: SurfaceFamily; interaction: InteractionKind | "unresolved" }>;
} {
  if (!isRecord(raw) || !isRecord(raw.surfaces)) return { inventory: "missing", surfaces: [] };
  const surfaces = raw.surfaces;
  const rows: Array<{ id: string; family: SurfaceFamily; interaction: InteractionKind | "unresolved" }> = [];
  const collect = (value: unknown, family: SurfaceFamily, prefix: string): void => {
    if (!Array.isArray(value)) return;
    value.forEach((item, index) => {
      if (!isRecord(item)) {
        rows.push({ id: `${prefix}-${index}`, family, interaction: "unresolved" });
        return;
      }
      rows.push({ id: surfaceId(item, `${prefix}-${index}`), family, interaction: interactionOf(item) });
    });
  };
  collect(surfaces.landingPages, "landing", "landing");
  collect(surfaces.webFunnels, "web-funnel", "funnel");
  collect(surfaces.marketingAssets, "marketing", "marketing");
  if (isRecord(surfaces.mobileApp)) collect(surfaces.mobileApp.screens, "native", "native");
  return { inventory: rows.length === 0 ? "empty" : "present", surfaces: rows };
}

function techniqueForInteraction(interaction: InteractionKind | "unresolved", selectedKinds: ReadonlySet<InteractionKind>): TechniqueApplicability {
  if (interaction === "unresolved") return "unresolved";
  return selectedKinds.has(interaction) ? "selected" : "not_required";
}

function projectSurface(row: { id: string; family: SurfaceFamily; interaction: InteractionKind | "unresolved" }): SurfaceApplicability {
  return {
    id: row.id,
    family: row.family,
    interaction: row.interaction,
    scrollytelling: techniqueForInteraction(row.interaction, SCROLL_LINKED_KINDS),
    conversionExperiments: techniqueForInteraction(row.interaction, CONVERSION_KINDS),
    motionReference: techniqueForInteraction(row.interaction, MOTION_REFERENCE_KINDS),
  };
}

function rollupTechnique(values: readonly TechniqueApplicability[], emptyResult: TechniqueApplicability): TechniqueApplicability {
  if (values.length === 0) return emptyResult;
  if (values.some((value) => value === "selected")) return "selected";
  if (values.every((value) => value === "unresolved")) return "unresolved";
  return "not_required";
}

function landingLaneActive(workspaceRoot: string): boolean {
  const statePath = path.join(workspaceRoot, "state/business-state.json");
  if (!existsSync(statePath)) return false;
  try {
    const state: unknown = JSON.parse(readFileSync(statePath, "utf8"));
    if (!isRecord(state) || !isRecord(state.lanes)) return false;
    for (const lane of ["landing", "funnel", "growth"] as const) {
      const laneState = state.lanes[lane];
      if (!isRecord(laneState)) continue;
      const status = asString(laneState.status)?.toLowerCase();
      if (status && !["pending", "not_needed", "deferred"].includes(status)) return true;
    }
  } catch {
    return false;
  }
  return false;
}

function siteShaped(workspaceRoot: string): boolean {
  return [
    "growth/landing/index.html",
    "growth/landing/package.json",
    "growth/landing/app",
    "growth/landing/pages",
    "growth/funnel/index.html",
    "web/package.json",
  ].some((relativePath) => existsSync(path.join(workspaceRoot, relativePath)));
}

export function landingSurfaceActive(workspaceRoot: string): boolean {
  return landingLaneActive(workspaceRoot) || siteShaped(workspaceRoot) || existsSync(path.join(workspaceRoot, SURFACE_CONTRACT_PATH));
}

function walkSourceFiles(root: string): string[] {
  if (!existsSync(root)) return [];
  const out: string[] = [];
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;
    let entries: Dirent[];
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.name === "node_modules" || entry.name === ".git") continue;
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
        continue;
      }
      if (WEB_SOURCE_EXTENSIONS.has(path.extname(entry.name))) out.push(full);
    }
  }
  return out;
}

export function workspaceImplementsScrollytelling(workspaceRoot: string): boolean {
  if (!landingSurfaceActive(workspaceRoot)) return false;
  for (const relative of SCROLLY_SCAN_ROOTS) {
    for (const filePath of walkSourceFiles(path.join(workspaceRoot, relative))) {
      const basename = path.basename(filePath);
      if (/scrolly/i.test(basename)) return true;
      let source: string;
      try {
        source = readFileSync(filePath, "utf8");
      } catch {
        continue;
      }
      if (SCROLLY_SOURCE_PATTERN.test(source)) return true;
    }
  }
  return false;
}

export function parseScrollytellingContractApplicable(workspaceRoot: string): boolean | "unresolved" | undefined {
  const filePath = path.join(workspaceRoot, SURFACE_CONTRACT_PATH);
  if (!existsSync(filePath)) return undefined;
  try {
    const parsed: unknown = JSON.parse(readFileSync(filePath, "utf8"));
    if (!isRecord(parsed)) return "unresolved";
    if (!isRecord(parsed.scrollytelling)) return "unresolved";
    const applicable = asBoolean(parsed.scrollytelling.applicable);
    if (applicable === undefined) return "unresolved";
    return applicable;
  } catch {
    return "unresolved";
  }
}

function classifySixtyFpsCells(access: string, route: string): SixtyFpsToolStatus {
  const accessNorm = access.toLowerCase();
  const routeNorm = route.toLowerCase();
  if (/\b(blocked|unavailable|not connected|absent)\b/.test(accessNorm) || /\b(blocked|unavailable)\b/.test(routeNorm)) {
    return "unavailable";
  }
  if (/\bfallback\b/.test(routeNorm)) return "unavailable";
  if (/\b(ready|active|connected)\b/.test(accessNorm)) return "selected";
  return "unresolved";
}

export function parseSixtyFpsToolDecision(markdown: string | undefined): SixtyFpsToolStatus | undefined {
  if (!markdown) return undefined;
  const intake = markdown.split(/^## Workflow intake\b/m)[1]?.split(/^## /m)[0] ?? markdown;
  for (const line of intake.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("|") || /^\|[\s:-|]+\|$/.test(trimmed) || /\|\s*tool\s*\|/i.test(trimmed)) continue;
    const cells = trimmed
      .slice(1, trimmed.endsWith("|") ? -1 : undefined)
      .split("|")
      .map((cell) => cell.trim());
    const tool = cells[0] ?? "";
    if (!SIXTY_FPS_TOOL_PATTERN.test(tool)) continue;
    return classifySixtyFpsCells(cells[2] ?? "", cells[4] ?? "");
  }
  return undefined;
}

function loadToolDecisionsMarkdown(workspaceRoot: string): string | undefined {
  const filePath = path.join(workspaceRoot, TOOL_DECISIONS_PATH);
  if (!existsSync(filePath)) return undefined;
  try {
    return readFileSync(filePath, "utf8");
  } catch {
    return undefined;
  }
}

function loadStudioDocument(workspaceRoot: string): unknown | undefined {
  const filePath = path.join(workspaceRoot, STUDIO_SEED_PATH);
  if (!existsSync(filePath)) return undefined;
  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch {
    return undefined;
  }
}

function combineMotionReference(technique: TechniqueApplicability, tool: SixtyFpsToolStatus | undefined): MotionReferenceApplicability {
  switch (technique) {
    case "not_required":
      return "not_required";
    case "unresolved":
      return "unresolved";
    case "selected":
      if (tool === undefined) return "unresolved";
      return tool;
    default: {
      const exhaustive: never = technique;
      return exhaustive;
    }
  }
}

export function projectDesignSurfaceApplicability(input: {
  studio: unknown | undefined;
  implementedScrollytelling: boolean;
  contractApplicable: boolean | "unresolved" | undefined;
  sixtyFpsTool: SixtyFpsToolStatus | undefined;
}): DesignSurfaceApplicability {
  const studio = input.studio === undefined ? { inventory: "missing" as const, surfaces: [] } : readStudioSurfaces(input.studio);
  const surfaces = studio.surfaces.map(projectSurface);
  const emptyResult: TechniqueApplicability = studio.inventory === "missing" ? "unresolved" : "not_required";
  const forceScrollLinked = input.implementedScrollytelling || input.contractApplicable === true;
  let scrollytelling = rollupTechnique(
    surfaces.map((surface) => surface.scrollytelling),
    emptyResult,
  );
  if (forceScrollLinked) scrollytelling = "selected";
  if (input.contractApplicable === "unresolved" && scrollytelling !== "selected") scrollytelling = "unresolved";
  const conversionExperiments = rollupTechnique(
    surfaces.map((surface) => surface.conversionExperiments),
    emptyResult,
  );
  let motionTechnique = rollupTechnique(
    surfaces.map((surface) => surface.motionReference),
    emptyResult,
  );
  if (forceScrollLinked) motionTechnique = "selected";
  return {
    inventory: studio.inventory,
    surfaces,
    interactionUnresolved: studio.inventory === "present" && surfaces.some((surface) => surface.interaction === "unresolved"),
    implementedScrollytelling: input.implementedScrollytelling,
    scrollytelling,
    conversionExperiments,
    sixtyFpsRegister: combineMotionReference(motionTechnique, input.sixtyFpsTool),
  };
}

export function loadDesignSurfaceApplicability(workspaceRoot: string): DesignSurfaceApplicability {
  return projectDesignSurfaceApplicability({
    studio: loadStudioDocument(workspaceRoot),
    implementedScrollytelling: workspaceImplementsScrollytelling(workspaceRoot),
    contractApplicable: parseScrollytellingContractApplicable(workspaceRoot),
    sixtyFpsTool: parseSixtyFpsToolDecision(loadToolDecisionsMarkdown(workspaceRoot)),
  });
}
