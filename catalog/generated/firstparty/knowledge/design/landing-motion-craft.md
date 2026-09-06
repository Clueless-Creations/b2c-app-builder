# Landing Motion Craft

Use this reference before you build or animate a landing page, funnel page, or public web surface. Use `docs/prototypes/landing-motion-lab.html` as the local motion proof. Use motionsites.ai (`https://motionsites.ai`) only as an inspiration benchmark.

When the page needs a scroll-led story, also load [`editorial-scrollytelling.md`](./editorial-scrollytelling.md). That reference owns story maps, stable state anchors, measured progress, responsive composition, and scrollytelling proof.

## The two-lane content model

One brand timing system, two delivery lanes. Both read the same promoted `--motion-*` tokens (`design/system/tokens.css`, generated from `DESIGN.md` by `npm run promote:design-tokens`):

| Lane      | Tool                                                                       | Owns                                                                                      | Never does                        |
| --------- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | --------------------------------- |
| **Baked** | Remotion (`remotion-content-assets.md`)                                    | hero loop `.webm`/`.mp4` + poster, section media tiles, ad/store art — render once, embed | live scroll/hover/cursor behavior |
| **Live**  | DOM, CSS, and `motion/react` when needed (`https://motion.dev/docs/react`) | measured story state, in-view reveals, parallax, count-up, cursor response, and marquee   | frame-exact video output          |

Remotion renders frames. It does not own live DOM behavior. Record each baked-video choice in `strategy/TOOL_DECISIONS.md`. The choice uses the license gate in [`paid-tool-routing.md`](../operations/paid-tool-routing.md).

## The section library

`business/growth/landing/` ships reusable section code, `lib/motion-tokens.ts`, and `motion.css`. Treat this set as an inventory, not a page recipe. Select a section only when audience, story, proof, and conversion evidence require it.

Do not fill every slot. Do not apply a source site's palette, fonts, metaphors, claims, copy, layout identity, or assets. Transfer the useful mechanism and express it through the current design contract.

For scrollytelling, write the situation-to-mechanism-to-outcome-to-proof map before component work. The story anchors must drive the visual state. Do not use a separate narrative timer.

Two web-lane recipes live in the in-app benchmark file [`motion-craft-benchmarks.md`](./motion-craft-benchmarks.md): R9, the contained edge-warp scroll transition (margin, channel-split, and edge-proximity rules), and R1, asynchronous-grid hero liveness. Load it when a landing hero or scroll moment calls for either.

When the 60fps.design MCP is connected, the landing lane can ground a hero, scroll moment, or micro-interaction in a live exemplar the same way the in-app lane does — `60fps_search_shots` to find the pattern, `60fps_get_motion_breakdown` for its trigger/start→transition→end anatomy (tools and ground rules in `motion-craft-benchmarks.md` §Live Catalog Access). The shots are iOS in-app clips: adopt the mechanic, re-express it in `motion/react` on the `--motion-*` scale, and skip `60fps_get_motion_code` on this lane — its SwiftUI starter has no web target. motionsites.ai stays the landing benchmark; when the MCP is not connected, the section library plus R9/R1 remain the contract and searching is not required.

Before you draft section copy, load `knowledge/words/no-slop-writing.md`. Use the voice in `strategy/BRAND.md` and `11_STAR_EXPERIENCE.md`.

Host the supplied React adapters in Next.js App Router or another React SSR site. An Astro or static SSR host can render the semantic scrollytelling markup and register the framework-light controller directly. Scrollytelling does not require a React island. Use `motion/react` only for sections that need its choreography. Never import it in the mobile binary. `check:template-safety` enforces this boundary.

## The progressive-enhancement contract (enforceable)

Rules 1, 2, and 4 are mechanically enforced by `check:landing-funnel` when landing sources animate. Deploy gates and browser proof verify rule 3.

1. **Real text, always.** Above-the-fold copy exists in static HTML and is never animation-gated. Reveal states apply only under `html.js`. A final-only no-JavaScript visual is valid only when semantic prose or captions contain every claim and proof. Otherwise, render static visual panels in document flow.
2. **Reduced motion preserves proof.** Animated sources must include a `prefers-reduced-motion` rule. A final-only visual is valid only when semantic prose or captions contain every claim and proof. Otherwise, render static visual panels in document flow.
3. **Motion never gates LCP/INP.** Server-render or statically render content; hydrate choreography after. Entrance animation must not delay first paint or hide text from crawlers.
4. **Tokens, not magic numbers.** Durations/easings read the `--motion-*` scale. Raw millisecond literals in landing motion styles are flagged — retime the brand by re-promoting tokens, not by editing sections.
5. **Save-Data is separate.** Pass the request-derived `saveData?: boolean` prop during SSR. The runtime ORs it with `navigator.connection.saveData`. When the prop is true, render a poster or omit the heavy source on the server. CSS hiding does not stop an image request.
6. **Layout changes trigger measurement.** Call `remeasureScrollScenes()` after a locale or document-direction change.

## The landing motion token scale

The in-app micro-motion band (120–360ms) is deliberately too short for cinematic web work; the landing lane adds:

| Token                         | Default           | Use                                                                 |
| ----------------------------- | ----------------- | ------------------------------------------------------------------- |
| `--motion-duration-reveal`    | 600ms             | in-view reveals, word stagger                                       |
| `--motion-duration-cinematic` | 1200ms            | mesh drift, scrollytelling cross-fades, count-up, marquee base unit |
| `--motion-easing-emphasis`    | expo-out          | entrances that should feel decisive                                 |
| `--motion-easing-spring`      | springy overshoot | playful accents (toggle re-price, badges)                           |
| `--motion-stagger`            | 60ms              | per-item stagger step                                               |

These live in `DESIGN.md` → promoted into `design/system/tokens.css`, `tokens.json`, and `DesignTokens.swift` (`check:token-promotion` gates the hash). Remotion compositions read the same values so baked and live motion share one feel.

## Production floor (beyond the proof)

- **Type:** self-host the real display webfont (subset, `font-display: swap`, preload). The token fallback stack is for dependency-free proofs only.
- **Baked hero video:** opt-in per launch through the Remotion lane; always ship a poster and keep the mesh fallback.
- **Smooth scroll (Lenis):** optional; if adopted it must degrade cleanly, respect reduced motion, and be registered in `source-registry.yaml` before use.
- **Copy:** section copy passes the `no-slop-writing.md` self-check (§6) before `check:landing-funnel` runs — brand voice from `strategy/BRAND.md` wins over generic landing-page register.
- **Scrollytelling:** show the situation, mechanism, change, and proof. Do not use repeated slogans or giant words as evidence visuals.
- **Generated media:** use the approved content-asset route. Record its narrative job and provenance. Do not use it to hide weak state design.
- **Verification:** record Chrome, Safari, and Firefox proof for short and tall desktop viewports. Record iOS Safari and Android Chrome proof for short and tall mobile viewports. Run `check:design-room`, `check:vibecoded-tells`, `check:scrollytelling`, and `check:landing-funnel`.
