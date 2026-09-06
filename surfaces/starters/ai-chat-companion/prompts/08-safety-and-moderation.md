# 08 — Safety & Moderation (required before public launch)

An AI chat product will receive harmful, manipulative, and crisis content from day one. Safety is a launch gate, scaled to audience — and for companion/character apps or anything minors can reach, the bar is high and partly regulatory.

```
Add a safety and moderation layer to the AI chat.

Requirements:
- Input moderation: screen user messages before the model call; block or safe-
  handle disallowed content per a documented policy
- Output moderation: screen model responses before display; never show unsafe
  output
- Jailbreak resistance: the system prompt and a server-side check resist attempts
  to override the persona/boundaries or extract the system prompt
- Crisis handling: detect self-harm / crisis language and respond with a safe,
  non-judgmental message plus region-appropriate help resources; do not give
  harmful instructions and do not pretend to be a licensed professional
- Age gating: an age check at signup; if minors are in scope, apply stricter
  defaults and disclosures (and confirm legal requirements with the founder)
- Disclosure: the user is clearly told they are talking to an AI, not a human

Log moderation decisions (without storing the raw harmful content beyond what is
needed) and make the policy and thresholds config-driven.

Strings: every user-facing label, headline, button, empty state, and error
comes from product/copy/COPY_DECK.md (author missing rows first — voice from product/copy/COPY_BRIEF.md,
craft from knowledge/words/conversion-copy.md), typed via the externalized resource
named in engineering/TECH_SPEC.md. Example copy in this prompt is voice guidance, not
shipping strings.
```

## Skill-integration notes

- This is both a `security-release-hardening.md` item and an `ethics-guardrail.md` item. A companion that fosters unhealthy dependency, manufactures emotional pressure to retain or upsell, or implies it is human/licensed is a **dark pattern and a compliance veto** — not a polish item.
- Use the Claude API (or a dedicated classifier) for moderation; keep it server-side. Document the policy, thresholds, and escalation copy so they are reviewable, and reconcile AI-use, data-retention, and (if applicable) minor-safety disclosures in `privacy-terms.md`.
- The "you are talking to an AI" disclosure and the no-false-credentials rule are copy constraints in `strategy/BRAND.md §Voice` (Human-Centered AI honesty tier, `consumer-product-design-agency.md`).
- Add `input_moderation_blocked`, `output_moderation_blocked`, `crisis_protocol_triggered`, `jailbreak_attempt_detected` to `analytics/ANALYTICS.md` (counts, not raw content).
- Treat safety as a release gate in `engineering/PRODUCTION_READINESS.md`: do not call the app launch-ready from working chat alone.
</content>
