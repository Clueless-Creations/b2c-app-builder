# Vibecoded Tells: The Default-Design Smell List

Use this reference before you build or review a landing page, funnel page, web marketing surface, or app screen. Also load it when the vibecode audit pass (see §Audit Pass) is dispatched. It lists patterns worth inspecting in context. Their presence does not identify how an artifact was made or establish a loss of trust or conversion.

This list adapts a widely shared 30-item "reasons your site looks vibecoded" checklist to this engine's doctrine. It extends the Generic-Design Tells table in [`audience-derived-identity.md`](./audience-derived-identity.md). That file explains why the defaults exist. This file gives the reviewable smell list and the audit pass that applies it.

## Contents

- The Rule
- Tier 1: Trust Breakers
- Tier 2: Visual Default Tells
- Tier 3: Copy Tells
- Scoring A Review
- Mechanical Detection
- Audit Pass
- Gates

## The Rule

A visual tell is a default, not a ban. A default becomes a decision only through the derivation chain in [`audience-derived-identity.md`](./audience-derived-identity.md). Record material decisions in `DESIGN.md` using audience evidence, an explicit creative hypothesis, legibility, or platform constraints. Review the actual result against the user job; do not invent an audience fact to justify a form.

Tier 1 items are different. They are honesty and completeness requirements. No derivation can earn a fake testimonial or a missing privacy policy.

## Tier 1: Trust Breakers

These fail a surface on a single hit. Each one has an owning artifact, so the fix is concrete.

| Smell                             | Requirement                                                                                                          | Owning artifact                                                                                                               |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Fake or unattributed testimonials | Only real, sourced quotes with permission. No invented names, counts, or star ratings.                               | `product/experience/emotional-design/EMOTIONAL_DESIGN.md` social-proof card with truthfulness proof; `check:emotional-design` |
| No terms of service               | The landing footer links a real terms page before deploy.                                                            | `trust/TERMS.md`                                                                                                              |
| No privacy policy                 | The landing footer links a real privacy page before deploy.                                                          | `trust/PRIVACY.md`                                                                                                            |
| No real product demo              | Show the real app UI: captures, recordings, or live embeds. Do not substitute abstract illustration for the product. | `growth/DEMO_VIDEO.md`; quality-lens rule that visuals support real app UI                                                    |
| No skeleton or loading states     | Every async surface designs its loading, empty, error, and offline states.                                           | design-guru owned states; `DESIGN.md` screen specs                                                                            |

## Tier 2: Visual Default Tells

Each row prompts a contextual question and gives a possible justification. Audience evidence, a creative hypothesis, communication needs, legibility, or platform conventions can support a choice. These examples are not exclusive permission rules. Review material decisions and actual behavior; do not require an invented audience fact.

| Smell                                                           | Why it reads as vibecoded                                  | Earned when                                                                                     |
| --------------------------------------------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Harsh gradients (indigo-to-purple hero, gradient headline text) | Can compete with hierarchy when used without purpose   | The palette derivation names the gradient's role and its brand hues                             |
| Default icon packs (Lucide, Heroicons, generic thin-line sets)  | An unexamined choice may create inconsistent or ambiguous controls | Consistent, recognizable functional controls; custom identity marks where the product needs them                             |
| Pure white background with no surface system                    | A canvas nobody decided; no depth or zoning model          | An editorial direction states white as a choice with a surface scale                            |
| Rainbow coloring (many hues, no semantic system)                | Color without a system reads as unowned decoration         | Each hue carries a recorded semantic role                                                       |
| Default drop shadows on every card                              | One shadow token stamped everywhere; no light model        | A stated elevation system with few, purposeful levels                                           |
| Three feature cards in a row                                    | The tutorial demo layout                                   | The content genuinely has three parallel items and the layout derivation says so                |
| Emoji as icons or in headings                                   | A shortcut where an icon system was owed                   | Meaning is clear, labels remain accessible, and the tone fits the task; functional use needs recognizable semantics       |
| Liquid glass and glassmorphism                                  | Transparency can obscure content or weaken hierarchy                    | A legible, purposeful layer with acceptable performance                              |
| Inter, Geist, or Space Grotesk with no rationale                | The corpus default standing in for a typography decision   | The face supports representative content, platform behavior, and the intended voice                               |
| Colored left-stripe callouts                                    | Documentation-site chrome pasted onto marketing            | The stripe groups or distinguishes meaningful content without relying on color alone                                              |
| Bento grids                                                     | The current template fashion; portable everywhere          | The content is truly modular and the derivation names why a grid beats a narrative flow         |
| Fake terminal or code windows                                   | Generic tech garnish on a non-developer product            | The product is a developer tool showing real commands                                           |
| Checkmark bullet walls                                          | Feature-dump formatting that replaces persuasion           | Short, verified capability lists; never as the page's main argument                             |
| Three pricing tiers by default                                  | A pricing UI copied before the offer was designed          | Pricing state in `revenue/REVENUE_OPS.md` actually defines the tiers                            |
| Uniform soft corner radius everywhere                           | One radius token set once and never revisited              | A radius scale tied to component meaning                                                        |
| Purple-and-black SaaS chrome                                    | Category mismatch on most consumer products                | A recorded dark-canvas rationale, as in the Whoop case study                                    |
| Radial orbs and blurred blob shapes                             | Decorative filler for undecided space                      | A stated compositional purpose that survives actual surface review                                        |
| Dot-grid backgrounds                                            | Template texture with no meaning                           | The texture supports composition without competing with reading or interaction                                   |
| Sparkle icons for AI features                                   | The generic "AI" costume                                   | The brand system derives its own marker for generated content                                   |
| Animated scroll arrows and bouncing cues                        | Motion that begs instead of guiding                        | Motion doctrine in [`landing-motion-craft.md`](./landing-motion-craft.md) assigns the cue a job |
| Decorative hover animations everywhere                          | Motion without hierarchy; every card wiggles               | Hover states that communicate affordance, per the motion tokens                                 |
| Neon glow accents                                               | Loudness standing in for identity                          | The accent supports emphasis or an explicit identity hypothesis while preserving legibility                                          |
| Basic pastel palette                                            | The soft default when nobody chose saturation              | Saturation supports the intended communication and semantic contrast, independent of category stereotypes                                       |

## Tier 3: Copy Tells

Two reel items are writing smells, and [`no-slop-writing.md`](../words/no-slop-writing.md) already governs them. Do not re-litigate them here; load that file for copy review.

- Em-dash overuse: no-slop §5, em-dash budget.
- "It's not X, it's Y" framing: no-slop §5, binary contrasts and negative listing.

## Scoring A Review

- Any Tier 1 hit fails the surface. Fix the artifact, not the wording.
- Tier 2 patterns prompt contextual inspection. Their number does not decide acceptance. Fail a material communication, usability, identity, or truthfulness defect with evidence.
- A Tier 2 warning can be resolved by a justified accepted choice; novelty is not required.
- Copy tells route to the no-slop review, not this one.

Review material choices against the accepted contract and actual output. Conventional controls do not each need a separate rationale row.

## Mechanical Detection

`check:vibecoded-tells` catches the greppable subset over landing and web-surface source. Judgment stays with the audit pass below.

| Check code                        | Catches                                                                    | Severity |
| --------------------------------- | -------------------------------------------------------------------------- | -------- |
| `vibecode.default_icon_pack`      | Lucide or Heroicons imports in web-surface source                          | warning    |
| `vibecode.legal_links_missing`    | A site-shaped landing with no terms or privacy link                        | error    |
| `vibecode.emoji_in_markup`        | Emoji characters inside JSX or HTML markup                                 | warning  |
| `vibecode.default_font`           | Inter, Geist, or Space Grotesk in tokens or CSS without a rationale marker | warning  |
| `vibecode.indigo_purple_gradient` | Indigo-to-purple gradient utilities or hex pairs                           | warning  |
| `vibecode.glassmorphism`          | Backdrop-blur glass panels                                                 | warning  |
| `vibecode.decorative_blob`        | Blurred radial-gradient orb elements                                       | warning  |
| `vibecode.sparkle_icon`           | Sparkle glyphs or sparkle icon imports                                     | warning  |
| `vibecode.checkmark_wall`         | Three or more checkmark bullets in one file                                | warning  |
| `vibecode.bouncing_cue`           | Bounce-animated arrows or scroll cues                                      | warning  |

A warning identifies a pattern for review, not a proven defect or automatic removal order. The font rationale marker is a `font-rationale:` comment beside the font declaration, pointing at the `DESIGN.md` row.

## Audit Pass

The vibecode audit is a bounded subagent pass with fresh context. Kick it off:

1. After a landing, funnel, or web marketing surface is first built or meaningfully restyled.
2. Before the landing lane reaches `done`, alongside the `check:landing-funnel` gates.
3. Inside the design-guru audit whenever `DESIGN.md` or app screens change.
4. On demand, when a founder or maintainer asks whether a surface "looks AI-generated".

Dispatch prompt:

```text
Load knowledge/design/vibecoded-tells.md and knowledge/design/audience-derived-identity.md.
Review <surface paths> against Tier 1 and Tier 2.
For each tell found, name the file, the tell, and whether DESIGN.md records a derivation.
Run check:vibecoded-tells and include its output.
Apply the scoring rule. Return the fixed handoff schema with a pass or fail verdict.
Propose the smallest state mutation that clears each failure. Do not restyle beyond the findings.
```

The pass returns the standard handoff headings from `APP_AGENTS.md`. It proposes mutations; the orchestrator integrates them.

## Gates

- `check:vibecoded-tells` runs in the audit pipeline and against generated business repos via `--root`.
- `check:emotional-design` owns the fake-social-proof trust breaker with its truthfulness proof.
- `check:landing-funnel` owns the deploy gates a landing must pass; the terms and privacy requirement rides with it.
- The quality lens ([`quality-lens.md`](./quality-lens.md) §Anti-Generic Checks) applies this list during Design Room review.
- The anti-generic review in `audience-derived-identity.md` §Gates owns the contextual identity review this file supports.
