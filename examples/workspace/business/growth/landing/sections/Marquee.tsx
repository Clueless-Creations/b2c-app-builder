"use client";

/**
 * Trust marquee — seamless infinite loop, pause on hover, edge mask.
 * The loop is pure CSS (motion.css .lm-marquee), so it costs no JS and stops
 * entirely under prefers-reduced-motion.
 */
import type { ReactNode } from "react";

export interface MarqueeProps {
  items: ReactNode[];
  label?: string;
}

export function Marquee({ items, label = "Trusted by" }: MarqueeProps) {
  return (
    <section className="lm-trust" aria-label={label}>
      <div className="lm-marquee">
        <div className="lm-marquee-track">
          {/* Content duplicated once so the -50% keyframe loops seamlessly. */}
          {[0, 1].map((copy) => (
            <div key={copy} aria-hidden={copy === 1} className="lm-marquee-group">
              {items.map((item, index) => (
                <span key={index} className="lm-marquee-item">
                  {item}
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
