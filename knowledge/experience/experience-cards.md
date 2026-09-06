# Experience Cards

Use this when designing, auditing, or implementing emotionally charged moments in a B2C mobile
app. These cards are the canonical deck for the B2C App Builder skill. Each card
names a psychological mechanism, draws a bright/dark line, and gives you a deterministic
checklist for audit and ship.

**This file is the index.** Each file under [`experience-cards/`](./experience-cards/commitment-card.md)
is a compact routing stub — title, one-liner, risk tier, bright/dark lines, and a
served-by-MCP pointer (the three motion-bearing cards also pin their celebrate-family spring
canon for `check:motion-contract`). The full per-card specs (psychology + canonical research,
mechanism steps, real app examples, producer recipe, auditor signals, measurement events,
mobile implementation + reduced-motion, pairings) are served by the Retention Mechanics MCP —
see Live deck access below. Load **only the cards in scope for the current moment**; the
stubs are cheap, and the MCP serves full depth per card so loading the whole deck for a
single paywall pause is never necessary.

**Live deck access (Retention Mechanics MCP).** The deck behind this index is queryable live
when a `retention-mechanics` MCP server is connected (first-party; tools named
`retention_*`; registered as `retention-mechanics-mcp`). When it is connected, prefer it for
card routing and per-card content — it serves the maintained, versioned deck (per-card
`card_version`/`last_reviewed`, canonicalized risk tiers, attestation scaffolds) and exceeds
the bundled twelve in both count and depth: the bundled files route, the MCP serves the full
annotation for every card:

- `retention_search_mechanics` — search the deck by product moment, with funnel-stage and
  ethics-risk-ceiling filters; every result carries the card's do-not-use conditions, so a
  vocabulary match cannot pass as a situation-fit diagnosis.
- `retention_get_mechanic` — one full card, citation confidence passed through verbatim and
  real-app examples marked `illustrative_unverified`.
- `retention_get_ethics_ladder` — the risk tier, bright/dark lines, the attestation fields
  the validator requires at that tier, and a scaffold whose narrative fields are
  intentionally empty (the applying team writes them for its own surface).

The bundled files under `experience-cards/` are the frozen free-layer stubs of the deck's
twelve foundational cards and remain the offline contract at stub depth: every validator and
`npm run audit:ci` run reads the bundled files, never the network, and when the server is not
connected this index and the stubs stay authoritative for routing, risk tiers, the bright/dark
ship-gates, and the pinned motion canon. The full per-card spec is authoritative only through
a live MCP connection — the content boundary between the free layer and the maintained deck
is explicit as of Phase 3 of the deck migration.

**Pre-requisites.** Load these references before applying any card; do not duplicate their
content here:

- `knowledge/experience/eleven-star-experience.md` — star-ladder; every card maps to a level
- `knowledge/design/quality-lens.md` — emotional job, not a generic SaaS wrapper
- `knowledge/experience/onboarding-conversion.md` — paywall timing, App Review popup, consent
- `knowledge/data/analytics-attribution.md` — every emotional moment needs a named PostHog event
- `knowledge/design/design-room.md` / `knowledge/design/design-visual-system.md` — motion tokens and
  reduced-motion rules; every delight animation needs an OS-level fallback
- `knowledge/process/failure-cards.md` — dark-pattern violations become failure cards
- `knowledge/experience/ethics-guardrail.md` — Guardrail Contract, regulatory landscape, risk table

---

## Card Routing

One line per card: when to load it, and where the full spec lives.

| Card                       | Load when                                                                                        | Risk     | Spec                                                                                                               |
| -------------------------- | ------------------------------------------------------------------------------------------------ | -------- | ------------------------------------------------------------------------------------------------------------------ |
| Commitment                 | A voluntary user-authored goal can anchor the journey (onboarding goal question, plan setup)     | MEDIUM   | [`experience-cards/commitment-card.md`](./experience-cards/commitment-card.md)                                     |
| Variable Reward            | An outcome genuinely varies and a reveal moment exists (results, generations, daily pulls)       | **HIGH** | [`experience-cards/variable-reward-card.md`](./experience-cards/variable-reward-card.md)                           |
| Perceived Effort Delay     | Real computation runs on the user's behalf and can be shown honestly (plan generation, analysis) | MEDIUM   | [`experience-cards/perceived-effort-delay-card.md`](./experience-cards/perceived-effort-delay-card.md)             |
| Intent Mirroring           | A pause can reflect the user's own stated goal back (pre-paywall, return sessions)               | MEDIUM   | [`experience-cards/intent-mirroring-card.md`](./experience-cards/intent-mirroring-card.md)                         |
| Endowed Progress           | Real prior progress exists to surface before a multi-step task (setup, levels, profiles)         | LOW      | [`experience-cards/endowed-progress-card.md`](./experience-cards/endowed-progress-card.md)                         |
| Peak-End                   | A session has a natural emotional peak and a designable ending (completions, summaries)          | MEDIUM   | [`experience-cards/peak-end-card.md`](./experience-cards/peak-end-card.md)                                         |
| Streak & Loss Aversion     | Continuity itself is the value and a free recovery path will ship (habits, daily practice)       | **HIGH** | [`experience-cards/streak-and-loss-aversion-card.md`](./experience-cards/streak-and-loss-aversion-card.md)         |
| Reciprocity                | An unprompted, real gift can precede any ask (bonus content, surprise upgrades)                  | MEDIUM   | [`experience-cards/reciprocity-card.md`](./experience-cards/reciprocity-card.md)                                   |
| Identity & Self-Expression | Users can shape something that reflects who they are (avatars, spaces, collections)              | MEDIUM   | [`experience-cards/identity-and-self-expression-card.md`](./experience-cards/identity-and-self-expression-card.md) |
| Fresh Start                | A temporal landmark can reopen a lapsed journey without guilt (new week/month, post-milestone)   | MEDIUM   | [`experience-cards/fresh-start-card.md`](./experience-cards/fresh-start-card.md)                                   |
| Mastery & Status           | Skill genuinely grows and earned tiers can be shown truthfully (progressions, badges)            | MEDIUM   | [`experience-cards/mastery-and-status-card.md`](./experience-cards/mastery-and-status-card.md)                     |
| Recovery & Trust Repair    | A failure state (error, crash, failed payment, lapsed streak) needs to win trust back            | MEDIUM   | [`experience-cards/recovery-and-trust-repair-card.md`](./experience-cards/recovery-and-trust-repair-card.md)       |

---

## Card Shape

**Bundled stub field set** — what each file under `experience-cards/` carries on disk:

| Field                       | Meaning                                                                                                                        |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| **One-liner**               | Single-sentence description of what the card does                                                                              |
| **Risk tier**               | LOW/MEDIUM/HIGH, mirroring this index's routing table and `ethics-guardrail.md` §3 (the canonical pair the parity gate checks) |
| **Bright line / Dark line** | The ethics ship-gate summary; the full guardrail contract is MCP-served and in `ethics-guardrail.md`                           |
| **Served-by-MCP pointer**   | The `retention_get_mechanic` / `retention_get_ethics_ladder` calls that return the full card                                   |
| **Motion binding (canon)**  | Motion-bearing cards only: the pinned celebrate-family spring literal `check:motion-contract` keeps undriftable                |

**Full deck field set** — served per card by the Retention Mechanics MCP (not shipped in this
repo; the maintained deck is versioned per card):

| Field                                             | Meaning                                                                                              |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| **Emotional beat**                                | The precise feeling the card engineers, in the user's voice                                          |
| **Psychology + canonical research**               | Mechanism explanation with named sources; `attribution-uncertain` flags where replication is partial |
| **Mechanism steps**                               | Numbered implementation sequence                                                                     |
| **Real app examples**                             | Named apps, named moments, why it works                                                              |
| **When to use / When NOT to use**                 | Trigger conditions and explicit exclusions                                                           |
| **Producer recipe**                               | Step-by-step instructions for applying the card to a feature                                         |
| **Auditor signals — Present / Missing / Misused** | Three-bucket checklist for review                                                                    |
| **Measurement events**                            | Named PostHog events, required properties, what each proves                                          |
| **Mobile implementation + reduced-motion**        | Platform-specific code notes; OS reduce-motion fallback is mandatory                                 |
| **Bright line / Dark line / Guardrail**           | Ethics contract; deterministic ship-gate                                                             |
| **Pairs with**                                    | Other cards or references this card composes with                                                    |
| **11-star level**                                 | Star-ladder position from [`eleven-star-experience.md`](eleven-star-experience.md)                   |

---

## Summary Table

| Card                       | Emotional beat                                                  | Primary research                                              | 11-star level | Dark-line to refuse                                     |
| -------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------- | ------------- | ------------------------------------------------------- |
| Commitment                 | Ownership — "I said this matters to me"                         | Cialdini 1984; Locke & Latham 1990; Gollwitzer 1999           | 6–7           | Commitment used to manufacture guilt at paywall         |
| Variable Reward            | Anticipation-then-surprise — "I wonder what I'll get"           | Skinner 1938; Schultz 1997; Berridge 1996                     | 6–7           | Spend prompt on the same screen as the reveal           |
| Perceived Effort Delay     | Anticipatory trust — "It's working hard for me"                 | Buell & Norton 2011; Norton, Mochon & Ariely 2012             | 6–7           | Artificial sleep timer with no real computation         |
| Intent Mirroring           | Being seen — "This product understands what I want"             | Norman 2004; Gollwitzer 1999; Cialdini 1984                   | 7             | Mirror on cancel/unsubscribe flow as retention friction |
| Endowed Progress           | Momentum — "I'm already partway there"                          | Kivetz, Urminsky & Zheng 2006; Hull 1932                      | 6–7           | Phantom credits with no real product operation          |
| Peak-End                   | Elation-then-completeness                                       | Kahneman & Fredrickson 1993; Norman 2004                      | 6–7           | Manufactured ranking on day one                         |
| Streak & Loss Aversion     | Protective urgency — "I can't let this die"                     | Kahneman & Tversky 1979; Thaler 1980; Hull 1932               | 5–7           | Paid-only forgiveness with no free grace period         |
| Reciprocity                | Surprised gratitude — "They gave me something I didn't ask for" | Cialdini 1984; Eyal 2014; Fogg 2019                           | 6–7           | Gift withholds real value behind paywall                |
| Identity & Self-Expression | Ownership-pride — "This is mine; it reflects who I am"          | Norman 2004; Cialdini 1984; Norton, Mochon & Ariely 2012      | 7             | Identity anchor held hostage on subscription lapse      |
| Fresh Start                | Clean-slate optimism — "This is a new chapter"                  | Dai, Milkman & Riis 2014; Gollwitzer 1999                     | 6–7           | Temporal-landmark frame leads directly to paywall       |
| Mastery & Status           | Earned pride — "I've become someone who is good at this"        | Locke & Latham 1990; Eyal 2014; Deci & Ryan 1985              | 6–7           | Level-up reveal coupled with paywall CTA same screen    |
| Recovery & Trust Repair    | Relieved loyalty — "They handled that quickly and fairly"       | Kahneman & Fredrickson 1993; Norman 2004; Buell & Norton 2011 | 5–7           | Spend prompt inside failure/grief screen                |

---

## Ethics Ladder

**Variable Reward, Streak / Loss Aversion, Scarcity / Urgency, and Social Proof** are
HIGH-risk mechanisms per the risk table in `knowledge/experience/ethics-guardrail.md`. Before any of
these cards ships, the artifact doc (`product/ONBOARDING.md`, `PRODUCT.md`, or `ETHICS.md`) must contain
an experience-card attestation block with all five HIGH-tier fields filled:

```yaml
experience_card:
  id: "<card-slug>"
  mechanism: "<mechanism name>"
  applied_to: "<screen or feature name>"
  star_level: <int>
  posthog_event: "<primary event name>"
  bright_line: "<one sentence>"
  dark_line: "<one sentence>"
  guardrail: "<one sentence>"
  user_control_escape_hatch: "<where the user can disable or opt out>"
  ethics_attestation: "<reviewer name and date>"
```

Run `npm run check:emotional-design -- --root .` before marking any HIGH-risk card
launch-ready. The validator enforces that no required field is empty and that no
`spend_prompt_after_reward` pattern appears in the same screen scope.

All other cards require the four MEDIUM-tier fields: `bright_line`, `dark_line`, `guardrail`,
and (for Perceived Effort Delay) `effort_truthfulness_attestation`.
