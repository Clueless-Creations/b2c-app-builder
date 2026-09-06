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

  // Habit core loop (prompt 03/04 surfaces).
  habit_created: "habit_created",
  habit_checked_in: "habit_checked_in",
  streak_extended: "streak_extended",
  // Streaks are a HIGH-risk mechanic (ethics-guardrail.md): the recovery path
  // is the user-control escape hatch, and its usage is the counter-metric.
  streak_recovered: "streak_recovered",
  reminder_opened: "reminder_opened",
} as const;

export type EventName = (typeof EVENTS)[keyof typeof EVENTS];
