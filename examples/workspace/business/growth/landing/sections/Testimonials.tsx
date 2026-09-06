"use client";

/**
 * Testimonials — stagger reveal + cursor spotlight.
 *
 * Contract: quotes reveal via the js-gated .lm-reveal/.lm-in CSS mechanism
 * (never a hiding `initial`, which would bake opacity:0 into SSR HTML). The
 * spotlight overlay mounts only after hydration AND when motion is not
 * reduced, so server and first-client render always agree.
 */
import { motion, useInView, useMotionValue, useMotionTemplate, useReducedMotion } from "motion/react";
import { useRef } from "react";
import { useHydratedMotionGate } from "../lib/motion-tokens";

export interface Testimonial {
  quote: string;
  name: string;
  role: string;
}

export interface TestimonialsProps {
  heading: string;
  testimonials: Testimonial[];
}

export function Testimonials({ heading, testimonials }: TestimonialsProps) {
  const hydrated = useHydratedMotionGate();
  const reduced = useReducedMotion();
  const gridRef = useRef<HTMLDivElement | null>(null);
  const inView = useInView(gridRef, { once: true, amount: 0.25 });
  const pointerX = useMotionValue(50);
  const pointerY = useMotionValue(50);
  const spotlight = useMotionTemplate`radial-gradient(240px at ${pointerX}% ${pointerY}%, var(--color-surface-elevated), transparent 70%)`;

  return (
    <section
      className="lm-testimonials"
      onPointerMove={(event) => {
        if (reduced) {
          return;
        }
        const bounds = event.currentTarget.getBoundingClientRect();
        pointerX.set(((event.clientX - bounds.left) / bounds.width) * 100);
        pointerY.set(((event.clientY - bounds.top) / bounds.height) * 100);
      }}
    >
      {hydrated && !reduced && <motion.div className="lm-spotlight" style={{ backgroundImage: spotlight }} aria-hidden="true" />}
      <h2 className="lm-section-heading">{heading}</h2>
      <div ref={gridRef} className="lm-testimonial-grid">
        {testimonials.map((testimonial, index) => (
          <figure key={testimonial.name} className={`lm-testimonial lm-reveal${inView ? " lm-in" : ""}`} style={{ ["--lm-stagger-index" as string]: index }}>
            <blockquote>{testimonial.quote}</blockquote>
            <figcaption>
              <strong>{testimonial.name}</strong> · {testimonial.role}
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}
