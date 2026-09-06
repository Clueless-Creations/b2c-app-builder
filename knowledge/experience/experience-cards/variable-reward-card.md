# Variable Reward Card

Part of the Experience Card deck. Read [`../experience-cards.md`](../experience-cards.md) first — it carries the card shape, the summary table, the Ethics Ladder/attestation contract, and the per-card routing. Apply cards via `EMOTIONAL_DESIGN.md` per `emotional-design-system.md`; HIGH-risk mechanics carry the full ethics contract in `ethics-guardrail.md`.

## Variable Reward Card

**One-liner.** Unpredictable positive outcomes delivered after an anticipation window produce
the highest engagement rate of any reinforcement schedule — because dopamine fires on the
wait, not the receipt.

**Risk tier.** HIGH — canonical in the [`../experience-cards.md`](../experience-cards.md) routing table and [`../ethics-guardrail.md`](../ethics-guardrail.md) §3.

### Bright Line / Dark Line

**Bright line.** The variation is real and every possible result serves the user's stated goal.
The user could receive any result in the range and feel the app worked for them. The mechanic
keeps users curious about their own progress, not anxious about an outcome they paid for.

**Dark line.** Applying variable reward to paid spend (loot boxes); engineering near-miss
signals to increase retry behavior; coupling the dopamine anticipation window to a spend prompt
on the same screen; using cosmetic variation to manufacture engagement without genuine
personalization.

### Full Card — Served by the Retention Mechanics MCP

This bundled file is the frozen free-layer stub: the deck's content boundary is
explicit as of Phase 3 (see `../experience-cards.md` §Live deck access). The full
annotation — citation-graded psychology, mechanism steps, real-app examples,
producer recipe, auditor signals, measurement events, mobile implementation +
reduced-motion recipes, and the guardrail's on-device verification contract — is
served live: `retention_get_mechanic("variable-reward")`, then
`retention_get_ethics_ladder("variable-reward")` before building. Without the server,
apply the deck contract in [`../experience-cards.md`](../experience-cards.md) and
the ethics contract in [`../ethics-guardrail.md`](../ethics-guardrail.md); the
Ethics Ladder's attestation requirements apply unchanged at this card's tier.

### Motion Binding (canon)

The celebrate-family spring canon stays pinned here so `check:motion-contract`
keeps this value undriftable: `.spring(response: 0.5, dampingFraction: 0.6)`. The full
platform recipes (SwiftUI, Flutter, React Native, web) and their reduced-motion
fallbacks are in the MCP-served card.
