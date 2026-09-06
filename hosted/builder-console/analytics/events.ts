/**
 * BUNDLED INTO THE MCP WORKER. hosted/knowledge-mcp/worker.ts imports this file, so it ships inside an
 * OAuth authorization server that every MCP client depends on. It lives under hosted/builder-console for
 * historical reasons, not because the console owns it.
 *
 * Consequences, both enforced by hosted/builder-console/test/bundle-safety.test.ts rather than left to memory:
 *   - It may import nothing except its sibling. One `import` line here changes the authorization
 *     server's dependency surface — importing flags.ts would ship posthog-node into it silently.
 *   - Editing it is not a console-only change. Run `npm run hosted:check` before merging, and the
 *     Worker needs redeploying for the change to take effect in production.
 */
/**
 * Typed event catalog for the Clueless Creations platform.
 *
 * The contract lives in EVENT_TAXONOMY.md. This file is the executable half of it;
 * test/events.test.ts fails when the two drift.
 */

export const SURFACES = ["marketing", "console", "mcp"] as const;
export type Surface = (typeof SURFACES)[number];

export const AUTH_STATES = ["anonymous", "authenticated"] as const;
export type AuthState = (typeof AUTH_STATES)[number];

export const EVENTS = {
  landingViewed: "landing_viewed",
  signinStarted: "signin_started",
  signinCompleted: "signin_completed",
  signinFailed: "signin_failed",
  accountCreated: "account_created",
  apiKeyCreated: "api_key_created",
  apiKeyRevoked: "api_key_revoked",
  mcpCallSucceeded: "mcp_call_succeeded",
  interestSubmitted: "interest_submitted",
  upgradeIntentClicked: "upgrade_intent_clicked",
} as const;
export type EventName = (typeof EVENTS)[keyof typeof EVENTS];

/** Stable stored keys. Labels may be reworded; these must not change. */
export const SOURCE_KEYS = [
  "friend",
  "x_twitter",
  "reddit_search",
  "hacker_news",
  "youtube",
  "github",
  "ai_search",
  "search",
  "newsletter",
  "podcast",
  "creator",
  "mcp_directory",
  "ad",
  "other",
] as const;
export type SourceKey = (typeof SOURCE_KEYS)[number];

/**
 * Display labels for the stored keys.
 *
 * The key is what is stored and queried; the label is presentation and may be reworded freely.
 * Keeping the map here rather than in a D1 column is deliberate: a stored label can drift out of
 * step with its key, and knowledge/data/analytics-attribution.md is explicit that keys must stay
 * stable while labels may change through aliases. The form renders from this map too.
 */
export const SOURCE_LABELS: Record<SourceKey, string> = {
  friend: "A friend or colleague",
  x_twitter: "X / Twitter",
  reddit_search: "Reddit",
  hacker_news: "Hacker News",
  youtube: "YouTube",
  github: "GitHub",
  ai_search: "ChatGPT / Claude / an AI assistant",
  search: "A search engine",
  newsletter: "A newsletter or email",
  podcast: "A podcast",
  creator: "A creator or influencer",
  mcp_directory: "An MCP directory or registry",
  ad: "An ad",
  other: "Somewhere else",
};

export const INTENTS = ["evaluating", "ready_to_buy", "just_curious", "need_team_plan"] as const;
export type Intent = (typeof INTENTS)[number];

/** Failure reasons are codes, never messages — a message can quote the token that failed. */
export const SIGNIN_FAILURE_REASONS = ["state_mismatch", "expired_code", "token_invalid", "email_unverified", "internal"] as const;
export type SigninFailureReason = (typeof SIGNIN_FAILURE_REASONS)[number];

export type PropertyValue = string | number | boolean | null | undefined;
export type Properties = Record<string, PropertyValue>;

/** What a caller may actually hand us at runtime, types notwithstanding. */
export type UntrustedProperties = Record<string, unknown>;

// ---------------------------------------------------------------------------
// Redaction
// ---------------------------------------------------------------------------

export class RedactionError extends Error {
  constructor(readonly property: string) {
    super(`secret-shaped value in analytics property "${property}"`);
  }
}

/**
 * Structural secret detection.
 *
 * Denylisting property *names* fails the moment someone adds a field, so these match the
 * shape of the credential itself. Every pattern is anchored to a real credential this
 * platform handles — see the redaction table in EVENT_TAXONOMY.md.
 */
const SECRET_SHAPES: readonly { readonly name: string; readonly pattern: RegExp }[] = [
  // The platform's own API key: auth.ts authorizeApiKey() accepts exactly this.
  { name: "b2c_api_key", pattern: /\bb2c_[A-Za-z0-9_-]{43}\b/ },
  // A SHA-256 digest. credentials[].sha256 verifies a key; publishing it invites offline search.
  { name: "sha256_digest", pattern: /\b[a-f0-9]{64}\b/i },
  // PostHog project / personal keys.
  { name: "posthog_key", pattern: /\bph[cxs]_[A-Za-z0-9_-]{20,}\b/ },
  // Stripe secret, restricted, and webhook signing keys. Publishable pk_ is intentionally allowed.
  { name: "stripe_key", pattern: /\b(?:sk|rk|whsec)_(?:live|test)?_?[A-Za-z0-9]{16,}\b/ },
  // Any JWT — a Google id_token is a bearer credential, not an identifier.
  { name: "jwt", pattern: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/ },
  // An Authorization header pasted whole.
  { name: "bearer_header", pattern: /\bBearer\s+\S{16,}/i },
  // The access policy serialised. Its shape is fixed by policySchema in auth.ts.
  { name: "access_policy", pattern: /"(?:allowedSubjects|ownerSubject|credentials)"\s*:/ },
];

/** Return the name of the first secret shape found in a string, or null. */
export function detectSecret(value: string): string | null {
  for (const shape of SECRET_SHAPES) if (shape.pattern.test(value)) return shape.name;
  return null;
}

/** Bounds the recursive walk. Deeper than this is not a legitimate analytics property. */
const MAX_WALK_DEPTH = 6;

/**
 * Find a secret anywhere in a value, including inside objects and arrays.
 *
 * The type system says properties are primitives, but types are a compile-time promise and this
 * guard is the runtime one. A caller spreading an externally-typed object into `properties` would
 * otherwise ship a nested credential with no detection — so the walk does not trust the types.
 * Object keys are checked too: a credential can hide in a key as easily as in a value.
 */
export function containsSecret(value: unknown, depth = 0): string | null {
  if (depth > MAX_WALK_DEPTH) return "max_depth_exceeded";
  if (typeof value === "string") return detectSecret(value);
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = containsSecret(item, depth + 1);
      if (found !== null) return found;
    }
    return null;
  }
  if (value !== null && typeof value === "object") {
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      const found = detectSecret(key) ?? containsSecret(nested, depth + 1);
      if (found !== null) return found;
    }
  }
  return null;
}

/**
 * Reject or drop secret-shaped properties.
 *
 * `throw` is for tests and for the interest-collector path, where a rejected submission is
 * better than a leaked one. `drop` is for the capture hot path: analytics must never fail a
 * user request, so the property is removed and the event still ships.
 */
export function scrubProperties(properties: Properties, mode: "throw" | "drop"): { properties: Properties; dropped: string[] } {
  const clean: Properties = {};
  const dropped: string[] = [];
  for (const [key, value] of Object.entries(properties)) {
    if (value === undefined) continue;
    const found = containsSecret(value);
    // A key named like a credential is dropped even when its value looks benign — an empty
    // or truncated token today becomes a real one after a refactor.
    const suspiciousName = /(?:^|_)(?:api_?key|secret|token|password|authorization|credential|policy|sha256|digest)(?:$|_)/i.test(key);
    if (found !== null || suspiciousName) {
      if (mode === "throw") throw new RedactionError(key);
      dropped.push(key);
      continue;
    }
    clean[key] = value;
  }
  return { properties: clean, dropped };
}

/** `key_id` is an opaque policy identifier, not a credential. Allowed by name, checked by shape. */
export function assertSafeKeyId(keyId: string): string {
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(keyId)) throw new RedactionError("key_id");
  return keyId;
}

/** Domain only. The address itself is a person property, never an event property. */
export function emailDomain(email: string): string | undefined {
  const at = email.lastIndexOf("@");
  if (at < 1 || at === email.length - 1) return undefined;
  return email.slice(at + 1).toLowerCase();
}
