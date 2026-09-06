# Design Acceptance Evidence

Use this contract when accepting the complete mobile and landing design. The existing grader remains advisory by default. This strict check validates the completeness and integrity of an independent review. It does not compute beauty, authenticate a human identity, run an app, or grant release authority. It does require the report reviewer session to equal the engine-issued owner of the exact current audit attempt.

The session runtime must establish the producer and independent reviewer identities. The reviewer must open the actual captures and execute or inspect the recorded interactions before writing observations. Distinct strings in a JSON file alone are not proof of an independent session.

## Owners

- `product.yaml` owns accepted product scope. Its `meta.status` must be `accepted`.
- `DESIGN.md` owns an `acceptance` map in its existing YAML frontmatter. Explain it in the Design Acceptance section. It declares detailed design contracts, surface coverage, implementation paths, state applicability, locales, interactions, and the frozen rubric path.
- `studio/seed/business.json` owns the existing screen and funnel inventory. Every required native screen needs coverage on every selected platform. Landing and other web surfaces need mobile and desktop coverage. Required rows must be `ready`; blocked and draft rows remain incomplete.
- Existing files under `design/reviews/rubrics/` own frozen criteria. A Markdown rubric uses a `designRubric` map in YAML frontmatter. A JSON rubric may store the same map directly. Do not create a second rubric elsewhere.
- Native producers own capture, interaction, and receipt files under their selected `proof/ios-simulator/`, `proof/ios-device/`, `proof/android-emulator/`, or `proof/android-device/` lane. The landing producer owns browser evidence, response bytes, manifests, and launch receipts under `growth/landing/proof/`. Audit-owned `design/reviews/` paths cannot supply producer evidence.
- `design/proofs/design-acceptance.json` is the audit index. Its capture and interaction rows contain only an evidence ID, a hashed receipt pointer, and engine provenance for the accepted producer attempt. It does not copy producer facts or become a second state store.
- `design/reviews/IMPLEMENTATION_REVIEW.md` owns reviewer prose. It must contain exactly one `Acceptance report SHA-256: <64 lowercase hex>` line bound to the current bytes of `design/proofs/design-acceptance.json`.
- The current `workflow.design.implementation-craft-audit` attempt owns both files above. Their run-state bindings must name that attempt and its engine-issued owner session. An invented reviewer label, an older audit attempt, or an audit file changed after production fails closed.

The exact typed shapes and schemas are exported from `checks/validation/business/design/design-acceptance.ts`. Schema version 1 rejects unknown fields and verdicts.

## Authored Coverage

The `acceptance` map has `schemaVersion: 1`, `status: accepted`, `designContractPaths`, `surfaces`, and `exclusions`. `designContractPaths` lists every detailed contract under `design/screens/` and `design/flows/` that the `DESIGN.md` body links. The list may be empty when the global contract is sufficient. A linked contract omitted from the list, or a listed contract without a body link, fails coverage. Every listed file is hashed as both an authored input and part of the candidate fingerprint, so changing a detailed screen or flow invalidates acceptance.

Each surface declares:

| Field                 | Meaning                                                                                                                                                                                                                                       |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                  | Unique review target, such as `home-ios` or `landing-mobile`.                                                                                                                                                                                 |
| `surfaceId`           | Existing studio screen or funnel ID.                                                                                                                                                                                                          |
| `kind`                | `native`, `landing`, or `web`.                                                                                                                                                                                                                |
| `platform`            | A selected native platform from studio, or `web`. A stack name never proves an untested device platform.                                                                                                                                      |
| `viewport`            | `native`, `mobile`, or `desktop`. Browser mobile is at most 600 CSS pixels wide; desktop is at least 900. Add intermediate layouts as further product-specific tests when needed.                                                             |
| `routePath`           | Exact browser URL path, such as `/` or `/landing/`. It is required for landing and web surfaces and forbidden for native surfaces.                                                                                                            |
| `productScreenIds`    | Accepted `class.screen` instance IDs represented by this target. All accepted product screen instances require a mapping.                                                                                                                     |
| `implementationPaths` | Explicit source files or directories whose changes invalidate the candidate. Include actual surface code, shared tokens/assets, relevant dependencies, and the entrypoint used to build. Do not include caches or the evidence report itself. |
| `rubricPath`          | Frozen rubric in `design/reviews/rubrics/`.                                                                                                                                                                                                   |
| `locales`             | Every locale this target must support.                                                                                                                                                                                                        |
| `states`              | States requiring a runtime capture for every locale.                                                                                                                                                                                          |
| `stateExclusions`     | Unique `{state, reason}` entries for non-applicable loading, empty, error, offline, or permission-denied states. State the product reason. A required state cannot be excluded, and a state cannot be excluded twice.                         |
| `interactions`        | `{id, action, expected}` for the complete task and recovery/accessibility scenarios. The report cannot remove them.                                                                                                                           |

All surfaces require `default` and `reduced-motion`. Native requires `large-text` and `screen-reader`. Web requires `no-js` and `keyboard`. Each surface must cover or explain the non-applicability of `loading`, `empty`, `error`, `offline`, and `permission-denied`. These are minimum coverage rules, not the full product specification.

A surface exclusion has `surfaceId` and a substantive product reason. It is valid only when the existing studio row is already `not_needed`. Changing the report cannot remove accepted scope. A complete consumer business still needs actual native and landing surfaces.

## Frozen Calibration

The rubric has `schemaVersion: 2`, `id`, `frozenAt`, `references`, and `criteria`. Freeze it before producing the candidate. Version 1 rubrics require a reviewed source-resolution update and fresh acceptance, not an automatic schema-stamp rewrite.

Each reference has an `id`, HTTPS `url`, `{path, sha256}` artifact, `kind` (`visual`, `interaction`, or `documentation`), and a concrete `observation`. A visual reference must include an inspected PNG or JPEG image. Include at least one visual reference and one complementary interaction or documentation reference. Preserve the source date and inspection limitations inside the referenced pack.

Each selected reference also has `resolution`: `status`, `observedAt`, `provider`, and `sourceId`,
with `validUntil` and `substitutesFor` when applicable. Only `resolved` or `retained_snapshot` can
support a lock. The observation must not postdate the frozen rubric. Explicit expiry must not
have passed at review. A retained, hashed capture can remain useful when its old signed URL
expires; it is not a claim that a remote catalog is currently reachable.

Record failed source attempts in the reference pack, not as accepted calibration evidence.
Choose only declared alternatives that cover the required visual, interaction or documentation
kind. Documentation cannot replace motion evidence. `check:design-md` validates these source
requirements at an accepted/locked scope; `check:design-acceptance` uses the same validator.
Neither check grants access to another provider or spending authority.

Each criterion has an `id`, `facet`, product-specific `condition`, `minimum` (`meets` or `exceeds`), and `referenceIds`. Cover all seven facets: `coherence`, `originality`, `craft`, `functionality`, `accessibility`, `motion`, and `cross_surface_identity`. Use separate criteria when one facet has several independent requirements. These are ordinal judgments against explicit conditions, not an objective numerical beauty score.

Do not weaken a frozen floor after seeing a failed candidate. A legitimate product or rubric revision changes the input hash and requires fresh production, capture, and review.

## Evidence Report

The report records source hashes for `product.yaml`, `DESIGN.md`, `studio/seed/business.json`, and every declared `designContractPaths` entry. It records the candidate source inventory hash, production time and producer `{id, sessionId}`, exact native and browser runtimes, independent reviewer `{id, sessionId}`, review time, `verdict: pass`, surface reviews, and findings. `reviewer.sessionId` comes from the immutable execution identity in the current audit brief and must match the latest implementation-craft audit attempt owner. The review time must fall inside that attempt. A surface capture or interaction row is only `{id, receipt, producer}`. `receipt` is the current path and SHA-256 of the producer receipt. `producer` names its workflow ID, attempt ID, and engine-owned accepted output fingerprint.

The helper `designCandidateFingerprint(root, scope)` hashes every detailed design contract and every regular implementation file under the authored implementation paths, in stable path order. Added implementation files also change the fingerprint. Producer evidence roots are excluded when they sit beneath an implementation directory, so capturing a candidate does not change that candidate. The helper `designArtifact(root, relativePath)` returns the current `{path, sha256}` for an evidence file. These helpers describe files; they do not create a review or invent evidence.

### Producer-bound capture and interaction receipts

A capture receipt is a strict `design-capture` object. An interaction receipt is a strict `design-interaction` object. Both record `schemaVersion`, `surfaceId`, `evidenceId`, the evidence artifact path and byte SHA-256, the exact candidate hash, observed timestamp, named tool and version, producer session ID, source, and platform. The capture receipt also records state, locale, pixel dimensions, logical viewport, scale, and settings. The interaction receipt also records the authored interaction ID, locale, cited capture IDs, passing result, and concrete observation.

A native receipt records `runtimeId` and a device object with stable ID, model identifier, OS version, and OS build. The validator joins that identity to the current installed runtime and its platform receipt. A browser receipt records `runtimeId`, `browserContextId`, browser name and version, and OS identity. An interaction can cite only captures from the same registered runtime and browser context.

The validator reads `run/run-state.json` for every evidence reference. It derives the producer node from the declared workflow, requires the current latest attempt to be succeeded, and requires the receipt session to equal that attempt owner. The native producer must have exactly one accepted current-attempt binding at `proof`; the landing producer must have exactly one at `growth/landing`. The validator recomputes that binding from workspace bytes and derives its one-output fingerprint instead of trusting the report's label. Both the receipt and its evidence artifact must remain beneath the binding and their platform-specific producer lane. A receipt written or changed by the audit after producer acceptance makes the binding stale. The implementation audit workflow can never be the receipt producer.

This engine join is required even when the receipt JSON looks valid. A shell-capable audit worker can write JSON and refresh report prose. It cannot turn those bytes into accepted producer output by editing the report. Re-run the owning native or landing producer when capture or interaction evidence changes.

### Exact browser runtime identity

Every report has a `browserRuntimes` registry. Each entry has a unique ID. It records the candidate hash, current source and build fingerprints, served origin and document URL, browser name and version, context ID, OS identity, launch and navigation transcript hashes, and one matching receipt.

The landing producer authors `growth/landing/browser-proof.json` before proof. It names one runtime ID, the browser acceptance surface IDs, their exact source roots, the current candidate SHA-256, every built resource and its served URL path, the entrypoint, served origin and URL, and the Chrome channel. Run `b2c browser-proof --workspace . --session-id <authorization.executionIdentity>` while the local server is available. The command refuses stale candidate config, source roots that differ from the selected acceptance surfaces, build paths outside those roots, a route that differs from `routePath`, an insecure remote origin, a redirect to another page, or served response bytes that differ from the current build.

The command creates a fresh Chrome process and browser context. It writes an immutable attempt directory under `growth/landing/proof/browser-runtimes/` and atomically selects its receipt through `growth/landing/proof/browser-proof.json` only after the whole bundle succeeds. `check:browser-runtime-proof` recomputes the config, candidate, source, build, response, and transcript bindings. It also requires the supplied `--session-id` and proof timeline to match the current engine-issued landing producer attempt. An old session cannot be copied into a new accepted landing binding.

The landing producer writes a strict `browser-runtime-launch` receipt under `growth/landing/proof/`. Its `source.root` must be the canonical business workspace. Its sorted `source.roots` must equal the authored `implementationPaths` for every browser surface that cites this runtime. The validator recomputes that source fingerprint from current workspace bytes. A label cannot bind an old build to changed landing source.

The receipt points to a strict build manifest. That manifest binds the source fingerprint, one entrypoint, and every build file used by the page. Each file must remain under an authored implementation path and keep its recorded SHA-256. The validator derives the build fingerprint from the canonical manifest. The report and launch receipt must name that same fingerprint.

The receipt also points to a resource manifest. It records the exact origin, document URL, context ID, resource URLs, build paths, and retained response bytes. Every response must match its current build file. The served document must match the build entrypoint. The manifest must cover the build exactly. Remote origins require HTTPS. Explicit `localhost`, `127.0.0.1`, and `[::1]` origins may use HTTP for local proof.

The launch and navigation transcripts are distinct hashed artifacts. The timeline starts after candidate production. It launches the isolated browser context, completes navigation with a 2xx or 3xx status, and finishes before review. The final navigation URL must equal the served URL. Its pathname must equal each citing surface's authored `routePath`.

Each browser surface review declares its exact `runtimeIds`. Every browser capture and interaction receipt cites one registered runtime and its exact context ID. Its browser, OS, producer session, and timestamp must match the launch receipt. Captures and interactions happen after navigation. An interaction can cite only captures from that same runtime and context. This join prevents an old tab or unrelated route from being relabeled with the current candidate hash.

### Exact native runtime identity

Every report has a `nativeRuntimes` registry. Each entry records a unique `id`, `platform` (`ios` or `android`), platform-specific `target`, candidate hash, source fingerprint, stable device identity, operating-system identity where required, and the path and hash of one matching receipt. The validator recomputes the receipt source fingerprint inside the current business workspace. An old receipt cannot be relabeled as a changed candidate.

An iOS simulator entry uses `platform: ios` and `target: simulator`. It records bundle ID, build number, executable SHA-256, whole-bundle content SHA-256, source fingerprint, and simulator ID. It consumes the structured rung-2 artifact from the native iOS Route Ladder. The receipt must show one passing build, build verification, install, installed-byte readback, and terminated-process launch in that order. Its `installedBuild` must match every runtime identity field. This route can prove ordinary simulator captures and interactions. It cannot prove VoiceOver behavior on a physical iPhone.

An iOS physical-device entry uses `platform: ios` and `target: physical-device`. It consumes a `physical-ios-install` receipt from the trusted physical-device run and also records `deviceModelIdentifier`, `osVersion`, and `osBuild`. The receipt binds the candidate and built app to the exact installation input through its bundle ID, build number, executable hash, bundle-content hash, app path, and source fingerprint. It then records installed app bundle/build readback from the same stable physical iPhone, followed by launch. The receipt device ID, iPhone model identifier, OS version, and OS build must match the runtime. Build, install, device-readback, and launch transcripts each require a distinct hashed artifact.

An Android runtime uses `platform: android` and `target: emulator` or `physical-device`. It records package name, integer `versionCode`, the built package format and SHA-256, the exact installation APK SHA-256, source fingerprint, device ID and model identifier, API level, OS version, and OS build. An `android-emulator-install` receipt binds an emulator under `proof/android-emulator/`; a `physical-android-install` receipt binds a physical Android device under `proof/android-device/`. Both receipts must record build, install, installed-app package/version readback, and launch on the same device in order. The receipt `source.root` must be the current business workspace. Its deduplicated `source.roots` must equal the Android native surface `implementationPaths` exactly; a convenient unchanged subset cannot stand in for the current app. A built APK is also the installation APK. A built AAB is not directly installable: its receipt must bind the AAB, a derived install APK, and a separate hashed conversion transcript; installation must use that derived APK. Build, conversion when required, install, device-readback, and launch evidence paths must be distinct.

The built-in `b2c proof` MobAI route produces bounded device-action evidence. It uses `apkanalyzer` to reject an APK whose manifest package or version differs from the requested install, then installs, reads back, launches, and captures on one pinned target. It does not prove source-to-APK build linkage and therefore cannot produce the strict receipt above. Strict Android acceptance requires a named machine-produced build/install receipt adapter that supplies the complete identity chain. The audit worker must consume that receipt and must never reconstruct or hand-author it from MobAI output. When no such adapter is connected, record `android.strict_receipt_adapter_required` as the blocker and keep acceptance incomplete.

Every native receipt timeline starts after candidate production and finishes before review. A build log, a screenshot, or an already-installed app cannot replace a platform receipt.

Each native surface review declares the exact set in `runtimeIds`. Every native producer receipt supplies its own `runtimeId`. This lets ordinary states cite an installed simulator or emulator while VoiceOver or TalkBack evidence cites a physical device in the same surface review. Every native receipt must use the platform receipt's device identity after install and launch. An interaction can cite only captures from its own receipt-verified runtime.

`screenReader: true` requires a `physical-device` runtime. Its interaction must cite that same physical runtime. An iOS simulator cannot prove VoiceOver, and an Android emulator cannot prove TalkBack, by setting a Boolean or changing a label. Unused receipts, unknown runtime IDs, and receipt identities that do not match the current candidate fail acceptance.

Each surface review records:

- The exact frozen rubric path and hash.
- Capture references with a globally unique `id`, exact receipt path and hash, and accepted producer reference. The producer receipt owns state, locale, artifact path and hash, capture time, candidate and runtime identity, tool, device or browser identity, dimensions, viewport, scale, and settings. Use actual PNG or JPEG runtime captures, not a Design Room render, generated mockup, or marketing composition. Record at least 240 pixels per image side.
- Interaction references with a globally unique evidence `id`, exact receipt path and hash, and accepted producer reference. The producer receipt owns the authored interaction ID, locale, execution time, candidate and runtime identity, tool, device or browser identity, artifact, capture IDs, result, and observed behavior. Accessibility and reduced-motion states require interaction evidence, not only screenshots.
- One judgment for every frozen criterion, with `id`, exact `verdict` (`fails`, `meets`, or `exceeds`), a concrete `observation`, and `evidenceIds`. Functionality, accessibility, and motion need interaction evidence.

Ordinary criteria may cite evidence only from their own surface. A `cross_surface_identity` criterion is the deliberate exception: it must cite its own current capture plus globally unique captures from at least one native surface and one landing surface. This makes the comparison executable without letting a strong landing screenshot stand in for a weak native criterion.

Capture and interaction times must follow candidate production and precede review. The review cannot be future-dated. File hashes must still match. No open finding can accompany acceptance. Keep unresolved findings and failed judgments in the repair workflow until the producer has corrected them and a fresh review passes.

## Check And Repair

```bash
npx tsx checks/validation/business/design/check-design-acceptance.ts --root /path/to/business
npx tsx tooling/grade-design-surface.ts --root /path/to/business --acceptance-report design/proofs/design-acceptance.json
```

The explicit acceptance mode exits nonzero for missing or stale evidence, self-review, an invented or old audit identity, missing platform or state coverage, unknown criteria, unmet floors, and unresolved findings. `design_acceptance.report_coverage` identifies audit structure, current-attempt output binding, duplicate indexes, and Markdown-to-JSON binding repairs. `design_acceptance.surface_coverage` identifies omitted required product surfaces or absent current producer evidence. It does not change the grader's ordinary advisory behavior. Use the exported `validateDesignAcceptance(root)` function from the full-business closeout gate.

After a valid product or craft rejection, return observations to the responsible producer through the existing graph. Invalidate affected downstream work, repair the candidate, recapture, and run an independent review. A missing, changed, symlinked, malformed, stale, or misbound audit artifact retries only the audit within its bounded cap because it has not established a product defect. Preserve the full mandate. Ordinary repairs do not require another founder prompt. Protected actions and the founder's shipment decision retain their existing authority boundary.

## Execute The Complete Design Loop

Executed product reviews expose failures that a polished default screenshot cannot reveal. Use this
sequence with the actual product, through the existing producer and review workflows:

1. Reconcile the authored scope with the implemented surface. A landing with local
   editing, persistence, and import has real empty and error states. Do not exclude
   them as if it were static marketing. Freeze the rubric and source inventory.
2. Run the platform proof route for every selected native platform. For iOS simulator
   evidence, build the target, install that exact new binary, read the installed bytes
   back, terminate any running process, and launch the verified install. For Android,
   bind package name and `versionCode`, install the built APK or an APK derived from the
   recorded AAB, read the installed package/version from the same emulator or device,
   and launch it. A derived APK needs its own hash and AAB-to-APK conversion evidence.
   For VoiceOver or TalkBack, run the matching physical-device route and record model,
   device ID, API level where applicable, and exact OS version/build. Carry each receipt
   identity into `nativeRuntimes`.
   Link each native capture and interaction to the runtime that produced it. A successful
   build followed by an older installed app does not exercise the candidate. Serve the
   current web sources and shared assets for the browser review.
3. Execute the complete task and its recovery path. Inject failed writes at both
   primary and backup boundaries in an isolated test store. Check visible state,
   entered fields, undo state, the saved primary, and the previous good backup.
   A failed primary write must not silently replace the recovery point. Preserve
   malformed stored bytes; ordinary edits must not overwrite them before an
   explicit safe recovery. Validate imports before replacement.
4. Exercise keyboard and assistive-technology paths after state changes. A rerender
   can remove the focused control even when its replacement looks identical.
   Check focus after a state change, undo, editor save/cancel, and item removal. Return
   focus to a surviving meaningful control and confirm the next action works.
5. Capture the resulting native and browser states and compare them together.
   Include shared original geometry, fonts, and platform adapters in the candidate
   fingerprint. Verify the actual rendered font and objects, not just matching
   token names. Record distinct accessibility settings and observed interactions.
   When offline is identical to default, record disconnected execution with that
   default capture and an explicit applicability explanation instead of duplicate
   pixels. A screenshot or schema check cannot prove a gesture or recovery path.
6. Have an independent reviewer grade every frozen criterion using those artifacts.
   Return concrete findings to the responsible producer, repair, rebuild/reinstall,
   recapture affected work, and review the current candidate again. Keep missing
   evidence and unresolved findings visible until the acceptance contract is met.

## Runnable examples

The [examples area](https://github.com/Clueless-Creations/b2c-app-builder/tree/main/examples) links runnable sources, real captures,
and their verification limits. Reproduce the relevant interaction and recovery
checks for the selected business. Example acceptance never transfers to a new
candidate.

## Limits

Regular-file checks, confined paths, image parsing, digests, engine-owned producer bindings, receipt identity, runtime links, and chronology prevent common invalid evidence. They cannot establish that a named tool or reviewer is truthful if the trusted execution boundary itself is compromised. Installed-build readback on iOS and installed-package/version readback on Android, physical-device tool transcripts, actual runtime inspection, and the independent session must supply that trust. Do not describe a passing synthetic fixture as an award-quality app or a profitable business.
