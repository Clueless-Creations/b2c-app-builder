"use client";

/**
 * Conditional modular evidence grid with an in-view reveal and hover response.
 *
 * Contract: the reveal uses the js-gated .lm-reveal/.lm-in CSS mechanism from
 * motion.css — never motion's `initial` prop, which bakes opacity:0 into SSR
 * HTML and would hide real text from crawlers and no-JS readers. Stagger
 * timing comes from --motion-stagger via --lm-stagger-index.
 */
import { motion, useInView, useReducedMotion } from "motion/react";
import { useRef, type ReactNode } from "react";
import { useHydratedMotionGate } from "../lib/motion-tokens";

export interface BentoCard {
  title: string;
  body: ReactNode;
  /** Grid span hint, e.g. "wide" | "tall"; consumed by the host's CSS. */
  variant?: string;
}

export interface BentoProps {
  heading: string;
  cards: BentoCard[];
}

export function Bento({ heading, cards }: BentoProps) {
  useHydratedMotionGate();
  const reduced = useReducedMotion();
  const gridRef = useRef<HTMLDivElement | null>(null);
  const inView = useInView(gridRef, { once: true, amount: 0.2 });

  return (
    <section className="lm-bento">
      <h2 className="lm-section-heading">{heading}</h2>
      <div ref={gridRef} className="lm-bento-grid">
        {cards.map((card, index) => (
          <motion.article
            key={card.title}
            className={`lm-bento-card lm-reveal${inView ? " lm-in" : ""}${card.variant ? ` lm-bento-${card.variant}` : ""}`}
            style={{ ["--lm-stagger-index" as string]: index }}
            whileHover={reduced ? undefined : { y: -6 }}
          >
            <h3>{card.title}</h3>
            <div>{card.body}</div>
          </motion.article>
        ))}
      </div>
    </section>
  );
}
