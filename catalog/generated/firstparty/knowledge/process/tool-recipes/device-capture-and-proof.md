# Device Capture And App Proof

Use current tools and live data whenever possible. Treat this file as workflow, not fixed facts.

Part of the [Tool Recipes](../tool-recipes.md) index. Before using any paid or account-gated tool named below, honor the **Paid Tool Decision Protocol** and **Founder-Only Gates** in that index.

---

## In-App Simulator, MobAI Toolbelt, Recorders, Native iOS, And CLI Simulator Capture

Purpose: capture truthful app UI for App Store and Google Play screenshots, record polished demo videos, create app-preview/social proof, and compose final assets with the design system.

Load `xcodebuildmcp-testing.md` first for any "run the app / check this screen / walk this flow / reproduce this bug" request: its Route Ladder starts at the in-app iOS Simulator (rung 0 — Claude Code Desktop's simulator pane or Codex with the `build-ios-apps` plugin), which needs no install and no account, and it also covers the CLI `computer-use` route, XcodeBuildMCP, SnapshotPreviews preview exports, serve-sim streaming, and Apple simulator/device command examples. Always load `mobai-toolbelt.md` before MobAI device automation, recorder skills, Android coverage, repeatable `.mob` suites, polished demo/app-preview recording, or MobAI-adjacent build/test tooling. Refresh the MobAI org and relevant repo docs before installing or naming commands.

Use when:

- a local iOS or Android build exists
- store screenshots need real app state
- review/rejection work depends on what a reviewer sees
- screenshot copy or layout must be verified on actual device sizes
- launch, store, Fastlane, UGC, support, or investor materials need a polished app-flow video

Preferred routing:

- For a single screen check, flow walk, or bug repro on a local Mac, use the in-app iOS Simulator (rung 0) and stop there — no MCP server, no CLI install, no founder gate.
- Use the MobAI MCP tools when exposed in the current runtime and the lane needs Android, a repeatable suite, multi-device runs, or polished demo recording.
- Before any device interaction, read the MobAI device automation reference or the local `using-mobai-cli` skill.
- Observe the UI tree before tapping, prefer accessibility IDs, wait for stable UI after each navigation, then observe again.
- Save raw full-quality screenshots before composition.

MobAI CLI route:

- Keep component versions separate. The 2026-07-13 verified snapshot is desktop `2.5.1`, MCP `2.5.0`, and npm CLI `2.1.1`; the desktop release body has no detailed notes, while MCP commit `414f858` is the public source for 2.5-era loop and host-scripting behavior.
- Check the current CLI first: `npm view @mobai-app/cli dist-tags.latest`, then prefer `npx @mobai-app/cli@latest` or a verified global install.
- Use `mobai version`; `mobai --version` is not valid on the verified CLI contract.
- `mobai devices list`
- set `MOBAI_DEVICE` for the target device
- `mobai observe --include ui_tree`
- navigate with stable selectors or accessibility IDs
- `mobai wait --stable --timeout-ms 3000`
- `mobai screenshot --full --path ./screenshots/raw --name <platform-device-slot>`
- use `mobai record` for screen recordings when product-demo clips are needed and the current CLI supports it

MobAI MCP 2.5-era DSL route:

- Read `mobai://reference/device-automation` and `mobai://reference/testing` from the active server before using new actions.
- `repeat` takes exactly one of `times`, `while`, `until`, or `condition`; set an explicit `max_iterations` for predicate/condition loops and validate counted-loop parameters because `times` has no engine safety cap.
- `run_script`/`eval_script` run host-side JavaScript, not device web JavaScript. The restricted VM has `vars`/`output`, synchronous HTTP, captured console output, selected built-ins, and no filesystem, `require`/`import`, or device access.
- Never embed secrets or credential headers in `.mob`/JavaScript: referenced script files are embedded in compiled DSL. Seed authenticated fixtures through a separate approved Doppler-wrapped setup step and pass MobAI only non-secret IDs unless a current secret-safe action is explicitly reviewed.
- Limit host HTTP to allowlisted test/staging endpoints, validate responses as untrusted data, and record fixture cleanup plus backend proof separately from UI success.

Recorder-skill route:

- For iOS or Android app demos, use `https://github.com/MobAI-App/mobile-recorder-skill` after refreshing current `README.md`, `install.md`, and `skills/mobile-recorder/SKILL.md`.
- For macOS or web demos, use `https://github.com/MobAI-App/desktop-recorder-skill` after refreshing current `README.md`, `install.md`, and `skills/desktop-recorder/SKILL.md`.
- Mobile recorder produces a reproducible `.mob` choreography, native device recording, tap ripples, finger overlay, phone bezel/background, zoom, variable speed, captions, final mp4, and upload copy.
- Desktop recorder produces a reproducible `screenplay.json`, native recording, click ripples, cursor sprite, captions, zoom, variable speed, final mp4, and upload copy.
- Follow the upstream golden rule: explore -> script/screenplay -> dry-run -> record -> edit/export. Never improvise during the final recording.
- Create `growth/DEMO_VIDEO.md` for launch demo videos and link `.mob` or `screenplay.json`, raw captures, final exports, captions, and upload copy.

Confirmed free fallback:

- MobAI is freemium: use its free tier without a spend gate when one device/current quotas fit, but ask before Plus/Pro spend. If MobAI is unavailable and the lane is iOS-only, the in-app iOS Simulator (rung 0) is the first fallback — free, zero-setup, no spend gate — and only the lost Android/suite/CI/physical-device coverage needs recording per [`paid-tool-routing.md`](../../operations/paid-tool-routing.md). Escalate to XcodeBuildMCP when the lane needs scripted builds, CI, or physical hardware, and record the Apple-only limitation either way.
- After confirmation, load `xcodebuildmcp-testing.md` for iOS/iPadOS/macOS/tvOS/watchOS/visionOS build, run, UI automation, screenshot, video, and log workflows.
- Refresh official XcodeBuildMCP docs and local `xcodebuildmcp --help`/`xcodebuildmcp tools` output before setup commands, CLI syntax, MCP tool names, screenshot captures, or readiness proof.
- Use XcodeBuildMCP for Apple simulator/device captures and record the missing MobAI coverage. Use Android emulator/ADB or mark Android proof blocked for Android-only flows.

In-app native iOS route (rung 0, both runtimes):

- In Claude Code Desktop on a Mac (local sessions only — never cloud or SSH), state the goal plainly ("run the app in the iOS Simulator and tap through the signup flow"); the simulator pane opens itself when the app runs. Consent is per device, and screenshots of the device leave the machine — use fixture/sandbox accounts only, never a real account.
- In Codex with the `build-ios-apps` plugin, call `session_show_defaults` before the first build/run/test, use `build_run_sim` when defaults are set, read the accessibility hierarchy before interacting, and prefer stable labels over raw coordinates.
- Record the runtime and app version, the plan/policy gate cleared, that the session was local, the simulated device and OS, the fixture account, output paths, and the simulator-only/no-Android/no-distribution limitation in `engineering/PRODUCTION_READINESS.md`.

CLI proof tools:

- SnapshotPreviews (`https://github.com/getsentry/SnapshotPreviews`) supports XCTest preview checks. Link `SnapshottingTests`: `SnapshotTest` can export snapshots, while `PreviewLayoutTest` checks layout without PNG export. Use `TEST_RUNNER_SNAPSHOTS_EXPORT_DIR` for snapshot export and label the results preview-only, not app-session evidence.
- serve-sim (`https://github.com/EvanBacon/serve-sim`) streams and controls a booted iOS Simulator in a browser. Resolve the explicitly selected executable/version before starting a local preview at `http://localhost:3200` or the chosen port. Record a specific booted simulator/UDID, actions and logs. No implicit `npx` download, webcam capture or remote exposure is authorized; streaming does not replace provider proof or App Store signing readiness.

These source reviews do not certify installed tools or authorize setup. Inspect
actual macOS, architecture, Xcode and dependency requirements before use. Keep
preview galleries internal; no camera injection, webcam access, host-permission
change or tunnel is implicit. Source selection never replaces runtime evidence.

Record in `SCREENSHOTS.md`:

- platform, device model/class, OS, app build, locale, theme, account fixture, and data fixture
- screen path and selector path used to reach it
- raw capture path
- demo choreography path: `.mob` or `screenplay.json` when recording video
- design-system frame/composition path
- final upload path and dimensions
- Apple display well or Google device class satisfied
- visual QA notes and upload status

Rules:

- Do not use generated art as a replacement for real app UI.
- Use Higgsfield for supporting backgrounds, mascots, icons, motion, or frame art only after the app screen is truthful.
- Keep raw captures separate from final upload assets.
- If capture is blocked by missing device/app access, leave the exact blocker. Continue with a clearly labeled design-system mock only after the founder approves the fallback.
