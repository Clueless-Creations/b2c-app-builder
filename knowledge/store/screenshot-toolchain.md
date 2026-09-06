# Screenshot Toolchain and Source Adoption

Part of [ASO And Store Operations](./aso-store-ops.md). Use this when a store
creative task selects the ParthJadhav screenshot editor or Eronred's screenshot
methods. These are reviewed procedures, not an installed tool or a grant to
change an app. Use the selected compatible revision and its applicable guidance.
An upstream release is not an instruction to update the workspace.

## Contents

- Responsibilities and evidence
- Research and the screenshot story
- Select and inspect the editor
- Preserve an existing deck
- Capture, compose and verify
- Update a selected tool

## Responsibilities and evidence

Keep four responsibilities separate. A native capture route observes the app.
A preview test exercises a component or layout. The screenshot editor composes
marketing slides. The selected store route uploads approved exports. None of
these operations proves the others succeeded.

`product.yaml` owns the product promise. `DESIGN.md` owns visual decisions. The
accepted copy deck supplies claims and localized strings. `SCREENSHOTS.md` owns
the slot plan, capture references, export checks and upload evidence. Reference
these owners instead of creating another product or brand specification.

The Parth editor's `app-store-screenshots.json` owns its deck configuration only.
Its localStorage mirror is not the authoritative business artifact. Keep the
source captures separate from the editor project and exported marketing assets.
A preview image or generated mockup must not be described as a real app capture.

## Research and the screenshot story

The reviewed Eronred methods suggest prioritizing a benefit, explaining the
product with concise copy, and testing localized screenshot ordering. Treat these
as methods to evaluate against the app's actual audience and evidence. They do
not establish a universal conversion percentage, a fixed number of slots, or a
reason to copy an incumbent's visual identity.

Use the accepted research and first-value journey to choose what each slot
communicates. Name the user outcome, the actual screen that demonstrates it,
locale, device class and evidence supporting each claim. Never invent customer
counts, ratings or social proof. Current store requirements determine permitted
slots and formats; upstream presets are not the policy authority.

At the reviewed revision, `Eronred/aso-skills` contains
`skills/screenshot-optimization/SKILL.md`, `skills/app-preview-video/SKILL.md`
and `skills/app-marketing-context/SKILL.md`. It does not contain
`skills/ios-screenshots/SKILL.md`. Resolve a separately installed skill to its own
source before using that name. An ASO method does not connect Appeeky, authorize
paid research or introduce a competing app-context document.

## Select and inspect the editor

The reviewed Parth skill lives at `skills/app-store-screenshots/SKILL.md`, with
its template beside it. It describes a Next.js editor, connected-canvas layouts,
locale and device decks, saved uploads and PNG export. The builder adapts those
procedures; it does not bundle the upstream template, fonts, mockups or samples.

Before setup, resolve the selected source commit and inspect its actual manifest,
lockfile, license scope and required environment. Record the proposed editor
location, files changed, package installation and any network effects. Use an
explicitly authorized isolated editor directory. Never copy a template over the
app repository root, replace unrelated scripts, install a top-level skill or
run upstream setup merely because discovery found a README instruction.

Prefer the existing compatible editor when one is already selected. New source
features are review candidates, not automatic changes to the active workspace.
Library, font, image, device-frame and sample rights need their own review before
redistribution. Retain applicable notices with any incorporated material.

## Preserve an existing deck

An editor upgrade is a deliberate migration, not an implicit redesign. Inspect
the current configuration and make a recoverable snapshot before authorized
writes. Preserve app copy, uploaded captures, icons, locale ordering, theme
choices and all device decks. Do not replace user content with template samples.

The reviewed migration uses schema version 2 and an explicit `connectedCanvas`
boolean. Preserve an existing choice. A legacy deck without that choice stays
isolated with `connectedCanvas: false` unless a separately reviewed decision opts
in. This avoids turning offscreen legacy elements into neighboring-slide content.
Use structured JSON editing and inspect the output, not regex substitutions.

A missing custom theme is an unresolved design mismatch. An editor's fallback
can keep its preview usable, but cannot silently satisfy the accepted design.
Preserve the original value and either restore the theme or obtain an explicit
design decision. Compare every device/locale export before accepting migration.

## Capture, compose and verify

Obtain raw app captures through the selected native/device route first. Record
the app/build, platform, device, OS, locale, fixture account, capture path and
fingerprint. SnapshotPreviews layout tests, an editor canvas and a screenshot
file by themselves do not establish a first-session runtime journey.

Use the accepted design tokens and copy to compose the deck. Supporting artwork
may surround the app capture but must not invent controls, data or functionality
inside it. In a connected canvas, inspect each standalone exported crop as well
as the whole deck. A headline, legal qualifier or critical control cannot rely
on the next slide to become intelligible.

In `SCREENSHOTS.md`, retain the selected source revision, editor dependency
lockfile, deck fingerprint, source capture fingerprints and export inventory.
For each exported file, record device/locale/slot, dimensions, format, path,
fingerprint and review result. Verify text, font loading, clipping, theme and
truthful UI at the required export size. A filename or preset label is not proof
of its dimensions or of a successful render.

Run `check:store-screenshots` through the current builder check route and perform
the independent screenshot review against the accepted rubric. Include raw
capture and native/runtime proof when those claims are made. The composition
check is not a substitute for a device test, visual judgment or provider evidence.
Uploading requires the selected store route and its own authorized action and
readback. Do not publish from the editor as a side effect of rendering a draft.

## Update a selected tool

Maintainers compare the reviewed upstream revision with a newly observed commit
or release, identify affected local methods and run the mapped checks. Preserve
intentional adaptations, especially truthfulness, identity ownership and migration
choices. Update attribution and packaged notices with the reviewed contribution.

An app adopts that new package or editor revision explicitly. A pinned builder
package does not freeze an external editor, a PATH executable or a hosted service.
Record the actual selected tool revision and environment when executing. Missing
access or incompatible features remain a named blocker, never a fabricated pass.
