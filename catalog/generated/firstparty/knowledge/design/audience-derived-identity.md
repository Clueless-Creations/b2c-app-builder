# Audience-Derived Identity: From Research Facts To Design Decisions

Use this reference when `DESIGN.md` is created or revised, and when a visual direction needs review. It turns audience research into concrete palette, type, motion, and imagery decisions. It also defines the generic-design anti-pattern so a review can name it.

The rule this file exists for: every visual decision must trace to a fact about the target user in `strategy/RESEARCH.md`. A design that only cites a trend is not a decision. It is a default.

## Contents

- Sources To Refresh
- Case Studies: How Identity Encodes Audience
- The Derivation Chain
- The Generic-Design Tells
- The Audience Checklist For design.md
- Category Conventions
- Gates

## Sources To Refresh

Study these brand systems on the manifest cadence. Update the case rows when a brand reworks its identity:

- Duolingo brand guidelines: `https://design.duolingo.com/identity/color`
- WHOOP developer design guidelines: `https://developer.whoop.com/docs/developing/design-guidelines/`
- Flighty design system record: `https://styles.refero.design/`
- Apple, Behind the Design (Flighty and peers): `https://developer.apple.com/news/?id=970ncww4`
- The indigo-default analysis that named the generic-AI look: `https://dev.to/alanwest/why-every-ai-built-website-looks-the-same-blame-tailwinds-indigo-500-3h2p`

## Case Studies: How Identity Encodes Audience

Five brands, each with one audience fact and the decisions that fact produced. Study the trace, not the surface.

| Brand    | Audience fact                                                   | Palette                                                                                | Type                                                                          | Motion                                                                | Imagery                                                         |
| -------- | --------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------- | --------------------------------------------------------------- |
| Duolingo | Learners treat it as a game, not homework                       | Saturated lime green, chosen against edtech's classroom blues                          | Bespoke face built from the mascot's shapes                                   | Celebratory: flame bursts, spring counters, scaled confetti           | A character cast with one visual grammar, no sharp angles       |
| Calm     | Stressed adults want to feel tended to, unhurried               | Cool low-saturation blues and nature tones                                             | Light weights, generous line height; heaviness reads as urgency               | Breath-paced: the bubble expands and contracts on real breath cadence | Commissioned nature photography as the mental-state metaphor    |
| Whoop    | Athletes want to read as elite, not wellness-casual             | Near-black plus one signal red; a locked 3-color semantic system, no arbitrary accents | Words in one face, numbers in a technical numeral face at display size        | Restrained tier transitions that preserve spatial context; no bounce  | The data is the imagery; moody athlete photography in marketing |
| Flighty  | Aviation nerds want control-tower competence                    | Achromatic ramp plus exactly one action blue                                           | Platform-native stack by rule, one serif accent as an airport-print reference | Minimal; whisper-thin shadows over dynamic transitions                | Flight data itself is the hero; no travel-lifestyle photos      |
| Partiful | Young hosts want the invite to look enviably fun, not corporate | "Dopamine" maximalism, deliberately unsystematized                                     | Per-invite theme fonts; the type system is a user toolkit                     | Kinetic and bouncy; meme-able                                         | Guest-generated photos and reactions are the imagery            |

The one-line diagnostic: each brand made at least one choice that would look wrong on a direct competitor. Whoop's dark canvas would break Calm. Calm's pastels would break Whoop. Generic design is recognizable because none of its choices would look wrong anywhere.

## The Derivation Chain

Run this chain when design.md's direction is drafted. Record the results in design.md's Audience And Identity section.

1. **Collect the audience facts** from `strategy/RESEARCH.md`: who the user is, and what they aspire to feel or be seen as. Add the 2-3 apps they already love. Those loved apps are the audience's native visual language.
2. **Name the category default to avoid.** State what every competitor already looks like. A design.md without an anti-reference did no differentiation work.
3. **Pick one physical or sensory metaphor from the audience's real world.** An owl playing a game. Breath. A cockpit. A departure board. A party flyer. Trends are not metaphors.
4. **Derive the palette from the metaphor**, not from a trend board. State the derivation in one sentence.
5. **Derive type from the metaphor and the density need.** Decide whether the product needs a personality face or arm's-length numerals, and say why.
6. **Derive motion from the emotional tempo** the audience wants: celebratory, breath-paced, precise, or kinetic. Name the tempo in the motion table.
7. **Derive the imagery approach**: character system, commissioned photography, data-as-hero, or user content as hero.
8. **Run the logo-swap test.** Strip the wordmark from five screens. If the target user could not recognize their app, a decision upstream came from a trend, not from the audience.

## The Generic-Design Tells

The recognizable marks of template output. Each row is a review check; two or more hits fail the anti-generic review.

| Tell                                                          | Why it means no decision was made                                                                          |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Indigo-to-purple gradient hero or gradient headline text      | The documented statistical default of AI-generated pages; the single loudest tell                          |
| Inter or bare system font with no stated rationale            | The training-corpus default standing in for a typography decision                                          |
| Identical corner radius on buttons, cards, inputs, and images | A radius token set once and never revisited per component's meaning                                        |
| Three evenly-spaced feature cards with thin-line icons        | The tutorial demo layout, portable to any product                                                          |
| Glassmorphism on a wellness or social app                     | Legitimate mostly in fintech dashboards; elsewhere it is a borrowed costume                                |
| Floating blurred blob shapes                                  | Decorative filler for undecided space                                                                      |
| Emoji as functional icons                                     | A shortcut where an icon system was owed                                                                   |
| Stock 3D isometric illustration                               | Generic tech optimism with zero product specificity                                                        |
| Dark-purple SaaS chrome on a consumer wellness product        | Category mismatch; Whoop earns dark with a usage-time rationale, a sleep app borrowing it is cargo-culting |
| A headline that could ship on any of ten competitors          | The composite tell; interchangeability is the definition of the generic                                    |

## The Audience Checklist For design.md

Ask these questions of a drafted design.md. A "no" on any of them means the Audience And Identity section is not done.

1. Does the palette rationale name the audience fact it serves, with a `strategy/RESEARCH.md` reference?
2. Is the primary color defended against the category default, or is it an unexamined indigo/purple safe choice?
3. Does the type system name faces with a stated reason tied to the audience or density need?
4. Does the motion spec name an emotional tempo tied to how the user wants to feel?
5. Is the imagery direction specific enough to brief a photographer or illustrator?
6. Does the document name 2-3 explicit anti-references — aesthetics this product must not resemble?
7. Does it state which category convention it follows, which it breaks, and why?
8. Would five unbranded screens pass the logo-swap test with the target user?
9. Does every decision row carry evidence, not adjectives?

## Category Conventions

The visual codes each B2C category's audience expects. Follow or break them only with a stated reason.

- **Wellness**: pastel and nature-adjacent palettes, soft gradients, light type, slow motion, organic shapes. Flag: SaaS dashboard chrome transplanted onto a sanctuary product.
- **Fitness**: two lanes split by seriousness. Mass-market motivational: saturated primaries, condensed athletic display type, energetic photography. Quantified-self: dark canvas, locked semantic colors, technical numerals, data as hero. Flag: pastel wellness codes on a performance product.
- **Fintech**: an anchor trust color (navy/slate/charcoal), one disciplined accent for actions, tabular figures, minimal motion. Glassmorphism is genuine convention here when paired with a disciplined accent. Flag: bouncy celebratory motion around money.
- **Social**: bright saturated color, loud display type over minimal chrome, kinetic meme-able motion, user content as the imagery. Caveat: audience, not the "social" label, decides — professional networks invert toward fintech restraint.
- **Productivity**: near-monochrome, one restrained accent, almost no motion, no imagery; the tool recedes behind the user's content. Flag: gamified confetti on a daily-driver work tool.

## Gates

- `check:design-room` requires design.md's Audience And Identity section and its `strategy/RESEARCH.md` evidence reference, and fails placeholder text once the Design Room claims review-ready status.
- `check:design-room` also warns on the single-hue palette drift this file's tells describe.
- The quality lens (`quality-lens.md` §Anti-Generic Checks) applies this file's tells during Design Room review.
- `seed:design-brief` seeds the designBrief skeleton; fill its audience fields from `strategy/RESEARCH.md`, not from memory.
