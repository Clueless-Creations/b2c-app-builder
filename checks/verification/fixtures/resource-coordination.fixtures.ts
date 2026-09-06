import assert from "node:assert/strict";
import { acquireSharedClaim, assertSharedClaim, releaseSharedClaim, renewSharedClaim } from "../../../kernel/reducer/shared-claims.js";
import type { Harness } from "./_harness.js";

export function register(harness: Harness): void {
  const at = "2026-09-05T12:00:00.000Z";
  harness.check("shared claims: ten independent workspace resources progress and a shared device serializes", () => {
    const home = harness.makeTempDir("ten-business-claims");
    for (let index = 0; index < 10; index++) {
      const result = acquireSharedClaim({
        home,
        resource: `provider.project.${index}`,
        workspaceId: `business-${index}`,
        occurrenceId: "build",
        ttlSeconds: 60,
        now: at,
      });
      assert(result.ok);
      assertSharedClaim(home, result.claim, at);
    }
    const first = acquireSharedClaim({ home, resource: "device.ios.shared", workspaceId: "business-0", occurrenceId: "capture", ttlSeconds: 60, now: at });
    assert(first.ok);
    for (let index = 1; index < 10; index++) {
      assert.deepEqual(
        acquireSharedClaim({ home, resource: "device.ios.shared", workspaceId: `business-${index}`, occurrenceId: "capture", ttlSeconds: 60, now: at }),
        { ok: false, reason: "held" },
      );
    }
    releaseSharedClaim(home, first.claim, { now: at });
    const next = acquireSharedClaim({ home, resource: "device.ios.shared", workspaceId: "business-1", occurrenceId: "capture", ttlSeconds: 60, now: at });
    assert(next.ok);
    assert.notEqual(next.claim.generation, first.claim.generation);
    assert.throws(() => assertSharedClaim(home, first.claim, at), /ownership_lost/);
    assert.throws(() => releaseSharedClaim(home, first.claim, { now: at }), /ownership_lost/);
    assertSharedClaim(home, next.claim, at);
  });
  harness.check("shared claims: expiry blocks a paused holder and does not grant a successor ownership", () => {
    const home = harness.makeTempDir("expired-claim");
    const first = acquireSharedClaim({ home, resource: "provider.shared", workspaceId: "one", occurrenceId: "write", ttlSeconds: 1, now: at });
    assert(first.ok);
    const later = "2026-09-05T12:00:02.000Z";
    assert.throws(() => assertSharedClaim(home, first.claim, later), /ownership_lost/);
    assert.throws(() => renewSharedClaim(home, first.claim, 60, later), /ownership_lost/);
    assert.throws(() => releaseSharedClaim(home, first.claim, { now: later }), /ownership_lost/);
    assert.deepEqual(acquireSharedClaim({ home, resource: "provider.shared", workspaceId: "two", occurrenceId: "write", ttlSeconds: 60, now: later }), {
      ok: false,
      reason: "reconciliation_required",
    });
  });
  harness.check("shared claims: renewal preserves ownership and cooldown refuses early acquisition", () => {
    const home = harness.makeTempDir("claim-cooldown");
    const first = acquireSharedClaim({ home, resource: "provider.rate-limited", workspaceId: "one", occurrenceId: "query", ttlSeconds: 1, now: at });
    assert(first.ok);
    const renewed = renewSharedClaim(home, first.claim, 60, at);
    assert.equal(renewed.generation, first.claim.generation);
    assertSharedClaim(home, renewed, "2026-09-05T12:00:02.000Z");
    releaseSharedClaim(home, renewed, { now: at, cooldownMs: 5000 });
    assert.deepEqual(acquireSharedClaim({ home, resource: "provider.rate-limited", workspaceId: "two", occurrenceId: "query", ttlSeconds: 60, now: at }), {
      ok: false,
      reason: "rate_limited",
      retryAt: "2026-09-05T12:00:05.000Z",
    });
    assert(
      acquireSharedClaim({
        home,
        resource: "provider.rate-limited",
        workspaceId: "two",
        occurrenceId: "query",
        ttlSeconds: 60,
        now: "2026-09-05T12:00:05.000Z",
      }).ok,
    );
  });
}
