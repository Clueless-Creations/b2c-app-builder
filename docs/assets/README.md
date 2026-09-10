# Assets

Three drawing sheets and one design derivation. The SVG files are the source. Edit them directly.

| File                      | Used by                                 | Shows                                                                                                                                  |
| ------------------------- | --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `business-primitives.svg` | `README.md` header                      | Sheet 1. The kitchen layout, drawn in plan: six numbered stations, the pass, the door to the business, and the foundation in section   |
| `architecture.svg`        | `docs/north-star-architecture.md`       | Sheet 2. The target internal layers, drawn as a section with three levels and the evidence return paths                                |
| `station-detail.svg`      | `README.md`, under How it fits together | Sheet 3. One station in detail: the paywall operation at front of house, its bound provider, the knowledge it loads, the evidence back |

## Identity derivation

The derivation follows `knowledge/design/audience-derived-identity.md`. Every visual decision traces to an audience fact.

**Audience facts.** Readers are founder-operators and coding agents evaluating a platform that turns a mandate into a consumer-app business. They read on GitHub in light and dark themes, often at half width. The platform treats a claim as unproven until evidence exists.

**Category default to avoid.** The developer-tool README banner: a dark navy-to-black gradient card, rounded boxes in a row, a mint or indigo accent, Inter, and uppercase letter-spaced eyebrows. That default shipped in PR #118 and failed the repo's own tells list on four rows.

**Metaphor.** A drawing set for a kitchen. The [ethos](../ethos.md) describes the platform as the layout of a kitchen that turns out consumer-app businesses, with the founder as executive chef and the agents as the brigade. Sheet 1 is the plan of that whole layout; station 2's display label is Prep & design (Product and Experience), not a second nested kitchen. Sheet 2 is the section, Sheet 3 a detail. A station is a responsibility that never changes with the app. A capability is the station's equipment, specified. A recipe is how service runs. Evidence is the inspection mark at the pass. The foundation is drawn in section. The sheet conventions are earned by the metaphor: a double border, a title block, numbered callouts, level datums, hatching. The plan shows only what a kitchen plan would show, a prep table, a walk-in, ranges, a register, tables, a door, and no decoration.

**Palette.** Semantic roles, locked. No other hues.

| Role           | Value                      | Used for                                                          |
| -------------- | -------------------------- | ----------------------------------------------------------------- |
| Paper          | `#f3efe6`                  | The sheet. A warm vellum chosen as a surface, not a default white |
| Ink            | `#1a1d21`, muted `#5b5f66` | Text and the title block                                          |
| Rule           | `#c3bcae`                  | Frames and level datums                                           |
| Plan blue      | `#2b55a3`                  | Structure: walls, boxes, callouts, forward flow, hatching         |
| Inspection red | `#b83a2a`                  | Evidence and verification only: return paths and their labels     |

**Type.** Annotation and numerals use the system monospace stack (`ui-monospace`, SF Mono, Menlo, Consolas, Liberation Mono). It is engineering lettering, and the numerals align. Sheet titles use the system serif stack (Iowan Old Style, Palatino, Georgia). It is the title-block face, chosen against the category's grotesque default. No web fonts: GitHub serves SVG as an image and blocks external resources. Each SVG carries a `font-rationale` comment that points here.

**Shape.** Rectangles have no corner radius. Arrows are hairlines with small filled heads, one path per arrow. No shadows, gradients, glass, blobs, or icon packs. The glyphs are drawn from the product's own objects: a mandate document, a phone with a web page, and on the plan the fixtures a kitchen plan would carry. Upkeep and the walk-in take a light hatch because they are the contributors' room and the knowledge store, not stations a chef staffs.

**Anti-references.** Dark README banners from developer-tool launches. Gradient documentation cards. Bento grids. Cartoon chef hats and food icons.

**Logo-swap test.** Remove the wordmark. The border, title block, numbered callouts, and hatched foundation still read as this platform's drawing set.

## Preview

Render with headless Chrome at the sheet's own size. QuickLook thumbnails crop and rescale SVGs.

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --window-size=1000,600 \
  --screenshot=/tmp/sheet-1.png "file://$PWD/docs/assets/business-primitives.svg"
```

Sheet 2 renders at `1000,660` and Sheet 3 at `1000,460`.
