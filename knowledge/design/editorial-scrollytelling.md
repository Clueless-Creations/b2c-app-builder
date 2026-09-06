# Evidence-Led Editorial Scrollytelling

Use this reference when a public web surface needs a scroll-led story. It defines the story, state, controller, and proof contracts.

Do not add scrollytelling because the component exists. First prove that a sequence makes the subject easier to understand.

## Transfer Rule

Transfer mechanics from reference work. Never transfer its palette, typefaces, metaphors, claims, copy, layout identity, or assets.

Derive each visual decision from the current audience, evidence, brand, product, and conversion goal. Record that derivation in `DESIGN.md`.

## Audited Reference Lessons

The [Clueless Creations audit](https://github.com/Clueless-Creations/clueless-creations-site/commit/2a3935bfbc03efa36778792db3cca71494e57725) contributed four mechanics:

- evidence-first situation-to-mechanism-to-outcome-to-proof stories;
- semantic `StoryScene`, `StoryAnchor`, and `StoryVisual` roles;
- a narrow IntersectionObserver reading line;
- code-native evidence artifacts.

Its current mobile layout can let later states move beyond the inline visual. Large scroll jumps do not always sample each intermediate state deterministically.

The [Eduardo Martinez portfolio audit](https://github.com/Emuthmartinez/eduardomuth-site/commit/3f7574c178decbf2edfce997d8c6b9d0928cece8) contributed these mechanics:

- typed bilingual scene data;
- measured step centers and one shared progress protocol;
- responsive reader-line guide ratios;
- restoration, resize, and font-load measurement;
- separate no-JavaScript, reduced-motion, and Save-Data behavior.

B2C App Builder combines the story grammar and evidence discipline with the deterministic controller. It transfers no identity from either site.

## When Scrollytelling Applies

Use scrollytelling only when the reader must understand a change across two or more linked states. Good subjects include a process, system response, transformation, or evidence trail.

Do not use it for a list of unrelated benefits. Use a normal section, table, diagram, or static sequence instead.

Optional sections stay optional. Do not add a default stack of hero animation, marquee, bento grid, scrollytelling, stats, testimonials, and pricing.

## Build Order

Use this order:

1. Lock the audience, positioning, and claim ledger.
2. Write the situation-to-mechanism-to-outcome-to-proof map.
3. Render the complete semantic page without animation.
4. Author concrete HTML and SVG visual states.
5. Connect the measured state controller.
6. Recompose the page for mobile layouts and Tier 1 locales.
7. Harden accessibility, performance, browser proof, and deployment proof.

## Story Map

Write the story map before component work. Each scene must follow this semantic chain:

1. **Situation:** Show the condition, constraint, or uncertainty that existed.
2. **Decision or mechanism:** Show what the person or system did.
3. **Outcome:** Show the change that resulted.
4. **Proof:** Show the artifact, observation, or sourced result that supports the outcome.

Each beat has one semantic role and one visual state. A scene can cover multiple roles through multiple beats. Do not omit the mechanism and jump from a problem to a claim.

Use stable IDs. Copy edits and locale changes must not change an ID.

```ts
type StoryRole = "situation" | "need" | "decision" | "intervention" | "mechanism" | "outcome" | "proof";

type StoryBeat = {
  id: string;
  role: StoryRole;
  evidenceRef: string;
  visualJob: string;
  typographyJob: string;
};
```

Use `StoryBeat.id` for both the semantic anchor and its corresponding visual state. The supplied scaffold publishes the same ID through `data-scene-state` and `data-scene-beat`.

Use HTML for the reading sequence. Use HTML, SVG, and CSS for diagrams, interfaces, maps, records, and data states when possible.

## Visual Meaning Contract

Each scene visual must depict at least one of these items:

- the situation;
- the decision or mechanism;
- the change or outcome;
- the proof.

Do not use a repeated slogan, giant word, random object, decorative dashboard, or abstract glow as the main evidence visual.

Typography must have a semantic job. It can mark a source, quote, status, count, place, time, actor, or change in state. It must not repeat nearby prose only to fill space.

Keep labels, values, and relationships as real DOM or SVG text. Do not bake necessary text into an image.

## State And Controller Contract

The anchor is the source of narrative state. The visual never runs on a separate narrative clock.

Measure each step center after layout. Measure again after resize, orientation change, font load, locale change, or document-direction change.

After a host changes the locale or the document `dir`, call `remeasureScrollScenes()` after the new DOM and fonts are ready.

Choose a reader line for each responsive layout. The reader line is the viewport position where a step becomes active.

Use this formula with reader position `r` and adjacent centers `c0` and `c1`.

```text
t = clamp((r - c0) / (c1 - c0), 0, 1)
```

Use one controller to publish the state to the scene root. Use this protocol exactly:

```text
data-scene-state stable active visual state ID
data-scene-beat  stable active beat or state ID
data-scene-direction forward or reverse
--scene-p        normalized scene progress from 0 to 1
--beat-t         normalized progress between the current and next anchor
--beat-index     zero-based active beat index
```

Components can read this protocol through CSS or typed state. Do not create a second progress value for a child animation.

Use direct state changes when the story has clear discrete states. Use interpolation only for a relationship that changes continuously between two anchors.

Scroll down and scroll up must produce the same states in reverse order. Scroll-linked interpolation stops when scrolling stops.

A discrete state can use a short tokenized settle. The active state changes immediately and never lags behind the prose.

An ambient loop can use its own clock only when it carries no narrative meaning. Pause the loop when the scene is off screen.

## Portable Host Contract

`Scrollytelling.tsx` is a React adapter. It is not the capability boundary.

An Astro, server-template, or static SSR host starts from [`scrollytelling.portable.example.html`](../../examples/workspace/business/growth/landing/scrollytelling.portable.example.html). Treat that file as the exact markup contract. Preserve its root static/final state, progress variables, direction and lifecycle attributes, semantic figure and ordered list, matching step/visual IDs, and final ARIA state. Replace its copy and visual contents.

Every `[data-scene-step-state]` must have exactly one `[data-scene-visual-state]` with the same stable ID. Missing, duplicate, invalid, or mismatched IDs make `registerScrollScene()` warn and skip enhancement. The server-rendered final state remains the fallback.

Do not require a React island when the host can use the framework-light controller directly. Register each `[data-scene-track]` from a client module after SSR.

For a non-React host, serialize the request-derived Save-Data Boolean into `data-scene-save-data` and pass the same value to `registerScrollScene(element, { saveData })`. When true, never emit the heavy image/video source. Emit either:

- a lightweight poster wrapper with `data-scene-poster-asset-id`; or
- an empty wrapper with `data-scene-visual-omitted="true"` and no `img`, `video`, or `source` element.

The portable example contains both modes. CSS hiding is not network prevention.

## Sticky And Responsive Composition

The sticky stage and its text anchors must share one scene container. The real anchor layout creates the scroll runway.

On wide screens, use an asymmetric stage and reading rail when the story supports that composition. Keep the active copy within a stable reading band.

Do not shrink a desktop scene to make the mobile version. Author a mobile composition.

The mobile composition must include a clear guide. The guide can show the scene title, current beat, and progress. Keep it near the compact stage and out of the text path.

Test short and tall mobile viewports. The sticky stage must not cover the active copy, controls, browser chrome, or safe areas.

## Progressive Enhancement

JavaScript, reduced motion, and data saving are different conditions.

- **No JavaScript:** Render every heading, step, claim, and proof in semantic document order. A final-only visual is valid only when prose or captions contain every claim and proof. Otherwise, render static visual panels in document flow.
- **Reduced motion:** Remove travel, parallax, smooth interpolation, and delayed reveals. A final-only visual follows the same claim-and-proof rule. Otherwise, render static visual panels in document flow.
- **Save-Data:** Pass the request-derived `saveData?: boolean` prop to the SSR component. The runtime ORs this value with `navigator.connection.saveData`. When the prop is true, render a poster or omit the heavy source on the server. CSS hiding does not stop an image request. The prop supplies SSR state and controller policy. It does not intercept the network.

Provide a poster and a static evidence state for each video. Never require video playback to understand the claim.

Do not move focus, change the URL, or send screen-reader announcements on scroll. Decorative duplicates must use `aria-hidden="true"`.

## Generated Media

Use generated media only through the approved `growth/content-assets/CONTENT_ASSETS.md` route. Record its narrative job, source inputs, model, date, rights, locale scope, and fallback.

Generated media can provide atmosphere or a bounded evidence plate. It must not invent proof or hide a weak state model.

Reject generated media that adds illegible text, false product UI, unsupported people, false locations, or untraceable claims.

## Surface Contract

Record the decision in `growth/landing/surface-contract.json`. Use the shape in `knowledge/process/artifact-contracts.md`.

When scrollytelling applies, the contract must include:

- `applicable`, `evidence`, and `locales`;
- ordered `scenes` with narrative roles, stable states, visual jobs, and evidence IDs;
- source kind and content-asset IDs for heavy media and its Save-Data poster;
- `localizations` with exact locale-specific beat text, captions, accessible descriptions, copy keys, and SHA-256 digests;
- numeric desktop, mobile, and short-mobile activation guides;
- mobile, reduced-motion, no-JavaScript, and Save-Data modes;
- a `forward_reverse` proof flag for each scene;
- `qa` rows with browser, platform, viewport, locale, direction, mode, scene, expected state, result, and evidence.

Do not put localized `text`, `copy_key`, `copy_sha256`, `caption`, or `accessible_description` on the scene root. Put them in each locale row.

When it does not apply, record `applicable: false`, the evidence-based reason, and empty `scenes` and `qa` lists.

## QA Matrix

Record evidence for every applicable row.

| Test                       | Required proof                                                                                |
| -------------------------- | --------------------------------------------------------------------------------------------- |
| Forward and reverse scroll | Each stable state activates once in order and in reverse order.                               |
| Jump and restored position | The controller selects the correct state without sampling each earlier state.                 |
| Scroll stop and scrub      | Narrative motion stops and tracks the same anchor-derived progress.                           |
| Desktop                    | Current Chrome, Safari, and Firefox at short and tall desktop viewports.                      |
| Mobile                     | Current iOS Safari and Android Chrome at short and tall mobile viewports.                     |
| Resize and rotation        | Centers are measured again. The active state stays correct.                                   |
| Tier 1 locales             | Each state, direction, and fallback mode is proved against the localized layout.              |
| No JavaScript              | The complete reading sequence and proof remain available.                                     |
| Reduced motion             | No travel, parallax, autoplay, or delayed reveal remains.                                     |
| Save-Data                  | Heavy media stops. Code-native evidence remains usable.                                       |
| Keyboard and screen reader | DOM order, headings, links, focus, names, and decorative hiding are correct.                  |
| Slow device and network    | First text paint is not animation-gated. No scene causes harmful input delay or layout shift. |

Run these gates before handoff:

```bash
npm run check:design-room -- --root .
npm run check:vibecoded-tells -- --root .
npm run check:scrollytelling -- --root .
npm run check:landing-funnel -- --root .
```
