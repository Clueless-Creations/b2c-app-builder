/**
 * posthog-node client for the app Worker.
 *
 * The app Worker takes the SDK (the MCP Worker does not — see capture.ts) because flag
 * evaluation, cohort matching, and the cache-provider contract are not worth reimplementing.
 */

import { PostHog } from "posthog-node";
import { KvFlagCacheReader, KvFlagCacheWriter } from "./flags.js";

export interface PostHogEnv {
  /** Public project token. Shipped to the browser; still never an event property. */
  readonly POSTHOG_PROJECT_TOKEN: string;
  /** `https://us.i.posthog.com`. Server-side capture goes direct — no blocker to dodge. */
  readonly POSTHOG_HOST: string;
  /** Feature-flags secure key. Secret. Read only by the scheduled refresher. */
  readonly POSTHOG_FEATURE_FLAGS_SECURE_KEY?: string;
}

interface KvLike {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
}

/** `flushAt`/`flushInterval` are not tuning. Workers terminate before a batch flushes. */
const EDGE_FLUSH = { flushAt: 1, flushInterval: 0 } as const;

/**
 * A deliberately fake `personalApiKey` for `createRequestClient` below. Not a secret, and never
 * used as one — read the whole comment before assuming this is a leftover credential to replace.
 *
 * `posthog-node@5.51.6`'s `PostHogBackendClient` constructor only builds its internal
 * `FeatureFlagsPoller` — the object that actually reads `flagDefinitionCacheProvider` at all —
 * inside `if (personalApiKey) { ... }`; `flagDefinitionCacheProvider` on its own does not create
 * one. Passing no key here does not mean "fall back to a remote call": it means the poller is
 * never constructed, so `isFeatureEnabled` always resolves `undefined` and this Worker's
 * checkout gate could never open no matter what the flag says in PostHog. (Verified directly
 * against the installed SDK — `dist/client.js`'s `PostHogBackendClient` constructor and
 * `dist/extensions/feature-flags/feature-flags.js`'s `FeatureFlagsPoller` — and against a real
 * `PostHog` instance built exactly as `createRequestClient` builds one; only adding this key
 * changed the outcome from `undefined` to a real evaluation.)
 *
 * This string only needs to be non-empty and must not contain `phc_` (the constructor's own
 * shape guard against a project token pasted into the wrong slot); it is never sent anywhere.
 * The request-path cache (`KvFlagCacheReader`) hard-codes `shouldFetchFlagDefinitions()` to
 * `false` (that class's own doc comment), and `FeatureFlagsPoller`'s load path
 * (`feature-flags.js`'s `_loadFeatureFlags`) checks that before ever building the
 * `Authorization: Bearer <personalApiKey>` header a real fetch would use — it reads the
 * KV-backed cache and returns without constructing a request at all. So this placeholder
 * authenticates nothing, ever, on the request path; it exists solely to satisfy a constructor
 * precondition the installed SDK does not document as separable from `flagDefinitionCacheProvider`.
 */
const REQUEST_PATH_PERSONAL_API_KEY_PLACEHOLDER = "not-a-secret-local-evaluation-only-see-createRequestClient-doc-comment";

/**
 * Request-path client: evaluates flags from KV, never fetches definitions, never blocks.
 *
 * `strictLocalEvaluation` closes the hole the split read/write pattern would otherwise leave —
 * without it, a flag missing from the cached definitions triggers a silent remote call from a
 * request handler, which is the exact latency this design removes.
 *
 * `personalApiKey` is `REQUEST_PATH_PERSONAL_API_KEY_PLACEHOLDER`, not a real credential — see
 * that constant's own doc comment for why this client needs one at all.
 */
export function createRequestClient(env: PostHogEnv, kv: KvLike, ctx: { waitUntil(promise: Promise<unknown>): void }): PostHog {
  return new PostHog(env.POSTHOG_PROJECT_TOKEN, {
    host: env.POSTHOG_HOST,
    ...EDGE_FLUSH,
    strictLocalEvaluation: true,
    flagDefinitionCacheProvider: new KvFlagCacheReader(kv),
    personalApiKey: REQUEST_PATH_PERSONAL_API_KEY_PLACEHOLDER,
    waitUntil: (promise) => ctx.waitUntil(promise),
  });
}

/**
 * Scheduled-path client: the only thing allowed to fetch definitions and write them to KV.
 * Requires the secure key, which must never reach a request handler or the browser.
 */
export function createRefreshClient(env: PostHogEnv, kv: KvLike): PostHog {
  if (!env.POSTHOG_FEATURE_FLAGS_SECURE_KEY) throw new Error("POSTHOG_FEATURE_FLAGS_SECURE_KEY is required to refresh flag definitions");
  return new PostHog(env.POSTHOG_PROJECT_TOKEN, {
    host: env.POSTHOG_HOST,
    ...EDGE_FLUSH,
    personalApiKey: env.POSTHOG_FEATURE_FLAGS_SECURE_KEY,
    flagDefinitionCacheProvider: new KvFlagCacheWriter(kv),
  });
}

/** Called from the Worker's scheduled handler. Fails loudly there — a silent stale cache is worse. */
export async function refreshFlagDefinitions(env: PostHogEnv, kv: KvLike): Promise<void> {
  const client = createRefreshClient(env, kv);
  try {
    await client.reloadFeatureFlags();
  } finally {
    await client.shutdown();
  }
}
