# 11-Star Experience

Use this after research and before product/design/build contracts harden. The goal is to force the product team to design the extreme experience first, then choose the smallest scalable slice that still carries the magic.

This reference is based on Brian Chesky's 11-star framework as summarized by Reid Hoffman: design the unreasonable end-to-end experience, then work backward to the feasible version worth building. Source: `https://reid.medium.com/how-to-scale-a-magical-experience-4-lessons-from-airbnbs-brian-chesky-eca0a182f3e3`.

## Contents

- Principle
- Required Artifacts
- Ladder Contract
- Surface Translation
- Product Document Section
- Design And Engineering Handoff
- Gates Before Build
- Common Failures

## Principle

Do not ask only "how do we make this better?" Ask:

- What would make a user tell everyone about this?
- What would the unscalable concierge version look like if we served one user by hand?
- What is absurd at 9, 10, and 11 stars?
- What is the feasible 6-7 star slice we can deliver in the accepted product?
- Which product, design, engineering, store, ad, onboarding, paywall, lifecycle, and support decisions must change because of that slice?

The point is not to ship the impossible version. The point is to make normal product decisions less timid.

## Required Artifacts

Create or update:

- `11_STAR_EXPERIENCE.md`: the product experience contract.
- `11-star-experience.html`: the visual ladder and surface storyboard. It can also be routed into `design/design-room.html`, but the dedicated board is preferred for founder review.
- `state/LAUNCH_TRACE.md`: trace rows that map the experience promise to product, design, engineering, analytics, revenue, store, content, and verification.
- `PRODUCT.md`: a section named `11-Star Experience` or a clear pointer to `11_STAR_EXPERIENCE.md`.
- `engineering/TECH_SPEC.md` or `engineering/ENGINEERING_PLAN.md`: implementation contracts for the complete product experience.

Update `state/business-state.json`:

```yaml
lanes:
  experience:
    status: "partial"
    evidence:
      - "11_STAR_EXPERIENCE.md"
      - "11-star-experience.html"
    blockers: []
```

## Ladder Contract

Use this ladder shape. The star labels should be product-specific, not copied from Airbnb.

| Stars | Role                 | Required Content                                                                        |
| ----- | -------------------- | --------------------------------------------------------------------------------------- |
| 1     | Failure              | What would make the user ask for a refund, delete, complain, or never return?           |
| 2     | Friction             | What technically works but feels slow, generic, confusing, or distrustful?              |
| 5     | Expected             | The plain version of the product promise: it works, but nobody talks about it.          |
| 6     | Better than expected | A polished version with the first clear user delight.                                   |
| 7     | Way beyond           | Personal, context-aware, or emotionally resonant behavior that feels made for the user. |
| 10    | Impossible concierge | The unscalable movie-scene version delivered by humans, magic, or huge cost.            |
| 11    | Absurd extreme       | The almost ridiculous version that reveals what the product is really trying to do.     |

Add a visible `Line of Feasibility` between the current shippable target and the impossible levels. The line forces the team to name what can be built now and what remains inspiration.

Reaching the 6-star ("better than expected") and 7-star ("made for me") levels is not a styling task — it is where engineered emotion lives. Use the Experience Cards in [`emotional-design-system.md`](./emotional-design-system.md) and [`experience-cards.md`](./experience-cards.md) to make these levels real, and produce `EMOTIONAL_DESIGN.md` before engineering handoff: Commitment and Variable Reward and Perceived Effort Delay typically elevate the 6-star level; Intent Mirroring and Identity/Mastery elevate the 7-star level. UX/onboarding audit findings should map to both a star level here and an Experience Card there.

For each star level include:

- short label
- user scene
- product behavior implied
- emotional reaction
- what the team learns from it

## Surface Translation

Every important product and launch surface must carry the same experience thesis.

| Surface               | 11-star question                                                                                | Output                                                                                               |
| --------------------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Product core loop     | What is the end-to-end result the user would retell?                                            | `PRODUCT.md`, `state/LAUNCH_TRACE.md`, `engineering/TECH_SPEC.md`                                    |
| Onboarding            | What makes the user feel understood before payment or setup completes?                          | `product/ONBOARDING.md`, `product/onboarding.html`, analytics events                                 |
| Paywall               | What makes purchase feel like unlocking momentum rather than hitting a toll booth?              | `revenue/REVENUE_OPS.md`, paywall copy, restore/legal state                                          |
| Paid UA               | What tiny paid creative can truthfully preview the product experience and be measured against revenue?    | `PAID_UA.md`, `CONTENT_ASSETS.md`, `analytics/ANALYTICS.md`, `revenue/REVENUE_OPS.md`                |
| Viral growth loop     | What product moment makes sharing, referral, or social participation feel natural?              | `VIRAL_GROWTH.md`, `analytics/ANALYTICS.md`, `state/LAUNCH_TRACE.md`                                 |
| App Store screenshots | What visual proof shows the magic in three frames?                                              | `APP_STORE_LISTING.md`, `SCREENSHOTS.md`, `CONTENT_ASSETS.md`                                        |
| Ad or creator hook    | What tiny version of the product experience can the ad itself deliver?                          | `growth/UGC_PLAYBOOK.md`, `growth/FASTLANE_OPS.md`, content scripts                                  |
| Landing page          | What is the one scene that makes the visitor understand the promise instantly?                  | landing page, GEO/SEO, analytics                                                                     |
| Lifecycle email       | What message would feel like the product remembered the user's goal?                            | `growth/EMAIL_OPS.md`, Resend templates                                                              |
| Support               | What recovery path would make a frustrated user trust the product more?                         | support docs, customer-success prompts                                                               |
| Engineering           | What state, data, API, permission, analytics, or fixture is required to make the accepted product experience real? | `engineering/TECH_SPEC.md`, `engineering/ENGINEERING_PLAN.md`, `engineering/PRODUCTION_READINESS.md` |

If a surface is not in scope, mark it `not needed` with a reason. Do not leave it blank.

**The five-second demo test.** When creator or paid distribution is in scope, the magical moment carries an extra bar: it must be showable in about five seconds of screen time inside someone else's content, understood without narration, and truthful without staged data (photograph the food → see the calories; upload the match → see what went wrong). Run the test while the ladder is still soft — a magical moment that cannot pass it either gets redesigned before the spec hardens or the launch plans distribution around channels that do not need it. `influencer-sponsorship-engine.md` owns the sponsorship-side consequences.

## Product Document Section

`PRODUCT.md` should include a concise section:

```markdown
## 11-Star Experience

Source: `11_STAR_EXPERIENCE.md`
Visual proof: `11-star-experience.html`

Experience thesis:

complete product experience:

Line of feasibility:

The defining moment the completed product must prove:

Build implications:
```

The product doc should not duplicate the whole ladder unless the launch is tiny. It should summarize the thesis and point to the visual board.

## Design And Engineering Handoff

Before implementation:

- `DESIGN.md` translates the emotional tone, visual metaphor, and interaction energy into tokens and components.
- `design.md` maps the magical moment to concrete screens, states, copy, motion, and analytics hooks.
- `product/ONBOARDING.md` reflects the user back to themselves before asking for payment or long setup.
- `engineering/TECH_SPEC.md` specifies every data/state/API/permission contract needed to deliver the complete product experience.
- `engineering/PRODUCTION_READINESS.md` defines proof for the magical moment, not just generic build success.

Use real constraints. If the 7-star idea requires unavailable data, blocked permissions, unsafe claims, or unsupported AI quality, either redesign the slice or mark the blocker explicitly.

## 11-Star Run Protocol

When the founder says "run an 11-star experience", "run it through the 11-star framework", "do an 11-star pass", or any equivalent, the **first output must be a written or updated `11_STAR_EXPERIENCE.md`** and **second must be `11-star-experience.html`**. Do not begin subagent code audits, UX audits, or implementation changes before both artifacts exist or are updated. This is a hard ordered sequence, not a preference.

**Ordered steps for any "11-star run" request:**

1. Read `eleven-star-experience.md` (this file) if not already loaded.
2. Read the existing `11_STAR_EXPERIENCE.md` if it exists; otherwise create it from `business/product/experience/11-star-experience/11_STAR_EXPERIENCE.md`.
3. Write or update `11_STAR_EXPERIENCE.md` with a complete ladder for this specific product. All seven star levels (1, 2, 5, 6, 7, 10, 11) must be present with product-specific labels, not Airbnb copy.
4. Write or update `11-star-experience.html` with the visual ladder, line of feasibility, complete product experience, and surface translation board.
5. Update `state/business-state.json` `lanes.experience` status and evidence fields.
6. Only after the above five steps: proceed to implementation changes, subagent code audits, or UX audit work.

If the founder asks for both "11-star experience" and "make your changes" in a single turn, produce the artifacts first, then apply changes using the complete product experience as the governing constraint.

## UX And Onboarding Audit Output Contract

When a UX or onboarding audit subagent produces findings, each finding **must** include:

- **star-ladder level**: which star level (1–11) the finding maps to in `11_STAR_EXPERIENCE.md` (e.g. "2-star friction", "5-star expected", "7-star way-beyond target")
- **file/component**: the specific file, screen, or component affected
- **recommendation**: what to change and why, grounded in the complete product experience
- **failure-card flag**: "open failure card: yes/no" with reason — if yes, include a draft card shape from `failure-cards.md`

Findings that do not map to a star-ladder level or do not reference `11_STAR_EXPERIENCE.md` are incomplete and must be rejected by the orchestrator. The orchestrator must convert starred findings into `state/business-state.json` updates or failure cards before claiming any progress.

## Copy Output Brand-Voice Attestation

Any copy recommendation output — onboarding copy, paywall copy, ad creative copy, store listing copy, email copy — must include a brand-voice attestation line:

> Brand-voice attestation: verified against `strategy/BRAND.md §Voice` and `design.md §Copy Rules`. Hard rules: [list any violated or confirmed rules from those sections].

If `strategy/BRAND.md` or `design.md` does not exist yet, flag that attestation is blocked and list it as a blocker in `state/business-state.json` before producing copy that will be used in production.

## Gates Before Build

Do not move to engineering handoff until:

- `11_STAR_EXPERIENCE.md` exists.
- the 1, 2, 5, 6, 7, 10, and 11-star ladder exists.
- the `Line of Feasibility` is visible.
- the complete product experience is named.
- at least product, onboarding, ad, App Store, and engineering surfaces are translated.
- `PRODUCT.md`, `DESIGN.md`, `product/ONBOARDING.md`, and `engineering/TECH_SPEC.md` either reference the experience contract or are explicitly not ready yet.
- `state/LAUNCH_TRACE.md` includes trace rows for the magical moment and accepted product experience.
- `11-star-experience.html` or `design/design-room.html` renders the ladder visually for founder review.

## Common Failures

- The artifact says "11-star" but only describes premium styling.
- The ladder copies Airbnb labels instead of mapping the current product's experience.
- The impossible levels are skipped, so the accepted product experience remains timid.
- The visual board exists but does not affect `PRODUCT.md`, `DESIGN.md`, `product/ONBOARDING.md`, `engineering/TECH_SPEC.md`, or launch surfaces.
- Ads and screenshots sell a different promise than the product can deliver.
- The engineering plan implements screens but not the state/data/API behavior needed for the magical moment.
- The 11-star board is prose-only and cannot be inspected visually.
- The line of feasibility is vague, so agents keep overbuilding or underbuilding.
- The founder asks for an "11-star run" and the agent loads this reference but proceeds directly to code audits or implementation without writing `11_STAR_EXPERIENCE.md` and `11-star-experience.html` first. The artifact is required before any downstream work, not after.
- UX audit findings are produced as narrative prose with no star-ladder level mapping. Findings that cannot be mapped to a star level cannot be integrated into the experience contract.
- Copy outputs include no brand-voice attestation. Copy changes produced without verifying `strategy/BRAND.md` and `design.md` hard rules drift from the experience voice immediately.
