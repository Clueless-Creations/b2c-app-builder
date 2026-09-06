# Design Room

Use the Design Room to review an app design. It is one generated, read-only page. It is not a design editor, state store, component library, or revision system.

## Authority

Root `DESIGN.md` is the authored global design system and routing index. It owns the shared experience direction, visual rules, token definitions, component policy, accessibility rules, and implementation constraints.

`studio/seed/business.json` holds structured screen and flow routes. It makes relationships visible to the renderer and validators. It does not replace the authored contract.

Use detailed files only when they improve the work:

```text
design/flows/<flow-id>.md              detailed journey or flow plan
design/screens/<screen-id>.md          screen purpose, states, copy, events, and proof
design/components/<component-id>.md    app-specific component contract
design/platforms/<stack>.json          selected native adapter map
```

Link every detailed file from `DESIGN.md`. Do not create a second global design document.

## Product Design Loop

Use the same sequence a consumer product team uses:

1. Define the brief, target user, problem, and success measure.
2. Map the journey and information architecture.
3. Plan the critical flows.
4. Specify screens, states, copy, events, and accessibility behavior.
5. Reuse a component contract or record a real component gap.
6. Prototype the key path and edge states.
7. Critique the work and record the accepted direction.
8. Implement the selected native adapter.
9. Verify behavior on the target platform.

Keep the current decision in authored files. Use Git commits, branches, tags, and diffs for revision history.

## Component Routing

Reusable contracts live under `<skill-root>/ui-library/components/`. `<skill-root>/ui-library/component-index.json` routes tools to them. A contract defines purpose, states, requirements, accessibility behavior, token references, and maturity. It does not prescribe SwiftUI, React Native, Flutter, or another framework.

Reference adapter manifests live under `<skill-root>/ui-library/adapters/`. An app can refine a contract in `design/components/<component-id>.md`. Record the selected native mapping in `design/platforms/<stack>.json`. The stack is a free-form slug. Examples include `swiftui`, `expo`, `react-native`, and `flutter`.

The selected adapter must point to real implementation code. Verified or stable claims also need proof. If no adapter exists, report the component as not implemented on that stack. Do not create empty adapter entries to imply parity.

## Review Page

Run the renderer after an authored design or structured route changes:

```bash
npm run validate:design-state -- --root /path/to/app
npm run check:design-md -- --root /path/to/app
npm run render:design-room -- --root /path/to/app
npm run check:design-room -- --root /path/to/app
```

The generated page is `design/design-room.html`. It presents:

- the product brief and visual direction
- flow and screen routes
- screen states and proof links
- component maturity and selected adapter coverage
- token samples and accessibility constraints
- open decisions, gaps, and review status

The page must identify the source revision or content hash. It must not contain editable state or its own version log.

## Scrollytelling

For a scroll-led landing or in-app story, load [`editorial-scrollytelling.md`](./editorial-scrollytelling.md). Add the story order, stable scene IDs, sources, responsive states, reduced-motion fallback, and viewport proof to the relevant screen plan. The Design Room shows the plan and proof; it does not become the runtime.

## Review Gate

A design is ready for review when:

- `DESIGN.md` states the current direction and links every detailed plan.
- Structured flow and screen routes match those links.
- Each critical screen covers default, loading, empty, error, offline, and permission states when applicable.
- Each component names its maturity and real adapter coverage.
- The selected stack has no implied implementation.
- Accessibility, reduced motion, copy, events, and proof paths are explicit.
- `design/design-room.html` is fresh and read-only.
- The complete design change is recorded in Git.
