# Variant — Image-First (Instagram model)

Apply after the text-first base (prompts 01–04), or fold these deltas into prompts 01/03 if image-first was chosen upfront. The five core systems are unchanged; only the content/media emphasis and a few surfaces change.

```
Modify the platform to be image-first like Instagram.

Changes from the text-first version:
- Post creation requires at least one image (text caption is optional)
- Feed shows images in a 2-column grid layout (not a timeline list)
- Post detail page shows the image full-width with likes and comments below
- Profile grid shows all posts as square image thumbnails
- Stories feature: images that expire after 24h, shown as circles above the feed
- Explore page is a mosaic of trending images

Keep the same backend schema but add:
- Required image field on posts
- Image aspect ratio stored (for proper grid display)
- Story table with created_at and 24h expiry logic

Strings: every user-facing label, headline, button, empty state, and error
comes from product/copy/COPY_DECK.md (author missing rows first — voice from product/copy/COPY_BRIEF.md,
craft from knowledge/words/conversion-copy.md), typed via the externalized resource
named in engineering/TECH_SPEC.md. Example copy in this prompt is voice guidance, not
shipping strings.
```

## Skill-integration notes

- Schema deltas (required image, stored aspect ratio, `stories` table with expiry) belong in prompt 01 / `engineering/TECH_SPEC.md`. Implement 24h expiry as a query filter on `created_at` plus a cleanup job — not by trusting the client.
- The grid feed and profile thumbnails change the layout but reuse the same feed query; the Explore mosaic overlaps with prompt 05 (discovery) — build them together.
- Stories are a high-engagement, time-boxed surface — a strong 11-star moment. Run `eleven-star-experience.md` and add `story_created`, `story_viewed`, `story_expired` to `analytics/ANALYTICS.md`.
- Image moderation is non-negotiable before public launch (see the reference's moderation note).
</content>
