# Mastery and Status Card

Part of the Experience Card deck. Read [`../experience-cards.md`](../experience-cards.md) first — it carries the card shape, the summary table, the Ethics Ladder/attestation contract, and the per-card routing. Apply cards via `EMOTIONAL_DESIGN.md` per `emotional-design-system.md`; HIGH-risk mechanics carry the full ethics contract in `ethics-guardrail.md`.

## Mastery and Status Card

**One-liner.** Earned status through visible skill levels, domain-vocabulary badges, and
social proof of progress gives users an intrinsic and social reason to continue beyond the
functional goal — because earned identity is self-reinforcing and publicly displayable.

**Risk tier.** MEDIUM — canonical in the [`../experience-cards.md`](../experience-cards.md) routing table and [`../ethics-guardrail.md`](../ethics-guardrail.md) §3.

### Bright Line / Dark Line

**Bright line.** The level label reflects genuine skill improvement measured by a real
behavioral metric documented in `analytics/ANALYTICS.md` and `engineering/TECH_SPEC.md`; the vocabulary is drawn
from the user's skill domain and feels earned; progress is always visible; and social display
is optional, with a clear opt-out.

**Dark line.** The mastery metric is a proxy engagement score with no relationship to real
skill improvement; level-up reveals gated behind a subscription paywall; near-level progress
bars hidden or reset on cancellation; the level-up reveal fires on the same screen as a
paywall CTA, weaponizing earned pride as a purchase trigger.

### Full Card — Served by the Retention Mechanics MCP

This bundled file is the frozen free-layer stub: the deck's content boundary is
explicit as of Phase 3 (see `../experience-cards.md` §Live deck access). The full
annotation — citation-graded psychology, mechanism steps, real-app examples,
producer recipe, auditor signals, measurement events, mobile implementation +
reduced-motion recipes, and the guardrail's on-device verification contract — is
served live: `retention_get_mechanic("mastery-and-status")`, then
`retention_get_ethics_ladder("mastery-and-status")` before building. Without the server,
apply the deck contract in [`../experience-cards.md`](../experience-cards.md) and
the ethics contract in [`../ethics-guardrail.md`](../ethics-guardrail.md); the
Ethics Ladder's attestation requirements apply unchanged at this card's tier.

### Motion Binding (canon)

The celebrate-family spring canon stays pinned here so `check:motion-contract`
keeps this value undriftable: `.spring(response: 0.5, dampingFraction: 0.7)`. The full
platform recipes (SwiftUI, Flutter, React Native, web) and their reduced-motion
fallbacks are in the MCP-served card.
