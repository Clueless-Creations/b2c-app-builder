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
- the palette supports semantic roles; a single hue is valid when sufficient
- typography serves the actual audience, content, language, and viewing conditions
- mobile frames, store screenshots, and web panels share tokens
- app and store claims match real implementation scope
- generated visuals support real app UI instead of replacing it
- edge states are represented when they affect conversion or trust
- material decisions distinguish audience evidence, creative hypotheses, legibility, and platform constraints; the reviewer judges their effect on the user job. [`audience-derived-identity.md`](./audience-derived-identity.md) carries the tells table, the derivation chain, and the logo-swap test.

If the mutation cannot pass these checks, keep the state in `draft` or `blocked`.

## Defect diagnosis

Review the actual candidate against its accepted communication priorities and constraints. A hash proves identity; a validator proves only the facts it checks. Neither proves comprehension or quality.

| Defect class | Distinguishing observation | Repair owner and smallest useful action |
| --- | --- | --- |
| Brief | The intended audience, first message, or next action is contradictory or unsupported | Product/design producer resolves the communication priority before restyling |
| Concept | The organizing idea conveys the wrong meaning or requires an irrelevant puzzle | Design producer revisits the concept; polishing spacing cannot fix the premise |
| Composition | Correct content is grouped incorrectly, focal points compete, or responsive stacking changes the message | Design producer changes grouping, hierarchy, rhythm, scale, or layers |
| Identity drift | A derivative changes the accepted logo, font, palette role, motif, or repeated control without an allowed variation | Asset or interface producer restores the invariant or requests an explicit contract revision |
| Typography | Actual font fails to load, glyphs fall back unexpectedly, role metrics collapse, or representative text clips | Interface/asset producer fixes the resource, role, fallback, or layout and re-renders |
| Implementation | Navigation, state recovery, keyboard order, reduced motion, or the selected renderer differs from the accepted contract | Implementation producer repairs behavior and supplies current runtime evidence |
| Claim | Copy or imagery asserts an unverified result, certification, testimonial, price, or implemented feature | Owning producer substantiates the claim from the approved source or removes it |

For each material finding name the surface/state, evidence, expected behavior, observed difference, consequence, severity, owner, and repair test. A high-impact concept failure can require new exploration. A local implementation defect usually preserves the accepted direction. Keep judgments and measurements separate; do not describe a predicted emotional response as observed.

A familiar icon pack, system font, rectangular list, monochrome palette, symmetry, or zero custom motion is a valid exception when it serves the audience and task. Several aesthetic warnings are prompts for inspection, never an automatic failure by count. Conversely, a novel hero cannot excuse broken recovery or false product claims.

A fresh reviewer must find a consequential seeded defect, explain a useful repair, and accept an appropriate conventional example without coaching. The repair producer then changes the artifact and supplies new evidence. Repeating design vocabulary does not pass this transfer exercise.

## Focused review

For a small repair, load the relevant knowledge section, accepted DESIGN.md decision, and affected dependencies. Keep accepted alternatives and identity intact unless evidence requires changing them. Review the affected states and shared consumers. The acceptance fingerprint remains global: a focused review does not preserve an old overall acceptance after any bound input changes.

For a bounded correction to an already accepted legacy design, the Design Room owner may use direct maintenance: preserve the accepted exploration and any existing foundation, change only the identified defect and affected dependencies, run `check:design-md`, regenerate the Design Room, run `check:design-room`, and run the affected token, asset, or implementation checks. Compare the change against the accepted contract in a fresh independent review. Adding a new product direction or replacing exploration is substantive work and uses the full Design Room workflow with its foundation requirement. Direct maintenance does not execute or mark that engine workflow accepted; a current acceptance requires its usual independent evidence.

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
