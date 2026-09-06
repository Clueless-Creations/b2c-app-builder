# {{APP_NAME}} Store Screenshots Packet

Docs refreshed: Pending
Status: partial
Owner: design-guru + marketing-guru + orchestrator

Raw device captures prove the product exists. Final store screenshots are composed marketing assets that combine real app UI, copy, device framing, current device wells, and visual QA.

## Source Ledger

| Source                                                                   | Role                                                   | Status  | Notes                                                                                                                                                                                                                                                                                                                                                                                        |
| ------------------------------------------------------------------------ | ------------------------------------------------------ | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DESIGN.md`                                                              | tokens, type, color, frame style, App Icon direction   | Pending | Required before production composition                                                                                                                                                                                                                                                                                                                                                       |
| `design.md`                                                              | screen inventory and screenshot-critical states        | Pending | Use real or faithful production screens                                                                                                                                                                                                                                                                                                                                                      |
| `11_STAR_EXPERIENCE.md`                                                  | V1 scalable slice and line of feasibility              | Pending | Screenshot claims must stay inside this line                                                                                                                                                                                                                                                                                                                                                 |
| `APP_STORE_LISTING.md`                                                   | metadata, privacy, pricing, CPP/event alignment        | Pending | Copy and offers must match listing truth                                                                                                                                                                                                                                                                                                                                                     |
| `CONTENT_ASSETS.md`                                                      | Higgsfield/Remotion route, license, outputs, approvals | Pending | Required when generated/rendered assets are used                                                                                                                                                                                                                                                                                                                                             |
| MobAI raw captures                                                       | real app proof layer                                   | Pending | Use approved fallback only after founder approval                                                                                                                                                                                                                                                                                                                                            |
| In-app iOS Simulator (Claude Code Desktop pane / Codex `build-ios-apps`) | zero-setup raw capture layer                           | Pending | Local macOS session only. Capture with the pane's screenshot/record shortcuts (Cmd+S / Cmd+R), copy off the Desktop into `screenshots/raw/`, and record the device, OS, and fixture account in `engineering/PRODUCTION_READINESS.md`. Fixture or sandbox accounts only — the agent's device screenshots leave the machine. Simulated devices only: no physical-device and no Android capture |
| Codex Desktop native iOS / XcodeBuildMCP                                 | Apple simulator/device proof layer                     | Pending | Record `session_show_defaults`, project/scheme/simulator, tool names, and output paths in `engineering/PRODUCTION_READINESS.md`                                                                                                                                                                                                                                                              |
| SnapshotPreviews                                                         | preview snapshot proof layer                           | Pending | Preview-only PNG/JSON evidence via `TEST_RUNNER_SNAPSHOTS_EXPORT_DIR`; not runtime E2E proof                                                                                                                                                                                                                                                                                                 |
| serve-sim                                                                | browser-visible simulator proof layer                  | Pending | Record booted simulator/device, `http://localhost:3200` or chosen port, actions, logs, and limitations                                                                                                                                                                                                                                                                                       |
| ParthJadhav/app-store-screenshots                                        | production screenshot editor and bulk export board     | Pending | Use for copy-led iPhone/iPad/Play decks when installed or approved                                                                                                                                                                                                                                                                                                                           |
| `asc-screenshot-resize`                                                  | device wells, size, alpha, color space                 | Pending | Refresh current ASC sizing first                                                                                                                                                                                                                                                                                                                                                             |

## Asset Knowledge Brief

Store assets are not generic marketing — they are engineered from everything the launch already knows. Fill this brief before composing any screenshot or app preview, then feed it to the screenshot ASO skill and the `app-preview-video` skill. Generic, knowledge-free assets are a launch miss and an audit finding.

| Knowledge source                                                   | What it feeds into the assets                                                                                                                     |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `strategy/RESEARCH.md`                                             | target user, the problem in their own pain language, top objections to answer, competitor visual conventions to break from                        |
| `11_STAR_EXPERIENCE.md`                                            | the one magical V1 moment — this is the hook payoff and Screenshot 1                                                                              |
| `EMOTIONAL_DESIGN.md` + `knowledge/experience/experience-cards.md` | the Emotional North Star (the feeling the 5-second hook must create), the target emotional curve, and which Experience Card the hook instantiates |
| `DESIGN.md` + `strategy/BRAND.md`                                  | tokens, type, color, motion, and voice so every asset is design-aligned                                                                           |
| `APP_STORE_LISTING.md`                                             | keyword/positioning alignment so captions reinforce the metadata                                                                                  |

### Per-Slot Knowledge Map

| Slot                                  | Knowledge drawn on                            | Emotion / Experience Card targeted                                                                          | Headline | Truthfulness check                        |
| ------------------------------------- | --------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | -------- | ----------------------------------------- |
| Hook video — first frame + first 3–5s | 11-star magical moment + Emotional North Star | the hook's target feeling + card (e.g. Intent Mirroring "made for me", Variable Reward "look what you get") | Pending  | shows real app; matches what the app does |
| Screenshot 1                          | magical moment + main outcome                 | primary emotional beat                                                                                      | Pending  | no unsupported outcome claim              |
| Screenshot 2                          | differentiated proof / core loop              | competence, trust                                                                                           | Pending  | real UI                                   |
| Screenshot 3                          | conversion/result + objection answered        | confidence, momentum                                                                                        | Pending  | pricing matches `revenue/REVENUE_OPS.md`  |
| Screenshot 4–5                        | secondary benefit / breadth / trust           | belonging, relief                                                                                           | Pending  | one idea; no fake ratings/endorsement     |

## Narrative

| Slot | Purpose                   | Headline | Copy overlay | Source screen    | Claim/risk check                                  | Status   |
| ---- | ------------------------- | -------- | ------------ | ---------------- | ------------------------------------------------- | -------- |
| 1    | hook and main outcome     | Pending  | Pending      | onboarding/value | no unsupported outcome claim                      | blocked  |
| 2    | differentiated proof      | Pending  | Pending      | core loop        | real UI required                                  | blocked  |
| 3    | conversion/revenue moment | Pending  | Pending      | paywall/result   | pricing/trial must match `revenue/REVENUE_OPS.md` | blocked  |
| 4    | secondary feature         | Pending  | Pending      | feature state    | one idea only                                     | optional |
| 5    | trust or breadth          | Pending  | Pending      | settings/proof   | no fake ratings/endorsement                       | optional |

## Raw Capture Matrix

| Slot | Platform    | Device     | Locale | Source screen | Capture tool                                                                                                                                                                      | Raw path                                | Version localization ID | Status   |
| ---- | ----------- | ---------- | ------ | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- | ----------------------- | -------- |
| 1    | iOS         | iPhone 6.9 | en-US  | Pending       | in-app iOS Simulator (Cmd+S, fixture account), MobAI, Codex Desktop native iOS, XcodeBuildMCP, serve-sim, or approved fallback; SnapshotPreviews only for preview/component proof | `screenshots/raw/iphone-69-slot-1.png`  | Pending                 | blocked  |
| 1    | iOS         | iPad 13    | en-US  | Pending       | in-app iOS Simulator (Cmd+S, fixture account), MobAI, Codex Desktop native iOS, XcodeBuildMCP, serve-sim, or approved fallback; SnapshotPreviews only for preview/component proof | `screenshots/raw/ipad-13-slot-1.png`    | Pending                 | blocked  |
| 1    | Google Play | phone      | en-US  | Pending       | MobAI or approved fallback                                                                                                                                                        | `screenshots/raw/play-phone-slot-1.png` | n/a                     | optional |

## Production Composition Matrix

| Slot            | Target      | Headline | Copy overlay | Layout                           | Supporting asset                             | Route                                  | Final upload path                                   | Dimensions        | Alpha/color space               | Visual QA         |
| --------------- | ----------- | -------- | ------------ | -------------------------------- | -------------------------------------------- | -------------------------------------- | --------------------------------------------------- | ----------------- | ------------------------------- | ----------------- |
| 1               | iPhone 6.9  | Pending  | Pending      | framed App Store screenshot      | Higgsfield background or design-system frame | Remotion/HTML composition from real UI | `screenshots/final/iphone-69-slot-1.png`            | current ASC size  | alpha removed, sRGB color space | thumbnail pending |
| 1               | iPad 13     | Pending  | Pending      | framed iPad App Store screenshot | design-system frame                          | Remotion/HTML composition from real UI | `screenshots/final/ipad-13-slot-1.png`              | current ASC size  | alpha removed, sRGB color space | iPad QA pending   |
| Feature graphic | Google Play | Pending  | Pending      | wide brand/product frame         | Higgsfield or design-system artwork          | content asset route                    | `screenshots/final/google-play-feature-graphic.png` | current Play size | sRGB color space                | optional          |

## Composition And Export Route

Preferred local route: ParthJadhav/app-store-screenshots.

Inputs:

- real app captures from `screenshots/raw/`
- `app-icon/app-icon-1024.png`
- `DESIGN.md`, and `11_STAR_EXPERIENCE.md`
- headline/copy story from `APP_STORE_LISTING.md`
- Higgsfield supporting art only when recorded in `CONTENT_ASSETS.md`

Outputs:

- screenshot editor or board: `screenshots/index.html` or generated app-store-screenshots workspace
- reusable deck state: `app-store-screenshots.json` when the external skill is used
- final no-alpha PNGs under `screenshots/final/<locale>/<device-well>/`
- ASC validation output and `asc-shots-pipeline` upload dry-run output in `store/STORE_CONSOLE.md`

## Device Wells

Run current sizing before export. Record ready, blocked, or not needed for each target.

| Platform    | Well               | Required/scaled decision                                               | ASC device_type | Screenshot count                        | Current Apple size basis                                                                      | Target file | Validation proof                | Status   |
| ----------- | ------------------ | ---------------------------------------------------------------------- | --------------- | --------------------------------------- | --------------------------------------------------------------------------------------------- | ----------- | ------------------------------- | -------- |
| iOS         | iPhone 6.9         | required for current iPhone coverage when provided                     | Pending         | 1-10 screenshots                        | from `asc screenshots sizes --all`; Apple currently accepts 1320x2868 portrait for this class | Pending     | `asc-screenshot-resize` pending | blocked  |
| iOS         | iPhone 6.5         | required if 6.9 is not provided, otherwise scaled when allowed         | Pending         | 1-10 screenshots                        | Apple currently accepts 1284x2778 or 1242x2688 portrait                                       | Pending     | `asc-screenshot-resize` pending | blocked  |
| iOS         | iPhone 6.3         | scaled from accepted larger wells when allowed by current ASC spec     | Pending         | 1-10 screenshots                        | current ASC size matrix                                                                       | Pending     | `asc-screenshot-resize` pending | blocked  |
| iOS         | iPhone 6.1         | scaled from accepted larger wells when allowed by current ASC spec     | Pending         | 1-10 screenshots                        | current ASC size matrix                                                                       | Pending     | `asc-screenshot-resize` pending | blocked  |
| iPadOS      | iPad 13            | required when iPad is supported                                        | Pending         | 1-10 screenshots                        | Apple currently accepts 2064x2752 or 2048x2732 portrait                                       | Pending     | `asc-screenshot-resize` pending | blocked  |
| iPadOS      | iPad 12.9          | scaled from 13 inch when allowed by current ASC spec                   | Pending         | 1-10 screenshots                        | current ASC size matrix                                                                       | Pending     | `asc-screenshot-resize` pending | blocked  |
| iPadOS      | iPad 11/10.5/9.7   | explicit, scaled, or not needed based on current device-family support | Pending         | 1-10 screenshots                        | current ASC size matrix                                                                       | Pending     | `asc-screenshot-resize` pending | blocked  |
| Google Play | phone screenshots  | required for Play listing                                              | n/a             | screenshot count from Play Console spec | Pending                                                                                       | Pending     | Play Console spec check pending | optional |
| Google Play | tablet screenshots | optional or required based on distribution target                      | n/a             | screenshot count from Play Console spec | Pending                                                                                       | Pending     | Play Console spec check pending | optional |
| Google Play | feature graphic    | required for many Play acquisition surfaces                            | n/a             | one graphic                             | Pending                                                                                       | Pending     | Play Console spec check pending | optional |

## App Icon

| Asset              | Source                                | Route                                      | Output                       | QA                                                                     | Status  |
| ------------------ | ------------------------------------- | ------------------------------------------ | ---------------------------- | ---------------------------------------------------------------------- | ------- |
| 1024x1024 App Icon | `DESIGN.md` + competitor icon context | Higgsfield or designer/founder-owned asset | `app-icon/app-icon-1024.png` | no alpha, no rounded corners, thumbnail test, category differentiation | blocked |

## App Preview Video (Autoplay Hook)

The app preview video is the most underused growth lever on the App Store. Treat it as a **required** asset for any iOS launch (mark `deferred` only with a founder-approved reason). Verified Apple behavior (refresh against the App Store sources in `checks/validation/repository/source-registry.yaml` before upload):

- You can upload **up to 3 app previews** per device size and language, and **app previews always precede screenshots** at the top of the product page.
- On the product page, **app previews autoplay with muted audio** — Apple's own guidance: "make sure the first few seconds of your video are visually compelling." The first preview is a hook the user watches whether they intended to or not.
- Length is **up to 30 seconds** (Apple's accepted range is 15–30s; confirm the current min/max in the app preview specifications before render). The **poster frame** displays whenever the video does not autoplay, so it must sell on its own.
- Source MUST be real in-app footage (captured via the in-app iOS Simulator (Cmd+R recording), MobAI, Codex Desktop native iOS/XcodeBuildMCP, serve-sim, or on-device), never generated UI. SnapshotPreviews can support preview/component regression evidence but does not replace runtime App Preview footage.

### The 5-Second Muted Hook (required spec)

Because the first preview plays silent and unrequested, its first ~3–5 seconds must:

- Communicate the core value with **no audio dependency** — on-screen text/captions carry the message.
- **Show the payoff first** — the magical V1 moment from `11_STAR_EXPERIENCE.md` — not a logo, splash, or slow intro.
- Land the **Emotional North Star** feeling instantly and instantiate the hook's Experience Card from the Asset Knowledge Brief (`EMOTIONAL_DESIGN.md` + `knowledge/experience/experience-cards.md`).
- Read at a glance with motion that is legible muted.
- Have a **poster frame** that already sells if autoplay is blocked.
- Be **truthful** — the hook must match what the app actually does; no bait-and-switch, fake UI, or oversold outcome.

### Production Route (mandatory)

Both screenshots and the app preview run through the screenshot ASO skill; they are never hand-composed one-offs:

- **Screenshots:** `ParthJadhav/app-store-screenshots` (the screenshot ASO skill), `ios-screenshots`, and `aso-skills:screenshot-optimization`, from real UI, App Icon, and design tokens.
- **App preview:** script/storyboard via `aso-skills:app-preview-video`; capture real footage via the in-app iOS Simulator (Cmd+R), MobAI, Codex Desktop native iOS/XcodeBuildMCP, or serve-sim — MobAI stays the route for a polished multi-device recording; edit and caption via Remotion; produce all Apple/Play resolution variants (9:16 / 1:1 / 16:9) from a single master via the Higgsfield `reframe` MCP tool (Master → All Platforms recipe in `knowledge/process/tool-recipes/visual-and-motion-production.md`) — reframe reformats aspect ratio only, never substitutes UI.
- A/B test variants with `aso-skills:ab-test-store-listing` (Product Page Optimization) where available.

| Preview                       | Knowledge-leveraged hook (first 3–5s) | Emotion / Card                 | Poster frame     | Captions (muted) | Skill route                                    | Output                       | Status   |
| ----------------------------- | ------------------------------------- | ------------------------------ | ---------------- | ---------------- | ---------------------------------------------- | ---------------------------- | -------- |
| iOS Preview 1 (autoplay hook) | magical V1 moment shown as the payoff | North Star feeling + hook card | must sell silent | required         | app-preview-video → MobAI → Remotion → reframe | `previews/ios-preview-1.mp4` | blocked  |
| iOS Preview 2–3 (optional)    | secondary proof / breadth             | secondary beat                 | Pending          | required         | same                                           | `previews/ios-preview-2.mp4` | optional |
| Google Play promo             | hook payoff, YouTube-hosted           | North Star feeling             | n/a              | recommended      | same                                           | YouTube URL pending          | optional |

Produce required resolution variants by `reframe`-ing one master rather than re-rendering per size; the source must be real app footage. See the Master → All Platforms recipe in `knowledge/process/tool-recipes/visual-and-motion-production.md`.

## Definition of Good: Present / Proven / Optimized

This section is the machine-readable contract for `check:store-screenshots`. Each layer has a defined enforcement mode.

### PRESENT — packet filled (hard-error when lane is "partial" or "done")

The SCREENSHOTS.md packet is filled: no cell in any required matrix still reads "Pending", "Blocked", or is empty. Specifically:

- Every required row in the Raw Capture Matrix has a non-empty source screen, capture tool, raw path, and status.
- Every required row in the Production Composition Matrix has a non-empty headline, route, final upload path, and dimensions.
- Every required Device Wells row has a confirmed required/scaled/not-needed decision.
- The Narrative table has headings and copy for every required slot.
- The Per-Slot Knowledge Map is filled for every slot.

### PROVEN — objective on-disk evidence (hard-error when lane is "done")

Evidence that the work actually happened, not just that it was declared:

1. **Raw captures exist on disk** at the exact paths listed in the Raw Capture Matrix (e.g. `screenshots/raw/iphone-69-slot-1.png`). A filled path that points to a non-existent file is a hard error.
2. **`app-store-screenshots.json` exists** and is a valid schema-v2 file. Its `rawPaths` (or equivalent field) reference files that exist on disk.
3. **Final PNGs exist** under `screenshots/final/<locale>/<device-well>/` for every required device well at the correct ASC dimensions. Alpha-removed, sRGB. The validator checks existence; the dimensions/color-space proof is in the upload log.
4. **One deck per Tier-1 locale**: for every locale listed in `LOCALIZATION_MARKET_RESEARCH.md` that is marked Tier-1, a final screenshot deck exists under `screenshots/final/<locale>/`.
5. **Theme is token-derived**: `app-store-screenshots.json` must reference `DESIGN.md` or contain a `tokensSource` field pointing to it. The ParthJadhav theme was generated FROM design tokens, not hand-coded colors.
6. **Captions contain keyword tokens from `APP_STORE_LISTING.md`**: at least one headline in `app-store-screenshots.json` contains a keyword that also appears in the `keywords` field of `APP_STORE_LISTING.md`. ASO fold-in is data-wired, not declared.
7. **Upload proof in `store/STORE_CONSOLE.md`**: the `asc-shots-pipeline` dry-run or upload output is recorded there before the lane is marked "done".

### OPTIMIZED — quality bar (warning + logged override; taste stays human)

Rubric scores are recorded in `screenshot-rubric-scores.json`. For every required slot/locale:

- Either `pass: true` (weighted-high dimensions all >= 2, overall weighted score >= threshold in `SCREENSHOT_RUBRIC.md`), OR
- A non-empty `override.reason` is logged by the founder.

A slot with no score entry at all is an error when the lane is "done" and a warning when "partial".

**Producer != Verifier (Tier 2 enforcement):** The ledger root must carry distinct non-empty `builder` and `grader` identity fields. The agent or session that built the deck may not grade it. The validator errors (when "done") or warns (when "partial") if `grader` is missing, if `grader === builder`, or if any required slot lacks non-empty `grader_notes`. See `SCREENSHOT_RUBRIC.md` for the full grader protocol.

**Suspicious perfect score:** When every high dimension is scored 3 and `grader_notes` is very short, the validator fires `store_screenshots.suspicious_perfect` warning. A perfect score needs proportionally detailed justification.

**Tier-1 anti-gaming:** `screenshot-rubric-scores.json` that is byte-identical to `screenshot-rubric-scores.example.json` or smaller than 200 bytes is rejected as an unmodified scaffold copy.

**Tier-3 PNG reality checks:** For every `final_png` in the ledger, the validator reads the real PNG IHDR bytes (width, height, bit depth, color type) and verifies that declared device-well dimensions match the file and that no alpha channel is present when `alpha removed` is claimed in the Production Composition Matrix.

### Pipeline Spine

This is the canonical end-to-end pipeline. Every step must be evidenced before the lane can be "done".

```
Capture (in-app iOS Simulator / MobAI / ios-screenshots / XcodeBuildMCP / serve-sim)
  → real app frames at screenshots/raw/<device>/<locale>/

Compose (ParthJadhav/app-store-screenshots)
  → themed from DESIGN.md          [token fold-in: data-wired]
  → copy/headlines from APP_STORE_LISTING.md keywords  [ASO fold-in: data-wired]
  → one deck per Tier-1 locale from LOCALIZATION_MARKET_RESEARCH.md
  → outputs: app-store-screenshots.json (schema v2) + screenshots/index.html

Grade (SCREENSHOT_RUBRIC.md + SEPARATE grader agent/session — never the builder)
  → builder identity recorded at ledger root "builder" field
  → grader identity recorded at ledger root "grader" field (must differ from builder)
  → per-slot grader_notes written (non-empty, explains each dimension)
  → scores written to screenshot-rubric-scores.json
  → pass or founder override logged

Resize / validate (asc-screenshot-resize)
  → final PNGs at screenshots/final/<locale>/<device-well>/
  → alpha removed, sRGB, correct ASC dimensions

Upload (asc-shots-pipeline)
  → dry-run output and upload proof in store/STORE_CONSOLE.md
```

## Visual QA

- [ ] An iOS app preview video exists (or a founder-approved deferral is recorded); the first preview is the autoplay hook and precedes the screenshots.
- [ ] The first 3–5 seconds communicate the core value MUTED, with on-screen text and the magical V1 moment shown first (no logo/splash intro).
- [ ] The poster frame sells on its own when autoplay is blocked.
- [ ] The hook lands the Emotional North Star feeling and instantiates its Experience Card per the Asset Knowledge Brief.
- [ ] The hook is truthful — real app footage, no fake UI or oversold outcome.
- [ ] Both screenshots and the app preview were produced via the screenshot ASO skill (`ParthJadhav/app-store-screenshots` / `ios-screenshots` / `app-preview-video`), not hand-composed one-offs.
- [ ] Every screenshot slot and the hook draw on the Asset Knowledge Brief (`strategy/RESEARCH.md` user/problem, `11_STAR_EXPERIENCE.md` magical moment, `EMOTIONAL_DESIGN.md` emotion/cards).
- [ ] Headlines are readable at App Store search thumbnail size.
- [ ] Copy overlay uses one idea per slide and matches `APP_STORE_LISTING.md`.
- [ ] Real app UI remains visible and truthful in every production composition.
- [ ] Captures taken from an agent-driven simulator used a fixture or sandbox account. No real founder, customer, store, bank, or provider account was signed in on a device the agent controlled, and no real user data, real payment state, or production credential appears in any frame.
- [ ] Cmd+S / Cmd+R captures were exported off the macOS Desktop into `screenshots/raw/` and committed, and their native pixel dimensions were verified against the target display well; no store asset cites a frame that exists only in a conversation.
- [ ] Generated Higgsfield assets are supporting visuals, not fake product proof.
- [ ] Remotion or HTML compositions record source inputs, license status, render proof, and outputs in `CONTENT_ASSETS.md`.
- [ ] ParthJadhav/app-store-screenshots deck state or equivalent export board is saved when used, including app icon, locale, iPhone/iPad deck, and final PNG paths.
- [ ] Pricing, trial, renewal, subscription, and feature claims match `revenue/REVENUE_OPS.md`, paywall copy, and legal docs.
- [ ] Alpha transparency is removed and color space is acceptable for upload.
- [ ] iPhone and iPad safe areas, text fit, overlap, and contrast are checked.
- [ ] Localized screenshot copy is reviewed for each shipped locale.
- [ ] Founder approval is recorded before screenshot upload, App Icon replacement, App Preview upload, CPP/event media submission, or paid asset generation.
- [ ] `screenshot-rubric-scores.json` exists and every required slot has either `pass: true` or a non-empty `override.reason`.
