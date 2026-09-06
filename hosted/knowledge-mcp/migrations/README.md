# D1 schema and migrations

The Cloudflare D1 schema for the Clueless Creations platform. Milestone M1.

Applied. The `clueless-creations` database exists and carries this schema.

|          |                                                                                  |
| -------- | -------------------------------------------------------------------------------- |
| Database | `clueless-creations`                                                             |
| ID       | `00000000-0000-0000-0000-000000000000`                                           |
| Region   | ENAM                                                                             |
| Applied  | migrations 0001-0007, local and remote; 0008 written and tested, not yet applied |
| Verified | 10 tables, 11 triggers, 12 indexes; zero rows                                    |

The binding is in `wrangler.jsonc` and the Worker reads it. See "Two credential sources"
below for what that changes and, more importantly, what it does not.

## Files

| File                            | Contents                                                                                                                                                                                                                          |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `0001_identity_and_tenancy.sql` | `users`, `accounts`, `memberships`                                                                                                                                                                                                |
| `0002_api_keys.sql`             | `api_keys` and its cap, immutability, and terminal-revocation triggers                                                                                                                                                            |
| `0003_billing.sql`              | `subscriptions` mirror, `entitlements` gate, `processed_stripe_events`                                                                                                                                                            |
| `0004_sessions_and_audit.sql`   | `sessions`, append-only `audit_events`                                                                                                                                                                                            |
| `0005_interest_collector.sql`   | `interest_signals`                                                                                                                                                                                                                |
| `0006_interest_attribution.sql` | Technical + free-text attribution columns on `interest_signals`                                                                                                                                                                   |
| `0007_past_due_grace.sql`       | `subscriptions.past_due_since`, the past_due grace window's dunning stamp                                                                                                                                                         |
| `0008_lazy_stripe_customer.sql` | Relaxes `accounts.stripe_customer_id` to nullable, for lazy Customer creation at first Checkout instead of at sign-in — a full table rebuild; see the migration's own header comment for why a plain `ALTER TABLE` cannot do this |

## Credential invariants

D1 stores credentials and tenant membership. The following constraints complement the
per-request checks in `auth.ts` and `db/tenant.ts`.

| Invariant                                       | Source          | How the schema keeps it                                                                                    |
| ----------------------------------------------- | --------------- | ---------------------------------------------------------------------------------------------------------- |
| `opaqueId` is 1-80 of `[a-zA-Z0-9_-]`           | auth.ts:6       | `length()` plus a negated-class `GLOB` CHECK on every id column                                            |
| `digest` is 64 lowercase hex                    | auth.ts:7       | Same CHECK on `api_keys.sha256_hex` and `sessions.id`                                                      |
| Credential ids are unique                       | auth.ts:46      | `api_keys` primary key                                                                                     |
| Digests are unique                              | auth.ts:47      | `api_keys.sha256_hex UNIQUE`, which also makes the lookup a single indexed read                            |
| At most one `b2c:read` scope                    | auth.ts:8       | `scopes IN ('[]', '["b2c:read"]')`                                                                         |
| At most 64 credentials                          | auth.ts:21      | `api_keys_cap_per_account` trigger, counting unrevoked keys                                                |
| At most 64 allowed subjects                     | auth.ts:20      | `memberships_cap_per_account` trigger                                                                      |
| Owner is an allowed subject                     | auth.ts:44      | `memberships_single_active_owner` partial unique index                                                     |
| A credential's subject must be allowed          | auth.ts:78      | Composite foreign key `(account_id, user_id)` into `memberships`                                           |
| `revoked` has no path back                      | auth.ts:75      | `api_keys_revocation_is_terminal` trigger                                                                  |
| `expiresAt` expires on `<=`                     | auth.ts:81      | ISO round-trip CHECK; the comparison stays in `db/tenant.ts`                                               |
| Constant-time digest comparison                 | auth.ts:92      | `db/tenant.ts` re-checks with `constantTimeEqual` after the indexed read                                   |
| Malformed configuration fails closed with 503   | auth.ts:52      | Rows are re-validated and rebuilt into an `AccessPolicy`, then passed through the real `parseAccessPolicy` |
| Malformed key is 401, refused credential is 403 | auth.ts:88, :94 | `resolveApiKeyPrincipal` reproduces both, and a test asserts the split                                     |

`db/tenant.ts` does not re-implement authorization. It rebuilds a one-credential
`AccessPolicy` from the row it read and calls the existing `parseAccessPolicy` and
`authorizePrincipal`, to keep credential validation in one place.

## Tenant isolation

D1 has no row-level security, so isolation is mechanical rather than conventional:

1. `db/tenant.ts` is the only module that touches D1. Every function takes a
   server-resolved `AccountId` first. `AccountId` is a branded type whose only
   constructors are the two `resolve*` functions, so a `string` from a request body or
   path cannot be passed as the tenant without a compile error.
2. `npm run lint:tenant` fails the build on `.prepare(`, `.batch(`, `env.DB` or the D1
   types anywhere else, and on any TypeScript reference to `is_gifted`.
3. `npm run test:tenant` seeds two accounts and asserts that account A's create, list,
   read and revoke paths never return or mutate account B's rows.

The revoke paths carry the most risk. A revoke scoped by key id alone would be a direct
IDOR: key ids are opaque but they are handed to clients, so the `UPDATE` filters on
`account_id` as well and a cross-tenant revoke reports no change.

## Credential authority

`access.ts` resolves all credentials from D1 and checks entitlement. Missing bindings,
unavailable storage and malformed rows fail closed. Owner credentials use the same gate.
Every OAuth access and refresh reads current credential and tenant state. The integration
suites prove revocation, rotation, entitlement refusal and tenant isolation.

## Activity data

The authorization path is SELECT-only. Current application code does not update
`api_keys.last_used_at` or `sessions.last_seen_at`, and does not call `recordAuditEvent`.
The schema exposes these fields without making them a usage-tracking requirement.
`audit_events` is append-only and refuses deletion by trigger.

Before adding activity writes, review the published privacy commitments and obtain the
required legal and deployment authority. Repository source does not establish what is
currently deployed or what the live privacy page says.

## Running wrangler

`wrangler` is a dev dependency of this package, not a global install, so a bare `wrangler`
is `command not found`. Run it from `hosted/knowledge-mcp` through the local binary.

```bash
cd hosted/knowledge-mcp && ./node_modules/.bin/wrangler d1 list
```

## Applying a future migration

Add the next `NNNN_*.sql` file, then apply locally, inspect, and only then apply remotely.
Regenerate types first if the binding changed.

```bash
cd hosted/knowledge-mcp && ./node_modules/.bin/wrangler d1 migrations apply clueless-creations --local
```

```bash
cd hosted/knowledge-mcp && ./node_modules/.bin/wrangler d1 migrations apply clueless-creations --remote
```

Confirm the shape afterwards.

```bash
cd hosted/knowledge-mcp && ./node_modules/.bin/wrangler d1 execute clueless-creations --remote --command "SELECT type, count(*) AS n FROM sqlite_schema WHERE type IN ('table','trigger','index') AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name NOT LIKE 'd1_%' GROUP BY type;"
```

Do not probe the remote database with throwaway rows. `audit_events` is append-only and
refuses DELETE, so a test row written there cannot be removed. Probe locally instead.

## A second waitlist now exists

The account also holds a `clueless-waitlist` database with `waitlist` and `checkout_intent`
tables, predating this work. `interest_signals` here is deliberately separate: the
architecture puts the collector beside `accounts` so a later Checkout release can convert a
signal without a cross-database migration. Before the collector ships, decide which one is
authoritative, or the same address can sit in both with different intent text.

## Verify without a database

The canary suite runs the real migration files against an in-process D1 and needs no
Cloudflare account, so the schema is exercised on every check.

```bash
npm run hosted:check
```
