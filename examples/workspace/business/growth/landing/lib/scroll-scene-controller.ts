import {
  DEFAULT_DESKTOP_GUIDE,
  DEFAULT_MOBILE_GUIDE,
  DEFAULT_SHORT_MOBILE_GUIDE,
  clampUnit,
  resolveDirection,
  resolveGuideRatio,
  resolveSaveDataPreference,
  resolveSceneStateBindings,
  resolveSceneFrame,
  resolveVisualExposure,
  type SceneDirection,
  type SceneFrame,
} from "./scene-progress";

/**
 * Framework-light runtime for every registered scroll scene on a page.
 * One coordinator owns the observers, listeners, measurements, and rAF write.
 * IntersectionObserver can suspend off-screen work; it never selects a beat.
 */

export interface ScrollSceneRegistrationOptions {
  stepSelector?: string;
  visualSelector?: string;
  observerRootMargin?: string;
  /** Save-Data observed by the server, for example from the request Client Hint. */
  saveData?: boolean;
}

interface SceneRecord {
  element: HTMLElement;
  steps: HTMLElement[];
  visualsByState: Map<string, HTMLElement>;
  stateIndexById: Map<string, number>;
  stateIds: string[];
  centers: number[];
  sceneStart: number;
  sceneEnd: number;
  guideRatio: number;
  active: boolean;
  serverSaveData?: boolean;
  appliedSaveData?: boolean;
}

interface SaveDataConnection extends EventTarget {
  saveData?: boolean;
}

const DEFAULT_STEP_SELECTOR = "[data-scene-step]";
const DEFAULT_VISUAL_SELECTOR = "[data-scene-visual]";
const DEFAULT_OBSERVER_ROOT_MARGIN = "100% 0px 100% 0px";
const MOBILE_QUERY = "(max-width: 799px)";
const SHORT_MOBILE_QUERY = "(max-width: 799px) and (max-height: 620px)";
const UNIT_PRECISION = 10_000;

const records = new Map<HTMLElement, SceneRecord>();
let intersectionObserver: IntersectionObserver | undefined;
let resizeObserver: ResizeObserver | undefined;
let frameRequest = 0;
let measurementPending = false;
let fullUpdatePending = false;
let listenersInstalled = false;
let lastGuidePosition = 0;
let direction: SceneDirection = "forward";
let motionQuery: MediaQueryList | undefined;
let mobileQuery: MediaQueryList | undefined;
let shortMobileQuery: MediaQueryList | undefined;
let connection: SaveDataConnection | undefined;
let fontSet: FontFaceSet | undefined;

function parseGuide(element: HTMLElement, key: "sceneGuide" | "sceneMobileGuide" | "sceneShortMobileGuide", fallback: number): number {
  const value = Number(element.dataset[key]);
  return Number.isFinite(value) ? clampUnit(value) : fallback;
}

function viewportGuidePosition(guideRatio: number): number {
  const viewport = window.visualViewport;
  const height = viewport?.height ?? window.innerHeight;
  const offsetTop = viewport?.offsetTop ?? 0;
  return window.scrollY + offsetTop + height * guideRatio;
}

function roundedUnit(value: number): string {
  return String(Math.round(clampUnit(value) * UNIT_PRECISION) / UNIT_PRECISION);
}

function currentSaveDataPreference(record: SceneRecord): boolean {
  return resolveSaveDataPreference(record.serverSaveData, connection?.saveData === true);
}

/** Save-Data changes asset policy only; it never changes scene progress. */
export function applySaveDataMode(element: HTMLElement, saveData: boolean): void {
  element.dataset.sceneSaveData = saveData ? "true" : "false";
  if (saveData) {
    element
      .querySelectorAll<HTMLMediaElement>(
        "video[data-scene-heavy-media], audio[data-scene-heavy-media], [data-scene-heavy-media] video, [data-scene-heavy-media] audio",
      )
      .forEach((media) => media.pause());
  }
}

function writeFrame(record: SceneRecord, frame: SceneFrame): void {
  const beatIndex = Math.min(record.steps.length - 1, Math.max(0, frame.beatIndex));
  const stateId = record.stateIds[beatIndex];
  if (!stateId) return;

  record.element.dataset.sceneState = stateId;
  record.element.dataset.sceneBeat = stateId;
  record.element.dataset.sceneDirection = frame.direction;
  record.element.style.setProperty("--scene-p", roundedUnit(frame.sceneProgress));
  record.element.style.setProperty("--beat-t", roundedUnit(frame.beatProgress));
  record.element.style.setProperty("--beat-index", String(beatIndex));

  record.steps.forEach((step, index) => {
    const current = index === beatIndex;
    step.classList.toggle("is-current-step", current);
    if (current) step.setAttribute("aria-current", "step");
    else step.removeAttribute("aria-current");
  });

  record.visualsByState.forEach((visual, visualStateId) => {
    const visualStateIndex = record.stateIndexById.get(visualStateId);
    if (visualStateIndex === undefined) return;
    const omitted = visual.dataset.sceneVisualOmitted === "true";
    const active = !omitted && visualStateId === stateId;
    visual.dataset.sceneVisualActive = active ? "true" : "false";
    visual.setAttribute("aria-hidden", active ? "false" : "true");
    visual.style.setProperty(
      "--lm-visual-p",
      omitted ? "0" : roundedUnit(resolveVisualExposure(visualStateIndex, beatIndex, frame.beatProgress, record.stateIds.length)),
    );
  });
}

function applyFinalState(record: SceneRecord): void {
  const finalIndex = record.steps.length - 1;
  writeFrame(record, {
    beatIndex: finalIndex,
    sceneProgress: 1,
    beatProgress: 1,
    direction: "forward",
  });
  record.element.dataset.sceneMotion = "static";
  record.element.dataset.sceneLifecycle = "static";
  record.element.classList.add("lm-scrolly-ready");
}

function measure(record: SceneRecord): void {
  record.guideRatio = resolveGuideRatio({
    desktop: parseGuide(record.element, "sceneGuide", DEFAULT_DESKTOP_GUIDE),
    mobile: parseGuide(record.element, "sceneMobileGuide", DEFAULT_MOBILE_GUIDE),
    shortMobile: parseGuide(record.element, "sceneShortMobileGuide", DEFAULT_SHORT_MOBILE_GUIDE),
    isMobile: mobileQuery?.matches,
    isShortMobile: shortMobileQuery?.matches,
  });

  const scrollY = window.scrollY;
  const sceneRect = record.element.getBoundingClientRect();
  record.sceneStart = scrollY + sceneRect.top;
  record.sceneEnd = scrollY + sceneRect.bottom;
  record.centers = record.steps.map((step) => {
    const rect = step.getBoundingClientRect();
    return scrollY + rect.top + rect.height / 2;
  });
}

function updateRecord(record: SceneRecord): void {
  const resolvedSaveData = currentSaveDataPreference(record);
  if (record.appliedSaveData !== resolvedSaveData) {
    applySaveDataMode(record.element, resolvedSaveData);
    record.appliedSaveData = resolvedSaveData;
  }
  if (motionQuery?.matches) {
    applyFinalState(record);
    return;
  }

  record.element.dataset.sceneMotion = "scroll";
  record.element.dataset.sceneLifecycle = record.active ? "active" : "suspended";
  const guidePosition = viewportGuidePosition(record.guideRatio);
  writeFrame(
    record,
    resolveSceneFrame({
      stepCenters: record.centers,
      sceneStart: record.sceneStart,
      sceneEnd: record.sceneEnd,
      guidePosition,
      direction,
    }),
  );
  record.element.classList.add("lm-scrolly-ready");
}

function measureAll(): void {
  records.forEach(measure);
}

function updateAll(includeSuspended = false): void {
  records.forEach((record) => {
    if (includeSuspended || record.active) updateRecord(record);
  });
}

function flush(): void {
  frameRequest = 0;
  if (measurementPending) {
    measurementPending = false;
    fullUpdatePending = false;
    measureAll();
    updateAll(true);
    return;
  }
  if (fullUpdatePending) {
    fullUpdatePending = false;
    updateAll(true);
    return;
  }
  updateAll();
}

function schedule(): void {
  if (frameRequest || records.size === 0) return;
  frameRequest = window.requestAnimationFrame(flush);
}

/** Public escape hatch for host layout changes that do not emit resize. */
export function remeasureScrollScenes(): void {
  if (typeof window === "undefined") return;
  measurementPending = true;
  schedule();
}

function onScroll(): void {
  const nextGuidePosition = window.scrollY + (window.visualViewport?.offsetTop ?? 0);
  direction = resolveDirection(lastGuidePosition, nextGuidePosition, direction);
  lastGuidePosition = nextGuidePosition;
  schedule();
}

function onViewportChange(): void {
  remeasureScrollScenes();
}

function onPageRestore(): void {
  lastGuidePosition = window.scrollY + (window.visualViewport?.offsetTop ?? 0);
  remeasureScrollScenes();
}

function onPreferenceChange(): void {
  fullUpdatePending = true;
  schedule();
}

function installCoordinator(observerRootMargin: string): void {
  if (listenersInstalled) return;
  listenersInstalled = true;
  document.documentElement.classList.add("js");

  motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  mobileQuery = window.matchMedia(MOBILE_QUERY);
  shortMobileQuery = window.matchMedia(SHORT_MOBILE_QUERY);
  connection = (navigator as Navigator & { connection?: SaveDataConnection }).connection;
  fontSet = document.fonts;
  lastGuidePosition = window.scrollY + (window.visualViewport?.offsetTop ?? 0);

  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onViewportChange, { passive: true });
  window.addEventListener("orientationchange", onViewportChange, { passive: true });
  window.addEventListener("hashchange", onPageRestore, { passive: true });
  window.addEventListener("pageshow", onPageRestore, { passive: true });
  window.addEventListener("load", onPageRestore, { passive: true, once: true });
  window.visualViewport?.addEventListener("resize", onViewportChange, { passive: true });
  window.visualViewport?.addEventListener("scroll", onScroll, { passive: true });
  motionQuery.addEventListener("change", onPreferenceChange);
  mobileQuery.addEventListener("change", onViewportChange);
  shortMobileQuery.addEventListener("change", onViewportChange);
  connection?.addEventListener("change", onPreferenceChange);
  fontSet?.addEventListener?.("loadingdone", onViewportChange);
  void fontSet?.ready.then(() => remeasureScrollScenes());

  if ("IntersectionObserver" in window) {
    intersectionObserver = new IntersectionObserver(
      (entries) => {
        let activated = false;
        entries.forEach((entry) => {
          const record = records.get(entry.target as HTMLElement);
          if (!record) return;
          record.active = entry.isIntersecting;
          record.element.dataset.sceneLifecycle = entry.isIntersecting ? "active" : "suspended";
          activated ||= entry.isIntersecting;
        });
        if (activated) schedule();
      },
      { rootMargin: observerRootMargin, threshold: 0 },
    );
  }

  if ("ResizeObserver" in window) {
    resizeObserver = new ResizeObserver(() => remeasureScrollScenes());
  }
}

function removeCoordinator(): void {
  if (!listenersInstalled || records.size > 0) return;
  listenersInstalled = false;
  if (frameRequest) window.cancelAnimationFrame(frameRequest);
  frameRequest = 0;
  measurementPending = false;
  fullUpdatePending = false;
  intersectionObserver?.disconnect();
  resizeObserver?.disconnect();
  intersectionObserver = undefined;
  resizeObserver = undefined;

  window.removeEventListener("scroll", onScroll);
  window.removeEventListener("resize", onViewportChange);
  window.removeEventListener("orientationchange", onViewportChange);
  window.removeEventListener("hashchange", onPageRestore);
  window.removeEventListener("pageshow", onPageRestore);
  window.removeEventListener("load", onPageRestore);
  window.visualViewport?.removeEventListener("resize", onViewportChange);
  window.visualViewport?.removeEventListener("scroll", onScroll);
  motionQuery?.removeEventListener("change", onPreferenceChange);
  mobileQuery?.removeEventListener("change", onViewportChange);
  shortMobileQuery?.removeEventListener("change", onViewportChange);
  connection?.removeEventListener("change", onPreferenceChange);
  fontSet?.removeEventListener?.("loadingdone", onViewportChange);
  motionQuery = undefined;
  mobileQuery = undefined;
  shortMobileQuery = undefined;
  connection = undefined;
  fontSet = undefined;
}

function unobserveRecord(record: SceneRecord): void {
  intersectionObserver?.unobserve(record.element);
  resizeObserver?.unobserve(record.element);
  record.steps.forEach((step) => resizeObserver?.unobserve(step));
}

function restoreStaticPresentation(element: HTMLElement, steps: HTMLElement[], visuals: HTMLElement[]): void {
  const stepStateIds = steps.map((step) => step.dataset.sceneStepState);
  const declaredFinal = element.dataset.sceneFinal;
  let finalState = declaredFinal && stepStateIds.includes(declaredFinal) ? declaredFinal : undefined;
  if (!finalState) {
    for (let index = stepStateIds.length - 1; index >= 0; index -= 1) {
      if (stepStateIds[index]) {
        finalState = stepStateIds[index];
        break;
      }
    }
  }
  let finalStepIndex = -1;
  stepStateIds.forEach((stateId, index) => {
    if (stateId === finalState) finalStepIndex = index;
  });

  element.classList.remove("lm-scrolly-ready");
  element.dataset.sceneMotion = "static";
  element.dataset.sceneLifecycle = "static";
  element.dataset.sceneDirection = "forward";
  element.style.setProperty("--scene-p", "1");
  element.style.setProperty("--beat-t", "1");
  element.style.setProperty("--beat-index", String(Math.max(0, finalStepIndex)));

  if (finalState) {
    element.dataset.sceneState = finalState;
    element.dataset.sceneBeat = finalState;
  }
  steps.forEach((step, index) => {
    const current = index === finalStepIndex;
    step.classList.toggle("is-current-step", current);
    if (current) step.setAttribute("aria-current", "step");
    else step.removeAttribute("aria-current");
  });

  let finalVisualSelected = false;
  visuals.forEach((visual) => {
    const matchesFinal = !finalVisualSelected && Boolean(finalState) && visual.dataset.sceneVisualState === finalState;
    finalVisualSelected ||= matchesFinal;
    const current = matchesFinal && visual.dataset.sceneVisualOmitted !== "true";
    visual.dataset.sceneVisualActive = current ? "true" : "false";
    visual.setAttribute("aria-hidden", current ? "false" : "true");
    visual.style.setProperty("--lm-visual-p", current ? "1" : "0");
  });
}

/**
 * Register one SSR-rendered scene with the page coordinator. The returned
 * cleanup removes only this scene and tears down global listeners after the
 * final scene unmounts.
 */
export function registerScrollScene(element: HTMLElement, options: ScrollSceneRegistrationOptions = {}): () => void {
  if (typeof window === "undefined" || typeof document === "undefined") return () => {};

  const steps = [...element.querySelectorAll<HTMLElement>(options.stepSelector ?? DEFAULT_STEP_SELECTOR)];
  const visuals = [...element.querySelectorAll<HTMLElement>(options.visualSelector ?? DEFAULT_VISUAL_SELECTOR)];
  const prior = records.get(element);
  if (prior) {
    unobserveRecord(prior);
    records.delete(element);
  }

  const browserSaveData = (navigator as Navigator & { connection?: SaveDataConnection }).connection?.saveData === true;
  const initialSaveData = resolveSaveDataPreference(options.saveData, browserSaveData);
  applySaveDataMode(element, initialSaveData);

  const bindingResult = resolveSceneStateBindings(
    steps.map((step) => step.dataset.sceneStepState),
    visuals.map((visual) => visual.dataset.sceneVisualState),
  );
  if (!bindingResult.valid) {
    restoreStaticPresentation(element, steps, visuals);
    console.warn(
      `[B2C App Builder scrollytelling] Enhancement skipped for scene ${JSON.stringify(element.id || "(unidentified)")}: ${bindingResult.errors.join(" ")}`,
    );
    removeCoordinator();
    return () => {};
  }

  const stateIds = bindingResult.bindings.map((binding) => binding.stateId);
  const visualElementByState = new Map<string, HTMLElement>();
  visuals.forEach((visual) => {
    const visualStateId = visual.dataset.sceneVisualState;
    if (visualStateId) visualElementByState.set(visualStateId, visual);
  });
  const visualsByState = new Map<string, HTMLElement>();
  bindingResult.bindings.forEach((binding) => {
    const visual = visualElementByState.get(binding.stateId);
    if (visual) visualsByState.set(binding.stateId, visual);
  });

  const record: SceneRecord = {
    element,
    steps,
    visualsByState,
    stateIndexById: new Map(stateIds.map((stateId, index) => [stateId, index])),
    stateIds,
    centers: [],
    sceneStart: 0,
    sceneEnd: 0,
    guideRatio: DEFAULT_DESKTOP_GUIDE,
    active: true,
    serverSaveData: options.saveData,
    appliedSaveData: initialSaveData,
  };
  records.set(element, record);
  installCoordinator(options.observerRootMargin ?? DEFAULT_OBSERVER_ROOT_MARGIN);
  intersectionObserver?.observe(element);
  resizeObserver?.observe(element);
  steps.forEach((step) => resizeObserver?.observe(step));

  // Correct restored/deep-linked state before enabling any scroll presentation.
  measure(record);
  updateRecord(record);

  return () => {
    if (records.get(element) !== record) return;
    unobserveRecord(record);
    records.delete(element);
    removeCoordinator();
  };
}
