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

  // Social core loop (prompt 03/04 surfaces).
  feed_viewed: "feed_viewed",
  post_created: "post_created",
  post_liked: "post_liked",
  follow_created: "follow_created",
  notification_opened: "notification_opened",

  // Growth (prompt 08 invite system).
  invite_sent: "invite_sent",
  invite_accepted: "invite_accepted",
} as const;

export type EventName = (typeof EVENTS)[keyof typeof EVENTS];
