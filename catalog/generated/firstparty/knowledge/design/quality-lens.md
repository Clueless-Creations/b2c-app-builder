# Consumer Quality Lens

Use this reference when a Design Room mutation needs taste, consumer-grade judgment, or inspiration. This is a lens applied to state, not a mandatory output template.

## What Good Means

A B2C mobile app launch design should feel:

- specific to the user's emotional job, not a generic SaaS wrapper
- coherent across app, landing, screenshots, email, paid creative, and store metadata
- honest about what the app can do today
- fast to understand in a tiny phone screenshot or short social hook
- durable enough that future agents can extend it without re-deciding the brand

The quality bar covers the complete accepted product: whether its design makes the promise credible, the full journey useful, and the business ready for people to use, share, and buy.

## 11-Star Lens

Apply the 11-star material from [`eleven-star-experience.md`](../experience/eleven-star-experience.md) as a filter over state:

- Which modeled surface proves the product's most valuable moment clearly?
- Which ambitious idea improves that experience, and what implementation would make it real?
- Does every required journey meet the accepted benchmark bar, including recovery and supporting business surfaces?
- Which screenshot, onboarding step, or landing promise would a real user retell?

Do not produce a 20-section ladder every time. Use the ladder to mutate the state where it matters.

For a complete-business mandate, do not lower the craft bar to an unfinished first release. Use [consumer-craft-benchmarks.md](consumer-craft-benchmarks.md) to select transferable reference principles. Freeze the criteria before production, then use [design-acceptance.md](design-acceptance.md) to check current native and landing evidence. Internal critique and repair continue under the same mandate.

## Inspiration Sources

Use [`design-evidence-stack.md`](./design-evidence-stack.md) to classify the design question and select evidence sources. Do not browse sources only because they match the team's taste. Record the source triage and adopted evidence in `DESIGN.md`.

After that evidence pass, use these additional routes when they apply:

- Google Labs `design.md` for token/prose design-system structure
- Refero for current UX patterns when available
- Taste-style review for visual distinctiveness and category fit
- Layers-style product clarity before surface polish
- Impeccable-style visual QA for typography, spacing, contrast, motion, responsive behavior, and UX writing
- `ui-ux-pro-max` skill for senior-grade UI direction, palette/typography pairings, and motion/anti-pattern checklists when web-surface or design-system direction needs a stronger start (reference-only; adapt, do not copy its data). Capture the adapted result in `state.designBrief` via `npm run seed:design-brief` so the theme stops being provisional.
- `motion-craft-benchmarks.md` for named, numeric in-app motion recipes after the 60fps.design evidence lane identifies the relevant mechanic
- Higgsfield for production-quality visuals when the founder approves paid/account-gated generation
- Remotion for repeatable local rendered assets from real UI, captions, and tokens

The result should be a state mutation: token, surface, claim, flow, screenshot, App Store page, or asset route.

## Anti-Generic Checks

Before a design state mutation is accepted:

- the page or screen uses the business's actual nouns and verbs
- the palette is not a single-hue default
- typography is purposeful and tied to the category
- mobile frames, store screenshots, and web panels share tokens
- app and store claims match real implementation scope
- generated visuals support real app UI instead of replacing it
- edge states are represented when they affect conversion or trust
- every visual decision traces to an audience fact in `strategy/RESEARCH.md`, and the direction shows no generic-template tell. [`audience-derived-identity.md`](./audience-derived-identity.md) carries the tells table, the derivation chain, and the logo-swap test.

If the mutation cannot pass these checks, keep the state in `draft` or `blocked`.

## Review Prompt

Use this compact review prompt for a Design Room pass:

```text
Review studio/seed/business.json and DESIGN.md through the consumer quality lens.
Name the one strongest inconsistency across app, landing, store, and marketing surfaces.
Propose one state mutation, not a new document.
Then apply design-worthiness.md. Do not invent a beauty score.
Escalate taste to the founder with the two taste-gate questions.
Then validate and render. Use Git history for revisions.
```
