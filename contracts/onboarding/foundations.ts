import { z } from "zod";

// These are authored contracts inside the existing ONB packets, not a second planner.
const text = z
  .string()
  .trim()
  .min(1)
  .max(4096)
  .refine((v) => !/^(?:TODO|TBD|placeholder|not_started|n\/a|none)$/i.test(v), "Unresolved value");
export const artifactSchema = z.strictObject({ path: text, sha256: z.string().regex(/^[a-f0-9]{64}$/) });
export const decisionTopics = ["first_value", "identity", "measurement", "attribution", "consent", "visual_design"] as const;
export const researchInputPaths = [
  "product/onboarding/graph/ONB-03-current-guidance.md",
  "product/onboarding/graph/ONB-04-competitor-reviews.md",
  "product/onboarding/graph/ONB-05-onbo-hub-atlas.md",
  "product/onboarding/graph/ONB-06-internal-guidance-audit.md",
  "product/onboarding/graph/ONB-07-provider-policy-landscape.md",
  "product/onboarding/graph/ONB-08-motion-research.md",
] as const;
export const researchSchema = z.strictObject({
  schemaVersion: z.literal(1),
  inputs: z.array(artifactSchema).length(6),
  knowledge: z.array(z.strictObject({ referenceId: text, path: text, sha256: z.string().regex(/^[a-f0-9]{64}$/), section: text })).min(1),
  observations: z
    .array(
      z.strictObject({
        id: text,
        source: text,
        observedAt: z.iso.datetime({ offset: true }),
        evidence: artifactSchema,
        resolution: z.literal("resolved"),
        finding: text,
        limitation: text,
      }),
    )
    .min(1),
  decisions: z
    .array(
      z.strictObject({
        id: text,
        topic: z.enum(decisionTopics),
        knowledgeIds: z.array(text).min(1),
        observationIds: z.array(text).min(1),
        decision: text,
        appliesTo: text,
        verification: text,
      }),
    )
    .min(6),
});
export const identityScenarios = [
  "first_open",
  "sign_in",
  "auth_cancel",
  "auth_failure",
  "session_restore",
  "session_expired",
  "logout",
  "account_switch",
  "reinstall",
  "account_deletion",
  "purchase_restore",
] as const;
export const identitySchema = z.strictObject({
  schemaVersion: z.literal(1),
  research: artifactSchema,
  authMode: z.enum(["guest_first", "account_required", "no_account"]),
  authReason: text,
  authOwner: text,
  subjectOwner: text,
  analyticsOwner: text,
  entitlementOwner: text,
  verifiedSessionRule: text,
  credentialStorage: text,
  identityMergeRule: text,
  dataIsolationRule: text,
  transitions: z
    .array(
      z.strictObject({
        scenario: z.enum(identityScenarios),
        applicable: z.boolean(),
        reason: text,
        from: text,
        to: text,
        persistence: text,
        recovery: text,
        verification: text,
      }),
    )
    .min(11),
});
export const eventRoles = [
  "app_opened",
  "onboarding_started",
  "step_viewed",
  "step_completed",
  "first_value_rendered",
  "first_value_engaged",
  "onboarding_completed",
  "auth_started",
  "auth_succeeded",
  "auth_failed",
  "auth_cancelled",
  "consent_changed",
  "attribution_received",
  "attribution_selected",
] as const;
export const attributionTopics = [
  "first_touch",
  "last_touch",
  "deep_link",
  "deferred_link",
  "self_report",
  "unknown",
  "identity_join",
  "cross_device",
  "consent_denied",
  "logout_reset",
] as const;
export const runtimeScenarios = [
  "fresh_install",
  "returning_user",
  "guest_upgrade",
  "session_expired",
  "auth_cancel",
  "auth_failure",
  "account_switch",
  "consent_denied",
  "unknown_attribution",
  "deep_link",
  "offline_retry",
  "analytics_unavailable",
  "account_deletion",
  "purchase_restore",
] as const;
export const scenarioAssertions: Record<(typeof runtimeScenarios)[number], readonly string[]> = {
  fresh_install: ["initial_events_captured", "first_value_reachable"],
  returning_user: ["journey_resumed", "identity_restored"],
  guest_upgrade: ["session_verified", "guest_value_preserved", "identity_join_permitted", "entitlement_not_invented"],
  session_expired: ["expired_session_rejected", "reauth_recoverable"],
  auth_cancel: ["cancel_is_not_success", "journey_recoverable"],
  auth_failure: ["failure_is_not_success", "retry_recoverable"],
  account_switch: ["no_identity_bleed", "no_entitlement_bleed", "attribution_isolated"],
  consent_denied: ["no_disallowed_collection", "product_usable"],
  unknown_attribution: ["unknown_preserved"],
  deep_link: ["context_retained_through_auth", "unsupported_join_stays_unknown"],
  offline_retry: ["queue_recovers", "collector_deduplicates"],
  analytics_unavailable: ["first_value_not_blocked"],
  account_deletion: ["session_invalidated", "subject_data_erased"],
  purchase_restore: ["provider_entitlement_confirmed", "no_cross_account_transfer"],
};
/** Minimum semantic observations for applicable scenarios. Names remain provider-neutral roles. */
export const scenarioEventRoles: Partial<Record<(typeof runtimeScenarios)[number], readonly (typeof eventRoles)[number][]>> = {
  returning_user: ["app_opened", "first_value_rendered"],
  guest_upgrade: ["auth_started", "auth_succeeded"],
  session_expired: ["app_opened", "auth_started"],
  auth_cancel: ["auth_started", "auth_cancelled"],
  auth_failure: ["auth_started", "auth_failed"],
  account_switch: ["auth_started", "auth_succeeded"],
  consent_denied: ["app_opened", "consent_changed", "first_value_rendered"],
  unknown_attribution: ["app_opened", "attribution_received", "first_value_rendered"],
  deep_link: ["attribution_received", "first_value_rendered"],
  analytics_unavailable: ["app_opened", "first_value_rendered"],
};
export const measurementSchema = z.strictObject({
  schemaVersion: z.literal(1),
  identity: artifactSchema,
  firstValue: artifactSchema,
  blueprint: artifactSchema,
  policy: artifactSchema,
  schemaPath: text,
  initializationPath: text,
  // Initialize local consent/identity state before collection; transport must not block first value.
  initialization: z.array(z.enum(["restore_consent", "restore_identity", "configure_collection", "first_event", "first_value"])).length(5),
  consentRule: text,
  privacyAllowlist: z.array(text).min(1),
  retryPolicy: text,
  events: z
    .array(
      z.strictObject({
        role: z.enum(eventRoles),
        name: z.string().regex(/^[a-z][a-z0-9_]*$/),
        applicable: z.boolean(),
        reason: text,
        emitter: z.enum(["client", "backend", "provider"]),
        trigger: text,
        identity: text,
        consent: text,
        deduplication: text,
        implementationPath: text,
        testPath: text,
      }),
    )
    .min(14),
  attribution: z
    .array(
      z.strictObject({
        topic: z.enum(attributionTopics),
        source: text,
        destination: text,
        persistence: text,
        joinBasis: text,
        unknownBehavior: text,
        verification: text,
      }),
    )
    .min(10),
  experiments: z.strictObject({ applicable: z.boolean(), reason: text, assignmentOwner: text, exposureRule: text, primaryMetric: text, guardrails: text }),
  scenarios: z
    .array(
      z.strictObject({
        id: z.enum(runtimeScenarios),
        applicable: z.boolean(),
        reason: text,
        expectedRoles: z.array(z.enum(eventRoles)),
        assertions: z.array(text).min(1),
        testPath: text,
      }),
    )
    .min(14),
});
export const designSchema = z.strictObject({
  schemaVersion: z.literal(1),
  research: artifactSchema,
  identity: artifactSchema,
  measurement: artifactSchema,
  screenContract: artifactSchema,
  design: artifactSchema,
  decisions: z.array(z.strictObject({ decisionId: text, surface: text, implementedBehavior: text, evidence: artifactSchema })).min(6),
});
export const wiringSchema = z.strictObject({
  schemaVersion: z.literal(1),
  stage: z.enum(["prototype", "runtime"]),
  capturedAt: z.iso.datetime({ offset: true }),
  appId: text,
  buildId: text,
  environment: text,
  measurement: artifactSchema,
  sources: z.array(artifactSchema).min(1),
  runs: z
    .array(
      z.strictObject({
        scenario: z.enum(runtimeScenarios),
        trace: artifactSchema,
        executionEvidence: artifactSchema,
        providerReadback: artifactSchema.optional(),
      }),
    )
    .min(1),
});
export const traceSchema = z.strictObject({
  schemaVersion: z.literal(1),
  scenario: z.enum(runtimeScenarios),
  appId: text,
  buildId: text,
  environment: text,
  kind: z.enum(["instrumented_app", "provider_readback"]),
  // Test subject keys are opaque, synthetic and non-resolvable. No real identity map belongs here.
  subjectKind: z.literal("synthetic"),
  initialization: z.array(z.enum(["restore_consent", "restore_identity", "configure_collection", "first_event", "first_value"])).length(5),
  events: z.array(
    z.strictObject({
      eventId: text,
      name: text,
      role: z.enum(eventRoles),
      emitter: z.enum(["client", "backend", "provider"]),
      subjectKey: text,
      consent: z.enum(["allowed", "denied", "not_required"]),
      destination: z.enum(["local", "provider"]),
      attribution: z.enum(["known", "unknown", "self_reported"]),
      occurredAt: z.iso.datetime({ offset: true }),
    }),
  ),
  assertions: z.array(z.strictObject({ id: text, passed: z.boolean(), observation: text })).min(1),
});

/** Collector observation retains raw export provenance; a local console log is not delivery. */
export const collectorReadbackSchema = z.strictObject({
  schemaVersion: z.literal(1),
  appId: text,
  buildId: text,
  environment: text,
  observedAt: z.iso.datetime({ offset: true }),
  rawEvidence: artifactSchema,
  events: z.array(z.strictObject({ eventId: text, name: text, subjectKey: text })).min(1),
});
