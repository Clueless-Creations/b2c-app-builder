# 03 — Post Creation & Feed (the core loop)

This is the heart of the product and the 11-star magical moment. Start the feed **chronological** for the MVP — it is understandable, debuggable, and trusted. Move to ranked/hybrid only when you have engagement data to rank on (the video-first variant is the exception).

```
Build the core feed and post creation system.

Post creation:
- Compose box at top of feed with character counter (280 limit)
- Image upload support (up to 4 images per post, stored in Supabase Storage)
- Submit with Cmd/Ctrl+Enter keyboard shortcut
- Optimistic UI — post appears immediately before server confirmation

Feed:
- Shows posts from users the current user follows, plus their own posts
- Chronological order (newest first) for MVP
- Infinite scroll — load 20 posts at a time
- Each post shows: avatar, display name, @username, timestamp, post text, images
- Like button with count, Repost button with count, Reply button with count

Post interactions:
- Like/unlike toggle with animation
- Repost (no edit, just reshare with attribution)
- Reply creates a new post linked to the parent

Use Supabase real-time subscriptions so new posts from followed users appear
without refresh.

Strings: every user-facing label, headline, button, empty state, and error
comes from product/copy/COPY_DECK.md (author missing rows first — voice from product/copy/COPY_BRIEF.md,
craft from knowledge/words/conversion-copy.md), typed via the externalized resource
named in engineering/TECH_SPEC.md. Example copy in this prompt is voice guidance, not
shipping strings.
```

## Skill-integration notes

- **Run `eleven-star-experience.md` over this prompt** — the feed is the V1 scalable slice. The optimistic like/repost reveal and the real-time arrival of new posts are engineered emotional moments: give each a PostHog event and a `prefers-reduced-motion` fallback (`consumer-product-design-agency.md`, `emotional-design-system.md`).
- Media goes in **Supabase Storage**, never served from the app server. Validate file size/format on upload; flag image moderation as a launch gate (see the reference's moderation note).
- Add core-loop events to `analytics/ANALYTICS.md` before build: `post_created`, `post_liked`, `post_reposted`, `reply_created`, `feed_loaded`, `feed_paginated`.
- The follows-join feed query is the hot path — confirm it uses the indexes from prompt 01. Naive is fine early; record the scale threshold to revisit.
- Optimistic UI needs a rollback path on server failure — specify the error/retry state in `engineering/TECH_SPEC.md`.
</content>
