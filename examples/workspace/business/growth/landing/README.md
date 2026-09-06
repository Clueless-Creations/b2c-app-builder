# Landing Section Library

This pack contains landing sections that use the project's own brand tokens. Read [`knowledge/design/landing-motion-craft.md`](../../../../../knowledge/design/landing-motion-craft.md) before use. Read [`knowledge/design/editorial-scrollytelling.md`](../../../../../knowledge/design/editorial-scrollytelling.md) before a scroll-led story. This is a **web-only** surface. Do not import `motion/react` in the mobile binary. `check:template-safety` enforces this boundary.

The table is an inventory. It is not a required page sequence. Select sections from audience, story, proof, and conversion evidence.

## What ships

| File                                   | Section                           | Signature motion                                                                |
| -------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------- |
| `sections/Hero.tsx`                    | Hero                              | gradient mesh, scroll parallax, word-by-word stagger, 3D tilt, baked-video slot |
| `sections/Marquee.tsx`                 | Trust marquee                     | seamless loop, pause on hover, edge mask                                        |
| `sections/Bento.tsx`                   | Conditional modular evidence grid | Use only when `DESIGN.md` explains why a grid fits the content                  |
| `sections/Scrollytelling.tsx`          | Evidence-led sequence             | stable anchors, measured progress, responsive sticky stage                      |
| `sections/Stats.tsx`                   | Stats                             | eased count-up on in-view                                                       |
| `sections/Testimonials.tsx`            | Testimonials                      | stagger reveal, cursor spotlight                                                |
| `sections/Pricing.tsx`                 | Conditional offer comparison      | Live billing toggle; the host design system owns the surfaces                   |
| `sections/Cta.tsx`                     | CTA                               | gradient morph, cursor spotlight                                                |
| `scrollytelling.portable.example.html` | Framework-neutral SSR specimen    | Complete static/final state and poster-or-omit Save-Data markup                 |
| `lib/scene-progress.ts`                | Framework-neutral scene model     | Measured progress, stable state binding, media-policy resolution                |
| `lib/scroll-scene-controller.ts`       | Framework-neutral scene runtime   | One shared listener, measurement, and animation-frame coordinator               |
| `lib/motion-tokens.ts`                 | —                                 | SSR-safe reader for the `--motion-*` tokens                                     |
| `motion.css`                           | —                                 | js-gated reveal utilities, marquee keyframes, reduced-motion collapse           |

## Drop-in

1. Write the page outline and conversion goal. If scrollytelling applies, write its story map. Give each beat one stable ID.
2. Select only the necessary sections. Do not copy source-site identity, claims, copy, or assets.
3. Copy the selected sections, `lib/`, and `motion.css` into a React SSR project. For Astro or static SSR, use the portable host contract below.
4. Install `motion` only when a selected section imports it. The scrollytelling controller does not require that package. Import the selected components into the page.
5. Load `design/system/tokens.css`, then `motion.css`. All durations and easings use the `--motion-*` tokens.
6. Replace placeholder copy with approved launch copy. Run the copy and landing gates.

## Portable host contract

`sections/Scrollytelling.tsx` is the React adapter. It is not the capability boundary.

For Astro, server templates, or static SSR, start from [`scrollytelling.portable.example.html`](./scrollytelling.portable.example.html). It is the executable markup contract, not an illustrative fragment. Preserve its root static/final state, progress variables, semantic list, figure description and caption, matching state IDs, and final ARIA state. Replace its copy and visuals.

Every `[data-scene-step-state]` must have exactly one `[data-scene-visual-state]` with the same stable ID. Missing, duplicate, or mismatched IDs cause the controller to skip enhancement and leave the static presentation in place.

Do not add a React island when the host can use the framework-light controller directly. Serialize the request-derived Save-Data Boolean into `data-scene-save-data`. When it is true, use the example's poster wrapper with `data-scene-poster-asset-id`, or its omitted wrapper with `data-scene-visual-omitted="true"` and no image/video source. CSS hiding cannot prevent a request already present in SSR HTML.

Register the static markup from one client module. Pass the same server-observed Boolean; the controller combines it with the browser preference without freezing HTML or SVG progress.

```ts
import { registerScrollScene } from "./lib/scroll-scene-controller";

document.querySelectorAll<HTMLElement>("[data-scene-track]").forEach((scene) => {
  registerScrollScene(scene, { saveData: scene.dataset.sceneSaveData === "true" });
});
```

## The progressive-enhancement contract (enforced, not aspirational)

- **Real text, always.** Copy renders in static HTML. Reveal animations apply only under `html.js` (`motion.css` adds the class gate; `lib/motion-tokens.ts` sets the class on hydration). JS off → the page is a calm, fully legible document.
- **No JavaScript and reduced motion preserve proof.** A final-only visual is valid only when semantic prose or captions contain every claim and proof. Otherwise, render static visual panels in document flow. Reduced motion removes travel and delay.
- **Save-Data limits media.** Pass the request-derived `saveData?: boolean` prop during SSR. The runtime ORs it with `navigator.connection.saveData`. When the prop is true, render a poster or omit the heavy source on the server. CSS hiding does not stop an image request. The prop supplies SSR state and controller policy.
- **Motion never gates LCP.** Sections server-render; choreography hydrates after. No animation may hide above-the-fold text — `check:landing-funnel` fails a landing build whose hero text is animation-gated or whose motion ignores reduced motion.
- **Tokens, not magic numbers.** Durations/easings come from `--motion-duration-reveal`, `--motion-duration-cinematic`, `--motion-easing-emphasis`, `--motion-easing-spring`, `--motion-stagger` (plus the base micro-motion scale). Rebrand the launch by editing `DESIGN.md` and re-promoting.
- **Narrative state has one owner.** Story anchors publish the active state and progress. A separate timer must not control meaning.
- **Layout changes trigger measurement.** Call `remeasureScrollScenes()` after locale or document-direction changes.

## Baked-video hero (opt-in)

`Hero.tsx` exposes a `videoSrc`/`poster` slot for a Remotion-rendered loop. It is opt-in and license-gated. Route it through [`knowledge/design/remotion-content-assets.md`](../../../../../knowledge/design/remotion-content-assets.md) and `strategy/TOOL_DECISIONS.md`. Without video, use a code-native treatment derived in `DESIGN.md`. Do not add an automatic gradient.

## Production notes

- Self-host the real display webfont (subset, `font-display: swap`, preload); the tokens' fallback stack is for dependency-free proofs only.
- Treat the supplied scrollytelling CSS as structure, not identity. Set its layout, stage, spacing, marker, and title variables from `DESIGN.md` before launch.
  - Layout: `--lm-scrolly-heading-columns`, `--lm-scrolly-layout-columns`, `--lm-scrolly-layout-gap`, and `--lm-scrolly-short-columns`.
  - Stage and copy: `--lm-scrolly-stage-height`, `--lm-scrolly-step-columns`, `--lm-scrolly-step-title-size`, and `--lm-scrolly-sticky-top`.
- A smooth-scroll layer (Lenis) is optional; if added it must degrade cleanly and respect reduced motion.
- Typography needs a semantic job. Do not use repeated slogans or giant words as filler.
- Keep exact localized beat text, captions, and accessible descriptions inside `scenes[].localizations` in `surface-contract.json`. Hash each exact localized string.
- Use generated media only through `growth/content-assets/CONTENT_ASSETS.md`. Record its narrative job, provenance, and fallback.
- Record current Chrome, Safari, and Firefox proof for short and tall desktop viewports.
- Record iOS Safari and Android Chrome proof for short and tall mobile viewports. Each QA row includes `browser` and `platform`.
- For every Tier 1 locale, prove each scene state in both directions and prove every fallback mode. Evidence fragments must resolve to real headings or anchors.
- Run `check:design-room`, `check:vibecoded-tells`, `check:scrollytelling`, and `check:landing-funnel` before handoff.
