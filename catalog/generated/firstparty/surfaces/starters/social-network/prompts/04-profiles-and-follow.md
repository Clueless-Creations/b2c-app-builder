# 04 — Profiles, Follow System & Notifications

Completes the identity, social-graph, and engagement-notification systems. Following is asymmetric (X model): instant, no confirmation. Following someone makes their posts appear in your feed immediately; unfollowing removes them.

```
Build user profiles and the follow/unfollow system.

Profile page (/@username):
- Header with cover photo, avatar, display name, @username, bio, location, website
- Follow/Unfollow button (changes based on relationship status)
- Follower and Following counts (clickable to show lists)
- Tab navigation: Posts | Replies | Media | Likes
- Each tab shows the relevant posts in chronological order

Follow system:
- Follow/unfollow is instant (no confirmation required)
- When you follow someone, their posts appear in your feed immediately
- When you unfollow, their posts disappear from your feed
- Mutual follow indicator ("follows you back")

Notifications:
- Notification bell in navigation with unread count
- Notification feed: new followers, likes, reposts, replies
- Mark all as read button
- Real-time updates via Supabase subscriptions

Strings: every user-facing label, headline, button, empty state, and error
comes from product/copy/COPY_DECK.md (author missing rows first — voice from product/copy/COPY_BRIEF.md,
craft from knowledge/words/conversion-copy.md), typed via the externalized resource
named in engineering/TECH_SPEC.md. Example copy in this prompt is voice guidance, not
shipping strings.
```

## Skill-integration notes

- Notifications must be **async and not block the main request cycle** — generate them off the engagement write path (DB trigger or background job), not inline.
- The follow write is performance-sensitive (it changes every follower's feed). Confirm it scales with the prompt 01 indexes; keep it a simple insert/delete on the edge table, not a feed fan-out write at MVP scale.
- Add `user_followed`, `user_unfollowed`, `notification_received`, `notifications_marked_read` to `analytics/ANALYTICS.md`.
- Follow / new-follower is the first viral surface — connect it to `viral-growth-loops.md` (a new follower can trigger a welcome/notification email via `resend-email-ops.md`).
- Profile header design pulls from the Design Room tokens, not a one-off look.
</content>
