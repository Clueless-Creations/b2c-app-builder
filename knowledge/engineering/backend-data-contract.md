# Backend Data Contract

Every real app build needs a backend-agnostic data contract before implementation hardens: the schema, the authorization model, the migration story, and the environment layout, written down in terms the product owns rather than terms a provider rents out. Without it, the build silently couples to whichever backend the archetype prompt defaulted to — usually Supabase — and a later founder preference for Firebase or a custom backend becomes a rewrite instead of a route change. The contract lives in `engineering/TECH_SPEC.md` under a `## Data Contract` section; this reference defines how to fill that section for each backend route and how to prove it.

## Contents

- When To Load
- Backend Selection
- Data Model
- Authorization Model
- Migrations And Environments
- API Surface And Client Sync
- Archetype Pack Adaptation
- Proof
- Artifact Contract
- Founder-Only Gates
- Anti-Patterns

## When To Load

Load this reference:

- Before writing the data model or API sections of `engineering/TECH_SPEC.md`.
- Before running any schema or auth prompt from an archetype pack (`social-network.md`, `ai-chat-companion.md`) — the packs assume Supabase and must be adapted first if the route differs.
- When the founder asks for Firebase or a custom backend instead of the Supabase default, or questions the backend choice at any point.
- Before claiming the engineering lane done; the contract and its proof are part of done status (`engineering-orchestration.md`).
- When auditing an existing app's data layer for drift, untested authorization, or undocumented backend coupling.

## Backend Selection

Pick one route, record it, and never silently substitute another mid-build.

- **Supabase (default route).** Postgres + Auth + Realtime + Storage. This is what the shipped archetype prompt packs target, so the schema/RLS prompts run with minimal adaptation. Choose it when the product fits relational data, the team has no contrary preference, and speed-to-working-multi-user-product matters most.
- **Firebase.** Firestore + Auth + Cloud Functions + Storage. Choose it when the founder or team already prefers it, or when realtime-document sync (presence, collaborative state, fan-out listeners) fits the product better than relational queries. Accept the trade: no relational joins, no SQL migrations, security rules instead of RLS.
- **Custom backend.** Node or Python service + Postgres. Choose it when the product needs server logic the BaaS models fight — heavy background processing, multi-step transactions across entities, third-party orchestration, or an authorization model too conditional for declarative rules.

Record the selection in `engineering/TECH_SPEC.md` under "Backend Selection" with at least:

- route: `supabase` | `firebase` | `custom`
- reason: one or two sentences tied to the product, not to habit
- decided by / date: founder confirmation or the default-with-no-objection note
- what would change the decision: the named condition under which the route gets revisited

Mirror the provider status in `state/business-state.json` and the decision in `strategy/TOOL_DECISIONS.md` when that file exists. A selection without a reason is the backend-by-default anti-pattern, not a decision.

Switching backends after implementation starts is a **change-cascade event** ([`change-cascade.md`](../process/change-cascade.md)): re-walk the data contract, the archetype prompt adaptations, `SECRETS.md`, `trust/SECURITY.md`, and every client that touches data. Switching is also a founder-only gate — never migrate routes on inference.

## Data Model

Define the model in product terms first; map it to tables or collections second. The "Data Model" sub-section carries one row per entity:

| Entity  | Owner | Key fields                   | Relationships | Retention                       | PII class    |
| ------- | ----- | ---------------------------- | ------------- | ------------------------------- | ------------ |
| profile | user  | display name, avatar path    | 1:1 auth user | hard-delete on account deletion | PII          |
| post    | user  | body, media path, created_at | N:1 profile   | soft-delete, 30-day purge       | user content |

Rules for filling it:

- **Entities and ownership.** List every entity, its owning user (or system ownership), and the fields it carries. Every row/document that holds user data must name its owner column or path — authorization depends on it.
- **Relationships.** Name each relationship and its cardinality. On Supabase/custom this becomes foreign keys; on Firebase it becomes subcollections or reference fields plus the denormalization needed to query without joins. Write the relationship down once, route-agnostically, then note the route mapping.
- **Retention and deletion.** For each entity, decide soft-delete (tombstone + purge window) or hard-delete, and map the choice to the account-deletion requirement: when a user deletes their account, the data layer must actually erase or anonymize their data on every entity, not just hide it in the UI. Cross-check `privacy-terms.md` — the privacy policy's deletion promise and the data model's deletion path must be the same fact.
- **PII classification.** Tag each field as PII, sensitive, or operational. This classification feeds `trust/SECURITY.md` (what needs encryption, access logging, and minimization) and the store privacy disclosures via `privacy-terms.md`.

## Authorization Model

Authorization is part of the contract, not an implementation detail. Write a single authorization matrix — entity by entity: who can create, read, update, delete — in the "Authorization Model" sub-section:

| Entity  | Create                       | Read                                             | Update     | Delete     |
| ------- | ---------------------------- | ------------------------------------------------ | ---------- | ---------- |
| post    | authenticated user (as self) | any authenticated user; public if feed is public | owner only | owner only |
| message | conversation member          | conversation members only                        | owner only | owner only |

Then express the same matrix in the selected route's enforcement mechanism, and name that mechanism explicitly in the sub-section:

- **Supabase:** Postgres Row Level Security policies. Every table gets RLS enabled and explicit policies; a table without RLS is publicly writable through the anon key.
- **Firebase:** Firestore security rules. Every collection and subcollection gets match blocks with explicit allow conditions; storage buckets get their own rules.
- **Custom:** middleware authorization. Every endpoint passes through an authz layer that checks ownership/role before the handler runs; no handler trusts the client's claim of identity.

Rules for every route:

- **Deny by default.** Start from "no access" and grant explicitly. Never ship permissive defaults intending to tighten later.
- **Storage buckets are private by default.** Every storage bucket (Supabase Storage, Firebase Cloud Storage, or a custom object store) starts private with no public-read grant; serve files only through storage policies/security rules that match the authorization matrix, or through short-lived signed URLs. A bucket flipped to public — even "just for now" — is a Tier 1 legal/privacy risk (`privacy-terms.md` §7, risk 6), not a convenience; record the bucket's access mode in `engineering/TECH_SPEC.md` and `trust/SECURITY.md`.
- **Every table/collection gets an owner, read, and write rule** derived from the matrix. If an entity has no sensible rule, the data model is wrong — fix it there.
- **Service-role and admin keys never ship in clients.** The Supabase service-role key, Firebase Admin SDK credentials, and custom-backend admin tokens are server-only secrets routed per [`secrets-management.md`](../operations/secrets-management.md). Client builds get only publishable/anon keys, and those keys must be safe precisely because the authorization rules hold.
- **Untested rules are a launch blocker.** Per `security-release-hardening.md`, RLS policies and security rules that have never been exercised by a test count as absent. See Proof below.

## Migrations And Environments

The "Migrations And Environments" sub-section must name the migration tool, the environment map, and the backup posture. Fill it as follows.

- **Migration tool per route.** Supabase: `supabase` CLI migrations, committed under `supabase/migrations/`, applied in order; never mutate production schema through a dashboard without a corresponding migration file. Firebase: Firestore has no schema migrations — document a data-shape version per collection instead (a `schemaVersion` field or documented shape changelog) plus a backfill plan for shape changes. Custom: pick and name a migration tool (e.g. Prisma Migrate, Alembic, node-pg-migrate) in the contract; "raw SQL applied by hand" is not a migration story.
- **Environment separation.** Maintain distinct dev, staging, and production backends (separate Supabase projects, Firebase projects, or database instances). Never point a dev client at production data. Record the environment map in `engineering/TECH_SPEC.md` and the per-environment secret locations in `SECRETS.md`.
- **Secrets.** All connection strings, keys, and tokens route through Doppler (or the founder-approved alternative) per `secrets-management.md` — one config per environment, `doppler run --` wrappers in commands, no raw values in docs or proofs.
- **Seed data and fixtures.** Ship a seed script that populates a fresh environment with enough realistic data to exercise the core loop and the authorization matrix (at least two distinct users plus anonymous). Tests and demos run against seeded environments, never production.
- **Backup and restore posture.** Record what the route provides (Supabase point-in-time recovery tier, Firebase scheduled exports, custom `pg_dump`/managed snapshots), the retention window, and who can trigger a restore. Production restoration is a founder-only gate.

## API Surface And Client Sync

Define how clients reach the data, per route:

- **Supabase:** PostgREST auto-API for CRUD under RLS, Postgres RPC functions for multi-step server logic, Realtime channels for live updates, Edge Functions for webhooks and third-party calls.
- **Firebase:** direct Firestore SDK reads/writes under security rules, snapshot listeners for realtime, Cloud Functions (callable + HTTPS) for server logic and webhooks.
- **Custom:** an explicit REST (or RPC) API with versioned routes; realtime via WebSocket or server-sent events only if the product needs it — do not build a realtime layer speculatively.

Mobile-client considerations apply on every route:

- **Offline and optimistic UI.** Decide per surface whether writes are optimistic with rollback, queued offline, or online-only — and record it; the 11-star core loop usually demands optimistic writes on the primary action.
- **Token refresh on native clients.** Sessions outlive app launches; the client must refresh tokens silently and recover from refresh failure without dumping the user to login mid-action. Test the expired-token path explicitly.
- **Pagination.** Every list the product can grow unbounded gets cursor/keyset pagination (or Firestore query cursors) from day one — never offset pagination on a feed.
- **Webhooks.** RevenueCat and Stripe webhooks land on a server surface, never in the client: Supabase Edge Functions, Firebase Cloud Functions, or custom API routes. Verify signatures, make handlers idempotent, and reconcile entitlements per `revenue-monetization.md`; set up and prove the endpoint per `provider-state-recipes.md`.

## Archetype Pack Adaptation

## Data Export And Portability

Define a user-data export before launch. List the included entities, file formats, media handling, request route, authentication check, delivery method, retention period, and deletion behavior. Use an open format when practical. Test one complete export and one failed or expired request. Record the owner and the recovery route. The export must match the data inventory and the privacy policy.

## Archetype Pack Adaptation

The shipped archetype prompt packs (`surfaces/starters/social-network`, `surfaces/starters/ai-chat-companion`) assume Supabase. When the founder selects Firebase or a custom backend, **adapt each schema/auth prompt to the selected route before running it** — do not run the Supabase prompts verbatim and patch the output later. Use this parity table when rewriting a prompt:

| Supabase concept (as shipped)      | Firebase equivalent                                                                   | Custom-backend equivalent                         |
| ---------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------- |
| Postgres tables + foreign keys     | Firestore collections/subcollections + reference fields (denormalize for query paths) | Postgres tables + foreign keys (unchanged)        |
| Row Level Security policies        | Firestore security rules (match blocks per collection)                                | Middleware authz layer per endpoint               |
| Supabase Auth                      | Firebase Auth                                                                         | Named auth provider/library in the contract       |
| Realtime channels / subscriptions  | Snapshot listeners                                                                    | WebSocket/SSE layer, only if specified            |
| Edge Functions                     | Cloud Functions                                                                       | API routes / background workers                   |
| Storage buckets + storage policies | Cloud Storage + storage security rules                                                | Object storage (e.g. S3-compatible) + signed URLs |
| `supabase` CLI migrations          | Data-shape versioning + backfill plan                                                 | Named migration tool                              |

For each adapted prompt, keep the product content (entities, the authorization matrix, the core-loop behavior) identical and swap only the route mechanics. The adaptation happens at prompt time, not patch time: rewrite the prompt's schema/RLS/Realtime instructions through the table above, run the adapted prompt, then reconcile the output with the `## Data Contract` section as usual. Record in `state/business-state.json` that the pack was adapted and to which route, so later sessions do not re-run the Supabase originals. New archetype packs should cite this reference from their schema prompts instead of restating route mechanics.

## Proof

The data contract is proven, not prose. Before the engineering lane claims the data layer done:

- **Authorization tests.** For each entity in the matrix, exercise at least: authenticated owner access (allowed), anonymous access (denied unless explicitly public), and other-user access (denied for owner-scoped operations). On Supabase this means RLS tests against a real database; on Firebase, security-rules tests via the rules emulator/test harness; on custom, authz middleware tests. A matrix row with no test is an open hole.
- **Migration proof.** Apply the full migration history (or, on Firebase, instantiate the documented data shapes) against a fresh environment and confirm the result matches the contract.
- **Seed proof.** Run the seed script against that fresh environment and confirm the core loop works against seeded data.

Record the commands and evidence paths in `engineering/PRODUCTION_READINESS.md`, and the backend-provider state (docs checked, preflight, validation, fallback) in `operations/PROVIDER_PROOF.md` and `state/business-state.json` per `provider-proof.md`. Evidence means the exact command, its environment, and where the output lives — for example:

```
authorization proof: npm test -- rls.spec.ts (dev Supabase project, seeded)
  owner read/write: pass | anon read: denied | other-user update: denied
migration proof: supabase db reset against fresh local stack — 14 migrations applied clean
seed proof: doppler run -- npm run seed:dev — core loop exercised as user-a and user-b
```

Never paste secret values or production data into proofs; reference secret-manager locations per `secrets-management.md`.

## Artifact Contract

`engineering/TECH_SPEC.md` must contain a `## Data Contract` section with these exact sub-section header strings — a deterministic validator greps for them:

- "Backend Selection"
- "Data Model"
- "Authorization Model"
- "Migrations And Environments"

For done-status engineering, additionally:

- "Backend Selection" names one route (Supabase, Firebase, or custom) with a recorded reason.
- "Authorization Model" names its enforcement mechanism: RLS, security rules, or middleware authz.
- The Authorization Model states the rules are tested and points at at least one artifact that exists on disk (RLS/security-rules test file, migration, or the proof doc recording the test run). A bare "RLS" in prose fails the done gate.

Validator: `npm run check:backend-contract -- --root . --state state/business-state.json`. Run it before claiming the engineering lane done; a failing run leaves the lane partial with a named blocker (`artifact-contracts.md`).

## Founder-Only Gates

Never perform these on inference; surface them as named founder actions:

- Creating backend accounts/projects or accepting billing (Supabase org/project, Firebase project + Blaze plan, hosting/database accounts for a custom backend).
- Deleting or restoring production data, including executing account-deletion purges against production.
- Cross-region or cross-project data moves.
- Switching the backend route mid-build (and the change cascade that follows).

## Anti-Patterns

- **Backend-by-default.** Supabase chosen by inertia because the archetype prompts say so, with no recorded selection or reason. Two minutes of recorded decision now beats a route migration later.
- **RLS written but never tested.** Policies or security rules that exist in a migration file but have never been exercised by an authenticated/anonymous/other-user test. Treat as absent; launch blocker per `security-release-hardening.md`.
- **Public storage bucket.** A bucket or container set to public-read — directly, or through a wildcard storage policy — so any guessed or leaked URL reaches another user's file. Treat exactly like a missing RLS policy: fix before launch, never "harden later."
- **Service-role key in the client.** Any build where the Supabase service-role key, Firebase Admin credentials, or an admin token reaches a client bundle. Rotate the key, fix the call path, route per `secrets-management.md`.
- **Supabase prompts against a Firebase decision.** Running the archetype pack's schema/RLS prompts verbatim after the founder selected Firebase or custom, planning to "translate later". Adapt first via the parity table.
- **Schema drift between environments.** Staging and production schemas that differ with no migration history explaining why — usually from dashboard edits. Every schema change goes through the migration tool or the data-shape changelog.
- **Account deletion as a UI promise.** A delete-account button that signs the user out or hides their profile while rows/documents persist with no purge path. The deletion path is a data-layer contract item reconciled with `privacy-terms.md`, not a frontend feature.
