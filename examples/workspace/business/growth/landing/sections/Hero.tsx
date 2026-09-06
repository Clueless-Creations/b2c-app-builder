"use client";

/**
 * Hero — gradient mesh (or opt-in baked video), scroll parallax, word-by-word
 * headline stagger, pointer tilt on the floating card.
 *
 * Contract: the headline/subhead are REAL TEXT in server HTML. Word spans are
 * created only after hydration (html.js), so crawlers and no-JS readers always
 * see the intact copy. All timing reads --motion-* tokens.
 */
import { motion, useReducedMotion, useScroll, useTransform } from "motion/react";
import { useRef, type ReactNode } from "react";
import { useHydratedMotionGate } from "../lib/motion-tokens";

export interface HeroProps {
  headline: string;
  subhead: string;
  cta: ReactNode;
  /** Opt-in Remotion-baked loop (license-gated; see templates/landing/README.md). */
  videoSrc?: string;
  poster?: string;
}

function StaggeredHeadline({ text }: { text: string }) {
  const hydrated = useHydratedMotionGate();

  if (!hydrated) {
    // Server and no-JS render: the intact headline, always legible.
    return <h1 className="lm-hero-headline">{text}</h1>;
  }
  return (
    <h1 className="lm-hero-headline" aria-label={text}>
      {text.split(" ").map((word, index) => (
        <span key={`${word}-${index}`} aria-hidden="true" className="lm-word" style={{ ["--lm-stagger-index" as string]: index }}>
          {word}&nbsp;
        </span>
      ))}
    </h1>
  );
}

export function Hero({ headline, subhead, cta, videoSrc, poster }: HeroProps) {
  const reduced = useReducedMotion();
  const sectionRef = useRef<HTMLElement | null>(null);
  const { scrollYProgress } = useScroll({ target: sectionRef, offset: ["start start", "end start"] });
  const parallaxY = useTransform(scrollYProgress, [0, 1], ["0%", reduced ? "0%" : "18%"]);

  return (
    <section ref={sectionRef} className="lm-hero">
      {videoSrc ? (
        <video className="lm-hero-media" src={videoSrc} poster={poster} autoPlay muted loop playsInline aria-hidden="true" />
      ) : (
        <div className="lm-hero-mesh lm-gradient-morph" aria-hidden="true" />
      )}
      <motion.div className="lm-hero-copy" style={{ y: parallaxY }}>
        <StaggeredHeadline text={headline} />
        <p className="lm-hero-subhead">{subhead}</p>
        {cta}
      </motion.div>
    </section>
  );
}
