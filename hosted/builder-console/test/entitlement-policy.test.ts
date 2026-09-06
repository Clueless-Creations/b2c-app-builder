/**
 * Pure unit tests for `billing/entitlement-policy.ts`. No D1, no Stripe, no ambient clock — every
 * case supplies its own `now`, matching the module's own "no ambient state" design.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { PAST_DUE_GRACE_MS, resolveEntitlement } from "../billing/entitlement-policy.js";
import { SUBSCRIPTION_STATUSES, type SubscriptionStatus } from "../../knowledge-mcp/db/tenant.js";

const NOW = new Date("2026-06-15T00:00:00.000Z");

test("PAST_DUE_GRACE_MS is exactly seven days", () => {
  assert.equal(PAST_DUE_GRACE_MS, 7 * 24 * 60 * 60 * 1000);
});

test("active and trialing are entitled with no dunning stamp, even if one was already on record", () => {
  for (const status of ["active", "trialing"] as const) {
    const fresh = resolveEntitlement({ status, pastDueSince: null, now: NOW });
    assert.equal(fresh.active, true);
    assert.equal(fresh.pastDueSince, null);

    // A recovery: this status arriving while a stamp from a prior dunning episode is still on
    // record must clear it, not carry it forward.
    const recovering = resolveEntitlement({ status, pastDueSince: new Date(NOW.getTime() - 1000).toISOString(), now: NOW });
    assert.equal(recovering.active, true);
    assert.equal(recovering.pastDueSince, null);
  }
});

test("every terminal status is never entitled and never carries a stamp, regardless of one already on record", () => {
  const terminal: readonly SubscriptionStatus[] = ["unpaid", "canceled", "incomplete", "incomplete_expired", "paused"];
  for (const status of terminal) {
    const fresh = resolveEntitlement({ status, pastDueSince: null, now: NOW });
    assert.equal(fresh.active, false, `${status} must not be entitled`);
    assert.equal(fresh.pastDueSince, null);

    const withStalePastDueStamp = resolveEntitlement({ status, pastDueSince: new Date(NOW.getTime() - 1000).toISOString(), now: NOW });
    assert.equal(withStalePastDueStamp.active, false, `${status} must not be entitled even with a leftover past_due stamp`);
    assert.equal(withStalePastDueStamp.pastDueSince, null, `${status} must clear a leftover past_due stamp`);
  }
});

test("every SubscriptionStatus value is covered by exactly one of the two cases above", () => {
  const entitledWithoutGrace = new Set(["active", "trialing"]);
  const terminal = new Set(["unpaid", "canceled", "incomplete", "incomplete_expired", "paused"]);
  const graceGoverned = new Set(["past_due"]);
  for (const status of SUBSCRIPTION_STATUSES) {
    const inExactlyOneSet = [entitledWithoutGrace.has(status), terminal.has(status), graceGoverned.has(status)].filter(Boolean).length;
    assert.equal(inExactlyOneSet, 1, `${status} must be covered by exactly one category, or this test and the module have drifted`);
  }
});

test("past_due with no prior stamp is entitled and stamps now — the first observed moment of dunning", () => {
  const resolved = resolveEntitlement({ status: "past_due", pastDueSince: null, now: NOW });
  assert.equal(resolved.active, true);
  assert.equal(resolved.pastDueSince, NOW.toISOString());
});

test("past_due preserves an existing stamp rather than moving it — a second observation is not a new episode", () => {
  const firstObserved = new Date(NOW.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString(); // 3 days before `now`
  const resolved = resolveEntitlement({ status: "past_due", pastDueSince: firstObserved, now: NOW });
  assert.equal(resolved.active, true, "still inside the 7-day window");
  assert.equal(resolved.pastDueSince, firstObserved, "the stamp must not move");
});

test("the grace window boundary: exactly PAST_DUE_GRACE_MS old is still entitled, one millisecond older is not", () => {
  const exactlyAtBoundary = new Date(NOW.getTime() - PAST_DUE_GRACE_MS).toISOString();
  const atBoundary = resolveEntitlement({ status: "past_due", pastDueSince: exactlyAtBoundary, now: NOW });
  assert.equal(atBoundary.active, true, "exactly seven days old must still be inside the window it was promised");
  assert.equal(atBoundary.pastDueSince, exactlyAtBoundary);

  const oneMsPastBoundary = new Date(NOW.getTime() - PAST_DUE_GRACE_MS - 1).toISOString();
  const pastBoundary = resolveEntitlement({ status: "past_due", pastDueSince: oneMsPastBoundary, now: NOW });
  assert.equal(pastBoundary.active, false, "one millisecond past seven days must be expired");
  assert.equal(
    pastBoundary.pastDueSince,
    oneMsPastBoundary,
    "the stamp itself is reported back even once expired — a caller decides what to do with an expired episode",
  );
});

test("past_due well past the window is not entitled", () => {
  const eightDaysAgo = new Date(NOW.getTime() - 8 * 24 * 60 * 60 * 1000).toISOString();
  const resolved = resolveEntitlement({ status: "past_due", pastDueSince: eightDaysAgo, now: NOW });
  assert.equal(resolved.active, false);
  assert.equal(resolved.pastDueSince, eightDaysAgo);
});
