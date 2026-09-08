# Design System And Visual Proof

Use this reference for app UI, onboarding, paywalls, landing pages, store creative, lifecycle surfaces, motion, and generated-app handoff.

Read root `DESIGN.md` first. It is the authored global design system and routing index. Follow its links to the flow, screen, component, and selected platform files that apply to the task.

Do not create another global visual-system document. Do not treat the Design Room as a source file.

## Working Model

The design model has four parts:

1. `DESIGN.md` records global decisions and routes the work.
2. Screen and flow files hold detail only where detail is useful.
3. Platform-neutral component contracts define reusable behavior.
4. Native adapters implement those contracts for the selected stack.

The Design Room renders these parts as one read-only review page. Git records revisions.

## Source Tooling

Use current source material when its details affect the work:

- Google Labs `design.md`: `https://github.com/google-labs-code/design.md`
- Impeccable: `https://github.com/pbakaus/impeccable`
- Taste Skill: `https://github.com/Leonxlnx/taste-skill`
- Layers Skills: `https://github.com/jamiemill/layers-skills`
- Refero: `https://doc.refero.design/llms.txt`, `https://api.refero.design/mcp`, and `https://styles.refero.design/`
- 60fps.design interaction references: `https://60fps.design/`
- Motion for React web surfaces: `https://motion.dev/docs/react`

Use [`design-evidence-stack.md`](./design-evidence-stack.md) to select references. Record what each adopted source changed. Do not copy a catalogue into the app repository.

When the founder or designer supplies an existing Figma file, read it through a Figma MCP server. Do not transcribe it by hand. Extract variables, styles, and Auto Layout data from the file. Never treat a screenshot as the design spec — a screenshot carries no token data. Map each extracted value into `design/system/tokens.*` and the UI-library component contracts. Route each value through one of three tiers. Base holds a raw value. Composite holds a combined primitive. Semantic holds a contextual alias.

Use [`paid-tool-routing.md`](../operations/paid-tool-routing.md) before a paid visual tool. Ask for the required authority before spend or account use.

## Routing Order

1. Load `flow-traceability.md` and [`eleven-star-experience.md`](../experience/eleven-star-experience.md). Identify the target transformation and feasible complete experience.
2. Verify the user need, domain language, conceptual model, journey, and information architecture before styling screens.
3. Study real category flows through `refero-ux-patterns.md` or an approved fallback.
4. Author the global direction and routes in `DESIGN.md`.
5. Derive identity from audience evidence with [`audience-derived-identity.md`](./audience-derived-identity.md).
6. Apply [`quality-lens.md`](./quality-lens.md), then audit typography, color, spacing, hierarchy, interaction states, responsive behavior, and UX writing.
7. Load [`premium-mobile-craft.md`](./premium-mobile-craft.md) for press feedback, motion, haptics, keyboard behavior, loading, and empty states.
8. Use [`motion-craft-benchmarks.md`](./motion-craft-benchmarks.md) for complex gesture, celebration, or continuity work.
9. Prototype the key path and edge states before implementation handoff.

When the surface uses a scroll-led story, load [`editorial-scrollytelling.md`](./editorial-scrollytelling.md) before selecting sections or writing animation code.

## Interface Review Companion

When an implementation exists, use the [Interfaces skills](https://github.com/jakubkrehel/skills)
as optional review guidance. `better-interface` routes accessibility, layout,
writing, typography, color, and UI polish to their owning `better-*` skills.
Open only the skills relevant to the selected screen and its states. Keep
`interface-review`, `explain-interface`, `break`, and `variant` user-invoked.
Do not install the pack or change an agent's tool settings as part of a review.
The operator may explicitly install it with `npx skills add jakubkrehel/skills`.

For a change review, `interface-review` resolves the diff and affected surfaces;
`better-interface` consolidates the findings. Record which screens, states,
platforms, and domains were inspected. Each finding needs source or runtime
evidence appropriate to its claim. Mark unavailable domains as not reviewed.
A source-only inspection cannot establish runtime contrast, focus behavior,
or motion quality. Write companion findings into the existing implementation
review, then repair and recapture affected states before acceptance.

This companion refines implementation quality. It does not replace audience
research, the accepted art direction, frozen reference rubrics, or independent
design acceptance. Keep the runtime review owner and evidence store unchanged.

## Brand Kit And Reference Roles

After art direction is accepted, record an Anchor Brand Kit inside the existing
`DESIGN.md` contract: typography, colors, imagery, composition rules, motion,
and examples of allowed and rejected treatments. Link any kit assets from that
section rather than creating another global design authority. The approach is
adapted from [Amir Mushich's Brand System Builder](https://github.com/amirmushichge/brand-system-skill),
licensed [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). This adaptation
uses the selected provider and the business's existing design and spending
authority; it does not require Lovart or import its approval prompts.

Assign each creative reference a role: brand identity, scene, composition, or
motion. A scene reference may guide a setting; it cannot change the approved
font, palette, logo, product claims, or interface. Before producing store,
landing, ad, UGC, or video assets, follow the brand consistency procedure in
[`remotion-content-assets.md`](./remotion-content-assets.md). Keep design
research before the kit and the kit before campaign variants.

## Communication And Composition Decisions

Record a concise communication brief in `DESIGN.md`: audience and situation, task, intended takeaway, next action, and uncertainty. Then state notice/read/understand/action order, related information groups, alignment, scale, text measure and the role of imagery. A decision may follow evidence, task clarity, accessibility, platform convention or a creative hypothesis; label which. Do not manufacture an audience fact to justify a font.

Define identity invariants separately from allowed variation. A campaign may change a scene, crop or rhythm while keeping the accepted voice, typography roles, product geometry and truthful claims. Record keep/remove/refine decisions against inspected output. If the concept fails the brief, restart the direction instead of accumulating surface patches. Inspect one derivative before scaling a batch.

Reference roles may include identity, behavior, typography, composition, scene, material, motion or product geometry. Each reference needs permitted influence, forbidden transfers and evidence modality. A text description of motion is not a viewed animation. A scene reference cannot supply a new certification, endorsement or product feature. Font resources and third-party imagery need their own rights evidence.

For a focused edit, load the affected section and preserve the accepted direction unless the brief or identity actually changed. Revalidate affected artifacts and acceptance inputs; a small edit does not preserve a stale global acceptance fingerprint.

## Root `DESIGN.md`

Keep global, durable decisions in root `DESIGN.md`:

- product experience and anti-patterns
- audience-derived visual direction
- semantic tokens and accessibility constraints
- navigation and surface inventory
- flow and screen index
- component reuse policy and maturity rules
- selected platform and adapter route
- motion, haptics, and reduced-motion rules
- web, store, icon, ad, and lifecycle direction when applicable
- proof expectations and open gaps

Use `design/flows/<flow-id>.md` for a detailed journey or flow. Use `design/screens/<screen-id>.md` for screen purpose, states, copy keys, analytics events, component use, accessibility, and proof. Link both from `DESIGN.md`.

Validate the portable contract when the tool is available:

```bash
npx @google/design.md lint DESIGN.md
```

If the tool is unavailable, record the blocker. Check the section order, token references, contrast, routes, and duplicate headings manually.

## Component Contracts And Native Adapters

Reusable contracts live at `<skill-root>/ui-library/components/<component-id>.md`. `<skill-root>/ui-library/component-index.json` routes tools to them. They describe purpose, states, requirements, accessibility, tokens, and maturity without choosing a framework.

Reference implementations live in `<skill-root>/ui-library/adapters/<adapter-id>.json`. Each manifest records its stack, native source symbols, implementation maturity, and proof.

App-specific contracts live at `design/components/<component-id>.md`. Use them only when the shared contract does not express a real product need.

The app records its native mapping at `design/platforms/<stack>.json`. The stack ID is an open slug, not a closed enum. Valid examples include `swiftui`, `expo`, `react-native`, and `flutter`.

Each adapter entry points to real native code. Use these maturity labels:

- `implemented`: native code exists and is linked.
- `verified`: current platform proof confirms the contract.
- `stable`: verified use exists across the supported states and product surfaces.

Do not list empty adapters. Do not infer cross-platform parity. A platform without a mapped implementation is unsupported until that work exists.

The bundled reference adapter currently covers SwiftUI. Expo, React Native, and Flutter remain valid adapter targets, not claimed implementations.

New screens use verified components by default. If a required component does not exist, make the component a design task before screen polish.

## Typography In Use

Choose type with the actual product text, target scripts and reading conditions. Serif, sans, script, handwriting, display and monospace describe possibilities; they do not establish modernity, luxury, emotional response or universal legibility. A distinctive display role must not silently become the font for small settings controls or error labels. Tabular numerals can align values without making the whole interface monospace.

Define heading, body, button, label and data roles in the existing typography contract. Include the actual family or system selection, supported weight, size, line-height, tracking and fallback; name font resources, rights, supported scripts and axes when using files. Semantic heading level follows the content hierarchy independently of apparent size. Test requested weights and glyphs rather than relying on the family name.

Inspect representative strings at their destination. Compare cap height, x-height, ascenders, descenders and diacritics: equal nominal sizes can appear and wrap differently. Leading is baseline-to-baseline distance; tight headings and loose body text are options, not fixed percentages. Tracking must respect shaping and ligatures. Refine prominent wordmark pairs optically without turning one pair adjustment into a global body-text rule. Small essential labels need readable weight and contrast rather than automatic thinness.

Use the implementation's actual sizing context. CSS absolute units satisfy `1in = 96px = 72pt`; this is a reference-unit relationship, not a hardware-pixel claim. `em` and `rem` depend on their element and root contexts. Native size and tracking mappings must be authored for their platform; do not silently convert a web relative unit into native points. Relative units alone do not establish accessible text resizing.

Check actual text contrast under the applicable standard and state. WCAG AA uses 4.5:1 for normal text and 3:1 for qualifying large text, with its stated exceptions; 7:1 is not the universal AA requirement. Contrast is one part of text accessibility. Keep dense or expressive compositions readable under supported user settings.

Before acceptance, inspect font loading failure, fallback wrapping, long localized labels, missing-glyph behavior, supported text scaling, user spacing and narrow layouts. Recompose grids and measure for the platform; neither twelve columns nor a fixed spacing increment is compulsory. Correct clipping or unavailable resources in the rendered output. A well-formed typography token proves its fields, not the appearance of the text.

## Tokens And Motion

Define semantic intent once in `DESIGN.md`. Token promotion emits this small portable set:

```text
design/system/tokens.json
design/system/tokens.css
design/system/DesignTokens.swift
design/system/design-tokens.ts
design/system/design_tokens.dart
```

Generated files are implementation artifacts. Do not hand-edit them. An app uses only the output for its selected surface. The other files keep future adapters mechanical and do not claim component parity.

Motion is a shared semantic contract with native implementations:

- SwiftUI uses native animation and the selected Swift token output.
- Expo or React Native uses the selected animation library and TypeScript tokens.
- Flutter uses native animation APIs and Dart tokens.
- Web surfaces can use Motion with CSS or TypeScript tokens.

Honor reduced motion on every platform. Prefer opacity or an immediate state change when spatial motion is not essential. Never block first paint on animation.

## Visual Proof

Use the smallest proof that makes the decision inspectable. A prototype or HTML proof should show:

- token swatches, type, spacing, radius, and motion examples
- the critical mobile sequence and relevant edge states
- responsive web surfaces when the launch includes them
- store screenshot concepts when store creative is in scope
- source notes and status labels for generated or external assets

Use real copy and realistic content density. Include loading, empty, error, offline, permission, and reduced-motion states when they apply.

The Design Room can link or embed these proofs. It does not replace them.

## Scrollytelling

A scroll-led surface needs an evidence-led story map before animation work begins. Define:

- a clear user question for each scene
- stable scene and content IDs
- source and attribution for each claim
- the visual state before, during, and after the scene
- small-screen and large-screen behavior
- keyboard, touch, and assistive-technology behavior
- a reduced-motion path that preserves the story
- a static reading path when JavaScript or animation is unavailable
- viewport proof for representative mobile and desktop sizes

Keep critical copy in real document text. Use progressive enhancement. Keep choreography subordinate to comprehension and conversion. Load [`landing-motion-craft.md`](./landing-motion-craft.md) for web implementation rules and [`editorial-scrollytelling.md`](./editorial-scrollytelling.md) for the full content contract.

## Brand Vocabulary And Locked Design

Before rewriting user-facing copy, read `strategy/BRAND.md` and the brand vocabulary in `DESIGN.md`. Product-owned phrases require founder approval to change. A third-party intellectual-property review does not grant that approval.

When the founder names native production code as the visual authority, record the lock in `DESIGN.md`. Include the canonical source path, date, owner, locked properties, and role of generated assets.

Generated assets remain concepts when they conflict with locked native code. Correct misleading documentation before generating more alternatives.

## Handoff Gate

Design is ready for implementation when:

- `DESIGN.md` states the accepted direction and routes every critical flow and screen.
- Critical screens specify states, copy, events, accessibility, components, and proof.
- Component maturity and selected adapter coverage are honest.
- The selected platform map points to real code.
- Generated token outputs match the selected platforms.
- The prototype covers the key path and meaningful edge states.
- Scrollytelling has static, responsive, and reduced-motion paths when used.
- The Design Room is fresh, read-only, and linked to the current revision.
- The accepted change and review evidence are in Git.

## Common Failures

- A second global design document disagrees with `DESIGN.md`.
- The Design Room becomes an editor or private state store.
- Screen plans omit loading, error, offline, permission, or reduced-motion states.
- A component contract is mistaken for a native implementation.
- An adapter claims SwiftUI, Expo, Flutter, or another stack without code and proof.
- Generated images carry the brand while the real interface stays generic.
- Motion hides important content or fails without JavaScript.
- Visual proof uses different tokens or components from the shipped surface.
