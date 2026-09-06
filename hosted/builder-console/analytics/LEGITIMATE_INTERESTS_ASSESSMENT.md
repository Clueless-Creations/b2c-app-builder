# Legitimate Interests Assessment — Analytics

Status: draft, not yet finalized. **Not reviewed by a lawyer.** The published privacy and terms
pages carry the same caveat in their own words — "They have not been reviewed by a lawyer"
(`hosted/knowledge-mcp/README.md`) — and this document inherits it rather than overstating its own
authority. Agents agreeing with each other is not legal review.

No fact below is TBD any longer. One account-owner action is still open and recorded in the facts
table: executing PostHog's Data Processing Agreement. Analytics capture must not be switched on for
a surface this document covers until the retention prune described in the facts table is scheduled
and any page language that depends on these facts is checked against the real values. See "Trigger
condition" at the end.

This document is the lawful-basis analysis for [`EVENT_TAXONOMY.md`](EVENT_TAXONOMY.md), which
remains the contract for what each event is called and what it carries. Where the two disagree,
assume this document is stale and re-derive it from the taxonomy and the cited code, not the
other way around.

## 1. Scope

In scope: the `mcp_call_succeeded` event on the MCP surface, and the console event list —
`landing_viewed`, `signin_started`, `signin_completed`, `signin_failed`, `account_created`,
`api_key_created`, `api_key_revoked`, `upgrade_intent_clicked` (the full `EVENTS` catalog in
`events.ts` minus one exclusion below). Each has a documented property table in
`EVENT_TAXONOMY.md`'s event catalog.

**Excluded: `interest_submitted`.** A visitor who submits that form takes a deliberate, one-time
action to ask to be contacted, which is a different kind of processing from passively recording
that someone used a product. Folding it into this assessment would understate how different the
two are. It needs its own basis analysis; this document does not attempt one and does not assume
what that analysis would conclude.

## 2. Purpose of processing

Measuring signup and activation — whether people who land on the marketing site go on to sign in,
create an account, mint a key, and successfully use the MCP service — so the product can tell
whether onboarding works and where it does not. `hosted/builder-console/README.md`'s "Capture is switched OFF in
production" section and `EVENT_TAXONOMY.md`'s privacy section both describe this as the intended
purpose once the published page allows it. `capture.ts`'s comment on `isAnalyticsSuppressed()`
states the premise this whole document tests: "A disclosed legitimate-interests basis is only
defensible if objecting actually does something."

This is not marketing profiling, ad targeting, or a decision with legal or similarly significant
effect on any individual. No event property or person property carries content the person wrote,
searched for, or asked the product to do — see the redaction table earlier in `EVENT_TAXONOMY.md`.

## 3. Necessity test

The processing is narrower than what "measure activation" could mean:

- `mcp_call_succeeded` is deduped to one event per subject per UTC day
  (`hosted/analytics.ts`'s `recordMcpActivation`, via `capture.ts`'s `firstSeenToday`) —
  specifically so "cost tracks users rather than API traffic," not so every call is logged.
- Properties are limited to `subject`, `mcp_client`, and the super properties (`surface`,
  `engine_version`, `auth_state`). No query content, no document IDs, no request paths.
- The identifier is never the email address. `emailDomain()` in `events.ts` is the only email-shaped
  value that ever reaches PostHog, and only as a person property (`email_domain`), never an event
  property and never the `distinct_id`.
- `scrubProperties()` and `containsSecret()` in `events.ts` run structurally, not by name
  denylist, on every server-side capture — see the redaction table above this document.

A narrower design was considered and rejected: logging nothing at all would remove the ability to
tell a stitching gap from a real activation problem (`EVENT_TAXONOMY.md`'s "Known gap" section),
which is the specific product question this processing exists to answer.

## 4. Balancing test

**The data subject's interest**: not to have their product usage recorded and sent to a third
party without a working way to object.

**The controller's interest**: knowing whether the product's activation funnel converts, which
this document's own scope section limits to counts and coarse identifiers, not content.

**Factors weighing toward the controller's interest**:

- The identifier is pseudonymous, not linked to a real name inside the analytics processor. It is
  one join away from `users.email` and `users.google_sub` inside this system —
  `EVENT_TAXONOMY.md`'s "Objection, and how it is honoured" section states this plainly ("the
  access-policy subject is one join from `users.email` and `users.google_sub`") — but PostHog
  itself never receives that join.
- The EEA and UK population is not merely opted out by default; it is blocked before capture and
  before the dedupe write, for every request `geo.ts`'s `analyticsSuppressedByCountry()` can
  positively identify as EEA/UK, fail-closed on anything it cannot resolve. This document's
  balancing analysis therefore only needs to justify the non-EEA/UK population — the EEA/UK
  population is excluded from the processing entirely, not balanced into it.
- A right to object exists and is checked before anything is captured or written
  (`isAnalyticsSuppressed()`), and it fails closed: an outage is treated as an objection, not as
  silence.
- Retention is short and narrow — see the facts table.

**Factors weighing toward the data subject's interest, and limits this document does not paper
over**:

- The right to object is real but not self-serve today. Exercising it requires knowing to ask and
  requires an operator to run a `wrangler kv` command (see `hosted/knowledge-mcp/README.md`'s "Analytics
  opt-out" section). A right that requires contacting someone is weaker than a settings toggle,
  and the published page must describe it as it actually works, not as if a toggle existed.
- The MCP-surface country check has an inherent limitation the console surface does not share:
  `cf-ipcountry` reflects the IP address of the request, and many MCP clients are automation
  running on a machine the human is not sitting at. A person in the EEA reaching the service
  through a non-EEA-hosted agent is not suppressed by this check; the reverse false positive is
  also possible. This is a property of IP-based geolocation applied to machine-to-machine traffic,
  not a bug in `geo.ts` — the same check on the console's browser-based traffic does not have it,
  because a browser's IP is a much better proxy for where the person actually is.
- PostHog-side event retention is a policy of this system, decided 2026-09-02 and recorded in the
  facts table: twelve months from capture. PostHog's published guarantee — one year on its Free
  plan, seven years on any paid plan — is a floor on how long PostHog keeps data, not a ceiling, so
  the policy is enforced from this side by a scheduled prune rather than assumed from the plan.
  See "Trigger condition" below.

**Provisional conclusion**: for the population this processing actually reaches (EEA/UK excluded
by the geo check), the interest in measuring activation with pseudonymous, minimal, short-lived,
objectable data plausibly outweighs the residual privacy impact. This conclusion is provisional,
not final, for the reasons in "Trigger condition."

## 5. Facts table

| Fact                                   | Value                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Source                                                                                                                                                                      |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Events in scope                        | `mcp_call_succeeded` (MCP); `landing_viewed`, `signin_started`, `signin_completed`, `signin_failed`, `account_created`, `api_key_created`, `api_key_revoked`, `upgrade_intent_clicked` (console)                                                                                                                                                                                                                                                                                                                                                                                | `events.ts`'s `EVENTS`                                                                                                                                                      |
| Basis asserted                         | Legitimate interests, disclosed, not consent                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | `EVENT_TAXONOMY.md`'s "Objection, and how it is honoured"; `capture.ts`'s `isAnalyticsSuppressed()` comment                                                                 |
| Identifier — MCP                       | The OAuth access-policy `subject`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | `hosted/analytics.ts`'s `recordMcpActivation()`, `distinctId: subject`                                                                                                      |
| Identifier — console                   | `account_id`, a UUID minted in D1 at account creation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | `EVENT_TAXONOMY.md`'s Identity model table                                                                                                                                  |
| Identity unification                   | Not yet done — MCP and console are two separate PostHog people until M4 writes an `alias(subject, account_id)` call                                                                                                                                                                                                                                                                                                                                                                                                                                                             | `EVENT_TAXONOMY.md`'s "Known gap — MCP events do not stitch yet"; `hosted/analytics.ts` comment "Not yet the console account_id"                                            |
| Email address                          | Never sent as an event or person property; only the domain is (`email_domain`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | `events.ts`'s `emailDomain()`; `EVENT_TAXONOMY.md`'s Identity model section                                                                                                 |
| Retention — MCP dedupe key             | `analytics:mcp:<utc-day>:<subject>` in KV, 48-hour TTL — itself a record that a subject was active that day                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | `capture.ts`'s `DEDUPE_TTL_SECONDS` and `firstSeenToday()`                                                                                                                  |
| Retention — objection record           | `analytics:optout:<subject>` in KV, no expiry — stands until withdrawn                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | `capture.ts`'s `isAnalyticsSuppressed()` comment                                                                                                                            |
| Retention — PostHog-side event storage | Twelve months from capture, decided 2026-09-02. PostHog's published guarantee (one year on the Free plan, seven years on any paid plan) is a floor, not a ceiling, so the policy is enforced from this side: `tooling/prune-posthog-persons.ts` deletes every person whose last event is older than twelve months, together with that person's events, and must be scheduled before capture is switched on                                                                                                                                                                      | [PostHog pricing philosophy](https://posthog.com/pricing/philosophy); `tooling/prune-posthog-persons.ts`                                                                    |
| Suppression — geography                | Blocks the EU 27, the three non-EU EEA states, and the UK, fail-closed on absent, malformed, or pseudo-country codes (`XX`, `T1`, `EU`, and others), before capture and before the dedupe write                                                                                                                                                                                                                                                                                                                                                                                 | `hosted/shared/geo.ts`'s `EEA_AND_UK` and `analyticsSuppressedByCountry()`; `hosted/analytics.ts`; on the console, `analytics/console-capture.ts`'s `captureConsoleEvent()` |
| Suppression — objection                | Checked before anything is captured or written; fails closed on a KV outage                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | `capture.ts`'s `isAnalyticsSuppressed()`; on the console, `analytics/console-capture.ts`'s `captureConsoleEvent()`, against `FLAGS_KV` rather than `OAUTH_KV`               |
| Objection route today                  | Operator-only: `wrangler kv key put --binding OAUTH_KV "analytics:optout:<subject>" 1`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | `hosted/knowledge-mcp/README.md`'s "Analytics opt-out" section; `EVENT_TAXONOMY.md`'s "Objection" section                                                                   |
| Processor                              | PostHog, one dedicated project — Clueless Creations, id `<POSTHOG_PROJECT_ID>` — on US Cloud                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | `hosted/builder-console/README.md`'s "One new PostHog project, US Cloud"                                                                                                    |
| Ingestion host                         | `https://us.i.posthog.com` by default, or the first-party `/relay` reverse proxy                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | `capture.ts`'s `CaptureConfig`; `hosted/builder-console/README.md`'s "Reverse proxy on our own origin"                                                                      |
| Transfer                               | For the in-scope (non-EEA/UK) population, data goes to a US-hosted processor                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Derived from the processor row above and the EEA/UK exclusion                                                                                                               |
| DPA / SCC status                       | PostHog publishes a Data Processing Agreement that incorporates the EU Standard Contractual Clauses (Module Two), the UK International Data Transfer Addendum, and a Swiss variant; it binds an organization only once generated and countersigned self-serve at app.posthog.com/legal. Status 2026-09-02: not yet executed for the Clueless Creations organization — an account-owner action, recommended before capture. It is not the mechanism the EEA/UK exclusion relies on: those requests are excluded before capture, so no EEA/UK personal data is transferred at all | [PostHog DPA](https://posthog.com/dpa); [PostHog privacy notice](https://posthog.com/privacy)                                                                               |

## 6. Known gaps this assessment must not paper over

- **Identity is not unified.** Until M4 ships the `alias()` call, the MCP and console halves of
  the funnel are two different people in PostHog. This assessment covers both halves as processing
  activities; it does not claim they are already joined.
- **The right to object is not self-serve.** It works, and it fails closed, but exercising it
  requires an operator action today. Do not publish self-serve language until M5 ships a real
  control, per `EVENT_TAXONOMY.md`'s "Objection" section.
- **MCP-side geo-suppression is IP-based**, and machine-to-machine traffic makes IP a weaker proxy
  for the human's location than it is on the browser-based console surface. See the balancing
  section above.
- **PostHog's DPA is not yet executed.** It is a self-serve, countersigned document generated at
  app.posthog.com/legal by the account owner; the facts table records its terms and its status.
- **The retention prune exists but is not yet scheduled.** `tooling/prune-posthog-persons.ts` is
  dry-run by default; scheduling its `--apply` run is part of the trigger condition below.
- **`interest_submitted` is out of scope**, deliberately — see "Scope" above.

## 7. Trigger condition

This assessment must be finalized — the retention prune scheduled (`.github/workflows/prune-posthog.yml`,
monthly, `--apply`), and any published-page language that assumes these facts checked against the
real values — before `POSTHOG_PROJECT_TOKEN` is set for either surface. `hosted/builder-console/README.md`'s "Capture is switched OFF in production" section states the
same rule from the configuration side: "Turning it on is a policy decision, not a configuration
one — update the published page first, then set the secret." This document is the policy analysis
that decision rests on; it does not replace the page update or the founder's decision to make it.
