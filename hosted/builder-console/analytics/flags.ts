/**
 * Feature flag resolution for self-serve Checkout's rollout.
 *
 * One flag, `self-serve-checkout`. False reveals the interest collector; true reveals Stripe
 * Checkout. M9 is built (`console/checkout.ts`, `billing/checkout.ts`) but this flag is at 0%
 * until the founder re-scopes the restricted key (`hosted/builder-console/README.md`'s Stripe go-live
 * checklist, step 3) and raises the rollout, so the collector is what ships until then.
 *
 * Why local evaluation with a KV cache rather than a remote /flags call: the console is
 * server-rendered, so a remote evaluation would add a PostHog round trip to every page render.
 * PostHog's own guidance is that edge workers should use an external cache provider with a split
 * read/write pattern — the request path only reads KV, and a scheduled job does the fetching.
 */

// These types moved to the package root; `posthog-node/experimental` still re-exports them but
// is marked deprecated in the installed SDK, so the docs example is one version behind.
import type { FlagDefinitionCacheData, FlagDefinitionCacheProvider } from "posthog-node";

export const CHECKOUT_FLAG_KEY = "self-serve-checkout";

const CACHE_KEY = "posthog:flags:platform";

/** What we persist: the SDK's payload plus when we got it, so staleness is knowable. */
interface StampedDefinitions {
  readonly fetchedAt: number;
  readonly data: FlagDefinitionCacheData;
}

interface KvLike {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
}

function parse(raw: string | null): StampedDefinitions | undefined {
  if (raw === null) return undefined;
  try {
    const parsed = JSON.parse(raw) as Partial<StampedDefinitions>;
    if (typeof parsed.fetchedAt !== "number" || !parsed.data || !Array.isArray(parsed.data.flags)) return undefined;
    return parsed as StampedDefinitions;
  } catch {
    return undefined;
  }
}

/**
 * Request-path cache. Reads only.
 *
 * `shouldFetchFlagDefinitions()` returns false unconditionally: if a request handler were allowed
 * to fetch, every cold isolate would call PostHog and the latency this design exists to avoid
 * would come straight back.
 */
export class KvFlagCacheReader implements FlagDefinitionCacheProvider {
  constructor(private readonly kv: KvLike) {}

  async getFlagDefinitions(): Promise<FlagDefinitionCacheData | undefined> {
    return parse(await this.kv.get(CACHE_KEY).catch(() => null))?.data;
  }

  shouldFetchFlagDefinitions(): boolean {
    return false;
  }

  onFlagDefinitionsReceived(): void {
    // Read-only by design. A request handler must never write flag definitions.
  }

  shutdown(): void {}
}

/** Scheduled-path cache. Always fetches, and stamps what it stores. */
export class KvFlagCacheWriter implements FlagDefinitionCacheProvider {
  constructor(
    private readonly kv: KvLike,
    private readonly now: () => number = Date.now,
  ) {}

  async getFlagDefinitions(): Promise<FlagDefinitionCacheData | undefined> {
    return parse(await this.kv.get(CACHE_KEY).catch(() => null))?.data;
  }

  shouldFetchFlagDefinitions(): boolean {
    return true;
  }

  async onFlagDefinitionsReceived(data: FlagDefinitionCacheData): Promise<void> {
    // No KV expiry: an expired key would mean *no* definitions, which is worse than stale ones.
    // Age is carried in the value so the reader decides what to do about it.
    await this.kv.put(CACHE_KEY, JSON.stringify({ fetchedAt: this.now(), data } satisfies StampedDefinitions));
  }

  shutdown(): void {}
}

/** Read the age of the cached definitions without evaluating anything. */
export async function definitionsAgeMs(kv: KvLike, now = Date.now()): Promise<number | undefined> {
  const stamped = parse(await kv.get(CACHE_KEY).catch(() => null));
  return stamped === undefined ? undefined : Math.max(0, now - stamped.fetchedAt);
}

// ---------------------------------------------------------------------------
// The gate
// ---------------------------------------------------------------------------

export type GateReason = "flag_enabled" | "flag_disabled" | "definitions_stale" | "definitions_missing" | "evaluation_error" | "operator_enabled";

export interface CheckoutGate {
  /** True only when Checkout should render. Everything else shows the interest collector. */
  readonly checkoutAvailable: boolean;
  /** Captured on `upgrade_intent_clicked` so a funnel can tell a gate decision from a bug. */
  readonly reason: GateReason;
}

/**
 * How long cached flag definitions may be served after their last successful refresh.
 *
 * The refresh cron runs every 5 minutes, so anything under that guarantees false staleness.
 * This value is the availability-versus-correctness dial: raise it and a PostHog outage keeps
 * the console rendering the last known state for longer; lower it and the gate reverts to the
 * safe default sooner after the refresher stops.
 */
export const MAX_DEFINITION_AGE_MS = 60 * 60 * 1000;

/**
 * Resolve the Checkout gate.
 *
 * Fail-closed is deliberate and asymmetric: showing the interest collector to someone who could
 * have paid costs one conversion, while revealing Checkout before its restricted key is correctly
 * scoped costs a real payment attempt against a key that answers every Stripe call with
 * `permission_error` (`hosted/builder-console/README.md`'s Stripe go-live checklist, step 3). Every
 * non-affirmative outcome — missing definitions, stale definitions, a thrown evaluation, an
 * undefined flag — resolves to `checkoutAvailable: false`.
 *
 * `undefined` from `isEnabled` means "not evaluated", not "false"; both land in the same place
 * here, but the reason code keeps them distinguishable in analytics.
 */
export async function resolveCheckoutGate(
  evaluate: () => Promise<{ isEnabled(key: string): boolean | undefined }>,
  kv: KvLike,
  now = Date.now(),
  operatorSwitch?: string,
): Promise<CheckoutGate> {
  // The operator switch (`CHECKOUT_ENABLED` in wrangler.jsonc) opens Checkout without consulting
  // the flag cache at all. It exists because the cache is filled from PostHog with a per-project
  // "feature flags secure API key" that only the PostHog UI can mint; a launch must not hinge on
  // a credential nobody can automate. Only the exact string "on" counts, and any other value —
  // absent, "true", "1" — falls through to the fail-closed flag path below.
  if (operatorSwitch === "on") return { checkoutAvailable: true, reason: "operator_enabled" };
  const age = await definitionsAgeMs(kv, now);
  if (age === undefined) return { checkoutAvailable: false, reason: "definitions_missing" };
  if (age > MAX_DEFINITION_AGE_MS) return { checkoutAvailable: false, reason: "definitions_stale" };
  try {
    const flags = await evaluate();
    return flags.isEnabled(CHECKOUT_FLAG_KEY) === true
      ? { checkoutAvailable: true, reason: "flag_enabled" }
      : { checkoutAvailable: false, reason: "flag_disabled" };
  } catch {
    return { checkoutAvailable: false, reason: "evaluation_error" };
  }
}
