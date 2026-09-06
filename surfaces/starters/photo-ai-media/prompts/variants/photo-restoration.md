# Variant — Photo Restoration

Use this variant for a single-image restoration utility: upload a damaged, blurry, or faded photo and receive a restored version. Keep one input, one transformation, and one reveal. Record the selected archetype, scope, and excluded features in `product.yaml`, then render `PRODUCT.md`.

```
Slim the generation product into a single-purpose photo restoration utility.

Changes from the base:
- One flow: upload → restore → before/after reveal → download. No prompt
  input, no preset browsing; at most a small fixed set of modes (restore /
  colorize / upscale) as simple toggles
- The before/after slider IS the product: make the reveal the center of the
  detail view, defaulting to a draggable comparison against the original
- Single-generation pipeline: each restore is one generations row through the
  provider adapter with fixed parameters per mode; no re-roll spirals — the
  retry action exists for failures, and "try a different mode" is the only
  variation
- Keep the upload screening and output screening from the safety layer; the
  consent question simplifies (old family photos: the uploader attests they
  have the right to the photo) but does not disappear
- Pricing fits the utility shape: a small free allowance, then simple credit
  packs; watermark-free and full-resolution download as the paid unlock
- Cut everything the utility does not need from the UI: no studio chrome, no
  feed — library, restore, account

Strings: every user-facing label, headline, button, empty state, and error
comes from product/copy/COPY_DECK.md (author missing rows first — voice from product/copy/COPY_BRIEF.md,
craft from knowledge/words/conversion-copy.md), typed via the externalized resource
named in engineering/TECH_SPEC.md. Example copy in this prompt is voice guidance, not
shipping strings.
```

## Skill-integration notes

- Use prompts 00–04 and 08, with prompt 06 for the selected monetization model. The focused product scope keeps the UI small; the complete business plan still covers research, design, analytics, funnels, revenue, trust, launch, and operations. Apply each task according to its evidence and target requirements.
- The fixed-parameter, no-re-roll design *lowers* the Variable Reward exposure — say so in the ethics artifact rather than skipping the card: the reveal is still emotionally engineered (family photos cut deep) and still needs its attestation, escape hatch, and honest progress per `ethics-guardrail.md`.
- Old family photos are often of deceased or non-consenting relatives; keep the rights attestation from prompt 08 in its simplified form and the takedown path intact (`privacy-terms.md`).
- Sharing restored family photos is a strong organic loop — the prompt 07 before/after share formats apply unchanged if the founder selects sharing.
- Keep the four lane events (`media_uploaded`, `generation_started`, `generation_completed`, `media_shared`) plus `restore_mode_selected` in `analytics/ANALYTICS.md`.
