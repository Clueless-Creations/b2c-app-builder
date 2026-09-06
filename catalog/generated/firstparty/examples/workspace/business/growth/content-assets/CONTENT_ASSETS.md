# Content Assets

This packet records generated, rendered, edited, and source-backed launch media. Use it for Remotion videos/stills, Higgsfield assets, store screenshot frames, app previews, UGC overlays, ad variants, social posts, and local recordings.

## Route Matrix

| Asset family                                   | Intended route            | Selected route       | Founder approval                                             | License status                                                | Limitation                                               |
| ---------------------------------------------- | ------------------------- | -------------------- | ------------------------------------------------------------ | ------------------------------------------------------------- | -------------------------------------------------------- |
| App preview and social demo clips              | Remotion from real app UI | Remotion draft route | Blocked until approved for public use                        | Remotion license status must be checked before commercial use | Local render proves layout, not campaign performance     |
| Mascot, icon, photoreal, or presenter creative | Higgsfield                | Blocked or deferred  | Founder approval required before paid generation or fallback | Higgsfield account/credit route required                      | Remotion is not equivalent for net-new generated visuals |

## Remotion Route

- Use Remotion when assets should be reproducible from screenshots, recordings, `DESIGN.md` tokens, copy, captions, data, and local media.
- Load `knowledge/design/remotion-content-assets.md` and the `remotion-best-practices` skill before writing Remotion code.
- Record current Remotion docs checked date, CLI version or package version, and license decision before commercial output.
- Do not add Remotion dependencies to the skill package; scaffold a launch-local `growth/content-assets/remotion/` project only when needed.

## Higgsfield Route

- Use Higgsfield for net-new AI visuals, mascots, app icons, image-to-video, presenter ads, Marketing Studio, Soul ID, and Virality Predictor.
- Reuse the trained Soul identity instead of retraining: record `soul_reference_id`, `soul_variant`, and `avatar_id` through the reducer in `state/business-state.json` `tools.higgsfield.identity`, and call `show_characters` before any new training run. See the chained recipes in `knowledge/process/tool-recipes/visual-and-motion-production.md`.
- Score every video creative with the Virality Predictor (`brain_activity`) before paid distribution, and reframe one master into platform variants (9:16 / 1:1 / 16:9) rather than regenerating per format.
- If Higgsfield was intended but unavailable, stop for founder approval before using Remotion, raw screenshots, local recordings, public-domain media, or hand-authored graphics as a fallback.
- Record the fallback in `strategy/TOOL_DECISIONS.md` and in this packet.

## Source Inputs

| Input                            | Source                                                                                                                                                                                                     | Rights/status                      | Used by                     | Notes                                                                                                                                                                          |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `screenshots/raw/onboarding.png` | in-app iOS Simulator (Cmd+S / Cmd+R, exported from the Desktop), MobAI, Codex Desktop native iOS/XcodeBuildMCP, serve-sim, simulator/device, SnapshotPreviews preview-only proof, or founder-owned capture | Must be verified before production | App preview and social demo | Real app UI must remain visible; preview-only proof does not replace runtime E2E; agent-driven simulator captures require a fixture account and must contain no real user data |
| `11_STAR_EXPERIENCE.md`          | Product experience contract                                                                                                                                                                                | Required                           | Store, ads, UGC, demo clips | Use the V1 scalable slice and stay inside the line of feasibility                                                                                                              |
| `DESIGN.md`                      | Project design system                                                                                                                                                                                      | Required                           | All rendered assets         | Tokens, type, voice, motion, banned aesthetics                                                                                                                                 |
| `copy/hooks.json`                | Founder-approved or research-backed copy                                                                                                                                                                   | Draft                              | Social and ad variants      | Claims must match listing, revenue, privacy, and legal docs                                                                                                                    |

## Composition Manifest

Primary machine-readable manifest: `growth/content-assets/manifest.json`.

Required fields per asset:

- `asset_id`
- `surface`
- `route`
- `status`
- `composition_id`
- `dimensions`
- `inputs`
- `outputs`
- `truth_constraints`
- `approvals`
- `render_proof`
- `license_status`

Optional fields for Higgsfield / Marketing Studio assets:

- `prompt_brief` — the `DESIGN.md` tokens carried into the generation prompt
- `asset_kind` — REQUIRED for every generated video (Seedance, Marketing Studio, Cinema Studio, Veo routes): one of `ugc`, `product_ad`, `b_roll`, `demo`, `app_preview`. `ugc` activates the gates below; a believable-person clip must not hide behind a provider route name.
- `script_id` — REQUIRED for UGC-family assets (`asset_kind: ugc`, or `ugc`/`ugc_how_to`/`ugc_unboxing`/`product_review` modes, or Recipe 7): `<script-bank path>#<format-id>`, e.g. `ugc/script-bank.md#FMT-001`. The path must be a `script-bank.md` file inside this workspace (no traversal, no symlink escapes) and the id must match a row's Format ID cell. Once the asset reaches a done-tier status OR generation evidence exists (an output file on disk, a remote output URL, or a `source_job_id`), the row must hold real (non-placeholder) script text and a passing row verdict.
- `judge_verdict` — REQUIRED for UGC-family assets. The value must START with `passed` or `survived` (`passed — <detail>` form) at a done-tier status or once generation evidence exists — the panel runs before generation spend. The prefix is parsed, so a negated pass does not count. `failed`/`rejected` blocks the asset at any status.
- `believability` — REQUIRED for UGC-family assets before a done-tier status. The value must START with `passed` (`passed — <detail>` form) or record `failed — <detail>`; completion alone is not a pass, a negated pass is not a pass, and `failed` blocks done-tier statuses.
- `soul_reference_id` / `avatar_id` — reused Soul identity, recorded through the reducer in `state/business-state.json` `tools.higgsfield.identity`
- `webproduct_id` — Marketing Studio product/webproduct entity
- `source_job_id` — origin job for `reframe`/`personal_clipper` derivatives
- `virality_score` — `brain_activity` overall, peak hook second, sustain %, and Default Mode risk

## Render Commands

Preview:

```bash
cd content-assets/remotion
npm run studio
```

One-frame check:

```bash
cd content-assets/remotion
npx remotion still VerticalHookDemo --scale=0.25 --frame=30 --output ../out/vertical-hook-frame30.png
```

Video render:

```bash
cd content-assets/remotion
npx remotion render VerticalHookDemo --output ../out/vertical-hook-demo.mp4
```

Still render:

```bash
cd content-assets/remotion
npx remotion still SquareAdStill --output ../out/square-ad-still.png
```

## Claim Review

- Real app UI is visible wherever the asset claims to show the app.
- The hook, storyboard, screenshot, or preview expresses the V1 scalable slice from `11_STAR_EXPERIENCE.md`.
- Store screenshots and app previews do not show mock UI as production UI.
- Pricing, trials, subscription copy, and offers match `APP_STORE_LISTING.md`, `revenue/REVENUE_OPS.md`, and legal docs.
- Health, financial, urgency, scarcity, endorsement, and outcome claims are either supported or removed.
- Captions, silent playback, safe areas, text fit, and mobile readability are checked.

## Output Registry

| Asset ID             | Surface             | Route    | Output                                             | Status | QA                                                                                            |
| -------------------- | ------------------- | -------- | -------------------------------------------------- | ------ | --------------------------------------------------------------------------------------------- |
| `vertical-hook-demo` | TikTok/Reels/Shorts | Remotion | `growth/content-assets/out/vertical-hook-demo.mp4` | draft  | Requires real UI capture, license check, render proof, and founder approval before public use |

## Public Use Gates

Founder approval is required before:

- paid Higgsfield generation or paid render infrastructure
- Remotion company-license purchase
- public posting, scheduling, or creator distribution
- store screenshot/app-preview upload
- paid ad campaign launch
- creator payments or usage-rights commitments

## Blockers

- Remotion license status must be checked for commercial use.
- Real app screenshots/recordings must be captured before final store or product-claim assets.
- Public posting, scheduling, store upload, and paid spend require founder approval.
