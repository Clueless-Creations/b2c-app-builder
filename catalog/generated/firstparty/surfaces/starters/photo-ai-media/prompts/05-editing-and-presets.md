# 05 — Editing & Presets (optional)

Presets are how a one-trick transform becomes a product: named styles the user can browse, apply, and re-run with tweaks. Watermark-free export is the category's classic premium lever.

```
Add a preset/style system and lightweight editing on top of the generation
pipeline.

Requirements:
- A presets table: name, description, preview thumbnail, the parameter bundle
  it applies (JSONB), sort order, and a premium flag; presets are content the
  team curates, not user data — readable by all, writable by admin only
- A preset picker in the generation flow: visual grid with preview thumbnails,
  the premium ones labeled (not hidden)
- Re-run with tweaks: from any generated asset, "try another style" or adjust
  exposed parameters (strength, framing, palette) and submit a new generation
  that records the parent asset and the preset used — never mutate the
  original; every variation is a new generations row through the same
  idempotent, credit-checked pipeline from prompt 04
- A simple compare view between variations of the same source
- Watermark behavior: free-tier exports carry a small branded watermark;
  premium removes it — applied server-side at export time, never client-side
  only

Keep preset definitions data-driven so adding a style is a row, not a deploy.

Strings: every user-facing label, headline, button, empty state, and error
comes from product/copy/COPY_DECK.md (author missing rows first — voice from product/copy/COPY_BRIEF.md,
craft from knowledge/words/conversion-copy.md), typed via the externalized resource
named in engineering/TECH_SPEC.md. Example copy in this prompt is voice guidance, not
shipping strings.
```

## Skill-integration notes

- Re-runs go through the same pipeline as first runs: credit-checked, rate-limited, idempotent. A "tweak" that bypasses metering is a cost leak and an abuse vector (`trust/SECURITY.md`).
- "Try another style" multiplies the Variable Reward exposure from prompt 04 — the same HIGH-risk `ethics-guardrail.md` contract applies. Watch the `counter_metric` (regeneration spirals, credit-balance crashes in one session) and keep the escape hatch honest: never time a "one more try" nudge to the moment the balance hits zero.
- Watermark-free as a premium lever is a `revenue-monetization.md` decision (it shapes the free tier's shareability — the watermark is also organic attribution for prompt 07). Surface the tradeoff; the founder picks.
- Premium presets shown-but-labeled is paywall surface design (`onboarding-conversion.md`): the upgrade moment should land when the user wants a specific style, a real value moment.
- Add `preset_selected`, `generation_rerun`, `variation_compared`, `watermark_removed_export` to `analytics/ANALYTICS.md`.
