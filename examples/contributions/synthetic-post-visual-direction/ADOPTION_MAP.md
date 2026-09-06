SYNTHETIC FIXTURE: an invented post, not a real creator's writing.

# Adoption map: synthetic-post-visual-direction

One public post by a synthetic author, read as data. `contribution.yaml` is the
machine record. This file is the human view of the same decisions.

## Source

| Source | Kind | Publisher | Revision | Retrieval | Rights |
| --- | --- | --- | --- | --- | --- |
| `synthetic-designer-grayscale-post` (`source/post.md`) | post | Synthetic Designer | sha256 of `source/post.md` | complete, local file read | unknown; no license statement |

The post carries no directive to an agent, so nothing was refused. Nothing in
it was executed. The author name stays on the source record.

## Units

| Unit | Upstream location | Local target | Disposition | Selection | Rationale | Verification |
| --- | --- | --- | --- | --- | --- | --- |
| u1 | `synthetic-designer-grayscale-post`, paragraph 2 | `reference.design.audience-derived-identity` (existing, active) | reference | selected-method | Rights unknown, so the idea is cited and the expression is not adapted. Opinion, mechanism, demonstration, and measured evidence stay apart. | `b2c contribute check`; `b2c contribute preview`; `u2-counterexample` |
| u2 | none (original) | `u2-counterexample` (evaluation case) | original | selected-method | The naive rule fails a monochrome data-dense dashboard whose status hues are the only encoding of state. The candidate must name that limit. | declared in `contribution.yaml` |

## What the post separates into

- Opinion: color should decorate rather than structure. The author's taste. Not a rule.
- Mechanism: render the screen in grayscale and ask whether the reading order holds. The idea worth citing.
- Demonstration: the four-step run on one screen. It shows the test. It proves nothing general.
- Measured evidence: none. The +4% completion figure has no source. The 10k likes measure popularity.

## Kept, changed, omitted (u1)

Kept: the grayscale test as an idea, cited to the author.

Changed: nothing. A reference disposition adapts no text.

Omitted: the author's wording, the +4% completion figure, and the 10k likes.

## Existing owners

| Owner | Match |
| --- | --- |
| `reference.design.audience-derived-identity` | keyword match: palette, gradient |
| `reference.design.vibecoded-tells` | keyword match: gradient, hierarchy |

The unit lands on the first owner. The second owner already names the
indigo-to-purple gradient tell, so the counterexample's passing case reuses
that vocabulary instead of adding a second rule.

## Derivation

`reference.design.audience-derived-identity` is informed by the post. The
relationship is `informed`, not `adapted`. Reviewer `b2c-maintainers`,
reviewed 2026-09-06, after the 2026-09-06 retrieval. There is no notice,
because nothing was copied.

## Evaluation

`u2-counterexample` (counterexample):

- Must fail (the naive rule breaks here): a monochrome data-dense dashboard where color is the only encoding of state
- Must pass (the rule applies cleanly): indigo-to-purple hero gradient carrying no information

## Candidate

`candidate/critique-heuristic.md` is the method in our own words, labeled
draft. It lives under this example root. It is not under `knowledge/`, no
workflow binds it, and the hosted bundle never carries it. Promotion needs a
rendered before-and-after pair reviewed by an independent reviewer.

## Uncertainties

- +4% completion claim has no source; treat as anecdote
- popularity is not evidence

## Required checks

- `b2c contribute check --target examples/contributions/synthetic-post-visual-direction`
- `b2c contribute preview --target examples/contributions/synthetic-post-visual-direction`

## Not done

No reference text changed. No rendered review was performed. The author's
terms were not obtained.
