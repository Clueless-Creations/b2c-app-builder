/**
 * Pure geometry for scroll scenes.
 *
 * Semantic step centers are the timeline. There are no copied percentages or
 * elapsed transition clocks, so the same scroll position always resolves to
 * the same state after a jump, restore, resize, or reverse scroll.
 */

export type SceneDirection = "forward" | "reverse";

export interface SceneFrameInput {
  /** Ordered semantic-step centers in document coordinates. */
  stepCenters: readonly number[];
  /** Scene bounds in the same document-coordinate space as stepCenters. */
  sceneStart: number;
  sceneEnd: number;
  /** Viewport guide position in document coordinates. */
  guidePosition: number;
  direction?: SceneDirection;
}

export interface SceneFrame {
  beatIndex: number;
  sceneProgress: number;
  beatProgress: number;
  direction: SceneDirection;
}

export interface GuideRatioInput {
  desktop?: number;
  mobile?: number;
  shortMobile?: number;
  isMobile?: boolean;
  isShortMobile?: boolean;
}

export interface StateIdValidation {
  valid: boolean;
  errors: string[];
}

export interface SceneStateBinding {
  stateId: string;
  stepIndex: number;
  visualIndex: number;
}

export interface SceneStateBindingResult extends StateIdValidation {
  bindings: SceneStateBinding[];
}

export type CodeNativeSceneSourceKind = "html" | "svg" | "canvas";
export type HeavyMediaSceneSourceKind = "image" | "video";
export type SceneSourceKind = CodeNativeSceneSourceKind | HeavyMediaSceneSourceKind;

export interface CodeNativeSceneVisualPolicy {
  sourceKind: CodeNativeSceneSourceKind;
  saveDataFallback?: "code-native";
  posterAssetId?: never;
}

export interface PosterSceneVisualPolicy {
  sourceKind: HeavyMediaSceneSourceKind;
  saveDataFallback: "poster";
  /** Stable ID for the lightweight poster recorded in the content-asset contract. */
  posterAssetId: string;
}

export interface OmittedSceneVisualPolicy {
  sourceKind: HeavyMediaSceneSourceKind;
  saveDataFallback: "omit";
  posterAssetId?: never;
}

/** Framework-neutral media policy; UI adapters add their own visual/poster node types. */
export type SceneVisualPolicy = CodeNativeSceneVisualPolicy | PosterSceneVisualPolicy | OmittedSceneVisualPolicy;
export type SceneSaveDataRenderMode = "visual" | "poster" | "omit";

export interface SceneVisualPolicyProbe {
  sourceKind: string;
  saveDataFallback?: string;
  posterAssetId?: string;
  hasPoster: boolean;
}

export const DEFAULT_DESKTOP_GUIDE = 0.5;
export const DEFAULT_MOBILE_GUIDE = 0.72;
export const DEFAULT_SHORT_MOBILE_GUIDE = 0.82;

const STATE_ID_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

export function clampUnit(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

export function progressBetween(value: number, start: number, end: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(start) || !Number.isFinite(end)) return 0;
  if (end <= start) return value >= end ? 1 : 0;
  return clampUnit((value - start) / (end - start));
}

export function resolveDirection(previousPosition: number, currentPosition: number, fallback: SceneDirection = "forward"): SceneDirection {
  if (currentPosition > previousPosition) return "forward";
  if (currentPosition < previousPosition) return "reverse";
  return fallback;
}

/**
 * State IDs are authored keys, not titles transformed at runtime. Copy can be
 * localized or revised without changing the state/visual contract.
 */
export function validateStableStateIds(ids: readonly string[]): StateIdValidation {
  const errors: string[] = [];
  const seen = new Set<string>();

  if (ids.length === 0) errors.push("A scroll scene must have at least one state ID.");

  ids.forEach((id, index) => {
    if (!STATE_ID_PATTERN.test(id)) {
      errors.push(`State ID at index ${index} must be a lowercase semantic slug: ${JSON.stringify(id)}.`);
    }
    if (seen.has(id)) errors.push(`State ID must be unique within its scene: ${JSON.stringify(id)}.`);
    seen.add(id);
  });

  return { valid: errors.length === 0, errors };
}

export function assertStableStateIds(ids: readonly string[]): void {
  const result = validateStableStateIds(ids);
  if (!result.valid) throw new Error(result.errors.join(" "));
}

/**
 * Resolve semantic step/visual pairs without relying on DOM order. Invalid or
 * ambiguous IDs return no bindings so callers can preserve the static SSR
 * state and skip enhancement.
 */
export function resolveSceneStateBindings(stepIds: readonly (string | undefined)[], visualIds: readonly (string | undefined)[]): SceneStateBindingResult {
  const errors: string[] = [];
  const definedStepIds: string[] = [];
  const definedVisualIds: string[] = [];

  stepIds.forEach((id, index) => {
    if (!id) errors.push(`Semantic step ${index + 1} is missing data-scene-step-state.`);
    else definedStepIds.push(id);
  });
  visualIds.forEach((id, index) => {
    if (!id) errors.push(`Scene visual ${index + 1} is missing data-scene-visual-state.`);
    else definedVisualIds.push(id);
  });

  if (definedStepIds.length > 0) {
    errors.push(...validateStableStateIds(definedStepIds).errors.map((error) => `Step ${error}`));
  }
  if (definedVisualIds.length > 0) {
    errors.push(...validateStableStateIds(definedVisualIds).errors.map((error) => `Visual ${error}`));
  }

  const stepSet = new Set(definedStepIds);
  const visualIndexById = new Map<string, number>();
  visualIds.forEach((id, visualIndex) => {
    if (id && !visualIndexById.has(id)) visualIndexById.set(id, visualIndex);
  });

  for (const stateId of stepSet) {
    if (!visualIndexById.has(stateId)) errors.push(`State ${JSON.stringify(stateId)} has no matching scene visual.`);
  }
  for (const stateId of new Set(definedVisualIds)) {
    if (!stepSet.has(stateId)) errors.push(`Scene visual state ${JSON.stringify(stateId)} has no matching semantic step.`);
  }

  if (errors.length > 0) return { valid: false, errors, bindings: [] };
  return {
    valid: true,
    errors: [],
    bindings: definedStepIds.map((stateId, stepIndex) => ({
      stateId,
      stepIndex,
      visualIndex: visualIndexById.get(stateId)!,
    })),
  };
}

export function isHeavyMediaSourceKind(sourceKind: string): sourceKind is HeavyMediaSceneSourceKind {
  return sourceKind === "image" || sourceKind === "video";
}

export function validateSceneVisualPolicy(policy: SceneVisualPolicyProbe): StateIdValidation {
  const errors: string[] = [];
  const codeNative = policy.sourceKind === "html" || policy.sourceKind === "svg" || policy.sourceKind === "canvas";
  const heavy = isHeavyMediaSourceKind(policy.sourceKind);

  if (!codeNative && !heavy) errors.push(`Unknown scene source kind: ${JSON.stringify(policy.sourceKind)}.`);
  if (codeNative && policy.saveDataFallback && policy.saveDataFallback !== "code-native") {
    errors.push("Code-native scenes must remain code-native under Save-Data.");
  }
  if (heavy && policy.saveDataFallback === "poster") {
    if (!policy.hasPoster) errors.push("Heavy media with a poster fallback must provide a lightweight poster node.");
    if (!policy.posterAssetId?.trim()) errors.push("Heavy media with a poster fallback must provide posterAssetId proof.");
  } else if (heavy && policy.saveDataFallback !== "omit") {
    errors.push('Heavy media must declare saveDataFallback as "poster" or "omit".');
  }

  return { valid: errors.length === 0, errors };
}

/** Heavy or invalid media policy fails closed to omission when Save-Data was observed by the server. */
export function resolveSceneSaveDataRenderMode(policy: SceneVisualPolicyProbe, serverSaveData: boolean): SceneSaveDataRenderMode {
  if (!serverSaveData) return "visual";
  if (policy.sourceKind === "html" || policy.sourceKind === "svg" || policy.sourceKind === "canvas") return "visual";
  const validation = validateSceneVisualPolicy(policy);
  return validation.valid && policy.saveDataFallback === "poster" ? "poster" : "omit";
}

export function resolveGuideRatio(input: GuideRatioInput = {}): number {
  if (input.isShortMobile) {
    return clampUnit(input.shortMobile ?? Math.max(input.mobile ?? DEFAULT_MOBILE_GUIDE, DEFAULT_SHORT_MOBILE_GUIDE));
  }
  if (input.isMobile) return clampUnit(input.mobile ?? DEFAULT_MOBILE_GUIDE);
  return clampUnit(input.desktop ?? DEFAULT_DESKTOP_GUIDE);
}

/**
 * Honor either source of a data-saving preference. A server-observed Client
 * Hint protects the pre-hydration render; the browser connection preference
 * can only strengthen that decision after hydration, never turn it off.
 */
export function resolveSaveDataPreference(serverObserved: boolean | undefined, browserObserved: boolean): boolean {
  return serverObserved === true || browserObserved;
}

/**
 * Select the last semantic anchor whose center crossed the viewport guide.
 * Direction is descriptive only; geometry owns the state.
 */
export function resolveSceneFrame(input: SceneFrameInput): SceneFrame {
  const centers = input.stepCenters;
  const direction = input.direction ?? "forward";

  if (centers.length === 0) {
    const progress = progressBetween(input.guidePosition, input.sceneStart, input.sceneEnd);
    return { beatIndex: 0, sceneProgress: progress, beatProgress: progress, direction };
  }

  let beatIndex = 0;
  for (let index = 1; index < centers.length; index += 1) {
    const center = centers[index];
    if (center === undefined || input.guidePosition < center) break;
    beatIndex = index;
  }

  const firstCenter = centers[0] ?? input.sceneStart;
  const lastCenter = centers[centers.length - 1] ?? input.sceneEnd;
  const sceneProgress =
    centers.length === 1
      ? progressBetween(input.guidePosition, input.sceneStart, input.sceneEnd)
      : progressBetween(input.guidePosition, firstCenter, lastCenter);
  const beatStart = centers[beatIndex] ?? input.sceneStart;
  const followingCenter = centers[beatIndex + 1];
  const beatEnd = followingCenter === undefined ? Math.max(beatStart, input.sceneEnd) : followingCenter;

  return {
    beatIndex,
    sceneProgress,
    beatProgress: progressBetween(input.guidePosition, beatStart, beatEnd),
    direction,
  };
}

/**
 * Scroll-owned crossfade. It has no duration: exposure is a pure function of
 * the current measured frame and therefore reverses without finishing a stale
 * transition. The final 35% of a beat hands the stage to the following panel.
 */
export function resolveVisualExposure(visualIndex: number, beatIndex: number, beatProgress: number, visualCount: number): number {
  if (visualCount <= 0 || visualIndex < 0 || visualIndex >= visualCount) return 0;
  const currentIndex = Math.min(visualCount - 1, Math.max(0, beatIndex));
  if (currentIndex === visualCount - 1) return visualIndex === currentIndex ? 1 : 0;

  const handoff = progressBetween(clampUnit(beatProgress), 0.65, 1);
  if (visualIndex === currentIndex) return 1 - handoff;
  if (visualIndex === currentIndex + 1) return handoff;
  return 0;
}
