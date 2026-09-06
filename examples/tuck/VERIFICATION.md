# Tuck verification

TUCK is the local reference implementation used to exercise the builder's complete
design loop: an offline iOS packing planner and responsive landing page sharing
one original visual language. Its promise is **Leave with everything.**

The product and design contracts are accepted. The current source-bound local
observation is generated at `tests/proof/tuck-local-test-proof.json` during local
runs; the receipt is intentionally machine-bound and ignored by Git. The recorded 2026-09-04 run passed 12 landing tests and 25 native tests.
Re-run checks before making a claim about the current checkout. Strict
design acceptance remains intentionally incomplete. This directory does not claim
a released app, an App Store listing, paying customers, or a successful consumer
business.

## Authored sources

- `product.yaml` is the sole product store; render `PRODUCT.md` rather than editing it.
- `DESIGN.md` owns tokens and the exact eight surface review mappings: six iOS screens
  and the landing at mobile and desktop widths.
- `studio/seed/business.json` lists the selected platform and surfaces. Surfaces remain
  draft until the strict evidence-backed design review is complete.
- `design/flows/packing-journey.md` and `design/screens/` specify behavior and edge states.
- `design/reviews/rubrics/tuck-craft.json` freezes seven independent acceptance floors.
- The local native test receipt recursively fingerprints `native/Sources/`,
  `native/Tests/`, `native/UITests/`, `native/Assets.xcassets/`, `native/project.yml`,
  generated `native/Info.plist`, the stable generated Xcode project and shared
  scheme files, and `shared/`.
- The local landing test receipt recursively fingerprints `landing/`, the landing
  harness and tests, and `shared/`. Both inventories exclude user-specific Xcode
  data, caches, build output, and proof artifacts.

The existing product schema calls its boundary field `complete_scope` and renders
a fixed “Complete product scope” heading. Here that field contains the complete accepted TUCK
scope; no accepted journey is postponed or treated as a pilot.

## Contract checks

Run from the repository root with Node.js 22:

```sh
node --import tsx tooling/render-product.ts --root examples/tuck
node --import tsx checks/validation/business/product/check-product-md.ts --root examples/tuck
node --import tsx checks/validation/business/design/check-design-md.ts --root examples/tuck
```

These checks validate authoring. They do not prove visual quality or app behavior.
The strict acceptance gate is deliberately expected to fail until its real report
and referenced artifacts exist:

```sh
node --import tsx checks/validation/business/design/check-design-acceptance.ts --root examples/tuck
```

On 2026-09-04, that command emitted exactly one error:
`design_acceptance.report_coverage`, because
`design/proofs/design-acceptance.json` is absent. The validator does not emit a
separate physical-VoiceOver error before it can read a report. Physical-iPhone
VoiceOver evidence remains required by the acceptance contract below.

## Durable local test observation

The retained JSON receipt binds the exact recursive native and landing source
manifests, toolchain versions, simulator identity and runtime, commands, execution
times, result counts, landing log SHA-256, and a canonical recursive SHA-256 for the
native result bundle. It records Node.js 22.23.2, Xcode 26.6, and the iPhone 17
simulator `403BC147-3C20-49C2-8F72-4F2252B02065` on iOS 26.5 (23F77).

The landing observation passed 12 tests with no failures or skips. Its 13 bound
source entries were unchanged by the native repair, so the existing landing run
remains current. The full native observation passed 25 tests with no failures or
skips. It includes the unsuppressed contrast audit for the `Packed` and `0` text in
the empty packed-filter state after the selected filter gained dark text, a canvas
fill, and a two-point ink outline. The native result bundle, native console log,
landing TAP log, and DerivedData stay local and ignored under
`tests/proof/runtime/`; the compact JSON receipt also stays local and ignored.

## Acceptance evidence still required

The local run exercised the generated current Xcode project and the landing
implementation. It proves the 12 passing landing behaviors and 25 passing native
model, persistence, and UI behaviors for the exact receipt fingerprints. This
observation does not supply the final candidate-bound design acceptance report or
physical-iPhone VoiceOver evidence.

For strict acceptance, build, install the exact binary on the selected target, and
launch it. Generated Info.plist, project, scheme, and actual icon resources must
exist before fingerprinting the candidate. Changing any of them invalidates earlier
captures. Serve this directory so landing asset URLs can reach `shared/`. Record
exact build and browser commands, versions, and device identity with the evidence
produced during execution. Use the native owner's isolated verification store to
exercise storage failure and recovery; never damage a user's installed app data for
a test.

The landing producer must also retain a strict browser-runtime launch receipt under
`growth/landing/proof/`. It must bind the current `landing/` and `shared/` source
fingerprint, the exact served build and response manifests, `/landing/` URL, browser
context, and separate launch and navigation transcripts. Every landing capture and
interaction must cite that runtime. A real producer attempt must author the candidate-bound
`growth/landing/browser-proof.json` config and run the `b2c browser-proof` command with the
workspace and exact authorization execution identity while the page is served. TUCK does not
retain that attempt config or its generated proof pointer. The exploratory Chrome notes and
Node test receipt below do not supply this missing proof.

The accepted scope requires:

1. Native captures for all six screens in default, reduced-motion, large-text,
   and screen-reader settings, plus each authored empty/error/import state. Execute
   the identical default state disconnected; do not duplicate its screenshot as offline.
2. Real create/edit, preset suggestions, custom item editing/removal, tap/drag/list
   packing, unpack/undo, completion/export/duplicate, and relaunch persistence.
3. Real native malformed/unsupported/unreadable import behavior, cancelled import,
   confirmed valid replacement, restore backup, cancelled deletion, and failed-save recovery.
4. Landing captures at phone and desktop widths, including empty and recoverable
   error states, keyboard, no-JavaScript, and reduced-motion settings. Execute local
   operations disconnected after loading; this shares the default capture. Verify
   browser-bag input, persistence/reload, import/export/restore, and failed writes.
   Check the narrow layout too. Do not infer native backup or category support.
5. Original pixel artifacts and execution logs bound to the exact source fingerprint,
   platform, device, OS, viewport, locale, accessibility settings, and capture times.
6. A distinct reviewer who inspects the current candidate and all relevant artifacts,
   compares native and landing together, grades every rubric criterion, and records
   actionable findings. Repair open findings and recapture changed work before acceptance.

The frozen reference JPEG is present locally at ignored
`design/reference-packs/runtime/seat.jpeg` with SHA-256
`e432b939e20650334307fd8de0d4ab57eb858252f0fe294a4061913cb933c151`;
see the reference pack for its source.
Keep copyrighted calibration imagery and raw runtime bundles out of Git.
The selected original app screenshots in `showcase/` are distributable examples;
their provenance does not grant design acceptance.
No `design/proofs/design-acceptance.json` is authored here. The absent final report,
missing physical-iPhone VoiceOver evidence, absent captures, or an unavailable
independent reviewer remain explicit unmet requirements rather than passing
placeholders.

The current scope requires 46 distinct state captures and 39 interaction records.
One capture may support several interactions or criteria; do not create extra
screenshots merely to give each assertion a new file. Accessibility settings and
their actual interaction evidence remain required even when some pixels coincide.

Apple's [accessibility testing guidance](https://developer.apple.com/documentation/accessibility/performing-accessibility-testing-for-your-app)
requires physical-device VoiceOver testing because VoiceOver is unavailable in
Simulator. The native screen-reader captures and interactions therefore require
the current candidate installed on a physical iPhone with VoiceOver enabled.
Simulator accessibility inspection is useful diagnostic evidence; an environment
override or `screenReader: true` label cannot make it a real VoiceOver session.
Keep that required evidence incomplete if a suitable physical device is unavailable.

Internal review findings trigger bounded repair and another independent review
within the opening mandate. Routine design iteration does not require a fresh
founder approval; existing access, protected-action, and shipment authority remains.
