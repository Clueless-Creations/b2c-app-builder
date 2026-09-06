# PostHog agent tooling in a consumer business

Use this only for a selected PostHog integration or audit. This guide adapts the
MIT wizard README and uses official product documentation for identity and privacy.
It does not bundle context-mill skill text or install an upstream agent.

## Contents

- Prepare the integration contract
- Decide whether to use the wizard
- Reuse selected upstream procedures
- Implement first-session measurement
- Verify delivery and isolation

## Prepare the integration contract

Before implementing screens, resolve the app, environment, PostHog project/region,
authentication model and consent policy. Use `analytics/ANALYTICS.md`, the accepted
onboarding contracts and `operations/metric-contracts.json` as the existing owners.
An upstream wizard can propose events; it cannot replace that event dictionary,
change the meaning of activation, or make itself the owner of authentication.

Separate SDK setup, instrumentation, analytics reads, replay, feature flags,
experiments, warehouse connections and source-map uploads. Supporting one does not
authorize all the others. Keep server credentials out of client bundles and logs.

## Decide whether to use the wizard

PostHog's wizard describes source-file processing through its LLM gateway and
Anthropic, default telemetry, organization AI opt-in and a secret scanner. Treat
these as declared behaviors to verify, not a guarantee that disclosure cannot occur.

Before an authorized run, preview the exact app root, files available to the agent,
remote recipients, project/region, dependency edits and generated configuration.
Review the source-upload permission separately from telemetry. `--no-telemetry`
does not disable source upload required by the AI integration flow. Do not run the
wizard in the builder repository when the intended target is a consumer app.

Prefer integration using our existing worker and reviewed platform guidance when
external AI processing is not authorized. Do not disable a scanner or bypass an
organization's AI opt-in to finish setup. Running a command called an audit may
still execute an agent, disclose source, or offer writes; its name is not a grant.

## Reuse selected upstream procedures

The reviewed wizard describes integration, `audit events`, `audit identify`,
`audit feature-flags`, and `audit session-replay` as focused jobs. Choose only the
job in scope and preserve builder review and evidence gates. Runtime command menus
may be fetched from context-mill, independently of the installed wizard version.
Pin or record the selected bundle and verify its compatibility before use.

Context-mill is tracked separately because its inspected revision has no root
license. Its skill files, examples and generated bundles are not redistributed or
adapted here. Recheck rights and dependencies for a selected bundle before adoption;
the wizard's MIT license does not license that other repository. Its examples are
not production authentication or ready-made consumer businesses.

Do not auto-enable self-driving jobs, replay, warehouse ingestion, source-map upload
or Stripe revenue integration merely because the wizard offers them. A revenue
analytics example for Stripe is not proof of a RevenueCat integration. Billing and
analytics identities must use the explicitly agreed mapping, not guessed joins.

## Implement first-session measurement

Apply [onboarding foundations](../experience/onboarding-foundations.md) from the
first prototype. Restore the app's privacy and identity state before collection.
Identify using the verified opaque app user ID under the approved policy. Reset
analytics identity on logout as the selected SDK requires and test account switching.
Backend event identity must agree with the authenticated subject; a client-provided
analytics ID is not a backend authentication credential.

Keep first open, first value, onboarding completion and paid conversion distinct.
Use the declared event/property allowlist, deduplication and emitters. Never send
tokens, passwords, unrestricted form content, or unreviewed personal attributes.
Do not infer a successful purchase from a paywall close event.

Retain first-touch/last-touch attribution only within its declared persistence and
consent rules. Test direct and deferred links and anonymous-to-identified joins.
Missing campaign data stays unknown. Consent denial does not justify fingerprinting
or reconstructing an identity. SDK opt-out, cookieless collection, replay and
server-side events have separate behaviors: verify the chosen mode against the
accepted policy rather than assuming one client flag blocks every data route.

Official behavior references:
https://posthog.com/docs/product-analytics/identify
https://posthog.com/docs/privacy/data-collection

## Verify delivery and isolation

Run the synthetic first-session, consent denial/revocation, auth failure/cancel,
logout/account switch, retry/offline and collector-outage scenarios from the
onboarding contract. Verify actual collector readback for allowed events, and
absence from the relevant client and server routes when the policy requires it.

Test duplicate SDK initialization and events, stale source maps, incorrect project
or region, replay masking and sensitive properties. Keep first value usable during
analytics outages. An SDK dependency, dashboard screenshot, local print statement
or wizard success message alone does not prove event delivery or identity isolation.

The builder retains product decisions and independent acceptance. Provider source
updates remain reviewed contributions, not permission to repin an existing business.
