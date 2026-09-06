"use client";

/**
 * Semantic, geometry-driven scrollytelling.
 *
 * All copy and the final visual render in server HTML. After hydration, the
 * shared controller measures real step centers and publishes --scene-p,
 * --beat-t, and --beat-index. Visual exposure is scroll-owned, not timed.
 */
import { useLayoutEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { registerScrollScene } from "../lib/scroll-scene-controller";
import {
  DEFAULT_DESKTOP_GUIDE,
  DEFAULT_MOBILE_GUIDE,
  DEFAULT_SHORT_MOBILE_GUIDE,
  assertStableStateIds,
  isHeavyMediaSourceKind,
  resolveSceneSaveDataRenderMode,
  type CodeNativeSceneVisualPolicy,
  type OmittedSceneVisualPolicy,
  type PosterSceneVisualPolicy,
} from "../lib/scene-progress";

export interface ScrollyStepBase {
  /** Stable semantic state key. Never derive it from localized display copy. */
  id: string;
  label?: string;
  title: string;
  body: string;
  /** Code-native diagram, product state, image, or media plate for this beat. */
  visual: ReactNode;
  /** Screen-reader name for the active visual state. */
  visualLabel?: string;
}

/** HTML, SVG, and canvas stay available under Save-Data and need no poster. */
export type CodeNativeScrollyStep = ScrollyStepBase & CodeNativeSceneVisualPolicy & { poster?: never };

/**
 * Image and video steps must supply a lightweight poster recorded by
 * posterAssetId, or explicitly omit the visual under server-observed
 * Save-Data. The poster must not contain the original heavy image/video bytes.
 */
export type HeavyMediaScrollyStep = ScrollyStepBase & ((PosterSceneVisualPolicy & { poster: ReactNode }) | (OmittedSceneVisualPolicy & { poster?: never }));

export type ScrollyStep = CodeNativeScrollyStep | HeavyMediaScrollyStep;

export interface ScrollytellingGuides {
  desktop?: number;
  mobile?: number;
  shortMobile?: number;
}

export interface ScrollytellingProps {
  /** Stable scene ID, also used for heading/caption relationships. */
  id: string;
  heading: string;
  lede?: string;
  steps: readonly ScrollyStep[];
  caption: string;
  description: string;
  guides?: ScrollytellingGuides;
  /** Save-Data observed by the server; keeps marked heavy media out of first paint. */
  saveData?: boolean;
  className?: string;
}

type SceneStyle = CSSProperties & Record<`--${string}`, string | number>;

export function Scrollytelling({ id, heading, lede, steps, caption, description, guides = {}, saveData, className }: ScrollytellingProps) {
  assertStableStateIds([id]);
  assertStableStateIds(steps.map((step) => step.id));

  const sceneRef = useRef<HTMLElement | null>(null);
  const finalIndex = steps.length - 1;
  const finalState = steps[finalIndex]?.id;
  const headingId = `${id}-heading`;
  const captionId = `${id}-caption`;
  const descriptionId = `${id}-description`;
  const stateSignature = steps.map((step) => step.id).join("|");
  const desktopGuide = guides.desktop ?? DEFAULT_DESKTOP_GUIDE;
  const mobileGuide = guides.mobile ?? DEFAULT_MOBILE_GUIDE;
  const shortMobileGuide = guides.shortMobile ?? DEFAULT_SHORT_MOBILE_GUIDE;
  const initialStyle: SceneStyle = {
    "--scene-p": 1,
    "--beat-t": 1,
    "--beat-index": finalIndex,
    "--beat-count": steps.length,
  };

  useLayoutEffect(() => {
    const element = sceneRef.current;
    if (!element) return undefined;
    return registerScrollScene(element, { saveData });
  }, [stateSignature, desktopGuide, mobileGuide, shortMobileGuide, saveData]);

  return (
    <section
      ref={sceneRef}
      id={id}
      className={`lm-scrolly${className ? ` ${className}` : ""}`}
      aria-labelledby={headingId}
      data-scene-track
      data-scene-state={finalState}
      data-scene-beat={finalState}
      data-scene-final={finalState}
      data-scene-direction="forward"
      data-scene-guide={desktopGuide}
      data-scene-mobile-guide={mobileGuide}
      data-scene-short-mobile-guide={shortMobileGuide}
      data-scene-motion="static"
      data-scene-lifecycle="static"
      data-scene-save-data={saveData ? "true" : "false"}
      style={initialStyle}
    >
      <header className="lm-scrolly-heading">
        <h2 id={headingId} className="lm-section-heading">
          {heading}
        </h2>
        {lede ? <p>{lede}</p> : null}
      </header>

      <div className="lm-scrolly-layout">
        <figure className="lm-scrolly-pin" aria-describedby={descriptionId}>
          <div className="lm-scrolly-stage">
            {steps.map((step, index) => {
              const current = index === finalIndex;
              const saveDataRenderMode = resolveSceneSaveDataRenderMode(
                {
                  sourceKind: step.sourceKind,
                  saveDataFallback: step.saveDataFallback,
                  posterAssetId: step.posterAssetId,
                  hasPoster: step.poster !== undefined && step.poster !== null,
                },
                saveData === true,
              );
              const renderedVisual = saveDataRenderMode === "visual" ? step.visual : saveDataRenderMode === "poster" ? step.poster : null;
              const heavyMedia = isHeavyMediaSourceKind(step.sourceKind);
              const visualCurrent = current && saveDataRenderMode !== "omit";
              return (
                <div
                  key={step.id}
                  className="lm-scrolly-visual"
                  data-scene-visual
                  data-scene-visual-state={step.id}
                  data-scene-visual-active={visualCurrent ? "true" : "false"}
                  data-scene-heavy-media={heavyMedia && saveDataRenderMode === "visual" ? "" : undefined}
                  data-scene-poster-asset-id={saveDataRenderMode === "poster" ? step.posterAssetId : undefined}
                  data-scene-visual-omitted={saveDataRenderMode === "omit" ? "true" : undefined}
                  role="img"
                  aria-label={step.visualLabel ?? step.title}
                  aria-hidden={visualCurrent ? "false" : "true"}
                  style={{ "--lm-visual-p": visualCurrent ? 1 : 0 } as SceneStyle}
                >
                  {renderedVisual}
                </div>
              );
            })}
          </div>
          <p id={descriptionId} className="lm-visually-hidden">
            {description}
          </p>
          <figcaption id={captionId}>{caption}</figcaption>
        </figure>

        <ol className="lm-scrolly-steps">
          {steps.map((step, index) => {
            const current = index === finalIndex;
            return (
              <li
                key={step.id}
                data-scene-step
                data-scene-step-state={step.id}
                aria-current={current ? "step" : undefined}
                className={current ? "is-current-step" : undefined}
              >
                <div className="lm-scrolly-step-marker" aria-hidden="true">
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <i />
                </div>
                <div>
                  {step.label ? <p className="lm-scrolly-step-label">{step.label}</p> : null}
                  <h3>{step.title}</h3>
                  <p>{step.body}</p>
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
