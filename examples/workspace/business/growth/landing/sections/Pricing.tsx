"use client";

/**
 * Offer comparison with a live billing toggle that re-prices in place.
 * Prices are real text server-side (monthly by default). The toggle is a
 * button pair, keyboard-accessible, and the re-price transition respects
 * reduced motion.
 */
import { motion, useReducedMotion } from "motion/react";
import { useState } from "react";
import { useHydratedMotionGate, useMotionTokens } from "../lib/motion-tokens";

export interface PricingTier {
  name: string;
  monthly: number;
  yearly: number;
  currency?: string;
  features: string[];
  highlighted?: boolean;
}

export interface PricingProps {
  heading: string;
  tiers: PricingTier[];
  /** Copy must match revenue/REVENUE_OPS.md and the store paywall (change-cascade). */
  disclaimer?: string;
}

export function Pricing({ heading, tiers, disclaimer }: PricingProps) {
  // Prices are visible in SSR HTML: the re-price entrance only applies after
  // hydration (never a server-baked opacity:0 on real copy).
  const hydrated = useHydratedMotionGate();
  const reduced = useReducedMotion();
  const tokens = useMotionTokens();
  const [billing, setBilling] = useState<"monthly" | "yearly">("monthly");

  return (
    <section className="lm-pricing">
      <h2 className="lm-section-heading">{heading}</h2>
      <div className="lm-billing-toggle" role="group" aria-label="Billing period">
        {(["monthly", "yearly"] as const).map((period) => (
          <button key={period} type="button" aria-pressed={billing === period} onClick={() => setBilling(period)}>
            {period === "monthly" ? "Monthly" : "Yearly"}
          </button>
        ))}
      </div>
      <div className="lm-pricing-grid">
        {tiers.map((tier) => (
          <div key={tier.name} className={`lm-price-card${tier.highlighted ? " lm-price-highlighted" : ""}`}>
            <h3>{tier.name}</h3>
            <motion.p
              key={billing}
              className="lm-price"
              initial={hydrated && !reduced ? { opacity: 0, y: 8 } : false}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: tokens.base, ease: tokens.easeSpring }}
            >
              {tier.currency ?? "$"}
              {billing === "monthly" ? tier.monthly : tier.yearly}
              <span className="lm-price-period">/{billing === "monthly" ? "mo" : "yr"}</span>
            </motion.p>
            <ul>
              {tier.features.map((feature) => (
                <li key={feature}>{feature}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      {disclaimer ? <p className="lm-pricing-disclaimer">{disclaimer}</p> : null}
    </section>
  );
}
