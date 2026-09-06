# Variant — Companion / Character

Apply after the text base. Turns the assistant into a persona-driven companion or character. This variant **raises the safety bar** (prompt 08 becomes non-negotiable) because relationship dynamics, dependency, and minor exposure are real risks.

```
Modify the chat into a persona-driven companion/character experience.

Changes from the assistant version:
- Character definition: each character has a name, avatar, persona description,
  voice/tone, and backstory stored in the schema; the system prompt is built from
  it (extend the prompt 01 schema with a characters table and a user-selected
  active character)
- Character picker / creation: users choose a preset character or create one
- Relationship memory: the assistant remembers the user warmly across sessions
  (build on prompt 05), referencing shared history naturally
- Tone and pacing tuned for conversation, not task completion
- Optional: a lightweight affinity/relationship indicator that grows with healthy
  engagement

Hard rules (do not remove):
- The character always discloses it is an AI when asked and never claims to be a
  real human or a licensed professional
- No mechanics that manufacture guilt, fear of abandonment, or pressure to keep
  chatting or to pay
- Crisis and self-harm handling from prompt 08 always overrides the persona

Strings: every user-facing label, headline, button, empty state, and error
comes from product/copy/COPY_DECK.md (author missing rows first — voice from product/copy/COPY_BRIEF.md,
craft from knowledge/words/conversion-copy.md), typed via the externalized resource
named in engineering/TECH_SPEC.md. Example copy in this prompt is voice guidance, not
shipping strings.
```

## Skill-integration notes

- The "hard rules" are an `ethics-guardrail.md` compliance veto, not optional copy. Companion mechanics that exploit loneliness or manufacture dependency to drive retention/spend are dark patterns. Any affinity/streak indicator is a HIGH-risk card requiring an escape hatch, a counter-metric, and a truthfulness proof (`consumer-product-design-agency.md`).
- Persona/backstory is part of the system prompt — version it and review against `strategy/BRAND.md §Voice`; persona changes are `change-cascade.md` events.
- Age gating and minor-safety disclosures (prompt 08) are required; confirm legal requirements with the founder and reflect them in `privacy-terms.md`.
- Relationship memory deepens prompt 05's privacy/deletion obligations — "delete my data" must clear it.
</content>
