# 01 — Database Schema (build first)

The foundation: conversations, messages, per-user usage metering, and (optionally) long-term memory. Get RLS right so one user can never read another's conversations.

```
Design a PostgreSQL database schema for an AI chat application (Supabase).

The product supports:
- Users with accounts (auth handled by Supabase Auth)
- Conversations: each user has many conversations, each with a title and timestamps
- Messages: each conversation has many messages with role (user/assistant/system),
  text content, token counts (input/output), the model used, and created_at
- Usage metering: track per-user message and token usage per billing period for
  free-tier caps and analytics
- Subscription status stored on the user (free / active / cancelled) and the plan
- Long-term memory: a per-user table of durable facts/preferences the assistant
  can recall across conversations (text + optional embedding for retrieval)

Create:
1. Full schema with all tables, columns, data types, and constraints
2. Indexes for the most-queried patterns (a user's conversation list, a
   conversation's messages in order, current-period usage lookups)
3. Row Level Security policies for Supabase so a user can only read/write their
   own conversations, messages, usage, and memory
4. A seed script with 2 test users, a few conversations, and sample messages

Output as SQL I can run directly in Supabase's SQL editor. If you include an
embedding column, use pgvector and note the extension to enable.

Strings: every user-facing label, headline, button, empty state, and error
comes from product/copy/COPY_DECK.md (author missing rows first — voice from product/copy/COPY_BRIEF.md,
craft from knowledge/words/conversion-copy.md), typed via the externalized resource
named in engineering/TECH_SPEC.md. Example copy in this prompt is voice guidance, not
shipping strings.
```

## Skill-integration notes

- Reconcile with `engineering/TECH_SPEC.md` (data model, API contracts, RLS). RLS here is critical: conversations are private user data — every table (conversations, messages, usage, memory) needs a tested owner-only policy referenced from `trust/SECURITY.md`.
- Token counts per message are the metering substrate for prompt 06 and for cost analytics — store input/output tokens and the model, not just text.
- The memory table (and any `pgvector` embeddings) is sensitive personal data — note retention and deletion in `privacy-terms.md`.
- Keep the schema stable across variants; companion/character and voice-first add columns (persona, audio URL) rather than reshaping the core.
- Seed data is development-only.
</content>
