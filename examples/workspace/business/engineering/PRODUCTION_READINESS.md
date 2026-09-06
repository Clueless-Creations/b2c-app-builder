# Production Readiness

Status: partial until provider proof, mobile proof, store proof, security proof, and founder-only gates are resolved.

Do not mark this app launch-ready until `operations/PROVIDER_PROOF.md`, `state/business-state.json`, and focused validators agree.

Compound Engineering readiness: record `ce-code-review`, the applicable CE test route such as `ce-test-browser` or `ce-test-xcode`, MobAI or equivalent E2E proof, and a `ce-proof` proof artifact before the engineering lane is done.

## MobAI Cross-Platform Proof

Keep component versions separate and replace every Pending value with live evidence before using MobAI to close engineering readiness.

- Docs checked: Pending
- Desktop app: Pending
- MCP server: Pending
- CLI package: Pending
- Selected tier: Pending (`Free`, `Plus`, `Pro`, blocked, or not needed)
- AI-healed flow: Pending (not used, or reviewed diff + passing rerun + evidence)
- Host-side script safety: Pending (not used, or endpoint allowlist + no embedded secrets + cleanup + backend proof)

| Platform | Device / OS | `.mob` flow | Evidence path | Provider correlation | Result  |
| -------- | ----------- | ----------- | ------------- | -------------------- | ------- |
| iOS      | pending     | pending     | pending       | pending              | Pending |
| Android  | pending     | pending     | pending       | pending              | Pending |

Run `npm run check:mobai-proof -- --root . --state state/business-state.json` and attach the result before MobAI closes a mobile engineering lane. A generated or AI-healed flow is not proof until its diff is reviewed and the edited flow reruns successfully. Predicate/condition loops need an explicit cap; parameterized counted loops need a validated bound. Host scripts must stay on allowlisted test/staging endpoints and keep secrets outside `.mob`/embedded JavaScript.

## Native iOS Proof

Use this section for iOS/iPadOS implementation proof when native Apple tooling is in scope. Simulator, preview, and browser-stream proof must be paired with `operations/PROVIDER_PROOF.md` when app actions depend on RevenueCat, PostHog, Stripe, Resend, Sentry, databases, or store-console state. A simulator build alone is not distribution readiness and does not prove App Store signing, archive, export, upload, TestFlight, or founder approval; keep those gates in `store/APPLE_SIGNING.md`.

Start at the lightest route that can produce the evidence this lane needs (see the Route Ladder in `xcodebuildmcp-testing.md`) and record why any escalation happened. Choosing an easier route that drops Android coverage, suite repeatability, CI, or physical-device reach is a coverage decision for `strategy/TOOL_DECISIONS.md`, not a convenience.

| Route                                                                    | Required evidence                                                                                                                                                                                                                                                                                                                                                                                   | Output path                                                                                                                                            | Limitation                                                                                                                                                    | Status  |
| ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| In-app iOS Simulator (Claude Code Desktop pane / Codex `build-ios-apps`) | agent surface and app version; plan/policy gate cleared; local session confirmed (the pane is unavailable in cloud and SSH sessions); simulated device and OS, e.g. iPhone 17 Pro / iOS 26; fixture or sandbox account only, never a real founder/customer/provider account, because device screenshots leave the machine under normal conversation retention; what was built, launched, and tapped | `proof/ios-simulator/<date>/` — screenshots and recordings land on the macOS Desktop; copy them into this path and commit before citing them (pending) | Simulated devices only: no physical device, no Android coverage, no signing/archive/upload/TestFlight proof, and not a repeatable regression suite or CI gate | Pending |
| Codex Desktop native iOS / XcodeBuildMCP                                 | `session_show_defaults`; MCP tool route such as `build_run_sim`, `test_sim`, screenshot, UI snapshot, or logs; project/workspace; scheme; simulator/device; OS/runtime; configuration                                                                                                                                                                                                               | screenshots/logs/xcresult path pending                                                                                                                 | Apple simulator/device proof only; does not replace MobAI Android proof, provider proof, or distribution readiness                                            | Pending |
| XcodeBuildMCP CLI                                                        | docs checked date; `xcodebuildmcp --help` or `xcodebuildmcp tools`; project/workspace; scheme; simulator/device or destination; command output                                                                                                                                                                                                                                                      | CLI output path pending                                                                                                                                | Apple-only CLI proof; record docs-vs-skill mismatch and missing MobAI coverage                                                                                | Pending |
| SnapshotPreviews                                                         | package URL/version/commit; `SnapshotTest` or `PreviewLayoutTest`; `TEST_RUNNER_SNAPSHOTS_EXPORT_DIR`; exported `.png` and `.json` under `snapshot-images`; deterministic preview fixtures                                                                                                                                                                                                          | `snapshot-images/` pending                                                                                                                             | preview-only coverage; not runtime E2E and not real app E2E/provider proof                                                                                    | Pending |
| serve-sim                                                                | package/version or `npx serve-sim` resolution; booted simulator/device; preview URL/port such as `http://localhost:3200`; actions from `serve-sim gesture`/`button`/`type`; stream/log evidence                                                                                                                                                                                                     | browser capture/log path pending                                                                                                                       | simulator stream only; does not replace backend/provider proof or App Store signing readiness                                                                 | Pending |

### In-App Simulator Evidence Capture

The simulator pane produces evidence the founder can capture without any tooling. Nothing streamed into the conversation is evidence until it exists as a committed file.

| Capture                | How                                                            | Lands at          | Move it to                                         |
| ---------------------- | -------------------------------------------------------------- | ----------------- | -------------------------------------------------- |
| Still frame            | the pane's screenshot shortcut with the simulator pane focused | macOS Desktop     | `proof/ios-simulator/<date>/<screen>.png`          |
| Screen recording       | the pane's record shortcut to start and stop                   | macOS Desktop     | `proof/ios-simulator/<date>/<flow>.mov`            |
| Agent-taken screenshot | the agent captures it while driving the device                 | conversation only | re-capture or export it to a file before citing it |

Also record for this route:

- Consent is per device and covers control plus screenshots; the first use of each device prompts for it.
- Two actions follow the session permission mode rather than that one-time consent, so name them when they happen: opening a URL on the device (a deep link or Safari test can carry data off the device) and building the app (`xcodebuild` runs the project's build scripts on the Mac).
- Agent-booted devices shut down on app quit, on session archive, or about 10 minutes after detach. Export captures before detaching; a device that is gone cannot be re-screenshotted.
- Founder taps and agent taps share one device. State changed by a founder tap mid-run invalidates the step it landed in; re-run that step.

Run `npm run check:native-ios -- --root .` and attach the result before marking iOS engineering, screenshot, app-preview, or production-readiness lanes done.

### Native iOS Launch-Critical Test Matrix

Name the prerelease `.xctestplan`, its unit/integration/UI/performance targets, release configuration, and the real evidence path for every applicable row. A done engineering lane needs existing `.xcresult`, screenshot/video, log, metrics JSON, or provider-correlation artifacts rather than prose-only claims.

| Risk / journey                     | Required variants                                                                                                                  | Runtime route                                         | Evidence path | Provider correlation                      | Result  |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | ------------- | ----------------------------------------- | ------- |
| cold launch and core value journey | smallest/largest supported device, supported OS matrix                                                                             | in-app simulator, XcodeBuildMCP, or MobAI runtime E2E | pending       | backend/PostHog pending                   | Pending |
| account lifecycle                  | create/login/logout plus account deletion                                                                                          | UI + integration tests                                | pending       | auth/backend pending                      | Pending |
| purchase lifecycle                 | StoreKit local purchase, sandbox/TestFlight entitlement, restore, refund/cancel state                                              | StoreKit + real provider read-back                    | pending       | RevenueCat/store pending                  | Pending |
| permissions                        | allowed and denied paths with alternate UX                                                                                         | UI tests on device/simulator                          | pending       | analytics pending                         | Pending |
| resilience                         | offline, timeout, server error, retry, background/foreground, notification/deep link, interruption                                 | integration + UI tests                                | pending       | backend/Sentry pending                    | Pending |
| accessibility and presentation     | `XCUIApplication.performAccessibilityAudit` or equivalent accessibility audit, VoiceOver task, Dynamic Type, light/dark appearance | accessibility tree + screenshots                      | pending       | n-a                                       | Pending |
| localization                       | supported locale/region matrix, truncation, RTL where applicable                                                                   | `.xctestplan` configurations                          | pending       | n-a                                       | Pending |
| performance                        | cold-start, memory, FPS/jank, network, battery, crash/log budget                                                                   | XCTest performance + MobAI metrics                    | pending       | Sentry/performance pending                | Pending |
| release device                     | Release configuration on a physical device, or explicit blocked/not-applicable reason                                              | signed device build                                   | pending       | store/APPLE_SIGNING.md/TestFlight pending | Pending |

Record device/OS/locale/appearance/account-fixture coverage, skipped conditions, and the limitation of each route. SnapshotPreviews remains preview-only; simulator proof does not replace provider, signing, TestFlight, or physical-device release behavior. In-app simulator rows additionally record that the run used a fixture or sandbox account: the agent's device screenshots are sent to the model provider and kept under normal conversation retention, so a real founder, customer, store, bank, or provider account may never be signed in on a device the agent drives.

## Experience Cards (Bright-Line Evidence)

Required when `EMOTIONAL_DESIGN.md` applies Experience Cards — proof, not prose, for each card's bright line. The emotional_design lane is not done until every applicable row is verified on a real device with evidence attached.

| Card                   | Bright-line claim                                                                          | Evidence required                                                                | Verified |
| ---------------------- | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- | -------- |
| Commitment             | editable by the user at any time                                                           | screenshot of Settings edit flow on device                                       | Pending  |
| Variable Reward        | variation is real (≥30% content differentiation) or personalization convergence documented | `reward_variant` returns ≥2 distinct values in PostHog; or convergence rationale | Pending  |
| Perceived Effort Delay | ≥50% of displayed steps map to real operations                                             | step-to-operation map from `engineering/TECH_SPEC.md`; `real_step_ratio` value   | Pending  |
| Intent Mirroring       | sources only user-provided fields; never on cancel/downgrade                               | source-field log; cancel-flow walk shows no mirror                               | Pending  |
| HIGH-risk cards        | counter-metric monitored                                                                   | PostHog "Dark-Pattern Watch" dashboard live with alerts                          | Pending  |

Run `npm run check:emotional-design -- --root .` and attach the result. Any unproven bright-line row blocks the emotional_design lane and mirrors to `lanes.emotional_design.blockers`.
