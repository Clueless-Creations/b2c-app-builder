/**
 * SSR-safe access to the promoted --motion-* tokens for motion/react
 * transitions, plus the html.js gate that motion.css keys its reveal states
 * on. Sections must take their timing from here (or from the CSS variables
 * directly) — never from magic numbers — so one re-promotion of
 * DESIGN.md retimes every surface.
 *
 * Hidden states are NEVER server-rendered: motion's `initial` prop bakes into
 * SSR inline styles, so sections must not pass a hiding `initial` until
 * useHydratedMotionGate() returns true (and CSS reveals key on html.js).
 */
import { useEffect, useMemo, useState } from "react";

export interface LandingMotionTokens {
  /** Seconds — micro-interactions (hover lift, toggle). */
  base: number;
  /** Seconds — in-view reveals and word stagger. */
  reveal: number;
  /** Seconds — cinematic beats (mesh drift, scrollytelling cross-fades). */
  cinematic: number;
  /** Seconds — per-item stagger step. */
  stagger: number;
  /** cubic-bezier tuple for emphasized entrances (expo-out). */
  easeEmphasis: [number, number, number, number];
  /** cubic-bezier tuple for springy accents. */
  easeSpring: [number, number, number, number];
}

/** Server-render fallbacks mirror the shipped token defaults. */
const FALLBACK: LandingMotionTokens = {
  base: 0.22,
  reveal: 0.6,
  cinematic: 1.2,
  stagger: 0.06,
  easeEmphasis: [0.16, 1, 0.3, 1],
  easeSpring: [0.34, 1.56, 0.64, 1],
};

function readMs(styles: CSSStyleDeclaration, name: string, fallbackSeconds: number): number {
  const raw = styles.getPropertyValue(name).trim();
  const ms = Number.parseFloat(raw.replace(/ms$/i, ""));
  return Number.isFinite(ms) ? ms / 1000 : fallbackSeconds;
}

function readBezier(styles: CSSStyleDeclaration, name: string, fallback: [number, number, number, number]): [number, number, number, number] {
  const raw = styles.getPropertyValue(name).trim();
  const match = raw.match(/cubic-bezier\(([^)]+)\)/);
  if (!match || !match[1]) {
    return fallback;
  }
  const parts = match[1].split(",").map((part) => Number.parseFloat(part.trim()));
  return parts.length === 4 && parts.every((part) => Number.isFinite(part)) ? (parts as [number, number, number, number]) : fallback;
}

/** Read the promoted tokens from :root; falls back to shipped defaults during SSR. */
export function readMotionTokens(): LandingMotionTokens {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return FALLBACK;
  }
  const styles = window.getComputedStyle(document.documentElement);
  return {
    base: readMs(styles, "--motion-duration-base", FALLBACK.base),
    reveal: readMs(styles, "--motion-duration-reveal", FALLBACK.reveal),
    cinematic: readMs(styles, "--motion-duration-cinematic", FALLBACK.cinematic),
    stagger: readMs(styles, "--motion-stagger", FALLBACK.stagger),
    easeEmphasis: readBezier(styles, "--motion-easing-emphasis", FALLBACK.easeEmphasis),
    easeSpring: readBezier(styles, "--motion-easing-spring", FALLBACK.easeSpring),
  };
}

/**
 * Set the html.js gate motion.css keys on. Call once from the page shell
 * (e.g. a useEffect in the top-level client component). Until it runs — or
 * forever, with JavaScript off — no reveal state hides any content.
 */
export function enableJsMotionGate(): void {
  if (typeof document !== "undefined") {
    document.documentElement.classList.add("js");
  }
}

/**
 * True only after hydration, and sets the html.js gate as a side effect.
 * Server render and the client's first (hydration) render both return false,
 * so branching visible/structural output on this value never causes a
 * hydration mismatch — and no hiding `initial` ever reaches SSR HTML.
 * (useReducedMotion() alone is not enough: it is null on the server but
 * resolves synchronously on the client's first render, so branching on it
 * pre-mount mismatches for reduced-motion users.)
 */
export function useHydratedMotionGate(): boolean {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    enableJsMotionGate();
    setHydrated(true);
  }, []);
  return hydrated;
}

/** readMotionTokens(), memoized so re-renders never re-trigger getComputedStyle reflows. */
export function useMotionTokens(): LandingMotionTokens {
  return useMemo(() => readMotionTokens(), []);
}
