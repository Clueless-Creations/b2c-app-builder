# Variant — Video-First (TikTok model)

Apply after the text-first base, or fold into prompts 01/03 if video-first was chosen upfront. This is the one variant where the feed is **algorithmic from day one** — a pure chronological MVP does not work for short-form video.

```
Modify the platform for short-form vertical video like TikTok.

Core differences:
- Feed is full-screen vertical video (one video fills the entire viewport)
- Swipe up/scroll to next video
- Videos uploaded to Supabase Storage, served via CDN
- Video length limit: 60 seconds
- Auto-play with sound off (tap to unmute)
- Like, comment, and share buttons on the right side overlay (TikTok layout)

Video processing:
- After upload, generate a thumbnail from the first frame
- Store video duration for display
- Use Mux or Cloudflare Stream for video transcoding and adaptive bitrate

Algorithm for feed:
- Show a mix of followed accounts (40%) and algorithmic recommendations (60%)
- Track watch completion rate as primary engagement signal
- Videos watched past 80% get heavily weighted in recommendations

Strings: every user-facing label, headline, button, empty state, and error
comes from product/copy/COPY_DECK.md (author missing rows first — voice from product/copy/COPY_BRIEF.md,
craft from knowledge/words/conversion-copy.md), typed via the externalized resource
named in engineering/TECH_SPEC.md. Example copy in this prompt is voice guidance, not
shipping strings.
```

## Skill-integration notes

- Video transcoding (**Mux or Cloudflare Stream**) is a paid/account-gated provider and an external dependency — record the choice in `strategy/TOOL_DECISIONS.md` and route its keys through `SECRETS.md`. Confirm cost/egress assumptions; video is the most expensive media to serve.
- Schema deltas: `videos` table with duration, thumbnail URL, and a watch-events table (for completion-rate tracking) — add to prompt 01 / `engineering/TECH_SPEC.md`.
- Watch completion is the primary engagement signal and the ranking input. Add `video_view_started`, `video_watch_progress`, `video_completed` (with completion %) to `analytics/ANALYTICS.md` — these are required before the recommendation mix can be tuned.
- The 40/60 follow-vs-recommend mix is a starting heuristic, not a law — make it a tunable config and revisit with real watch data.
- Auto-play with sound off and tap-to-unmute must honor reduced-motion / data-saver preferences; specify fallbacks (`design-visual-system.md`).
</content>
