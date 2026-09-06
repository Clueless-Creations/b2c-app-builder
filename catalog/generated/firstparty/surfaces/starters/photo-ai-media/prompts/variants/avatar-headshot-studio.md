# Variant — Avatar / Headshot Studio

Apply after the base. Turns the single-transform product into an identity-conditioned studio: the user uploads a training set of selfies, the system conditions a model on their face, and delivers a pack of generated avatars/headshots. This is the highest-consent, highest-retention-risk shape in the category — the product literally holds a model of someone's face.

```
Extend the generation product into an avatar/headshot studio.

Changes from the base:
- Training-set upload: a guided flow collecting N selfies (give clear
  guidance: varied angles/lighting, one face per photo, no sunglasses);
  validate count and quality client-side, screen each via the safety layer,
  and store them as a grouped training set under the owner-scoped path
- Explicit identity consent at training-set creation: the user confirms the
  photos are of THEMSELVES (or that they have documented consent of the
  person depicted); record the attestation with a timestamp — generating
  packs of someone else's face without consent is out of policy
- Identity-conditioned generation: a training/tuning job per training set
  through the provider adapter (this is a longer, costlier job — give it its
  own status surface and honest progress), producing an identity reference
  the pack generations use
- Pack delivery: one purchase/spend produces a pack of M generated headshots
  across the chosen styles; deliver into the library as a grouped pack with a
  "your pack is ready" notification/email, and let the user pick favorites
  and request a partial re-roll
- Identity-retention rules: the training set, the tuned identity model/
  reference, and any provider-side copies have a documented retention window
  and a one-tap "delete my identity data" action that destroys all three;
  deletion is verified, not best-effort

Strings: every user-facing label, headline, button, empty state, and error
comes from product/copy/COPY_DECK.md (author missing rows first — voice from product/copy/COPY_BRIEF.md,
craft from knowledge/words/conversion-copy.md), typed via the externalized resource
named in engineering/TECH_SPEC.md. Example copy in this prompt is voice guidance, not
shipping strings.
```

## Skill-integration notes

- Pack economics fit credit packs over subscription for the one-shot job-hunt occasion (prompt 06) — training is the big COGS line, so price the pack from measured training + generation cost. Founder-gated, per `revenue-monetization.md`.
- The tuned identity is the most sensitive artifact this skill's packs ever store: treat it as biometric-adjacent data with named retention, owner-only access, and provider-side deletion verified through the adapter (`privacy-terms.md`, `security-release-hardening.md`). The consent attestation and the anti-impersonation policy extend prompt 08 and are an `ethics-guardrail.md` compliance line — deepfaking a non-consenting person is a veto, not a setting.
- The "pack is ready" reveal is the 11-star moment at its strongest — and the strongest Variable Reward exposure (M outputs of your own face): the prompt-04 HIGH-risk contract applies in full, and partial re-rolls must not be engineered near-misses (`reward_variation_proof`).
- Training jobs run minutes, not seconds: honest progress (Perceived Effort Delay with `computation_type: real_api_call`) plus a leave-and-notify path via `resend-email-ops.md` — never a captive fake progress bar.
- Add `training_set_created`, `identity_training_completed`, `pack_delivered`, `identity_data_deleted` to `analytics/ANALYTICS.md`.
