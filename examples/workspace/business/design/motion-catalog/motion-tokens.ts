// motion-tokens.ts — motion-catalog exemplar pack (web/video lane)
//
// The motion canon replayed in Remotion, for token-true previews, App Store
// preview loops, and brand reels of the same choreography the SwiftUI
// exemplars ship. Source of truth: authored DESIGN.md (motion block) and
// design/system/PremiumCraft.swift (SwiftUI reference preset bounces).
//
// SwiftUI's Animation.spring(duration:bounce:) has a documented physical
// mapping (mass 1, stiffness (2π/d)², damping (1−bounce)·4π/d), and
// Remotion's spring() takes those same physical parameters — so every preset
// below is the SAME spring the shipped SwiftUI presets produce, not an
// imitation. dampingFraction ζ = 1 − bounce, which also covers the cards'
// .spring(response:dampingFraction:) spec notation with one formula.
// TokenSpring.swift is this file's native twin.
//
// Toolchain note: Remotion's bundler requires TypeScript 5.x (TypeScript 7's
// CJS entry drops `typescript.sys`, which @remotion/bundler's esbuild loader
// reads). Pin typescript@5 in the video project. One more web-lane trap: a
// CSS `filter` on a `preserve-3d` ancestor flattens its subtree and breaks
// 3D z-ordering — shade 3D faces with background-color blends instead.

import {Easing, interpolate, spring} from 'remotion';

export const FPS = 60;

/** tokens.json motion.* — milliseconds. */
export const Motion = {
  durationFast: 120, // press feedback, micro-ticks
  durationBase: 220, // state changes, content arrival
  durationSlow: 360, // deliberate transitions
  durationCelebrate: 500, // celebrate-family spring pace
  durationReveal: 600, // bounds celebration choreography
  durationCinematic: 1200, // web/brand lane only
  stagger: 60, // per-item cascade step
} as const;

/** cubic-bezier(0.2, 0, 0, 1) — motion.easing */
export const easingStandard = Easing.bezier(0.2, 0, 0, 1);
/** cubic-bezier(0.16, 1, 0.3, 1) — motion.easingEmphasis */
export const easingEmphasis = Easing.bezier(0.16, 1, 0.3, 1);

export type SpringPhysics = {mass: number; stiffness: number; damping: number};

/** Apple's spring(duration:bounce:) → physical spring. */
export const springFromPreset = (
  durationMs: number,
  bounce: number,
): SpringPhysics => {
  const d = durationMs / 1000;
  return {
    mass: 1,
    stiffness: (2 * Math.PI / d) ** 2,
    damping: ((1 - bounce) * 4 * Math.PI) / d,
  };
};

/**
 * PremiumMotion presets — mirrors PremiumCraft.swift exactly. If PremiumCraft
 * changes a bounce, change it here in the same commit.
 */
export const PremiumMotion = {
  press: springFromPreset(Motion.durationFast, 0.18),
  standard: springFromPreset(Motion.durationBase, 0.12),
  emphasized: springFromPreset(Motion.durationSlow, 0.1),
  celebrate: springFromPreset(Motion.durationCelebrate, 0.3),
  celebrateLanding: springFromPreset(Motion.durationCelebrate, 0.45),
} as const;

export type PresetName = keyof typeof PremiumMotion;

/** ms → frames at the comp fps. */
export const frames = (ms: number, fps: number = FPS): number =>
  Math.round((ms / 1000) * fps);

/**
 * A 0→1 spring progress driven by a PremiumMotion preset. `delayMs` shifts
 * the start; the spring runs on the preset's own physics (never
 * durationInFrames-stretched — that would change the spring).
 */
export const presetSpring = (
  frame: number,
  fps: number,
  preset: PresetName,
  delayMs = 0,
): number =>
  spring({
    frame: frame - frames(delayMs, fps),
    fps,
    config: PremiumMotion[preset],
  });

/**
 * Tween on the emphasized curve over a token duration — for moments the
 * recipes route through easingEmphasis (R4 hero, cascades) instead of a
 * spring.
 */
export const tokenTween = (
  frame: number,
  fps: number,
  durationMs: number,
  delayMs = 0,
  easing = easingEmphasis,
): number =>
  interpolate(
    frame - frames(delayMs, fps),
    [0, frames(durationMs, fps)],
    [0, 1],
    {easing, extrapolateLeft: 'clamp', extrapolateRight: 'clamp'},
  );
