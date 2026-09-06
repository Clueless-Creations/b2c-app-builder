/**
 * Analytics event catalog — the single source of event names for this app.
 *
 * Conventions (analytics-attribution.md): snake_case names, defined here and
 * mirrored into analytics/ANALYTICS.md's event catalog before any surface emits them.
 * Never invent an event name inline in a component; add it here first so the
 * catalog, dashboards, and validators stay reconciled.
 */
export const EVENTS = {
  // Core lifecycle (canonical skill names — keep these stable).
  app_opened: "app_opened",
  signup_started: "signup_started",
  signup_completed: "signup_completed",
  attribution_source_selected: "attribution_source_selected",
  paywall_viewed: "paywall_viewed",
  purchase_started: "purchase_started",
  purchase_completed: "purchase_completed",

  // Media core loop (prompt 03/04 surfaces). The generation reveal is a
  // HIGH-risk Variable Reward mechanic (ethics-guardrail.md) — keep its
  // events honest and pair them with the opt-out counter-metric.
  media_uploaded: "media_uploaded",
  generation_started: "generation_started",
  generation_completed: "generation_completed",
  generation_failed: "generation_failed",
  media_shared: "media_shared",

  // Safety (prompt 08 surface).
  moderation_flagged: "moderation_flagged",
} as const;

export type EventName = (typeof EVENTS)[keyof typeof EVENTS];
