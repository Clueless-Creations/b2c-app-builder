# Consumer Craft Benchmarks

Use this reference when a complete consumer business needs a visual standard for its mobile app, landing page, and supporting surfaces. Choose the relevant principles before producing the candidate. The examples establish a bar for judgment. They do not prescribe one style or prove commercial success.

## What Was Inspected

Research date: 2026-09-04. The research inspected primary-source descriptions and public product imagery for all eight examples. It viewed grug screenshots in an Apple developer interview, official Airbnb release imagery, Duolingo's art-direction examples, and official screenshots or product images for Blippo+, Metaballs, Is This Seat Taken?, Hearing Buddy, and Structured.

These were reference images, not installed-app tests. They do not establish gesture timing, haptics, accessibility behavior, frame rate, purchase reliability, or current runtime quality. Airbnb imagery represents its 2025 release. Duolingo imagery illustrates its earlier art-direction system, not its current full app. Refresh the relevant flow before using a benchmark to judge an implementation. Do not label an image observation as an interaction observation.

Apple's [2026 awards page](https://developer.apple.com/design/awards/) identifies grug as Ocho's iOS app, Blippo+ as Panic's macOS experience, Metaballs as Apposite's sculpting experience, and Is This Seat Taken? as Poti Poti's puzzle game. Hearing Buddy is Lilly Seay's captioning app; Structured is unorderly's planner. These examples span different platforms and jobs. They are not interchangeable mobile templates.

## Reference Principles

| Reference           | Observed or source-described craft                                                                                                                                                                                                                               | Transfer to the business                                                                                                                                                                           | Do not infer or copy                                                                                                      |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Airbnb              | The inspected app image gives search clear priority, lets photography lead the content, and reserves dimensional detail for category objects. The design-system account defines components through function, required content, personality, and native behavior. | Specify recognizable product objects and reusable compositions; keep the interface coherent across discovery, decision, and action. Spend visual detail where it explains an important choice.     | Its marketplace taxonomy, specific icons, photography, or assumption that every product needs cards.                      |
| Duolingo            | The art-direction examples use a consistent shape language and expressive characters inside learning tasks. Its product principles describe repeated design cycles and long-term user value.                                                                     | Create an asset language that belongs to the product. Connect feedback, writing, illustration, and learning or progress to one user action. Keep repairing until the agreed criteria hold.         | A mascot, streak, notification strategy, or animation automatically improves every app.                                   |
| grug                | Sparse colored pages combine hand-drawn text, icons, and illustrations. Its creators describe building a stroke-rendering engine that also controls layout, animation, and interaction states.                                                                   | Treat the distinctive mechanism as an engineering requirement. Carry the chosen visual language into controls and edge states, not just the hero. A small product can be complete and exceptional. | Its typeface, voice, drawings, or a requirement to add accounts and cloud infrastructure when the job does not need them. |
| Blippo+             | The inspected program guide maintains its television world through typography, channels, information layout, and screen texture. Apple describes synchronized broadcasting and carefully built world details.                                                    | Align content production, navigation, motion, and interaction with the medium. Make deliberate unusual choices coherent throughout the experience.                                                 | CRT effects or dense television controls belong in an unrelated utility app.                                              |
| Metaballs           | The product image puts the sculpted object and manipulation space ahead of controls. The developer describes shape fusion, materials, direct manipulation, and usable exports.                                                                                   | Make the signature visual behavior part of the core job and useful output. Prototype technical feasibility before promising a physical interaction.                                                | Spatial hand gestures transfer unchanged to a phone, or a still image proves responsive manipulation.                     |
| Is This Seat Taken? | The inspected game image uses consistent outlines, restrained colors, expressive faces, and readable in-world feedback. The team describes removing mechanics after playtests and retaining details that serve the puzzle.                                       | Use visual expression to explain state and consequence. Remove distracting systems while completing the user journey. Give secondary interactions the same care as the main action.                | The game's palette, characters, or decorative density belongs in every business.                                          |
| Hearing Buddy       | The inspected caption screen makes readable conversation text central, with visible listening, summary, and settings controls. Its landing page describes and demonstrates the caption experience.                                                               | Build around the audience's actual access need. Use personality to support the task. Show credible product behavior in the landing page's first-value story.                                       | A marketing health claim is independently verified, or screenshots prove accessibility and speech accuracy.               |
| Structured          | The inspected phone image represents time through a continuous timeline, duration, icons, text, and completion controls. Apple describes its emphasis on readable planning and downtime.                                                                         | Turn the product's important relationship into an understandable visual object. Combine redundant cues, calm hierarchy, and one clear next action.                                                 | A timeline is suitable for every app or color alone communicates state.                                                   |

Primary sources: [Airbnb design system](https://medium.com/airbnb-design/building-a-visual-language-behind-the-scenes-of-our-airbnb-design-system-224748775e4e), [Airbnb release imagery](https://news.airbnb.com/product-releases/airbnb-2025-summer-release), [Duolingo art direction](https://blog.duolingo.com/shape-language-duolingos-art-style/), [Duolingo product principles](https://blog.duolingo.com/product-principles/), [grug developer interview](https://developer.apple.com/news/?id=ux44ymcr), [Blippo+](https://blippo.plus/), [Metaballs](https://www.apposite.ai/metaballs.html), [Is This Seat Taken? developer interview](https://developer.apple.com/news/?id=z12xq8fa), [Hearing Buddy](https://hearingbuddyapp.com/), [Structured](https://structured.app/).

## Turn Inspiration Into Acceptance

Use the existing reference-pack librarian and frozen rubrics under `design/reference-packs/` and `design/reviews/rubrics/`. Keep the product's authored scope in `product.yaml` and design authority in `DESIGN.md`.

For each important surface:

1. Name the user job, product object, state transition, and intended feeling. Select the benchmark that informs that decision.
2. Record the inspected artifact, source URL, date, observation kind, and limitations. Include visual evidence and complementary behavior or official platform guidance.
3. State the principle to adopt, how it changes this product, and the reference-specific treatment to reject.
4. Freeze criteria before the candidate is produced. Compare coherence, originality, craft, functionality, accessibility, motion, and identity across surfaces. Use `meets` or `exceeds` as the required floor for each criterion. Explain exactly what the words mean for the surface.
5. Implement the distinctive assets and interaction mechanics. Shared component contracts do not imply an implemented native adapter.
6. Review actual native and browser captures and observed interactions. Use [Design Acceptance Evidence](design-acceptance.md) to bind the review to the current implementation and rubric.
7. Repair each failed criterion, recapture, and obtain a new independent review. A strong average cannot conceal a failed criterion or missing native screen.

## Landing And Mobile Are Separate Deliverables

The landing page must communicate the product promise, show credible product value, and offer the next action the business supports today. A store download, working checkout, or useful web-to-app path may be appropriate. A waitlist is not a substitute for a working acquisition path when the mandate requires a business ready to sell.

Compose the landing separately for a phone and desktop. Test keyboard use, no JavaScript, reduced motion, and the actual conversion path. Use the same nouns, objects, assets, and visual rules as the mobile app without forcing identical layouts.

The native app must make first value and repeat use work on every selected platform. Verify loading, empty, error, offline, permission, text-size, screen-reader, and reduced-motion behavior where applicable. Verify purchases, restoration, entitlement loss, and recovery when they are part of the accepted business. The backend and provider evidence remain owned by their engineering and revenue contracts.

## Apply references to implementation

Use original shared assets and a deliberate visual vocabulary across surfaces.
Inspect actual renders to detect missing font registration, different objects,
and generic fallbacks. Shared filenames or copied token values do not establish
visual consistency.

Exercise data recovery and focus after every state-changing interaction. Preserve
the last good recovery point on failed writes. Surface malformed stored data
without silently replacing it. Test input and import errors in each surface that
supports them. Do not claim a native-only feature on a browser surface that lacks it.

Use the [execution loop](design-acceptance.md#execute-the-complete-design-loop).
The [examples area](https://github.com/Clueless-Creations/b2c-app-builder/tree/main/examples) supplies scoped implementation
references and captures. Reproduce the relevant checks on the current candidate;
then have an independent reviewer judge its interaction and recovery states.

## One Mandate, Complete Work

One shot means the builder owns the internal research, production, critique, repair, and verification loops under one founder mandate. It does not mean one model response, one unreviewed design attempt, or an excuse to ship a generic first draft. The design bar applies to the full accepted product and its supporting business surfaces.

Keep scope purposeful. Remove an unnecessary feature through the product decision process; do not drop a required journey to make a test pass. A schema-valid review establishes evidence integrity. Independent inspection establishes the recorded design judgment. Provider readback establishes provider behavior. Real transactions establish revenue. None substitutes for another.
