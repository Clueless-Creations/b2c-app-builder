# Research-backed onboarding with identity and measurement

Onboarding is the real route to first value, not a slideshow added after the app.
Research informs its interaction and account decisions. Measurement and attribution
are implemented in the first runnable prototype, not attached at launch.

Keep the existing owners: ONB-09 owns the research synthesis; ONB-12 owns identity;
ONB-13 owns its measurement contract; ONB-18 owns the prototype; ONB-22 owns final
execution proof. `analytics/ANALYTICS.md` remains the business-wide event vocabulary.
`DESIGN.md` owns global design. References between these artifacts carry SHA-256
fingerprints so a changed input invalidates its dependent claim. Do not edit reducer
state or claim a provider result by setting a boolean in a document.

## ONB-09 evidence join

Read the selected onboarding and analytics guidance through the knowledge API.
Use its exact document hash and heading. Do not substitute remembered advice or a
provider's generic instructions for the business's accepted promise.

Join actual user/competitor findings, platform and provider constraints, visual and
interaction references, and internal methods into six explicit decisions:
`first_value`, `identity`, `measurement`, `attribution`, `consent`, `visual_design`.
Explain what each decision changes in this app and how it can fail. A source list
alone is not applied research. Retained source observations must resolve; inaccessible
screens, expired unretained references, and guessed provider behavior do not count.
Keep the collection date, original source, permitted evidence and uncertainty.

Each stage packet keeps its explanatory prose and adds exactly one H2 named
`Foundation contract`, containing exactly one fenced `json` block. Other examples
are not contracts. The schemas live in `contracts/onboarding/foundations.ts`.
The research block has `schemaVersion: 1` and these arrays:

- `inputs`: exactly the six source packets ONB-03 through ONB-08 as `{path, sha256}`.
  Retain the actual findings and explicit source limitations; a changed packet requires
  reviewing its synthesis again.
- `knowledge`: `referenceId`, package-relative `path`, `sha256`, exact `section`.
  Include the selected `reference.experience.onboarding-conversion` and
  `reference.data.analytics-attribution`; retain their original reference identities.
- `observations`: unique `id`, original `source`, RFC3339 `observedAt`, `resolution`
  set to `resolved`, `finding`, `limitation`, and `evidence: {path, sha256}`.
- `decisions`: unique `id`, one of the six `topic` values, nonempty `knowledgeIds`
  and `observationIds`, the actual `decision`, `appliesTo` surface, and `verification`.

Every topic occurs exactly once. Every referenced ID resolves. Evidence paths are
relative to this business; knowledge paths are relative to the selected package.
A matching hash proves the retained bytes, not that the claim is true or the agent
understood them. The independent reviewer must judge those things.

## ONB-12 identity and authentication

Decide whether accounts are unnecessary, optional after first value, or required
for a real product reason. Do not force sign-in merely to make analytics easier.
Authentication, onboarding progress, profile completion, activation, attribution,
consent, experiment assignment and entitlement are separate state machines.

Choose a stable opaque app subject identifier. Record the selected auth provider,
session owner, protected credential storage, and who owns analytics and entitlements.
Identify or merge only after verified authentication, and only where consent permits.
A sign-in click, canceled authorization, or analytics identify call is not verified
sign-in and cannot grant paid access. Do not put raw credentials, email, address,
phone, quiz answers or tokens in analytics events or durable orchestration receipts.

Handle first open, sign-in, cancel/failure, restoration/expiry, logout, account switch,
reinstall, deletion and purchase restore. Preserve permitted anonymous first-touch
context across an authenticated transition, but never merge different users simply
because they share a device. Clear or isolate identity, attribution, queued events,
and entitlement state on logout/account switch. Declare identity merge and restore
semantics for the selected provider and version; do not assume every provider aliases
or transfers purchases in the same way.

The identity Foundation contract has `schemaVersion`, `research: {path, sha256}`,
`authMode` (`guest_first`, `account_required`, `no_account`), `authReason`, `authOwner`,
`subjectOwner`, `analyticsOwner`, `entitlementOwner`, `verifiedSessionRule`,
`credentialStorage`, `identityMergeRule`, `dataIsolationRule`, and `transitions`.
Each transition has `scenario`, `applicable`, `reason`, `from`, `to`, `persistence`,
`recovery`, `verification`. Include exactly one of each:
`first_open`, `sign_in`, `auth_cancel`, `auth_failure`, `session_restore`,
`session_expired`, `logout`, `account_switch`, `reinstall`, `account_deletion`,
`purchase_restore`. Account-only transitions may be inapplicable for `no_account`;
record a product reason rather than inventing account functionality. Restore may be
inapplicable when purchases are genuinely outside accepted scope.

## ONB-13 measurement and attribution

This contract follows ONB-10 first value, ONB-12 identity and ONB-14 consent/policy.
It references their accepted meanings rather than re-deciding them. Global design
lock and the prototype consume these decisions. Analytics transport failure must
not block the product, and a denied consent route must still be usable.

The Foundation contract has `schemaVersion`, `identity`, `firstValue`, `blueprint`, and `policy`
artifact references, `schemaPath`, `initializationPath`, `initialization`,
`consentRule`, `privacyAllowlist`, `retryPolicy`, `events`, `attribution`,
`experiments`, and `scenarios`. Planned source/test paths become required real files
at prototype acceptance. Do not claim schema presence alone proves wiring.

The measurement block's `firstValue: {path, sha256}` refers to
`product/onboarding/graph/ONB-10-first-value-activation.md`. Changing the value or
activation definition requires reviewing measurement and rerunning affected proof.


`initialization` contains each step exactly once: `restore_consent`,
`restore_identity`, `configure_collection`, `first_event`, `first_value`.
Restore *local* consent and identity state before collection configuration. Do not
wait indefinitely on a remote login to show first value; use the declared anonymous
or recovering state. Configure collection before emitting the first permitted event.
Deny or buffer only as permitted by the consent policy. Do not replay disallowed
pre-consent tracking events after a later opt-in.

Every `events` entry has `role`, canonical `name`, `applicable`, `reason`, `emitter`
(`client`, `backend`, `provider`), `trigger`, `identity`, `consent`, `deduplication`,
`implementationPath`, `testPath`. Include each semantic role once:
`app_opened`, `onboarding_started`, `step_viewed`, `step_completed`,
`first_value_rendered`, `first_value_engaged`, `onboarding_completed`,
`auth_started`, `auth_succeeded`, `auth_failed`, `auth_cancelled`, `consent_changed`,
`attribution_received`, `attribution_selected`.
Map roles to the existing event vocabulary; do not silently rename live events.
Auth roles can be inapplicable for an account-free app; the attribution-question
role can be inapplicable with a justified friction/privacy decision.

The app's typed event schema defines version, event_id, event/received time, app and
environment, journey/step/session/correlation, opaque subject, acquisition and consent
fields, property types, deduplication, and authoritative emitter. UI events describe
actual display or actions. Completion, authenticated sessions, purchase confirmation,
entitlement and experiment exposure are not interchangeable success events.

Each `attribution` entry has `topic`, `source`, `destination`, `persistence`,
`joinBasis`, `unknownBehavior`, `verification`. Include `first_touch`, `last_touch`,
`deep_link`, `deferred_link`, `self_report`, `unknown`, `identity_join`,
`cross_device`, `consent_denied`, `logout_reset` exactly once.
Preserve first touch; update last touch intentionally. Keep technical, self-reported
and modeled attribution distinguishable. Retain UTMs/referrers/referral context across
permitted handoffs. Missing or prohibited joins stay unknown. A self-report is not
observed ad attribution. Do not infer cross-device identity or fingerprint around
tracking denial. Consent to first-party product analytics and cross-company tracking
are separate decisions; do not equate ATT with every analytics use.

`experiments` has `applicable`, `reason`, `assignmentOwner`, `exposureRule`,
`primaryMetric`, `guardrails`. Assignment is not exposure. Record actual exposure
once at the selected unit. No experiment is also a valid explicit decision.

Each scenario has `id`, `applicable`, `reason`, ordered `expectedRoles`, `assertions`
(the assertion IDs below), and `testPath`. Include every row, even when justifiably
inapplicable. Required first-session, privacy and failure tests cannot be waived as
"later". Add app-specific assertions without replacing the required ones.

| Scenario | Required assertion IDs |
| --- | --- |
| fresh_install | initial_events_captured, first_value_reachable |
| returning_user | journey_resumed, identity_restored |
| guest_upgrade | session_verified, guest_value_preserved, identity_join_permitted, entitlement_not_invented |
| session_expired | expired_session_rejected, reauth_recoverable |
| auth_cancel | cancel_is_not_success, journey_recoverable |
| auth_failure | failure_is_not_success, retry_recoverable |
| account_switch | no_identity_bleed, no_entitlement_bleed, attribution_isolated |
| consent_denied | no_disallowed_collection, product_usable |
| unknown_attribution | unknown_preserved |
| deep_link | context_retained_through_auth, unsupported_join_stays_unknown |
| offline_retry | queue_recovers, collector_deduplicates |
| analytics_unavailable | first_value_not_blocked |
| account_deletion | session_invalidated, subject_data_erased |
| purchase_restore | provider_entitlement_confirmed, no_cross_account_transfer |

Auth cancel/failure scenarios must observe `auth_started` then the matching outcome.
Guest upgrade and account switch observe `auth_started` and `auth_succeeded` from a
verified session; expiry exercises app open and reauthentication. Returning use and
analytics outage observe app open and first value. Consent denial observes app open,
consent change and first value with denied collection. Unknown attribution observes
app open, attribution resolution and first value; deep-link tests observe attribution
resolution and first value. Event names are mapped to these roles, never guessed.
Account-free apps mark account scenarios inapplicable with their product rationale.

Fresh install exercises app open, onboarding start, step display/action, first value
rendered and engaged, and completion. Account scenarios follow the auth decision;
no-account is not an excuse to omit first-open instrumentation. Product scope decides
whether purchase restore and deep links apply; missing provider access is a blocker,
not a not-applicable result.

## ONB-18 instrumented design prototype

Design the actual journey against the screen/control contract, identity transitions,
consent routes, event triggers and source-backed decisions. Show empty, loading,
permission denial, cancellation, errors, resumed use and reduced-motion behavior
where applicable. Do not copy another app's branding or invent findings.

The Foundation contract has `schemaVersion`, `research`, `identity`, `measurement`,
`screenContract`, `design` artifact references and `decisions`. Each decision maps
`decisionId` from ONB-09 to `surface`, `implementedBehavior`, and a real rendered
`evidence: {path, sha256}`. Cover every research decision, not just visual styling.

Produce `product/onboarding/prototype-evidence.json` by running the instrumented
prototype. Cover fresh install, consent denial, unknown attribution and analytics
outage before accepting it. ONB-19 carries these working foundations into production
implementation. ONB-20 independently reviews ONB-17, ONB-18 and ONB-19; its session
must differ from the producers. Findings are not self-approval.

## Wiring evidence and final acceptance

ONB-22 produces `product/onboarding/runtime-evidence.json`, covering *every*
applicable scenario. Existing canonical graph, cutover, provider and design checks
still apply. This file is an output observation attached to the existing engine's
acceptance and evidence owner, not another execution-state store.

Both proof files use `schemaVersion: 1`, `stage` (`prototype` or `runtime`), RFC3339
`capturedAt`, `appId`, `buildId`, `environment`, `measurement: {path, sha256}`,
`sources: [{path, sha256}]`, and `runs`. Source coverage includes the declared schema,
initialization code, every applicable emitter implementation and every scenario test.
Bind the full candidate/build through the existing device/browser proof mechanism;
the source list here specifically checks the referenced instrumentation files.

Each run has `scenario`, `trace`, `executionEvidence`, and optional `providerReadback`
artifact references. Retain real command/device execution output separately from the
normalized trace. Final fresh-install proof also requires collector readback plus an
observed provider-destination event. Existing provider proof gates establish selected
connection readiness. Local fake collectors and tests only prove their tested scope.

A trace has `schemaVersion: 1`, `scenario`, `appId`, `buildId`, `environment`,
`kind` (`instrumented_app` or `provider_readback`), `subjectKind: synthetic`,
`initialization` (the observed ordered steps), `events` and `assertions`.
Each event has `eventId`, `name`, `role`, `emitter`, opaque synthetic `subjectKey`,
`consent` (`allowed`, `denied`, `not_required`), `destination` (`local`, `provider`),
`attribution` (`known`, `unknown`, `self_reported`) and RFC3339 `occurredAt`.
Each assertion has `id`, `passed`, and the actual `observation`. Use minimized,
synthetic test subjects; do not preserve a real user's identity map in receipts.

Check observed order, identity isolation, collector deduplication, consent handling,
unknown attribution and first value despite unavailable telemetry. A canceled/failed
auth attempt must not emit success; account switching must exercise both subjects.
Changed contract or source hashes invalidate old proof. A hash or a typed JSON file
alone does not establish a real execution: retain execution/readback evidence, and
have the independent verifier inspect it against the actual build.


### Collector observation contract

Final `providerReadback` references a JSON object with `schemaVersion: 1`, `appId`,
`buildId`, `environment`, `observedAt`, a separate `rawEvidence: {path, sha256}` provider
export, and `events: [{eventId, name, subjectKey}]`. It must match the sent first-session
events from the tested candidate. The raw export is not the local test log or the
normalized trace. Retain only synthetic subject identifiers and permitted fields.
The independent reviewer inspects that export and execution evidence; these hashes
establish identity and currency of submitted evidence, not its truth by themselves.


## Source guidance

The procedural gate contract above is builder-owned. Verify current selected-provider
semantics during ONB-07; do not carry vendor-specific assumptions into replacements.
PostHog's [identification guidance](https://posthog.com/docs/product-analytics/identify)
describes anonymous-to-identified joins and logout reset. RevenueCat's
[customer identity guide](https://www.revenuecat.com/docs/customers/identifying-customers)
distinguishes alias/restore behavior and entitlement ownership. Apple's
[privacy guidance](https://developer.apple.com/app-store/user-privacy-and-data-use/)
distinguishes cross-company tracking from permitted first-party uses and rejects
tracking around permission denial. These sources were reviewed on 2026-09-06;
that date is provenance, not a claim of future provider compatibility.
