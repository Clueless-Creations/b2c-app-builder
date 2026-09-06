import type { Grant, PrerequisiteProbe, PrerequisiteStatus } from "../schema/types.js";

/**
 * Pluggable prerequisite probe surface (R7, KTD5). Real probes (Doppler, live budget funding)
 * shell out or hit disk; boundary tests inject fakes here and must never invoke a real `doppler`
 * binary — the probe's *kind* is the only thing this module hard-codes, never the mechanism.
 */
export interface PrerequisiteVerification {
  readonly status: PrerequisiteStatus;
  readonly verifiedAt?: string;
  readonly detail: string;
}

export type PrerequisiteVerifier = (probe: PrerequisiteProbe, now: string) => PrerequisiteVerification;

/**
 * Dispatches to a per-kind verifier; a kind with no registered verifier is unverifiable and thus
 * lapsed (fail closed), never silently "unverified-but-fine".
 */
export function createCompositeVerifier(byKind: Partial<Record<PrerequisiteProbe["kind"], PrerequisiteVerifier>>): PrerequisiteVerifier {
  return (probe, now) => {
    const verifier = byKind[probe.kind];
    if (!verifier) return { status: "lapsed", detail: `No verifier registered for prerequisite kind "${probe.kind}"; failing closed.` };
    return verifier(probe, now);
  };
}

/**
 * Session-scoped TTL cache (R7): a prerequisite is verified at minimum once, and at most once,
 * per session — lazily, on first use of the granted class it backs. A second `ensure()` call for
 * the same probe id within the same cache instance returns the cached result without invoking
 * the verifier again, however long the session runs; a fresh session gets a fresh cache and thus
 * a fresh verification. This is what "re-verify at most once per session before first use"
 * means in code: the cache, not the probe's own ttlSeconds, is the enforcement mechanism.
 */
export class SessionPrerequisiteCache {
  private readonly results = new Map<string, PrerequisiteVerification>();

  constructor(
    private readonly verifier: PrerequisiteVerifier,
    private readonly now: () => string,
  ) {}

  ensure(probe: PrerequisiteProbe): PrerequisiteVerification {
    const cached = this.results.get(probe.id);
    if (cached) return cached;
    const result = this.verifier(probe, this.now());
    this.results.set(probe.id, result);
    return result;
  }

  /** Test/introspection hook: has this probe id already been checked this session? */
  wasChecked(probeId: string): boolean {
    return this.results.has(probeId);
  }
}

export interface PrerequisiteEvaluation {
  readonly ok: boolean;
  readonly reasonCode: string;
  readonly reason: string;
  readonly lapsedProbeIds: readonly string[];
}

/**
 * A grant with zero declared prerequisites has nothing to verify (e.g. domain.words drafting).
 * Any declared prerequisite that resolves to anything other than "verified" lapses the whole
 * grant for this evaluation — R7's "unverifiable prerequisite = lapsed grant = dependent nodes
 * park, fail closed" — the caller (evaluator.ts) is what makes this apply to every node sharing
 * the grant, by sharing one cache across the whole frontier pass.
 */
export function evaluatePrerequisites(cache: SessionPrerequisiteCache, grant: Grant): PrerequisiteEvaluation {
  if (grant.prerequisites.length === 0) return { ok: true, reasonCode: "autonomy.no_prerequisites", reason: "", lapsedProbeIds: [] };

  const lapsed: string[] = [];
  for (const probe of grant.prerequisites) {
    const result = cache.ensure(probe);
    if (result.status !== "verified") lapsed.push(probe.id);
  }
  if (lapsed.length > 0) {
    return {
      ok: false,
      reasonCode: "autonomy.prerequisite_lapsed",
      reason: `Prerequisite(s) [${lapsed.join(", ")}] unverifiable or lapsed for domain "${grant.domainId}"; treating the grant as lapsed (fail closed).`,
      lapsedProbeIds: lapsed,
    };
  }
  return { ok: true, reasonCode: "autonomy.prerequisites_verified", reason: "", lapsedProbeIds: [] };
}

// The concrete doppler_auth probe (createDopplerAuthVerifier) and the budget_funded probe
// (createBudgetFundedVerifier) live in ./probes/doppler.js and ./probes/budget.js (U9) — this
// module stays the generic evaluation machinery (cache, TTL-once-per-session, composite dispatch)
// that every probe kind shares, never a specific probe's own mechanism.
