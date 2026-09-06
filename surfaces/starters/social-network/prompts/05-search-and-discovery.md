# 05 — Search & Discovery (optional)

Discovery is how new users find people to follow before their graph is built — critical for the cold-start problem. Build after the core loop is solid.

```
Add search and user discovery.

Search:
- Global search bar in navigation
- Search users by username or display name (live results as you type)
- Search posts by content (full-text search using PostgreSQL's tsvector)
- Results page with tabs: Users | Posts | Latest

Explore/Discovery page:
- Trending topics (most-used words in posts from last 24h)
- Suggested users to follow (users with most followers not yet followed)
- Recent popular posts from outside the user's network

Hashtag support:
- Detect #hashtags in post text and make them clickable
- Clicking a hashtag shows all posts containing it

Strings: every user-facing label, headline, button, empty state, and error
comes from product/copy/COPY_DECK.md (author missing rows first — voice from product/copy/COPY_BRIEF.md,
craft from knowledge/words/conversion-copy.md), typed via the externalized resource
named in engineering/TECH_SPEC.md. Example copy in this prompt is voice guidance, not
shipping strings.
```

## Skill-integration notes

- Full-text search needs a `tsvector` column + GIN index on posts — add it to the prompt 01 schema / `engineering/TECH_SPEC.md` rather than bolting it on ad hoc.
- "Live results as you type" needs a debounced, rate-limited endpoint — note it as an abuse/cost surface in `trust/SECURITY.md`.
- Trending = most-used words in the last 24h; keep it a cheap materialized/aggregated query, not a per-request scan. Strip stopwords.
- Suggested-users and recent-popular-posts are discovery loops — feed them into `viral-growth-loops.md` and add `search_performed`, `explore_viewed`, `suggested_user_followed`, `hashtag_clicked` to `analytics/ANALYTICS.md`.
</content>
