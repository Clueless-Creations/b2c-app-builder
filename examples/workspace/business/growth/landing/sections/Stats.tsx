"use client";

/**
 * Stats — eased count-up when the row enters the viewport.
 * The real value is server-rendered; the count-up only runs after hydration
 * and is skipped entirely under reduced motion.
 */
import { useInView, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { readMotionTokens } from "../lib/motion-tokens";

export interface Stat {
  value: number;
  suffix?: string;
  label: string;
}

export interface StatsProps {
  stats: Stat[];
}

function CountUp({ value, suffix = "" }: { value: number; suffix?: string }) {
  const reduced = useReducedMotion();
  const ref = useRef<HTMLSpanElement | null>(null);
  const inView = useInView(ref, { once: true, amount: 0.6 });
  // Server render shows the final value — the stat is never blank for
  // crawlers or no-JS readers; the count-up only replays it.
  const [display, setDisplay] = useState(value);

  useEffect(() => {
    if (!inView || reduced) {
      return;
    }
    const tokens = readMotionTokens();
    const durationMs = tokens.cinematic * 1000;
    const started = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const progress = Math.min(1, (now - started) / durationMs);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(value * eased));
      if (progress < 1) {
        frame = requestAnimationFrame(tick);
      }
    };
    setDisplay(0);
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [inView, reduced, value]);

  return (
    <span ref={ref}>
      {display.toLocaleString()}
      {suffix}
    </span>
  );
}

export function Stats({ stats }: StatsProps) {
  return (
    <section className="lm-stats">
      <dl className="lm-stats-row">
        {stats.map((stat) => (
          <div key={stat.label} className="lm-stat">
            <dt>{stat.label}</dt>
            <dd>
              <CountUp value={stat.value} suffix={stat.suffix} />
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
