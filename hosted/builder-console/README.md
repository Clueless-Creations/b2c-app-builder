# App Worker — product analytics

This directory is the builder's own optional hosted App Worker for
`app.clueless-creations.com`. Local discovery and planning use the `b2c` CLI
and catalog. Those commands do not install or import this Worker. Shared engine
code must not import `hosted/builder-console/`. Consumer app workspaces do not use this
directory as their backend.

The repository source map names the analytics contract here: PostHog capture,
flag gate, relay, and interest collector. The same Worker also hosts optional
console surfaces for that product: Google OIDC, the console, API-key management,
Stripe objects, the webhook handler, and self-serve Checkout. Those surfaces
belong to this hosted product. They are not a second product router. They do
not replace workspace `product.yaml` or `DESIGN.md`.

The analytics layer for `app.clueless-creations.com`. Google OIDC, the console, API-key
management, Stripe objects and the webhook handler (M3/M5/M6), and self-serve Checkout (M9) now
live in this same Worker — `auth/`, `console/`, and `billing/` — built against the contract this
directory documents; see "Not yet built here" at the bottom of this file for what still isn't.
This directory's own subject is still the analytics contract those milestones capture against,
plus the interest collector that was M9's fallback while self-serve Checkout did not exist yet —
routed into the console itself: GET `/console` renders the "ask for access" form (or the submitted
state, once `interest/repository.ts` finds a row for the signed-in account) and POST
`/console/interest` accepts it, both behind the same `requireConsoleSession` guard as
`/console/keys`. Self-serve Checkout (`console/checkout.ts`, `billing/checkout.ts`) is gated
behind the `self-serve-checkout` flag (`analytics/flags.ts`) or the operator switch
`CHECKOUT_ENABLED` in `wrangler.jsonc` — the switch has been `"on"` since release 0.210.0
(2026-09-04), so GET `/console` renders the plan form (two plans, a consent box) and the Billing
Portal buttons today; the
interest collector above is the fallback whenever the gate resolves closed or a live Checkout call
fails. The disclosure the interest form makes — "we'll email you a Stripe payment link for the
monthly or annual plan" — is only shown in that fallback.

## Browser pages

Every page is zero-JavaScript HTML on the shared theme (`hosted/knowledge-mcp/theme.ts`, the
public site's ink, paper, orange, Inter, and Archivo), laid out by `console/chrome.ts`, with
`Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; font-src 'self';
form-action 'self'`. The two fonts are served by this Worker itself from `/fonts/`
(`console/fonts.ts`, base64 in source, a year-long immutable cache).

| Route                              | What it does                                                                                                                                                                                   |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /`                            | 302 to `/console`.                                                                                                                                                                             |
| `GET /signin`                      | The front door: one button to `/auth/google/start` (carrying `entry_point`), the three steps, the open-source door, and the Terms and Privacy links. A valid session is sent on to `/console`. |
| `GET /auth/google/start`           | Sets the OAuth state cookie and redirects to Google. `entry_point` is one of `landing`, `header`, `console_guard`, `pricing`, `signin`.                                                         |
| `GET /auth/google/callback`        | Finishes sign-in and lands on `/console`. Google's own `?error=` lands on `/signin?notice=cancelled`; every other failure renders the sign-in failure page (400).                               |
| `GET /console`                     | Guarded. The plan state (renewal or end date, scheduled cancellation, past-due deadline), the plan forms with their consent box, and the Billing Portal buttons — or the ask-for-access fallback. `?checkout=success\|cancelled` and `?billing=returned\|payment_method_updated\|cancel_scheduled` name where a person came back from; see "Returning from Stripe". |
| `POST /console/checkout`           | Guarded. `plan` (`monthly`/`annual`) plus the required `consent` field; creates the Stripe Customer on first use and 303s to a Checkout Session. 400 `consent_required` without the box.                                                                                                              |
| `POST /console/billing`            | Guarded. 303s to a Billing Portal session. Optional `flow`: `payment_method_update` or `subscription_cancel` opens the portal directly on that task and returns to `/console` with the matching `?billing=` flag; no `flow` opens the portal home page (invoices, renew, plan changes if enabled). |
| `GET/POST /console/keys` and below | Guarded. Keys for the account's agents, with the four connect snippets the offer page publishes.                                                                                                |
| `POST /auth/signout`               | Guarded. Revokes the session row and clears the cookie; the form in every signed-in page's header posts it, with its own token under the `signout_token` field.                                 |
| `GET /fonts/<file>.woff2`          | The console's two web fonts.                                                                                                                                                                   |

A signed-out request to any guarded route is redirected to `/signin?entry_point=console_guard`,
never straight to Google's account picker.

## What a plan grants

The MCP Worker admits an API key or an OAuth grant only when the account holds an active
entitlement whose `lookup_key` is in `hosted/knowledge-mcp/auth.ts`'s `READ_SCOPE_LOOKUP_KEYS`:
the read scope's own key, `b2c:read`, or one of the plans this console sells
(`PLAN_LOOKUP_KEYS`: `b2c_pro_monthly`, `b2c_pro_annual`). `billing/webhook.ts` and
`billing/reconcile.ts` write entitlement rows keyed by the Stripe Price's `lookup_key`, so a paid
subscription opens the door through that list and nothing else; `test/plans.test.ts` fails if a
plan is added to `billing/plans.ts` without being added there. An account with no plan is refused
at the hosted service with 403, and `/console` says so.

## Returning from Stripe

Every Stripe-hosted page this console opens comes back to `/console` with a flag: Checkout's
`success_url`/`cancel_url` carry `?checkout=`, the Billing Portal's return link carries
`?billing=returned`, and the two deep links (`payment_method_update`, `subscription_cancel`)
finish on `?billing=payment_method_updated` / `?billing=cancel_scheduled` through the portal's
`flow_data[after_completion]` redirect. On any of those returns — and on any visit by an account
that has a Stripe Customer but no subscription mirror row at all — `worker.ts` calls
`billing/checkout.ts`'s `syncSubscriptionsFromStripe` before rendering: `GET /v1/subscriptions?customer=`
(paged, through `billing/reconcile.ts`'s `listCustomerSubscriptions`, the same call the sweep
makes) and the same `applyParsedSubscription` (`billing/subscription-sync.ts`) the webhook uses, so
the page shows what the person just did even when the webhook describing it has not arrived, and a
Checkout whose webhook was lost still opens the gate the next time its owner looks. A key no
subscription bills any more is retired on the same pass. Stripe's own guidance for the return from
Checkout is to verify from the API rather than trust the redirect; this is that check, for every
return. A failed resync is logged and the page falls back to the mirror. Ordinary visits by
accounts with a mirror row never read Stripe, and both re-read paths are rate-limited per account
through `FLAGS_KV` (a minute for returns, an hour for the no-mirror case).

The webhook itself (`billing/webhook.ts`) now gives an event id back and answers 500 when its
dispatch throws (`releaseProcessedStripeEvent`), so Stripe's retry of that id is applied instead of
being answered as a duplicate. Before this, a first subscription event whose dispatch failed after
the idempotency row was written left an account with no entitlement row at all — a gap the
staleness sweep, which only re-derives rows that exist, could never close.

Two things the mirror now records that it did not before, both read back from the live account:
the paid period's end, which 2025-08-27.basil reports on the subscription *item* rather than the
subscription (the mirror held `NULL` for every live subscription until `subscription-sync.ts`
started reading the item), and a scheduled cancellation in either shape Stripe uses for it —
`cancel_at_period_end` on a classic-billing-mode subscription, `cancel_at` on a flexible-mode one,
which is what the Billing Portal sets on subscriptions created in this account today. The plan
page's "renews on", "ends on", and past-due deadline all come from those two fields plus
`entitlement-policy.ts`.

### The consent box

The public Terms (§7, consumer withdrawal rights) promise that before access starts a person is
asked to agree to it starting at once and to acknowledge that an EEA/UK consumer thereby gives up
the 14-day right to withdraw once the service has been fully performed. The plan form carries
that as one required checkbox above the two plan buttons; POST `/console/checkout` refuses a
request without it (400 `consent_required`) so the browser's `required` is not the only guard.
The instant of consent and the Terms URL ride on the subscription Checkout creates, as
`subscription_data[metadata][terms_accepted_at]` / `[terms_url]`, so the evidence lives next to
the subscription it covers in Stripe with no table of its own here. Checkout's own pay button
additionally states the renewal and cancellation terms (`custom_text[submit]`).

Start at [`analytics/EVENT_TAXONOMY.md`](analytics/EVENT_TAXONOMY.md). It is the contract; the
code is the executable half of it. Its lawful basis is documented separately, in
[`analytics/LEGITIMATE_INTERESTS_ASSESSMENT.md`](analytics/LEGITIMATE_INTERESTS_ASSESSMENT.md).

## Decisions, and why

### One new PostHog project, US Cloud

The organisation's other products have their own projects, none of which is this one. PostHog's
guidance is one project per _product family_, grouping every surface a person touches, so the
platform project covers the marketing apex, the console, and the MCP service together; a person's
journey then stays in one funnel. The other products are separate and correctly stay separate.

US Cloud is not really a choice. PostHog EU is a physically separate deployment with its own
organisations — an EU project would mean a second account and a second billing relationship, with
no shared org and no cross-product view. The organisation is on `us.posthog.com`, so the platform
project is too.

The project is **Clueless Creations**, on `us.posthog.com`. Note that the PostHog MCP
connector has no `project-create` tool, so creating a project is always a founder action in the UI;
everything downstream is provisioned from this repo.

### Server-side and browser, not one or the other

The console is server-rendered HTML, which tempts a server-only setup. That would lose referrer
and UTM data on first landing, session stitching, and click-level intent — none of which the
server sees. So both halves run, each doing what only it can:

| Captured in the browser         | Captured on the server                                                               |
| ------------------------------- | ------------------------------------------------------------------------------------ |
| `landing_viewed`                | `signin_started`, `signin_failed`, `signin_completed`, `account_created`             |
| Referrer, UTMs, session, device | `api_key_created`, `api_key_revoked`, `interest_submitted`, `upgrade_intent_clicked` |
|                                 | `mcp_call_succeeded` (MCP Worker)                                                    |

`upgrade_intent_clicked` reads as a natural fit for the browser column — it is a click — but the
console page it fires from has no script at all (`console/checkout.ts`'s own CSP is `default-src
'none'`), so it is captured from the POST handler instead, the same way every other console
mutation is. `landing_viewed` is the one event here that genuinely needs the browser: it lives on
the marketing surface, which does run `snippet.ts`.

The rule: an event that must be true goes server-side, because a blocker cannot delete it. An
event that needs browser context goes client-side.

Flags are evaluated on the server and **bootstrapped** into the client, so the upgrade surface
renders its final state on first paint instead of flipping once the async evaluation lands.

### Console suppression: one gate for geography and objection

Every server-side event in the table above — `signin_started`, `signin_failed`,
`signin_completed`, `account_created`, `api_key_created`, `api_key_revoked`,
`interest_submitted`, and `upgrade_intent_clicked` — goes through one function,
`analytics/console-capture.ts`'s `captureConsoleEvent()`, rather than calling
`captureInBackground()` directly. Before this
existed, the geography check that `interest/handler.ts` already ran was the only one on the
surface; the other six events called `captureInBackground()` straight from `worker.ts` and
`console/keys.ts`, unchecked. `EVENT_TAXONOMY.md`'s "The rule both of today's near-misses shared"
is the reason a per-path fix was rejected in favour of one gate every call site is now forced
through.

Two checks, always in this order, always before any KV read or network call:

1. **Geography.** `analyticsSuppressedByCountry()` — the same predicate `interest/handler.ts` and
   the MCP Worker already used — runs first and synchronously. A suppressed request returns with
   nothing scheduled: no KV read, no capture, no exception.
2. **Objection**, for the four events that already have a stable `account_id`
   (`signin_completed`, `account_created`, `api_key_created`, `api_key_revoked`).
   `isAnalyticsSuppressed()` checks `analytics:optout:<account_id>` in `FLAGS_KV` — the console's
   own namespace, never the MCP Worker's `OAUTH_KV` — and fails **closed**. `signin_started` and
   `signin_failed` fire before an account exists, so they get the geography check only; see
   `EVENT_TAXONOMY.md`'s "Which console event checks what" table for the complete list.

See `EVENT_TAXONOMY.md`'s "Objection, and how it is honoured" section for the opt-out command
against `FLAGS_KV`, and `LEGITIMATE_INTERESTS_ASSESSMENT.md`'s "Suppression" rows for the lawful-
basis analysis this gate exists to satisfy.

### The past_due grace window

A subscription Stripe reports as `past_due` keeps its entitlement for seven days
(`PAST_DUE_GRACE_MS`, `billing/entitlement-policy.ts`), measured from the first moment this
Worker observed dunning for that subscription — whichever came first, a subscription event
carrying `past_due` or an `invoice.payment_failed` while the mirror still said `active`/
`trialing`. After seven days, access is revoked. `unpaid`, `canceled`, `incomplete`,
`incomplete_expired`, and `paused` are never entitled, exactly as before this decision;
`active` and `trialing` are entitled, exactly as before. Recovery — `invoice.paid`, or a
subscription event reporting `active`/`trialing` — restores access and clears the stamp.

Stripe's Smart Retries make their first several attempts inside that first week
(https://docs.stripe.com/billing/revenue-recovery/smart-retries), so seven days bounds the free
usage a failing card can extract without cutting off a customer whose bank simply bounced one
retry. The window is enforced by both the webhook path and the scheduled reconciliation sweep
(`billing/reconcile.ts`), so it is honoured even if the webhook that would otherwise revoke
access is missed entirely. `hosted/knowledge-mcp/migrations/0007_past_due_grace.sql` adds the column that
records when dunning started; `billing/entitlement-policy.ts` is the single function both paths
call to decide access from it, so the two cannot drift apart on what "entitled" means.

### Reverse proxy on our own origin

PostHog still recommends a reverse proxy so blockers do not silently delete the funnel. Two
documented options fit:

|                    | Managed proxy                                         | This Worker at `/relay`           |
| ------------------ | ----------------------------------------------------- | --------------------------------- |
| Effort             | CNAME, no code                                        | ~90 lines                         |
| Support            | PostHog troubleshoots it                              | ours to debug                     |
| Blocker resistance | separate subdomain — still third-party to a heuristic | same origin as the console        |
| CORS               | needed                                                | none — same origin                |
| Cloudflare zone    | must be **grey-clouded**, bypassing the zone          | inside the zone                   |
| Cost               | free                                                  | Worker invocations, no egress fee |

The managed proxy is the lower-effort option and is the right switch if `/relay` becomes a
maintenance burden. It is not the default here for one reason: the app Worker already exists on
this origin, so a path on it is same-origin, which a separate proxy subdomain never is.

The path is `/relay` because PostHog's docs name `analytics`, `tracking`, `telemetry`, `posthog`,
and `ph` as the substrings blockers match.

**The proxy strips `Cookie` and `Authorization` outbound.** The console session cookie is
`__Host-` prefixed, which forces `Path=/`, so the browser attaches it to `/relay/*` like any other
same-origin request. A verbatim header copy — which is what the reference recipe does — would send
a live session cookie to a third party on every captured event.

### Flags: KV cache, split read/write, fail closed

`self-serve-checkout` gates the deferred Checkout. Remote evaluation would add a PostHog round trip
to every server-rendered page, so definitions are cached in KV: a 5-minute cron writes, request
handlers only read, and `strictLocalEvaluation` stops a cache miss from silently becoming a remote
call from the hot path.

Every non-affirmative outcome resolves to "Checkout hidden": missing definitions, stale definitions,
a thrown evaluation, and an `undefined` flag value. The asymmetry is the point — hiding Checkout
from someone who would have paid costs one conversion; revealing it costs a real payment against a
flow that does not exist yet.

`MAX_DEFINITION_AGE_MS` (1 hour) is the availability-versus-correctness dial and is the value most
worth revisiting: raise it and a PostHog outage keeps the last known state longer; lower it and the
gate reverts sooner after the refresher stops. It must stay well above the 5-minute cron interval.

### Interest collector: D1 first, PostHog second

The row is the system of record and its write failing rejects the submission. PostHog is captured
afterwards, best-effort. A submission PostHog records but D1 does not is a lost customer with a
funnel that claims otherwise; the reverse is only an analytics gap.

The table is `interest_signals`, owned by `hosted/knowledge-mcp/migrations/0005` — this directory writes it
and does not define it. It accepts signed-out submissions: `account_id` is nullable and uniqueness
is on `lower(email)`, because most signals arrive before an account exists and a waitlist row must
not be destroyed by another table's lifecycle.

The raw "where did you hear about us" free text is stored in D1 and **never** sent to PostHog —
unbounded user input can contain anything, including a pasted credential. Only the boolean
`other_text_present` is captured.

Per `examples/workspace/business/analytics/ANALYTICS.md`, `interest_submitted` is the **documented alias**
for `attribution_source_selected` on this surface, carrying the canonical property names from
`knowledge/data/analytics-attribution.md`. `tooling/probe-posthog.ts` works against it unchanged
with `POSTHOG_EVENT=interest_submitted`.

`interest/handler.ts` is the submission logic; `console/interest.ts` plus the form on `/console`
(rendered by `console/pages.ts`'s `renderConsolePage`) is what actually reaches it — a signed-in
visitor is routed here, not merely served a handler that exists but nothing calls.

### Never captured

A structural guard, not a name denylist — see the redaction table in the taxonomy. Denylisting
names fails the moment someone adds a field, so `detectSecret()` matches credential _shapes_: the
`b2c_…` API key format from `hosted/auth.ts`, SHA-256 digests, PostHog and Stripe keys, JWTs,
`Bearer` headers, and a serialised access policy. On the capture path the property is dropped and
the event still ships; in tests and on the interest path it throws.

## Capture is switched ON in production

`POSTHOG_PROJECT_TOKEN` is set on both Workers since 2 September 2026, in the order this section
used to demand: the published page at `https://clueless-creations.com/privacy/` changed first
(status table, the analytics section, the cookies section, "switched on 2 September 2026"), the
PostHog project was set to discard client IP data, then the secret was transferred from Doppler
`b2c/prd` to `b2c-app-builder-mcp` and `clueless-creations-app` on stdin. The first events were
three `mcp_call_succeeded` rows from one same-second burst of MCP requests (initialize,
initialized, tools/call each pass through `mcpResponse`), after which the once-per-day dedupe held.
The dedupe is a KV get-then-put, so concurrent same-second requests from one subject can each
capture; the funnel is unaffected, the cost claim is approximate.

What the page promises is what the code does: server-side console events only, every one through
`analytics/console-capture.ts` (EEA/UK suppressed from the request country before any KV read or
network call; the objection record honoured for events that carry an account id), the knowledge
service's one daily signal only over the MCP transport (`/api/v1` never records activation), no
browser script and therefore no PostHog cookie. Turning on any new capture surface is still a
policy decision, not a configuration one: update the published page first, then ship the code. See
the privacy section of `analytics/EVENT_TAXONOMY.md` for the exact quotes and the rule they imply.
The two preconditions in `analytics/LEGITIMATE_INTERESTS_ASSESSMENT.md` stand: the retention
prune is scheduled by `.github/workflows/prune-posthog.yml` (it needs the repository secret
`POSTHOG_PERSONAL_API_KEY`, a PostHog personal API key with `person:write` and `query:read`,
created in the PostHog UI), and executing PostHog's DPA at app.posthog.com/legal remains the
account owner's action.

## The MCP Worker

Three lines were added to `hosted/knowledge-mcp/worker.ts`, plus `hosted/knowledge-mcp/analytics.ts`. No route
handling, no auth decision, and no response body was touched.

- **Off by default.** With `POSTHOG_PROJECT_TOKEN` unset, it is a no-op. Deploying changes nothing
  until that secret is set.
- **No new dependency.** Capture is a single JSON POST shared with this Worker. The MCP Worker is
  the OAuth authorization server every client depends on; it does not get an analytics SDK.
- **Fail-open.** Nothing it does can reject, delay, or alter a served response.
- **Deduped** to one event per subject per UTC day, so cost tracks users rather than API traffic.

## Setup

```bash
npm --prefix hosted/builder-console install
npm run app:check
```

### PostHog resources

These already exist in your PostHog project:

| Resource                                        | Where                                                                        |
| ----------------------------------------------- | ---------------------------------------------------------------------------- |
| `self-serve-checkout` flag (active, 0% rollout) | PostHog, under Feature flags    |
| Signup and activation funnel dashboard, 7 tiles | PostHog, under Dashboards |

`analytics/posthog-resources.json` is the reproducible definition of all of it. **Edit there and
re-run the provisioner rather than editing tiles in the PostHog UI**, or the two drift:

```bash
POSTHOG_PROJECT_ID=<your project id> POSTHOG_PERSONAL_API_KEY=<key> npm run app:provision-posthog
```

Flags match on key and insights on name, so re-running updates rather than duplicates — which also
means renaming an insight in the UI causes the next run to create a second copy. With no
credentials the script prints the plan and exits 0. Key scopes: `feature_flag:write`,
`insight:write`, `dashboard:write`.

The `POSTHOG_PROJECT_TOKEN` used for capture is the project's public write-only token. It is set as
a Cloudflare secret rather than committed, both because the repository contract keeps provider
values out of Git and because an unset variable is the off switch for MCP capture.

## Verifying it actually works

PostHog's capture endpoints answer `200 {"status":"Ok"}` for any shape-valid token, **including one
that belongs to no project** — the token is validated downstream, so a typo drops every event while
the SDK reports success. A successful write is therefore not evidence. The only proof is a
read-back:

```bash
POSTHOG_EVENT=interest_submitted npx tsx tooling/probe-posthog.ts --root <workspace>
```

## Credentials

Both Workers in this repository can share one secret-manager config, which makes one rule matter:
transfer this Worker's five keys **by name** — a `jq` projection over your secret manager's JSON
export, piped straight into `wrangler secret bulk` — and never dump a whole config, or the MCP
Worker's `B2C_APP_BUILDER_*` secrets land in this Worker too. Confirm the source config before any
write, the same as `hosted/knowledge-mcp`'s section warns.

Two of the five have no external source to copy from: `B2C_APP_CONSOLE_AUTH_SECRET` is generated
at first deploy, and `STRIPE_WEBHOOK_SECRET` exists only once the webhook endpoint below is
registered.

| Doppler secret                | Purpose                                                  | Worker copy                       |
| ----------------------------- | -------------------------------------------------------- | --------------------------------- |
| `GOOGLE_CLIENT_ID`            | OAuth 2.0 Web Client id (M3)                             | Secret binding with the same name |
| `GOOGLE_CLIENT_SECRET`        | OAuth 2.0 Web Client secret (M3)                         | Secret binding with the same name |
| `B2C_APP_CONSOLE_AUTH_SECRET` | Signs the console's CSRF tokens (M5, `console/pages.ts`) | Secret binding with the same name |
| `STRIPE_RESTRICTED_KEY`       | Server-side Stripe calls, `rk_`-prefixed (M6)            | Secret binding with the same name |
| `STRIPE_WEBHOOK_SECRET`       | Verifies `Stripe-Signature` (M6)                         | Secret binding with the same name |

All five are `wrangler.jsonc`'s `secrets.required` list; a deployment missing any of them fails
to start rather than running with a hole in it. Transfer them with `wrangler secret bulk` on
stdin, matching `hosted/knowledge-mcp`'s own instruction — never as a command argument, a log line, or a
value committed to this repository. `B2C_APP_CONSOLE_AUTH_SECRET` has no external source to copy
from; generate it locally the same way this codebase generates any other opaque secret, and treat
it exactly like `B2C_APP_BUILDER_AUTH_SECRET` on rotation — a rotated value invalidates every CSRF
token already issued to an open console tab, which is the same one-way tradeoff `hosted/knowledge-mcp`'s
README documents for its own signing secret, and only that: M3's session cookie and OAuth
`state`/`nonce` (`auth/session.ts`) are unsigned, unguessable random tokens with no secret of
their own, so `B2C_APP_CONSOLE_AUTH_SECRET` signs this one CSRF pair and nothing from the sign-in
flow — there is no second token type it could be asked to also cover, and rotating it never signs
a person out.

The Worker accepts only 43 to 128 base64url characters — no `=` padding, no `+` or `/` — the
exact shape `isConsentSecret` (`../knowledge-mcp/auth.ts`) checks. Generate a value with the right shape
directly, piped on stdin so it never touches a shell history or a log:

```bash
openssl rand -base64 32 | tr '+/' '-_' | tr -d '=' | wrangler secret put B2C_APP_CONSOLE_AUTH_SECRET
```

A 2026-09-02 incident deployed a standard-base64 value (`=` padding) here: `consentKey`
(`../knowledge-mcp/auth.ts`) rejected it only once a request actually tried to sign or verify a CSRF
token, deep inside rendering `/console`, and the resulting `AccessError(503)` escaped this
Worker's `fetch` unhandled — a Cloudflare error 1101 for every visitor, with nothing in `wrangler
tail` naming the cause at the boundary. `worker.ts`'s `fetch` now checks the secret's shape before
`/console` and everything under it does anything else: a wrong-shape value makes every `/console`
route answer a plain 503 instead, with a single `console.error` line naming
`B2C_APP_CONSOLE_AUTH_SECRET`, the required shape, and this section — never the value itself.

## Go-live checklist

The concrete, in-order steps only a human with account access can perform before a milestone's
code can run against real accounts. None of this is inferred or run automatically — see
AGENTS.md's Authority section. Each milestone adds its own section here as it lands.

### Google sign-in (M3)

1. **Create an OAuth 2.0 Web Client** in the Google Cloud Console, under whichever GCP project the
   founder controls: APIs & Services → Credentials → "Create Credentials" → "OAuth client ID" →
   Application type "Web application". An agent cannot create this — Google requires a human
   signed in to the Cloud Console.
2. **Configure the OAuth consent screen** (if not already done for this GCP project): the app
   name, support email, and the `openid`, `email`, and `profile` scopes — the exact three
   `buildGoogleAuthorizeUrl` (`hosted/builder-console/auth/google.ts`) requests, no more.
3. **Add the authorized redirect URI and JavaScript origin**: redirect URI
   `https://app.clueless-creations.com/auth/google/callback` (must match `googleRedirectUri`'s
   construction in `worker.ts` exactly — Google rejects any mismatch, including a trailing slash),
   and authorized JavaScript origin `https://app.clueless-creations.com`.
4. **Copy the Client ID and Client secret** Google generates into Doppler as `GOOGLE_CLIENT_ID`
   and `GOOGLE_CLIENT_SECRET` (see the Credentials section above), then transfer them with
   `wrangler secret bulk` the same way M6's Stripe secrets are transferred below. Generate
   `B2C_APP_CONSOLE_AUTH_SECRET` at the same time — it has no external provider to copy it from.
5. **Sign in against the deployed Worker**, establish the account entitlement, and create an API key through the console.
6. **Read the result back from D1** the same way the Stripe checklist below does —
   `wrangler d1 execute clueless-creations --remote --command "SELECT * FROM users"` (and
   `accounts`, `memberships`) after that first sign-in — a `302` to `/console` only proves the
   Worker responded, not that every row it should have written actually landed.

### Stripe (M6)

1. **Create the Stripe account**, or confirm the existing one, and do the rest of this list in
   test mode first.
2. **Create Products and Prices** in the Stripe Dashboard for each plan this app sells, and set a
   `lookup_key` on every Price that should grant an entitlement (Dashboard: Price → "Use a lookup
   key"; the API's `lookup_key` field at creation works the same way). `upsertEntitlement`
   (`hosted/knowledge-mcp/db/tenant.ts`) keys every entitlement row on this value, not on the Price id, so
   a Price recreated without its lookup_key breaks entitlement resolution silently rather than
   loudly. The set of lookup_keys this app understands, and what each one is priced at, is a
   pricing decision reserved to the founder (AGENTS.md), not something this code infers or should
   be asked to guess.
3. **Create a restricted API key**: Dashboard → Developers → API keys → "Create restricted key",
   scoped to the minimum this Worker calls across M6 and self-serve Checkout (M9) together —
   **Customers (Write)**, **Checkout Sessions (Write)**, **Customer portal, i.e. the Billing
   Portal, (Write)**, **Prices (Read)**, **Subscriptions (Read)** (also what the return-from-Stripe
   resync reads), **Invoices (Read)**. The key
   must start with `rk_`; `stripeApiRequest` (`hosted/builder-console/billing/stripe.ts`) asserts that prefix at
   the point it is used and refuses to call Stripe with anything else, so a full secret key pasted
   into this slot by mistake fails closed on the first request instead of silently running with
   more privilege than intended.

   The Customer Portal additionally needs its own one-time setup, separate from the API key: open
   Dashboard → Settings → Billing → Customer portal and save a configuration (even the defaults)
   at least once. `createBillingPortalSession` (`hosted/builder-console/billing/checkout.ts`) fails if no
   configuration has ever been saved for this account, key permission notwithstanding — the
   restricted key's scope and the portal's own configuration are two independent go-live
   requirements, not one.

   What the default configuration should say, so the portal matches what `/console` and the
   public Terms promise (read back from the live account on 2026-09-06; items marked *set* were
   already so, items marked *open* were not):

   - Cancel subscription: **on**, mode **at end of billing period**, no proration — *set*. The
     Terms say access continues to the end of the paid period; the console's "Cancel plan" button
     deep-links to exactly this flow.
   - Payment method update: **on** — *set*. The console's "Update payment method" button deep-links
     to it, and it is where a past-due customer goes.
   - Invoice history: **on** — *set*. The only place a customer gets receipts.
   - Customer information: email and address — *set*; add **name** and **tax ID** so a business
     buyer can correct what Checkout collected (`tax_id_collection` is on in Checkout).
   - Cancellation reasons: **on**, with Stripe's standard list — *open*. Costs nothing, and the
     reason lands on the subscription's `cancellation_details` and in the
     `customer.subscription.updated` event.
   - Switch plans: **on**, between the two Prices of the one product (`b2c_pro_monthly` and
     `b2c_pro_annual`), prorating an upgrade immediately and scheduling a downgrade for the end of
     the period — *open*. `/console` says "To change or cancel your plan, open Manage billing", and
     without this the portal offers no way to change it. Once enabled, the portal home page shows
     the switch; no console deep link is added for it, because a deep link to a disabled portal
     feature fails at session creation.
   - Pause subscription: **off** — *set*. The entitlement policy never grants access to `paused`.
   - Business information: headline, and the Terms and Privacy URLs — *set*.

   Also in the Dashboard, outside the portal page: Settings → Billing → Subscriptions and emails
   — turn on the customer emails for failed payments, upcoming renewals (annual plans in
   particular), and successful payments/receipts, because the Terms say "Stripe retries it and
   emails you" and "We email you before each renewal where the law requires it"; and Settings →
   Business → Public details — the statement descriptor and support email a card statement and a
   receipt show.

   **Self-check the six scopes with curl** before wiring the key into Doppler — a restricted key
   answers `permission_error` (HTTP 403) for a scope it lacks, checked before this Worker's own
   request would even get far enough to fail on its actual parameters, so a deliberately-broken
   request that comes back as anything _other than_ 403 proves the scope is granted, with nothing
   at risk: the four writes below are rejected for being malformed before Stripe creates anything,
   and the three reads name an object that cannot exist. Never put the key in a way that lands in
   shell history or a log; export it into the current shell only:

   ```bash
   read -rs STRIPE_RESTRICTED_KEY   # paste the rk_live_... value, then press Enter
   export STRIPE_RESTRICTED_KEY
   STRIPE_API="https://api.stripe.com"   # api-stripe-com in source-registry.yaml

   echo -n "Customers (write):         "; curl -s -o /dev/null -w "%s\n" -X POST "$STRIPE_API/v1/customers" -u "$STRIPE_RESTRICTED_KEY:" -d b2c_permission_probe=1
   echo -n "Checkout Sessions (write): "; curl -s -o /dev/null -w "%s\n" -X POST "$STRIPE_API/v1/checkout/sessions" -u "$STRIPE_RESTRICTED_KEY:" -d b2c_permission_probe=1
   echo -n "Customer portal (write):   "; curl -s -o /dev/null -w "%s\n" -X POST "$STRIPE_API/v1/billing_portal/sessions" -u "$STRIPE_RESTRICTED_KEY:" -d b2c_permission_probe=1
   echo -n "Prices (read):             "; curl -s -o /dev/null -w "%s\n" "$STRIPE_API/v1/prices/price_b2cPermissionProbe00" -u "$STRIPE_RESTRICTED_KEY:"
   echo -n "Subscriptions (read):      "; curl -s -o /dev/null -w "%s\n" "$STRIPE_API/v1/subscriptions/sub_b2cPermissionProbe00" -u "$STRIPE_RESTRICTED_KEY:"
   echo -n "Invoices (read):           "; curl -s -o /dev/null -w "%s\n" "$STRIPE_API/v1/invoices/in_b2cPermissionProbe00" -u "$STRIPE_RESTRICTED_KEY:"

   unset STRIPE_RESTRICTED_KEY
   ```

   Every line should print `400` or `404` — an unrecognized parameter or a nonexistent object,
   the shape of failure a _permitted_ call gets. A `403` on any line names exactly the scope still
   missing from the key.

4. **Register the webhook endpoint**: Dashboard → Developers → Webhooks → "Add endpoint" →
   `https://app.clueless-creations.com/webhooks/stripe`, subscribed to exactly these five events —
   `customer.subscription.created`, `customer.subscription.updated`,
   `customer.subscription.deleted`, `invoice.paid`, `invoice.payment_failed` — which is the same
   set `billing/webhook.ts` dispatches; anything else it receives is recorded as `ignored` and
   answered 200 with no side effect. A delivery whose dispatch throws is answered 500 with its
   event id released, so Stripe retries it; a retry that keeps failing shows up in the endpoint's
   failed deliveries in the Dashboard, which is the place to look. Copy the signing secret Stripe
   generates (`whsec_...`) — this is `STRIPE_WEBHOOK_SECRET`.
5. **Put both secrets in Doppler**, under this Worker's project/config (see this file's
   Credentials section, above), as `STRIPE_RESTRICTED_KEY` and `STRIPE_WEBHOOK_SECRET`
   (matching `wrangler.jsonc`'s `secrets.required`), then transfer them with `wrangler secret
bulk` on stdin the same way `hosted/knowledge-mcp`'s README documents. Never place either value in a
   command argument, a log, or this repository.
6. **Run the test-mode `stripe trigger` runbook** before relying on a real customer to be the
   first webhook delivery:
   ```bash
   stripe listen --forward-to https://app.clueless-creations.com/webhooks/stripe
   stripe trigger customer.subscription.created
   stripe trigger customer.subscription.updated
   stripe trigger invoice.paid
   stripe trigger invoice.payment_failed
   stripe trigger customer.subscription.deleted
   ```
   Confirm every trigger gets a `200` from the endpoint. Then redeliver one
   (Dashboard → the event → "Resend", or `stripe events resend <evt_id>`) and confirm it does
   **not** create a second row anywhere — this is exactly what
   `test/integration/stripe-webhook.test.ts`'s idempotency test already proves against an
   in-process database, but only a real redelivery through Stripe's own infrastructure proves the
   deployed endpoint itself is reachable, correctly routed, and signed against the right secret.
7. **Read the result back from D1**, not just from Stripe's dashboard —
   `wrangler d1 execute clueless-creations --remote --command "SELECT * FROM entitlements"` (and
   `subscriptions`) after each trigger. A `200` from the webhook only proves Stripe delivered the
   event and got a success response; it does not prove this Worker's dispatch wrote the row it
   should have.
8. **Do not point any of this at production pricing** until the Products and Prices from step 2
   reflect real, founder-approved plans — `stripe trigger` only ever exercises Stripe's own
   test-mode fixture data, never a real charge, so this whole list is safe to run in full before
   that decision is made.

## Not yet built here

Google OIDC (M3), the console shell and API-key management (M5), and Stripe objects and the
webhook handler (M6) are now built — `auth/`, `console/`, and `billing/` in this directory, plus
the tenant-repository additions in `hosted/knowledge-mcp/db/tenant.ts` those three share. Still open:

- **M4**, the subject-to-account mapping that closes the MCP stitching gap — `account_id` is
  already the identity M3's session and this file's analytics both key on, but nothing yet joins
  it back to the MCP Worker's own subject-scoped activation records.
- **M9**, self-serve Checkout, is built — `console/checkout.ts`, `billing/checkout.ts`, and the
  plan forms in `console/pages.ts` — and open through the `CHECKOUT_ENABLED` operator switch.
  The interest collector remains the fallback whenever the gate resolves closed.
- **Account closure.** The public Terms say an account can be closed from the console; no route
  does that yet. Sign-out exists (`POST /auth/signout`); closure needs its own design (what
  happens to keys, the Stripe Customer, and the audit trail).
- **Plan changes from the console.** Switching between monthly and annual happens in the Billing
  Portal, and only once the portal configuration allows it (see the Stripe checklist above). The
  console links to the portal home page for it rather than deep-linking, on purpose.
