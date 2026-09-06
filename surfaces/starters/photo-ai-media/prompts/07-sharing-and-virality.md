# 07 — Sharing & Virality (optional)

The output *is* the ad: a striking before/after travels on its own. Build sharing as an instrumented growth loop, not a bare share button.

```
Add sharing and export to the generated outputs.

Requirements:
- Export/download in sensible sizes (original, social-square, story-vertical)
  via the native share sheet on mobile and direct download on web
- Before/after share formats: a side-by-side composite and a short
  reveal-animation export (downloadable video or GIF), generated server-side
  from the parent + output assets
- An optional branded frame on shared exports (app name + a short invite
  code/link) — on by default for free tier, removable by premium; the user
  always sees exactly what will be shared before sharing
- A share landing surface: the invite link resolves to a page showing a
  consented example transformation and the signup CTA, carrying the referral
  attribution
- Referral attribution: the share carries the sharer's code; signups from it
  are attributed; never expose the original private asset URL — shared media
  is an explicit, separate copy the user chose to publish
- Per-user controls: sharing is always opt-in per asset; nothing in the
  library is public by default

Strings: every user-facing label, headline, button, empty state, and error
comes from product/copy/COPY_DECK.md (author missing rows first — voice from product/copy/COPY_BRIEF.md,
craft from knowledge/words/conversion-copy.md), typed via the externalized resource
named in engineering/TECH_SPEC.md. Example copy in this prompt is voice guidance, not
shipping strings.
```

## Skill-integration notes

- This is the pack's `viral-growth-loops.md` hook: loop = generate → share before/after → viewer clicks the framed link → signs up → generates. Instrument every edge — share rate per generation, click-through, signup conversion, and inviter attribution — or the loop cannot be tuned.
- The branded frame doubles as the free-tier watermark decision from prompt 05; reconcile the two so premium "watermark-free" and "frame-free sharing" are one coherent entitlement (`revenue-monetization.md`, founder-gated).
- Privacy boundary: the library is private (signed URLs, prompt 03); a share mints a deliberate public copy. Never let referral mechanics leak private assets, and let users revoke a shared copy (takedown path threads into prompt 08). Likeness consent matters doubly here — sharing someone else's face is the user's action, but the example images *you* show on the landing page need explicit consent (`privacy-terms.md`).
- Shared content must already have passed output safety screening (prompt 08) — the share surface is where unsafe output becomes a public incident.
- Add `media_shared` (the lane's required event; with format + frame properties), `share_link_clicked`, `referral_signup_attributed`, `shared_copy_revoked` to `analytics/ANALYTICS.md`. Self-referral and incentive-abuse controls per `viral-growth-loops.md`.
