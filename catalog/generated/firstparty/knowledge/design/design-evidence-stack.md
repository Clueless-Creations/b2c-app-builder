# Design Evidence Stack

Use this reference before you plan, create, revise, audit, or implement a user-facing surface. It routes a design question to the right evidence source. It does not require a tour of every source.

This reference routes evidence gathering. Root `DESIGN.md` is the authored design authority. Record a design decision there in the words the decision needs. The old `Reference Evidence` table remains retired. Complete design acceptance uses the existing reference packs and frozen rubrics through [design-acceptance.md](design-acceptance.md); its strict check validates current capture, interaction, criterion, and scope evidence.

## Core Rule

Classify the decision before you search. Decide which sources fit the decision and why. Say when a source does not apply.

Use at least one relevant source for a new or materially changed user-facing surface. A small token-preserving correction can skip live research.

Use at least two sources for a high-impact or high-risk surface. These surfaces include onboarding, a paywall, the core loop, an AI trust surface, and the first frames of a store listing. Use one source for behavior or structure and one source for craft or validation.

Apply the B2C App Builder Craft Lens to every substantive design decision. It is internal design doctrine. It does not replace audience, behavior, trust, component, or experiment evidence.

For native mobile work, also apply [mobile-flow-craft.md](mobile-flow-craft.md). Research complete comparable journeys when the decision is flow-level. A gallery of disconnected screenshots cannot establish navigation grammar, interruption behavior, or one-way-door semantics.

## B2C App Builder Craft Lens

Before you converge on a solution:

1. Explore at least three meaningfully different concepts. Do not create three cosmetic variants of one idea.
2. Give objects physical presence. Define their layers, anchors, overlap, separation, tilt, collision behavior, shadows, and settle. Motion must carry convincing weight instead of arbitrary floating.
3. Make motion explain structure. Hover, press, drag, scroll, transition, and reveal behavior must clarify a relationship, state change, hierarchy, or content boundary.
4. Recompose mobile. Do not shrink a desktop composition. Choose a mobile hierarchy, focus model, stack, disclosure sequence, gesture model, and safe-area behavior.
5. Make each medium feel native. An article must support reading. A walkthrough must support guided action. A video must support time, playback, captions, and progress. Do not reduce a real medium to a decorative thumbnail.
6. Use restraint. Preserve quiet space around important content and interaction. Density, decoration, and simultaneous motion must not flatten the hierarchy.
7. Make microinteractions precise and responsive. Define immediate feedback, interruption, completion, and subtle spring behavior. Do not use slow fades as the default response to every state change.
8. Define the quality facets that matter for the surface. Examples include clarity, hierarchy, density, responsiveness, feedback, accessibility, trust, and emotional tone.
9. Separate structure, interaction, content, visual expression, and motion before you recombine them. Tune one variable at a time and compare it with the prior state.
10. Remove anything that does not improve the user job or a named quality facet. Compare the result with the current industry standard. State where it meets, exceeds, or deliberately breaks that standard.

## Flow-first research discipline

When the question concerns onboarding, paywalls, authentication, checkout, core loops, permissions, recovery, or another journey:

1. Name the exact question before opening a catalog.
2. Study the complete relevant flow for each selected product, not a cherry-picked hero screen.
3. Compare several relevant products when authorized evidence exists. Record the common spine and meaningful divergence.
4. Treat commercial success or ranking as context, not proof that a particular screen caused the outcome.
5. Stop at saturation: when another comparable flow no longer changes the working spec, record that and move on.
6. Preserve observations and stable source IDs in the reference pack. Expiring provider media is not durable evidence unless a permitted inspected capture is retained and hashed.

This method is adapted in part from Appllama's MIT-licensed research skill. It is provider-neutral. Do not harvest a provider library or turn a task-scoped research method into dataset extraction.

## Source Router

| Source                       | Use it for                                                                                                             | Evidence to capture                                                                                                 | Boundary                                                                                                                                                 |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Appllama`                   | Native mobile screen, complete-flow, and component research when the customer has authorized access                    | Question, selected apps/flows, stable source IDs, inspected screens/interactions, convergence, divergence, local decision | Optional provider. Use its upstream `appllama-usage` skill when connected. Do not copy its proprietary corpus, bulk extract it, or treat revenue rank as causal proof. |
| `60fps.design`               | Motion, transitions, gestures, loading, success, and the magical moment                                                | Two to four relevant examples; the trigger, timing, state change, interruption, and reduced-motion result           | Transfer mechanics only. Do not copy brand, assets, copy, exact layout, or generated code without adapting it to the product and token system.           |
| `catalogue.projectsbyif.com` | AI decisions, automation, trust, consent, sign-in, permissions, sensitive data, user control, and takeover or recovery | The pattern, its advantages, its limitations, and the reason for adoption or rejection                              | Prefer agency and clear limits. Keep attribution when an adapted artifact requires it.                                                                   |
| `abtest.design`              | Conversion, onboarding, paywall, checkout, engagement, retention, monetization awareness, and referral hypotheses      | The tested change, audience and context, metric, cited source, counter-metric, and a local validation plan          | Treat a result as a hypothesis seed. It is not transferable causal proof. Do not repeat a number or claim if its primary or cited source is unavailable. |
| `Design Spells`              | Delight, personality, micro-interactions, empty states, success states, transitions, and small moments of surprise     | The emotional principle, interaction mechanic, and why it fits this audience                                        | Inspiration only. Do not copy a branded asset, exact composition, or exact interaction sequence.                                                         |
| `UXSnaps`                    | Journey teardown, information hierarchy, onboarding, dashboards, content discovery, and flow critique                  | The observed pattern, claimed rationale, applicability gap, and local evidence that is still needed                 | Treat the breakdown as critique, not authority or causal proof.                                                                                          |
| `UI Playbook`                | Standard component selection and specification                                                                         | Function, states, focus and keyboard behavior, accessibility semantics, collision behavior, and responsive behavior | Use it as a specification seed. Confirm implementation details in current official platform or WAI-ARIA guidance.                                        |

When the Appllama MCP is connected and authorized for the acting member, load the upstream `appllama-usage` skill rather than duplicating its tool map here. The B2C workflow owns the research question, scope, adoption decision, and evidence contract. Appllama owns its provider-specific search syntax, pagination, credits, media behavior, and catalog semantics. If it is unavailable, choose a declared compatible source lane; do not imply Appllama was inspected.

When the 60fps MCP is connected, use `60fps_search_shots`, `60fps_get_shot`, `60fps_get_motion_breakdown`, and `60fps_get_related_shots`. If it is not connected, use the public catalog and the distilled recipes in `motion-craft-benchmarks.md`.

## Task Routing

| Design task                                                 | Suggested source lanes                                                                          |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Native mobile flow grammar or category convention           | Appllama when authorized; otherwise an approved mobile reference source plus official platform guidance |
| Motion or gesture                                           | 60fps.design; add UI Playbook when a standard component owns the interaction                    |
| AI, consent, authentication, permissions, or sensitive data | IF Design Patterns Catalogue; add UI Playbook for the component contract                        |
| Onboarding, paywall, checkout, retention, or referral       | Appllama when authorized for complete-flow structure, plus abtest.design/UXSnaps for hypotheses; add 60fps.design only when motion affects comprehension or feedback |
| Core journey or information hierarchy                       | Appllama when authorized or UXSnaps; add UI Playbook for each standard component that needs a full state contract |
| Brand delight, success, empty state, or a magical moment    | Design Spells plus 60fps.design when the idea moves                                             |
| Standard control, overlay, input, or notification           | UI Playbook; add IF when the control changes trust, consent, or user agency                     |

The task decides the sources. Taste does not decide the sources.

The B2C App Builder Craft Lens applies across every design decision. It does not count as a behavior or structure source in the two-source rule.

## Evidence Pass

1. Define the user job, surface, decision, and risk.
2. Decide which sources fit the decision. Say why a source does not apply.
3. Open only the sources you need. Apply the untrusted-content rules in `knowledge/operations/frontier-agent-operations.md`.
4. Collect two to four useful observations. For flow research, observations may summarize a complete comparable journey rather than four arbitrary frames. Do not save a screenshot without analysis.
5. Adopt or reject each principle. Map an adopted principle to an exact state path, semantic token, surface, component, or flow semantic.
6. Define the test, metric, counter-metric, accessibility result, and fallback that apply.
7. Mutate state. Update `DESIGN.md`. Validate, version, and render through the Design Room loop.
8. For implemented native flows, carry the accepted semantics into runtime interaction evidence through `design-acceptance.md`; the reference pack alone is not completion.

For a complete-business mandate, use [consumer-craft-benchmarks.md](consumer-craft-benchmarks.md) to calibrate the relevant native and landing surfaces. Record whether you actually viewed an image, observed an interaction, or read a description. Freeze the per-surface criteria before production. Keep the complete product scope through independent review and repair; a Design Room rendering alone cannot establish native or browser quality.

If an optional inspiration source is unavailable, distilled doctrine or official platform guidance may support a provisional design decision. They do not satisfy mandatory visual or interaction evidence. Resolve a declared, coverage-compatible alternative before locking the affected design. Do not invent source observations or silently substitute providers.

Source use is not acceptance. Audience research, product constraints, accessibility, trust, and local validation can reject a popular pattern.

## Working Check

- You can name the sources you used and the sources you skipped.
- Substantive design work applies the B2C App Builder Craft Lens.
- Flow-level work names the research question and studies journeys rather than isolated frames.
- An adopted principle has an adaptation, a state path or flow semantic, and a validation method.
- A high-impact or high-risk surface uses two complementary sources.
- A cited experiment or commercial rank is context/hypothesis evidence unless local evidence proves more.
- No decision copies source branding, assets, copy, or an exact layout.
- `DESIGN.md`, structured state, tokens, version, and render agree.
- Implemented native flows are not called design-complete without the applicable runtime evidence.

## Resolution and compatible alternatives

Freeze source provenance with each reference in the existing per-surface rubric. Rubric schema
version 2 records `resolution.status`, `observedAt`, `provider` and `sourceId`, plus `validUntil`
when the evidence has a declared expiry. Use `retained_snapshot` for a permitted inspected capture
whose bytes are retained and hashed. A signed URL expiring after a valid capture does not erase
that capture; conversely, an expired catalog response is not a successful observation.

Select alternatives in the order declared for the task's evidence requirement. For a static
onboarding-layout question, an authorized Appllama or Refero source can be followed by an authorized AppKittie
screen source when it supplies the required scope. A motion requirement needs an observed
interaction or recording, such as a suitable authorized 60fps shot. An internal procedure can
explain how to search, but cannot stand in for either of those observations.

Record an actual alternative with `substitutesFor` and its own resolved evidence. A declared
alternative does not grant connection or spending authority. Missing access must remain a named
hold. Do not silently switch an explicitly bound provider. If no permitted alternative covers the
requirement, leave the design lock unresolved and continue independent work.

`check:design-md` checks source resolution when DESIGN.md declares accepted scope. Final design
acceptance uses the same check. A provisional design document may exist before references resolve,
but cannot be presented as a passing accepted direction. Refresh older frozen rubrics explicitly;
do not invent their observation dates or claim that a source was inspected.
