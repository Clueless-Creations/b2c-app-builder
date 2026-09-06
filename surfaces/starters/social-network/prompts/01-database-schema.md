# 01 — Database Schema (build first)

The foundation every other system builds on. Get it right here; a wrong schema means expensive rewrites later. Default content format is text-first (X model) — apply a variant afterward for image- or video-first.

```
Design a PostgreSQL database schema for a social platform similar to X (Twitter).

Users can:
- Create accounts with username, email, display name, bio, avatar
- Post text content (up to 280 characters) with optional image attachments
- Follow other users (asymmetric — no mutual confirmation required)
- Like, repost, and reply to posts
- Receive notifications when someone follows them, likes, or replies to their posts

Create:
1. Full schema with all tables, columns, data types, and constraints
2. Indexes for the most-queried patterns (user feed, profile posts, notifications)
3. Row Level Security policies for Supabase (users can only edit their own data)
4. A seed script with 5 test users and sample posts for development

Output as SQL I can run directly in Supabase's SQL editor.

Strings: every user-facing label, headline, button, empty state, and error
comes from product/copy/COPY_DECK.md (author missing rows first — voice from product/copy/COPY_BRIEF.md,
craft from knowledge/words/conversion-copy.md), typed via the externalized resource
named in engineering/TECH_SPEC.md. Example copy in this prompt is voice guidance, not
shipping strings.
```

## Skill-integration notes

- Reconcile the output with `engineering/TECH_SPEC.md` (data model, API contracts, app states). The schema is the source of truth; keep them aligned.
- **RLS is the security lane.** Every table holding user data needs a policy and a test. Pull these into `trust/SECURITY.md` (`security-release-hardening.md`) and add visibility rules you'll need later: private accounts, blocks, and who can read DMs.
- Verify the feed query plan: a follows-join feed is the hot path. Confirm the indexes cover (follower → followed → posts ordered by created_at). It's fine to be naive at 100 users; record the bottleneck to revisit near ~10k.
- Keep the schema stable across variants — the image-first and video-first variants add columns/tables (media, aspect ratio, stories, video duration) rather than reshaping the core.
- Seed data is for development only; never seed production with test users.
</content>
