# Peak-End Card

Part of the Experience Card deck. Read [`../experience-cards.md`](../experience-cards.md) first — it carries the card shape, the summary table, the Ethics Ladder/attestation contract, and the per-card routing. Apply cards via `EMOTIONAL_DESIGN.md` per `emotional-design-system.md`; HIGH-risk mechanics carry the full ethics contract in `ethics-guardrail.md`.

## Peak-End Card

**One-liner.** Engineer one unforgettable in-session peak and a strong close; the remembering
self makes every re-engagement decision based on those two moments, not the average.

**Risk tier.** MEDIUM — canonical in the [`../experience-cards.md`](../experience-cards.md) routing table and [`../ethics-guardrail.md`](../ethics-guardrail.md) §3.

### Bright Line / Dark Line

**Bright line.** The peak moment celebrates the user's actual earned result — a computation,
milestone, or insight grounded in their real actions and data — and the session close confirms
their genuine accomplishment. Every personalization field referenced in peak or close copy must
trace to a field the user explicitly provided or a result the product computed from their real
activity.

**Dark line.** Manufacturing an emotional peak from fabricated or inflated results ("You're in
the top 5% of users!" on day one with no real comparison basis); using the peak as a warm-up
for an immediate hard-sell paywall on the same screen; triggering the peak animation on every
tap regardless of earned result; using the close state to inject anxiety ("Don't lose your
progress — subscribe now") rather than completing the session with satisfaction.

### Full Card — Served by the Retention Mechanics MCP

This bundled file is the frozen free-layer stub: the deck's content boundary is
explicit as of Phase 3 (see `../experience-cards.md` §Live deck access). The full
annotation — citation-graded psychology, mechanism steps, real-app examples,
producer recipe, auditor signals, measurement events, mobile implementation +
reduced-motion recipes, and the guardrail's on-device verification contract — is
served live: `retention_get_mechanic("peak-end")`, then
`retention_get_ethics_ladder("peak-end")` before building. Without the server,
apply the deck contract in [`../experience-cards.md`](../experience-cards.md) and
the ethics contract in [`../ethics-guardrail.md`](../ethics-guardrail.md); the
Ethics Ladder's attestation requirements apply unchanged at this card's tier.

### Motion Binding (canon)

The celebrate-family spring canon stays pinned here so `check:motion-contract`
keeps this value undriftable: `.spring(response: 0.45, dampingFraction: 0.7)`. The full
platform recipes (SwiftUI, Flutter, React Native, web) and their reduced-motion
fallbacks are in the MCP-served card.
