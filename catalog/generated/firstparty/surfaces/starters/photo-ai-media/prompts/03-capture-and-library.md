# 03 — Capture & Library

The media spine: getting photos in, storing them privately, and showing them back fast. The **before/after reveal** built here is the 11-star magical moment — everything else exists to set it up.

```
Build the photo capture/upload flow and the media library.

Requirements:
- Upload from file picker and (on supporting devices) camera capture; accept
  JPEG/PNG/HEIC/WebP with a sensible max size
- Client-side resize/compress before upload (cap the longest edge, strip EXIF
  GPS data) so uploads are fast and we never store location metadata
- Upload to the private Supabase Storage bucket from prompt 01, under the
  owner-scoped path (<user_id>/uploads/...), creating a media_assets row
  (kind=upload, status=pending → ready)
- All display via short-lived signed URLs requested from the server — media is
  never served from the app server and the bucket is never public
- Library: a fast grid of the user's assets (uploads and generated outputs),
  newest first, with kind/status filters, skeleton loading, and empty state
  that points at the first upload
- Asset detail view: full-size image, metadata, and — when the asset is a
  generated output — a before/after reveal against its parent upload
  (slider or crossfade), plus actions (download, re-run, delete)
- Delete removes the media_assets row AND the storage object

Handle upload failures with clear retry; show per-file progress for multi-file
uploads.

Strings: every user-facing label, headline, button, empty state, and error
comes from product/copy/COPY_DECK.md (author missing rows first — voice from product/copy/COPY_BRIEF.md,
craft from knowledge/words/conversion-copy.md), typed via the externalized resource
named in engineering/TECH_SPEC.md. Example copy in this prompt is voice guidance, not
shipping strings.
```

## Skill-integration notes

- **The before/after reveal is the magical moment.** Run `eleven-star-experience.md` over it: the slider/crossfade against the original is the second the product proves itself. Name it as an engineered moment with a PostHog event and a reduced-motion fallback (`consumer-product-design-agency.md`, `emotional-design-system.md`, `design-visual-system.md`).
- Signed URLs are the privacy mechanism, not an optimization: short TTL, generated server-side, never cached into public CDN paths. The owner-scoped path + Storage policies from prompt 01 are part of `security-release-hardening.md`.
- Client-side resize is also a COGS control — smaller inputs mean cheaper provider calls in prompt 04. Stripping EXIF GPS is a `privacy-terms.md` line item.
- Deletion must be real: row + storage object (and provider-side copies once prompt 04 exists). Faces are biometric-adjacent data; "delete" that leaves the file in the bucket is a privacy violation.
- Add `media_uploaded`, `library_viewed`, `before_after_viewed`, `asset_deleted` to `analytics/ANALYTICS.md`.
