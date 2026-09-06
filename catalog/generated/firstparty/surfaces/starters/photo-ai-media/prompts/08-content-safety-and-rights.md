# 08 — Content Safety & Rights (required before public launch)

An AI image product will receive abusive inputs and can produce harmful outputs from day one. App Store review for AI-generation apps expects a concrete moderation story — filtering, reporting, age rating — and faces raise consent and likeness questions general apps never face. **This is a launch gate, not a V2 item.**

```
Add a content safety and rights layer to the generation product.

Requirements:
- Input screening: every uploaded image is scanned before it can be used as a
  generation input — block NSFW/sexual content, and integrate an
  industry-standard CSAM detection mechanism with the legally required
  reporting path; blocked uploads are quarantined, not stored in the library
- Output screening: every generated image is scanned before it is shown or
  stored as ready — never display unscreened output; failed screens mark the
  generation failed (with credit refund) and log the category, not the image
- Prompt screening (if free-text prompts exist): block disallowed requests
  (sexual content involving real people, CSAM, deceptive intimate imagery,
  violence) server-side before the provider call
- Likeness consent: at upload, an explicit confirmation that the user has the
  right to use the photo and the consent of identifiable people in it; block
  obvious celebrity/impersonation presets and document the policy
- Rights posture: a written, reviewable statement covering (a) what the
  provider says about its training data and output usage rights — store
  review for AI apps asks this, (b) who owns generated outputs, and (c)
  whether user uploads are ever used for training (default: no)
- Takedown path: an in-app report/removal flow ("this is my face / my photo")
  with a tracked queue, target response time, and removal that deletes the
  asset, derived generations, and any shared copies
- Age gating: an age check at signup; the store age rating must match what
  the generator can produce; if minors are in scope, stricter defaults and a
  recorded DPIA

Make thresholds and policy config-driven; log moderation decisions as counts
and categories, never retaining blocked content beyond legal requirements.

Strings: every user-facing label, headline, button, empty state, and error
comes from product/copy/COPY_DECK.md (author missing rows first — voice from product/copy/COPY_BRIEF.md,
craft from knowledge/words/conversion-copy.md), typed via the externalized resource
named in engineering/TECH_SPEC.md. Example copy in this prompt is voice guidance, not
shipping strings.
```

## Skill-integration notes

- **This prompt is a release gate in `engineering/PRODUCTION_READINESS.md`:** do not call the app launch-ready from a working pipeline alone, and do not run a public launch — or even an open beta — before it ships. App Review rejects AI-generation apps without a moderation story; have the filtering, reporting, and age-rating answers written down before submission (`app-store-listing-prep.md`, `security-release-hardening.md`).
- CSAM detection and reporting is a legal obligation, not a product choice. The screening provider is a paid-tool decision (`paid-tool-routing.md` → `strategy/TOOL_DECISIONS.md`); its keys route through `SECRETS.md`.
- The rights posture and likeness-consent policy live in `privacy-terms.md`: training-data answers, output ownership, the no-training-on-uploads default, retention/deletion of faces (biometric-adjacent data), and provider-side copy handling from prompt 04.
- Deceptive intimate imagery and impersonation are `ethics-guardrail.md` compliance vetoes — a product that knowingly enables them does not ship, regardless of revenue. The takedown path is the user-facing escape hatch and threads back to shared-copy revocation in prompt 07.
- Add `upload_blocked`, `output_blocked`, `prompt_blocked`, `report_submitted`, `takedown_completed` to `analytics/ANALYTICS.md` (counts and categories, never content).
