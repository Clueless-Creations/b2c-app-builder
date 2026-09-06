# 01 — Database Schema (build first)

The foundation: media assets (uploads and generated outputs), the generation ledger, and per-user credits/usage. Get RLS and Storage policies right so one user can never see another's photos — faces are sensitive data.

```
Design a PostgreSQL database schema for an AI photo/media application (Supabase).

The product supports:
- Users with accounts (auth handled by Supabase Auth) and a profiles table
  (display name, optional avatar, marketing-consent flag)
- media_assets: every media file the system knows about — user uploads AND
  generated outputs — with owner, storage bucket + path, kind
  (upload / generated / derived), mime type, width/height, file size,
  status (pending / ready / failed / removed), optional parent asset
  (which upload a generation came from), and timestamps
- generations: one row per generation request — owner, input asset(s),
  prompt/params (JSONB), preset/style id if any, status
  (queued / running / succeeded / failed / cancelled), provider + model used,
  provider job id, cost in credits AND estimated provider cost, error detail,
  started/finished timestamps, and the output asset id(s)
- usage_events / credits: a credit ledger (grants, purchases, spends, refunds)
  with a signed amount, reason, and reference to the generation or purchase —
  the user's balance is the sum, never a mutable counter

Create:
1. Full schema with all tables, columns, data types, and constraints
2. Indexes for the most-queried patterns: a user's library (media_assets by
   owner + created_at, filtered by kind/status), a user's generation history,
   and current-balance / period-quota sums over the credit ledger
3. Row Level Security policies for Supabase so a user can only read/write
   their own profiles, media_assets, generations, and credit rows (spends are
   insert-only from the server role, never client-writable)
4. Supabase Storage bucket definitions and policies: a private media bucket
   where every object path is prefixed with the owner's user id, with
   owner-only read/write policies — no public bucket for user media
5. A seed script with 2 test users, a few uploaded assets, one succeeded and
   one failed generation, and matching credit-ledger rows

Output as SQL I can run directly in Supabase's SQL editor.

Strings: every user-facing label, headline, button, empty state, and error
comes from product/copy/COPY_DECK.md (author missing rows first — voice from product/copy/COPY_BRIEF.md,
craft from knowledge/words/conversion-copy.md), typed via the externalized resource
named in engineering/TECH_SPEC.md. Example copy in this prompt is voice guidance, not
shipping strings.
```

## Skill-integration notes

- Reconcile with `engineering/TECH_SPEC.md` (data model, API contracts, RLS, Storage layout) before building clients. Every user-data table needs a **tested** owner-only policy (pgTAP, per `backend-data-contract.md`) referenced from `trust/SECURITY.md`.
- **Media is never served from the app server.** Files live in Supabase Storage; clients get short-lived signed URLs (prompt 03). Storage paths are owner-scoped (`<user_id>/...`) so the Storage policies can enforce ownership by prefix.
- The credit ledger is the metering substrate for prompt 06 — append-only, signed amounts, balance-by-sum. Cost per generation (credits and estimated provider cost) is what makes COGS visible; don't store text-only "success" rows.
- `generations.provider` / `model` are recorded values, not hardcoded choices — the provider decision is founder-gated (`paid-tool-routing.md`, `strategy/TOOL_DECISIONS.md`); the schema must survive a provider swap.
- Uploaded faces are biometric-adjacent personal data — note retention and deletion (asset rows AND storage objects AND any provider-side copies) in `privacy-terms.md`.
- Seed data is development-only.
