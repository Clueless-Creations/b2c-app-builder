# Perceived Effort Delay Card

Part of the Experience Card deck. Read [`../experience-cards.md`](../experience-cards.md) first — it carries the card shape, the summary table, the Ethics Ladder/attestation contract, and the per-card routing. Apply cards via `EMOTIONAL_DESIGN.md` per `emotional-design-system.md`; HIGH-risk mechanics carry the full ethics contract in `ethics-guardrail.md`.

## Perceived Effort Delay Card

**One-liner.** Show the system working through the user's specific inputs — a narrated
processing moment that converts wait time into perceived craftsmanship and raises willingness
to pay.

**Risk tier.** MEDIUM — canonical in the [`../experience-cards.md`](../experience-cards.md) routing table and [`../ethics-guardrail.md`](../ethics-guardrail.md) §3.

### Bright Line / Dark Line

**Bright line.** The processing delay shows the user evidence of real work — a real API call,
real data processing, or real UI composition — narrated in the user's own language. The user
can cancel at any time. Accuracy of the steps is upheld: if the system says "Analyzing your 5
goals," it used all 5 goals in the computation.

**Dark line.** An artificial delay added by a sleep timer or arbitrary `setTimeout` with no
underlying computation — pure theater. Equally: a progress bar that advances randomly
regardless of real computation stages (a fake progress bar). A discovered fake delay produces
a trust collapse worse than no delay at all, triggers "just a spinner" and "doesn't actually
analyze" review clusters, and is a compliance veto.

### Full Card — Served by the Retention Mechanics MCP

This bundled file is the frozen free-layer stub: the deck's content boundary is
explicit as of Phase 3 (see `../experience-cards.md` §Live deck access). The full
annotation — citation-graded psychology, mechanism steps, real-app examples,
producer recipe, auditor signals, measurement events, mobile implementation +
reduced-motion recipes, and the guardrail's on-device verification contract — is
served live: `retention_get_mechanic("perceived-effort-delay")`, then
`retention_get_ethics_ladder("perceived-effort-delay")` before building. Without the server,
apply the deck contract in [`../experience-cards.md`](../experience-cards.md) and
the ethics contract in [`../ethics-guardrail.md`](../ethics-guardrail.md); the
Ethics Ladder's attestation requirements apply unchanged at this card's tier.
