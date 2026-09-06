import { assert, type Harness } from "../fixtures/_harness.js";
import { SessionPrerequisiteCache, evaluatePrerequisites } from "../../../kernel/autonomy/prerequisites.js";
import { fakeVerifier, makeGrant, verifiedProbe } from "./_fixtures.js";

export function register(harness: Harness): void {
  harness.check("prerequisites: a grant with no declared prerequisites needs no verification", () => {
    const calls: string[] = [];
    const cache = new SessionPrerequisiteCache(fakeVerifier({}, calls), () => "2026-08-05T09:00:00.000Z");
    const grant = makeGrant("domain.trust", "run-with-guardrails", []);
    const result = evaluatePrerequisites(cache, grant);
    assert(result.ok, "expected an empty prerequisite list to pass");
    assert(calls.length === 0, "the verifier should never be invoked when there is nothing to verify");
  });

  harness.check("prerequisites: a verified probe passes evaluatePrerequisites", () => {
    const probe = verifiedProbe("doppler.trust", "doppler_auth");
    const calls: string[] = [];
    const cache = new SessionPrerequisiteCache(
      fakeVerifier({ "doppler.trust": { status: "verified", verifiedAt: "2026-08-05T09:00:00.000Z", detail: "ok" } }, calls),
      () => "2026-08-05T09:00:00.000Z",
    );
    const grant = makeGrant("domain.trust", "run-with-guardrails", [probe]);
    const result = evaluatePrerequisites(cache, grant);
    assert(result.ok, `expected verified probe to pass, got: ${result.reason}`);
  });

  harness.check("prerequisites: an unverifiable/lapsed probe lapses the grant, fail closed", () => {
    const probe = verifiedProbe("doppler.trust", "doppler_auth");
    const cache = new SessionPrerequisiteCache(
      fakeVerifier({ "doppler.trust": { status: "lapsed", detail: "doppler run smoke failed" } }),
      () => "2026-08-05T09:00:00.000Z",
    );
    const grant = makeGrant("domain.trust", "run-with-guardrails", [probe]);
    const result = evaluatePrerequisites(cache, grant);
    assert(!result.ok, "expected a lapsed probe to reject");
    assert(result.reasonCode === "autonomy.prerequisite_lapsed", `expected prerequisite_lapsed, got ${result.reasonCode}`);
    assert(result.lapsedProbeIds.includes("doppler.trust"), "lapsed probe id should be recorded");
  });

  harness.check("prerequisites: a probe with no registered verifier for its kind is treated as lapsed, not silently fine", () => {
    const probe = verifiedProbe("mystery.probe", "budget_funded");
    const cache = new SessionPrerequisiteCache(
      () => ({ status: "unverified", detail: "not registered" }),
      () => "2026-08-05T09:00:00.000Z",
    );
    const grant = makeGrant("domain.money", "full", [probe]);
    const result = evaluatePrerequisites(cache, grant);
    assert(!result.ok, "expected an unrecognized/unregistered probe to fail closed");
  });

  harness.check("prerequisites: one lapsed probe among several lapses the whole grant, naming only the lapsed one(s)", () => {
    const good = verifiedProbe("probe.good", "doppler_auth");
    const bad = verifiedProbe("probe.bad", "doppler_auth");
    const cache = new SessionPrerequisiteCache(
      fakeVerifier({
        "probe.good": { status: "verified", verifiedAt: "2026-08-05T09:00:00.000Z", detail: "ok" },
        "probe.bad": { status: "lapsed", detail: "expired" },
      }),
      () => "2026-08-05T09:00:00.000Z",
    );
    const grant = makeGrant("domain.trust", "full", [good, bad]);
    const result = evaluatePrerequisites(cache, grant);
    assert(!result.ok, "expected the grant to lapse when any prerequisite lapses");
    assert(
      result.lapsedProbeIds.length === 1 && result.lapsedProbeIds[0] === "probe.bad",
      `expected only probe.bad recorded as lapsed, got ${JSON.stringify(result.lapsedProbeIds)}`,
    );
  });

  harness.check("prerequisites: SessionPrerequisiteCache verifies a probe at most once per session (session-scoped TTL cap)", () => {
    const calls: string[] = [];
    const probe = verifiedProbe("doppler.trust", "doppler_auth");
    const cache = new SessionPrerequisiteCache(
      fakeVerifier({ "doppler.trust": { status: "verified", verifiedAt: "2026-08-05T09:00:00.000Z", detail: "ok" } }, calls),
      () => "2026-08-05T09:00:00.000Z",
    );

    assert(!cache.wasChecked("doppler.trust"), "should not be checked before first use");
    cache.ensure(probe);
    cache.ensure(probe);
    cache.ensure(probe);
    assert(calls.length === 1, `expected exactly one verifier invocation across three ensure() calls, got ${calls.length}`);
    assert(cache.wasChecked("doppler.trust"), "should be marked checked after first use");
  });

  harness.check("prerequisites: a fresh session (new cache instance) re-verifies from scratch", () => {
    const probe = verifiedProbe("doppler.trust", "doppler_auth");
    const callsA: string[] = [];
    const callsB: string[] = [];
    const verified = { status: "verified" as const, verifiedAt: "2026-08-05T09:00:00.000Z", detail: "ok" };
    new SessionPrerequisiteCache(fakeVerifier({ "doppler.trust": verified }, callsA), () => "2026-08-05T09:00:00.000Z").ensure(probe);
    new SessionPrerequisiteCache(fakeVerifier({ "doppler.trust": verified }, callsB), () => "2026-08-05T09:00:00.000Z").ensure(probe);
    assert(callsA.length === 1 && callsB.length === 1, "each fresh session's cache should independently verify once");
  });
}
