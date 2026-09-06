# Product Moat And Core-Loop Innovation

The skill's deepest library makes a chosen feature set feel premium, ethical, and sticky. This reference governs the prior question: whether the feature set itself deserves to exist. Load it with [`eleven-star-experience.md`](../experience/eleven-star-experience.md) — before the 11-star ladder locks the magical moment — and again whenever a wedge claim needs pressure-testing. Polish on a commodity idea produces a beautiful app nobody switches to; the moat work is what gives the polish something to compound on.

## Contents

- 1. The One-Week-Copy Test
- 2. Moat Taxonomy
- 3. Functional Benchmark Against The Incumbent
- 4. Upgrading A Weak Wedge
- 5. The Differentiation Artifact
- 6. Anti-Patterns

## 1. The One-Week-Copy Test

For every wedge claim, answer in writing: **if the top incumbent saw this feature today, what stops them shipping it in a week?** Honest answers are structural — accumulated user data the copy would lack, a workflow position the incumbent's architecture fights, a community that lives here, a taste/curation engine that took months to tune, pricing the incumbent's margins cannot follow, or a distribution channel the incumbent does not own. "They have not thought of it" and "ours is better designed" are not answers; both are copied in a sprint. A wedge that fails the test is not necessarily dead — it means the plan must name how the wedge _becomes_ structural before the incumbent notices (§4), or the verdict conversation moves toward Pivot.

## 2. Moat Taxonomy

Name the moat class the app is building toward — one primary, honestly:

- **Data moat:** every session makes the product better for that user in a way a fresh install cannot match (personalization corpus, history-dependent insight). Strongest in consumer apps; starts accruing day one.
- **Workflow/switching moat:** the user's accumulated state (streaks earned, libraries built, routines encoded) makes leaving expensive. Legitimate when the state serves the user; the ethics contract bans manufacturing lock-in that serves only the chart.
- **Community/network moat:** value comes from who else is here (partners, groups, shared boards). Only claimable when the loop genuinely needs a second person.
- **Taste/curation moat:** an opinionated engine (content, coaching, aesthetics) tuned by feedback that a competitor cannot replicate from a screenshot.
- **Model/pipeline moat:** a generation or analysis pipeline whose quality comes from proprietary tuning, chained steps, or evaluation data — not from a thin wrapper on the same API the incumbent can call (the AI-archetype trap).
- **Distribution moat:** an owned audience, creator engine, or SEO/GEO position that makes acquisition structurally cheaper. Real, but it protects the business, not the product — pair it with one of the above.

"No moat yet, racing to build X" may be an explicitly acknowledged business risk when X is named, dated, and revisited at the day-30 retro. "Our execution will be better" is not a moat class.

## 3. Functional Benchmark Against The Incumbent

Before the spec hardens, run the app's core job against the named incumbents as a user would experience it:

- Pick the top 2–3 incumbents from `strategy/RESEARCH.md`'s competitor evidence — by revenue, not by similarity comfort.
- For the single core job, record: steps to first value, quality of the result, and the one moment the incumbent is weak (onboarding friction, generic output, price wall, dated design — with evidence from reviews/social mining, not taste).
- The new app must name the **beat moment**: the specific moment in the core loop where a user who knows the incumbent would say "this is better," and why that gap survives the one-week-copy test.
- If no beat moment survives scrutiny, that finding goes into the Go/Pivot/Kill evidence — it is exactly what the checkpoint exists to hear.

## 4. Upgrading A Weak Wedge

A weak wedge is a routing signal, not a verdict. Before it reaches the founder as a Pivot recommendation:

- Run `ce-brainstorm` (or `llm-council` when available) on the specific question "what would make this structurally uncopyable," seeded with the incumbent teardown and the moat taxonomy — not a generic "improve the idea" pass.
- The productive moves, in rough order: narrow the audience until the incumbent's generality becomes its weakness; move earlier or later in the user's workflow than the incumbent sits; attach the loop to data the incumbent does not collect; or invert the incumbent's monetization (what they charge for, give away; charge for what their model cannot afford to give).
- One upgrade cycle, time-boxed. If the wedge is still generic after it, the honest evidence goes to the founder — the launch machinery must never outrun the reason for the app to exist.

## 5. The Differentiation Artifact

The wedge lives in `PRODUCT.md`'s **Differentiation And Moat** section, not in a chat transcript. The archetype positioning prompts (each pack's `00-*.md`) produce the raw answers; they are transcribed here verbatim and then held to this reference's tests. The section carries:

- the incumbent table: top 2–3 by revenue, each with what it does well, the beat moment, and what stops a week-one copy
- the named moat class (§2) and the concrete build plan for it
- the one-week-copy test answer in writing

A done product lane needs a real incumbent row and a named moat class recorded here — a positioning chat that never lands in the spec is the artifact-less wedge the 2026-07-26 audit found on real launches. The section feeds `state/LAUNCH_TRACE.md`, the 11-star ladder's magical-moment choice, and the Go/Pivot/Kill evidence row.

## 6. Anti-Patterns

- **Polish as strategy.** Betting on execution quality against an incumbent with distribution — the emotional-design library making a commodity loop feel premium while nothing stops the copy.
- **Wrapper confidence.** An AI app whose entire capability is one API call the incumbent can make tomorrow, with no pipeline, data, or evaluation moat named.
- **Positioning theater.** A wedge articulated once in a chat, never transcribed, never tested, never traced — invisible to every gate.
- **Similarity comfort.** Benchmarking against small apps that resemble the idea instead of the revenue leaders who own the users.
- **Moat someday.** "Network effects eventually" with no named mechanism, date, or retro checkpoint.
