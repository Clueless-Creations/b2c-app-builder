# Hosted B2C App Builder knowledge service

This Cloudflare Worker exposes the read-only B2C App Builder knowledge service through two
remote transports:

- MCP: `https://mcp.clueless-creations.com/mcp`
- HTTP API: `https://mcp.clueless-creations.com/api/v1`

Access is by API key. D1 owns credentials minted in the account console at
`https://app.clueless-creations.com/console`. Every credential requires active tenant
membership and current entitlement, including owner credentials. Missing or unavailable
D1 fails closed. The service answers on exactly one origin: the Worker refuses any other Host
with `421 misdirected_request`, so `B2C_APP_BUILDER_PUBLIC_ORIGIN` is the single source of
truth for the hostname and `workers_dev` is disabled. These URLs describe the deployment target. Check `/health` and the provider
deployment record before you report that a new source version is live.

This hosted service is not the local B2C App Builder MCP server or the `b2c` CLI. It does not
open an app workspace or run local operations. Use the local MCP server for workspace status
and plans. Use the CLI for approved workspace changes.

## Capability boundary

| MCP tool               | HTTP GET route                    | Input                                           |
| ---------------------- | --------------------------------- | ----------------------------------------------- |
| `b2c_catalog`          | `/api/v1/catalog`                 | Optional `query`, `domainId`, `offset`, `limit` |
| `b2c_workflow`         | `/api/v1/workflows/{workflowId}`  | Stable workflow ID                              |
| `b2c_knowledge_search` | `/api/v1/knowledge/search`        | `query`; optional `domainId`, `offset`, `limit` |
| `b2c_knowledge_get`    | `/api/v1/knowledge/{referenceId}` | Stable reference ID; optional `offset`, `limit` |

`POST /api/v1/tools/{toolName}` accepts the same JSON arguments as MCP. `GET /api/v1`
returns tool schemas. All API routes require `Authorization: Bearer <B2C_APP_BUILDER_API_KEY>`.
Do not put credentials in URLs. MCP accepts an entitled API key for headless use and OAuth tokens
for interactive clients. HTTP API routes do not accept MCP OAuth tokens.

Results include the engine version, bundle hashes, and `scope: knowledge_only`. Document
results include source provenance. Offsets count Unicode code points, not bytes. The YAML
adjacency reference is returned as fenced Markdown with separate source and content hashes.

This service does not run the engine remotely. It cannot access local files, business state,
approvals, schedules, provider credentials, or execution commands. Those workspace
operations remain local. A local-only MCP name fails as `wrong_surface` with the hosted
connection receipt reading; it is not a missing knowledge tool. That includes workspace
planning and execution, public discovery, composition preview, and market reports. The local
and hosted MCP servers use the same knowledge implementation.
If the local knowledge bundle is missing or invalid, the local MCP keeps its execution
tools available. It omits the four knowledge tools and emits a fixed recovery warning.

## Connect a client

Use a native Streamable HTTP connection. No local proxy, Node process, or repository clone
is required to consume the hosted service.

```bash
codex mcp add b2c-hosted --url https://mcp.clueless-creations.com/mcp --oauth-client-registration dcr
codex mcp login b2c-hosted --scopes b2c:read --oauth-client-registration dcr
```

The authorization page asks for an entitled API key and explicit read permission. The client
receives an OAuth token, not an entitled API key. Keep the local `b2c-local` entry if you use local
execution. When both are configured, this hosted connection is knowledge-only and `b2c-local` is the
workspace surface. A leftover `b2c-app-builder` client name is not this hosted connection. Duplicate
names are a collision, not a third surface. Configure other
clients with the same remote URL and OAuth authorization.

ChatGPT can use dynamic client registration. The default HTTPS callback is its documented
stable redirect URI. Copy the actual callback from the client setup page before adding a
different callback to `B2C_APP_BUILDER_TRUSTED_REDIRECTS`. Native loopback callbacks must use
HTTP with `localhost`, `127.0.0.1`, or `[::1]` and an explicit port. Other callbacks require
an exact HTTPS allowlist entry.

URL-formatted client IDs (CIMD) are enabled. The service advertises
`client_id_metadata_document_supported` and accepts an HTTPS `client_id` whose document it
fetches, caches, and validates. A client that offers CIMD uses it and never calls
`/oauth/register`, which is how Claude Code connects: its document declares loopback callbacks
without a port, which registration refuses but RFC 8252 port-agnostic matching accepts. Dynamic
client registration stays available for clients that do not offer CIMD, such as ChatGPT. CIMD
requires the `global_fetch_strictly_public` compatibility flag, which bounds the fetch to public
addresses. It does not widen the redirect allowlist: `validateRedirectUri` still runs first, so a
document may only name callbacks the allowlist already permits. A document that cannot be
resolved is a `400`, never a `500`.

The [OpenAI authentication guide](https://developers.openai.com/plugins/build/auth) describes
the callback, issuer, and resource requirements. The service returns the issuer and binds
tokens to the exact `/mcp` resource. GET-based SSE is not enabled; clients use stateless POST.
Send one JSON-RPC message per POST. Top-level batches return `400 batch_not_supported`.
Some native clients send the same `resource` parameter more than once. The service reduces
identical copies of its exact `/mcp` resource to one value before authorization and token
validation. Conflicting resources and other duplicate authorization fields are rejected.

## Credentials

Create and revoke API keys through the account console. Only SHA-256 key digests are
stored in D1. Keep raw keys in the operator's secret manager, never in Worker bindings,
command arguments, logs, or repository files. The Worker requires
`B2C_APP_BUILDER_AUTH_SECRET` to sign short-lived consent challenges.

OAuth grants bind the key ID, digest, subject, and scope. Each access and refresh request
rechecks the credential, membership, account, user and entitlement in D1. Key rotation or
revocation invalidates outstanding grants. The only supported scope is `b2c:read`, and it is
granted by an active entitlement under any key in `auth.ts`'s `READ_SCOPE_LOOKUP_KEYS`: the
scope's own key, or one of the plans the console sells (`b2c_pro_monthly`, `b2c_pro_annual`),
which is exactly what the Stripe webhook writes for a paid subscription.

Access tokens last 10 minutes. Refresh tokens last 7 days. Registered clients expire after
90 days. Reconnect when a grant or client expires. Worker deployments and KV updates take
time to propagate. Do not promise immediate global revocation. A suspected compromise needs
credential revocation, token/grant cleanup, provider readback, and an incident review.

## Build and deploy

Use Node.js 22. Install the root and hosted package dependencies:

```bash
npm ci
npm ci --prefix hosted/knowledge-mcp
npm run hosted:bundle
npm run check:hosted-bundle
npm run hosted:check
npm run audit:ci
```

The `migrations/` directory holds the D1 schema. `migrations/README.md` documents tenant
isolation, credential invariants and schema application. Apply every numbered migration
for a new installation. Check provider state before claiming a schema is deployed.
`npm run hosted:check` exercises credential and OAuth behavior against in-process D1.

`tooling/render-hosted-bundle.ts` owns the generated knowledge bundle. Its `--check` mode
checks source bytes, manifest bytes, active references, and engine version. Do not edit the
generated JSON. `wrangler types` owns `worker-configuration.d.ts`; hosted type checks verify
its freshness. Regenerate it after a binding change with the hosted package's `types` script.

The checked-in `OAUTH_KV` binding uses the dedicated `b2c-app-builder-mcp-oauth` namespace in the first-party
Cloudflare account. For another account, create a dedicated namespace and set
its exact ID in `wrangler.jsonc`. Do not reuse another application's namespace.

Inject deployment credentials from the operator's secret manager. Transfer only
`B2C_APP_BUILDER_AUTH_SECRET` as a Worker secret through stdin. Never include raw API keys
in Worker bindings or temporary secret files.

```bash
npm run hosted:deploy
```

This command changes the configured Worker. Run it only with authority for that deployment.
There is no automatic production deployment in CI. The CI hosted job checks types, tests,
and the packaged Worker without provider credentials.

After deployment, print the pair this checkout would ship (`npm run hosted:version`) and
compare it to `/health`. Check the Cloudflare deployment version as well.
Verify unauthenticated requests fail, an entitled API key works on both transports, OAuth S256
authorization works, and local execution tool names fail. A successful build alone does not
prove a deployment. Keep raw credentials and OAuth responses out of logs and reports.

## Security and data handling

- Only active, catalog-bound knowledge is bundled. No request reads a file or fetches a URL.
- Each MCP request gets a new server and transport. Request identity is never global state.
- Requests have streaming byte limits and one ten-second body deadline. A stalled body
  returns HTTP 408 and its stream is cancelled. Slow chunks do not extend the deadline.
  Unknown arguments, conflicting resources, other
  duplicate parameters, foreign origins, other hosts, and URL credentials fail closed.
- Consent has a signed, five-minute challenge bound to the normalized authorization request.
  Each flow has its own secure HttpOnly cookie. Same-origin POST and an explicit decision
  are required. Failed key checks or expired challenges return an HTML recovery form with
  a fresh challenge and an empty key field. Browser rate-limit and service errors show
  fixed recovery instructions. HTML responses use a same-origin referrer policy so form
  posts retain their Origin header. External callbacks receive no referrer. Other responses
  use `no-referrer`. Null and foreign origins are still denied.
- Native rate limits cover ingress (240/minute/IP), authorization (30/minute/IP), and
  authorized knowledge access (120/minute/subject). Health, index, and preflight requests
  consume the ingress limit. Only GET requests for OAuth discovery metadata are exempt.
  Cloudflare enforces these per location; they are abuse controls, not a billing meter or
  a global quota. Public OAuth registration can still consume KV writes and client storage
  across many source addresses. Review aggregate admission limits before public onboarding.
- OAuth records are stored in dedicated Cloudflare KV. No query history, analytics SDK,
  creator upload, business record, or raw owner key is stored by this application.
- Worker observability logs are disabled. Provider request/error metrics still apply.
  Do not enable raw request logging for authorization URLs or credential-bearing requests.

For the repository privacy checklist: the private consent page discloses authorization
storage and Cloudflare processing. Public subscription terms and a privacy policy are now
published at `https://clueless-creations.com/terms/` and
`https://clueless-creations.com/privacy/`, with a Google user data statement at
`https://clueless-creations.com/google-data/`. They are served from the apex Astro site,
not from this Worker, because Google requires reachable policy URLs on an authorized
domain before an OAuth consent screen can be published and a legal page should not depend
on the availability of the service it describes. They have not been reviewed by a lawyer.
Two commitments in them constrain this Worker: it stores no query history, and
observability stays disabled. Enabling request logging would make the published privacy
policy false. The authorization hot path is SELECT-only for the same reason: no principal
or entitlement lookup writes a row, so no record of what an account requested is created.
The trap to know about is `api_keys.last_used_at`. The column exists and is read into the
console listing, but nothing writes it. Setting it on each request would turn every
authenticated call into a per-request write recording that an account used the service at
a given time, which is the query history the privacy policy says is not kept. If a
last-used timestamp becomes a product requirement, change the published page first. There are no uploads, storage buckets, testimonials, payments, renewals, or
generated AI responses in this release. The upload deletion, public bucket, testimonial,
cancellation, renewal-reminder, and AI crisis response risks do not apply to this
read-only owner service. Reassess all ten checklist items before enabling any of those
capabilities.

## Analytics opt-out (operator action)

`OAUTH_KV` (id `00000000000000000000000000000000`, see `wrangler.jsonc`) also holds the
per-subject objection record for this Worker's own analytics, on the `b2c-app-builder-mcp`
deployment named there. `hosted/builder-console/analytics/capture.ts`'s `isAnalyticsSuppressed()` checks
`analytics:optout:<subject>` before anything is captured or written, and it fails closed: an
unreachable store is treated as an objection, not as consent to proceed.

No self-serve opt-out exists yet. Suppress a subject with:

```bash
wrangler kv key put --binding OAUTH_KV "analytics:optout:<subject>" 1
```

Reverse it with `wrangler kv key delete --binding OAUTH_KV "analytics:optout:<subject>"`. There is
no expiry: an objection stands until it is withdrawn. Run both from `hosted/knowledge-mcp/`, where
`wrangler.jsonc` resolves the binding to this Worker. See
`../app/analytics/EVENT_TAXONOMY.md`'s "Objection, and how it is honoured" section for why the
check is fail-closed and why this stays an operator action rather than a published self-serve
route.

The console (`clueless-creations-app`) has its own analytics and its own objection store — never
this Worker's `OAUTH_KV`. Its subject is the D1 `account_id`, and its store is `FLAGS_KV` (id
`00000000000000000000000000000000`, see `../app/wrangler.jsonc`), checked by `../app/analytics/
console-capture.ts`'s `captureConsoleEvent()`. Suppress a console account with, run from the
package root (the repository root, two levels above both `hosted/knowledge-mcp/` and `hosted/builder-console/` —
`--config` is what makes this correct from outside `hosted/builder-console/`, unlike the `OAUTH_KV` command above
which relies on `hosted/knowledge-mcp/wrangler.jsonc` being the current directory's default):

```bash
wrangler kv key put --binding FLAGS_KV "analytics:optout:<account_id>" 1 --config hosted/builder-console/wrangler.jsonc
```

Reverse it with `wrangler kv key delete --binding FLAGS_KV "analytics:optout:<account_id>" --config
hosted/builder-console/wrangler.jsonc`. From inside `hosted/builder-console/` itself, drop `--config hosted/builder-console/wrangler.jsonc` —
that directory's own `wrangler.jsonc` is picked up the same way `hosted/knowledge-mcp/`'s is above.

## Deployed identity

`GET /health` on this Worker reports `engineVersion` and `bundleSha256` from
`catalog/generated/hosted-knowledge.json`. The console Worker reports the same
`engineVersion` from `skill-version.json`. It has no knowledge bundle, so it does
not invent a hash.

`engineVersion` lives inside the hashed catalog. Every skill-version bump moves
`bundleSha256`, even when no knowledge document changed. Do not hardcode the pair
in a runbook. Print it from the artifact the Worker ships:

```bash
npm run hosted:version
```

That command reads `catalog/generated/hosted-knowledge.json`. It does not rebuild
or re-hash the bundle. After a version stamp, re-run `npm run hosted:bundle` (or
`npm run render:all`) so the generated file matches the pin, then print the pair.

## Monitoring and recovery

After each release, the deploying maintainer owns a 15-minute validation window. Compare
Cloudflare request/error counts and CPU metrics with the `/health` engine version and bundle
hash printed by `npm run hosted:version`. Run positive and negative MCP/API checks. Inspect
deployment status in Cloudflare; do not search raw authorization request logs.

Healthy: the expected hash is live, anonymous calls fail, authorized calls return the same
knowledge on both transports, and OAuth refresh works. Failure: unexpected 5xx errors,
authorization bypass, a stale hash, or a local tool appears in the remote list. Revoke access
or disable the Worker route for an authorization failure. For a code regression, restore the
previous verified Worker version and preserve current D1 credential revocations. Recheck secret
bindings after rollback; an old code version is not authority to restore an old credential.

## Hosted scope

This Worker serves the versioned B2C App Builder knowledge bundle to authorized agents through
HTTP and MCP. It returns catalog and reference content. It does not expose local workspace
execution, reducer writes, business records, uploads, payments, or public publishing.

OAuth, API keys, deployments, and client registrations are separate authority scopes. Do not
reuse an owner key as a customer credential. Do not describe a source version bump as a deployed
Worker update. Verify the live bundle hash and service behavior after each deployment.

Public access, commerce, uploads, and additional hosted write capabilities require their own
product, privacy, security, and release review.
