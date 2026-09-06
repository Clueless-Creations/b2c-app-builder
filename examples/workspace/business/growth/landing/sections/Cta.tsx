"use client";

/**
 * CTA — conic gradient morph + cursor spotlight over a glass panel.
 * The CTA copy and button are real markup server-side; both effects are
 * pure decoration and are disabled under reduced motion.
 */
import { motion, useMotionValue, useMotionTemplate, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";
import { useHydratedMotionGate } from "../lib/motion-tokens";

export interface CtaProps {
  heading: string;
  body: string;
  action: ReactNode;
}

export function Cta({ heading, body, action }: CtaProps) {
  const hydrated = useHydratedMotionGate();
  const reduced = useReducedMotion();
  const pointerX = useMotionValue(50);
  const pointerY = useMotionValue(50);
  const spotlight = useMotionTemplate`radial-gradient(320px at ${pointerX}% ${pointerY}%, var(--color-surface), transparent 72%)`;

  return (
    <section
      className="lm-cta"
      onPointerMove={(event) => {
        if (reduced) {
          return;
        }
        const bounds = event.currentTarget.getBoundingClientRect();
        pointerX.set(((event.clientX - bounds.left) / bounds.width) * 100);
        pointerY.set(((event.clientY - bounds.top) / bounds.height) * 100);
      }}
    >
      {/* The morph class ships in SSR; motion.css's reduced-motion media query
          stops it, so no JS branch (and no hydration mismatch) is needed. */}
      <div className="lm-cta-backdrop lm-gradient-morph" aria-hidden="true" />
      {hydrated && !reduced && <motion.div className="lm-spotlight" style={{ backgroundImage: spotlight }} aria-hidden="true" />}
      <div className="lm-cta-panel">
        <h2>{heading}</h2>
        <p>{body}</p>
        {action}
      </div>
    </section>
  );
}
