# Platform Event Taxonomy

Scope: the Clueless Creations platform — the marketing apex, the `app.clueless-creations.com`
console, and the `mcp.clueless-creations.com` knowledge service. One PostHog project covers all
three surfaces so a person's journey stays in one funnel.

This taxonomy is the contract. Code in `analytics/events.ts` is generated against it, and
`test/events.test.ts` fails the build when the two disagree.

## Naming rules

- Event names are `snake_case`, `object_verb`, past tense. `api_key_created`, never `createApiKey`.
- One event per real user intention. Do not split an event by a property value; add the property.
- Property names are `snake_case` and stable. Display labels may change; stored keys never do.
- Booleans read as assertions: `is_first_key`, not `first_key_flag`.
- Reserved PostHog properties keep their `$` prefix and PostHog semantics.

## Redaction rule — enforced, not advised

No event property, person property, or group property may ever carry:

| Never captured                                                      | Why                                                               |
| ------------------------------------------------------------------- | ----------------------------------------------------------------- |
| An API key, in any form                                             | It is the credential itself                                       |
| `credentials[].sha256` from the access policy                       | A verifier for a low-entropy secret is offline-brute-forceable    |
| A bearer token, OAuth code, refresh token, or session cookie        | Bearer credentials                                                |
| `B2C_APP_BUILDER_ACCESS_POLICY`, whole or in part                   | Names every grantee and every credential digest                   |
| A Stripe secret or restricted key                                   | Billing credential                                                |
| A raw Google `id_token` or its `sub` claim used as a raw identifier | Bearer credential; `sub` is an unrotatable third-party identifier |

`scrubProperties()` in `events.ts` runs on every server-side capture. It throws in `throw` mode
(tests, and the interest path, where rejecting a submission beats leaking one) and drops the
property in `drop` mode (the capture hot path, where analytics must never fail a user request).

The guard is structural. `containsSecret()` walks objects and arrays to a bounded depth and checks
object _keys_ as well as values, so a credential nested inside a spread-in payload is caught even
though the type signature says properties are primitives — types are a compile-time promise, and
this is the runtime one. Denylisting property _names_ alone was rejected: it fails the moment
someone adds a new field. Names are still checked, as a second net rather than the only one.

**Where the guard does not reach — an accepted boundary, not an oversight.** Two paths bypass it,
and both are deliberate:

| Path                                                                        | Why                                                                                                                                               | What protects it instead                                                                                                                        |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `/relay/*` (`relay.ts`)                                                     | It is a byte-for-byte reverse proxy for `posthog-js`; parsing and rewriting SDK payloads would break the SDK contract and the compression it uses | Whatever the browser chooses to send. Client-side `capture()` calls are reviewed at the call site, and no autocapture of form values is enabled |
| Anything a future caller sends to PostHog without going through `capture()` | Nothing can stop code that does not call the guard                                                                                                | Code review. `snippet.ts` was such a path and now scrubs explicitly                                                                             |

So the redaction rule above is an invariant for **server-originated** events. For browser-originated
events it is a convention enforced by review. Do not read the table as a guarantee that a
credential physically cannot reach PostHog from the browser.

Safe to capture: `key_id` (opaque, `^[a-zA-Z0-9_-]{1,80}$`), `account_id`, `subject`, counts,
enum values, booleans, timestamps.

## The published privacy policy binds this taxonomy

`https://clueless-creations.com/privacy/` is live and is a legal representation, not a draft. Four
of its statements constrain everything below, and they are quoted rather than paraphrased because
a paraphrase is how the first breach happened:

- "There is no analytics SDK on this service." (of the hosted MCP service)
- "The service records no log of which knowledge documents you or your agent requested, and runs
  with request logging switched off."
- "We do not store your query history."
- Product analytics is listed as **planned**: "When the account console launches we intend to use
  PostHog". The page also promises "We will publish the specific cookie names, purposes and
  lifetimes on this page before analytics is switched on, and we will update the 'last updated'
  date when we do", and in the EEA/UK "analytics runs only if you agree to it".

**`mcp_call_succeeded` is therefore switched off in production, and must stay off until that page
changes.** The capture code is deployed and the `POSTHOG_PROJECT_TOKEN` secret is deliberately
absent, which makes `recordMcpActivation` a no-op. Turning it on is a policy decision, not a
configuration one.

What went wrong, recorded so it is not repeated: the event was enabled in production before anyone
read the published page. It captures a pseudonymous subject id and a timestamp to a third-party
processor, which is analytics running on a service whose policy says analytics is planned. Several
individual sentences survive the collision — no SDK is used, no query content is recorded, request
logging stays off — but "planned" and the pre-announcement promise do not. No data was actually
captured (the events table was empty when it was switched off), so the breach was latent.

The rule this leaves behind: **an event that records that an identified or pseudonymous person used
a service at a time is analytics, regardless of how little it says about what they did, and
regardless of whether an SDK was involved.** Before enabling capture on any surface, read the
published policy for that surface first.

The dedupe key in `capture.ts` deserves the same scrutiny. It writes `analytics:mcp:<utc-day>:<subject>`
to KV with a 48-hour TTL, which is itself a record that a subject used the service that day. It is
written only when capture is enabled, so it is dormant today, but it is not exempt from the
paragraph above.

## The rule both of today's near-misses shared

`autocapture` defaulted to `true` and was never set. `api_keys.last_used_at` was a column nobody
wrote. Neither was a bug anyone introduced; both were defaults nobody had made a decision about,
and both were one step from a published promise becoming false.

**The dangerous surface is the one nobody explicitly configured.** Before shipping an analytics
change, list what you did _not_ set, and check the default of each — a setting you never wrote down
is one you never decided.

A third instance the same day sharpened it into a second rule. The email address was reaching
PostHog from `interest/handler.ts` while the privacy page was being written to say it never does —
the author had checked `snippet.ts`, found the person-property slot empty, and generalised from one
path to all of them.

**The tell is the words "ever", "never", and "only".** Each is a claim about _every_ path, and it
can only be verified by enumerating them. If a sentence you are about to publish — or a comment you
are about to write — contains one, stop and list the paths, then check each. One verified path plus
an absolute claim is the shape all three of today's near-misses had.

Concretely, for anything reaching PostHog, the paths are: the browser SDK (`snippet.ts`), the
server-side capture in the app Worker (`interest/handler.ts`), the MCP Worker
(`hosted/analytics.ts`), and the relay, which forwards SDK payloads this codebase never inspects.

**Suppression is per path, not per surface.** The console has two of them, and the fourth instance
of this pattern was suppressing the browser snippet and leaving `interest/handler.ts` sending a
server-side event for the same visitor — no SDK and no cookie required, and "no event is sent"
false anyway. When a rule is applied to a surface, apply it to every path on that surface and say
which ones you checked.

## Objection, and how it is honoured

Analytics on both the MCP and console surfaces runs on a disclosed basis, not consent, so the right
to object is what makes it defensible. `isAnalyticsSuppressed()` in `capture.ts` checks
`analytics:optout:<subject>` before anything is captured or written, and it fails **closed**: if
the store is unreachable the subject is treated as having objected. A suppression that lapses
during an outage is a broken promise; missing analytics is only missing analytics.

Each surface checks its own store, never the other's. `hosted/analytics.ts`'s
`recordMcpActivation()` checks `OAUTH_KV`, the MCP Worker's own namespace; `analytics/console-
capture.ts`'s `captureConsoleEvent()` checks `FLAGS_KV`, the console's own. Sharing one store
across the two Workers would widen the OAuth authorization server's blast radius for no reason a
suppression check needs — `capture.ts`'s own file-level comment is explicit that it may import
nothing besides its sibling, for exactly that reason.

Opting a subject out today is an operator action against the relevant Worker's own namespace:

```bash
# MCP surface — subject is the OAuth access-policy subject
wrangler kv key put --binding OAUTH_KV "analytics:optout:<subject>" 1

# Console surface — subject is the D1 account_id
wrangler kv key put --binding FLAGS_KV "analytics:optout:<account_id>" 1 --config hosted/builder-console/wrangler.jsonc
```

Reverse either with `wrangler kv key delete` against the same binding and key; there is no expiry
on either — an objection stands until it is withdrawn. Neither route is self-serve yet. **Do not
publish a self-serve opt-out route until one is built.**

The distinct_id on the MCP surface is **pseudonymous, not anonymous**: the access-policy subject is
one join from `users.email` and `users.google_sub`. On the console surface `account_id` already
**is** the identifier the objection record is keyed on — see the Identity model section above.
Nothing in any disclosure should imply otherwise.

### Which console event checks what

Every console server-side capture goes through one gate, `analytics/console-capture.ts`'s
`captureConsoleEvent()`, so a future call site cannot forget either check. Geography is checked for
every event, always first and always synchronously — a suppressed request touches neither KV nor
the network. The objection check runs only for an event that already has a stable `account_id` to
check it against:

| Event                    | Geography checked | Objection (`account_id`) checked                                                                                                                                                                                                        |
| ------------------------ | ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `signin_started`         | Yes               | Not applicable — no account exists yet. The only identity in hand is the browser's anonymous PostHog `distinct_id` (`readBrowserDistinctId()`), which is not an `account_id` an objection record could be filed against                 |
| `signin_failed`          | Yes               | Not applicable, same reason as `signin_started`                                                                                                                                                                                         |
| `signin_completed`       | Yes               | Yes                                                                                                                                                                                                                                     |
| `account_created`        | Yes               | Yes                                                                                                                                                                                                                                     |
| `api_key_created`        | Yes               | Yes                                                                                                                                                                                                                                     |
| `api_key_revoked`        | Yes               | Yes                                                                                                                                                                                                                                     |
| `interest_submitted`     | Yes               | Yes for an authenticated submission — the session account id is passed as `objectionSubject` and checked in `FLAGS_KV`. Anonymous submissions have no account subject and receive the geography check only |
| `upgrade_intent_clicked` | Yes               | Yes — the account is already signed in (`requireConsoleSession`), so `console/checkout.ts` always has an `account_id` to pass as `objectionSubject`, the same as `account_created` and the two API-key events                           |

Interest storage precedes analytics: an objection, missing objection store, or objection-store failure suppresses authenticated capture without undoing the saved interest row. This describes the technical gate; it does not revise the separate lawful-basis assessment.

`landing_viewed` is browser-only (see the table in "Server-side and browser, not one or the other"
in `README.md`); it runs inside the client SDK on the marketing surface, governed by `snippet.ts`'s
own suppression, and never reaches this gate at all. `upgrade_intent_clicked` used to be documented
the same way, on the assumption that self-serve Checkout would need client-side JavaScript on the
console page to fire a click event; the console has no script at all
(`console/checkout.ts`'s own CSP is `default-src 'none'`), so the shipped event fires from the POST
handler instead and does reach this gate, like every other console mutation.

## Rotating the project token breaks a published legal page

The browser cookie is named `ph_<project_token>_posthog`, and that literal name is **published** at
`https://clueless-creations.com/privacy/`. Rotating the PostHog project token silently renames the
cookie and makes the live page wrong the moment it takes effect.

The page single-sources it at `posthogCookie` in the apex site's `src/data/legal.ts`. **Tell the
apex site before rotating, not after** — the page has to change in the same window, not afterwards.
Treat token rotation as a legal-page change that happens to involve a secret, not a secret rotation
that happens to touch a page.

The same is true of `capture_pageview`, `autocapture`, session recording, and the EEA/UK
suppression list: each is a published statement now, not just a config value. `snippet.test.ts`
pins all of them.

## URLs are scrubbed in the browser, not merely kept clean by convention

The page says we record the URL of pages you visit. That is only safe while console URLs carry no
identifiers, and "nobody will put a key id in a path" is a promise rather than a property.

`URL_SCRUBBER` in `snippet.ts` is inlined as `sanitize_properties`, so identifier-shaped path
segments and query values are replaced with `:id` **before the event leaves the browser** — UUIDs,
`b2c_` keys, `phc_` tokens, anything opaque of 32+ characters, and anything containing an `@`.
Query _keys_ survive so `utm_*` still reaches the funnel; only values are redacted, and the
32-character threshold sits above realistic campaign names.

A future `/console/keys/<key_id>` route therefore cannot quietly falsify the disclosure. The test
evaluates the exact shipped string rather than a re-implementation of it.

## Identity model

Three layers, per PostHog's identity-resolution guidance.

| Layer     | Value                                                  | Set where                                                |
| --------- | ------------------------------------------------------ | -------------------------------------------------------- |
| Anonymous | PostHog-generated `distinct_id`, browser-local         | `posthog-js` on the marketing surface                    |
| Stable    | `account_id` — a UUID minted in D1 at account creation | `identify()` at `account_created`                        |
| Auth      | Google `sub`, email                                    | Never the `distinct_id`; email is a person property only |

`account_id` is the `distinct_id` for every authenticated event, browser and server alike. The
browser calls `posthog.identify(account_id)` exactly once, at `account_created` / `signin_completed`,
which merges the anonymous person into the stable one. Server-side captures pass the same
`account_id`, so they land on the same person without a second merge.

**The email address is never sent to PostHog at all** — not as an event property and not as a
person property. The published privacy policy promises that no email or name reaches PostHog, and
the Google user data statement limits Google-derived data to Cloudflare and Stripe. D1 is the
system of record for the address; PostHog receives only `email_domain`, which is what segmentation
needs. If an address is ever required there, the published page changes first.

### Known gap — MCP events do not stitch yet

MCP events are keyed on the access-policy `subject`, which is not the D1 `account_id`. Until M4
maps subject to account, `mcp_call_succeeded` lands on a separate person and will not join a
console funnel. Do not report cross-surface activation as measured before M4 closes. The fix is
one `alias(subject, account_id)` call at the point the mapping is written — not a taxonomy change.

## Super properties — on every event

| Property         | Type   | Values                               |
| ---------------- | ------ | ------------------------------------ |
| `surface`        | enum   | `marketing`, `console`, `mcp`        |
| `engine_version` | string | The service version, e.g. `0.209.17` |
| `auth_state`     | enum   | `anonymous`, `authenticated`         |

## Event catalog

Funnel order is the table order. "Volume" documents any dedupe, because a silently deduped event
misreads as a low count rather than a design choice.

| #   | Event                    | Surface   | Fires when                                                                        | Properties                                                                                                                                                                                                      | Volume                           |
| --- | ------------------------ | --------- | --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| 1   | `landing_viewed`         | marketing | The marketing landing page renders                                                | `initial_utm_source`, `initial_utm_medium`, `initial_utm_campaign`, `initial_utm_content`, `initial_utm_term`, `initial_referrer`, `referral_code`                                                              | every view                       |
| 2   | `signin_started`         | console   | The user clicks "Continue with Google", before the redirect                       | `method` (`google`), `entry_point` (`landing`, `console_guard`, `pricing`)                                                                                                                                      | every click                      |
| 3   | `signin_completed`       | console   | The OIDC callback verifies and a session cookie is issued                         | `method`, `is_new_account`                                                                                                                                                                                      | every sign-in                    |
| 3b  | `signin_failed`          | console   | The callback rejects                                                              | `method`, `reason` (`state_mismatch`, `expired_code`, `token_invalid`, `email_unverified`, `internal`) — a code, never a message                                                                                | every failure                    |
| 4   | `account_created`        | console   | The D1 `accounts` row is inserted                                                 | `method`, `email_domain` (domain only, never the address)                                                                                                                                                       | once per account                 |
| 5   | `api_key_created`        | console   | A key is minted and its digest stored                                             | `key_id`, `is_first_key`, `key_count_after`                                                                                                                                                                     | every creation                   |
| 6   | `api_key_revoked`        | console   | A key is marked revoked                                                           | `key_id`, `key_age_days`, `key_count_after`, `revoked_reason` (`user_action`, `admin`, `rotation`)                                                                                                              | every revocation                 |
| 7   | `mcp_call_succeeded`     | mcp       | An authorized `/mcp` request returns HTTP 2xx                                     | `subject`, `mcp_client`                                                                                                                                                                                         | **once per subject per UTC day** |
| 8   | `interest_submitted`     | console   | The interest collector form is accepted and the `interest_signals` row is written | `source_key`, `source_label`, `other_text_present`, `intent`, `is_authenticated`, `flow_id`, `step_id`, `initial_utm_source`, `initial_utm_medium`, `initial_utm_campaign`, `initial_referrer`, `referral_code` | once per email address           |
| 9   | `upgrade_intent_clicked` | console   | A plan form on `/console` is submitted                                            | `surface_location` (`console_plans`), `checkout_available` (the flag value at click time)                                                                                                                       | every click                      |

`api_key_created` carries `is_first_key` rather than existing as a separate `first_api_key_created`
event. One event with a discriminating property keeps the catalog small and lets a funnel filter on
`is_first_key = true` — splitting the event would make "any key created" un-countable without a
union.

`mcp_call_succeeded` is deduped to one event per subject per UTC day in `capture.ts`. Every
successful call would make analytics cost scale with API traffic rather than with users, and the
funnel step "reached first successful MCP call" is unaffected: a funnel takes the first matching
event regardless.

"Succeeded" means HTTP 2xx from an already-authorized request. A JSON-RPC-level tool error still
counts: the client reached the service, authenticated, and got an answer, which is what activation
measures. `mcp_client` is derived from the User-Agent prefix and falls back to `unknown` rather
than echoing an arbitrary header value.

### The interest collector accepts signed-out submissions

`interest_signals` (hosted/knowledge-mcp/migrations/0005) is deliberately not tenant-scoped: `account_id`
is a nullable plain column, not a foreign key, and uniqueness is on `lower(email)`. Most signals
arrive before an account exists, and a waitlist row must not be destroyed by another table's
lifecycle.

That has one consequence for this taxonomy. The event's `distinct_id` is the `account_id` when the
visitor is signed in, and the browser's own PostHog `distinct_id` when they are not — which keeps
the submission on the same person as their `landing_viewed` and `upgrade_intent_clicked`. When
neither identity exists the row is still written and **the event is skipped**: a fabricated
`distinct_id` would create a phantom person and inflate the funnel. So `interest_submitted` counts
can be lower than rows in D1, and D1 is the number to trust.

`source_label` is derived from `source_key` at capture time and is never stored. The stored key is
stable; the label is presentation and may be reworded, so a point-in-time label on the event is
correct while a stored one would drift.

### Interest collector is the documented attribution alias

`examples/workspace/business/analytics/ANALYTICS.md:16` requires `attribution_source_selected`
**"(or a documented alias)"**. On the platform surface that alias is `interest_submitted`. It
carries the canonical property names from `knowledge/data/analytics-attribution.md` — `source_key`,
`source_label`, `other_text_present`, `initial_utm_*`, `initial_referrer`, `referral_code` — and
sets the canonical person properties. Emitting both events would double-count one form submission.

`tooling/probe-posthog.ts` already honours `POSTHOG_EVENT`, so the existing attribution probe works
against this surface with `POSTHOG_EVENT=interest_submitted` and no code change.

### Stored source keys

Stable enum. Labels may be reworded; keys must not change.

`friend`, `x_twitter`, `reddit_search`, `hacker_news`, `youtube`, `github`, `ai_search`, `search`,
`newsletter`, `podcast`, `creator`, `mcp_directory`, `ad`, `other`.

These are the platform-appropriate subset of the catalog enum in
`knowledge/data/analytics-attribution.md`. The mobile-store keys (`app_store_search`,
`play_store_search`, `instagram_reels`) are omitted — this product does not ship through a store —
and `hacker_news`, `github`, and `mcp_directory` are added for a developer-tool audience.

`intent` enum: `evaluating`, `ready_to_buy`, `just_curious`, `need_team_plan`.

### Known duplication: SOURCE_KEYS / ACQUISITION_SOURCE_KEYS

`SOURCE_KEYS` here and `ACQUISITION_SOURCE_KEYS` in `hosted/knowledge-mcp/db/tenant.ts` are two copies of
one enum, not one shared module. The app Worker must not take a runtime dependency on the
authorization server's D1 access module — the two Workers stay separate so a fault in one cannot
reach the other — so the enum is duplicated rather than imported.

`test/events.test.ts` reads `tenant.ts` at build time and fails the build the moment the
two lists disagree, in either direction. This is not a placeholder waiting to be fixed: it already
caught one real drift, where `youtube` was missing from one side, and a visitor who selected it
would have passed one writer's validation and been refused by the other against the same table.

Consolidate into one shared module — following `hosted/shared/geo.ts`'s "must import nothing"
pattern — only once a third consumer needs the same enum. Moving two writers onto one module at
once makes a regression harder to attribute than moving one.

## Person properties

Set with `$set` at identify. `$set_once` for first-touch values so a later visit cannot overwrite
acquisition truth.

| Property                                       | Set with    | Source                                   |
| ---------------------------------------------- | ----------- | ---------------------------------------- |
| `email_domain`                                 | `$set`      | Derived — the domain only                |
| `account_created_at`                           | `$set_once` | D1                                       |
| `self_reported_source`                         | `$set`      | Interest collector `source_key`          |
| `self_reported_source_label`                   | `$set`      | Interest collector                       |
| `self_reported_source_other_text_present`      | `$set`      | Boolean only — the free text stays in D1 |
| `self_reported_source_captured_at`             | `$set`      | ISO timestamp                            |
| `initial_utm_source` / `_medium` / `_campaign` | `$set_once` | First landing                            |
| `initial_referrer`                             | `$set_once` | First landing                            |

The raw "other" free text is deliberately **not** sent to PostHog. It is unbounded user input that
can contain anything, including a pasted credential. It lives in D1, where it is the system of
record and is covered by the privacy policy.

## Feature flags

| Key                   | Type    | Purpose                                                                | Default when unresolvable |
| --------------------- | ------- | ---------------------------------------------------------------------- | ------------------------- |
| `self-serve-checkout` | boolean | `true` reveals Stripe Checkout; `false` reveals the interest collector | **`false`**               |

The unresolvable default is fail-closed by intent: an unresolved flag must never reveal an
unfinished paid checkout. See `flags.ts`.
