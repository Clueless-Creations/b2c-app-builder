# Candidate: grayscale hierarchy check

Status: draft candidate. This text is a proposal under review. No workflow loads it, no context pack binds it, and the hosted knowledge bundle never carries it. It lives under `examples/contributions/` on purpose.

## What it proposes

Add one optional critique step to the visual-direction review. Render the screen in grayscale. Ask whether the reading order holds.

If the order holds, the palette carries decoration only. Remove the gradient and the tinted fills, then review the flat version. Give the palette a job that the audience derivation in `DESIGN.md` names.

If the order collapses, the palette carries meaning. Move that meaning into type scale, spacing, and contrast first. Decide what the palette keeps after that move.

## When it applies

- A marketing surface or an app screen with a hero gradient, tinted cards, or accent borders that no derivation in `DESIGN.md` explains.
- A review where the reviewer cannot say what the palette communicates.

## When it does not apply

- Data-dense screens where color is the only encoding of state, such as a monochrome dashboard with status hues. Grayscale removes the encoding, so the test reports a false failure.
- Screens whose derivation already assigns each hue a meaning. Review those against the derivation and skip this test.

## Evidence that would justify promotion

- A rendered before-and-after pair for at least one real screen, reviewed by an independent reviewer who did not run the test.
- A recorded reading-order answer for both versions from a person who had never seen the screen.
- Nothing in this candidate rests on the source post's popularity or on its unsourced completion figure. Both stay listed as uncertainties.

## Boundary

Mandatory review steps stay in the recipe. This prose describes a selectable method. It grants no authority, and a gate lives in the recipe rather than in this text.
